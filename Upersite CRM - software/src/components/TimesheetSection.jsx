import React, { useState, useMemo } from 'react';
import {
    BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer
} from 'recharts';
import { generateId } from '../utils/storage';

const PRIMARY = '#6C5CE7';

const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Accetta "1.5", "1,5" oppure "1:30" e restituisce le ore in decimale (0 se non valido)
const parseHours = (value) => {
    const text = String(value ?? '').trim().replace(',', '.');
    if (!text) return 0;
    if (text.includes(':')) {
        const [h, m] = text.split(':');
        const hours = (parseInt(h, 10) || 0) + (parseInt(m, 10) || 0) / 60;
        return hours > 0 ? hours : 0;
    }
    const n = parseFloat(text);
    return Number.isFinite(n) && n > 0 ? n : 0;
};

const formatHours = (hours) => {
    const totalMinutes = Math.round(hours * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, '0')}m`;
};

const hoursToInput = (hours) => String(Math.round(hours * 100) / 100).replace('.', ',');

const formatDate = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('it-IT');

const money = (n) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);

const monthLabel = (key, short = false) => {
    const [y, m] = key.split('-');
    const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('it-IT', short ? { month: 'short', year: '2-digit' } : { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
};

// Lunedì della settimana di una data ISO
const weekStart = (iso) => {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return toISO(d);
};

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const cellInput = {
    width: '100%',
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: '8px',
    outline: 'none',
    padding: '9px 10px',
    fontSize: '0.875rem',
    color: 'inherit',
    fontFamily: 'inherit',
    fontVariantNumeric: 'tabular-nums'
};

// Finestra "Fogli ore" di un cliente: tabella modificabile stile foglio di calcolo, grafici e guadagno €/ora.
// `projectValue` = valore del progetto (preventivo o somma rate), `paidAmount` = quanto incassato finora.
const TimesheetSection = ({ customerName, entries: rawEntries, onChange, projectValue, paidAmount, onClose }) => {
    const entries = useMemo(() => rawEntries || [], [rawEntries]);
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [chartMode, setChartMode] = useState('month'); // 'month' | 'week'
    const [draft, setDraft] = useState({ date: toISO(new Date()), hours: '', description: '' });
    const [confirmId, setConfirmId] = useState(null);

    // Ordine cronologico (dal più vecchio): serve per il cumulato e per leggere la tabella come un registro
    const filtered = useMemo(() => entries
        .filter(e => (!from || e.date >= from) && (!to || e.date <= to))
        .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || '')),
    [entries, from, to]);

    const totalHours = filtered.reduce((s, e) => s + e.hours, 0);
    const allHours = entries.reduce((s, e) => s + e.hours, 0);
    const daysWorked = new Set(filtered.map(e => e.date)).size;

    // Il guadagno €/ora riguarda tutto il progetto, quindi usa sempre tutte le ore (non il filtro per periodo)
    const rateProject = allHours > 0 && projectValue > 0 ? projectValue / allHours : null;
    const rateCollected = allHours > 0 && paidAmount > 0 ? paidAmount / allHours : null;

    const chartData = useMemo(() => {
        const map = {};
        filtered.forEach(e => {
            const key = chartMode === 'month' ? e.date.slice(0, 7) : weekStart(e.date);
            map[key] = (map[key] || 0) + e.hours;
        });
        return Object.keys(map).sort().map(key => ({
            label: chartMode === 'month' ? monthLabel(key, true) : formatDate(key).slice(0, 5),
            ore: Math.round(map[key] * 100) / 100
        }));
    }, [filtered, chartMode]);

    // Ore cumulate fino a ciascuna riga (usate dal grafico e dalla colonna "Cumulato")
    const cumulative = useMemo(
        () => filtered.map((e, i) => filtered.slice(0, i + 1).reduce((s, x) => s + x.hours, 0)),
        [filtered]
    );

    const cumulativeData = useMemo(
        () => filtered.map((e, i) => ({ label: formatDate(e.date).slice(0, 5), cumulato: Math.round(cumulative[i] * 100) / 100 })),
        [filtered, cumulative]
    );

    const setRange = (range) => {
        const now = new Date();
        if (range === 'month') {
            setFrom(toISO(new Date(now.getFullYear(), now.getMonth(), 1)));
            setTo(toISO(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
        } else if (range === 'lastMonth') {
            setFrom(toISO(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
            setTo(toISO(new Date(now.getFullYear(), now.getMonth(), 0)));
        } else {
            setFrom('');
            setTo('');
        }
    };

    const patchEntry = (id, patch) => onChange(entries.map(e => e.id === id ? { ...e, ...patch } : e));

    const addEntry = () => {
        const hours = parseHours(draft.hours);
        if (!draft.date || hours <= 0) return;
        onChange([...entries, {
            id: generateId(),
            date: draft.date,
            hours,
            description: draft.description.trim(),
            createdAt: new Date().toISOString()
        }]);
        setDraft({ ...draft, hours: '', description: '' });
    };

    const removeEntry = (id) => {
        onChange(entries.filter(e => e.id !== id));
        setConfirmId(null);
    };

    const periodLabel = from || to
        ? `${from ? formatDate(from) : 'inizio'} – ${to ? formatDate(to) : 'oggi'}`
        : 'Tutto il periodo';

    const fileBase = `FoglioOre_${(customerName || 'cliente').replace(/[^\w-]+/g, '_')}`;

    const exportCSV = () => {
        const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
        const rows = [['Data', 'Ore', 'Descrizione'].map(q).join(';')];
        filtered.forEach(e => {
            rows.push([q(formatDate(e.date)), q(hoursToInput(e.hours)), q(e.description || '')].join(';'));
        });
        rows.push([q('TOTALE'), q(hoursToInput(totalHours)), q('')].join(';'));
        const blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${fileBase}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };

    // PDF: apre una pagina pulita pronta per la stampa, da salvare come PDF dal dialogo di stampa
    const exportPDF = () => {
        const win = window.open('', '_blank');
        if (!win) {
            alert('Il browser ha bloccato la finestra di stampa. Consenti i popup e riprova.');
            return;
        }
        const rows = filtered.map(e =>
            `<tr><td>${formatDate(e.date)}</td><td class="r">${formatHours(e.hours)}</td><td>${escapeHtml(e.description || '')}</td></tr>`
        ).join('');
        win.document.write(`<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${escapeHtml(fileBase)}</title>
