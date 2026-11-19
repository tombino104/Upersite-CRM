// Client minimo per l'API v3 di UptimeRobot (la v2 non permette CORS dal browser).
// I campi sono letti in modo difensivo: la documentazione v3 è incompleta,
// quindi ogni dato mancante viene semplicemente non mostrato.

export const DASHBOARD_URL = 'https://dashboard.uptimerobot.com/monitors';
export const INTEGRATIONS_URL = 'https://dashboard.uptimerobot.com/integrations';
const API_BASE = 'https://api.uptimerobot.com/v3';

export const STATUS = {
  up:      { label: 'Online',      color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  down:    { label: 'Offline',     color: '#C24E36', bg: 'rgba(194, 78, 54,0.12)' },
  paused:  { label: 'In pausa',    color: '#98A09A', bg: 'rgba(178,190,195,0.18)' },
  pending: { label: 'In verifica', color: '#E3A93C', bg: 'rgba(227, 169, 60,0.18)' },
};

export const monitorUrl = (id) => `${DASHBOARD_URL}/${id}`;

export function normalizeStatus(s) {
  const v = String(s ?? '').toLowerCase();
  if (v === 'up' || v === '2') return 'up';
  if (v === 'down' || v === 'seems_down' || v === '8' || v === '9') return 'down';
  if (v === 'paused' || v === '0') return 'paused';
  return 'pending';
}

// ─── Chiamate API ─────────────────────────────────────────────────────────────
// Il piano free consente ~10 richieste/minuto. Per restarci dentro:
//  - le risposte sono in cache condivisa (pannello, storico, scheda cliente)
//  - richieste identiche in volo vengono unificate (StrictMode, doppi clic)
//  - dopo un 429 si rispetta Retry-After senza chiamare l'API nel frattempo

export class RateLimitError extends Error {
  constructor(retryInMs) {
    super('UptimeRobot limita le richieste.');
    this.retryInMs = retryInMs;
  }
}

let blockedUntil = 0;

export async function apiGet(apiKey, pathOrUrl) {
  if (Date.now() < blockedUntil) throw new RateLimitError(blockedUntil - Date.now());
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${API_BASE}${pathOrUrl}`;
  let res;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' } });
  } catch {
    throw new Error('Impossibile contattare UptimeRobot. Controlla la connessione.');
  }
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('Retry-After'));
    blockedUntil = Date.now() + (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60) * 1000;
    throw new RateLimitError(blockedUntil - Date.now());
  }
  if (res.status === 401 || res.status === 403) throw new Error('API key non valida o senza permessi.');
  if (!res.ok) throw new Error(`Errore UptimeRobot (${res.status}).`);
  return res.json();
}

const cache = new Map(); // chiave → { apiKey, ts, data, promise }

function cached(apiKey, key, ttlMs, loader) {
  const entry = cache.get(key);
  if (entry && entry.apiKey === apiKey) {
    if (entry.promise) return entry.promise;
    if (Date.now() - entry.ts < ttlMs) return Promise.resolve(entry.data);
  }
  const previous = entry && entry.apiKey === apiKey && !entry.promise ? entry : null;
  const promise = loader()
    .then(data => { cache.set(key, { apiKey, ts: Date.now(), data }); return data; })
    .catch(err => { if (previous) cache.set(key, previous); else cache.delete(key); throw err; });
  cache.set(key, { ...(previous || {}), apiKey, promise });
  return promise;
}

// Ultimo dato in cache (anche scaduto), per mostrare subito qualcosa
export function cachedData(apiKey, key) {
  const entry = cache.get(key);
  return entry && entry.apiKey === apiKey && entry.data !== undefined ? entry.data : null;
}

// Lista con paginazione a cursore (nextLink), con un limite di sicurezza sulle pagine
async function fetchList(apiKey, path, maxPages = 5, stopWhen) {
  const all = [];
  let next = path;
  for (let page = 0; next && page < maxPages; page++) {
    const body = await apiGet(apiKey, next);
    const list = Array.isArray(body) ? body : (body.data || body.items || []);
    all.push(...list);
    if (stopWhen && stopWhen(list)) break;
    next = Array.isArray(body) ? null : body.nextLink || null;
  }
  return all;
}

export const MONITORS_KEY = 'monitors';
const MONITORS_TTL = 55 * 1000;   // con il refresh ogni minuto → 1 richiesta/minuto
const HISTORY_TTL = 5 * 60 * 1000;

export const fetchMonitors = (apiKey) =>
  cached(apiKey, MONITORS_KEY, MONITORS_TTL, () => fetchList(apiKey, '/monitors'));

// timeFrame: DAY | WEEK | MONTH | DAYS_30 | YEAR | ALL
export const fetchUptimeStats = (apiKey, timeFrame) =>
  cached(apiKey, `stats:${timeFrame}`, HISTORY_TTL, () => apiGet(apiKey, `/monitors/uptime-stats?timeFrame=${timeFrame}`));

// Incidenti dal più recente; si ferma quando la pagina scende sotto "since"
export function fetchIncidents(apiKey, days) {
  const since = Date.now() - days * 86400000;
  return cached(apiKey, `incidents:${days}`, HISTORY_TTL, () =>
    fetchList(apiKey, '/incidents', 3, list =>
      list.length > 0 && list.every(i => (parseDate(i.startedAt) ?? Infinity) < since)));
}

// Messaggio + attesa consigliata per un errore API
export function describeError(err) {
  if (err instanceof RateLimitError) {
    const s = Math.max(1, Math.ceil(err.retryInMs / 1000));
    return { text: `UptimeRobot chiede di attendere qualche secondo: riprovo da solo tra ${s}s.`, retryInMs: err.retryInMs + 500, soft: true };
  }
  return { text: err.message, retryInMs: null, soft: false };
}

// ─── Lettura campi ────────────────────────────────────────────────────────────

// Accetta ISO string, secondi o millisecondi Unix
export function parseDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' || /^\d+$/.test(String(v))) {
    const n = Number(v);
    return n < 1e12 ? n * 1000 : n;
  }
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

export function formatDuration(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return null;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}g ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.round(s)}s`;
}

export function formatDateTime(ts) {
  if (ts === null) return '';
  return new Date(ts).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatDate(ts) {
  if (ts === null) return '';
  return new Date(ts).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function daysUntil(ts) {
  if (ts === null) return null;
  return Math.ceil((ts - Date.now()) / 86400000);
}

// Scadenza (SSL o dominio) → testo + livello di allerta
export function expiryInfo(value) {
  const ts = parseDate(value);
  const days = daysUntil(ts);
  if (days === null) return null;
  if (days < 0) return { text: `scaduto il ${formatDate(ts)}`, level: 'danger', days };
  if (days <= 14) return { text: `scade tra ${days}g`, level: 'danger', days };
  if (days <= 30) return { text: `scade tra ${days}g`, level: 'warning', days };
  return { text: `scade il ${formatDate(ts)}`, level: 'ok', days };
}

export function dayHistogram(monitor) {
  const hist = monitor?.lastDayUptimes?.histogram;
  if (!Array.isArray(hist)) return [];
  return hist
    .map(b => ({ ts: parseDate(b.timestamp), uptime: Number(b.uptime) }))
    .filter(b => Number.isFinite(b.uptime));
}

export function dayUptime(monitor) {
  const hist = dayHistogram(monitor);
  if (!hist.length) return null;
  return hist.reduce((a, b) => a + b.uptime, 0) / hist.length;
}

const TYPE_LABELS = { http: 'HTTP', keyword: 'Parola chiave', ping: 'Ping', port: 'Porta', heartbeat: 'Heartbeat', dns: 'DNS', udp: 'UDP', api: 'API' };

export function typeLabel(type) {
  const v = String(type ?? '').toLowerCase();
  return TYPE_LABELS[v] || (type ? String(type) : null);
}

export function intervalLabel(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return null;
  if (s < 60) return `ogni ${s}s`;
  if (s < 3600) return `ogni ${Math.round(s / 60)} min`;
  return `ogni ${Math.round(s / 3600)}h`;
}

export function incidentReason(incident) {
  if (!incident) return null;
  const r = incident.reason || incident.rootCause?.description || incident.rootCause?.reason;
  if (r) return String(r);
  if (incident.cause !== undefined && incident.cause !== null && incident.cause !== '') return `codice ${incident.cause}`;
  return null;
}

// ─── Abbinamento monitor ↔ clienti ────────────────────────────────────────────

// "https://www.Esempio.it/pagina" → "esempio.it"
export function normalizeHost(url) {
  if (!url) return null;
  let s = String(url).trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z]+:\/\//, '').replace(/^www\./, '');
  s = s.split(/[/?#:]/)[0];
  return s.includes('.') ? s : null;
}

export function customerForMonitor(customers, monitorId) {
  const id = String(monitorId);
  return customers.find(c => (c.uptimeMonitorIds || []).map(String).includes(id)) || null;
}

// Cliente non ancora collegato il cui sito ha lo stesso dominio del monitor
export function suggestCustomer(customers, monitor) {
  const host = normalizeHost(monitor.url);
  if (!host) return null;
  return customers.find(c => {
    const ch = normalizeHost(c.website);
    return ch && (ch === host || host.endsWith(`.${ch}`) || ch.endsWith(`.${host}`));
  }) || null;
}
