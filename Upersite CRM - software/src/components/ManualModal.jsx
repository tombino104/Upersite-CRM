import React, { useEffect, useMemo, useRef, useState } from 'react';
import { APP_VERSION, formatVersionDisplay } from '../utils/version';

// Manuale d'uso del CRM (Impostazioni → Manuale d'uso). Il testo usa una sintassi minima:
// "### " sottotitolo, "- " elenco, "1. " passi numerati, "> " riquadro consiglio, **grassetto**, `codice`.

const SECTIONS = [
    {
        id: 'avvio', group: 'inizio', icon: '🚀', title: 'Avvio, accesso e sicurezza',
        text: `
Il CRM gira sul tuo PC: i dati non vanno su internet. Si apre in due modi:
- **Browser**: doppio clic su «Avvia CRM» (o «Upersite CRM Browser») nella cartella del programma; si apre \`http://localhost:5173\`.
- **App desktop**: collegamento «Upersite CRM» sul Desktop. Stessi dati, finestra dedicata.

### Password master
Al primo avvio crei la **password master**. È l'unica chiave del CRM e cifra anche le password della sezione Accessi dei clienti. Non è salvata da nessuna parte in chiaro.
- Dopo il tempo di inattività scelto nelle Impostazioni (di base 5 minuti) il CRM si blocca e chiede di nuovo la password.
- Menu **⋯ → Blocca CRM** lo blocca subito (pausa pranzo).
- Menu **⋯ → Termina sessione di lavoro** fa un **backup completo** e poi blocca: usalo a fine giornata.

> Password dimenticata: chiudi il CRM, apri \`crm_data.json\`, elimina la riga "masterPassword" e riavvia. Ne crei una nuova e i clienti restano; le password della sezione Accessi però tornano leggibili solo reimpostando la password di prima.
`,
    },
    {
        id: 'home', group: 'inizio', icon: '🏠', title: 'Schermata principale',
        text: `
### Barra in alto
- **«X clienti ▾»** accanto al nome: elenco rapido dei clienti. Le icone accanto aprono il **profilo utente** e il **calendario** (scadenze, todo e eventi).
- **Ricerca** (premi **Spazio** per andarci): cerca per nome, azienda, email, pacchetto e **tag** (clicca un tag nel menu che compare, oppure scrivi \`#tag\`).
- **Filtra task**: tutti i todo di tutti i clienti, filtrabili per cliente e priorità (Fai subito, Pianifica, Delega, Elimina) ed esportabili.
- **Ticket dashboard**: tutti i ticket aperti; il numero rosso indica quanti.
- **🔔 Notifiche**: todo in scadenza oggi o scaduti, rate scadute o in scadenza nei prossimi 3 giorni.
- **Tag**: gestione dei tag usati per raggruppare i clienti.
- **Kanban / Lista**: due modi di vedere i clienti. Nella Kanban trascini un cliente tra Prospect, In lavorazione, Sospeso e Completato.
- **+ Nuovo cliente** e il menu **⋯** (Impostazioni, Termina sessione, Blocca CRM).

### Riquadri dei numeri
Clic su **Clienti** apre la tabella dati (filtrabile); su **Incassato / Da incassare** i grafici dei guadagni; su **Transazioni recenti** gli ultimi pagamenti; su **Rate scadute** l'elenco da sollecitare.

### Pulsanti tondi in basso
- ⚡ viola: **Automazioni**
- 🟩 verde: **Monitoraggio** dei siti (UptimeRobot)
- 📊 blu: **Panoramica business** (liquidità, crediti aperti, produzione, qualità dei dati)
- 🧮 arancione: **Calcolatore preventivi**
- ✨ in basso a destra: **Assistente AI**, che conosce i tuoi clienti e risponde alle domande
`,
    },
    {
        id: 'cliente', group: 'lavoro', icon: '👤', title: 'La scheda cliente',
        text: `
Clic su un cliente per aprire la scheda. Le modifiche ai campi si salvano con **Salva** (se chiudi senza salvare te lo chiede). Preventivi, fogli ore e configurazione del calcolatore invece si salvano subito.

### In alto
- Clic sul tondo colorato per mettere il **logo** del cliente.
- ⏱️ apre i **Fogli ore**; il globo apre il sito del cliente; il pallino di stato mostra se il sito è online (se collegato al Monitoraggio).

### Le schede
- **Generale**: nome, azienda, contatti (anche più email con «+ Aggiungi email»), stato, pacchetto, sito, tag.
- **Configurazione**: quello che hai scelto nel calcolatore, in sola lettura (vedi «Calcolatore preventivi»).
- **Pagamenti**: importo del preventivo, rate (anche con lo strumento «rate avanzate» che divide l'importo con acconto e arrotondamenti), stato di ogni rata e i **preventivi** PDF/Word del cliente con lo stato In attesa / Accettato / Rifiutato.
- **Accessi**: credenziali del cliente (servizio, utente, password), cifrate con la password master. La sezione si sblocca inserendo la password.
- **Link**: link utili con etichetta e nota.
- **Note**: note formattate con cartelle, ricerca, filtri rapidi e **grafo delle note**. Nell'editor usa **/Collega Nota** per collegare note e file; c'è anche il riassunto con l'AI.
- **To-Do**: attività con scadenza, sotto-task, ricorrenza (ogni settimana, mese, 3/6 mesi, anno), priorità e collegamenti a note e file. I todo dei clienti «Completato» spariscono dagli elenchi generali.
- **Tickets**: richieste di assistenza aperte e chiuse, con note e link esterno.
- **SmartReport**: report generato con l'AI (situazione attuale, problemi critici, prossime azioni).

> Ogni eliminazione (rate, file, link, credenziali, preventivi) chiede conferma.
`,
    },
    {
        id: 'calcolatore', group: 'lavoro', icon: '🧮', title: 'Calcolatore preventivi',
        text: `
Il pulsante arancione apre il calcolatore prezzi completo, a tutto schermo. Funziona come il calcolatore originale: pacchetti, opzioni, lingue, pagine extra, animazioni, revisioni, costi fissi, listino ore, redditività, export PDF / Word / Excel, riepilogo interno, configurazioni salvate e **pacchetto completo**.

### Dal preventivo al cliente
1. Configura il sito e compila «Cliente» nel riquadro Preventivo.
2. Premi **➕ Aggiungi al cliente CRM** e scegli il cliente (quello con lo stesso nome è già proposto).
3. Decidi se aggiornare l'importo del preventivo e se salvare anche la configurazione.
4. Alla fine scegli se allegare il **preventivo PDF** (e Word): finisce tra i preventivi del cliente con stato «In attesa».

La scheda **Configurazione** del cliente mostra voci, totale, ore stimate e redditività. Per cambiarla premi **🧮 Apri nel calcolatore**, modifica e aggiungila di nuovo.

### Da sapere
- Chiudere il calcolatore chiede conferma; il lavoro resta aperto finché non ricarichi il CRM.
- Configurazioni e pacchetti completi vanno in \`Dati\\Calcolatore\` (o nella cartella scelta nelle Impostazioni) e finiscono in ogni backup.
- I **prezzi** si cambiano in Impostazioni → Calcolatore preventivi; costi fissi, ore e margini nelle loro schede dentro il calcolatore.
- Gli export PDF/Word/Excel scaricano le librerie la prima volta: serve internet.
`,
    },
    {
        id: 'ore', group: 'lavoro', icon: '⏱️', title: 'Fogli ore',
        text: `
Dal pulsante ⏱️ della scheda cliente. È una tabella stile foglio di calcolo:
- Compila la riga evidenziata (data, ore come \`1,5\` o \`1:30\`, descrizione) e premi **Invio**.
- Clic su una cella per correggerla; ✕ per eliminare la riga (con conferma).
- Grafici delle ore per mese o settimana e ore cumulate; filtro per periodo; export CSV e PDF.
- **Guadagno €/ora**: valore del progetto diviso tutte le ore, e lo stesso sull'incassato.
- Se il cliente ha una configurazione del calcolatore vedi le **ore stimate**, la barra (verde, arancio oltre l'80%, rossa oltre il 100%) e le ore residue.
`,
    },
    {
        id: 'automazioni', group: 'lavoro', icon: '⚡', title: 'Automazioni',
        text: `
Le automazioni fanno cose da sole quando succede qualcosa. Si costruiscono a blocchi collegati: un **evento** di partenza, eventuali **condizioni** (IF / ELSE), **attese** e **azioni** sul CRM.

### Eventi disponibili
- Clienti: creato, modificato, eliminato, cambio di stato, tag aggiunto o tolto.
- Note e attività: nota creata o modificata, todo creato, modificato, completato o scaduto.
- Pagamenti: pagamento registrato o modificato, rata in scadenza, rata scaduta.
- Pianificazioni: ogni giorno, settimana, mese, a intervalli o in una data.
- Sistema: avvio dell'app, accesso, backup completato.

Ogni automazione si attiva o disattiva con l'interruttore e ha il suo registro delle esecuzioni. Un'azione possibile è anche «fai un backup».
`,
    },
    {
        id: 'monitor', group: 'lavoro', icon: '🟢', title: 'Monitoraggio siti',
        text: `
Il pulsante verde mostra lo stato dei siti seguiti con **UptimeRobot**: online/offline/in pausa, uptime e barretta delle ultime 24 ore, scadenza SSL e dominio, ultimo incidente e storico (24 ore, 7 o 30 giorni).
- Serve la **API key read-only** di UptimeRobot, inserita la prima volta.
- Ogni monitor si collega a un cliente (anche in automatico in base al dominio): lo stato compare nella scheda del cliente.
- Le richieste sono limitate per restare nel piano gratuito, quindi i dati si aggiornano ogni tanto e non in tempo reale.
- Nell'app desktop c'è anche la dashboard completa di UptimeRobot.
`,
    },
    {
        id: 'ia-intro', group: 'ia', icon: '🤖', title: 'Come funziona l\'IA nel CRM',
        text: `
Le funzioni AI sono quattro e per ognuna scegli quale IA usare in **Impostazioni → Intelligenza artificiale → Quale IA per cosa**:
- **Strumenti dell'editor**: Riscrivi, Migliora, Espandi, Traduci, Idee, Correggi grammatica sul testo selezionato (menu sul testo o **Ctrl+Shift+A**).
- **Riassunto della nota**: pulsante «Riassumi» nella barra dell'editor e strumento Riassumi.
- **Chat Upersite AI**: il pulsante ✨ in basso a destra. Riceve i dati del CRM scelti in «Dati inviati alla chat».
- **SmartReport**: analisi del singolo cliente (scheda SmartReport). Il servizio si può cambiare anche per il singolo report.

### Il pannello laterale
Strumenti dell'editor e riassunto si aprono in un **pannello a destra** che non blocca la pagina: mentre l'IA lavora puoi continuare a scrivere nella nota o fare altro.
- **–** riduce il pannello a una pillola in basso a destra, che dice se la richiesta è in corso, pronta o fallita; un clic la riapre.
- **✕** chiude il pannello e annulla la richiesta. Anche **Esc** lo chiude, ma solo se non stai scrivendo nella nota.
- Se nel frattempo hai modificato il testo selezionato, il pannello te lo segnala prima di sostituirlo; se l'hai cancellato, puoi comunque inserire il risultato sotto o copiarlo.

### Locale o cloud
- **Locale** (LM Studio, Unsloth Studio): il modello gira sul tuo computer (o su un altro PC di casa). I testi **non escono** dalla rete, nessun costo, ma serve un PC con abbastanza memoria.
- **Cloud** (Ollama Cloud, Google Gemini): il testo viene inviato al servizio. Più potenti e senza carico sul PC, ma con limiti o costi e i dati escono dal PC.

Esempio tipico: un modello locale per gli strumenti dell'editor e il riassunto, Ollama Cloud per la chat.

### Come passano le richieste
L'app non parla mai direttamente con i servizi: chiede al **server del CRM**, che inoltra la richiesta con la chiave giusta. Per questo le chiavi non sono mai nel browser e non serve configurare niente (CORS) in LM Studio.

> Se un servizio è spento o non risponde compare un messaggio chiaro con **Riprova**: il CRM non passa mai da solo a un altro servizio.
`,
    },
    {
        id: 'ia-chiavi', group: 'ia', icon: '🔑', title: 'Servizi, indirizzi e chiavi',
        text: `
Tutto in **Impostazioni → Intelligenza artificiale → Servizi e chiavi**.

### Indirizzi dei servizi locali
Per LM Studio e Unsloth Studio c'è l'indirizzo del server (già compilato con quello standard) e il pulsante **Prova connessione**, che dice quanti modelli trova o perché non si collega.
- Se il servizio gira su un **altro PC di casa** (o su un server come Umbrel), scrivi il suo indirizzo, es. \`http://192.168.1.20:1234\`.
- Sono ammessi solo indirizzi di questo PC o della rete locale: il CRM non contatta indirizzi su internet per i servizi locali.

### Chiavi
Le chiavi servono per Ollama Cloud, Google Gemini e Unsloth Studio (LM Studio solo se hai attivato l'autenticazione del server).
1. Copia la chiave dal sito del servizio (vedi il capitolo del servizio).
2. Incollala nel campo e premi **Salva**.
3. Lo stato diventa «✓ presente». Per sostituirla incolla quella nuova; **Cancella** la elimina.

> La chiave la conserva il server del CRM nel file \`.env.local\` della cartella del programma. Non finisce in \`crm_data.json\`, nei backup o nel browser, e l'app non te la rimostra mai: vedi solo se c'è. Vale subito, senza riavviare il CRM.
`,
    },
    {
        id: 'ia-lmstudio', group: 'ia', icon: '🖥️', title: 'LM Studio (locale)',
        text: `
LM Studio (lmstudio.ai) scarica ed esegue modelli sul tuo PC.

### Prima configurazione
1. Installa LM Studio e scarica un modello dalla ricerca (es. un Qwen o Gemma della dimensione adatta alla tua RAM/VRAM).
2. Apri la scheda **Developer** e avvia il server (**Start Server**). L'indirizzo standard è \`http://127.0.0.1:1234\`.
3. Nel CRM: **Servizi e chiavi** → LM Studio → **Prova connessione**.
4. In **Quale IA per cosa** scegli «LM Studio» e il modello per le funzioni che vuoi.

### Caricare, scaricare e contesto
Con **LM Studio 0.4 o successivo** dal CRM puoi vedere i modelli caricati, caricarli e scaricarli e scegliere il contesto (vedi «Modelli locali e contesto»). Con versioni precedenti funziona tutto il resto, ma il caricamento si gestisce da LM Studio.

### Chiave (facoltativa)
Serve solo se in LM Studio hai attivato l'autenticazione del server: in quel caso inserisci il token in **Servizi e chiavi** (\`LMSTUDIO_API_KEY\`).

> Se il CRM dice «LM Studio non raggiungibile», il server non è avviato oppure l'indirizzo o la porta sono diversi.
`,
    },
    {
        id: 'ia-unsloth', group: 'ia', icon: '🦥', title: 'Unsloth Studio (locale)',
        text: `
Unsloth Studio esegue modelli sul tuo PC e li espone con un'API compatibile con OpenAI.

### Prima configurazione
1. Avvia Unsloth Studio e **carica un modello**.
2. In **Settings → API** crea una chiave (inizia con \`sk-unsloth-\`): viene mostrata una sola volta, copiala subito.
3. Nel CRM: **Servizi e chiavi** → incolla la chiave in Unsloth Studio e premi **Salva**.
4. Controlla l'indirizzo: di base \`http://127.0.0.1:8000\`; alcune installazioni usano un'altra porta (es. 8888), quella mostrata da Unsloth all'avvio. Poi **Prova connessione**.
5. In **Quale IA per cosa** scegli «Unsloth Studio» e il modello.

> Unsloth Studio non permette di caricare o scaricare i modelli dall'esterno: si gestiscono dalla sua app, e lì si sceglie anche il contesto.
`,
    },
    {
        id: 'ia-ollamacloud', group: 'ia', icon: '☁️', title: 'Ollama Cloud',
        text: `
Ollama Cloud esegue modelli grandi sui server di Ollama, senza carico sul tuo PC.

### Prima configurazione
1. Accedi su ollama.com e crea una chiave in **Settings → Keys** (ollama.com/settings/keys).
2. Nel CRM: **Servizi e chiavi** → Ollama Cloud → incolla la chiave e premi **Salva**.
3. In **Quale IA per cosa** scegli «Ollama Cloud» per una funzione: l'elenco dei modelli si carica da solo e viene proposto il primo; cambialo dalla tendina accanto (es. \`gpt-oss:120b\`). Se l'elenco non compare premi ⟳.

- I nomi dei modelli si usano **senza** il suffisso \`-cloud\` (quello serve solo nell'app di Ollama).
- Limiti e consumo dipendono dal tuo piano: li vedi su ollama.com/settings/usage. Nel CRM trovi i token usati in «Consumo e costi».

### Costo
Ollama Cloud si paga con un **abbonamento mensile** (il piano), non a token: scrivi l'importo in **Consumo e costi → Prezzi e abbonamenti → Abbonamento mensile**. Se preferisci ragionare a token puoi anche dare al modello un prezzo per milione di token, sotto la funzione in «Quale IA per cosa» o nella stessa pagina dei prezzi.

> È un servizio cloud: con la chat, i dati del CRM scelti in «Dati inviati alla chat» vengono inviati a Ollama.
`,
    },
    {
        id: 'ia-gemini', group: 'ia', icon: '✨', title: 'Google Gemini',
        text: `
Gemini è il servizio di Google, con un piano gratuito che ha un limite di richieste al giorno.

### Prima configurazione
1. Crea una chiave su aistudio.google.com/apikey.
2. Nel CRM: **Servizi e chiavi** → Google Gemini → incolla la chiave e premi **Salva**.
3. In **Quale IA per cosa** scegli «Google Gemini» e il modello.

### Modelli e limiti gratuiti
- **Gemma 4 31B**: circa 1.500 richieste al giorno.
- **Gemini 3.1 Flash Lite**: circa 500 al giorno.
- **Gemini 2.5 Flash**: circa 20 al giorno, il più capace.

La barra «richieste oggi» nella chat compare solo con Gemini e si azzera a mezzanotte UTC. Se finisce la quota, la chat lo dice e suggerisce un altro modello.
`,
    },
    {
        id: 'ia-modelli', group: 'ia', icon: '🧠', title: 'Modelli locali e contesto',
        text: `
In **Impostazioni → Intelligenza artificiale → Modelli locali** vedi tutti i modelli installati in LM Studio, con lo stato **Caricato** o **Non caricato** (per Unsloth Studio i modelli si gestiscono dalla sua app).

### Contesto
Il contesto è quanto testo (in token) il modello tiene a mente in una richiesta: istruzioni, dati inviati e conversazione.
- Più contesto = risposte che possono considerare più dati, ma più **memoria** del PC occupata e caricamento più lento.
- Per ogni modello scrivi il numero o scegli un valore (4k, 8k, 16k, 32k… fino al massimo del modello). Vale per tutte le funzioni che usano quel modello.
- Se un modello è già caricato con un contesto diverso compare **Ricarica con questo contesto**.

### Caricare e scaricare
- **Carica** mette il modello in memoria con il contesto scelto; **Scarica** lo toglie e libera memoria.
- **Un solo modello alla volta** (attivo di base): caricando un modello, gli altri dello stesso servizio vengono scaricati. Vale anche quando è una funzione a usare un modello diverso da quello caricato.

> Non serve caricare a mano: quando una funzione usa un modello non caricato, il CRM lo carica da solo (con il contesto scelto). La prima risposta può quindi richiedere più tempo.
`,
    },
    {
        id: 'ia-token', group: 'ia', icon: '📊', title: 'Token, costi e dati inviati',
        text: `
### Consumo e costi
In **Intelligenza artificiale → Consumo e costi** vedi, per periodo (oggi, 7 o 30 giorni, mese, tutto):
- richieste e token in **entrata** (testo inviato) e in **uscita** (risposta), per modello e per funzione;
- il **costo stimato**: in fondo alla pagina, in **Prezzi e abbonamenti**, scrivi per ogni modello cloud il prezzo in euro per milione di token (lo trovi sul sito del servizio) oppure l'abbonamento mensile del servizio. I modelli cloud scelti compaiono lì anche prima di averli usati, e il prezzo si può mettere anche sotto ogni funzione in «Quale IA per cosa». I modelli locali sono gratis.

I numeri sono quelli restituiti dai servizi dopo ogni risposta; se un servizio non li dà vengono stimati dal testo e la pagina lo segnala. **Azzera storico** cancella i conteggi (i prezzi restano).

### Dati inviati alla chat
In **Dati inviati alla chat** scegli cosa la chat riceve a ogni domanda:
- **Completo**: tutto il CRM.
- **Essenziale**: solo ciò che è aperto (rate da pagare, task da fare, ticket aperti, eventi futuri).
- **Minimo**: come Essenziale, senza note e link e senza clienti completati.

Oppure scegli voce per voce (clienti, rate, task, ticket, note, link, eventi). La pagina mostra quanti token occupano i dati scelti, quanti ne risparmi rispetto a «Completo» e quanti ne usa davvero in media la chat.

> Meno dati = risposte più veloci e meno costi, ma la chat non sa nulla di ciò che hai escluso. Con un modello locale, tieni i dati sotto il contesto scelto per quel modello: se lo superano la pagina avvisa.
`,
    },
    {
        id: 'backup', group: 'dati', icon: '💾', title: 'Backup: cosa salva e quando',
        text: `
Imposta la **cartella dei backup** in Impostazioni → Backup Dati (es. \`D:\\Upersite CRM BACKUPS\\Backup\\Salvataggi\`). Lì dentro il CRM crea **una cartella per giorno** (\`gg-mm-aa\`) e non scrive nient'altro.

### Cosa c'è nella cartella del giorno
- \`backup_ore_HH-MM-SS.json\`: **tutti i dati** del CRM in quel momento (clienti con note, todo, rate, ticket, accessi cifrati, file e loghi, impostazioni, listino e costi del calcolatore, eventi, automazioni, cronologia AI, profilo) più le **preferenze del browser**. Uno per ogni backup fatto in quel giorno.
- \`Preventivi\\\`: tutti i preventivi dei clienti.
- \`Calcolatore\\\`: configurazioni salvate, pacchetti completi e backup delle impostazioni del calcolatore.
- Qualunque altra cartella che il CRM tiene in \`Dati\\\`.

### Quando si fa
- Con **💾 Crea Backup Ora** nelle Impostazioni.
- Con **⋯ → Termina sessione di lavoro**.
- Da un'automazione con l'azione di backup.
- Prima di ogni **ripristino** (backup «prima del ripristino»).

> Più backup nello stesso giorno: i file .json restano tutti (uno per orario); le cartelle Preventivi e Calcolatore vengono aggiornate e non perdono mai file.

### Esporta / Importa JSON
«Esporta Backup (JSON)» scarica solo il file dati (senza le cartelle Preventivi e Calcolatore): utile per una copia veloce. Per spostare o ripristinare **tutto** usa la cartella dei backup e il ripristino.
`,
    },
    {
        id: 'ripristino', group: 'dati', icon: '♻️', title: 'Ripristinare un backup',
        text: `
Impostazioni → Backup Dati → **♻️ Ripristina da un backup…**

1. A sinistra scegli il **giorno** e l'**orario** del backup.
2. A destra controlli cosa contiene: clienti, preventivi, file del calcolatore, automazioni.
3. Scegli **Ripristina tutto** oppure **Solo alcuni clienti**.
4. Scrivi la **password master** e premi Ripristina.
5. Premi **Ricarica il CRM**.

### Ripristina tutto
Puoi scegliere le parti con gli interruttori:
- **Dati del CRM**: sostituiscono quelli attuali (clienti, impostazioni, eventi, automazioni, preferenze). La cartella dei backup resta quella attuale.
- **Preventivi** e **Calcolatore**: i file del backup tornano al loro posto.

### Solo alcuni clienti
Spunta i clienti da recuperare (es. uno cancellato per sbaglio, o le note di ieri). Solo loro tornano com'erano nel backup, insieme ai loro preventivi; tutti gli altri restano come sono.

### Sicurezza
- **Prima di ripristinare il CRM salva sempre lo stato attuale** in un backup «prima del ripristino» nella cartella di oggi. Se hai sbagliato backup, ripristina quello e torni indietro.
- Il ripristino **non cancella mai file**: rimette quelli del backup (aggiornando quelli con lo stesso nome).
- Se il backup ha una password master diversa da quella attuale te lo dice: dopo il ripristino completo si accede con la password di allora.

### Su un altro PC (o dopo una formattazione)
1. Installa il CRM e crea una password qualsiasi.
2. In Impostazioni imposta come cartella dei backup quella che contiene le cartelle con data (es. il disco esterno).
3. Ripristina tutto dal backup più recente e accedi con la tua password di sempre.
`,
    },
    {
        id: 'impostazioni', group: 'aiuto', icon: '⚙️', title: 'Impostazioni',
        text: `
Le Impostazioni (menu **⋯ → Impostazioni**) sono divise in schede, elencate a sinistra; il CRM riapre l'ultima scheda usata.
- **Generale**: questo manuale, minuti di inattività prima del blocco, numero di rate predefinito, cursore personalizzato, versione del CRM.
- **Sicurezza**: cambio della password master (le credenziali dei clienti vengono ricifrate da sole).
- **Backup e dati**: cartella dei backup, backup immediato, ripristino, export/import JSON, cancellazione totale (con password).
- **Calcolatore**: dove salva (cartella dati del CRM o una a scelta), import delle configurazioni del vecchio calcolatore, listino prezzi.
- **Intelligenza artificiale**: Quale IA per cosa, Servizi e chiavi, Modelli locali, Dati inviati alla chat, Consumo e costi. Tutto spiegato nella sezione «Intelligenza artificiale» di questo manuale.
`,
    },
    {
        id: 'dati', group: 'dati', icon: '📁', title: 'Dove sono i dati',
        text: `
Nella cartella del programma (\`Upersite CRM - software\`):
- \`crm_data.json\`: tutti i dati del CRM.
- \`Dati\\Preventivi\\<cliente>\\\`: i preventivi PDF/Word.
- \`Dati\\Calcolatore\\\`: configurazioni (\`Configurazioni\`) e pacchetti completi (\`Pacchetti\`) del calcolatore.

Questi file restano solo sul tuo PC e non vanno mai su GitHub. La copia di sicurezza è nella cartella dei backup, una cartella per giorno.
`,
    },
    {
        id: 'problemi', group: 'aiuto', icon: '🛟', title: 'Problemi comuni',
        text: `
- **«I dati sono stati modificati da un'altra finestra»**: il CRM è aperto in due schede o finestre. Chiudine una e ricarica: le modifiche dell'altra non sono state salvate.
- **«Imposta una cartella dei salvataggi valida»**: la cartella dei backup non esiste o il disco esterno non è collegato. Collegalo o cambia cartella nelle Impostazioni.
- **Export PDF/Word del calcolatore non parte**: serve la connessione internet la prima volta che lo usi in una sessione.
- **La pagina non si apre**: il CRM non è avviato. Usa «Avvia CRM» o il collegamento sul Desktop.
- **Ho cancellato qualcosa per sbaglio**: Impostazioni → Ripristina da un backup → Solo alcuni clienti.
`,
    },
];

