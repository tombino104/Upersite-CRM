import { useState, useMemo } from 'react';
import {
    LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar
} from 'recharts';

export default function EarningsChartModal({ customers, onClose }) {
    const [view, setView] = useState('monthly'); // 'monthly' | 'status'

    const chartData = useMemo(() => {
        if (view === 'monthly') {
            const months = {};
            customers.forEach(c => {
                const installs = c.installments || [];
                installs.forEach(inst => {
                    if (inst.dueDate) {
                        const date = new Date(inst.dueDate);
                        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                        if (!months[monthKey]) months[monthKey] = { Incassato: 0, DaIncassare: 0 };

                        const amt = parseFloat(inst.amount) || 0;
                        if (inst.paid) {
                            months[monthKey].Incassato += amt;
                        } else {
                            months[monthKey].DaIncassare += amt;
                        }
                    }
                });
            });

            return Object.keys(months).sort().map(key => ({
                name: key,
                Incassato: months[key].Incassato,
                DaIncassare: months[key].DaIncassare
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
    }, [customers, view]);

    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal-content animate-scale-in" style={{ maxWidth: '800px', padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        📈 Statistiche Guadagni
                    </h2>
                    <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                    <button
                        className={`btn ${view === 'monthly' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                        onClick={() => setView('monthly')}
                    >
                        Andamento Mensile
                    </button>
                    <button
                        className={`btn ${view === 'status' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                        onClick={() => setView('status')}
                    >
                        Incassi per Stato
                    </button>
                </div>

                <div style={{ height: '400px', width: '100%', background: 'var(--bg-input)', borderRadius: 'var(--radius-lg)', padding: '20px' }}>
                    {chartData.length === 0 ? (
                        <div className="empty-state" style={{ height: '100%' }}>
                            <div className="empty-state-icon">📊</div>
                            <div className="empty-state-text">Nessun dato sufficiente per il grafico</div>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            {view === 'monthly' ? (
                                <AreaChart data={chartData}>
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
                                    <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={12} tickMargin={10} />
                                    <YAxis stroke="var(--text-secondary)" fontSize={12} tickFormatter={(value) => `€${value}`} width={80} />
                                    <RechartsTooltip
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: 'var(--shadow-lg)' }}
                                        formatter={(value, name) => [`€${value.toLocaleString('it-IT')}`, name === 'DaIncassare' ? 'Da incassare' : name]}
                                    />
                                    <Area type="monotone" dataKey="DaIncassare" stackId="1" stroke="var(--info)" strokeWidth={2} fillOpacity={1} fill="url(#colorPend)" name="Da incassare" />
                                    <Area type="monotone" dataKey="Incassato" stackId="1" stroke="var(--success)" strokeWidth={2} fillOpacity={1} fill="url(#colorInc)" />
                                </AreaChart>
                            ) : (
                                <BarChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                                    <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={12} tickMargin={10} />
                                    <YAxis stroke="var(--text-secondary)" fontSize={12} tickFormatter={(value) => `€${value}`} width={80} />
                                    <RechartsTooltip
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: 'var(--shadow-lg)' }}
                                        formatter={(value, name) => [`€${value.toLocaleString('it-IT')}`, name === 'DaIncassare' ? 'Da incassare' : name]}
                                    />
                                    <Bar dataKey="DaIncassare" name="Da incassare" fill="var(--info)" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="Incassato" fill="var(--success)" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            )}
                        </ResponsiveContainer>
                    )}
                </div>
            </div>
        </div>
    );
}
