// Upersite CRM — Workflow Runner
// Motore di esecuzione che percorre il grafo dei workflow e applica le azioni

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

// ─── Valutazione condizioni ───
function evaluateCondition(condition, context) {
  const { field, operator, value } = condition;
  const keys = field.split('.');
  let actual = context;
  for (const key of keys) {
    if (actual == null) return false;
    actual = actual[key];
  }

  const strActual = String(actual ?? '').toLowerCase();
  const strValue = String(value ?? '').toLowerCase();

  switch (operator) {
    case '=': return strActual === strValue;
    case '!=':
    case '\u2260': return strActual !== strValue;
    case '>': return parseFloat(actual) > parseFloat(value);
    case '<': return parseFloat(actual) < parseFloat(value);
    case '>=': return parseFloat(actual) >= parseFloat(value);
    case '<=': return parseFloat(actual) <= parseFloat(value);
    case 'contiene': return strActual.includes(strValue);
    case 'non_contiene': return !strActual.includes(strValue);
    default: return false;
  }
}

function evaluateConditionGroup(conditions, logic, context) {
  if (!conditions || conditions.length === 0) return true;
  if (logic === 'OR') {
    return conditions.some(c => evaluateCondition(c, context));
  }
  return conditions.every(c => evaluateCondition(c, context));
}

