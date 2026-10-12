// Conversione Markdown minimale → HTML per le note (risposte AI, import .md, popup riassunto).
// Il testo viene sempre prima "escapato": l'HTML restituito contiene solo i tag generati qui.
// Chi lo inserisce nel DOM deve comunque passarlo da sanitizeHtml.

export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Formattazione inline: **grassetto**, *corsivo*, `codice`
// (il corsivo con _..._ è escluso apposta: romperebbe snake_case e URL)
function inlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s](?:[^*\n]*?[^*\s])?)\*(?![*\w])/g, '$1<em>$2</em>');
}

/**
 * Converte Markdown in HTML.
 * @param {string} markdown
 * @param {{ forceBlocks?: boolean }} options  forceBlocks: anche un solo paragrafo viene avvolto in <p>
 * @returns {{ html: string, isBlock: boolean }}
 *   isBlock = false quando il testo è un solo paragrafo senza elenchi/titoli: l'html è allora
 *   "inline" e si può inserire in mezzo a una frase senza spezzare il paragrafo.
 */
export function markdownToHtml(markdown, { forceBlocks = false } = {}) {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let paragraph = [];
  let list = null; // { tag: 'ul' | 'ol', items: [] }

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: 'p', html: paragraph.map(inlineMarkdown).join('<br>') });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push({ type: list.tag, html: list.items.map(i => `<li>${i}</li>`).join('') });
      list = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: `h${heading[1].length}`, html: inlineMarkdown(heading[2]) });
      continue;
    }

    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      flushParagraph();
      const tag = bullet ? 'ul' : 'ol';
      if (list && list.tag !== tag) flushList();
      if (!list) list = { tag, items: [] };
      list.items.push(inlineMarkdown((bullet || numbered)[1]));
      continue;
    }

    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();

  if (!forceBlocks && blocks.length === 1 && blocks[0].type === 'p') {
    return { html: blocks[0].html, isBlock: false };
  }

  const html = blocks
    .map(b => `<${b.type}>${b.html}</${b.type}>`)
    .join('');
  return { html, isBlock: true };
}