<style>
body{font-family:Arial,sans-serif;color:#222;margin:32px}
h1{font-size:20px;margin:0 0 4px}
p{margin:0 0 20px;color:#666;font-size:13px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left;vertical-align:top}
th{background:#f3f3f7}
.r{text-align:right;white-space:nowrap}
tfoot td{font-weight:bold;border-top:2px solid #222}
</style></head><body>
<h1>Foglio ore – ${escapeHtml(customerName || '')}</h1>
<p>${escapeHtml(periodLabel)}</p>
<table><thead><tr><th>Data</th><th class="r">Ore</th><th>Descrizione</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr><td>Totale</td><td class="r">${formatHours(totalHours)}</td><td></td></tr></tfoot></table>
<script>window.onload=function(){window.print()}</script>
</body></html>`);
        win.document.close();
    };

    const kpi = (label, value, sub, accent = 'var(--text-primary)', tint = 'var(--bg-input)') => (
        <div style={{ flex: '1 1 170px', padding: '16px 18px', background: tint, borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-secondary)' }}>{label}</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, lineHeight: 1.2, color: accent, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
            {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', opacity: 0.8 }}>{sub}</div>}
        </div>
    );

    return (
        <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal-content" style={{ maxWidth: '1000px', maxHeight: '94vh' }}>
                <style>{`
                    .ts-table input:hover { background: var(--bg-hover); }
                    .ts-table input:focus { background: var(--bg-card); border-color: var(--primary) !important; box-shadow: 0 0 0 3px var(--primary-ghost); }
                    .ts-table input::placeholder { color: var(--text-tertiary); }
                    .ts-table input[type="date"]::-webkit-calendar-picker-indicator { opacity: 0.35; cursor: pointer; }
                    .ts-table input[type="date"]:hover::-webkit-calendar-picker-indicator { opacity: 0.8; }
                    .ts-row:hover { background: var(--bg-hover); }
                    .ts-row:hover input { background: transparent; }
                    .ts-row:hover input:focus { background: var(--bg-card); }
                    .ts-filter-date { width: auto; padding: 7px 10px; font-size: 0.8125rem; border-radius: 10px; }
                    .ts-body .btn-sm { border-radius: 999px; }
                `}</style>
                <div className="modal-header" style={{ padding: '22px 28px 4px', borderBottom: 'none' }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>⏱️ Fogli ore – {customerName}</h2>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button className="btn btn-ghost btn-sm" onClick={exportCSV} disabled={filtered.length === 0}>⬇ CSV</button>
                        <button className="btn btn-ghost btn-sm" onClick={exportPDF} disabled={filtered.length === 0}>⬇ PDF</button>
                        <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
                    </div>
                </div>

                <div className="ts-body" style={{ padding: '20px 28px 28px' }}>
                    <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '20px' }}>
                        {kpi('Ore lavorate', formatHours(totalHours), `${filtered.length} righe · ${daysWorked} ${daysWorked === 1 ? 'giorno' : 'giorni'}`, PRIMARY, 'var(--primary-ghost)')}
                        {kpi('Valore progetto', projectValue > 0 ? money(projectValue) : '—', projectValue > 0 ? 'preventivo / somma rate' : 'imposta preventivo o rate')}
                        {kpi('Guadagno €/ora', rateProject ? money(rateProject) : '—', 'valore progetto ÷ tutte le ore', 'var(--success)', 'var(--success-bg)')}
                        {kpi('€/ora incassato', rateCollected ? money(rateCollected) : '—', `incassato ${money(paidAmount || 0)}`)}
                    </div>

                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '22px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Periodo</span>
                        <input type="date" className="input ts-filter-date" value={from} onChange={e => setFrom(e.target.value)} />
                        <span style={{ color: 'var(--text-tertiary)' }}>→</span>
                        <input type="date" className="input ts-filter-date" value={to} onChange={e => setTo(e.target.value)} />
                        <button className="btn btn-ghost btn-sm" onClick={() => setRange('month')}>Questo mese</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setRange('lastMonth')}>Mese scorso</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setRange('all')}>Tutto</button>
                    </div>

                    {filtered.length > 0 && (
                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
                            <div style={{ flex: '1 1 340px', minWidth: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <strong style={{ fontSize: '0.85rem' }}>Ore per {chartMode === 'month' ? 'mese' : 'settimana'}</strong>
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                        <button className={`btn btn-sm ${chartMode === 'month' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setChartMode('month')}>Mesi</button>
                                        <button className={`btn btn-sm ${chartMode === 'week' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setChartMode('week')}>Settimane</button>
                                    </div>
                                </div>
                                <div style={{ height: 200 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#8884" />
                                            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                                            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                                            <RechartsTooltip formatter={(v) => [formatHours(v), 'Ore']} />
                                            <Bar dataKey="ore" fill={PRIMARY} radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                            <div style={{ flex: '1 1 340px', minWidth: 0 }}>
                                <strong style={{ fontSize: '0.85rem', display: 'block', marginBottom: '4px' }}>Ore cumulate</strong>
                                <div style={{ height: 200 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={cumulativeData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#8884" />
                                            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                                            <YAxis tick={{ fontSize: 11 }} />
                                            <RechartsTooltip formatter={(v) => [formatHours(v), 'Totale']} />
                                            <Area type="monotone" dataKey="cumulato" stroke={PRIMARY} fill={PRIMARY} fillOpacity={0.2} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Tabella stile foglio di calcolo: le celle si modificano direttamente */}
                    <div style={{ border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
                        <table className="ts-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-input)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                    <th style={{ width: 44, padding: '12px 8px', textAlign: 'center' }}>#</th>
                                    <th style={{ width: 150, padding: '12px 8px', textAlign: 'left' }}>Data</th>
                                    <th style={{ width: 110, padding: '12px 14px', textAlign: 'right' }}>Ore</th>
                                    <th style={{ padding: '12px 8px', textAlign: 'left' }}>Descrizione</th>
                                    <th style={{ width: 100, padding: '12px 14px', textAlign: 'right' }}>Cumulato</th>
                                    <th style={{ width: 44 }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((entry, i) => {
                                    return (
                                        <React.Fragment key={entry.id}>
                                            <tr className="ts-row" style={{ borderTop: '1px solid var(--border)' }}>
                                                <td style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{i + 1}</td>
                                                <td>
                                                    <input type="date" style={cellInput} value={entry.date}
                                                        onChange={e => e.target.value && patchEntry(entry.id, { date: e.target.value })} />
                                                </td>
                                                <td>
                                                    <HoursCell hours={entry.hours} onCommit={h => patchEntry(entry.id, { hours: h })} />
                                                </td>
                                                <td>
                                                    <DescriptionCell value={entry.description || ''} onCommit={v => patchEntry(entry.id, { description: v })} />
                                                </td>
                                                <td style={{ textAlign: 'right', padding: '0 14px', fontSize: '0.8rem', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{formatHours(cumulative[i])}</td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <button className="btn btn-ghost btn-icon-sm" title="Elimina riga" onClick={() => setConfirmId(entry.id)}>✕</button>
                                                </td>
                                            </tr>
                                            {confirmId === entry.id && (
                                                <tr>
                                                    <td colSpan={6} style={{ padding: '8px 12px', background: 'var(--bg-card)', borderTop: '1px solid var(--danger)', fontSize: '0.8rem' }}>
                                                        Eliminare la riga del {formatDate(entry.date)} ({formatHours(entry.hours)})?
                                                        <span style={{ float: 'right', display: 'inline-flex', gap: '8px' }}>
                                                            <button className="btn btn-ghost btn-sm" onClick={() => setConfirmId(null)}>Annulla</button>
                                                            <button className="btn btn-danger btn-sm" onClick={() => removeEntry(entry.id)}>Elimina</button>
                                                        </span>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}

                                {/* Riga di inserimento: Invio per aggiungere */}
                                <tr style={{ borderTop: '1px solid var(--border)', background: 'var(--primary-ghost)' }}
                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEntry(); } }}>
                                    <td style={{ textAlign: 'center', color: 'var(--primary)', fontWeight: 700 }}>+</td>
                                    <td><input type="date" style={cellInput} value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} /></td>
                                    <td><input style={{ ...cellInput, textAlign: 'right' }} placeholder="1,5 / 1:30" value={draft.hours}
                                        onChange={e => setDraft({ ...draft, hours: e.target.value })} /></td>
                                    <td><input style={cellInput} placeholder="Cosa hai fatto (Invio per aggiungere)" value={draft.description}
                                        onChange={e => setDraft({ ...draft, description: e.target.value })} /></td>
                                    <td colSpan={2} style={{ textAlign: 'center' }}>
                                        <button className="btn btn-primary btn-sm" onClick={addEntry} disabled={parseHours(draft.hours) <= 0 || !draft.date}>Aggiungi</button>
                                    </td>
                                </tr>
                            </tbody>
                            <tfoot>
                                <tr style={{ borderTop: '1px solid var(--border)', fontWeight: 600, background: 'var(--bg-input)' }}>
                                    <td></td>
                                    <td style={{ padding: '12px 10px' }}>Totale</td>
                                    <td style={{ padding: '12px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatHours(totalHours)}</td>
                                    <td colSpan={3}></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {entries.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '20px 16px 4px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                            Nessuna ora registrata. Compila la riga in alto e premi Invio per iniziare.
                        </div>
                    )}
                    {entries.length > 0 && filtered.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
                            Nessuna riga nel periodo selezionato.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// Cella ore: il testo resta libero mentre si digita e viene validato quando si esce dalla cella
function HoursCell({ hours, onCommit }) {
    const [text, setText] = useState(null);
    const commit = () => {
        const h = parseHours(text);
        if (h > 0 && Math.abs(h - hours) > 1e-9) onCommit(h);
        setText(null);
    };
    return (
        <input style={{ ...cellInput, textAlign: 'right', fontWeight: 600 }}
            value={text ?? hoursToInput(hours)}
            onChange={e => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
    );
}

function DescriptionCell({ value, onCommit }) {
    const [text, setText] = useState(null);
    const commit = () => {
        if (text !== null && text !== value) onCommit(text.trim());
        setText(null);
    };
    return (
        <input style={cellInput} value={text ?? value}
            onChange={e => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
    );
}

export default TimesheetSection;
