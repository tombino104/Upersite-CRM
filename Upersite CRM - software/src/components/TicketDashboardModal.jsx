import { useState, useMemo } from 'react';

export default function TicketDashboardModal({ customers, onClose, onSelectCustomer }) {
    const [priorityFilter, setPriorityFilter] = useState('all');

    // Extract all open tickets from all customers
    const allOpenTickets = useMemo(() => {
        const tickets = [];
        
        customers.forEach(customer => {
            const customerTickets = (customer.tickets || []).filter(ticket => ticket.isOpen);
            
            customerTickets.forEach(ticket => {
                tickets.push({
                    id: ticket.id,
                    link: ticket.link,
                    customerName: customer.name,
                    customerId: customer.id,
                    customer: customer,
                    priority: ticket.priority || 2,
                    createdAt: ticket.createdAt,
                    description: ticket.description
                });
            });
        });
        
        return tickets;
    }, [customers]);

    // Filter tickets based on priority
    const filteredTickets = useMemo(() => {
        if (priorityFilter === 'all') return allOpenTickets;
        return allOpenTickets.filter(ticket => ticket.priority === parseInt(priorityFilter));
    }, [allOpenTickets, priorityFilter]);

    // Sort by priority (high to low) then by date (newest first)
    const sortedTickets = useMemo(() => {
        return filteredTickets.sort((a, b) => {
            // First by priority (3=high, 2=medium, 1=low)
            if (a.priority !== b.priority) return b.priority - a.priority;
            // Then by date (newest first)
            return new Date(b.createdAt) - new Date(a.createdAt);
        });
    }, [filteredTickets]);

    const getPriorityStars = (priority) => {
        return '⭐'.repeat(priority) + '☆'.repeat(3 - priority);
    };

    const handleTicketClick = (customerId) => {
        const customer = customers.find(c => c.id === customerId);
        if (customer) {
            onSelectCustomer(customer);
            onClose();
        }
    };

    const openTicketsCount = allOpenTickets.length;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content animate-scale-in" 
                 style={{ maxWidth: '800px', width: '90%', maxHeight: '80vh', padding: '24px' }}
                 onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0 }}>
                        🎫 Ticket Aperti ({openTicketsCount})
                    </h3>
                    <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
                </div>

                {/* Priority Filter */}
                <div style={{ marginBottom: '20px' }}>
                    <label style={{ marginRight: '12px', fontSize: '0.9rem' }}>Filtra per priorità:</label>
                    <div style={{ display: 'inline-flex', gap: '8px' }}>
                        <button
                            className={`btn btn-sm ${priorityFilter === 'all' ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => setPriorityFilter('all')}
                        >
                            Tutti ({allOpenTickets.length})
                        </button>
                        {[3, 2, 1].map(level => (
                            <button
                                key={level}
                                className={`btn btn-sm ${priorityFilter === level.toString() ? 'btn-primary' : 'btn-ghost'}`}
                                onClick={() => setPriorityFilter(level.toString())}
                            >
                                {getPriorityStars(level)} ({allOpenTickets.filter(t => t.priority === level).length})
                            </button>
                        ))}
                    </div>
                </div>

                {/* Tickets List */}
                <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                    {sortedTickets.length > 0 ? (
                        sortedTickets.map(ticket => (
                            <div
                                key={`${ticket.customerId}-${ticket.id}`}
                                className="ticket-dashboard-card"
                                style={{
                                    background: 'var(--bg-input)',
                                    padding: '16px',
                                    borderRadius: '8px',
                                    marginBottom: '12px',
                                    border: '1px solid var(--border-light)',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease'
                                }}
                                onClick={() => handleTicketClick(ticket.customerId)}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'var(--bg-secondary)';
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'var(--bg-input)';
                                    e.currentTarget.style.transform = 'translateY(0)';
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ flex: 1 }}>
                                        {/* Customer Name */}
                                        <div style={{ 
                                            fontWeight: 600, 
                                            color: 'var(--primary)', 
                                            marginBottom: '8px',
                                            fontSize: '1rem'
                                        }}>
                                            📍 {ticket.customerName}
                                        </div>
                                        
                                        {/* Ticket Link */}
                                        <div style={{ marginBottom: '8px' }}>
                                            <a 
                                                href={ticket.link} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                style={{ 
                                                    color: 'var(--text-primary)', 
                                                    textDecoration: 'none',
                                                    fontWeight: 500
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                🔗 {ticket.link}
                                            </a>
                                        </div>
                                        
                                        {/* Description */}
                                        {ticket.description && (
                                            <div style={{ 
                                                fontSize: '0.9rem', 
                                                color: 'var(--text-secondary)',
                                                marginBottom: '8px',
                                                lineHeight: '1.4'
                                            }}>
                                                {ticket.description}
                                            </div>
                                        )}
                                        
                                        {/* Metadata */}
                                        <div style={{ display: 'flex', gap: '12px', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                                            <span>{getPriorityStars(ticket.priority)}</span>
                                            <span>
                                                {new Date(ticket.createdAt).toLocaleDateString('it-IT', {
                                                    day: '2-digit',
                                                    month: '2-digit',
                                                    year: 'numeric'
                                                })}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    <div style={{ 
                                        padding: '8px 12px', 
                                        background: 'var(--primary-ghost)', 
                                        borderRadius: '6px',
                                        fontSize: '0.8rem',
                                        color: 'var(--primary)',
                                        fontWeight: 500
                                    }}>
                                        Apri Cliente →
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div style={{ 
                            textAlign: 'center', 
                            padding: '60px 20px', 
                            color: 'var(--text-secondary)' 
                        }}>
                            <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🎫</div>
                            <h4 style={{ margin: '0 0 8px 0', color: 'var(--text-primary)' }}>
                                Nessun ticket aperto
                            </h4>
                            <p style={{ margin: 0, fontSize: '0.9rem' }}>
                                {priorityFilter === 'all' 
                                    ? 'Tutti i ticket sono stati chiusi' 
                                    : `Nessun ticket aperto con priorità ${getPriorityStars(parseInt(priorityFilter))}`
                                }
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    marginTop: '20px',
                    paddingTop: '16px',
                    borderTop: '1px solid var(--border-light)'
                }}>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                        {openTicketsCount} ticket{openTicketsCount !== 1 ? 's' : ''} apert{openTicketsCount !== 1 ? 'i' : 'o'} in totale
                    </div>
                    <button className="btn btn-secondary" onClick={onClose}>
                        Chiudi
                    </button>
                </div>
            </div>
        </div>
    );
}
