// Upersite CRM — Workflow Runner v2
// Motore di esecuzione corretto e completo

import { generateId } from './storage';

// ─── Risoluzione variabili dinamiche ───
export function resolveVariables(template, context) {
  if (typeof template !== 'string') return template;
  return template.replace(/\{\{(\s*[\w.]+\s*)\}\}/g, (match, path) => {
    const keys = path.trim().split('.');
    let value = context;
    for (const key of keys) {
      if (value == null) return match;
      value = value[key];
    }
    return value != null ? String(value) : match;
  });
}

// ─── Costruzione contesto normalizzato IT/EN ───
// Mappiamo sia i campi italiani che quelli inglesi così le condizioni
// funzionano con entrambe le notazioni (cliente.stato E cliente.status).
export function buildContext(event, appState = {}) {
  const customer = event.customer || event.cliente || null;

  const clienteNorm = customer ? {
    // campi originali (inglese)
    ...customer,
    // alias italiani
    nome: customer.name || '',
    azienda: customer.company || '',
    stato: customer.status || '',
    email: customer.email || '',
    telefono: customer.phone || '',
    tipo_pacchetto: customer.packageType || '',
    tag: customer.tags || [],
    // alias inglese espliciti (ridondanti ma sicuri)
    name: customer.name || '',
    company: customer.company || '',
    status: customer.status || '',
    phone: customer.phone || '',
    tags: customer.tags || [],
  } : null;

  const task = event.task || null;
  const taskNorm = task ? {
    ...task,
    nome: task.text || task.nome || '',
    testo: task.text || task.testo || '',
    stato: task.completed ? 'completato' : 'da_fare',
    scadenza: task.dueDate || '',
    priorita: task.priority || '',
    // alias inglese
    text: task.text || task.nome || '',
    completed: task.completed,
    dueDate: task.dueDate || '',
    priority: task.priority || '',
  } : null;

  const nota = event.note || event.nota || null;
  const notaNorm = nota ? {
    ...nota,
    testo: nota.text || nota.testo || '',
    text: nota.text || nota.testo || '',
  } : null;

  const lead = event.lead || null;
  const leadNorm = lead ? {
    ...lead,
    nome: lead.name || '',
    azienda: lead.company || '',
    fase: lead.stage || '',
    fonte: lead.source || '',
    valore: lead.value || 0,
    probabilita: lead.probability || 0,
    motivo_perdita: lead.lostReason || '',
    prossima_azione: lead.nextAction || '',
  } : null;

  return {
    // accesso italiano
    cliente: clienteNorm,
    lead: leadNorm,
    task: taskNorm,
    nota: notaNorm,
    pagamento: event.payment || event.pagamento || null,
    tag: event.tag || null,
    // accesso inglese
    customer: clienteNorm,
    // metadati temporali
    data_corrente: new Date().toISOString().split('T')[0],
    ora_corrente: new Date().toLocaleTimeString('it-IT'),
    timestamp: new Date().toISOString(),
    // stato app
    app: {
      isLoggedIn: appState.isLoggedIn !== false,
      isUnlocked: appState.isUnlocked !== false,
      ...appState,
    },
    // evento raw
    evento: event,
    event,
  };
}

// ─── Valutazione condizioni ───
function getNestedValue(obj, path) {
  if (!obj || !path) return undefined;
  const keys = path.trim().split('.');
  let value = obj;
  for (const key of keys) {
    if (value == null) return undefined;
    value = value[key];
  }
  return value;
}

function evaluateCondition(condition, context) {
  const { field, operator, value } = condition;
  if (!field) return true;

  const actual = getNestedValue(context, field);
  const strActual = String(actual ?? '').toLowerCase().trim();
  const strValue = String(value ?? '').toLowerCase().trim();

  switch (operator) {
    case '=':
    case '==':
      return strActual === strValue;
    case '!=':
    case '≠':
      return strActual !== strValue;
    case '>':
      return parseFloat(actual) > parseFloat(value);
    case '<':
      return parseFloat(actual) < parseFloat(value);
    case '>=':
      return parseFloat(actual) >= parseFloat(value);
    case '<=':
      return parseFloat(actual) <= parseFloat(value);
    case 'contiene':
      if (Array.isArray(actual)) {
        return actual.some(v => String(v).toLowerCase().includes(strValue));
      }
      return strActual.includes(strValue);
    case 'non_contiene':
      if (Array.isArray(actual)) {
        return !actual.some(v => String(v).toLowerCase().includes(strValue));
      }
      return !strActual.includes(strValue);
    default:
      return false;
  }
}

