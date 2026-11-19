import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DASHBOARD_URL, INTEGRATIONS_URL, STATUS, monitorUrl,
  normalizeStatus, fetchMonitors, fetchUptimeStats, fetchIncidents,
  cachedData, MONITORS_KEY, describeError,
  parseDate, formatDuration, formatDateTime, expiryInfo,
  dayHistogram, dayUptime, typeLabel, intervalLabel, incidentReason,
  customerForMonitor, suggestCustomer,
} from '../utils/uptimeRobot';

const REFRESH_MS = 60 * 1000; // piano free: max 10 richieste/minuto
const LEVEL_COLOR = { ok: 'var(--text-secondary)', warning: '#E1A100', danger: '#C24E36' };

const linkBtn = {
  border: '1px solid rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.08)', color: '#059669',
  borderRadius: 999, padding: '3px 10px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
};

// ─── Configurazione API key ───────────────────────────────────────────────────
function ApiKeySetup({ apiKey, onSave, onCancel }) {
  const [draft, setDraft] = useState('');
  const save = () => { if (draft.trim()) onSave(draft.trim()); };
  return (
    <div style={{ maxWidth: 520, margin: '40px auto', padding: '0 24px' }}>
      <h3 style={{ margin: '0 0 8px', color: 'var(--text-primary)' }}>Collega UptimeRobot</h3>
      <p style={{ margin: '0 0 18px', color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
        Crea una <strong>API key read-only</strong> in UptimeRobot (Integrations → API) e incollala qui.
        Read-only significa che il CRM può solo leggere lo stato dei monitor, non modificarli.
      </p>
      <a href={INTEGRATIONS_URL} target="_blank" rel="noreferrer" style={{ fontSize: '0.85rem', color: '#059669', fontWeight: 600 }}>
        Apri la pagina Integrations di UptimeRobot ↗
      </a>
      <label className="input-label" style={{ display: 'block', marginTop: 20 }}>API key read-only</label>
      <input
        type="password" className="input" value={draft} autoFocus placeholder="ur..."
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); }}
        style={{ width: '100%' }}
      />
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button className="btn btn-primary" disabled={!draft.trim()} onClick={save}>Salva e collega</button>
        {apiKey && <button className="btn btn-secondary" onClick={onCancel}>Annulla</button>}
      </div>
    </div>
  );
}

// ─── Barretta uptime ultime 24h ───────────────────────────────────────────────
function DayBars({ monitor }) {
  const hist = dayHistogram(monitor);
  if (!hist.length) return null;
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'stretch', height: 22, width: 150, flexShrink: 0 }} title="Uptime ultime 24 ore">
      {hist.map((b, i) => {
        const color = b.uptime >= 99.9 ? '#10B981' : b.uptime >= 95 ? '#E3A93C' : '#C24E36';
        return (
          <span key={i} title={`${b.ts ? formatDateTime(b.ts) + ' · ' : ''}${b.uptime.toFixed(2)}%`}
            style={{ flex: 1, minWidth: 2, borderRadius: 2, background: color, opacity: b.uptime >= 99.9 ? 0.75 : 1 }} />
        );
      })}
    </div>
  );
}

