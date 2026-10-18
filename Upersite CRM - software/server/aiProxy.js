// Proxy AI del CRM: l'app chiede /api/ai/* al server del CRM, che inoltra a LM Studio, Unsloth,
// Ollama Cloud o Gemini. Così:
// - le chiavi restano nel file .env.local e non arrivano mai nel browser;
// - non serve abilitare CORS nei servizi locali.
// Endpoint (tutti con l'header X-Upersite-CRM, come il resto delle /api del CRM):
//   POST /api/ai/chat          { provider, baseUrl?, model, system, messages, temperature, maxOutputTokens, topK, topP,
//                                relaxSafety, contextLength?, exclusive? }
//   GET  /api/ai/models?provider=…&baseUrl=…
//   GET  /api/ai/status        → quali chiavi sono presenti (mai le chiavi)
//   POST /api/ai/keys          { provider, key }  → salva/cancella la chiave in .env.local (key vuota = cancella)
//   GET  /api/ai/local/models?provider=…&baseUrl=…  → modelli locali con stato (caricato, contesto)
//   POST /api/ai/local/load    { provider, baseUrl, model, contextLength?, exclusive? }
//   POST /api/ai/local/unload  { provider, baseUrl, model }
// Le chiavi si leggono da .env.local a ogni richiesta (con cache sulla data del file): valgono subito,
// sia scritte dall'app sia a mano, senza riavviare il CRM.
import fs from 'fs';
import process from 'process';
import { Buffer } from 'buffer';
import { AI_PROVIDERS, GEMINI_MODELS, findProvider, findGeminiModel } from '../src/utils/aiProviders.js';

const LOCAL_TIMEOUT_MS = 180000; // i modelli sul PC possono essere lenti
const CLOUD_TIMEOUT_MS = 60000;
const LIST_TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 20 * 1024 * 1024;
const LOAD_TIMEOUT_MS = 300000; // caricare un modello grande in memoria può richiedere minuti
const MAX_KEY_LENGTH = 500;

// Variabili che, se presenti nell'ambiente del sistema (o dei test), prevalgono su .env.local
const ENV_NAMES = [
  ...AI_PROVIDERS.map(p => p.keyEnv).filter(Boolean),
  'VITE_GEMINI_API_KEY',
  'AI_OLLAMA_CLOUD_URL',
  'AI_GEMINI_URL'
];

function parseEnvFile(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    out[match[1]] = value;
  }
  return out;
}

class ProxyError extends Error {
  constructor(message, info = {}) {
    super(message);
    this.code = info.code || 'error';
    this.status = info.status ?? null;
    this.httpStatus = info.httpStatus || 502;
    this.apiMessage = info.apiMessage || '';
    this.apiStatus = info.apiStatus || '';
    this.retryAfterSeconds = info.retryAfterSeconds ?? null;
    this.zeroQuota = !!info.zeroQuota;
  }
}

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function sendProxyError(res, error) {
  const e = error instanceof ProxyError ? error : new ProxyError(error?.message || 'Errore del proxy AI');
  sendJson(res, e.httpStatus, {
    error: {
      code: e.code,
      message: e.message,
      status: e.status,
      apiMessage: e.apiMessage,
      apiStatus: e.apiStatus,
      retryAfterSeconds: e.retryAfterSeconds,
      zeroQuota: e.zeroQuota
    }
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new ProxyError('Richiesta troppo grande per il servizio AI.', { code: 'error', httpStatus: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new ProxyError('Richiesta non valida.', { httpStatus: 400 }));
      }
    });
    req.on('error', reject);
  });
}

// Indirizzi ammessi per i servizi locali: questo PC o la rete di casa/ufficio (es. un server Umbrel).
// Il server del CRM non deve poter essere usato per contattare indirizzi qualsiasi su internet.
function isAllowedLocalHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return host === 'localhost'
    || host === '::1'
    || host.endsWith('.local')
    || /^127\./.test(host)
    || /^10\./.test(host)
    || /^192\.168\./.test(host)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
}

// Risposte dei modelli che "ragionano" (Qwen, DeepSeek...): il ragionamento non va mostrato
function stripThinking(text) {
  let out = String(text || '');
  out = out.replace(/<think>[\s\S]*?<\/think>/gi, '');
  // Alcuni modelli emettono solo il tag di chiusura (l'apertura è nel template)
  const close = out.toLowerCase().lastIndexOf('</think>');
  if (close !== -1) out = out.slice(close + '</think>'.length);
  return out.trim();
}