// ─── Esecuzione azioni ───
function executeAction(action, context, crmActions) {
  const { actionType, config } = action;
  const resolved = {};
  Object.entries(config || {}).forEach(([k, v]) => {
    resolved[k] = resolveVariables(v, context);
  });

  switch (actionType) {
    case 'move_customer_status': {
      const customerId = context.cliente?.id;
      if (customerId && crmActions.updateCustomer) {
        crmActions.updateCustomer(customerId, { status: resolved.targetStatus });
      }
      return { success: true, detail: `Stato cliente -> ${resolved.targetStatus}` };
    }

    case 'add_tag': {
      const customerId = context.cliente?.id;
      if (customerId && crmActions.updateCustomer) {
        const customer = crmActions.getCustomer?.(customerId);
        if (customer) {
          const tags = [...(customer.tags || [])];
          if (!tags.includes(resolved.tag)) {
            tags.push(resolved.tag);
            crmActions.updateCustomer(customerId, { tags });
          }
        }
      }
      return { success: true, detail: `Tag aggiunto: ${resolved.tag}` };
    }

    case 'remove_tag': {
      const customerId = context.cliente?.id;
      if (customerId && crmActions.updateCustomer) {
        const customer = crmActions.getCustomer?.(customerId);
        if (customer) {
          const tags = (customer.tags || []).filter(t => t !== resolved.tag);
          crmActions.updateCustomer(customerId, { tags });
        }
      }
      return { success: true, detail: `Tag rimosso: ${resolved.tag}` };
    }

    case 'create_task': {
      const customerId = resolved.customerId || context.cliente?.id;
      if (customerId && crmActions.updateCustomer) {
        const customer = crmActions.getCustomer?.(customerId);
        if (customer) {
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
            createdByWorkflow: true
          };
          const todo = [...(customer.todo || []), newTask];
          crmActions.updateCustomer(customerId, { todo });
        }
      }
      return { success: true, detail: `Task creato: ${resolved.title}` };
    }

    case 'create_subtask': {
      const customerId = resolved.customerId || context.cliente?.id;
      const parentTaskId = resolved.parentTaskId || context.task?.id;
      if (customerId && parentTaskId && crmActions.updateCustomer) {
        const customer = crmActions.getCustomer?.(customerId);
        if (customer) {
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
            createdByWorkflow: true
          };
          const todo = addSubtaskToParent(customer.todo || [], parentTaskId, newSubtask, parseInt(resolved.level) || 1);
          crmActions.updateCustomer(customerId, { todo });
        }
      }
      return { success: true, detail: `Sotto-task creato: ${resolved.title}` };
    }

    case 'complete_task': {
      const customerId = resolved.customerId || context.cliente?.id;
      const taskName = resolved.taskName;
      if (customerId && crmActions.updateCustomer) {
        const customer = crmActions.getCustomer?.(customerId);
        if (customer) {
          const todo = markTaskByName(customer.todo || [], taskName, resolved.markAs !== 'da_fare');
          crmActions.updateCustomer(customerId, { todo });
        }
      }
      return { success: true, detail: `Task "${taskName}" -> ${resolved.markAs === 'da_fare' ? 'da fare' : 'completato'}` };
    }

    case 'update_task': {
      const customerId = resolved.customerId || context.cliente?.id;
      const taskId = resolved.taskId || context.task?.id;
      if (customerId && taskId && crmActions.updateCustomer) {
        const customer = crmActions.getCustomer?.(customerId);
        if (customer) {
          const updates = {};
          if (resolved.title) updates.text = resolved.title;
          if (resolved.priority) updates.priority = resolved.priority;
          if (resolved.dueDate) updates.dueDate = resolved.dueDate;
          const todo = updateTaskById(customer.todo || [], taskId, updates);
          crmActions.updateCustomer(customerId, { todo });
        }
      }
      return { success: true, detail: `Task aggiornato` };
    }

    case 'create_note': {
      const customerId = resolved.customerId || context.cliente?.id;
      if (customerId && crmActions.updateCustomer) {
        const customer = crmActions.getCustomer?.(customerId);
        if (customer) {
          const newNote = {
            id: generateId(),
            text: resolved.text || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdByWorkflow: true
          };
          const notes = [...(customer.notes || []), newNote];
          crmActions.updateCustomer(customerId, { notes });
        }
      }
      return { success: true, detail: `Nota creata su cliente` };
    }

    case 'append_note': {
      const customerId = resolved.customerId || context.cliente?.id;
      const noteId = resolved.noteId;
      if (customerId && noteId && crmActions.updateCustomer) {
        const customer = crmActions.getCustomer?.(customerId);
        if (customer) {
          const notes = (customer.notes || []).map(n => {
            if (n.id === noteId) {
              return { ...n, text: n.text + '\n' + (resolved.text || ''), updatedAt: new Date().toISOString() };
            }
            return n;
          });
          crmActions.updateCustomer(customerId, { notes });
        }
      }
      return { success: true, detail: `Testo aggiunto a nota` };
    }

    case 'create_backup': {
      if (crmActions.triggerBackup) {
        crmActions.triggerBackup();
      }
      return { success: true, detail: 'Backup avviato' };
    }

    case 'export_backup': {
      if (crmActions.exportBackup) {
        crmActions.exportBackup();
      }
      return { success: true, detail: 'Esportazione backup avviata' };
    }

    default:
      return { success: false, detail: `Azione sconosciuta: ${actionType}` };
  }
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
    if (t.text === name) {
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

// ─── Runner principale ───
export async function runWorkflow(workflow, triggerEvent, crmActions) {
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
    // Costruisci il contesto dalle variabili dell'evento
    const context = buildContext(triggerEvent);

    // Verifica condizioni di esecuzione
    if (workflow.executionConditions) {
      const { requireLogin, requireUnlocked } = workflow.executionConditions;
      if (requireLogin && !context.app?.isLoggedIn) {
        log.status = 'skipped';
        log.error = 'App non loggata';
        log.completedAt = new Date().toISOString();
        return log;
      }
      if (requireUnlocked && !context.app?.isUnlocked) {
        log.status = 'skipped';
        log.error = 'App bloccata';
        log.completedAt = new Date().toISOString();
        return log;
      }
    }

    // Percorri il grafo: trova il nodo trigger
    const nodes = workflow.nodes || [];
    const edges = workflow.edges || [];
    const triggerNode = nodes.find(n => n.type === 'triggerNode');
    if (!triggerNode) {
      throw new Error('Nessun trigger trovato nel workflow');
    }

    // Esecuzione in sequenza seguendo le connessioni
    let currentNodeId = triggerNode.id;
    const visited = new Set();

    while (currentNodeId && !visited.has(currentNodeId)) {
      visited.add(currentNodeId);
      const node = nodes.find(n => n.id === currentNodeId);
      if (!node) break;

      const stepLog = { nodeId: node.id, nodeType: node.type, label: node.data?.label || '', timestamp: new Date().toISOString() };

      if (node.type === 'conditionNode') {
        const conditions = node.data?.conditions || [];
        const logic = node.data?.logic || 'AND';
        const passed = evaluateConditionGroup(conditions, logic, context);
        stepLog.result = passed ? 'passed' : 'failed';
        log.steps.push(stepLog);

        if (!passed) {
          log.status = 'completed';
          log.completedAt = new Date().toISOString();
          return log;
        }
      } else if (node.type === 'actionNode') {
        const result = executeAction(
          { actionType: node.data?.actionType, config: node.data?.config || {} },
          context,
          crmActions
        );
        stepLog.result = result;
        log.steps.push(stepLog);
        if (!result.success) {
          throw new Error(result.detail);
        }
      } else if (node.type === 'ifElseNode') {
        const conditions = node.data?.conditions || [];
        const logic = node.data?.logic || 'AND';
        const passed = evaluateConditionGroup(conditions, logic, context);
        stepLog.result = passed ? 'if_branch' : 'else_branch';
        log.steps.push(stepLog);

        // Trova il ramo corretto
        const branchEdge = edges.find(e =>
          e.source === node.id && e.sourceHandle === (passed ? 'if' : 'else')
        );
        currentNodeId = branchEdge?.target || null;
        continue;
      } else if (node.type === 'delayNode') {
        const delayMs = (node.data?.delayValue || 0) * (node.data?.delayUnit === 'minuti' ? 60000 : 1000);
        if (delayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, Math.min(delayMs, 300000)));
        }
        stepLog.result = `Atteso ${node.data?.delayValue} ${node.data?.delayUnit}`;
        log.steps.push(stepLog);
      } else if (node.type === 'endNode') {
        stepLog.result = 'Workflow terminato';
        log.steps.push(stepLog);
        break;
      } else if (node.type === 'chainNode') {
        stepLog.result = `Chain a workflow: ${node.data?.targetWorkflowId}`;
        log.steps.push(stepLog);
        // Il chain verrà gestito dal chiamante
      } else {
        log.steps.push(stepLog);
      }

      // Trova il prossimo nodo
      const nextEdge = edges.find(e => e.source === currentNodeId);
      currentNodeId = nextEdge?.target || null;
    }

    log.status = 'completed';
    log.completedAt = new Date().toISOString();
  } catch (err) {
    log.status = 'error';
    log.error = err.message;
    log.completedAt = new Date().toISOString();
  }

  return log;
}