// ─── Collegamento a un cliente ────────────────────────────────────────────────
function CustomerLink({ monitor, customers, onLink, onOpenCustomer }) {
  const [picking, setPicking] = useState(false);
  const linked = customerForMonitor(customers, monitor.id);
  const suggested = !linked ? suggestCustomer(customers, monitor) : null;
  const sortedCustomers = useMemo(
    () => [...customers].sort((a, b) => String(a.name).localeCompare(String(b.name))),
    [customers]);

  if (linked) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <button onClick={() => onOpenCustomer(linked)} title="Apri la scheda cliente"
          style={{ ...linkBtn, border: '1px solid var(--border-light, #e8e6de)', background: 'var(--bg-secondary, #f8f7f3)', color: 'var(--text-primary)' }}>
          👤 {linked.name}
        </button>
        <button onClick={() => onLink(monitor.id, null)} title="Scollega cliente"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.75rem', padding: 2 }}>✕</button>
      </span>
    );
  }

  if (picking) {
    return (
      <select
        className="input" autoFocus defaultValue=""
        style={{ padding: '3px 8px', fontSize: '0.78rem', height: 'auto', maxWidth: 200 }}
        onChange={e => { if (e.target.value) onLink(monitor.id, e.target.value); setPicking(false); }}
        onBlur={() => setPicking(false)}
      >
        <option value="" disabled>Scegli cliente…</option>
        {sortedCustomers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {suggested && (
        <button onClick={() => onLink(monitor.id, suggested.id)} style={linkBtn}
          title={`Il sito di ${suggested.name} corrisponde a questo monitor`}>
          🔗 Collega a {suggested.name}
        </button>
      )}
      <button onClick={() => setPicking(true)}
        style={{ ...linkBtn, border: '1px dashed var(--border-light, #d8d8e8)', background: 'none', color: 'var(--text-secondary)' }}>
        {suggested ? 'Altro…' : '🔗 Collega cliente'}
      </button>
    </span>
  );
}

// ─── Riga monitor ─────────────────────────────────────────────────────────────
function MonitorRow({ monitor: m, customers, onLink, onOpenCustomer }) {
  const st = STATUS[normalizeStatus(m.status)];
  const since = formatDuration(m.currentStateDuration);
  const up24 = dayUptime(m);
  const ssl = expiryInfo(m.sslExpiryDateTime);
  const domain = expiryInfo(m.domainExpireDate);
  const inc = m.lastIncident;
  const incStart = parseDate(inc?.startedAt);

  const meta = [];
  const kind = [typeLabel(m.type), intervalLabel(m.interval)].filter(Boolean).join(' · ');
  if (kind) meta.push(<span key="k">{kind}</span>);
  if (ssl) meta.push(<span key="s" style={{ color: LEVEL_COLOR[ssl.level], fontWeight: ssl.level === 'ok' ? 400 : 700 }}>🔒 SSL {ssl.text}</span>);
  if (domain) meta.push(<span key="d" style={{ color: LEVEL_COLOR[domain.level], fontWeight: domain.level === 'ok' ? 400 : 700 }}>🌐 Dominio {domain.text}</span>);
  if (incStart) {
    const dur = formatDuration(inc.duration);
    const reason = incidentReason(inc);
    meta.push(
      <span key="i" title={reason || ''}>
        ⚡ Ultimo incidente {formatDateTime(incStart)}{dur ? ` · ${dur}` : ''}{reason ? ` · ${reason}` : ''}
      </span>
    );
  }
  (m.tags || []).forEach(t => meta.push(
    <span key={`t${t.id ?? t.name}`} style={{ background: t.color ? `${t.color}22` : 'var(--bg-input, #f0efe9)', color: t.color || 'inherit', padding: '1px 8px', borderRadius: 999 }}>
      {t.name}
    </span>
  ));

  return (
    <div style={{
      padding: '12px 16px', borderRadius: 14,
      border: `1px solid ${normalizeStatus(m.status) === 'down' ? 'rgba(194, 78, 54,0.4)' : 'var(--border-light, #e8e6de)'}`,
      background: 'var(--bg-primary, #fff)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: st.color, flexShrink: 0, boxShadow: `0 0 0 4px ${st.bg}` }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <a href={monitorUrl(m.id)} target="_blank" rel="noreferrer" title="Apri su UptimeRobot"
              style={{ fontWeight: 700, color: 'var(--text-primary)', textDecoration: 'none' }}>{m.friendlyName}</a>
            <CustomerLink monitor={m} customers={customers} onLink={onLink} onOpenCustomer={onOpenCustomer} />
          </div>
          {m.url && (
            <a href={/^https?:\/\//i.test(m.url) ? m.url : undefined} target="_blank" rel="noreferrer"
              style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
              {m.url}
            </a>
          )}
        </div>
        <DayBars monitor={m} />
        {up24 !== null && (
          <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-secondary)', flexShrink: 0, minWidth: 64 }}>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{up24.toFixed(2)}%</div>
            ultime 24h
          </div>
        )}
        <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 100 }}>
          <span style={{ background: st.bg, color: st.color, fontWeight: 700, fontSize: '0.78rem', padding: '4px 10px', borderRadius: 999 }}>{st.label}</span>
          {since && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>da {since}</div>}
        </div>
      </div>
      {meta.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 8, marginLeft: 26, fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
          {meta}
        </div>
      )}
    </div>
  );
}

const statBox = (label, value, color) => (
  <div key={label} style={{ background: 'var(--bg-secondary, #f8f7f3)', borderRadius: 16, padding: '14px 18px', flex: '1 1 140px' }}>
    <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)' }}>{label}</div>
    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: color || 'var(--text-primary)', marginTop: 4 }}>{value}</div>
  </div>
);

