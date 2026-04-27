import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import IconComponent from './IconComponent';
import { aiTextService } from '../utils/aiTextService';

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

  // Reset initial value when the component receives a fundamentally new value
  // (e.g. switching notes)
  useEffect(() => {
    initialValueRef.current = value || '';
    isDirtyRef.current = false;
    if (onDirtyChange) onDirtyChange(false);
  }, []); // Only on mount

  // Gestione selezione testo per menu contestuale
  useEffect(() => {
    const handleSelection = (e) => {
      // Non riaprire il menu se abbiamo appena formattato
      if (preventMenuReopenRef.current) return;
      
      // Solo se l'evento è dentro l'editor
      if (!editorRef.current || !editorRef.current.contains(e.target)) return;
      
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

  // Chiudi tutti i menu quando si clicca fuori
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.rte-btn') && !e.target.closest('.rte-dropdown') && !e.target.closest('.contextual-menu')) {
        setTextSelection(null);
      }
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
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
      const success = document.execCommand(format, false, value);
      if (success) {
        handleInput();
      } else {
        console.warn(`Command ${format} was not successful`);
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
      console.log('Selection saved:', savedSelectionRef.current.toString());
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
  
  // Gestione AI Writing Tools
  const handleAITool = async (tool) => {
    if (!selectedText) return;
    
    setAiLoading(true);
    setAiResult('');
    
    try {
      let result;
      switch (tool) {
        case 'rewrite':
          result = await aiTextService.rewrite(selectedText);
          break;
        case 'summarize':
          result = await aiTextService.summarize(selectedText);
          break;
        case 'improve':
          result = await aiTextService.improve(selectedText);
          break;
        case 'expand':
          result = await aiTextService.expand(selectedText);
          break;
        case 'translate':
          const targetLang = prompt('In quale lingua vuoi tradurre? (es: inglese, francese, spagnolo):');
          if (targetLang) {
            result = await aiTextService.translate(selectedText, targetLang);
          } else {
            setAiLoading(false);
            return;
          }
          break;
        case 'ideas':
          result = await aiTextService.generateIdeas(selectedText);
          break;
        case 'grammar':
          result = await aiTextService.fixGrammar(selectedText);
          break;
        default:
          throw new Error('Strumento non riconosciuto');
      }
      
      setAiResult(result);
    } catch (error) {
      console.error('AI Error:', error);
      setAiResult('Errore: ' + error.message);
    } finally {
      setAiLoading(false);
    }
  };
  
  const applyAIResult = () => {
    if (!aiResult || !aiSelectionRef.current) return;
    
    // Salva una copia della selezione e del risultato
    const selectionToRestore = aiSelectionRef.current.cloneRange();
    const resultText = aiResult;
    
    // Chiudi menu AI
    setShowAIMenu(false);
    setAiResult('');
    setSelectedText('');
    
    // Usa requestAnimationFrame per assicurarsi che il DOM sia aggiornato
    requestAnimationFrame(() => {
      // Focus sull'editor
      editorRef.current?.focus();
      
      // Ripristina la selezione
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(selectionToRestore);
      
      // Inserisci il risultato AI
      document.execCommand('insertText', false, resultText);
      handleInput();
      
      // Reset ref
      aiSelectionRef.current = null;
    });
  };
  
  const closeAIMenu = () => {
    setShowAIMenu(false);
    setAiResult('');
    setSelectedText('');
  };

  // AI Summary popup state
  const [showSummaryPopup, setShowSummaryPopup] = useState(false);
  const [summaryText, setSummaryText] = useState('');

  // Handle AI Summary for entire note - shows popup instead of replacing
  const handleAISummary = async () => {
    if (!editorRef.current) return;
    
    const fullText = editorRef.current.innerText;
    if (!fullText.trim()) {
      alert('La nota è vuota. Scrivi qualcosa prima di riassumere.');
      return;
    }

    setIsSummarizing(true);
    setSummaryText('');
    
    try {
      // Leggi il modello specifico per i riassunti dalle impostazioni
      const settings = JSON.parse(localStorage.getItem('upersite_settings') || '{}');
      const summaryModel = settings.aiSummaryModel || null;
      
      const summary = await aiTextService.summarize(fullText, summaryModel);
      setSummaryText(summary);
      setShowSummaryPopup(true);
    } catch (error) {
      console.error('AI Summary Error:', error);
      alert('Errore durante il riassunto: ' + error.message);
    } finally {
      setIsSummarizing(false);
    }
  };

  // Convert markdown to HTML for summary popup
  const renderMarkdown = (text) => {
    if (!text) return '';
    
    let html = text
      // Bold: **text** or __text__
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.*?)__/g, '<strong>$1</strong>')
      // Italic: *text* or _text_
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/_(.*?)_/g, '<em>$1</em>')
      // Headers
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      // Unordered lists
      .replace(/^\* (.*$)/gim, '<li>$1</li>')
      .replace(/^- (.*$)/gim, '<li>$1</li>')
      // Ordered lists
      .replace(/^\d+\. (.*$)/gim, '<li>$1</li>')
      // Line breaks
      .replace(/\n/g, '<br>');
    
    // Wrap lists
    html = html.replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>');
    // Fix nested lists
    html = html.replace(/<\/ul><ul>/g, '');
    
    return html;
  };

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


  // IntersectionObserver to track active anchor during scrolling - TEMPORARILY DISABLED
  // useEffect(() => {
  //   if (!editorRef.current || anchors.length === 0) return;
  //   
  //   const observer = new IntersectionObserver(
  //     (entries) => {
  //       entries.forEach((entry) => {
  //         if (entry.isIntersecting) {
  //           // Find the anchor corresponding to this element
  //           const anchor = anchors.find(a => a.element === entry.target);
  //           if (anchor) {
  //             setActiveAnchorId(anchor.id);
  //           }
  //         }
  //       });
  //     },
  //     {
  //       root: editorRef.current,
  //       threshold: 0.5,
  //       rootMargin: '-10% 0px -10% 0px'
  //     }
  //   );
  //   
  //   // Observe all anchor elements
  //   anchors.forEach((anchor) => {
  //     if (anchor.element) {
  //       observer.observe(anchor.element);
  //     }
  //   });
  //   
  //   return () => observer.disconnect();
  // }, [anchors]);

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

  
  const ContextualMenu = () => {
    if (!textSelection) return null;
    
    // Salva la selezione quando il menu si apre
    useEffect(() => {
      saveSelection();
    }, []);

    // In fullscreen, posiziona relativamente all'editor wrapper
    const menuStyle = isFullScreen ? {
      position: 'absolute',
      left: `${textSelection.position.x}px`,
      top: `${textSelection.position.y}px`,
      zIndex: 1000
    } : {
      position: 'fixed',
      left: `${textSelection.position.x}px`,
      top: `${textSelection.position.y}px`,
      zIndex: 1000
    };

    const MenuComponent = (
      <div 
        className="contextual-menu animate-scale-in"
        style={menuStyle}
      >
        <button type="button" onMouseDown={(e) => handleMenuButtonMouseDown(e, () => applyTextFormat('bold'))}>
          <IconComponent name="bold" /> Grassetto
        </button>
        <button type="button" onMouseDown={(e) => handleMenuButtonMouseDown(e, () => applyTextFormat('italic'))}>
          <IconComponent name="italic" /> Corsivo
        </button>
        <button type="button" onMouseDown={(e) => handleMenuButtonMouseDown(e, () => applyTextFormat('underline'))}>
          <IconComponent name="underline" /> Sottolineato
        </button>
        <div className="rte-separator" />
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
        
        <button type="button" onMouseDown={(e) => handleMenuButtonMouseDown(e, () => {
          const url = prompt('Inserisci URL:');
          if (url) {
            applyTextFormat('createLink', url);
          }
        })}>
          <IconComponent name="link" /> Aggiungi link
        </button>
        <button type="button" onMouseDown={(e) => handleMenuButtonMouseDown(e, () => applyTextFormat('removeFormat'))}>
          ✕ Rimuovi formattazione
        </button>
        <div className="rte-separator" />
        <button type="button" onMouseDown={(e) => handleMenuButtonMouseDown(e, () => {
          // Apri menu AI
          const selection = window.getSelection();
          const text = selection.toString().trim();
          if (text) {
            setSelectedText(text);
            // Save selection to ref for later use
            if (selection.rangeCount > 0) {
              aiSelectionRef.current = selection.getRangeAt(0).cloneRange();
            }
            setShowAIMenu(true);
            setTextSelection(null); // Chiudi menu contestuale
          }
        })}>
          <IconComponent name="sparkles" /> AI
        </button>
      </div>
    );

    // In fullscreen renderizza dentro l'editor wrapper, altrimenti nel body
    return isFullScreen ? MenuComponent : createPortal(MenuComponent, document.body);
  };

  // Only update innerHTML if it completely differs from external value AND we are not actively typing in it.
  useEffect(() => {
    if (pendingHtmlRef.current !== null) return;
    
    if (editorRef.current && value !== editorRef.current.innerHTML) {
      if (document.activeElement !== editorRef.current) {
        editorRef.current.innerHTML = value || '';
      }
    }
  }, [value]);

  // Sync innerHTML when toggling fullscreen to prevent content loss due to re-mounting
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = value || '';
    }
    // Lock body scroll in fullscreen
    if (isFullScreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isFullScreen]);

  const exec = (cmd, val = null) => {
    editorRef.current?.focus();
    
    // Special handling for formatBlock to ensure it works
    if (cmd === 'formatBlock') {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const selectedText = range.toString();
        
        // If nothing is selected, just apply the format
        if (!selectedText) {
          document.execCommand(cmd, false, val);
        } else {
          // For selected text, ensure proper formatting
          document.execCommand(cmd, false, val);
        }
      } else {
        document.execCommand(cmd, false, val);
      }
    } else {
      document.execCommand(cmd, false, val);
    }
    
    handleInput();
    setShowColors(false);
    setShowHeadings(false);
    setShowAlignment(false);
  };

  const insertHtml = (html) => {
    exec('insertHTML', html);
  };

  const handleInput = () => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    
    pendingHtmlRef.current = html;

    // Update dirty state
    const dirty = html !== initialValueRef.current;
    if (dirty !== isDirtyRef.current) {
      isDirtyRef.current = dirty;
      if (onDirtyChange) onDirtyChange(dirty);
    }

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      onChange(html);
      pendingHtmlRef.current = null;
    }, 400);

    // Slash menu logic
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    try {
      const range = sel.getRangeAt(0);
      const node = sel.anchorNode;

      if (node && node.nodeType === Node.TEXT_NODE) {
        const textParam = node.textContent.substring(0, range.startOffset);
        const match = textParam.match(/(?:^|\n)(?:\/)([\\w]*)$/);
        if (match) {
          const rect = range.getBoundingClientRect();
          // Use the relative wrapper for accurate positioning
          const wrapperRect = editorRef.current.parentElement.getBoundingClientRect();
          setSlashMenuParams({
            top: rect.bottom - wrapperRect.top + 5,
            left: rect.left - wrapperRect.left,
            filter: match[1].toLowerCase()
          });
          return;
        }
      }
    } catch (e) {
      // Ignore selection errors
    }
    setSlashMenuParams(null);
    setSlashSelectedIndex(0);
  };

  const closeSlashMenu = () => setSlashMenuParams(null);

  const applySlashCommand = (cmd) => {
    // Delete the slash trigger text
    const sel = window.getSelection();
    if (sel.rangeCount && slashMenuParams) {
      const range = sel.getRangeAt(0);
      const textNode = sel.anchorNode;
      const textParam = textNode.textContent.substring(0, range.startOffset);
      const match = textParam.match(/(?:^|\n)(?:\/)([\\w]*)$/);
      if (match) {
        range.setStart(textNode, range.startOffset - match[0].length);
        range.deleteContents();
      }
    }

    // For link_file and link_note, use slash menu position if available (it works correctly)
    // Otherwise fall back to cursor position calculation
    if (cmd === 'link_file' || cmd === 'link_note') {
      if (slashMenuParams) {
        // Reuse the working slash menu position
        setInternalLinkPosition({
          top: slashMenuParams.top,
          left: slashMenuParams.left
        });
      } else {
        // Fallback to cursor position
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

    closeSlashMenu();

    if (cmd === 'highlight') exec('hiliteColor', '#F1C40F');
    else if (cmd === 'code') insertHtml('<pre style="background:#f4f5f9;padding:10px;border-radius:4px;"><code>Codice...</code></pre><br>');
    else if (cmd === 'divider') insertHtml('<hr><br>');
    else if (cmd === 'link') {
      const url = prompt('Inserisci URL:');
      if (url) {
        insertHtml(`<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>&nbsp;`);
      }
    } else if (cmd === 'link_file') {
      setShowInternalLinkMenu('file');
    } else if (cmd === 'link_note') {
      setShowInternalLinkMenu('note');
    } else if (cmd === 'image') {
      imageInputRef.current?.click();
    } else if (cmd === 'link_folder') {
      const path = prompt('Inserisci il percorso assoluto della cartella (es: C:\\Lavori\\Cliente):');
      if (path && path.trim()) {
        const name = path.split(/[\\\/]/).filter(Boolean).pop() || path;
        insertHtml(`<a href="#" class="folder-internal-link" data-path="${path.replace(/\\/g, '\\\\')}" contenteditable="false" style="color:var(--primary);font-weight:600;text-decoration:none;background:var(--bg-hover);padding:2px 6px;border-radius:4px;display:inline-block;margin:2px;cursor:pointer;">📁 ${name}</a>&nbsp;`);
      }
    }
  };

  const getSlashOptions = () => {
    if (!slashMenuParams) return [];
    return [
      { cmd: 'highlight', label: 'Evidenzia', icon: '🖍' },
      { cmd: 'code', label: 'Blocco Codice', icon: '💻' },
      { cmd: 'divider', label: 'Separatore', icon: '➖' },
      { cmd: 'link', label: 'Link Esterno', icon: '🔗' },
      { cmd: 'link_note', label: 'Collega Nota', icon: '📝' },
      { cmd: 'link_folder', label: 'Collega Cartella Locale', icon: '🗂️' },
      { cmd: 'image', label: 'Immagine', icon: '🖼️' }
    ].filter(o => o.label.toLowerCase().includes(slashMenuParams.filter) || o.cmd.includes(slashMenuParams.filter));
  };

  const handleKeyDown = (e) => {
    if (slashMenuParams) {
      const options = getSlashOptions();
      if (e.key === 'Escape') {
        closeSlashMenu();
        e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashSelectedIndex(prev => (prev + 1) % options.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashSelectedIndex(prev => (prev - 1 + options.length) % options.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (options[slashSelectedIndex]) {
          applySlashCommand(options[slashSelectedIndex].cmd);
        }
      }
    }
  };

  const handleFileImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      if (file.name.endsWith('.csv')) {
        const rows = text.split('\n').filter(r => r.trim()).map(r => r.split(','));
        let tableHtml = '<table border="1" style="border-collapse:collapse;width:100%;margin-bottom:1em;">';
        rows.forEach((row, i) => {
          tableHtml += '<tr>';
          row.forEach(cell => {
            tableHtml += i === 0 ? `<th style="padding:4px 8px;background:#f4f5f9;">${cell}</th>` : `<td style="padding:4px 8px;">${cell}</td>`;
          });
          tableHtml += '</tr>';
        });
        tableHtml += '</table><br>';
        insertHtml(tableHtml);
      } else if (file.name.endsWith('.md')) {
        // Very basic markdown conversion for demonstration (production should use marked.js)
        let html = text
          .replace(/^### (.*$)/gim, '<h3>$1</h3>')
          .replace(/^## (.*$)/gim, '<h2>$1</h2>')
          .replace(/^# (.*$)/gim, '<h1>$1</h1>')
          .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>')
          .replace(/\*(.*)\*/gim, '<i>$1</i>')
          .replace(/\n\n/gim, '<br><br>');
        insertHtml(html + '<br>');
      } else {
        // txt, html
        insertHtml(text + '<br>');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Seleziona un file immagine.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('Immagine troppo grande (max 10MB).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
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
        ctx.drawImage(img, 0, 0, width, height);

        const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        editorRef.current?.focus();
        insertHtml(`<img src="${resizedDataUrl}" alt="Immagine" style="max-width:100%;height:auto;border-radius:6px;margin:8px 0;cursor:pointer;" class="rte-resizable-img" /><br>`);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
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
    URL.revokeObjectURL(url);
  };

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
    downloadFile(text.trim(), 'nota_upersite.txt', 'text/plain');
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

    downloadFile(md.trim(), 'nota_upersite.md', 'text/markdown');
  };

  // Make links clickable (open in new tab) and handle image resizing on click
  const handleEditorClick = (e) => {
    const target = e.target;

    // Handle internal link clicks
    if (target.tagName === 'A' && (target.classList.contains('internal-link') || target.classList.contains('folder-internal-link'))) {
      e.preventDefault();
      const id = target.getAttribute('data-internal-id');
      const type = target.getAttribute('data-internal-type');
      
      // If it's a folder-internal-link with an onclick, the onclick will handle it (copying the path)
      // If it's an internal-link with data-internal-type="folder-nav", we call the handler
      if (onInternalLinkClick && (id || type)) {
        onInternalLinkClick(id, type);
      } else if (target.classList.contains('folder-internal-link')) {
        const path = target.getAttribute('data-path');
        if (path && window.electronAPI) {
          window.electronAPI.openPath(path).catch(err => {
            navigator.clipboard.writeText(path);
            alert('Errore: ' + err.message + '. Percorso copiato.');
          });
        }
      }
      return;
    }

    // Handle link clicks - open in new tab
    if (target.tagName === 'A' && target.href) {
      e.preventDefault();
      window.open(target.href, '_blank', 'noopener,noreferrer');
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
  const handlePaste = useCallback((e) => {
    // After paste, fix any links without target
    setTimeout(() => {
      if (!editorRef.current) return;
      const links = editorRef.current.querySelectorAll('a:not([target])');
      links.forEach(link => {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
      });
      handleInput();
    }, 0);
  }, []);

  const editorContent = (
    <div className={`rte-container ${isFullScreen ? 'rte-fullscreen' : ''}`}>
      <div className="rte-toolbar">
        <button type="button" className="rte-btn" onClick={() => fileInputRef.current?.click()} title="Importa File (.txt, .md, .html, .csv)">
          <IconComponent name="import" /> Importa
        </button>
        <button type="button" className="rte-btn" onClick={exportAsTXT} title="Esporta come .txt">
          <IconComponent name="txt" /> TXT
        </button>
        <button type="button" className="rte-btn" onClick={exportAsMD} title="Esporta come .md">
          <IconComponent name="md" /> MD
        </button>
        
        {/* AI Summary Button */}
        <button 
          type="button" 
          className="rte-btn" 
          onClick={handleAISummary} 
          disabled={isSummarizing}
          title={isSummarizing ? 'Riassunto in corso...' : 'Riassunto AI'}
          style={{ color: isSummarizing ? 'var(--text-tertiary)' : 'var(--primary)' }}
        >
          <IconComponent name="brain" /> 
          {isSummarizing ? '...' : 'AI'}
        </button>
        
        <input ref={fileInputRef} type="file" accept=".txt,.md,.html,.csv" style={{ display: 'none' }} onChange={handleFileImport} />

        <div className="rte-separator" />

        <button type="button" className="rte-btn" onClick={() => exec('bold')} title="Grassetto">
          <IconComponent name="bold" />
        </button>
        <button type="button" className="rte-btn" onClick={() => exec('italic')} title="Corsivo">
          <IconComponent name="italic" />
        </button>
        <button type="button" className="rte-btn" onClick={() => exec('underline')} title="Sottolineato">
          <IconComponent name="underline" />
        </button>
        <button type="button" className="rte-btn" onClick={() => exec('strikeThrough')} title="Barrato">
          <s>S</s>
        </button>
        <div className="rte-separator" />
        <button type="button" className="rte-btn" onClick={() => exec('insertUnorderedList')} title="Lista puntata">
          <IconComponent name="listUnordered" />
        </button>
        <button type="button" className="rte-btn" onClick={() => exec('insertOrderedList')} title="Lista numerata">
          <IconComponent name="listOrdered" />
        </button>
        <div className="rte-separator" />

        {/* Added Slash-style commands to toolbar */}
        <button type="button" className="rte-btn" onClick={() => applySlashCommand('code')} title="Blocco Codice">
          <IconComponent name="code" />
        </button>
        <button type="button" className="rte-btn" onClick={() => applySlashCommand('link')} title="Inserisci Link Esterno">
          <IconComponent name="link" />
        </button>
        <button type="button" className="rte-btn" onClick={() => imageInputRef.current?.click()} title="Inserisci Immagine">
          <IconComponent name="image" />
        </button>
        <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />

        {/* Headings */}
        <div style={{ position: 'relative' }}>
          <button type="button" className="rte-btn" onClick={() => setShowHeadings(!showHeadings)} title="Titolo">
            T▾
          </button>
          {showHeadings && (
            <div className="rte-dropdown">
              <button type="button" onClick={() => exec('formatBlock', 'H1')} style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>Titolo 1</button>
              <button type="button" onClick={() => exec('formatBlock', 'H2')} style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>Titolo 2</button>
              <button type="button" onClick={() => exec('formatBlock', 'H3')} style={{ fontSize: '0.9375rem', fontWeight: 'bold' }}>Titolo 3</button>
              <button type="button" onClick={() => exec('formatBlock', 'P')} style={{ fontSize: '0.8125rem' }}>Normale</button>
            </div>
          )}
        </div>

        {/* Colors */}
        <div style={{ position: 'relative' }}>
          <button type="button" className="rte-btn" onClick={() => setShowColors(!showColors)} title="Colore Testo">
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
                />
              ))}
            </div>
          )}
        </div>

        {/* Alignment */}
        <div style={{ position: 'relative' }}>
          <button type="button" className="rte-btn" onClick={() => setShowAlignment(!showAlignment)} title="Allineamento">
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

        <button type="button" className="rte-btn" onClick={() => setIsFullScreen(!isFullScreen)} title="Espandi a pieno schermo" style={{ fontWeight: 'bold' }}>
          {isFullScreen ? '↙ Piccoli' : '⛶ Pieno Schermo'}
        </button>
      </div>

      {/* Menu contestuale per selezione testo */}
      <ContextualMenu />
      
      {/* AI Writing Tools Modal */}
      {showAIMenu && createPortal(
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000
          }}
          onClick={(e) => e.stopPropagation()} // Previene chiusura al click fuori
        >
          <div 
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              padding: '24px',
              minWidth: '520px',
              maxWidth: '680px',
              maxHeight: '85vh',
              overflow: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid #e5e7eb'
            }}
          >
            {/* Header con X per chiudere */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
              paddingBottom: '16px',
              borderBottom: '1px solid var(--border-light)'
            }}>
              <h3 style={{ margin: 0, color: '#1f2937', fontSize: '1.25rem', fontWeight: 600 }}>
                <IconComponent name="sparkles" /> Strumenti AI
              </h3>
              <button
                onClick={closeAIMenu}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#6b7280',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.background = '#f3f4f6'}
                onMouseLeave={(e) => e.target.style.background = 'transparent'}
              >
                ✕
              </button>
            </div>
            
            {/* Testo selezionato */}
            <div style={{
              backgroundColor: '#f9fafb',
              padding: '12px 16px',
              borderRadius: '8px',
              marginBottom: '20px',
              border: '1px solid #e5e7eb'
            }}>
              <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '6px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Testo selezionato
              </div>
              <div style={{ color: '#1f2937', fontSize: '0.875rem', lineHeight: 1.5 }}>
                {selectedText.length > 200 ? selectedText.substring(0, 200) + '...' : selectedText}
              </div>
            </div>
            
            {/* Strumenti AI - Griglia 2x4 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '20px' }}>
              <button
                onClick={() => handleAITool('rewrite')}
                disabled={aiLoading}
                style={{
                  padding: '14px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  backgroundColor: '#ffffff',
                  cursor: aiLoading ? 'not-allowed' : 'pointer',
                  color: '#1f2937',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
                onMouseEnter={(e) => { if (!aiLoading) e.currentTarget.style.backgroundColor = '#f9fafb'; }}
                onMouseLeave={(e) => { if (!aiLoading) e.currentTarget.style.backgroundColor = '#ffffff'; }}
              >
                📝 Riscrivi
              </button>
              <button
                onClick={() => handleAITool('summarize')}
                disabled={aiLoading}
                style={{
                  padding: '14px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  backgroundColor: '#ffffff',
                  cursor: aiLoading ? 'not-allowed' : 'pointer',
                  color: '#1f2937',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
                onMouseEnter={(e) => { if (!aiLoading) e.currentTarget.style.backgroundColor = '#f9fafb'; }}
                onMouseLeave={(e) => { if (!aiLoading) e.currentTarget.style.backgroundColor = '#ffffff'; }}
              >
                📊 Riassumi
              </button>
              <button
                onClick={() => handleAITool('improve')}
                disabled={aiLoading}
                style={{
                  padding: '14px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  backgroundColor: '#ffffff',
                  cursor: aiLoading ? 'not-allowed' : 'pointer',
                  color: '#1f2937',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
                onMouseEnter={(e) => { if (!aiLoading) e.currentTarget.style.backgroundColor = '#f9fafb'; }}
                onMouseLeave={(e) => { if (!aiLoading) e.currentTarget.style.backgroundColor = '#ffffff'; }}
              >
                🚀 Migliora
              </button>
              <button
                onClick={() => handleAITool('expand')}
                disabled={aiLoading}
                style={{
                  padding: '14px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  backgroundColor: '#ffffff',
                  cursor: aiLoading ? 'not-allowed' : 'pointer',
                  color: '#1f2937',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
                onMouseEnter={(e) => { if (!aiLoading) e.currentTarget.style.backgroundColor = '#f9fafb'; }}
                onMouseLeave={(e) => { if (!aiLoading) e.currentTarget.style.backgroundColor = '#ffffff'; }}
              >
                📈 Espandi
              </button>
              <button
                onClick={() => handleAITool('translate')}
                disabled={aiLoading}
                style={{
                  padding: '14px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  backgroundColor: '#ffffff',
                  cursor: aiLoading ? 'not-allowed' : 'pointer',
                  color: '#1f2937',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
                onMouseEnter={(e) => { if (!aiLoading) e.currentTarget.style.backgroundColor = '#f9fafb'; }}
                onMouseLeave={(e) => { if (!aiLoading) e.currentTarget.style.backgroundColor = '#ffffff'; }}
              >
                🌍 Traduci
              </button>
              <button
                onClick={() => handleAITool('ideas')}
                disabled={aiLoading}
                style={{
                  padding: '14px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  backgroundColor: '#ffffff',
                  cursor: aiLoading ? 'not-allowed' : 'pointer',
                  color: '#1f2937',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
                onMouseEnter={(e) => { if (!aiLoading) e.currentTarget.style.backgroundColor = '#f9fafb'; }}
                onMouseLeave={(e) => { if (!aiLoading) e.currentTarget.style.backgroundColor = '#ffffff'; }}
              >
                💡 Idee
              </button>
              <button
                onClick={() => handleAITool('grammar')}
                disabled={aiLoading}
                style={{
                  padding: '14px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  backgroundColor: '#ffffff',
                  cursor: aiLoading ? 'not-allowed' : 'pointer',
                  color: '#1f2937',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  gridColumn: 'span 2'
                }}
                onMouseEnter={(e) => { if (!aiLoading) e.currentTarget.style.backgroundColor = '#f9fafb'; }}
                onMouseLeave={(e) => { if (!aiLoading) e.currentTarget.style.backgroundColor = '#ffffff'; }}
              >
                ✅ Correggi Grammatica
              </button>
            </div>
            
            {/* Loading state */}
            {aiLoading && (
              <div style={{
                textAlign: 'center',
                padding: '24px',
                color: '#6b7280'
              }}>
                <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🤖</div>
                <div style={{ fontSize: '0.875rem' }}>Elaborazione in corso...</div>
              </div>
            )}
            
            {/* Risultato AI */}
            {aiResult && !aiLoading && (
              <div>
                <div style={{ 
                  fontSize: '0.75rem', 
                  color: '#9ca3af', 
                  marginBottom: '8px', 
                  fontWeight: 500, 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.5px' 
                }}>
                  Risultato
                </div>
                <div style={{
                  backgroundColor: '#f9fafb',
                  padding: '16px',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  marginBottom: '20px',
                  color: '#1f2937',
                  whiteSpace: 'pre-wrap',
                  fontSize: '0.875rem',
                  lineHeight: 1.6,
                  maxHeight: '300px',
                  overflow: 'auto'
                }}>
                  {aiResult}
                </div>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                  <button
                    onClick={applyAIResult}
                    style={{
                      padding: '12px 24px',
                      backgroundColor: '#6366f1',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      transition: 'opacity 0.2s'
                    }}
                    onMouseEnter={(e) => e.target.style.opacity = '0.9'}
                    onMouseLeave={(e) => e.target.style.opacity = '1'}
                  >
                    ✅ Applica
                  </button>
                  <button
                    onClick={closeAIMenu}
                    style={{
                      padding: '12px 24px',
                      backgroundColor: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      transition: 'opacity 0.2s'
                    }}
                    onMouseEnter={(e) => e.target.style.opacity = '0.9'}
                    onMouseLeave={(e) => e.target.style.opacity = '1'}
                  >
                    ❌ Annulla
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* AI Summary Popup Modal */}
      {showSummaryPopup && createPortal(
        <div 
          className="ai-summary-modal"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowSummaryPopup(false);
          }}
        >
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            padding: '28px',
            width: '100%',
            maxWidth: '600px',
            maxHeight: '80vh',
            overflow: 'auto',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '20px'
            }}>
              <IconComponent name="brain" />
              <h3 style={{
                margin: 0,
                fontSize: '1.25rem',
                fontWeight: 600,
                color: '#1f2937'
              }}>
                Riassunto AI
              </h3>
            </div>
            
            <div 
              style={{
                backgroundColor: '#f9fafb',
                padding: '20px',
                borderRadius: '12px',
                border: '1px solid #e5e7eb',
                marginBottom: '24px',
                color: '#1f2937',
                fontSize: '0.9375rem',
                lineHeight: 1.7,
                maxHeight: '400px',
                overflow: 'auto'
              }}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(summaryText) }}
            />
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(summaryText);
                  alert('Riassunto copiato negli appunti!');
                }}
                style={{
                  padding: '12px 20px',
                  backgroundColor: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 500
                }}
              >
                📋 Copia
              </button>
              <button
                onClick={() => setShowSummaryPopup(false)}
                style={{
                  padding: '12px 20px',
                  backgroundColor: '#6366f1',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 500
                }}
              >
                ✕ Chiudi
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <div className="rte-main-layout" style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Index Panel - Overlay - solo a pieno schermo */}
        {showIndex && anchors.length > 0 && isFullScreen && (
          <div className="rte-index-panel" style={{ 
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: '200px', 
            background: 'var(--bg-input)', 
            borderRight: '1px solid var(--border-light)',
            padding: '12px',
            overflowY: 'auto',
            maxHeight: isFullScreen ? 'calc(100vh - 60px)' : '400px',
            zIndex: 10,
            boxShadow: '2px 0 8px rgba(0,0,0,0.1)'
          }}>
            <div style={{ 
              fontSize: '0.75rem', 
              fontWeight: 600, 
              color: 'var(--text-secondary)', 
              marginBottom: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              📑 Indice
            </div>
            {anchors.map((anchor, index) => {
              const isActive = activeAnchorId === anchor.id;
              return (
                <button
                  key={anchor.id || index}
                  onClick={() => scrollToAnchor(anchor)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '6px 8px',
                    marginBottom: '4px',
                    border: 'none',
                    borderRadius: '4px',
                    background: isActive ? 'var(--primary-ghost)' : 'transparent',
                    cursor: 'pointer',
                    fontSize: anchor.type === 'h1' ? '0.85rem' : anchor.type === 'h2' ? '0.8rem' : anchor.type === 'h3' ? '0.75rem' : '0.75rem',
                    fontWeight: anchor.type === 'h1' ? 600 : anchor.type === 'h2' ? 500 : 400,
                    color: anchor.type === 'anchor' ? 'var(--primary)' : 'var(--text-primary)',
                    paddingLeft: anchor.level === 3 ? '24px' : anchor.level === 2 ? '16px' : '8px',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'transparent';
                  }}
                  title={anchor.name}
                >
                  {anchor.type === 'anchor' && '🔖 '}
                  {anchor.type === 'h1' && 'H1 '}
                  {anchor.type === 'h2' && '• H2 '}
                  {anchor.type === 'h3' && '◦ H3 '}
                  {anchor.name.length > 25 ? anchor.name.substring(0, 25) + '...' : anchor.name}
                </button>
              );
            })}
          </div>
        )}

        <div className="rte-editor-wrapper" style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div
            ref={editorRef}
            className="rte-editor"
            contentEditable
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
                debounceTimerRef.current = null;
                onChange(editorRef.current.innerHTML);
                pendingHtmlRef.current = null;
              }
            }}
            onClick={(e) => {
              handleEditorClick(e);
            }}
            onPaste={handlePaste}
            data-placeholder="Scrivi una nota... (premi '/' per comandi, #nome; per ancore)"
          />

        {showInternalLinkMenu === 'file' && internalLinkPosition && (
          <div className="rte-dropdown" style={{ position: 'absolute', top: internalLinkPosition.top, left: internalLinkPosition.left, zIndex: 1000, maxHeight: '200px', overflowY: 'auto' }}>
            <div style={{ padding: '8px', fontWeight: 'bold', borderBottom: '1px solid var(--border-light)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Seleziona File da collegare</div>
            {allFiles && allFiles.length > 0 ? allFiles.map(f => (
              <button key={f.id} type="button" onClick={() => {
                editorRef.current?.focus();
                insertHtml(`<a href="#" data-internal-id="${f.id}" data-internal-type="file" class="internal-link" contenteditable="false" style="color:var(--primary);font-weight:600;text-decoration:none;background:var(--bg-hover);padding:2px 6px;border-radius:4px;display:inline-block;margin:2px;">📄 ${f.name}</a>&nbsp;`);
                setShowInternalLinkMenu(null);
                setInternalLinkPosition(null);
              }}>📄 {f.name}</button>
            )) : <div style={{ padding: '8px', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Nessun file disponibile</div>}
            <button type="button" style={{ color: 'var(--danger)', marginTop: '4px', borderTop: '1px solid var(--border-light)' }} onClick={() => { setShowInternalLinkMenu(null); setInternalLinkPosition(null); }}>Annulla</button>
          </div>
        )}

        {showInternalLinkMenu === 'note' && internalLinkPosition && (
          <div className="rte-dropdown" style={{ position: 'absolute', top: internalLinkPosition.top, left: internalLinkPosition.left, zIndex: 1000, maxHeight: '200px', overflowY: 'auto' }}>
            <div style={{ padding: '8px', fontWeight: 'bold', borderBottom: '1px solid var(--border-light)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Seleziona Nota da collegare</div>
            {allNotes && allNotes.length > 0 ? allNotes.map(n => {
              const snippet = (n.text || '').replace(/<[^>]*>/g, '').trim().substring(0, 30) + '...';
              return (
                <button key={n.id} type="button" onClick={() => {
                  editorRef.current?.focus();
                  insertHtml(`<a href="#" data-internal-id="${n.id}" data-internal-type="note" class="internal-link" contenteditable="false" style="color:var(--primary);font-weight:600;text-decoration:none;background:var(--bg-hover);padding:2px 6px;border-radius:4px;display:inline-block;margin:2px;">📝 ${snippet}</a>&nbsp;`);
                  setShowInternalLinkMenu(null);
                  setInternalLinkPosition(null);
                }}>📝 {snippet}</button>
              );
            }) : <div style={{ padding: '8px', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Nessuna nota disponibile</div>}
            <button type="button" style={{ color: 'var(--danger)', marginTop: '4px', borderTop: '1px solid var(--border-light)' }} onClick={() => { setShowInternalLinkMenu(null); setInternalLinkPosition(null); }}>Annulla</button>
          </div>
        )}

        {slashMenuParams && (() => {
          const options = getSlashOptions();
          if (options.length === 0) return null;
          return (
            <div className="rte-slash-menu" style={{ top: slashMenuParams.top, left: slashMenuParams.left }}>
              <div className="rte-slash-title">Opzioni</div>
              {options.map((opt, idx) => (
                <button
                  key={opt.cmd}
                  type="button"
                  className={idx === slashSelectedIndex ? 'active' : ''}
                  onClick={() => applySlashCommand(opt.cmd)}
                  onMouseEnter={() => setSlashSelectedIndex(idx)}
                >
                  <span style={{ fontSize: '1.2rem', marginRight: '8px' }}>{opt.icon}</span> {opt.label}
                </button>
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

        /* Index panel styles */
        .rte-index-panel {
          scrollbar-width: thin;
          scrollbar-color: var(--border) transparent;
        }

        .rte-index-panel::-webkit-scrollbar {
          width: 6px;
        }

        .rte-index-panel::-webkit-scrollbar-track {
          background: transparent;
        }

        .rte-index-panel::-webkit-scrollbar-thumb {
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
        }

        .rte-fullscreen .rte-index-panel {
          max-height: calc(100vh - 60px);
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

