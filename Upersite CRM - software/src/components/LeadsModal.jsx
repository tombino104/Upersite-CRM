import { useState, useMemo, useRef } from 'react';
import { generateId } from '../utils/storage';
import {
  OPEN_STAGES, DEFAULT_LEAD_SOURCES, DEFAULT_LOST_REASONS,
  stageOf, stageLabel, stageProbability, isInPipeline, weightedValue,
  isActionOverdue, isStale, newProspect, computeLeadStats,
} from '../utils/leads';

const eur = n => '€ ' + (Number(n) || 0).toLocaleString('it-IT', { maximumFractionDigits: 0 });
const fmtDate = d => (d ? new Date(d).toLocaleDateString('it-IT') : '');

const css = `
.lead-board { display: flex; gap: 12px; overflow-x: auto; padding: 4px 2px 12px; align-items: stretch; flex: 1 1 auto; min-height: 0; }
.lead-col { flex: 1 0 240px; background: var(--bg-input); border-radius: 14px; padding: 10px; min-height: 160px; overflow-y: auto; transition: background .2s; }
.lead-col.end { min-height: 90px; }
.lead-card.closed { cursor: pointer; }
.lead-card.closed .lead-card-name { display: flex; justify-content: space-between; gap: 6px; }
.lead-col.over { background: var(--bg-hover); outline: 2px dashed var(--border); }
.lead-col-head { display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: .8rem; color: var(--text-primary); margin-bottom: 2px; }
.lead-col-sub { font-size: .7rem; color: var(--text-tertiary); margin-bottom: 8px; }
.lead-dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.lead-card { background: var(--bg-card); border: 1px solid var(--border-light); border-radius: 10px; padding: 10px; margin-bottom: 8px; cursor: pointer; }
.lead-card:hover { border-color: var(--border); }
.lead-card.dragging { opacity: .5; }
.lead-card-name { font-weight: 600; font-size: .85rem; color: var(--text-primary); }
.lead-card-meta { font-size: .72rem; color: var(--text-secondary); margin-top: 3px; }
.lead-flag { display: inline-block; font-size: .65rem; padding: 2px 7px; border-radius: 20px; margin-top: 6px; margin-right: 4px; }
.lead-flag.warn { background: var(--warning-bg); color: var(--warning); }
.lead-flag.bad { background: var(--danger-bg); color: var(--danger); }
.lead-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; flex: 1; min-width: 0; }
.lead-field label { font-size: .72rem; font-weight: 600; color: var(--text-secondary); }
.lead-row { display: flex; gap: 10px; }
.lead-table { width: 100%; border-collapse: collapse; font-size: .82rem; }
.lead-table th { text-align: left; font-size: .7rem; color: var(--text-tertiary); padding: 6px 8px; border-bottom: 1px solid var(--border-light); }
.lead-table td { padding: 8px; border-bottom: 1px solid var(--border-light); color: var(--text-primary); }
.lead-table tr.clickable { cursor: pointer; }
.lead-table tr.clickable:hover td { background: var(--bg-hover); }
.lead-kpi { background: var(--bg-input); border-radius: 12px; padding: 8px 14px; }
.lead-kpi b { display: block; font-size: 1.05rem; color: var(--text-primary); }
.lead-kpi span { font-size: .7rem; color: var(--text-tertiary); }
`;

function Field({ label, children, style }) {
  return (
    <div className="lead-field" style={style}>
      <label>{label}</label>
      {children}
    </div>
  );
}

