import React, { useState, useRef, useEffect, useCallback } from 'react';

// === MODELLI DISPONIBILI ===
// apiVersion: 'v1' è l'endpoint stabile originale, 'v1beta' per i modelli più nuovi
const AI_MODELS = [
    {
        id: 'gemini-2.5-flash',
        apiVersion: 'v1',          // endpoint originale che funzionava
        label: 'Gemini 2.5 Flash',
        rpd: 20,
        badge: '20/g',
        description: 'Modello stabile (20 RPD)',
    },
    {
        id: 'gemini-3.1-flash-lite-preview',
        apiVersion: 'v1beta',      // endpoint per i modelli preview
        label: 'Gemini 3.1 Flash Lite',
        rpd: 500,
        badge: '500/g',
        description: 'Alta capacità (500 RPD)',
    },
    {
        id: 'gemma-3-27b-it',
        apiVersion: 'v1beta',      // endpoint per i modelli Gemma
        label: 'Gemma 3 27B',
        rpd: 14400,
        badge: '14.4k/g',
        description: 'Poco contesto e intelligenza (14.4k RPD)',
    },
];

const GEMINI_API_KEY = "CHIAVE_RIMOSSA_VEDI_.env.local";
const MODEL_STORAGE_KEY = 'upersite_ai_model';

const WELCOME_MESSAGE = {
    role: 'model',
    text: "👋 Ciao! Sono Upersite AI, il tuo assistente intelligente. Chiedimi pure chi deve pagare, quali sono i task di oggi o una panoramica del tuo business!"
};

