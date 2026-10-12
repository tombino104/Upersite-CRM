// Client AI unico del CRM: tutte le funzioni AI (strumenti dell'editor, chat, SmartReport) passano da qui.
// Contiene l'elenco dei modelli, la scelta del modello e la chiamata al servizio, con timeout,
// annullamento, nuovo tentativo e conteggio delle richieste.
//
// Per aggiungere un altro servizio (es. un modello locale) basta una funzione in PROVIDERS e dei modelli
// con il relativo `provider` in AI_MODELS: chi chiama generateText() non cambia.
import { GEMINI_API_KEY } from './geminiConfig';

// === MODELLI DISPONIBILI ===
// apiVersion: 'v1' endpoint stabile, 'v1beta' per i modelli più nuovi (preview, Gemma)
export const AI_MODELS = [
  {
    id: 'gemma-4-31b-it',
    provider: 'gemini',
    apiVersion: 'v1beta',
    label: 'Gemma 4 31B',
    rpd: 1500,
    badge: '1.5k/g',
    description: 'Modello Gemma 4 da 31B (1.5k RPD)',
    default: true
  },
  {
    id: 'gemini-2.5-flash',
    provider: 'gemini',
    apiVersion: 'v1',
    label: 'Gemini 2.5 Flash',
    rpd: 20,
    badge: '20/g',
    description: 'Modello stabile (20 RPD)'
  },
  {
    id: 'gemini-3.1-flash-lite-preview',
    provider: 'gemini',
    apiVersion: 'v1beta',
    label: 'Gemini 3.1 Flash Lite',
    rpd: 500,
    badge: '500/g',
    description: 'Alta capacità (500 RPD)'
  }
];

const WRITING_MODEL_STORAGE_KEY = 'upersite_ai_writing_model';
const REQUEST_TIMEOUT_MS = 45000;
const MAX_AUTO_RETRY_WAIT_S = 10;

export function findModel(id) {
  return id ? AI_MODELS.find(m => m.id === id) || null : null;
}

export function defaultModel() {
  return AI_MODELS.find(m => m.default) || AI_MODELS[0];
}

export function getAvailableModels() {
  return AI_MODELS;
}

// === MODELLI SCELTI NELLE IMPOSTAZIONI ===
// Le impostazioni (salvate in crm_data.json) sono la fonte di verità, sincronizzate da App.jsx con
// syncAISettings; il localStorage resta come ripiego per il modello di scrittura.
let configuredWritingModelId = null;
let configuredSummaryModelId = null;

function readStoredWritingModelId() {
  try {
    return localStorage.getItem(WRITING_MODEL_STORAGE_KEY);
  } catch {
    return null; // localStorage non disponibile
  }
}

// Modello per gli strumenti di scrittura dell'editor
export function getCurrentModel() {
  return findModel(configuredWritingModelId) || findModel(readStoredWritingModelId()) || defaultModel();
}

// Modello per i riassunti: se l'ID salvato non esiste più si ricade sul modello di scrittura
export function getCurrentSummaryModel() {
  return findModel(configuredSummaryModelId) || getCurrentModel();
}

export function setAIModel(modelId) {
  configuredWritingModelId = modelId;
  try {
    localStorage.setItem(WRITING_MODEL_STORAGE_KEY, modelId);
  } catch {
    // localStorage non disponibile
  }
}

// Imposta subito il modello per i riassunti (la persistenza è nelle impostazioni dell'app)
export function setAISummaryModel(modelId) {
  configuredSummaryModelId = modelId;
}

// Sincronizza i modelli dalle impostazioni dell'app
export function syncAISettings(settings) {
  configuredWritingModelId = settings?.aiWritingModel || null;
  configuredSummaryModelId = settings?.aiSummaryModel || null;
}

// === CONTEGGIO RICHIESTE ===
// App.jsx registra qui chi deve contare le richieste: così contano tutte le funzioni AI, non solo la chat.
let usageListener = null;

export function setAIUsageListener(listener) {
  usageListener = listener;
}

