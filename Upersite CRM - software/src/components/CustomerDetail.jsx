import React, { useState, useRef, useEffect } from 'react';
import RichTextEditor from './RichTextEditor';
import { generateId, sanitizePositiveNumber, formatBytes, saveFile, getMasterPassword, PACKAGES, ADDONS } from '../utils/storage';

const STATUSES = [
    { value: 'prospect', label: 'Prospect' },
    { value: 'working', label: 'In lavorazione' },
    { value: 'paused', label: 'Sospeso' },
    { value: 'completed', label: 'Completato' },
];

/* ── DEBOUNCED INPUT ── */
function DebouncedInput({ value, onChange, ...props }) {
    const [localValue, setLocalValue] = useState(value || '');

    useEffect(() => {
        setLocalValue(value || '');
    }, [value]);

    const handleChange = (e) => setLocalValue(e.target.value);

    const handleBlur = (e) => {
        if (localValue !== (value || '')) {
            onChange(localValue);
        }
        if (props.onBlur) props.onBlur(e);
    };

    return <input {...props} value={localValue} onChange={handleChange} onBlur={handleBlur} />;
}

/* ── DEBOUNCED TEXTAREA ── */
function DebouncedTextarea({ value, onChange, ...props }) {
    const [localValue, setLocalValue] = useState(value || '');

    useEffect(() => {
        setLocalValue(value || '');
    }, [value]);

    const handleChange = (e) => setLocalValue(e.target.value);

    const handleBlur = (e) => {
        if (localValue !== (value || '')) {
            onChange(localValue);
        }
        if (props.onBlur) props.onBlur(e);
    };

    return <textarea {...props} value={localValue} onChange={handleChange} onBlur={handleBlur} />;
}

/* ── RECURRENCE HELPER ── */
const calculateNextDueDate = (currentDateStr, frequency) => {
    if (!currentDateStr || frequency === 'none') return '';
    try {
        const date = new Date(currentDateStr);
        if (isNaN(date.getTime())) return '';
        
        switch (frequency) {
            case 'Settimanale': date.setDate(date.getDate() + 7); break;
            case 'Mensile': date.setMonth(date.getMonth() + 1); break;
            case 'Trimestrale': date.setMonth(date.getMonth() + 3); break;
            case 'Semestrale': date.setMonth(date.getMonth() + 6); break;
            case 'Annuale': date.setFullYear(date.getFullYear() + 1); break;
            default: return '';
        }
        return date.toISOString().split('T')[0];
    } catch {
        return '';
    }
};

