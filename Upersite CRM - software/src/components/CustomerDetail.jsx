import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';

// import SmartSummarizerButton from './SmartSummarizerButton';

import RichTextEditor from './RichTextEditor';

import SmartReportModal from './SmartReportModal';

import SmartReportSection from './SmartReportSection';

import TicketSection from './TicketSection';

import IconComponent from './IconComponent';

import NotesGraphView from './NotesGraphView';

import { generateId, sanitizePositiveNumber, formatBytes, saveFile, verifyMasterPassword, PACKAGES, ADDONS } from '../utils/storage';
import { encryptSecret, decryptSecret } from '../utils/credentialVault';

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

/* ── MODAL MODIFICA TASK ── */

const TodoEditModal = ({ isOpen, onClose, data, onChange, onSave }) => {
    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
            <div style={{
                background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '400px',
                padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', gap: '16px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', fontWeight: 600 }}>Modifica Task</h3>
                    <button onClick={onClose} className="btn btn-ghost btn-icon-sm" style={{ padding: '4px' }}>✕</button>
                </div>

                <div>
                    <label className="input-label" style={{ display: 'block', marginBottom: '4px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Titolo</label>
                    <input className="input" style={{ width: '100%' }} value={data.text || ''} onChange={e => onChange('text', e.target.value)} />
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                        <label className="input-label" style={{ display: 'block', marginBottom: '4px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Data di scadenza</label>
                        <input type="date" className="input" style={{ width: '100%' }} value={data.dueDate || ''} onChange={e => onChange('dueDate', e.target.value)} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label className="input-label" style={{ display: 'block', marginBottom: '4px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Priorità</label>
                        <select className="input" style={{ width: '100%' }} value={data.priority || 'Media'} onChange={e => onChange('priority', e.target.value)}>
                            <option value="Bassa">Bassa</option>
                            <option value="Media">Media</option>
                            <option value="Alta">Alta</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label className="input-label" style={{ display: 'block', marginBottom: '4px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Ricorrenza</label>
                    <select className="input" style={{ width: '100%' }} value={data.recurrence || 'none'} onChange={e => onChange('recurrence', e.target.value)}>
                        <option value="none">Nessuna</option>
                        <option value="Settimanale">Settimanale (7 gg)</option>
                        <option value="Mensile">Mensile</option>
                        <option value="Trimestrale">Trimestrale (3 mesi)</option>
                        <option value="Semestrale">Semestrale (6 mesi)</option>
                        <option value="Annuale">Annuale</option>
                    </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
                    <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
                    <button className="btn btn-primary" onClick={onSave}>Salva Modifiche</button>
                </div>
            </div>
        </div>
    );
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

    const [exportFormat, setExportFormat] = useState('md');

    const [showExportDropdown, setShowExportDropdown] = useState(false);

    // Stato per il modal di modifica todo

    const [editModalTodo, setEditModalTodo] = useState(null);

    const [editModalData, setEditModalData] = useState({});

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

            recurrence: recurrence

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

                readAt: val ? (st.readAt || new Date().toISOString()) : st.readAt,

                subtasks: setAll(st.subtasks || [], val)

            }));

            if (nextCompleted && t.recurrence && t.recurrence !== 'none') {

                const nextDate = calculateNextDueDate(t.dueDate || new Date().toISOString(), t.recurrence);

                return {

                    ...t,

                    dueDate: nextDate,

                    completed: false, // Auto-reset

                    readAt: null      // Mark as unread since it's "new" again

                };

            }

            return {

                ...t,

                completed: nextCompleted,

                readAt: nextCompleted ? (t.readAt || new Date().toISOString()) : t.readAt,

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

            subtasks: [],

            description: '',

            linkedFiles: [],

            linkedNotes: [],

            recurrence: 'none'

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

    const updateTodoField = (id, field, value) => {

        const updateRecursive = (items) => items.map(t => {

            if (t.id === id) return { ...t, [field]: value };

            if (t.subtasks && t.subtasks.length > 0) return { ...t, subtasks: updateRecursive(t.subtasks) };

            return t;

        });

        update('todo', updateRecursive(todos));

    };

    const openEditModal = (todo) => {

        setEditModalTodo(todo);

        setEditModalData({

            text: todo.text || '',

            dueDate: todo.dueDate || '',

            priority: todo.priority || 'Media',

            recurrence: todo.recurrence || 'none',

        });

    };

    const saveModalEdit = () => {

        if (!editModalTodo) return;

        const id = editModalTodo.id;

        const text = editModalData.text?.trim();

        const updateRecursive = (items) => items.map(t => {

            if (t.id === id) return {

                ...t,

                text: text || t.text,

                dueDate: editModalData.dueDate,

                priority: editModalData.priority,

                recurrence: editModalData.recurrence,

            };

            if (t.subtasks && t.subtasks.length > 0) return { ...t, subtasks: updateRecursive(t.subtasks) };

            return t;

        });

        update('todo', updateRecursive(todos));

        setEditModalTodo(null);

    };

    const closeModal = () => setEditModalTodo(null);

    const linkFileToTodo = (todoId, fileId) => {

        const updateRecursive = (items) => items.map(t => {

            if (t.id === todoId) {

                const current = t.linkedFiles || [];

                if (current.includes(fileId)) return t;

                return { ...t, linkedFiles: [...current, fileId] };

            }

            if (t.subtasks && t.subtasks.length > 0) return { ...t, subtasks: updateRecursive(t.subtasks) };

            return t;

        });

        update('todo', updateRecursive(todos));

    };

    const unlinkFileFromTodo = (todoId, fileId) => {

        const updateRecursive = (items) => items.map(t => {

            if (t.id === todoId) return { ...t, linkedFiles: (t.linkedFiles || []).filter(f => f !== fileId) };

            if (t.subtasks && t.subtasks.length > 0) return { ...t, subtasks: updateRecursive(t.subtasks) };

            return t;

        });

        update('todo', updateRecursive(todos));

    };

    const linkNoteToTodo = (todoId, noteId) => {

        const updateRecursive = (items) => items.map(t => {

            if (t.id === todoId) {

                const current = t.linkedNotes || [];

                if (current.includes(noteId)) return t;

                return { ...t, linkedNotes: [...current, noteId] };

            }

            if (t.subtasks && t.subtasks.length > 0) return { ...t, subtasks: updateRecursive(t.subtasks) };

            return t;

        });

        update('todo', updateRecursive(todos));

    };

    const unlinkNoteFromTodo = (todoId, noteId) => {

        const updateRecursive = (items) => items.map(t => {

            if (t.id === todoId) return { ...t, linkedNotes: (t.linkedNotes || []).filter(n => n !== noteId) };

            if (t.subtasks && t.subtasks.length > 0) return { ...t, subtasks: updateRecursive(t.subtasks) };

            return t;

        });

        update('todo', updateRecursive(todos));

    };

    const getNoteSnippet = (html) => {
        const text = (html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
        return text.length > 40 ? text.substring(0, 40) + '...' : text;
    };

    const renderTodoItem = (t, level = 0) => {
        const hasChildren = (t.subtasks || []).length > 0;
        const padLeft = level === 0 ? 0 : level === 1 ? 22 : 44;
        const isDetailsOpen = openDetails[t.id];

        const linkedFileObjects = (t.linkedFiles || []).map(fid => allFiles.find(f => f.id === fid)).filter(Boolean);

        const linkedNoteObjects = (t.linkedNotes || []).map(nid => allNotes.find(n => n.id === nid)).filter(Boolean);

        const hasDetails = (t.description || '').trim() || linkedFileObjects.length > 0 || linkedNoteObjects.length > 0;

        return (

            <div key={t.id} style={{ paddingLeft: padLeft }}>

                <div className="todo-item-card" style={{ borderColor: !t.readAt ? 'var(--primary-light)' : 'var(--border-light)' }}>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>

                        <input type="checkbox" checked={t.completed} onChange={() => toggleTodo(t.id)} className="todo-checkbox" />

                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>

                            {/* Modalità visualizzazione */}

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>

                                    <span

                                        style={{

                                            fontWeight: 500,

                                            color: 'var(--text-primary)',

                                            fontSize: '0.95rem',

                                            textDecoration: t.completed ? 'line-through' : 'none',

                                            flex: 1,

                                            display: 'flex',

                                            alignItems: 'center',

                                            gap: '6px'

                                        }}

                                    >

                                        {t.text}

                                        {(t.description || '').trim() && (

                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>📝</span>

                                        )}

                                    </span>

                                    <button

                                        className="btn btn-ghost btn-icon-sm"

                                        onClick={() => openEditModal(t)}

                                        title="Modifica attività"

                                        style={{

                                            fontSize: '0.7rem',

                                            color: 'var(--text-tertiary)',

                                            padding: '1px',

                                            display: 'flex',

                                            alignItems: 'center',

                                            justifyContent: 'center',

                                            height: '20px',

                                            width: '20px',

                                            lineHeight: '1',

                                            flexShrink: 0

                                        }}

                                    >

                                        ✏️

                                    </button>

                            </div>

                            {level === 0 && (

                                <div style={{ display: 'flex', gap: '12px', fontSize: '0.75rem', marginTop: '4px' }}>

                                    <span style={{ color: getPriorityColor(t.priority), fontWeight: 600 }}>{t.priority}</span>

                                    {t.recurrence && t.recurrence !== 'none' && (

                                        <span style={{ color: 'var(--primary)', fontWeight: 600 }}>🔁 {t.recurrence}</span>

                                    )}

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

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>

                        <button

                            className="btn btn-ghost btn-icon-sm"

                            onClick={() => setOpenDetails(prev => ({ ...prev, [t.id]: !prev[t.id] }))}

                            title="Dettagli"

                            style={{ fontSize: '0.7rem', color: isDetailsOpen ? 'var(--primary)' : 'var(--text-tertiary)' }}

                        >

                            {isDetailsOpen ? '▼' : '▶'}

                        </button>

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

                        {t.readAt ? <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>visibility</span> : <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>visibility_off</span>}

                    </button>

                    <button className="btn btn-ghost btn-icon-sm" onClick={() => confirmDelete('todo', t.id)}>✕</button>

                </div>

                {/* Collapsible Details Accordion */}

                {isDetailsOpen && (

                    <div className="todo-details-accordion">

                        <div className="todo-details-section">

                            <label className="todo-details-label">📝 Descrizione</label>

                            <RichTextEditor

                                value={t.description || ''}

                                onChange={newVal => updateTodoField(t.id, 'description', newVal)}

                                onInternalLinkClick={onInternalLink}

                                allFiles={allFiles}

                                allNotes={allNotes}

                            />

                        </div>

                        {/* Recurrence Settings */}

                        <div className="todo-details-section">

                            <label className="todo-details-label">🔁 Ricorrenza</label>

                            <select

                                className="input"

                                style={{ fontSize: '0.85rem' }}

                                value={t.recurrence || 'none'}

                                onChange={e => updateTodoField(t.id, 'recurrence', e.target.value)}

                            >

                                <option value="none">Nessuna</option>

                                <option value="Settimanale">Ogni settimana (7 gg)</option>

                                <option value="Mensile">Ogni mese</option>

                                <option value="Trimestrale">Ogni 3 mesi</option>

                                <option value="Semestrale">Ogni 6 mesi</option>

                                <option value="Annuale">Ogni anno</option>

                            </select>

                        </div>

                        {/* Folder Link */}

                        {t.folderPath && (

                            <div className="todo-details-section">

                                <label className="todo-details-label">🗂️ Cartella Collegata</label>

                                <div

                                    className="todo-linked-badge clickable"

                                    style={{ background: 'var(--primary-ghost)', borderColor: 'var(--primary-light)', padding: '8px 12px' }}

                                    onClick={() => {

                                        navigator.clipboard.writeText(t.folderPath);

                                        // Alert rimosso

                                    }}

                                >

                                    <span>{t.folderPath.split(/[\\\/]/).pop() || t.folderPath}</span>

                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', marginLeft: '8px' }}>Clicca per copiare</span>

                                    <span className="todo-linked-remove" onClick={(e) => { e.stopPropagation(); updateTodoField(t.id, 'folderPath', ''); }}>✕</span>

                                </div>

                            </div>

                        )}

                        <div className="todo-details-section">

                            <label className="todo-details-label">📁 File collegati</label>

                            {linkedFileObjects.length > 0 && (

                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>

                                    {linkedFileObjects.map(f => (

                                        <span key={f.id} className="todo-linked-badge clickable" onClick={() => onOpenFile && onOpenFile(f.id)}>

                                            📄 {f.name}

                                            <span className="todo-linked-remove" onClick={(e) => { e.stopPropagation(); unlinkFileFromTodo(t.id, f.id); }}>✕</span>

                                        </span>

                                    ))}

                                </div>

                            )}

                            {allFiles.filter(f => !f.isQuote && !(t.linkedFiles || []).includes(f.id)).length > 0 && (

                                <select

                                    className="input"

                                    style={{ fontSize: '0.8rem' }}

                                    value=""

                                    onChange={e => { if (e.target.value) linkFileToTodo(t.id, e.target.value); }}

                                >

                                    <option value="">+ Collega un file...</option>

                                    {allFiles.filter(f => !f.isQuote && !(t.linkedFiles || []).includes(f.id)).map(f => (

                                        <option key={f.id} value={f.id}>{f.name}</option>

                                    ))}

                                </select>

                            )}

                        </div>

                        {/* Linked Notes */}

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



    // Export to Markdown function for individual customer

    const exportCustomerTodosToMarkdown = (format = exportFormat) => {

        const extractAllTasks = (taskList, parentTask = null, level = 0) => {

            const allTasks = [];



            taskList.forEach(task => {

                allTasks.push({

                    ...task,

                    parentTask: parentTask,

                    level: level

                });



                // Recursively extract subtasks

                if (task.subtasks && task.subtasks.length > 0) {

                    allTasks.push(...extractAllTasks(task.subtasks, task, level + 1));

                }

            });



            return allTasks;

        };



        const allTasks = extractAllTasks(todos);



        // Sort by priority, then by due date

        const priorityOrder = { 'Alta': 0, 'Media': 1, 'Bassa': 2 };

        const sortedTasks = allTasks.sort((a, b) => {

            // First by completion status

            if (a.completed !== b.completed) return a.completed ? 1 : -1;



            // Then by priority

            const pa = priorityOrder[a.priority] ?? 1;

            const pb = priorityOrder[b.priority] ?? 1;

            if (pa !== pb) return pa - pb;



            // Then by due date

            if (a.dueDate && b.dueDate) return new Date(a.dueDate) - new Date(b.dueDate);

            if (a.dueDate) return -1;

            if (b.dueDate) return 1;



            return 0;

        });



        // Generate content based on format

        const isMarkdown = format === 'md';

        let content = '';



        if (isMarkdown) {

            content = `# Task di ${form.name} - ${new Date().toLocaleDateString('it-IT')}\n\n`;

            content += `Generato il: ${new Date().toLocaleString('it-IT')}\n`;

            content += `Cliente: ${form.name}\n`;

            content += `Totale task: ${allTasks.length}\n\n`;

        } else {

            content = `TASK DI ${form.name.toUpperCase()} - ${new Date().toLocaleDateString('it-IT')}\n`;

            content += `${'='.repeat(50)}\n\n`;

            content += `Generato il: ${new Date().toLocaleString('it-IT')}\n`;

            content += `Cliente: ${form.name}\n`;

            content += `Totale task: ${allTasks.length}\n\n`;

        }



        // Separate pending and completed tasks

        const pending = sortedTasks.filter(t => !t.completed);

        const completed = sortedTasks.filter(t => t.completed);



        if (pending.length > 0) {

            if (isMarkdown) {

                content += `## Da Fare (${pending.length})\n\n`;

            } else {

                content += `DA FARE (${pending.length}):\n`;

            }



            pending.forEach(task => {

                const indent = '  '.repeat(task.level);

                const priority = task.priority || 'Media';

                const dueDate = task.dueDate ? ` - Scadenza: ${new Date(task.dueDate).toLocaleDateString('it-IT')}` : '';

                const recurrence = task.recurrence && task.recurrence !== 'none' ? ` - Ricorrenza: ${task.recurrence}` : '';



                if (isMarkdown) {

                    const status = task.completed ? 'x' : ' ';

                    content += `${indent}- [${status}] ${task.text} (${priority})${dueDate}${recurrence}\n`;

                } else {

                    const status = task.completed ? 'COMPLETATO' : 'DA FARE';

                    content += `${indent} [${status}] ${task.text} (${priority})${dueDate}${recurrence}\n`;

                }



                // Add description if available

                if (task.description && task.description.trim()) {

                    const desc = task.description.replace(/<[^>]*>/g, '').trim();

                    if (desc) {

                        if (isMarkdown) {

                            content += `${indent}  - *${desc}*\n`;

                        } else {

                            content += `${indent}    Descrizione: ${desc}\n`;

                        }

                    }

                }



                // Add linked files and notes

                if (task.linkedFiles && task.linkedFiles.length > 0) {

                    const files = allFiles.filter(f => task.linkedFiles.includes(f.id));

                    if (files.length > 0) {

                        if (isMarkdown) {

                            content += `${indent}  - File: ${files.map(f => f.name).join(', ')}\n`;

                        } else {

                            content += `${indent}    File: ${files.map(f => f.name).join(', ')}\n`;

                        }

                    }

                }



                if (task.linkedNotes && task.linkedNotes.length > 0) {

                    const notes = allNotes.filter(n => task.linkedNotes.includes(n.id));

                    if (notes.length > 0) {

                        if (isMarkdown) {

                            content += `${indent}  - Note: ${notes.map(n => n.text.replace(/<[^>]*>/g, '').substring(0, 50) + '...').join(', ')}\n`;

                        } else {

                            content += `${indent}    Note: ${notes.map(n => n.text.replace(/<[^>]*>/g, '').substring(0, 50) + '...').join(', ')}\n`;

                        }

                    }

                }

            });

            content += '\n';

        }



        if (completed.length > 0) {

            if (isMarkdown) {

                content += `## Completate (${completed.length})\n\n`;

            } else {

                content += `COMPLETATE (${completed.length}):\n`;

            }



            completed.forEach(task => {

                const indent = '  '.repeat(task.level);

                const priority = task.priority || 'Media';

                const completedDate = task.readAt ? ` - Completato: ${new Date(task.readAt).toLocaleDateString('it-IT')}` : '';



                if (isMarkdown) {

                    content += `${indent}- [x] ${task.text} (${priority})${completedDate}\n`;

                } else {

                    content += `${indent} [COMPLETATO] ${task.text} (${priority})${completedDate}\n`;

                }

            });

            content += '\n';

        }



        // Create and download the file

        const fileExtension = isMarkdown ? 'md' : 'txt';

        const mimeType = isMarkdown ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8';

        const customerName = form.name.replace(/[^a-zA-Z0-9]/g, '_');

        const fileName = `todos_${customerName}_${new Date().toISOString().split('T')[0]}.${fileExtension}`;



        const blob = new Blob([content], { type: mimeType });

        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');

        link.href = url;

        link.download = fileName;

        document.body.appendChild(link);

        link.click();

        document.body.removeChild(link);

        URL.revokeObjectURL(url);

    };



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



            {/* Export button for customer todos */}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>

                <div className="app-menu-wrapper" style={{ position: 'relative' }}>

                    <button

                        className="btn btn-secondary btn-sm"

                        onClick={() => setShowExportDropdown(!showExportDropdown)}

                        title="Esporta i task di questo cliente"

                        style={{

                            display: 'flex',

                            alignItems: 'center',

                            gap: '6px',

                            fontSize: '0.8rem',

                            padding: '6px 10px',

                            backgroundColor: 'var(--primary)',

                            color: 'white',

                            border: '1px solid var(--primary)'

                        }}

                    >

                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">

                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>

                            <polyline points="7 10 12 15 17 10"></polyline>

                            <line x1="12" y1="15" x2="12" y2="3"></line>

                        </svg>

                        Esporta Todo

                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">

                            <polyline points="6 9 12 15 18 9"></polyline>

                        </svg>

                    </button>

                    {showExportDropdown && (

                        <div className="app-dropdown animate-scale-in" style={{

                            top: '100%',

                            right: '0',

                            marginTop: '4px',

                            minWidth: '110px',

                            backgroundColor: 'var(--primary)',

                            border: '1px solid var(--primary)'

                        }}>

                            <button

                                className="app-dropdown-item"

                                onClick={() => { setExportFormat('md'); setShowExportDropdown(false); exportCustomerTodosToMarkdown('md'); }}

                                style={{

                                    color: 'white',

                                    padding: '6px 10px',

                                    fontSize: '0.75rem'

                                }}

                            >

                                Esporta .md

                            </button>

                            <button

                                className="app-dropdown-item"

                                onClick={() => { setExportFormat('txt'); setShowExportDropdown(false); exportCustomerTodosToMarkdown('txt'); }}

                                style={{

                                    color: 'white',

                                    padding: '6px 10px',

                                    fontSize: '0.75rem'

                                }}

                            >

                                Esporta .txt

                            </button>

                        </div>

                    )}

                </div>

            </div>



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

                @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&icon_names=visibility,visibility_off');

                .material-symbols-outlined {

                    font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;

                }

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
            
            {editModalTodo && (
                <TodoEditModal
                    isOpen={!!editModalTodo}
                    onClose={closeModal}
                    data={editModalData}
                    onChange={(field, val) => setEditModalData(prev => ({ ...prev, [field]: val }))}
                    onSave={saveModalEdit}
                />
            )}

        </div>

    );

});

export default function CustomerDetail({ customer, allTags, settings, onSave, onDelete, updateCustomer, onClose }) {

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

        todo: [], // Ensure todo is initialized

        logo: null,

        createdAt: new Date().toISOString()

    });

    const isNew = !customer;

    const [showAdvancedFinance, setShowAdvancedFinance] = useState(false);

    const [activeTab, setActiveTab] = useState('general');

    // Listen for setActiveTab events from TaskFilterModal

    useEffect(() => {

        const handleSetActiveTab = (event) => {

            setActiveTab(event.detail);

        };

        window.addEventListener('setActiveTab', handleSetActiveTab);

        return () => {

            window.removeEventListener('setActiveTab', handleSetActiveTab);

        };

    }, []);

    const [newNote, setNewNote] = useState('');

    const [newTag, setNewTag] = useState('');

    const snapshot = useRef(JSON.stringify({ ...form, newNote: '', newTag: '' }));

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState(null);

    const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);

    const [isClosing, setIsClosing] = useState(false);

    const [showPaymentWarning, setShowPaymentWarning] = useState(false);

    const [pendingStatus, setPendingStatus] = useState(null);

    const [isSaving, setIsSaving] = useState(false);

    const [initialPreviewFile, setInitialPreviewFile] = useState(null);

    // Cartella da aprire nella tab File (link interni alle cartelle dalle note)
    const [initialFilesPath, setInitialFilesPath] = useState(null);

    const [initialSelectedNote, setInitialSelectedNote] = useState(null);

    const [showSmartReport, setShowSmartReport] = useState(false);

    const [deletePassword, setDeletePassword] = useState('');

    const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

    const handleOpenFile = async (fileId) => {

        const f = form.files?.find(x => x.id === fileId);

        if (f) {

            // Se il file ha un percorso (file locale), apri direttamente con Windows Explorer

            if (f.path) {

                try {

                    // Usa l'API esposta dal preload script per mostrare il file in Explorer

                    if (window.electronAPI?.showItemInFolder) {

                        await window.electronAPI.showItemInFolder(f.path);

                    } else {

                        await window.electronAPI.openPath(f.path);

                    }

                } catch (error) {

                    console.error('Errore nell\'aprire il percorso:', error);

                    // Fallback: copia il percorso

                    navigator.clipboard.writeText(f.path).catch(console.error);

                    // Alert rimosso per un'esperienza piu pulita

                }

            } else {

                // Se è un file caricato nell'app, apri la preview come prima

                setInitialPreviewFile(f);

                setActiveTab('files');

            }

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

        else if (type === 'folder-nav') {

            setInitialFilesPath(id);

            setActiveTab('files');

        }

    };

    const update = (key, val) => setForm(prev => ({ ...prev, [key]: val }));
    // Come update, ma calcola il nuovo valore dal valore più recente (utile dopo operazioni asincrone)
    const updateWith = (key, fn) => setForm(prev => ({ ...prev, [key]: fn(prev[key]) }));

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

                if (showUnsavedConfirm || showDeleteConfirm || deleteTarget || showPasswordConfirm) {

                    setShowUnsavedConfirm(false);

                    setShowDeleteConfirm(false);

                    setShowPasswordConfirm(false);

                    setDeletePassword('');

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

    }, [hasChanges, showUnsavedConfirm, showDeleteConfirm, deleteTarget, showPasswordConfirm]);

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

            // Only auto-update if quoteAmount is empty or we just changed the selection

            // This prevents overwriting manual overrides when just opening the modal

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

        if (type === 'customer') {

            setShowPasswordConfirm(true);

            setDeleteTarget({ type, id });

        } else if (type === 'note-folder') {

            const folderName = id;
            const folderPath = folderName + '/';
            const hasNotes = (form.notes || []).some(n => n.folderPath === folderPath || (n.folderPath && n.folderPath.startsWith(folderPath)));
            if (hasNotes) {
                setDeleteTarget({ type: 'note-folder-with-notes', id: folderName });
            } else {
                setDeleteTarget({ type: 'note-folder-empty', id: folderName });
            }

        } else {

            setDeleteTarget({ type, id });

        }

    };



    const verifyDeletePassword = async () => {

        // Usa la password master di sistema del CRM

        const cleanPassword = deletePassword.trim();



        if (await verifyMasterPassword(cleanPassword)) {

            setShowPasswordConfirm(false);

            setDeletePassword('');

            // Procedi con l'eliminazione

            if (deleteTarget.type === 'customer') {

                onDelete(form.id);

                onClose();

            } else {

                executeDelete();

            }

        } else {

            alert('Password errata!');

            setDeletePassword('');

        }

    };



    const cancelPasswordConfirm = () => {

        setShowPasswordConfirm(false);

        setDeletePassword('');

        setDeleteTarget(null);

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

    const deleteNoteFolderWithChoice = (folderName, deleteNotes) => {
        const folderPath = folderName + '/';
        if (deleteNotes) {
            update('notes', (form.notes || []).filter(n => {
                const nPath = n.folderPath || '';
                return !nPath.startsWith(folderPath);
            }));
        } else {
            update('notes', (form.notes || []).map(n => {
                const nPath = n.folderPath || '';
                if (nPath.startsWith(folderPath)) {
                    return { ...n, folderPath: '/' };
                }
                return n;
            }));
        }
        window.dispatchEvent(new CustomEvent('deleteNoteFolder', { detail: folderName }));
        setDeleteTarget(null);
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

        } else if (type === 'folder') {
            const folderPath = (typeof id === 'string')
                ? id
                : (id && typeof id === 'object' ? (id.folderPath || '') : '');
            if (!folderPath) {
                setDeleteTarget(null);
                return;
            }
            update('files', (form.files || []).filter(f => {
                const fullPath = (f.path || f.name || '');
                return !fullPath.startsWith(folderPath);
            }));
        } else if (type === 'note-folder-empty') {
            const folderName = id;
            window.dispatchEvent(new CustomEvent('deleteNoteFolder', { detail: folderName }));
        } else if (type === 'note') {
            update('notes', form.notes.filter(n => n.id !== id));

        } else if (type === 'tickets') {

            update('tickets', form.tickets.filter(t => t.id !== id));

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

        // { id: 'files', label: 'File', icon: '📁' },

        { id: 'notes', label: 'Note', icon: '📝', unread: getUnread(form.notes) },

        { id: 'todo', label: 'To-Do', icon: '☑️', unread: getUnreadTodos(form.todo) },

        { id: 'tickets', label: 'Tickets', icon: '🎫' },

        { id: 'smartreport', label: 'SmartReport', icon: '🤖' },

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

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>

                        {form.website && (

                            <button

                                className="btn btn-ghost btn-icon"

                                onClick={() => window.open(form.website, '_blank', 'noopener,noreferrer')}

                                title="Visita sito web"

                                style={{

                                    fontSize: '0.9rem',

                                    color: 'var(--primary)'

                                }}

                            >

                                🌐

                            </button>

                        )}

                        <button className="btn btn-ghost btn-icon" onClick={handleClose}>✕</button>

                    </div>

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

                    <>

                        {activeTab === 'general' && <GeneralSection form={form} update={update} updateWith={updateWith} formatPhone={formatPhone} onCompleteWithUnpaid={() => { setPendingStatus('completed'); setShowPaymentWarning(true); }} allTags={allTags} newTag={newTag} setNewTag={setNewTag} />}

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

                                updateWith={updateWith}

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

                                initialPreviewFile={initialPreviewFile}

                                clearInitialPreviewFile={() => setInitialPreviewFile(null)}

                                initialPath={initialFilesPath}

                                clearInitialPath={() => setInitialFilesPath(null)}

                            />

                        )}

                        {activeTab === 'notes' && (

                            <NotesSection

                                form={form}

                                update={update}

                                confirmDelete={confirmDelete}

                                newNote={newNote}

                                setNewNote={setNewNote}

                                onInternalLink={handleInternalLink}

                                onOpenFile={handleOpenFile}

                                onOpenNote={handleOpenNote}

                                initialSelectedNote={initialSelectedNote}

                                clearInitialSelectedNote={() => setInitialSelectedNote(null)}

                            />

                        )}

                        {activeTab === 'todo' && (

                            <TodoSection

                                form={form}

                                update={update}

                                confirmDelete={confirmDelete}

                                onInternalLink={handleInternalLink}

                                onOpenFile={handleOpenFile}

                                onOpenNote={handleOpenNote}

                            />

                        )}

                        {activeTab === 'tickets' && (

                            <TicketSection

                                form={form}

                                update={update}

                                confirmDelete={confirmDelete}

                            />

                        )}

                        {activeTab === 'smartreport' && (

                            <SmartReportSection

                                form={form}

                                update={update}

                                updateCustomer={updateCustomer}

                                onSave={onSave}

                            />

                        )}

                    </>

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

                {deleteTarget && deleteTarget.type !== 'customer' && (() => {

                    if (deleteTarget.type === 'note-folder-with-notes') {
                        return (
                            <div className="detail-confirm-overlay animate-fade-in" style={{ zIndex: 2200 }}>
                                <div className="detail-confirm-card animate-scale-in" style={{ maxWidth: '450px' }}>
                                    <div className="detail-confirm-icon">📂</div>
                                    <h3 style={{ margin: '0 0 10px 0', fontSize: '1.15rem', color: 'var(--text-primary)' }}>Elimina Cartella</h3>
                                    <p style={{ margin: '0 0 20px 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                        Questa cartella contiene delle note al suo interno. Scegli cosa vuoi fare:
                                    </p>
                                    <div className="detail-confirm-buttons" style={{ flexDirection: 'column', gap: '8px', width: '100%' }}>
                                        <button 
                                            className="btn btn-primary" 
                                            style={{ width: '100%', padding: '10px' }} 
                                            onClick={() => deleteNoteFolderWithChoice(deleteTarget.id, false)}
                                        >
                                            Elimina solo la cartella (mantieni le note)
                                        </button>
                                        <button 
                                            className="btn btn-danger" 
                                            style={{ width: '100%', padding: '10px' }} 
                                            onClick={() => deleteNoteFolderWithChoice(deleteTarget.id, true)}
                                        >
                                            Elimina la cartella e tutte le sue note
                                        </button>
                                        <button 
                                            className="btn btn-secondary" 
                                            style={{ width: '100%', padding: '10px' }} 
                                            onClick={() => setDeleteTarget(null)}
                                        >
                                            Annulla
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    // Check if this is a recurring todo

                    const isRecurTodo = deleteTarget.type === 'todo' && (() => {

                        const findRec = (items) => {

                            for (const item of items) {

                                if (item.id === deleteTarget.id) return item.recurrence && item.recurrence !== 'none';

                                if (item.subtasks?.length > 0) {

                                    const r = findRec(item.subtasks);

                                    if (r !== undefined) return r;

                                }

                            }

                        };

                        return findRec(form.todo || []);

                    })();

                    return (

                        <div className="detail-confirm-overlay animate-fade-in">

                            <div className="detail-confirm-card animate-scale-in">

                                <div className="detail-confirm-icon">🗑</div>

                                <p>

                                    {isRecurTodo

                                        ? "Questo è un todo RICORRENTE. Sei sicuro di volerlo eliminare definitivamente?"

                                        : deleteTarget.type === 'note-folder-empty'

                                            ? "Sei sicuro di voler eliminare questa cartella?"

                                            : "Sei sicuro di voler eliminare questo elemento?"}

                                </p>

                                <div className="detail-confirm-buttons">

                                    <button className="btn btn-danger" onClick={executeDelete}>Elimina</button>

                                    <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>Annulla</button>

                                </div>

                            </div>

                        </div>

                    );

                })()}

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

                            {showPasswordConfirm ? (

                                <div className="detail-delete-confirm animate-fade-in" style={{ padding: '12px', minWidth: '250px' }}>

                                    <div style={{ marginBottom: '8px', fontSize: '0.9rem', fontWeight: 500 }}>

                                        🔐 Password per eliminare

                                    </div>

                                    <input

                                        type="password"

                                        className="input"

                                        value={deletePassword}

                                        onChange={e => setDeletePassword(e.target.value)}

                                        placeholder="Inserisci password..."

                                        style={{ marginBottom: '8px', fontSize: '0.9rem' }}

                                        autoFocus

                                        onKeyDown={e => {

                                            if (e.key === 'Enter') verifyDeletePassword();

                                            if (e.key === 'Escape') cancelPasswordConfirm();

                                        }}

                                    />

                                    <div style={{ display: 'flex', gap: '6px' }}>

                                        <button className="btn btn-danger btn-sm" onClick={verifyDeletePassword}>

                                            Elimina

                                        </button>

                                        <button className="btn btn-ghost btn-sm" onClick={cancelPasswordConfirm}>

                                            Annulla

                                        </button>

                                    </div>

                                </div>

                            ) : (

                                <button className="btn btn-ghost" style={{ color: 'var(--danger)' }}

                                    onClick={() => confirmDelete('customer', form.id)}>

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

const GeneralSection = React.memo(({ form, update, updateWith, formatPhone, onCompleteWithUnpaid, allTags, newTag, setNewTag }) => {

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

                    <DebouncedInput className="input" value={form.name} onChange={val => update('name', val)} placeholder="Mario Rossi" />

                </div>

                <div className="detail-group">

                    <label className="input-label">Tipo di attività</label>

                    <DebouncedInput className="input" value={form.company || ''} onChange={val => update('company', val)} placeholder="Es. Sviluppo Software, Idraulico..." />

                </div>

            </div>

            <div className="detail-row">

                <div className="detail-group">

                    <label className="input-label">Email</label>

                    <DebouncedInput className="input" type="email" value={form.email || ''} onChange={val => update('email', val)} placeholder="mario@rossi.it" />

                </div>

                <div className="detail-group">

                    <label className="input-label">Telefono</label>

                    <DebouncedInput

                        className="input"

                        value={form.phone || ''}

                        onChange={val => update('phone', val)}

                        onBlur={() => updateWith('phone', phone => formatPhone(phone || ''))}

                        placeholder="+39 333 1234567"

                    />

                </div>

            </div>

            <div className="detail-row">

                <div className="detail-group">

                    <label className="input-label">Sito Web 🌐</label>

                    <DebouncedInput

                        className="input"

                        type="url"

                        value={form.website || ''}

                        onChange={val => update('website', val)}

                        placeholder="https://www.esempio.it"

                    />

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

                                onCompleteWithUnpaid();

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

});

/* ── CONFIGURATION (Add-ons) ── */

const ConfigSection = React.memo(({ form, update }) => {

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

});

/* ── FINANCE ── */

const FinanceSection = React.memo(({ form, update, settings, confirmDelete, showAdvancedFinance, setShowAdvancedFinance }) => {

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

            {parseFloat(form.quoteAmount) > 0 && (

                <div className="progress-bar" style={{ height: '8px' }}>

                    <div className={`progress-bar-fill ${paidAmount >= parseFloat(form.quoteAmount) ? 'success' : ''}`}

                        style={{ width: `${Math.min(100, (paidAmount / parseFloat(form.quoteAmount)) * 100)}%` }} />

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

});

/* ── CREDENTIALS ── */

const CredentialsSection = React.memo(({ form, update, updateWith, confirmDelete }) => {

    const credentials = form.credentials || [];

    const [visibleIds, setVisibleIds] = useState({});

    const [unlocked, setUnlocked] = useState(false);

    const [pass, setPass] = useState('');

    const [error, setError] = useState(false);

    // Password in chiaro decifrate allo sblocco: { [id]: testo } (null = non decifrabile)
    const [plain, setPlain] = useState({});

    const [vaultPassword, setVaultPassword] = useState(null);

    const handleUnlock = async (e) => {

        e.preventDefault();

        if (await verifyMasterPassword(pass)) {

            const decrypted = {};

            for (const cred of credentials) {

                try {

                    decrypted[cred.id] = await decryptSecret(cred.password, pass);

                } catch {

                    decrypted[cred.id] = null;

                }

            }

            setPlain(decrypted);

            setVaultPassword(pass);

            setPass('');

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

    const updatePassword = async (id, val) => {

        setPlain(prev => ({ ...prev, [id]: val }));

        const encrypted = await encryptSecret(val, vaultPassword);

        updateWith('credentials', list => (list || []).map(c => c.id === id ? { ...c, password: encrypted } : c));

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

                        <DebouncedInput className="credential-service" placeholder="Servizio" value={cred.service}

                            onChange={val => updateCredential(cred.id, 'service', val)} />

                        <DebouncedInput className="credential-user" placeholder="Username" value={cred.username}

                            onChange={val => updateCredential(cred.id, 'username', val)} />

                        <DebouncedInput className="credential-pass"

                            type={visibleIds[cred.id] ? 'text' : 'password'}

                            placeholder={plain[cred.id] === null ? 'Non decifrabile con la password attuale' : 'Password'}

                            value={plain[cred.id] ?? ''}

                            disabled={plain[cred.id] === null}

                            onChange={val => updatePassword(cred.id, val)} />

                    </div>

                    <button className="btn btn-ghost btn-icon-sm" onClick={() => toggleVisible(cred.id)}

                        title={visibleIds[cred.id] ? 'Nascondi' : 'Mostra'}>

                        {visibleIds[cred.id] ? <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>visibility_off</span> : <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>visibility</span>}

                    </button>

                    <button className="btn btn-ghost btn-icon-sm" title={cred.readAt ? 'Segna come non letto' : 'Segna come letto'}

                        onClick={() => updateCredential(cred.id, 'readAt', cred.readAt ? null : new Date().toISOString())}

                        style={{ fontSize: '0.75rem' }}>

                        {cred.readAt ? <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>visibility</span> : <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>visibility_off</span>}

                    </button>

                    <button className="btn btn-ghost btn-icon-sm" onClick={() => confirmDelete('credential', cred.id)}>✕</button>

                </div>

            ))}

        </div>

    );

});

/* ── LINKS ── */

const LinksSection = React.memo(({ form, update, confirmDelete }) => {

    const links = form.links || [];

    const addLink = () => {

        update('links', [{ id: generateId(), label: '', url: '', note: '', createdAt: new Date().toISOString() }, ...links]);

    };

    const updateLink = (id, key, val) => {

        update('links', links.map(l => l.id === id ? { ...l, [key]: val } : l));

    };

    // Display most recent first

    const sortedLinks = [...links].sort((a, b) => {

        const da = a.createdAt ? new Date(a.createdAt) : new Date(0);

        const db = b.createdAt ? new Date(b.createdAt) : new Date(0);

        return db - da;

    });

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

            {sortedLinks.map((link, idx) => (

                <div key={link.id} className="link-item" style={{ animationDelay: `${idx * 30}ms`, borderLeft: !link.readAt ? '3px solid var(--primary)' : '3px solid transparent' }}>

                    <div className="link-fields">

                        <input className="link-label-input" placeholder="Etichetta" value={link.label}

                            onChange={e => updateLink(link.id, 'label', e.target.value)} />

                        <input className="link-url-input" placeholder="https://..." value={link.url}

                            onChange={e => updateLink(link.id, 'url', e.target.value)} />

                        <input className="link-note-input" placeholder="Nota..." value={link.note || ''}

                            onChange={e => updateLink(link.id, 'note', e.target.value)}

                            style={{ fontSize: '0.7rem', height: '28px', gridColumn: 'span 2' }} />

                    </div>

                    {link.url && (

                        <a href={link.url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-icon-sm"

                            onClick={e => e.stopPropagation()}>↗</a>

                    )}

                    <button className="btn btn-ghost btn-icon-sm" title={link.readAt ? 'Segna come non letto' : 'Segna come letto'}

                        onClick={() => updateLink(link.id, 'readAt', link.readAt ? null : new Date().toISOString())}

                        style={{ fontSize: '0.75rem' }}>

                        {link.readAt ? <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>visibility</span> : <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>visibility_off</span>}

                    </button>

                    <button className="btn btn-ghost btn-icon-sm" onClick={() => confirmDelete('link', link.id)}>✕</button>

                </div>

            ))}

        </div>

    );

});

/* ── FILES ── */

const FilesSection = React.memo(({ form, update, confirmDelete, filterOutQuotes, initialPreviewFile, clearInitialPreviewFile, initialPath, clearInitialPath }) => {

    const allFiles = form.files || [];

    const files = filterOutQuotes ? allFiles.filter(f => !f.isQuote) : allFiles;

    const fileRef = useRef(null);

    const folderRef = useRef(null);

    const [previewFile, setPreviewFile] = useState(null);

    const [currentPath, setCurrentPath] = useState('');

    const [uploadProgress, setUploadProgress] = useState(null);

    useEffect(() => {

        if (initialPreviewFile) {

            setPreviewFile(initialPreviewFile);

            clearInitialPreviewFile();

        }

    }, [initialPreviewFile, clearInitialPreviewFile]);

    useEffect(() => {

        if (initialPath != null) {

            setCurrentPath(initialPath);

            clearInitialPath();

        }

    }, [initialPath, clearInitialPath]);



    const copyInternalLink = async (item, type) => {

        let html = '';

        let text = '';

        let label = '';



        if (type === 'file') {

            label = item.name;

            html = `<a class="internal-link" data-internal-id="${item.id}" data-internal-type="file" contenteditable="false" style="color:var(--primary);font-weight:600;text-decoration:none;background:var(--bg-hover);padding:2px 6px;border-radius:4px;display:inline-block;margin:2px;cursor:pointer;">📄 ${label}</a>&nbsp;`;

            text = `[File: ${label}]`;

        } else if (type === 'folder-link') {

            label = item.name;

            const path = item.path || '';

            html = `<a href="#" class="folder-internal-link" data-path="${path.replace(/\\/g, '\\\\')}" contenteditable="false" style="color:var(--primary);font-weight:600;text-decoration:none;background:var(--bg-hover);padding:2px 6px;border-radius:4px;display:inline-block;margin:2px;cursor:pointer;">🗂️ ${label}</a>&nbsp;`;

            text = `[Cartella: ${label}]`;

        } else if (type === 'folder-nav') {

            label = item.replace('/', '');

            const path = currentPath + item;

            html = `<a class="internal-link" data-internal-id="${path}" data-internal-type="folder-nav" contenteditable="false" style="color:var(--primary);font-weight:600;text-decoration:none;background:var(--bg-hover);padding:2px 6px;border-radius:4px;display:inline-block;margin:2px;cursor:pointer;">📁 ${label}</a>&nbsp;`;

            text = `[Naviga: ${label}]`;

        }



        try {

            const clipboardItem = new ClipboardItem({

                'text/html': new Blob([html], { type: 'text/html' }),

                'text/plain': new Blob([text], { type: 'text/plain' })

            });

            await navigator.clipboard.write([clipboardItem]);

            alert(`Link al file "${label}" copiato! Incollalo in una nota o todo per potervi accedere rapidamente.`);

        } catch (err) {

            console.error(err);

            navigator.clipboard.writeText(text);

        }

    };



    const handleAddFolderLink = () => {

        const path = prompt('Inserisci il percorso della cartella locale da linkare:');

        if (path !== null && path.trim() !== '') {

            const folderName = path.split(/[\\\/]/).pop() || path.trim();

            const newFolderLink = {

                id: generateId(),

                name: folderName,

                path: path.trim(),

                isFolderLink: true,

                createdAt: new Date().toISOString()

            };

            update('files', [...allFiles, newFolderLink]);

        }

    };

    const handleUploadFolder = async () => {

        // Trigger folder selection dialog

        const input = document.createElement('input');

        input.type = 'file';

        input.webkitdirectory = true; // Enable folder selection

        input.multiple = true;

        input.onchange = async (e) => {

            const selectedFiles = Array.from(e.target.files);

            if (selectedFiles.length === 0) return;

            // Get folder name from the first file's path

            const firstFilePath = selectedFiles[0].webkitRelativePath;

            const folderName = firstFilePath.split('/')[0];

            // Filter oversized files

            const validFiles = selectedFiles.filter(file => file.size <= 100 * 1024 * 1024);

            const oversized = selectedFiles.length - validFiles.length;

            if (oversized > 0) {

                alert(`${oversized} file superano i 100MB e non verranno caricati.`);

            }

            if (validFiles.length === 0) return;

            setUploadProgress({ loaded: 0, total: validFiles.length });

            // Process files in batches to avoid blocking UI

            const batchSize = 10;

            const uploadedFiles = [];

            for (let batchStart = 0; batchStart < validFiles.length; batchStart += batchSize) {

                const batch = validFiles.slice(batchStart, batchStart + batchSize);

                const batchPromises = batch.map(async (file, index) => {

                    try {

                        const base64 = await new Promise((resolve, reject) => {

                            const reader = new FileReader();

                            reader.onload = () => {

                                const result = reader.result;

                                if (result.startsWith('data:')) {

                                    resolve(result);

                                } else {

                                    reject(new Error('Failed to convert to base64'));

                                }

                            };

                            reader.onerror = reject;

                            reader.readAsDataURL(file);

                        });

                        const relativePath = file.webkitRelativePath;

                        const pathParts = relativePath.split('/');

                        const fileName = pathParts.pop();

                        const folderPath = pathParts.join('/');

                        return {

                            id: generateId ? generateId() : Date.now().toString() + '_' + (batchStart + index),

                            name: fileName,

                            path: base64,

                            size: file.size,

                            type: file.type || 'application/octet-stream',

                            uploadedAt: new Date().toISOString(),

                            folderPath: folderPath,

                            originalFolder: folderName

                        };

                    } catch (error) {

                        console.error('Error uploading file:', file.name, error);

                        return null;

                    }

                });

                const batchResults = await Promise.all(batchPromises);

                uploadedFiles.push(...batchResults.filter(result => result !== null));

                // Update progress

                setUploadProgress({ loaded: Math.min(batchStart + batchSize, validFiles.length), total: validFiles.length });

                // Allow UI to breathe between batches

                if (batchStart + batchSize < validFiles.length) {

                    await new Promise(resolve => setTimeout(resolve, 50));

                }

            }

            update('files', [...allFiles, ...uploadedFiles]);

            setUploadProgress(null);

        };

        input.click();

    };

    const handleUploadMultiple = async (e) => {

        const selectedFiles = Array.from(e.target.files);

        if (selectedFiles.length === 0) return;

        let validFiles = [];

        let oversized = 0;

        for (const file of selectedFiles) {

            if (file.size > 100 * 1024 * 1024) {

                oversized++;

            } else {

                validFiles.push(file);

            }

        }

        if (oversized > 0) {

            alert(`${oversized} file superano i 100MB e sono stati ignorati.`);

        }

        try {

            const totalBytes = validFiles.reduce((sum, f) => sum + (f.size || 0), 0);

            const loadedByIndex = new Array(validFiles.length).fill(0);

            setUploadProgress({ loaded: 0, total: totalBytes });

            const savedFiles = await Promise.all(validFiles.map((f, idx) => saveFile(form.id, f, (loaded, total) => {

                const capped = Math.min(loaded, total || 0);

                loadedByIndex[idx] = capped;

                const sumLoaded = loadedByIndex.reduce((s, v) => s + v, 0);

                setUploadProgress({ loaded: sumLoaded, total: totalBytes });

            })));

            update('files', [...allFiles, ...savedFiles]);

        } catch {

            alert('Errore durante il caricamento');

        } finally {

            setTimeout(() => setUploadProgress(null), 400);

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

        if (file.isFolderLink) {

            if (currentPath === '') visibleFiles.push(file);

            return;

        }

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

                    <button className="btn btn-secondary btn-sm" onClick={handleAddFolderLink} title="Linka una cartella locale dal PC">

                        🗂️ LINK Cartella

                    </button>

                </div>

                <input ref={fileRef} type="file" multiple hidden onChange={handleUploadMultiple} />

            </div>

            {uploadProgress && (

                <div style={{ marginBottom: '14px', background: 'var(--bg-hover)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '10px 12px' }}>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>

                        <span>Caricamento…</span>

                        <strong style={{ color: 'var(--text-primary)' }}>{formatBytes(uploadProgress.loaded)} / {formatBytes(uploadProgress.total)}</strong>

                    </div>

                    <div style={{ height: 10, borderRadius: 999, background: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>

                        <div style={{ height: '100%', width: `${uploadProgress.total > 0 ? Math.min(100, (uploadProgress.loaded / uploadProgress.total) * 100) : 0}%`, background: 'var(--primary)', transition: 'width 120ms linear' }} />

                    </div>

                </div>

            )}

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

                        <div className="file-card-actions">

                            <button

                                className="btn btn-ghost btn-icon-sm"

                                onClick={(e) => {

                                    e.stopPropagation();

                                    const folderPath = currentPath + folder;

                                    confirmDelete('folder', { folderPath });

                                }}

                                title="Elimina cartella"

                            >

                                ✕

                            </button>

                        </div>

                    </div>

                ))}

                {visibleFiles.map((file, idx) => {

                    const lowerName = (file.name || '').toLowerCase();

                    const isImage = file.type && file.type.startsWith('image/');

                    const isPdf = file.type === 'application/pdf';

                    const isText = file.type && file.type.startsWith('text/');

                    const isDocx = lowerName.endsWith('.docx');

                    const isXlsx = lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls');

                    const isFolderLink = file.isFolderLink;

                    const canPreview = isImage || isPdf || isText || isDocx || isXlsx;

                    return (

                        <div key={file.id} className="file-card" style={{ animationDelay: `${idx * 20}ms` }}>

                            <div className="file-card-inner">

                                <div className="file-card-icon" style={{ cursor: canPreview || isFolderLink ? 'pointer' : 'default' }} onClick={async () => {

                                    if (isFolderLink) {

                                        // Apri direttamente il file manager di Windows al percorso specificato

                                        if (file.path) {

                                            try {

                                                // Usa l'API esposta dal preload script

                                                await window.electronAPI.openPath(file.path);

                                            } catch (error) {

                                                console.error('Errore nell\'aprire il percorso:', error);

                                                // Fallback: copia il percorso

                                                navigator.clipboard.writeText(file.path).catch(console.error);

                                                // Alert rimosso per un'esperienza piu pulita

                                            }

                                        }

                                    } else if (canPreview) setPreviewFile(file);

                                }}>

                                    {isFolderLink ? '🗂️' : (isImage ? <img src={file.data} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }} /> : '📄')}

                                </div>

                                <div className="file-card-name" style={{ cursor: canPreview || isFolderLink ? 'pointer' : 'default' }} onClick={async () => {

                                    if (isFolderLink) {

                                        // Apri direttamente il file manager di Windows al percorso specificato

                                        if (file.path) {

                                            try {

                                                // Usa l'API esposta dal preload script

                                                await window.electronAPI.openPath(file.path);

                                            } catch (error) {

                                                console.error('Errore nell\'aprire il percorso:', error);

                                                // Fallback: copia il percorso

                                                navigator.clipboard.writeText(file.path).catch(console.error);

                                                // Alert rimosso per un'esperienza piu pulita

                                            }

                                        }

                                    } else if (canPreview) setPreviewFile(file);

                                }}>

                                    {isFolderLink ? file.name : file.name}

                                </div>

                                {!isFolderLink && <div className="file-card-meta">{formatBytes(file.size)}</div>}

                            </div>

                            <div className="file-card-actions">

                                {!isFolderLink && (

                                    <button

                                        className="btn btn-ghost btn-icon-sm"

                                        onClick={(e) => { e.stopPropagation(); copyInternalLink(file, 'file'); }}

                                        title="Copia Link per Nota"

                                        style={{ color: 'var(--primary)' }}

                                    >

                                        🔗

                                    </button>

                                )}

                                {!isFolderLink && <button className="btn btn-ghost btn-icon-sm" onClick={() => downloadFile(file)} title="Scarica">⬇</button>}

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

});

/* ── NOTES (Rich Text) ── */

/* ── NOTES (Rich Text) ── */

const NotesSection = React.memo(({ form, update, confirmDelete, newNote, setNewNote, onInternalLink, onOpenFile, onOpenNote, initialSelectedNote, clearInitialSelectedNote }) => {
    const notes = form.notes || [];
    const [selectedNote, setSelectedNote] = useState(null);
    const [isEditorDirty, setIsEditorDirty] = useState(false);
    const [showDirtyWarning, setShowDirtyWarning] = useState(false);
    const [pendingAction, setPendingAction] = useState(null);
    const [activeFilter, setActiveFilter] = useState('all'); 
    const [searchQuery, setSearchQuery] = useState('');
    const [sessionFolders, setSessionFolders] = useState(['Archiviate']);
    const [showGraph, setShowGraph] = useState(false);
    const [sortOrder, setSortOrder] = useState('createdAt-desc');
    
    const folders = useMemo(() => {
        const set = new Set(sessionFolders);
        notes.forEach(n => {
            if (n.folderPath && n.folderPath !== '/') {
                const parts = n.folderPath.split('/').filter(Boolean);
                if (parts.length > 0) set.add(parts[0]);
            }
        });
        return Array.from(set).sort();
    }, [notes, sessionFolders]);

    useEffect(() => {
        if (initialSelectedNote) {
            handleNoteClick(initialSelectedNote);
            clearInitialSelectedNote();
        }
    }, [initialSelectedNote, clearInitialSelectedNote]);

    useEffect(() => {
        if (!showGraph) return;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                setShowGraph(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showGraph]);

    useEffect(() => {
        const handleDeleteFolder = (e) => {
            const folderName = e.detail;
            setSessionFolders(prev => prev.filter(f => f !== folderName));
            if (activeFilter === folderName + '/') {
                setActiveFilter('root');
            }
        };
        window.addEventListener('deleteNoteFolder', handleDeleteFolder);
        return () => window.removeEventListener('deleteNoteFolder', handleDeleteFolder);
    }, [activeFilter]);

    const addNote = useCallback(() => {
        const text = newNote.replace(/<[^>]*>/g, '').trim();
        if (!text) return;
        const note = {
            id: generateId(),
            text: newNote,
            createdAt: new Date().toISOString(),
            folderPath: activeFilter.endsWith('/') ? activeFilter : '/'
        };
        update('notes', [note, ...notes]);
        setNewNote('');
        setIsEditorDirty(false);
    }, [newNote, activeFilter, notes, update, setNewNote]);

    const handleNoteClick = useCallback((note) => {
        if (isEditorDirty) {
            setPendingAction(() => () => setSelectedNote(note));
            setShowDirtyWarning(true);
        } else {
            setSelectedNote(note);
        }
    }, [isEditorDirty]);

    const formatDate = (iso) => {
        const d = new Date(iso);
        return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const getNoteSnippet = (html) => {
        // Try to extract H1 first
        const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
        if (h1Match) {
            const title = h1Match[1].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
            return title.length > 50 ? title.substring(0, 50) + '...' : title;
        }
        
        // If no H1, extract text before first <br> or newline
        const textBeforeBr = html.split(/<br\s*\/?>|\n/)[0];
        const text = textBeforeBr.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
        return text.length > 50 ? text.substring(0, 50) + '...' : text;
    };

    const filteredNotes = useMemo(() => {
        let base = notes;
        if (activeFilter === 'unread') base = notes.filter(n => !n.readAt);
        else if (activeFilter === 'root') base = notes.filter(n => !n.folderPath || n.folderPath === '/');
        else if (activeFilter !== 'all') base = notes.filter(n => n.folderPath === activeFilter || (n.folderPath && n.folderPath.startsWith(activeFilter)));

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            base = base.filter(n => n.text.toLowerCase().includes(q));
        }

        // Apply sorting
        const sorted = [...base].sort((a, b) => {
            switch (sortOrder) {
                case 'createdAt-desc':
                    return new Date(b.createdAt) - new Date(a.createdAt);
                case 'createdAt-asc':
                    return new Date(a.createdAt) - new Date(b.createdAt);
                case 'title-asc':
                    return getNoteSnippet(a.text).localeCompare(getNoteSnippet(b.text), 'it');
                case 'title-desc':
                    return getNoteSnippet(b.text).localeCompare(getNoteSnippet(a.text), 'it');
                case 'readAt-asc':
                    // Unread first (readAt = null comes first)
                    if (!a.readAt && !b.readAt) return 0;
                    if (!a.readAt) return -1;
                    if (!b.readAt) return 1;
                    return new Date(a.readAt) - new Date(b.readAt);
                case 'folder-asc':
                    return (a.folderPath || '/').localeCompare(b.folderPath || '/', 'it');
                default:
                    return 0;
            }
        });
        return sorted;
    }, [notes, activeFilter, searchQuery, sortOrder]);

    return (
        <div className="notes-workspace animate-fade-in">
            {/* Sidebar Navigation */}
            <div className="notes-sidebar">
                <div className="sidebar-search">
                    <span style={{ fontSize: '1.2rem', opacity: 0.7 }}>🔍</span>
                    <input 
                        type="text" 
                        placeholder="Cerca nelle note..." 
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="sidebar-group">
                    <label className="sidebar-label">Filtri Rapidi</label>
                    <div className={`sidebar-item ${activeFilter === 'all' ? 'active' : ''}`} onClick={() => setActiveFilter('all')}>
                        <div className="sidebar-icon-box">📝</div>
                        <span className="sidebar-text">Tutte le note</span>
                        <span className="item-count">{notes.length}</span>
                    </div>
                    <div className={`sidebar-item ${activeFilter === 'unread' ? 'active' : ''}`} onClick={() => setActiveFilter('unread')}>
                        <div className="sidebar-icon-box">📌</div>
                        <span className="sidebar-text">Da leggere</span>
                        {notes.filter(n => !n.readAt).length > 0 && (
                            <span className="item-count unread-badge">{notes.filter(n => !n.readAt).length}</span>
                        )}
                    </div>
                </div>

                <div className="sidebar-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', padding: '0 4px' }}>
                        <label className="sidebar-label" style={{ margin: 0 }}>Cartelle</label>
                        <button className="btn-add-folder" onClick={() => {
                            const name = prompt('Nome nuova cartella:');
                            if (name) {
                                const folderName = name.trim();
                                if (folderName) {
                                    setSessionFolders(prev => [...new Set([...prev, folderName])]);
                                    setActiveFilter(folderName + '/');
                                }
                            }
                        }}>
                            ➕
                        </button>
                    </div>
                    <div className={`sidebar-item ${activeFilter === 'root' ? 'active' : ''}`} onClick={() => setActiveFilter('root')}>
                        <div className="sidebar-icon-box">🗂️</div>
                        <span className="sidebar-text">Senza cartella</span>
                    </div>
                    <div className="sidebar-folders-list">
                        {folders.map(f => (
                            <div key={f} className={`sidebar-item ${activeFilter === f + '/' ? 'active' : ''}`} onClick={() => setActiveFilter(f + '/')}>
                                <div className="sidebar-icon-box">📁</div>
                                <span className="sidebar-text">{f}</span>
                                <div className="sidebar-item-actions">
                                    {f !== 'Archiviate' && (
                                        <button className="btn-delete-folder" onClick={(e) => {
                                            e.stopPropagation();
                                            confirmDelete('note-folder', f);
                                        }}>✕</button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Graph Toggle Button */}
                <div className="sidebar-group">
                    <label className="sidebar-label">Visualizzazioni</label>
                    <div
                        className={`sidebar-item ${showGraph ? 'active' : ''}`}
                        onClick={() => setShowGraph(!showGraph)}
                        style={showGraph ? { background: 'rgba(124,101,255,0.12)', color: '#7c65ff' } : {}}
                    >
                        <div className="sidebar-icon-box">🕸️</div>
                        <span className="sidebar-text">Grafo Note</span>
                        {showGraph && <span style={{ fontSize: '0.65rem', background: '#7c65ff', color: 'white', padding: '1px 7px', borderRadius: 20, fontWeight: 700 }}>ON</span>}
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="notes-content">
                <div className="notes-editor-header-modern">
                    <div className="header-info">
                        <div className="header-icon">
                            {activeFilter.endsWith('/') ? '📁' : '✍️'}
                        </div>
                        <div>
                            <div className="header-title">
                                {activeFilter === 'all' ? 'Nuova Nota' : (activeFilter === 'root' ? 'Nuova Nota (Generale)' : `Cartella: ${activeFilter.replace('/', '')}`)}
                            </div>
                            <div className="header-subtitle">
                                {isEditorDirty ? 'Modifiche in corso...' : 'Fissa un promemoria o un appunto'}
                            </div>
                        </div>
                    </div>
                    <button className="btn btn-primary" style={{ borderRadius: '14px', padding: '10px 24px', fontWeight: 700 }} onClick={addNote}>
                        💾 Salva Nota
                    </button>
                </div>
                
                <div className="notes-editor-card">
                    <RichTextEditor value={newNote} onChange={setNewNote} onDirtyChange={setIsEditorDirty} onInternalLinkClick={onInternalLink} allFiles={form.files} allNotes={form.notes} />
                </div>

                <div className="notes-grid-title">
                    <h3>{activeFilter === 'all' ? 'Tutte le Note' : (activeFilter === 'unread' ? 'Note da leggere' : activeFilter.replace('/', ''))}</h3>
                    {searchQuery && <span className="search-tag">Risultati per: {searchQuery}</span>}
                    <div className="notes-sort-dropdown">
                        <select 
                            value={sortOrder} 
                            onChange={e => setSortOrder(e.target.value)}
                            title="Ordina note"
                        >
                            <option value="createdAt-desc">📅 Più recenti</option>
                            <option value="createdAt-asc">📅 Più vecchie</option>
                            <option value="title-asc">🔤 Titolo A-Z</option>
                            <option value="title-desc">🔤 Titolo Z-A</option>
                            <option value="readAt-asc">📌 Non lette prima</option>
                            <option value="folder-asc">📁 Per cartella</option>
                        </select>
                    </div>
                </div>

                <div className="notes-grid">
                    {filteredNotes.length === 0 ? (
                        <div className="notes-empty-state">
                            <div style={{ fontSize: '3rem', marginBottom: '16px', opacity: 0.5 }}>📭</div>
                            <p>Nessuna nota trovata in questa sezione.</p>
                        </div>
                    ) : (
                        filteredNotes.map((note, idx) => (
                            <div key={note.id} className={`note-card-modern ${!note.readAt ? 'unread' : ''}`}
                                 style={{ animationDelay: `${idx * 40}ms` }}
                                 onClick={() => handleNoteClick(note)}>
                                <div className="note-card-header">
                                    <span className="note-date">🕒 {formatDate(note.createdAt)}</span>
                                    {note.folderPath && note.folderPath !== '/' && (
                                        <span className="note-folder-badge">📁 {note.folderPath.replace('/', '')}</span>
                                    )}
                                </div>
                                <div className="note-card-body">
                                    <strong>{getNoteSnippet(note.text)}</strong>
                                </div>
                                <div className="note-card-footer">
                                    <button className="btn-icon-action"
                                            title={note.readAt ? 'Segna da leggere' : 'Segna letto'}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                update('notes', notes.map(n => n.id === note.id ? { ...n, readAt: note.readAt ? null : new Date().toISOString() } : n));
                                            }}>
                                        <IconComponent name={note.readAt ? 'eye' : 'eyeOff'} size={16} />
                                    </button>
                                    <button className="btn-icon-action"
                                            title={note.folderPath === 'Archiviate/' ? 'Ripristina' : 'Archivia'}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const targetFolder = note.folderPath === 'Archiviate/' ? '/' : 'Archiviate/';
                                                update('notes', notes.map(n => n.id === note.id ? { ...n, folderPath: targetFolder } : n));
                                            }}>
                                        <IconComponent name="archive" size={16} style={{ color: note.folderPath === 'Archiviate/' ? 'var(--primary)' : 'inherit' }} />
                                    </button>
                                    <button className="btn-icon-action btn-delete"
                                            title="Elimina"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                confirmDelete('note', note.id);
                                            }}>
                                        <IconComponent name="trash" size={16} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {selectedNote && (
                <NoteModal
                    note={selectedNote}
                    folders={folders}
                    onSave={(updatedText, updatedFolder) => {
                        update('notes', notes.map(n => n.id === selectedNote.id ? { ...n, text: updatedText, folderPath: updatedFolder } : n));
                        setSelectedNote(null);
                    }}
                    onNewFolder={(folderName) => {
                        setSessionFolders(prev => [...new Set([...prev, folderName])]);
                    }}
                    onClose={() => setSelectedNote(null)}
                    onOpenFile={onOpenFile}
                    onOpenNote={onOpenNote}
                    allFiles={form.files}
                    allNotes={form.notes}
                />
            )}

            {showGraph && (
                <div className="notes-graph-modal-overlay" style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.4)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    zIndex: 1100,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }} onClick={() => setShowGraph(false)}>
                    <div className="notes-graph-modal-content" style={{
                        backgroundColor: '#ffffff',
                        width: '90%',
                        maxWidth: '1200px',
                        height: '85vh',
                        borderRadius: '24px',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        border: '1px solid rgba(226, 232, 240, 0.8)',
                        position: 'relative'
                    }} onClick={(e) => e.stopPropagation()}>
                        
                        {/* Modal Header */}
                        <div style={{
                            padding: '20px 28px',
                            borderBottom: '1px solid #f1f5f9',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: 'linear-gradient(to right, #f8fafc, #ffffff)',
                            flexShrink: 0
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{
                                    width: '40px',
                                    height: '40px',
                                    borderRadius: '12px',
                                    backgroundColor: 'rgba(124, 101, 255, 0.1)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '1.3rem',
                                    color: '#7c65ff'
                                }}>
                                    🕸️
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>Grafo delle Note</h3>
                                    <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                                        Visualizza le relazioni tra i tuoi appunti. Trascina i nodi ed esplora i collegamenti.
                                    </p>
                                </div>
                            </div>
                            
                            <button 
                                onClick={() => setShowGraph(false)}
                                style={{
                                    background: '#f1f5f9',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '36px',
                                    height: '36px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    color: '#64748b',
                                    fontWeight: 'bold',
                                    fontSize: '1rem',
                                    transition: 'all 0.2s ease'
                                }}
                                onMouseEnter={(e) => {
                                    e.target.style.background = '#e2e8f0';
                                    e.target.style.color = '#0f172a';
                                }}
                                onMouseLeave={(e) => {
                                    e.target.style.background = '#f1f5f9';
                                    e.target.style.color = '#64748b';
                                }}
                            >
                                ✕
                            </button>
                        </div>
                        
                        {/* Modal Body / Graph Container */}
                        <div style={{
                            flex: 1,
                            position: 'relative',
                            backgroundColor: '#ffffff',
                            overflow: 'hidden'
                        }}>
                            <NotesGraphView
                                notes={notes}
                                onNoteClick={handleNoteClick}
                                selectedNoteId={selectedNote?.id || null}
                            />
                        </div>
                        
                        {/* Modal Footer */}
                        <div style={{
                            padding: '12px 28px',
                            borderTop: '1px solid #f1f5f9',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            backgroundColor: '#f8fafc',
                            fontSize: '0.75rem',
                            color: '#64748b',
                            flexShrink: 0
                        }}>
                            <div>
                                <span>Suggerimento: Usa <strong>/Collega Nota</strong> nell'editor per creare collegamenti.</span>
                            </div>
                            <div>
                                <span>Premi <strong>ESC</strong> o clicca fuori per chiudere.</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showDirtyWarning && (
                <div className="detail-confirm-overlay animate-fade-in" style={{ zIndex: 2000 }}>
                    <div className="detail-confirm-card animate-scale-in">
                        <div className="detail-confirm-icon" style={{ color: 'var(--warning)', fontSize: '3rem' }}>⚠️</div>
                        <p>Attenzione! Hai una nota non salvata. Procedendo ora perderai le modifiche.</p>
                        <div className="detail-confirm-buttons">
                            <button className="btn btn-danger" onClick={() => {
                                setShowDirtyWarning(false);
                                setNewNote('');
                                setIsEditorDirty(false);
                                if (pendingAction) pendingAction();
                                setPendingAction(null);
                            }}>Abbandona</button>
                            <button className="btn btn-secondary" onClick={() => {
                                setShowDirtyWarning(false);
                                setPendingAction(null);
                            }}>Torna all'editor</button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .notes-workspace {
                    display: flex;
                    gap: 32px;
                    min-height: 700px;
                    margin-top: 10px;
                }
                
                /* Sidebar */
                .notes-sidebar {
                    width: 260px;
                    flex-shrink: 0;
                    display: flex;
                    flex-direction: column;
                    gap: 32px;
                }
                .sidebar-search {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    background: var(--bg-input);
                    padding: 10px 16px;
                    border-radius: 14px;
                    border: 1px solid var(--border-light);
                }
                .sidebar-search input {
                    background: none;
                    border: none;
                    outline: none;
                    font-size: 0.9rem;
                    color: var(--text-primary);
                    width: 100%;
                }
                .sidebar-group {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                .sidebar-label {
                    font-size: 0.7rem;
                    font-weight: 800;
                    color: var(--text-tertiary);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    margin-bottom: 8px;
                    padding-left: 8px;
                }
                .sidebar-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 10px 12px;
                    border-radius: 12px;
                    font-size: 0.9rem;
                    color: var(--text-secondary);
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .sidebar-item:hover {
                    background: var(--bg-hover);
                }
                .sidebar-item.active {
                    background: var(--primary-ghost);
                    color: var(--primary);
                    font-weight: 700;
                }
                .sidebar-icon-box {
                    width: 24px;
                    height: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    font-size: 1.1rem;
                }
                .sidebar-text {
                    flex: 1;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .item-count {
                    font-size: 0.75rem;
                    background: rgba(0,0,0,0.05);
                    padding: 2px 8px;
                    border-radius: 20px;
                    color: var(--text-tertiary);
                }
                .unread-badge {
                    background: var(--primary);
                    color: white;
                }
                .btn-add-folder {
                    background: none;
                    border: none;
                    color: var(--primary);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 4px;
                    border-radius: 6px;
                    font-size: 1rem;
                }
                .btn-add-folder:hover {
                    background: var(--primary-ghost);
                }
                .sidebar-item-actions {
                    opacity: 0;
                }
                .sidebar-item:hover .sidebar-item-actions {
                    opacity: 1;
                }
                .btn-delete-folder {
                    background: none;
                    border: none;
                    color: var(--text-tertiary);
                    font-size: 0.8rem;
                    cursor: pointer;
                }
                .btn-delete-folder:hover {
                    color: var(--danger);
                }

                /* Content Area */
                .notes-content {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 32px;
                    min-width: 0;
                }
                .notes-editor-header-modern {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 0 4px;
                }
                .header-info {
                    display: flex;
                    gap: 16px;
                    align-items: center;
                }
                .header-icon {
                    width: 44px;
                    height: 44px;
                    background: var(--primary-ghost);
                    color: var(--primary);
                    border-radius: 14px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.4rem;
                }
                .header-title {
                    font-size: 1rem;
                    font-weight: 800;
                    color: var(--text-primary);
                }
                .header-subtitle {
                    font-size: 0.75rem;
                    color: var(--text-tertiary);
                    margin-top: 2px;
                }
                .notes-editor-card {
                    background: white;
                    border: 1px solid var(--border-light);
                    border-radius: 24px;
                    padding: 20px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.03);
                }
                
                .notes-grid-title {
                    display: flex;
                    align-items: baseline;
                    gap: 12px;
                    margin-top: 10px;
                    justify-content: space-between;
                }
                .notes-grid-title h3 {
                    margin: 0;
                    font-size: 1.1rem;
                    font-weight: 800;
                }
                .search-tag {
                    font-size: 0.75rem;
                    color: var(--primary);
                    font-weight: 600;
                }
                .notes-sort-dropdown select {
                    padding: 6px 10px;
                    font-size: 0.75rem;
                    border-radius: 8px;
                    border: 1px solid var(--border-light);
                    background: var(--bg-input);
                    color: var(--text-primary);
                    cursor: pointer;
                    min-width: 160px;
                }
                .notes-sort-dropdown select:focus {
                    outline: none;
                    border-color: var(--primary);
                    box-shadow: 0 0 0 3px var(--primary-ghost);
                }

                .notes-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                    gap: 24px;
                }
                .note-card-modern {
                    background: white;
                    border: 1px solid var(--border-light);
                    border-radius: 20px;
                    padding: 20px;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    transition: all 0.3s;
                    cursor: pointer;
                    position: relative;
                }
                .note-card-modern:hover {
                    transform: translateY(-5px);
                    box-shadow: 0 15px 35px rgba(0,0,0,0.06);
                    border-color: var(--primary-light);
                }
                .note-card-modern.unread {
                    border-left: 4px solid var(--primary);
                }
                .note-card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .note-date {
                    font-size: 0.7rem;
                    color: var(--text-tertiary);
                    font-weight: 600;
                }
                .note-folder-badge {
                    font-size: 0.65rem;
                    font-weight: 700;
                    background: var(--primary-ghost);
                    color: var(--primary);
                    padding: 2px 8px;
                    border-radius: 6px;
                }
                .note-card-body {
                    font-size: 0.9rem;
                    line-height: 1.6;
                    color: var(--text-primary);
                    display: -webkit-box;
                    -webkit-line-clamp: 4;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                    flex: 1;
                }
                .note-card-footer {
                    display: flex;
                    justify-content: flex-end;
                    gap: 8px;
                    opacity: 0;
                    transition: opacity 0.2s;
                }
                .note-card-modern:hover .note-card-footer {
                    opacity: 1;
                }
                .btn-icon-action {
                    background: none;
                    border: none;
                    color: var(--text-tertiary);
                    cursor: pointer;
                    padding: 4px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 6px;
                    font-size: 1.1rem;
                }
                .btn-icon-action:hover {
                    background: var(--bg-hover);
                    color: var(--text-primary);
                }
                .btn-icon-action.btn-delete:hover {
                    color: var(--danger);
                    background: var(--danger-ghost);
                }
                
                .notes-empty-state {
                    grid-column: 1 / -1;
                    text-align: center;
                    padding: 80px 0;
                    color: var(--text-tertiary);
                }
            `}</style>
        </div>
    );
});

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

function NoteModal({ note, folders, onSave, onClose, onOpenFile, onOpenNote, allFiles, allNotes, onNewFolder }) {
    const [text, setText] = useState(note.text);
    const [folderPath, setFolderPath] = useState(note.folderPath || '/');
    const [isDirty, setIsDirty] = useState(false);
    const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);

    const handleClose = () => {
        if (isDirty) {
            setShowUnsavedWarning(true);
        } else {
            onClose();
        }
    };

    return (
        <div className="modal-overlay" style={{ zIndex: 1200, backdropFilter: 'blur(8px)', background: 'rgba(0,0,0,0.4)' }} onClick={handleClose}>
            <div className="modal-content animate-scale-in"
                style={{ 
                    maxWidth: '900px', 
                    width: '95%', 
                    padding: '32px', 
                    borderRadius: '28px', 
                    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                    border: '1px solid rgba(255,255,255,0.1)'
                }}
                onClick={e => e.stopPropagation()}>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <div style={{ 
                            width: '48px', 
                            height: '48px', 
                            background: 'var(--primary-ghost)', 
                            color: 'var(--primary)', 
                            borderRadius: '14px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            fontSize: '1.5rem'
                        }}>
                            ✍️
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>Modifica Nota</h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                                <span style={{ fontSize: '1rem', color: 'var(--text-tertiary)' }}>📁</span>
                                <select 
                                    value={folderPath} 
                                    onChange={e => { setFolderPath(e.target.value); setIsDirty(true); }}
                                    style={{ 
                                        background: 'var(--bg-input)', 
                                        border: '1px solid var(--border-light)', 
                                        borderRadius: '8px',
                                        padding: '2px 8px',
                                        fontSize: '0.75rem', 
                                        color: 'var(--text-secondary)', 
                                        fontWeight: 700, 
                                        cursor: 'pointer', 
                                        outline: 'none' 
                                    }}
                                >
                                    <option value="/">Senza cartella (Root)</option>
                                    {folders.map(f => <option key={f} value={f + '/'}>{f}</option>)}
                                    <option value="new">+ Crea nuova cartella...</option>
                                </select>
                                {folderPath === 'new' && (
                                    <input 
                                        className="input-sm" 
                                        placeholder="Nome cartella..." 
                                        autoFocus
                                        style={{ width: '120px', fontSize: '0.75rem' }}
                                        onBlur={e => {
                                            const val = e.target.value.trim();
                                            if (val) {
                                                setFolderPath(val + '/');
                                                onNewFolder && onNewFolder(val);
                                            } else {
                                                setFolderPath('/');
                                            }
                                        }}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                                const val = e.target.value.trim();
                                                if (val) {
                                                    setFolderPath(val + '/');
                                                    onNewFolder && onNewFolder(val);
                                                } else {
                                                    setFolderPath('/');
                                                }
                                            }
                                        }}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                            className="btn btn-secondary btn-sm"
                            title={folderPath === 'Archiviate/' ? 'Ripristina nota' : 'Archivia nota'}
                            onClick={() => {
                                setFolderPath(folderPath === 'Archiviate/' ? '/' : 'Archiviate/');
                                setIsDirty(true);
                            }}
                            style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '6px', 
                                padding: '6px 12px',
                                fontSize: '0.85rem',
                                borderRadius: '12px',
                                background: folderPath === 'Archiviate/' ? 'var(--primary-ghost)' : 'var(--bg-input)',
                                color: folderPath === 'Archiviate/' ? 'var(--primary)' : 'var(--text-primary)',
                                border: folderPath === 'Archiviate/' ? '1px solid var(--primary-light)' : '1px solid var(--border-light)'
                            }}
                        >
                            <IconComponent name="archive" size={16} />
                            <span>{folderPath === 'Archiviate/' ? 'Ripristina' : 'Archivia'}</span>
                        </button>
                        <button className="btn btn-ghost btn-icon" onClick={handleClose} style={{ background: 'var(--bg-input)', borderRadius: '12px' }}>✕</button>
                    </div>
                </div>

                <div style={{ marginBottom: '28px', minHeight: '450px', background: 'var(--bg-input)', borderRadius: '16px', padding: '4px' }}>
                    <RichTextEditor
                        value={text}
                        onChange={setText}
                        onDirtyChange={setIsDirty}
                        onInternalLinkClick={(id, type) => {
                            if (type === 'file') {
                                onOpenFile && onOpenFile(id);
                            } else {
                                onClose();
                                setTimeout(() => {
                                    onOpenNote && onOpenNote(id);
                                }, 10);
                            }
                        }}
                        allFiles={allFiles}
                        allNotes={allNotes}
                    />
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', alignItems: 'center' }}>
                    <div style={{ marginRight: 'auto', fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>
                        {isDirty ? 'Modifiche non ancora salvate' : 'Tutte le modifiche salvate'}
                    </div>
                    <button className="btn btn-secondary" style={{ padding: '10px 28px', borderRadius: '12px' }} onClick={handleClose}>Annulla</button>
                    <button className="btn btn-primary" style={{ padding: '10px 36px', borderRadius: '14px', fontWeight: 700, boxShadow: '0 8px 20px var(--primary-ghost)' }} onClick={() => onSave(text, folderPath)}>
                        Aggiorna Nota
                    </button>
                </div>

                {showUnsavedWarning && (
                    <div className="detail-confirm-overlay animate-fade-in" style={{ zIndex: 2100 }}>
                        <div className="detail-confirm-card animate-scale-in" style={{ borderRadius: '24px', padding: '32px' }}>
                            <div className="detail-confirm-icon" style={{ fontSize: '2.5rem', marginBottom: '16px' }}>
                                ⚠️
                            </div>
                            <h4 style={{ textAlign: 'center', margin: '0 0 12px', fontSize: '1.1rem' }}>Modifiche non salvate</h4>
                            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px' }}>
                                Hai apportato delle modifiche a questa nota. Vuoi davvero chiudere senza salvare?
                            </p>
                            <div className="detail-confirm-buttons" style={{ display: 'flex', gap: '12px' }}>
                                <button className="btn btn-danger" style={{ flex: 1, borderRadius: '12px' }} onClick={() => { setShowUnsavedWarning(false); onClose(); }}>Chiudi comunque</button>
                                <button className="btn btn-secondary" style={{ flex: 1, borderRadius: '12px' }} onClick={() => setShowUnsavedWarning(false)}>Torna alla nota</button>
                            </div>
                        </div>
                    </div>
                )}
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

        if (file.size > 100 * 1024 * 1024) {

            alert('File troppo grande (max 100MB)');

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


