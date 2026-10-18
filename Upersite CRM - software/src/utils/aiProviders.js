// Servizi AI disponibili e modelli Gemini. Usato sia dall'app (aiClient, Impostazioni) sia dal server del CRM
// (server/aiProxy.js): deve restare JavaScript semplice, senza dipendenze dal browser.

// kind: 'local' (gira su un PC della rete, i dati non escono) | 'cloud' (i dati vanno al servizio esterno)
// protocol: come si parla con il servizio. keyEnv: nome della variabile in .env.local con la chiave.
export const AI_PROVIDERS = [
  {
    id: 'lmstudio',
    label: 'LM Studio',
    kind: 'local',
    protocol: 'openai',
    defaultUrl: 'http://127.0.0.1:1234',
    keyEnv: 'LMSTUDIO_API_KEY',
    keyRequired: false,
    hint: 'In LM Studio: scheda Developer → avvia il server e carica un modello.'
  },
  {
    id: 'unsloth',
    label: 'Unsloth Studio',
    kind: 'local',
    protocol: 'openai',
    defaultUrl: 'http://127.0.0.1:8000',
    keyEnv: 'UNSLOTH_API_KEY',
    keyRequired: true,
    hint: 'In Unsloth Studio: carica un modello e crea la chiave in Settings → API.'
  },
  {
    id: 'ollamaCloud',
    label: 'Ollama Cloud',
    kind: 'cloud',
    protocol: 'ollama',
    fixedUrl: 'https://ollama.com',
    keyEnv: 'OLLAMA_API_KEY',
    keyRequired: true,
    hint: 'Crea la chiave su ollama.com/settings/keys.'
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    kind: 'cloud',
    protocol: 'gemini',
    fixedUrl: 'https://generativelanguage.googleapis.com',
    keyEnv: 'GEMINI_API_KEY',
    keyRequired: true,
    hint: 'Crea la chiave su aistudio.google.com/apikey.'
  }
];

// Modelli Gemini (elenco fisso: limiti giornalieri del piano gratuito in rpd)
// apiVersion: 'v1' endpoint stabile, 'v1beta' per i modelli più nuovi (preview, Gemma)
export const GEMINI_MODELS = [
  {
    id: 'gemma-4-31b-it',
    apiVersion: 'v1beta',
    label: 'Gemma 4 31B',
    rpd: 1500,
    badge: '1.5k/g',
    description: 'Modello Gemma 4 da 31B (1.5k RPD)',
    default: true
  },
  {
    id: 'gemini-2.5-flash',
    apiVersion: 'v1',
    label: 'Gemini 2.5 Flash',
    rpd: 20,
    badge: '20/g',
    description: 'Modello stabile (20 RPD)'
  },
  {
    id: 'gemini-3.1-flash-lite-preview',
    apiVersion: 'v1beta',
    label: 'Gemini 3.1 Flash Lite',
    rpd: 500,
    badge: '500/g',
    description: 'Alta capacità (500 RPD)'
  }
];

// Le funzioni del CRM per cui si può scegliere un'IA diversa
export const AI_PURPOSES = [
  { id: 'editor', label: 'Strumenti dell\'editor', description: 'Riscrivi, migliora, traduci, correggi... sul testo selezionato' },
  { id: 'summary', label: 'Riassunto della nota', description: 'Pulsante "Riassumi" dell\'editor e strumento Riassumi' },
  { id: 'chat', label: 'Chat Upersite AI', description: 'Riceve come contesto tutti i dati del CRM, note comprese' },
  { id: 'report', label: 'SmartReport', description: 'Analisi del singolo cliente' }
];

export function findProvider(id) {
  return AI_PROVIDERS.find(p => p.id === id) || null;
}

export function findGeminiModel(id) {
  return GEMINI_MODELS.find(m => m.id === id) || null;
}

export function defaultGeminiModel() {
  return GEMINI_MODELS.find(m => m.default) || GEMINI_MODELS[0];
}