// ─── Costruzione contesto ───
function buildContext(event) {
  return {
    cliente: event.customer || event.cliente || null,
    task: event.task || null,
    nota: event.note || event.nota || null,
    pagamento: event.payment || event.pagamento || null,
    tag: event.tag || null,
    data_corrente: new Date().toISOString().split('T')[0],
    ora_corrente: new Date().toLocaleTimeString('it-IT'),
    app: event.app || { isLoggedIn: true, isUnlocked: true },
    evento: event,
  };
}

// ─── Validazione workflow ───
export function validateWorkflow(workflow, crmData) {
  const errors = [];
  const warnings = [];
  const nodes = workflow.nodes || [];
  const edges = workflow.edges || [];

  // Deve avere almeno un trigger
  const triggers = nodes.filter(n => n.type === 'triggerNode');
  if (triggers.length === 0) {
    errors.push({ nodeId: null, message: 'Il workflow non ha un trigger' });
  }
  if (triggers.length > 1) {
    errors.push({ nodeId: null, message: 'Il workflow ha troppi trigger (max 1)' });
  }

  // Verifica nodi orfani
  nodes.forEach(node => {
    if (node.type === 'triggerNode') return;
    const hasIncoming = edges.some(e => e.target === node.id);
    if (!hasIncoming) {
      warnings.push({ nodeId: node.id, message: `Blocco "${node.data?.label}" non collegato` });
    }
  });

  // Verifica configurazione azioni
  nodes.filter(n => n.type === 'actionNode').forEach(node => {
    if (!node.data?.actionType) {
      errors.push({ nodeId: node.id, message: `Blocco azione senza tipo configurato` });
    }
  });

  // Verifica riferimenti a tag esistenti
  nodes.forEach(node => {
    const config = node.data?.config || {};
    if (config.tag) {
      const allTags = crmData?.tags || [];
      if (allTags.length > 0 && !allTags.includes(config.tag)) {
        warnings.push({ nodeId: node.id, message: `Tag "${config.tag}" non trovato nel CRM` });
      }
    }
  });

  // Verifica condizioni
  nodes.filter(n => n.type === 'conditionNode' || n.type === 'ifElseNode').forEach(node => {
    const conditions = node.data?.conditions || [];
    if (conditions.length === 0) {
      warnings.push({ nodeId: node.id, message: `Blocco condizione senza regole configurate` });
    }
  });

  const status = errors.length > 0 ? 'broken' : warnings.length > 0 ? 'warning' : 'active';
  return { errors, warnings, status };
}