function parseRetryAfter(message) {
  const match = String(message || '').match(/retry in ([\d.]+)s/i);
  return match ? Math.ceil(parseFloat(match[1])) : null;
}

export function createAiProxy({ envFile, rejectForeignRequest }) {
  let envCache = { mtimeMs: -1, vars: {} };

  const readFileVars = () => {
    try {
      const stat = fs.statSync(envFile);
      if (stat.mtimeMs !== envCache.mtimeMs) {
        envCache = { mtimeMs: stat.mtimeMs, vars: parseEnvFile(fs.readFileSync(envFile, 'utf8')) };
      }
      return envCache.vars;
    } catch {
      envCache = { mtimeMs: -1, vars: {} };
      return {};
    }
  };

  // Chiavi e indirizzi correnti: file .env.local, con le variabili di sistema che prevalgono
  const readEnv = () => {
    const env = { ...readFileVars() };
    for (const name of ENV_NAMES) {
      if (process.env[name]) env[name] = process.env[name];
    }
    return env;
  };

  const keyFor = (provider) => {
    const env = readEnv();
    if (provider.id === 'gemini') return env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || '';
    return provider.keyEnv ? (env[provider.keyEnv] || '') : '';
  };

  // Salva (o cancella, se value è vuoto) una variabile in .env.local, lasciando intatto il resto del file
  const writeEnvVar = (name, value) => {
    let text = '';
    try { text = fs.readFileSync(envFile, 'utf8'); } catch { /* file non ancora creato */ }
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text ? text.split(/\r?\n/) : [];
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    const matchesName = (line) => new RegExp(`^\\s*${name}\\s*=`).test(line);
    const index = lines.findIndex(matchesName);
    if (value) {
      if (index >= 0) lines[index] = `${name}=${value}`;
      else lines.push(`${name}=${value}`);
    } else {
      // Cancellazione: tolte tutte le righe con quel nome
      for (let i = lines.length - 1; i >= 0; i--) if (matchesName(lines[i])) lines.splice(i, 1);
    }
    // Scrittura atomica (il file temporaneo finisce in .local, quindi è comunque escluso da git)
    const tmp = `${envFile}.saving.local`;
    fs.writeFileSync(tmp, lines.length ? lines.join(eol) + eol : '', 'utf8');
    fs.renameSync(tmp, envFile);
    envCache = { mtimeMs: -1, vars: {} };
  };

  // Indirizzo del servizio. Per i cloud è fisso (sovrascrivibile solo da variabili d'ambiente, per i test).
  const resolveBaseUrl = (provider, baseUrl) => {
    if (provider.kind === 'cloud') {
      const env = readEnv();
      const override = provider.id === 'ollamaCloud' ? env.AI_OLLAMA_CLOUD_URL
        : provider.id === 'gemini' ? env.AI_GEMINI_URL : '';
      return String(override || provider.fixedUrl).replace(/\/+$/, '');
    }
    const raw = String(baseUrl || provider.defaultUrl).trim();
    let url;
    try {
      url = new URL(raw);
    } catch {
      throw new ProxyError(`Indirizzo di ${provider.label} non valido: ${raw}`, { code: 'url', httpStatus: 400 });
    }
    if (!/^https?:$/.test(url.protocol) || !isAllowedLocalHost(url.hostname)) {
      throw new ProxyError(
        `Indirizzo di ${provider.label} non ammesso: ${raw}. Usa un indirizzo di questo PC o della rete locale (es. http://127.0.0.1:1234).`,
        { code: 'url', httpStatus: 400 }
      );
    }
    // Si accetta anche l'indirizzo copiato con /v1 finale
    return `${url.origin}${url.pathname}`.replace(/\/+$/, '').replace(/\/v1$/i, '');
  };

  const keyMissingError = (provider) => new ProxyError(
    `Chiave di ${provider.label} mancante: inseriscila in Impostazioni → Intelligenza artificiale → Servizi e chiavi.`,
    { code: 'auth', httpStatus: 401 }
  );

  // fetch verso il servizio con timeout e annullamento quando il browser chiude la richiesta
  async function upstream(provider, url, init, { timeoutMs, signal }) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (timedOut) {
        throw new ProxyError(`${provider.label} non ha risposto in tempo. Riprova (i modelli locali grandi possono essere lenti).`, { code: 'timeout', httpStatus: 504 });
      }
      if (signal?.aborted) throw new ProxyError('Richiesta annullata', { code: 'aborted', httpStatus: 499 });
      const cause = error?.cause?.code || error?.code || '';
      const where = new URL(url).origin;
      const how = provider.kind === 'local' ? ` ${provider.hint}` : ' Controlla la connessione a internet.';
      throw new ProxyError(`${provider.label} non raggiungibile su ${where}.${how}${cause ? ` (${cause})` : ''}`, { code: 'unreachable', httpStatus: 502 });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  // Errore HTTP del servizio → messaggio chiaro
  async function errorFrom(provider, response, model) {
    const raw = await response.text().catch(() => '');
    let data = {};
    try { data = JSON.parse(raw); } catch { /* risposta non JSON */ }
    const apiMessage = (typeof data.error === 'string' ? data.error : data.error?.message) || data.message || raw.slice(0, 300) || '';
    const apiStatus = data.error?.status || '';
    const status = response.status;

    if (status === 401 || status === 403) {
      return new ProxyError(
        `${provider.label}: chiave mancante o non valida. Controllala in Impostazioni → Intelligenza artificiale → Servizi e chiavi.`,
        { code: 'auth', status, apiMessage, httpStatus: 401 }
      );
    }
    if (status === 429 || apiStatus === 'RESOURCE_EXHAUSTED' || (provider.id === 'gemini' && /quota|exceeded|limit: 0/i.test(apiMessage))) {
      return new ProxyError(
        `${provider.label}: limite di richieste raggiunto. Riprova tra poco o scegli un altro modello.`,
        { code: 'quota', status, apiMessage, apiStatus, retryAfterSeconds: parseRetryAfter(apiMessage), zeroQuota: apiMessage.includes('limit: 0'), httpStatus: 429 }
      );
    }
    if (status === 404 || /model.*not found|not found.*model|no models? loaded|model.*does not exist|invalid model/i.test(apiMessage)) {
      const tip = provider.id === 'lmstudio' ? ' Caricalo in LM Studio (o scegline un altro).'
        : ' Scegline un altro nelle Impostazioni.';
      return new ProxyError(`${provider.label}: modello "${model}" non disponibile.${tip}`, { code: 'model', status, apiMessage, httpStatus: 404 });
    }
    return new ProxyError(apiMessage || `${provider.label}: errore del servizio (HTTP ${status})`, { code: 'http', status, apiMessage, apiStatus, httpStatus: 502 });
  }

  // ── Adattatori ──

  // LM Studio, Unsloth Studio: API compatibile OpenAI
  async function chatOpenAI(provider, base, key, req, ctx) {
    const body = {
      model: req.model,
      messages: [
        ...(req.system ? [{ role: 'system', content: req.system }] : []),
        ...req.messages.map(m => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text }))
      ],
      stream: false
    };
    if (req.temperature !== undefined) body.temperature = req.temperature;
    if (req.topP !== undefined) body.top_p = req.topP;
    if (req.maxOutputTokens !== undefined) body.max_tokens = req.maxOutputTokens;

    const response = await upstream(provider, `${base}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(key && { Authorization: `Bearer ${key}` }) },
      body: JSON.stringify(body)
    }, ctx);
    if (!response.ok) throw await errorFrom(provider, response, req.model);

    const data = await response.json();
    const choice = data.choices?.[0];
    return {
      text: stripThinking(choice?.message?.content),
      truncated: choice?.finish_reason === 'length',
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? null,
        outputTokens: data.usage?.completion_tokens ?? null,
        totalTokens: data.usage?.total_tokens ?? null
      }
    };
  }

  // Ollama Cloud: API nativa /api/chat
  async function chatOllama(provider, base, key, req, ctx) {
    const options = {};
    if (req.temperature !== undefined) options.temperature = req.temperature;
    if (req.topK !== undefined) options.top_k = req.topK;
    if (req.topP !== undefined) options.top_p = req.topP;
    if (req.maxOutputTokens !== undefined) options.num_predict = req.maxOutputTokens;

    const response = await upstream(provider, `${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(key && { Authorization: `Bearer ${key}` }) },
      body: JSON.stringify({
        model: req.model,
        messages: [
          ...(req.system ? [{ role: 'system', content: req.system }] : []),
          ...req.messages.map(m => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text }))
        ],
        stream: false,
        ...(Object.keys(options).length > 0 && { options })
      })
    }, ctx);
    if (!response.ok) throw await errorFrom(provider, response, req.model);

    const data = await response.json();
    return {
      text: stripThinking(data.message?.content),
      truncated: data.done_reason === 'length',
      usage: {
        promptTokens: data.prompt_eval_count ?? null,
        outputTokens: data.eval_count ?? null,
        totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0) || null
      }
    };
  }

  // Google Gemini (chiave nell'header, non nell'URL)
  async function chatGemini(provider, base, key, req, ctx) {
    const modelInfo = findGeminiModel(req.model);
    const apiVersion = modelInfo?.apiVersion || 'v1beta';

    // I modelli Gemma non accettano sempre systemInstruction: per loro l'istruzione va nel primo messaggio
    const useSystemInstruction = !!req.system && !req.model.startsWith('gemma');
    const contents = req.messages.map(m => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: m.text }] }));
    if (req.system && !useSystemInstruction) {
      if (contents.length > 0 && contents[0].role === 'user') {
        contents[0] = { ...contents[0], parts: [{ text: `${req.system}\n\n${contents[0].parts[0].text}` }] };
      } else {
        contents.unshift({ role: 'user', parts: [{ text: req.system }] });
      }
    }

    const generationConfig = {};
    if (req.temperature !== undefined) generationConfig.temperature = req.temperature;
    if (req.topK !== undefined) generationConfig.topK = req.topK;
    if (req.topP !== undefined) generationConfig.topP = req.topP;
    if (req.maxOutputTokens !== undefined) generationConfig.maxOutputTokens = req.maxOutputTokens;

    const body = {
      ...(useSystemInstruction && { systemInstruction: { parts: [{ text: req.system }] } }),
      contents,
      ...(Object.keys(generationConfig).length > 0 && { generationConfig }),
      ...(req.relaxSafety && {
        safetySettings: ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT']
          .map(category => ({ category, threshold: 'BLOCK_NONE' }))
      })
    };

    const response = await upstream(provider, `${base}/${apiVersion}/models/${encodeURIComponent(req.model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body)
    }, ctx);
    if (!response.ok) throw await errorFrom(provider, response, req.model);

    const data = await response.json();
    if (data.promptFeedback?.blockReason) {
      throw new ProxyError('Il testo è stato bloccato dai filtri di Google Gemini.', { code: 'blocked', httpStatus: 422 });
    }
    const candidate = data.candidates?.[0];
    return {
      text: stripThinking(candidate?.content?.parts?.map(p => p.text || '').join('')),
      truncated: candidate?.finishReason === 'MAX_TOKENS',
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount ?? null,
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? null,
        totalTokens: data.usageMetadata?.totalTokenCount ?? null
      }
    };
  }

  const CHAT_ADAPTERS = { openai: chatOpenAI, ollama: chatOllama, gemini: chatGemini };

  // ── Gestione dei modelli locali (LM Studio 0.4+) ──

  const authHeaders = (key) => (key ? { Authorization: `Bearer ${key}` } : {});

  // Elenco con stato. supported: false se il servizio non permette di caricare/scaricare dal CRM.
  async function localModels(provider, base, key, signal) {
    const ctx = { timeoutMs: LIST_TIMEOUT_MS, signal };

    if (provider.id === 'lmstudio') {
      const response = await upstream(provider, `${base}/api/v1/models`, { headers: authHeaders(key) }, ctx);
      if (response.status === 404) {
        return { supported: false, reason: 'Per caricare e scaricare i modelli dal CRM serve LM Studio 0.4 o successivo.', models: [] };
      }
      if (!response.ok) throw await errorFrom(provider, response, '');
      const data = await response.json();
      const models = (data.models || [])
        .filter(m => m.type === 'llm')
        .map(m => ({
          id: m.key,
          label: m.display_name || m.key,
          sizeBytes: m.size_bytes ?? null,
          maxContextLength: m.max_context_length ?? null,
          instances: (m.loaded_instances || []).map(i => ({ id: i.id, contextLength: i.config?.context_length ?? null }))
        }));
      return { supported: true, models };
    }

    return { supported: false, reason: `${provider.label} non permette di caricare o scaricare i modelli dal CRM: si gestiscono dalla sua app.`, models: [] };
  }

  async function unloadInstance(provider, base, key, id, signal) {
    const ctx = { timeoutMs: LIST_TIMEOUT_MS * 2, signal };
    const response = await upstream(provider, `${base}/api/v1/models/unload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(key) },
      body: JSON.stringify({ instance_id: id })
    }, ctx);
    if (!response.ok) throw await errorFrom(provider, response, id);
  }

  async function loadModel(provider, base, key, model, contextLength, signal) {
    const ctx = { timeoutMs: LOAD_TIMEOUT_MS, signal };
    const response = await upstream(provider, `${base}/api/v1/models/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(key) },
      body: JSON.stringify({ model, ...(contextLength && { context_length: contextLength }) })
    }, ctx);
    if (!response.ok) throw await errorFrom(provider, response, model);
  }

  // Porta il servizio nello stato voluto: il modello richiesto caricato (con il contesto scelto) e,
  // se exclusive, nessun altro modello in memoria. Per LM Studio senza API v1 non fa nulla.
  async function ensureLoaded(provider, base, key, model, contextLength, exclusive, signal) {
    if (provider.id !== 'lmstudio') return { changed: false };
    const state = await localModels(provider, base, key, signal);
    if (!state.supported) return { changed: false };

    let changed = false;
    if (exclusive) {
      for (const other of state.models) {
        if (other.id === model) continue;
        for (const instance of other.instances) {
          await unloadInstance(provider, base, key, instance.id, signal);
          changed = true;
        }
      }
    }

    const target = state.models.find(m => m.id === model);
    const instances = target?.instances || [];
    const wrongContext = contextLength && instances.some(i => i.contextLength && i.contextLength !== contextLength);
    if (wrongContext) {
      for (const instance of instances) await unloadInstance(provider, base, key, instance.id, signal);
    }
    if (instances.length === 0 || wrongContext) {
      await loadModel(provider, base, key, model, contextLength, signal);
      changed = true;
    }
    return { changed };
  }

  // ── Elenco modelli ──
  async function listModels(provider, baseUrl, signal) {
    if (provider.protocol === 'gemini') {
      return GEMINI_MODELS.map(m => ({ id: m.id, label: m.label, description: m.description, badge: m.badge, rpd: m.rpd }));
    }
    const base = resolveBaseUrl(provider, baseUrl);
    const key = keyFor(provider);
    if (provider.keyRequired && !key) throw keyMissingError(provider);
    const headers = key ? { Authorization: `Bearer ${key}` } : {};
    const ctx = { timeoutMs: LIST_TIMEOUT_MS, signal };

    if (provider.protocol === 'openai') {
      const response = await upstream(provider, `${base}/v1/models`, { headers }, ctx);
      if (!response.ok) throw await errorFrom(provider, response, '');
      const data = await response.json();
      return (data.data || [])
        .map(m => m.id)
        .filter(id => id && !/embed/i.test(id)) // i modelli di embedding non sanno chattare
        .map(id => ({ id, label: id }));
    }

    const response = await upstream(provider, `${base}/api/tags`, { headers }, ctx);
    if (!response.ok) throw await errorFrom(provider, response, '');
    const data = await response.json();
    return (data.models || [])
      .map(m => m.name || m.model)
      .filter(Boolean)
      .map(id => ({ id, label: id }));
  }

  // ── Router ──
  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    if (rejectForeignRequest(req, res)) return;

    // Il browser ha chiuso la richiesta (Annulla / Ferma): si annulla anche quella verso il servizio
    const abort = new AbortController();
    res.on('close', () => { if (!res.writableEnded) abort.abort(); });

    try {
      if (url.pathname === '/api/ai/status' && req.method === 'GET') {
        const providers = {};
        for (const p of AI_PROVIDERS) {
          providers[p.id] = {
            hasKey: !!keyFor(p),
            keyRequired: p.keyRequired,
            keyEnv: p.keyEnv,
            // Chiave impostata nel sistema operativo: non si può cambiare dall'app
            fromSystem: !!(p.keyEnv && process.env[p.keyEnv])
          };
        }
        sendJson(res, 200, { providers });
        return;
      }

      if (url.pathname === '/api/ai/keys' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const provider = findProvider(body.provider);
        if (!provider || !provider.keyEnv) throw new ProxyError('Questo servizio non usa una chiave.', { httpStatus: 400 });
        const key = String(body.key ?? '').trim();
        if (key.length > MAX_KEY_LENGTH || /\s/.test(key)) {
          throw new ProxyError('Chiave non valida: incollala senza spazi o a capo.', { code: 'auth', httpStatus: 400 });
        }
        writeEnvVar(provider.keyEnv, key);
        if (provider.id === 'gemini' && !key) writeEnvVar('VITE_GEMINI_API_KEY', '');
        sendJson(res, 200, { ok: true, hasKey: !!keyFor(provider) });
        return;
      }

      if (url.pathname === '/api/ai/local/models' && req.method === 'GET') {
        const provider = findProvider(url.searchParams.get('provider'));
        if (!provider) throw new ProxyError('Servizio AI sconosciuto.', { httpStatus: 400 });
        if (provider.kind !== 'local') {
          sendJson(res, 200, { supported: false, reason: 'I modelli cloud non si caricano in memoria.', models: [] });
          return;
        }
        const base = resolveBaseUrl(provider, url.searchParams.get('baseUrl'));
        sendJson(res, 200, await localModels(provider, base, keyFor(provider), abort.signal));
        return;
      }

      if ((url.pathname === '/api/ai/local/load' || url.pathname === '/api/ai/local/unload') && req.method === 'POST') {
        const body = await readJsonBody(req);
        const provider = findProvider(body.provider);
        if (!provider || provider.kind !== 'local') throw new ProxyError('Servizio AI non valido.', { httpStatus: 400 });
        if (!body.model) throw new ProxyError('Nessun modello indicato.', { code: 'model', httpStatus: 400 });
        const base = resolveBaseUrl(provider, body.baseUrl);
        const key = keyFor(provider);
        const state = await localModels(provider, base, key, abort.signal);
        if (!state.supported) throw new ProxyError(state.reason, { code: 'unsupported', httpStatus: 400 });

        if (url.pathname.endsWith('/unload')) {
          const target = state.models.find(m => m.id === body.model);
          for (const instance of target?.instances || []) await unloadInstance(provider, base, key, instance.id, abort.signal);
        } else {
          const contextLength = Number(body.contextLength) > 0 ? Math.round(Number(body.contextLength)) : undefined;
          await ensureLoaded(provider, base, key, String(body.model), contextLength, body.exclusive !== false, abort.signal);
        }
        sendJson(res, 200, await localModels(provider, base, key, abort.signal));
        return;
      }

      if (url.pathname === '/api/ai/models' && req.method === 'GET') {
        const provider = findProvider(url.searchParams.get('provider'));
        if (!provider) throw new ProxyError('Servizio AI sconosciuto.', { httpStatus: 400 });
        const models = await listModels(provider, url.searchParams.get('baseUrl'), abort.signal);
        sendJson(res, 200, { models });
        return;
      }

      if (url.pathname === '/api/ai/chat' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const provider = findProvider(body.provider);
        if (!provider) throw new ProxyError('Servizio AI sconosciuto.', { httpStatus: 400 });
        if (!body.model) throw new ProxyError(`Nessun modello scelto per ${provider.label}.`, { code: 'model', httpStatus: 400 });
        if (!Array.isArray(body.messages) || body.messages.length === 0) throw new ProxyError('Nessun messaggio da inviare.', { httpStatus: 400 });

        const key = keyFor(provider);
        if (provider.keyRequired && !key) throw keyMissingError(provider);
        const base = resolveBaseUrl(provider, body.baseUrl);
        const ctx = { timeoutMs: provider.kind === 'local' ? LOCAL_TIMEOUT_MS : CLOUD_TIMEOUT_MS, signal: abort.signal };
        const contextLength = Number(body.contextLength) > 0 ? Math.round(Number(body.contextLength)) : undefined;

        // Modelli locali: si carica quello richiesto (con il contesto scelto) e, se richiesto, si scaricano gli altri
        if (provider.kind === 'local') {
          await ensureLoaded(provider, base, key, String(body.model), contextLength, body.exclusive !== false, abort.signal);
        }

        const result = await CHAT_ADAPTERS[provider.protocol](provider, base, key, {
          model: String(body.model),
          system: body.system || '',
          messages: body.messages.map(m => ({ role: m.role === 'model' ? 'model' : 'user', text: String(m.text ?? '') })),
          temperature: body.temperature,
          topK: body.topK,
          topP: body.topP,
          maxOutputTokens: body.maxOutputTokens,
          relaxSafety: !!body.relaxSafety,
          contextLength
        }, ctx);

        if (!result.text) {
          throw new ProxyError(`${provider.label} non ha restituito nessuna risposta.`, { code: 'empty', httpStatus: 502 });
        }
        sendJson(res, 200, result);
        return;
      }

      sendJson(res, 404, { error: { code: 'error', message: 'Endpoint AI sconosciuto.' } });
    } catch (error) {
      if (abort.signal.aborted && res.writableEnded === false && res.destroyed) return;
      if (!(error instanceof ProxyError)) console.error('[CRM AI]', error);
      sendProxyError(res, error);
    }
  }

  return { handle };
}
