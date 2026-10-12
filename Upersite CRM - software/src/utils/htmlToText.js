// Converte l'HTML delle note in testo semplice, per mandarlo all'AI senza tag, stili e immagini in base64
// (meno token e un contesto più leggibile). Il documento creato da DOMParser è inerte: non esegue script
// e non carica immagini.
const BLOCK_SELECTOR = 'p, div, h1, h2, h3, h4, h5, h6, li, tr, blockquote, pre, ul, ol, table, hr';

export function htmlToText(html) {
  if (!html) return '';
  const source = String(html);
  // Testo già semplice (nessun tag o entità): niente da convertire
  if (!/[<&]/.test(source)) return source.trim();

  const doc = new DOMParser().parseFromString(source, 'text/html');
  doc.querySelectorAll('script, style').forEach(el => el.remove());
  doc.querySelectorAll('img').forEach(el => el.replaceWith('[immagine]'));
  doc.querySelectorAll('input[type="checkbox"]').forEach(el => el.replaceWith(el.checked ? '[x] ' : '[ ] '));
  doc.querySelectorAll('br').forEach(el => el.replaceWith('\n'));
  doc.querySelectorAll('li').forEach(el => el.prepend('- '));
  doc.querySelectorAll('td, th').forEach(el => el.append(' | '));
  doc.querySelectorAll(BLOCK_SELECTOR).forEach(el => el.append('\n'));

  return (doc.body.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
