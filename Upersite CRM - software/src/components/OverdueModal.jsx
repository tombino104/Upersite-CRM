import React from 'react';

export default function OverdueModal({ customers, onSelectCustomer, onClose }) {
    const overdueList = [];

    customers.forEach(c => {
        (c.installments || []).forEach(inst => {
            if (!inst.paid && inst.dueDate && new Date(inst.dueDate) < new Date()) {
                overdueList.push({
                    customer: c,
                    installment: inst
                });
            }
        });
    });

    const formatCurrency = (n) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
    const formatDate = (d) => new Date(d).toLocaleDateString('it-IT');

    // Sort by oldest due date first
    overdueList.sort((a, b) => new Date(a.installment.dueDate) - new Date(b.installment.dueDate));

    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal-content animate-scale-in" style={{ maxWidth: '600px', padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--danger)' }}>
                        ⚠️ Rate Scadute ({overdueList.length})
                    </h2>
                    <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
                </div>

                <div className="overdue-list" style={{ maxHeight: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {overdueList.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon">✅</div>
                            <div className="empty-state-text">Nessuna rata scaduta. Ottimo!</div>
                        </div>
                    ) : (
                        overdueList.map((item, idx) => (
                            <div key={`${item.customer.id}-${item.installment.id}`} className="stat-card" style={{ cursor: 'pointer', padding: '12px' }} onClick={() => { 
    onSelectCustomer(item.customer); 
    onClose();
    setTimeout(() => {
      const event = new CustomEvent('setActiveTab', { detail: 'finance' });
      window.dispatchEvent(event);
    }, 200);
  }}>
                                <div className="stat-icon" style={{ background: 'var(--danger-bg)', color: 'var(--danger)', width: '36px', height: '36px', fontSize: '1rem' }}>⏱</div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{item.customer.name} {item.customer.company ? `(${item.customer.company})` : ''}</div>
                                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                                        Scadenza: <strong>{formatDate(item.installment.dueDate)}</strong> — {item.installment.description || 'Nessuna descrizione'}
                                    </div>
                                </div>
                                <div style={{ fontWeight: 700, color: 'var(--danger)' }}>
                                    {formatCurrency(item.installment.amount)}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
