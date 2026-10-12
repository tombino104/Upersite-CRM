import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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

    // Escape chiude (il lavoro resta): non se è aperta la finestra "Aggiungi al cliente" o le Impostazioni sopra
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === 'Escape' && !attach && !settingsOpen) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, attach, settingsOpen, onClose]);

    if (!mounted) return null;

    return (
        <div
            // Con "modal-overlay" la scheda cliente aperta sotto non si chiude con Escape
            className={open ? 'calc-overlay modal-overlay' : 'calc-overlay'}
            style={{ display: open ? 'flex' : 'none' }}
            onClick={e => { if (e.target === e.currentTarget && !attach) onClose(); }}
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
                        <button className="calc-head-btn calc-head-close" title="Chiudi (il lavoro resta aperto)" onClick={onClose}>✕</button>
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
        </div>
    );
}

/* ── Aggiungi al cliente ── */

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

function AttachToCustomerDialog({ payload: initialPayload, customers, updateCustomer, getApi, onOpenCustomer, onClose }) {
    const [payload, setPayload] = useState(initialPayload);
    const sorted = useMemo(
        () => [...customers].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'it')),
        [customers]
    );
    const [customerId, setCustomerId] = useState(() => guessCustomer(customers, initialPayload.quote.client)?.id || '');
    const [search, setSearch] = useState('');
    const [updateAmount, setUpdateAmount] = useState(true);
    const [saveFile, setSaveFile] = useState(initialPayload.unsaved);
    const [step, setStep] = useState('customer'); // customer → quote → done
    const [withPdf, setWithPdf] = useState(true);
    const [withDocx, setWithDocx] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [doneText, setDoneText] = useState('');

    const customer = customers.find(c => c.id === customerId) || null;
    const totals = payload.quote.totals;
    const newAmount = round2(totals.total);
    const oldAmount = parseFloat(customer?.quoteAmount) || 0;
    const pkg = payload.config.state.package;

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
        if (!kinds.length) { finish(false); return; }
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
            finish(true, added.map(a => a.name));
        } catch (err) {
            setError(err.message || String(err));
        } finally {
            setBusy(false);
        }
    };

    const finish = (withFiles, names = []) => {
        setDoneText(withFiles
            ? `Allegat${names.length === 1 ? 'o' : 'i'} ai preventivi (In attesa): ${names.join(', ')}`
            : 'Nessun documento allegato.');
        setStep('done');
    };

    return (
        <div className="calc-attach-backdrop" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
            <div className="calc-attach animate-scale-in">
                <div className="calc-attach-head">
                    <h3>➕ Aggiungi al cliente</h3>
                    <button className="btn btn-ghost btn-icon" onClick={onClose} disabled={busy}>✕</button>
                </div>

                <div className="calc-attach-summary">
                    <div><strong>{pkg ? `Pacchetto ${CALC_PACKAGE_NAMES[pkg]}` : 'Nessun pacchetto'}</strong>{payload.quote.client ? ` · ${payload.quote.client}` : ''}</div>
                    <div className="calc-attach-figures">
                        <span>Totale <strong>{money(newAmount)}</strong></span>
                        <span>Ore stimate <strong>{String(payload.hours.total).replace('.', ',')} h</strong></span>
                        {payload.margin?.rate != null && <span>Netto <strong>{money(payload.margin.rate)}/h</strong></span>}
                    </div>
                </div>

                {step === 'customer' && (
                    <>
                        <label className="input-label">Cliente</label>
                        <input className="input" placeholder="Cerca cliente…" value={search} onChange={e => setSearch(e.target.value)} style={{ marginBottom: 8 }} />
                        <select className="select" value={customerId} onChange={e => setCustomerId(e.target.value)} size={Math.min(8, Math.max(3, filtered.length + 1))} style={{ width: '100%' }}>
                            <option value="">— Scegli un cliente —</option>
                            {filtered.map(c => (
                                <option key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ''}</option>
                            ))}
                        </select>

                        {customer && (
                            <div className="calc-attach-options">
                                {customer.calcConfig && (
                                    <div className="calc-attach-warn">
                                        ⚠ {customer.name} ha già una configurazione del {new Date(customer.calcConfig.attachedAt).toLocaleDateString('it-IT')}: verrà sostituita.
                                    </div>
                                )}
                                <label className="calc-attach-check">
                                    <input type="checkbox" checked={updateAmount} onChange={e => setUpdateAmount(e.target.checked)} />
                                    <span>
                                        Aggiorna l'importo del preventivo: {oldAmount ? <>{money(oldAmount)} → </> : null}<strong>{money(newAmount)}</strong>
                                        {oldAmount > 0 && Math.abs(oldAmount - newAmount) > 0.009 && <em> (l'importo attuale verrà sovrascritto)</em>}
                                    </span>
                                </label>
                                {initialPayload.unsaved && (
                                    <label className="calc-attach-check">
                                        <input type="checkbox" checked={saveFile} onChange={e => setSaveFile(e.target.checked)} />
                                        <span>Salva anche la configurazione nella cartella del calcolatore</span>
                                    </label>
                                )}
                            </div>
                        )}

                        {error && <div className="calc-attach-error">{error}</div>}
                        <div className="calc-attach-actions">
                            <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Annulla</button>
                            <button className="btn btn-primary" onClick={confirmAttach} disabled={!customer || busy}>
                                {busy ? 'Salvo…' : 'Aggiungi al cliente'}
                            </button>
                        </div>
                    </>
                )}

                {step === 'quote' && (
                    <>
                        <div className="calc-attach-ok">✓ Configurazione aggiunta a <strong>{customer?.name}</strong> (tab Configurazione).</div>
                        <p style={{ margin: '12px 0 8px', fontWeight: 600 }}>Vuoi allegare anche il preventivo al cliente?</p>
                        <label className="calc-attach-check">
                            <input type="checkbox" checked={withPdf} onChange={e => setWithPdf(e.target.checked)} />
                            <span>Preventivo PDF</span>
                        </label>
                        <label className="calc-attach-check">
                            <input type="checkbox" checked={withDocx} onChange={e => setWithDocx(e.target.checked)} />
                            <span>Preventivo Word (.docx)</span>
                        </label>
                        <div className="calc-attach-hint">Finisce in Preventivi/{customer?.name} con stato «In attesa».</div>
                        {error && <div className="calc-attach-error">{error}</div>}
                        <div className="calc-attach-actions">
                            <button className="btn btn-secondary" onClick={() => finish(false)} disabled={busy}>No, grazie</button>
                            <button className="btn btn-primary" onClick={attachQuote} disabled={busy || (!withPdf && !withDocx)}>
                                {busy ? 'Genero e allego…' : 'Allega'}
                            </button>
                        </div>
                    </>
                )}

                {step === 'done' && (
                    <>
                        <div className="calc-attach-ok">✓ Fatto. {doneText}</div>
                        <div className="calc-attach-actions">
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
    background: rgba(8,8,24,0.75); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
    align-items: center; justify-content: center;
    animation: calcFadeIn 0.2s ease;
}
.calc-shell {
    background: var(--bg-primary, #fff); border-radius: 28px;
    box-shadow: 0 40px 120px rgba(0,0,0,0.35), 0 0 0 1px rgba(245,158,11,0.12);
    width: 97vw; max-width: 1600px; height: 94vh;
    overflow: hidden; display: flex; flex-direction: column;
    animation: calcScaleIn 0.35s cubic-bezier(0.175,0.885,0.32,1.275);
}
.calc-head {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    padding: 14px 24px 12px; border-bottom: 1px solid var(--border-light, #ebebf5);
    background: linear-gradient(135deg, rgba(245,158,11,0.07) 0%, transparent 60%); flex-shrink: 0;
}
.calc-kicker { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.14em; color: #D97706; text-transform: uppercase; margin-bottom: 2px; }
.calc-title { margin: 0; font-size: 1.35rem; font-weight: 800; color: var(--text-primary); line-height: 1.15; }
.calc-head-actions { display: flex; gap: 8px; }
.calc-head-btn {
    background: var(--bg-input, #f0f0f8); border: none; border-radius: 50%; width: 40px; height: 40px;
    cursor: pointer; font-size: 1rem; color: var(--text-secondary); display: flex; align-items: center; justify-content: center; transition: all 0.2s;
}
.calc-head-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.calc-head-close:hover { background: #FFE0E0; color: #E17055; }
.calc-frame { flex: 1; width: 100%; border: none; background: #fff; }
.calc-attach-backdrop {
    position: fixed; inset: 0; z-index: 1600; background: rgba(8,8,24,0.45);
    display: flex; align-items: center; justify-content: center;
}
.calc-attach {
    background: var(--bg-card, #fff); border-radius: var(--radius-xl, 20px); box-shadow: var(--shadow-xl, 0 30px 80px rgba(0,0,0,0.3));
    width: min(560px, 94vw); max-height: 90vh; overflow: auto; padding: 20px 24px 22px;
}
.calc-attach-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.calc-attach-head h3 { margin: 0; font-size: 1.15rem; }
.calc-attach-summary {
    background: var(--bg-input); border-radius: var(--radius-md, 12px); padding: 12px 14px; margin-bottom: 14px; font-size: 0.9rem;
}
.calc-attach-figures { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 6px; color: var(--text-secondary); }
.calc-attach-figures strong { color: var(--text-primary); }
.calc-attach-options { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
.calc-attach-check { display: flex; gap: 10px; align-items: flex-start; font-size: 0.9rem; cursor: pointer; }
.calc-attach-check input { margin-top: 3px; }
.calc-attach-check em { color: var(--warning); font-style: normal; }
.calc-attach-warn { background: var(--warning-bg); color: var(--warning); border-radius: var(--radius-sm, 8px); padding: 8px 10px; font-size: 0.85rem; }
.calc-attach-ok { background: var(--success-bg); color: var(--success); border-radius: var(--radius-sm, 8px); padding: 10px 12px; font-size: 0.9rem; }
.calc-attach-error { background: var(--danger-bg); color: var(--danger); border-radius: var(--radius-sm, 8px); padding: 8px 10px; margin-top: 10px; font-size: 0.85rem; }
.calc-attach-hint { color: var(--text-tertiary); font-size: 0.8rem; margin-top: 6px; }
.calc-attach-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
@keyframes calcFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes calcScaleIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
`;
