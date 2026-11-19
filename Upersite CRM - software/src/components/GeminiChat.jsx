import React, { useState, useRef, useEffect, useCallback } from 'react';
import { generateText, normalizeAISettings, applyAISettings, describeChoice, findProvider, findGeminiModel } from '../utils/aiClient';
import AIModelPicker from './AIModelPicker';
import { buildCrmContext } from '../utils/chatContext';
import { sanitizeHtml } from '../utils/sanitizeHtml';

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

// Il testo dell'AI è formattato in HTML minimo: va sempre sanificato prima di mostrarlo
function formatText(text) {
    if (!text) return '';
    let formatted = text
        .replace(/### (.*?)(\n|$)/g, '<h3>$1</h3>')
        .replace(/## (.*?)(\n|$)/g, '<h2>$1</h2>')
        .replace(/# (.*?)(\n|$)/g, '<h1>$1</h1>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        // Rimuovo supporto per *testo* per evitare conflitti con elenchi
        .replace(/^- (.*?)$/gm, '<li>$1</li>')
        .replace(/^\* (.*?)$/gm, '<li>$1</li>')
        .replace(/^\d+\. (.*?)$/gm, '<li>$1</li>');

    const safe = (html) => ({ __html: sanitizeHtml(html) });

    return formatted.split('\n').map((line, idx) => {
        if (line.includes('<li>')) return <ul key={idx} style={{ margin: 0, paddingLeft: '20px' }} dangerouslySetInnerHTML={safe(line)} />;
        if (line.includes('<h')) return <div key={idx} dangerouslySetInnerHTML={safe(line)} />;
        return (
            <span key={idx}>
                <span dangerouslySetInnerHTML={safe(line)} />
                <br />
            </span>
        );
    });
}

export default function GeminiChat({
    customers,
    events = [],
    userProfile,
    chatHistory = [],
    aiUsageStats = { date: '', count: 0 },
    onUpdateChatHistory,
    onUpdateAiUsageStats,
    settings = {},
    updateSettings
}) {
    const [showModelMenu, setShowModelMenu] = useState(false);

    const [isOpen, setIsOpen] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [currentSessionId, setCurrentSessionId] = useState(null);
    const [messages, setMessages] = useState([WELCOME_MESSAGE]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [confirmDeleteId, setConfirmDeleteId] = useState(null);
    const scrollRef = useRef(null);
    const inputRef = useRef(null);

    // IA della chat: scelta nelle Impostazioni → Intelligenza artificiale (o dal menu in alto)
    const chatChoice = normalizeAISettings(settings).purposes.chat;
    const chatProvider = findProvider(chatChoice.provider);
    const chatLabel = describeChoice(chatChoice);
    // Solo Gemini ha limiti giornalieri gratuiti (rpd): per gli altri servizi niente barra di utilizzo
    const geminiModel = chatChoice.provider === 'gemini' ? findGeminiModel(chatChoice.model) : null;

    const handleChatChoiceChange = (choice) => {
        if (!updateSettings) return;
        const ai = normalizeAISettings(settings);
        updateSettings({ ai: applyAISettings({ ...ai, purposes: { ...ai.purposes, chat: choice } }) });
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

    // Richiesta in corso: serve per il pulsante "Ferma" e per annullarla se la chat viene chiusa/smontata
    const abortRef = useRef(null);
    const stopGeneration = () => abortRef.current?.abort();
    useEffect(() => () => abortRef.current?.abort(), []);

    // Messaggio da mostrare in chat per un errore del servizio AI
    const errorMessage = (error) => {
        if (error?.code === 'aborted') return '⏹ Richiesta interrotta.';

        // Messaggi dettagliati sui limiti giornalieri gratuiti: esistono solo per Gemini
        if (error?.code === 'quota' && geminiModel) {
            if (error.zeroQuota) {
                return `⚠️ **Quota 0 per "${geminiModel.label}"**\n\n` +
                    `Questo modello non ha quota gratuita per la tua API key.\n` +
                    `Modello chiamato: \`${geminiModel.id}\` (endpoint: /${geminiModel.apiVersion}/)\n\n` +
                    `**Soluzione rapida:** cambia modello dal menu in cima alla chat (es. **Gemini 2.5 Flash** o un modello locale).\n` +
                    `Per sbloccare il modello: https://ai.dev/rate-limit`;
            }
            return `⚠️ **Limite giornaliero raggiunto per "${geminiModel.label}"** (${geminiModel.rpd} RPD)\n\n` +
                `Modello: \`${geminiModel.id}\` | Endpoint: /${geminiModel.apiVersion}/\n` +
                (error.retryAfterSeconds ? `Riprova tra: **${error.retryAfterSeconds}s** (o domani dopo mezzanotte UTC)\n\n` : '\n') +
                `Hai esaurito le ${geminiModel.rpd} richieste giornaliere gratuite.\n` +
                `Questo è normale se hai fatto molti test oggi — il contatore si azzera a mezzanotte UTC.`;
        }

        if (error?.code === 'http') {
            return `⚠️ Errore API (${chatLabel}): ${error.message}`;
        }
        return `⚠️ ${error?.message || 'Errore imprevisto del servizio AI.'}`;
    };

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

        const controller = new AbortController();
        abortRef.current = controller;

        const finish = (msgs) => {
            setMessages(msgs);
            saveCurrentSession(msgs, sessionId);
        };

        try {
            // Dati del CRM scelti in Impostazioni → Intelligenza artificiale → Dati inviati alla chat
            const dbSummary = buildCrmContext(customers, events, normalizeAISettings(settings).chatData);

            const systemPrompt = `Sei Upersite AI Assistant, l'assistente IA intelligente di Upersite Studio. Hai accesso al Database in sola lettura. Non inventare dati.
            Fornisci SOLO le informazioni richieste, senza aggiungere dettagli non richiesti. Se ti chiedo i task, elenca solo i task senza includere note o altri contenuti.
            Hai accesso a: clienti, tickets, rate, links, task, note e eventi globali.

FORMATTAZIONE OBBLIGATORIA:
- # Titolo Grande
- ## Titolo Medio
- ### Titolo Piccolo (nomi clienti)
- **Grassetto** per importi (€), date (GG/MM/AAAA) e nomi clienti
- - Lista puntata (usa solo il trattino)
- **SOLO ** per il grassetto, MAI * singolo

REGOLE:
1. Sii conciso ma completo
2. Vai spesso a capo
3. Usa il grassetto per cifre, date e nomi
4. Data corrente: ${new Date().toLocaleDateString('it-IT')}
5. NON mostrare MAI il tuo ragionamento
6. NON elencare cosa stai facendo
7. Rispondi direttamente alle domande
8. MAI fare checklist o auto-verifiche

DATABASE CONTEXT:
${JSON.stringify(dbSummary)}`;

            // Ultimi 10 messaggi; la conversazione deve iniziare con un messaggio dell'utente
            // (il messaggio di benvenuto è dell'assistente e non va inviato)
            const history = newMessages.slice(-10).map(msg => ({
                role: msg.role === 'model' ? 'model' : 'user',
                text: msg.text
            }));
            while (history.length > 0 && history[0].role === 'model') history.shift();

            const result = await generateText({
                system: systemPrompt,
                messages: history,
                provider: chatChoice.provider,
                model: chatChoice.model,
                purpose: 'chat',
                signal: controller.signal
            });

            const aiText = result.truncated
                ? `${result.text}\n\n⚠️ Risposta interrotta perché troppo lunga: chiedimi di continuare.`
                : result.text;
            finish([...newMessages, { role: 'model', text: aiText }]);
        } catch (error) {
            if (error?.code !== 'aborted') console.error('[Upersite AI] Errore:', error);
            finish([...newMessages, { role: 'model', text: errorMessage(error) }]);
        } finally {
            if (abortRef.current === controller) abortRef.current = null;
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

    const copyMessage = (text, e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text).then(() => {
            // Show feedback
            const btn = e.target;
            const originalTitle = btn.title;
            btn.title = 'Copiato!';
            btn.style.background = 'rgba(76, 175, 80, 0.2)';
            btn.classList.add('copied');
            
            setTimeout(() => {
                btn.title = originalTitle;
                btn.style.background = '';
                btn.classList.remove('copied');
            }, 5000);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
        });
    };

    const today = new Date().toISOString().slice(0, 10);
    const usageCount = aiUsageStats.date === today ? aiUsageStats.count : 0;
    const usagePercent = geminiModel ? Math.min((usageCount / geminiModel.rpd) * 100, 100) : 0;
    const usageColor = usagePercent > 90 ? 'var(--danger)' : usagePercent > 60 ? 'var(--warning)' : 'var(--primary)';

    return (
        <div className={`gemini-chat-root ${isFullscreen ? 'fullscreen-active' : ''} ${isOpen ? 'chat-open' : ''}`}>
            {/* FAB */}
            <button
                className={`gemini-fab ${isOpen ? 'active' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
                title="Assistente AI"
            >
                {isOpen ? '✕' : '✨'}
            </button>

            {/* CHAT WINDOW */}
            <div className={`gemini-window ${isOpen ? 'open' : ''} ${isFullscreen ? 'fullscreen' : ''}`}>

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
                                    title={`IA della chat: ${chatLabel}. Clicca per cambiarla`}
                                >
                                    {geminiModel?.label || chatChoice.model || chatProvider?.label}
                                    <span className="gemini-model-badge">
                                        {geminiModel ? geminiModel.badge : chatProvider?.kind === 'local' ? 'locale' : 'cloud'}
                                    </span>
                                    <span style={{ fontSize: '0.55rem', opacity: 0.6, marginLeft: '2px' }}>▾</span>
                                </button>

                                {/* Scelta del servizio e del modello della chat */}
                                {showModelMenu && (
                                    <div className="gemini-model-menu" style={{ minWidth: '330px', padding: '12px' }} onClick={e => e.stopPropagation()}>
                                        <AIModelPicker value={chatChoice} onChange={handleChatChoiceChange} />
                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', marginTop: '8px' }}>
                                            {chatProvider?.kind === 'local'
                                                ? 'Servizio locale: i dati del CRM inviati alla chat restano sul PC.'
                                                : 'Servizio cloud: la chat gli invia i dati del CRM, note comprese.'}
                                            {' '}La scelta vale anche in Impostazioni → Intelligenza artificiale.
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Barra di utilizzo: solo Gemini ha un limite giornaliero gratuito */}
                            {geminiModel ? (
                                <>
                                    <div className="gemini-usage-bar-wrap">
                                        <div className="gemini-usage-bar" style={{ width: `${usagePercent}%`, background: usageColor }} />
                                    </div>
                                    <div style={{ fontSize: '0.58rem', color: 'var(--text-tertiary)', marginTop: '1px' }}>
                                        {usageCount} / {geminiModel.rpd} richieste oggi
                                    </div>
                                </>
                            ) : (
                                <div style={{ fontSize: '0.58rem', color: 'var(--text-tertiary)', marginTop: '1px' }}>
                                    {chatProvider?.label}
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                        <button
                            className="gemini-icon-btn gemini-history-btn"
                            onClick={() => { setShowHistory(!showHistory); setShowModelMenu(false); setShowSettings(false); }}
                            title="Cronologia Chat"
                            style={{
                                background: showHistory ? 'var(--primary)' : 'var(--primary-ghost)',
                                color: showHistory ? 'white' : 'var(--primary)'
                            }}
                        />
                        <button
                            className="gemini-icon-btn gemini-settings-btn"
                            onClick={() => { setShowSettings(!showSettings); setShowModelMenu(false); setShowHistory(false); }}
                            title="Impostazioni e Limiti"
                            style={{
                                background: showSettings ? 'var(--primary)' : 'var(--primary-ghost)',
                                color: showSettings ? 'white' : 'var(--primary)'
                            }}
                        />
                        <button
                            className="gemini-icon-btn gemini-newchat-btn"
                            onClick={startNewChat}
                            title="Nuova Chat"
                        />
                        <button
                            className={`gemini-icon-btn gemini-fullscreen-btn ${isFullscreen ? 'active' : ''}`}
                            onClick={() => setIsFullscreen(!isFullscreen)}
                            title={isFullscreen ? "Riduci chat" : "Espandi a schermo intero"}
                            style={{
                                background: isFullscreen ? 'var(--primary)' : 'var(--primary-ghost)',
                                color: isFullscreen ? 'white' : 'var(--primary)'
                            }}
                        />
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
                                    <div style={{ fontWeight: '600' }}>{chatLabel}</div>
                                    <div style={{ color: 'var(--text-tertiary)', fontSize: '0.7rem' }}>
                                        {geminiModel
                                            ? `Limite: ${geminiModel.badge} • Endpoint: /${geminiModel.apiVersion}/`
                                            : chatProvider?.kind === 'local'
                                                ? 'Servizio locale: nessun limite giornaliero, i dati restano sul PC'
                                                : 'Servizio cloud: i limiti dipendono dal tuo piano'}
                                    </div>
                                </div>
                            </div>

                            {geminiModel && (<>
                            <div style={{ marginBottom: '16px' }}>
                                <h4 style={{ margin: '0 0 8px 0', fontSize: '0.85rem', fontWeight: '700' }}>Utilizzo Oggi</h4>
                                <div style={{ background: 'var(--bg-hover)', padding: '8px 12px', borderRadius: '8px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <span>Richieste:</span>
                                        <span style={{ fontWeight: '600' }}>{usageCount} / {geminiModel.rpd}</span>
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
                            </>)}
                        </div>
                    </div>

                    {/* MESSAGES */}
                    <div className="gemini-messages" ref={scrollRef}>
                        {messages.map((m, i) => (
                            <div key={i} className={`msg-bubble ${m.role}`}>
                                <div className="msg-text">{formatText(m.text)}</div>
                                {m.role === 'model' && (
                                    <button 
                                        className="msg-copy-btn"
                                        onClick={(e) => copyMessage(m.text, e)}
                                        title="Copia messaggio"
                                    />
                                )}
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
                        placeholder={`Chiedimi qualcosa... (${geminiModel?.label || chatChoice.model || chatProvider?.label})`}
                        disabled={isLoading}
                    />
                    {isLoading ? (
                        <button type="button" onClick={stopGeneration} title="Interrompi la risposta" aria-label="Interrompi la risposta">■</button>
                    ) : (
                        <button type="submit" disabled={!inputValue.trim()} title="Invia" aria-label="Invia">➤</button>
                    )}
                </form>
            </div>

            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&icon_names=settings');
                
                .gemini-chat-root {
                    position: fixed; bottom: 30px; right: 30px; z-index: 9999;
                    font-family: var(--font);
                }
                /* Chat chiusa: il pulsante resta sotto le finestre aperte (z-index 1000), così non copre i loro pulsanti */
                .gemini-chat-root:not(.chat-open):not(.fullscreen-active) { z-index: 950; }
                .gemini-window {
                    z-index: 9998;
                }
                .gemini-window.fullscreen {
                    z-index: 9999;
                }

                /* FAB */
                .gemini-fab {
                    width: 54px; height: 54px; border-radius: 50%; background: var(--primary);
                    color: white; border: none; font-size: 1.5rem; cursor: pointer;
                    box-shadow: 0 4px 14px rgba(23, 32, 28, 0.25);
                    display: flex; align-items: center; justify-content: center;
                    transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
                }
                .gemini-fab:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(23, 32, 28, 0.3); }
                .gemini-fab.active { background: var(--text-primary); }

                /* Telefono: pulsante più piccolo, sopra la barra dei pulsanti; finestra larga quanto lo schermo */
                @media (max-width: 768px) {
                    .gemini-chat-root { bottom: 72px; right: 12px; }
                    .gemini-fab { width: 46px; height: 46px; font-size: 1.25rem; }
                    .gemini-window { width: calc(100vw - 24px); height: min(600px, calc(100vh - 150px)); bottom: 58px; }
                }

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
                
                /* Backdrop overlay per fullscreen - sotto il chatbot */
                .gemini-chat-root::before {
                    content: '';
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.15);
                    backdrop-filter: blur(2px);
                    z-index: 9997;
                    opacity: 0;
                    pointer-events: none;
                    transition: opacity 0.3s ease;
                }
                .gemini-chat-root.fullscreen-active::before {
                    opacity: 1;
                    pointer-events: auto;
                }
                .gemini-window.open { pointer-events: auto; opacity: 1; transform: translateY(0) scale(1); }
                
                /* Fullscreen mode */
                .gemini-window.fullscreen {
                    position: fixed;
                    width: 490px;
                    height: 650px;
                    bottom: 80px;
                    right: 0;
                    top: auto;
                    left: auto;
                    border-radius: 28px;
                    transition: all 0.6s cubic-bezier(0.16,1,0.3,1);
                    backdrop-filter: blur(20px);
                    background: rgba(255,255,255,0.98);
                    transform: scale(0.8);
                    opacity: 0;
                }
                .gemini-window.fullscreen.open {
                    width: calc(100vw - 40px);
                    height: calc(100vh - 40px);
                    top: 20px;
                    left: 20px;
                    bottom: auto;
                    right: auto;
                    border-radius: 20px;
                    transform: scale(1);
                    opacity: 1;
                }
                .gemini-window.fullscreen .gemini-messages {
                    padding: 24px 24px 16px;
                }
                .gemini-window.fullscreen .gemini-input-area input {
                    font-size: 0.95rem;
                    padding: 14px 18px;
                }
                .gemini-window.fullscreen .msg-bubble {
                    max-width: 90%;
                    font-size: 0.92rem;
                    padding: 14px 18px;
                }

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
                    font-size: 0.9rem; transition: 0.2s; position: relative;
                }
                .gemini-icon-btn:hover { transform: scale(1.1); }
                
                /* History icon (clock) */
                .gemini-history-btn::before {
                    content: ''; position: absolute; width: 14px; height: 14px; border: 2px solid currentColor;
                    border-radius: 50%; top: 50%; left: 50%; transform: translate(-50%, -50%);
                }
                .gemini-history-btn::after {
                    content: ''; position: absolute; width: 1px; height: 4px; background: currentColor;
                    top: 50%; left: 50%; transform: translate(-50%, -50%) translateY(-2px);
                }
                
                /* Settings icon (Material Symbols) */
                .gemini-settings-btn::before {
                    content: 'settings';
                    font-family: 'Material Symbols Outlined';
                    font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
                    font-size: 18px;
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                }
                
                /* New chat icon (plus) */
                .gemini-newchat-btn::before {
                    content: ''; position: absolute; width: 14px; height: 2px; background: currentColor;
                    top: 50%; left: 50%; transform: translate(-50%, -50%);
                }
                .gemini-newchat-btn::after {
                    content: ''; position: absolute; width: 2px; height: 14px; background: currentColor;
                    top: 50%; left: 50%; transform: translate(-50%, -50%);
                }
                
                /* Fullscreen icon (SVG) */
                .gemini-fullscreen-btn::before {
                    content: '';
                    position: absolute;
                    top: 50%; left: 50%;
                    transform: translate(-50%, -50%);
                    width: 16px; height: 16px;
                    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Cpath d='M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3'/%3E%3C/svg%3E");
                    background-size: contain;
                    background-repeat: no-repeat;
                    background-position: center;
                }
                .gemini-fullscreen-btn.active::before {
                    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Cpath d='M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7'/%3E%3C/svg%3E");
                }

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
                .gemini-history-item.active { background: var(--primary-ghost); border-color: rgba(31, 107, 79,0.2); }
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
                    position: relative;
                }
                .msg-bubble.model.typing { display: flex; gap: 4px; align-items: center; padding: 12px 16px; }

                .msg-copy-btn {
                    position: absolute; bottom: 6px; right: 6px; background: rgba(0,0,0,0.05);
                    border: none; cursor: pointer; font-size: 0.6rem; opacity: 0.6;
                    padding: 4px 6px; border-radius: 6px; transition: all 0.2s;
                    z-index: 1; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;
                }
                .msg-copy-btn:hover { opacity: 1 !important; background: rgba(0,0,0,0.1); transform: scale(1.1); }
                
                /* Copy icon (default state) */
                .msg-copy-btn::before {
                    content: ''; position: absolute; width: 8px; height: 10px; border: 1.5px solid #666; border-radius: 2px;
                    top: 3px; left: 4px; transition: all 0.2s;
                }
                .msg-copy-btn::after {
                    content: ''; position: absolute; width: 8px; height: 10px; border: 1.5px solid #666; border-radius: 2px;
                    top: 6px; left: 7px; background: rgba(0,0,0,0.05); transition: all 0.2s;
                }
                
                /* Checkmark state (when copied) */
                .msg-copy-btn.copied::before,
                .msg-copy-btn.copied::after {
                    display: none;
                }
                .msg-copy-btn.copied::after {
                    display: block; content: '✓'; 
                    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                    color: #4CAF50; font-size: 12px; font-weight: bold;
                    width: auto; height: auto; background: none; border: none;
                }

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
                    box-shadow: 0 0 0 2px rgba(31, 107, 79,0.15);
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