// error = { text, soft }: "soft" è un'attesa temporanea (limite richieste), non un guasto
const errorBox = (error, onChangeKey) => {
  const color = error.soft ? '#B7791F' : '#C24E36';
  return (
    <div style={{ background: error.soft ? 'rgba(227, 169, 60,0.18)' : 'rgba(194, 78, 54,0.1)', color, borderRadius: 12, padding: '10px 14px', marginBottom: 16, fontSize: '0.88rem', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span>{error.soft ? '⏳ ' : ''}{error.text}</span>
      {!error.soft && <button onClick={onChangeKey} style={{ background: 'none', border: 'none', color, fontWeight: 700, cursor: 'pointer' }}>Cambia API key</button>}
    </div>
  );
};

// Ricarica con refresh periodico e nuovo tentativo automatico dopo un limite richieste
function useAutoLoad(loader, intervalMs) {
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let timer = null;
    const run = async () => {
      let wait = intervalMs;
      try {
        await loader();
        if (cancelled) return;
        setError(null);
        setUpdatedAt(new Date());
      } catch (e) {
        if (cancelled) return;
        const d = describeError(e);
        setError(d);
        if (d.retryInMs) wait = d.retryInMs;
      } finally {
        if (!cancelled) setLoading(false);
      }
      if (!cancelled && wait) timer = setTimeout(run, wait);
    };
    run();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [loader, intervalMs]);

  return { error, loading, updatedAt };
}

// ─── Riepilogo ────────────────────────────────────────────────────────────────
function MonitorSummary({ apiKey, monitors, setMonitors, customers, onLink, onOpenCustomer, onChangeKey }) {
  const load = useCallback(async () => {
    setMonitors(await fetchMonitors(apiKey));
  }, [apiKey, setMonitors]);
  const { error, loading, updatedAt } = useAutoLoad(load, REFRESH_MS);

  const list = monitors || [];
  const counts = { up: 0, down: 0, paused: 0, pending: 0 };
  list.forEach(m => { counts[normalizeStatus(m.status)]++; });
  const expiring = list.filter(m =>
    [expiryInfo(m.sslExpiryDateTime), expiryInfo(m.domainExpireDate)].some(x => x && x.level !== 'ok')).length;
  const sorted = [...list].sort((a, b) => {
    const order = { down: 0, pending: 1, up: 2, paused: 3 };
    return order[normalizeStatus(a.status)] - order[normalizeStatus(b.status)]
      || String(a.friendlyName).localeCompare(String(b.friendlyName));
  });
  const suggestions = list
    .filter(m => !customerForMonitor(customers, m.id))
    .map(m => ({ monitor: m, customer: suggestCustomer(customers, m) }))
    .filter(s => s.customer);

  return (
    <div style={{ padding: '20px 28px 28px' }}>
      {error && errorBox(error, onChangeKey)}

      {monitors === null && !error && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Caricamento monitor…</div>
      )}

      {monitors !== null && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            {statBox('Online', counts.up, STATUS.up.color)}
            {statBox('Offline', counts.down, counts.down ? STATUS.down.color : undefined)}
            {statBox('In pausa', counts.paused)}
            {expiring > 0 && statBox('SSL/domini in scadenza', expiring, '#E1A100')}
          </div>

          {suggestions.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
              background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 12,
              padding: '10px 14px', marginBottom: 16, fontSize: '0.86rem', color: 'var(--text-primary)',
            }}>
              <span>
                🔗 {suggestions.length === 1 ? 'Ho trovato 1 monitor' : `Ho trovato ${suggestions.length} monitor`} con lo stesso dominio di un cliente.
              </span>
              <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '0.82rem' }}
                onClick={() => suggestions.forEach(s => onLink(s.monitor.id, s.customer.id))}>
                Collega {suggestions.length === 1 ? '' : 'tutti'} automaticamente
              </button>
            </div>
          )}

          {sorted.length === 0 && (
            <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-secondary)' }}>Nessun monitor trovato su questo account.</div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sorted.map(m => (
              <MonitorRow key={m.id} monitor={m} customers={customers} onLink={onLink} onOpenCustomer={onOpenCustomer} />
            ))}
          </div>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
        <span>
          {loading && !updatedAt ? 'Aggiornamento…' : updatedAt ? `Aggiornato alle ${updatedAt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} · si aggiorna ogni minuto` : ''}
        </span>
        <button onClick={onChangeKey} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.78rem', textDecoration: 'underline' }}>
          Cambia API key
        </button>
      </div>
    </div>
  );
}

// ─── Storico incidenti ────────────────────────────────────────────────────────
const PERIODS = [
  { id: 'DAY', label: '24 ore', days: 1 },
  { id: 'WEEK', label: '7 giorni', days: 7 },
  { id: 'DAYS_30', label: '30 giorni', days: 30 },
];

