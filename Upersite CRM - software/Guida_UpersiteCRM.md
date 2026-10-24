# Upersite CRM — Guida all'Uso

> Il manuale aggiornato e completo è dentro il CRM: **⋯ → Impostazioni → Generale → 📖 Manuale d'uso** (con ricerca). Questa pagina è un riassunto, utile soprattutto quando il CRM non parte.

Upersite CRM gira sul tuo PC per gestire clienti, pagamenti, preventivi e progetti: i dati non vanno su internet.

---

## 🚀 1. Come avviare il CRM

La cartella del programma è:
`C:\Users\loren\Desktop\Business\UPERSITE STUDIO\Upersite CRM\Upersite CRM - software - LAVORO\Upersite CRM - software`

Dentro ci sono due file di avvio. Entrambi partono in silenzio, senza finestre del terminale:

| File | Cosa apre |
|---|---|
| `Upersite CRM Browser.vbs` | Il CRM nel browser, su `http://localhost:5173` |
| `Avvia CRM.vbs` | Il CRM come app desktop, in una finestra dedicata |

I dati sono gli stessi in entrambi i modi. Se il CRM è già acceso, il file di avvio apre solo la finestra (o la scheda del browser) senza riavviare il server.

### Avvio da terminale (se i file di avvio non bastano)
Apri un terminale nella cartella del programma e scrivi:
```bash
npm run dev            # versione browser, poi apri http://localhost:5173
npm run electron:dev   # versione desktop
```
Dopo aver copiato il CRM su un altro PC (o se manca la cartella `node_modules`) esegui prima `npm install`.

### Se il CRM non si apre
- **Esce il messaggio «Il CRM non si è avviato entro 60 secondi»** o la pagina dà errore/404: probabilmente è rimasto acceso un vecchio server del CRM che occupa la porta 5173. Succede soprattutto dopo aver **spostato la cartella del programma**. Riavvia il PC, oppure apri il Task Manager e chiudi i processi **Node.js**, poi riavvia il CRM.
- **«I dati sono stati modificati da un'altra finestra»**: il CRM è aperto in due schede o finestre. Chiudine una e ricarica.
- La copia della cartella (`... - LAVORO - Copy`) usa la stessa porta 5173: non avviare le due copie insieme.

---

## 🔐 2. Accesso e password master

Al primo avvio crei la **password master**. È l'unica chiave del CRM e cifra anche le password della sezione **Accessi** dei clienti. Non è salvata in chiaro da nessuna parte.

- Dopo un periodo di inattività il CRM si blocca e chiede di nuovo la password. Di base sono 5 minuti; si cambia in Impostazioni → Generale.
- **⋯ → Blocca CRM** lo blocca subito (pausa pranzo).
- **⋯ → Termina sessione di lavoro** fa un backup completo e poi blocca: usalo a fine giornata.

> **Password dimenticata:** chiudi il CRM, apri `crm_data.json`, elimina la riga `"masterPassword"` e riavvia. Ne crei una nuova e clienti e loghi restano. Le password della sezione Accessi però tornano leggibili solo se reimposti la stessa password di prima. Dalla schermata di login, "Password dimenticata?" ti ricorda questi passaggi.

---

## 👥 3. Schermata principale

- **Kanban / Lista** (in alto a destra): due modi di vedere i clienti. Nella Kanban trascini un cliente tra **Prospect → In lavorazione → Sospeso → Completato**; la barra sulla scheda mostra a colpo d'occhio a che punto sono i pagamenti.
- **«X clienti ▾»** accanto al nome: elenco rapido dei clienti, più profilo utente e calendario.
- **🔍 Ricerca** (premi **Spazio** per andarci): cerca per nome, azienda, email, pacchetto e **tag** (anche scrivendo `#tag`).
- **🔔 Notifiche**: todo in scadenza o scaduti, rate scadute o in scadenza nei prossimi 3 giorni.
- **Pulsanti tondi in basso:** ⚡ Automazioni, 🟩 Monitoraggio siti, 📊 Panoramica business, 🧮 Calcolatore preventivi, 🧲 Pipeline prospect, 📦 Archivio clienti, 🔧 Cassetta degli attrezzi; ✨ in basso a destra l'Assistente AI.

---

## ⚙️ 4. La scheda cliente

