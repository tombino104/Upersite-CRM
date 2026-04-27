# Riparazione Sistema Automazioni - Upersite CRM

## Problema Identificato
Le automazioni non funzionavano MAI a causa di:
1. **Rilevazione fragile**: Usava confronto per lunghezza array invece che per ID
2. **Logging assente**: Nessun modo per debuggare cosa succedeva
3. **Eventi persi**: TASK_COMPLETED non era rilevato

## Soluzioni Implementate

### 1. Rilevazione Robusta per ID (useCustomers.js)
**Prima**: Confronto fragile `updates.todo.length > c.todo.length`
- Falliva se si riordinavano/sostituivano task
- Non rilevava subtask nuovi

**Dopo**: Confronto per ID con funzioni ricorsive
- Trova TUTTI i task nuovi (anche subtask annidati)
- Trova TUTTE le note nuove
- Rileva TASK_COMPLETED separatamente

### 2. Logging Completo
Aggiunto in tutto il flusso:
- `[WorkflowEngine]` - Eventi ricevuti e workflow attivati
- `[Scheduler]` - Controllo workflow temporali ogni minuto
- `[WorkflowRunner]` - Esecuzione nodi e azioni

### 3. Nuovi Eventi Supportati
- `TASK_COMPLETED` - Ora rilevato quando un task viene completato
- Eventi più precisi per note e task

## Come Testare

### Test 1: Workflow con Task Creato
1. Crea un workflow:
   - Trigger: "Task creato"
   - Azione: "Aggiungi tag #automated"
2. Vai su un cliente → Aggiungi un task
3. **Atteso**: Console mostra `[WorkflowEngine] Nuovi task rilevati: 1`
4. Verifica che il tag sia stato aggiunto

### Test 2: Workflow Temporale
1. Crea un workflow:
   - Trigger: "Ogni giorno" alle `HH:MM` (1-2 minuti nel futuro)
   - Azione: qualsiasi
2. Aspetta il minuto indicato
3. **Atteso**: Console mostra `[Scheduler] ATTIVAZIONE daily: NomeWorkflow`

### Test 3: Debug in Console
Apri DevTools (F12) → Console, dovresti vedere:
```
[WorkflowEngine] Evento ricevuto: task.created {...}
[WorkflowEngine] Workflow attivi: N
[WorkflowEngine] Workflow "Nome": trigger=task.created, match=true
[WorkflowEngine] Workflow matching: 1
[WorkflowRunner] Avvio workflow: NomeWorkflow (trigger: task.created)
...
[WorkflowRunner] Workflow completato con successo: NomeWorkflow
```

## File Modificati
- `src/hooks/useCustomers.js` - Rilevazione eventi robusta + logging
- `src/utils/workflowRunner.js` - Logging esecuzione workflow

## Se Non Funziona
1. Apri DevTools → Console
2. Cerca log `[WorkflowEngine]` o `[WorkflowRunner]`
3. Se non compaiono → Ricarica la pagina (F5)
4. Se compaiono ma workflow non esegue → Verifica che sia "Attivo"
5. Se workflow è "broken" → Vai in Automazioni → Verifica errori validazione

## Note
Il sistema ora logga TUTTO in console. Questo ti permette di vedere:
- Quando un evento viene ricevuto
- Quanti workflow sono attivi
- Quali workflow matchano l'evento
- Risultato di ogni nodo (condizioni passate/fallite, azioni eseguite)

I log rimarranno attivi per aiutarti nel debugging.
