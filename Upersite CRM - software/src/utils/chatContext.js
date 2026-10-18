// Dati del CRM mandati alla chat Upersite AI come contesto, e quali includere.
// Le opzioni si scelgono in Impostazioni → Intelligenza artificiale → Dati inviati alla chat.
import { htmlToText } from './htmlToText';

// Cosa può includere ogni voce
export const CHAT_DATA_FIELDS = [
  {
    id: 'customers', label: 'Clienti',
    options: [
      { value: 'all', label: 'Tutti' },
      { value: 'active', label: 'Escludi i completati' }
    ]
  },
  {
    id: 'installments', label: 'Rate',
    options: [
      { value: 'all', label: 'Tutte' },
      { value: 'unpaid', label: 'Solo da pagare' },
      { value: 'none', label: 'Nessuna' }
    ]
  },
  {
    id: 'tasks', label: 'Task (to-do)',
    options: [
      { value: 'all', label: 'Tutti' },
      { value: 'open', label: 'Solo da fare' },
      { value: 'none', label: 'Nessuno' }
    ]
  },
  {
    id: 'tickets', label: 'Ticket',
    options: [
      { value: 'all', label: 'Tutti' },
      { value: 'open', label: 'Solo aperti' },
      { value: 'none', label: 'Nessuno' }
    ]
  },
  {
    id: 'notes', label: 'Note',
    options: [
      { value: 'full', label: 'Complete' },
      { value: 'short', label: 'Solo l\'inizio (300 caratteri)' },
      { value: 'none', label: 'Nessuna' }
    ]
  },
  {
    id: 'links', label: 'Link',
    options: [
      { value: 'all', label: 'Sì' },
      { value: 'none', label: 'No' }
    ]
  },
  {
    id: 'events', label: 'Eventi del calendario',
    options: [
      { value: 'all', label: 'Tutti' },
      { value: 'future', label: 'Solo futuri' },
      { value: 'none', label: 'Nessuno' }
    ]
  }
];

export const CHAT_DATA_PRESETS = [
  {
    id: 'complete', label: 'Completo', description: 'Tutto il CRM: risposte più complete, più token',
    options: { customers: 'all', installments: 'all', tasks: 'all', tickets: 'all', notes: 'full', links: 'all', events: 'all' }
  },
  {
    id: 'essential', label: 'Essenziale', description: 'Solo quello ancora aperto: rate da pagare, task da fare, ticket aperti, eventi futuri',
    options: { customers: 'all', installments: 'unpaid', tasks: 'open', tickets: 'open', notes: 'full', links: 'all', events: 'future' }
  },
  {
    id: 'minimal', label: 'Minimo', description: 'Come Essenziale, senza note e link e senza clienti completati',
    options: { customers: 'active', installments: 'unpaid', tasks: 'open', tickets: 'open', notes: 'none', links: 'none', events: 'future' }
  }
];

const NOTE_SHORT_CHARS = 300;

// Opzioni valide; dalle versioni precedenti: interruttore "Ottimizzazione token" acceso = Essenziale
export function normalizeChatDataOptions(settings) {
  const base = (settings?.aiOptimization ? CHAT_DATA_PRESETS[1] : CHAT_DATA_PRESETS[0]).options;
  const saved = settings?.ai?.chatData || {};
  const out = {};
  for (const field of CHAT_DATA_FIELDS) {
    const value = saved[field.id];
    out[field.id] = field.options.some(o => o.value === value) ? value : base[field.id];
  }
  return out;
}

// Preset che corrisponde alle opzioni, o null se personalizzate
export function matchingPreset(options) {
  return CHAT_DATA_PRESETS.find(p => CHAT_DATA_FIELDS.every(f => p.options[f.id] === options[f.id])) || null;
}

// Stima dei token di un dato (circa 4 caratteri per token): serve solo per l'anteprima,
// i numeri veri arrivano dal servizio dopo ogni richiesta
export const estimateTokens = (data) => Math.round(JSON.stringify(data).length / 4);

export function buildCrmContext(customers, events, options) {
  const o = options || CHAT_DATA_PRESETS[0].options;
  const today = new Date();
  const noteText = (html) => {
    const text = htmlToText(html);
    return o.notes === 'short' && text.length > NOTE_SHORT_CHARS ? text.slice(0, NOTE_SHORT_CHARS) + '…' : text;
  };

  const clienti = (customers || [])
    .filter(c => o.customers === 'all' || c.status !== 'completed')
    .map(c => {
      const cliente = {
        id: c.id,
        nome: c.name,
        azienda: c.company,
        sito: c.website,
        stato: c.status,
        tags: c.tags || []
      };
      if (o.installments !== 'none') {
        cliente.rate = (c.installments || []).filter(i => o.installments === 'all' || !i.paid).map(i => ({
          id: i.id,
          scadenza: i.dueDate,
          importo: i.amount,
          pagata: i.paid,
          descrizione: i.description || ''
        }));
      }
      if (o.tasks !== 'none') {
        cliente.task = (c.todo || []).filter(t => o.tasks === 'all' || !t.completed).map(t => ({
          testo: t.text,
          scadenza: t.dueDate,
          completato: t.completed
        }));
      }
      if (o.tickets !== 'none') {
        cliente.tickets = (c.tickets || []).filter(t => o.tickets === 'all' || t.isOpen).map(t => ({
          id: t.id,
          link: t.link,
          priorita: t.priority || 2,
          stato: t.isOpen ? 'aperto' : 'chiuso',
          note: htmlToText(t.description || ''),
          ...(o.notes !== 'none' && {
            noteCollegate: (t.linkedNotes || []).map(nid => {
              const note = (c.notes || []).find(n => n.id === nid);
              return note ? htmlToText(note.text).substring(0, 100) + '...' : '';
            }).filter(Boolean)
          }),
          creatoIl: t.createdAt
        }));
      }
      if (o.links !== 'none') {
        cliente.links = (c.links || []).map(l => ({
          id: l.id,
          etichetta: l.label,
          url: l.url,
          note: htmlToText(l.note || ''),
          creatoIl: l.createdAt
        }));
      }
      if (o.notes !== 'none') {
        // Esclude i report SmartReport
        cliente.note = (c.notes || []).filter(n => n.type !== 'smartreport').map(n => noteText(n.text)).filter(Boolean);
      }
      return cliente;
    });

  const eventi = o.events === 'none' ? [] : (events || [])
    .filter(e => o.events === 'all' || new Date(e.date) >= today)
    .map(e => ({ id: e.id, titolo: e.title, data: e.date, tipo: 'evento_globale' }));

  return { clienti, eventi };
}
