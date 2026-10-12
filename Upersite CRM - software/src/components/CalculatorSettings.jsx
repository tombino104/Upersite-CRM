import { useEffect, useState } from 'react';
import { CRM_REQUEST_HEADERS } from '../utils/storage';
import { LISTINO_GROUPS, LISTINO_DEFAULTS, cleanListinoOverrides } from '../utils/calcListino';

// Impostazioni del calcolatore integrato: dove salva configurazioni e pacchetti, import delle
// configurazioni del calcolatore standalone e listino prezzi modificabile.

const sectionTitle = { fontSize: '0.9rem', marginBottom: '16px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' };
const hint = { fontSize: '0.7rem', color: 'var(--text-tertiary)' };
const SETTINGS_APP_ID = 'calcolatore-upersite-impostazioni';

async function postJson(url, body) {
    const res = await fetch(url, { method: 'POST', headers: CRM_REQUEST_HEADERS, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Errore ${res.status}`);
    return data;
}

export default function CalculatorSettings({ settings, updateSettings }) {
    const storage = settings.calcStorage || { mode: 'crm', customPath: '' };
    const [root, setRoot] = useState(null);
    const [rootError, setRootError] = useState('');
    const [verifyMsg, setVerifyMsg] = useState(null);
    const [importPath, setImportPath] = useState('');
    const [importMsg, setImportMsg] = useState(null);
    const [busy, setBusy] = useState(false);

    // Cartella effettiva letta dal server (il file dati si salva dopo ~1s: ricontrolla con un piccolo ritardo)
    useEffect(() => {
        let cancelled = false;
        const t = setTimeout(async () => {
            try {
                const res = await fetch('/api/calc/info');
                const data = await res.json().catch(() => ({}));
                if (cancelled) return;
                if (res.ok) { setRoot(data.root); setRootError(''); } else { setRoot(null); setRootError(data.error || 'Cartella non disponibile'); }
            } catch {
                if (!cancelled) { setRoot(null); setRootError('Server del CRM non raggiungibile'); }
            }
        }, 1500);
        return () => { cancelled = true; clearTimeout(t); };
    }, [storage.mode, storage.customPath, settings.backupPath]);

    const setStorage = (patch) => {
        setVerifyMsg(null);
        updateSettings({ calcStorage: { ...storage, ...patch } });
    };

    const verify = async () => {
        setVerifyMsg(null);
        try {
            await postJson('/api/calc/verify', { path: storage.customPath });
            setVerifyMsg({ ok: true, text: 'Cartella valida e scrivibile.' });
        } catch (err) {
            setVerifyMsg({ ok: false, text: err.message });
        }
    };

    const runImport = async () => {
        setImportMsg(null);
        setBusy(true);
        try {
            const r = await postJson('/api/calc/import', { from: importPath.trim() });
            let text = `Copiate ${r.copied} configurazioni in ${r.dest}` + (r.skipped ? ` (${r.skipped} già presenti, lasciate invariate)` : '') + '. Gli originali non sono stati toccati.';
            const s = r.settings;
            if (s && s.app === SETTINGS_APP_ID && s.costData && typeof s.costData === 'object') {
                const when = s.savedAt ? new Date(s.savedAt).toLocaleString('it-IT') : 'data sconosciuta';
                if (confirm(`Nella cartella c'è anche il backup delle impostazioni del calcolatore (${when}): costi fissi, listino ore e redditività.\n\nUsarle nel CRM? Quelle attuali del calcolatore integrato verranno sostituite.`)) {
                    updateSettings({
                        calc: { costData: s.costData, hoursDefaults: s.hoursDefaults || {}, margin: s.margin || null },
                        calcEpoch: (settings.calcEpoch || 0) + 1,
                    });
                    text += ' Impostazioni (costi fissi, ore, redditività) importate.';
                }
            }
            setImportMsg({ ok: true, text });
        } catch (err) {
            setImportMsg({ ok: false, text: err.message });
        } finally {
            setBusy(false);
        }
    };

    const overrides = cleanListinoOverrides(settings.calcListino);
    const editedCount = Object.keys(overrides).length;

    const setPrice = (key, value) => {
        const next = { ...overrides };
        if (value === null || value === LISTINO_DEFAULTS[key]) delete next[key];
        else next[key] = value;
        updateSettings({ calcListino: next });
    };

    const resetListino = () => {
        if (!confirm('Ripristinare tutti i prezzi del listino originale del calcolatore?')) return;
        updateSettings({ calcListino: {} });
    };

    return (
        <div className="settings-section" style={{ marginBottom: '32px', padding: '20px', background: 'var(--bg-hover)', borderRadius: 'var(--radius-lg)' }}>
            <h3 style={sectionTitle}>🧮 Calcolatore preventivi</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="detail-group">
                    <label className="input-label">Dove salva configurazioni e pacchetti completi</label>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '0.88rem', cursor: 'pointer' }}>
                        <input type="radio" name="calcStorage" checked={storage.mode !== 'custom'} onChange={() => setStorage({ mode: 'crm' })} style={{ marginTop: 3 }} />
                        <span><strong>Insieme ai backup del CRM</strong> (consigliato): sottocartella <strong>Calcolatore</strong> della cartella dei backup, copiata anche nei backup con data</span>
                    </label>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '0.88rem', cursor: 'pointer', marginTop: 6 }}>
                        <input type="radio" name="calcStorage" checked={storage.mode === 'custom'} onChange={() => setStorage({ mode: 'custom' })} style={{ marginTop: 3 }} />
                        <span><strong>Cartella a scelta</strong></span>
                    </label>
                    {storage.mode === 'custom' && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <input type="text" className="input" value={storage.customPath || ''} placeholder="D:\Lavoro\Calcolatore"
                                onChange={e => setStorage({ customPath: e.target.value })} />
                            <button className="btn btn-secondary btn-sm" onClick={verify} disabled={!storage.customPath}>Verifica</button>
                        </div>
                    )}
                    {verifyMsg && <div style={{ ...hint, marginTop: 6, fontWeight: 600, color: verifyMsg.ok ? 'var(--success)' : 'var(--danger)' }}>{verifyMsg.ok ? '✅' : '⚠️'} {verifyMsg.text}</div>}
                    <span style={{ ...hint, marginTop: 6 }}>
                        {root
                            ? <>Cartella attuale: <strong>{root}</strong> (configurazioni in <strong>Configurazioni</strong>, pacchetti in <strong>Pacchetti</strong>)</>
                            : rootError ? <span style={{ color: 'var(--danger)' }}>⚠️ {rootError}</span> : 'Controllo la cartella…'}
                    </span>
                </div>

                <div className="detail-group">
                    <label className="input-label">Importa configurazioni del calcolatore standalone</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input type="text" className="input" value={importPath} onChange={e => setImportPath(e.target.value)}
                            placeholder="C:\...\CALCOLATORE\configurazioni-salvate" />
                        <button className="btn btn-secondary btn-sm" onClick={runImport} disabled={!importPath.trim() || busy}>{busy ? 'Copio…' : 'Importa (copia)'}</button>
                    </div>
                    <span style={hint}>Copia i file .json nella cartella del calcolatore senza spostare né modificare gli originali. Se c'è il backup delle impostazioni (costi fissi, ore, redditività) ti chiede se usarlo.</span>
                    {importMsg && <div style={{ ...hint, marginTop: 6, fontWeight: 600, color: importMsg.ok ? 'var(--success)' : 'var(--danger)' }}>{importMsg.ok ? '✅' : '⚠️'} {importMsg.text}</div>}
                </div>

                <details>
                    <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}>
                        Listino prezzi {editedCount > 0 ? `(${editedCount} ${editedCount === 1 ? 'voce modificata' : 'voci modificate'})` : '(originale)'}
                    </summary>
                    <div style={{ ...hint, margin: '8px 0 12px' }}>
                        I prezzi valgono per i nuovi calcoli: le configurazioni salvate vengono ricalcolate quando le riapri
                        (il calcolatore avvisa se il totale è cambiato). In giallo le voci diverse dal listino originale.
                        Costi fissi, listino ore e redditività si modificano nelle loro tab dentro il calcolatore.
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ color: 'var(--text-tertiary)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                <th style={{ textAlign: 'left', padding: '4px 6px' }}>Voce</th>
                                <th style={{ textAlign: 'right', padding: '4px 6px', width: 110 }}>Prezzo €</th>
                                <th style={{ textAlign: 'right', padding: '4px 6px', width: 110 }}>Mercato €</th>
                            </tr>
                        </thead>
                        <tbody>
                            {LISTINO_GROUPS.map(group => (
                                <ListinoGroup key={group.title} group={group} overrides={overrides} onChange={setPrice} />
                            ))}
                        </tbody>
                    </table>
                    <button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={resetListino} disabled={editedCount === 0}>
                        Ripristina listino originale
                    </button>
                </details>
            </div>
        </div>
    );
}

