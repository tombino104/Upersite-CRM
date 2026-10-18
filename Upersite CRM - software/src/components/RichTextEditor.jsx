import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import IconComponent from './IconComponent';
import { aiTextService } from '../utils/aiTextService';
import { getAIChoice, describeChoice, isLocalChoice } from '../utils/aiClient';
import { sanitizeHtml, sanitizeChildrenInPlace } from '../utils/sanitizeHtml';
import { markdownToHtml, escapeHtml } from '../utils/markdownToHtml';

const AI_TOOLS = [
  { id: 'rewrite', label: '📝 Riscrivi' },
  { id: 'summarize', label: '📊 Riassumi' },
  { id: 'improve', label: '🚀 Migliora' },
  { id: 'expand', label: '📈 Espandi' },
  { id: 'ideas', label: '💡 Idee' },
  { id: 'grammar', label: '✅ Correggi grammatica' }
];

const AI_LANGUAGES = ['inglese', 'francese', 'spagnolo', 'tedesco', 'portoghese', 'italiano'];

// Altezza massima stimata del menu contestuale, per tenerlo dentro lo schermo
const CONTEXTUAL_MENU_MAX_HEIGHT = 460;

// Il menu comandi si apre con "/" (o "\" come alias storico), ma solo a inizio riga o dopo uno spazio:
// così non scatta in percorsi (D:\cartella), URL (https://...) o frasi come "e/o".
// Restituisce { filter, length } (length = caratteri da cancellare: simbolo + testo digitato) o null.
function getSlashMatch(textBeforeCaret) {
  const match = textBeforeCaret.match(/(?:^|[\s\u00a0])([/\\])(\w*)$/);
  if (!match) return null;
  return { filter: match[2].toLowerCase(), length: match[1].length + match[2].length };
}

// Comandi di formattazione di cui la toolbar mostra lo stato attivo
const TRACKED_FORMATS = ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList'];

// File che non devono mai essere lanciati partendo dal contenuto di una nota
const BLOCKED_OPEN_EXTENSIONS = /\.(exe|com|bat|cmd|scr|msi|msp|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|hta|lnk|reg|jar|cpl|dll)$/i;

