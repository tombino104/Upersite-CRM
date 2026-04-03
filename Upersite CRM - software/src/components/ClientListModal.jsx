import React, { useState } from 'react';

export default function ClientListModal({ customers, onSelectCustomer, onClose, userProfile }) {
    const [search, setSearch] = useState('');

    const terms = search.toLowerCase().split(/\s+/).filter(t => t);
    const filtered = customers.filter(c => {
        if (terms.length === 0) return true;
        return terms.every(term =>
            (c.name || '').toLowerCase().includes(term) ||
            (c.company || '').toLowerCase().includes(term) ||
            (c.email || '').toLowerCase().includes(term) ||
            (c.tags || []).some(t => t.toLowerCase().includes(term))
        );
    });

    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal-content animate-scale-in" style={{ maxWidth: '600px', padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Clienti ({customers.filter(c => c.id !== userProfile?.id).length})</h2>
                    <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
                </div>

                <input
                    className="input"
                    placeholder="Cerca cliente locale..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ marginBottom: '16px' }}
                    autoFocus
                />

                <div className="client-list-scroll" style={{ maxHeight: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {filtered.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-text">Nessun cliente trovato</div>
                        </div>
                    ) : (
                        filtered.map(c => (
                            <div key={c.id} className="stat-card" style={{ padding: '12px', cursor: 'pointer' }} onClick={() => { onSelectCustomer(c); onClose(); }}>
                                <div className="stat-icon" style={{ background: 'var(--primary-ghost)', color: 'var(--primary)', width: '36px', height: '36px' }}>
                                    {(c.name || '?').charAt(0).toUpperCase()}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{c.name}</div>
                                    {c.company && <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{c.company}</div>}
                                </div>
                                <span className={`badge badge-${c.status || 'prospect'}`}>{(c.status || 'prospect').toUpperCase()}</span>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
