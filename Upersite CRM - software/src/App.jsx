import { useState, useCallback, useEffect, useRef, useMemo, memo } from 'react';
import Login from './components/Login';
import StatsHeader from './components/StatsHeader';
import KanbanView from './components/KanbanView';
import ListView from './components/ListView';
import CalendarView from './components/CalendarView';
import CustomerDetail from './components/CustomerDetail';
import EarningsChartModal from './components/EarningsChartModal';
import OverdueModal from './components/OverdueModal';
import ClientListModal from './components/ClientListModal';
import SettingsModal from './components/SettingsModal';
import DataGridView from './components/DataGridView';
import GeminiChat from './components/GeminiChat';
import { useCustomers, useInactivityTimeout, useSearch } from './hooks/useCustomers';
import { exportData, importData, loadData, saveData, hasMasterPassword, syncWithFileSystem, triggerAutoBackup } from './utils/storage';
import { APP_VERSION, formatVersionDisplay, copyVersionToClipboard } from './utils/version';

/* ── Notification Component (Hoisted/Top-level) ── */
const NotificationBell = memo(({ count, isOpen, setIsOpen, notifications, toggleRead, customers, setSelectedCustomer }) => {
  return (
    <div className="app-menu-wrapper" style={{ overflow: 'visible', position: 'relative' }}>
      <button
        className="btn btn-secondary btn-sm"
        style={{ marginRight: '16px', position: 'relative', overflow: 'visible', zIndex: 101 }}
        onClick={() => setIsOpen(!isOpen)}
        title="Notifiche"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
              </svg>
        {count > 0 && (
          <span style={{
            position: 'absolute',
            top: '-8px',
            right: '8px',
            background: 'var(--danger)',
            color: '#fff',
            fontSize: '0.65rem',
            fontWeight: 'bold',
            minWidth: '18px',
            height: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 4px',
            borderRadius: '10px',
            zIndex: 110,
            border: '2px solid #fff',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            {count}
          </span>
        )}
      </button>
      {isOpen && (
        <div className="app-dropdown animate-scale-in" style={{ top: '44px', left: '-280px', width: '350px', padding: '0' }}>
          <div style={{ padding: '12px 16px', background: 'var(--bg-input)', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0, fontSize: '0.85rem' }}>📢 Notifiche Aggiornate</h4>
            {count > 0 && (
              <span style={{ fontSize: '0.7rem', color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }} onClick={() => {
                notifications.forEach(n => {
                  if (!n.readAt) toggleRead(n.clientId, n.id, n.type);
                });
              }}>
                Segna tutti
              </span>
            )}
          </div>
          <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
            {notifications.length === 0 && (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>
                Nessuna notifica presente.
              </div>
            )}
            {notifications.map(n => (
              <div key={`${n.type}-${n.id}`}
                className="notification-item"
                onClick={() => {
                  const client = customers.find(c => c.id === n.clientId);
                  if (client) setSelectedCustomer(client);
                  setIsOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--border-light)',
                  borderLeft: !n.readAt ? '4px solid var(--primary)' : '4px solid transparent',
                  gap: '12px',
                  cursor: 'pointer',
                  background: !n.readAt ? 'rgba(108, 92, 231, 0.04)' : 'transparent',
                  transition: 'all 0.2s'
                }}>
                <div style={{ fontSize: '1.2rem', marginTop: '2px' }}>
                  {n.type === 'todo' ? '☑️' : '💶'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>{n.clientName}</span>
                    {n.isOverdue && <span style={{ fontSize: '0.6rem', color: 'var(--danger)', fontWeight: 700 }}>SCADUTO</span>}
                    {n.isNear && <span style={{ fontSize: '0.6rem', color: 'var(--warning)', fontWeight: 700 }}>IN SCADENZA</span>}
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-primary)', fontWeight: !n.readAt ? 600 : 400, wordBreak: 'break-word', lineHeight: 1.4 }}>
                    {n.text}
                    {n.recurrence && <span style={{ marginLeft: '6px', fontSize: '0.65rem', background: 'var(--primary-light)', color: '#fff', padding: '1px 6px', borderRadius: '4px' }}>{n.recurrence}</span>}
                  </div>
                </div>
                <button className="btn btn-ghost btn-icon-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleRead(n.clientId, n.id, n.type);
                  }}
                  title={n.readAt ? "Segna come da leggere" : "Segna come letto"}
                  style={{ fontSize: '0.8rem', flexShrink: 0, opacity: 0.6 }}>
                  {n.readAt ? <span className="material-symbols-outlined" style={{fontSize: '1rem'}}>visibility</span> : <span className="material-symbols-outlined" style={{fontSize: '1rem'}}>visibility_off</span>}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

/* ── Tag Manager Modal ── */
function TagManagerModal({ allTags, customers, updateTags, updateCustomer, onClose }) {
  const [confirmTag, setConfirmTag] = useState(null); // tag pending deletion

  const executeDelete = (tag) => {
    const inUseBy = customers.filter(c => (c.tags || []).includes(tag));
    inUseBy.forEach(c => {
      updateCustomer(c.id, { ...c, tags: c.tags.filter(t => t !== tag) });
    });
    updateTags(allTags.filter(t => t !== tag));
    setConfirmTag(null);
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1200 }}>
      <div className="modal-content animate-scale-in" style={{ maxWidth: '500px', padding: '24px' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                <line x1="7" y1="7" x2="7.01" y2="7"></line>
              </svg> 
            Gestione Tag
          </h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>

        <form
          onSubmit={e => {
            e.preventDefault();
            const v = e.target.elements.newTag.value.trim();
            if (v && !allTags.includes(v)) {
              updateTags([...allTags, v]);
              e.target.reset();
            }
          }}
          style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}
        >
          <input name="newTag" className="input" placeholder="Nuovo tag..." style={{ flex: 1 }} />
          <button type="submit" className="btn btn-primary">Aggiungi</button>
        </form>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
          {allTags.length === 0 && <span style={{ color: 'var(--text-tertiary)' }}>Nessun tag presente.</span>}
          {allTags.map(tag => {
            const inUseBy = customers.filter(c => (c.tags || []).includes(tag));
            return (
              <div key={tag} className="tag-badge" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', padding: '6px 10px' }}>
                {tag}
                {inUseBy.length > 0 && (
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', background: 'rgba(0,0,0,0.06)', padding: '1px 5px', borderRadius: '8px' }}>
                    {inUseBy.length}
                  </span>
                )}
                <button
                  className="btn btn-ghost btn-icon-sm"
                  style={{ fontSize: '0.8rem', opacity: 0.7 }}
                  onClick={() => {
                    if (inUseBy.length > 0) {
                      setConfirmTag(tag);
                    } else {
                      updateTags(allTags.filter(t => t !== tag));
                    }
                  }}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Delete confirmation overlay */}
      {confirmTag && (() => {
        const inUseBy = customers.filter(c => (c.tags || []).includes(confirmTag));
        return (
          <div className="modal-overlay animate-fade-in" style={{ zIndex: 1300 }} onClick={() => setConfirmTag(null)}>
            <div className="modal-content animate-scale-in" style={{ maxWidth: '420px', padding: '28px', borderTop: '4px solid var(--warning)' }} onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: '2.5rem', textAlign: 'center', marginBottom: '8px' }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                  <line x1="7" y1="7" x2="7.01" y2="7"></line>
                </svg>
              </div>
              <h3 style={{ textAlign: 'center', color: 'var(--warning)', margin: '0 0 12px 0', fontSize: '1.05rem' }}>
                Eliminare il tag "{confirmTag}"?
              </h3>
              <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5, margin: '0 0 12px 0' }}>
                Questo tag è utilizzato da <strong style={{ color: 'var(--danger)' }}>{inUseBy.length} {inUseBy.length === 1 ? 'cliente' : 'clienti'}</strong>:
              </p>
              <div style={{ maxHeight: '120px', overflowY: 'auto', marginBottom: '20px', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', padding: '8px 12px' }}>
                {inUseBy.map(c => (
                  <div key={c.id} style={{ fontSize: '0.8rem', color: 'var(--text-primary)', padding: '3px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--primary-ghost)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700, color: 'var(--primary)', flexShrink: 0 }}>
                      {(c.name || '?').charAt(0).toUpperCase()}
                    </span>
                    {c.name}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                <button className="btn btn-danger" onClick={() => executeDelete(confirmTag)}>Elimina Tag</button>
                <button className="btn btn-secondary" onClick={() => setConfirmTag(null)}>Annulla</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// Utils
const isSameDay = (d1, d2) => 
  d1.getFullYear() === d2.getFullYear() && 
  d1.getMonth() === d2.getMonth() && 
  d1.getDate() === d2.getDate();

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showClientMenu, setShowClientMenu] = useState(false);
  const [showCharts, setShowCharts] = useState(false);
  const [showOverdue, setShowOverdue] = useState(false);
  const [showClientList, setShowClientList] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDataGridView, setShowDataGridView] = useState(false);
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  
  const searchInputRef = useRef(null);
  const notifiedIdsRef = useRef(new Set());

  // Request Desktop Notification permissions
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Focus search on Spacebar press if not typing in an input
      if (e.key === ' ' &&
        document.activeElement.tagName !== 'INPUT' &&
        document.activeElement.tagName !== 'TEXTAREA' &&
        !document.activeElement.isContentEditable) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }

      // Close modals on Escape key
      if (e.key === 'Escape') {
        if (showCharts) setShowCharts(false);
        else if (showOverdue) setShowOverdue(false);
        else if (showClientList) setShowClientList(false);
        else if (showSettings) setShowSettings(false);
        else if (showDataGridView) setShowDataGridView(false);
        else if (showTagMenu) setShowTagMenu(false);
        else if (showNotifications) setShowNotifications(false);
        else if (showCalendar) setShowCalendar(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCharts, showOverdue, showClientList, showSettings, showDataGridView, showTagMenu, showNotifications]);

  const {
    customers, tags, settings, events, hasSynced,
    chatHistory, aiUsageStats,
    addCustomer, updateCustomer, deleteCustomer, setCustomers,
    updateSettings, updateTags, updateEvents,
    updateChatHistory, updateAiUsageStats
  } = useCustomers();

  // Unified preferences sync
  const viewMode = settings.viewMode || 'kanban';
  const setViewMode = (mode) => updateSettings({ viewMode: mode });

  const filteredCustomers = useSearch(customers, searchQuery);

  const allTags = tags.length > 0 ? tags : [...new Set(customers.flatMap(c => c.tags || []))];

  const notifications = useMemo(() => {
    const list = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nearDeadline = new Date(today);
    nearDeadline.setDate(today.getDate() + 3);

    customers.forEach(client => {
      // 1. Recurring Todos
      const traverse = (tasks) => {
        (tasks || []).forEach(t => {
          if (t.dueDate) {
            const dDate = new Date(t.dueDate);
            const isToday = isSameDay(dDate, today);
            const isOverdue = dDate < today && !t.completed;
            
            if (isToday || isOverdue) {
              list.push({
                id: t.id,
                clientId: client.id,
                clientName: client.name,
                text: `${t.text} (${isToday ? 'OGGI' : 'SCADUTO'})`,
                type: 'todo',
                isUrgent: true,
                readAt: t.readAt,
                createdAt: t.dueDate
              });
            }
          }
          if (t.subtasks && t.subtasks.length > 0) traverse(t.subtasks);
        });
      };
      traverse(client.todo);

      // 2. Overdue or Near-Deadline Installments
      (client.installments || []).forEach(inst => {
        if (!inst.paid && inst.dueDate) {
          const dDate = new Date(inst.dueDate);
          const isOverdue = dDate < today;
          const isNear = dDate >= today && dDate <= nearDeadline;

          if (isOverdue || isNear) {
            list.push({
              id: inst.id,
              clientId: client.id,
              clientName: client.name,
              text: `Rata ${inst.amount ? '€' + inst.amount : ''} ${isOverdue ? 'SCADUTA' : 'in scadenza'} (${new Date(inst.dueDate).toLocaleDateString()})`,
              type: 'payment',
              isOverdue,
              isNear,
              readAt: inst.readAt,
              createdAt: inst.dueDate
            });
          }
        }
      });
    });
    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [customers]);

  // Trigger Desktop Notifications for new urgent items
  useEffect(() => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    notifications.forEach(n => {
      // Notify only for unread, urgent items we haven't notified for in this session
      const isUrgent = n.isOverdue || n.isNear;
      if (!n.readAt && isUrgent && !notifiedIdsRef.current.has(n.id)) {
        new Notification(`Upersite CRM: ${n.clientName}`, {
          body: n.text,
          icon: '/favicon.ico' // Or any app icon
        });
        notifiedIdsRef.current.add(n.id);
      }
    });
  }, [notifications]);

  const unreadNotificationsCount = notifications.filter(n => !n.readAt).length;

  const toggleNotificationRead = (clientId, itemId, type) => {
    const client = customers.find(c => c.id === clientId);
    if (!client) return;

    if (type === 'todo') {
      const toggleRecursive = (items) => items.map(t => {
        if (t.id === itemId) return { ...t, readAt: t.readAt ? null : new Date().toISOString() };
        if (t.subtasks && t.subtasks.length > 0) return { ...t, subtasks: toggleRecursive(t.subtasks) };
        return t;
      });
      updateCustomer(clientId, { ...client, todo: toggleRecursive(client.todo || []) });
    } else if (type === 'payment') {
      const updatedInst = (client.installments || []).map(inst =>
        inst.id === itemId ? { ...inst, readAt: inst.readAt ? null : new Date().toISOString() } : inst
      );
      updateCustomer(clientId, { ...client, installments: updatedInst });
    }
  };

  useEffect(() => {
    if (hasSynced && tags.length === 0) {
      const derived = [...new Set(customers.flatMap(c => c.tags || []))];
      if (derived.length > 0) updateTags(derived);
    }
  }, [hasSynced, tags.length, customers, updateTags]);

  const handleLogout = useCallback(() => {
    setIsLoggedIn(false);
  }, []);

  const handleEndSession = () => {
    if (settings.backupPath) {
      triggerAutoBackup().catch(err => console.error('Background backup failed:', err));
    }
    setIsLoggedIn(false);
    setShowExportMenu(false);
  };

  useInactivityTimeout(settings.inactivityTimeout || 5 * 60 * 1000, handleLogout);

  const handleSave = (customer) => {
    const customerTags = customer.tags || [];
    const newTags = customerTags.filter(t => !allTags.includes(t));
    if (newTags.length > 0) {
      updateTags([...allTags, ...newTags]);
    }

    const exists = customers.find(c => c.id === customer.id);
    if (exists) {
      updateCustomer(customer.id, customer);
    } else {
      addCustomer(customer);
    }
    setSelectedCustomer(null);
    setShowNew(false);
  };

  const handleDelete = (id) => {
    deleteCustomer(id);
    setSelectedCustomer(null);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const ok = await importData(ev.target.result);
        if (ok) {
          syncWithFileSystem().then((data) => {
            setCustomers(data.customers || []);
            setShowExportMenu(false);
          }).catch(() => {
            const data = loadData();
            setCustomers(data.customers || []);
            setShowExportMenu(false);
          });
        } else {
          alert('File non valido');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  if (!hasSynced) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)', color: 'var(--primary)' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ marginBottom: '16px' }}></div>
          <div style={{ fontWeight: 600 }}>Sincronizzazione dati locali...</div>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Login onLogin={() => setIsLoggedIn(true)} />;
  }

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="app-header-left">
          <div className="app-logo">
            <div className="app-logo-icon">U</div>
            <div className="app-logo-text">
              <span className="app-logo-title">Upersite CRM</span>
              <div className="app-subtitle-dropdown-wrapper">
                <span className="app-logo-subtitle-tag">
                  {customers.length} clienti
                </span>
              </div>
            </div>
            <button 
              className="btn btn-ghost btn-icon-sm" 
              style={{ marginLeft: '12px', fontSize: '1.1rem', opacity: 0.8 }}
              onClick={() => setShowCalendar(true)}
              title="Vista Calendario"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
            </button>
          </div>
        </div>

        <div className="app-header-center">
          <div className="app-search-wrapper app-search" style={{ position: 'relative' }}>
            <span className="app-search-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
              </svg>
            </span>
            <input
              ref={searchInputRef}
              type="text"
              className="app-search-input"
              placeholder="Cerca per nome, email o tag... (Premi Spazio)"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
            />
            {searchQuery && (
              <button className="app-search-clear" onClick={() => setSearchQuery('')}>✕</button>
            )}

            {isSearchFocused && allTags.length > 0 && (
              <div className="app-dropdown animate-scale-in" style={{ top: '100%', left: 0, marginTop: '8px', minWidth: '100%', width: 'auto', maxHeight: '200px', overflowY: 'auto', padding: '12px', zIndex: 100 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '8px', fontWeight: 600 }}>FILTRA PER TAG:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {allTags.map(tag => (
                    <span
                      key={tag}
                      className="tag-badge"
                      style={{ cursor: 'pointer', background: 'var(--primary-ghost)' }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setSearchQuery(prev => {
                          const currentQuery = prev.trim();
                          const tagWithHash = `#${tag}`;
                          if (!currentQuery) return tagWithHash;
                          if (currentQuery.toLowerCase().includes(tagWithHash.toLowerCase())) return currentQuery;
                          return `${currentQuery} ${tagWithHash}`;
                        });
                        searchInputRef.current?.focus();
                      }}
                    >
                      + {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="app-header-right">
          <div className="app-menu-wrapper" style={{ overflow: 'visible' }}>
            <NotificationBell
              count={unreadNotificationsCount}
              isOpen={showNotifications}
              setIsOpen={setShowNotifications}
              notifications={notifications}
              toggleRead={toggleNotificationRead}
              customers={customers}
              setSelectedCustomer={setSelectedCustomer}
            />
          </div>

          <button
            className="btn btn-secondary btn-sm"
            style={{ marginRight: '16px' }}
            onClick={() => setShowTagMenu(true)}
            title="Gestisci Tag"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                <line x1="7" y1="7" x2="7.01" y2="7"></line>
              </svg> Tag
          </button>

          <div className="app-view-toggle">
            <button
              className={`app-view-btn ${viewMode === 'kanban' ? 'active' : ''}`}
              onClick={() => setViewMode('kanban')}
              title="Vista Kanban"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style={{ marginTop: '3px' }}>
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
              </svg>
            </button>
            <button
              className={`app-view-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="Vista Lista"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style={{ marginTop: '3px' }}>
                <line x1="8" y1="6" x2="21" y2="6"></line>
                <line x1="8" y1="12" x2="21" y2="12"></line>
                <line x1="8" y1="18" x2="21" y2="18"></line>
                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                <line x1="3" y1="18" x2="3.01" y2="18"></line>
              </svg>
            </button>
          </div>

          <button className="btn btn-primary" onClick={() => setShowNew(true)}>
            <span>+</span> Nuovo Cliente
          </button>

          <div className="app-menu-wrapper">
            <button className="btn btn-ghost btn-icon" onClick={() => setShowExportMenu(!showExportMenu)}>
              ⋯
            </button>
            {showExportMenu && (
              <div className="app-dropdown animate-scale-in">
                <button className="app-dropdown-item" onClick={() => { setShowSettings(true); setShowExportMenu(false); }}>
                  <span className="material-symbols-outlined" style={{ marginRight: '8px', fontSize: '20px' }}>
                    settings
                  </span>
                  Impostazioni
                </button>
                <div className="app-dropdown-divider" />
                <button className="app-dropdown-item" onClick={handleEndSession} style={{ fontWeight: 600, color: 'var(--primary)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style={{ marginRight: '8px' }}>
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                  </svg>
                  Termina sessione di lavoro
                </button>
                <div className="app-dropdown-divider" />
                <button className="app-dropdown-item app-dropdown-danger" onClick={() => { setIsLoggedIn(false); setShowExportMenu(false); }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style={{ marginRight: '8px' }}>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                  Blocca CRM
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="app-main">
        <StatsHeader
          customers={customers}
          onOpenCharts={() => setShowCharts(true)}
          onOpenClients={() => setShowDataGridView(true)}
          onOpenOverdue={() => setShowOverdue(true)}
        />

        {viewMode === 'kanban' ? (
          <KanbanView
            customers={filteredCustomers}
            onSelectCustomer={setSelectedCustomer}
            onUpdateCustomerStatus={(id, status) => {
              const c = customers.find(x => x.id === id);
              if (c) updateCustomer(id, { ...c, status });
            }}
          />
        ) : (
          <ListView customers={filteredCustomers} onSelectCustomer={setSelectedCustomer} />
        )}
      </main>

      {/* Calendar Modal */}
      {showCalendar && (
        <CalendarView 
          customers={customers} 
          onClose={() => setShowCalendar(false)} 
          onSelectCustomer={(c) => {
            setSelectedCustomer(c);
            setShowCalendar(false);
          }}
          initialView={settings.calendarView}
          initialFilter={settings.calendarFilter}
          onSettingsChange={updateSettings}
          globalEvents={events}
          onUpdateEvents={updateEvents}
        />
      )}

      {/* Tag Manager Modal */}
      {showTagMenu && (
        <TagManagerModal
          allTags={allTags}
          customers={customers}
          updateTags={updateTags}
          updateCustomer={updateCustomer}
          onClose={() => setShowTagMenu(false)}
        />
      )}

      {/* Detail Modal */}
      {(selectedCustomer || showNew) && (
        <CustomerDetail
          customer={selectedCustomer}
          allTags={allTags}
          settings={settings}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => { setSelectedCustomer(null); setShowNew(false); }}
        />
      )}

      {showCharts && (
        <EarningsChartModal customers={customers} onClose={() => setShowCharts(false)} />
      )}

      {showOverdue && (
        <OverdueModal customers={customers} onSelectCustomer={setSelectedCustomer} onClose={() => setShowOverdue(false)} />
      )}

      {showClientList && (
        <ClientListModal customers={customers} onSelectCustomer={setSelectedCustomer} onClose={() => setShowClientList(false)} />
      )}

      {showSettings && (
        <SettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          settings={settings}
          updateSettings={updateSettings}
          setCustomers={setCustomers}
          customers={customers}
        />
      )}

      {showDataGridView && (
        <DataGridView
          customers={customers}
          onClose={() => setShowDataGridView(false)}
        />
      )}

      {/* Gemini AI Assistant */}
      <GeminiChat 
        customers={customers}
        chatHistory={chatHistory}
        aiUsageStats={aiUsageStats}
        onUpdateChatHistory={updateChatHistory}
        onUpdateAiUsageStats={updateAiUsageStats}
      />

      {/* Click outside to close menu */}
      {(showExportMenu || showClientMenu || showNotifications) && (
        <div className="app-backdrop" onClick={() => { setShowExportMenu(false); setShowClientMenu(false); setShowNotifications(false); }} />
      )}

      {/* Version Badge */}
      <div className="app-version-badge" style={{
        position: 'fixed',
        bottom: '16px',
        left: '16px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-light)',
        borderRadius: 'var(--radius-md)',
        padding: '6px 12px',
        fontSize: '0.7rem',
        color: 'var(--text-tertiary)',
        fontWeight: 500,
        fontFamily: 'monospace',
        zIndex: 100,
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        cursor: 'pointer',
        transition: 'all 0.2s'
      }} 
      title={`Upersite CRM ${formatVersionDisplay()}\nClicca per copiare la versione`}
      onClick={async () => {
        const success = await copyVersionToClipboard();
        // Mostra feedback visivo temporaneo
        const el = document.querySelector('.app-version-badge');
        if (el) {
          if (success) {
            el.style.background = 'var(--success)';
            el.style.color = '#fff';
          } else {
            el.style.background = 'var(--danger)';
            el.style.color = '#fff';
          }
          setTimeout(() => {
            el.style.background = 'var(--bg-card)';
            el.style.color = 'var(--text-tertiary)';
          }, 300);
        }
      }}>
        {formatVersionDisplay()}
      </div>

      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&icon_names=settings,visibility,visibility_off" />
      <style>{`
        .material-symbols-outlined {
          font-variation-settings:
            'FILL' 0,
            'wght' 400,
            'GRAD' 0,
            'opsz' 24
        }
      `}</style>

      <style>{`
        .app-layout {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }

        /* ── Header ── */
        .app-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 14px 24px;
          background: rgba(255,255,255,0.85);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--border-light);
          position: sticky;
          top: 0;
          z-index: 100;
          animation: slideInDown 0.4s var(--ease-out);
          -webkit-app-region: drag;
        }

        .app-header button, .app-header input, .app-header .app-dropdown {
          -webkit-app-region: no-drag;
        }

        .app-header-left {
          display: flex;
          align-items: center;
          flex-shrink: 0;
        }

        .app-logo {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .app-logo-icon {
          width: 36px; height: 36px;
          background: linear-gradient(135deg, var(--primary), var(--primary-dark));
          color: white;
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 1rem;
          box-shadow: 0 4px 12px rgba(108, 92, 231, 0.25);
        }

        .app-logo-text {
          display: flex;
          flex-direction: column;
        }

        .app-logo-title {
          font-size: 0.9375rem;
          font-weight: 700;
          color: var(--text-primary);
          line-height: 1.2;
        }

        .app-logo-subtitle-tag {
          font-size: 0.6875rem;
          background: var(--primary-ghost);
          color: var(--primary);
          padding: 2px 8px;
          border-radius: 12px;
          font-weight: 600;
        }

        /* ── Search ── */
        .app-header-center {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 90%;
          max-width: 640px;
          z-index: 10;
          pointer-events: none;
        }

        .app-search-wrapper {
          width: 100%;
          pointer-events: auto;
        }

        .app-search-input {
          width: 100%;
          padding: 12px 16px 12px 44px;
          background: var(--bg-input);
          border: 2px solid transparent;
          border-radius: var(--radius-lg);
          font-size: 0.9375rem;
          transition: all 0.2s;
        }

        .app-search-input:focus {
          background: #fff;
          border-color: var(--primary-light);
          box-shadow: 0 4px 20px rgba(108, 92, 231, 0.1);
          outline: none;
        }

        .app-search-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-tertiary);
          font-size: 1rem;
        }

        .app-search-clear {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          border: none;
          background: none;
          color: var(--text-tertiary);
          cursor: pointer;
          font-size: 0.8rem;
          padding: 4px;
        }

        /* ── Right Section ── */
        .app-header-right {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
        }

        .app-view-toggle {
          display: flex;
          background: var(--bg-input);
          padding: 4px;
          border-radius: var(--radius-md);
        }

        .app-view-btn {
          border: none;
          background: none;
          padding: 6px 12px;
          border-radius: var(--radius-sm);
          cursor: pointer;
          color: var(--text-tertiary);
          font-size: 1rem;
          transition: all 0.2s;
        }

        .app-view-btn.active {
          background: #fff;
          color: var(--primary);
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }

        .app-backdrop {
          position: fixed;
          inset: 0;
          z-index: 99;
        }

        /* ── Main Content ── */
        .app-main {
          flex: 1;
          padding: 24px;
          max-width: 1440px;
          margin: 0 auto;
          width: 100%;
        }

        /* ── Responsive ── */
        @media (max-width: 768px) {
          .app-header {
            flex-wrap: wrap;
            padding: 12px 16px;
            gap: 10px;
          }

          .app-header-center {
            position: static;
            transform: none;
            order: 3;
            max-width: 100%;
            width: 100%;
          }

          .app-logo-text {
            display: none;
          }

          .app-main {
            padding: 16px;
          }
        }
        .notification-item:hover {
          background: var(--bg-hover) !important;
        }

        /* ── Dropdown ── */
        .app-dropdown {
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 8px;
          background: #fff;
          border: 1px solid var(--border-light);
          border-radius: var(--radius-md);
          box-shadow: 0 10px 25px rgba(0,0,0,0.15);
          min-width: 180px;
          z-index: 1000;
          overflow: hidden;
          animation: fadeInScale 0.2s var(--ease-spring);
        }

        .app-dropdown-item {
          width: 100%;
          padding: 10px 16px;
          display: flex;
          align-items: center;
          gap: 10px;
          border: none;
          background: none;
          font-family: var(--font);
          font-size: 0.8125rem;
          font-weight: 500;
          color: var(--text-primary);
          cursor: pointer;
          text-align: left;
          transition: all 0.2s;
        }

        .app-dropdown-item:hover {
          background: var(--bg-hover);
          color: var(--primary);
        }

        .app-dropdown-danger {
          color: var(--danger);
        }

        .app-dropdown-danger:hover {
          background: var(--danger-bg);
          color: var(--danger);
        }

        .app-dropdown-divider {
          height: 1px;
          background: var(--border-light);
          margin: 4px 0;
        }
      `}</style>
    </div>
  );
}
