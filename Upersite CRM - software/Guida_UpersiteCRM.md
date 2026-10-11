# Upersite CRM — Guida all'Uso

Benvenuto in **Upersite CRM**, la piattaforma progettata su misura per gestire i clienti, i pagamenti, e le configurazioni dei tuoi progetti.

---

## 🚀 1. Come Avviare l'App

Il CRM può essere utilizzato in due modalità: **versione Browser** e **versione Desktop** (consigliata per l'uso quotidiano se configuri l'eseguibile).

### Versione Desktop (Electron)
In questa modalità potrai usare l'app come un software vero e proprio, senza tab browser a darti fastidio.
1. Apri la cartella del progetto (`C:\Users\loren\Desktop\Business\Upersite CRM`).
2. Apri il terminale integrato (o la console PowerShell) lì dentro.
3. Al primo avvio esegui per sicurezza:
   ```bash
   npm install
   ```
4. Esegui il comando:
   ```bash
   npm run electron:dev
   ```
   L'app si aprirà in una bellissima finestra senza bordi!

### Versione Browser (Classica)
Se preferisci aprirlo dal tuo browser (Chrome, Edge o Firefox):
1. Sempre da terminale digita:
   ```bash
   npm run dev
   ```
2. Ora vai nel tuo browser di fiducia e apri la pagina `http://localhost:5173/`.

---

## 🔐 2. L'Accesso e la tua Password

Al tuo primissimo login, l'app ti darà il benvenuto chiedendoti di **creare una Password Master**.
Questa NON è scritta in nessun database su internet. È personale, è salvata sul tuo PC ed è l'unica chiave per sbloccare l'interfaccia.

- Se te la scordi? Nessun problema, i dati non vanno persi: chiudi il CRM, apri il file `crm_data.json`, elimina la riga `"masterPassword"` e riavvia. Potrai crearne una nuova (clienti e loghi restano). Le password della sezione **Accessi** però sono cifrate con la vecchia password: torneranno leggibili solo se reimposti la stessa password di prima. Dalla schermata di login, "Password dimenticata?" ti ricorda questi passaggi.
- Dopo **5 minuti** di totale inattività sul CRM, si *bloccherà* e dovrai ripetere la password per una sicurezza completa del tuo spazio lavorativo!

---

## 👥 3. Kanban, Liste e Filtri

Subito dentro troverai la Dashboard e sotto due visualizzazioni intercambiabili in alto a destra:

- **La Kanban Board (▦):** Un innovativo e comodo sistema in cui potrai prendere un tuo cliente e "trascinarlo" comodamente dagli stati **Prospect -> In lavorazione -> Completato -> Sospeso**.
- Sulla stessa colonnina, troverai la barra che indica a colpo d'occhio quando un cliente ha finito i pagamenti!
- E le iconcine che vedi sopra a tutto? Se gli assegeni un'immagine o aggiungi i **Tags**, sbucheranno fuori e miglioreranno l'estetica.

- **Filtri Clienti:**
1. Di fianco alla scritta in cima a sinistra ("Upersite CRM"), hai il testo **"X clienti ▾"**. Provaci a cliccare: *Appare subito un pratico dropdown* per navigarli!
2. Usa l'input `🔍 Cerca cliente...` per digitare non solo Nome e Azienda o E-mail, **ma puoi usarlo perfino per i TAGS**. Ad esempio, se tra un mese cerchi tutti i clienti etichettati "E-Commerce", la Kanban ti riporterà *solo* quelli!

---

## ⚙️ 4. Il Pannello del Cliente — Spiegato

Clicca su un Cliente per veder comparire l'elegantissima modale a sbalzo in cui potrai appurare tutti i dati. Da qui, trovi i nuovi tool implementati:

1. **Avatar/Logo (Nuovo):** Fai clic sopra al tondino col colore pieno, comparirà la piccola fotocamera, da cui potrai assegnare il vero logo dell'azienda al Cliente. 
2. **Finanza:** Non si possono più mettere spese 'negative'. Gestisce il totale del preventivo ed ogni scadenza avuta. Hai **l'eliminazione sicura!** Quando proverai a cancellare una rata inserita per sbaglio verrai prima fermato dal popup "Sei sicuro di voler eliminare questo elemento?". Questo succede per files, rate, link, o credenziali.
3. **Configurazione (Nuovo):** Puoi farti i vari appunti spuntando tutti i _pacchetti_ e gli eventuali Add-on presi fedelmente dai Listini di base della Upersite! Utile da controllare nei futuri colloqui post-vendita. Nessun prezzo forzato che spunta in giro se non nel riquadro lì!
4. **File e Archivio (Nuovo):** Ti capiterà di aver sottomano la carta d'identità in jpeg che ti gira un cliente per i vari documenti. Qui sopra potrai archiviarli associandoli per sempre a Mr X! Troverai una dicitura (in Megabyte o Kilobyte) specificante **il totale di memoria che i File di quell'utente ti sta consumando**
5. **Le Tue Note formattate (Nuovo):** Il nuovo spazio per prendere appunti include gli utilissimi grassetti (**B**), elenchi numerati (1.) o puntati (*). Così si possono descrivere flussi interi! Sono appunti storici: la riga grigia in alto alla nota indica la data e l'ora del salvataggio.
6. **Più email (Nuovo):** sotto il campo Email c'è "+ Aggiungi email" per inserire più indirizzi dello stesso cliente. Sono tutti cercabili.
7. **Stato dei preventivi (Nuovo):** accanto a ogni preventivo caricato un menu a tendina lo segna come *In attesa*, *Accettato* o *Rifiutato*. Si salva subito.
8. **Fogli ore (Nuovo):** il pulsante ⏱️ in alto, accanto al sito web, apre il foglio ore del cliente: una tabella stile foglio di calcolo (clicca una cella per modificarla, compila la riga evidenziata e premi Invio per aggiungere), con grafici delle ore, filtro per periodo ed esportazione CSV/PDF. Calcola anche il **guadagno €/ora** dividendo il valore del progetto (preventivo o somma delle rate) per le ore lavorate, e lo stesso sull'incassato.

> **Todo dei progetti completati:** se un cliente passa a "Completato", i suoi todo spariscono dall'elenco e dalla matrice di Eisenhower.

---

## 📂 5. Spostare o Mettere al Sicuro i Dati

In alto a destra troverai l'icona con `⋯` (Tre pallini orizzontali). 
Aprirà un menu strategico per:
- **Scaricare un Backup:** Se formatti il computer salva prima tutto!
- **Importarlo altrove:** Avvialo dal computer o portatile in un lampo con le sue foto.
- **Lock Manuale:** *Chiudi* le porte a chiave dal comando "Blocca CRM" se vai in pausa pranzo.