function evaluateConditionGroup(conditions, logic, context) {
  if (!conditions || conditions.length === 0) return true;
  const filtered = conditions.filter(c => c.field && c.field.trim());
  if (filtered.length === 0) return true;
  if (logic === 'OR') {
    return filtered.some(c => evaluateCondition(c, context));
  }
  return filtered.every(c => evaluateCondition(c, context));
}

// ─── Utility per task ───
function calculateDueDate(type, value) {
  if (!type || type === 'nessuna') return '';
  const now = new Date();
  const num = parseInt(value) || 1;
  switch (type) {
    case 'giorni': now.setDate(now.getDate() + num); break;
    case 'settimane': now.setDate(now.getDate() + num * 7); break;
    case 'mesi': now.setMonth(now.getMonth() + num); break;
    case 'custom': return value || '';
    default: return '';
  }
  return now.toISOString().split('T')[0];
}

function addSubtaskToParent(tasks, parentId, subtask, maxLevel, currentLevel = 1) {
  return tasks.map(t => {
    if (t.id === parentId && currentLevel <= maxLevel) {
      return { ...t, subtasks: [...(t.subtasks || []), subtask] };
    }
    if (t.subtasks && t.subtasks.length > 0) {
      return { ...t, subtasks: addSubtaskToParent(t.subtasks, parentId, subtask, maxLevel, currentLevel + 1) };
    }
    return t;
  });
}

function markTaskByName(tasks, name, completed) {
  return tasks.map(t => {
    if ((t.text || '').toLowerCase() === (name || '').toLowerCase()) {
      return { ...t, completed, readAt: completed ? new Date().toISOString() : null };
    }
    if (t.subtasks && t.subtasks.length > 0) {
      return { ...t, subtasks: markTaskByName(t.subtasks, name, completed) };
    }
    return t;
  });
}

function updateTaskById(tasks, taskId, updates) {
  return tasks.map(t => {
    if (t.id === taskId) {
      return { ...t, ...updates };
    }
    if (t.subtasks && t.subtasks.length > 0) {
      return { ...t, subtasks: updateTaskById(t.subtasks, taskId, updates) };
    }
    return t;
  });
}

