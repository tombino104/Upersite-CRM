// Servizio AI per Writing Tools - Gemma 4 31B
// Utilizza l'API Gemini con modello Gemma 4 31B per elaborazione testo

const GEMINI_API_KEY = "CHIAVE_RIMOSSA_VEDI_.env.local";

// Configurazione modelli disponibili
const AI_MODELS = [
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

const STORAGE_KEY = 'upersite_ai_writing_model';

// Prompts per ogni strumento AI
const AI_PROMPTS = {
  rewrite: (text) => `Riscrivi il seguente testo in modo più professionale e chiaro, mantenendo lo stesso significato:\n\n"${text}"\n\nRispondi solo con il testo riscritto, senza aggiungere commenti o spiegazioni.`,
  
  summarize: (text) => `Riassumi il seguente testo in modo conciso ma completo, mantenendo i punti chiave:\n\n"${text}"\n\nRispondi solo con il riassunto, senza aggiungere commenti o spiegazioni.`,
  
  improve: (text) => `Migliora il seguente testo rendendolo più chiaro, professionale e ben strutturato. Correggi eventuali errori grammaticali e migliora lo stile:\n\n"${text}"\n\nRispondi solo con il testo migliorato, senza aggiungere commenti o spiegazioni.`,
  
  expand: (text) => `Espandi il seguente testo aggiungendo dettagli rilevanti e spiegazioni più approfondite, mantenendo il significato originale:\n\n"${text}"\n\nRispondi solo con il testo espanso, senza aggiungere commenti o spiegazioni.`,
  
  translate: (text, targetLang = 'inglese') => `Traduci il seguente testo in ${targetLang}:\n\n"${text}"\n\nRispondi solo con la traduzione, senza aggiungere commenti o spiegazioni.`,
  
  ideas: (text) => `Basandoti sul seguente testo, genera 5 idee o spunti di riflessione correlati:\n\n"${text}"\n\nRispondi con una lista numerata delle 5 idee, una per riga, senza aggiungere commenti.`,
  
  grammar: (text) => `Correggi la grammatica, la punteggiatura e la sintassi del seguente testo, mantenendo il significato e lo stile originali:\n\n"${text}"\n\nRispondi solo con il testo corretto, senza aggiungere commenti o spiegazioni.`
};

// Ottieni il modello configurato
function getConfiguredModel() {
  const savedModelId = localStorage.getItem(STORAGE_KEY);
  if (savedModelId) {
    const model = AI_MODELS.find(m => m.id === savedModelId);
    if (model) return model;
  }
  // Modello di default
  return AI_MODELS.find(m => m.default) || AI_MODELS[0];
}

// Salva il modello preferito
export function setAIModel(modelId) {
  localStorage.setItem(STORAGE_KEY, modelId);
}

// Ottieni tutti i modelli disponibili
export function getAvailableModels() {
  return AI_MODELS;
}

// Ottieni il modello corrente
export function getCurrentModel() {
  return getConfiguredModel();
}

// Funzione per chiamare API Gemini
async function callGemini(prompt, modelId = null) {
  const model = modelId ? AI_MODELS.find(m => m.id === modelId) || getConfiguredModel() : getConfiguredModel();
  const apiUrl = `https://generativelanguage.googleapis.com/${model.apiVersion}/models/${model.id}:generateContent?key=${GEMINI_API_KEY}`;
  
  const requestBody = {
    contents: [{
      parts: [{
        text: prompt
      }]
    }],
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 2048,
    },
    safetySettings: [
      {
        category: "HARM_CATEGORY_HARASSMENT",
        threshold: "BLOCK_NONE"
      },
      {
        category: "HARM_CATEGORY_HATE_SPEECH", 
        threshold: "BLOCK_NONE"
      },
      {
        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        threshold: "BLOCK_NONE"
      },
      {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
        threshold: "BLOCK_NONE"
      }
    ]
  };

  try {
    console.log(`[AI Writing Tools] Calling model: ${model.id} | Endpoint: ${model.apiVersion}`);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
      return data.candidates[0].content.parts[0].text.trim();
    } else {
      throw new Error('Nessuna risposta valida dall\'API');
    }
  } catch (error) {
    console.error('[AI Writing Tools] Error:', error);
    throw error;
  }
}

// Funzioni esportate per ogni strumento
export const aiTextService = {
  async rewrite(text) {
    return await callGemini(AI_PROMPTS.rewrite(text));
  },
  
  async summarize(text, modelId = null) {
    return await callGemini(AI_PROMPTS.summarize(text), modelId);
  },
  
  async improve(text) {
    return await callGemini(AI_PROMPTS.improve(text));
  },
  
  async expand(text) {
    return await callGemini(AI_PROMPTS.expand(text));
  },
  
  async translate(text, targetLang = 'inglese') {
    return await callGemini(AI_PROMPTS.translate(text, targetLang));
  },
  
  async generateIdeas(text) {
    return await callGemini(AI_PROMPTS.ideas(text));
  },
  
  async fixGrammar(text) {
    return await callGemini(AI_PROMPTS.grammar(text));
  },
  
  // Funzioni di configurazione
  setModel: setAIModel,
  getModels: getAvailableModels,
  getCurrentModel: getCurrentModel
};

export default aiTextService;
