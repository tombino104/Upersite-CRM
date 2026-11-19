import { useState, useRef, memo } from 'react';
import CustomerCard from './CustomerCard';

const COLUMNS = [
  { id: 'prospect', label: 'Prospect', icon: '🎯', color: 'var(--kanban-prospect)' },
  { id: 'working', label: 'In lavorazione', icon: '⚙️', color: 'var(--kanban-working)' },
  { id: 'paused', label: 'Sospeso', icon: '⏸️', color: 'var(--kanban-paused)' },
  { id: 'completed', label: 'Completato', icon: '✅', color: 'var(--kanban-completed)' },
];

const KanbanView = memo(({ customers, onSelectCustomer, onUpdateCustomerStatus }) => {
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);
  const [paymentWarning, setPaymentWarning] = useState(null);
  const dragCounter = useRef({});

  const grouped = {};
  COLUMNS.forEach(col => { grouped[col.id] = []; });
  customers.forEach(c => {
    const status = c.status || 'prospect';
    if (grouped[status]) grouped[status].push(c);
    else grouped.prospect.push(c);
  });

  const handleDragStart = (e, customerId) => {
    setDraggedId(customerId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', customerId);
    if (e.target) {
      e.target.style.opacity = '0.5';
    }
  };

  const handleDragEnd = (e) => {
    setDraggedId(null);
    setDragOverColumn(null);
    dragCounter.current = {};
    if (e.target) {
      e.target.style.opacity = '1';
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (e, columnId) => {
    e.preventDefault();
    dragCounter.current[columnId] = (dragCounter.current[columnId] || 0) + 1;
    setDragOverColumn(columnId);
  };

  const handleDragLeave = (e, columnId) => {
    dragCounter.current[columnId] = (dragCounter.current[columnId] || 0) - 1;
    if (dragCounter.current[columnId] <= 0) {
      dragCounter.current[columnId] = 0;
      if (dragOverColumn === columnId) {
        setDragOverColumn(null);
      }
    }
  };

  const handleDrop = (e, columnId) => {
    e.preventDefault();
    setDragOverColumn(null);
    dragCounter.current = {};
    const droppedId = e.dataTransfer.getData('text/plain') || draggedId;
    if (droppedId) {
      const customer = customers.find(c => c.id === droppedId);
      if (customer && customer.status !== columnId) {
        if (columnId === 'completed') {
          const unpaid = (customer.installments || []).filter(i => !i.paid);
          if (unpaid.length > 0) {
            setPaymentWarning({ customerId: droppedId, customer });
            setDraggedId(null);
            return;
          }
        }
        onUpdateCustomerStatus(droppedId, columnId);
      }
    }
    setDraggedId(null);
  };

  return (
    <div className="kanban-board">
      {COLUMNS.map((col, colIdx) => (
        <div
          key={col.id}
          className={`kanban-column ${dragOverColumn === col.id ? 'kanban-column-drag-over' : ''}`}
          style={{ animationDelay: `${colIdx * 80}ms` }}
          onDragOver={handleDragOver}
          onDragEnter={(e) => handleDragEnter(e, col.id)}
          onDragLeave={(e) => handleDragLeave(e, col.id)}
          onDrop={(e) => handleDrop(e, col.id)}
        >
          <div className="kanban-column-header">
            <div className="kanban-column-indicator" style={{ background: col.color }} />
            <span className="kanban-column-icon">{col.icon}</span>
            <h3 className="kanban-column-title">{col.label}</h3>
            <span className="kanban-column-count">{grouped[col.id].length}</span>
          </div>
          <div className="kanban-column-body">
            {grouped[col.id].length === 0 && (
              <div className="kanban-empty">
                {draggedId ? (
                  <span>Rilascia qui</span>
                ) : (
                  <span>Nessun cliente</span>
                )}
              </div>
            )}
            {grouped[col.id].map((customer, idx) => (
              <div
                key={customer.id}
                draggable
                onDragStart={(e) => handleDragStart(e, customer.id)}
                onDragEnd={handleDragEnd}
                className={`kanban-card-wrapper ${draggedId === customer.id ? 'kanban-card-dragging' : ''}`}
              >
                <CustomerCard
                  customer={customer}
                  onClick={() => onSelectCustomer(customer)}
                  index={idx}
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Payment Warning Modal */}
      {paymentWarning && (() => {
        const c = paymentWarning.customer;
        const unpaid = (c.installments || []).filter(i => !i.paid);
        const totalUnpaid = unpaid.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
        return (
          <div className="modal-overlay animate-fade-in" style={{ zIndex: 2200 }} onClick={() => setPaymentWarning(null)}>
            <div className="modal-content animate-scale-in" style={{ maxWidth: '420px', padding: '32px', borderTop: '4px solid var(--danger)' }} onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: '3rem', textAlign: 'center', marginBottom: '8px' }}>⚠️</div>
              <h3 style={{ textAlign: 'center', color: 'var(--danger)', margin: '0 0 12px 0', fontSize: '1.1rem' }}>
                Rate in Sospeso!
              </h3>
              <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5, margin: '0 0 8px 0' }}>
                <strong>{c.name}</strong> ha ancora <strong style={{ color: 'var(--danger)' }}>{unpaid.length} {unpaid.length === 1 ? 'rata' : 'rate'}</strong> da pagare
                per un totale di <strong style={{ color: 'var(--danger)' }}>€{totalUnpaid.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</strong>.
              </p>
              <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.8rem', margin: '0 0 20px 0' }}>
                Sei sicuro di volerlo spostare in <strong>Completato</strong>?
              </p>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                <button className="btn btn-danger" onClick={() => {
                  onUpdateCustomerStatus(paymentWarning.customerId, 'completed');
                  setPaymentWarning(null);
                }}>Completa Comunque</button>
                <button className="btn btn-secondary" onClick={() => setPaymentWarning(null)}>Annulla</button>
              </div>
            </div>
          </div>
        );
      })()}

      <style>{`
        .kanban-board {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          min-height: 400px;
          animation: fadeIn 0.4s var(--ease-out);
        }

        @media (max-width: 1200px) {
          .kanban-board { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 600px) {
          .kanban-board { grid-template-columns: 1fr; }
        }

        .kanban-column {
          display: flex;
          flex-direction: column;
          background: var(--bg);
          border-radius: var(--radius-lg);
          border: 2px solid var(--border-light);
          overflow: hidden;
          animation: fadeInUp 0.5s var(--ease-out) both;
          transition: border-color var(--duration-normal) var(--ease-out),
                      background var(--duration-normal) var(--ease-out),
                      box-shadow var(--duration-normal) var(--ease-out);
        }

        .kanban-column-drag-over {
          border-color: var(--primary-light);
          background: var(--primary-ghost);
          box-shadow: 0 0 0 4px var(--primary-ghost);
        }

        .kanban-column-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 14px 16px;
          background: var(--bg-card);
          border-bottom: 1px solid var(--border-light);
          position: sticky;
          top: 0;
        }

        .kanban-column-indicator { width: 4px; height: 20px; border-radius: 2px; }
        .kanban-column-icon { font-size: 0.875rem; }
        .kanban-column-title { font-size: 0.8125rem; font-weight: 600; color: var(--text-primary); flex: 1; }

        .kanban-column-count {
          min-width: 24px; height: 24px;
          display: flex; align-items: center; justify-content: center;
          background: var(--bg-input); border-radius: var(--radius-full);
          font-size: 0.75rem; font-weight: 600; color: var(--text-secondary);
        }

        .kanban-column-body {
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          flex: 1;
          min-height: 100px;
        }

        .kanban-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          color: var(--text-tertiary);
          font-size: 0.8125rem;
          border: 2px dashed var(--border);
          border-radius: var(--radius-md);
          opacity: 0.6;
          transition: all var(--duration-normal);
        }

        .kanban-column-drag-over .kanban-empty {
          border-color: var(--primary-light);
          color: var(--primary);
          opacity: 1;
          background: rgba(31, 107, 79, 0.04);
        }

        .kanban-card-wrapper {
          transition: transform var(--duration-fast), opacity var(--duration-fast);
          cursor: grab;
        }

        .kanban-card-wrapper:active {
          cursor: grabbing;
        }

        .kanban-card-dragging {
          opacity: 0.4;
          transform: scale(0.95);
        }
      `}</style>
    </div>
  );
});

export default KanbanView;
