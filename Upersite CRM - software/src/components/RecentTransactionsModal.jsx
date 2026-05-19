import { useMemo, memo } from 'react';

const RecentTransactionsModal = memo(({ customers, onClose, onSelectCustomer }) => {
  const transactions = useMemo(() => {
    const allTransactions = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    customers.forEach(customer => {
      (customer.installments || []).forEach(inst => {
        const dueDate = inst.dueDate ? new Date(inst.dueDate) : null;
        const isOverdue = dueDate && dueDate < now && !inst.paid;
        
        allTransactions.push({
          id: inst.id,
          customerId: customer.id,
          customerName: customer.name,
          amount: parseFloat(inst.amount) || 0,
          dueDate: inst.dueDate,
          paid: inst.paid,
          isOverdue,
          description: inst.description || 'Rata'
        });
      });
    });

    return allTransactions.sort((a, b) => {
      const dateA = a.dueDate ? new Date(a.dueDate) : new Date(0);
      const dateB = b.dueDate ? new Date(b.dueDate) : new Date(0);
      if (dateB - dateA !== 0) return dateB - dateA;
      return (a.paid === b.paid) ? 0 : a.paid ? 1 : -1;
    });
  }, [customers]);

  const handleTransactionClick = (transaction) => {
    const customer = customers.find(c => c.id === transaction.customerId);
    if (customer && onSelectCustomer) {
      onSelectCustomer(customer);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('setActiveTab', { detail: 'finance' }));
      }, 100);
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1200 }}>
      <div className="modal-content animate-scale-in" style={{ maxWidth: '800px', maxHeight: '80vh', padding: '24px' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
            </svg>
            Transazioni Recenti
          </h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            {transactions.length} transazioni totali
          </span>
        </div>

        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {transactions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-tertiary)' }}>
              <div style={{ fontSize: '3rem', marginBottom: '16px' }}>💳</div>
              <div style={{ fontSize: '1rem', marginBottom: '8px' }}>Nessuna transazione</div>
              <div style={{ fontSize: '0.8rem' }}>Le transazioni appariranno qui quando verranno aggiunte rate ai clienti</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {transactions.map((transaction) => {
                const statusText = transaction.paid ? 'Pagata' : transaction.isOverdue ? 'Scaduta' : 'In sospeso';
                const statusIcon = transaction.paid ? '✓' : transaction.isOverdue ? '✕' : '○';
                const statusColor = transaction.paid ? '#22C55E' : transaction.isOverdue ? '#F87171' : '#FBBF24';
                const bgColor = transaction.paid ? 'rgba(34, 197, 94, 0.05)' : transaction.isOverdue ? 'rgba(248, 113, 113, 0.05)' : 'rgba(251, 191, 36, 0.05)';
                const borderColor = transaction.paid ? 'rgba(34, 197, 94, 0.2)' : transaction.isOverdue ? 'rgba(248, 113, 113, 0.2)' : 'rgba(251, 191, 36, 0.2)';
                
                return (
                  <div
                    key={transaction.id}
                    className="transaction-item"
                    onClick={() => handleTransactionClick(transaction)}
                    style={{ 
                      cursor: 'pointer',
                      backgroundColor: bgColor,
                      borderColor: borderColor,
                      border: `1px solid ${borderColor}`
                    }}
                  >
                    <div className="transaction-amount">€{transaction.amount.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR</div>
                    <div className="transaction-customer">{transaction.customerName}</div>
                    <div className="transaction-status" style={{ color: statusColor }}>
                      {statusText} {statusIcon}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <style>{`
          .transaction-item {
            border-radius: 12px;
            padding: 14px 20px;
            display: flex;
            align-items: center;
            transition: all 0.2s ease;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            min-height: 52px;
          }

          .transaction-item:hover {
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.15);
            transform: translateY(-1px);
          }

          .transaction-amount {
            font-size: 1rem;
            font-weight: 600;
            color: #1f2937;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            min-width: 140px;
            text-align: left;
          }

          .transaction-customer {
            font-size: 0.875rem;
            color: var(--text-primary);
            font-weight: 500;
            flex: 1;
            text-align: center;
            margin: 0 16px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .transaction-status {
            font-size: 0.875rem;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 4px;
            min-width: 100px;
            text-align: right;
            justify-content: flex-end;
          }

          @media (max-width: 600px) {
            .transaction-item {
              flex-direction: column;
              gap: 8px;
              align-items: flex-start;
            }
            
            .transaction-amount {
              font-size: 1.1rem;
            }
            
            .transaction-status {
              align-self: flex-start;
            }
          }
        `}</style>
      </div>
    </div>
  );
});

export default RecentTransactionsModal;