// CSV → righe di celle. Riconosce il separatore (virgola o punto e virgola, come negli export italiani di Excel)
// e le celle tra virgolette con separatori e a capo al loro interno.
function parseCsv(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

function csvToTableHtml(text) {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  let html = '<table border="1" style="border-collapse:collapse;width:100%;margin-bottom:1em;">';
  rows.forEach((cells, i) => {
    html += '<tr>';
    cells.forEach(cell => {
      const safe = escapeHtml(cell.trim());
      html += i === 0 ? `<th style="padding:4px 8px;background:#f4f5f9;">${safe}</th>` : `<td style="padding:4px 8px;">${safe}</td>`;
    });
    html += '</tr>';
  });
  return html + '</table><br>';
}

const BASIC_COLORS = [
  '#000000', '#E74C3C', '#E67E22', '#F1C40F', '#2ECC71',
  '#3498DB', '#9B59B6', '#34495E', '#95A5A6', '#FFFFFF'
];

export default function RichTextEditor({ value, onChange, onDirtyChange, onInternalLinkClick, allFiles, allNotes }) {
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const [showColors, setShowColors] = useState(false);
  const [showHeadings, setShowHeadings] = useState(false);
  const [showAlignment, setShowAlignment] = useState(false);
  const [slashMenuParams, setSlashMenuParams] = useState(null); // { top, left, filter }
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const [showInternalLinkMenu, setShowInternalLinkMenu] = useState(null); // 'file' | 'note' | null
  const [internalLinkPosition, setInternalLinkPosition] = useState(null); // { top, left } | null
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [linkModalParams, setLinkModalParams] = useState(null); // { type: 'url' | 'folder' }
  const [linkInputVal, setLinkInputVal] = useState('');
  const [linkInputName, setLinkInputName] = useState('');
  const cursorMarkerRef = useRef(null); // Temporary marker for cursor position
  const linkRangeRef = useRef(null); // Testo selezionato che il link in inserimento sostituirà
  // Note link modal states
  const [noteSearchQuery, setNoteSearchQuery] = useState('');
  const [noteSelectedIndex, setNoteSelectedIndex] = useState(0);

  // Reset slash menu index when filter changes
  useEffect(() => {
    setSlashSelectedIndex(0);
  }, [slashMenuParams?.filter]);

  // Menu contestuale per selezione testo
  const [textSelection, setTextSelection] = useState(null); // { text, range, position } | null
  const isMenuInteractingRef = useRef(false); // Flag per prevenire chiusura durante interazione
  const preventMenuReopenRef = useRef(false); // Flag per prevenire riapertura subito dopo formattazione

  // AI Writing Tools
  const [showAIMenu, setShowAIMenu] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const aiSelectionRef = useRef(null); // Persist selection across re-renders

  // AI Summary for entire note
  const [isSummarizing, setIsSummarizing] = useState(false);

  // Anchor/Index system
  const [anchors, setAnchors] = useState([]);
  const [showIndex, setShowIndex] = useState(true);
  const [activeAnchorId, setActiveAnchorId] = useState(null);


  // Track the initial value to detect dirty state
  const initialValueRef = useRef(value || '');
  const isDirtyRef = useRef(false);
  const isComposingRef = useRef(false);
  const debounceTimerRef = useRef(null);
  const pendingHtmlRef = useRef(null);

  // Sempre l'ultima versione dei callback: evita closure obsolete in debounce, paste e cleanup
  const onChangeRef = useRef(onChange);
  const onDirtyChangeRef = useRef(onDirtyChange);
  onChangeRef.current = onChange;
  onDirtyChangeRef.current = onDirtyChange;

  // Reset initial value when the component receives a fundamentally new value
  // (e.g. switching notes)
  useEffect(() => {
    initialValueRef.current = value || '';
    isDirtyRef.current = false;
    if (onDirtyChange) onDirtyChange(false);
  }, []); // Only on mount

  // All'uscita (chiusura della nota, Esc...) non si perdono le ultime battute ancora nel debounce
  useEffect(() => () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
      if (pendingHtmlRef.current !== null) {
        onChangeRef.current?.(pendingHtmlRef.current);
        pendingHtmlRef.current = null;
      }
    }
  }, []);

  // Gestione selezione testo per menu contestuale
  useEffect(() => {
    const handleSelection = (e) => {
      // Non riaprire il menu se abbiamo appena formattato
      if (preventMenuReopenRef.current) return;

      // Solo se l'evento è dentro l'editor
      if (!editorRef.current || !editorRef.current.contains(e.target)) return;

      // Un clic su un collegamento (cartella, file, nota) non è una selezione di testo da formattare
      if (e.target.closest?.('a.internal-link, a.folder-internal-link')) return;

      setTimeout(() => {
        const selection = window.getSelection();
        if (selection && selection.toString().trim()) {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();

          // Posiziona menu affianco al testo (stile Notion)
          // Appare a destra della selezione, ma se non c'è spazio va a sinistra
          const menuWidth = 200; // larghezza stimata del menu
          const windowWidth = window.innerWidth;
          const rightSpace = windowWidth - rect.right;
          const leftSpace = rect.left;

          let x = rect.right + 10; // 10px di spazio dal testo
          if (rightSpace < menuWidth && leftSpace > menuWidth) {
            x = rect.left - menuWidth - 10; // Posiziona a sinistra se manca spazio a destra
          }

          setTextSelection({
            text: selection.toString(),
            range: range,
            position: {
              x: x,
              y: rect.top
            }
          });
        } else {
          setTextSelection(null);
        }
      }, 0);
    };

    const handleMouseDown = (e) => {
      // Non chiudere se stiamo interagendo con il menu
      if (isMenuInteractingRef.current) return;

      // Chiudi menu solo se clicco fuori dall'editor e fuori dal menu
      if (!editorRef.current || (!editorRef.current.contains(e.target) && !e.target.closest('.contextual-menu'))) {
        setTextSelection(null);
        savedSelectionRef.current = null;
      }
    };

    document.addEventListener('mouseup', handleSelection);
    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      document.removeEventListener('mouseup', handleSelection);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);

  // Chiudi tutti i menu quando si clicca fuori (o si preme Esc)
  useEffect(() => {
    const closeToolbarDropdowns = () => {
      setShowColors(false);
      setShowHeadings(false);
      setShowAlignment(false);
    };

    const handleClickOutside = (e) => {
      if (!e.target.closest('.rte-btn') && !e.target.closest('.rte-dropdown') && !e.target.closest('.contextual-menu')) {
        setTextSelection(null);
      }
      if (!e.target.closest('.rte-dropdown-wrap')) closeToolbarDropdowns();
    };

    const handleEscape = (e) => {
      if (e.key === 'Escape') closeToolbarDropdowns();
    };

    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  // Stato "attivo" dei pulsanti di formattazione (grassetto, corsivo, elenchi...) secondo la posizione del cursore
  const [activeFormats, setActiveFormats] = useState({});
  useEffect(() => {
    const update = () => {
      const editor = editorRef.current;
      const sel = window.getSelection();
      if (!editor || !sel || !sel.rangeCount || !editor.contains(sel.anchorNode)) return;
      const next = {};
      TRACKED_FORMATS.forEach(cmd => {
        try {
          next[cmd] = document.queryCommandState(cmd);
        } catch {
          next[cmd] = false;
        }
      });
      setActiveFormats(prev => (TRACKED_FORMATS.every(cmd => prev[cmd] === next[cmd]) ? prev : next));
    };

    document.addEventListener('selectionchange', update);
    return () => document.removeEventListener('selectionchange', update);
  }, []);

  // Salva la selezione corrente per il menu contestuale
  const savedSelectionRef = useRef(null);

  // Funzioni per menu contestuale
  const applyTextFormat = (format, value = null) => {
    if (!savedSelectionRef.current) {
      console.warn('No saved selection');
      return;
    }

    // Focus sull'editor prima di tutto
    editorRef.current?.focus();

    // Ripristina la selezione
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(savedSelectionRef.current.cloneRange());

    // Applica il comando
    try {
      if (format === 'removeFormat') {
        document.execCommand('removeFormat', false, null);
        document.execCommand('hiliteColor', false, 'rgba(0,0,0,0)');
        document.execCommand('backColor', false, 'rgba(0,0,0,0)');
        document.execCommand('foreColor', false, 'var(--text-primary)');

        // Clear block level headings and checklists back to standard P
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
          let node = sel.anchorNode;
          let block = node;
          while (block && block !== editorRef.current &&
            !['P', 'DIV', 'H1', 'H2', 'H3', 'LI'].includes(block.tagName)) {
            block = block.parentNode;
          }
          if (block && block !== editorRef.current) {
            if (['H1', 'H2', 'H3'].includes(block.tagName)) {
              const p = document.createElement('p');
              p.innerHTML = block.innerHTML;
              block.parentNode.replaceChild(p, block);
            } else if (block.classList.contains('todo-item')) {
              const p = document.createElement('p');
              p.innerHTML = block.querySelector('span')?.innerHTML || block.innerHTML;
              block.parentNode.replaceChild(p, block);
            }
          }
        }
        handleInput();
      } else {
        const success = document.execCommand(format, false, value);
        if (success) {
          handleInput();
        } else {
          console.warn(`Command ${format} was not successful`);
        }
      }
    } catch (error) {
      console.warn(`Failed to execute command ${format}:`, error);
    }

    // Chiudi il menu e previeni riapertura immediata
    preventMenuReopenRef.current = true;
    setTextSelection(null);
    savedSelectionRef.current = null;

    // Reset flag dopo un breve delay
    setTimeout(() => {
      preventMenuReopenRef.current = false;
    }, 300);
  };

  // Salva la selezione quando si apre il menu
  const saveSelection = () => {
    const selection = window.getSelection();
    if (selection.rangeCount > 0 && selection.toString().trim()) {
      savedSelectionRef.current = selection.getRangeAt(0).cloneRange();
    }
  };

  // Handler per onMouseDown che previene il focus sul bottone
  const handleMenuButtonMouseDown = (e, action) => {
    e.preventDefault(); // Previene che il focus vada al bottone
    e.stopPropagation();
    isMenuInteractingRef.current = true;
    action();
    // Reset flag dopo un breve delay
    setTimeout(() => {
      isMenuInteractingRef.current = false;
    }, 100);
  };

  // ── AI Writing Tools ──
  const [aiError, setAiError] = useState('');
  const [aiTruncated, setAiTruncated] = useState(false);
  const [aiLastTool, setAiLastTool] = useState(null);
  const [aiTargetLang, setAiTargetLang] = useState('inglese');
  const [aiCopied, setAiCopied] = useState(false);
  const aiAbortRef = useRef(null);
  // Pannello laterale ridotto a icona (la richiesta continua)
  const [aiPanelMinimized, setAiPanelMinimized] = useState(false);
  // Per riassunti e idee il gesto naturale è aggiungere sotto, non sostituire l'originale
  const aiPreferBelow = aiLastTool === 'summarize' || aiLastTool === 'ideas';

  // Risposta AI (Markdown) → HTML sicuro per anteprima e inserimento
  const renderAIMarkdown = (text) => sanitizeHtml(markdownToHtml(text, { forceBlocks: true }).html);

  const resetAIState = () => {
    setAiResult('');
    setAiError('');
    setAiTruncated(false);
    setAiLastTool(null);
    setAiCopied(false);
  };

  const cancelAIRequest = () => {
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;
    setAiLoading(false);
  };

  // Apre il pannello AI sul testo selezionato (menu contestuale o Ctrl+Shift+A)
  const openAIMenu = () => {
    const selection = window.getSelection();
    const text = selection.toString().trim();
    if (!text || selection.rangeCount === 0) return false;
    const range = selection.getRangeAt(0);
    if (!editorRef.current?.contains(range.commonAncestorContainer)) return false;

    cancelAIRequest();
    resetAIState();
    aiSelectionRef.current = range.cloneRange();
    setSelectedText(text);
    setShowAIMenu(true);
    setAiPanelMinimized(false);
    setTextSelection(null);
    return true;
  };

  const handleAITool = async (tool) => {
    if (!selectedText) return;

    // Una nuova richiesta annulla quella in corso
    aiAbortRef.current?.abort();
    const controller = new AbortController();
    aiAbortRef.current = controller;
    const options = { signal: controller.signal };

    setAiLoading(true);
    setAiResult('');
    setAiError('');
    setAiTruncated(false);
    setAiCopied(false);
    setAiLastTool(tool);

    try {
      let response;
      switch (tool) {
        case 'rewrite':
          response = await aiTextService.rewrite(selectedText, options);
          break;
        case 'summarize':
          response = await aiTextService.summarize(selectedText, options);
          break;
        case 'improve':
          response = await aiTextService.improve(selectedText, options);
          break;
        case 'expand':
          response = await aiTextService.expand(selectedText, options);
          break;
        case 'translate':
          response = await aiTextService.translate(selectedText, aiTargetLang, options);
          break;
        case 'ideas':
          response = await aiTextService.generateIdeas(selectedText, options);
          break;
        case 'grammar':
          response = await aiTextService.fixGrammar(selectedText, options);
          break;
        default:
          throw new Error('Strumento non riconosciuto');
      }

      if (controller.signal.aborted) return;
      setAiResult(response.text);
      setAiTruncated(response.truncated);
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error('AI Error:', error);
      setAiError(error.message || 'Errore imprevisto del servizio AI.');
    } finally {
      // Se nel frattempo è partita un'altra richiesta, è lei a gestire lo stato di caricamento
      if (aiAbortRef.current === controller) {
        aiAbortRef.current = null;
        setAiLoading(false);
      }
    }
  };

  // mode: 'replace' sostituisce la selezione, 'below' inserisce dopo il blocco che la contiene
  const applyAIResult = (mode = 'replace') => {
    if (!aiResult || !aiSelectionRef.current) return;

    const range = aiSelectionRef.current.cloneRange();
    const { html } = markdownToHtml(aiResult, { forceBlocks: mode === 'below' });
    const safeHtml = sanitizeHtml(html);
    const plainText = aiResult;

    closeAIMenu();

    requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();

      const selection = window.getSelection();
      selection.removeAllRanges();

      // Se la nota è cambiata e la selezione non è più valida, si inserisce in fondo
      let target = range;
      if (!editor.contains(range.commonAncestorContainer)) {
        target = document.createRange();
        target.selectNodeContents(editor);
        target.collapse(false);
        mode = 'replace';
      }

      if (mode === 'below') {
        let block = target.endContainer;
        while (block && block.parentNode !== editor) block = block.parentNode;
        if (block) {
          target = document.createRange();
          target.setStartAfter(block);
          target.collapse(true);
        }
      }
      selection.addRange(target);

      // execCommand mantiene il risultato nello storico di annulla (Ctrl+Z)
      const inserted = document.execCommand('insertHTML', false, safeHtml);
      if (!inserted) document.execCommand('insertText', false, plainText);
      handleInput();

      aiSelectionRef.current = null;
    });
  };

  // 'ok' | 'changed' (testo modificato nel frattempo) | 'gone' (testo cancellato)
  const aiSelectionState = (() => {
    const range = aiSelectionRef.current;
    if (!showAIMenu || !aiResult || !range) return 'ok';
    if (range.collapsed || !editorRef.current?.contains(range.commonAncestorContainer)) return 'gone';
    return range.toString().trim() === selectedText ? 'ok' : 'changed';
  })();

  const closeAIMenu = () => {
    cancelAIRequest();
    setShowAIMenu(false);
    resetAIState();
    setSelectedText('');
  };

  const copyAIText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setAiCopied(true);
      setTimeout(() => setAiCopied(false), 1500);
    } catch {
      // Appunti non disponibili: nessun effetto sulla nota
    }
  };

  // ── Riassunto AI dell'intera nota ──
  const [showSummaryPopup, setShowSummaryPopup] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [summaryError, setSummaryError] = useState('');
  const [summaryTruncated, setSummaryTruncated] = useState(false);
  const summaryAbortRef = useRef(null);
  const [summaryMinimized, setSummaryMinimized] = useState(false);

  const closeSummaryPopup = () => {
    summaryAbortRef.current?.abort();
    summaryAbortRef.current = null;
    setIsSummarizing(false);
    setShowSummaryPopup(false);
    setSummaryText('');
    setSummaryError('');
    setSummaryTruncated(false);
    setAiCopied(false);
  };

  // Il popup si apre subito con l'indicatore di caricamento; il riassunto non modifica la nota
  const handleAISummary = async () => {
    if (!editorRef.current) return;

    const fullText = editorRef.current.innerText;
    summaryAbortRef.current?.abort();
    setSummaryText('');
    setSummaryError('');
    setSummaryTruncated(false);
    setShowSummaryPopup(true);
    setSummaryMinimized(false);

    if (!fullText.trim()) {
      setIsSummarizing(false);
      setSummaryError('La nota è vuota. Scrivi qualcosa prima di riassumere.');
      return;
    }

    const controller = new AbortController();
    summaryAbortRef.current = controller;
    setIsSummarizing(true);

    try {
      const response = await aiTextService.summarize(fullText, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setSummaryText(response.text);
      setSummaryTruncated(response.truncated);
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error('AI Summary Error:', error);
      setSummaryError(error.message || 'Errore durante il riassunto.');
    } finally {
      if (summaryAbortRef.current === controller) {
        summaryAbortRef.current = null;
        setIsSummarizing(false);
      }
    }
  };

  const appendSummaryToNote = () => {
    const editor = editorRef.current;
    if (!editor || !summaryText) return;
    editor.insertAdjacentHTML('beforeend', `<h3>Riassunto</h3>${renderAIMarkdown(summaryText)}`);
    handleInput();
    closeSummaryPopup();
  };

  // Esc chiude il pannello AI in cui ci si trova (e annulla la sua richiesta), senza chiudere la nota.
  // I pannelli non bloccano la pagina: se si sta scrivendo nella nota, Esc non li tocca.
  useEffect(() => {
    if (!showAIMenu && !showSummaryPopup) return;
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      const target = e.target;
      const panel = target?.closest?.('.rte-ai-side');
      // Si sta scrivendo nella nota o in un campo fuori dal pannello: Esc non riguarda il pannello
      const typingElsewhere = !panel && (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName));
      if (typingElsewhere) return;
      // Focus dentro un pannello: si chiude quello; nessun focus (es. pulsante disattivato durante l'attesa): il più recente
      if (!panel && target !== document.body && target !== document.documentElement) return;
      e.stopPropagation();
      if (panel ? panel.classList.contains('ai-summary-modal') : (showSummaryPopup && !showAIMenu)) closeSummaryPopup();
      else closeAIMenu();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [showAIMenu, showSummaryPopup]);

  // Annulla le richieste AI ancora in corso quando l'editor viene smontato
  useEffect(() => () => {
    aiAbortRef.current?.abort();
    summaryAbortRef.current?.abort();
  }, []);

  // Parse anchors and headings from content - in order of appearance
  const parseAnchors = useCallback(() => {
    if (!editorRef.current) return [];

    const parsedAnchors = [];
    let anchorCounter = 0;
    let h1Counter = 0;
    let h2Counter = 0;
    let h3Counter = 0;

    // Use TreeWalker to traverse in document order
    const walker = document.createTreeWalker(
      editorRef.current,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let node;
    while ((node = walker.nextNode()) !== null) {
      // Check for H1 headings
      if (node.nodeName === 'H1') {
        const text = node.textContent.trim();
        if (text) {
          parsedAnchors.push({
            id: `h1-${h1Counter++}`,
            name: text,
            type: 'h1',
            level: 1,
            element: node
          });
        }
      }
      // Check for H2 headings
      else if (node.nodeName === 'H2') {
        const text = node.textContent.trim();
        if (text) {
          parsedAnchors.push({
            id: `h2-${h2Counter++}`,
            name: text,
            type: 'h2',
            level: 2,
            element: node
          });
        }
      }
      // Check for H3 headings
      else if (node.nodeName === 'H3') {
        const text = node.textContent.trim();
        if (text) {
          parsedAnchors.push({
            id: `h3-${h3Counter++}`,
            name: text,
            type: 'h3',
            level: 3,
            element: node
          });
        }
      }
      // Check for anchor patterns in text nodes
      else if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        const anchorRegex = /#([^;]+);/g;
        let match;
        while ((match = anchorRegex.exec(text)) !== null) {
          parsedAnchors.push({
            id: `anchor-${match[1]}-${anchorCounter++}`,
            name: match[1],
            type: 'anchor',
            level: 0
          });
        }
      }
    }

    return parsedAnchors;
  }, []);

  // Parse anchors when content changes
  useEffect(() => {
    try {
      const newAnchors = parseAnchors();
      setAnchors(newAnchors);
    } catch (error) {
      console.error('Error parsing anchors:', error);
      setAnchors([]);
    }
  }, [value, parseAnchors]);


  // Dynamic scroll listener to track active anchor in real-time
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const handleScroll = () => {
      if (anchors.length === 0) return;
      const editorRect = editor.getBoundingClientRect();
      const editorTop = editorRect.top;

      let currentAnchor = null;

      anchors.forEach((anchor) => {
        let el = null;
        if (anchor.type === 'h1') {
          const h1Elements = editor.querySelectorAll('h1');
          el = h1Elements[parseInt(anchor.id.split('-')[1])];
        } else if (anchor.type === 'h2') {
          const h2Elements = editor.querySelectorAll('h2');
          el = h2Elements[parseInt(anchor.id.split('-')[1])];
        } else if (anchor.type === 'h3') {
          const h3Elements = editor.querySelectorAll('h3');
          el = h3Elements[parseInt(anchor.id.split('-')[1])];
        } else if (anchor.type === 'anchor') {
          const anchorName = anchor.name;
          const walker = document.createTreeWalker(
            editor,
            NodeFilter.SHOW_TEXT,
            null,
            false
          );
          let node;
          while ((node = walker.nextNode()) !== null) {
            if (node.textContent.includes('#' + anchorName + ';')) {
              el = node.parentElement;
              break;
            }
          }
        }

        if (el) {
          const rect = el.getBoundingClientRect();
          const distance = rect.top - editorTop;

          if (distance < 150) {
            currentAnchor = anchor;
          }
        }
      });

      const isAtBottom = editor.scrollHeight - editor.scrollTop <= editor.clientHeight + 10;

      if (isAtBottom && anchors.length > 0) {
        currentAnchor = anchors[anchors.length - 1];
      } else if (!currentAnchor && anchors.length > 0) {
        currentAnchor = anchors[0];
      }

      if (currentAnchor && currentAnchor.id !== activeAnchorId) {
        setActiveAnchorId(currentAnchor.id);
      }
    };

    // Al massimo un calcolo per frame: handleScroll scorre tutti i titoli e le ancore della nota
    let scrollFrame = null;
    const onScroll = () => {
      if (scrollFrame !== null) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = null;
        handleScroll();
      });
    };

    editor.addEventListener('scroll', onScroll, { passive: true });
    const timer = setTimeout(handleScroll, 100);

    return () => {
      editor.removeEventListener('scroll', onScroll);
      if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
      clearTimeout(timer);
    };
  }, [anchors, activeAnchorId]);

  // Scroll to anchor/heading smoothly
  const scrollToAnchor = useCallback((anchor) => {
    if (!editorRef.current) return;

    // Set this anchor as active
    setActiveAnchorId(anchor.id);

    // Try to find element by type and index
    let targetElement = null;

    if (anchor.type === 'h1') {
      const h1Elements = editorRef.current.querySelectorAll('h1');
      targetElement = h1Elements[parseInt(anchor.id.split('-')[1])];
    } else if (anchor.type === 'h2') {
      const h2Elements = editorRef.current.querySelectorAll('h2');
      targetElement = h2Elements[parseInt(anchor.id.split('-')[1])];
    } else if (anchor.type === 'h3') {
      const h3Elements = editorRef.current.querySelectorAll('h3');
      targetElement = h3Elements[parseInt(anchor.id.split('-')[1])];
    } else if (anchor.type === 'anchor') {
      // Find anchor by searching for text pattern
      const anchorName = anchor.name;
      const walker = document.createTreeWalker(
        editorRef.current,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );
      let node;
      while ((node = walker.nextNode()) !== null) {
        if (node.textContent.includes('#' + anchorName + ';')) {
          targetElement = node.parentElement;
          break;
        }
      }
    }

    if (targetElement) {
      targetElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });

      // Evidenzia temporaneamente l'elemento
      const originalBackground = targetElement.style.backgroundColor;
      targetElement.style.backgroundColor = 'var(--primary-ghost)';
      targetElement.style.transition = 'background-color 0.3s ease';

      // Rimuovi l'evidenziazione dopo 2 secondi
      setTimeout(() => {
        targetElement.style.backgroundColor = originalBackground;
      }, 2000);
    }
  }, []);


  // Salva la selezione quando il menu contestuale si apre
  useEffect(() => {
    if (textSelection) saveSelection();
  }, [textSelection]);

  // Non è un componente (niente remount a ogni render del genitore): è una funzione che restituisce JSX
  const renderContextualMenu = () => {
    if (!textSelection) return null;

    // Tiene il menu dentro lo schermo anche per selezioni vicine al bordo inferiore
    const menuTop = Math.max(8, Math.min(textSelection.position.y, window.innerHeight - CONTEXTUAL_MENU_MAX_HEIGHT));

    // In fullscreen, posiziona relativamente all'editor wrapper
    const menuStyle = {
      position: isFullScreen ? 'absolute' : 'fixed',
      left: `${textSelection.position.x}px`,
      top: `${menuTop}px`,
      zIndex: 1000,
      maxHeight: 'calc(100vh - 16px)',
      overflowY: 'auto'
    };

    const MenuComponent = (
      <div
        className="contextual-menu animate-scale-in"
        style={menuStyle}
      >
        {/* In cima, così resta raggiungibile anche con selezioni vicine al bordo dello schermo */}
        <button type="button" title="Riscrivi, traduci, correggi... (Ctrl+Shift+A)" onMouseDown={(e) => handleMenuButtonMouseDown(e, openAIMenu)}>
          <IconComponent name="sparkles" /> Strumenti AI
        </button>
        <div className="rte-separator" />
        <button type="button" onMouseDown={(e) => handleMenuButtonMouseDown(e, () => applyTextFormat('bold'))}>
          <IconComponent name="bold" /> Grassetto
        </button>
        <button type="button" onMouseDown={(e) => handleMenuButtonMouseDown(e, () => applyTextFormat('italic'))}>
          <IconComponent name="italic" /> Corsivo
        </button>
        <button type="button" onMouseDown={(e) => handleMenuButtonMouseDown(e, () => applyTextFormat('underline'))}>
          <IconComponent name="underline" /> Sottolineato
        </button>
        <button type="button" onMouseDown={(e) => handleMenuButtonMouseDown(e, () => applyTextFormat('strikeThrough'))}>
          <IconComponent name="strikethrough" /> Barrato
        </button>
        <div className="rte-separator" />
        {/* Colori evidenziazione (sfondo) */}
        <div className="rte-separator" />
        <div style={{ padding: '4px 8px', fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>Colori Evidenziazione</div>
        <div style={{ display: 'flex', gap: '4px', padding: '4px 8px', flexWrap: 'wrap' }}>
          {['#FF6B6B', '#FFA502', '#FFDD59', '#2ED573', '#1E90FF', '#A55EEA'].map(color => (
            <button
              key={color}
              type="button"
              onMouseDown={(e) => handleMenuButtonMouseDown(e, () => applyTextFormat('hiliteColor', color))}
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '4px',
                background: color,
                border: 'none',
                cursor: 'pointer'
              }}
              title={color}
            />
          ))}
        </div>
        <div style={{ padding: '4px 8px', fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 600, marginTop: '4px' }}>Pastello</div>
        <div style={{ display: 'flex', gap: '4px', padding: '4px 8px', flexWrap: 'wrap' }}>
          {['#FFB3BA', '#FFDFC4', '#FFFFBA', '#BAFFC9', '#BAE1FF', '#E6B3FF'].map(color => (
            <button
              key={color}
              type="button"
              onMouseDown={(e) => handleMenuButtonMouseDown(e, () => applyTextFormat('hiliteColor', color))}
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '4px',
                background: color,
                border: '1px solid var(--border-light)',
                cursor: 'pointer'
              }}
              title={color}
            />
          ))}
        </div>
        <div className="rte-separator" />
        <button type="button" onMouseDown={(e) => handleMenuButtonMouseDown(e, () => applyTextFormat('justifyLeft'))}>
          <IconComponent name="alignLeft" /> Sinistra
        </button>
        <button type="button" onMouseDown={(e) => handleMenuButtonMouseDown(e, () => applyTextFormat('justifyCenter'))}>
          <IconComponent name="alignCenter" /> Centrato
        </button>
        <button type="button" onMouseDown={(e) => handleMenuButtonMouseDown(e, () => applyTextFormat('justifyRight'))}>
          <IconComponent name="alignRight" /> Destra
        </button>
        <button type="button" onMouseDown={(e) => handleMenuButtonMouseDown(e, () => applyTextFormat('justifyFull'))}>
          <IconComponent name="alignJustify" /> Giustificato
        </button>
        <div className="rte-separator" />
        <button type="button" onMouseDown={(e) => handleMenuButtonMouseDown(e, () => applyTextFormat('removeFormat'))}>
          ✕ Rimuovi formattazione
        </button>
      </div>
    );

    // In fullscreen renderizza dentro l'editor wrapper, altrimenti nel body
    return isFullScreen ? MenuComponent : createPortal(MenuComponent, document.body);
  };

  // Only update innerHTML if it completely differs from external value AND we are not actively typing in it.
  useEffect(() => {
    if (pendingHtmlRef.current !== null) return;
    // Con il marker temporaneo del cursore nel DOM è aperto un modale di inserimento (link, nota):
    // ricreare l'HTML ora distruggerebbe il punto in cui inserire
    if (cursorMarkerRef.current) return;

    // Si confronta con l'HTML "pulito" (senza marker), cioè quello che l'editor ha salvato
    if (editorRef.current && value !== getEditorHtml()) {
      if (document.activeElement !== editorRef.current) {
        editorRef.current.innerHTML = sanitizeHtml(value);

        // Contenuto sostituito dall'esterno (es. nota salvata e campo svuotato): le modifiche
        // precedenti non esistono più, quindi il nuovo testo è il punto di partenza "pulito".
        // Senza questo reset la guardia "modifiche non salvate" non scatta dalla seconda nota in poi.
        initialValueRef.current = editorRef.current.innerHTML;
        if (isDirtyRef.current) {
          isDirtyRef.current = false;
          onDirtyChangeRef.current?.(false);
        }
      }
    }
  }, [value]);

  // Sync innerHTML when toggling fullscreen to prevent content loss due to re-mounting
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = sanitizeHtml(value);
    }
    // Lock body scroll in fullscreen (ripristinando il valore precedente: l'editor può stare dentro un modale)
    if (!isFullScreen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isFullScreen]);

  // Esc esce dalla modalità a schermo intero
  const overlayOpenRef = useRef(false);
  // I pannelli AI laterali non contano: non bloccano la pagina (Esc dentro un pannello lo gestisce il pannello)
  overlayOpenRef.current = !!(slashMenuParams || showInternalLinkMenu || linkModalParams);
  useEffect(() => {
    if (!isFullScreen) return undefined;
    const onKeyDown = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // Menu e pannelli aperti hanno la precedenza (gestiscono Esc da soli)
      if (overlayOpenRef.current || e.target?.closest?.('.rte-ai-side')) return;
      e.stopPropagation();
      setIsFullScreen(false);
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [isFullScreen]);

  // Apre un solo menu a tendina alla volta della toolbar (titoli, colori, allineamento)
  const toggleDropdown = (name) => {
    setShowHeadings(name === 'headings' ? !showHeadings : false);
    setShowColors(name === 'colors' ? !showColors : false);
    setShowAlignment(name === 'alignment' ? !showAlignment : false);
  };

  const exec = (cmd, val = null) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);

    handleInput();
    setShowColors(false);
    setShowHeadings(false);
    setShowAlignment(false);
  };

  const insertHtml = (rawHtml) => {
    const html = sanitizeHtml(rawHtml);
    if (cursorMarkerRef.current && editorRef.current) {
      const marker = cursorMarkerRef.current;
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;
      while (tempDiv.firstChild) {
        marker.parentNode.insertBefore(tempDiv.firstChild, marker.nextSibling);
      }
      cleanupCursorMarker();
      handleInput();
    } else {
      exec('insertHTML', html);
    }
  };

  // HTML interno di un blocco. Un nodo di testo "nudo" va escapato: il suo contenuto è testo, non markup
  const blockInnerHtml = (block) => (
    block.nodeType === Node.TEXT_NODE ? escapeHtml(block.textContent || '') : (block.innerHTML || '')
  );

  const changeBlockTag = (tagName, targetElement = null) => {
    setShowHeadings(false);
    editorRef.current?.focus();
    const sel = window.getSelection();

    let block = targetElement;
    if (!block && sel.rangeCount) {
      let node = sel.anchorNode;
      block = node;
      while (block && block !== editorRef.current &&
        !['P', 'DIV', 'H1', 'H2', 'H3', 'LI', 'BLOCKQUOTE'].includes(block.tagName)) {
        block = block.parentNode;
      }
      if (!block || block === editorRef.current) {
        let child = sel.anchorNode;
        while (child && child.parentNode !== editorRef.current) {
          child = child.parentNode;
        }
        if (child) block = child;
      }
    }

    if (block && block !== editorRef.current) {
      if (block.tagName && block.tagName.toLowerCase() === tagName.toLowerCase()) return;

      const newBlock = document.createElement(tagName);
      newBlock.innerHTML = blockInnerHtml(block) || '<br>';

      block.parentNode.replaceChild(newBlock, block);

      // Move cursor to the same position
      const newRange = document.createRange();
      newRange.selectNodeContents(newBlock);
      newRange.collapse(false); // end
      sel.removeAllRanges();
      sel.addRange(newRange);
    } else {
      exec('formatBlock', `<${tagName}>`);
    }
    handleInput();
  };

  const insertChecklist = (targetElement = null) => {
    editorRef.current?.focus();
    let block = targetElement;
    if (!block) {
      const sel = window.getSelection();
      if (sel.rangeCount) {
        let node = sel.anchorNode;
        block = node;
        while (block && block !== editorRef.current &&
          !['P', 'DIV', 'H1', 'H2', 'H3', 'LI', 'BLOCKQUOTE'].includes(block.tagName)) {
          block = block.parentNode;
        }
        if (!block || block === editorRef.current) {
          let child = sel.anchorNode;
          while (child && child.parentNode !== editorRef.current) {
            child = child.parentNode;
          }
          if (child) block = child;
        }
      }
    }

    if (block && block !== editorRef.current) {
      const newTodo = document.createElement('div');
      newTodo.className = 'todo-item';
      newTodo.style.display = 'flex';
      newTodo.style.alignItems = 'center';
      newTodo.style.gap = '8px';
      newTodo.style.marginBottom = '4px';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.setAttribute('contenteditable', 'false');

      const textSpan = document.createElement('span');
      textSpan.style.flex = '1';
      textSpan.innerHTML = blockInnerHtml(block) || '&nbsp;';

      newTodo.appendChild(checkbox);
      newTodo.appendChild(textSpan);

      block.parentNode.replaceChild(newTodo, block);

      // Focus cursor inside textSpan
      const sel = window.getSelection();
      const newRange = document.createRange();
      newRange.selectNodeContents(textSpan);
      newRange.collapse(false);
      sel.removeAllRanges();
      sel.addRange(newRange);
    } else {
      const html = `<div class="todo-item" style="display:flex; align-items:center; gap:8px; margin-bottom:4px;"><input type="checkbox" contenteditable="false" /><span style="flex:1;">&nbsp;</span></div>`;
      insertHtml(html);
    }
    handleInput();
  };

  const insertCodeBlock = (targetElement = null) => {
    editorRef.current?.focus();
    let block = targetElement;
    if (!block) {
      const sel = window.getSelection();
      if (sel.rangeCount) {
        let node = sel.anchorNode;
        block = node;
        while (block && block !== editorRef.current &&
          !['P', 'DIV', 'H1', 'H2', 'H3', 'LI', 'BLOCKQUOTE'].includes(block.tagName)) {
          block = block.parentNode;
        }
        if (!block || block === editorRef.current) {
          let child = sel.anchorNode;
          while (child && child.parentNode !== editorRef.current) {
            child = child.parentNode;
          }
          if (child) block = child;
        }
      }
    }

    if (block && block !== editorRef.current) {
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      // Il testo del comando (/code) è già stato rimosso da applySlashCommand: qui non va tolto altro,
      // altrimenti un percorso come C:\temp perderebbe la parte finale
      code.innerHTML = blockInnerHtml(block).trim() || '&nbsp;';
      pre.appendChild(code);

      // Ensure there is a trailing paragraph after the code block
      let nextBlock = block.nextSibling;
      if (!nextBlock) {
        nextBlock = document.createElement('p');
        nextBlock.innerHTML = '<br>';
        block.parentNode.appendChild(nextBlock);
      }

      block.parentNode.replaceChild(pre, block);

      // Move cursor inside code block
      const sel = window.getSelection();
      const newRange = document.createRange();
      newRange.selectNodeContents(code);
      newRange.collapse(false);
      sel.removeAllRanges();
      sel.addRange(newRange);
    } else {
      insertHtml('<pre><code>&nbsp;</code></pre><p><br></p>');
    }
    handleInput();
  };

  const changeBlockToList = (listType, targetElement = null) => {
    editorRef.current?.focus();
    const sel = window.getSelection();

    let block = targetElement;
    if (!block && sel.rangeCount) {
      let node = sel.anchorNode;
      block = node;
      while (block && block !== editorRef.current &&
        !['P', 'DIV', 'H1', 'H2', 'H3', 'LI', 'BLOCKQUOTE'].includes(block.tagName)) {
        block = block.parentNode;
      }
      if (!block || block === editorRef.current) {
        let child = sel.anchorNode;
        while (child && child.parentNode !== editorRef.current) {
          child = child.parentNode;
        }
        if (child) block = child;
      }
    }

    if (block && block !== editorRef.current) {
      const listElement = document.createElement(listType === 'ol' ? 'ol' : 'ul');
      listElement.style.marginBottom = '1em';
      const li = document.createElement('li');
      li.innerHTML = blockInnerHtml(block) || '&nbsp;';
      listElement.appendChild(li);

      block.parentNode.replaceChild(listElement, block);

      // Move cursor to the same position inside the LI
      const newRange = document.createRange();
      newRange.selectNodeContents(li);
      newRange.collapse(false);
      sel.removeAllRanges();
      sel.addRange(newRange);
    } else {
      exec(listType === 'ol' ? 'insertOrderedList' : 'insertUnorderedList');
    }
    handleInput();
  };

  // HTML della nota senza il marker temporaneo del cursore (usato dai comandi link), che non va mai salvato
  const getEditorHtml = () => {
    const editor = editorRef.current;
    if (!editor) return '';
    if (!editor.querySelector('#cursor-marker-temp')) return editor.innerHTML;
    const clone = editor.cloneNode(true);
    clone.querySelectorAll('#cursor-marker-temp').forEach(el => el.remove());
    return clone.innerHTML;
  };

  // Apre/aggiorna/chiude il menu comandi in base al testo prima del cursore
  const updateSlashMenu = () => {
    const editor = editorRef.current;
    const sel = window.getSelection();
    if (editor && sel && sel.rangeCount && sel.isCollapsed) {
      try {
        const range = sel.getRangeAt(0);
        const node = sel.anchorNode;

        if (node && node.nodeType === Node.TEXT_NODE && editor.contains(node)) {
          const match = getSlashMatch(node.textContent.substring(0, range.startOffset));
          if (match) {
            const rect = range.getBoundingClientRect();
            // Use the relative wrapper for accurate positioning
            const wrapperRect = editor.parentElement.getBoundingClientRect();
            setSlashMenuParams({
              top: rect.bottom - wrapperRect.top + 5,
              left: rect.left - wrapperRect.left,
              filter: match.filter
            });
            return;
          }
        }
      } catch (e) {
        // Ignore selection errors
      }
    }
    setSlashMenuParams(null);
    setSlashSelectedIndex(0);
  };

  const handleInput = () => {
    if (!editorRef.current) return;
    const html = getEditorHtml();

    pendingHtmlRef.current = html;

    // Update dirty state
    const dirty = html !== initialValueRef.current;
    if (dirty !== isDirtyRef.current) {
      isDirtyRef.current = dirty;
      onDirtyChangeRef.current?.(dirty);
    }

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      onChangeRef.current?.(html);
      pendingHtmlRef.current = null;
    }, 400);

    updateSlashMenu();
  };

  const closeSlashMenu = () => setSlashMenuParams(null);

  const applySlashCommand = (cmd) => {
    // Save block reference before trigger text deletion
    const sel = window.getSelection();
    let targetBlock = null;
    if (sel.rangeCount && slashMenuParams) {
      const range = sel.getRangeAt(0);
      const textNode = sel.anchorNode;

      let block = textNode;
      while (block && block !== editorRef.current &&
        !['P', 'DIV', 'H1', 'H2', 'H3', 'LI', 'BLOCKQUOTE'].includes(block.tagName)) {
        block = block.parentNode;
      }
      if (block && block !== editorRef.current) {
        targetBlock = block;
      } else {
        let child = textNode;
        while (child && child.parentNode !== editorRef.current) {
          child = child.parentNode;
        }
        if (child) {
          targetBlock = child;
        }
      }

      const match = getSlashMatch(textNode.textContent.substring(0, range.startOffset));
      if (match) {
        range.setStart(textNode, range.startOffset - match.length);
        range.deleteContents();
      }
    }

    // For link_file/link_note: always save the cursor selection so it can be restored after modal interaction
    if (cmd === 'link_file' || cmd === 'link_note') {
      const currentSel = window.getSelection();
      if (currentSel && currentSel.rangeCount > 0) {
        savedSelectionRef.current = currentSel.getRangeAt(0).cloneRange();

        // Insert a temporary marker at cursor position
        const range = currentSel.getRangeAt(0).cloneRange();
        const marker = document.createElement('span');
        marker.id = 'cursor-marker-temp';
        marker.setAttribute('data-temp-marker', 'true');
        marker.style.display = 'none';
        range.collapse(true);
        range.insertNode(marker);
        cursorMarkerRef.current = marker;
      }
      // For link_file, also calculate position for the inline dropdown
      if (cmd === 'link_file') {
        if (slashMenuParams) {
          setInternalLinkPosition({
            top: slashMenuParams.top,
            left: slashMenuParams.left
          });
        } else {
          const sel = window.getSelection();
          if (sel.rangeCount) {
            const range = sel.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            const wrapperRect = editorRef.current.parentElement.getBoundingClientRect();
            const position = {
              top: rect.bottom - wrapperRect.top + 5,
              left: rect.left - wrapperRect.left
            };
            setInternalLinkPosition(position);
          }
        }
      }
    }

    closeSlashMenu();

    if (cmd === 'h1') changeBlockTag('h1', targetBlock);
    else if (cmd === 'h2') changeBlockTag('h2', targetBlock);
    else if (cmd === 'bullet_list') changeBlockToList('ul', targetBlock);
    else if (cmd === 'numbered_list') changeBlockToList('ol', targetBlock);
    else if (cmd === 'todo') insertChecklist(targetBlock);
    else if (cmd === 'separator') return; // Do nothing for separator
    else if (cmd === 'highlight') exec('hiliteColor', '#F1C40F');
    else if (cmd === 'code') insertCodeBlock(targetBlock);
    else if (cmd === 'quote') changeBlockTag('blockquote', targetBlock);
    else if (cmd === 'divider') insertHtml('<hr><br>');
    else if (cmd === 'link') {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        savedSelectionRef.current = sel.getRangeAt(0).cloneRange();
        setLinkInputName(sel.toString() || '');
        // Intervallo del testo selezionato che il link sostituirà (savedSelectionRef viene azzerato
        // da qualsiasi clic fuori dall'editor, quindi anche da quelli dentro il modale)
        linkRangeRef.current = sel.isCollapsed ? null : sel.getRangeAt(0).cloneRange();

        // Insert a temporary marker at cursor position
        const range = sel.getRangeAt(0).cloneRange();
        const marker = document.createElement('span');
        marker.id = 'cursor-marker-temp';
        marker.setAttribute('data-temp-marker', 'true');
        marker.style.display = 'none';
        range.collapse(true);
        range.insertNode(marker);
        cursorMarkerRef.current = marker;
      } else {
        setLinkInputName('');
      }
      setLinkInputVal('');
      setLinkModalParams({ type: 'url' });
    } else if (cmd === 'link_file') {
      setShowInternalLinkMenu('file');
    } else if (cmd === 'link_note') {
      setNoteSearchQuery('');
      setNoteSelectedIndex(0);
      setShowInternalLinkMenu('note');
    } else if (cmd === 'image') {
      imageInputRef.current?.click();
    } else if (cmd === 'link_folder') {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        savedSelectionRef.current = sel.getRangeAt(0).cloneRange();
        setLinkInputName(sel.toString() || '');
        // Intervallo del testo selezionato che il link sostituirà (savedSelectionRef viene azzerato
        // da qualsiasi clic fuori dall'editor, quindi anche da quelli dentro il modale)
        linkRangeRef.current = sel.isCollapsed ? null : sel.getRangeAt(0).cloneRange();

        // Insert a temporary marker at cursor position
        const range = sel.getRangeAt(0).cloneRange();
        const marker = document.createElement('span');
        marker.id = 'cursor-marker-temp';
        marker.setAttribute('data-temp-marker', 'true');
        marker.style.display = 'none';
        range.collapse(true);
        range.insertNode(marker);
        cursorMarkerRef.current = marker;
      } else {
        setLinkInputName('');
      }
      setLinkInputVal('');
      setLinkModalParams({ type: 'folder' });
    }
  };

  const cleanupCursorMarker = () => {
    if (cursorMarkerRef.current) {
      cursorMarkerRef.current.remove();
      cursorMarkerRef.current = null;
    }
  };

  // Clean up marker when modal closes
  useEffect(() => {
    if (!linkModalParams && !showInternalLinkMenu) {
      cleanupCursorMarker();
      linkRangeRef.current = null;
    }
  }, [linkModalParams, showInternalLinkMenu]);

  const handleApplyLink = () => {
    if (!linkInputVal.trim()) return;

    const url = linkInputVal.trim();
    let htmlToInsert;
    if (linkModalParams.type === 'url') {
      // Senza schema (es. "google.com") il browser lo tratterebbe come link relativo all'app
      const href = /^([a-z][a-z0-9+.-]*:|#)/i.test(url) ? url : `https://${url}`;
      const name = linkInputName.trim() || url;
      htmlToInsert = `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(name)}</a>&nbsp;`;
    } else {
      const path = url;
      const name = linkInputName.trim() || (path.split(/[\\\/]/).filter(Boolean).pop() || path);
      htmlToInsert = `<a href="#" class="folder-internal-link" data-path="${escapeHtml(path)}" contenteditable="false" style="color:var(--primary);font-weight:600;text-decoration:none;background:var(--bg-hover);padding:2px 6px;border-radius:4px;display:inline-block;margin:2px;cursor:pointer;">📁 ${escapeHtml(name)}</a>&nbsp;`;
    }

    htmlToInsert = sanitizeHtml(htmlToInsert);

    const selectedRange = linkRangeRef.current;
    const replacesSelection = !!selectedRange && !selectedRange.collapsed &&
      !!editorRef.current && editorRef.current.contains(selectedRange.commonAncestorContainer);

    if (replacesSelection) {
      // Il link sostituisce il testo selezionato (altrimenti ci si ritrova il testo due volte).
      // L'intervallo contiene anche il marker temporaneo, che sparisce con la cancellazione.
      selectedRange.deleteContents();
      selectedRange.insertNode(selectedRange.createContextualFragment(htmlToInsert));
      cleanupCursorMarker();
      handleInput();
    } else if (cursorMarkerRef.current && editorRef.current) {
      // Use the temporary marker to restore cursor position
      const marker = cursorMarkerRef.current;

      // Create a temporary div to hold the HTML
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = htmlToInsert;

      // Insert the HTML content directly after the marker
      while (tempDiv.firstChild) {
        marker.parentNode.insertBefore(tempDiv.firstChild, marker.nextSibling);
      }

      // Remove the marker
      cleanupCursorMarker();

      handleInput();
    } else if (savedSelectionRef.current && editorRef.current) {
      // Fallback to saved selection if marker is not available
      editorRef.current.focus();
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedSelectionRef.current);

      requestAnimationFrame(() => {
        document.execCommand('insertHTML', false, htmlToInsert);
        handleInput();
      });
    } else {
      // Final fallback: insert at cursor position
      editorRef.current?.focus();
      document.execCommand('insertHTML', false, htmlToInsert);
      handleInput();
    }

    setLinkModalParams(null);
  };

  const getSlashOptions = () => {
    if (!slashMenuParams) return [];
    return [
      { cmd: 'h1', label: 'h1', icon: 'heading' },
      { cmd: 'h2', label: 'h2', icon: 'heading' },
      { cmd: 'bullet_list', label: 'Lista Puntata', icon: 'listUnordered' },
      { cmd: 'numbered_list', label: 'Lista Numerata', icon: 'listOrdered' },
      { cmd: 'todo', label: 'Checklist / Todo', icon: 'checklist' },
      { cmd: 'quote', label: 'Citazione', icon: 'quote' },
      { cmd: 'separator', label: '', icon: '', isSeparator: true },
      { cmd: 'divider', label: 'Separatore', icon: 'align' },
      { cmd: 'image', label: 'Immagine', icon: 'image' },
      { cmd: 'link', label: 'Link Esterno', icon: 'link' },
      { cmd: 'highlight', label: 'Evidenzia', icon: 'highlight' },
      { cmd: 'code', label: 'Blocco Codice', icon: 'code' },
      { cmd: 'link_note', label: 'Collega Nota', icon: 'note' }
    ].filter(o => o.label.toLowerCase().includes(slashMenuParams.filter) || o.cmd.includes(slashMenuParams.filter));
  };

  const handleKeyDown = (e) => {
    // Scorciatoia: Ctrl+Shift+A apre gli strumenti AI sul testo selezionato
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
      if (openAIMenu()) e.preventDefault();
      return;
    }

    // 1. Gestione Slash Menu se aperto
    if (slashMenuParams) {
      const options = getSlashOptions();
      if (options.length === 0) {
        // Nessun comando corrisponde: il menu non è visibile, quindi frecce e Invio funzionano come sempre
        if (e.key === 'Escape') {
          closeSlashMenu();
          e.preventDefault();
          return;
        }
      } else if (e.key === 'Escape') {
        closeSlashMenu();
        e.preventDefault();
        return;
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        let nextIndex = (slashSelectedIndex + 1) % options.length;
        // Skip separator items
        while (options[nextIndex].isSeparator) {
          nextIndex = (nextIndex + 1) % options.length;
        }
        setSlashSelectedIndex(nextIndex);
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        let prevIndex = (slashSelectedIndex - 1 + options.length) % options.length;
        // Skip separator items
        while (options[prevIndex].isSeparator) {
          prevIndex = (prevIndex - 1 + options.length) % options.length;
        }
        setSlashSelectedIndex(prevIndex);
        return;
      } else if (e.key === 'Enter') {
        if (options.length > 0 && options[slashSelectedIndex] && !options[slashSelectedIndex].isSeparator) {
          e.preventDefault();
          applySlashCommand(options[slashSelectedIndex].cmd);
          return;
        }
      }
    }

    // 2. Gestione Enter all'interno di una checklist (todo-item)
    if (e.key === 'Enter') {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        let node = selection.anchorNode;
        let todoItem = null;
        while (node && node !== editorRef.current) {
          if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('todo-item')) {
            todoItem = node;
            break;
          }
          node = node.parentNode;
        }

        if (todoItem) {
          e.preventDefault();
          const newTodo = document.createElement('div');
          newTodo.className = 'todo-item';
          newTodo.style.display = 'flex';
          newTodo.style.alignItems = 'center';
          newTodo.style.gap = '8px';
          newTodo.style.marginBottom = '4px';

          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.setAttribute('contenteditable', 'false');

          const textSpan = document.createElement('span');
          textSpan.style.flex = '1';
          textSpan.innerHTML = '&nbsp;';

          newTodo.appendChild(checkbox);
          newTodo.appendChild(textSpan);

          todoItem.parentNode.insertBefore(newTodo, todoItem.nextSibling);

          const newRange = document.createRange();
          newRange.setStart(textSpan, 0);
          newRange.setEnd(textSpan, 0);
          selection.removeAllRanges();
          selection.addRange(newRange);

          handleInput();
          return;
        }
      }
    }

    // 2b. Gestione Enter all'interno di una lista per uscire se vuota (LI)
    if (e.key === 'Enter') {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        let node = selection.anchorNode;
        let li = null;
        while (node && node !== editorRef.current) {
          if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'LI') {
            li = node;
            break;
          }
          node = node.parentNode;
        }

        if (li) {
          const textContent = li.textContent.replace(/\u200B/g, '').trim();
          if (textContent === '' || textContent === '\u00A0') {
            e.preventDefault();
            const listElement = li.parentNode; // UL or OL

            // Create a new paragraph to replace the empty list item
            const p = document.createElement('p');
            p.innerHTML = '<br>';

            // If the empty LI is the only item in the list, replace the whole list with the paragraph
            if (listElement.children.length <= 1) {
              listElement.parentNode.replaceChild(p, listElement);
            } else {
              // If it's the last item, remove it from list and insert paragraph after list
              if (listElement.lastElementChild === li) {
                listElement.removeChild(li);
                listElement.parentNode.insertBefore(p, listElement.nextSibling);
              } else if (listElement.firstElementChild === li) {
                // If it's the first item, remove it and insert paragraph before list
                listElement.removeChild(li);
                listElement.parentNode.insertBefore(p, listElement);
              } else {
                // If it's in the middle, split the list
                const nextItems = [];
                let sibling = li.nextElementSibling;
                while (sibling) {
                  nextItems.push(sibling);
                  sibling = sibling.nextElementSibling;
                }

                const secondList = document.createElement(listElement.tagName);
                nextItems.forEach(item => {
                  listElement.removeChild(item);
                  secondList.appendChild(item);
                });

                listElement.removeChild(li);
                listElement.parentNode.insertBefore(p, listElement.nextSibling);
                listElement.parentNode.insertBefore(secondList, p.nextSibling);
              }
            }

            // Move cursor to the new paragraph
            const newRange = document.createRange();
            newRange.setStart(p, 0);
            newRange.setEnd(p, 0);
            selection.removeAllRanges();
            selection.addRange(newRange);

            handleInput();
            return;
          }
        }
      }
    }

    // 2c. Gestione Enter all'interno di una citazione per uscire se vuota (BLOCKQUOTE)
    if (e.key === 'Enter') {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        let node = selection.anchorNode;
        let bq = null;
        while (node && node !== editorRef.current) {
          if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BLOCKQUOTE') {
            bq = node;
            break;
          }
          node = node.parentNode;
        }

        if (bq) {
          // Shift+Enter, Ctrl+Enter, o Cmd+Enter per uscire dalla citazione e creare un paragrafo normale sotto
          if (e.shiftKey || e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const p = document.createElement('p');
            p.innerHTML = '<br>';
            bq.parentNode.insertBefore(p, bq.nextSibling);

            const newRange = document.createRange();
            newRange.setStart(p, 0);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
            handleInput();
            return;
          }

          // Doppio Invio (Invio su riga vuota) per uscire dalla citazione
          let currentLineNode = range.startContainer;
          while (currentLineNode && currentLineNode !== bq) {
            if (currentLineNode.nodeType === Node.ELEMENT_NODE && ['P', 'DIV', 'LI'].includes(currentLineNode.tagName)) {
              break;
            }
            currentLineNode = currentLineNode.parentNode;
          }

          const isLineEmpty = !range.startContainer.textContent.trim() ||
            (currentLineNode && !currentLineNode.textContent.trim());

          if (isLineEmpty) {
            e.preventDefault();

            // Rimuoviamo la riga vuota corrente se è un sotto-elemento di bq
            if (currentLineNode && currentLineNode !== bq) {
              currentLineNode.remove();
            } else if (range.startContainer.nodeType === Node.TEXT_NODE) {
              range.startContainer.textContent = range.startContainer.textContent.trimEnd();
            }

            // Crea paragrafo normale sotto
            const p = document.createElement('p');
            p.innerHTML = '<br>';
            bq.parentNode.insertBefore(p, bq.nextSibling);

            // Sposta il cursore al paragrafo successivo
            const newRange = document.createRange();
            newRange.setStart(p, 0);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
            handleInput();
            return;
          }
        }
      }
    }

    // 2d. Gestione tastiera all'interno del Blocco Codice (PRE/CODE)
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        let node = selection.anchorNode;
        let pre = null;
        while (node && node !== editorRef.current) {
          if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'PRE') {
            pre = node;
            break;
          }
          node = node.parentNode;
        }

        if (pre) {
          // Shift+Enter, Ctrl+Enter, o Cmd+Enter per uscire dal blocco codice e creare un paragrafo normale sotto
          if (e.key === 'Enter' && (e.shiftKey || e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            const p = document.createElement('p');
            p.innerHTML = '<br>';
            pre.parentNode.insertBefore(p, pre.nextSibling);

            // Sposta il cursore al paragrafo successivo
            const newRange = document.createRange();
            newRange.setStart(p, 0);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
            handleInput();
            return;
          }

          if (e.key === 'ArrowDown') {
            // Verifica se il cursore è alla fine del contenuto pre
            const textContent = pre.textContent || '';
            const isAtEnd = (range.startContainer === pre || range.startContainer.parentNode === pre || range.startContainer.parentNode.parentNode === pre) &&
              (range.startOffset === range.startContainer.length || !range.startContainer.length);

            if (isAtEnd || (range.startContainer.textContent && range.startOffset === range.startContainer.textContent.length)) {
              let nextBlock = pre.nextSibling;
              if (nextBlock && nextBlock.nodeType === Node.ELEMENT_NODE) {
                e.preventDefault();
                const newRange = document.createRange();
                newRange.setStart(nextBlock, 0);
                newRange.setEnd(nextBlock, 0);
                selection.removeAllRanges();
                selection.addRange(newRange);
                return;
              } else {
                e.preventDefault();
                const p = document.createElement('p');
                p.innerHTML = '<br>';
                pre.parentNode.insertBefore(p, pre.nextSibling);

                const newRange = document.createRange();
                newRange.setStart(p, 0);
                newRange.collapse(true);
                selection.removeAllRanges();
                selection.addRange(newRange);
                return;
              }
            }
          }

          if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
            // Previene la creazione nativa di blocchi annidati e inserisce un semplice a capo \n
            e.preventDefault();
            const textNode = selection.anchorNode;
            const offset = selection.anchorOffset;

            // Rileva se siamo su una riga vuota per uscire dal blocco di codice
            let isBlankLine = false;
            if (textNode.nodeType === Node.TEXT_NODE) {
              const text = textNode.textContent;
              const startOfLine = text.lastIndexOf('\n', offset - 1);
              const endOfLine = text.indexOf('\n', offset);
              const lineContent = text.substring(
                startOfLine === -1 ? 0 : startOfLine + 1,
                endOfLine === -1 ? text.length : endOfLine
              ).trim();
              if (lineContent === '') {
                isBlankLine = true;
              }
            } else if (!pre.textContent.trim()) {
              isBlankLine = true;
            }

            if (isBlankLine) {
              // Rimuove la riga vuota dal contenuto del blocco di codice
              if (textNode.nodeType === Node.TEXT_NODE) {
                const text = textNode.textContent;
                const startOfLine = text.lastIndexOf('\n', offset - 1);
                const endOfLine = text.indexOf('\n', offset);
                const before = text.substring(0, startOfLine === -1 ? 0 : startOfLine);
                const after = text.substring(endOfLine === -1 ? text.length : endOfLine + 1);
                textNode.textContent = (before + (before && after ? '\n' : '') + after) || '\u00A0';
              }

              // Crea un paragrafo normale sotto
              const p = document.createElement('p');
              p.innerHTML = '<br>';
              pre.parentNode.insertBefore(p, pre.nextSibling);

              // Sposta il cursore al paragrafo successivo
              const newRange = document.createRange();
              newRange.setStart(p, 0);
              newRange.collapse(true);
              selection.removeAllRanges();
              selection.addRange(newRange);
              handleInput();
              return;
            }

            // Inserisce il ritorno a capo (con correzione per il rendering del newline finale)
            if (textNode.nodeType === Node.TEXT_NODE) {
              const text = textNode.textContent;
              const atEnd = offset === text.length;
              textNode.textContent = text.substring(0, offset) + '\n' + (atEnd ? '\n' : '') + text.substring(offset);

              const newRange = document.createRange();
              newRange.setStart(textNode, offset + 1);
              newRange.setEnd(textNode, offset + 1);
              selection.removeAllRanges();
              selection.addRange(newRange);
            } else {
              const newlineNode = document.createTextNode('\n\n');
              range.insertNode(newlineNode);
              range.setStart(newlineNode, 1);
              range.setEnd(newlineNode, 1);
              selection.removeAllRanges();
              selection.addRange(range);
            }
            handleInput();
            return;
          }
        }
      }
    }

    // 3. Gestione Backspace all'interno di una checklist vuota
    if (e.key === 'Backspace') {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        let node = selection.anchorNode;
        let todoItem = null;
        while (node && node !== editorRef.current) {
          if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('todo-item')) {
            todoItem = node;
            break;
          }
          node = node.parentNode;
        }

        if (todoItem) {
          const textContent = todoItem.textContent.trim();
          if (textContent === '' || textContent === '\u00A0' || range.startOffset === 0) {
            e.preventDefault();
            const p = document.createElement('p');
            p.innerHTML = todoItem.querySelector('span')?.innerHTML || '<br>';
            todoItem.parentNode.replaceChild(p, todoItem);

            const newRange = document.createRange();
            newRange.selectNodeContents(p);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);

            handleInput();
            return;
          }
        }
      }
    }
  };

  const IMPORT_MAX_BYTES = 3 * 1024 * 1024;

  // Legge il file come testo: UTF-8 e, se non valido (es. CSV esportato da Excel), Windows-1252
  const readFileAsText = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lettura del file non riuscita.'));
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result);
      try {
        resolve(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      } catch {
        resolve(new TextDecoder('windows-1252').decode(bytes));
      }
    };
    reader.readAsArrayBuffer(file);
  });

  const handleFileImport = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > IMPORT_MAX_BYTES) {
      alert('File troppo grande (max 3MB).');
      return;
    }

    let text;
    try {
      text = await readFileAsText(file);
    } catch (error) {
      alert(error.message);
      return;
    }

    const name = file.name.toLowerCase();
    if (name.endsWith('.csv')) {
      insertHtml(csvToTableHtml(text));
    } else if (name.endsWith('.md') || name.endsWith('.markdown')) {
      insertHtml(markdownToHtml(text, { forceBlocks: true }).html + '<br>');
    } else if (name.endsWith('.html') || name.endsWith('.htm')) {
      insertHtml(text + '<br>');
    } else {
      // Testo semplice: va mostrato com'è (niente interpretazione di < e &), mantenendo gli a capo
      insertHtml(escapeHtml(text.replace(/\r\n?/g, '\n')).replace(/\n/g, '<br>') + '<br>');
    }
  };

  // Ridimensiona (max 800x600) e inserisce un'immagine; usato da pulsante, incolla e trascina
  const insertImageFile = (file) => {
    if (!file.type.startsWith('image/')) {
      alert('Seleziona un file immagine.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('Immagine troppo grande (max 10MB).');
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => alert('Lettura dell\'immagine non riuscita.');
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => alert('Formato immagine non supportato.');
      img.onload = () => {
        // Auto-resize if the image is very large
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 600;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height = Math.round(height * (MAX_WIDTH / width));
          width = MAX_WIDTH;
        }
        if (height > MAX_HEIGHT) {
          width = Math.round(width * (MAX_HEIGHT / height));
          height = MAX_HEIGHT;
        }

        // Use canvas to resize
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        // Sfondo bianco: in JPEG la trasparenza dei PNG diventerebbe nera
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        editorRef.current?.focus();
        insertHtml(`<img src="${resizedDataUrl}" alt="Immagine" style="max-width:100%;height:auto;border-radius:6px;margin:8px 0;cursor:pointer;" class="rte-resizable-img" /><br>`);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) insertImageFile(file);
  };

  const getFormattedText = (node) => {
    let text = "";
    if (node.nodeType === Node.TEXT_NODE) {
      return node.nodeValue;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const tagName = node.tagName.toLowerCase();

      // Block level elements that should have newlines around them
      const isBlock = ['h1', 'h2', 'h3', 'p', 'div', 'li', 'pre', 'hr'].includes(tagName);

      node.childNodes.forEach(child => {
        text += getFormattedText(child);
      });

      if (tagName === 'br') text += "\n";
      else if (tagName === 'p' || tagName === 'div' || tagName === 'li') text += "\n";
      else if (['h1', 'h2', 'h3'].includes(tagName)) text += "\n\n"; // Titles get extra space
      else if (tagName === 'hr') text += "\n-------------------\n";
    }
    return text;
  };

  const downloadFile = (content, filename, type) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    // Non subito: alcuni browser non hanno ancora avviato il download
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportFileName = (ext) => `nota_upersite_${new Date().toISOString().slice(0, 10)}.${ext}`;

  const exportAsTXT = () => {
    if (!editorRef.current) return;

    // Create a clone to manipulate if needed
    const clone = editorRef.current.cloneNode(true);

    // Formatting titles with symbols
    clone.querySelectorAll('h1').forEach(h => h.prepend("# "));
    clone.querySelectorAll('h2').forEach(h => h.prepend("## "));
    clone.querySelectorAll('h3').forEach(h => h.prepend("### "));
    clone.querySelectorAll('li').forEach(li => li.prepend("- "));

    const text = getFormattedText(clone);
    downloadFile(text.trim(), exportFileName('txt'), 'text/plain');
  };

  const exportAsMD = () => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    // We already have a decent MD logic, but let's make it cleaner
    let md = html
      .replace(/<h1>(.*?)<\/h1>/gim, '# $1\n\n')
      .replace(/<h2>(.*?)<\/h2>/gim, '## $1\n\n')
      .replace(/<h3>(.*?)<\/h3>/gim, '### $1\n\n')
      .replace(/<b>(.*?)<\/b>/gim, '**$1**')
      .replace(/<strong>(.*?)<\/strong>/gim, '**$1**')
      .replace(/<i>(.*?)<\/i>/gim, '*$1*')
      .replace(/<em>(.*?)<\/em>/gim, '*$1*')
      .replace(/<u>(.*?)<\/u>/gim, '_$1_')
      .replace(/<li>(.*?)<\/li>/gim, '- $1\n')
      .replace(/<br\s*\/?>/gim, '\n')
      .replace(/<\/div>/gim, '\n')
      .replace(/<\/p>/gim, '\n\n')
      .replace(/<p>/gim, '')
      .replace(/<div>/gim, '')
      .replace(/<[^>]*>/gim, ''); // Strip remaining tags

    downloadFile(md.trim(), exportFileName('md'), 'text/markdown');
  };

  // Apre un percorso collegato nella nota. Il percorso arriva dall'HTML della nota (che può essere incollato
  // o importato), quindi i file eseguibili non si lanciano mai da qui e ogni file (non cartella) chiede conferma.
  const openFolderLink = async (path) => {
    if (!path) return;
    const copyPath = () => navigator.clipboard?.writeText(path).catch(() => {});

    if (BLOCKED_OPEN_EXTENSIONS.test(path)) {
      copyPath();
      alert('Per sicurezza i file eseguibili non si aprono da una nota. Il percorso è stato copiato negli appunti.');
      return;
    }
    if (!window.electronAPI) {
      copyPath();
      alert('Apertura cartelle disponibile solo nell\'app desktop. Il percorso è stato copiato negli appunti.');
      return;
    }
    // Una cartella non ha estensione: apertura diretta. Un file chiede conferma.
    if (/\.[a-z0-9]{1,8}$/i.test(path) && !window.confirm(`Aprire questo file?\n\n${path}`)) return;

    try {
      await window.electronAPI.openPath(path);
    } catch (err) {
      copyPath();
      alert('Errore: ' + err.message + '. Percorso copiato.');
    }
  };

  // Make links clickable (open in new tab) and handle image resizing on click
  const handleEditorClick = (e) => {
    const target = e.target;

    // Gestione click su checkbox
    if (target.tagName === 'INPUT' && target.type === 'checkbox') {
      if (target.checked) {
        target.setAttribute('checked', 'true');
        const sibling = target.nextSibling || target.parentElement.querySelector('span');
        if (sibling && sibling !== target) {
          sibling.style.textDecoration = 'line-through';
          sibling.style.opacity = '0.5';
        }
      } else {
        target.removeAttribute('checked');
        const sibling = target.nextSibling || target.parentElement.querySelector('span');
        if (sibling && sibling !== target) {
          sibling.style.textDecoration = 'none';
          sibling.style.opacity = '1';
        }
      }
      handleInput(); // salva le modifiche
      return;
    }

    // Il click può cadere su un elemento dentro il link (es. <b> nel testo del link)
    const link = target.closest ? target.closest('a') : null;

    // Handle internal link clicks
    if (link && editorRef.current?.contains(link) && (link.classList.contains('internal-link') || link.classList.contains('folder-internal-link'))) {
      e.preventDefault();
      const id = link.getAttribute('data-internal-id');
      const type = link.getAttribute('data-internal-type');

      // If it's an internal-link with data-internal-type="folder-nav", we call the handler
      if (onInternalLinkClick && (id || type)) {
        onInternalLinkClick(id, type);
      } else if (link.classList.contains('folder-internal-link')) {
        // Le note create in passato hanno i backslash raddoppiati nel data-path
        const path = (link.getAttribute('data-path') || '').replace(/\\\\/g, '\\');
        openFolderLink(path);
      }
      return;
    }

    // Handle link clicks - open in new tab
    if (link && editorRef.current?.contains(link) && link.href) {
      e.preventDefault();
      window.open(link.href, '_blank', 'noopener,noreferrer');
      return;
    }

    // Handle image resize on click
    if (target.tagName === 'IMG' && target.classList.contains('rte-resizable-img')) {
      e.preventDefault();
      const currentWidth = target.style.maxWidth || '100%';
      // Cycle through sizes: 100% -> 75% -> 50% -> 25% -> 100%
      const sizes = ['100%', '75%', '50%', '25%'];
      const currentIndex = sizes.indexOf(currentWidth);
      const nextIndex = (currentIndex + 1) % sizes.length;
      target.style.maxWidth = sizes[nextIndex];
      handleInput(); // trigger save
    }
  };

  // Make sure all <a> tags created by createLink have target="_blank"
  const handlePaste = (e) => {
    // Immagini incollate (es. screenshot): ridimensionate e inserite come dall'apposito pulsante
    const imageFile = Array.from(e.clipboardData?.files || []).find(f => f.type.startsWith('image/'));
    if (imageFile) {
      e.preventDefault();
      insertImageFile(imageFile);
      return;
    }

    // After paste, fix any links without target
    setTimeout(() => {
      if (!editorRef.current) return;
      // Rimuove script, gestori di eventi e link javascript: dal contenuto incollato
      sanitizeChildrenInPlace(editorRef.current);
      const links = editorRef.current.querySelectorAll('a:not([target])');
      links.forEach(link => {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
      });
      handleInput();
    }, 0);
  };

  // Trascinare file sulla nota: le immagini si inseriscono, gli altri file vengono ignorati
  // (altrimenti la finestra potrebbe navigare al file). Il resto passa dalla stessa pulizia dell'incolla.
  const handleDrop = (e) => {
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length > 0) {
      e.preventDefault();
      const image = files.find(f => f.type.startsWith('image/'));
      if (image) insertImageFile(image);
      return;
    }
    setTimeout(() => {
      if (!editorRef.current) return;
      sanitizeChildrenInPlace(editorRef.current);
      handleInput();
    }, 0);
  };

  const editorContent = (
    <div className={`rte-container ${isFullScreen ? 'rte-fullscreen' : ''}`} style={isFullScreen ? undefined : { position: 'relative', overflow: 'visible' }}>

      {/* Unified Floating Hover Index on the Left Side */}
      {showIndex && anchors.length > 0 && (
        <div className="rte-hover-index-container">
          {/* Vertical Pill indicator stack - Always visible */}
          <div className="rte-minimal-pill-nav">
            {anchors.map((anchor, index) => {
              const isActive = activeAnchorId === anchor.id;
              return (
                <div
                  key={anchor.id || index}
                  onClick={() => scrollToAnchor(anchor)}
                  className={`rte-pill-indicator ${isActive ? 'active' : ''}`}
                >
                  <div className="rte-pill-tooltip">
                    {anchor.name}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Premium Light-colored Table of Contents Menu - Slides in on hover */}
          <div className="rte-toc-sidebar">
            <div className="rte-toc-header">
              📑 Indice
            </div>
            <div className="rte-toc-list">
              {anchors.map((anchor, index) => {
                const isActive = activeAnchorId === anchor.id;
                let indentClass = "";
                if (anchor.level === 2) indentClass = "indent-h2";
                else if (anchor.level === 3) indentClass = "indent-h3";

                const isLink = anchor.type === 'anchor' || anchor.name.toLowerCase().includes('guadagn') || anchor.name.toLowerCase().includes('link') || anchor.name.toLowerCase().includes('timeline');

                return (
                  <button
                    key={anchor.id || index}
                    onClick={() => scrollToAnchor(anchor)}
                    className={`rte-toc-item ${indentClass} ${isActive ? 'active' : ''} ${isLink ? 'link-style' : ''}`}
                    title={anchor.name}
                  >
                    {anchor.type === 'anchor' && '🔖 '}
                    {anchor.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div
        className="rte-toolbar"
        role="toolbar"
        aria-label="Formattazione nota"
        onMouseDown={(e) => {
          // Un clic sui pulsanti non deve togliere il focus (e la selezione) all'editor
          if (e.target.closest('button')) e.preventDefault();
        }}
      >
        <button type="button" className="rte-btn" onClick={() => fileInputRef.current?.click()} title="Importa File (.txt, .md, .html, .csv)">
          <IconComponent name="import" /> Importa
        </button>
        <button type="button" className="rte-btn" onClick={exportAsTXT} title="Esporta come .txt">
          <IconComponent name="txt" /> TXT
        </button>
        <button type="button" className="rte-btn" onClick={exportAsMD} title="Esporta come .md">
          <IconComponent name="md" /> MD
        </button>

        {/* Riassunto AI dell'intera nota (per riscrivere/tradurre un testo: selezionalo) */}
        <button
          type="button"
          className="rte-btn"
          onClick={handleAISummary}
          disabled={isSummarizing}
          title={isSummarizing ? 'Riassunto in corso...' : "Riassumi l'intera nota con l'AI. Per riscrivere o tradurre un testo, selezionalo (Ctrl+Shift+A)"}
          style={{ color: isSummarizing ? 'var(--text-tertiary)' : 'var(--primary)' }}
        >
          <IconComponent name="brain" />
          {isSummarizing ? <span className="rte-ai-spinner rte-ai-spinner-sm" /> : 'Riassumi'}
        </button>

        <input ref={fileInputRef} type="file" accept=".txt,.md,.markdown,.html,.htm,.csv" style={{ display: 'none' }} onChange={handleFileImport} />

        <div className="rte-separator" />

        <button type="button" className={`rte-btn${activeFormats.bold ? ' active' : ''}`} aria-pressed={!!activeFormats.bold} onClick={() => exec('bold')} title="Grassetto (Ctrl+B)">
          <IconComponent name="bold" />
        </button>
        <button type="button" className={`rte-btn${activeFormats.italic ? ' active' : ''}`} aria-pressed={!!activeFormats.italic} onClick={() => exec('italic')} title="Corsivo (Ctrl+I)">
          <IconComponent name="italic" />
        </button>
        <button type="button" className={`rte-btn${activeFormats.underline ? ' active' : ''}`} aria-pressed={!!activeFormats.underline} onClick={() => exec('underline')} title="Sottolineato (Ctrl+U)">
          <IconComponent name="underline" />
        </button>
        <button type="button" className={`rte-btn${activeFormats.strikeThrough ? ' active' : ''}`} aria-pressed={!!activeFormats.strikeThrough} onClick={() => exec('strikeThrough')} title="Barrato">
          <s>S</s>
        </button>
        <button type="button" className={`rte-btn${activeFormats.insertUnorderedList ? ' active' : ''}`} aria-pressed={!!activeFormats.insertUnorderedList} onClick={() => changeBlockToList('ul')} title="Lista puntata">
          <IconComponent name="listUnordered" />
        </button>
        <button type="button" className={`rte-btn${activeFormats.insertOrderedList ? ' active' : ''}`} aria-pressed={!!activeFormats.insertOrderedList} onClick={() => changeBlockToList('ol')} title="Lista numerata">
          <IconComponent name="listOrdered" />
        </button>
        <button type="button" className="rte-btn" onClick={() => insertChecklist()} title="Checklist / Todo">
          <IconComponent name="checklist" />
        </button>
        <div className="rte-separator" />

        {/* Added Slash-style commands to toolbar */}
        <button type="button" className="rte-btn" onClick={() => applySlashCommand('code')} title="Blocco Codice">
          <IconComponent name="code" />
        </button>
        <button type="button" className="rte-btn" onClick={() => applySlashCommand('link')} title="Inserisci Link Esterno">
          <IconComponent name="link" />
        </button>
        <button type="button" className="rte-btn" onClick={() => imageInputRef.current?.click()} title="Inserisci Immagine (si può anche incollare o trascinare)">
          <IconComponent name="image" />
        </button>
        <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />

        {/* Headings */}
        <div className="rte-dropdown-wrap" style={{ position: 'relative' }}>
          <button type="button" className="rte-btn" onClick={() => toggleDropdown('headings')} title="Titolo" aria-haspopup="true" aria-expanded={showHeadings}>
            T▾
          </button>
          {showHeadings && (
            <div className="rte-dropdown">
              <button type="button" onClick={() => changeBlockTag('h1')} style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>Titolo 1</button>
              <button type="button" onClick={() => changeBlockTag('h2')} style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>Titolo 2</button>
              <button type="button" onClick={() => changeBlockTag('h3')} style={{ fontSize: '0.9375rem', fontWeight: 'bold' }}>Titolo 3</button>
              <button type="button" onClick={() => changeBlockTag('p')} style={{ fontSize: '0.8125rem' }}>Normale</button>
            </div>
          )}
        </div>

        {/* Colors */}
        <div className="rte-dropdown-wrap" style={{ position: 'relative' }}>
          <button type="button" className="rte-btn" onClick={() => toggleDropdown('colors')} title="Colore Testo" aria-haspopup="true" aria-expanded={showColors}>
            🎨▾
          </button>
          {showColors && (
            <div className="rte-dropdown rte-colors-grid">
              {BASIC_COLORS.map(color => (
                <button
                  key={color} type="button"
                  style={{ background: color, width: '24px', height: '24px', borderRadius: '4px', border: color === '#FFFFFF' ? '1px solid #ccc' : 'none' }}
                  onClick={() => exec('foreColor', color)}
                  title={color}
                  aria-label={`Colore ${color}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Alignment */}
        <div className="rte-dropdown-wrap" style={{ position: 'relative' }}>
          <button type="button" className="rte-btn" onClick={() => toggleDropdown('alignment')} title="Allineamento" aria-haspopup="true" aria-expanded={showAlignment}>
            ≡▾
          </button>
          {showAlignment && (
            <div className="rte-dropdown" style={{ minWidth: '80px' }}>
              <button type="button" onClick={() => exec('justifyLeft')}>Sinistra</button>
              <button type="button" onClick={() => exec('justifyCenter')}>Centro</button>
              <button type="button" onClick={() => exec('justifyRight')}>Destra</button>
              <button type="button" onClick={() => exec('justifyFull')}>Giustifica</button>
            </div>
          )}
        </div>

        <button type="button" className="rte-btn" onClick={() => exec('removeFormat')} title="Rimuovi formattazione">
          ✕
        </button>

        <button
          type="button"
          className={`rte-btn ${showIndex ? 'active' : ''}`}
          aria-pressed={showIndex}
          onClick={() => setShowIndex(!showIndex)}
          title={anchors.length === 0
            ? 'Indice: compare quando la nota ha dei titoli (T▾) o delle ancore (#nome;)'
            : 'Mostra/Nascondi Indice'}
          style={{ fontWeight: 'bold' }}
        >
          📑 Indice
        </button>

        <button
          type="button"
          className="rte-btn"
          onClick={() => setIsFullScreen(!isFullScreen)}
          title={isFullScreen ? 'Torna alla vista normale (Esc)' : 'Espandi a pieno schermo'}
          aria-pressed={isFullScreen}
          style={{ fontWeight: 'bold' }}
        >
          {isFullScreen ? '↙ Piccoli' : '⛶ Pieno Schermo'}
        </button>
      </div>

      {/* Menu contestuale per selezione testo */}
      {renderContextualMenu()}

      {/* Pannelli AI laterali: non bloccano la pagina, si può continuare a lavorare mentre l'IA genera */}
      {(showAIMenu || showSummaryPopup) && createPortal(
        <div className="rte-ai-dock">
          {showAIMenu && (aiPanelMinimized ? (
            <button
              type="button"
              className={`rte-ai-pill${aiResult ? ' ready' : ''}${aiError ? ' failed' : ''}`}
              onClick={() => setAiPanelMinimized(false)}
              title="Apri il pannello Strumenti AI"
            >
              {aiLoading ? <span className="rte-ai-spinner rte-ai-spinner-sm" /> : <IconComponent name="sparkles" />}
              <span>
                Strumenti AI · {aiLoading ? 'in corso…' : aiResult ? 'risultato pronto' : aiError ? 'errore' : 'pronti'}
              </span>
            </button>
          ) : (
            <section className="rte-ai-side" role="complementary" aria-label="Strumenti AI">
              <div className="rte-ai-header">
                <h3><IconComponent name="sparkles" /> Strumenti AI</h3>
                <div className="rte-ai-header-actions">
                  <button type="button" className="rte-ai-close" onClick={() => setAiPanelMinimized(true)} aria-label="Riduci" title="Riduci (la richiesta continua)">–</button>
                  <button type="button" className="rte-ai-close" onClick={closeAIMenu} aria-label="Chiudi" title="Chiudi e annulla">✕</button>
                </div>
              </div>

              <div className="rte-ai-model">
                IA: {describeChoice(getAIChoice('editor'))}{isLocalChoice(getAIChoice('editor')) ? ' (locale)' : ' (cloud)'}
              </div>

              {/* Testo selezionato */}
              <div className="rte-ai-selected">
                <div className="rte-ai-label">Testo selezionato · {selectedText.length} caratteri</div>
                <div>{selectedText.length > 200 ? selectedText.substring(0, 200) + '...' : selectedText}</div>
              </div>

              {/* Strumenti AI */}
              <div className="rte-ai-grid">
                {AI_TOOLS.map(tool => (
                  <button
                    key={tool.id}
                    type="button"
                    className={`rte-ai-tool${aiLastTool === tool.id ? ' active' : ''}`}
                    onClick={() => handleAITool(tool.id)}
                    disabled={aiLoading}
                  >
                    {tool.label}
                  </button>
                ))}
                <div className={`rte-ai-tool rte-ai-translate${aiLastTool === 'translate' ? ' active' : ''}`}>
                  <button type="button" onClick={() => handleAITool('translate')} disabled={aiLoading}>
                    🌍 Traduci in
                  </button>
                  <select
                    value={aiTargetLang}
                    onChange={(e) => setAiTargetLang(e.target.value)}
                    disabled={aiLoading}
                    aria-label="Lingua di destinazione"
                  >
                    {AI_LANGUAGES.map(lang => <option key={lang} value={lang}>{lang}</option>)}
                  </select>
                </div>
              </div>

              {/* Caricamento */}
              {aiLoading && (
                <div className="rte-ai-loading" role="status">
                  <span className="rte-ai-spinner" />
                  <div>Elaborazione in corso... puoi continuare a scrivere o ridurre il pannello.</div>
                  <button type="button" className="rte-ai-btn" onClick={cancelAIRequest}>Annulla richiesta</button>
                </div>
              )}

              {/* Errore: mai applicabile alla nota */}
              {aiError && !aiLoading && (
                <div className="rte-ai-error" role="alert">
                  <div>{aiError}</div>
                  {aiLastTool && (
                    <button type="button" className="rte-ai-btn" onClick={() => handleAITool(aiLastTool)}>Riprova</button>
                  )}
                </div>
              )}

              {/* Risultato AI */}
              {aiResult && !aiLoading && (
                <div>
                  <div className="rte-ai-label">Risultato</div>
                  {aiTruncated && (
                    <div className="rte-ai-warning" role="alert">
                      La risposta è stata interrotta perché troppo lunga: potrebbe essere incompleta.
                      Per questo non è possibile sostituire la selezione. Puoi inserirla sotto o copiarla.
                    </div>
                  )}
                  {aiSelectionState === 'changed' && (
                    <div className="rte-ai-warning" role="alert">
                      Nel frattempo il testo selezionato è stato modificato: «Sostituisci» sostituirà il testo che ora si trova in quel punto.
                    </div>
                  )}
                  {aiSelectionState === 'gone' && (
                    <div className="rte-ai-warning" role="alert">
                      Il testo selezionato non c'è più: puoi inserire il risultato sotto o copiarlo.
                    </div>
                  )}
                  <div
                    className="rte-ai-preview"
                    dangerouslySetInnerHTML={{ __html: renderAIMarkdown(aiResult) }}
                  />
                  <div className="rte-ai-actions">
                    <button
                      type="button"
                      className={`rte-ai-btn${aiPreferBelow ? '' : ' rte-ai-btn-primary'}`}
                      onClick={() => applyAIResult('replace')}
                      disabled={aiTruncated || aiSelectionState === 'gone'}
                    >
                      ✅ Sostituisci selezione
                    </button>
                    <button
                      type="button"
                      className={`rte-ai-btn${aiPreferBelow ? ' rte-ai-btn-primary' : ''}`}
                      onClick={() => applyAIResult('below')}
                    >
                      ⤵ Inserisci sotto
                    </button>
                    <button type="button" className="rte-ai-btn" onClick={() => copyAIText(aiResult)}>
                      {aiCopied ? '✓ Copiato' : '📋 Copia'}
                    </button>
                    <button type="button" className="rte-ai-btn" onClick={closeAIMenu}>Annulla</button>
                  </div>
                </div>
              )}
            </section>
          ))}

          {showSummaryPopup && (summaryMinimized ? (
            <button
              type="button"
              className={`rte-ai-pill${summaryText ? ' ready' : ''}${summaryError ? ' failed' : ''}`}
              onClick={() => setSummaryMinimized(false)}
              title="Apri il pannello Riassunto"
            >
              {isSummarizing ? <span className="rte-ai-spinner rte-ai-spinner-sm" /> : <IconComponent name="brain" />}
              <span>Riassunto · {isSummarizing ? 'in corso…' : summaryText ? 'pronto' : summaryError ? 'errore' : ''}</span>
            </button>
          ) : (
            <section className="rte-ai-side ai-summary-modal" role="complementary" aria-label="Riassunto AI">
              <div className="rte-ai-header">
                <h3><IconComponent name="brain" /> Riassunto della nota</h3>
                <div className="rte-ai-header-actions">
                  <button type="button" className="rte-ai-close" onClick={() => setSummaryMinimized(true)} aria-label="Riduci" title="Riduci (la richiesta continua)">–</button>
                  <button type="button" className="rte-ai-close" onClick={closeSummaryPopup} aria-label="Chiudi" title="Chiudi e annulla">✕</button>
                </div>
              </div>

              <div className="rte-ai-model">
                IA: {describeChoice(getAIChoice('summary'))}{isLocalChoice(getAIChoice('summary')) ? ' (locale)' : ' (cloud)'}
              </div>

              {isSummarizing && (
                <div className="rte-ai-loading" role="status">
                  <span className="rte-ai-spinner" />
                  <div>Sto riassumendo la nota... puoi continuare a lavorare.</div>
                  <button type="button" className="rte-ai-btn" onClick={closeSummaryPopup}>Annulla</button>
                </div>
              )}

              {!isSummarizing && summaryError && (
                <div className="rte-ai-error" role="alert">
                  <div>{summaryError}</div>
                  {summaryText === '' && editorRef.current?.innerText.trim() && (
                    <button type="button" className="rte-ai-btn" onClick={handleAISummary}>Riprova</button>
                  )}
                </div>
              )}

              {!isSummarizing && summaryText && (
                <>
                  {summaryTruncated && (
                    <div className="rte-ai-warning" role="alert">
                      Il riassunto è stato interrotto perché troppo lungo: potrebbe essere incompleto.
                    </div>
                  )}
                  <div
                    className="rte-ai-preview"
                    dangerouslySetInnerHTML={{ __html: renderAIMarkdown(summaryText) }}
                  />
                  <div className="rte-ai-actions">
                    <button type="button" className="rte-ai-btn" onClick={() => copyAIText(summaryText)}>
                      {aiCopied ? '✓ Copiato' : '📋 Copia'}
                    </button>
                    <button type="button" className="rte-ai-btn rte-ai-btn-primary" onClick={appendSummaryToNote}>
                      ⤵ Inserisci in fondo alla nota
                    </button>
                    <button type="button" className="rte-ai-btn" onClick={closeSummaryPopup}>Chiudi</button>
                  </div>
                </>
              )}
            </section>
          ))}
        </div>,
        document.body
      )}
      {/* Custom CRM Link/Folder Modal */}
      {linkModalParams && createPortal(
        <div
          className="link-modal-overlay"
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 11000, padding: '20px'
          }}
          onClick={(e) => { if (e.target === e.currentTarget) { cleanupCursorMarker(); setLinkModalParams(null); } }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              cleanupCursorMarker();
              setLinkModalParams(null);
            }
          }}
        >
          <div className="animate-scale-in" style={{
            backgroundColor: 'var(--bg-card)', borderRadius: '24px', padding: '32px',
            width: '100%', maxWidth: '480px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid var(--border-light)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
              <div style={{ fontSize: '1.5rem', width: '40px', height: '40px', background: 'var(--bg-hover)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {linkModalParams.type === 'url' ? '🔗' : '📁'}
              </div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {linkModalParams.type === 'url' ? 'Inserisci Link' : 'Collega Cartella'}
              </h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '28px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Nome visualizzato (Opzionale)
                </label>
                <input
                  type="text" className="input" value={linkInputName}
                  onChange={e => setLinkInputName(e.target.value)}
                  placeholder={linkModalParams.type === 'url' ? 'Es: Sito Cliente' : 'Es: Cartella Progetto'}
                  autoFocus={!!linkInputName}
                  onKeyDown={e => { if (e.key === 'Enter') handleApplyLink(); }}
                  style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-input)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {linkModalParams.type === 'url' ? 'URL' : 'Percorso Assoluto sul PC'}
                </label>
                <input
                  type="text" className="input" value={linkInputVal}
                  onChange={e => setLinkInputVal(e.target.value)}
                  placeholder={linkModalParams.type === 'url' ? 'https://...' : 'C:\\Lavori\\Cliente'}
                  autoFocus={!linkInputName}
                  onKeyDown={e => { if (e.key === 'Enter') handleApplyLink(); }}
                  style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-input)' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" style={{ padding: '10px 24px', borderRadius: '10px' }} onClick={() => { cleanupCursorMarker(); setLinkModalParams(null); }}>Annulla</button>
              <button className="btn btn-primary" style={{ padding: '10px 24px', borderRadius: '10px', fontWeight: 600 }} onClick={handleApplyLink} disabled={!linkInputVal.trim()}>
                Inserisci
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}


      {/* ── Note Link Modal Portal ── */}
      {showInternalLinkMenu === 'note' && createPortal(
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowInternalLinkMenu(null);
              setNoteSearchQuery('');
              setNoteSelectedIndex(0);
            }
          }}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.45)',
            backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 11000, padding: '20px'
          }}
        >
          <div
            className="animate-scale-in"
            style={{
              backgroundColor: 'var(--bg-card)', borderRadius: '20px',
              width: '100%', maxWidth: '560px', maxHeight: '75vh',
              boxShadow: '0 25px 60px -10px rgba(0, 0, 0, 0.4)',
              border: '1px solid var(--border-light)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden'
            }}
          >
            {/* Header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border-light)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                <div style={{
                  width: '38px', height: '38px',
                  background: 'var(--primary-ghost)', borderRadius: '10px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.15rem',
                  flexShrink: 0
                }}>📝</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>Collega Nota</h3>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Seleziona una nota da inserire nel testo</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setShowInternalLinkMenu(null); setNoteSearchQuery(''); setNoteSelectedIndex(0); }}
                  style={{
                    marginLeft: '4px', background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'var(--text-tertiary)', fontSize: '1.1rem', padding: '6px',
                    borderRadius: '8px', lineHeight: 1, display: 'flex', alignItems: 'center',
                    flexShrink: 0
                  }}
                >✕</button>
              </div>
              {/* Search bar */}
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                  fontSize: '0.9rem', color: 'var(--text-tertiary)', pointerEvents: 'none', userSelect: 'none'
                }}>🔍</span>
                <input
                  type="text"
                  autoFocus
                  placeholder="Cerca tra le note..."
                  value={noteSearchQuery}
                  onChange={(e) => { setNoteSearchQuery(e.target.value); setNoteSelectedIndex(0); }}
                  onKeyDown={(e) => {
                    const filtered = (allNotes || []).filter(n => {
                      if (!noteSearchQuery.trim()) return true;
                      const t = (n.text || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').toLowerCase();
                      return t.includes(noteSearchQuery.toLowerCase());
                    });
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setShowInternalLinkMenu(null); setNoteSearchQuery(''); setNoteSelectedIndex(0);
                    } else if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setNoteSelectedIndex(prev => Math.min(prev + 1, filtered.length - 1));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setNoteSelectedIndex(prev => Math.max(prev - 1, 0));
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      const note = filtered[noteSelectedIndex];
                      if (note) {
                        const rawText = (note.text || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
                        const snippet = rawText.substring(0, 30) || '(Nota)';
                        if (savedSelectionRef.current && editorRef.current) {
                          editorRef.current.focus();
                          const sel = window.getSelection();
                          sel.removeAllRanges();
                          sel.addRange(savedSelectionRef.current);
                        }
                        insertHtml(`<a href="#" data-internal-id="${note.id}" data-internal-type="note" class="internal-link" contenteditable="false" style="color:var(--primary);font-weight:600;text-decoration:none;background:var(--bg-hover);padding:2px 6px;border-radius:4px;display:inline-block;margin:2px;">📝 ${snippet}</a>&nbsp;`);
                        setShowInternalLinkMenu(null); setNoteSearchQuery(''); setNoteSelectedIndex(0);
                      }
                    }
                  }}
                  style={{
                    width: '100%', padding: '10px 12px 10px 38px',
                    borderRadius: '10px', border: '1px solid var(--border)',
                    background: 'var(--bg-input)', color: 'var(--text-primary)',
                    fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box',
                    fontFamily: 'var(--font)'
                  }}
                />
              </div>
            </div>
            {/* Notes list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
              {(() => {
                const filtered = (allNotes || []).filter(n => {
                  if (!noteSearchQuery.trim()) return true;
                  const t = (n.text || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').toLowerCase();
                  return t.includes(noteSearchQuery.toLowerCase());
                });
                if (filtered.length === 0) {
                  return (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-tertiary)' }}>
                      <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📭</div>
                      <div style={{ fontSize: '0.875rem' }}>
                        {noteSearchQuery ? 'Nessuna nota trovata per questa ricerca' : 'Nessuna nota disponibile'}
                      </div>
                    </div>
                  );
                }
                return filtered.map((n, idx) => {
                  const rawText = (n.text || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
                  const title = rawText.substring(0, 60) || '(Nota vuota)';
                  const preview = rawText.length > 60 ? rawText.substring(60, 130) + '...' : '';
                  const isSelected = idx === noteSelectedIndex;
                  const snippet = rawText.substring(0, 30) || '(Nota)';
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onMouseEnter={() => setNoteSelectedIndex(idx)}
                      onClick={() => {
                        if (savedSelectionRef.current && editorRef.current) {
                          editorRef.current.focus();
                          const sel = window.getSelection();
                          sel.removeAllRanges();
                          sel.addRange(savedSelectionRef.current);
                        }
                        insertHtml(`<a href="#" data-internal-id="${n.id}" data-internal-type="note" class="internal-link" contenteditable="false" style="color:var(--primary);font-weight:600;text-decoration:none;background:var(--bg-hover);padding:2px 6px;border-radius:4px;display:inline-block;margin:2px;">📝 ${snippet}</a>&nbsp;`);
                        setShowInternalLinkMenu(null); setNoteSearchQuery(''); setNoteSelectedIndex(0);
                      }}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                        width: '100%', padding: '10px 14px', margin: '2px 0',
                        border: 'none', borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
                        background: isSelected ? 'var(--primary-ghost)' : 'transparent',
                        outline: isSelected ? '1px solid var(--primary-light)' : 'none',
                        transition: 'background 0.12s ease',
                        fontFamily: 'var(--font)'
                      }}
                    >
                      <span style={{ fontWeight: 600, fontSize: '0.875rem', color: isSelected ? 'var(--primary)' : 'var(--text-primary)', marginBottom: preview ? '3px' : 0 }}>
                        {title}
                      </span>
                      {preview && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', lineHeight: 1.4 }}>{preview}</span>
                      )}
                    </button>
                  );
                });
              })()}
            </div>
            {/* Footer keyboard hint */}
            <div style={{
              padding: '10px 20px', borderTop: '1px solid var(--border-light)',
              display: 'flex', gap: '16px', alignItems: 'center',
              fontSize: '0.72rem', color: 'var(--text-tertiary)', background: 'var(--bg-input)'
            }}>
              <span>↑↓ naviga</span>
              <span>↵ inserisci</span>
              <span>Esc chiudi</span>
            </div>
          </div>
        </div>,
        document.body
      )}

      <div className="rte-main-layout" style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative', width: '100%' }}>
        <div className="rte-editor-wrapper" style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div
            ref={editorRef}
            className="rte-editor"
            contentEditable
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onKeyUp={(e) => {
              // Il caret si è spostato senza digitare: il menu comandi va riallineato (o chiuso)
              if (slashMenuParams && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) updateSlashMenu();
            }}
            onBlur={() => {
              if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
                debounceTimerRef.current = null;
                onChangeRef.current?.(getEditorHtml());
                pendingHtmlRef.current = null;
              }
            }}
            onClick={(e) => {
              handleEditorClick(e);
              if (slashMenuParams) updateSlashMenu();
            }}
            onPaste={handlePaste}
            onDrop={handleDrop}
            role="textbox"
            aria-multiline="true"
            aria-label="Testo della nota"
            data-placeholder="Scrivi una nota... (premi '/' per comandi, #nome; per ancore)"
          />

          {showInternalLinkMenu === 'file' && internalLinkPosition && (
            <div className="rte-dropdown" style={{ position: 'absolute', top: internalLinkPosition.top, left: internalLinkPosition.left, zIndex: 1000, maxHeight: '200px', overflowY: 'auto' }}>
              <div style={{ padding: '8px', fontWeight: 'bold', borderBottom: '1px solid var(--border-light)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Seleziona File da collegare</div>
              {allFiles && allFiles.length > 0 ? allFiles.map(f => (
                <button key={f.id} type="button" onClick={() => {
                  editorRef.current?.focus();
                  insertHtml(`<a href="#" data-internal-id="${f.id}" data-internal-type="file" class="internal-link" contenteditable="false" style="color:var(--primary);font-weight:600;text-decoration:none;background:var(--bg-hover);padding:2px 6px;border-radius:4px;display:inline-block;margin:2px;">📄 ${escapeHtml(f.name)}</a>&nbsp;`);
                  setShowInternalLinkMenu(null);
                  setInternalLinkPosition(null);
                }}>📄 {f.name}</button>
              )) : <div style={{ padding: '8px', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Nessun file disponibile</div>}
              <button type="button" style={{ color: 'var(--danger)', marginTop: '4px', borderTop: '1px solid var(--border-light)' }} onClick={() => { setShowInternalLinkMenu(null); setInternalLinkPosition(null); }}>Annulla</button>
            </div>
          )}

          {/* Note link menu is now a centered modal portal - see portal section above */}

          {slashMenuParams && (() => {
            const options = getSlashOptions();
            if (options.length === 0) return null;
            return (
              <div className="rte-slash-menu" style={{ top: slashMenuParams.top, left: slashMenuParams.left }}>
                <div className="rte-slash-title">Opzioni</div>
                {options.map((opt, idx) => (
                  opt.isSeparator ? (
                    <div key={opt.cmd} style={{ borderTop: '1px solid var(--border-light)', margin: '4px 8px' }} />
                  ) : (
                    <button
                      key={opt.cmd}
                      type="button"
                      className={idx === slashSelectedIndex ? 'active' : ''}
                      onClick={() => applySlashCommand(opt.cmd)}
                      onMouseEnter={() => setSlashSelectedIndex(idx)}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      <IconComponent name={opt.icon} size={16} />
                      <span>{opt.label}</span>
                    </button>
                  )
                ))}
              </div>
            );
          })()}
        </div>
      </div>

      <style>{`
        .rte-container {
          border: 2px solid var(--border);
          border-radius: var(--radius-md);
          overflow: hidden;
          transition: border-color var(--duration-fast);
        }

        .rte-container:focus-within {
          border-color: var(--primary-light);
          box-shadow: 0 0 0 4px var(--primary-ghost);
        }

        .rte-toolbar {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 4px;
          padding: 8px 16px;
          background: var(--bg-input);
          border-bottom: 1px solid var(--border-light);
          flex-wrap: wrap;
        }

        .rte-btn {
          border: none;
          background: transparent;
          padding: 8px 12px;
          border-radius: var(--radius-sm);
          cursor: pointer;
          font-family: var(--font);
          font-size: 0.875rem;
          color: var(--text-secondary);
          transition: all var(--duration-fast);
          line-height: 1;
          display: flex;
          align-items: center;
          gap: 4px;
          white-space: nowrap;
          min-height: 32px;
        }

        .rte-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        .rte-ai-spinner-sm {
          width: 14px;
          height: 14px;
          border-width: 2px;
        }

        .rte-btn.active {
          background: var(--primary-ghost);
          color: var(--primary);
        }

        .rte-btn:disabled {
          cursor: not-allowed;
          opacity: 0.6;
        }

        .rte-btn:disabled:hover {
          background: transparent;
        }

        .rte-btn:focus-visible {
          outline: 2px solid var(--primary-light);
          outline-offset: 1px;
        }

        /* ── Pannelli AI (strumenti di scrittura e riassunto) ── */
        /* Colonna a destra con i pannelli AI: niente sfondo scuro, il resto della pagina resta utilizzabile */
        .rte-ai-dock {
          position: fixed;
          top: 16px;
          right: 16px;
          /* sopra il pulsante tondo della chat (in basso a destra) */
          bottom: 96px;
          width: min(400px, calc(100vw - 32px));
          z-index: 10001;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          gap: 10px;
          pointer-events: none;
        }

        .rte-ai-side {
          pointer-events: auto;
          background: var(--bg-card);
          color: var(--text-primary);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 18px 18px 20px;
          box-shadow: var(--shadow-xl);
          overflow: auto;
          min-height: 0;
          flex: 1 1 auto;
          max-height: 100%;
          animation: rte-ai-slide-in 0.2s ease-out;
        }

        @keyframes rte-ai-slide-in {
          from { transform: translateX(24px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }

        .rte-ai-header-actions {
          display: flex;
          gap: 2px;
        }

        .rte-ai-side .rte-ai-grid {
          grid-template-columns: 1fr 1fr;
        }

        .rte-ai-side .rte-ai-tool {
          padding: 10px 8px;
          font-size: 0.8rem;
        }

        .rte-ai-side .rte-ai-actions {
          justify-content: flex-start;
        }

        /* Pannello ridotto: una pillola in basso a destra con lo stato della richiesta */
        .rte-ai-pill {
          pointer-events: auto;
          align-self: flex-end;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: var(--bg-card);
          color: var(--text-primary);
          font: inherit;
          font-size: 0.82rem;
          font-weight: 600;
          box-shadow: var(--shadow-lg);
          cursor: pointer;
        }

        .rte-ai-pill.ready {
          border-color: var(--success);
          color: var(--success);
        }

        .rte-ai-pill.failed {
          border-color: var(--danger);
          color: var(--danger);
        }

        .rte-ai-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--border-light);
        }

        .rte-ai-header h3 {
          margin: 0;
          font-size: 1.1rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .rte-ai-close {
          background: none;
          border: none;
          font-size: 1.25rem;
          cursor: pointer;
          color: var(--text-secondary);
          padding: 4px 8px;
          border-radius: var(--radius-sm);
        }

        .rte-ai-close:hover {
          background: var(--bg-hover);
        }

        .rte-ai-model {
          font-size: 0.72rem;
          color: var(--text-tertiary);
          margin: -8px 0 12px;
        }

        .rte-ai-label {
          font-size: 0.72rem;
          color: var(--text-tertiary);
          margin-bottom: 6px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .rte-ai-selected {
          background: var(--bg-input);
          padding: 12px 14px;
          border-radius: var(--radius-sm);
          margin-bottom: 16px;
          border: 1px solid var(--border-light);
          font-size: 0.85rem;
          line-height: 1.5;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .rte-ai-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
          margin-bottom: 16px;
        }

        .rte-ai-tool {
          padding: 12px;
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          background: var(--bg-card);
          color: var(--text-primary);
          font-family: var(--font);
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: background var(--duration-fast), border-color var(--duration-fast);
        }

        .rte-ai-tool:hover:not(:disabled) {
          background: var(--bg-hover);
        }

        .rte-ai-tool:disabled {
          cursor: not-allowed;
          opacity: 0.6;
        }

        .rte-ai-tool.active {
          border-color: var(--primary);
          background: var(--primary-ghost);
        }

        .rte-ai-translate {
          grid-column: span 2;
          padding: 6px 8px;
          cursor: default;
          justify-content: flex-start;
        }

        .rte-ai-translate button {
          border: none;
          background: transparent;
          font: inherit;
          color: inherit;
          cursor: pointer;
          padding: 6px 8px;
        }

        .rte-ai-translate button:disabled {
          cursor: not-allowed;
        }

        .rte-ai-translate select {
          flex: 1;
          padding: 6px 8px;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          background: var(--bg-input);
          color: var(--text-primary);
          font: inherit;
        }

        .rte-ai-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding: 20px;
          color: var(--text-secondary);
          font-size: 0.875rem;
        }

        .rte-ai-spinner {
          width: 28px;
          height: 28px;
          border: 3px solid var(--border);
          border-top-color: var(--primary);
          border-radius: 50%;
          animation: rte-ai-spin 0.8s linear infinite;
        }

        @keyframes rte-ai-spin {
          to { transform: rotate(360deg); }
        }

        .rte-ai-error,
        .rte-ai-warning {
          padding: 12px 14px;
          border-radius: var(--radius-sm);
          margin-bottom: 12px;
          font-size: 0.85rem;
          line-height: 1.5;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .rte-ai-error {
          background: var(--danger-bg);
          color: var(--danger);
        }

        .rte-ai-warning {
          background: rgba(241, 196, 15, 0.15);
          color: var(--text-primary);
        }

        .rte-ai-preview {
          background: var(--bg-input);
          padding: 14px 16px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-light);
          margin-bottom: 16px;
          font-size: 0.9rem;
          line-height: 1.6;
          max-height: 320px;
          overflow: auto;
        }

        .rte-ai-preview h1, .rte-ai-preview h2, .rte-ai-preview h3 {
          margin: 0.6em 0 0.3em;
          font-size: 1.05rem;
        }

        .rte-ai-preview p { margin: 0 0 0.6em; }
        .rte-ai-preview ul, .rte-ai-preview ol { margin: 0 0 0.6em; padding-left: 1.4em; }

        .rte-ai-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
          flex-wrap: wrap;
        }

        .rte-ai-btn {
          padding: 9px 16px;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          background: var(--bg-card);
          color: var(--text-primary);
          font-family: var(--font);
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          white-space: nowrap;
        }

        .rte-ai-btn:hover:not(:disabled) {
          background: var(--bg-hover);
        }

        .rte-ai-btn:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }

        .rte-ai-btn-primary {
          background: var(--primary);
          border-color: var(--primary);
          color: var(--text-inverse);
        }

        .rte-ai-btn-primary:hover:not(:disabled) {
          background: var(--primary-dark);
        }

        .rte-color-btn {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1rem;
        }

        .rte-separator {
          width: 1px;
          height: 16px;
          background: var(--border);
          margin: 0 4px;
        }

        .contextual-menu {
          position: fixed;
          background: var(--bg-card);
          border: 1px solid var(--border-light);
          border-radius: 6px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04);
          padding: 4px;
          z-index: 1000;
          min-width: 160px;
          max-width: 240px;
        }

        .contextual-menu button {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 6px 8px;
          border: none;
          background: transparent;
          text-align: left;
          font-size: 0.8125rem;
          color: var(--text-primary);
          cursor: pointer;
          border-radius: 4px;
          transition: all 0.15s ease;
          white-space: nowrap;
        }

        .contextual-menu button:hover {
          background: var(--bg-hover);
        }

        .contextual-menu .rte-separator {
          width: 100%;
          height: 1px;
          background: var(--border);
          margin: 4px 0;
        }

        .rte-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          background: var(--bg-card);
          border: 1px solid var(--border-light);
          box-shadow: var(--shadow-lg);
          border-radius: var(--radius-md);
          padding: 8px;
          z-index: 10;
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 120px;
        }

        .rte-dropdown button {
          background: transparent;
          border: none;
          text-align: left;
          padding: 6px 8px;
          border-radius: 4px;
          cursor: pointer;
          color: var(--text-primary);
        }

        .rte-dropdown button:hover {
          background: var(--bg-hover);
        }

        .rte-colors-grid {
          flex-direction: row;
          flex-wrap: wrap;
          width: 150px;
          gap: 6px;
          padding: 10px;
        }

        .rte-editor {
          min-height: 180px;
          max-height: 400px;
          overflow-y: auto;
          padding: 14px 16px;
          font-family: var(--font);
          font-size: 0.875rem;
          color: var(--text-primary);
          outline: none;
          line-height: 1.6;
          background: var(--bg-card);
          text-align: left;
          direction: ltr;
        }

        .rte-editor a {
          color: var(--primary);
          text-decoration: underline;
          cursor: pointer;
        }

        .rte-editor a:hover {
          color: var(--primary-light);
        }

        .rte-editor .rte-resizable-img {
          transition: max-width 0.2s ease;
          border: 2px solid transparent;
          border-radius: 6px;
        }

        .rte-editor .rte-resizable-img:hover {
          border-color: var(--primary-light);
          box-shadow: 0 0 0 3px var(--primary-ghost);
        }

        .rte-fullscreen {
          position: fixed;
          inset: 0;
          z-index: 10000;
          background: var(--bg-card);
          display: flex;
          flex-direction: column;
          border: none;
          border-radius: 0;
          overflow: hidden; /* Added to ensure only editor scrolls */
        }

        .rte-fullscreen .rte-editor {
          flex: 1;
          max-height: calc(100vh - 80px); /* Leave space for toolbar */
          padding: 40px;
          font-size: 1.125rem;
          max-width: 900px;
          margin: 0 auto;
          width: 100%;
          overflow-y: auto !important;
          -webkit-overflow-scrolling: touch;
        }

        .rte-fullscreen .rte-toolbar {
          padding: 12px 20px;
          justify-content: center;
          background: var(--bg-card);
          border-bottom: 1px solid var(--border-light);
        }

        .rte-editor:empty::before {
          content: attr(data-placeholder);
          color: var(--text-tertiary);
          pointer-events: none;
        }

        .rte-editor ul, .rte-editor ol {
          padding-left: 20px;
          margin: 4px 0;
        }

        .rte-editor b, .rte-editor strong { font-weight: 600; }

        .rte-slash-menu {
          position: absolute;
          background: var(--bg-card);
          border: 1px solid var(--border-light);
          box-shadow: var(--shadow-lg);
          border-radius: var(--radius-md);
          padding: 8px;
          z-index: 20;
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 160px;
        }

        .rte-slash-title {
          font-size: 0.7rem;
          color: var(--text-tertiary);
          font-weight: 600;
          text-transform: uppercase;
          margin-bottom: 4px;
          padding: 0 8px;
        }

        .rte-slash-menu button {
          background: transparent;
          border: none;
          text-align: left;
          padding: 6px 8px;
          border-radius: 4px;
          cursor: pointer;
          color: var(--text-primary);
          display: flex;
          align-items: center;
          font-family: var(--font);
          font-size: 0.875rem;
        }

        .rte-slash-menu button.active,
        .rte-slash-menu button:hover {
          background: var(--bg-input);
        }

        .todo-item {
          display: flex;
          align-items: flex-start;
          margin-bottom: 4px;
        }

        .rte-editor blockquote {
          border-left: 4px solid var(--primary);
          background: var(--bg-input);
          padding: 8px 16px;
          margin: 8px 0 16px 0;
          font-style: italic;
          color: var(--text-secondary);
          border-radius: 0 4px 4px 0;
        }

        .rte-editor pre {
          background: #f8f9fa;
          border: 1px solid var(--border-light);
          padding: 12px;
          border-radius: 6px;
          white-space: pre-wrap !important;
          word-break: break-all !important;
          font-family: 'Consolas', 'Courier New', Courier, monospace !important;
          margin: 8px 0;
          color: #d63384 !important;
        }

        .rte-editor code {
          font-family: 'Consolas', 'Courier New', Courier, monospace !important;
          white-space: pre-wrap !important;
          word-break: break-all !important;
          color: #d63384 !important;
          font-size: 0.9em;
        }

        /* Anchor styles */
        .rte-anchor {
          color: var(--primary) !important;
          background: var(--primary-ghost);
          padding: 2px 6px;
          border-radius: 4px;
          font-weight: 600;
          text-decoration: none !important;
          cursor: default;
          user-select: none;
        }

        /* Unified Hover Index Container - Floats on the Left Side of editor box */
        .rte-hover-index-container {
          position: absolute;
          left: -40px; /* Float completely outside the editor border on the left side */
          top: 80px;
          display: flex;
          flex-direction: row;
          align-items: center; /* THIS CENTERS THE SIDEBAR RELATIVE TO THE PILLS */
          gap: 12px;
          z-index: 1000;
          pointer-events: auto;
        }

        .rte-fullscreen .rte-hover-index-container {
          position: fixed;
          left: 40px; /* Floating on the far left side of the viewport in fullscreen */
          top: 50%;
          transform: translateY(-50%);
        }

        /* Premium Table of Contents Sidebar styles (matching Photo 2) */
        .rte-toc-sidebar {
          width: 280px;
          min-width: 250px;
          background: #ffffff; /* Clean white background (matching Photo 2) */
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 16px;
          padding: 20px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.06); /* Premium micro-shadow */
          display: flex;
          flex-direction: column;
          gap: 12px;
          overflow-y: auto;
          max-height: 400px;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          
          /* Hover animation states */
          opacity: 0;
          pointer-events: none;
          transform: translate(-12px, -50%); /* Start hidden and vertically centered */
          
          /* Position right next to the pills */
          position: absolute;
          left: 40px;
          top: 50%; /* Center vertically relative to the container */
        }

        [data-theme="dark"] .rte-toc-sidebar {
          background: rgba(255, 255, 255, 0.96) !important; /* Keep it light colored! "colori chiari non scuri" */
          border-color: rgba(0, 0, 0, 0.1) !important;
        }

        /* Slide open when container is hovered */
        .rte-hover-index-container:hover .rte-toc-sidebar {
          opacity: 1;
          pointer-events: auto;
          transform: translate(0, -50%); /* Pop out horizontally while staying centered vertically */
        }

        .rte-toc-header {
          font-size: 0.8rem;
          font-weight: 700;
          color: #888888;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.06);
          padding-bottom: 8px;
          margin-bottom: 4px;
        }

        .rte-toc-list {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .rte-toc-item {
          display: block;
          width: 100%;
          text-align: left;
          border: none;
          background: transparent;
          padding: 6px 12px;
          border-radius: 8px;
          font-family: var(--font);
          font-size: 0.875rem;
          color: #4b5563;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          line-height: 1.4;
          white-space: normal;
          word-break: break-word;
        }

        .rte-toc-item:hover {
          background: rgba(0, 0, 0, 0.04);
          color: #111827;
        }

        .rte-toc-item.active {
          background: #f3f4f6 !important; /* Soft grey pill background matching Photo 2 */
          color: #111827 !important; /* Elegant dark text */
          font-weight: 700 !important;
        }

        [data-theme="dark"] .rte-toc-item {
          color: #4b5563;
        }

        [data-theme="dark"] .rte-toc-item:hover {
          background: rgba(0, 0, 0, 0.06);
          color: #111827;
        }

        [data-theme="dark"] .rte-toc-item.active {
          background: #e5e7eb !important;
          color: #111827 !important;
        }

        .rte-toc-item.indent-h2 {
          padding-left: 20px;
          font-size: 0.825rem;
        }

        .rte-toc-item.indent-h3 {
          padding-left: 32px;
          font-size: 0.775rem;
        }

        .rte-toc-item.link-style {
          color: #2563eb !important; /* Vibrant blue links from Photo 2 */
          text-decoration: none;
        }

        .rte-toc-item.link-style:hover {
          color: #1d4ed8 !important;
          text-decoration: underline;
        }

        /* Minimalist Pill Scroll Mini-Map styles (matching Photo 1) */
        .rte-minimal-pill-nav {
          display: flex;
          flex-direction: column;
          gap: 6px;
          background: rgba(255, 255, 255, 0.85); /* Light translucent glassmorphism */
          padding: 10px 6px;
          border-radius: 16px;
          backdrop-filter: blur(8px);
          border: 1px solid rgba(0, 0, 0, 0.08);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
          pointer-events: auto;
          align-items: center;
        }

        [data-theme="dark"] .rte-minimal-pill-nav {
          background: rgba(255, 255, 255, 0.92) !important;
          border-color: rgba(0, 0, 0, 0.1) !important;
        }

        .rte-pill-indicator {
          width: 14px;
          height: 3px;
          background: rgba(0, 0, 0, 0.15); /* Soft dark grey inactive bars on light bg */
          border-radius: 2px;
          cursor: pointer;
          transition: all 0.2s ease-in-out;
          position: relative;
        }

        .rte-pill-indicator:hover {
          background: rgba(0, 0, 0, 0.5);
          width: 22px;
        }

        .rte-pill-indicator.active {
          background: var(--primary) !important; /* Sleek primary active indicator */
          width: 26px !important;
          box-shadow: 0 0 6px rgba(99, 102, 241, 0.5);
        }

        /* Hover Tooltips for Pill Nav */
        .rte-pill-tooltip {
          position: absolute;
          left: 32px; /* Opens to the right next to pills */
          top: 50%;
          transform: translateY(-50%) scale(0.9);
          background: #ffffff;
          color: #1f2937;
          border: 1px solid rgba(0, 0, 0, 0.08);
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 0.725rem;
          font-weight: 600;
          white-space: nowrap;
          opacity: 0;
          pointer-events: none;
          transition: all 0.15s ease-in-out;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
          z-index: 1100;
        }

        .rte-pill-indicator:hover .rte-pill-tooltip {
          opacity: 1;
          transform: translateY(-50%) scale(1);
        }

        .rte-toc-sidebar::-webkit-scrollbar {
          width: 6px;
        }

        .rte-toc-sidebar::-webkit-scrollbar-track {
          background: transparent;
        }

        .rte-toc-sidebar::-webkit-scrollbar-thumb {
          background: var(--border);
          border-radius: 3px;
        }

        /* Todo checkbox styles */
        .rte-editor input[type="checkbox"] {
          width: 16px;
          height: 16px;
          margin-right: 8px;
          cursor: pointer;
          accent-color: var(--primary);
        }

        /* Fullscreen layout adjustments */
        .rte-fullscreen .rte-main-layout {
          flex: 1;
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
          gap: 24px;
        }

        .rte-fullscreen .rte-toc-sidebar {
          max-height: calc(100vh - 120px);
        }
      `}</style>
    </div>
  );

  return isFullScreen ? createPortal(editorContent, document.body) : editorContent;
}

const editorStyles = `
  .internal-link, .folder-internal-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: var(--primary-ghost);
    color: var(--primary) !important;
    border: 1px solid var(--primary-light);
    border-radius: 4px;
    padding: 1px 6px;
    font-weight: 600;
    font-size: 0.85rem;
    text-decoration: none !important;
    margin: 0 2px;
    cursor: pointer;
    transition: all 0.2s;
    user-select: none;
    -webkit-user-drag: none;
  }
  .internal-link:hover, .folder-internal-link:hover {
    background: var(--primary-light);
    color: #fff !important;
  }
  
  /* Anchor tag styling */
  .rte-anchor-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: var(--primary-ghost);
    color: var(--primary) !important;
    border: 1px solid var(--primary-light);
    border-radius: 4px;
    padding: 2px 8px;
    font-weight: 600;
    font-size: 0.85rem;
    text-decoration: none !important;
    margin: 0 2px;
    cursor: default;
    user-select: none;
    -webkit-user-drag: none;
  }
  
  /* Todo checkbox styling in editor */
  .todo-item {
    display: flex;
    align-items: center;
    margin-bottom: 4px;
  }
  .rte-editor input[type="checkbox"] {
    width: 16px;
    height: 16px;
    margin-right: 8px;
    cursor: pointer;
    accent-color: var(--primary);
    vertical-align: middle;
  }
`;

if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = editorStyles;
  document.head.appendChild(style);
}

