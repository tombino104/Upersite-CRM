import { useState } from 'react';

const STATUS_LABELS = {
  prospect: 'Prospect',
  working: 'In lavorazione',
  completed: 'Completato',
  paused: 'Sospeso',
};

const STATUS_ORDER = ['prospect', 'working', 'completed', 'paused'];

export default function CustomerCard({ customer, onClick, index = 0 }) {
  const [isHovered, setIsHovered] = useState(false);

  const status = customer.status || 'prospect';
  const installments = customer.installments || [];
  const paidCount = installments.filter(i => i.paid).length;
  const totalInstallments = installments.length;
  const paidAmount = installments.filter(i => i.paid).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const totalAmount = installments.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const progress = totalAmount > 0 ? (paidAmount / totalAmount) * 100 : 0;

  const hasOverdue = installments.some(i => !i.paid && i.dueDate && new Date(i.dueDate) < new Date());

  const getUnreadTodos = (items) => (items || []).reduce((count, t) => {
    const selfUnread = t.readAt ? 0 : 1;
    const childrenUnread = t.subtasks && t.subtasks.length > 0 ? getUnreadTodos(t.subtasks) : 0;
    return count + selfUnread + childrenUnread;
  }, 0);

  const totalUnread = [
    ...(customer.credentials || []),
    ...(customer.links || []),
    ...(customer.notes || [])
  ].filter(item => !item.readAt).length + getUnreadTodos(customer.todo);

  const formatCurrency = (n) =>
    new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);

  return (
    <div
      className={`customer-card customer-card-status-${status}`}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="customer-card-top">
        <div className="customer-card-avatar">
          {customer.logo ? (
            <img src={customer.logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
          ) : (
            (customer.name || '?').charAt(0).toUpperCase()
          )}
        </div>
        <div className="customer-card-info">
          <h3 className="customer-card-name">{customer.name || 'Senza nome'}</h3>
          {customer.company && (
            <span className="customer-card-company">{customer.company}</span>
          )}
        </div>
        <span className={`badge badge-${status}`}>{STATUS_LABELS[status]}</span>
        {totalUnread > 0 && (
          <span style={{
            background: 'var(--danger)',
            color: '#fff',
            fontSize: '0.65rem',
            fontWeight: 700,
            minWidth: '18px',
            height: '18px',
            borderRadius: '9px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 5px',
          }}>{totalUnread}</span>
        )}
      </div>

      {customer.packageType && (
        <div className="customer-card-package">
          📦 {customer.packageType}
        </div>
      )}

      {(customer.tags || []).length > 0 && (
        <div className="customer-card-tags">
          {customer.tags.map(tag => (
            <span key={tag} className="tag-badge">{tag}</span>
          ))}
        </div>
      )}

      {totalInstallments > 0 && (
        <div className="customer-card-finance">
          <div className="customer-card-finance-row">
            <span className="customer-card-finance-label">
              Pagamenti {paidCount}/{totalInstallments}
            </span>
            <span className="customer-card-finance-amount">
              {formatCurrency(paidAmount)} / {formatCurrency(totalAmount)}
            </span>
          </div>
          <div className="progress-bar">
            <div
              className={`progress-bar-fill ${hasOverdue ? 'danger' : progress === 100 ? 'success' : ''}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          {hasOverdue && (
            <div className="customer-card-overdue">
              ⚠ Rate scadute
            </div>
          )}
        </div>
      )}

      <div className="customer-card-hover-hint">
        Clicca per dettagli →
      </div>

      <style>{`
        .customer-card {
          background: var(--bg-card);
          border-radius: var(--radius-lg);
          padding: 20px;
          border: 1px solid var(--border-light);
          box-shadow: var(--shadow-card);
          cursor: pointer;
          transition: all var(--duration-normal) var(--ease-out);
          position: relative;
          overflow: hidden;
          animation: fadeInUp 0.4s var(--ease-out) both;
        }

        .customer-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0;
          width: 3px; height: 100%;
          border-radius: 3px 0 0 3px;
          transition: width var(--duration-normal) var(--ease-out);
        }

        .customer-card-status-prospect::before { background: var(--kanban-prospect); }
        .customer-card-status-working::before { background: var(--kanban-working); }
        .customer-card-status-completed::before { background: var(--kanban-completed); }
        .customer-card-status-paused::before { background: var(--kanban-paused); }

        .customer-card:hover {
          box-shadow: var(--shadow-card-hover);
          transform: translateY(-3px);
          border-color: var(--primary-light);
        }

        .customer-card:hover::before {
          width: 4px;
        }

        .customer-card:active {
          transform: translateY(-1px);
        }

        .customer-card-top {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .customer-card-avatar {
          width: 42px; height: 42px;
          border-radius: var(--radius-md);
          background: linear-gradient(135deg, var(--primary), var(--primary-dark));
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 1rem;
          flex-shrink: 0;
        }

        .customer-card-info {
          flex: 1;
          min-width: 0;
        }

        .customer-card-name {
          font-size: 0.9375rem;
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .customer-card-company {
          font-size: 0.8125rem;
          color: var(--text-secondary);
        }

        .customer-card-package {
          margin-top: 12px;
          padding: 6px 10px;
          background: var(--bg-input);
          border-radius: var(--radius-sm);
          font-size: 0.8125rem;
          color: var(--text-secondary);
          display: inline-block;
        }

        .customer-card-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-top: 10px;
        }

        .card-tag-badge {
          display: none;
        }

        .customer-card-finance {
          margin-top: 14px;
          padding-top: 14px;
          border-top: 1px solid var(--border-light);
        }

        .customer-card-finance-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .customer-card-finance-label {
          font-size: 0.75rem;
          color: var(--text-secondary);
          font-weight: 500;
        }

        .customer-card-finance-amount {
          font-size: 0.75rem;
          color: var(--text-primary);
          font-weight: 600;
        }

        .customer-card-overdue {
          margin-top: 8px;
          font-size: 0.75rem;
          color: var(--danger);
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .customer-card-hover-hint {
          position: absolute;
          bottom: 8px; right: 14px;
          font-size: 0.6875rem;
          color: var(--text-tertiary);
          opacity: 0;
          transform: translateX(-4px);
          transition: all var(--duration-normal) var(--ease-out);
        }

        .customer-card:hover .customer-card-hover-hint {
          opacity: 1;
          transform: translateX(0);
        }
      `}</style>
    </div>
  );
}
