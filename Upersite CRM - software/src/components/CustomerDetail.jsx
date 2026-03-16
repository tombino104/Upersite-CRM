import { useState, useRef, useEffect } from 'react';
import RichTextEditor from './RichTextEditor';
import { generateId, sanitizePositiveNumber, formatBytes, saveFile, getMasterPassword, PACKAGES, ADDONS } from '../utils/storage';

const STATUSES = [
    { value: 'prospect', label: 'Prospect' },
    { value: 'working', label: 'In lavorazione' },
    { value: 'paused', label: 'Sospeso' },
    { value: 'completed', label: 'Completato' },
];



/* ── TO-DO SECTION ── */
function TodoSection({ form, update, confirmDelete }) {
    const todos = form.todo || [];
    const [newTask, setNewTask] = useState('');
    const [draftSubtask, setDraftSubtask] = useState({});
    const [openSubtask, setOpenSubtask] = useState({});
    const [priority, setPriority] = useState('Media');
    const [dueDate, setDueDate] = useState('');

    const addTodo = (e) => {
        e.preventDefault();
        const text = newTask.trim();
        if (!text) return;

        const todo = {
            id: generateId(),
            text,
            priority,
            dueDate,
            completed: false,
            createdAt: new Date().toISOString(),
            readAt: null,
            subtasks: []
        };

        update('todo', [...todos, todo]);
        setNewTask('');
        setPriority('Media');
        setDueDate('');
    };

    const toggleTodo = (id) => {
        const toggleRecursive = (items) => items.map(t => {
            if (t.id !== id) {
                return t.subtasks && t.subtasks.length > 0
                    ? { ...t, subtasks: toggleRecursive(t.subtasks) }
                    : t;
            }

            const nextCompleted = !t.completed;
            const setAll = (arr, val) => (arr || []).map(st => ({
                ...st,
                completed: val,
                subtasks: setAll(st.subtasks || [], val)
            }));

            return {
                ...t,
                completed: nextCompleted,
                subtasks: setAll(t.subtasks || [], nextCompleted)
            };
        });

        update('todo', toggleRecursive(todos));
    };

    const addSubtask = (parentId, level) => {
        if (level >= 2) return;
        const text = (draftSubtask[parentId] || '').trim();
        if (!text) return;

        const newSub = {
            id: generateId(),
            text,
            priority: 'Media',
            dueDate: '',
            completed: false,
            createdAt: new Date().toISOString(),
            readAt: null,
            subtasks: []
        };

        const insertRecursive = (items) => items.map(t => {
            if (t.id === parentId) {
                return { ...t, readAt: null, subtasks: [...(t.subtasks || []), newSub] };
            }
            if (t.subtasks && t.subtasks.length > 0) {
                return { ...t, subtasks: insertRecursive(t.subtasks) };
            }
            return t;
        });

        update('todo', insertRecursive(todos));
        setDraftSubtask(prev => ({ ...prev, [parentId]: '' }));
        setOpenSubtask(prev => ({ ...prev, [parentId]: false }));
    };

    const renderTodoItem = (t, level = 0) => {
        const hasChildren = (t.subtasks || []).length > 0;
        const padLeft = level === 0 ? 0 : level === 1 ? 22 : 44;

        return (
            <div key={t.id} style={{ paddingLeft: padLeft }}>
                <div className="todo-item-card" style={{ borderColor: !t.readAt ? 'var(--primary-light)' : 'var(--border-light)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                        <input type="checkbox" checked={t.completed} onChange={() => toggleTodo(t.id)} className="todo-checkbox" />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.95rem', textDecoration: t.completed ? 'line-through' : 'none', opacity: t.completed ? 0.6 : 1 }}>
                                {t.text}
                            </span>
                            {level === 0 && (
                                <div style={{ display: 'flex', gap: '12px', fontSize: '0.75rem', marginTop: '4px' }}>
                                    <span style={{ color: getPriorityColor(t.priority), fontWeight: 600 }}>{t.priority}</span>
                                    {t.dueDate && (
                                        <span style={{ color: isOverdue(t.dueDate) ? 'var(--danger)' : 'var(--text-secondary)' }}>
                                            {isOverdue(t.dueDate) ? '⚠️ Scaduto il ' : 'Scadenza: '}
                                            {new Date(t.dueDate).toLocaleDateString('it-IT')}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {level < 2 && (
                        <button
                            className="btn btn-ghost btn-icon-sm"
                            onClick={() => setOpenSubtask(prev => ({ ...prev, [t.id]: !prev[t.id] }))}
                            title="Aggiungi sotto-task"
                        >
                            ＋
                        </button>
                    )}
                    <button
                        className="btn btn-ghost btn-icon-sm"
                        title={t.readAt ? 'Segna come non letto' : 'Segna come letto'}
                        onClick={() => {
                            const toggleRead = (items) => (items || []).map(x => {
                                if (x.id === t.id) {
                                    return { ...x, readAt: x.readAt ? null : new Date().toISOString() };
                                }
                                if (x.subtasks && x.subtasks.length > 0) {
                                    return { ...x, subtasks: toggleRead(x.subtasks) };
                                }
                                return x;
                            });
                            update('todo', toggleRead(todos));
                        }}
                        style={{ fontSize: '0.75rem' }}
                    >
                        {t.readAt ? '👁️' : '🔵'}
                    </button>
                    <button className="btn btn-ghost btn-icon-sm" onClick={() => confirmDelete('todo', t.id)}>✕</button>
                </div>

                {level < 2 && openSubtask[t.id] && (
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px', marginBottom: hasChildren ? '10px' : '16px', paddingLeft: '6px' }}>
                        <input
                            className="input"
                            placeholder={level === 0 ? 'Nuovo sotto-task...' : 'Nuovo sotto-sotto-task...'}
                            value={draftSubtask[t.id] || ''}
                            onChange={e => setDraftSubtask(prev => ({ ...prev, [t.id]: e.target.value }))}
                            style={{ flex: 1 }}
                            onKeyDown={e => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    addSubtask(t.id, level);
                                }
                            }}
                        />
                        <button className="btn btn-secondary btn-sm" onClick={() => addSubtask(t.id, level)}>Aggiungi</button>
                    </div>
                )}

                {hasChildren && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px', marginBottom: '14px' }}>
                        {(t.subtasks || []).map(st => renderTodoItem(st, level + 1))}
                    </div>
                )}
            </div>
        );
    };

    const getPriorityColor = (p) => {
        if (p === 'Alta') return 'var(--danger)';
        if (p === 'Media') return 'var(--warning)';
        return 'var(--success)';
    };

    const isOverdue = (dateStr) => {
        if (!dateStr) return false;
        return new Date(dateStr) < new Date(new Date().setHours(0, 0, 0, 0));
    };

    const pending = todos.filter(t => !t.completed).sort((a, b) => {
        if (a.dueDate && b.dueDate) return new Date(a.dueDate) - new Date(b.dueDate);
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return 0;
    });

    const completed = todos.filter(t => t.completed).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return (
        <div className="detail-section">
            <form onSubmit={addTodo} style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
                <input
                    className="input"
                    placeholder="Nuova attività..."
                    value={newTask}
                    onChange={e => setNewTask(e.target.value)}
                    style={{ flex: '1 1 200px' }}
                />
                <select className="input" value={priority} onChange={e => setPriority(e.target.value)} style={{ flex: '0 0 120px' }}>
                    <option value="Bassa">Bassa</option>
                    <option value="Media">Media</option>
                    <option value="Alta">Alta</option>
                </select>
                <input
                    type="date"
                    className="input"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    style={{ flex: '0 0 140px' }}
                />
                <button type="submit" className="btn btn-primary">Aggiungi</button>
            </form>

            <label className="input-label">Da fare ({pending.length})</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                {pending.length === 0 && <span style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>Nessuna attività pendente.</span>}
                {pending.map(t => renderTodoItem(t, 0))}
            </div>

            {completed.length > 0 && (
                <>
                    <label className="input-label">Completate ({completed.length})</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', opacity: 0.6 }}>
                        {completed.map(t => renderTodoItem(t, 0))}
                    </div>
                </>
            )}

            <style>{`
                .todo-item-card {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 12px 16px;
                    border: 1px solid var(--border-light);
                    border-radius: var(--radius-md);
                    background: var(--bg-card);
                    transition: all 0.2s;
                }
                .todo-item-card:hover {
                    border-color: var(--primary-light);
                    transform: translateX(4px);
                }
                .todo-checkbox {
                    width: 18px;
                    height: 18px;
                    cursor: pointer;
                    accent-color: var(--primary);
                }
            `}</style>
        </div>
    );
}

export default function CustomerDetail({ customer, allTags, settings, onSave, onDelete, onClose }) {
    const isNew = !customer;
    const [showAdvancedFinance, setShowAdvancedFinance] = useState(false);
    const [activeTab, setActiveTab] = useState('general');
    const [newNote, setNewNote] = useState('');
    const [newTag, setNewTag] = useState('');
    const [form, setForm] = useState(customer || {
        id: generateId(),
        name: '',
        company: '',
        status: 'prospect',
        packageType: '',
        addons: [],
        tags: [],
        installments: [],
        credentials: [],
        links: [],
        files: [],
        notes: [],
        logo: null,
        createdAt: new Date().toISOString()
    });

    const snapshot = useRef(JSON.stringify({ ...form, newNote: '', newTag: '' }));

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [showPaymentWarning, setShowPaymentWarning] = useState(false);
    const [pendingStatus, setPendingStatus] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    const update = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

    const hasChanges = JSON.stringify({ ...form, newNote, newTag }) !== snapshot.current;

    const handleClose = () => {
        if (hasChanges) {
            setShowUnsavedConfirm(true);
            return;
        }
        setIsClosing(true);
        setTimeout(onClose, 150);
    };

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                if (showUnsavedConfirm || showDeleteConfirm || deleteTarget) {
                    setShowUnsavedConfirm(false);
                    setShowDeleteConfirm(false);
                    setDeleteTarget(null);
                    return;
                }
                const overlays = document.querySelectorAll('.modal-overlay');
                if (overlays.length > 1) {
                    return;
                }
                handleClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [hasChanges, showUnsavedConfirm, showDeleteConfirm, deleteTarget]);

    // Auto-calculate total price based on package and selected addons
    useEffect(() => {
        let total = 0;
        const pkg = PACKAGES.find(p => p.id === form.packageType);
        if (pkg) total += pkg.price;

        (form.addons || []).forEach(addonId => {
            const addon = ADDONS.find(a => a.id === addonId);
            if (addon) total += addon.price;
        });

        if (total > 0 && total !== parseFloat(form.quoteAmount)) {
            update('quoteAmount', total.toString());
        }
    }, [form.packageType, form.addons]);

    const handleSave = () => {
        if (!form.name.trim()) {
            alert('Il nome è obbligatorio');
            return;
        }
        
        setIsSaving(true);
        
        try {
            // Salva i dati immediatamente
            onSave(form);
            
            // Aggiorna lo snapshot per riflettere il salvataggio
            snapshot.current = JSON.stringify({ ...form, newNote: '', newTag: '' });
            
            // Chiudi la modal dopo un breve delay per assicurare il salvataggio
            setIsClosing(true);
            setTimeout(() => {
                onClose();
            }, 200);
        } catch (error) {
            console.error('Errore durante il salvataggio:', error);
            alert('Errore durante il salvataggio. Riprova.');
        } finally {
            // Resetta lo stato di salvataggio dopo un delay
            setTimeout(() => {
                setIsSaving(false);
            }, 300);
        }
    };

    const confirmDelete = (type, id) => {
        setDeleteTarget({ type, id });
    };

    const executeDelete = () => {
        if (!deleteTarget) return;
        const { type, id } = deleteTarget;

        if (type === 'installment') {
            update('installments', form.installments.filter(i => i.id !== id));
        } else if (type === 'credential') {
            update('credentials', form.credentials.filter(c => c.id !== id));
        } else if (type === 'link') {
            update('links', form.links.filter(l => l.id !== id));
        } else if (type === 'file') {
            update('files', form.files.filter(f => f.id !== id));
        } else if (type === 'note') {
            update('notes', form.notes.filter(n => n.id !== id));
        } else if (type === 'todo') {
            const removeRecursive = (items) => (items || []).filter(t => t.id !== id).map(t => {
                if (t.subtasks && t.subtasks.length > 0) {
                    return { ...t, subtasks: removeRecursive(t.subtasks) };
                }
                return t;
            });

            update('todo', removeRecursive(form.todo));
        }
        setDeleteTarget(null);
    };

    const getUnread = (arr) => (arr || []).filter(item => !item.readAt).length;

    const getUnreadTodos = (items) => (items || []).reduce((count, t) => {
        const selfUnread = t.readAt ? 0 : 1;
        const childrenUnread = t.subtasks && t.subtasks.length > 0 ? getUnreadTodos(t.subtasks) : 0;
        return count + selfUnread + childrenUnread;
    }, 0);

    const tabs = [
        { id: 'general', label: 'Generale', icon: '👤' },
        { id: 'config', label: 'Configurazione', icon: '⚙️' },
        { id: 'finance', label: 'Pagamenti', icon: '💶' },
        { id: 'credentials', label: 'Accessi', icon: '🔐', unread: getUnread(form.credentials) },
        { id: 'links', label: 'Link', icon: '🔗', unread: getUnread(form.links) },
        { id: 'files', label: 'File', icon: '📁' },
        { id: 'notes', label: 'Note', icon: '📝', unread: getUnread(form.notes) },
        { id: 'todo', label: 'To-Do', icon: '☑️', unread: getUnreadTodos(form.todo) },
    ];

    return (
        <div className={`modal-overlay ${isClosing ? 'overlay-closing' : ''}`} onClick={e => e.target === e.currentTarget && handleClose()}>
            <div className={`modal-content detail-modal ${isClosing ? 'modal-closing' : ''}`}>
                {/* Header */}
                <div className="modal-header">
                    <div className="detail-header-left">
                        <LogoAvatar logo={form.logo} name={form.name} onLogoChange={(logo) => update('logo', logo)} />
                        <div>
                            <h2>{isNew ? 'Nuovo Cliente' : form.name}</h2>
                            {form.company && <span className="detail-company">{form.company}</span>}
                            {(form.tags || []).length > 0 && (
                                <div className="detail-header-tags">
                                    {form.tags.map(tag => (
                                        <span key={tag} className="tag-badge">
                                            {tag}
                                            <span className="tag-remove" onClick={() => {
                                                update('tags', form.tags.filter(t => t !== tag));
                                            }}>✕</span>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <button className="btn btn-ghost btn-icon" onClick={handleClose}>✕</button>
                </div>

                {/* Tabs */}
                <div className="detail-tabs">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            className={`detail-tab ${activeTab === tab.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            <span className="detail-tab-icon">{tab.icon}</span>
                            <span className="detail-tab-label">{tab.label}</span>
                            {tab.unread > 0 && (
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
                                    marginLeft: '2px'
                                }}>{tab.unread}</span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Body */}
                <div className="modal-body detail-body">
                    {activeTab === 'general' && <GeneralSection form={form} update={update} allTags={allTags} newTag={newTag} setNewTag={setNewTag} />}
                    {activeTab === 'config' && <ConfigSection form={form} update={update} />}
                    {activeTab === 'finance' && (
                        <FinanceSection
                            form={form}
                            update={update}
                            settings={settings}
                            confirmDelete={confirmDelete}
                            showAdvancedFinance={showAdvancedFinance}
                            setShowAdvancedFinance={setShowAdvancedFinance}
                        />
                    )}
                    {activeTab === 'credentials' && (
                        <CredentialsSection
                            form={form}
                            update={update}
                            confirmDelete={confirmDelete}
                        />
                    )}
                    {activeTab === 'links' && <LinksSection form={form} update={update} confirmDelete={confirmDelete} />}
                    {activeTab === 'files' && (
                        <FilesSection
                            form={form}
                            update={update}
                            confirmDelete={confirmDelete}
                            filterOutQuotes={true}
                        />
                    )}
                    {activeTab === 'notes' && <NotesSection form={form} update={update} confirmDelete={confirmDelete} newNote={newNote} setNewNote={setNewNote} />}
                    {activeTab === 'todo' && <TodoSection form={form} update={update} confirmDelete={confirmDelete} />}
                </div>

                {/* Unsaved Changes Confirmation overlay */}
                {showUnsavedConfirm && (
                    <div className="detail-confirm-overlay animate-fade-in" style={{ zIndex: 2000 }}>
                        <div className="detail-confirm-card animate-scale-in">
                            <div className="detail-confirm-icon">⚠️</div>
                            <p>Hai modifiche non salvate. Vuoi uscire senza salvare?</p>
                            <div className="detail-confirm-buttons">
                                <button className="btn btn-danger" onClick={() => { setIsClosing(true); setTimeout(onClose, 150); }}>Esci senza salvare</button>
                                <button className="btn btn-secondary" onClick={() => setShowUnsavedConfirm(false)}>Annulla</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Delete Confirmation overlay */}
                {deleteTarget && (
                    <div className="detail-confirm-overlay animate-fade-in">
                        <div className="detail-confirm-card animate-scale-in">
                            <div className="detail-confirm-icon">🗑</div>
                            <p>Sei sicuro di voler eliminare questo elemento?</p>
                            <div className="detail-confirm-buttons">
                                <button className="btn btn-danger" onClick={executeDelete}>Elimina</button>
                                <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>Annulla</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Payment Warning overlay */}
                {showPaymentWarning && (() => {
                    const unpaid = (form.installments || []).filter(i => !i.paid);
                    const totalUnpaid = unpaid.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
                    return (
                        <div className="detail-confirm-overlay animate-fade-in" style={{ zIndex: 2100 }}>
                            <div className="detail-confirm-card animate-scale-in" style={{ borderTop: '4px solid var(--danger)', maxWidth: '420px' }}>
                                <div style={{ fontSize: '3rem', textAlign: 'center', marginBottom: '8px' }}>⚠️</div>
                                <h3 style={{ textAlign: 'center', color: 'var(--danger)', margin: '0 0 12px 0', fontSize: '1.1rem' }}>
                                    Rate in Sospeso!
                                </h3>
                                <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5, margin: '0 0 8px 0' }}>
                                    Questo cliente ha ancora <strong style={{ color: 'var(--danger)' }}>{unpaid.length} {unpaid.length === 1 ? 'rata' : 'rate'}</strong> da pagare
                                    per un totale di <strong style={{ color: 'var(--danger)' }}>€{totalUnpaid.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</strong>.
                                </p>
                                <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.8rem', margin: '0 0 20px 0' }}>
                                    Sei sicuro di volerlo segnare come <strong>Completato</strong>?
                                </p>
                                <div className="detail-confirm-buttons">
                                    <button className="btn btn-danger" onClick={() => {
                                        update('status', pendingStatus);
                                        setShowPaymentWarning(false);
                                        setPendingStatus(null);
                                    }}>Completa Comunque</button>
                                    <button className="btn btn-secondary" onClick={() => {
                                        setShowPaymentWarning(false);
                                        setPendingStatus(null);
                                    }}>Annulla</button>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* Footer */}
                <div className="modal-footer">
                    {!isNew && (
                        <div style={{ marginRight: 'auto' }}>
                            {showDeleteConfirm ? (
                                <div className="detail-delete-confirm animate-fade-in">
                                    <span>Eliminare il cliente?</span>
                                    <button className="btn btn-danger btn-sm" onClick={() => onDelete(form.id)}>Elimina</button>
                                    <button className="btn btn-ghost btn-sm" onClick={() => setShowDeleteConfirm(false)}>Annulla</button>
                                </div>
                            ) : (
                                <button className="btn btn-ghost" style={{ color: 'var(--danger)' }}
                                    onClick={() => setShowDeleteConfirm(true)}>
                                    🗑 Elimina Cliente
                                </button>
                            )}
                        </div>
                    )}
                    <button className="btn btn-secondary" onClick={handleClose}>Annulla</button>
                    <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
                        {isSaving ? 'Salvataggio...' : (isNew ? '+ Aggiungi Cliente' : 'Salva Modifiche')}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ── Logo/Avatar ── */
function LogoAvatar({ logo, name, onLogoChange }) {
    const fileRef = useRef(null);

    const handleUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 500 * 1024) {
            alert('Logo troppo grande (max 500KB)');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => onLogoChange(reader.result);
        reader.readAsDataURL(file);
    };

    return (
        <div className="detail-avatar-wrapper" onClick={() => fileRef.current?.click()}>
            {logo ? (
                <img src={logo} alt="Logo" className="detail-avatar-img" />
            ) : (
                <div className="detail-avatar">
                    {(name || '?').charAt(0).toUpperCase()}
                </div>
            )}
            <div className="detail-avatar-overlay">📷</div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleUpload} />
        </div>
    );
}

/* ── GENERAL ── */
function GeneralSection({ form, update, allTags, newTag, setNewTag }) {

    const addTag = (tag) => {
        const val = tag;
        if (!val || (form.tags || []).includes(val)) return;
        update('tags', [...(form.tags || []), val]);
    };

    const removeTag = (tag) => {
        update('tags', (form.tags || []).filter(t => t !== tag));
    };

    return (
        <div className="detail-section">
            <div className="detail-row">
                <div className="detail-group">
                    <label className="input-label">Nome *</label>
                    <input className="input" value={form.name} onChange={e => update('name', e.target.value)} placeholder="Mario Rossi" />
                </div>
                <div className="detail-group">
                    <label className="input-label">Tipo di attività</label>
                    <input className="input" value={form.company || ''} onChange={e => update('company', e.target.value)} placeholder="Es. Sviluppo Software, Idraulico..." />
                </div>
            </div>
            <div className="detail-row">
                <div className="detail-group">
                    <label className="input-label">Email</label>
                    <input className="input" type="email" value={form.email || ''} onChange={e => update('email', e.target.value)} placeholder="mario@rossi.it" />
                </div>
                <div className="detail-group">
                    <label className="input-label">Telefono</label>
                    <input className="input" value={form.phone || ''} onChange={e => update('phone', e.target.value)} placeholder="+39 333 1234567" />
                </div>
            </div>
            <div className="detail-row">
                <div className="detail-group">
                    <label className="input-label">Stato Riga</label>
                    <select className="input select" value={form.status || ''} onChange={e => {
                        const val = e.target.value;
                        if (val === 'completed') {
                            const unpaid = (form.installments || []).filter(i => !i.paid);
                            if (unpaid.length > 0) {
                                setPendingStatus(val);
                                setShowPaymentWarning(true);
                                return;
                            }
                        }
                        update('status', val);
                    }}>
                        {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                </div>
                <div className="detail-group">
                    <label className="input-label">Pacchetto</label>
                    <select className="input select" value={form.packageType || ''} onChange={e => update('packageType', e.target.value)}>
                        <option value="">Nessuno</option>
                        {PACKAGES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                </div>
            </div>

            {/* Tags Management */}
            <div className="detail-group">
                <label className="input-label">Gestione Tag</label>
                {(form.tags || []).length > 0 && (
                    <div className="tag-list" style={{ marginBottom: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {form.tags.map(tag => (
                            <span key={tag} className="tag-badge">
                                {tag}
                                <span className="tag-remove" onClick={() => removeTag(tag)}>✕</span>
                            </span>
                        ))}
                    </div>
                )}

                {allTags && allTags.length > 0 && (
                    <div className="tag-suggestions" style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginBottom: '6px', fontWeight: 600 }}>SUGGERITI:</div>
                        <div className="tag-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {allTags.filter(t => !(form.tags || []).includes(t)).map(tag => (
                                <button
                                    key={tag}
                                    className="tag-badge"
                                    style={{ cursor: 'pointer', opacity: 0.8 }}
                                    onClick={() => addTag(tag)}
                                >
                                    + {tag}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="tag-input-row" style={{ display: 'flex', gap: '8px' }}>
                    <input className="input" value={newTag} onChange={e => setNewTag(e.target.value)}
                        placeholder="Nuovo tag personalizzato..." style={{ flex: 1 }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(newTag.trim()); setNewTag(''); } }} />
                    <button className="btn btn-secondary btn-sm" onClick={() => { addTag(newTag.trim()); setNewTag(''); }}>Crea</button>
                </div>
            </div>
        </div>
    );
}

/* ── CONFIGURATION (Add-ons) ── */
function ConfigSection({ form, update }) {
    const selectedPackage = form.packageType || '';
    const selectedAddons = form.addons || [];

    const toggleAddon = (addonId) => {
        if (selectedAddons.includes(addonId)) {
            update('addons', selectedAddons.filter(a => a !== addonId));
        } else {
            update('addons', [...selectedAddons, addonId]);
        }
    };

    return (
        <div className="detail-section">
            <label className="input-label">Pacchetto Scelto</label>
            <div className="config-packages">
                {PACKAGES.map(pkg => (
                    <div
                        key={pkg.id}
                        className={`config-package-card ${selectedPackage === pkg.id ? 'active' : ''}`}
                        onClick={() => update('packageType', pkg.id === selectedPackage ? '' : pkg.id)}
                    >
                        <div className="config-package-name">{pkg.label}</div>
                    </div>
                ))}
            </div>

            <label className="input-label" style={{ marginTop: '16px' }}>Servizi Aggiuntivi</label>
            <div className="config-addons">
                {ADDONS.map(addon => (
                    <label key={addon.id} className={`config-addon-item ${selectedAddons.includes(addon.id) ? 'active' : ''}`}>
                        <input
                            type="checkbox"
                            checked={selectedAddons.includes(addon.id)}
                            onChange={() => toggleAddon(addon.id)}
                            className="config-addon-check"
                        />
                        <span className="config-addon-label">{addon.label}</span>
                    </label>
                ))}
            </div>
        </div>
    );
}

/* ── FINANCE ── */
function FinanceSection({ form, update, settings, confirmDelete, showAdvancedFinance, setShowAdvancedFinance }) {
    const installments = form.installments || [];
    const now = new Date();

    const addInstallment = () => {
        update('installments', [...installments, {
            id: generateId(), amount: '', dueDate: '', description: '', paid: false
        }]);
    };

    const updateInstallment = (id, key, val) => {
        if (key === 'amount') val = sanitizePositiveNumber(val);
        update('installments', installments.map(i => i.id === id ? { ...i, [key]: val } : i));
    };

    const totalAmount = installments.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
    const paidAmount = installments.filter(i => i.paid).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

    const formatCurrency = (n) =>
        new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);

    return (
        <div className="detail-section">
            <div className="detail-row">
                <div className="detail-group">
                    <label className="input-label">Importo Preventivo</label>
                    <input className="input" type="number" min="0" value={form.quoteAmount || ''}
                        onChange={e => update('quoteAmount', sanitizePositiveNumber(e.target.value))} placeholder="0.00" />
                </div>
                <div className="detail-group">
                    <label className="input-label">Riepilogo Pagamenti</label>
                    <div style={{ padding: '10px 0', fontSize: '0.875rem' }}>
                        <strong>{formatCurrency(paidAmount)}</strong>
                        <span style={{ color: 'var(--text-secondary)' }}> / {formatCurrency(parseFloat(form.quoteAmount) || totalAmount)}</span>
                    </div>
                </div>
            </div>

            {totalAmount > 0 && (
                <div className="progress-bar" style={{ height: '8px' }}>
                    <div className={`progress-bar-fill ${paidAmount >= totalAmount ? 'success' : ''}`}
                        style={{ width: `${totalAmount > 0 ? (paidAmount / totalAmount) * 100 : 0}%` }} />
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="input-label" style={{ margin: 0 }}>Rate</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--primary)', fontWeight: 600 }}
                        onClick={() => setShowAdvancedFinance(true)}>
                        ✨ Avanzate
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={addInstallment}>+ Aggiungi rata</button>
                </div>
            </div>

            <div className="detail-group" style={{ marginTop: '20px', borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
                <label className="input-label">📄 Preventivo (PDF)</label>
                <QuoteFileUpload form={form} update={update} />
            </div>

            {showAdvancedFinance && (
                <AdvancedInstallmentModal
                    quoteAmount={parseFloat(form.quoteAmount) || 0}
                    currentTotal={totalAmount}
                    defaultCount={settings.defaultInstallments || 3}
                    onConfirm={(newInstallments) => {
                        update('installments', [...installments, ...newInstallments]);
                        setShowAdvancedFinance(false);
                    }}
                    onClose={() => setShowAdvancedFinance(false)}
                />
            )}

            <div className="installment-list">
                {installments.length === 0 && (
                    <div className="empty-state" style={{ padding: '24px' }}>
                        <div className="empty-state-icon">📋</div>
                        <div className="empty-state-text">Nessuna rata inserita</div>
                    </div>
                )}
                {installments.map((inst, idx) => {
                    const isOverdue = !inst.paid && inst.dueDate && new Date(inst.dueDate) < now;
                    return (
                        <div key={inst.id} className="installment-item" style={{ animationDelay: `${idx * 30}ms` }}>
                            <div
                                className={`installment-check ${inst.paid ? 'checked' : ''}`}
                                onClick={() => updateInstallment(inst.id, 'paid', !inst.paid)}
                            >
                                {inst.paid && '✓'}
                            </div>
                            <div className="installment-fields">
                                <input className="installment-amount" type="number" min="0" placeholder="€" value={inst.amount}
                                    onChange={e => updateInstallment(inst.id, 'amount', e.target.value)} />
                                <input className="installment-date" type="date" value={inst.dueDate || ''}
                                    onChange={e => updateInstallment(inst.id, 'dueDate', e.target.value)} />
                                <input className="installment-desc" placeholder="Descrizione" value={inst.description || ''}
                                    onChange={e => updateInstallment(inst.id, 'description', e.target.value)} />
                                {isOverdue && <span className="installment-overdue">SCADUTA</span>}
                            </div>
                            <button className="btn btn-ghost btn-icon-sm" onClick={() => confirmDelete('installment', inst.id)}>✕</button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/* ── CREDENTIALS ── */
function CredentialsSection({ form, update, confirmDelete }) {
    const credentials = form.credentials || [];
    const [visibleIds, setVisibleIds] = useState({});
    const [unlocked, setUnlocked] = useState(false);
    const [pass, setPass] = useState('');
    const [error, setError] = useState(false);

    const handleUnlock = (e) => {
        e.preventDefault();
        const master = getMasterPassword() || "admin";
        if (pass === master) {
            setUnlocked(true);
            setError(false);
        } else {
            setError(true);
        }
    };

    if (!unlocked) {
        return (
            <div className="detail-section animate-fade-in" style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🔐</div>
                <h3>Sezione Protetta</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '24px' }}>
                    Inserisci la Password Master per visualizzare le credenziali.
                </p>
                <form onSubmit={handleUnlock} style={{ maxWidth: '300px', margin: '0 auto' }}>
                    <input
                        type="password"
                        className={`input ${error ? 'input-error' : ''}`}
                        placeholder="Password..."
                        value={pass}
                        onChange={e => setPass(e.target.value)}
                        autoFocus
                    />
                    {error && <div style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '8px' }}>Password errata</div>}
                    <button className="btn btn-primary" style={{ width: '100%', marginTop: '16px' }}>Sblocca</button>
                </form>
            </div>
        );
    }

    const addCredential = () => {
        update('credentials', [...credentials, {
            id: generateId(), service: '', username: '', password: ''
        }]);
    };

    const updateCredential = (id, key, val) => {
        update('credentials', credentials.map(c => c.id === id ? { ...c, [key]: val } : c));
    };

    const toggleVisible = (id) => {
        setVisibleIds(prev => ({ ...prev, [id]: !prev[id] }));
    };

    return (
        <div className="detail-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="input-label" style={{ margin: 0 }}>Credenziali di Accesso</label>
                <button className="btn btn-secondary btn-sm" onClick={addCredential}>+ Aggiungi</button>
            </div>

            {credentials.length === 0 && (
                <div className="empty-state" style={{ padding: '24px' }}>
                    <div className="empty-state-icon">🔐</div>
                    <div className="empty-state-text">Nessuna credenziale inserita</div>
                </div>
            )}

            {credentials.map((cred, idx) => (
                <div key={cred.id} className="credential-item" style={{ animationDelay: `${idx * 30}ms`, borderLeft: !cred.readAt ? '3px solid var(--primary)' : '3px solid transparent' }}>
                    <div className="credential-fields">
                        <input className="credential-service" placeholder="Servizio" value={cred.service}
                            onChange={e => updateCredential(cred.id, 'service', e.target.value)} />
                        <input className="credential-user" placeholder="Username" value={cred.username}
                            onChange={e => updateCredential(cred.id, 'username', e.target.value)} />
                        <input className="credential-pass"
                            type={visibleIds[cred.id] ? 'text' : 'password'}
                            placeholder="Password" value={cred.password}
                            onChange={e => updateCredential(cred.id, 'password', e.target.value)} />
                    </div>
                    <button className="btn btn-ghost btn-icon-sm" onClick={() => toggleVisible(cred.id)}
                        title={visibleIds[cred.id] ? 'Nascondi' : 'Mostra'}>
                        {visibleIds[cred.id] ? '🙈' : '👁'}
                    </button>
                    <button className="btn btn-ghost btn-icon-sm" title={cred.readAt ? 'Segna come non letto' : 'Segna come letto'}
                        onClick={() => updateCredential(cred.id, 'readAt', cred.readAt ? null : new Date().toISOString())}
                        style={{ fontSize: '0.75rem' }}>
                        {cred.readAt ? '👁️' : '🔵'}
                    </button>
                    <button className="btn btn-ghost btn-icon-sm" onClick={() => confirmDelete('credential', cred.id)}>✕</button>
                </div>
            ))}
        </div>
    );
}

/* ── LINKS ── */
function LinksSection({ form, update, confirmDelete }) {
    const links = form.links || [];

    const addLink = () => {
        update('links', [...links, { id: generateId(), label: '', url: '' }]);
    };

    const updateLink = (id, key, val) => {
        update('links', links.map(l => l.id === id ? { ...l, [key]: val } : l));
    };

    return (
        <div className="detail-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="input-label" style={{ margin: 0 }}>Link Utili</label>
                <button className="btn btn-secondary btn-sm" onClick={addLink}>+ Aggiungi</button>
            </div>

            {links.length === 0 && (
                <div className="empty-state" style={{ padding: '24px' }}>
                    <div className="empty-state-icon">🔗</div>
                    <div className="empty-state-text">Nessun link inserito</div>
                </div>
            )}

            {links.map((link, idx) => (
                <div key={link.id} className="link-item" style={{ animationDelay: `${idx * 30}ms`, borderLeft: !link.readAt ? '3px solid var(--primary)' : '3px solid transparent' }}>
                    <div className="link-fields">
                        <input className="link-label-input" placeholder="Etichetta" value={link.label}
                            onChange={e => updateLink(link.id, 'label', e.target.value)} />
                        <input className="link-url-input" placeholder="https://..." value={link.url}
                            onChange={e => updateLink(link.id, 'url', e.target.value)} />
                    </div>
                    {link.url && (
                        <a href={link.url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-icon-sm"
                            onClick={e => e.stopPropagation()}>↗</a>
                    )}
                    <button className="btn btn-ghost btn-icon-sm" title={link.readAt ? 'Segna come non letto' : 'Segna come letto'}
                        onClick={() => updateLink(link.id, 'readAt', link.readAt ? null : new Date().toISOString())}
                        style={{ fontSize: '0.75rem' }}>
                        {link.readAt ? '👁️' : '🔵'}
                    </button>
                    <button className="btn btn-ghost btn-icon-sm" onClick={() => confirmDelete('link', link.id)}>✕</button>
                </div>
            ))}
        </div>
    );
}

/* ── FILES ── */
function FilesSection({ form, update, confirmDelete, filterOutQuotes }) {
    const allFiles = form.files || [];
    const files = filterOutQuotes ? allFiles.filter(f => !f.isQuote) : allFiles;
    const fileRef = useRef(null);
    const folderRef = useRef(null);
    const [previewFile, setPreviewFile] = useState(null);
    const [currentPath, setCurrentPath] = useState('');

    const handleUploadMultiple = async (e) => {
        const selectedFiles = Array.from(e.target.files);
        if (selectedFiles.length === 0) return;

        let validFiles = [];
        let oversized = 0;

        for (const file of selectedFiles) {
            if (file.size > 5 * 1024 * 1024) {
                oversized++;
            } else {
                validFiles.push(file);
            }
        }

        if (oversized > 0) {
            alert(`${oversized} file superano i 5MB e sono stati ignorati.`);
        }

        try {
            const savedFiles = await Promise.all(validFiles.map(f => saveFile(form.id, f)));
            update('files', [...allFiles, ...savedFiles]);
        } catch {
            alert('Errore durante il caricamento');
        }
        e.target.value = '';
    };

    const downloadFile = (file) => {
        const a = document.createElement('a');
        a.href = file.data;
        a.download = file.name;
        a.click();
    };

    const totalSize = files.reduce((s, f) => s + (f.size || 0), 0);

    // Compute folders and visible files based on currentPath
    const folders = new Set();
    const visibleFiles = [];

    files.forEach(file => {
        const fullPath = file.path || file.name;

        if (currentPath === '' || fullPath.startsWith(currentPath)) {
            const relativePath = currentPath === '' ? fullPath : fullPath.substring(currentPath.length);
            const slashIndex = relativePath.indexOf('/');

            if (slashIndex !== -1) {
                const folderName = relativePath.substring(0, slashIndex + 1);
                folders.add(folderName);
            } else {
                visibleFiles.push(file);
            }
        }
    });

    const folderList = Array.from(folders).sort();

    const handleBack = () => {
        const parts = currentPath.split('/').filter(Boolean);
        parts.pop();
        setCurrentPath(parts.length > 0 ? parts.join('/') + '/' : '');
    };

    return (
        <div className="detail-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <label className="input-label" style={{ margin: 0 }}>
                    File ({files.length}) — {formatBytes(totalSize)}
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
                        + File
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => folderRef.current?.click()}>
                        + Cartella
                    </button>
                </div>
                <input ref={fileRef} type="file" multiple hidden onChange={handleUploadMultiple} />
                <input ref={folderRef} type="file" webkitdirectory="true" hidden onChange={handleUploadMultiple} />
            </div>

            {/* Folder Navigation */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', background: 'var(--bg-input)', padding: '8px 12px', borderRadius: 'var(--radius-md)' }}>
                <button
                    className="btn btn-ghost btn-sm"
                    disabled={!currentPath}
                    onClick={handleBack}
                    style={{ padding: '4px 8px', fontSize: '1.2rem' }}
                >
                    ⬅
                </button>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500, fontFamily: 'monospace' }}>
                    root/ {currentPath}
                </div>
            </div>

            {files.length === 0 && folderList.length === 0 && (
                <div className="empty-state" style={{ padding: '24px' }}>
                    <div className="empty-state-icon">📁</div>
                    <div className="empty-state-text">Nessun file o cartella</div>
                </div>
            )}

            <div className="file-grid">
                {folderList.map(folder => (
                    <div
                        key={folder}
                        className="file-card folder-card clickable"
                        onClick={() => setCurrentPath(currentPath + folder)}
                    >
                        <div className="file-card-icon">📁</div>
                        <div className="file-card-name">{folder.replace('/', '')}</div>
                    </div>
                ))}

                {visibleFiles.map((file, idx) => {
                    const isImage = file.type && file.type.startsWith('image/');
                    const isPdf = file.type === 'application/pdf';
                    const isText = file.type && file.type.startsWith('text/');
                    const canPreview = isImage || isPdf || isText;

                    return (
                        <div key={file.id} className="file-card" style={{ animationDelay: `${idx * 20}ms` }}>
                            <div className="file-card-inner">
                                <div className="file-card-icon" style={{ cursor: canPreview ? 'pointer' : 'default' }} onClick={() => canPreview && setPreviewFile(file)}>
                                    {isImage ? <img src={file.data} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }} /> : '📄'}
                                </div>
                                <div className="file-card-name" style={{ cursor: canPreview ? 'pointer' : 'default' }} onClick={() => canPreview && setPreviewFile(file)}>
                                    {file.name}
                                </div>
                                <div className="file-card-meta">{formatBytes(file.size)}</div>
                            </div>
                            <div className="file-card-actions">
                                <button className="btn btn-ghost btn-icon-sm" onClick={() => downloadFile(file)} title="Scarica">⬇</button>
                                <button className="btn btn-ghost btn-icon-sm" onClick={() => confirmDelete('file', file.id)}>✕</button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {previewFile && (
                <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
            )}

            <style>{`
                .file-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
                    gap: 16px;
                    margin-top: 12px;
                }
                .file-card {
                    background: var(--bg-card);
                    border: 1px solid var(--border-light);
                    border-radius: var(--radius-md);
                    padding: 12px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    text-align: center;
                    position: relative;
                    transition: all 0.2s;
                    animation: fade-in 0.3s ease-out backwards;
                }
                .file-card:hover {
                    border-color: var(--primary-light);
                    box-shadow: var(--shadow-sm);
                    transform: translateY(-2px);
                }
                .file-card-inner {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    width: 100%;
                    flex: 1;
                }
                .file-card-icon {
                    font-size: 2.5rem;
                    line-height: 1;
                    margin-bottom: 8px;
                    width: 48px;
                    height: 48px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .file-card-name {
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: var(--text-primary);
                    width: 100%;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    word-break: break-all;
                    margin-bottom: 4px;
                }
                .file-card-meta {
                    font-size: 0.65rem;
                    color: var(--text-tertiary);
                }
                .file-card-actions {
                    position: absolute;
                    top: 4px;
                    right: 4px;
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    opacity: 0;
                    transition: opacity 0.2s;
                }
                .file-card:hover .file-card-actions {
                    opacity: 1;
                }
                .file-card-actions button {
                    background: rgba(255, 255, 255, 0.9);
                    backdrop-filter: blur(4px);
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }
                
                .folder-card {
                    background: rgba(108, 92, 231, 0.03);
                    border: 1px dashed var(--primary-light);
                    cursor: pointer;
                    justify-content: center;
                }
                .folder-card:hover {
                    background: rgba(108, 92, 231, 0.08);
                }
                .folder-card .file-card-icon {
                    margin-bottom: 4px;
                }
            `}</style>
        </div>
    );
}

/* ── NOTES (Rich Text) ── */
function NotesSection({ form, update, confirmDelete, newNote, setNewNote }) {
    const notes = form.notes || [];
    const [selectedNote, setSelectedNote] = useState(null);

    const addNote = () => {
        const text = newNote.replace(/<[^>]*>/g, '').trim();
        if (!text) return;
        const note = {
            id: generateId(),
            text: newNote,
            createdAt: new Date().toISOString(),
        };
        update('notes', [note, ...notes]);
        setNewNote('');
    };

    const formatDate = (iso) => {
        const d = new Date(iso);
        return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const getNoteSnippet = (html) => {
        const text = html.replace(/<[^>]*>/g, '').trim();
        return text.length > 80 ? text.substring(0, 80) + '...' : text;
    };

    return (
        <div className="detail-section">
            <label className="input-label">Nuova Nota</label>
            <RichTextEditor value={newNote} onChange={setNewNote} />
            <button className="btn btn-primary btn-sm" onClick={addNote} style={{ alignSelf: 'flex-end', marginTop: '8px' }}>
                + Aggiungi Nota
            </button>

            <label className="input-label" style={{ marginTop: '12px' }}>Cronologia (Clicca per leggere/modificare)</label>
            <div className="notes-log">
                {notes.length === 0 && (
                    <div className="empty-state" style={{ padding: '24px' }}>
                        <div className="empty-state-icon">📝</div>
                        <div className="empty-state-text">Nessuna nota inserita</div>
                    </div>
                )}
                {notes.map((note, idx) => (
                    <div key={note.id} className="note-item clickable"
                        style={{ animationDelay: `${idx * 30}ms`, borderLeft: !note.readAt ? '3px solid var(--primary)' : '3px solid transparent' }}
                        onClick={() => setSelectedNote(note)}>
                        <div className="note-item-header">
                            <span className="note-item-time">{formatDate(note.createdAt)}</span>
                            <div style={{ display: 'flex', gap: '2px' }}>
                                <button className="btn btn-ghost btn-icon-sm" style={{ width: '22px', height: '22px', fontSize: '0.65rem' }}
                                    title={note.readAt ? 'Segna come non letto' : 'Segna come letto'}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        update('notes', notes.map(n => n.id === note.id ? { ...n, readAt: note.readAt ? null : new Date().toISOString() } : n));
                                    }}>
                                    {note.readAt ? '👁️' : '🔵'}
                                </button>
                                <button className="btn btn-ghost btn-icon-sm" style={{ width: '22px', height: '22px', fontSize: '0.7rem' }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        confirmDelete('note', note.id);
                                    }}>✕</button>
                            </div>
                        </div>
                        <div className="note-item-snippet">
                            {getNoteSnippet(note.text)}
                        </div>
                    </div>
                ))}
            </div>

            {selectedNote && (
                <NoteModal
                    note={selectedNote}
                    onSave={(updatedText) => {
                        update('notes', notes.map(n => n.id === selectedNote.id ? { ...n, text: updatedText } : n));
                        setSelectedNote(null);
                    }}
                    onClose={() => setSelectedNote(null)}
                />
            )}
        </div>
    );
}

/* ── FILE PREVIEW MODAL ── */
function FilePreviewModal({ file, onClose }) {
    const isImage = file.type?.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    const isText = file.type?.startsWith('text/');

    return (
        <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={onClose}>
            <div className="modal-content" style={{ maxWidth: '90vw', maxHeight: '90vh', background: '#000' }} onClick={e => e.stopPropagation()}>
                <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 10 }}>
                    <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ color: '#fff', background: 'rgba(0,0,0,0.5)' }}>✕</button>
                </div>
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto' }}>
                    {isImage && <img src={file.data} alt={file.name} style={{ maxWidth: '100%', maxHeight: '100%' }} />}
                    {isPdf && <iframe src={file.data} title={file.name} style={{ width: '100%', height: '80vh', border: 'none' }} />}
                    {isText && (
                        <div style={{ padding: '40px', background: '#fff', color: '#000', width: '100%', minHeight: '100%', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                            {file.data}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
/* ── ADVANCED INSTALLMENT MODAL ── */
function AdvancedInstallmentModal({ quoteAmount, currentTotal, onConfirm, onClose, defaultCount = 3 }) {
    const [count, setCount] = useState(defaultCount);
    const [deposit, setDeposit] = useState(0);
    const [weight, setWeight] = useState(0); // -1 to 1
    const [rounded, setRounded] = useState(false);

    const remaining = Math.max(0, quoteAmount - currentTotal);

    const generatePreview = () => {
        if (remaining <= 0 || count <= 0) return [];
        const installments = [];

        let currentRemaining = remaining;
        let startIdx = 0;
        let distCount = count;

        // If deposit is specified, the first installment is fixed as the deposit
        if (deposit > 0) {
            const firstAmount = Math.min(remaining, deposit);
            installments.push({
                id: `new-0-${Date.now()}`,
                amount: firstAmount.toFixed(2),
                description: 'Acconto',
                dueDate: '',
                paid: false
            });
            currentRemaining -= firstAmount;
            startIdx = 1;
            distCount = count - 1;
        }

        // Distribute the rest (or all if no deposit) among the remaining slots
        if (distCount > 0 && currentRemaining > 0) {
            let rawWeights = [];
            for (let i = 0; i < distCount; i++) {
                const x = distCount > 1 ? i / (distCount - 1) : 0.5;
                const w = 1 + weight * (2 * x - 1);
                rawWeights.push(Math.max(0.1, w));
            }

            const sumWeights = rawWeights.reduce((a, b) => a + b, 0);
            let distributedSum = 0;

            for (let i = 0; i < distCount; i++) {
                const idx = startIdx + i;
                let amount;

                if (i === distCount - 1) {
                    // Last one gets the exact difference to avoid 1-cent bug
                    amount = Math.max(0, currentRemaining - distributedSum);
                } else {
                    amount = (rawWeights[i] / sumWeights) * currentRemaining;
                    if (rounded) {
                        // Rounding logic: round to 5, 10 or similar
                        // Let's try rounding to nearest 5 for better aesthetics as per user "730" example
                        amount = Math.round(amount / 5) * 5;
                    }
                    distributedSum += amount;
                }

                installments.push({
                    id: `new-${idx}-${Date.now()}`,
                    amount: amount.toFixed(2),
                    description: `Rata ${idx + 1}`,
                    dueDate: '',
                    paid: false
                });
            }
        }

        return installments;
    };

    const preview = generatePreview();

    return (
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
            <div className="modal-content animate-scale-in" style={{ maxWidth: '500px', padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0 }}>Crea Rate Avanzate</h3>
                    <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
                </div>

                <div className="detail-group">
                    <label className="input-label">Saldo Rimanente: <strong>{new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(remaining)}</strong></label>
                </div>

                <div className="detail-row" style={{ marginBottom: '16px', gap: '16px' }}>
                    <div className="detail-group" style={{ flex: 1 }}>
                        <label className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Acconto (1ª Rata)</span>
                            <span style={{ fontSize: '0.7rem', color: deposit > (quoteAmount * 0.3) ? 'var(--danger)' : 'var(--text-tertiary)' }}>
                                Max 20-30%: {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(quoteAmount * 0.3)}
                            </span>
                        </label>
                        <input className={`input ${deposit > (quoteAmount * 0.3) ? 'input-error' : ''}`} type="number" min="0" step="0.01" value={deposit || ''}
                            onChange={e => setDeposit(parseFloat(e.target.value) || 0)} placeholder="0.00" />
                        {deposit > (quoteAmount * 0.3) && (
                            <div style={{ color: 'var(--danger)', fontSize: '0.7rem', marginTop: '4px' }}>⚠️ Acconto elevato (&gt; 30%)</div>
                        )}
                    </div>
                    <div className="detail-group" style={{ flex: 1 }}>
                        <label className="input-label">Numero totale rate</label>
                        <input className="input" type="number" min="1" max="24" value={count}
                            onChange={e => setCount(Math.max(1, parseInt(e.target.value) || 1))} />
                    </div>
                </div>

                <div className="detail-group" style={{ marginBottom: '20px' }}>
                    <label className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Distribuzione Peso (per le rate successive)</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600 }}>
                            {weight < -0.2 ? 'Più alte all\'inizio' : weight > 0.2 ? 'Più alte alla fine' : 'Omogenee'}
                        </span>
                    </label>
                    <input
                        type="range" min="-1" max="1" step="0.1" value={weight}
                        onChange={e => setWeight(parseFloat(e.target.value))}
                        style={{ width: '100%', accentColor: 'var(--primary)' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                        <span>Inizio 📈</span>
                        <span>0</span>
                        <span>📈 Fine</span>
                    </div>
                </div>

                <div className="detail-group" style={{ marginBottom: '20px' }}>
                    <button
                        className={`btn ${rounded ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                        onClick={() => setRounded(!rounded)}
                        style={{ width: '100%', justifyContent: 'center' }}
                    >
                        {rounded ? '✨ Arrotondamento Attivo' : '⭕ Arrotonda prezzi (es. 731 → 730)'}
                    </button>
                </div>

                <div className="preview-list" style={{ maxHeight: '200px', overflowY: 'auto', background: 'var(--bg-input)', padding: '12px', borderRadius: 'var(--radius-md)', marginBottom: '20px' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>ANTEPRIMA PIANO:</div>
                    {preview.map(p => (
                        <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '6px 0', borderBottom: '1px solid var(--border-light)' }}>
                            <span>{p.description}</span>
                            <strong>{new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(p.amount)}</strong>
                        </div>
                    ))}
                    {preview.length > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', paddingTop: '8px', marginTop: '4px', borderTop: '2px solid var(--border)' }}>
                            <strong>TOTALE GENERAO</strong>
                            <strong>{new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(preview.reduce((acc, p) => acc + parseFloat(p.amount), 0))}</strong>
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                    <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Annulla</button>
                    <button className="btn btn-primary" style={{ flex: 2 }} onClick={() => onConfirm(preview)}>Applica {count} Rate</button>
                </div>
            </div>
        </div>
    );
}

/* ── NOTE MODAL ── */
function NoteModal({ note, onSave, onClose }) {
    const [text, setText] = useState(note.text);

    return (
        <div className="modal-overlay" style={{ zIndex: 1200 }} onClick={onClose}>
            <div className="modal-content animate-scale-in"
                style={{ maxWidth: '800px', width: '90%', padding: '24px' }}
                onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0 }}>Modifica Nota</h3>
                    <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
                </div>

                <div style={{ marginBottom: '24px', minHeight: '300px' }}>
                    <RichTextEditor value={text} onChange={setText} />
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary" onClick={onClose}>Annulla</button>
                    <button className="btn btn-primary" onClick={() => onSave(text)}>Salva Modifiche</button>
                </div>
            </div>
        </div>
    );
}

/* ── QUOTE FILE UPLOAD HELPERS ── */
function QuoteFileUpload({ form, update }) {
    const fileRef = useRef(null);
    const quoteFile = (form.files || []).find(f => f.isQuote);
    const [previewFile, setPreviewFile] = useState(null);

    const handleUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            alert('File troppo grande (max 5MB)');
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            const newFile = {
                id: generateId(),
                name: file.name,
                size: file.size,
                type: file.type,
                data: reader.result,
                uploadedAt: new Date().toISOString(),
                isQuote: true // Metadata to distinguish it
            };
            // Replace existing quote OR add new
            const otherFiles = (form.files || []).filter(f => !f.isQuote);
            update('files', [...otherFiles, newFile]);
        };
        reader.readAsDataURL(file);
    };

    const downloadFile = (file) => {
        const a = document.createElement('a');
        a.href = file.data;
        a.download = file.name;
        a.click();
    };

    return (
        <div className="quote-file-box">
            {quoteFile ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--bg-input)', padding: '10px', borderRadius: 'var(--radius-md)' }}>
                    <span style={{ fontSize: '1.25rem', cursor: 'pointer' }} onClick={() => setPreviewFile(quoteFile)}>📄</span>
                    <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setPreviewFile(quoteFile)}>
                        <div style={{ fontSize: '0.8125rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'underline' }}>
                            {quoteFile.name}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>{formatBytes(quoteFile.size)}</div>
                    </div>
                    <button className="btn btn-ghost btn-icon-sm" onClick={() => downloadFile(quoteFile)} title="Scarica">⬇</button>
                    <button className="btn btn-ghost btn-icon-sm"
                        onClick={() => update('files', (form.files || []).filter(f => f.id !== quoteFile.id))}>✕</button>
                </div>
            ) : (
                <div className="quote-upload-placeholder" onClick={() => fileRef.current?.click()}>
                    <span style={{ fontSize: '1.5rem', marginBottom: '4px' }}>📤</span>
                    <span>Carica Preventivo PDF</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Max 5MB • Sola visualizzazione</span>
                </div>
            )}
            <input ref={fileRef} type="file" accept=".pdf" hidden onChange={handleUpload} />

            {previewFile && (
                <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
            )}

            <style>{`
                .quote-upload-placeholder {
                    border: 2px dashed var(--border);
                    border-radius: var(--radius-md);
                    padding: 20px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    cursor: pointer;
                    color: var(--text-secondary);
                    font-size: 0.8125rem;
                    transition: all 0.2s;
                }
                .quote-upload-placeholder:hover {
                    border-color: var(--primary);
                    background: var(--primary-ghost);
                    color: var(--primary);
                }
            `}</style>
        </div>
    );
}
