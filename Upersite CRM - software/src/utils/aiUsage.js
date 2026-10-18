// Consumo di token delle funzioni AI, salvato in settings.aiUsageLog (crm_data.json):
//   { 'AAAA-MM-GG': { 'servizio::modello::funzione': { requests, input, output, estimated } } }
// I numeri arrivano dal servizio dopo ogni risposta; se il servizio non li restituisce si stimano dal testo
// (circa 4 caratteri per token) e la riga viene segnata come stimata.

const KEEP_DAYS = 400;
const SEP = '::';

export function usageKey(provider, model, purpose) {
  return [provider, model, purpose || 'altro'].join(SEP);
}

export function parseUsageKey(key) {
  const [provider, model, purpose] = key.split(SEP);
  return { provider, model, purpose };
}

export function localDay(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Aggiunge una richiesta al registro e restituisce il nuovo registro (senza modificare quello passato)
export function recordUsage(log, { provider, model, purpose, input, output, estimated }) {
  const day = localDay();
  const key = usageKey(provider, model, purpose);
  const days = { ...(log || {}) };
  const dayRows = { ...(days[day] || {}) };
  const row = dayRows[key] || { requests: 0, input: 0, output: 0, estimated: 0 };
  dayRows[key] = {
    requests: row.requests + 1,
    input: row.input + (input || 0),
    output: row.output + (output || 0),
    // quante richieste di questa riga hanno numeri stimati
    estimated: row.estimated + (estimated ? 1 : 0)
  };
  days[day] = dayRows;

  // Si tengono circa 13 mesi
  const cutoff = localDay(Date.now() - KEEP_DAYS * 86400000);
  for (const d of Object.keys(days)) if (d < cutoff) delete days[d];
  return days;
}

// Periodi selezionabili nel riepilogo
export const USAGE_PERIODS = [
  { id: 'today', label: 'Oggi' },
  { id: '7d', label: 'Ultimi 7 giorni' },
  { id: '30d', label: 'Ultimi 30 giorni' },
  { id: 'month', label: 'Questo mese' },
  { id: 'all', label: 'Tutto' }
];

function periodStart(periodId) {
  const now = new Date();
  if (periodId === 'today') return localDay(now);
  if (periodId === '7d') return localDay(Date.now() - 6 * 86400000);
  if (periodId === '30d') return localDay(Date.now() - 29 * 86400000);
  if (periodId === 'month') return localDay(new Date(now.getFullYear(), now.getMonth(), 1));
  return '0000-00-00';
}

// Righe del periodo, raggruppate per "servizio::modello" e per funzione
export function summarizeUsage(log, periodId) {
  const from = periodStart(periodId);
  const byModel = {};
  const byPurpose = {};
  const totals = { requests: 0, input: 0, output: 0, estimated: 0 };

  for (const [day, rows] of Object.entries(log || {})) {
    if (day < from) continue;
    for (const [key, row] of Object.entries(rows)) {
      const { provider, model, purpose } = parseUsageKey(key);
      const modelKey = provider + SEP + model;
      for (const [bucket, k] of [[byModel, modelKey], [byPurpose, purpose]]) {
        const acc = bucket[k] || { provider, model, purpose, requests: 0, input: 0, output: 0, estimated: 0 };
        acc.requests += row.requests;
        acc.input += row.input;
        acc.output += row.output;
        acc.estimated += row.estimated || 0;
        bucket[k] = acc;
      }
      totals.requests += row.requests;
      totals.input += row.input;
      totals.output += row.output;
      totals.estimated += row.estimated || 0;
    }
  }
  return { byModel: Object.values(byModel), byPurpose: Object.values(byPurpose), totals };
}

// Costo stimato in euro: prezzi per milione di token { input, output }
export function estimateCost(row, price) {
  if (!price) return 0;
  return (row.input / 1e6) * (Number(price.input) || 0) + (row.output / 1e6) * (Number(price.output) || 0);
}

export function priceKey(provider, model) {
  return provider + SEP + model;
}
