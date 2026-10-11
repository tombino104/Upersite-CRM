import React, { useState } from 'react';
import { GEMINI_API_KEY } from '../utils/geminiConfig';

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


export default function SmartSummarizerModal({ customer, onClose }) {
    const [isGenerating, setIsGenerating] = useState(false);
    const [summary, setSummary] = useState(null);
    const [error, setError] = useState('');
    const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash');

    // Genera il riassunto con Gemini
    const generateSummary = async () => {
        setIsGenerating(true);
        setError('');

        try {
            // Prepara le note del cliente
            const notesText = (customer.notes || [])
                .filter(note => note.type !== 'smartreport') // Escludi i report smart
                .map(note => `• ${new Date(note.createdAt).toLocaleDateString('it-IT')}: ${note.text}`)
                .join('\n');

            if (!notesText.trim()) {
                setError('Nessuna nota da analizzare per questo cliente.');
                return;
            }

            // Crea il prompt per Gemini
            const prompt = `Analizza le seguenti note del cliente "${customer.name}" e genera un riassunto dettagliato in questo formato:

📊 **Situazione Attuale**: [descrizione completa dello stato del progetto/cliente]
⚠️ **Problemi Critici**: [elenco problemi urgenti da risolvere] 
✅ **Prossime Azioni**: [azioni prioritarie nei prossimi giorni]

NOTE DEL CLIENTE (${(customer.notes || []).filter(note => note.type !== 'smartreport').length} note):
${notesText}

IMPORTANTE:
- Sii dettagliato e completo
- Focus su stato attuale, problemi urgenti, prossimi passi
- Usa l'esatto formato richiesto con emoji
- Se non ci sono problemi critici, usa "Nessun problema urgente identificato"
- Se non ci sono azioni specifiche, usa "Monitoraggio e follow-up routine"
- Includi dettagli significativi dal progetto/cliente`;

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
                        maxOutputTokens: 500,
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

            setSummary({
                generatedAt: new Date().toISOString(),
                content: generatedText.trim(),
                model: currentModel.label
            });

        } catch (err) {
            console.error('Errore generazione riassunto:', err);
            setError(err.message || 'Errore durante la generazione del riassunto');
        } finally {
            setIsGenerating(false);
        }
    };

    // Renderizza il contenuto del riassunto
    const renderSummaryContent = (content) => {
        return content.split('\n').map((line, index) => {
            const trimmed = line.trim();
            if (!trimmed) return null;

            // Converti markdown in HTML semplice
            let htmlLine = trimmed
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/📊\s*\*\*Situazione Attuale\*\*:\s*/, '<div style="color: #0984e3; font-weight: 600; margin-bottom: 12px;">📊 <strong>Situazione Attuale:</strong> ')
                .replace(/⚠️\s*\*\*Problemi Critici\*\*:\s*/, '<div style="color: #e74c3c; font-weight: 600; margin-bottom: 12px;">⚠️ <strong>Problemi Critici:</strong> ')
                .replace(/✅\s*\*\*Prossime Azioni\*\*:\s*/, '<div style="color: #00b894; font-weight: 600; margin-bottom: 12px;">✅ <strong>Prossime Azioni:</strong> ');

            // Gestisci i bullet points
            if (trimmed.startsWith('* ')) {
                return (
                    <div key={index} style={{ 
                        fontSize: '14px', 
                        lineHeight: '1.6',
                        marginBottom: '8px',
                        paddingLeft: '20px',
                        position: 'relative'
                    }}>
                        <span style={{ 
                            position: 'absolute', 
                            left: '0', 
                            color: '#636e72',
                            fontWeight: 'bold'
                        }}>•</span>
                        <div dangerouslySetInnerHTML={{ 
                            __html: htmlLine.replace(/^\*\s/, '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') 
                        }} />
                    </div>
                );
            }

            return (
                <div key={index} style={{ 
                    fontSize: '14px', 
                    lineHeight: '1.6',
                    marginBottom: '12px'
                }}>
                    <div dangerouslySetInnerHTML={{ __html: htmlLine }} />
                </div>
            );
        });
    };

    return (
        <div className="modal-overlay" onClick={(e) => {
            // Non chiudere se sta generando o se c'è un riassunto
            if (isGenerating || summary) {
                e.stopPropagation();
                return;
            }
            onClose();
        }} style={{ zIndex: 1200 }}>
            <div className="modal-content animate-scale-in" style={{ 
                maxWidth: '700px', 
                width: '95vw', 
                maxHeight: '90vh', 
                padding: '24px',
                overflow: 'auto'
            }} onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1.2rem' }}>🧠</span>
                        Smart Summarizer - {customer.name}
                    </h3>
                    <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
                </div>

                {/* Model Selection */}
                {!summary && (
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '0.9rem' }}>
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
                        
                        <button 
                            className="btn btn-primary" 
                            onClick={generateSummary}
                            disabled={isGenerating}
                            style={{ width: '100%', marginTop: '12px' }}
                        >
                            {isGenerating ? (
                                <div style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center',
                                    gap: '8px'
                                }}>
                                    <div className="spinner" style={{ 
                                        width: '14px', 
                                        height: '14px', 
                                        border: '2px solid #fff',
                                        borderTopColor: 'transparent',
                                        margin: 0
                                    }}></div>
                                    <span>Generazione in corso...</span>
                                </div>
                            ) : (
                                '🧠 Genera Riassunto'
                            )}
                        </button>
                    </div>
                )}

                {/* Loading */}
                {isGenerating && (
                    <div style={{ 
                        textAlign: 'center', 
                        padding: '40px 20px',
                        background: 'var(--bg-card)', 
                        border: '1px solid var(--border-light)', 
                        borderRadius: 'var(--radius-md)'
                    }}>
                        <div className="spinner" style={{ 
                            width: '32px', 
                            height: '32px', 
                            margin: '0 auto 16px auto',
                            border: '3px solid var(--primary)',
                            borderTopColor: 'transparent',
                            display: 'block'
                        }}></div>
                        <h4 style={{ margin: '0 0 8px 0', color: 'var(--text-primary)' }}>
                            Analisi Note in corso...
                        </h4>
                        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                            L'IA sta analizzando {(customer.notes || []).length} note del cliente
                        </p>
                    </div>
                )}

                {/* Error */}
                {error && !isGenerating && (
                    <div className="alert alert-danger" style={{ marginBottom: '16px' }}>
                        <strong>Errore:</strong> {error}
                    </div>
                )}

                {/* Summary */}
                {summary && !isGenerating && (
                    <div>
                        {/* Header Summary */}
                        <div style={{ 
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
                            color: 'white', 
                            padding: '16px', 
                            borderRadius: '8px', 
                            marginBottom: '16px' 
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h4 style={{ margin: '0 0 4px 0', fontSize: '1rem' }}>
                                        🧠 Riassunto Intelligente
                                    </h4>
                                    <p style={{ margin: 0, opacity: 0.9, fontSize: '0.8rem' }}>
                                        {new Date(summary.generatedAt).toLocaleString('it-IT')} • 
                                        Modello: {summary.model}
                                    </p>
                                </div>
                                <button 
                                    className="btn btn-secondary" 
                                    onClick={generateSummary}
                                    disabled={isGenerating}
                                    style={{ 
                                        background: 'rgba(255,255,255,0.2)', 
                                        border: '1px solid rgba(255,255,255,0.3)',
                                        fontSize: '0.8rem',
                                        padding: '6px 12px'
                                    }}
                                >
                                    🔄 Rigenera
                                </button>
                            </div>
                        </div>

                        {/* Contenuto Summary */}
                        <div style={{ 
                            background: 'white', 
                            padding: '20px', 
                            borderRadius: '8px', 
                            border: '1px solid #e1e4e8',
                            color: '#2D3436'
                        }}>
                            {renderSummaryContent(summary.content)}
                        </div>

                        {/* Azioni */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                            <button 
                                className="btn btn-primary"
                                onClick={onClose}
                                style={{ fontSize: '0.9rem' }}
                            >
                                Chiudi
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
