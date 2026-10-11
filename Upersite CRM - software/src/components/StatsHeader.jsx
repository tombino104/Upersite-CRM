import { useMemo, memo } from 'react';

const StatsHeader = memo(({ customers, onOpenCharts, onOpenClients, onOpenOverdue, onSelectCustomer, onOpenTransactions }) => {
  const stats = useMemo(() => {
    let totalQuoted = 0;
    let totalCollected = 0;
    let totalPending = 0;
    let overdueCount = 0;
    const now = new Date();

    customers.forEach(c => {
      const quote = parseFloat(c.quoteAmount) || 0;
      totalQuoted += quote;

      (c.installments || []).forEach(inst => {
        const amount = parseFloat(inst.amount) || 0;
        if (inst.paid) {
          totalCollected += amount;
        } else {
          totalPending += amount;
          if (inst.dueDate && new Date(inst.dueDate) < now) {
            overdueCount++;
          }
        }
      });
    });

    return { totalQuoted, totalCollected, totalPending, overdueCount, customerCount: customers.length };
  }, [customers]);

  const formatCurrency = (n) => {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
  };

  const recentTransactions = useMemo(() => {
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
    }).slice(0, 5);
  }, [customers]);

  return (
    <div className="stats-header">
      <div className="stat-card" onClick={onOpenClients} style={{ cursor: 'pointer' }} title="Vedi tutti i clienti">
        <div className="stat-icon" style={{ background: 'var(--primary-ghost)', color: 'var(--primary)' }}>👥</div>
        <div className="stat-info">
          <span className="stat-value">{stats.customerCount}</span>
          <span className="stat-label">Clienti</span>
        </div>
      </div>

      <div className="stat-card" onClick={() => onOpenCharts('all')} style={{ cursor: 'pointer' }} title="Vedi grafici finanziari">
        <div className="stat-icon" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>💰</div>
        <div className="stat-info">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span className="stat-value" style={{ fontSize: '1rem' }}>
              <span style={{ color: 'var(--success)' }}>{formatCurrency(stats.totalCollected)}</span>
              <span style={{ color: 'var(--text-tertiary)', margin: '0 4px' }}>/</span>
              <span style={{ color: 'var(--info)' }}>{formatCurrency(stats.totalPending)}</span>
            </span>
            <span className="stat-label">Incassato / Da incassare</span>
          </div>
        </div>
      </div>

      <div className="stat-card" onClick={onOpenTransactions} style={{ cursor: 'pointer' }} title="Vedi movimenti recenti">
        <div className="stat-icon" style={{ background: 'var(--info-bg)', color: 'var(--info)' }}>💳</div>
        <div className="stat-info">
          <span className="stat-value">{recentTransactions.length}</span>
          <span className="stat-label">Transazioni Recenti</span>
        </div>
      </div>

      <div className="stat-card" onClick={onOpenOverdue} style={{ cursor: 'pointer' }} title="Vedi rate scadute">
        <div className={`stat-icon ${stats.overdueCount > 0 ? 'stat-icon-alert' : ''}`}
          style={{
            background: stats.overdueCount > 0 ? 'var(--danger-bg)' : 'var(--warning-bg)',
            color: stats.overdueCount > 0 ? 'var(--danger)' : '#E17055'
          }}>
          ⚠️
        </div>
        <div className="stat-info">
          <span className="stat-value">{stats.overdueCount}</span>
          <span className="stat-label">Rate scadute</span>
        </div>
      </div>

      <style>{`
        .stats-header {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          margin-bottom: 24px;
          animation: fadeInUp 0.5s var(--ease-out);
        }

        @media (max-width: 900px) {
          .stats-header { grid-template-columns: repeat(2, 1fr); }
        }

        @media (max-width: 500px) {
          .stats-header { grid-template-columns: 1fr; }
        }

        .stat-card {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 18px 20px;
          background: var(--bg-card);
          border-radius: var(--radius-lg);
          border: 1px solid var(--border-light);
          box-shadow: var(--shadow-xs);
          transition: all var(--duration-normal) var(--ease-out);
        }

        .stat-card:hover {
          box-shadow: var(--shadow-sm);
          transform: translateY(-2px);
        }

        .stat-icon {
          width: 44px; height: 44px;
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.25rem;
          flex-shrink: 0;
        }

        .stat-icon-alert {
          animation: pulse 1.5s ease-in-out infinite;
        }

        .stat-info {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .stat-value {
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--text-primary);
          line-height: 1.2;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .stat-label {
          font-size: 0.75rem;
          color: var(--text-secondary);
          font-weight: 500;
          margin-top: 2px;
        }

      `}</style>
    </div>
  );
});

export default StatsHeader;