// ─── Esecuzione azioni ───
async function executeAction(action, context, crmActions) {
  const { actionType, config } = action;

  // Risolvi variabili dinamiche in tutti i campi config
  const resolved = {};
  Object.entries(config || {}).forEach(([k, v]) => {
    resolved[k] = resolveVariables(v, context);
  });

  // Ricava customerId: prima dal config esplicito, poi dal contesto cliente
  const customerId = resolved.customerId || context.cliente?.id || context.customer?.id;

  switch (actionType) {
    // ── Cliente ──
    case 'move_customer_status': {
      if (!customerId || !crmActions.updateCustomer) {
        return { success: false, detail: 'ID cliente mancante per spostamento stato' };
      }
      crmActions.updateCustomer(customerId, { status: resolved.targetStatus });
      return { success: true, detail: `Stato cliente → ${resolved.targetStatus}` };
    }

    case 'add_tag': {
      if (!customerId || !crmActions.updateCustomer) {
        return { success: false, detail: 'ID cliente mancante per aggiunta tag' };
      }
      const customer = crmActions.getCustomer?.(customerId);
      if (!customer) return { success: false, detail: `Cliente ${customerId} non trovato` };
      const tags = [...(customer.tags || [])];
      const tagToAdd = resolved.tag || '';
      if (tagToAdd && !tags.includes(tagToAdd)) {
        tags.push(tagToAdd);
        crmActions.updateCustomer(customerId, { tags });
      }
      return { success: true, detail: `Tag aggiunto: ${tagToAdd}` };
    }

    case 'remove_tag': {
      if (!customerId || !crmActions.updateCustomer) {
        return { success: false, detail: 'ID cliente mancante per rimozione tag' };
      }
      const customer = crmActions.getCustomer?.(customerId);
      if (!customer) return { success: false, detail: `Cliente ${customerId} non trovato` };
      const tags = (customer.tags || []).filter(t => t !== resolved.tag);
      crmActions.updateCustomer(customerId, { tags });
      return { success: true, detail: `Tag rimosso: ${resolved.tag}` };
    }

    // ── Task ──
    case 'create_task': {
      if (!customerId || !crmActions.updateCustomer) {
        return { success: false, detail: 'ID cliente mancante per creazione task' };
      }
      const customer = crmActions.getCustomer?.(customerId);
      if (!customer) return { success: false, detail: `Cliente ${customerId} non trovato` };
      const newTask = {
        id: generateId(),
        text: resolved.title || 'Nuovo task',
        priority: resolved.priority || 'Media',
        dueDate: calculateDueDate(resolved.dueDateType, resolved.dueDateValue),
        completed: false,
        createdAt: new Date().toISOString(),
        readAt: null,
        subtasks: [],
        description: resolved.description || '',
        linkedFiles: [],
        linkedNotes: [],
        recurrence: 'none',
        createdByWorkflow: true,
      };
      const todo = [...(customer.todo || []), newTask];
      crmActions.updateCustomer(customerId, { todo });
      return { success: true, detail: `Task creato: "${newTask.text}"` };
    }

    case 'create_subtask': {
      const parentTaskId = resolved.parentTaskId || context.task?.id;
      if (!customerId || !parentTaskId || !crmActions.updateCustomer) {
        return { success: false, detail: 'ID cliente o task padre mancante' };
      }
      const customer = crmActions.getCustomer?.(customerId);
      if (!customer) return { success: false, detail: `Cliente ${customerId} non trovato` };
      const newSubtask = {
        id: generateId(),
        text: resolved.title || 'Nuovo sotto-task',
        priority: resolved.priority || 'Media',
        dueDate: '',
        completed: false,
        createdAt: new Date().toISOString(),
        readAt: null,
        subtasks: [],
        description: '',
        linkedFiles: [],
        linkedNotes: [],
        recurrence: 'none',
        createdByWorkflow: true,
      };
      const todo = addSubtaskToParent(customer.todo || [], parentTaskId, newSubtask, parseInt(resolved.level) || 1);
      crmActions.updateCustomer(customerId, { todo });
      return { success: true, detail: `Sotto-task creato: "${newSubtask.text}"` };
    }

    case 'complete_task': {
      if (!customerId || !crmActions.updateCustomer) {
        return { success: false, detail: 'ID cliente mancante' };
      }
      const customer = crmActions.getCustomer?.(customerId);
      if (!customer) return { success: false, detail: `Cliente ${customerId} non trovato` };
      const markAsCompleted = resolved.markAs !== 'da_fare';

      let todo;
      if (resolved.taskId) {
        // Cerca per ID (via dropdown picker nel pannello)
        const updateById = (tasks) => tasks.map(t => {
          if (t.id === resolved.taskId) {
            return { ...t, completed: markAsCompleted, readAt: markAsCompleted ? new Date().toISOString() : null };
          }
          if (t.subtasks?.length) return { ...t, subtasks: updateById(t.subtasks) };
          return t;
        });
        todo = updateById(customer.todo || []);
      } else {
        // Fallback: cerca per nome testuale
        todo = markTaskByName(customer.todo || [], resolved.taskName, markAsCompleted);
      }

      crmActions.updateCustomer(customerId, { todo });
      return { success: true, detail: `Task → ${markAsCompleted ? 'completato' : 'da fare'}` };
    }

    case 'update_task': {
      const taskId = resolved.taskId || context.task?.id;
      if (!customerId || !taskId || !crmActions.updateCustomer) {
        return { success: false, detail: 'ID cliente o task mancante' };
      }
      const customer = crmActions.getCustomer?.(customerId);
      if (!customer) return { success: false, detail: `Cliente ${customerId} non trovato` };
      const updates = {};
      if (resolved.title) updates.text = resolved.title;
      if (resolved.priority) updates.priority = resolved.priority;
      if (resolved.dueDate) updates.dueDate = resolved.dueDate;
      const todo = updateTaskById(customer.todo || [], taskId, updates);
      crmActions.updateCustomer(customerId, { todo });
      return { success: true, detail: `Task ${taskId} aggiornato` };
    }

    // ── Note ──
    case 'create_note': {
      if (!customerId || !crmActions.updateCustomer) {
        return { success: false, detail: 'ID cliente mancante per creazione nota' };
      }
      const customer = crmActions.getCustomer?.(customerId);
      if (!customer) return { success: false, detail: `Cliente ${customerId} non trovato` };
      const newNote = {
        id: generateId(),
        text: resolved.text || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdByWorkflow: true,
      };
      const notes = [...(customer.notes || []), newNote];
      crmActions.updateCustomer(customerId, { notes });
      return { success: true, detail: `Nota creata su cliente` };
    }

    case 'append_note': {
      const noteId = resolved.noteId;
      if (!customerId || !noteId || !crmActions.updateCustomer) {
        return { success: false, detail: 'ID nota o cliente mancante' };
      }
      const customer = crmActions.getCustomer?.(customerId);
      if (!customer) return { success: false, detail: `Cliente ${customerId} non trovato` };
      const noteExists = (customer.notes || []).some(n => n.id === noteId);
      if (!noteExists) return { success: false, detail: `Nota ${noteId} non trovata` };
      const notes = (customer.notes || []).map(n => {
        if (n.id === noteId) {
          return { ...n, text: (n.text || '') + '\n' + (resolved.text || ''), updatedAt: new Date().toISOString() };
        }
        return n;
      });
      crmActions.updateCustomer(customerId, { notes });
      return { success: true, detail: `Testo aggiunto a nota` };
    }

    // ── Sistema ──
    case 'create_backup': {
      if (crmActions.triggerBackup) crmActions.triggerBackup();
      return { success: true, detail: 'Backup avviato' };
    }

    case 'export_backup': {
      if (crmActions.exportBackup) crmActions.exportBackup();
      return { success: true, detail: 'Esportazione backup avviata' };
    }

    default:
      return { success: false, detail: `Azione sconosciuta: ${actionType}` };
  }
}

