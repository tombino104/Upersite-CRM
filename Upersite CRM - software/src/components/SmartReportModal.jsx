import React, { useState, useRef, useEffect } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// Importiamo la configurazione Gemini da GeminiChat
const AI_MODELS = [
    {
        id: 'gemini-2.5-flash',
        apiVersion: 'v1',
        label: 'Gemini 2.5 Flash',
        rpd: 20,
        badge: '20/g',
        description: 'Modello stabile (20 RPD)',
    },
    {
        id: 'gemini-3.1-flash-lite-preview',
        apiVersion: 'v1beta',
        label: 'Gemini 3.1 Flash Lite',
        rpd: 500,
        badge: '500/g',
        description: 'Alta capacità (500 RPD)',
    }
];

const GEMINI_API_KEY = "CHIAVE_RIMOSSA_VEDI_.env.local";

// Funzione per renderizzare testo Markdown correttamente
function renderMarkdown(text) {
    // Rimuovi linee di trattini (---) usati come separatori
    text = text.replace(/^---+$/gm, '');
    
    // Convert ## headers to strong
    text = text.replace(/^##\s+(.*?)$/gm, '<strong>$1</strong>');
    
    // Convert ### headers to strong
    text = text.replace(/^###\s+(.*?)$/gm, '<strong>$1</strong>');
    
    // Convert # headers to strong
    text = text.replace(/^#\s+(.*?)$/gm, '<strong>$1</strong>');
    
    // Convert **bold** to <strong>
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Convert *italic* to <em>
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Rimuovi linee vuote multiple (inclusi spazi bianchi)
    text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
    
    // Rimuovi spazi bianchi all'inizio e fine delle linee
    text = text.split('\n').map(line => line.trim()).join('\n');
    
    // Convert line breaks (ma non tra paragrafi)
    text = text.replace(/\n/g, '<br>');
    
    // Rimuovi <br> multipli
    text = text.replace(/(<br\s*\/?>){3,}/g, '<br><br>');
    
    return text.trim();
}

// Componente per visualizzare grafici testuali
function TextualChart({ content }) {
    const renderChart = (text) => {
        // Convertiamo i grafici testuali in visualizzazione migliorata
        const lines = text.split('\n');
        return lines.map((line, index) => {
            // Rileva bar charts
            if (line.includes('█') || line.includes('▓') || line.includes('░')) {
                return (
                    <div key={index} className="chart-bar-line" style={{ 
                        fontFamily: 'monospace', 
                        fontSize: '12px', 
                        lineHeight: '1.2',
                        color: '#2D3436',
                        whiteSpace: 'pre'
                    }}>
                        {line}
                    </div>
                );
            }
            
            // Rileva titoli sezioni
            if (line.startsWith('[') && line.endsWith(']')) {
                return (
                    <div key={index} className="chart-section-title" style={{
                        fontWeight: 'bold',
                        color: '#6C5CE7',
                        margin: '15px 0 8px 0',
                        fontSize: '14px',
                        textTransform: 'uppercase'
                    }}>
                        {line}
                    </div>
                );
            }
            
            // Linea normale
            return (
                <div key={index} className="chart-line" style={{ 
                    fontFamily: 'monospace', 
                    fontSize: '12px', 
                    lineHeight: '1.4',
                    color: '#2D3436',
                    whiteSpace: 'pre'
                }}>
                    {line}
                </div>
            );
        });
    };

    return (
        <div className="textual-chart" style={{
            background: '#F8F9FA',
            border: '1px solid #E1E4E8',
            borderRadius: '8px',
            padding: '16px',
            margin: '12px 0',
            overflow: 'auto'
        }}>
            {renderChart(content)}
        </div>
    );
}

export default function SmartReportModal({ customers, onClose, onUpdateCustomer, onSaveReport, initialReport, onReportSaved }) {
    const [isGenerating, setIsGenerating] = useState(false);
    const [reportData, setReportData] = useState(initialReport || null);
    const [error, setError] = useState('');
    const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash');
    const [savedReports, setSavedReports] = useState([]);
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [pendingAction, setPendingAction] = useState(null);
    const reportRef = useRef(null);

    // Se c'è un report iniziale, impostalo come reportData
    useEffect(() => {
        if (initialReport) {
            console.log('InitialReport ricevuto:', initialReport);
            setReportData({
                ...initialReport,
                generatedAt: initialReport.createdAt
            });
        }
    }, [initialReport]);

    // Carica report salvati dal cliente
    useEffect(() => {
        if (customers.length === 1) {
            const customer = customers[0];
            const reports = customer.smartReports || [];
            setSavedReports(reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
        }
    }, [customers]);

    // Gestione chiusura con conferma
    const handleClose = () => {
        // Se è un report esistente (initialReport), chiudi senza conferma
        if (initialReport) {
            onClose();
            return;
        }
        
        // Se c'è un report generato, mostra il dialogo di conferma
        if (reportData) {
            setShowConfirmDialog(true);
            setPendingAction('close');
        } else {
            // Altrimenti chiudi direttamente
            onClose();
        }
    };

    // Gestione click sull'overlay (solo se non c'è report)
    const handleOverlayClick = () => {
        // Se è un report esistente, non permettere la chiusura con overlay
        if (initialReport) {
            return;
        }
        
        // Se sta generando un report, non permettere la chiusura
        if (isGenerating) {
            return;
        }
        
        // Se non c'è un report generato, chiudi direttamente
        if (!reportData) {
            onClose();
        }
        // Se c'è un report, non fare nulla (l'overlay è bloccato dal popup)
    };

    // Gestione azioni del dialogo di conferma
    const handleConfirmAction = (action) => {
        setShowConfirmDialog(false);
        
        switch (action) {
            case 'close':
                onClose();
                break;
            case 'save':
                if (reportData) {
                    saveReportAsNote(reportData.content);
                }
                break;
            case 'export':
                if (reportData) {
                    exportToPDF();
                }
                break;
            case 'cancel':
                // Non fare nulla, rimani nella vista report
                break;
        }
        
        setPendingAction(null);
    };
    // Salva report come nota nel cliente
    const saveReportAsNote = (reportContent) => {
        console.log('=== INIZIO SALVATAGGIO REPORT COME NOTA ===');
        console.log('saveReportAsNote chiamato con:', reportContent);
        console.log('customers:', customers);
        console.log('onUpdateCustomer disponibile?', !!onUpdateCustomer);
        console.log('onUpdateCustomer type:', typeof onUpdateCustomer);
        
        if (customers.length !== 1 || !onUpdateCustomer) {
            console.error('Condizioni non soddisfatte:', { 
                customersLength: customers.length, 
                hasUpdateCustomer: !!onUpdateCustomer,
                updateCustomerType: typeof onUpdateCustomer
            });
            alert('Errore: impossibile salvare il report. Cliente non valido o funzione di aggiornamento mancante.');
            return;
        }
        
        const customer = customers[0];
        console.log('Cliente corrente:', customer);
        
        const smartReportNote = {
            id: `smartreport_${Date.now()}`,
            text: `🤖 **SmartReport** - ${new Date().toLocaleString('it-IT')}\n\n${reportContent}`,
            createdAt: new Date().toISOString(),
            readAt: null,
            type: 'smartreport' // Tipo speciale per identificare i report
        };

        console.log('Nota da salvare:', smartReportNote);

        // Aggiungi sia alle note normali che ai report salvati
        const updatedNotes = [...(customer.notes || []), smartReportNote];
        const updatedCustomer = {
            ...customer,
            notes: updatedNotes,
            smartReports: [...(customer.smartReports || []), {
                id: smartReportNote.id,
                content: reportContent,
                createdAt: smartReportNote.createdAt,
                model: reportData.model
            }]
        };

        console.log('Cliente aggiornato:', updatedCustomer);

        try {
            console.log('Tentativo di salvataggio report...');
            console.log('Cliente ID:', customer.id);
            console.log('Report content:', reportContent);
            console.log('Chiamando onUpdateCustomer con parametri:', customer.id, updatedCustomer);
            
            if (typeof onUpdateCustomer === 'function') {
                onUpdateCustomer(customer.id, updatedCustomer);
                console.log('onUpdateCustomer chiamato con successo');
            } else {
                throw new Error('onUpdateCustomer non è una funzione');
            }
            
            // Aggiorna la lista dei report salvati
            setSavedReports([...(customer.smartReports || []), {
                id: smartReportNote.id,
                content: reportContent,
                createdAt: smartReportNote.createdAt,
                model: reportData.model
            }]);
            
            // Notifica il componente parent che un report è stato salvato
            if (onReportSaved) {
                onReportSaved({
                    id: smartReportNote.id,
                    content: reportContent,
                    createdAt: smartReportNote.createdAt,
                    model: reportData.model
                });
            }
            
            console.log('=== SALVATAGGIO COMPLETATO ===');
            console.log('Report salvato con ID:', smartReportNote.id);
            
            // Chiudi solo la finestra del report, non la scheda utente
            onClose();
        } catch (error) {
            console.error('Errore durante il salvataggio:', error);
            alert('Errore durante il salvataggio del report: ' + error.message);
        }
    };
    const analyzeCustomerData = () => {
        // Se c'è un solo cliente, analizza solo quello
        const singleCustomer = customers.length === 1 ? customers[0] : null;
        
        if (!singleCustomer) {
            return {
                error: "Nessun cliente da analizzare",
                customer: null
            };
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const stats = {
            customer: {
                name: singleCustomer.name,
                company: singleCustomer.company,
                status: singleCustomer.status,
                tags: singleCustomer.tags || [],
                totalQuoted: parseFloat(singleCustomer.quoteAmount) || 0
            },
            urgentTasks: [],
            overduePayments: [],
            upcomingDeadlines: [],
            completedTasks: 0,
            totalTasks: 0,
            totalPaid: 0,
            totalPending: 0
        };

        // Analizza task del cliente
        const traverseTasks = (tasks) => {
            (tasks || []).forEach(task => {
                stats.totalTasks++;
                if (task.completed) {
                    stats.completedTasks++;
                }
                
                if (task.dueDate && !task.completed) {
                    const dueDate = new Date(task.dueDate);
                    const daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
                    
                    if (daysUntilDue <= 7) {
                        stats.urgentTasks.push({
                            task: task.text,
                            dueDate: task.dueDate,
                            daysUntilDue,
                            priority: daysUntilDue <= 0 ? 'URGENTE' : daysUntilDue <= 3 ? 'ALTA' : 'MEDIA'
                        });
                    }
                }
                
                if (task.subtasks) {
                    traverseTasks(task.subtasks);
                }
            });
        };
        traverseTasks(singleCustomer.todo);

        // Analizza pagamenti del cliente
        (singleCustomer.installments || []).forEach(installment => {
            const amount = parseFloat(installment.amount) || 0;
            
            if (installment.paid) {
                stats.totalPaid += amount;
            } else {
                stats.totalPending += amount;
                
                if (installment.dueDate) {
                    const dueDate = new Date(installment.dueDate);
                    if (dueDate < today) {
                        stats.overduePayments.push({
                            amount: installment.amount,
                            dueDate: installment.dueDate,
                            daysOverdue: Math.ceil((today - dueDate) / (1000 * 60 * 60 * 24))
                        });
                    } else if (dueDate <= new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)) {
                        stats.upcomingDeadlines.push({
                            amount: installment.amount,
                            dueDate: installment.dueDate,
                            daysUntilDue: Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24))
                        });
                    }
                }
            }
        });

        return stats;
    };

    // Genera il report con Gemini
    const generateReport = async () => {
        setIsGenerating(true);
        setError('');

        try {
            const customerStats = analyzeCustomerData();
            
            // Crea il prompt per Gemini
            const prompt = `Analizza i seguenti dati del SINGOLO cliente e genera un report dettagliato in formato Markdown:

DATI CLIENTE:
${JSON.stringify(customerStats, null, 2)}

GENERA UN REPORT CHE INCLUDE:
1. **SINTESI ESECUTIVA** - Panoramica situazione attuale del cliente
2. **ANALISI CRITICA** - Problemi urgenti da risolvere per questo cliente
3. **SUGGERIMENTI STRATEGICI** - Azioni consigliate prioritarie per questo cliente
4. **PREVISIONI** - Tendenze e raccomandazioni future per questo cliente

IMPORTANTE:
- Usa formato Markdown con titoli ## e ###
- NON includere grafici testuali ASCII
- Focus solo sul cliente specifico analizzato: ${customerStats.customer?.name || 'Cliente'}
- Sii specifico e action-oriented
- Evidenzia i dati più critici in **grassetto**
- Usa emoji per rendere il report più leggibile 📊📈⚠️
- Analisi approfondita del singolo cliente, non confronti`;

            const currentModel = AI_MODELS.find(m => m.id === selectedModel);
            const apiUrl = `https://generativelanguage.googleapis.com/${currentModel.apiVersion}/models/${currentModel.id}:generateContent?key=${GEMINI_API_KEY}`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: prompt }]
                    }],
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 4000,
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`Errore API: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!generatedText) {
                throw new Error('Nessuna risposta generata dall\'IA');
            }

            setReportData({
                generatedAt: new Date().toISOString(),
                stats: customerStats,
                content: generatedText,
                model: currentModel.label
            });

        } catch (err) {
            console.error('Errore generazione report:', err);
            setError(err.message || 'Errore durante la generazione del report');
        } finally {
            setIsGenerating(false);
        }
    };

    // Esporta in PDF
    const exportToPDF = async () => {
        if (!reportRef.current) return;

        try {
            const canvas = await html2canvas(reportRef.current, {
                scale: 2,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff'
            });

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            
            const imgWidth = 210;
            const pageHeight = 297;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            let heightLeft = imgHeight;
            let position = 0;

            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;

            while (heightLeft >= 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }

            const fileName = `SmartReport_${new Date().toISOString().split('T')[0]}.pdf`;
            pdf.save(fileName);

        } catch (err) {
            console.error('Errore esportazione PDF:', err);
            setError('Errore durante l\'esportazione PDF');
        }
    };

    return (
        <div className="modal-overlay" onClick={handleOverlayClick} style={{ zIndex: 1200 }}>
            <div className="modal-content animate-scale-in" style={{ 
                maxWidth: '900px', 
                width: '95vw', 
                maxHeight: '90vh', 
                padding: '24px',
                overflow: 'auto'
            }} onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 3H5a2 2 0 0 0-2 2v4m6 6h10a2 2 0 0 1 2 2v4M9 9v6"/>
                        </svg>
                        SmartReport - Analisi Intelligente CRM
                    </h3>
                    <button className="btn btn-ghost btn-icon" onClick={handleClose}>✕</button>
                </div>

                {/* Controlli */}
                {!reportData && !initialReport && (
                    <div style={{ marginBottom: '20px' }}>
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                                Modello IA:
                            </label>
                            <select 
                                value={selectedModel}
                                onChange={(e) => setSelectedModel(e.target.value)}
                                className="input"
                                style={{ width: '100%' }}
                            >
                                {AI_MODELS.map(model => (
                                    <option key={model.id} value={model.id}>
                                        {model.label} - {model.description}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <button 
                            className="btn btn-primary" 
                            onClick={generateReport}
                            disabled={isGenerating}
                            style={{ width: '100%' }}
                        >
                            {isGenerating ? (
                                <div style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center',
                                    width: '100%',
                                    gap: '12px'
                                }}>
                                    <div className="spinner" style={{ 
                                        width: '16px', 
                                        height: '16px', 
                                        border: '2px solid #fff',
                                        borderTopColor: 'transparent',
                                        margin: 0,
                                        flexShrink: 0
                                    }}></div>
                                    <span>Generazione in corso...</span>
                                </div>
                            ) : (
                                <>
                                    Genera SmartReport
                                </>
                            )}
                        </button>
                    </div>
                )}

                {/* Report Esistente */}
                {initialReport && !reportData && (
                    <div style={{ 
                        background: 'var(--bg-card)', 
                        border: '1px solid var(--border-light)', 
                        borderRadius: 'var(--radius-md)', 
                        padding: '20px', 
                        marginBottom: '20px',
                        textAlign: 'center'
                    }}>
                        <div className="spinner" style={{ 
                            width: '24px', 
                            height: '24px', 
                            margin: '0 auto 16px auto',
                            border: '2px solid var(--primary)',
                            borderTopColor: 'transparent',
                            display: 'block'
                        }}></div>
                        <h4 style={{ margin: '0 0 8px 0', color: 'var(--text-primary)' }}>
                            Caricamento Report...
                        </h4>
                        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                            Stai visualizzando un report salvato in precedenza.
                        </p>
                    </div>
                )}

                {/* Messaggio se non c'è contenuto */}
                {reportData && !reportData.content && (
                    <div style={{ 
                        background: 'var(--bg-card)', 
                        border: '1px solid var(--border-light)', 
                        borderRadius: 'var(--radius-md)', 
                        padding: '20px', 
                        marginBottom: '20px',
                        textAlign: 'center'
                    }}>
                        <h4 style={{ margin: '0 0 8px 0', color: 'var(--text-primary)' }}>
                            ⚠️ Report Non Disponibile
                        </h4>
                        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                            Il contenuto di questo report non è disponibile.
                        </p>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="alert alert-danger" style={{ marginBottom: '20px' }}>
                        <strong>Errore:</strong> {error}
                    </div>
                )}

                {/* Report Generato */}
                {reportData && reportData.content && (
                    <div>
                        {/* Header Report */}
                        <div style={{ 
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
                            color: 'white', 
                            padding: '20px', 
                            borderRadius: '8px', 
                            marginBottom: '20px' 
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h4 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 3v18h18"/>
                            <path d="M18 17V9"/>
                            <path d="M13 17V5"/>
                            <path d="M8 17v-3"/>
                        </svg>
                        Report Generato
                    </h4>
                                    <p style={{ margin: 0, opacity: 0.9, fontSize: '0.9rem' }}>
                                        {new Date(reportData.generatedAt).toLocaleString('it-IT')} • 
                                        Modello: {reportData.model} • 
                                        Clienti analizzati: {reportData.stats?.totalCustomers || 1}
                                    </p>
                                </div>
                                <button 
                                    className="btn btn-secondary" 
                                    onClick={exportToPDF}
                                    style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)' }}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style={{ marginRight: '8px' }}>
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                        <polyline points="7,10 12,15 17,10"/>
                                        <line x1="12" y1="15" x2="12" y2="3"/>
                                    </svg>
                                    Scarica PDF
                                </button>
                            </div>
                        </div>

                        {/* Contenuto Report */}
                        <div ref={reportRef} style={{ 
                            background: 'white', 
                            padding: '24px', 
                            borderRadius: '8px', 
                            border: '1px solid #e1e4e8' 
                        }}>
                            <div style={{ 
                                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                                lineHeight: '1.6',
                                color: '#2D3436'
                            }}>
                                {reportData.content.split('\n').map((paragraph, index) => {
                                    const trimmed = paragraph.trim();
                                    
                                    // Salta linee vuote
                                    if (!trimmed) return null;
                                    
                                    // Rileva titoli
                                    if (trimmed.startsWith('##')) {
                                        return (
                                            <h2 key={index} style={{ 
                                                color: '#6C5CE7', 
                                                margin: '24px 0 16px 0',
                                                fontSize: '1.5rem',
                                                fontWeight: 'bold'
                                            }}>
                                                {trimmed.replace('##', '').trim()}
                                            </h2>
                                        );
                                    }
                                    
                                    if (trimmed.startsWith('###')) {
                                        return (
                                            <h3 key={index} style={{ 
                                                color: '#2D3436', 
                                                margin: '20px 0 12px 0',
                                                fontSize: '1.2rem',
                                                fontWeight: '600'
                                            }}>
                                                {trimmed.replace('###', '').trim()}
                                            </h3>
                                        );
                                    }
                                    
                                    if (trimmed.startsWith('#')) {
                                        return (
                                            <h3 key={index} style={{ 
                                                color: '#2D3436', 
                                                margin: '20px 0 12px 0',
                                                fontSize: '1.2rem',
                                                fontWeight: '600'
                                            }}>
                                                {trimmed.replace('#', '').trim()}
                                            </h3>
                                        );
                                    }
                                    
                                    // Lista con asterischi
                                    if (trimmed.startsWith('* ')) {
                                        return (
                                            <div key={index} style={{ 
                                                margin: '8px 0', 
                                                paddingLeft: '20px',
                                                fontSize: '14px',
                                                lineHeight: '1.5'
                                            }}>
                                                <div dangerouslySetInnerHTML={{ 
                                                    __html: renderMarkdown(trimmed.replace('* ', '')) 
                                                }} />
                                            </div>
                                        );
                                    }
                                    
                                    // Paragrafo normale
                                    return (
                                        <div key={index} style={{ 
                                            margin: '12px 0', 
                                            textAlign: 'justify',
                                            fontSize: '14px',
                                            lineHeight: '1.5'
                                        }}>
                                            <div dangerouslySetInnerHTML={{ 
                                                __html: renderMarkdown(trimmed) 
                                            }} />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Azioni Report */}
                        <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                            {/* Mostra "Salva come nota" solo per report appena generati, non per report esistenti */}
                            {!initialReport && (
                                <button 
                                    className="btn btn-secondary"
                                    onClick={() => saveReportAsNote(reportData.content)}
                                    style={{ flex: 1 }}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style={{ marginRight: '8px' }}>
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                        <polyline points="14,2 14,8 20,8"/>
                                        <line x1="16" y1="13" x2="8" y2="13"/>
                                        <line x1="16" y1="17" x2="8" y2="17"/>
                                        <polyline points="10,9 9,9 8,9"/>
                                    </svg>
                                    Salva come nota
                                </button>
                            )}
                            <button 
                                className="btn btn-primary"
                                onClick={exportToPDF}
                                style={{ flex: initialReport ? 1 : 1 }}
                            >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style={{ marginRight: '8px' }}>
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                        <polyline points="7,10 12,15 17,10"/>
                                        <line x1="12" y1="15" x2="12" y2="3"/>
                                    </svg>
                                    Scarica PDF
                                </button>
                        </div>
                    </div>
                )}
                
                {/* Dialogo di Conferma */}
                {showConfirmDialog && (
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0,0,0,0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1300
                    }}>
                        <div style={{
                            background: '#ffffff',
                            borderRadius: 'var(--radius-lg)',
                            padding: '24px',
                            maxWidth: '400px',
                            width: '90%',
                            border: '1px solid #e1e4e8',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
                        }}>
                            <h4 style={{ margin: '0 0 16px 0', color: '#2D3436', fontSize: '1.1rem' }}>
                                ⚠️ Report non salvato
                            </h4>
                            <p style={{ margin: '0 0 20px 0', color: '#636e72', lineHeight: '1.4' }}>
                                Stai per uscire dalla vista del report. Cosa vuoi fare?
                            </p>
                            <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
                                <button
                                    className="btn btn-success"
                                    onClick={() => handleConfirmAction('save')}
                                    style={{ width: '100%', background: '#00b894', border: '1px solid #00b894' }}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style={{ marginRight: '8px' }}>
                                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                                        <polyline points="17,21 17,13 7,13 7,21"/>
                                        <polyline points="7,3 7,8 15,8"/>
                                    </svg>
                                    Salva come Nota
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={() => handleConfirmAction('export')}
                                    style={{ width: '100%', background: '#0984e3', border: '1px solid #0984e3' }}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style={{ marginRight: '8px' }}>
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                        <polyline points="7,10 12,15 17,10"/>
                                        <line x1="12" y1="15" x2="12" y2="3"/>
                                    </svg>
                                    Esporta PDF
                                </button>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => handleConfirmAction('close')}
                                        style={{ flex: 1, background: '#636e72', border: '1px solid #636e72', color: '#ffffff' }}
                                    >
                                        Uscita senza salvare
                                    </button>
                                    <button
                                        className="btn btn-ghost"
                                        onClick={() => handleConfirmAction('cancel')}
                                        style={{ flex: 1, background: '#ffffff', border: '1px solid #dfe6e9', color: '#636e72' }}
                                    >
                                        Annulla
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
