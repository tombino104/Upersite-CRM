import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { generateId, uploadQuote } from '../utils/storage';
import { cleanListinoOverrides, CALC_PACKAGE_NAMES } from '../utils/calcListino';

// Calcolatore prezzi dentro il CRM: la pagina public/calcolatore (copia del calcolatore originale)
// gira in un iframe sullo stesso origin e chiama window.UpersiteCalcHost per listino, impostazioni
// e "Aggiungi al cliente". L'iframe resta montato quando chiudi, così il lavoro in corso non si perde.

const money = (n) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Evento per le schede cliente aperte: il form locale riceve i dati salvati da fuori (vedi CustomerDetail)
export const CUSTOMER_EXTERNAL_UPDATE = 'crm-customer-external-update';

function notifyCustomerUpdate(id, updates) {
    window.dispatchEvent(new CustomEvent(CUSTOMER_EXTERNAL_UPDATE, { detail: { id, updates } }));
}

export default function CalculatorModal({ open, onClose, customers, settings, updateSettings, updateCustomer, onOpenSettings, onOpenCustomer, request, onRequestDone, settingsOpen }) {
    const [mounted, setMounted] = useState(false);
    const iframeRef = useRef(null);
    const [attach, setAttach] = useState(null); // payload ricevuto dal calcolatore
    const [closeAsk, setCloseAsk] = useState(null); // { unsaved } mentre si chiede conferma di chiusura
    const apiRef = useRef(null);
    const pendingStateRef = useRef(null); // configurazione da riaprire dopo un ricaricamento

    const settingsRef = useRef(settings);
    useLayoutEffect(() => { settingsRef.current = settings; }, [settings]);
    const pendingCalcRef = useRef(null);
    const calcTimerRef = useRef(null);

    // Si monta alla prima apertura e poi resta montato
    if (open && !mounted) setMounted(true);

    // Il listino (e le impostazioni importate) entrano nella pagina solo all'avvio: se cambiano la si ricarica,
    // riaprendo la configurazione su cui stavi lavorando
    const reloadKey = useMemo(
        () => JSON.stringify([cleanListinoOverrides(settings.calcListino), settings.calcEpoch || 0]),
        [settings.calcListino, settings.calcEpoch]
    );
    const loadedKeyRef = useRef(reloadKey);
    useEffect(() => {
        // Con le Impostazioni aperte sopra si aspetta la chiusura (non si ricarica a ogni prezzo modificato)
        if (!mounted || !open || settingsOpen || loadedKeyRef.current === reloadKey) return;
        loadedKeyRef.current = reloadKey;
        const payload = apiRef.current?.getPayload();
        pendingStateRef.current = payload ? { config: payload.config, name: payload.configName } : null;
        apiRef.current = null;
        iframeRef.current?.contentWindow?.location.reload();
    }, [reloadKey, mounted, open, settingsOpen]);

    // Impostazioni importate (calcEpoch): un salvataggio ancora in coda dalla pagina vecchia non deve sovrascriverle
    useEffect(() => {
        clearTimeout(calcTimerRef.current);
        pendingCalcRef.current = null;
    }, [settings.calcEpoch]);

    // Host chiamato dalla pagina del calcolatore (prima che l'iframe parta: useLayoutEffect)
    useLayoutEffect(() => {
        window.UpersiteCalcHost = {
            getListino: () => cleanListinoOverrides(settingsRef.current.calcListino),
            getCalcSettings: () => ({ ...(settingsRef.current.calc || {}), ...(pendingCalcRef.current || {}) }),
            // Salvataggio con debounce: all'avvio la pagina riscrive più volte gli stessi valori
            saveCalcSettings: (key, value) => {
                const current = { ...(settingsRef.current.calc || {}), ...(pendingCalcRef.current || {}) };
                if (JSON.stringify(current[key] ?? null) === JSON.stringify(value ?? null)) return;
                pendingCalcRef.current = { ...(pendingCalcRef.current || {}), [key]: value };
                clearTimeout(calcTimerRef.current);
                calcTimerRef.current = setTimeout(() => {
                    const next = { ...(settingsRef.current.calc || {}), ...pendingCalcRef.current };
                    pendingCalcRef.current = null;
                    updateSettings({ calc: next });
                }, 600);
            },
            attachToCustomer: (payload) => setAttach(payload),
            openSettings: () => onOpenSettings(),
            ready: (api) => {
                apiRef.current = api;
                const pending = pendingStateRef.current;
                pendingStateRef.current = null;
                if (pending?.config) api.openConfig(pending.config, pending.name);
            },
        };
        return () => {
            clearTimeout(calcTimerRef.current);
            if (pendingCalcRef.current) {
                updateSettings({ calc: { ...(settingsRef.current.calc || {}), ...pendingCalcRef.current } });
                pendingCalcRef.current = null;
            }
        };
    }, [updateSettings, onOpenSettings]);

    // Richiesta dalla scheda cliente: "Apri nel calcolatore"
    useEffect(() => {
        if (!request || !open) return;
        let cancelled = false;
        const tryOpen = () => {
            if (cancelled) return;
            if (!apiRef.current) { setTimeout(tryOpen, 150); return; }
            apiRef.current.openConfig(request.config, request.configName, request.label);
            onRequestDone();
        };
        tryOpen();
        return () => { cancelled = true; };
    }, [request, open, onRequestDone]);

    // Chiusura sempre con conferma (✕, clic fuori, Escape): il lavoro resta comunque aperto nell'iframe
    const requestClose = useCallback(() => {
        const api = apiRef.current;
        const unsaved = !!(api && api.getPayload() && !api.isSaved());
        setCloseAsk({ unsaved });
    }, []);
    const confirmClose = () => { setCloseAsk(null); onClose(); };
    const saveAndClose = async () => {
        try {
            await apiRef.current?.saveConfig();
        } finally {
            if (apiRef.current?.isSaved()) confirmClose();
            else setCloseAsk(null); // salvataggio annullato o non riuscito: si resta nel calcolatore (l'errore è lì)
        }
    };

    // Escape: annulla la conferma se aperta, altrimenti la chiede (non se sopra ci sono "Aggiungi al cliente" o le Impostazioni)
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => {
            if (e.key !== 'Escape' || attach || settingsOpen) return;
            if (closeAsk) setCloseAsk(null); else requestClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, attach, settingsOpen, closeAsk, requestClose]);

    if (!mounted) return null;

    return (
        <div
            // Con "modal-overlay" la scheda cliente aperta sotto non si chiude con Escape
            className={open ? 'calc-overlay modal-overlay' : 'calc-overlay'}
            style={{ display: open ? 'flex' : 'none' }}
            onClick={e => { if (e.target === e.currentTarget && !attach && !closeAsk) requestClose(); }}
        >
            <style>{CALC_CSS}</style>
            <div className="calc-shell">
                <div className="calc-head">
                    <div>
                        <div className="calc-kicker">Upersite CRM · Calcolatore</div>
                        <h2 className="calc-title">Preventivi</h2>
                    </div>
                    <div className="calc-head-actions">
                        <button className="calc-head-btn" title="Impostazioni (listino e cartella)" onClick={onOpenSettings}>⚙</button>
                        <button className="calc-head-btn calc-head-close" title="Chiudi (il lavoro resta aperto)" onClick={requestClose}>✕</button>
                    </div>
                </div>
                <iframe
                    ref={iframeRef}
                    title="Calcolatore preventivi"
                    src="/calcolatore/index.html"
                    className="calc-frame"
                />
            </div>
            {attach && (
                <AttachToCustomerDialog
                    payload={attach}
                    customers={customers}
                    updateCustomer={updateCustomer}
                    getApi={() => apiRef.current}
                    onOpenCustomer={c => { setAttach(null); onClose(); onOpenCustomer(c); }}
                    onClose={() => setAttach(null)}
                />
            )}
            {closeAsk && (
                <div className="calc-attach-backdrop" onClick={e => { if (e.target === e.currentTarget) setCloseAsk(null); }}>
                    <div className="calc-confirm animate-scale-in">
                        <div className="calc-confirm-icon">🧮</div>
                        <h3>Chiudere il calcolatore?</h3>
                        <p>
                            {closeAsk.unsaved
                                ? 'La configurazione non è ancora salvata nella cartella. Se chiudi resta comunque aperta qui, ma si perde se ricarichi o chiudi il CRM.'
                                : 'Quello che stai facendo resta aperto: lo ritrovi quando riapri il calcolatore.'}
                        </p>
                        <div className="calc-confirm-actions">
                            <button className="btn btn-secondary" onClick={confirmClose}>Chiudi</button>
                            {closeAsk.unsaved && <button className="btn btn-secondary" onClick={saveAndClose}>💾 Salva e chiudi</button>}
                            <button className="btn btn-primary" autoFocus onClick={() => setCloseAsk(null)}>Resta qui</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ── Aggiungi al cliente ── */

const STATUS_LABELS = { prospect: 'Prospect', working: 'In lavorazione', paused: 'Sospeso', completed: 'Completato' };
const AVATAR_COLORS = ['#1F6B4F', '#2F6FA8', '#3A9A6B', '#C24E36', '#D97706', '#E84393', '#00A8A8', '#8E7CC3'];

function normalize(s) {
    return String(s || '').trim().toLowerCase();
}

function guessCustomer(customers, clientName) {
    const name = normalize(clientName);
    if (!name) return null;
    return customers.find(c => normalize(c.name) === name || normalize(c.company) === name)
        || customers.find(c => name.includes(normalize(c.name)) && normalize(c.name).length > 2)
        || customers.find(c => normalize(c.name).includes(name) && name.length > 2)
        || null;
}

function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}

function avatarColor(name) {
    let h = 0;
    for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function CustomerAvatar({ customer }) {
    const logo = typeof customer.logo === 'string' && /^(data:image|https?:)/.test(customer.logo) ? customer.logo : null;
    return logo
        ? <img className="ca-avatar" src={logo} alt="" />
        : <span className="ca-avatar" style={{ background: avatarColor(customer.name) }}>{initials(customer.name)}</span>;
}

function Toggle({ checked, onChange, title, children }) {
    return (
        <label className={`ca-toggle ${checked ? 'on' : ''}`}>
            <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
            <span className="ca-switch" aria-hidden="true"><span /></span>
            <span className="ca-toggle-text">
                <span className="ca-toggle-title">{title}</span>
                {children && <span className="ca-toggle-sub">{children}</span>}
            </span>
        </label>
    );
}

function AttachToCustomerDialog({ payload: initialPayload, customers, updateCustomer, getApi, onOpenCustomer, onClose }) {
    const [payload, setPayload] = useState(initialPayload);
    const suggestedId = useMemo(() => guessCustomer(customers, initialPayload.quote.client)?.id || null, [customers, initialPayload]);
    const sorted = useMemo(() => {
        const list = [...customers].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'it'));
        // Il cliente suggerito (stesso nome del preventivo) in cima
        const i = list.findIndex(c => c.id === suggestedId);
        if (i > 0) list.unshift(list.splice(i, 1)[0]);
        return list;
    }, [customers, suggestedId]);
    const [customerId, setCustomerId] = useState(suggestedId || '');
    const [search, setSearch] = useState('');
    const [updateAmount, setUpdateAmount] = useState(true);
    const [saveFile, setSaveFile] = useState(initialPayload.unsaved);
    const [step, setStep] = useState('customer'); // customer → quote → done
    const [withPdf, setWithPdf] = useState(true);
    const [withDocx, setWithDocx] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [doneFiles, setDoneFiles] = useState([]);

    const customer = customers.find(c => c.id === customerId) || null;
    const totals = payload.quote.totals;
    const newAmount = round2(totals.total);
    const oldAmount = parseFloat(customer?.quoteAmount) || 0;
    const pkg = payload.config.state.package;
    const margin = payload.margin;
    const level = !margin || margin.rate == null ? '' : margin.rate >= margin.target ? 'good' : margin.rate >= margin.target * 0.8 ? 'warn' : 'bad';

    const filtered = sorted.filter(c => {
        const q = normalize(search);
        return !q || normalize(c.name).includes(q) || normalize(c.company).includes(q);
    });

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [busy, onClose]);

    const confirmAttach = async () => {
        if (!customer) return;
        setBusy(true);
        setError('');
        const api = getApi();
        try {
            let data = payload;
            if (saveFile && api) {
                await api.saveConfig();
                data = api.getPayload() || payload;
                setPayload(data);
            }
            const calcConfig = {
                attachedAt: new Date().toISOString(),
                configName: data.configName || null,
                config: data.config,
                quote: data.quote,
                hours: data.hours,
                margin: data.margin,
                quoteFileId: null,
            };
            const updates = { calcConfig };
            if (data.config.state.package) updates.packageType = data.config.state.package;
            if (updateAmount) updates.quoteAmount = String(round2(data.quote.totals.total));
            updateCustomer(customer.id, updates);
            notifyCustomerUpdate(customer.id, updates);
            setStep('quote');
        } catch (err) {
            setError(err.message || String(err));
        } finally {
            setBusy(false);
        }
    };

    const attachQuote = async () => {
        const api = getApi();
        if (!customer || !api) {
            setError('Il calcolatore non è pronto: chiudi questa finestra e riprova.');
            return;
        }
        const kinds = [withPdf && 'pdf', withDocx && 'docx'].filter(Boolean);
        if (!kinds.length) { finish([]); return; }
        setBusy(true);
        setError('');
        try {
            const added = [];
            for (const kind of kinds) {
                const f = await api.makeFile(kind);
                const storedPath = await uploadQuote(f.blob, f.name, customer.name);
                added.push({
                    id: generateId(), name: f.name, size: f.blob.size, type: f.blob.type,
                    storedPath, uploadedAt: new Date().toISOString(), isQuote: true, quoteStatus: 'pending',
                    fromCalculator: true,
                });
            }
            // Cliente aggiornato (dopo il primo passaggio): i file e la config appena salvata
            const latest = customers.find(c => c.id === customer.id) || customer;
            const files = [...(latest.files || []), ...added];
            const pdf = added.find(a => a.name.toLowerCase().endsWith('.pdf')) || added[0];
            const updates = { files, calcConfig: { ...(latest.calcConfig || {}), quoteFileId: pdf.id } };
            updateCustomer(customer.id, updates);
            notifyCustomerUpdate(customer.id, updates);
            finish(added.map(a => a.name));
        } catch (err) {
            setError(err.message || String(err));
        } finally {
            setBusy(false);
        }
    };

    const finish = (names) => {
        setDoneFiles(names);
        setStep('done');
    };

    const stepIndex = step === 'customer' ? 0 : 1;

    return (
        <div className="calc-attach-backdrop" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
            <div className="ca-dialog animate-scale-in">

                <div className="ca-head">
                    <span className="ca-head-icon">➕</span>
                    <div className="ca-head-text">
                        <h3>Aggiungi al cliente</h3>
                        <p>Collega questa configurazione a un cliente del CRM</p>
                    </div>
                    <button className="ca-close" onClick={onClose} disabled={busy} title="Chiudi">✕</button>
                </div>

                {step !== 'done' && (
                    <div className="ca-steps">
                        <span className={`ca-step ${stepIndex === 0 ? 'active' : 'done'}`}><b>{stepIndex > 0 ? '✓' : '1'}</b> Cliente</span>
                        <span className="ca-step-line" />
                        <span className={`ca-step ${stepIndex === 1 ? 'active' : ''}`}><b>2</b> Preventivo</span>
                    </div>
                )}

                <div className="ca-summary">
                    <div className="ca-summary-top">
                        <span className="ca-pkg">{pkg ? `Pacchetto ${CALC_PACKAGE_NAMES[pkg]}` : 'Nessun pacchetto'}</span>
                        {payload.quote.client && <span className="ca-client">per {payload.quote.client}</span>}
                    </div>
                    <div className="ca-stats">
                        <div className="ca-stat">
                            <span>Totale</span>
                            <strong>{money(newAmount)}</strong>
                        </div>
                        <div className="ca-stat">
                            <span>Ore stimate</span>
                            <strong>{String(payload.hours.total).replace('.', ',')} h</strong>
                        </div>
                        <div className={`ca-stat ${level}`}>
                            <span>Netto</span>
                            <strong>{margin?.rate != null ? `${money(margin.rate)}/h` : '—'}</strong>
                        </div>
                    </div>
                </div>

                {step === 'customer' && (
                    <>
                        <div className="ca-body">
                            <div className="ca-search">
                                <span aria-hidden="true">🔍</span>
                                <input placeholder="Cerca per nome o azienda…" value={search} onChange={e => setSearch(e.target.value)} autoFocus />
                                {search && <button onClick={() => setSearch('')} title="Pulisci">✕</button>}
                            </div>

                            <div className="ca-list" role="listbox">
                                {filtered.length === 0 && <div className="ca-empty">Nessun cliente trovato</div>}
                                {filtered.map(c => (
                                    <button
                                        key={c.id}
                                        role="option"
                                        aria-selected={c.id === customerId}
                                        className={`ca-row ${c.id === customerId ? 'selected' : ''}`}
                                        onClick={() => setCustomerId(c.id)}
                                    >
                                        <CustomerAvatar customer={c} />
                                        <span className="ca-row-text">
                                            <span className="ca-row-name">
                                                {c.name || 'Senza nome'}
                                                {c.id === suggestedId && <span className="ca-badge suggested">Suggerito</span>}
                                                {c.calcConfig && <span className="ca-badge">Ha già una configurazione</span>}
                                            </span>
                                            <span className="ca-row-sub">
                                                {[c.company, STATUS_LABELS[c.status]].filter(Boolean).join(' · ') || '—'}
                                            </span>
                                        </span>
                                        <span className="ca-row-amount">{parseFloat(c.quoteAmount) > 0 ? money(c.quoteAmount) : ''}</span>
                                        <span className="ca-row-check" aria-hidden="true">{c.id === customerId ? '✓' : ''}</span>
                                    </button>
                                ))}
                            </div>

                            {customer && (
                                <div className="ca-options">
                                    {customer.calcConfig && (
                                        <div className="ca-note warn">
                                            La configurazione del {new Date(customer.calcConfig.attachedAt).toLocaleDateString('it-IT')} verrà sostituita.
                                        </div>
                                    )}
                                    <Toggle checked={updateAmount} onChange={setUpdateAmount} title="Aggiorna l'importo del preventivo">
                                        {oldAmount > 0 && Math.abs(oldAmount - newAmount) > 0.009
                                            ? <>{money(oldAmount)} → <strong>{money(newAmount)}</strong></>
                                            : <>Diventa <strong>{money(newAmount)}</strong></>}
                                    </Toggle>
                                    {initialPayload.unsaved && (
                                        <Toggle checked={saveFile} onChange={setSaveFile} title="Salva anche la configurazione">
                                            Nella cartella del calcolatore, per riaprirla in seguito
                                        </Toggle>
                                    )}
                                </div>
                            )}
                            {error && <div className="ca-note error">{error}</div>}
                        </div>

                        <div className="ca-foot">
                            <span className="ca-foot-hint">{customer ? <>Scelto: <strong>{customer.name}</strong></> : 'Scegli un cliente dall\'elenco'}</span>
                            <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Annulla</button>
                            <button className="btn btn-primary" onClick={confirmAttach} disabled={!customer || busy}>
                                {busy ? 'Salvo…' : 'Aggiungi al cliente →'}
                            </button>
                        </div>
                    </>
                )}

                {step === 'quote' && (
                    <>
                        <div className="ca-body">
                            <div className="ca-note ok">✓ Configurazione aggiunta a <strong>{customer?.name}</strong>: la trovi nella tab Configurazione.</div>
                            <div className="ca-question">Vuoi allegare anche il preventivo al cliente?</div>
                            <div className="ca-docs">
                                <button className={`ca-doc ${withPdf ? 'on' : ''}`} onClick={() => setWithPdf(v => !v)}>
                                    <span className="ca-doc-icon pdf">PDF</span>
                                    <span className="ca-doc-name">Preventivo PDF</span>
                                    <span className="ca-doc-check">{withPdf ? '✓' : ''}</span>
                                </button>
                                <button className={`ca-doc ${withDocx ? 'on' : ''}`} onClick={() => setWithDocx(v => !v)}>
                                    <span className="ca-doc-icon docx">DOC</span>
                                    <span className="ca-doc-name">Preventivo Word</span>
                                    <span className="ca-doc-check">{withDocx ? '✓' : ''}</span>
                                </button>
                            </div>
                            <div className="ca-hint">Va tra i preventivi del cliente (tab Pagamenti) con stato «In attesa».</div>
                            {error && <div className="ca-note error">{error}</div>}
                        </div>
                        <div className="ca-foot">
                            <span className="ca-foot-hint" />
                            <button className="btn btn-secondary" onClick={() => finish([])} disabled={busy}>No, grazie</button>
                            <button className="btn btn-primary" onClick={attachQuote} disabled={busy || (!withPdf && !withDocx)}>
                                {busy ? 'Genero e allego…' : 'Allega'}
                            </button>
                        </div>
                    </>
                )}

                {step === 'done' && (
                    <>
                        <div className="ca-body ca-done">
                            <div className="ca-done-icon">✓</div>
                            <div className="ca-done-title">Fatto!</div>
                            <div className="ca-done-text">
                                Configurazione aggiunta a <strong>{customer?.name}</strong>.
                                {doneFiles.length > 0
                                    ? <><br />Allegat{doneFiles.length === 1 ? 'o' : 'i'}: {doneFiles.join(', ')}</>
                                    : <><br />Nessun documento allegato.</>}
                            </div>
                        </div>
                        <div className="ca-foot">
                            <span className="ca-foot-hint" />
                            <button className="btn btn-secondary" onClick={onClose}>Torna al calcolatore</button>
                            <button className="btn btn-primary" onClick={() => onOpenCustomer(customer)}>Apri scheda cliente</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

const CALC_CSS = `
.calc-overlay, .calc-overlay.modal-overlay {
    position: fixed; inset: 0; z-index: 1500; padding: 0;
    background: rgba(8,8,24,0.6); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
    align-items: center; justify-content: center;
    animation: calcFadeIn 0.2s ease;
}
.calc-shell {
    background: var(--bg-primary, #fff); border-radius: 18px;
    box-shadow: 0 30px 90px rgba(0,0,0,0.3), 0 0 0 1px rgba(245,158,11,0.12);
    width: calc(100vw - 24px); height: calc(100vh - 24px);
    overflow: hidden; display: flex; flex-direction: column;
    animation: calcScaleIn 0.3s cubic-bezier(0.175,0.885,0.32,1.275);
}
.calc-head {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    padding: 10px 20px; border-bottom: 1px solid var(--border-light, #e8e6de);
    background: linear-gradient(135deg, rgba(245,158,11,0.07) 0%, transparent 60%); flex-shrink: 0;
}
.calc-kicker { font-size: 0.66rem; font-weight: 700; letter-spacing: 0.14em; color: #D97706; text-transform: uppercase; margin-bottom: 1px; }
.calc-title { margin: 0; font-size: 1.2rem; font-weight: 800; color: var(--text-primary); line-height: 1.15; }
.calc-head-actions { display: flex; gap: 8px; }
.calc-head-btn {
    background: var(--bg-input, #f0efe9); border: none; border-radius: 50%; width: 38px; height: 38px;
    cursor: pointer; font-size: 1rem; color: var(--text-secondary); display: flex; align-items: center; justify-content: center; transition: all 0.2s;
}
.calc-head-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.calc-head-close:hover { background: #FFE0E0; color: #C24E36; }
.calc-frame { flex: 1; width: 100%; border: none; background: #f5f5f5; }

.calc-attach-backdrop {
    position: fixed; inset: 0; z-index: 1600; background: rgba(15,15,35,0.45);
    backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
    display: flex; align-items: center; justify-content: center; padding: 16px;
}

/* Conferma chiusura */
.calc-confirm {
    background: var(--bg-card, #fff); border-radius: 22px; box-shadow: 0 30px 80px rgba(0,0,0,0.25);
    width: min(440px, 100%); padding: 26px 26px 22px; text-align: center;
}
.calc-confirm-icon {
    width: 52px; height: 52px; border-radius: 16px; margin: 0 auto 12px; font-size: 1.5rem;
    display: flex; align-items: center; justify-content: center; background: rgba(245,158,11,0.14);
}
.calc-confirm h3 { margin: 0 0 8px; font-size: 1.1rem; }
.calc-confirm p { margin: 0 0 18px; color: var(--text-secondary); font-size: 0.88rem; line-height: 1.5; }
.calc-confirm-actions { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }

/* Aggiungi al cliente */
.ca-dialog {
    background: var(--bg-card, #fff); border-radius: 24px;
    box-shadow: 0 30px 90px rgba(20,20,60,0.28), 0 0 0 1px rgba(31, 107, 79,0.08);
    width: min(620px, 100%); max-height: calc(100vh - 32px); display: flex; flex-direction: column; overflow: hidden;
}
.ca-head { display: flex; align-items: center; gap: 14px; padding: 22px 24px 14px; }
.ca-head-icon {
    width: 44px; height: 44px; border-radius: 14px; flex-shrink: 0; font-size: 1.15rem;
    display: flex; align-items: center; justify-content: center;
    background: var(--primary, #1F6B4F); color: #fff;
    box-shadow: 0 8px 20px rgba(31, 107, 79,0.3);
}
.ca-head-text { flex: 1; min-width: 0; }
.ca-head-text h3 { margin: 0; font-size: 1.2rem; font-weight: 800; color: var(--text-primary); }
.ca-head-text p { margin: 2px 0 0; font-size: 0.82rem; color: var(--text-tertiary); }
.ca-close {
    width: 36px; height: 36px; border-radius: 50%; border: none; cursor: pointer; flex-shrink: 0;
    background: var(--bg-input); color: var(--text-secondary); font-size: 0.9rem; transition: all 0.2s;
}
.ca-close:hover { background: #FFE0E0; color: #C24E36; }

.ca-steps { display: flex; align-items: center; gap: 10px; padding: 0 24px 14px; font-size: 0.8rem; color: var(--text-tertiary); }
.ca-step { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; }
.ca-step b {
    width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
    background: var(--bg-input); color: var(--text-tertiary); font-size: 0.72rem;
}
.ca-step.active { color: var(--primary); }
.ca-step.active b { background: var(--primary); color: #fff; }
.ca-step.done { color: var(--success); }
.ca-step.done b { background: var(--success-bg); color: var(--success); }
.ca-step-line { flex: 0 0 40px; height: 2px; border-radius: 2px; background: var(--border-light); }

.ca-summary {
    margin: 0 24px 16px; padding: 14px 16px; border-radius: 18px;
    background: var(--primary-ghost);
    border: 1px solid rgba(31, 107, 79,0.12);
}
.ca-summary-top { display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
.ca-pkg { font-weight: 800; color: var(--text-primary); }
.ca-client { font-size: 0.82rem; color: var(--text-tertiary); }
.ca-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.ca-stat { background: var(--bg-card, #fff); border-radius: 12px; padding: 8px 12px; display: flex; flex-direction: column; gap: 2px; }
.ca-stat span { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-tertiary); font-weight: 600; }
.ca-stat strong { font-size: 1.02rem; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.ca-stat.good strong { color: var(--success); }
.ca-stat.warn strong { color: var(--warning); }
.ca-stat.bad strong { color: var(--danger); }

.ca-body { padding: 0 24px; overflow-y: auto; flex: 1; min-height: 0; }
.ca-search {
    display: flex; align-items: center; gap: 8px; padding: 0 12px; height: 44px; border-radius: 14px;
    background: var(--bg-input); border: 1.5px solid transparent; transition: all 0.2s; margin-bottom: 10px;
}
.ca-search:focus-within { border-color: var(--primary); background: var(--bg-card, #fff); box-shadow: 0 0 0 4px var(--primary-ghost); }
.ca-search span { opacity: 0.55; font-size: 0.9rem; }
.ca-search input { flex: 1; border: none; background: transparent; outline: none; font: inherit; font-size: 0.92rem; color: var(--text-primary); }
.ca-search button { border: none; background: none; cursor: pointer; color: var(--text-tertiary); }

.ca-list {
    display: flex; flex-direction: column; gap: 4px; max-height: 268px; overflow-y: auto;
    padding: 4px; margin: 0 -4px; border-radius: 14px;
}
.ca-empty { text-align: center; padding: 24px; color: var(--text-tertiary); font-size: 0.88rem; }
.ca-row {
    display: flex; align-items: center; gap: 12px; width: 100%; padding: 9px 12px; text-align: left;
    border: 1.5px solid transparent; border-radius: 14px; background: transparent; cursor: pointer; font: inherit; transition: all 0.15s;
}
.ca-row:hover { background: var(--bg-hover); }
.ca-row.selected { background: var(--primary-ghost); border-color: var(--primary); }
.ca-avatar {
    width: 38px; height: 38px; border-radius: 12px; flex-shrink: 0; object-fit: cover;
    display: inline-flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 0.85rem;
}
.ca-row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.ca-row-name { font-weight: 650; font-size: 0.92rem; color: var(--text-primary); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.ca-row-sub { font-size: 0.78rem; color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ca-row-amount { font-size: 0.8rem; color: var(--text-secondary); font-variant-numeric: tabular-nums; white-space: nowrap; }
.ca-row-check {
    width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;
    border: 1.5px solid var(--border); font-size: 0.75rem; font-weight: 800; color: #fff;
}
.ca-row.selected .ca-row-check { background: var(--primary); border-color: var(--primary); }
.ca-badge { font-size: 0.66rem; font-weight: 700; padding: 2px 7px; border-radius: 999px; background: var(--warning-bg); color: var(--warning); }
.ca-badge.suggested { background: var(--success-bg); color: var(--success); }

.ca-options { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; }
.ca-toggle {
    display: flex; align-items: center; gap: 12px; padding: 11px 14px; border-radius: 14px; cursor: pointer;
    background: var(--bg-input); border: 1.5px solid transparent; transition: all 0.15s;
}
.ca-toggle.on { border-color: rgba(31, 107, 79,0.25); }
.ca-toggle input { position: absolute; opacity: 0; pointer-events: none; }
.ca-switch { width: 38px; height: 22px; border-radius: 999px; background: #cfd0dc; position: relative; flex-shrink: 0; transition: background 0.2s; }
.ca-switch span { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.2); transition: transform 0.2s; }
.ca-toggle.on .ca-switch { background: var(--primary); }
.ca-toggle.on .ca-switch span { transform: translateX(16px); }
.ca-toggle input:focus-visible + .ca-switch { box-shadow: 0 0 0 3px var(--primary-ghost); }
.ca-toggle-text { display: flex; flex-direction: column; gap: 1px; }
.ca-toggle-title { font-weight: 600; font-size: 0.88rem; color: var(--text-primary); }
.ca-toggle-sub { font-size: 0.8rem; color: var(--text-secondary); }

.ca-note { border-radius: 12px; padding: 10px 12px; font-size: 0.85rem; margin-top: 10px; }
.ca-note.warn { background: var(--warning-bg); color: var(--warning); margin-top: 0; }
.ca-note.error { background: var(--danger-bg); color: var(--danger); }
.ca-note.ok { background: var(--success-bg); color: var(--success); margin-top: 0; }
.ca-question { font-weight: 700; margin: 16px 0 10px; color: var(--text-primary); }
.ca-docs { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.ca-doc {
    display: flex; align-items: center; gap: 10px; padding: 14px; border-radius: 16px; cursor: pointer; font: inherit; text-align: left;
    background: var(--bg-input); border: 1.5px solid transparent; transition: all 0.15s;
}
.ca-doc:hover { background: var(--bg-hover); }
.ca-doc.on { background: var(--primary-ghost); border-color: var(--primary); }
.ca-doc-icon { width: 40px; height: 46px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.68rem; font-weight: 800; color: #fff; flex-shrink: 0; }
.ca-doc-icon.pdf { background: #DC2626; }
.ca-doc-icon.docx { background: #2563EB; }
.ca-doc-name { flex: 1; font-weight: 600; font-size: 0.9rem; color: var(--text-primary); }
.ca-doc-check {
    width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
    border: 1.5px solid var(--border); font-size: 0.75rem; font-weight: 800; color: #fff;
}
.ca-doc.on .ca-doc-check { background: var(--primary); border-color: var(--primary); }
.ca-hint { color: var(--text-tertiary); font-size: 0.8rem; margin-top: 10px; }

.ca-done { text-align: center; padding-top: 8px; padding-bottom: 8px; }
.ca-done-icon {
    width: 60px; height: 60px; border-radius: 50%; margin: 0 auto 10px; display: flex; align-items: center; justify-content: center;
    background: var(--success-bg); color: var(--success); font-size: 1.6rem; font-weight: 800;
}
.ca-done-title { font-size: 1.15rem; font-weight: 800; margin-bottom: 6px; color: var(--text-primary); }
.ca-done-text { font-size: 0.88rem; color: var(--text-secondary); line-height: 1.55; }

.ca-foot {
    display: flex; align-items: center; gap: 8px; padding: 16px 24px 20px; margin-top: 16px;
    border-top: 1px solid var(--border-light);
}
.ca-foot-hint { flex: 1; font-size: 0.82rem; color: var(--text-tertiary); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 520px) {
    .ca-stats, .ca-docs { grid-template-columns: 1fr; }
    .ca-foot-hint { display: none; }
}
@keyframes calcFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes calcScaleIn { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
`;
