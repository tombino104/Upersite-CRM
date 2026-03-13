import React from 'react';

export default function FilePreviewModal({ file, onClose }) {
    if (!file) return null;

    const isImage = file.type && file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    const isText = file.type && file.type.startsWith('text/');

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
                        <iframe src={file.data} style={{ width: '100%', height: '100%', border: 'none', borderRadius: 'var(--radius-md)', background: 'white', padding: '16px' }} title={file.name} />
                    )}

                    {!isImage && !isPdf && !isText && (
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
