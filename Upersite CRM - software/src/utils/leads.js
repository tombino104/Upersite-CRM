// Upersite CRM — Pipeline commerciale dei Prospect + Archivio clienti
// Un lead è un cliente con stato "prospect": i campi della trattativa stanno sul cliente.
//   leadStage, leadSource, leadValue, leadProbability, nextAction, nextActionDate,
//   lostReason, leadUpdatedAt, wonAt
// Archivio: archivedAt, archiveKind ('lost' | 'closed' | 'other'), archiveReason

export const LEAD_STAGES = [
  { id: 'new', label: 'Nuovo contatto', icon: '🆕', probability: 10, color: 'var(--lead-new)' },
  { id: 'call', label: 'Call fatta', icon: '📞', probability: 30, color: 'var(--lead-call)' },
  { id: 'quote', label: 'Preventivo inviato', icon: '📄', probability: 50, color: 'var(--lead-quote)' },
  { id: 'negotiation', label: 'Trattativa', icon: '🤝', probability: 75, color: 'var(--lead-negotiation)' },
  { id: 'won', label: 'Vinto', icon: '🏆', probability: 100, color: 'var(--lead-won)' },
  { id: 'lost', label: 'Perso', icon: '✖️', probability: 0, color: 'var(--lead-lost)' },
];

export const OPEN_STAGES = LEAD_STAGES.filter(s => s.id !== 'won' && s.id !== 'lost');

export const ARCHIVE_KINDS = [
  { id: 'lost', label: 'Perso' },
  { id: 'closed', label: 'Lavoro concluso' },
  { id: 'other', label: 'Altro' },
];

export const DEFAULT_LEAD_SOURCES = ['Passaparola', 'Sito web', 'Social', 'Google', 'Altro'];
export const DEFAULT_LOST_REASONS = ['Prezzo', 'Tempi', 'Ha scelto un altro', 'Nessuna risposta', 'Altro'];

// Giorni senza movimento dopo cui un prospect viene segnalato come fermo
export const STALE_DAYS = 7;

export const isArchived = c => !!c.archivedAt;

// Un prospect è "in pipeline" se ha stato prospect e non è archiviato
export const isInPipeline = c => c.status === 'prospect' && !c.archivedAt;

export function stageOf(c) {
  return OPEN_STAGES.some(s => s.id === c.leadStage) ? c.leadStage : 'new';
}

export function stageLabel(id) {
  return LEAD_STAGES.find(s => s.id === id)?.label || id;
}

export function archiveKindLabel(id) {
  return ARCHIVE_KINDS.find(k => k.id === id)?.label || 'Archiviato';
}

export function stageProbability(id) {
  return LEAD_STAGES.find(s => s.id === id)?.probability ?? 0;
}

export function weightedValue(c) {
  const p = c.leadProbability === undefined || c.leadProbability === '' ? stageProbability(stageOf(c)) : Number(c.leadProbability);
  return (Number(c.leadValue) || 0) * ((p || 0) / 100);
}

export function isActionOverdue(c, now = new Date()) {
  if (!isInPipeline(c) || !c.nextActionDate) return false;
  const d = new Date(c.nextActionDate);
  d.setHours(23, 59, 59, 999);
  return d < now;
}

export function isStale(c, now = new Date()) {
  // I prospect mai toccati nella pipeline non risultano "fermi"
  if (!isInPipeline(c) || !c.leadUpdatedAt) return false;
  const last = new Date(c.leadUpdatedAt);
  return (now - last) / 86400000 >= STALE_DAYS;
}

// Forma "lead" passata alle automazioni (vedi buildContext nel workflowRunner)
export function customerToLead(c) {
  return {
    id: c.id,
    name: c.name,
    company: c.company || '',
    stage: c.leadStage || '',
    source: c.leadSource || '',
    value: Number(c.leadValue) || 0,
    probability: Number(c.leadProbability) || 0,
    lostReason: c.lostReason || '',
    nextAction: c.nextAction || '',
  };
}

// Nuovo prospect con tutti i campi base di un cliente
export function newProspect(generateId, overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    name: '',
    company: '',
    email: '',
    phone: '',
    status: 'prospect',
    packageType: '',
    addons: [],
    tags: [],
    installments: [],
    credentials: [],
    links: [],
    files: [],
    notes: [],
    todo: [],
    logo: null,
    createdAt: now,
    leadStage: 'new',
    leadSource: '',
    leadValue: 0,
    leadProbability: stageProbability('new'),
    nextAction: '',
    nextActionDate: '',
    lostReason: '',
    leadUpdatedAt: now,
    ...overrides,
  };
}

// Statistiche della pipeline: servono TUTTI i clienti (anche gli archiviati)
export function computeLeadStats(allCustomers = []) {
  const open = allCustomers.filter(isInPipeline);
  const won = allCustomers.filter(c => c.leadStage === 'won');
  const lost = allCustomers.filter(c => c.archiveKind === 'lost' || c.leadStage === 'lost');
  const closed = won.length + lost.length;
  const tracked = allCustomers.filter(c => c.leadStage || c.leadSource);
  const bySource = {};
  tracked.forEach(c => {
    const s = c.leadSource || 'Non indicata';
    bySource[s] = bySource[s] || { total: 0, won: 0 };
    bySource[s].total += 1;
    if (c.leadStage === 'won') bySource[s].won += 1;
  });
  const lostReasons = {};
  lost.forEach(c => {
    const r = c.lostReason || c.archiveReason || 'Non indicato';
    lostReasons[r] = (lostReasons[r] || 0) + 1;
  });
  return {
    total: tracked.length,
    openCount: open.length,
    wonCount: won.length,
    lostCount: lost.length,
    closeRate: closed ? Math.round((won.length / closed) * 100) : null,
    pipelineValue: open.reduce((s, c) => s + (Number(c.leadValue) || 0), 0),
    weightedPipeline: open.reduce((s, c) => s + weightedValue(c), 0),
    wonValue: won.reduce((s, c) => s + (Number(c.leadValue) || 0), 0),
    bySource,
    lostReasons,
  };
}