function ProspectForm({ initial, isNew, sources, onSave, onCancel, onOpenFull }) {
  const [f, setF] = useState(initial);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const changeStage = id => setF(p => ({ ...p, leadStage: id, leadProbability: stageProbability(id) }));
  return (
    <div>
      <div className="lead-row">
        <Field label="Nome *"><input className="input" value={f.name} onChange={e => set('name', e.target.value)} placeholder="Mario Rossi" autoFocus /></Field>
        <Field label="Attività / azienda"><input className="input" value={f.company || ''} onChange={e => set('company', e.target.value)} /></Field>
      </div>
      <div className="lead-row">
        <Field label="Email"><input className="input" type="email" value={f.email || ''} onChange={e => set('email', e.target.value)} /></Field>
        <Field label="Telefono"><input className="input" value={f.phone || ''} onChange={e => set('phone', e.target.value)} /></Field>
      </div>
      <div className="lead-row">
        <Field label="Fonte">
          <select className="input" value={f.leadSource || ''} onChange={e => set('leadSource', e.target.value)}>
            <option value="">—</option>
            {sources.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Fase">
          <select className="input" value={stageOf(f)} onChange={e => changeStage(e.target.value)}>
            {OPEN_STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>
      </div>
      <div className="lead-row">
        <Field label="Valore stimato (€)"><input className="input" type="number" min="0" value={f.leadValue ?? 0} onChange={e => set('leadValue', e.target.value)} /></Field>
        <Field label="Probabilità di chiusura (%)"><input className="input" type="number" min="0" max="100" value={f.leadProbability ?? 0} onChange={e => set('leadProbability', e.target.value)} /></Field>
      </div>
      <div className="lead-row">
        <Field label="Prossima azione"><input className="input" value={f.nextAction || ''} onChange={e => set('nextAction', e.target.value)} placeholder="Es. richiamare per il preventivo" /></Field>
        <Field label="Entro il"><input className="input" type="date" value={f.nextActionDate || ''} onChange={e => set('nextActionDate', e.target.value)} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 6 }}>
        <div>{!isNew && <button className="btn btn-secondary btn-sm" onClick={() => onOpenFull(f)}>Apri scheda completa</button>}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onCancel}>Annulla</button>
          <button className="btn btn-primary" disabled={!f.name.trim()} onClick={() => onSave(f)}>Salva</button>
        </div>
      </div>
    </div>
  );
}

