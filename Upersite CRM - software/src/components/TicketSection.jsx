import React, { useState } from 'react';
import { generateId } from '../utils/storage';

const TicketSection = ({ form, update, confirmDelete }) => {
    const tickets = form.tickets || [];
    const allNotes = form.notes || [];
    const [newTicket, setNewTicket] = useState({
        link: '',
        priority: 2,  // 2 stelle di default
        isOpen: true,
        description: '',
        linkedNotes: []
    });
    const [showForm, setShowForm] = useState(false);
    const [editingTicket, setEditingTicket] = useState(null);

    const addTicket = (e) => {
        e.preventDefault();
        if (!newTicket.link.trim()) return;

        const ticket = {
            id: generateId(),
            link: newTicket.link.trim(),
            priority: newTicket.priority,
            isOpen: newTicket.isOpen,
            description: newTicket.description,
            linkedNotes: newTicket.linkedNotes || [],
            createdAt: new Date().toISOString(),
            files: []
        };

        update('tickets', [...tickets, ticket]);
        setNewTicket({ link: '', priority: 2, isOpen: true, description: '', linkedNotes: [] });
        setShowForm(false);
    };

    const updateTicket = (id, field, value) => {
        const updated = tickets.map(t => 
            t.id === id ? { ...t, [field]: value } : t
        );
        update('tickets', updated);
    };

    const startEditTicket = (ticket) => {
        setEditingTicket({ ...ticket });
        setShowForm(false);
    };

    const saveEditTicket = () => {
        if (!editingTicket) return;
        
        const updated = tickets.map(t => 
            t.id === editingTicket.id ? editingTicket : t
        );
        update('tickets', updated);
        setEditingTicket(null);
    };

    const cancelEditTicket = () => {
        setEditingTicket(null);
    };

    const linkNoteToTicket = (ticketId, noteId) => {
        const ticket = tickets.find(t => t.id === ticketId);
        if (!ticket) return;
        
        const current = ticket.linkedNotes || [];
        if (current.includes(noteId)) return;
        
        updateTicket(ticketId, 'linkedNotes', [...current, noteId]);
    };

    const unlinkNoteFromTicket = (ticketId, noteId) => {
        const ticket = tickets.find(t => t.id === ticketId);
        if (!ticket) return;
        
        updateTicket(ticketId, 'linkedNotes', (ticket.linkedNotes || []).filter(n => n !== noteId));
    };

    const getNoteSnippet = (noteText) => {
        const text = noteText.replace(/<[^>]*>/g, '').substring(0, 50);
        return text.length > 50 ? text + '...' : text;
    };

    const toggleTicketStatus = (id) => {
        const updated = tickets.map(t => 
            t.id === id ? { ...t, isOpen: !t.isOpen } : t
        );
        update('tickets', updated);
    };

    const getPriorityStars = (priority) => {
        return '⭐'.repeat(priority) + '☆'.repeat(3 - priority);
    };

    const openTickets = tickets.filter(t => t.isOpen);
    const closedTickets = tickets.filter(t => !t.isOpen);

    return (
        <div className="tickets-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0 }}>Tickets</h3>
                <button 
                    className="btn btn-primary btn-sm" 
                    onClick={() => setShowForm(!showForm)}
                >
                    + Nuovo Ticket
                </button>
            </div>

            {showForm && (
                <div className="ticket-form" style={{ 
                    background: 'var(--bg-secondary)', 
                    padding: '16px', 
                    borderRadius: '8px', 
                    marginBottom: '20px' 
                }}>
                    <form onSubmit={addTicket}>
                        <div style={{ marginBottom: '12px' }}>
                            <label>Link Ticket *</label>
                            <input
                                type="url"
                                className="input"
                                value={newTicket.link}
                                onChange={e => setNewTicket({...newTicket, link: e.target.value})}
                                placeholder="https://odoo.example.com/ticket/123"
                                required
                            />
                        </div>

                        <div style={{ marginBottom: '12px' }}>
                            <label>Priorità</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                {[1, 2, 3].map(level => (
                                    <button
                                        key={level}
                                        type="button"
                                        className={`btn ${newTicket.priority === level ? 'btn-primary' : 'btn-ghost'}`}
                                        onClick={() => setNewTicket({...newTicket, priority: level})}
                                    >
                                        {getPriorityStars(level)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div style={{ marginBottom: '12px' }}>
                            <label>Stato</label>
                            <button
                                type="button"
                                className={`btn ${newTicket.isOpen ? 'btn-success' : 'btn-secondary'}`}
                                onClick={() => setNewTicket({...newTicket, isOpen: !newTicket.isOpen})}
                            >
                                {newTicket.isOpen ? '🟢 Aperto' : '🔴 Chiuso'}
                            </button>
                        </div>

                        <div style={{ marginBottom: '12px' }}>
                            <label>Note</label>
                            <textarea
                                className="input"
                                value={newTicket.description}
                                onChange={e => setNewTicket({...newTicket, description: e.target.value})}
                                placeholder="Note aggiuntive..."
                                rows={3}
                            />
                        </div>

                        <div style={{ marginBottom: '12px' }}>
                            <label>Collega a note</label>
                            <div style={{ marginBottom: '8px' }}>
                                {allNotes.length > 0 ? (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                        {allNotes.map(note => {
                                            const isLinked = (newTicket.linkedNotes || []).includes(note.id);
                                            return (
                                                <button
                                                    key={note.id}
                                                    type="button"
                                                    className={`btn ${isLinked ? 'btn-primary' : 'btn-ghost'}`}
                                                    onClick={() => {
                                                        const current = newTicket.linkedNotes || [];
                                                        if (isLinked) {
                                                            setNewTicket({...newTicket, linkedNotes: current.filter(nid => nid !== note.id)});
                                                        } else {
                                                            setNewTicket({...newTicket, linkedNotes: [...current, note.id]});
                                                        }
                                                    }}
                                                    style={{ 
                                                        fontSize: '0.8rem', 
                                                        padding: '4px 8px',
                                                        borderRadius: '6px',
                                                        border: '1px solid var(--border-light)',
                                                        background: isLinked ? 'var(--primary)' : 'var(--bg-input)',
                                                        color: isLinked ? 'white' : 'var(--text-primary)'
                                                    }}
                                                    title={getNoteSnippet(note.text)}
                                                >
                                                    📝 {getNoteSnippet(note.text)}
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontStyle: 'italic' }}>
                                        Nessuna nota disponibile
                                    </div>
                                )}
                            </div>
                            {(newTicket.linkedNotes || []).length > 0 && (
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                                    {newTicket.linkedNotes.length} nota{newTicket.linkedNotes.length !== 1 ? 'e' : ''} selezionata{newTicket.linkedNotes.length !== 1 ? 'e' : ''}
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button type="submit" className="btn btn-primary">Crea Ticket</button>
                            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                                Annulla
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Edit Ticket Form */}
            {editingTicket && (
                <div className="ticket-form" style={{ 
                    background: 'var(--bg-tertiary)', 
                    padding: '16px', 
                    borderRadius: '8px', 
                    marginBottom: '20px',
                    border: '2px solid var(--primary)'
                }}>
                    <h4 style={{ margin: '0 0 16px 0', color: 'var(--primary)' }}>Modifica Ticket</h4>
                    <div style={{ marginBottom: '12px' }}>
                        <label>Link Ticket *</label>
                        <input
                            type="url"
                            className="input"
                            value={editingTicket.link}
                            onChange={e => setEditingTicket({...editingTicket, link: e.target.value})}
                            placeholder="https://odoo.example.com/ticket/123"
                            required
                        />
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                        <label>Priorità</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {[1, 2, 3].map(level => (
                                <button
                                    key={level}
                                    type="button"
                                    className={`btn ${editingTicket.priority === level ? 'btn-primary' : 'btn-ghost'}`}
                                    onClick={() => setEditingTicket({...editingTicket, priority: level})}
                                >
                                    {getPriorityStars(level)}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                        <label>Stato</label>
                        <button
                            type="button"
                            className={`btn ${editingTicket.isOpen ? 'btn-success' : 'btn-secondary'}`}
                            onClick={() => setEditingTicket({...editingTicket, isOpen: !editingTicket.isOpen})}
                        >
                            {editingTicket.isOpen ? '🟢 Aperto' : '🔴 Chiuso'}
                        </button>
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                        <label>Note</label>
                        <textarea
                            className="input"
                            value={editingTicket.description || ''}
                            onChange={e => setEditingTicket({...editingTicket, description: e.target.value})}
                            placeholder="Note aggiuntive..."
                            rows={3}
                        />
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                        <label>Collega a note</label>
                        <div style={{ marginBottom: '8px' }}>
                            {allNotes.length > 0 ? (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                    {allNotes.map(note => {
                                        const isLinked = (editingTicket.linkedNotes || []).includes(note.id);
                                        return (
                                            <button
                                                key={note.id}
                                                type="button"
                                                className={`btn ${isLinked ? 'btn-primary' : 'btn-ghost'}`}
                                                onClick={() => {
                                                    const current = editingTicket.linkedNotes || [];
                                                    if (isLinked) {
                                                        setEditingTicket({...editingTicket, linkedNotes: current.filter(nid => nid !== note.id)});
                                                    } else {
                                                        setEditingTicket({...editingTicket, linkedNotes: [...current, note.id]});
                                                    }
                                                }}
                                                style={{ 
                                                    fontSize: '0.8rem', 
                                                    padding: '4px 8px',
                                                    borderRadius: '6px',
                                                    border: '1px solid var(--border-light)',
                                                    background: isLinked ? 'var(--primary)' : 'var(--bg-input)',
                                                    color: isLinked ? 'white' : 'var(--text-primary)'
                                                }}
                                                title={getNoteSnippet(note.text)}
                                            >
                                                📝 {getNoteSnippet(note.text)}
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontStyle: 'italic' }}>
                                    Nessuna nota disponibile
                                </div>
                            )}
                        </div>
                        {(editingTicket.linkedNotes || []).length > 0 && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                                {editingTicket.linkedNotes.length} nota{editingTicket.linkedNotes.length !== 1 ? 'e' : ''} selezionata{editingTicket.linkedNotes.length !== 1 ? 'e' : ''}
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button type="button" className="btn btn-primary" onClick={saveEditTicket}>Salva Modifiche</button>
                        <button type="button" className="btn btn-secondary" onClick={cancelEditTicket}>Annulla</button>
                    </div>
                </div>
            )}

            {/* Ticket Aperti */}
            {openTickets.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                    <h4 style={{ color: 'var(--success)', marginBottom: '12px' }}>
                        🟢 Ticket Aperti ({openTickets.length})
                    </h4>
                    {openTickets.map(ticket => {
                        const linkedNoteObjects = (ticket.linkedNotes || []).map(nid => allNotes.find(n => n.id === nid)).filter(Boolean);
                        
                        return (
                        <div key={ticket.id} className="ticket-card" style={{
                            background: 'var(--bg-input)',
                            padding: '12px',
                            borderRadius: '8px',
                            marginBottom: '8px',
                            border: '1px solid var(--border-light)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ flex: 1 }}>
                                    <a href={ticket.link} target="_blank" rel="noopener noreferrer" 
                                       style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>
                                        🔗 {ticket.link}
                                    </a>
                                    <div style={{ display: 'flex', gap: '12px', marginTop: '4px', fontSize: '0.8rem' }}>
                                        <span>{getPriorityStars(ticket.priority)}</span>
                                        <span style={{ color: 'var(--text-secondary)' }}>
                                            {new Date(ticket.createdAt).toLocaleDateString('it-IT')}
                                        </span>
                                    </div>
                                    {ticket.description && (
                                        <p style={{ margin: '8px 0 0 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                            {ticket.description}
                                        </p>
                                    )}
                                    {linkedNoteObjects.length > 0 && (
                                        <div style={{ marginTop: '8px' }}>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Note collegate:</div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                {linkedNoteObjects.map(note => (
                                                    <span key={note.id} style={{
                                                        background: 'var(--bg-secondary)',
                                                        padding: '2px 6px',
                                                        borderRadius: '4px',
                                                        fontSize: '0.75rem',
                                                        color: 'var(--text-secondary)',
                                                        border: '1px solid var(--border-light)'
                                                    }}>
                                                        📝 {getNoteSnippet(note.text)}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                    <button
                                        className="btn btn-ghost btn-icon-sm"
                                        onClick={() => startEditTicket(ticket)}
                                        title="Modifica ticket"
                                    >
                                        ✏️
                                    </button>
                                    <button
                                        className="btn btn-ghost btn-icon-sm"
                                        onClick={() => toggleTicketStatus(ticket.id)}
                                        title="Chiudi ticket"
                                    >
                                        🔴
                                    </button>
                                    <button
                                        className="btn btn-ghost btn-icon-sm"
                                        onClick={() => confirmDelete('tickets', ticket.id)}
                                        title="Elimina ticket"
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>
                        </div>
                        );
                    })}
                </div>
            )}

            {/* Ticket Chiusi */}
            {closedTickets.length > 0 && (
                <div>
                    <h4 style={{ color: 'var(--text-secondary)', marginBottom: '12px' }}>
                        🔴 Ticket Chiusi ({closedTickets.length})
                    </h4>
                    {closedTickets.map(ticket => {
                        const linkedNoteObjects = (ticket.linkedNotes || []).map(nid => allNotes.find(n => n.id === nid)).filter(Boolean);
                        
                        return (
                        <div key={ticket.id} className="ticket-card" style={{
                            background: 'var(--bg-input)',
                            padding: '12px',
                            borderRadius: '8px',
                            marginBottom: '8px',
                            border: '1px solid var(--border-light)',
                            opacity: 0.7
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ flex: 1 }}>
                                    <a href={ticket.link} target="_blank" rel="noopener noreferrer" 
                                       style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>
                                        🔗 {ticket.link}
                                    </a>
                                    <div style={{ display: 'flex', gap: '12px', marginTop: '4px', fontSize: '0.8rem' }}>
                                        <span>{getPriorityStars(ticket.priority)}</span>
                                        <span style={{ color: 'var(--text-secondary)' }}>
                                            {new Date(ticket.createdAt).toLocaleDateString('it-IT')}
                                        </span>
                                    </div>
                                    {linkedNoteObjects.length > 0 && (
                                        <div style={{ marginTop: '8px' }}>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Note collegate:</div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                {linkedNoteObjects.map(note => (
                                                    <span key={note.id} style={{
                                                        background: 'var(--bg-secondary)',
                                                        padding: '2px 6px',
                                                        borderRadius: '4px',
                                                        fontSize: '0.75rem',
                                                        color: 'var(--text-secondary)',
                                                        border: '1px solid var(--border-light)'
                                                    }}>
                                                        📝 {getNoteSnippet(note.text)}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                    <button
                                        className="btn btn-ghost btn-icon-sm"
                                        onClick={() => startEditTicket(ticket)}
                                        title="Modifica ticket"
                                    >
                                        ✏️
                                    </button>
                                    <button
                                        className="btn btn-ghost btn-icon-sm"
                                        onClick={() => toggleTicketStatus(ticket.id)}
                                        title="Riapri ticket"
                                    >
                                        🟢
                                    </button>
                                    <button
                                        className="btn btn-ghost btn-icon-sm"
                                        onClick={() => confirmDelete('tickets', ticket.id)}
                                        title="Elimina ticket"
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>
                        </div>
                        );
                    })}
                </div>
            )}

            {tickets.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🎫</div>
                    <p>Nessun ticket presente</p>
                </div>
            )}
        </div>
    );
};

export default TicketSection;
