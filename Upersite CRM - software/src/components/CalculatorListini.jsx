import { useRef, useState } from 'react';
import {
    LISTINO_GROUPS, LISTINO_DEFAULTS, STANDARD_ID, getAllListini, getListiniState, selectListino, addListino,
    renameListino, deleteListino, setListinoPrice, buildListinoFile, parseListinoFile, diffListini,
    importListini, findListinoByName,
} from '../utils/calcListino';

// Impostazioni → Calcolatore: lista dei listini, prezzi di quello in uso, import ed export in JSON

const hint = { fontSize: '0.7rem', color: 'var(--text-tertiary)' };
const row = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' };
const price = (n) => `€${String(n).replace('.', ',')}`;

function downloadJson(data, name) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const fileSafe = (name) => name.replace(/[\\/:*?"<>|]+/g, '').trim() || 'listino';

export default function CalculatorListini({ settings, updateSettings }) {
    const { listini, activeId } = getListiniState(settings);
    const all = getAllListini(settings);
    const active = all.find(l => l.id === activeId);
    const isStandard = activeId === STANDARD_ID;
    const editedCount = Object.keys(active.prezzi || {}).length;
    const fileRef = useRef(null);
    const [pending, setPending] = useState(null); // listini letti dal file, in attesa di conferma
    const [message, setMessage] = useState(null);

    const apply = (change) => { setMessage(null); updateSettings(change); };

    const create = (title, suggested, prezzi) => {
        const name = prompt(title, suggested);
        if (name?.trim()) apply(addListino(settings, name, prezzi));
    };
    const rename = () => {
        const name = prompt('Nuovo nome del listino', active.nome);
        if (name?.trim()) apply(renameListino(settings, activeId, name));
    };
    const remove = () => {
        if (confirm(`Eliminare il listino «${active.nome}»? Verrà usato Standard. I preventivi già salvati mantengono i loro prezzi.`)) {
            apply(deleteListino(settings, activeId));
        }
    };
    const reset = () => {
        if (confirm(`Riportare tutti i prezzi di «${active.nome}» a quelli di Standard?`)) {
            apply(importListini(settings, [{ nome: active.nome, prezzi: {}, replaceId: activeId }]));
        }
    };

    const readFile = async (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        setMessage(null);
        setPending(null);
        try {
            if (file.size > 1024 * 1024) throw new Error('Il file è troppo grande per essere un listino.');
            setPending(parseListinoFile(await file.text()).map(item => {
                const existing = findListinoByName(settings, item.nome);
                return { ...item, existingId: existing?.id || null, mode: 'copy' };
            }));
        } catch (err) {
            setMessage({ ok: false, text: err.message });
        }
    };

    const confirmImport = () => {
        updateSettings(importListini(settings, pending.map(p => ({ ...p, replaceId: p.mode === 'replace' ? p.existingId : null }))));
        setMessage({ ok: true, text: `${pending.length === 1 ? '1 listino importato' : `${pending.length} listini importati`}. Il listino in uso resta «${active.nome}».` });
        setPending(null);
    };

    return (
        <div className="detail-group">
            <label className="input-label" htmlFor="calcListino">Listino in uso</label>
            <select id="calcListino" className="input" value={activeId} onChange={e => apply(selectListino(settings, e.target.value))}>
                {all.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
            <div style={{ ...row, marginTop: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => create('Nome del nuovo listino (parte dai prezzi Standard)', 'Nuovo listino', {})}>Nuovo</button>
                <button className="btn btn-secondary btn-sm" onClick={() => create('Nome della copia', `${active.nome} (copia)`, active.prezzi)}>Duplica</button>
                <button className="btn btn-secondary btn-sm" onClick={rename} disabled={isStandard}>Rinomina</button>
                <button className="btn btn-secondary btn-sm" onClick={remove} disabled={isStandard}>Elimina</button>
            </div>
            <div style={{ ...row, marginTop: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current.click()}>Importa JSON</button>
                <button className="btn btn-secondary btn-sm" onClick={() => downloadJson(buildListinoFile([active]), `listino - ${fileSafe(active.nome)}.json`)}>Esporta questo</button>
                <button className="btn btn-secondary btn-sm" onClick={() => downloadJson(buildListinoFile(listini), 'listini.json')} disabled={!listini.length}>Esporta tutti</button>
                <input ref={fileRef} type="file" accept=".json,application/json" onChange={readFile} style={{ display: 'none' }} />
            </div>
            {message && <div style={{ ...hint, marginTop: 6, fontWeight: 600, color: message.ok ? 'var(--success)' : 'var(--danger)' }}>{message.ok ? '✅' : '⚠️'} {message.text}</div>}

            {pending && (
                <div style={{ marginTop: 10, padding: 12, border: '1px solid var(--border-light)', borderRadius: 8, fontSize: '0.85rem' }}>
                    <strong>Anteprima importazione</strong>
                    {pending.map((item, i) => {
                        const target = item.mode === 'replace' ? listini.find(l => l.id === item.existingId) : null;
                        const changes = diffListini(target?.prezzi || {}, item.prezzi);
                        return (
                            <div key={i} style={{ marginTop: 10 }}>
                                <div style={row}>
                                    <span style={{ fontWeight: 600 }}>{item.nome}</span>
                                    {item.existingId && (
                                        <select className="input" style={{ width: 'auto' }} value={item.mode}
                                            onChange={e => setPending(pending.map((p, j) => j === i ? { ...p, mode: e.target.value } : p))}>
                                            <option value="copy">Salva come copia</option>
                                            <option value="replace">Sostituisci quello esistente</option>
                                        </select>
                                    )}
                                </div>
                                <details style={{ marginTop: 4 }}>
                                    <summary style={{ cursor: 'pointer' }}>
                                        {changes.length} {changes.length === 1 ? 'voce diversa' : 'voci diverse'} {target ? 'dal listino che sostituisci' : 'da Standard'}
                                    </summary>
                                    {changes.map(c => <div key={c.key}>{c.label}: {price(c.from)} → <strong>{price(c.to)}</strong></div>)}
                                </details>
                                {item.discarded.length > 0 && (
                                    <div style={{ ...hint, color: 'var(--danger)', marginTop: 4 }}>
                                        Voci ignorate (sconosciute o non numeriche): {item.discarded.join(', ')}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    <div style={{ ...row, marginTop: 12 }}>
                        <button className="btn btn-primary btn-sm" onClick={confirmImport}>Importa</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setPending(null)}>Annulla</button>
                    </div>
                </div>
            )}

            <details style={{ marginTop: 14 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}>
                    Prezzi di «{active.nome}» {editedCount > 0 ? `(${editedCount} ${editedCount === 1 ? 'voce diversa' : 'voci diverse'} da Standard)` : ''}
                </summary>
                <div style={{ ...hint, margin: '8px 0 12px' }}>
                    {isStandard
                        ? <><strong>Standard non si modifica.</strong> Usa «Duplica» per creare un listino con prezzi tuoi.</>
                        : 'In giallo le voci diverse da Standard. Svuota una cella per tornare al prezzo Standard.'}{' '}
                    I preventivi salvati si riaprono con i loro prezzi (nel calcolatore puoi aggiornarli al listino in uso).
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
                            <ListinoGroup key={`${activeId}-${group.title}`} group={group} overrides={active.prezzi || {}} disabled={isStandard}
                                onChange={(key, value) => apply(setListinoPrice(settings, activeId, key, value))} />
                        ))}
                    </tbody>
                </table>
                {!isStandard && (
                    <button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={reset} disabled={editedCount === 0}>
                        Riporta ai prezzi Standard
                    </button>
                )}
            </details>
        </div>
    );
}

function ListinoGroup({ group, overrides, disabled, onChange }) {
    return (
        <>
            <tr><td colSpan={3} style={{ padding: '12px 6px 4px', fontWeight: 700, color: 'var(--text-secondary)' }}>{group.title}</td></tr>
            {group.rows.map(r => (
                <tr key={r.price} style={{ borderTop: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '4px 6px' }}>{r.label}</td>
                    <td style={{ padding: '3px 6px' }}><PriceCell field={r.price} overrides={overrides} disabled={disabled} onChange={onChange} /></td>
                    <td style={{ padding: '3px 6px' }}>{r.market ? <PriceCell field={r.market} overrides={overrides} disabled={disabled} onChange={onChange} /> : null}</td>
                </tr>
            ))}
        </>
    );
}

// Valore libero mentre si scrive, salvato all'uscita dalla cella (vuoto = torna al prezzo Standard)
function PriceCell({ field, overrides, disabled, onChange }) {
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
            disabled={disabled}
            value={text ?? String(value).replace('.', ',')}
            title={edited ? `Standard: ${price(LISTINO_DEFAULTS[field])}` : undefined}
            onChange={e => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            style={{ textAlign: 'right', padding: '5px 8px', fontVariantNumeric: 'tabular-nums', background: edited ? '#FEF3C7' : undefined, color: edited ? '#92400E' : undefined }}
        />
    );
}
