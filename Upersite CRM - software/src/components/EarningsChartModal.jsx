import { useState, useMemo } from 'react';
import {
    LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar
} from 'recharts';

export default function EarningsChartModal({ customers, onClose }) {
    const [view, setView] = useState('monthly'); // 'monthly' | 'status'
    const [range, setRange] = useState('12m'); // '3m' | '6m' | '12m' | 'ytd' | 'all'
    const [granularity, setGranularity] = useState('month'); // 'week' | 'month'

    const parseDate = (d) => {
        const dt = new Date(d);
        return isNaN(dt.getTime()) ? null : dt;
    };

    const startDate = useMemo(() => {
        const now = new Date();
        if (range === 'all') return null;
        if (range === 'ytd') return new Date(now.getFullYear(), 0, 1);
        const months = range === '3m' ? 3 : range === '6m' ? 6 : 12;
        const d = new Date(now);
        d.setMonth(d.getMonth() - months + 1);
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        return d;
    }, [range]);

    // End date should be end of the current period to avoid future noise
    const endDate = useMemo(() => {
        const now = new Date();
        now.setHours(23, 59, 59, 999);
        return now;
    }, []);

    const formatKey = (date) => {
        if (granularity === 'week') {
            const d = new Date(date);
            const day = d.getDay();
            const diff = (day === 0 ? -6 : 1) - day;
            d.setDate(d.getDate() + diff);
            d.setHours(0, 0, 0, 0);
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;
        }
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        return `${yyyy}-${mm}`;
    };

    const formatLabel = (key) => {
        if (granularity === 'week') {
            const [y, m, d] = key.split('-').map(Number);
            const dt = new Date(y, (m || 1) - 1, d || 1);
            return `Sett. ${dt.toLocaleDateString('it-IT')}`;
        }
        const [y, m] = key.split('-').map(Number);
        const dt = new Date(y, (m || 1) - 1, 1);
        return dt.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' });
    };

    const aggregatedData = useMemo(() => {
        if (view === 'monthly') {
            const dataMap = {};
            
            // Populate timeline with zeros
            if (startDate) {
                let curr = new Date(startDate);
                while (curr <= endDate) {
                    const key = formatKey(curr);
                    if (!dataMap[key]) dataMap[key] = { Incassato: 0, DaIncassare: 0, Clienti: 0 };
                    if (granularity === 'week') curr.setDate(curr.getDate() + 7);
                    else curr.setMonth(curr.getMonth() + 1);
                }
            }

            customers.forEach(c => {
                // Acquisition count
                const createDate = parseDate(c.createdAt || (c.installments && c.installments[0]?.dueDate));
                if (createDate && (!startDate || createDate >= startDate) && createDate <= endDate) {
                    const key = formatKey(createDate);
                    if (!dataMap[key]) dataMap[key] = { Incassato: 0, DaIncassare: 0, Clienti: 0 };
                    dataMap[key].Clienti += 1;
                }

                // Earnings
                const installs = c.installments || [];
                installs.forEach(inst => {
                    if (inst.dueDate) {
                        const date = parseDate(inst.dueDate);
                        // Only show data up to current period or historical
                        if (!date || (startDate && date < startDate) || date > endDate) return;

                        const key = formatKey(date);
                        if (!dataMap[key]) dataMap[key] = { Incassato: 0, DaIncassare: 0, Clienti: 0 };

                        const amt = parseFloat(inst.amount) || 0;
                        if (inst.paid) {
                            dataMap[key].Incassato += amt;
                        } else {
                            dataMap[key].DaIncassare += amt;
                        }
                    }
                });
            });

            return Object.keys(dataMap).sort().map(key => ({
                name: formatLabel(key),
                key,
                ...dataMap[key]
            }));
        }

        if (view === 'status') {
            const data = [
                { name: 'Prospect', Incassato: 0, DaIncassare: 0 },
                { name: 'In lavorazione', Incassato: 0, DaIncassare: 0 },
                { name: 'Completato', Incassato: 0, DaIncassare: 0 },
                { name: 'Sospeso', Incassato: 0, DaIncassare: 0 }
            ];

            const STATUS_MAP = {
                'prospect': 0, 'working': 1, 'completed': 2, 'paused': 3
            };

            customers.forEach(c => {
                const idx = STATUS_MAP[c.status || 'prospect'];
                if (idx !== undefined) {
                    const installs = c.installments || [];
                    installs.forEach(i => {
                        const amt = parseFloat(i.amount) || 0;
                        if (i.paid) data[idx].Incassato += amt;
                        else data[idx].DaIncassare += amt;
                    });
                }
            });

            return data;
        }

        return [];
    }, [customers, view, startDate, endDate, granularity]);

    const currencyFmt = (n) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n || 0);

    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal-content animate-scale-in" style={{ maxWidth: '900px', padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        📈 Statistiche CRM
                    </h2>
                    <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
                    <button
                        className={`btn ${view === 'monthly' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                        onClick={() => setView('monthly')}
                    >
                        Andamento Temporale
                    </button>
                    <button
                        className={`btn ${view === 'status' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                        onClick={() => setView('status')}
                    >
                        Incassi per Stato
                    </button>
                </div>

                {view === 'monthly' && (
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 700 }}>Periodo:</span>
                            <select className="input" value={range} onChange={e => setRange(e.target.value)} style={{ padding: '6px 10px', fontSize: '0.85rem' }}>
                                <option value="3m">Ultimi 3 mesi</option>
                                <option value="6m">Ultimi 6 mesi</option>
                                <option value="12m">Ultimi 12 mesi</option>
                                <option value="ytd">Da inizio anno</option>
                                <option value="all">Tutto</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 700 }}>Raggruppa:</span>
                            <select className="input" value={granularity} onChange={e => setGranularity(e.target.value)} style={{ padding: '6px 10px', fontSize: '0.85rem' }}>
                                <option value="month">Mensile</option>
                                <option value="week">Settimanale</option>
                            </select>
                        </div>
                    </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <div className="chart-container">
                        <h3 className="chart-title">💰 Entrate e Pendenze</h3>
                        <div style={{ height: '300px', width: '100%', background: 'var(--bg-input)', borderRadius: 'var(--radius-lg)', padding: '20px' }}>
                            {aggregatedData.length === 0 ? (
                                <div className="empty-state" style={{ height: '100%' }}>
                                    <div className="empty-state-icon">📊</div>
                                    <div className="empty-state-text">Nessun dato sufficiente</div>
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    {view === 'monthly' ? (
                                        <AreaChart data={aggregatedData}>
                                            <defs>
                                                <linearGradient id="colorInc" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="var(--success)" stopOpacity={0.8} />
                                                    <stop offset="95%" stopColor="var(--success)" stopOpacity={0} />
                                                </linearGradient>
                                                <linearGradient id="colorPend" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="var(--info)" stopOpacity={0.8} />
                                                    <stop offset="95%" stopColor="var(--info)" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                                            <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={11} tickMargin={10} />
                                            <YAxis stroke="var(--text-secondary)" fontSize={11} tickFormatter={(value) => `€${value}`} width={60} />
                                            <RechartsTooltip
                                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: 'var(--shadow-lg)' }}
                                                formatter={(value, name) => [currencyFmt(value), name === 'DaIncassare' ? 'Da incassare' : name]}
                                            />
                                            <Area type="monotone" dataKey="DaIncassare" stackId="1" stroke="var(--info)" strokeWidth={2} fillOpacity={1} fill="url(#colorPend)" name="Da incassare" />
                                            <Area type="monotone" dataKey="Incassato" stackId="1" stroke="var(--success)" strokeWidth={2} fillOpacity={1} fill="url(#colorInc)" />
                                        </AreaChart>
                                    ) : (
                                        <BarChart data={aggregatedData}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                                            <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={11} tickMargin={10} />
                                            <YAxis stroke="var(--text-secondary)" fontSize={11} tickFormatter={(value) => `€${value}`} width={60} />
                                            <RechartsTooltip
                                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: 'var(--shadow-lg)' }}
                                                formatter={(value, name) => [currencyFmt(value), name === 'DaIncassare' ? 'Da incassare' : name]}
                                            />
                                            <Bar dataKey="DaIncassare" name="Da incassare" fill="var(--info)" radius={[4, 4, 0, 0]} />
                                            <Bar dataKey="Incassato" fill="var(--success)" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    )}
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>

                    {view === 'monthly' && (
                        <div className="chart-container">
                            <h3 className="chart-title">👥 Nuovi Clienti Acquisiti</h3>
                            <div style={{ height: '300px', width: '100%', background: 'var(--bg-input)', borderRadius: 'var(--radius-lg)', padding: '20px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={aggregatedData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                                        <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={11} tickMargin={10} />
                                        <YAxis stroke="var(--text-secondary)" fontSize={11} allowDecimals={false} width={30} />
                                        <RechartsTooltip
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: 'var(--shadow-lg)' }}
                                            formatter={(value) => [`${value} clienti`, 'Acquisiti']}
                                        />
                                        <Bar dataKey="Clienti" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}
                </div>

                <style>{`
                    .chart-container {
                        display: flex;
                        flex-direction: column;
                        gap: 12px;
                    }
                    .chart-title {
                        font-size: 0.875rem;
                        font-weight: 700;
                        color: var(--text-secondary);
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                        margin: 0;
                    }
                `}</style>
            </div>
        </div>
    );
}