// === ERRORI ===
// Errore con le informazioni utili alla UI (tipo di problema, messaggio e tempi dati dal servizio)
export class AIError extends Error {
  constructor(message, { code = 'error', status = null, apiMessage = '', apiStatus = '', retryAfterSeconds = null, zeroQuota = false } = {}) {
    super(message);
    this.name = 'AIError';
    this.code = code; // 'quota' | 'timeout' | 'network' | 'aborted' | 'blocked' | 'empty' | 'no-key' | 'http' | 'error'
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

// Una singola chiamata HTTP con timeout e annullamento esterno
async function fetchOnce(apiUrl, init, externalSignal) {
  if (externalSignal?.aborted) throw new AIError('Richiesta annullata', { code: 'aborted' });

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

  try {
    return await fetch(apiUrl, { ...init, signal: controller.signal });
  } catch {
    if (timedOut) throw new AIError('Il servizio AI non ha risposto in tempo. Riprova.', { code: 'timeout' });
    if (externalSignal?.aborted) throw new AIError('Richiesta annullata', { code: 'aborted' });
    throw new AIError('Impossibile contattare il servizio AI. Controlla la connessione.', { code: 'network' });
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

// Legge l'errore restituito dal servizio e lo trasforma in un AIError
async function errorFromResponse(response) {
  const errorData = await response.json().catch(() => ({}));
  const apiMessage = errorData.error?.message || '';
  const apiStatus = errorData.error?.status || '';
  const retryMatch = apiMessage.match(/retry in ([\d.]+)s/i);
  const retryAfterSeconds = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) : null;

  const isQuota = response.status === 429 || apiStatus === 'RESOURCE_EXHAUSTED' || /quota|exceeded|limit: 0/i.test(apiMessage);
  if (isQuota) {
    return new AIError(
      'Limite di richieste AI raggiunto. Riprova tra poco o scegli un altro modello.',
      { code: 'quota', status: response.status, apiMessage, apiStatus, retryAfterSeconds, zeroQuota: apiMessage.includes('limit: 0') }
    );
  }
  return new AIError(apiMessage || `Errore del servizio AI (HTTP ${response.status})`, {
    code: 'http', status: response.status, apiMessage, apiStatus
  });
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

// === SERVIZIO GEMINI ===
async function callGemini(model, request) {
  const { messages, system, signal, temperature, topK, topP, maxOutputTokens, relaxSafety } = request;

  // I modelli Gemma non accettano sempre systemInstruction: per loro l'istruzione va nel primo messaggio
  const useSystemInstruction = !!system && !model.id.startsWith('gemma');
  const contents = messages.map(m => ({
    role: m.role === 'model' ? 'model' : 'user',
    parts: [{ text: m.text }]
  }));
  if (system && !useSystemInstruction && contents.length > 0 && contents[0].role === 'user') {
    contents[0] = { ...contents[0], parts: [{ text: `${system}\n\n${contents[0].parts[0].text}` }] };
  } else if (system && !useSystemInstruction) {
    contents.unshift({ role: 'user', parts: [{ text: system }] });
  }

  const generationConfig = {};
  if (temperature !== undefined) generationConfig.temperature = temperature;
  if (topK !== undefined) generationConfig.topK = topK;
  if (topP !== undefined) generationConfig.topP = topP;
  if (maxOutputTokens !== undefined) generationConfig.maxOutputTokens = maxOutputTokens;

  const body = {
    ...(useSystemInstruction && { systemInstruction: { parts: [{ text: system }] } }),
    contents,
    ...(Object.keys(generationConfig).length > 0 && { generationConfig }),
    ...(relaxSafety && {
      safetySettings: [
        'HARM_CATEGORY_HARASSMENT',
        'HARM_CATEGORY_HATE_SPEECH',
        'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        'HARM_CATEGORY_DANGEROUS_CONTENT'
      ].map(category => ({ category, threshold: 'BLOCK_NONE' }))
    })
  };

  const apiUrl = `https://generativelanguage.googleapis.com/${model.apiVersion}/models/${model.id}:generateContent?key=${GEMINI_API_KEY}`;
  const init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };

  let response = await fetchOnce(apiUrl, init, signal);
  if (!response.ok) {
    let error = await errorFromResponse(response);
    const delay = retryDelayMs(error);
    if (delay !== null) {
      await sleep(delay, signal);
      response = await fetchOnce(apiUrl, init, signal);
      if (!response.ok) error = await errorFromResponse(response);
    }
    if (!response.ok) throw error;
  }

  const data = await response.json();

  if (data.promptFeedback?.blockReason) {
    throw new AIError('Il testo è stato bloccato dai filtri del servizio AI.', { code: 'blocked' });
  }

  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map(p => p.text || '').join('').trim();
  if (!text) {
    throw new AIError('Nessuna risposta valida dal servizio AI.', { code: 'empty' });
  }

  return {
    text,
    truncated: candidate.finishReason === 'MAX_TOKENS',
    usage: {
      promptTokens: data.usageMetadata?.promptTokenCount ?? null,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? null,
      totalTokens: data.usageMetadata?.totalTokenCount ?? null
    }
  };
}

// Un'entrata per ogni servizio: riceve (modello, richiesta) e restituisce { text, truncated, usage }
const PROVIDERS = {
  gemini: callGemini
};

/**
 * Genera testo con il modello indicato (o con quello predefinito).
 * @param {object} request
 * @param {string} [request.prompt]        testo singolo (alternativa a messages)
 * @param {{role:'user'|'model', text:string}[]} [request.messages]  conversazione
 * @param {string} [request.system]        istruzioni di sistema
 * @param {string} [request.modelId]
 * @param {AbortSignal} [request.signal]   per annullare
 * @param {number} [request.temperature]
 * @param {number} [request.maxOutputTokens]
 * @param {number} [request.inputLength]   se manca maxOutputTokens, lo si stima da questa lunghezza (caratteri)
 * @returns {Promise<{ text: string, truncated: boolean, usage: object, model: object }>}
 */
export async function generateText(request) {
  if (!GEMINI_API_KEY) {
    throw new AIError('Chiave API Gemini non configurata (VITE_GEMINI_API_KEY nel file .env.local).', { code: 'no-key' });
  }

  const model = findModel(request.modelId) || getCurrentModel();
  const provider = PROVIDERS[model.provider];
  if (!provider) throw new AIError(`Servizio AI "${model.provider}" non disponibile.`, { code: 'error' });

  const messages = request.messages || [{ role: 'user', text: request.prompt || '' }];

  // Token di uscita proporzionati all'input, se non indicati (stima: ~3 caratteri per token)
  let maxOutputTokens = request.maxOutputTokens;
  if (maxOutputTokens === undefined && request.inputLength) {
    maxOutputTokens = Math.min(8192, Math.max(2048, Math.ceil(request.inputLength / 3) * 2));
  }

  const result = await provider(model, { ...request, messages, maxOutputTokens });

  try {
    usageListener?.({ model, usage: result.usage });
  } catch (error) {
    console.error('[AI] Errore nel conteggio delle richieste:', error);
  }

  return { ...result, model };
}