Clic su un cliente per aprire la scheda. I campi si salvano con **Salva** (se chiudi senza salvare te lo chiede); preventivi, fogli ore e configurazione del calcolatore si salvano subito.

1. **Logo:** clic sul tondo colorato per assegnare il logo dell'azienda.
2. **Finanza:** totale del preventivo e rate con le scadenze. Prima di eliminare una rata, un file, un link o una credenziale il CRM chiede conferma.
3. **Configurazione:** mostra in sola lettura la configurazione creata con il calcolatore (voci, sconto, IVA, totale, ore stimate, redditività). Per cambiarla: **🧮 Apri nel calcolatore**, modifica e premi di nuovo «➕ Aggiungi al cliente CRM».
4. **File:** archivia documenti del cliente (es. carta d'identità); vedi quanto spazio occupano.
5. **Note:** appunti formattati (grassetto, elenchi) con data e ora di salvataggio.
6. **Più email:** "+ Aggiungi email" sotto il campo Email; tutti gli indirizzi sono cercabili.
7. **Stato dei preventivi:** per ogni preventivo scegli *In attesa*, *Accettato* o *Rifiutato*.
8. **Fogli ore (⏱️):** tabella delle ore lavorate con grafici, filtro per periodo, export CSV/PDF e **guadagno €/ora**. Se c'è una configurazione del calcolatore mostra anche le ore stimate e quelle residue (o lo sforamento).

> **Calcolatore preventivi (🧮):** con **➕ Aggiungi al cliente CRM** scegli il cliente: la configurazione va nella scheda Configurazione, l'importo del preventivo si aggiorna (te lo chiede) e puoi allegare il PDF/Word tra i preventivi del cliente. I prezzi del listino si cambiano in Impostazioni → Calcolatore.

> **Cassetta degli attrezzi (🔧):** link ai tool online (🧰 Attrezzi) e a guide e risorse (📚 Documenti), con categorie, note e ⭐ per tenerli in alto. Finiscono in ogni backup.

> **Clienti completati:** quando un cliente passa a "Completato", i suoi todo spariscono dall'elenco e dalla matrice di Eisenhower.

---

## 💾 5. Backup e ripristino

Imposta la **cartella dei backup** in Impostazioni → Backup e dati (es. un disco esterno). Il CRM ci crea **una cartella per giorno** (`gg-mm-aa`) con il file dati di quell'ora, i Preventivi, il Calcolatore e le altre cartelle di `Dati`.

**Quando si fa un backup:** con **💾 Crea Backup Ora** nelle Impostazioni, con **⋯ → Termina sessione di lavoro**, da un'automazione, e sempre prima di un ripristino.

**Per tornare indietro:** Impostazioni → Backup e dati → **♻️ Ripristina da un backup…**, scegli giorno e ora, poi **Ripristina tutto** oppure **Solo alcuni clienti**, scrivi la password master e ricarica. Prima del ripristino il CRM salva lo stato attuale, quindi puoi sempre annullare.

**Su un altro PC (o dopo una formattazione):** installa il CRM (`npm install`), crea una password qualsiasi, imposta come cartella dei backup quella con le cartelle per giorno e fai **Ripristina tutto** dal backup più recente. Poi accedi con la tua password di sempre.

> «Esporta Backup (JSON)» scarica solo il file dati, senza preventivi e calcolatore: va bene per una copia veloce, non per spostare tutto.

---

## 📁 6. Cosa c'è nella cartella del programma

| Cosa | A cosa serve |
|---|---|
| `crm_data.json` | **Tutti i dati del CRM.** Non cancellarlo e non modificarlo a CRM acceso |
| `Dati\Preventivi\`, `Dati\Calcolatore\` | Preventivi PDF/Word dei clienti e file del calcolatore |
| `.env.local` | Le chiavi dei servizi AI (Gemini, Ollama Cloud, Unsloth). Si gestiscono da Impostazioni → Intelligenza artificiale |
| `Upersite CRM Browser.vbs`, `Avvia CRM.vbs` | I due file di avvio |
| `Guida_UpersiteCRM.md` | Questa guida |
| Tutto il resto (`src`, `server`, `electron`, `public`, `node_modules`, `dist`, `package.json`, `vite.config.js`, ...) | Il programma: non serve toccarlo |

I dati (`crm_data.json`, `Dati`, `.env.local`) restano solo sul tuo PC e non vanno mai su GitHub. La copia di sicurezza è nella cartella dei backup.
