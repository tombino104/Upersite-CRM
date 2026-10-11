// Chiave API Gemini letta dalle variabili d'ambiente di Vite (file .env.local, escluso da git).
// Vedi .env.example per il formato.
export const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

if (!GEMINI_API_KEY) {
  console.warn('[Upersite AI] VITE_GEMINI_API_KEY non configurata: le funzioni AI non funzioneranno. Crea il file .env.local (vedi .env.example).');
}