// ─── Runner principale ───
export async function runWorkflow(workflow, triggerEvent, crmActions, appState = {}) {
  console.log(`[WorkflowRunner] Avvio workflow: ${workflow.name} (trigger: ${triggerEvent.type})`);
  
  const log = {
    id: generateId(),
    workflowId: workflow.id,
    workflowName: workflow.name,
    triggeredBy: triggerEvent.type,
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: 'running',
    steps: [],
    error: null,
  };

  try {
    const context = buildContext(triggerEvent, appState);
    console.log(`[WorkflowRunner] Contesto build:`, { customer: context.cliente?.nome, hasTask: !!context.task });

    // Verifica condizioni di esecuzione
    if (workflow.executionConditions) {
      const { requireLogin, background } = workflow.executionConditions;
      console.log(`[WorkflowRunner] Condizioni: requireLogin=${requireLogin}, background=${background}, isLoggedIn=${context.app?.isLoggedIn}`);
      // requireLogin = esegui SOLO se loggato (e non in background mode)
      if (requireLogin && !background && !context.app?.isLoggedIn) {
        log.status = 'skipped';
        log.error = 'Richiesto login utente';
        log.completedAt = new Date().toISOString();
        console.log(`[WorkflowRunner] Workflow saltato: richiesto login`);
        return log;
      }
    }

    const nodes = workflow.nodes || [];
    const edges = workflow.edges || [];

    const triggerNode = nodes.find(n => n.type === 'triggerNode');
    if (!triggerNode) {
      throw new Error('Nessun trigger trovato nel workflow');
    }
    console.log(`[WorkflowRunner] Trigger trovato: ${triggerNode.data?.eventType || 'non configurato'}`);

    // Verifica che l'evento del trigger corrisponda
    if (triggerNode.data?.eventType && triggerNode.data.eventType !== triggerEvent.type) {
      log.status = 'skipped';
      log.error = `Trigger non corrispondente: atteso ${triggerNode.data.eventType}, ricevuto ${triggerEvent.type}`;
      log.completedAt = new Date().toISOString();
      console.log(`[WorkflowRunner] Trigger non corrispondente: atteso ${triggerNode.data.eventType}, ricevuto ${triggerEvent.type}`);
      return log;
    }
    console.log(`[WorkflowRunner] Trigger corrispondente, avvio esecuzione nodi`);

    // Percorri il grafo seguendo le connessioni
    let currentNodeId = triggerNode.id;
    const visited = new Set();
    const MAX_STEPS = 50; // anti-loop

    while (currentNodeId && !visited.has(currentNodeId) && log.steps.length < MAX_STEPS) {
      visited.add(currentNodeId);
      const node = nodes.find(n => n.id === currentNodeId);
      if (!node) {
        console.log(`[WorkflowRunner] Nodo ${currentNodeId} non trovato`);
        break;
      }
      console.log(`[WorkflowRunner] Esecuzione nodo: ${node.type} (${node.data?.label || 'senza label'})`);

      const stepLog = {
        nodeId: node.id,
        nodeType: node.type,
        label: node.data?.label || '',
        timestamp: new Date().toISOString(),
        result: null,
      };

      if (node.type === 'triggerNode') {
        // Il trigger è il punto di partenza, non esegue azioni
        stepLog.result = 'trigger';
        log.steps.push(stepLog);
        console.log(`[WorkflowRunner] Nodo trigger eseguito`);

      } else if (node.type === 'conditionNode') {
        const conditions = node.data?.conditions || [];
        const logic = node.data?.logic || 'AND';
        const passed = evaluateConditionGroup(conditions, logic, context);
        stepLog.result = passed ? 'passed' : 'failed';
        log.steps.push(stepLog);
        console.log(`[WorkflowRunner] Condizione ${logic}: ${passed ? 'PASSATA' : 'FALLITA'}`);

        if (!passed) {
          // Condizione fallita: termina il workflow (non è un errore)
          log.status = 'completed';
          log.completedAt = new Date().toISOString();
          log.steps.push({ ...stepLog, nodeType: '_end', label: 'Condizione non soddisfatta', result: 'stopped' });
          console.log(`[WorkflowRunner] Workflow terminato: condizione non soddisfatta`);
          return log;
        }

      } else if (node.type === 'actionNode') {
        console.log(`[WorkflowRunner] Azione: ${node.data?.actionType}`);
        const result = await executeAction(
          { actionType: node.data?.actionType, config: node.data?.config || {} },
          context,
          crmActions
        );
        stepLog.result = result;
        log.steps.push(stepLog);
        console.log(`[WorkflowRunner] Risultato azione:`, result);
        if (!result.success) {
          throw new Error(result.detail);
        }

      } else if (node.type === 'ifElseNode') {
        const conditions = node.data?.conditions || [];
        const logic = node.data?.logic || 'AND';
        const passed = evaluateConditionGroup(conditions, logic, context);
        stepLog.result = passed ? 'if_branch' : 'else_branch';
        log.steps.push(stepLog);

        const branchEdge = edges.find(e =>
          e.source === node.id && e.sourceHandle === (passed ? 'if' : 'else')
        );
        currentNodeId = branchEdge?.target || null;
        continue;

      } else if (node.type === 'delayNode') {
        const unit = node.data?.delayUnit || 'secondi';
        const val = parseInt(node.data?.delayValue) || 0;
        const delayMs = val * (unit === 'minuti' ? 60000 : 1000);
        // Limitiamo a 5 minuti max per evitare blocchi eccessivi
        const cappedMs = Math.min(delayMs, 300000);
        if (cappedMs > 0) {
          await new Promise(resolve => setTimeout(resolve, cappedMs));
        }
        stepLog.result = `Atteso ${val} ${unit}`;
        log.steps.push(stepLog);

      } else if (node.type === 'endNode') {
        stepLog.result = 'Workflow terminato';
        log.steps.push(stepLog);
        break;

      } else if (node.type === 'chainNode') {
        const targetId = node.data?.targetWorkflowId;
        stepLog.result = `Chain → ${node.data?.targetWorkflowName || targetId}`;
        log.steps.push(stepLog);
        // Esegui il workflow concatenato
        if (targetId && crmActions.getWorkflow) {
          const targetWf = crmActions.getWorkflow(targetId);
          if (targetWf) {
            const chainLog = await runWorkflow(targetWf, triggerEvent, crmActions, appState);
            log.steps.push({
              nodeId: 'chain_result',
              nodeType: 'chainResult',
              label: `Risultato chain: ${targetWf.name}`,
              timestamp: new Date().toISOString(),
              result: chainLog.status,
            });
          }
        }

      } else {
        log.steps.push(stepLog);
      }

      // Nodo successivo
      const nextEdge = edges.find(e => e.source === currentNodeId);
      currentNodeId = nextEdge?.target || null;
    }

    log.status = 'completed';
    log.completedAt = new Date().toISOString();
    console.log(`[WorkflowRunner] Workflow completato con successo: ${workflow.name}`);

  } catch (err) {
    log.status = 'error';
    log.error = err.message;
    log.completedAt = new Date().toISOString();
    console.error(`[WorkflowRunner] Errore workflow ${workflow.name}:`, err.message);
  }

  return log;
}