export default function LeadsModal({
  customers, allCustomers, settings, updateSettings,
  onAddCustomer, onUpdateCustomer, onOpenCustomer, onOpenArchive, onClose,
}) {
  const [view, setView] = useState('board');
  const [editing, setEditing] = useState(null);     // { prospect, isNew }
  const [dialog, setDialog] = useState(null);       // { type: 'won' | 'lost', customer }
  const [lostReason, setLostReason] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [draggedId, setDraggedId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const dragCounter = useRef({});

  const sources = settings.leadSources?.length ? settings.leadSources : DEFAULT_LEAD_SOURCES;
  const lostReasons = settings.leadLostReasons?.length ? settings.leadLostReasons : DEFAULT_LOST_REASONS;

  const prospects = useMemo(() => customers.filter(isInPipeline), [customers]);
  const stats = useMemo(() => computeLeadStats(allCustomers), [allCustomers]);
  const byRecent = (a, b) => (b.leadUpdatedAt || b.wonAt || b.archivedAt || '').localeCompare(a.leadUpdatedAt || a.wonAt || a.archivedAt || '');
  const wonList = useMemo(() => allCustomers.filter(c => c.leadStage === 'won').sort(byRecent), [allCustomers]);
  const lostList = useMemo(() => allCustomers.filter(c => c.archiveKind === 'lost' || c.leadStage === 'lost').sort(byRecent), [allCustomers]);
  const toFollow = useMemo(() => prospects.filter(c => isActionOverdue(c) || isStale(c)).length, [prospects]);

  const touch = () => ({ leadUpdatedAt: new Date().toISOString() });

  const moveTo = (customer, stage) => {
    if (!customer || stageOf(customer) === stage && customer.leadStage) return;
    if (stage === 'won') { setDialog({ type: 'won', customer }); return; }
    if (stage === 'lost') { setLostReason(''); setDialog({ type: 'lost', customer }); return; }
    onUpdateCustomer(customer.id, { leadStage: stage, leadProbability: stageProbability(stage), ...touch() });
  };

  const confirmWon = () => {
    const { customer } = dialog;
    onUpdateCustomer(customer.id, {
      leadStage: 'won', leadProbability: 100, status: 'working', wonAt: new Date().toISOString(), ...touch(),
    });
    setDialog(null);
  };

  const confirmLost = () => {
    const { customer } = dialog;
    onUpdateCustomer(customer.id, {
      leadStage: 'lost', leadProbability: 0, lostReason,
      archivedAt: new Date().toISOString(), archiveKind: 'lost', archiveReason: lostReason, ...touch(),
    });
    setDialog(null);
  };

  const saveForm = f => {
    const data = { ...f, leadValue: Number(f.leadValue) || 0, leadProbability: Number(f.leadProbability) || 0 };
    if (editing.isNew) {
      onAddCustomer(data);
    } else {
      onUpdateCustomer(f.id, {
        name: data.name, company: data.company, email: data.email, phone: data.phone,
        leadSource: data.leadSource, leadStage: stageOf(data), leadValue: data.leadValue,
        leadProbability: data.leadProbability, nextAction: data.nextAction, nextActionDate: data.nextActionDate,
        ...touch(),
      });
    }
    setEditing(null);
  };

  const saveList = (key, text) => {
    updateSettings({ [key]: text.split(',').map(s => s.trim()).filter(Boolean) });
  };

  const dropOn = (e, stage) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || draggedId;
    setOverCol(null); dragCounter.current = {}; setDraggedId(null);
    moveTo(prospects.find(c => c.id === id), stage);
  };

  const dropProps = stage => ({
    onDragOver: e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; },
    onDragEnter: e => { e.preventDefault(); dragCounter.current[stage] = (dragCounter.current[stage] || 0) + 1; setOverCol(stage); },
    onDragLeave: () => {
      dragCounter.current[stage] = (dragCounter.current[stage] || 0) - 1;
      if (dragCounter.current[stage] <= 0) { dragCounter.current[stage] = 0; setOverCol(c => (c === stage ? null : c)); }
    },
    onDrop: e => dropOn(e, stage),
  });

  const renderClosedCard = (c, kind) => (
    <div key={c.id} className="lead-card closed" onClick={() => onOpenCustomer(c)} title="Apri la scheda del cliente">
      <div className="lead-card-name"><span>{c.name}</span></div>
      {c.company && <div className="lead-card-meta">{c.company}</div>}
      <div className="lead-card-meta">
        {eur(c.leadValue)} · {kind === 'won' ? `vinto il ${fmtDate(c.wonAt || c.leadUpdatedAt)}` : `perso il ${fmtDate(c.archivedAt || c.leadUpdatedAt)}`}
      </div>
      {kind === 'lost' && (c.lostReason || c.archiveReason) && <div className="lead-card-meta">Motivo: {c.lostReason || c.archiveReason}</div>}
    </div>
  );

  // Funzione (non componente): altrimenti il drag si interrompe al primo re-render
  const renderCard = (c) => {
    const overdue = isActionOverdue(c);
    const stale = isStale(c);
    return (
      <div
        key={c.id}
        className={`lead-card ${draggedId === c.id ? 'dragging' : ''}`}
        draggable
        onDragStart={e => { setDraggedId(c.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.id); }}
        onDragEnd={() => { setDraggedId(null); setOverCol(null); dragCounter.current = {}; }}
        onClick={() => setEditing({ prospect: c, isNew: false })}
      >
        <div className="lead-card-name">{c.name}</div>
        {c.company && <div className="lead-card-meta">{c.company}</div>}
        <div className="lead-card-meta">{eur(c.leadValue)} · {c.leadProbability ?? stageProbability(stageOf(c))}% → {eur(weightedValue(c))}</div>
        {c.nextAction && (
          <div className="lead-card-meta">➜ {c.nextAction}{c.nextActionDate ? ` (${fmtDate(c.nextActionDate)})` : ''}</div>
        )}
        {overdue && <span className="lead-flag bad">Azione scaduta</span>}
        {!overdue && stale && <span className="lead-flag warn">Fermo da giorni</span>}
      </div>
    );
  };

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <style>{css}</style>
      <div className="modal-content animate-scale-in" style={{ maxWidth: 'none', width: '98vw', height: '94vh', maxHeight: '94vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 24 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>🧲 Pipeline prospect</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className={`btn btn-sm ${view === 'board' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView('board')}>Fasi</button>
            <button className={`btn btn-sm ${view === 'list' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView('list')}>Elenco</button>
          </div>
          <div style={{ flex: 1 }} />
          <button className="btn btn-secondary btn-sm" onClick={() => setShowSettings(s => !s)}>⚙️ Fonti e motivi</button>
          <button className="btn btn-secondary btn-sm" onClick={onOpenArchive}>📦 Archivio</button>
          <button className="btn btn-primary btn-sm" onClick={() => setEditing({ prospect: newProspect(generateId), isNew: true })}>+ Nuovo prospect</button>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <div className="lead-kpi"><b>{prospects.length}</b><span>Prospect in pipeline</span></div>
          <div className="lead-kpi"><b>{eur(stats.pipelineValue)}</b><span>Valore in pipeline</span></div>
          <div className="lead-kpi"><b>{eur(stats.weightedPipeline)}</b><span>Valore pesato</span></div>
          <div className="lead-kpi"><b style={{ color: toFollow ? 'var(--danger)' : undefined }}>{toFollow}</b><span>Da seguire</span></div>
        </div>

        {showSettings && (
          <div style={{ background: 'var(--bg-input)', borderRadius: 12, padding: 12, marginBottom: 14 }}>
            <div className="lead-row">
              <Field label="Fonti (separate da virgola)">
                <input className="input" defaultValue={sources.join(', ')} onBlur={e => saveList('leadSources', e.target.value)} />
              </Field>
              <Field label="Motivi di perdita (separati da virgola)">
                <input className="input" defaultValue={lostReasons.join(', ')} onBlur={e => saveList('leadLostReasons', e.target.value)} />
              </Field>
            </div>
          </div>
        )}

        {view === 'board' ? (
          <div className="lead-board">
            {OPEN_STAGES.map(col => {
              const items = prospects.filter(c => stageOf(c) === col.id);
              const total = items.reduce((s, c) => s + (Number(c.leadValue) || 0), 0);
              return (
                <div key={col.id} className={`lead-col ${overCol === col.id ? 'over' : ''}`} {...dropProps(col.id)}>
                  <div className="lead-col-head">
                    <span className="lead-dot" style={{ background: col.color }} />
                    <span>{col.icon} {col.label}</span>
                    <span style={{ marginLeft: 'auto', color: 'var(--text-tertiary)' }}>{items.length}</span>
                  </div>
                  <div className="lead-col-sub">{eur(total)}</div>
                  {items.length === 0 && <div style={{ fontSize: '.72rem', color: 'var(--text-tertiary)', textAlign: 'center', padding: 14 }}>{draggedId ? 'Rilascia qui' : 'Nessun prospect'}</div>}
                  {items.map(renderCard)}
                </div>
              );
            })}
            <div className={`lead-col end ${overCol === 'won' ? 'over' : ''}`} {...dropProps('won')}>
              <div className="lead-col-head"><span className="lead-dot" style={{ background: 'var(--lead-won)' }} />🏆 Vinto<span style={{ marginLeft: 'auto', color: 'var(--text-tertiary)' }}>{stats.wonCount}</span></div>
              <div className="lead-col-sub">Diventa cliente</div>
              {wonList.length === 0 && <div style={{ fontSize: '.72rem', color: 'var(--text-tertiary)', textAlign: 'center', padding: 14 }}>{draggedId ? 'Rilascia qui' : 'Nessun prospect'}</div>}
              {wonList.map(c => renderClosedCard(c, 'won'))}
            </div>
            <div className={`lead-col end ${overCol === 'lost' ? 'over' : ''}`} {...dropProps('lost')}>
              <div className="lead-col-head"><span className="lead-dot" style={{ background: 'var(--lead-lost)' }} />✖️ Perso<span style={{ marginLeft: 'auto', color: 'var(--text-tertiary)' }}>{stats.lostCount}</span></div>
              <div className="lead-col-sub">Va in archivio</div>
              {lostList.length === 0 && <div style={{ fontSize: '.72rem', color: 'var(--text-tertiary)', textAlign: 'center', padding: 14 }}>{draggedId ? 'Rilascia qui' : 'Nessun prospect'}</div>}
              {lostList.map(c => renderClosedCard(c, 'lost'))}
            </div>
          </div>
        ) : (
          <div style={{ flex: '1 1 auto', minHeight: 0, overflow: 'auto' }}>
          <table className="lead-table">
            <thead>
              <tr><th>Nome</th><th>Fase</th><th>Fonte</th><th>Valore</th><th>Prob.</th><th>Prossima azione</th></tr>
            </thead>
            <tbody>
              {[...prospects].sort((a, b) => (b.leadUpdatedAt || '').localeCompare(a.leadUpdatedAt || '')).map(c => (
                <tr key={c.id} className="clickable" onClick={() => setEditing({ prospect: c, isNew: false })}>
                  <td><b>{c.name}</b>{c.company ? <div style={{ fontSize: '.72rem', color: 'var(--text-secondary)' }}>{c.company}</div> : null}</td>
                  <td>{stageLabel(stageOf(c))}</td>
                  <td>{c.leadSource || '—'}</td>
                  <td>{eur(c.leadValue)}</td>
                  <td>{c.leadProbability ?? stageProbability(stageOf(c))}%</td>
                  <td style={{ color: isActionOverdue(c) ? 'var(--danger)' : undefined }}>
                    {c.nextAction || '—'}{c.nextActionDate ? ` (${fmtDate(c.nextActionDate)})` : ''}
                  </td>
                </tr>
              ))}
              {prospects.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 24 }}>Nessun prospect in pipeline. Aggiungi il primo con “+ Nuovo prospect”.</td></tr>}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {editing && (
        <div className="modal-overlay animate-fade-in" style={{ zIndex: 2100 }} onClick={e => { e.stopPropagation(); setEditing(null); }}>
          <div className="modal-content animate-scale-in" style={{ maxWidth: 560, width: '94vw', maxHeight: '90vh', overflow: 'auto', padding: 24 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 14px' }}>{editing.isNew ? 'Nuovo prospect' : 'Modifica prospect'}</h3>
            <ProspectForm
              initial={editing.prospect}
              isNew={editing.isNew}
              sources={sources}
              onSave={saveForm}
              onCancel={() => setEditing(null)}
              onOpenFull={f => { setEditing(null); onOpenCustomer(customers.find(c => c.id === f.id) || f); }}
            />
          </div>
        </div>
      )}

      {dialog && (
        <div className="modal-overlay animate-fade-in" style={{ zIndex: 2200 }} onClick={e => { e.stopPropagation(); setDialog(null); }}>
          <div className="modal-content animate-scale-in" style={{ maxWidth: 420, padding: 28 }} onClick={e => e.stopPropagation()}>
            {dialog.type === 'won' ? (
              <>
                <h3 style={{ margin: '0 0 8px' }}>🏆 Prospect vinto</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '.88rem', lineHeight: 1.5 }}>
                  <b>{dialog.customer.name}</b> passa da Prospect a <b>In lavorazione</b>. Resta la stessa scheda cliente, con tutto quello che hai già inserito.
                </p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                  <button className="btn btn-secondary" onClick={() => setDialog(null)}>Annulla</button>
                  <button className="btn btn-primary" onClick={confirmWon}>Conferma</button>
                </div>
              </>
            ) : (
              <>
                <h3 style={{ margin: '0 0 8px' }}>Prospect perso</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '.85rem', lineHeight: 1.5, margin: '0 0 10px' }}>
                  <b>{dialog.customer.name}</b> viene archiviato con il motivo. Lo ritrovi in 📦 Archivio e puoi ripristinarlo.
                </p>
                <Field label="Motivo della perdita">
                  <select className="input" value={lostReason} onChange={e => setLostReason(e.target.value)} autoFocus>
                    <option value="">Seleziona…</option>
                    {lostReasons.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </Field>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                  <button className="btn btn-secondary" onClick={() => setDialog(null)}>Annulla</button>
                  <button className="btn btn-primary" disabled={!lostReason} onClick={confirmLost}>Archivia</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
