import { useState, useRef, useEffect, useCallback } from 'react';

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
  const [isFullScreen, setIsFullScreen] = useState(false);

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

  // Only update innerHTML if it completely differs from the external value AND we are not actively typing in it.
  // This prevents React from resetting the text cursor on every keystroke.
  useEffect(() => {
    if (pendingHtmlRef.current !== null) return;
    
    if (editorRef.current && value !== editorRef.current.innerHTML) {
      // Don't overwrite if the user is currently focused/typing in the editor
      if (document.activeElement !== editorRef.current) {
        editorRef.current.innerHTML = value || '';
      }
    }
  }, [value]);

  const exec = (cmd, val = null) => {
    document.execCommand(cmd, false, val);
    editorRef.current?.focus();
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
    }
  };

  const getSlashOptions = () => {
    if (!slashMenuParams) return [];
    return [
      { cmd: 'highlight', label: 'Evidenzia', icon: '🖍' },
      { cmd: 'code', label: 'Blocco Codice', icon: '💻' },
      { cmd: 'divider', label: 'Separatore', icon: '➖' },
      { cmd: 'link', label: 'Link Esterno', icon: '🔗' },
      { cmd: 'link_file', label: 'Collega File', icon: '📁' },
      { cmd: 'link_note', label: 'Collega Nota', icon: '📝' },
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

  // Make links clickable (open in new tab) and handle image resizing on click
  const handleEditorClick = (e) => {
    const target = e.target;

    // Handle internal link clicks
    if (target.tagName === 'A' && target.classList.contains('internal-link')) {
      e.preventDefault();
      const id = target.getAttribute('data-internal-id');
      const type = target.getAttribute('data-internal-type');
      if (onInternalLinkClick && id && type) {
        onInternalLinkClick(id, type);
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

  return (
    <div className={`rte-container ${isFullScreen ? 'rte-fullscreen' : ''}`}>
      <div className="rte-toolbar">
        <button type="button" className="rte-btn" onClick={() => fileInputRef.current?.click()} title="Importa File (.txt, .md, .html, .csv)">
          📥 Importa
        </button>
        <input ref={fileInputRef} type="file" accept=".txt,.md,.html,.csv" style={{ display: 'none' }} onChange={handleFileImport} />

        <div className="rte-separator" />

        <button type="button" className="rte-btn" onClick={() => exec('bold')} title="Grassetto">
          <strong>B</strong>
        </button>
        <button type="button" className="rte-btn" onClick={() => exec('italic')} title="Corsivo">
          <em>I</em>
        </button>
        <button type="button" className="rte-btn" onClick={() => exec('underline')} title="Sottolineato">
          <u>U</u>
        </button>
        <div className="rte-separator" />
        <button type="button" className="rte-btn" onClick={() => exec('insertUnorderedList')} title="Lista puntata">
          •
        </button>
        <button type="button" className="rte-btn" onClick={() => exec('insertOrderedList')} title="Lista numerata">
          1.
        </button>
        <div className="rte-separator" />

        {/* Added Slash-style commands to toolbar */}
        <button type="button" className="rte-btn" onClick={() => applySlashCommand('highlight')} title="Evidenzia">🖍</button>
        <button type="button" className="rte-btn" onClick={() => applySlashCommand('code')} title="Blocco Codice">💻</button>
        <button type="button" className="rte-btn" onClick={() => applySlashCommand('divider')} title="Separatore">➖</button>
        <button type="button" className="rte-btn" onClick={() => applySlashCommand('link')} title="Inserisci Link Esterno">🔗</button>
        <button type="button" className="rte-btn" onClick={() => applySlashCommand('link_file')} title="Collega File Interno">📁</button>
        <button type="button" className="rte-btn" onClick={() => applySlashCommand('link_note')} title="Collega Nota Interna">📝</button>
        <button type="button" className="rte-btn" onClick={() => imageInputRef.current?.click()} title="Inserisci Immagine">🖼️</button>
        <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />

        <div className="rte-separator" />

        <button type="button" className="rte-btn" onClick={() => exec('strikeThrough')} title="Barrato">
          <s>S</s>
        </button>
        <div className="rte-separator" />

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

        <div style={{ flex: 1 }} />

        <button type="button" className="rte-btn" onClick={() => setIsFullScreen(!isFullScreen)} title="Espandi a pieno schermo" style={{ fontWeight: 'bold' }}>
          {isFullScreen ? '↙ Piccoli' : '⛶ Pieno Schermo'}
        </button>
      </div>

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
          onClick={handleEditorClick}
          onPaste={handlePaste}
          data-placeholder="Scrivi una nota... (premi '/' per comandi)"
        />

        {showInternalLinkMenu === 'file' && (
          <div className="rte-dropdown" style={{ position: 'absolute', top: '40px', left: '10px', zIndex: 1000, maxHeight: '200px', overflowY: 'auto' }}>
            <div style={{ padding: '8px', fontWeight: 'bold', borderBottom: '1px solid var(--border-light)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Seleziona File da collegare</div>
            {allFiles && allFiles.length > 0 ? allFiles.map(f => (
              <button key={f.id} type="button" onClick={() => {
                editorRef.current?.focus();
                insertHtml(`<a href="#" data-internal-id="${f.id}" data-internal-type="file" class="internal-link" contenteditable="false" style="color:var(--primary);font-weight:600;text-decoration:none;background:var(--bg-hover);padding:2px 6px;border-radius:4px;display:inline-block;margin:2px;">📄 ${f.name}</a>&nbsp;`);
                setShowInternalLinkMenu(null);
              }}>📄 {f.name}</button>
            )) : <div style={{ padding: '8px', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Nessun file disponibile</div>}
            <button type="button" style={{ color: 'var(--danger)', marginTop: '4px', borderTop: '1px solid var(--border-light)' }} onClick={() => setShowInternalLinkMenu(null)}>Annulla</button>
          </div>
        )}

        {showInternalLinkMenu === 'note' && (
          <div className="rte-dropdown" style={{ position: 'absolute', top: '40px', left: '10px', zIndex: 1000, maxHeight: '200px', overflowY: 'auto' }}>
            <div style={{ padding: '8px', fontWeight: 'bold', borderBottom: '1px solid var(--border-light)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Seleziona Nota da collegare</div>
            {allNotes && allNotes.length > 0 ? allNotes.map(n => {
              const snippet = (n.text || '').replace(/<[^>]*>/g, '').trim().substring(0, 30) + '...';
              return (
                <button key={n.id} type="button" onClick={() => {
                  editorRef.current?.focus();
                  insertHtml(`<a href="#" data-internal-id="${n.id}" data-internal-type="note" class="internal-link" contenteditable="false" style="color:var(--primary);font-weight:600;text-decoration:none;background:var(--bg-hover);padding:2px 6px;border-radius:4px;display:inline-block;margin:2px;">📝 ${snippet}</a>&nbsp;`);
                  setShowInternalLinkMenu(null);
                }}>📝 {snippet}</button>
              );
            }) : <div style={{ padding: '8px', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Nessuna nota disponibile</div>}
            <button type="button" style={{ color: 'var(--danger)', marginTop: '4px', borderTop: '1px solid var(--border-light)' }} onClick={() => setShowInternalLinkMenu(null)}>Annulla</button>
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
          align-items: center;
          gap: 2px;
          padding: 6px 8px;
          background: var(--bg-input);
          border-bottom: 1px solid var(--border-light);
          flex-wrap: wrap;
        }

        .rte-btn {
          border: none;
          background: transparent;
          padding: 4px 8px;
          border-radius: var(--radius-sm);
          cursor: pointer;
          font-family: var(--font);
          font-size: 0.8125rem;
          color: var(--text-secondary);
          transition: all var(--duration-fast);
          line-height: 1;
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
        }

        .rte-fullscreen .rte-editor {
          flex: 1;
          max-height: none;
          padding: 40px;
          font-size: 1.125rem;
          max-width: 900px;
          margin: 0 auto;
          width: 100%;
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
      `}</style>
    </div>
  );
}