// Gruppi del menu del manuale, nell'ordine in cui compaiono
const GROUPS = [
    { id: 'inizio', label: 'Per iniziare' },
    { id: 'lavoro', label: 'Clienti e lavoro' },
    { id: 'ia', label: 'Intelligenza artificiale' },
    { id: 'dati', label: 'Dati e backup' },
    { id: 'aiuto', label: 'Impostazioni e aiuto' }
];

// Capitoli in ordine di lettura (gruppo per gruppo): serve per «precedente / successivo»
const ORDERED = GROUPS.flatMap(g => SECTIONS.filter(s => s.group === g.id));

const CHAPTER_STORAGE_KEY = 'upersite_manual_chapter';

function readStoredChapter() {
    try {
        const saved = localStorage.getItem(CHAPTER_STORAGE_KEY);
        return ORDERED.some(s => s.id === saved) ? saved : ORDERED[0].id;
    } catch {
        return ORDERED[0].id;
    }
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Testo semplice con le parole cercate evidenziate
function highlight(text, query, keyBase) {
    if (!query) return text;
    const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, 'gi'));
    return parts.map((p, i) => (
        p.toLowerCase() === query.toLowerCase() ? <mark key={keyBase + 'm' + i}>{p}</mark> : <React.Fragment key={keyBase + 'm' + i}>{p}</React.Fragment>
    ));
}