function MonitorHistory({ apiKey, monitors, customers, onOpenCustomer, onChangeKey }) {
  const [period, setPeriod] = useState('WEEK');
  const [data, setData] = useState(null);

  // Nessun refresh periodico: lo storico cambia poco (cache 5 minuti)
  const load = useCallback(async () => {
    const days = PERIODS.find(p => p.id === period).days;
    const since = Date.now() - days * 86400000;
    const [stats, incidents] = await Promise.all([
      fetchUptimeStats(apiKey, period).catch(() => null),
      fetchIncidents(apiKey, days),
    ]);
    const inPeriod = incidents
      .map(i => ({ ...i, _start: parseDate(i.startedAt) }))
      .filter(i => i._start === null || i._start >= since)
      .sort((a, b) => (b._start ?? 0) - (a._start ?? 0));
    setData({ period, stats, incidents: inPeriod });
  }, [apiKey, period]);
  const { error } = useAutoLoad(load, 0);
  const loading = !data || data.period !== period;
  const changePeriod = setPeriod;

  const monitorById = useMemo(() => {
    const map = new Map();
    (monitors || []).forEach(m => map.set(String(m.id), m));
    return map;
  }, [monitors]);

  const stats = data?.stats;
  const num = v => Number.isFinite(Number(v)) ? Number(v) : null;

  return (
    <div style={{ padding: '20px 28px 28px' }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {PERIODS.map(p => (
          <button key={p.id} onClick={() => changePeriod(p.id)} style={{
            border: 'none', cursor: 'pointer', padding: '6px 14px', borderRadius: 999, fontWeight: 700, fontSize: '0.8rem',
            background: period === p.id ? 'var(--text-primary)' : 'var(--bg-input, #f0efe9)',
            color: period === p.id ? 'var(--bg-primary, #fff)' : 'var(--text-secondary)',
          }}>{p.label}</button>
        ))}
      </div>

      {error && errorBox(error, onChangeKey)}
      {loading && !data && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Caricamento storico…</div>}

      {data && (
        <div style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s' }}>
          {stats && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
              {num(stats.overallUptime) !== null && statBox('Uptime', `${num(stats.overallUptime).toFixed(2)}%`)}
              {num(stats.totalIncidents) !== null && statBox('Incidenti', num(stats.totalIncidents), num(stats.totalIncidents) ? STATUS.down.color : STATUS.up.color)}
              {num(stats.affectedMonitors) !== null && statBox('Siti coinvolti', num(stats.affectedMonitors))}
              {formatDuration(stats.mtbf) && statBox('Tempo medio tra guasti', formatDuration(stats.mtbf))}
            </div>
          )}

          {data.incidents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-secondary)' }}>✅ Nessun incidente in questo periodo.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.incidents.map((inc, idx) => {
                const monId = inc.monitorId ?? inc.monitor?.id;
                const mon = monId !== undefined ? monitorById.get(String(monId)) : null;
                const name = mon?.friendlyName || inc.monitor?.friendlyName || inc.monitorName || (monId !== undefined ? `Monitor ${monId}` : 'Monitor');
                const customer = monId !== undefined ? customerForMonitor(customers, monId) : null;
                const ongoing = !inc.resolvedAt && String(inc.status ?? '').toLowerCase() !== 'resolved';
                const dur = formatDuration(inc.duration);
                const reason = incidentReason(inc);
                return (
                  <div key={inc.id ?? idx} style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px', borderRadius: 12,
                    border: `1px solid ${ongoing ? 'rgba(194, 78, 54,0.4)' : 'var(--border-light, #e8e6de)'}`,
                  }}>
                    <span style={{ fontSize: '1rem' }}>{ongoing ? '🔴' : '⚡'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{name}</span>
                        {customer && (
                          <button onClick={() => onOpenCustomer(customer)} style={{ ...linkBtn, border: '1px solid var(--border-light, #e8e6de)', background: 'var(--bg-secondary, #f8f7f3)', color: 'var(--text-primary)' }}>
                            👤 {customer.name}
                          </button>
                        )}
                      </div>
                      {reason && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{reason}</div>}
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '0.78rem', color: 'var(--text-secondary)', flexShrink: 0 }}>
                      <div>{inc._start ? formatDateTime(inc._start) : ''}</div>
                      <div style={{ fontWeight: 700, color: ongoing ? STATUS.down.color : 'var(--text-primary)' }}>
                        {ongoing ? 'In corso' : dur ? `Durata ${dur}` : 'Risolto'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
// Nel browser: riepilogo e storico via API. In Electron c'è anche la dashboard
// completa: UptimeRobot blocca gli iframe (X-Frame-Options), quindi viene
// caricata in un <webview> con sessione persistente (il login resta salvato).
export default function MonitorModal({ apiKey, onSaveApiKey, customers = [], onLinkMonitor, onOpenCustomer, onClose }) {
  const overlayRef = useRef(null);
  const webviewRef = useRef(null);
  const isElectron = !!window.electronAPI;
  const [tab, setTab] = useState(isElectron && !apiKey ? 'full' : 'summary');
  const [editingKey, setEditingKey] = useState(!apiKey);
  // Condivisi tra riepilogo e storico; si parte dalla cache per non attendere l'API
  const [monitors, setMonitors] = useState(() => cachedData(apiKey, MONITORS_KEY));

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);


  const headerBtn = {
    background: 'var(--bg-input, #f0efe9)', border: 'none', borderRadius: '50%',
    width: 40, height: 40, cursor: 'pointer', fontSize: '1rem', color: 'var(--text-secondary)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s',
  };

  const tabBtn = (id, label) => (
    <button key={id} onClick={() => setTab(id)} style={{
      border: 'none', cursor: 'pointer', padding: '7px 14px', borderRadius: 999, fontWeight: 700, fontSize: '0.82rem',
      background: tab === id ? '#10B981' : 'var(--bg-input, #f0efe9)',
      color: tab === id ? '#fff' : 'var(--text-secondary)',
    }}>{label}</button>
  );

  const showApiTabs = tab !== 'full';
  const shared = { apiKey, monitors, customers, onOpenCustomer, onChangeKey: () => setEditingKey(true) };

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1500,
        background: 'rgba(8,8,24,0.75)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'rmFadeIn 0.2s ease',
      }}
    >
      <div style={{
        background: 'var(--bg-primary, #fff)', borderRadius: 28,
        boxShadow: '0 40px 120px rgba(0,0,0,0.35), 0 0 0 1px rgba(16,185,129,0.1)',
        width: '96vw', maxWidth: tab === 'full' ? 1400 : 1080, height: tab === 'full' ? '93vh' : 'auto', maxHeight: '93vh',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
        animation: 'rmScaleIn 0.35s cubic-bezier(0.175,0.885,0.32,1.275)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
          padding: '18px 28px 14px',
          borderBottom: '1px solid var(--border-light, #e8e6de)',
          background: 'linear-gradient(135deg, rgba(16,185,129,0.05) 0%, transparent 60%)',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.14em', color: '#059669', textTransform: 'uppercase', marginBottom: 4 }}>
              Upersite CRM · UptimeRobot
            </div>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.15 }}>
              Monitoraggio
            </h2>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {tabBtn('summary', 'Riepilogo')}
            {tabBtn('history', 'Storico incidenti')}
            {isElectron && tabBtn('full', 'Dashboard completa')}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {/* Riepilogo e storico si aggiornano da soli (limite richieste): ricarica solo la dashboard */}
            {tab === 'full' && <button title="Ricarica" onClick={() => webviewRef.current?.reload()} style={headerBtn}>⟳</button>}
            <button title="Apri su UptimeRobot" onClick={() => window.open(DASHBOARD_URL, '_blank')} style={headerBtn}>↗</button>
            <button title="Chiudi" onClick={onClose} style={headerBtn}
              onMouseEnter={e => { e.currentTarget.style.background = '#FFE0E0'; e.currentTarget.style.color = '#C24E36'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-input, #f0efe9)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
            >✕</button>
          </div>
        </div>

        {showApiTabs && (
          <div style={{ overflow: 'auto', flex: 1 }}>
            {editingKey || !apiKey ? (
              <ApiKeySetup apiKey={apiKey} onSave={key => { onSaveApiKey(key); setEditingKey(false); }} onCancel={() => setEditingKey(false)} />
            ) : tab === 'summary' ? (
              <MonitorSummary {...shared} setMonitors={setMonitors} onLink={onLinkMonitor} />
            ) : (
              <MonitorHistory {...shared} />
            )}
          </div>
        )}

        {isElectron && (
          <webview
            ref={webviewRef}
            src={DASHBOARD_URL}
            partition="persist:uptimerobot"
            style={{ flex: 1, width: '100%', border: 'none', display: tab === 'full' ? 'flex' : 'none' }}
          />
        )}
      </div>
    </div>
  );
}
