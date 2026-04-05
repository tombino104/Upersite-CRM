import React, { useState } from 'react';
import SmartSummarizerModal from './SmartSummarizerModal';

export default function SmartSummarizerButton({ customer }) {
    const [showModal, setShowModal] = useState(false);

    const handleOpenModal = () => {
        setShowModal(true);
    };

    const handleCloseModal = () => {
        setShowModal(false);
    };

    // Controlla se ci sono note da analizzare (escludi smartreport)
    const hasNotes = customer.notes && 
        customer.notes.some(note => note.type !== 'smartreport');

    return (
        <>
            <button
                className="btn btn-secondary"
                onClick={handleOpenModal}
                disabled={!hasNotes}
                style={{
                    fontSize: '0.85rem',
                    padding: '6px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    opacity: hasNotes ? 1 : 0.5,
                    cursor: hasNotes ? 'pointer' : 'not-allowed'
                }}
                title={hasNotes ? 'Riassumi note con IA' : 'Nessuna nota da analizzare'}
            >
                <span style={{ fontSize: '0.9rem' }}>🧠</span>
                Riassumi Note
            </button>

            {/* Modal */}
            {showModal && (
                <SmartSummarizerModal
                    customer={customer}
                    onClose={handleCloseModal}
                />
            )}
        </>
    );
}
