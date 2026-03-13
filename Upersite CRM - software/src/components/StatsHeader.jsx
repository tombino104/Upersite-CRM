import { useMemo } from 'react';

export default function StatsHeader({ customers, onOpenCharts, onOpenClients, onOpenOverdue }) {
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

  return (
    <div className="stats-header">
      <div className="stat-card" onClick={onOpenClients} style={{ cursor: 'pointer' }} title="Vedi tutti i clienti">
        <div className="stat-icon" style={{ background: 'var(--primary-ghost)', color: 'var(--primary)' }}>👥</div>
        <div className="stat-info">
          <span className="stat-value">{stats.customerCount}</span>
          <span className="stat-label">Clienti</span>
        </div>
      </div>

      <div className="stat-card" onClick={onOpenCharts} style={{ cursor: 'pointer' }} title="Vedi grafici">
        <div className="stat-icon" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>💰</div>
        <div className="stat-info">
          <span className="stat-value">{formatCurrency(stats.totalCollected)}</span>
          <span className="stat-label">Incassato</span>
        </div>
      </div>

      <div className="stat-card" onClick={onOpenCharts} style={{ cursor: 'pointer' }} title="Vedi grafici">
        <div className="stat-icon" style={{ background: 'var(--info-bg)', color: 'var(--info)' }}>📊</div>
        <div className="stat-info">
          <span className="stat-value">{formatCurrency(stats.totalPending)}</span>
          <span className="stat-label">Da incassare</span>
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
}
