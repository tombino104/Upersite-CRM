import { useState, useMemo, useEffect } from 'react';

export default function DataGridView({ customers, onClose }) {
    const [search, setSearch] = useState('');
    const [isClosing, setIsClosing] = useState(false);

    const handleClose = () => {
        setIsClosing(true);
        setTimeout(onClose, 150);
    };

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return (customers || []).filter(c => {
            return (
                (c.name || '').toLowerCase().includes(q) ||
                (c.company || '').toLowerCase().includes(q) ||
                (c.email || '').toLowerCase().includes(q) ||
                (c.extraEmails || []).some(m => (m || '').toLowerCase().includes(q)) ||
                (c.tags || []).some(t => t.toLowerCase().includes(q))
            );
        });
    }, [customers, search]);

    const formatCurrency = (n) =>
        new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n || 0);

    return (
        <div className={`data-grid-overlay ${isClosing ? 'overlay-closing' : ''}`} onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
        }}>
            <div className={`data-grid-container ${isClosing ? 'modal-closing' : 'animate-scale-in'}`}>
                <div className="data-grid-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <h2 style={{ margin: 0 }}>📊 Vista Tabella Dati</h2>
                        <input
                            className="input"
                            style={{ width: '250px', padding: '8px 12px', fontSize: '0.875rem' }}
                            placeholder="Filtra in tempo reale..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    <button className="btn btn-ghost btn-icon" onClick={handleClose} style={{ fontSize: '1.25rem' }}>✕</button>
                </div>

                <div className="data-grid-body">
                    <table className="excel-table">
                        <thead>
                            <tr>
                                <th>Nome Cliente</th>
                                <th>Tipo di attività</th>
                                <th style={{ textAlign: 'center' }}>Stato</th>
                                <th style={{ textAlign: 'center' }}>Pacchetto</th>
                                <th style={{ textAlign: 'right' }}>Preventivo</th>
                                <th style={{ textAlign: 'right' }}>Pagato</th>
                                <th style={{ textAlign: 'right' }}>Residuo</th>
                                <th>Email / Contatto</th>
                                <th>Tag</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan="9" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
                                        Nessun risultato trovato
                                    </td>
                                </tr>
                            )}
                            {filtered.map(c => {
                                const total = parseFloat(c.quoteAmount) || 0;
                                const paid = (c.installments || []).filter(i => i.paid).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
                                const pending = Math.max(0, total - paid);

                                return (
                                    <tr key={c.id}>
                                        <td style={{ fontWeight: 600 }}>{c.name}</td>
                                        <td style={{ color: 'var(--text-secondary)' }}>{c.company || '-'}</td>
                                        <td style={{ textAlign: 'center' }}>
                                            <span className={`status-pill pill-${c.status || 'prospect'}`}>
                                                {c.status === 'working' ? '🛠 In corso' :
                                                    c.status === 'paused' ? '⏸ Sospeso' :
                                                        c.status === 'completed' ? '✅ Finito' : '🎯 Target'}
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                                            {c.packageType ? c.packageType.toUpperCase() : '-'}
                                        </td>
                                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(total)}</td>
                                        <td style={{ textAlign: 'right', color: 'var(--success)', fontWeight: 600 }}>{formatCurrency(paid)}</td>
                                        <td style={{ textAlign: 'right', color: pending > 0 ? 'var(--danger)' : 'var(--text-tertiary)', fontWeight: 600 }}>
                                            {formatCurrency(pending)}
                                        </td>
                                        <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                            {[c.email, ...(c.extraEmails || [])].filter(Boolean).map(m => (
                                                <div key={m}>{m}</div>
                                            ))}
                                            {!c.email && !(c.extraEmails || []).some(Boolean) && '-'}
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                {(c.tags || []).map(t => (
                                                    <span key={t} style={{ fontSize: '10px', padding: '2px 6px', background: 'var(--bg-hover)', borderRadius: '4px' }}>{t}</span>
                                                ))}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="data-grid-footer">
                    <span>Totale Clienti: <strong>{filtered.length}</strong></span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Premi ESC per chiudere • Vista di sola lettura</span>
                </div>
            </div>

            <style>{`
                .data-grid-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(45, 52, 54, 0.4);
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                    z-index: 5000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 16px;
                }
                .data-grid-container {
                    background: var(--bg);
                    width: min(98vw, 1800px);
                    height: 92vh;
                    max-width: 98vw;
                    border-radius: var(--radius-xl);
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 24px 80px rgba(0,0,0,0.5);
                    overflow: hidden;
                    border: 1px solid var(--border-light);
                }
                .data-grid-header {
                    padding: 24px 32px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px solid var(--border-light);
                    background: var(--bg-card);
                }
                .data-grid-body {
                    flex: 1;
                    overflow: auto;
                    padding: 0;
                }
                .data-grid-footer {
                    padding: 16px 32px;
                    border-top: 1px solid var(--border-light);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: var(--bg-card);
                    font-size: 0.875rem;
                }
                .excel-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 0.875rem;
                }
                .excel-table th {
                    position: sticky;
                    top: 0;
                    background: var(--bg-hover);
                    padding: 14px 20px;
                    text-align: left;
                    font-weight: 700;
                    color: var(--text-primary);
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    border-bottom: 2px solid var(--border);
                    z-index: 10;
                }
                .excel-table td {
                    padding: 14px 20px;
                    border-bottom: 1px solid var(--border-light);
                    vertical-align: middle;
                }
                .excel-table tr:hover {
                    background: var(--bg-hover);
                }
                .status-pill {
                    padding: 4px 10px;
                    border-radius: var(--radius-full);
                    font-size: 0.75rem;
                    font-weight: 600;
                }
                .pill-prospect { background: var(--kanban-prospect); color: #fff; }
                .pill-working { background: var(--kanban-working); color: #fff; }
                .pill-paused { background: var(--kanban-paused); color: #fff; }
                .pill-completed { background: var(--kanban-completed); color: #fff; }
            `}</style>
        </div>
    );
}
