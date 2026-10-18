// Client AI unico del CRM: tutte le funzioni AI (strumenti dell'editor, riassunto, chat, SmartReport) passano da qui.
// Le richieste vanno al server del CRM (/api/ai/*, vedi server/aiProxy.js), che le inoltra al servizio scelto
// (LM Studio, Unsloth, Ollama, Ollama Cloud, Gemini) con le chiavi del file .env.local: nel browser non c'è nessuna chiave.
//
// Per ogni funzione (AI_PURPOSES) le Impostazioni salvano servizio e modello in settings.ai:
//   { purposes: { editor: { provider, model }, summary, chat, report }, urls: { lmstudio, unsloth } }
import {
  AI_PROVIDERS,
  GEMINI_MODELS,
  AI_PURPOSES,
  findProvider,
  findGeminiModel,
  defaultGeminiModel
} from './aiProviders';
import { CRM_REQUEST_HEADERS } from './storage';
import { normalizeChatDataOptions } from './chatContext';

export { AI_PROVIDERS, GEMINI_MODELS, AI_PURPOSES, findProvider, findGeminiModel, defaultGeminiModel };

const LOCAL_TIMEOUT_MS = 500000; // può includere il caricamento del modello in memoria (anche minuti) più la risposta
const CLOUD_TIMEOUT_MS = 70000;
const LIST_TIMEOUT_MS = 15000;
const MAX_AUTO_RETRY_WAIT_S = 10;

// Chiavi del localStorage usate dalle versioni precedenti (solo per la migrazione)
const LEGACY_WRITING_KEY = 'upersite_ai_writing_model';
const LEGACY_CHAT_KEY = 'upersite_ai_model';

function readLocal(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // localStorage non disponibile
  }
}

// === IMPOSTAZIONI: QUALE IA PER QUALE FUNZIONE ===

function geminiChoice(modelId) {
  return { provider: 'gemini', model: findGeminiModel(modelId) ? modelId : defaultGeminiModel().id };
}

function normalizeChoice(choice, fallback) {
  const provider = findProvider(choice?.provider);
  if (!provider) return fallback;
  if (provider.id === 'gemini') return geminiChoice(choice.model);
  return { provider: provider.id, model: String(choice.model || '') };
}

// Impostazioni AI complete e valide. Se mancano (versioni precedenti) si ricavano dalle vecchie scelte Gemini,
// così nulla cambia finché non si sceglie altro nelle Impostazioni.
export function normalizeAISettings(settings) {
  const ai = settings?.ai || {};
  const purposes = ai.purposes || {};

  const editor = normalizeChoice(purposes.editor, geminiChoice(settings?.aiWritingModel || readLocal(LEGACY_WRITING_KEY)));
  const summary = normalizeChoice(purposes.summary, settings?.aiSummaryModel ? geminiChoice(settings.aiSummaryModel) : editor);
  const chat = normalizeChoice(purposes.chat, geminiChoice(readLocal(LEGACY_CHAT_KEY)));
  const report = normalizeChoice(purposes.report, editor);

  const urls = {};
  AI_PROVIDERS.filter(p => p.kind === 'local').forEach(p => {
    urls[p.id] = String(ai.urls?.[p.id] || '').trim() || p.defaultUrl;
  });

  // Contesto scelto per ogni modello locale: { 'servizio::modello': { contextLength } }
  const models = {};
  for (const [key, cfg] of Object.entries(ai.models || {})) {
    const contextLength = Math.round(Number(cfg?.contextLength));
    if (contextLength > 0) models[key] = { contextLength };
  }

  // Prezzi per milione di token (euro), per la stima dei costi: { 'servizio::modello': { input, output } }
  const prices = {};
  for (const [key, price] of Object.entries(ai.prices || {})) {
    const input = Number(price?.input);
    const output = Number(price?.output);
    if (input > 0 || output > 0) prices[key] = { input: input > 0 ? input : 0, output: output > 0 ? output : 0 };
  }

  // Abbonamenti mensili dei servizi cloud a piano (es. Ollama Cloud), in euro: { servizio: importo }
  const subscriptions = {};
  for (const [providerId, amount] of Object.entries(ai.subscriptions || {})) {
    const value = Number(amount);
    if (findProvider(providerId)?.kind === 'cloud' && value > 0) subscriptions[providerId] = value;
  }

  return {
    purposes: { editor, summary, chat, report },
    urls,
    models,
    subscriptions,
    // Un solo modello locale alla volta: caricandone uno si scaricano gli altri (di base sì)
    exclusiveLocal: ai.exclusiveLocal !== false,
    prices,
    chatData: normalizeChatDataOptions(settings)
  };
}

