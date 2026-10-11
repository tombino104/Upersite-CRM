// Upersite CRM — Workflow Event Bus
// Sistema di sottoscrizione per intercettare eventi CRM e attivare i trigger dei workflow

const listeners = {};

export const WorkflowEventTypes = {
  // Cliente
  CUSTOMER_CREATED: 'customer.created',
  CUSTOMER_UPDATED: 'customer.updated',
  CUSTOMER_DELETED: 'customer.deleted',
  CUSTOMER_STATUS_CHANGED: 'customer.status_changed',

  // Pagamenti
  PAYMENT_REGISTERED: 'payment.registered',
  PAYMENT_UPDATED: 'payment.updated',
  PAYMENT_DUE_SOON: 'payment.due_soon',
  PAYMENT_OVERDUE: 'payment.overdue',

  // Task
  TASK_CREATED: 'task.created',
  TASK_UPDATED: 'task.updated',
  TASK_COMPLETED: 'task.completed',
  TASK_OVERDUE: 'task.overdue',

  // Temporali
  SCHEDULE_DAILY: 'schedule.daily',
  SCHEDULE_WEEKLY: 'schedule.weekly',
  SCHEDULE_MONTHLY: 'schedule.monthly',
  SCHEDULE_DATE: 'schedule.date',
  SCHEDULE_INTERVAL: 'schedule.interval',

  // Sistema
  APP_STARTED: 'system.app_started',
  USER_LOGIN: 'system.user_login',
  BACKUP_COMPLETED: 'system.backup_completed',

  // Note
  NOTE_CREATED: 'note.created',
  NOTE_UPDATED: 'note.updated',
  NOTE_CREATED_ON_CUSTOMER: 'note.created_on_customer',
  NOTE_UPDATED_ON_CUSTOMER: 'note.updated_on_customer',

  // Tag
  TAG_ADDED: 'tag.added',
  TAG_REMOVED: 'tag.removed',
};

// Mappatura nome leggibile per l'UI
export const EventLabels = {
  [WorkflowEventTypes.CUSTOMER_CREATED]: 'Cliente creato',
  [WorkflowEventTypes.CUSTOMER_UPDATED]: 'Cliente aggiornato',
  [WorkflowEventTypes.CUSTOMER_DELETED]: 'Cliente eliminato / archiviato',
  [WorkflowEventTypes.CUSTOMER_STATUS_CHANGED]: 'Stato cliente modificato',
  [WorkflowEventTypes.PAYMENT_REGISTERED]: 'Pagamento registrato',
  [WorkflowEventTypes.PAYMENT_UPDATED]: 'Pagamento aggiornato',
  [WorkflowEventTypes.PAYMENT_DUE_SOON]: 'Pagamento in scadenza',
  [WorkflowEventTypes.PAYMENT_OVERDUE]: 'Pagamento scaduto',
  [WorkflowEventTypes.TASK_CREATED]: 'Task creato',
  [WorkflowEventTypes.TASK_UPDATED]: 'Task aggiornato',
  [WorkflowEventTypes.TASK_COMPLETED]: 'Task completato',
  [WorkflowEventTypes.TASK_OVERDUE]: 'Task scaduto',
  [WorkflowEventTypes.SCHEDULE_DAILY]: 'Ogni giorno',
  [WorkflowEventTypes.SCHEDULE_WEEKLY]: 'Ogni settimana',
  [WorkflowEventTypes.SCHEDULE_MONTHLY]: 'Ogni mese',
  [WorkflowEventTypes.SCHEDULE_DATE]: 'Data specifica',
  [WorkflowEventTypes.SCHEDULE_INTERVAL]: 'A intervallo fisso (ogni N minuti/ore)',
  [WorkflowEventTypes.APP_STARTED]: 'Avvio applicazione',
  [WorkflowEventTypes.USER_LOGIN]: 'Login utente',
  [WorkflowEventTypes.BACKUP_COMPLETED]: 'Backup completato',
  [WorkflowEventTypes.NOTE_CREATED]: 'Nota creata',
  [WorkflowEventTypes.NOTE_UPDATED]: 'Nota modificata',
  [WorkflowEventTypes.NOTE_CREATED_ON_CUSTOMER]: 'Nota creata su cliente',
  [WorkflowEventTypes.NOTE_UPDATED_ON_CUSTOMER]: 'Nota modificata su cliente',
  [WorkflowEventTypes.TAG_ADDED]: 'Tag aggiunto',
  [WorkflowEventTypes.TAG_REMOVED]: 'Tag rimosso',
};

// Categorie per la sidebar dell'editor
export const EventCategories = {
  'Cliente': [
    WorkflowEventTypes.CUSTOMER_CREATED,
    WorkflowEventTypes.CUSTOMER_UPDATED,
    WorkflowEventTypes.CUSTOMER_DELETED,
    WorkflowEventTypes.CUSTOMER_STATUS_CHANGED,
  ],
  'Pagamenti': [
    WorkflowEventTypes.PAYMENT_REGISTERED,
    WorkflowEventTypes.PAYMENT_UPDATED,
    WorkflowEventTypes.PAYMENT_DUE_SOON,
    WorkflowEventTypes.PAYMENT_OVERDUE,
  ],
  'Task': [
    WorkflowEventTypes.TASK_CREATED,
    WorkflowEventTypes.TASK_UPDATED,
    WorkflowEventTypes.TASK_COMPLETED,
    WorkflowEventTypes.TASK_OVERDUE,
  ],
  'Temporali': [
    WorkflowEventTypes.SCHEDULE_DAILY,
    WorkflowEventTypes.SCHEDULE_WEEKLY,
    WorkflowEventTypes.SCHEDULE_MONTHLY,
    WorkflowEventTypes.SCHEDULE_DATE,
    WorkflowEventTypes.SCHEDULE_INTERVAL,
  ],
  'Sistema': [
    WorkflowEventTypes.APP_STARTED,
    WorkflowEventTypes.USER_LOGIN,
    WorkflowEventTypes.BACKUP_COMPLETED,
  ],
  'Note': [
    WorkflowEventTypes.NOTE_CREATED,
    WorkflowEventTypes.NOTE_UPDATED,
    WorkflowEventTypes.NOTE_CREATED_ON_CUSTOMER,
    WorkflowEventTypes.NOTE_UPDATED_ON_CUSTOMER,
  ],
  'Tag': [
    WorkflowEventTypes.TAG_ADDED,
    WorkflowEventTypes.TAG_REMOVED,
  ],
};

export function subscribe(eventType, callback) {
  if (!listeners[eventType]) {
    listeners[eventType] = [];
  }
  listeners[eventType].push(callback);
  return () => {
    listeners[eventType] = listeners[eventType].filter(cb => cb !== callback);
  };
}

export function emit(eventType, payload = {}) {
  const callbacks = listeners[eventType] || [];
  callbacks.forEach(cb => {
    try {
      cb({ type: eventType, timestamp: new Date().toISOString(), ...payload });
    } catch (err) {
      console.error(`[WorkflowEventBus] Error in handler for ${eventType}:`, err);
    }
  });
}

export function clearAll() {
  Object.keys(listeners).forEach(key => delete listeners[key]);
}
