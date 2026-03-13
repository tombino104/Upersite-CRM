import CustomerCard from './CustomerCard';

export default function ListView({ customers, onSelectCustomer }) {
    if (customers.length === 0) {
        return (
            <div className="empty-state" style={{ padding: '60px 24px' }}>
                <div className="empty-state-icon">📋</div>
                <div className="empty-state-title">Nessun cliente trovato</div>
                <div className="empty-state-text">Aggiungi il tuo primo cliente per iniziare</div>
            </div>
        );
    }

    return (
        <div className="list-view">
            {customers.map((customer, idx) => (
                <CustomerCard
                    key={customer.id}
                    customer={customer}
                    onClick={() => onSelectCustomer(customer)}
                    index={idx}
                />
            ))}

            <style>{`
        .list-view {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
          gap: 16px;
          animation: fadeIn 0.4s var(--ease-out);
        }

        @media (max-width: 400px) {
          .list-view { grid-template-columns: 1fr; }
        }
      `}</style>
        </div>
    );
}