/* ── TO-DO SECTION ── */
const TodoSection = React.memo(({ form, update, confirmDelete, onInternalLink, onOpenFile, onOpenNote }) => {
    const todos = form.todo || [];
    const allFiles = form.files || [];
    const allNotes = form.notes || [];
    const [newTask, setNewTask] = useState('');
    const [draftSubtask, setDraftSubtask] = useState({});
    const [openSubtask, setOpenSubtask] = useState({});
    const [openDetails, setOpenDetails] = useState({});
    const [priority, setPriority] = useState('Media');
    const [dueDate, setDueDate] = useState('');
    const [recurrence, setRecurrence] = useState('none');

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
            subtasks: [],
            description: '',
            linkedFiles: [],
            linkedNotes: [],
            recurrence: 'none'
        };

        update('todo', [...todos, todo]);
        setNewTask('');
        setPriority('Media');
        setDueDate('');
        setRecurrence('none');
    };

    const toggleTodo = (id) => {
        const toggleRecursive = (items) => items.map(t => {
            if (t.id === id) {
                const completed = !t.completed;
                return { 
                    ...t, 
                    completed, 
                    readAt: completed ? new Date().toISOString() : null,
                    // Handle recurrence
                    ...(completed && t.recurrence && t.recurrence !== 'none' ? {
                        dueDate: calculateNextDueDate(t.dueDate, t.recurrence)
                    } : {})
                };
            }
            if (t.subtasks && t.subtasks.length > 0) {
                return { ...t, subtasks: toggleRecursive(t.subtasks) };
            }
            return t;
        });
        update('todo', toggleRecursive(todos));
    };

    const deleteTodo = (id) => {
        confirmDelete('todo', id);
    };

    const addSubtask = (parentId, level = 0) => {
        const text = draftSubtask[parentId]?.trim();
        if (!text) return;

        const addRecursive = (items) => items.map(t => {
            if (t.id === parentId) {
                return {
                    ...t,
                    subtasks: [...(t.subtasks || []), {
                        id: generateId(),
                        text,
                        priority: 'Media',
                        dueDate: '',
                        completed: false,
                        createdAt: new Date().toISOString(),
                        readAt: null,
                        subtasks: [],
                        description: '',
                        linkedFiles: [],
                        linkedNotes: [],
                        recurrence: 'none'
                    }]
                };
            }
            if (t.subtasks && t.subtasks.length > 0) {
                return { ...t, subtasks: addRecursive(t.subtasks) };
            }
            return t;
        });
        
        update('todo', addRecursive(todos));
        setDraftSubtask(prev => ({ ...prev, [parentId]: '' }));
    };

    const updateTodo = (id, field, value) => {
        const updateRecursive = (items) => items.map(t => {
            if (t.id === id) {
                return { ...t, [field]: value };
            }
            if (t.subtasks && t.subtasks.length > 0) {
                return { ...t, subtasks: updateRecursive(t.subtasks) };
            }
            return t;
        });
        update('todo', updateRecursive(todos));
    };

    const toggleSubtask = (parentId) => {
        setOpenSubtask(prev => ({ ...prev, [parentId]: !prev[parentId] }));
    };

    const toggleDetails = (id) => {
        setOpenDetails(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const linkFileToTodo = (todoId, fileId) => {
        const updateRecursive = (items) => items.map(t => {
            if (t.id === todoId) {
                return {
                    ...t,
                    linkedFiles: [...(t.linkedFiles || []), fileId]
                };
            }
            if (t.subtasks && t.subtasks.length > 0) {
                return { ...t, subtasks: updateRecursive(t.subtasks) };
            }
            return t;
        });
        update('todo', updateRecursive(todos));
    };

    const unlinkFileFromTodo = (todoId, fileId) => {
        const updateRecursive = (items) => items.map(t => {
            if (t.id === todoId) {
                return {
                    ...t,
                    linkedFiles: (t.linkedFiles || []).filter(f => f !== fileId)
                };
            }
            if (t.subtasks && t.subtasks.length > 0) {
                return { ...t, subtasks: updateRecursive(t.subtasks) };
            }
            return t;
        });
        update('todo', updateRecursive(todos));
    };

    const linkNoteToTodo = (todoId, noteId) => {
        const updateRecursive = (items) => items.map(t => {
            if (t.id === todoId) {
                return {
                    ...t,
                    linkedNotes: [...(t.linkedNotes || []), noteId]
                };
            }
            if (t.subtasks && t.subtasks.length > 0) {
                return { ...t, subtasks: updateRecursive(t.subtasks) };
            }
            return t;
        });
        update('todo', updateRecursive(todos));
    };

    const unlinkNoteFromTodo = (todoId, noteId) => {
        const updateRecursive = (items) => items.map(t => {
            if (t.id === todoId) {
                return {
                    ...t,
                    linkedNotes: (t.linkedNotes || []).filter(n => n !== noteId)
                };
            }
            if (t.subtasks && t.subtasks.length > 0) {
                return { ...t, subtasks: updateRecursive(t.subtasks) };
            }
            return t;
        });
        update('todo', updateRecursive(todos));
    };

    const getNoteSnippet = (text) => {
        return text.length > 30 ? text.substring(0, 30) + '...' : text;
    };

    const renderTodoItem = (t, level = 0) => {
        const hasChildren = t.subtasks && t.subtasks.length > 0;
        const linkedFileObjects = (t.linkedFiles || []).map(id => allFiles.find(f => f.id === id)).filter(Boolean);
        const linkedNoteObjects = (t.linkedNotes || []).map(id => allNotes.find(n => n.id === id)).filter(Boolean);

        return (
            <div key={t.id} style={{ marginLeft: `${level * 20}px`, marginBottom: level === 0 ? '12px' : '8px' }}>
                <div className="todo-item-card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                        <input
                            type="checkbox"
                            className="todo-checkbox"
                            checked={t.completed}
                            onChange={() => toggleTodo(t.id)}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{
                                    textDecoration: t.completed ? 'line-through' : 'none',
                                    opacity: t.completed ? 0.6 : 1,
                                    fontWeight: t.readAt ? 400 : 600,
                                    color: t.readAt ? 'var(--text-secondary)' : 'var(--text-primary)',
                                    wordBreak: 'break-word',
                                    lineHeight: 1.4
                                }}>
                                    {t.text}
                                </span>
                                {t.priority && (
                                    <span style={{
                                        fontSize: '0.7rem',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        background: t.priority === 'Alta' ? 'var(--danger)' : t.priority === 'Media' ? 'var(--warning)' : 'var(--success)',
                                        color: '#fff',
                                        fontWeight: 600
                                    }}>
                                        {t.priority}
                                    </span>
                                )}
                                {t.dueDate && (
                                    <span style={{
                                        fontSize: '0.75rem',
                                        color: isOverdue(t.dueDate) ? 'var(--danger)' : 'var(--text-secondary)',
                                        fontWeight: isOverdue(t.dueDate) ? 700 : 400
                                    }}>
                                        📅 {new Date(t.dueDate).toLocaleDateString()}
                                        {isOverdue(t.dueDate) && ' ⚠️'}
                                    </span>
                                )}
                                {t.recurrence && t.recurrence !== 'none' && (
                                    <span style={{
                                        fontSize: '0.65rem',
                                        background: 'var(--primary)',
                                        color: '#fff',
                                        padding: '1px 6px',
                                        borderRadius: '4px',
                                        fontWeight: 600
                                    }}>
                                        {t.recurrence}
                                    </span>
                                )}
                            </div>
                            {(linkedFileObjects.length > 0 || linkedNoteObjects.length > 0) && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                                    {linkedFileObjects.map(f => (
                                        <span key={f.id} className="todo-linked-badge clickable" onClick={() => onOpenFile && onOpenFile(f.id)}>
                                            📎 {f.name}
                                            <span className="todo-linked-remove" onClick={(e) => { e.stopPropagation(); unlinkFileFromTodo(t.id, f.id); }}>✕</span>
                                        </span>
                                    ))}
                                    {linkedNoteObjects.map(n => (
                                        <span key={n.id} className="todo-linked-badge clickable" onClick={() => onOpenNote && onOpenNote(n.id)}>
                                            📝 {getNoteSnippet(n.text)}
                                            <span className="todo-linked-remove" onClick={(e) => { e.stopPropagation(); unlinkNoteFromTodo(t.id, n.id); }}>✕</span>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <button className="btn btn-ghost btn-icon-sm" onClick={() => toggleDetails(t.id)} title="Dettagli">
                                {openDetails[t.id] ? '📖' : '📄'}
                            </button>
                            {level < 2 && (
                                <button className="btn btn-ghost btn-icon-sm" onClick={() => toggleSubtask(t.id)} title="Sotto-attività">
                                    {openSubtask[t.id] ? '➖' : '➕'}
                                </button>
                            )}
                            <button className="btn btn-ghost btn-icon-sm" onClick={() => deleteTodo(t.id)} title="Elimina">
                                🗑️
                            </button>
                        </div>
                    </div>

                    {openDetails[t.id] && (
                        <div className="todo-details-accordion">
                            <div className="todo-details-section">
                                <label className="todo-details-label">📝 Descrizione</label>
                                <DebouncedTextarea
                                    className="input"
                                    placeholder="Aggiungi descrizione dettagliata..."
                                    value={t.description || ''}
                                    onChange={val => updateTodo(t.id, 'description', val)}
                                    rows={3}
                                    style={{ fontSize: '0.9rem' }}
                                />
                            </div>

                            <div className="todo-details-section">
                                <label className="todo-details-label">📎 File collegati</label>
                                {linkedFileObjects.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                                        {linkedFileObjects.map(f => (
                                            <span key={f.id} className="todo-linked-badge clickable" onClick={() => onOpenFile && onOpenFile(f.id)}>
                                                📎 {f.name}
                                                <span className="todo-linked-remove" onClick={(e) => { e.stopPropagation(); unlinkFileFromTodo(t.id, f.id); }}>✕</span>
                                            </span>
                                        ))}
                                    </div>
                                )}
                                {allFiles.filter(f => !(t.linkedFiles || []).includes(f.id)).length > 0 && (
                                    <select
                                        className="input"
                                        style={{ fontSize: '0.8rem' }}
                                        value=""
                                        onChange={e => { if (e.target.value) linkFileToTodo(t.id, e.target.value); }}
                                    >
                                        <option value="">+ Collega un file...</option>
                                        {allFiles.filter(f => !(t.linkedFiles || []).includes(f.id)).map(f => (
                                            <option key={f.id} value={f.id}>{f.name}</option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            <div className="todo-details-section">
                                <label className="todo-details-label">📝 Note collegate</label>
                                {linkedNoteObjects.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                                        {linkedNoteObjects.map(n => (
                                            <span key={n.id} className="todo-linked-badge clickable" onClick={() => onOpenNote && onOpenNote(n.id)}>
                                                📝 {getNoteSnippet(n.text)}
                                                <span className="todo-linked-remove" onClick={(e) => { e.stopPropagation(); unlinkNoteFromTodo(t.id, n.id); }}>✕</span>
                                            </span>
                                        ))}
                                    </div>
                                )}
                                {allNotes.filter(n => !(t.linkedNotes || []).includes(n.id)).length > 0 && (
                                    <select
                                        className="input"
                                        style={{ fontSize: '0.8rem' }}
                                        value=""
                                        onChange={e => { if (e.target.value) linkNoteToTodo(t.id, e.target.value); }}
                                    >
                                        <option value="">+ Collega una nota...</option>
                                        {allNotes.filter(n => !(t.linkedNotes || []).includes(n.id)).map(n => (
                                            <option key={n.id} value={n.id}>{getNoteSnippet(n.text)}</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        </div>
                    )}

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

    const priorityOrder = { 'Alta': 0, 'Media': 1, 'Bassa': 2 };

    const pending = todos.filter(t => !t.completed).sort((a, b) => {
        // First sort by priority (Alta > Media > Bassa)
        const pa = priorityOrder[a.priority] ?? 1;
        const pb = priorityOrder[b.priority] ?? 1;
        if (pa !== pb) return pa - pb;
        // Then by due date
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
                <select 
                    className="input" 
                    value={recurrence} 
                    onChange={e => setRecurrence(e.target.value)}
                    style={{ flex: '0 0 130px' }}
                    title="Ricorrenza"
                >
                    <option value="none">Non ricorr.</option>
                    <option value="Settimanale">Settimanale</option>
                    <option value="Mensile">Mensile</option>
                    <option value="Trimestrale">Trimestrale</option>
                    <option value="Semestrale">Semestrale</option>
                    <option value="Annuale">Annuale</option>
                </select>
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
                .todo-details-accordion {
                    margin: 8px 0 12px 30px;
                    padding: 14px 16px;
                    background: var(--bg-input);
                    border: 1px solid var(--border-light);
                    border-radius: var(--radius-md);
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    animation: fade-in 0.2s ease-out;
                }
                .todo-details-section {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                .todo-details-label {
                    font-size: 0.7rem;
                    font-weight: 600;
                    color: var(--text-tertiary);
                    text-transform: uppercase;
                }
                .todo-linked-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    background: var(--bg-card);
                    border: 1px solid var(--border-light);
                    border-radius: 20px;
                    padding: 4px 10px;
                    font-size: 0.75rem;
                    color: var(--text-primary);
                    max-width: 200px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .todo-linked-remove {
                    cursor: pointer;
                    color: var(--danger);
                    font-weight: 700;
                    font-size: 0.65rem;
                    margin-left: 2px;
                    flex-shrink: 0;
                }
                .todo-linked-remove:hover {
                    opacity: 0.7;
                }
            `}</style>
        </div>
    );
});

/* ── LOGO/AVATAR ── */
function LogoAvatar({ logo, name, onLogoChange }) {
    const fileInputRef = useRef(null);

    const handleFileSelect = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 500 * 1024) {
            alert('Logo troppo grande (max 500KB)');
            return;
        }

        try {
            const fileData = await saveFile(null, file);
            onLogoChange(fileData);
        } catch (error) {
            console.error('Errore caricamento logo:', error);
            alert('Errore durante il caricamento del logo');
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            <div
                style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '2rem',
                    fontWeight: 600,
                    color: 'white',
                    background: logo && logo.data
                        ? `url(${logo.data}) center/cover`
                        : 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
                    cursor: 'pointer',
                    border: '2px solid var(--border-light)',
                    overflow: 'hidden',
                    transition: 'all 0.2s'
                }}
                onClick={() => fileInputRef.current?.click()}
                title="Cambia logo"
            >
                {!logo && (name || 'Cliente').charAt(0).toUpperCase()}
            </div>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFileSelect}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Clicca per cambiare logo</span>
        </div>
    );
}

/* ── GENERAL ── */
const GeneralSection = React.memo(({ form, update, allTags, newTag, setNewTag }) => {
    return (
        <>
            <LogoAvatar
                logo={form.logo}
                name={form.name}
                onLogoChange={(fileData) => update('logo', fileData)}
            />

            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                <div style={{ flex: 1 }}>
                    <label className="input-label">Nome *</label>
                    <DebouncedInput className="input" value={form.name} onChange={val => update('name', val)} placeholder="Mario Rossi" />
                </div>
                <div style={{ flex: 1 }}>
                    <label className="input-label">Azienda</label>
                    <DebouncedInput className="input" value={form.company || ''} onChange={val => update('company', val)} placeholder="Es. Sviluppo Software" />
                </div>
            </div>

            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                <div style={{ flex: 1 }}>
                    <label className="input-label">Email</label>
                    <DebouncedInput className="input" type="email" value={form.email || ''} onChange={val => update('email', val)} placeholder="mario@rossi.it" />
                </div>
                <div style={{ flex: 1 }}>
                    <label className="input-label">Telefono</label>
                    <DebouncedInput className="input" value={form.phone || ''} onChange={val => update('phone', val)} placeholder="+39 333 1234567" />
                </div>
            </div>

            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                <div style={{ flex: 1 }}>
                    <label className="input-label">Stato</label>
                    <select className="input" value={form.status || ''} onChange={e => update('status', e.target.value)}>
                        {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                </div>
                <div style={{ flex: 1 }}>
                    <label className="input-label">Pacchetto</label>
                    <select className="input" value={form.packageType || ''} onChange={e => update('packageType', e.target.value)}>
                        <option value="">Nessuno</option>
                        {PACKAGES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                </div>
            </div>

            {/* Tags */}
            <div className="detail-group">
                <label className="input-label">Tag</label>
                {(form.tags || []).length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
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
                <div style={{ display: 'flex', gap: '8px' }}>
                    <input className="input" value={newTag} onChange={e => setNewTag(e.target.value)}
                        placeholder="Nuovo tag..." style={{ flex: 1 }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (newTag.trim()) { update('tags', [...(form.tags || []), newTag.trim()]); setNewTag(''); } } }} />
                    <button className="btn btn-secondary" onClick={() => { if (newTag.trim()) { update('tags', [...(form.tags || []), newTag.trim()]); setNewTag(''); } }}>Aggiungi</button>
                </div>
            </div>
        </>
    );
});

/* ── FINANCE ── */
const FinanceSection = React.memo(({ form, update }) => {
    const [showAdvanced, setShowAdvanced] = useState(false);

    const addInstallment = () => {
        const inst = {
            id: generateId(),
            amount: '',
            dueDate: '',
            paid: false,
            createdAt: new Date().toISOString()
        };
        update('installments', [...(form.installments || []), inst]);
    };

    const updateInstallment = (id, field, value) => {
        update('installments', (form.installments || []).map(inst =>
            inst.id === id ? { ...inst, [field]: value } : inst
        ));
    };

    const deleteInstallment = (id) => {
        update('installments', (form.installments || []).filter(inst => inst.id !== id));
    };

    return (
        <div className="detail-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <label className="input-label">Rate</label>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowAdvanced(!showAdvanced)}>
                    {showAdvanced ? 'Semplice' : 'Avanzate'}
                </button>
            </div>
            
            {(form.installments || []).map((inst, idx) => (
                <div key={inst.id} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <input className="input" placeholder="Importo" value={inst.amount || ''} onChange={e => updateInstallment(inst.id, 'amount', e.target.value)} style={{ flex: 1 }} />
                    <input type="date" className="input" value={inst.dueDate || ''} onChange={e => updateInstallment(inst.id, 'dueDate', e.target.value)} style={{ flex: 1 }} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input type="checkbox" checked={inst.paid} onChange={e => updateInstallment(inst.id, 'paid', e.target.checked)} />
                        Pagata
                    </label>
                    <button className="btn btn-ghost btn-icon-sm" onClick={() => deleteInstallment(inst.id)}>🗑️</button>
                </div>
            ))}
            
            <button className="btn btn-secondary" onClick={addInstallment} style={{ marginTop: '8px' }}>+ Aggiungi Rata</button>
        </div>
    );
});

/* ── CREDENTIALS ── */
const CredentialsSection = React.memo(({ form, update }) => {
    const addCredential = () => {
        const cred = {
            id: generateId(),
            service: '',
            username: '',
            password: '',
            notes: '',
            createdAt: new Date().toISOString()
        };
        update('credentials', [...(form.credentials || []), cred]);
    };

    const updateCredential = (id, field, value) => {
        update('credentials', (form.credentials || []).map(cred =>
            cred.id === id ? { ...cred, [field]: value } : cred
        ));
    };

    const deleteCredential = (id) => {
        update('credentials', (form.credentials || []).filter(cred => cred.id !== id));
    };

    return (
        <div className="detail-section">
            <label className="input-label">Credenziali</label>
            {(form.credentials || []).map((cred, idx) => (
                <div key={cred.id} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <input className="input" placeholder="Servizio" value={cred.service || ''} onChange={e => updateCredential(cred.id, 'service', e.target.value)} style={{ flex: 1 }} />
                    <input className="input" placeholder="Username" value={cred.username || ''} onChange={e => updateCredential(cred.id, 'username', e.target.value)} style={{ flex: 1 }} />
                    <input type="password" className="input" placeholder="Password" value={cred.password || ''} onChange={e => updateCredential(cred.id, 'password', e.target.value)} style={{ flex: 1 }} />
                    <button className="btn btn-ghost btn-icon-sm" onClick={() => deleteCredential(cred.id)}>🗑️</button>
                </div>
            ))}
            
            <button className="btn btn-secondary" onClick={addCredential} style={{ marginTop: '8px' }}>+ Aggiungi Credenziale</button>
        </div>
    );
});

/* ── FILES ── */
const FilesSection = React.memo(({ form, update }) => {
    const fileRef = useRef(null);

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            alert('File troppo grande (max 5MB)');
            return;
        }

        try {
            const fileData = await saveFile(form.id, file, (loaded, total) => {
                const progress = (loaded / total) * 100;
                console.log(`Upload progress: ${progress.toFixed(1)}%`);
            });
            update('files', [...(form.files || []), fileData]);
        } catch (error) {
            console.error('Errore caricamento file:', error);
            alert('Errore durante il caricamento del file');
        }
    };

    const getFileIcon = (type) => {
        if (type === 'folder') return '📁';
        if (type?.includes('pdf')) return '📄';
        if (type?.includes('image')) return '🖼️';
        if (type?.includes('doc') || type?.includes('word')) return '📝';
        if (type?.includes('sheet') || type?.includes('excel')) return '📊';
        return '📎';
    };

    const formatFileSize = (bytes) => {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div className="detail-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <label className="input-label">File</label>
                <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
                    📤 Carica File
                </button>
            </div>
            
            <input ref={fileRef} type="file" multiple hidden onChange={handleFileUpload} />
            
            {(form.files || []).map(file => (
                <div key={file.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', marginBottom: '8px' }}>
                    <span style={{ fontSize: '1.2rem' }}>{getFileIcon(file.type)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500 }}>{file.name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{formatFileSize(file.size)}</div>
                    </div>
                    <button className="btn btn-ghost btn-icon-sm" onClick={() => update('files', form.files.filter(f => f.id !== file.id))}>🗑️</button>
                </div>
            ))}
        </div>
    );
});

/* ── NOTES ── */
const NotesSection = React.memo(({ form, update }) => {
    const [newNote, setNewNote] = useState('');

    const addNote = () => {
        const text = newNote.trim();
        if (!text) return;

        const note = {
            id: generateId(),
            text,
            createdAt: new Date().toISOString(),
            pinned: false
        };

        update('notes', [...(form.notes || []), note]);
        setNewNote('');
    };

    const deleteNote = (id) => {
        update('notes', (form.notes || []).filter(n => n.id !== id));
    };

    const togglePinNote = (id) => {
        update('notes', (form.notes || []).map(n =>
            n.id === id ? { ...n, pinned: !n.pinned } : n
        ));
    };

    return (
        <div className="detail-section">
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <input className="input" placeholder="Nuova nota..." value={newNote} onChange={e => setNewNote(e.target.value)} style={{ flex: 1 }} />
                <button className="btn btn-primary" onClick={addNote}>Aggiungi</button>
            </div>
            
            {(form.notes || []).map(note => (
                <div key={note.id} style={{ padding: '12px', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', marginBottom: '8px', background: note.pinned ? 'var(--bg-hover)' : 'transparent' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, whiteSpace: 'pre-wrap' }}>{note.text}</div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                            <button className="btn btn-ghost btn-icon-sm" onClick={() => togglePinNote(note.id)} title={note.pinned ? 'Rimuovi pin' : 'Pin'}>
                                {note.pinned ? '📌' : '📍'}
                            </button>
                            <button className="btn btn-ghost btn-icon-sm" onClick={() => deleteNote(note.id)}>🗑️</button>
                        </div>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                        {new Date(note.createdAt).toLocaleString()}
                    </div>
                </div>
            ))}
        </div>
    );
});

/* ── QUOTE ── */
const QuoteSection = React.memo(({ form, update }) => {
    const [quoteFile, setQuoteFile] = useState(form.quoteFile || null);
    const quoteFileRef = useRef(null);

    const handleQuoteUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            alert('Preventivo troppo grande (max 5MB)');
            return;
        }

        if (file.type !== 'application/pdf') {
            alert('Solo file PDF sono ammessi');
            return;
        }

        try {
            const fileData = await saveFile(form.id, file);
            setQuoteFile(fileData);
            update('quoteFile', fileData);
        } catch (error) {
            console.error('Errore caricamento preventivo:', error);
            alert('Errore durante il caricamento del preventivo');
        }
    };

    const formatFileSize = (bytes) => {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div className="detail-section">
            <label className="input-label">Preventivo PDF</label>
            {!quoteFile ? (
                <div className="quote-upload-placeholder" onClick={() => quoteFileRef.current?.click()}>
                    <span style={{ fontSize: '1.5rem', marginBottom: '4px' }}>📤</span>
                    <span>Carica Preventivo PDF</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Max 5MB • Sola visualizzazione</span>
                </div>
            ) : (
                <div style={{ padding: '16px', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📄</div>
                    <div style={{ fontWeight: 500 }}>{quoteFile.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>{formatFileSize(quoteFile.size)}</div>
                    <button className="btn btn-secondary" onClick={() => { setQuoteFile(null); update('quoteFile', null); }} style={{ marginTop: '8px' }}>
                        Rimuovi
                    </button>
                </div>
            )}
            <input ref={quoteFileRef} type="file" accept=".pdf" hidden onChange={handleQuoteUpload} />
        </div>
    );
});

export default function CustomerDetail({ customer, allTags, settings, onSave, onDelete, onClose }) {
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
        todo: [],
        logo: null,
        createdAt: new Date().toISOString()
    });

    const isNew = !customer;
    const [activeTab, setActiveTab] = useState('general');
    const [newTag, setNewTag] = useState('');

    const snapshot = useRef(JSON.stringify({ ...form, newTag: '' }));

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [showPaymentWarning, setShowPaymentWarning] = useState(false);
    const [pendingStatus, setPendingStatus] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [initialPreviewFile, setInitialPreviewFile] = useState(null);
    const [initialSelectedNote, setInitialSelectedNote] = useState(null);

    const handleOpenFile = (fileId) => {
        const f = form.files?.find(x => x.id === fileId);
        if (f) {
            setInitialPreviewFile(f);
            setActiveTab('files');
        }
    };

    const handleOpenNote = (noteId) => {
        const n = form.notes?.find(x => x.id === noteId);
        if (n) {
            setInitialSelectedNote(n);
            setActiveTab('notes');
        }
    };

    const handleInternalLink = (id, type) => {
        if (type === 'file') handleOpenFile(id);
        else if (type === 'note') handleOpenNote(id);
    };

    const update = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

    const hasChanges = JSON.stringify({ ...form, newTag }) !== snapshot.current;

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

    const prevConfig = useRef({ pkg: form.packageType, addons: JSON.stringify(form.addons) });

    // Auto-calculate total price based on package and selected addons
    useEffect(() => {
        const pkgChanged = prevConfig.current.pkg !== form.packageType;
        const addonsChanged = prevConfig.current.addons !== JSON.stringify(form.addons);

        if (pkgChanged || addonsChanged) {
            let total = 0;
            const pkg = PACKAGES.find(p => p.id === form.packageType);
            if (pkg) total += pkg.price;

            (form.addons || []).forEach(addonId => {
                const addon = ADDONS.find(a => a.id === addonId);
                if (addon) total += addon.price;
            });

            if (total > 0) {
                update('quoteAmount', total.toString());
            }

            prevConfig.current = { pkg: form.packageType, addons: JSON.stringify(form.addons) };
        }
    }, [form.packageType, form.addons]);

    const handleSave = () => {
        if (!form.name.trim()) {
            alert('Il nome è obbligatorio');
            return;
        }

        setIsSaving(true);

        try {
            onSave(form);
            snapshot.current = JSON.stringify({ ...form, newTag: '' });
            setIsClosing(true);
            setTimeout(() => {
                onClose();
            }, 200);
        } catch (error) {
            console.error('Errore durante il salvataggio:', error);
            alert('Errore durante il salvataggio. Riprova.');
        } finally {
            setTimeout(() => {
                setIsSaving(false);
            }, 300);
        }
    };

    const confirmDelete = (type, id) => {
        setDeleteTarget({ type, id });
    };

    const formatPhone = (input) => {
        const raw = (input || '').toString().trim();
        if (!raw) return '';

        const hasPlus = raw.startsWith('+');
        const digits = raw.replace(/\D/g, '');
        if (!digits) return hasPlus ? '+' : '';

        const ccLen = hasPlus ? (digits.startsWith('39') ? 2 : Math.min(3, Math.max(1, digits.length - 7))) : 0;
        const cc = hasPlus ? digits.slice(0, ccLen) : '';
        let rest = hasPlus ? digits.slice(ccLen) : digits;

        const groups = [];
        if (rest.length <= 3) {
            if (rest) groups.push(rest);
        } else {
            groups.push(rest.slice(0, 3));
            rest = rest.slice(3);
            while (rest.length > 4) {
                groups.push(rest.slice(0, 3));
                rest = rest.slice(3);
            }
            if (rest) groups.push(rest);
        }

        return `${hasPlus ? '+' + cc : ''}${hasPlus ? ' ' : ''}${groups.join(' ')}`.trim();
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
            const removeRecursive = (items) => items.filter(t => {
                if (t.id === id) return false;
                if (t.subtasks) t.subtasks = removeRecursive(t.subtasks);
                return true;
            });
            update('todo', removeRecursive(form.todo || []));
        } else if (type === 'customer') {
            if (onDelete) {
                onDelete(form.id);
            }
            handleClose();
        }
        setDeleteTarget(null);
    };

    const handleStatusChange = (newStatus) => {
        if (newStatus === 'completed' && form.installments && form.installments.some(i => !i.paid)) {
            setShowPaymentWarning(true);
            setPendingStatus(newStatus);
            return;
        }
        update('status', newStatus);
    };

    const confirmStatusChange = () => {
        update('status', pendingStatus);
        setShowPaymentWarning(false);
        setPendingStatus(null);
    };

    return (
        <div className="modal-overlay" style={{ zIndex: 2000 }} onClick={handleClose}>
            <div className="modal-content animate-scale-in" style={{ maxWidth: '1200px', width: '95%', maxHeight: '90vh', overflowY: 'auto', padding: '32px' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>
                        {isNew ? '👤 Nuovo Cliente' : '👤 ' + (form.name || 'Cliente')}
                    </h2>
                    <button className="btn btn-ghost btn-icon" onClick={handleClose}>✕</button>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px' }}>
                    {[
                        { id: 'general', label: '📋 Generale', icon: '📋' },
                        { id: 'finance', label: '💰 Finanza', icon: '💰' },
                        { id: 'credentials', label: '🔐 Credenziali', icon: '🔐' },
                        { id: 'files', label: '📁 File', icon: '📁' },
                        { id: 'notes', label: '📝 Note', icon: '📝' },
                        { id: 'todos', label: '✅ Todo', icon: '✅' },
                        { id: 'quote', label: '📄 Preventivo', icon: '📄' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            className={`btn ${activeTab === tab.id ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => setActiveTab(tab.id)}
                            style={{ borderRadius: 'var(--radius-md) 0 0 var(--radius-md)' }}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                {activeTab === 'general' && (
                    <GeneralSection 
                        form={form} 
                        update={update} 
                        allTags={allTags}
                        newTag={newTag}
                        setNewTag={setNewTag}
                    />
                )}

                {activeTab === 'finance' && <FinanceSection form={form} update={update} />}
                {activeTab === 'credentials' && <CredentialsSection form={form} update={update} />}
                {activeTab === 'files' && <FilesSection form={form} update={update} />}
                {activeTab === 'notes' && <NotesSection form={form} update={update} />}
                {activeTab === 'todos' && (
                    <TodoSection 
                        form={form} 
                        update={update} 
                        confirmDelete={confirmDelete}
                        onInternalLink={handleInternalLink}
                        onOpenFile={handleOpenFile}
                        onOpenNote={handleOpenNote}
                    />
                )}
                {activeTab === 'quote' && <QuoteSection form={form} update={update} />}

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '32px', paddingTop: '24px', borderTop: '1px solid var(--border-light)' }}>
                    <button className="btn btn-secondary" onClick={handleClose}>
                        Annulla
                    </button>
                    {!isNew && (
                        <button 
                            className="btn btn-danger" 
                            onClick={() => confirmDelete('customer', form.id)}
                            style={{ background: 'var(--danger)', color: 'white' }}
                        >
                            🗑️ Elimina Cliente
                        </button>
                    )}
                    <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
                        {isSaving ? 'Salvataggio...' : '💾 Salva'}
                    </button>
                </div>
            </div>

            {/* Delete Confirmation */}
            {deleteTarget && (
                <div className="modal-overlay animate-fade-in" style={{ zIndex: 2100 }} onClick={() => setDeleteTarget(null)}>
                    <div className="modal-content animate-scale-in" style={{ maxWidth: '420px', padding: '28px', borderTop: '4px solid var(--danger)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ fontSize: '2.5rem', textAlign: 'center', marginBottom: '8px' }}>🗑️</div>
                        <h3 style={{ textAlign: 'center', color: 'var(--danger)', margin: '0 0 12px 0', fontSize: '1.05rem' }}>
                            Elimina {deleteTarget.type === 'customer' ? 'il cliente' : deleteTarget.type}?
                        </h3>
                        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5, margin: '0 0 20px 0' }}>
                            {deleteTarget.type === 'customer' 
                                ? 'Questa azione eliminerà permanentemente tutti i dati del cliente. Questa operazione non è annullabile.'
                                : 'Questa azione non può essere annullata.'
                            }
                        </p>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                            <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>Annulla</button>
                            <button className="btn btn-danger" onClick={executeDelete}>Conferma Elimina</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Unsaved Changes Warning */}
            {showUnsavedConfirm && (
                <div className="modal-overlay animate-fade-in" style={{ zIndex: 2100 }} onClick={() => setShowUnsavedConfirm(false)}>
                    <div className="modal-content animate-scale-in" style={{ maxWidth: '420px', padding: '28px', borderTop: '4px solid var(--warning)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ fontSize: '2.5rem', textAlign: 'center', marginBottom: '8px' }}>⚠️</div>
                        <h3 style={{ textAlign: 'center', color: 'var(--warning)', margin: '0 0 12px 0', fontSize: '1.05rem' }}>
                            Ci sono modifiche non salvate
                        </h3>
                        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5, margin: '0 0 20px 0' }}>
                            Le modifiche andranno perse se chiudi senza salvare. Vuoi salvare prima di uscire?
                        </p>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                            <button className="btn btn-secondary" onClick={() => {
                                setShowUnsavedConfirm(false);
                                setIsClosing(true);
                                setTimeout(onClose, 150);
                            }}>
                                Esci senza salvare
                            </button>
                            <button className="btn btn-primary" onClick={() => {
                                handleSave();
                                setShowUnsavedConfirm(false);
                            }}>
                                Salva e esci
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Payment Warning */}
            {showPaymentWarning && (
                <div className="modal-overlay animate-fade-in" style={{ zIndex: 2100 }} onClick={() => setShowPaymentWarning(false)}>
                    <div className="modal-content animate-scale-in" style={{ maxWidth: '420px', padding: '28px', borderTop: '4px solid var(--warning)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ fontSize: '2.5rem', textAlign: 'center', marginBottom: '8px' }}>💰</div>
                        <h3 style={{ textAlign: 'center', color: 'var(--warning)', margin: '0 0 12px 0', fontSize: '1.05rem' }}>
                            Ci sono rate non pagate
                        </h3>
                        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5, margin: '0 0 20px 0' }}>
                            Questo cliente ha rate scadute o non pagate. Sei sicuro di voler impostare lo stato come "Completato"?
                        </p>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                            <button className="btn btn-secondary" onClick={() => {
                                setShowPaymentWarning(false);
                                setPendingStatus(null);
                            }}>
                                Annulla
                            </button>
                            <button className="btn btn-warning" onClick={confirmStatusChange} style={{ background: 'var(--warning)', color: 'white' }}>
                                Conferma comunque
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                    z-index: 2000;
                }
                .modal-content {
                    background: white;
                    border-radius: var(--radius-lg);
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    max-height: 90vh;
                    overflow-y: auto;
                    animation: scale-in 0.3s ease-out;
                }
                @keyframes scale-in {
                    from { opacity: 0; transform: scale(0.9); }
                    to { opacity: 1; transform: scale(1); }
                }
                @keyframes fade-in {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .animate-scale-in {
                    animation: scale-in 0.3s ease-out;
                }
                .animate-fade-in {
                    animation: fade-in 0.2s ease-out;
                }
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
