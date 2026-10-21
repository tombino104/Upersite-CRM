import React, { useEffect, useMemo, useState } from 'react';
import mammoth from 'mammoth/mammoth.browser';
import * as XLSX from 'xlsx';
import { sanitizeHtml } from '../utils/sanitizeHtml';

// Link nell'anteprima di un documento: i rimandi interni (#nota) restano nella pagina, gli altri
// si aprono in una nuova finestra (mai nella finestra del CRM)
function handlePreviewLinkClick(e) {
    const link = e.target.closest?.('a[href]');
    if (!link || link.getAttribute('href').startsWith('#')) return;
    e.preventDefault();
    if (/^https?:\/\//i.test(link.href)) window.open(link.href, '_blank', 'noopener,noreferrer');
}

export default function FilePreviewModal({ file, onClose }) {
    if (!file) return null;

    const isImage = file.type && file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    const isText = file.type && file.type.startsWith('text/');

    const lowerName = (file.name || '').toLowerCase();
    const isDocx = lowerName.endsWith('.docx');
    const isXlsx = lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls');

    const [officeLoading, setOfficeLoading] = useState(false);
    const [officeError, setOfficeError] = useState('');
    const [docxHtml, setDocxHtml] = useState('');
    const [sheets, setSheets] = useState([]);
    const [activeSheet, setActiveSheet] = useState('');
    const [textContent, setTextContent] = useState('');

    const dataUrlToArrayBuffer = (dataUrl) => {
        const comma = dataUrl.indexOf(',');
        const base64 = comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
        const binary = atob(base64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
        return bytes.buffer;
    };

    useEffect(() => {
        let cancelled = false;
        setOfficeError('');
        setDocxHtml('');
        setSheets([]);
        setActiveSheet('');

        const run = async () => {
            if (!file?.data) return;

            if (isText) {
                try {
                    const comma = file.data.indexOf(',');
                    const isBase64 = comma > -1 && file.data.substring(0, comma).includes(';base64');
                    const content = comma === -1 ? file.data : file.data.slice(comma + 1);
                    
                    if (!isBase64 && content) {
                        setTextContent(decodeURIComponent(content));
                    } else {
                        const buffer = dataUrlToArrayBuffer(file.data);
                        const text = new TextDecoder('utf-8').decode(buffer);
                        setTextContent(text);
                    }
                } catch (e) {
                    if (!cancelled) setTextContent('Errore nel caricamento del testo: formattazione non supportata o file corrotto.');
                }
                return;
            }

            if (!isDocx && !isXlsx) return;

            setOfficeLoading(true);
            try {
                const buffer = dataUrlToArrayBuffer(file.data);

                if (isDocx) {
                    const res = await mammoth.convertToHtml({ arrayBuffer: buffer });
                    if (cancelled) return;
                    // mammoth non ripulisce il documento (link javascript: ecc.): il file può arrivare da un cliente
                    setDocxHtml(sanitizeHtml(res.value || ''));
                } else if (isXlsx) {
                    const wb = XLSX.read(buffer, { type: 'array' });
                    const nextSheets = (wb.SheetNames || []).slice(0, 5).map(name => {
                        const ws = wb.Sheets[name];
                        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
                        const trimmed = (rows || []).slice(0, 50).map(r => (r || []).slice(0, 20));
                        return { name, rows: trimmed };
                    });
                    if (cancelled) return;
                    setSheets(nextSheets);
                    setActiveSheet(nextSheets[0]?.name || '');
                }
            } catch (err) {
                if (cancelled) return;
                setOfficeError(`Anteprima non disponibile: ${err.message || 'Errore di conversione'}`);
                console.error(err);
            } finally {
                if (!cancelled) setOfficeLoading(false);
            }
        };

        run();
        return () => {
            cancelled = true;
        };
    }, [file?.data, file?.name, isDocx, isXlsx]);

    const activeSheetRows = useMemo(() => {
        if (!activeSheet) return [];
        return (sheets.find(s => s.name === activeSheet)?.rows) || [];
    }, [sheets, activeSheet]);

    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()} style={{ zIndex: 9999 }}>
            <div className="modal-content animate-scale-in" style={{
                maxWidth: '90vw',
                maxHeight: '90vh',
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--bg)',
                overflow: 'hidden'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--border-light)', background: 'var(--bg-card)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <span style={{ fontSize: '1.25rem' }}>
                            {isImage ? '🖼️' : isPdf ? '📕' : isText ? '📝' : '📄'}
                        </span>
                        <h2 style={{ fontSize: '1rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {file.name}
                        </h2>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <a href={file.data} download={file.name} className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>
                            ⬇ Scarica
                        </a>
                        <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
                    </div>
                </div>

                <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
                    {isImage && (
                        <img src={file.data} alt={file.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)' }} />
                    )}

                    {isPdf && (
                        <iframe src={file.data} style={{ width: '100%', height: '100%', border: 'none', borderRadius: 'var(--radius-md)', background: 'white' }} title={file.name} />
                    )}

                    {isText && (
                        <div style={{ width: '100%', height: '100%', background: 'white', color: 'black', borderRadius: 'var(--radius-md)', padding: '16px', overflow: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.9rem', textAlign: 'left', wordBreak: 'break-word' }}>
                            {textContent}
                        </div>
                    )}

                    {isDocx && (
                        <div style={{ width: '100%', height: '100%', background: 'white', borderRadius: 'var(--radius-md)', padding: '18px', overflow: 'auto' }}>
                            {officeLoading && <div style={{ color: 'var(--text-secondary)' }}>Caricamento anteprima…</div>}
                            {!officeLoading && officeError && <div style={{ color: 'var(--danger)', fontWeight: 600 }}>{officeError}</div>}
                            {!officeLoading && !officeError && (
                                <div style={{ fontSize: '0.95rem', lineHeight: 1.55 }} onClick={handlePreviewLinkClick} dangerouslySetInnerHTML={{ __html: docxHtml || '<div style="color:#777">Documento vuoto</div>' }} />
                            )}
                        </div>
                    )}

                    {isXlsx && (
                        <div style={{ width: '100%', height: '100%', background: 'white', borderRadius: 'var(--radius-md)', padding: '12px', overflow: 'auto' }}>
                            {officeLoading && <div style={{ color: 'var(--text-secondary)' }}>Caricamento anteprima…</div>}
                            {!officeLoading && officeError && <div style={{ color: 'var(--danger)', fontWeight: 600 }}>{officeError}</div>}
                            {!officeLoading && !officeError && sheets.length === 0 && (
                                <div style={{ color: 'var(--text-secondary)' }}>Nessun foglio disponibile.</div>
                            )}
                            {!officeLoading && !officeError && sheets.length > 0 && (
                                <>
                                    <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                                        {sheets.map(s => (
                                            <button
                                                key={s.name}
                                                className={s.name === activeSheet ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                                                onClick={() => setActiveSheet(s.name)}
                                            >
                                                {s.name}
                                            </button>
                                        ))}
                                    </div>

                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                        <tbody>
                                            {activeSheetRows.map((row, rIdx) => (
                                                <tr key={rIdx}>
                                                    {(row || []).map((cell, cIdx) => (
                                                        <td key={cIdx} style={{ border: '1px solid #e5e7eb', padding: '6px 8px', verticalAlign: 'top', whiteSpace: 'pre-wrap' }}>
                                                            {cell == null || cell === '' ? '' : String(cell)}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    <div style={{ marginTop: '10px', fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                                        Anteprima: prime 50 righe / 20 colonne.
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {!isImage && !isPdf && !isText && !isDocx && !isXlsx && (
                        <div className="empty-state">
                            <div className="empty-state-icon">⚠️</div>
                            <div className="empty-state-text">Anteprima non disponibile per questo tipo di file. Utilizza il tasto Scarica.</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
