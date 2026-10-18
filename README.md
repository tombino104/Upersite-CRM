# Upersite CRM

CRM personale per gestire clienti, preventivi, pagamenti, task e note di progetto. Funziona in locale sul proprio PC: i dati restano in un file e non vengono inviati a nessun server (tranne il testo che invii alle funzioni AI).

**Versione attuale:** 1.23.0-stable · [Cronologia delle versioni](Versioning.txt) · [Guida all'uso](Upersite%20CRM%20-%20software/Guida_UpersiteCRM.md)

## Funzionalità

- **Clienti** in vista Kanban (Prospect → In lavorazione → Completato → Sospeso), lista e tabella, con tag, logo e ricerca
- **Finanza**: preventivi, rate e scadenze, transazioni recenti, dashboard con grafici e "Panoramica business"
- **Task** con priorità, scadenze e ricorrenza, filtri e Matrice di Eisenhower, calendario
- **Note** con editor ricco (indice, cartelle, checkbox, citazioni, menu `/`) e grafo delle note in stile Obsidian
- **Ticket** per cliente con dashboard centralizzata
- **Credenziali** dei clienti cifrate con la password master
- **Automazioni**: editor a nodi per workflow (eventi, condizioni, azioni su task, note, tag, backup)
- **AI**: chat, SmartReport sui clienti, riassunti delle note, strumenti di scrittura. Per ogni funzione scegli il servizio: locale (LM Studio, Unsloth Studio) o cloud (Ollama Cloud, Google Gemini)
- **Backup** manuale e automatico, import/export dei dati

## Requisiti

- [Node.js](https://nodejs.org) 20.19 o superiore
- Windows (i launcher `.vbs` / `.bat` sono pensati per Windows; il resto funziona ovunque giri Node)

## Installazione

```bash
cd "Upersite CRM - software"
npm install
```

### Funzioni AI (facoltative)

In **Impostazioni → Intelligenza artificiale** scegli quale IA usare per ogni funzione: strumenti dell'editor, riassunto della nota, chat Upersite AI e SmartReport. Ad esempio un modello locale per l'editor e Ollama Cloud per la chat.

| Servizio | Tipo | Cosa serve |
|---|---|---|
| LM Studio | locale | Scheda Developer → avvia il server (di solito `http://127.0.0.1:1234`) e carica un modello |
| Unsloth Studio | locale | Carica un modello e crea la chiave in Settings → API (`UNSLOTH_API_KEY`) |
| Ollama Cloud | cloud | Chiave da <https://ollama.com/settings/keys> (`OLLAMA_API_KEY`) |
| Google Gemini | cloud | Chiave da <https://aistudio.google.com/apikey> (`GEMINI_API_KEY`) |

Gli indirizzi dei servizi locali si impostano in **Servizi e chiavi** (anche un altro PC della rete di casa), con il pulsante «Prova connessione».

Le **chiavi** si incollano nella stessa pagina e si salvano con **Salva**. Le conserva il server del CRM nel file `.env.local` (vedi `.env.example`); valgono subito, senza riavviare. Si possono anche scrivere a mano nel file:

```
GEMINI_API_KEY=la_tua_chiave
OLLAMA_API_KEY=la_tua_chiave
```

Le legge solo il server del CRM, che inoltra le richieste ai servizi: non finiscono nel codice dell'app, nel file dati o nei backup, e l'app non le mostra mai.

Nelle altre sotto-sezioni della scheda IA:
- **Modelli locali**: modelli di LM Studio (0.4+) caricati in memoria, Carica / Scarica, contesto per ogni modello e opzione «un solo modello alla volta».
- **Dati inviati alla chat**: profili Completo / Essenziale / Minimo o scelta voce per voce, con la stima dei token.
- **Consumo e costi**: token reali per modello e per funzione, per periodo, con il costo stimato dai prezzi per milione di token.

Il manuale d'uso (Impostazioni → Generale) ha un capitolo per ogni servizio. Con un servizio locale i dati restano sul PC; con uno cloud il testo (e, per la chat, i dati del CRM) va al servizio. Senza nessun servizio configurato il CRM funziona normalmente, solo le funzioni AI non rispondono. `.env.local` è escluso da git: non va mai condiviso né caricato.

## Avvio

| Modalità | Comando | Note |
| --- | --- | --- |
| Browser | `npm run dev` | poi apri <http://localhost:5173> |
| Desktop (Electron) | `npm run electron:dev` | finestra dedicata |

Su Windows puoi usare i collegamenti nella cartella: `Upersite CRM Browser.vbs` (browser) e `Avvia CRM.vbs` (desktop), che partono senza mostrare il terminale. Se il CRM è già acceso, il collegamento lo riapre senza avviare un secondo server. Il CRM usa sempre la porta **5173**. Dettagli in `LEGGERE_PER_AVVIO.txt`.

**Una finestra alla volta:** se tieni il CRM aperto in due schede o finestre e una salva, l'altra non può più sovrascrivere i dati: compare un avviso rosso con il pulsante *Ricarica dati*. Compare un avviso rosso anche se un salvataggio non riesce (es. server spento).

> Per ora il salvataggio dei dati passa dal server di sviluppo di Vite (`/api/storage`): l'app va avviata con i comandi qui sopra. La build `electron:build` non è ancora in grado di salvare.

## Password master

Al primo avvio crei una password master. Viene salvata come hash (PBKDF2), mai in chiaro. Il CRM si blocca dopo 5 minuti di inattività.

**Password dimenticata:** chiudi il CRM, apri `crm_data.json`, elimina la riga `"masterPassword"` e riavvia. Potrai crearne una nuova; i dati dei clienti restano. **Attenzione:** le password della sezione Accessi sono cifrate con la password master e resteranno illeggibili finché non reimposterai la stessa password di prima.

## I tuoi dati

Tutto è in `Upersite CRM - software/crm_data.json`. Questo file contiene clienti e credenziali ed è **escluso da git** insieme ai backup (`crm_data_backup_*.json`, `.bak`, `sync_storage.html`). Non rimuoverlo dal `.gitignore` e non caricarlo online. Per salvarlo usa il menu `⋯` → Backup, oppure imposta la cartella di backup automatico nelle Impostazioni.

**Preventivi (PDF/DOCX):** non stanno nel file dati ma come file veri in `Upersite CRM - software\Dati\Preventivi\<cliente>\<file>` (cartella esclusa da git come `crm_data.json`). Ogni cliente può avere più preventivi. Un file viene cancellato dalla cartella solo se lo elimini tu con ✕ e confermi (le copie nei backup restano). Ogni backup con data contiene anche una copia dei preventivi e del calcolatore: nella cartella di backup ci sono solo le cartelle con data. (Fino alla 1.21.0 `Preventivi` e `Calcolatore` stavano nella radice della cartella di backup: il CRM li sposta da solo in `Dati`.) Ogni preventivo ha uno stato (In attesa / Accettato / Rifiutato).

**Backup e ripristino:** ogni backup scrive **tutto** nella cartella del giorno dentro la cartella dei backup (`gg-mm-aa\`): `backup_ore_HH-MM-SS.json` (tutti i dati, con le preferenze del browser), `Preventivi\`, `Calcolatore\` e ogni altra cartella di `Dati`. Nella cartella dei backup non c'è nient'altro. Il ripristino è in Impostazioni → Backup Dati → **Ripristina da un backup…**: tutto (scegliendo le parti) o solo alcuni clienti; prima salva sempre lo stato attuale in un backup «prima del ripristino» e non cancella mai file. Le istruzioni complete sono nel **Manuale d'uso** (Impostazioni → Manuale d'uso).

**Fogli ore:** il pulsante ⏱️ nella scheda cliente apre il foglio ore (righe con data, ore e descrizione, grafici, esportazione CSV/PDF e guadagno €/ora). Le ore sono salvate nel cliente (`timesheets`), quindi dentro `crm_data.json` e nei backup.

**Calcolatore preventivi:** il pulsante arancione 🧮 in basso a sinistra apre il calcolatore prezzi dentro il CRM. È una copia del calcolatore originale (`public/calcolatore/index.html`; l'originale nella cartella CALCOLATORE non viene toccato) con tutte le sue funzioni: export PDF/Word/Excel, riepilogo interno, configurazioni salvate, pacchetto completo, costi fissi, listino ore e redditività. In più:
- **➕ Aggiungi al cliente CRM** manda la configurazione a un cliente: la tab *Configurazione* la mostra in sola lettura (voci, totale, ore stimate, redditività), l'importo del preventivo viene aggiornato (con conferma) e alla fine puoi allegare il preventivo PDF/DOCX tra i preventivi del cliente. Le ore stimate compaiono anche nei Fogli ore (ore residue / sforamento).
- **Dove salva:** di default in `Dati\Calcolatore` (`Configurazioni\` e `Pacchetti\`), copiata in ogni backup con data; dalle Impostazioni puoi scegliere un'altra cartella e importare (copiandole) le configurazioni del calcolatore standalone.
- **Listino:** i prezzi si modificano nelle Impostazioni (sezione Calcolatore preventivi); costi fissi, ore e margini restano nelle tab del calcolatore ma vengono salvati nel file dati del CRM (`settings.calc`).

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
├── server/aiProxy.js        # ponte verso i servizi AI (chiavi lette da .env.local)
├── vite.config.js           # build + API locale di salvataggio dati e AI
└── Guida_UpersiteCRM.md
```

Stack: React 19, Vite 7, Electron, Recharts, React Flow (`@xyflow/react`), jsPDF.

## Versioni

Formato `Major.Minor.Patch-stato` (`alpha`, `beta`, `stable`). Quando cambi versione aggiorna **tre file** con lo stesso numero: `Upersite CRM - software/package.json`, `Upersite CRM - software/src/utils/version.js` e `Versioning.txt`. Ogni versione è un tag git (`v1.12.6-stable`) e una release su GitHub.

## Sicurezza

- Le richieste che modificano i dati richiedono un header interno: un sito esterno aperto nel browser non può sovrascrivere il file dati.
- Le password delle credenziali clienti sono cifrate (AES-GCM, chiave ricavata dalla password master con PBKDF2): nel file dati e nei backup non sono leggibili.
- L'HTML delle note e le risposte AI vengono ripuliti con DOMPurify.
- Le chiavi dei servizi AI restano nel server del CRM (`.env.local`): il browser parla solo con `/api/ai/*`. Per i servizi locali il server accetta solo indirizzi di questo PC o della rete locale.
- In Electron sono attivi `contextIsolation` e `sandbox`, senza `nodeIntegration`.
- Il server di salvataggio è pensato per uso **locale**: non esporlo su rete o internet.