export function modelConfigKey(provider, model) {
  return `${provider}::${model}`;
}

// Contesto scelto per un modello locale (undefined = quello predefinito del servizio)
export function getModelContextLength(provider, model) {
  return aiSettings.models[modelConfigKey(provider, model)]?.contextLength;
}

let aiSettings = normalizeAISettings(null);

// Sincronizza dalle impostazioni dell'app (App.jsx)
export function syncAISettings(settings) {
  aiSettings = normalizeAISettings(settings);
}

// Applica subito nuove impostazioni AI e le restituisce normalizzate, pronte per updateSettings({ ai })
export function applyAISettings(ai) {
  aiSettings = normalizeAISettings({ ai });
  return aiSettings;
}

export function getAISettings() {
  return aiSettings;
}

export function getAIChoice(purpose) {
  return aiSettings.purposes[purpose] || aiSettings.purposes.editor;
}

export function getProviderUrl(providerId) {
  return aiSettings.urls[providerId] || findProvider(providerId)?.defaultUrl || '';
}

// Etichetta leggibile, es. "Gemma 4 31B · Google Gemini" o "gpt-oss:120b · Ollama Cloud"
export function describeChoice(choice) {
  const provider = findProvider(choice?.provider);
  if (!provider) return 'Nessun servizio';
  const model = provider.id === 'gemini' ? (findGeminiModel(choice.model)?.label || choice.model) : (choice.model || 'nessun modello');
  return `${model} · ${provider.label}`;
}

export function isLocalChoice(choice) {
  return findProvider(choice?.provider)?.kind === 'local';
}

// === CONTEGGIO RICHIESTE ===
// App.jsx registra qui chi deve contare le richieste (riceve { provider, model, usage }).
let usageListener = null;

export function setAIUsageListener(listener) {
  usageListener = listener;
}

// === ERRORI ===
// Errore con le informazioni utili alla UI
export class AIError extends Error {
  constructor(message, { code = 'error', status = null, apiMessage = '', apiStatus = '', retryAfterSeconds = null, zeroQuota = false } = {}) {
    super(message);
    this.name = 'AIError';
    // 'quota' | 'timeout' | 'network' | 'unreachable' | 'auth' | 'model' | 'url' | 'aborted' | 'blocked' | 'empty' | 'http' | 'error'
    this.code = code;
    this.status = status;
    this.apiMessage = apiMessage;
    this.apiStatus = apiStatus;
    this.retryAfterSeconds = retryAfterSeconds;
    this.zeroQuota = zeroQuota; // il modello non ha alcuna quota per questa chiave ("limit: 0")
  }
}

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) {
    reject(new AIError('Richiesta annullata', { code: 'aborted' }));
    return;
  }
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => {
    clearTimeout(t);
    reject(new AIError('Richiesta annullata', { code: 'aborted' }));
  }, { once: true });
});