// Sintassi minima → elementi React (niente HTML dal testo)
function inline(text, keyBase, query) {
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
    return parts.map((p, i) => {
        if (p.startsWith('**')) return <strong key={keyBase + i}>{highlight(p.slice(2, -2), query, keyBase + i)}</strong>;
        if (p.startsWith('`')) return <code key={keyBase + i}>{p.slice(1, -1)}</code>;
        return <React.Fragment key={keyBase + i}>{highlight(p, query, keyBase + i)}</React.Fragment>;
    });
}

function renderText(text, query) {
    const lines = text.trim().split('\n');
    const out = [];
    let list = null;
    // Chiavi uniche per tipo di elemento: con chiavi uguali React riuserebbe elementi di un altro capitolo
    const flush = () => { if (list) { out.push(list.ordered ? <ol key={'l' + list.start}>{list.items}</ol> : <ul key={'l' + list.start}>{list.items}</ul>); list = null; } };
    lines.forEach((raw, i) => {
        const line = raw.trim();
        if (!line) { flush(); return; }
        const bullet = /^- (.*)/.exec(line);
        const num = /^\d+\. (.*)/.exec(line);
        if (bullet || num) {
            const ordered = !!num;
            if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [], start: i }; }
            list.items.push(<li key={i}>{inline((bullet || num)[1], i + '-', query)}</li>);
            return;
        }
        flush();
        if (line.startsWith('### ')) out.push(<h4 key={'h' + i}>{highlight(line.slice(4), query, i + 'h')}</h4>);
        else if (line.startsWith('> ')) out.push(<div key={'t' + i} className="mn-tip">💡 {inline(line.slice(2), i + '-', query)}</div>);
        else out.push(<p key={'p' + i}>{inline(line, i + '-', query)}</p>);
    });
    flush();
    return out;
}