// ─── Validazione workflow ───
export function validateWorkflow(workflow, crmData) {
  const errors = [];
  const warnings = [];
  const nodes = workflow.nodes || [];
  const edges = workflow.edges || [];

  // Deve avere esattamente un trigger
  const triggers = nodes.filter(n => n.type === 'triggerNode');
  if (triggers.length === 0) {
    errors.push({ nodeId: null, message: 'Il workflow non ha un trigger' });
  } else if (triggers.length > 1) {
    errors.push({ nodeId: null, message: 'Il workflow ha troppi trigger (max 1)' });
  }

  // Trigger senza evento configurato
  triggers.forEach(n => {
    if (!n.data?.eventType) {
      errors.push({ nodeId: n.id, message: 'Trigger senza evento configurato' });
    }
  });

  // Nodi orfani (eccetto trigger)
  nodes.forEach(node => {
    if (node.type === 'triggerNode') return;
    const hasIncoming = edges.some(e => e.target === node.id);
    if (!hasIncoming) {
      warnings.push({ nodeId: node.id, message: `"${node.data?.label || node.type}" non è collegato` });
    }
  });

  // Azioni senza tipo
  nodes.filter(n => n.type === 'actionNode').forEach(node => {
    if (!node.data?.actionType) {
      errors.push({ nodeId: node.id, message: `Azione "${node.data?.label}" senza tipo configurato` });
    }
  });

  // Tag inesistenti
  nodes.forEach(node => {
    const config = node.data?.config || {};
    if (config.tag) {
      const allTags = crmData?.tags || [];
      if (allTags.length > 0 && !allTags.includes(config.tag)) {
        warnings.push({ nodeId: node.id, message: `Tag "${config.tag}" non trovato nel CRM` });
      }
    }
  });

  // IF/ELSE con uscite non collegate
  nodes.filter(n => n.type === 'ifElseNode').forEach(node => {
    const ifEdge = edges.find(e => e.source === node.id && e.sourceHandle === 'if');
    const elseEdge = edges.find(e => e.source === node.id && e.sourceHandle === 'else');
    if (!ifEdge) warnings.push({ nodeId: node.id, message: `IF/ELSE: ramo "IF (vero)" non collegato` });
    if (!elseEdge) warnings.push({ nodeId: node.id, message: `IF/ELSE: ramo "ELSE (falso)" non collegato` });
  });

  const status = errors.length > 0 ? 'broken' : warnings.length > 0 ? 'warning' : 'active';
  return { errors, warnings, status };
}