function ListinoGroup({ group, overrides, onChange }) {
    return (
        <>
            <tr><td colSpan={3} style={{ padding: '12px 6px 4px', fontWeight: 700, color: 'var(--text-secondary)' }}>{group.title}</td></tr>
            {group.rows.map(row => (
                <tr key={row.price} style={{ borderTop: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '4px 6px' }}>{row.label}</td>
                    <td style={{ padding: '3px 6px' }}><PriceCell field={row.price} overrides={overrides} onChange={onChange} /></td>
                    <td style={{ padding: '3px 6px' }}>{row.market ? <PriceCell field={row.market} overrides={overrides} onChange={onChange} /> : null}</td>
                </tr>
            ))}
        </>
    );
}

// Valore libero mentre si scrive, salvato all'uscita dalla cella (vuoto = torna al prezzo originale)
function PriceCell({ field, overrides, onChange }) {
    const value = field in overrides ? overrides[field] : LISTINO_DEFAULTS[field];
    const [text, setText] = useState(null);
    const edited = field in overrides;
    const commit = () => {
        if (text === null) return;
        const clean = text.trim().replace(',', '.');
        const n = parseFloat(clean);
        if (clean === '') onChange(field, null);
        else if (isFinite(n) && n >= 0) onChange(field, Math.round(n * 100) / 100);
        setText(null);
    };
    return (
        <input
            className="input"
            inputMode="decimal"
            value={text ?? String(value).replace('.', ',')}
            title={edited ? `Originale: €${LISTINO_DEFAULTS[field]}` : undefined}
            onChange={e => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            style={{ textAlign: 'right', padding: '5px 8px', fontVariantNumeric: 'tabular-nums', background: edited ? '#FEF3C7' : undefined, color: edited ? '#92400E' : undefined }}
        />
    );
}