// Quante volte la ricerca compare in un capitolo
function countHits(section, q) {
    if (!q) return 0;
    const hay = (section.title + ' ' + section.text).toLowerCase();
    let count = 0;
    let index = hay.indexOf(q);
    while (index !== -1) { count++; index = hay.indexOf(q, index + q.length); }
    return count;
}

export default function ManualModal({ onClose }) {
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(readStoredChapter);
    const contentRef = useRef(null);

    const q = query.trim().toLowerCase();
    const visible = useMemo(() => (q ? ORDERED.filter(s => countHits(s, q) > 0) : ORDERED), [q]);
    const current = visible.find(s => s.id === active) || visible[0] || null;
    const position = current ? visible.indexOf(current) : -1;
    const prev = position > 0 ? visible[position - 1] : null;
    const next = position >= 0 && position < visible.length - 1 ? visible[position + 1] : null;

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    // Ogni capitolo si apre dall'inizio
    useEffect(() => {
        if (contentRef.current) contentRef.current.scrollTop = 0;
    }, [current?.id]);

    const goTo = (id) => {
        setActive(id);
        try {
            localStorage.setItem(CHAPTER_STORAGE_KEY, id);
        } catch {
            // localStorage non disponibile: si riparte dal primo capitolo
        }
    };

    const groupLabel = (id) => GROUPS.find(g => g.id === id)?.label || '';

    return (
        <div className="modal-overlay" style={{ zIndex: 2100 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <style>{MN_CSS}</style>
            <div className="mn-dialog animate-scale-in" role="dialog" aria-modal="true" aria-label="Manuale d'uso">
                <div className="mn-head">
                    <span className="mn-head-icon">📖</span>
                    <div style={{ flex: 1 }}>
                        <h3>Manuale d'uso</h3>
                        <p>Upersite CRM {formatVersionDisplay(APP_VERSION)}</p>
                    </div>
                    <div className="mn-search">
                        <span aria-hidden="true">🔍</span>
                        <input placeholder="Cerca nel manuale…" value={query} onChange={e => setQuery(e.target.value)} autoFocus aria-label="Cerca nel manuale" />
                        {query && <button className="mn-search-clear" onClick={() => setQuery('')} aria-label="Cancella la ricerca">✕</button>}
                    </div>
                    <button className="mn-close" onClick={onClose} title="Chiudi" aria-label="Chiudi">✕</button>
                </div>
                <div className="mn-body">
                    <nav className="mn-toc" aria-label="Capitoli">
                        {q && <div className="mn-results">{visible.length === 0 ? 'Nessun risultato' : `${visible.length} ${visible.length === 1 ? 'capitolo' : 'capitoli'} con «${query.trim()}»`}</div>}
                        {GROUPS.map(g => {
                            const items = visible.filter(s => s.group === g.id);
                            if (items.length === 0) return null;
                            return (
                                <div key={g.id} className="mn-group">
                                    <div className="mn-group-label">{g.label}</div>
                                    {items.map(s => (
                                        <button key={s.id} className={current?.id === s.id ? 'on' : ''} onClick={() => goTo(s.id)} aria-current={current?.id === s.id ? 'page' : undefined}>
                                            <span>{s.icon}</span>
                                            <span className="mn-toc-title">{s.title}</span>
                                            {q && <em className="mn-hits">{countHits(s, q)}</em>}
                                        </button>
                                    ))}
                                </div>
                            );
                        })}
                    </nav>

                    <div className="mn-content" ref={contentRef}>
                        {/* Su schermo stretto il menu diventa una tendina */}
                        {visible.length > 0 && (
                            <select className="input mn-mobile-select" value={current?.id || ''} onChange={e => goTo(e.target.value)} aria-label="Capitolo">
                                {GROUPS.map(g => {
                                    const items = visible.filter(s => s.group === g.id);
                                    return items.length === 0 ? null : (
                                        <optgroup key={g.id} label={g.label}>
                                            {items.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                                        </optgroup>
                                    );
                                })}
                            </select>
                        )}

                        {!current && <div className="mn-empty">Nessun capitolo contiene «{query.trim()}».</div>}
                        {current && (
                            <section key={current.id}>
                                <div className="mn-crumb">{groupLabel(current.group)}</div>
                                <h3><span>{current.icon}</span>{highlight(current.title, q, 't')}</h3>
                                {renderText(current.text, q)}
                                <div className="mn-pager">
                                    {prev ? (
                                        <button onClick={() => goTo(prev.id)}><small>← Precedente</small>{prev.title}</button>
                                    ) : <span />}
                                    {next ? (
                                        <button className="mn-next" onClick={() => goTo(next.id)}><small>Successivo →</small>{next.title}</button>
                                    ) : <span />}
                                </div>
                            </section>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

const MN_CSS = `
.mn-dialog { background: var(--bg-card, #fff); border-radius: 24px; box-shadow: 0 30px 90px rgba(20,20,60,0.28); width: min(1100px, 100%); height: min(860px, calc(100vh - 48px)); display: flex; flex-direction: column; overflow: hidden; }
.mn-head { display: flex; align-items: center; gap: 14px; padding: 18px 24px; border-bottom: 1px solid var(--border-light); flex-wrap: wrap; }
.mn-head h3 { margin: 0; font-size: 1.2rem; font-weight: 800; }
.mn-head p { margin: 2px 0 0; font-size: 0.8rem; color: var(--text-tertiary); }
.mn-head-icon { width: 44px; height: 44px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; background: var(--primary-ghost); }
.mn-search { display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 12px; border-radius: 12px; background: var(--bg-input); border: 1.5px solid transparent; min-width: 240px; }
.mn-search:focus-within { border-color: var(--primary); background: var(--bg-card, #fff); }
.mn-search span { opacity: 0.55; }
.mn-search input { border: none; outline: none; background: transparent; font: inherit; font-size: 0.9rem; flex: 1; color: var(--text-primary); }
.mn-search-clear { border: none; background: none; cursor: pointer; color: var(--text-tertiary); padding: 2px 4px; }
.mn-close { width: 36px; height: 36px; border-radius: 50%; border: none; cursor: pointer; background: var(--bg-input); color: var(--text-secondary); }
.mn-close:hover { background: #FFE0E0; color: #E17055; }
.mn-body { display: grid; grid-template-columns: 270px 1fr; flex: 1; min-height: 0; }
.mn-toc { border-right: 1px solid var(--border-light); padding: 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; background: var(--bg-hover); }
.mn-results { font-size: 0.75rem; color: var(--text-tertiary); padding: 4px 12px 8px; }
.mn-group { display: flex; flex-direction: column; gap: 2px; margin-bottom: 10px; }
.mn-group-label { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: var(--text-tertiary); padding: 6px 12px 4px; }
.mn-toc button { display: flex; gap: 10px; align-items: center; text-align: left; border: none; background: none; padding: 8px 12px; border-radius: 12px; cursor: pointer; font: inherit; font-size: 0.85rem; color: var(--text-secondary); }
.mn-toc button:hover { background: var(--bg-card, #fff); }
.mn-toc button.on { background: var(--bg-card, #fff); color: var(--primary); font-weight: 700; box-shadow: var(--shadow-sm); }
.mn-toc-title { flex: 1; }
.mn-hits { font-style: normal; font-size: 0.7rem; background: var(--primary-ghost); color: var(--primary); border-radius: 999px; padding: 1px 7px; }
.mn-content { overflow-y: auto; padding: 22px 40px 40px; font-size: 0.92rem; line-height: 1.65; color: var(--text-secondary); }
.mn-mobile-select { display: none; width: 100%; margin-bottom: 14px; }
.mn-crumb { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: var(--primary); margin-bottom: 4px; }
.mn-content h3 { display: flex; gap: 10px; align-items: center; font-size: 1.35rem; color: var(--text-primary); margin: 0 0 14px; }
.mn-content h4 { font-size: 0.98rem; color: var(--text-primary); margin: 20px 0 6px; }
.mn-content p { margin: 0 0 8px; }
.mn-content ul, .mn-content ol { margin: 0 0 10px; padding-left: 22px; }
.mn-content li { margin-bottom: 4px; }
.mn-content strong { color: var(--text-primary); }
.mn-content code { background: var(--bg-input); padding: 1px 6px; border-radius: 6px; font-size: 0.84em; color: var(--text-primary); word-break: break-all; }
.mn-content mark { background: rgba(253, 203, 110, 0.55); color: inherit; border-radius: 3px; padding: 0 1px; }
.mn-tip { background: var(--primary-ghost); border-radius: 12px; padding: 10px 14px; margin: 12px 0; color: var(--text-primary); font-size: 0.88rem; }
.mn-pager { display: flex; justify-content: space-between; gap: 12px; margin-top: 32px; padding-top: 18px; border-top: 1px solid var(--border-light); }
.mn-pager button { display: flex; flex-direction: column; gap: 2px; max-width: 48%; border: 1px solid var(--border-light); background: var(--bg-card, #fff); border-radius: 12px; padding: 10px 14px; cursor: pointer; font: inherit; font-size: 0.86rem; font-weight: 600; color: var(--text-primary); text-align: left; }
.mn-pager button:hover { border-color: var(--primary); color: var(--primary); }
.mn-pager button small { font-size: 0.7rem; font-weight: 500; color: var(--text-tertiary); }
.mn-pager .mn-next { text-align: right; align-items: flex-end; margin-left: auto; }
.mn-empty { padding: 40px; text-align: center; color: var(--text-tertiary); }
@media (max-width: 760px) {
    .mn-body { grid-template-columns: 1fr; }
    .mn-toc { display: none; }
    .mn-mobile-select { display: block; }
    .mn-content { padding: 14px 18px 30px; }
    .mn-search { min-width: 0; flex: 1 1 100%; order: 3; }
}
`;
