import { useState, useRef, useEffect, useCallback } from 'react';

const BASIC_COLORS = [
  '#000000', '#E74C3C', '#E67E22', '#F1C40F', '#2ECC71',
  '#3498DB', '#9B59B6', '#34495E', '#95A5A6', '#FFFFFF'
];

export default function RichTextEditor({ value, onChange }) {
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);
  const [showColors, setShowColors] = useState(false);
  const [showHeadings, setShowHeadings] = useState(false);
  const [showAlignment, setShowAlignment] = useState(false);
  const [slashMenuParams, setSlashMenuParams] = useState(null); // { top, left, filter }
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Only update innerHTML if it completely differs from the external value AND we are not actively typing in it.
  // This prevents React from resetting the text cursor on every keystroke.
  useEffect(() => {
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
    onChange(html);

    // Slash menu logic
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    try {
      const range = sel.getRangeAt(0);
      const node = sel.anchorNode;

      if (node && node.nodeType === Node.TEXT_NODE) {
        const textParam = node.textContent.substring(0, range.startOffset);
        const match = textParam.match(/(?:^|\n)(?:\/)([\w]*)$/);
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
      const match = textParam.match(/(?:^|\n)(?:\/)([\w]*)$/);
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
      if (url) exec('createLink', url);
    }
  };

  const getSlashOptions = () => {
    if (!slashMenuParams) return [];
    return [
      { cmd: 'highlight', label: 'Evidenzia', icon: '🖍' },
      { cmd: 'code', label: 'Blocco Codice', icon: '💻' },
      { cmd: 'divider', label: 'Separatore', icon: '➖' },
      { cmd: 'link', label: 'Link', icon: '🔗' }
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
        <button type="button" className="rte-btn" onClick={() => applySlashCommand('link')} title="Inserisci Link">🔗</button>

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
          data-placeholder="Scrivi una nota... (premi '/' per comandi)"
        />

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
