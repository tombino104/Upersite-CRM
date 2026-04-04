import React, { useState, useEffect } from 'react';
import SmartReportModal from './SmartReportModal';

export default function SmartReportSection({ form, update, updateCustomer, onSave }) {
    const [showModal, setShowModal] = useState(false);
    const [savedReports, setSavedReports] = useState([]);
    const [selectedReport, setSelectedReport] = useState(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [reportToDelete, setReportToDelete] = useState(null);

    console.log('SmartReportSection - props ricevute:', { form, update, updateCustomer, onSave });

    // Carica report salvati dal cliente
    useEffect(() => {
        console.log('SmartReportSection - useEffect triggered con form:', form);
        console.log('Form ID:', form?.id);
        console.log('Form smartReports:', form?.smartReports);
        console.log('Numero di smartReports nel form:', form?.smartReports?.length);
        
        if (form && form.smartReports) {
            console.log('Impostando savedReports con:', form.smartReports);
            setSavedReports(form.smartReports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
        } else {
            console.log('Nessun report trovato nel form - impostando array vuoto');
            setSavedReports([]);
        }
    }, [form]);

    // Funzione per aggiornare il cliente
    const handleUpdateCustomer = (customerId, updatedCustomer) => {
        console.log('handleUpdateCustomer chiamato con:', customerId, updatedCustomer);
        console.log('updateCustomer disponibile?', !!updateCustomer);
        console.log('updateCustomer type:', typeof updateCustomer);
        
        // Usa sempre updateCustomer per non chiudere la scheda
        if (typeof updateCustomer === 'function') {
            updateCustomer(customerId, updatedCustomer);
        } else {
            console.error('updateCustomer non è una funzione:', updateCustomer);
            throw new Error('updateCustomer non è disponibile');
        }
    };

    // Funzione per visualizzare un report salvato
    const handleViewReport = (report) => {
        setSelectedReport(report);
        setShowModal(true);
    };

    // Funzione per gestire il salvataggio di un nuovo report
    const handleReportSaved = (newReport) => {
        console.log('Nuovo report salvato:', newReport);
        // Aggiungi il nuovo report alla lista locale
        setSavedReports(prev => [newReport, ...prev]);
    };

    // Funzione per chiudere il modal e resettare il report selezionato
    const handleCloseModal = () => {
        setShowModal(false);
        setSelectedReport(null);
    };

    // Funzione per eliminare un report
    const handleDeleteReport = (report) => {
        setReportToDelete(report);
        setShowDeleteConfirm(true);
    };

    // Funzione per confermare l'eliminazione
    const confirmDeleteReport = () => {
        if (!reportToDelete || !form) return;

        console.log('=== ELIMINAZIONE COMPLETA REPORT ===');
        console.log('Report da eliminare:', reportToDelete);
        console.log('Report ID da eliminare:', reportToDelete.id);

        // Rimuovi il report dalla lista smartReports
        const updatedSmartReports = form.smartReports.filter(r => r.id !== reportToDelete.id);
        
        // Rimuovi anche dalla note corrispondente (stesso ID)
        const updatedNotes = (form.notes || []).filter(note => note.id !== reportToDelete.id);
        
        console.log('Report rimossi da smartReports:', form.smartReports.length - updatedSmartReports.length);
        console.log('Note rimossi da notes:', form.notes.length - updatedNotes.length);

        const updatedCustomer = {
            ...form,
            smartReports: updatedSmartReports,
            notes: updatedNotes
        };

        console.log('Cliente aggiornato con eliminazione completa:', updatedCustomer);
        
        // Chiama updateCustomer per persistere le modifiche PRIMA di aggiornare lo stato locale
        if (typeof updateCustomer === 'function') {
            updateCustomer(form.id, updatedCustomer);
            console.log('Eliminazione completa salvata');
            
            // Aggiorna lo stato locale solo dopo che updateCustomer è stato chiamato
            setSavedReports(updatedSmartReports);
        } else {
            console.error('updateCustomer non è una funzione:', updateCustomer);
        }

        // Chiudi il dialogo di conferma
        setShowDeleteConfirm(false);
        setReportToDelete(null);
        
        console.log('=== ELIMINAZIONE COMPLETA TERMINATA ===');
    };

    // Funzione per annullare l'eliminazione
    const cancelDelete = () => {
        setShowDeleteConfirm(false);
        setReportToDelete(null);
    };

    return (
        <div style={{ padding: '16px' }}>
            {/* Header Section - Style App */}
            <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--primary)',
                borderRadius: 'var(--radius-lg)',
                padding: '20px',
                marginBottom: '20px'
            }}>
                <h2 style={{ margin: '0 0 12px 0', fontSize: '1.3rem', fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 3H5a2 2 0 0 0-2 2v4m6 6h10a2 2 0 0 1 2 2v4M9 9v6"/>
                    </svg>
                    SmartReport
                </h2>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                    Analisi intelligente dei dati cliente con AI
                </p>
            </div>

            {/* Features Grid - Compact */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px',
                marginBottom: '20px'
            }}>
                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--primary)',
                    borderRadius: 'var(--radius-md)',
                    padding: '16px'
                }}>
                    <div style={{ fontSize: '1.5rem', marginBottom: '8px', color: 'var(--primary)' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 3v18h18"/>
                            <path d="M18 17V9"/>
                            <path d="M13 17V5"/>
                            <path d="M8 17v-3"/>
                        </svg>
                    </div>
                    <h4 style={{ margin: '0 0 4px 0', fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                        Analisi Dati
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Task, pagamenti, stato progetti
                    </p>
                </div>

                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--primary)',
                    borderRadius: 'var(--radius-md)',
                    padding: '16px'
                }}>
                    <div style={{ fontSize: '1.5rem', marginBottom: '8px', color: 'var(--primary)' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M18 20V10"/>
                            <path d="M12 20V4"/>
                            <path d="M6 20v-6"/>
                        </svg>
                    </div>
                    <h4 style={{ margin: '0 0 4px 0', fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                        Grafici Testuali
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Visualizzazioni ASCII interpretabili
                    </p>
                </div>

                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--primary)',
                    borderRadius: 'var(--radius-md)',
                    padding: '16px'
                }}>
                    <div style={{ fontSize: '1.5rem', marginBottom: '8px', color: 'var(--primary)' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M12 6v6l4 2"/>
                        </svg>
                    </div>
                    <h4 style={{ margin: '0 0 4px 0', fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                        Suggerimenti AI
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Raccomandazioni strategiche
                    </p>
                </div>

                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--primary)',
                    borderRadius: 'var(--radius-md)',
                    padding: '16px'
                }}>
                    <div style={{ fontSize: '1.5rem', marginBottom: '8px', color: 'var(--primary)' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7,10 12,15 17,10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                    </div>
                    <h4 style={{ margin: '0 0 4px 0', fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                        Export PDF
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Report scaricabile
                    </p>
                </div>
            </div>

            {/* CTA Button - App Style */}
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <button
                    className="btn btn-primary"
                    onClick={() => setShowModal(true)}
                    style={{
                        fontSize: '1rem',
                        padding: '12px 24px',
                        minWidth: '200px'
                    }}
                >
                    Genera Report
                </button>
            </div>

            {/* Report Salvati */}
            {savedReports.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ margin: '0 0 16px 0', color: 'var(--text-primary)', fontSize: '1.1rem' }}>
                        📋 Report Salvati
                    </h3>
                    <div style={{
                        display: 'grid',
                        gap: '12px'
                    }}>
                        {savedReports.map((report, index) => (
                            <div key={report.id} style={{
                                background: 'var(--bg-card)',
                                border: '1px solid var(--primary)',
                                borderRadius: 'var(--radius-md)',
                                padding: '16px',
                                transition: 'all 0.2s ease'
                            }}>
                                <div style={{ 
                                    display: 'flex', 
                                    justifyContent: 'space-between', 
                                    alignItems: 'flex-start',
                                    marginBottom: '12px'
                                }}>
                                    <div>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                            {new Date(report.createdAt).toLocaleString('it-IT', { 
                                                day: '2-digit', 
                                                month: '2-digit', 
                                                year: 'numeric', 
                                                hour: '2-digit', 
                                                minute: '2-digit' 
                                            })}
                                        </div>
                                        <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: '500' }}>
                                            Modello: {report.model}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            className="btn btn-sm btn-primary"
                                            onClick={() => handleViewReport(report)}
                                            style={{ fontSize: '0.8rem' }}
                                        >
                                            Visualizza
                                        </button>
                                        <button
                                            className="btn btn-sm"
                                            onClick={() => handleDeleteReport(report)}
                                            style={{ 
                                                fontSize: '0.8rem',
                                                background: '#ff4757',
                                                color: 'white',
                                                border: '1px solid #ff4757',
                                                padding: '4px 8px',
                                                borderRadius: '4px',
                                                cursor: 'pointer'
                                            }}
                                            title="Elimina report"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                </div>
                                
                                {/* Anteprima del contenuto */}
                                <div style={{
                                    background: 'var(--bg-secondary)',
                                    padding: '12px',
                                    borderRadius: 'var(--radius-sm)',
                                    fontSize: '0.85rem',
                                    color: 'var(--text-secondary)',
                                    maxHeight: '100px',
                                    overflow: 'hidden',
                                    position: 'relative'
                                }}>
                                    {report.content.substring(0, 200)}
                                    {report.content.length > 200 && (
                                        <span style={{
                                            position: 'absolute',
                                            bottom: 0,
                                            right: 0,
                                            background: 'linear-gradient(to right, transparent, var(--bg-secondary))',
                                            padding: '0 8px',
                                            color: 'var(--primary)',
                                            fontWeight: '500'
                                        }}>
                                            ...
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <SmartReportModal
                    customers={[form]} // Passa il cliente corrente come array
                    onClose={handleCloseModal}
                    onUpdateCustomer={handleUpdateCustomer}
                    onSaveReport={(reportData) => {
                        console.log('Report salvato:', reportData);
                        // Qui potresti salvare il report nel cliente o in una sezione dedicata
                    }}
                    initialReport={selectedReport}
                    onReportSaved={handleReportSaved}
                />
            )}

            {/* Popup di conferma eliminazione */}
            {showDeleteConfirm && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.5)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 1000
                }}>
                    <div style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-light)',
                        borderRadius: 'var(--radius-lg)',
                        padding: '24px',
                        maxWidth: '400px',
                        width: '90%'
                    }}>
                        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                            <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🗑️</div>
                            <h3 style={{ margin: '0 0 12px 0', color: 'var(--text-primary)' }}>
                                Elimina Report
                            </h3>
                            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                                Sei sicuro di voler eliminare questo report? Questa azione non può essere annullata.
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                            <button
                                className="btn btn-secondary"
                                onClick={cancelDelete}
                                style={{ flex: 1 }}
                            >
                                Annulla
                            </button>
                            <button
                                className="btn btn-danger"
                                onClick={confirmDeleteReport}
                                style={{ 
                                    flex: 1,
                                    background: '#e74c3c',
                                    border: '1px solid #c0392b',
                                    color: 'white',
                                    fontWeight: '600'
                                }}
                                onMouseEnter={(e) => {
                                    e.target.style.background = '#c0392b';
                                    e.target.style.borderColor = '#a93226';
                                }}
                                onMouseLeave={(e) => {
                                    e.target.style.background = '#e74c3c';
                                    e.target.style.borderColor = '#c0392b';
                                }}
                            >
                                Elimina
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
