import React, { useState } from 'react';
import { generateId } from '../utils/storage';

const TicketSection = ({ form, update, confirmDelete }) => {
    const tickets = form.tickets || [];
    const [newTicket, setNewTicket] = useState({
        link: '',
        priority: 2,  // 2 stelle di default
        isOpen: true,
        description: ''
    });
    const [showForm, setShowForm] = useState(false);

    const addTicket = (e) => {
        e.preventDefault();
        if (!newTicket.link.trim()) return;

        const ticket = {
            id: generateId(),
            link: newTicket.link.trim(),
            priority: newTicket.priority,
            isOpen: newTicket.isOpen,
            description: newTicket.description,
            createdAt: new Date().toISOString(),
            files: []
        };

        update('tickets', [...tickets, ticket]);
        setNewTicket({ link: '', priority: 2, isOpen: true, description: '' });
        setShowForm(false);
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

                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button type="submit" className="btn btn-primary">Crea Ticket</button>
                            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                                Annulla
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Ticket Aperti */}
            {openTickets.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                    <h4 style={{ color: 'var(--success)', marginBottom: '12px' }}>
                        🟢 Ticket Aperti ({openTickets.length})
                    </h4>
                    {openTickets.map(ticket => (
                        <div key={ticket.id} className="ticket-card" style={{
                            background: 'var(--bg-input)',
                            padding: '12px',
                            borderRadius: '8px',
                            marginBottom: '8px',
                            border: '1px solid var(--border-light)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                                </div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
                    ))}
                </div>
            )}

            {/* Ticket Chiusi */}
            {closedTickets.length > 0 && (
                <div>
                    <h4 style={{ color: 'var(--text-secondary)', marginBottom: '12px' }}>
                        🔴 Ticket Chiusi ({closedTickets.length})
                    </h4>
                    {closedTickets.map(ticket => (
                        <div key={ticket.id} className="ticket-card" style={{
                            background: 'var(--bg-input)',
                            padding: '12px',
                            borderRadius: '8px',
                            marginBottom: '8px',
                            border: '1px solid var(--border-light)',
                            opacity: 0.7
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                                </div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
                    ))}
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
