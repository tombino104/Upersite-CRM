import { useEffect, useState } from 'react';
import {
  STATUS, normalizeStatus, fetchMonitors, cachedData, MONITORS_KEY,
  monitorUrl, expiryInfo, dayUptime, formatDuration,
} from '../utils/uptimeRobot';

// Stato UptimeRobot dei siti collegati al cliente (header della scheda cliente).
// Usa la stessa lista in cache del pannello Monitoraggio: nessuna richiesta extra.
export default function MonitorStatusBadge({ apiKey, monitorIds }) {
  const [all, setAll] = useState(() => cachedData(apiKey, MONITORS_KEY));
  const idsKey = (monitorIds || []).map(String).join(',');

  useEffect(() => {
    if (!apiKey || !idsKey) return;
    let cancelled = false;
    fetchMonitors(apiKey)
      .then(list => { if (!cancelled) setAll(list); })
      .catch(() => { /* limite richieste o rete: il badge resta com'è */ });
    return () => { cancelled = true; };
  }, [apiKey, idsKey]);

  if (!apiKey || !idsKey || !all) return null;
  const ids = idsKey.split(',');
  const monitors = all.filter(m => ids.includes(String(m.id)));

  return monitors.map(m => {
    const st = STATUS[normalizeStatus(m.status)];
    const ssl = expiryInfo(m.sslExpiryDateTime);
    const domain = expiryInfo(m.domainExpireDate);
    const alert = [ssl, domain].some(x => x && x.level !== 'ok');
    const up24 = dayUptime(m);
    const since = formatDuration(m.currentStateDuration);
    const tooltip = [
      `${m.friendlyName}: ${st.label}${since ? ` da ${since}` : ''}`,
      up24 !== null && `Uptime 24h: ${up24.toFixed(2)}%`,
      ssl && `SSL: ${ssl.text}`,
      domain && `Dominio: ${domain.text}`,
      'Clic per aprire su UptimeRobot',
    ].filter(Boolean).join('\n');

    return (
      <button
        key={m.id}
        onClick={() => window.open(monitorUrl(m.id), '_blank', 'noopener,noreferrer')}
        title={tooltip}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
          border: 'none', borderRadius: 999, padding: '4px 10px',
          background: st.bg, color: st.color, fontWeight: 700, fontSize: '0.75rem', whiteSpace: 'nowrap',
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: st.color }} />
        {monitors.length > 1 ? m.friendlyName : st.label}
        {alert && <span title="SSL o dominio in scadenza">⚠️</span>}
      </button>
    );
  });
}