function generateChatId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function formatChatTitle(date) {
    return new Date(date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatText(text) {
    if (!text) return '';
    let formatted = text
        .replace(/### (.*?)(\n|$)/g, '<h3>$1</h3>')
        .replace(/## (.*?)(\n|$)/g, '<h2>$1</h2>')
        .replace(/# (.*?)(\n|$)/g, '<h1>$1</h1>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/^- (.*?)$/gm, '<li>$1</li>')
        .replace(/^\* (.*?)$/gm, '<li>$1</li>')
        .replace(/^\d+\. (.*?)$/gm, '<li>$1</li>');

    return formatted.split('\n').map((line, idx) => {
        if (line.includes('<li>')) return <ul key={idx} style={{ margin: 0, paddingLeft: '20px' }} dangerouslySetInnerHTML={{ __html: line }} />;
        if (line.includes('<h')) return <div key={idx} dangerouslySetInnerHTML={{ __html: line }} />;
        return (
            <span key={idx}>
                <span dangerouslySetInnerHTML={{ __html: line }} />
                <br />
            </span>
        );
    });
}

export default function GeminiChat({
    customers,
    chatHistory = [],
    aiUsageStats = { date: '', count: 0 },
    onUpdateChatHistory,
    onUpdateAiUsageStats
}) {
    // Ripristina il modello salvato o usa il default
    const savedModelId = localStorage.getItem(MODEL_STORAGE_KEY) || AI_MODELS[0].id;
    const [selectedModelId, setSelectedModelId] = useState(savedModelId);
    const [showModelMenu, setShowModelMenu] = useState(false);

    const [isOpen, setIsOpen] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [currentSessionId, setCurrentSessionId] = useState(null);
    const [messages, setMessages] = useState([WELCOME_MESSAGE]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [confirmDeleteId, setConfirmDeleteId] = useState(null);
    const scrollRef = useRef(null);
    const inputRef = useRef(null);

    const currentModel = AI_MODELS.find(m => m.id === selectedModelId) || AI_MODELS[0];

    const handleModelChange = (modelId) => {
        setSelectedModelId(modelId);
        localStorage.setItem(MODEL_STORAGE_KEY, modelId);
        setShowModelMenu(false);
    };

    useEffect(() => {
        if (isOpen && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 300);
        }
    }, [isOpen]);

    // Resetta il contatore quando cambia giorno (mezzanotte UTC)
    useEffect(() => {
        const today = new Date().toISOString().slice(0, 10);
        if (aiUsageStats.date !== today && onUpdateAiUsageStats) {
            onUpdateAiUsageStats({ date: today, count: 0 });
        }
    }, [aiUsageStats.date, onUpdateAiUsageStats]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isLoading]);

    const saveCurrentSession = useCallback((msgs, sessionId) => {
        if (!onUpdateChatHistory || msgs.length <= 1) return;
        const hasUserMsg = msgs.some(m => m.role === 'user');
        if (!hasUserMsg) return;

        const now = new Date().toISOString();
        const existingIdx = chatHistory.findIndex(s => s.id === sessionId);
        const sessionData = {
            id: sessionId,
            title: msgs.find(m => m.role === 'user')?.text?.slice(0, 45) || 'Chat',
            createdAt: existingIdx >= 0 ? chatHistory[existingIdx].createdAt : now,
            updatedAt: now,
            messages: msgs
        };

        if (existingIdx >= 0) {
            const updated = [...chatHistory];
            updated[existingIdx] = sessionData;
            onUpdateChatHistory(updated);
        } else {
            onUpdateChatHistory([sessionData, ...chatHistory]);
        }
    }, [chatHistory, onUpdateChatHistory]);

    const handleSend = async (e) => {
        if (e) e.preventDefault();
        const text = inputValue.trim();
        if (!text || isLoading) return;

        let sessionId = currentSessionId;
        if (!sessionId) {
            sessionId = generateChatId();
            setCurrentSessionId(sessionId);
        }

        const newMessages = [...messages, { role: 'user', text }];
        setMessages(newMessages);
        setInputValue('');
        setIsLoading(true);

        try {
            const dbSummary = customers.map(c => ({
                id: c.id,
                nome: c.name,
                azienda: c.company,
                stato: c.status,
                rate: (c.installments || []).map(i => ({ scadenza: i.dueDate, importo: i.amount, pagata: i.paid })),
                task: (c.todo || []).map(t => ({ testo: t.text, scadenza: t.dueDate, completato: t.completed })),
                note_recenti: (c.notes || []).slice(-2).map(n => n.text)
            }));

            const systemPrompt = `Sei Upersite AI Assistant, l'assistente IA intelligente ufficiale di Upersite Studio. Hai accesso al Database in sola lettura. Non puoi inventare dati o informazioni, piuttosto afferma di non saperle.
            Non scrivere informazioni non richieste, per esempio se ti chiedo i task da fare non mescolare dentro anche i contenuti delle note.
            
IL TUO ALFABETO (FORMATTAZIONE):
- # Titolo Grande
- ## Titolo Medio
- ### Titolo Piccolo (nomi clienti)
- **Grassetto** (importi, date, parole chiave)
- - Lista puntata

REGOLE DI RISPOSTA:
1. Sii coinciso ma completo. Vai a capo spesso.
2. Usa il Grassetto per nomi clienti, cifre (€) e date (GG/MM/AAAA).
3. Data Corrente (se richiesta): ${new Date().toLocaleDateString('it-IT')}
 
DATABASE CONTEXT (JSON):
${JSON.stringify(dbSummary)}`;

            // Usa l'ID modello reale E l'endpoint API corretto per il modello selezionato
            const apiUrl = `https://generativelanguage.googleapis.com/${currentModel.apiVersion}/models/${currentModel.id}:generateContent?key=${GEMINI_API_KEY}`;

            // LOG visibile nei DevTools (F12 → Console) per verificare il modello chiamato
            console.log(`[Upersite AI] Calling model: ${currentModel.id} | Endpoint: ${currentModel.apiVersion} | URL: ${apiUrl.replace(GEMINI_API_KEY, '***KEY***')}`);

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        role: 'user',
                        parts: [{ text: `${systemPrompt}\n\nUSER MESSAGE: ${text}` }]
                    }]
                })
            });

            const data = await response.json();

            if (data.error) {
                const msg = data.error.message || '';
                const isQuotaError = data.error.status === 'RESOURCE_EXHAUSTED' ||
                    msg.toLowerCase().includes('quota') ||
                    msg.toLowerCase().includes('limit: 0') ||
                    msg.toLowerCase().includes('exceeded');

                // Prova a estrarre il tempo di retry dal messaggio
                const retryMatch = msg.match(/retry in ([\d.]+)s/i);
                const retrySeconds = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) : null;

                let errText;
                if (isQuotaError) {
                    const isZeroLimit = msg.includes('limit: 0');
                    if (isZeroLimit) {
                        errText = `⚠️ **Quota 0 per "${currentModel.label}"**\n\n` +
                            `Questo modello non ha quota gratuita per la tua API key.\n` +
                            `Modello chiamato: \`${currentModel.id}\` (endpoint: /${currentModel.apiVersion}/)\n\n` +
                            `**Soluzione rapida:** cambia modello → seleziona **Gemini 2.5 Flash** dal menu in cima alla chat.\n` +
                            `Per sbloccare il modello: https://ai.dev/rate-limit`;
                    } else {
                        errText = `⚠️ **Limite giornaliero raggiunto per "${currentModel.label}"** (${currentModel.rpd} RPD)\n\n` +
                            `Modello: \`${currentModel.id}\` | Endpoint: /${currentModel.apiVersion}/\n` +
                            (retrySeconds ? `Riprova tra: **${retrySeconds}s** (o domani dopo mezzanotte UTC)\n\n` : '\n') +
                            `Hai esaurito le ${currentModel.rpd} richieste giornaliere gratuite.\n` +
                            `Questo è normale se hai fatto molti test oggi — il contatore si azzera a mezzanotte UTC.`;
                    }
                } else {
                    errText = `⚠️ Errore API (${currentModel.label} / ${currentModel.id}): ${msg}`;
                }

                console.error(`[Upersite AI] API Error:`, data.error);
                const errMsgs = [...newMessages, { role: 'model', text: errText }];
                setMessages(errMsgs);
                saveCurrentSession(errMsgs, sessionId);
                return;
            }

            const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text
                || "Scusami, ho avuto un problema nel processare la richiesta. Riprova tra poco.";

            // Aggiorna contatore richieste SOLO dopo risposta positiva
            const today = new Date().toISOString().slice(0, 10);
            const newStats = {
                date: today,
                count: (aiUsageStats.date === today ? aiUsageStats.count : 0) + 1
            };
            if (onUpdateAiUsageStats) onUpdateAiUsageStats(newStats);

            const finalMsgs = [...newMessages, { role: 'model', text: aiText }];
            setMessages(finalMsgs);
            saveCurrentSession(finalMsgs, sessionId);
        } catch (error) {
            console.error("Gemini Fetch Error:", error);
            const errMsgs = [...newMessages, { role: 'model', text: "⚠️ Errore di connessione con Gemini. Controlla la tua chiave API o la connessione internet." }];
            setMessages(errMsgs);
            saveCurrentSession(errMsgs, sessionId);
        } finally {
            setIsLoading(false);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    };

    const startNewChat = () => {
        saveCurrentSession(messages, currentSessionId);
        setMessages([WELCOME_MESSAGE]);
        setCurrentSessionId(null);
        setShowHistory(false);
    };

    const loadSession = (session) => {
        saveCurrentSession(messages, currentSessionId);
        setMessages(session.messages);
        setCurrentSessionId(session.id);
        setShowHistory(false);
    };

    const deleteSession = (id, e) => {
        e.stopPropagation();
        if (confirmDeleteId === id) {
            const updated = chatHistory.filter(s => s.id !== id);
            if (onUpdateChatHistory) onUpdateChatHistory(updated);
            if (id === currentSessionId) {
                setMessages([WELCOME_MESSAGE]);
                setCurrentSessionId(null);
            }
            setConfirmDeleteId(null);
        } else {
            setConfirmDeleteId(id);
        }
    };

    const today = new Date().toISOString().slice(0, 10);
    const usageCount = aiUsageStats.date === today ? aiUsageStats.count : 0;
    const usagePercent = Math.min((usageCount / currentModel.rpd) * 100, 100);
    const usageColor = usagePercent > 90 ? 'var(--danger)' : usagePercent > 60 ? 'var(--warning)' : 'var(--primary)';

    return (
        <div className="gemini-chat-root">
            {/* FAB */}
            <button
                className={`gemini-fab ${isOpen ? 'active' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
                title="Assistente AI"
            >
                {isOpen ? '✕' : '✨'}
            </button>

            {/* CHAT WINDOW */}
            <div className={`gemini-window ${isOpen ? 'open' : ''}`}>

                {/* HEADER */}
                <div className="gemini-header">
                    <div className="gemini-header-info">
                        <span className="gemini-avatar">🪄</span>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 800, fontSize: '0.88rem' }}>Upersite AI</div>

                            {/* Model selector button */}
                            <div style={{ position: 'relative' }}>
                                <button
                                    className="gemini-model-btn"
                                    onClick={() => setShowModelMenu(!showModelMenu)}
                                    title="Cambia modello AI"
                                >
                                    {currentModel.label}
                                    <span className="gemini-model-badge">{currentModel.badge}</span>
                                    <span style={{ fontSize: '0.55rem', opacity: 0.6, marginLeft: '2px' }}>▾</span>
                                </button>

                                {/* Model dropdown */}
                                {showModelMenu && (
                                    <div className="gemini-model-menu">
                                        {AI_MODELS.map(m => (
                                            <button
                                                key={m.id}
                                                className={`gemini-model-option ${m.id === selectedModelId ? 'selected' : ''}`}
                                                onClick={() => handleModelChange(m.id)}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontWeight: 700, fontSize: '0.78rem' }}>{m.label}</span>
                                                    <span className="gemini-model-badge">{m.badge}</span>
                                                </div>

                                                <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>{m.description}</div>
                                                {m.id === selectedModelId && <span className="gemini-model-check">✓</span>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Usage bar */}
                            <div className="gemini-usage-bar-wrap">
                                <div className="gemini-usage-bar" style={{ width: `${usagePercent}%`, background: usageColor }} />
                            </div>
                            <div style={{ fontSize: '0.58rem', color: 'var(--text-tertiary)', marginTop: '1px' }}>
                                {usageCount} / {currentModel.rpd} richieste oggi
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                        <button
                            className="gemini-icon-btn"
                            onClick={() => { setShowHistory(!showHistory); setShowModelMenu(false); setShowSettings(false); }}
                            title="Cronologia Chat"
                            style={{
                                background: showHistory ? 'var(--primary)' : 'var(--primary-ghost)',
                                color: showHistory ? 'white' : 'var(--primary)'
                            }}
                        >
                            🕐
                        </button>
                        <button
                            className="gemini-icon-btn"
                            onClick={() => { setShowSettings(!showSettings); setShowModelMenu(false); setShowHistory(false); }}
                            title="Impostazioni e Limiti"
                            style={{
                                background: showSettings ? 'var(--primary)' : 'var(--primary-ghost)',
                                color: showSettings ? 'white' : 'var(--primary)'
                            }}
                        >
                            ⚙️
                        </button>
                        <button
                            className="gemini-icon-btn"
                            onClick={startNewChat}
                            title="Nuova Chat"
                        >
                            ✏️
                        </button>
                        <button className="gemini-close" onClick={() => setIsOpen(false)}>⇣</button>
                    </div>
                </div>

                {/* BODY */}
                <div className="gemini-body" onClick={() => { if (showModelMenu) setShowModelMenu(false); if (showSettings) setShowSettings(false); }}>
                    {/* HISTORY PANEL */}
                    <div className={`gemini-history-panel ${showHistory ? 'visible' : ''}`}>
                        <div className="gemini-history-title">💬 Sessioni precedenti</div>
                        {chatHistory.length === 0 ? (
                            <div className="gemini-history-empty">Nessuna chat salvata</div>
                        ) : (
                            <div className="gemini-history-list">
                                {chatHistory.map(session => (
                                    <div
                                        key={session.id}
                                        className={`gemini-history-item ${session.id === currentSessionId ? 'active' : ''}`}
                                        onClick={() => loadSession(session)}
                                    >
                                        <div className="gemini-history-item-title">{session.title}</div>
                                        <div className="gemini-history-item-date">
                                            {formatChatTitle(session.updatedAt || session.createdAt)}
                                        </div>
                                        <button
                                            className={`gemini-history-delete ${confirmDeleteId === session.id ? 'confirm' : ''}`}
                                            onClick={(e) => deleteSession(session.id, e)}
                                            title={confirmDeleteId === session.id ? 'Clicca ancora per confermare' : 'Elimina sessione'}
                                        >
                                            {confirmDeleteId === session.id ? '⚠️' : '🗑️'}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* SETTINGS PANEL */}
                    <div className={`gemini-history-panel ${showSettings ? 'visible' : ''}`} style={{ right: '0', left: 'auto' }}>
                        <div className="gemini-history-title">⚙️ Impostazioni e Limiti</div>
                        
                        <div style={{ padding: '16px', fontSize: '0.78rem' }}>
                            <div style={{ marginBottom: '16px' }}>
                                <h4 style={{ margin: '0 0 8px 0', fontSize: '0.85rem', fontWeight: '700' }}>Modello Attuale</h4>
                                <div style={{ background: 'var(--bg-hover)', padding: '8px 12px', borderRadius: '8px' }}>
                                    <div style={{ fontWeight: '600' }}>{currentModel.label}</div>
                                    <div style={{ color: 'var(--text-tertiary)', fontSize: '0.7rem' }}>
                                        Limite: {currentModel.badge} • Endpoint: /{currentModel.apiVersion}/
                                    </div>
                                </div>
                            </div>

                            <div style={{ marginBottom: '16px' }}>
                                <h4 style={{ margin: '0 0 8px 0', fontSize: '0.85rem', fontWeight: '700' }}>Utilizzo Oggi</h4>
                                <div style={{ background: 'var(--bg-hover)', padding: '8px 12px', borderRadius: '8px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <span>Richieste:</span>
                                        <span style={{ fontWeight: '600' }}>{usageCount} / {currentModel.rpd}</span>
                                    </div>
                                    <div className="gemini-usage-bar-wrap" style={{ width: '100%', height: '4px' }}>
                                        <div className="gemini-usage-bar" style={{ width: `${usagePercent}%`, background: usageColor }} />
                                    </div>
                                </div>
                            </div>

                            <div style={{ marginBottom: '16px' }}>
                                <h4 style={{ margin: '0 0 8px 0', fontSize: '0.85rem', fontWeight: '700' }}>Limiti Google AI</h4>
                                <a 
                                    href="https://aistudio.google.com/rate-limit?timeRange=last-hour&project=gen-lang-client-0332897590"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        display: 'block',
                                        background: 'var(--primary-ghost)',
                                        color: 'var(--primary)',
                                        padding: '10px 12px',
                                        borderRadius: '8px',
                                        textDecoration: 'none',
                                        fontSize: '0.75rem',
                                        fontWeight: '600',
                                        textAlign: 'center',
                                        transition: 'background 0.2s, color 0.2s'
                                    }}
                                    onMouseOver={(e) => {
                                        e.target.style.background = 'var(--primary)';
                                        e.target.style.color = 'white';
                                    }}
                                    onMouseOut={(e) => {
                                        e.target.style.background = 'var(--primary-ghost)';
                                        e.target.style.color = 'var(--primary)';
                                    }}
                                >
                                    📊 Apri Dashboard Limiti AI Studio
                                </a>
                            </div>

                            <div>
                                <h4 style={{ margin: '0 0 8px 0', fontSize: '0.85rem', fontWeight: '700' }}>Info Limiti</h4>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', lineHeight: '1.4' }}>
                                    • <strong>RPD</strong>: Richieste per giorno<br/>
                                    • <strong>TPM</strong>: Token per minuto<br/>
                                    • I limiti si resettano a mezzanotte UTC<br/>
                                    • Controlla il dashboard per limiti reali
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* MESSAGES */}
                    <div className="gemini-messages" ref={scrollRef}>
                        {messages.map((m, i) => (
                            <div key={i} className={`msg-bubble ${m.role}`}>
                                <div className="msg-text">{formatText(m.text)}</div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="msg-bubble model typing">
                                <span className="dot" />
                                <span className="dot" />
                                <span className="dot" />
                            </div>
                        )}
                    </div>
                </div>

                {/* INPUT */}
                <form className="gemini-input-area" onSubmit={handleSend}>
                    <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder={`Chiedimi qualcosa... (${currentModel.label})`}
                        disabled={isLoading}
                    />
                    <button type="submit" disabled={isLoading || !inputValue.trim()}>
                        {isLoading ? '⌛' : '➤'}
                    </button>
                </form>
            </div>

            <style>{`
                .gemini-chat-root {
                    position: fixed; bottom: 30px; right: 30px; z-index: 9999;
                    font-family: var(--font);
                }

                /* FAB */
                .gemini-fab {
                    width: 60px; height: 60px; border-radius: 50%; background: var(--primary);
                    color: white; border: none; font-size: 1.8rem; cursor: pointer;
                    box-shadow: 0 10px 40px rgba(108,92,231,0.4);
                    display: flex; align-items: center; justify-content: center;
                    transition: all 0.4s cubic-bezier(0.175,0.885,0.32,1.275);
                }
                .gemini-fab:hover { transform: scale(1.1) rotate(5deg); box-shadow: 0 15px 50px rgba(108,92,231,0.6); }
                .gemini-fab.active { background: var(--danger); transform: rotate(90deg); }

                /* Window */
                .gemini-window {
                    position: absolute; bottom: 80px; right: 0; width: 490px; height: 650px;
                    background: rgba(255,255,255,0.95); backdrop-filter: blur(30px);
                    border-radius: 28px; border: 1px solid rgba(255,255,255,0.3);
                    box-shadow: 0 30px 100px rgba(0,0,0,0.22);
                    display: flex; flex-direction: column; overflow: hidden;
                    pointer-events: none; opacity: 0; transform: translateY(30px) scale(0.9);
                    transition: all 0.4s cubic-bezier(0.16,1,0.3,1);
                }
                .gemini-window.open { pointer-events: auto; opacity: 1; transform: translateY(0) scale(1); }

                /* Header */
                .gemini-header {
                    padding: 14px 18px; background: rgba(255,255,255,0.05);
                    border-bottom: 1px solid rgba(0,0,0,0.06);
                    display: flex; justify-content: space-between; align-items: flex-start;
                    flex-shrink: 0; gap: 8px;
                }
                .gemini-header-info { display: flex; align-items: flex-start; gap: 11px; flex: 1; min-width: 0; }
                .gemini-avatar {
                    width: 42px; height: 42px; background: var(--primary-ghost);
                    border-radius: 12px; display: flex; align-items: center;
                    justify-content: center; font-size: 1.3rem; flex-shrink: 0;
                }

                /* Model selector */
                .gemini-model-btn {
                    display: flex; align-items: center; gap: 4px; background: none;
                    border: none; padding: 1px 0; cursor: pointer; font-family: var(--font);
                    font-size: 0.65rem; color: var(--text-secondary); font-weight: 600;
                    margin-top: 1px; transition: color 0.2s;
                }
                .gemini-model-btn:hover { color: var(--primary); }
                .gemini-model-badge {
                    background: var(--primary-ghost); color: var(--primary);
                    font-size: 0.55rem; font-weight: 800; padding: 1px 5px;
                    border-radius: 6px; letter-spacing: 0.5px;
                }
                .gemini-model-menu {
                    position: absolute; top: calc(100% + 4px); left: 0; z-index: 200;
                    background: #fff; border: 1px solid var(--border-light);
                    border-radius: 14px; box-shadow: 0 10px 30px rgba(0,0,0,0.15);
                    min-width: 220px; overflow: hidden; animation: fadeInScale 0.15s ease;
                }
                @keyframes fadeInScale { from { opacity:0; transform: scale(0.96) translateY(-4px); } to { opacity:1; transform: none; } }
                .gemini-model-option {
                    width: 100%; padding: 11px 14px; border: none; background: none;
                    cursor: pointer; text-align: left; font-family: var(--font);
                    transition: background 0.15s; position: relative;
                    border-bottom: 1px solid var(--border-light);
                }
                .gemini-model-option:last-child { border-bottom: none; }
                .gemini-model-option:hover { background: var(--bg-hover); }
                .gemini-model-option.selected { background: var(--primary-ghost); }
                .gemini-model-check {
                    position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
                    color: var(--primary); font-weight: 900; font-size: 0.85rem;
                }

                /* Usage bar */
                .gemini-usage-bar-wrap {
                    width: 130px; height: 3px; background: var(--bg-hover);
                    border-radius: 4px; overflow: hidden; margin-top: 5px;
                }
                .gemini-usage-bar { height: 100%; border-radius: 4px; transition: width 0.4s ease, background 0.4s ease; }

                /* Icon buttons */
                .gemini-icon-btn {
                    background: var(--primary-ghost); border: none;
                    width: 32px; height: 32px; border-radius: 10px; color: var(--primary);
                    cursor: pointer; display: flex; align-items: center; justify-content: center;
                    font-size: 0.9rem; transition: 0.2s;
                }
                .gemini-icon-btn:hover { transform: scale(1.1); }
                .gemini-close {
                    background: none; border: none; font-size: 1.2rem; cursor: pointer;
                    color: var(--text-tertiary); width: 32px; height: 32px;
                    display: flex; align-items: center; justify-content: center;
                    border-radius: 8px; transition: 0.2s;
                }
                .gemini-close:hover { background: var(--bg-hover); }

                /* Body layout */
                .gemini-body { flex: 1; display: flex; overflow: hidden; position: relative; }

                /* Settings panel - stile più largo come SettingsModal del CRM */
                .gemini-history-panel {
                    position: absolute; top: 0; bottom: 0; width: 320px;
                    background: #fff; border: 1px solid var(--border-light);
                    display: flex; flex-direction: column; z-index: 10;
                    transition: transform 0.3s cubic-bezier(0.16,1,0.3,1);
                    box-shadow: 4px 0 20px rgba(0,0,0,0.06);
                }
                .gemini-history-panel.visible { transform: translateX(0); }
                .gemini-history-panel:not(.visible) { transform: translateX(-100%); }
                .gemini-history-panel.visible[style*="right: 0"] { transform: translateX(0); }
                .gemini-history-panel[style*="right: 0"]:not(.visible) { transform: translateX(100%); }
                .gemini-history-title {
                    padding: 14px 16px; font-size: 0.72rem; font-weight: 800;
                    color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 1px;
                    border-bottom: 1px solid var(--border-light); flex-shrink: 0;
                }
                .gemini-history-empty {
                    padding: 24px 16px; text-align: center; color: var(--text-tertiary); font-size: 0.78rem;
                }
                .gemini-history-list { flex: 1; overflow-y: auto; padding: 8px; }
                .gemini-history-item {
                    padding: 10px 12px; border-radius: 12px; cursor: pointer;
                    transition: 0.2s; position: relative; margin-bottom: 4px;
                    border: 1px solid transparent;
                }
                .gemini-history-item:hover { background: var(--bg-hover); }
                .gemini-history-item.active { background: var(--primary-ghost); border-color: rgba(108,92,231,0.2); }
                .gemini-history-item-title {
                    font-size: 0.78rem; font-weight: 600; color: var(--text-primary);
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 24px;
                }
                .gemini-history-item-date { font-size: 0.63rem; color: var(--text-tertiary); margin-top: 3px; }
                .gemini-history-delete {
                    position: absolute; top: 8px; right: 8px; background: none; border: none;
                    cursor: pointer; font-size: 0.75rem; opacity: 0; transition: 0.2s;
                    padding: 2px; border-radius: 6px;
                }
                .gemini-history-item:hover .gemini-history-delete { opacity: 0.6; }
                .gemini-history-delete:hover { opacity: 1 !important; }
                .gemini-history-delete.confirm { opacity: 1 !important; animation: pulse 0.4s ease; }
                @keyframes pulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.3); } }

                /* Messages */
                .gemini-messages {
                    flex: 1; overflow-y: auto; padding: 18px 18px 10px;
                    display: flex; flex-direction: column; gap: 13px; scroll-behavior: smooth;
                }
                .msg-bubble {
                    max-width: 85%; padding: 11px 16px; border-radius: 18px;
                    font-size: 0.84rem; line-height: 1.55;
                }
                .msg-bubble.user {
                    align-self: flex-end; background: var(--primary); color: white;
                    border-bottom-right-radius: 4px;
                }
                .msg-bubble.model {
                    align-self: flex-start; background: #fff; color: var(--text-primary);
                    border-bottom-left-radius: 4px; border: 1px solid var(--border-light);
                    box-shadow: 0 2px 8px rgba(0,0,0,0.04);
                }
                .msg-bubble.model.typing { display: flex; gap: 4px; align-items: center; padding: 12px 16px; }

                .dot {
                    width: 7px; height: 7px; background: var(--text-tertiary); border-radius: 50%;
                    opacity: 0.4; animation: blink 1.4s infinite;
                }
                .dot:nth-child(2) { animation-delay: 0.2s; }
                .dot:nth-child(3) { animation-delay: 0.4s; }
                @keyframes blink { 0%,100% { opacity:0.4; } 50% { opacity:1; } }

                /* Input area */
                .gemini-input-area {
                    padding: 13px 16px; display: flex; gap: 9px;
                    background: #fff; border-top: 1px solid var(--border-light); flex-shrink: 0;
                }
                .gemini-input-area input {
                    flex: 1; border: none; background: var(--bg-hover);
                    padding: 10px 15px; border-radius: 13px; font-size: 0.84rem;
                    outline: none; font-family: var(--font); transition: 0.2s;
                }
                .gemini-input-area input:focus {
                    background: var(--bg-input);
                    box-shadow: 0 0 0 2px rgba(108,92,231,0.15);
                }
                .gemini-input-area button {
                    width: 42px; height: 42px; border-radius: 12px; border: none;
                    background: var(--primary); color: white; cursor: pointer;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 1rem; transition: 0.2s; flex-shrink: 0;
                }
                .gemini-input-area button:disabled {
                    opacity: 0.4; background: var(--text-tertiary); cursor: default;
                }
                .gemini-input-area button:not(:disabled):hover {
                    transform: scale(1.08); filter: brightness(1.1);
                }
            `}</style>
        </div>
    );
}
