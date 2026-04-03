import { useState, useMemo, useCallback } from 'react';

export default function TaskFilterModal({ customers, onClose, onSelectCustomer }) {
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [customerFilter, setCustomerFilter] = useState('all');

  // Extract all tasks from all customers
  const allTasks = useMemo(() => {
    const tasks = [];
    
    customers.forEach(customer => {
      const extractTasks = (taskList, parentTask = null) => {
        taskList.forEach(task => {
          if (!task.completed) {
            tasks.push({
              id: task.id,
              text: task.text,
              customerName: customer.name,
              customerId: customer.id,
              customer: customer,
              priority: task.priority || 'Media',
              dueDate: task.dueDate,
              parentTask: parentTask
            });
          }
          
          // Recursively extract subtasks
          if (task.subtasks && task.subtasks.length > 0) {
            extractTasks(task.subtasks, task);
          }
        });
      };
      
      extractTasks(customer.todo || []);
    });
    
    return tasks;
  }, [customers]);

  // Filter tasks based on selected filters
  const filteredTasks = useMemo(() => {
    let filtered = allTasks;
    
    // Filter by priority
    if (priorityFilter !== 'all') {
      filtered = filtered.filter(task => task.priority === priorityFilter);
    }
    
    // Filter by customer
    if (customerFilter !== 'all') {
      filtered = filtered.filter(task => task.customerId === customerFilter);
    }
    
    return filtered;
  }, [allTasks, priorityFilter, customerFilter]);

  const handleTaskClick = useCallback((task) => {
    onSelectCustomer(task.customer);
    // Set active tab to 'todo' after a short delay to ensure customer detail is loaded
    setTimeout(() => {
      const event = new CustomEvent('setActiveTab', { detail: 'todo' });
      window.dispatchEvent(event);
    }, 100);
    onClose();
  }, [onSelectCustomer, onClose]);

  const formatDate = (dateString) => {
    if (!dateString) return 'Nessuna scadenza';
    return new Date(dateString).toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'Alta': return 'var(--danger)';
      case 'Media': return 'var(--warning)';
      case 'Bassa': return 'var(--success)';
      default: return 'var(--text-secondary)';
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1200 }}>
      <div className="modal-content animate-scale-in" style={{ maxWidth: '1200px', width: '95vw', maxHeight: '90vh', padding: '24px' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"></path>
              <path d="M7 12h10"></path>
              <path d="M10 18h4"></path>
            </svg>
            Tutti i Task da Fare
          </h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '200px' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Priorità</label>
            <div className="app-dropdown-wrapper">
              <select 
                className="app-dropdown-select" 
                value={priorityFilter} 
                onChange={e => setPriorityFilter(e.target.value)}
              >
                <option value="all">Tutte le priorità</option>
                <option value="Alta">Alta</option>
                <option value="Media">Media</option>
                <option value="Bassa">Bassa</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '250px' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Cliente</label>
            <div className="app-dropdown-wrapper">
              <select 
                className="app-dropdown-select" 
                value={customerFilter} 
                onChange={e => setCustomerFilter(e.target.value)}
              >
                <option value="all">Tutti i clienti</option>
                {customers.map(customer => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', marginLeft: 'auto' }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>
              {filteredTasks.length} task trovati
            </div>
          </div>
        </div>

        {/* Tasks Table */}
        <div style={{ maxHeight: '60vh', overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)' }}>
          {filteredTasks.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
              <div style={{ fontSize: '3rem', marginBottom: '16px' }}>
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.3">
                  <path d="M3 6h18"></path>
                  <path d="M7 12h10"></path>
                  <path d="M10 18h4"></path>
                </svg>
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '8px' }}>Nessun task trovato</div>
              <div style={{ fontSize: '0.9rem' }}>Prova a cambiare i filtri per vedere più risultati</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-input)', borderBottom: '2px solid var(--border)' }}>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-primary)' }}>Task</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-primary)' }}>Cliente</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-primary)' }}>Priorità</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-primary)' }}>Scadenza</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((task, index) => (
                  <tr 
                    key={task.id}
                    onClick={() => handleTaskClick(task)}
                    style={{ 
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--border-light)',
                      transition: 'background-color 0.2s',
                      backgroundColor: index % 2 === 0 ? 'var(--bg-input)' : 'transparent'
                    }}
                  >
                    <td style={{ padding: '12px', verticalAlign: 'top' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{task.text}</span>
                        {task.parentTask && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                            → Sottotask di: {task.parentTask.text}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ 
                          width: '24px', 
                          height: '24px', 
                          borderRadius: '50%', 
                          background: 'var(--primary-ghost)', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          fontSize: '0.7rem', 
                          fontWeight: 700, 
                          color: 'var(--primary)',
                          flexShrink: 0
                        }}>
                          {task.customerName.charAt(0).toUpperCase()}
                        </div>
                        <span style={{ color: 'var(--text-secondary)' }}>{task.customerName}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span 
                        style={{ 
                          padding: '4px 8px', 
                          borderRadius: '4px', 
                          fontSize: '0.75rem', 
                          fontWeight: 600, 
                          color: 'white',
                          backgroundColor: getPriorityColor(task.priority),
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {task.priority}
                      </span>
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      {formatDate(task.dueDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <style>{`
          .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            animation: fadeIn 0.3s ease-out;
            z-index: 1200;
          }

          .modal-content {
            background: var(--bg-card);
            border-radius: var(--radius-lg);
            box-shadow: var(--shadow-xl);
            display: flex;
            flex-direction: column;
            max-height: 90vh;
            overflow: hidden;
          }

          .app-dropdown-wrapper {
            position: relative;
            width: 100%;
          }

          .app-dropdown-select {
            width: 100%;
            padding: 8px 32px 8px 12px;
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            background: var(--bg-input);
            color: var(--text-primary);
            font-size: 0.9rem;
            cursor: pointer;
            appearance: none;
            transition: all 0.2s ease;
            position: relative;
          }

          .app-dropdown-select:hover {
            border-color: var(--primary);
            background: var(--bg-card);
          }

          .app-dropdown-select:focus {
            outline: none;
            border-color: var(--primary);
            box-shadow: 0 0 0 2px var(--primary-ghost);
          }

          .app-dropdown-wrapper::after {
            content: '';
            position: absolute;
            top: 50%;
            right: 12px;
            transform: translateY(-50%);
            width: 0;
            height: 0;
            border-left: 4px solid transparent;
            border-right: 4px solid transparent;
            border-top: 4px solid var(--text-tertiary);
            pointer-events: none;
            transition: all 0.2s ease;
          }

          .app-dropdown-wrapper:hover::after {
            border-top-color: var(--primary);
          }

          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }

          @keyframes scaleIn {
            from { 
              opacity: 0;
              transform: scale(0.9);
            }
            to { 
              opacity: 1;
              transform: scale(1);
            }
          }

          .animate-scale-in {
            animation: scaleIn 0.2s ease-out;
          }

          table th {
            position: sticky;
            top: 0;
            z-index: 10;
          }

          table tbody tr {
            transition: background-color 0.2s ease;
          }

          table tbody tr:hover {
            background-color: var(--primary-ghost) !important;
          }

          table th {
            white-space: nowrap;
          }

          table td {
            white-space: nowrap;
          }

          table td:nth-child(1) {
            white-space: normal;
            max-width: 300px;
            word-wrap: break-word;
          }

          @media (max-width: 768px) {
            .modal-content {
              width: 98vw;
              padding: 16px;
              max-height: 95vh;
            }

            .app-dropdown-wrapper {
              min-width: 150px;
            }

            table {
              font-size: 0.85rem;
            }

            table td:nth-child(1) {
              max-width: 200px;
            }
          }
        `}</style>
      </div>
    </div>
  );
}
