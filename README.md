# Upersite CRM

CRM personale per gestire clienti, preventivi, pagamenti, task e note di progetto. Funziona in locale sul proprio PC: i dati restano in un file e non vengono inviati a nessun server (tranne il testo che invii alle funzioni AI).

**Versione attuale:** 1.12.6-stable · [Cronologia delle versioni](Versioning.txt) · [Guida all'uso](Upersite%20CRM%20-%20software/Guida_UpersiteCRM.md)

## Funzionalità

- **Clienti** in vista Kanban (Prospect → In lavorazione → Completato → Sospeso), lista e tabella, con tag, logo e ricerca
- **Finanza**: preventivi, rate e scadenze, transazioni recenti, dashboard con grafici e "Panoramica business"
- **Task** con priorità, scadenze e ricorrenza, filtri e Matrice di Eisenhower, calendario
- **Note** con editor ricco (indice, cartelle, checkbox, citazioni, menu `/`) e grafo delle note in stile Obsidian
- **Ticket** per cliente con dashboard centralizzata
- **Credenziali** dei clienti protette dalla password master
- **Automazioni**: editor a nodi per workflow (eventi, condizioni, azioni su task, note, tag, backup)
- **AI (Gemini)**: chat, SmartReport sui clienti, riassunti delle note, strumenti di scrittura
- **Backup** manuale e automatico, import/export dei dati

## Requisiti

- [Node.js](https://nodejs.org) 20.19 o superiore
- Windows (i launcher `.vbs` / `.bat` sono pensati per Windows; il resto funziona ovunque giri Node)

## Installazione

```bash
cd "Upersite CRM - software"
npm install
```

### Chiave Gemini (solo per le funzioni AI)

1. Crea una chiave su <https://aistudio.google.com/apikey>
2. Copia `.env.example` in `.env.local` e incolla la chiave:

   ```
   VITE_GEMINI_API_KEY=la_tua_chiave
   ```

Senza chiave il CRM funziona normalmente, solo le funzioni AI non rispondono. `.env.local` è escluso da git: non va mai condiviso né caricato.

## Avvio

| Modalità | Comando | Note |
| --- | --- | --- |
| Browser | `npm run dev` | poi apri <http://localhost:5173> |
| Desktop (Electron) | `npm run electron:dev` | finestra dedicata |

Su Windows puoi usare i collegamenti nella cartella: `Upersite CRM Browser.vbs` (browser) e `Avvia CRM.vbs` (desktop), che partono senza mostrare il terminale. Dettagli in `LEGGERE_PER_AVVIO.txt`.

> Per ora il salvataggio dei dati passa dal server di sviluppo di Vite (`/api/storage`): l'app va avviata con i comandi qui sopra. La build `electron:build` non è ancora in grado di salvare.

## Password master

Al primo avvio crei una password master. Viene salvata come hash (PBKDF2), mai in chiaro. Il CRM si blocca dopo 5 minuti di inattività.

**Password dimenticata:** chiudi il CRM, apri `crm_data.json`, elimina la riga `"masterPassword"` e riavvia. Potrai crearne una nuova; i dati dei clienti restano.

## I tuoi dati

Tutto è in `Upersite CRM - software/crm_data.json`. Questo file contiene clienti e credenziali ed è **escluso da git** insieme ai backup (`crm_data_backup_*.json`, `.bak`, `sync_storage.html`). Non rimuoverlo dal `.gitignore` e non caricarlo online. Per salvarlo usa il menu `⋯` → Backup, oppure imposta la cartella di backup automatico nelle Impostazioni.

## Struttura del progetto

```
Upersite CRM - software/
├── src/
│   ├── App.jsx              # app principale, login e navigazione
│   ├── components/          # schermate e modali (CustomerDetail, RichTextEditor, ...)
│   │   └── AutomationEditor/
│   ├── hooks/useCustomers.js
│   └── utils/               # storage, workflow, AI, sanificazione HTML, versione
├── electron/                # guscio desktop (main.js, preload.cjs)
├── vite.config.js           # build + API locale di salvataggio dati
└── Guida_UpersiteCRM.md
```

Stack: React 19, Vite 7, Electron, Recharts, React Flow (`@xyflow/react`), jsPDF.

## Versioni

Formato `Major.Minor.Patch-stato` (`alpha`, `beta`, `stable`). Quando cambi versione aggiorna **tre file** con lo stesso numero: `Upersite CRM - software/package.json`, `Upersite CRM - software/src/utils/version.js` e `Versioning.txt`. Ogni versione è un tag git (`v1.12.6-stable`) e una release su GitHub.

## Sicurezza

- Le richieste che modificano i dati richiedono un header interno: un sito esterno aperto nel browser non può sovrascrivere il file dati.
- L'HTML delle note viene ripulito con DOMPurify.
- In Electron sono attivi `contextIsolation` e `sandbox`, senza `nodeIntegration`.
- Il server di salvataggio è pensato per uso **locale**: non esporlo su rete o internet.
