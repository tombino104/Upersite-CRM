import { useEffect, useMemo, useState } from 'react';
import { CRM_REQUEST_HEADERS, verifyMasterPassword, applyBrowserPrefs, getBrowserPrefs } from '../utils/storage';

// Ripristino da un backup con data (cartella dei backup → gg-mm-aa → backup_ore_*.json + Preventivi + Calcolatore).
// Prima di ripristinare il server salva sempre lo stato attuale in un backup "prima del ripristino".

const money = (n) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0);
const STATUS_LABELS = { prospect: 'Prospect', working: 'In lavorazione', paused: 'Sospeso', completed: 'Completato' };

function dayLabel(iso) {
    const label = new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
}

function mb(bytes) {
    return bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

async function getJson(url) {
    const res = await fetch(url, { headers: CRM_REQUEST_HEADERS });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Errore ${res.status}`);
    return data;
}

export default function RestoreModal({ onClose }) {
    const [list, setList] = useState(null);
    const [listError, setListError] = useState('');
    const [selected, setSelected] = useState(null); // { folder, file }
    const [info, setInfo] = useState(null);
    const [infoError, setInfoError] = useState('');
    const [mode, setMode] = useState('all');
    const [parts, setParts] = useState({ data: true, preventivi: true, calcolatore: true, altro: true });
    const [picked, setPicked] = useState([]);
    const [search, setSearch] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState(null);

    useEffect(() => {
        getJson('/api/restore/list')
            .then(data => {
                setList(data);
                const first = data.days[0]?.backups[0];
                if (first) setSelected({ folder: data.days[0].folder, file: first.file });
            })
            .catch(err => setListError(err.message));
    }, []);

    useEffect(() => {
        if (!selected) return;
        let cancelled = false;
        getJson(`/api/restore/inspect?folder=${encodeURIComponent(selected.folder)}&file=${encodeURIComponent(selected.file)}`)
            .then(data => { if (!cancelled) { setInfo(data); setInfoError(''); } })
            .catch(err => { if (!cancelled) { setInfo(null); setInfoError(err.message); } });
        return () => { cancelled = true; };
    }, [selected]);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape' && !busy && !result) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [busy, result, onClose]);

    const selectBackup = (folder, file) => {
        if (selected?.folder === folder && selected?.file === file) return;
        setInfo(null);
        setPicked([]);
        setError('');
        setSelected({ folder, file });
    };

    const customers = useMemo(() => {
        const q = search.trim().toLowerCase();
        return (info?.customers || []).filter(c => !q || c.name.toLowerCase().includes(q) || c.company.toLowerCase().includes(q));
    }, [info, search]);

    const togglePick = (id) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
    const anyPart = Object.values(parts).some(Boolean);
    const canRestore = info && password && !busy && (mode === 'all' ? anyPart : picked.length > 0);

    const restore = async () => {
        setError('');
        if (!(await verifyMasterPassword(password))) {
            setError('Password master errata');
            return;
        }
        setBusy(true);
        try {
            const res = await fetch('/api/restore/apply', {
                method: 'POST',
                headers: CRM_REQUEST_HEADERS,
                body: JSON.stringify({ ...selected, mode, parts, customerIds: picked, prefs: getBrowserPrefs() }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `Errore ${res.status}`);
            if (data.prefs) applyBrowserPrefs(data.prefs);
            setResult(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const selectedBackup = list?.days.find(d => d.folder === selected?.folder)?.backups.find(b => b.file === selected?.file);

    return (
        <div className="modal-overlay" style={{ zIndex: 2100 }} onClick={e => { if (e.target === e.currentTarget && !busy && !result) onClose(); }}>
            <style>{RS_CSS}</style>
            <div className="rs-dialog animate-scale-in">
                <div className="rs-head">
                    <span className="rs-head-icon">♻️</span>
                    <div style={{ flex: 1 }}>
                        <h3>Ripristina da un backup</h3>
                        <p>{list ? <>Cartella dei backup: <strong>{list.root}</strong></> : 'Leggo la cartella dei backup…'}</p>
                    </div>
                    {!result && <button className="rs-close" onClick={onClose} disabled={busy}>✕</button>}
                </div>

                {result ? (
                    <div className="rs-result">
                        <div className="rs-result-icon">✓</div>
                        <h3>Ripristino completato</h3>
                        <ul>{result.restored.map((r, i) => <li key={i}>Rimessi: {r}</li>)}</ul>
                        <div className="rs-note">
                            Lo stato di prima è salvato in <strong>{result.safety.folder}\{result.safety.file}</strong>:
                            se serve, puoi ripristinare quello per tornare indietro.
                        </div>
                        {mode === 'all' && parts.data && info && !info.samePassword && (
                            <div className="rs-note warn">Al prossimo accesso usa la password master che avevi al momento di questo backup.</div>
                        )}
                        <button className="btn btn-primary" onClick={() => window.location.reload()}>Ricarica il CRM</button>
                    </div>
                ) : (
                    <div className="rs-body">
                        <div className="rs-days">
                            {listError && <div className="rs-note error">{listError}</div>}
                            {list && list.days.length === 0 && <div className="rs-empty">Nessun backup nella cartella.</div>}
                            {list?.days.map(day => (
                                <div key={day.folder} className={`rs-day ${selected?.folder === day.folder ? 'active' : ''}`}>
                                    <div className="rs-day-title">{dayLabel(day.date)}</div>
                                    <div className="rs-day-meta">{day.backups.length} backup · {day.quotes} preventivi · {day.calc} file calcolatore</div>
                                    <div className="rs-times">
                                        {day.backups.map(b => (
                                            <button key={b.file}
                                                className={`rs-time ${selected?.folder === day.folder && selected?.file === b.file ? 'on' : ''} ${b.beforeRestore ? 'safety' : ''}`}
                                                title={b.file}
                                                onClick={() => selectBackup(day.folder, b.file)}>
                                                {b.time.slice(0, 5)}{b.light ? ' · leggero' : ''}{b.beforeRestore ? ' · prima del ripristino' : ''}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="rs-detail">
                            {infoError && <div className="rs-note error">{infoError}</div>}
                            {!info && !infoError && <div className="rs-empty">{selected ? 'Leggo il backup…' : 'Scegli un backup a sinistra.'}</div>}
                            {info && (
                                <>
                                    <div className="rs-detail-title">
                                        {dayLabel(list.days.find(d => d.folder === info.folder).date)} alle {selectedBackup?.time}
                                        {selectedBackup && <span className="rs-size">{mb(selectedBackup.size)}</span>}
                                    </div>
                                    <div className="rs-stats">
                                        <div><strong>{info.counts.customers}</strong><span>clienti (ora {info.counts.currentCustomers})</span></div>
                                        <div><strong>{info.quotes}</strong><span>file preventivi</span></div>
                                        <div><strong>{info.calc}</strong><span>file calcolatore</span></div>
                                        <div><strong>{info.counts.workflows}</strong><span>automazioni</span></div>
                                        <div><strong>{info.counts.tools}</strong><span>attrezzi</span></div>
                                        <div><strong>{info.counts.docs}</strong><span>documenti</span></div>
                                    </div>
                                    {info.light && <div className="rs-note warn">Backup «leggero»: non contiene i file allegati ai clienti.</div>}
                                    {!info.samePassword && <div className="rs-note warn">Questo backup ha una password master diversa da quella attuale: dopo un ripristino completo accedi con la password di allora.</div>}

                                    <div className="rs-tabs">
                                        <button className={mode === 'all' ? 'on' : ''} onClick={() => setMode('all')}>Ripristina tutto</button>
                                        <button className={mode === 'customers' ? 'on' : ''} onClick={() => setMode('customers')}>Solo alcuni clienti</button>
                                    </div>

                                    {mode === 'all' ? (
                                        <div className="rs-parts">
                                            <PartToggle on={parts.data} onChange={v => setParts(p => ({ ...p, data: v }))} title="Dati del CRM">
                                                Clienti, note, todo, rate, ticket, impostazioni, eventi, automazioni, preferenze. Sostituiscono quelli attuali.
                                            </PartToggle>
                                            <PartToggle on={parts.preventivi} onChange={v => setParts(p => ({ ...p, preventivi: v }))} title={`Preventivi (${info.quotes} file)`}>
                                                Rimessi nella cartella Dati\Preventivi.
                                            </PartToggle>
                                            <PartToggle on={parts.calcolatore} onChange={v => setParts(p => ({ ...p, calcolatore: v }))} title={`Calcolatore (${info.calc} file)`}>
                                                Configurazioni salvate, pacchetti completi e backup delle impostazioni.
                                            </PartToggle>
                                            {info.other.length > 0 && (
                                                <PartToggle on={parts.altro} onChange={v => setParts(p => ({ ...p, altro: v }))} title="Altre cartelle">
                                                    {info.other.join(', ')}
                                                </PartToggle>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="rs-customers">
                                            <input className="input" placeholder="Cerca cliente nel backup…" value={search} onChange={e => setSearch(e.target.value)} />
                                            <div className="rs-customer-list">
                                                {customers.map(c => (
                                                    <label key={c.id} className={`rs-customer ${picked.includes(c.id) ? 'on' : ''}`}>
                                                        <input type="checkbox" checked={picked.includes(c.id)} onChange={() => togglePick(c.id)} />
                                                        <span className="rs-customer-text">
                                                            <strong>{c.name}</strong>
                                                            <span>{[c.company, STATUS_LABELS[c.status], parseFloat(c.quoteAmount) > 0 ? money(c.quoteAmount) : null, c.quotes ? `${c.quotes} preventivi` : null].filter(Boolean).join(' · ')}</span>
                                                        </span>
                                                        <span className={`rs-badge ${c.existsNow ? '' : 'add'}`}>{c.existsNow ? 'sostituisce quello attuale' : 'non c\'è più: viene aggiunto'}</span>
                                                    </label>
                                                ))}
                                            </div>
                                            <div className="rs-hint">Gli altri clienti restano come sono. Vengono rimessi anche i loro preventivi.</div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                )}

                {!result && (
                    <div className="rs-foot">
                        <div className="rs-foot-info">
                            🛟 Prima del ripristino salvo lo stato attuale in un backup «prima del ripristino» nella cartella di oggi:
                            puoi sempre tornare indietro. I file non vengono mai cancellati.
                        </div>
                        <div className="rs-foot-actions">
                            <input type="password" className="input" placeholder="Password master" value={password}
                                onChange={e => setPassword(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && canRestore) restore(); }} />
                            <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Annulla</button>
                            <button className="btn btn-primary" onClick={restore} disabled={!canRestore}>
                                {busy ? 'Ripristino…' : mode === 'all' ? 'Ripristina' : `Ripristina ${picked.length || ''} client${picked.length === 1 ? 'e' : 'i'}`}
                            </button>
                        </div>
                        {error && <div className="rs-note error">{error}</div>}
                    </div>
                )}
            </div>
        </div>
    );
}

function PartToggle({ on, onChange, title, children }) {
    return (
        <label className={`rs-part ${on ? 'on' : ''}`}>
            <input type="checkbox" checked={on} onChange={e => onChange(e.target.checked)} />
            <span className="rs-switch" aria-hidden="true"><span /></span>
            <span className="rs-part-text"><strong>{title}</strong><span>{children}</span></span>
        </label>
    );
}

const RS_CSS = `
.rs-dialog {
    background: var(--bg-card, #fff); border-radius: 24px; box-shadow: 0 30px 90px rgba(20,20,60,0.28);
    width: min(1040px, 100%); max-height: calc(100vh - 48px); display: flex; flex-direction: column; overflow: hidden;
}
.rs-head { display: flex; align-items: center; gap: 14px; padding: 20px 24px 14px; border-bottom: 1px solid var(--border-light); }
.rs-head h3 { margin: 0; font-size: 1.2rem; font-weight: 800; }
.rs-head p { margin: 2px 0 0; font-size: 0.8rem; color: var(--text-tertiary); word-break: break-all; }
.rs-head-icon { width: 44px; height: 44px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; background: var(--success-bg); flex-shrink: 0; }
.rs-close { width: 36px; height: 36px; border-radius: 50%; border: none; cursor: pointer; background: var(--bg-input); color: var(--text-secondary); }
.rs-close:hover { background: #FFE0E0; color: #C24E36; }
.rs-body { display: grid; grid-template-columns: 340px 1fr; min-height: 0; flex: 1; }
.rs-days { border-right: 1px solid var(--border-light); overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 6px; }
.rs-day { padding: 10px 12px; border-radius: 14px; border: 1.5px solid transparent; }
.rs-day.active { background: var(--primary-ghost); border-color: rgba(31, 107, 79,0.25); }
.rs-day-title { font-weight: 700; font-size: 0.88rem; color: var(--text-primary); }
.rs-day-meta { font-size: 0.74rem; color: var(--text-tertiary); margin: 2px 0 6px; }
.rs-times { display: flex; flex-wrap: wrap; gap: 5px; }
.rs-time { border: 1px solid var(--border); background: var(--bg-card, #fff); border-radius: 999px; padding: 3px 10px; font-size: 0.76rem; cursor: pointer; font-variant-numeric: tabular-nums; color: var(--text-secondary); }
.rs-time:hover { border-color: var(--primary); color: var(--primary); }
.rs-time.on { background: var(--primary); border-color: var(--primary); color: #fff; }
.rs-time.safety:not(.on) { border-style: dashed; }
.rs-detail { overflow-y: auto; padding: 16px 20px; min-width: 0; }
.rs-detail-title { font-weight: 800; font-size: 1.02rem; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.rs-size { font-size: 0.72rem; font-weight: 600; color: var(--text-tertiary); background: var(--bg-input); padding: 2px 8px; border-radius: 999px; }
.rs-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
.rs-stats div { background: var(--bg-input); border-radius: 12px; padding: 8px 12px; display: flex; flex-direction: column; }
.rs-stats strong { font-size: 1.1rem; }
.rs-stats span { font-size: 0.72rem; color: var(--text-tertiary); }
.rs-tabs { display: inline-flex; background: var(--bg-input); border-radius: 999px; padding: 3px; margin: 6px 0 12px; }
.rs-tabs button { border: none; background: none; padding: 6px 14px; border-radius: 999px; font-weight: 600; font-size: 0.82rem; cursor: pointer; color: var(--text-secondary); }
.rs-tabs button.on { background: var(--bg-card, #fff); color: var(--primary); box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
.rs-parts { display: flex; flex-direction: column; gap: 8px; }
.rs-part { display: flex; align-items: center; gap: 12px; padding: 11px 14px; border-radius: 14px; background: var(--bg-input); border: 1.5px solid transparent; cursor: pointer; }
.rs-part.on { border-color: rgba(31, 107, 79,0.25); }
.rs-part input, .rs-customer input { position: absolute; opacity: 0; pointer-events: none; }
.rs-switch { width: 38px; height: 22px; border-radius: 999px; background: #cfd0dc; position: relative; flex-shrink: 0; transition: background 0.2s; }
.rs-switch span { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.2); transition: transform 0.2s; }
.rs-part.on .rs-switch { background: var(--primary); }
.rs-part.on .rs-switch span { transform: translateX(16px); }
.rs-part-text { display: flex; flex-direction: column; font-size: 0.82rem; color: var(--text-secondary); }
.rs-part-text strong { font-size: 0.9rem; color: var(--text-primary); }
.rs-customers .input { margin-bottom: 8px; }
.rs-customer-list { display: flex; flex-direction: column; gap: 4px; max-height: 300px; overflow-y: auto; }
.rs-customer { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 12px; border: 1.5px solid transparent; cursor: pointer; }
.rs-customer:hover { background: var(--bg-hover); }
.rs-customer.on { background: var(--primary-ghost); border-color: var(--primary); }
.rs-customer::before { content: ''; width: 18px; height: 18px; border-radius: 6px; border: 1.5px solid var(--border); flex-shrink: 0; }
.rs-customer.on::before { background: var(--primary); border-color: var(--primary); box-shadow: inset 0 0 0 3px var(--bg-card, #fff); }
.rs-customer-text { flex: 1; min-width: 0; display: flex; flex-direction: column; font-size: 0.78rem; color: var(--text-tertiary); }
.rs-customer-text strong { font-size: 0.9rem; color: var(--text-primary); }
.rs-badge { font-size: 0.68rem; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: var(--warning-bg); color: var(--warning); white-space: nowrap; }
.rs-badge.add { background: var(--success-bg); color: var(--success); }
.rs-hint { font-size: 0.78rem; color: var(--text-tertiary); margin-top: 8px; }
.rs-note { border-radius: 12px; padding: 9px 12px; font-size: 0.84rem; margin: 8px 0; background: var(--bg-input); color: var(--text-secondary); }
.rs-note.warn { background: var(--warning-bg); color: var(--warning); }
.rs-note.error { background: var(--danger-bg); color: var(--danger); }
.rs-empty { color: var(--text-tertiary); font-size: 0.88rem; padding: 24px; text-align: center; }
.rs-foot { border-top: 1px solid var(--border-light); padding: 14px 24px 18px; }
.rs-foot-info { font-size: 0.78rem; color: var(--text-tertiary); margin-bottom: 10px; }
.rs-foot-actions { display: flex; gap: 8px; align-items: center; }
.rs-foot-actions .input { max-width: 240px; margin-right: auto; }
.rs-result { padding: 28px 32px 30px; text-align: center; overflow-y: auto; }
.rs-result-icon { width: 60px; height: 60px; border-radius: 50%; margin: 0 auto 10px; display: flex; align-items: center; justify-content: center; background: var(--success-bg); color: var(--success); font-size: 1.6rem; font-weight: 800; }
.rs-result h3 { margin: 0 0 10px; }
.rs-result ul { list-style: none; padding: 0; margin: 0 0 12px; color: var(--text-secondary); font-size: 0.88rem; }
.rs-result .rs-note { text-align: left; margin: 0 auto 12px; max-width: 560px; }
@media (max-width: 800px) {
    .rs-body { grid-template-columns: 1fr; }
    .rs-days { max-height: 220px; border-right: none; border-bottom: 1px solid var(--border-light); }
    .rs-stats { grid-template-columns: repeat(2, 1fr); }
}
`;