// Richiesta al server del CRM con timeout e annullamento esterno
async function crmFetch(url, init, externalSignal, timeoutMs) {
  if (externalSignal?.aborted) throw new AIError('Richiesta annullata', { code: 'aborted' });

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

  try {
    const response = await fetch(url, { ...init, headers: CRM_REQUEST_HEADERS, signal: controller.signal });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const e = data.error && typeof data.error === 'object' ? data.error : { message: data.error };
      throw new AIError(e.message || `Errore del server del CRM (HTTP ${response.status})`, {
        code: e.code || 'http',
        status: e.status ?? response.status,
        apiMessage: e.apiMessage || '',
        apiStatus: e.apiStatus || '',
        retryAfterSeconds: e.retryAfterSeconds ?? null,
        zeroQuota: !!e.zeroQuota
      });
    }
    return await response.json();
  } catch (error) {
    if (error instanceof AIError) throw error;
    if (timedOut) throw new AIError('Il servizio AI non ha risposto in tempo. Riprova.', { code: 'timeout' });
    if (externalSignal?.aborted) throw new AIError('Richiesta annullata', { code: 'aborted' });
    throw new AIError('Il server del CRM non risponde: controlla che il CRM sia avviato.', { code: 'network' });
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

// Un nuovo tentativo ha senso solo per limiti "al minuto" o sovraccarichi passeggeri,
// non quando la quota giornaliera è finita o il modello non ne ha affatto
function retryDelayMs(error) {
  if (error.code === 'quota') {
    if (error.zeroQuota || /per ?day|daily/i.test(error.apiMessage)) return null;
    if (error.retryAfterSeconds !== null) {
      return error.retryAfterSeconds <= MAX_AUTO_RETRY_WAIT_S ? error.retryAfterSeconds * 1000 : null;
    }
    return 1500;
  }
  if (error.status === 503) return 1500;
  return null;
}

// === ELENCO MODELLI E STATO DELLE CHIAVI ===

export async function listModels(providerId, { baseUrl, signal } = {}) {
  const params = new URLSearchParams({ provider: providerId });
  const url = baseUrl ?? getProviderUrl(providerId);
  if (url && findProvider(providerId)?.kind === 'local') params.set('baseUrl', url);
  const data = await crmFetch(`/api/ai/models?${params}`, { method: 'GET' }, signal, LIST_TIMEOUT_MS);
  return data.models || [];
}

let statusPromise = null;

// Quali chiavi sono presenti in .env.local: { providers: { gemini: { hasKey, keyRequired, keyEnv }, ... } }
export function getAIStatus({ refresh = false } = {}) {
  if (!statusPromise || refresh) {
    statusPromise = crmFetch('/api/ai/status', { method: 'GET' }, null, LIST_TIMEOUT_MS).catch(error => {
      statusPromise = null;
      throw error;
    });
  }
  return statusPromise;
}

// Salva (o cancella, con key vuota) la chiave di un servizio: la scrive il server in .env.local.
// L'app non la rilegge mai: lo stato dice solo se c'è.
export async function setAIKey(providerId, key) {
  const result = await crmFetch('/api/ai/keys', { method: 'POST', body: JSON.stringify({ provider: providerId, key }) }, null, LIST_TIMEOUT_MS);
  statusPromise = null;
  // I selettori dei modelli già aperti (Impostazioni, chat) ricaricano stato ed elenco dei modelli
  window.dispatchEvent(new CustomEvent(AI_KEYS_CHANGED_EVENT, { detail: { provider: providerId } }));
  return result;
}

export const AI_KEYS_CHANGED_EVENT = 'upersite-ai-keys-changed';

// === MODELLI LOCALI: STATO, CARICA, SCARICA ===

const LOAD_TIMEOUT_MS = 310000;

// { supported, reason?, models: [{ id, label, sizeBytes, maxContextLength, instances: [{ id, contextLength }] }] }
export function listLocalModels(providerId, { baseUrl, signal } = {}) {
  const params = new URLSearchParams({ provider: providerId, baseUrl: baseUrl ?? getProviderUrl(providerId) });
  return crmFetch(`/api/ai/local/models?${params}`, { method: 'GET' }, signal, LIST_TIMEOUT_MS);
}

export function loadLocalModel(providerId, model, { contextLength, exclusive = aiSettings.exclusiveLocal, signal } = {}) {
  const body = JSON.stringify({
    provider: providerId,
    baseUrl: getProviderUrl(providerId),
    model,
    contextLength: contextLength ?? getModelContextLength(providerId, model),
    exclusive
  });
  return crmFetch('/api/ai/local/load', { method: 'POST', body }, signal, LOAD_TIMEOUT_MS);
}

export function unloadLocalModel(providerId, model, { signal } = {}) {
  const body = JSON.stringify({ provider: providerId, baseUrl: getProviderUrl(providerId), model });
  return crmFetch('/api/ai/local/unload', { method: 'POST', body }, signal, LIST_TIMEOUT_MS * 4);
}

// === GENERAZIONE ===

/**
 * Genera testo con l'IA scelta per una funzione (purpose) o con un servizio/modello indicato.
 * @param {object} request
 * @param {'editor'|'summary'|'chat'|'report'} [request.purpose]  funzione: usa la scelta delle Impostazioni
 * @param {string} [request.provider]      in alternativa: servizio (con request.model)
 * @param {string} [request.model]
 * @param {string} [request.prompt]        testo singolo (alternativa a messages)
 * @param {{role:'user'|'model', text:string}[]} [request.messages]  conversazione
 * @param {string} [request.system]        istruzioni di sistema
 * @param {AbortSignal} [request.signal]   per annullare
 * @param {number} [request.temperature]
 * @param {number} [request.maxOutputTokens]
 * @param {number} [request.inputLength]   se manca maxOutputTokens, lo si stima da questa lunghezza (caratteri)
 * @returns {Promise<{ text: string, truncated: boolean, usage: object, provider: string, model: string }>}
 */
export async function generateText(request) {
  const choice = request.provider
    ? normalizeChoice({ provider: request.provider, model: request.model }, null)
    : getAIChoice(request.purpose || 'editor');
  const provider = findProvider(choice?.provider);
  if (!provider) throw new AIError('Servizio AI non valido: controlla le Impostazioni → Intelligenza artificiale.', { code: 'error' });
  if (!choice.model) {
    throw new AIError(`Nessun modello scelto per ${provider.label}: sceglilo nelle Impostazioni → Intelligenza artificiale.`, { code: 'model' });
  }

  const messages = request.messages || [{ role: 'user', text: request.prompt || '' }];

  // Token di uscita proporzionati all'input, se non indicati (stima: ~3 caratteri per token)
  let maxOutputTokens = request.maxOutputTokens;
  if (maxOutputTokens === undefined && request.inputLength) {
    maxOutputTokens = Math.min(8192, Math.max(2048, Math.ceil(request.inputLength / 3) * 2));
  }

  const isLocal = provider.kind === 'local';
  const body = JSON.stringify({
    provider: provider.id,
    baseUrl: isLocal ? getProviderUrl(provider.id) : undefined,
    model: choice.model,
    system: request.system,
    messages,
    temperature: request.temperature,
    topK: request.topK,
    topP: request.topP,
    maxOutputTokens,
    relaxSafety: request.relaxSafety,
    // Modelli locali: contesto scelto per il modello e "un solo modello alla volta"
    ...(isLocal && {
      contextLength: getModelContextLength(provider.id, choice.model),
      exclusive: aiSettings.exclusiveLocal
    })
  });
  const timeoutMs = provider.kind === 'local' ? LOCAL_TIMEOUT_MS : CLOUD_TIMEOUT_MS;
  const send = () => crmFetch('/api/ai/chat', { method: 'POST', body }, request.signal, timeoutMs);

  let result;
  try {
    result = await send();
  } catch (error) {
    const delay = error instanceof AIError ? retryDelayMs(error) : null;
    if (delay === null) throw error;
    await sleep(delay, request.signal);
    result = await send();
  }

  // Token: quelli veri restituiti dal servizio, altrimenti una stima dal testo (circa 4 caratteri per token)
  const inputChars = (request.system || '').length + messages.reduce((n, m) => n + (m.text || '').length, 0);
  const estimated = result.usage?.promptTokens == null || result.usage?.outputTokens == null;
  const usage = {
    input: result.usage?.promptTokens ?? Math.round(inputChars / 4),
    output: result.usage?.outputTokens ?? Math.round((result.text || '').length / 4),
    estimated
  };

  try {
    usageListener?.({ provider: provider.id, model: choice.model, purpose: request.purpose || 'altro', usage });
  } catch (error) {
    console.error('[AI] Errore nel conteggio delle richieste:', error);
  }

  return { ...result, provider: provider.id, model: choice.model };
}
