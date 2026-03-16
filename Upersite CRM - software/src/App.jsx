import { useState, useCallback, useEffect, useRef } from 'react';
import Login from './components/Login';
import StatsHeader from './components/StatsHeader';
import KanbanView from './components/KanbanView';
import ListView from './components/ListView';
import CustomerDetail from './components/CustomerDetail';
import EarningsChartModal from './components/EarningsChartModal';
import OverdueModal from './components/OverdueModal';
import ClientListModal from './components/ClientListModal';
import SettingsModal from './components/SettingsModal';
import DataGridView from './components/DataGridView';
import { useCustomers, useInactivityTimeout, useSearch } from './hooks/useCustomers';
import { exportData, importData, loadData, saveData, hasMasterPassword, syncWithFileSystem } from './utils/storage';

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
          <h3 style={{ margin: 0 }}>🏷️ Gestione Tag</h3>
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
              <div style={{ fontSize: '2.5rem', textAlign: 'center', marginBottom: '8px' }}>🏷️</div>
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

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [viewMode, setViewMode] = useState('kanban'); // 'kanban' | 'list'
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
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const searchInputRef = useRef(null);

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
        // CustomerDetail and NewCustomer modals handle their own Escape key logic for save confirmation
        if (showCharts) setShowCharts(false);
        else if (showOverdue) setShowOverdue(false);
        else if (showClientList) setShowClientList(false);
        else if (showSettings) setShowSettings(false);
        else if (showDataGridView) setShowDataGridView(false);
        else if (showTagMenu) setShowTagMenu(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCharts, showOverdue, showClientList, showSettings, showDataGridView, showTagMenu]);

  const {
    customers, tags, settings, hasSynced,
    addCustomer, updateCustomer, deleteCustomer, setCustomers,
    updateSettings, updateTags
  } = useCustomers();

  const filteredCustomers = useSearch(customers, searchQuery);

  const allTags = tags.length > 0 ? tags : [...new Set(customers.flatMap(c => c.tags || []))];

  // Sync back derived tags to global state once if empty
  useEffect(() => {
    if (hasSynced && tags.length === 0) {
      const derived = [...new Set(customers.flatMap(c => c.tags || []))];
      if (derived.length > 0) updateTags(derived);
    }
  }, [hasSynced, tags.length, customers, updateTags]);

  const handleLogout = useCallback(() => {
    setIsLoggedIn(false);
  }, []);

  useInactivityTimeout(settings.inactivityTimeout || 5 * 60 * 1000, handleLogout);

  const handleSave = (customer) => {
    // Check for any newly added tags and save them globally
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
      {/* Top Bar */}
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
          </div>
        </div>

        <div className="app-header-center">
          <div className="app-search-wrapper app-search" style={{ position: 'relative' }}>
            <span className="app-search-icon">🔍</span>
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
          <button
            className="btn btn-secondary btn-sm"
            style={{ marginRight: '16px' }}
            onClick={() => setShowTagMenu(true)}
            title="Gestisci Tag"
          >
            🏷️ Tag
          </button>

          <div className="app-view-toggle">
            <button
              className={`app-view-btn ${viewMode === 'kanban' ? 'active' : ''}`}
              onClick={() => setViewMode('kanban')}
              title="Vista Kanban"
            >
              ▦
            </button>
            <button
              className={`app-view-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="Vista Lista"
            >
              ☰
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
                  ⚙️ Impostazioni
                </button>
                <div className="app-dropdown-divider" />
                <button className="app-dropdown-item app-dropdown-danger" onClick={() => { setIsLoggedIn(false); setShowExportMenu(false); }}>
                  🔒 Blocca CRM
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
        />
      )}

      {showDataGridView && (
        <DataGridView
          customers={customers}
          onClose={() => setShowDataGridView(false)}
        />
      )}

      {/* Click outside to close menu */}
      {(showExportMenu || showClientMenu) && (
        <div className="app-backdrop" onClick={() => { setShowExportMenu(false); setShowClientMenu(false); }} />
      )}

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
          font-family: var(--font);
          font-size: 0.6875rem;
          color: var(--primary);
          background: var(--primary-ghost);
          border: none;
          padding: 2px 8px;
          border-radius: 4px;
          font-weight: 600;
          display: inline-block;
        }

        .app-subtitle-dropdown-wrapper {
          position: relative;
          margin-top: 2px;
        }

        .app-dropdown-clients {
          top: calc(100% + 4px);
          left: 0;
          right: auto;
          min-width: 260px;
        }

        .app-dropdown-header {
          padding: 8px 12px;
          font-size: 0.6875rem;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--text-tertiary);
          letter-spacing: 0.5px;
          border-bottom: 1px solid var(--border-light);
          margin-bottom: 4px;
        }

        .app-dropdown-list {
          max-height: 300px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }

        .app-header-center {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          justify-content: center;
          max-width: 440px;
          margin: 0 auto;
          width: 100%;
        }

        .app-search {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          background: var(--bg-input);
          border-radius: var(--radius-full);
          border: 2px solid transparent;
          transition: all var(--duration-normal) var(--ease-out);
          width: 100%;
        }

        .app-search:focus-within {
          border-color: var(--primary-light);
          background: var(--bg-card);
          box-shadow: 0 0 0 4px var(--primary-ghost);
        }

        .app-search-icon {
          font-size: 0.875rem;
          flex-shrink: 0;
        }

        .app-search-input {
          border: none;
          background: transparent;
          outline: none;
          font-family: var(--font);
          font-size: 0.875rem;
          color: var(--text-primary);
          width: 100%;
        }

        .app-search-input::placeholder {
          color: var(--text-tertiary);
        }

        .app-search-clear {
          border: none;
          background: var(--bg-hover);
          color: var(--text-secondary);
          width: 20px; height: 20px;
          border-radius: var(--radius-full);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.75rem;
          cursor: pointer;
          flex-shrink: 0;
          transition: all var(--duration-fast);
        }

        .app-search-clear:hover {
          background: var(--danger-bg);
          color: var(--danger);
        }

        .app-header-right {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .app-view-toggle {
          display: flex;
          background: var(--bg-input);
          border-radius: var(--radius-md);
          padding: 3px;
        }

        .app-view-btn {
          border: none;
          background: transparent;
          padding: 6px 10px;
          border-radius: var(--radius-sm);
          cursor: pointer;
          font-size: 1rem;
          color: var(--text-secondary);
          transition: all var(--duration-fast) var(--ease-out);
        }

        .app-view-btn.active {
          background: var(--bg-card);
          color: var(--primary);
          box-shadow: var(--shadow-xs);
        }

        .app-view-btn:hover:not(.active) {
          color: var(--text-primary);
        }

        /* ── Dropdown Menu ── */
        .app-menu-wrapper {
          position: relative;
        }

        .app-dropdown {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          background: var(--bg-card);
          border-radius: var(--radius-lg);
          border: 1px solid var(--border-light);
          box-shadow: var(--shadow-lg);
          padding: 6px;
          min-width: 220px;
          z-index: 200;
        }

        .app-dropdown-item {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 10px 14px;
          border: none;
          background: transparent;
          border-radius: var(--radius-md);
          font-family: var(--font);
          font-size: 0.8125rem;
          color: var(--text-primary);
          cursor: pointer;
          transition: background var(--duration-fast);
          text-align: left;
        }

        .app-dropdown-item:hover {
          background: var(--bg-hover);
        }

        .app-dropdown-danger {
          color: var(--danger);
        }

        .app-dropdown-danger:hover {
          background: var(--danger-bg);
        }

        .app-dropdown-divider {
          height: 1px;
          background: var(--border-light);
          margin: 4px 8px;
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
      `}</style>
    </div>
  );
}
