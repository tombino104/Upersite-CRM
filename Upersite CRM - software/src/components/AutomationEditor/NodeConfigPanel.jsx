// Upersite CRM — Pannello Configurazione Nodo v2
// Design System: Inter, #6C5CE7 primary, radii 8/12px, light theme
import React, { useState, useEffect, useMemo } from 'react';
import { X, Trash2, Check } from 'lucide-react';
import { EventLabels, EventCategories } from '../../utils/workflowEvents';

// ─── Stili condivisi ───
const ip = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1.5px solid #E8ECF1',
  fontSize: '0.78rem',
  fontFamily: "'Inter', sans-serif",
  outline: 'none',
  background: '#F4F5F9',
  color: '#2D3436',
  boxSizing: 'border-box',
  transition: 'border 0.15s',
};

const lbl = {
  display: 'block',
  fontSize: '0.68rem',
  fontWeight: 600,
  color: '#636E72',
  marginBottom: 4,
  marginTop: 12,
};

const operators = ['=', '!=', '>', '<', '>=', '<=', 'contiene', 'non_contiene'];
const PRIORITIES = ['Bassa', 'Media', 'Alta'];
const STATUS_OPTIONS = [
  { value: 'prospect',  label: 'Prospect' },
  { value: 'working',   label: 'In Lavorazione' },
  { value: 'completed', label: 'Completato' },
  { value: 'lost',      label: 'Perso' },
];

// Suggerimenti campi per condizioni
const FIELD_SUGGESTIONS = [
  'cliente.stato', 'cliente.nome', 'cliente.email', 'cliente.azienda', 'cliente.tipo_pacchetto',
  'cliente.status', 'cliente.name', 'cliente.company',
  'cliente.tag',
  'task.nome', 'task.stato', 'task.priorita', 'task.scadenza',
  'task.text', 'task.completed', 'task.priority', 'task.dueDate',
  'nota.testo', 'nota.text',
  'app.isLoggedIn', 'app.isUnlocked',
  'tag',
];

// ─── Sub-component: selezione cliente ───
function CustomerSelect({ value, onChange, customers, label = 'Cliente', allowContextual = true }) {
  return (
    <>
      <label style={lbl}>{label}</label>
      <select style={ip} value={value || ''} onChange={e => onChange(e.target.value)}>
        {allowContextual && <option value="">— Cliente dal trigger (automatico) —</option>}
        {!allowContextual && <option value="">Seleziona un cliente...</option>}
        {(customers || []).map(c => (
          <option key={c.id} value={c.id}>
            {c.name}{c.company ? ` — ${c.company}` : ''}
          </option>
        ))}
      </select>
    </>
  );
}

// ─── Sub-component: selezione task ───
function TaskSelect({ customerId, taskId, onTaskChange, customers, label = 'Task padre' }) {
  const tasks = useMemo(() => {
    if (!customerId) return [];
    const c = customers.find(x => x.id === customerId);
    const flatTasks = [];
    const flatten = (items, depth = 0) => {
      (items || []).forEach(t => {
        flatTasks.push({ ...t, _depth: depth });
        if (t.subtasks?.length) flatten(t.subtasks, depth + 1);
      });
    };
    flatten(c?.todo || []);
    return flatTasks;
  }, [customerId, customers]);

  if (!customerId) {
    return (
      <div style={{ marginTop: 12, padding: '8px 10px', background: 'rgba(108,92,231,0.05)', borderRadius: 8, border: '1.5px solid rgba(108,92,231,0.2)', fontSize: '0.7rem', color: '#6C5CE7' }}>
        ℹ️ Utilizzerà il task (o il cliente) proveniente dal trigger. 
        <div style={{ marginTop: 4, opacity: 0.8, fontSize: '0.65rem' }}>Per scegliere un task specifico, seleziona prima un cliente sopra.</div>
      </div>
    );
  }

  return (
    <>
      <label style={lbl}>{label}</label>
      {tasks.length === 0 ? (
        <div style={{ marginTop: 4, padding: '8px 10px', background: '#F8F9FC', borderRadius: 8, border: '1.5px solid #E8ECF1', fontSize: '0.7rem', color: '#B2BEC3' }}>
          Nessun task presente per questo cliente
        </div>
      ) : (
        <select style={ip} value={taskId || ''} onChange={e => onTaskChange(e.target.value)}>
          <option value="">Seleziona task...</option>
          {tasks.map(t => (
            <option key={t.id} value={t.id}>
              {'  '.repeat(t._depth)}{t._depth > 0 ? '↳ ' : ''}{t.text || 'Task senza testo'}
              {t.completed ? ' ✓' : ''}
            </option>
          ))}
        </select>
      )}
    </>
  );
}

// ─── Sub-component: selezione tag ───
function TagSelect({ value, onChange, tags, label = 'Tag' }) {
  const [customMode, setCustomMode] = useState(false);
  return (
    <>
      <label style={lbl}>{label}</label>
      <div style={{ display: 'flex', gap: 6 }}>
        {customMode ? (
          <input style={{ ...ip, flex: 1 }} value={value || ''} onChange={e => onChange(e.target.value)} placeholder="Scrivi tag manualmente..." />
        ) : (
          <select style={{ ...ip, flex: 1 }} value={value || ''} onChange={e => onChange(e.target.value)}>
            <option value="">Seleziona tag...</option>
            {(tags || []).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <button
          onClick={() => setCustomMode(v => !v)}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid #E8ECF1', background: '#F4F5F9', cursor: 'pointer', fontSize: '0.65rem', color: '#636E72', fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap' }}
          title={customMode ? 'Torna alla lista' : 'Scrivi manualmente'}
        >
          {customMode ? '← Lista' : 'Manuale'}
        </button>
      </div>
    </>
  );
}

// ─── Componente principale ───
export default function NodeConfigPanel({ node, onUpdate, onDelete, onClose, workflows, crmData }) {
  const [formData, setFormData] = useState({});
  const [saved, setSaved] = useState(false);

  const customers = crmData?.customers || [];
  const tags = crmData?.tags || [];

  useEffect(() => {
    if (node) { setFormData({ ...(node.data || {}) }); setSaved(false); }
  }, [node?.id]);

  if (!node) return null;

  const set = (key, value) => setFormData(prev => ({ ...prev, [key]: value }));
  const setConf = (key, value) => setFormData(prev => ({ ...prev, config: { ...(prev.config || {}), [key]: value } }));
  const setEvConf = (key, value) => setFormData(prev => ({ ...prev, eventConfig: { ...(prev.eventConfig || {}), [key]: value } }));

  const updCond = (i, field, value) => setFormData(prev => {
    const c = [...(prev.conditions || [])];
    c[i] = { ...c[i], [field]: value };
    return { ...prev, conditions: c };
  });

  const handleSave = () => {
    onUpdate(node.id, formData);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const conf = formData.config || {};

  // ─── Trigger config ───
  const renderTrigger = () => (
    <>
      <label style={lbl}>Evento Trigger</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {Object.entries(EventCategories).map(([cat, evts]) => (
          <div key={cat}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#B2BEC3', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '8px 0 2px' }}>
              {cat}
            </div>
            {evts.map(evt => (
              <label key={evt} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px',
                borderRadius: 8, cursor: 'pointer', fontSize: '0.74rem',
                background: formData.eventType === evt ? 'rgba(108,92,231,0.08)' : 'transparent',
                color: formData.eventType === evt ? '#6C5CE7' : '#636E72',
                fontWeight: formData.eventType === evt ? 600 : 400,
                transition: 'all 0.12s',
              }}>
                <input type="radio" name="eventType" value={evt}
                  checked={formData.eventType === evt}
                  onChange={() => { set('eventType', evt); set('eventLabel', EventLabels[evt]); }}
                  style={{ accentColor: '#6C5CE7', margin: 0 }}
                />
                {EventLabels[evt]}
              </label>
            ))}
          </div>
        ))}
      </div>
      {(formData.eventType === 'payment.due_soon' || formData.eventType === 'payment.overdue') && (
        <><label style={lbl}>Giorni</label><input type="number" min="1" style={ip} value={formData.eventConfig?.days || ''} onChange={e => setEvConf('days', e.target.value)} placeholder="Es: 7" /></>
      )}
      {formData.eventType === 'schedule.daily' && (
        <><label style={lbl}>Ora</label><input type="time" style={ip} value={formData.eventConfig?.time || ''} onChange={e => setEvConf('time', e.target.value)} /></>
      )}
      {formData.eventType === 'schedule.weekly' && (<>
        <label style={lbl}>Giorno della settimana</label>
        <select style={ip} value={formData.eventConfig?.day || ''} onChange={e => setEvConf('day', e.target.value)}>
          <option value="">Seleziona...</option>
          {['Lunedi', 'Martedi', 'Mercoledi', 'Giovedi', 'Venerdi', 'Sabato', 'Domenica'].map(d => <option key={d}>{d}</option>)}
        </select>
        <label style={lbl}>Ora</label><input type="time" style={ip} value={formData.eventConfig?.time || ''} onChange={e => setEvConf('time', e.target.value)} />
      </>)}
      {formData.eventType === 'schedule.monthly' && (<>
        <label style={lbl}>Giorno del mese</label>
        <input type="number" min="1" max="31" style={ip} value={formData.eventConfig?.dayOfMonth || ''} onChange={e => setEvConf('dayOfMonth', e.target.value)} />
        <label style={lbl}>Ora</label><input type="time" style={ip} value={formData.eventConfig?.time || ''} onChange={e => setEvConf('time', e.target.value)} />
      </>)}
      {formData.eventType === 'schedule.date' && (<>
        <label style={lbl}>Data</label>
        <input type="date" style={ip} value={formData.eventConfig?.date || ''} onChange={e => setEvConf('date', e.target.value)} />
        <label style={lbl}>Ora</label><input type="time" style={ip} value={formData.eventConfig?.time || ''} onChange={e => setEvConf('time', e.target.value)} />
      </>)}
    </>
  );

  // ─── Condition / IF-ELSE config ───
  const renderConditions = () => (
    <>
      <label style={lbl}>Logica</label>
      <div style={{ display: 'flex', gap: 6 }}>
        {['AND', 'OR'].map(l => (
          <button key={l} onClick={() => set('logic', l)} style={{
            flex: 1, padding: '7px', borderRadius: 8, border: '1.5px solid',
            borderColor: formData.logic === l ? '#6C5CE7' : '#E8ECF1',
            cursor: 'pointer', fontWeight: 600, fontSize: '0.74rem',
            fontFamily: "'Inter', sans-serif",
            background: formData.logic === l ? 'rgba(108,92,231,0.08)' : '#fff',
            color: formData.logic === l ? '#6C5CE7' : '#636E72',
            transition: 'all 0.15s',
          }}>{l}</button>
        ))}
      </div>

      <label style={{ ...lbl, marginTop: 14 }}>Condizioni</label>
      {(formData.conditions || []).map((cond, i) => (
        <div key={i} style={{ padding: 10, background: '#F8F9FC', borderRadius: 10, border: '1.5px solid #E8ECF1', marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
            <input list="field-suggestions" placeholder="Campo (es: cliente.stato)" style={{ ...ip, flex: 2 }}
              value={cond.field || ''} onChange={e => updCond(i, 'field', e.target.value)} />
            <select style={{ ...ip, flex: 1 }}
              value={cond.operator || '='} onChange={e => updCond(i, 'operator', e.target.value)}>
              {operators.map(op => <option key={op}>{op}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <input placeholder="Valore (es: prospect)" style={{ ...ip, flex: 1 }}
              value={cond.value || ''} onChange={e => updCond(i, 'value', e.target.value)} />
            <button onClick={() => setFormData(prev => ({ ...prev, conditions: prev.conditions.filter((_, j) => j !== i) }))}
              style={{ padding: '4px 8px', border: '1.5px solid rgba(225,112,85,0.25)', background: 'rgba(225,112,85,0.07)', borderRadius: 8, color: '#E17055', cursor: 'pointer' }}>
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}
      <datalist id="field-suggestions">
        {FIELD_SUGGESTIONS.map(f => <option key={f} value={f} />)}
      </datalist>
      <button
        onClick={() => setFormData(prev => ({ ...prev, conditions: [...(prev.conditions || []), { field: '', operator: '=', value: '' }] }))}
        style={{ width: '100%', padding: '7px', border: '2px dashed #E8ECF1', borderRadius: 10, background: 'transparent', cursor: 'pointer', fontSize: '0.74rem', color: '#636E72', fontFamily: "'Inter', sans-serif", marginTop: 2 }}>
        + Aggiungi condizione
      </button>
    </>
  );

  // ─── Sezione clienti riutilizzabile ───
  // Nota: conf.customerId = '' → usa il cliente dal trigger
  const renderCustomerPicker = (label = 'Cliente target', allowContextual = true) => (
    <CustomerSelect
      value={conf.customerId}
      onChange={v => setConf('customerId', v)}
      customers={customers}
      label={label}
      allowContextual={allowContextual}
    />
  );

  // ─── Action config ───
  const renderAction = () => {
    return (<>
      <label style={lbl}>Tipo Azione</label>
      <select style={ip} value={formData.actionType || ''} onChange={e => { set('actionType', e.target.value); setFormData(prev => ({ ...prev, config: {} })); }}>
        <option value="">Seleziona azione...</option>
        <optgroup label="👤 Cliente">
          <option value="move_customer_status">Sposta stato cliente</option>
          <option value="add_tag">Aggiungi tag</option>
          <option value="remove_tag">Rimuovi tag</option>
        </optgroup>
        <optgroup label="✅ Task">
          <option value="create_task">Crea task</option>
          <option value="create_recurring_task">Crea task ricorrente</option>
          <option value="create_subtask">Crea sotto-task</option>
          <option value="update_task">Aggiorna task</option>
          <option value="complete_task">Completa task</option>
        </optgroup>
        <optgroup label="📝 Note">
          <option value="create_note">Crea nota</option>
          <option value="append_note">Aggiungi a nota</option>
        </optgroup>
        <optgroup label="� Sistema">
          <option value="backup">Esegui backup</option>
          <option value="export_data">Esporta dati</option>
          <option value="recurring_action">Azione ricorrente</option>
        </optgroup>
      </select>

      {/* ── Sposta stato cliente ── */}
      {formData.actionType === 'move_customer_status' && (<>
        {renderCustomerPicker('Cliente da spostare')}
        <label style={lbl}>Nuovo stato</label>
        <select style={ip} value={conf.targetStatus || ''} onChange={e => setConf('targetStatus', e.target.value)}>
          <option value="">Seleziona...</option>
          {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </>)}

      {/* ── Aggiungi / Rimuovi tag ── */}
      {(formData.actionType === 'add_tag' || formData.actionType === 'remove_tag') && (<>
        {renderCustomerPicker('Cliente')}
        <TagSelect
          value={conf.tag}
          onChange={v => setConf('tag', v)}
          tags={tags}
          label={formData.actionType === 'add_tag' ? 'Tag da aggiungere' : 'Tag da rimuovere'}
        />
      </>)}

      {/* ── Crea task ricorrente ── */}
      {formData.actionType === 'create_recurring_task' && (<>
        {renderCustomerPicker('Cliente su cui creare il task ricorrente')}
        <label style={lbl}>Titolo task</label>
        <input style={ip} value={conf.title || ''} onChange={e => setConf('title', e.target.value)} placeholder="Es: Report settimanale" />
        <label style={lbl}>Priorità</label>
        <select style={ip} value={conf.priority || 'Media'} onChange={e => setConf('priority', e.target.value)}>
          {PRIORITIES.map(p => <option key={p}>{p}</option>)}
        </select>
        <label style={lbl}>Ricorrenza</label>
        <select style={ip} value={conf.recurrence || 'giornaliera'} onChange={e => setConf('recurrence', e.target.value)}>
          <option value="giornaliera">Giornaliera</option>
          <option value="settimanale">Settimanale</option>
          <option value="mensile">Mensile</option>
          <option value="personalizzata">Personalizzata</option>
        </select>
        {conf.recurrence === 'personalizzata' && (
          <>
            <label style={lbl}>Intervallo (giorni)</label>
            <input type="number" min="1" style={ip} value={conf.customInterval || ''} onChange={e => setConf('customInterval', e.target.value)} placeholder="30" />
          </>
        )}
        <label style={lbl}>Scadenza</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <select style={{ ...ip, flex: 1 }} value={conf.dueDateType || 'nessuna'} onChange={e => setConf('dueDateType', e.target.value)}>
            {['nessuna', 'giorni dopo', 'settimane dopo', 'mesi dopo'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
          {conf.dueDateType && conf.dueDateType !== 'nessuna' && conf.dueDateType !== 'custom' && (
            <input type="number" min="1" style={{ ...ip, flex: 1 }} value={conf.dueDateValue || ''} onChange={e => setConf('dueDateValue', e.target.value)} placeholder="N." />
          )}
          {conf.dueDateType === 'custom' && (
            <input type="date" style={{ ...ip, flex: 1 }} value={conf.dueDateValue || ''} onChange={e => setConf('dueDateValue', e.target.value)} />
          )}
        </div>
        <label style={lbl}>Descrizione (supporta variabili)</label>
        <textarea style={{ ...ip, minHeight: 60, resize: 'vertical' }} value={conf.description || ''} onChange={e => setConf('description', e.target.value)} placeholder="Usa {{cliente.nome}} per variabili dinamiche" />
      </>)}

      {/* ── Azione ricorrente ── */}
      {formData.actionType === 'recurring_action' && (<>
        <label style={lbl}>Tipo azione da ripetere</label>
        <select style={ip} value={conf.recurringActionType || ''} onChange={e => setConf('recurringActionType', e.target.value)}>
          <option value="">Seleziona azione...</option>
          <option value="backup">Backup automatico</option>
          <option value="export_data">Esporta dati</option>
          <option value="create_task">Crea task</option>
          <option value="create_note">Crea nota</option>
        </select>
        <label style={lbl}>Ricorrenza</label>
        <select style={ip} value={conf.recurrence || 'giornaliera'} onChange={e => setConf('recurrence', e.target.value)}>
          <option value="giornaliera">Giornaliera</option>
          <option value="settimanale">Settimanale</option>
          <option value="mensile">Mensile</option>
          <option value="personalizzata">Personalizzata</option>
        </select>
        {conf.recurrence === 'personalizzata' && (
          <>
            <label style={lbl}>Intervallo (minuti)</label>
            <input type="number" min="1" style={ip} value={conf.customInterval || ''} onChange={e => setConf('customInterval', e.target.value)} placeholder="30" />
          </>
        )}
        <label style={lbl}>Parametri aggiuntivi (opzionale)</label>
        <textarea style={{ ...ip, minHeight: 60, resize: 'vertical' }} value={conf.extraParams || ''} onChange={e => setConf('extraParams', e.target.value)} placeholder="Parametri in formato JSON o testo libero" />
      </>)}

      {/* ── Crea task ── */}
      {formData.actionType === 'create_task' && (<>
        {renderCustomerPicker('Cliente su cui creare il task')}
        <label style={lbl}>Titolo task</label>
        <input style={ip} value={conf.title || ''} onChange={e => setConf('title', e.target.value)} placeholder="Es: Chiamata di follow-up" />
        <label style={lbl}>Priorità</label>
        <select style={ip} value={conf.priority || 'Media'} onChange={e => setConf('priority', e.target.value)}>
          {PRIORITIES.map(p => <option key={p}>{p}</option>)}
        </select>
        <label style={lbl}>Scadenza</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <select style={{ ...ip, flex: 1 }} value={conf.dueDateType || 'nessuna'} onChange={e => setConf('dueDateType', e.target.value)}>
            {['nessuna', 'giorni', 'settimane', 'mesi', 'custom'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
          {conf.dueDateType && conf.dueDateType !== 'nessuna' && conf.dueDateType !== 'custom' && (
            <input type="number" min="1" style={{ ...ip, flex: 1 }} value={conf.dueDateValue || ''} onChange={e => setConf('dueDateValue', e.target.value)} placeholder="N." />
          )}
          {conf.dueDateType === 'custom' && (
            <input type="date" style={{ ...ip, flex: 1 }} value={conf.dueDateValue || ''} onChange={e => setConf('dueDateValue', e.target.value)} />
          )}
        </div>
        <label style={lbl}>Descrizione (supporta variabili)</label>
        <textarea style={{ ...ip, minHeight: 60, resize: 'vertical' }} value={conf.description || ''} onChange={e => setConf('description', e.target.value)} placeholder="Usa {{cliente.nome}} per variabili dinamiche" />
      </>)}

      {/* ── Crea sotto-task ── */}
      {formData.actionType === 'create_subtask' && (<>
        {renderCustomerPicker('Cliente')}
        <TaskSelect
          customerId={conf.customerId}
          taskId={conf.parentTaskId}
          onTaskChange={v => setConf('parentTaskId', v)}
          customers={customers}
          label="Task padre (deve esistere)"
        />
        {!conf.parentTaskId && conf.customerId && (
          <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(253,203,110,0.1)', borderRadius: 8, border: '1.5px solid rgba(253,203,110,0.4)', fontSize: '0.68rem', color: '#b7860a' }}>
            ⚠️ Seleziona un task padre prima di configurare il sotto-task
          </div>
        )}
        {conf.parentTaskId && (<>
          <label style={lbl}>Titolo sotto-task</label>
          <input style={ip} value={conf.title || ''} onChange={e => setConf('title', e.target.value)} placeholder="Titolo del sotto-task" />
          <label style={lbl}>Livello (1 = figlio diretto, 2-3 = annidato)</label>
          <select style={ip} value={conf.level || '1'} onChange={e => setConf('level', e.target.value)}>
            {['1', '2', '3'].map(l => <option key={l} value={l}>Livello {l}</option>)}
          </select>
        </>)}
      </>)}

      {/* ── Aggiorna task ── */}
      {formData.actionType === 'update_task' && (<>
        {renderCustomerPicker('Cliente')}
        <TaskSelect
          customerId={conf.customerId}
          taskId={conf.taskId}
          onTaskChange={v => setConf('taskId', v)}
          customers={customers}
          label="Task da aggiornare"
        />
        {conf.taskId && (<>
          <label style={lbl}>Nuovo titolo</label>
          <input style={ip} value={conf.title || ''} onChange={e => setConf('title', e.target.value)} placeholder="Lascia vuoto per non modificare" />
          <label style={lbl}>Nuova priorità</label>
          <select style={ip} value={conf.priority || ''} onChange={e => setConf('priority', e.target.value)}>
            <option value="">Non modificare</option>
            {PRIORITIES.map(p => <option key={p}>{p}</option>)}
          </select>
          <label style={lbl}>Nuova scadenza</label>
          <input type="date" style={ip} value={conf.dueDate || ''} onChange={e => setConf('dueDate', e.target.value)} />
        </>)}
      </>)}

      {/* ── Completa task ── */}
      {formData.actionType === 'complete_task' && (<>
        {renderCustomerPicker('Cliente')}
        <TaskSelect
          customerId={conf.customerId}
          taskId={conf.taskId}
          onTaskChange={v => {
            // Salva anche il nome del task per il runner
            const c = customers.find(x => x.id === conf.customerId);
            const allTasks = [];
            const flatten = items => (items || []).forEach(t => { allTasks.push(t); flatten(t.subtasks); });
            flatten(c?.todo || []);
            const t = allTasks.find(x => x.id === v);
            setConf('taskId', v);
            setConf('taskName', t?.text || '');
          }}
          customers={customers}
          label="Task da segnare"
        />
        <label style={lbl}>Segna come</label>
        <select style={ip} value={conf.markAs || 'completato'} onChange={e => setConf('markAs', e.target.value)}>
          <option value="completato">Completato ✓</option>
          <option value="da_fare">Da fare ○</option>
        </select>
      </>)}

      {/* ── Crea nota ── */}
      {formData.actionType === 'create_note' && (<>
        {renderCustomerPicker('Cliente su cui creare la nota')}
        <label style={lbl}>Testo della nota (supporta variabili)</label>
        <textarea style={{ ...ip, minHeight: 70, resize: 'vertical' }} value={conf.text || ''} onChange={e => setConf('text', e.target.value)} placeholder="Es: Nota creata automaticamente per {{cliente.nome}}" />
      </>)}

      {/* ── Aggiungi a nota ── */}
      {formData.actionType === 'append_note' && (<>
        {renderCustomerPicker('Cliente')}
        {conf.customerId && (() => {
          const c = customers.find(x => x.id === conf.customerId);
          const notes = (c?.notes || []).filter(n => n.type !== 'smartreport');
          return (<>
            <label style={lbl}>Nota esistente</label>
            {notes.length === 0 ? (
              <div style={{ marginTop: 4, padding: '8px 10px', background: '#F8F9FC', borderRadius: 8, border: '1.5px solid #E8ECF1', fontSize: '0.7rem', color: '#B2BEC3' }}>
                Nessuna nota per questo cliente
              </div>
            ) : (
              <select style={ip} value={conf.noteId || ''} onChange={e => setConf('noteId', e.target.value)}>
                <option value="">Seleziona nota...</option>
                {notes.map(n => (
                  <option key={n.id} value={n.id}>
                    {(n.text || '').substring(0, 50)}{n.text?.length > 50 ? '...' : ''}
                  </option>
                ))}
              </select>
            )}
          </>);
        })()}
        <label style={lbl}>Testo da aggiungere (supporta variabili)</label>
        <textarea style={{ ...ip, minHeight: 60, resize: 'vertical' }} value={conf.text || ''} onChange={e => setConf('text', e.target.value)} placeholder="Usa {{cliente.nome}} per variabili dinamiche..." />
      </>)}
    </>);
  };

  return (
    <div style={{
      position: 'absolute', right: 0, top: 0, bottom: 0, width: 350,
      background: '#fff',
      borderLeft: '1.5px solid #E8ECF1',
      zIndex: 20,
      display: 'flex', flexDirection: 'column',
      boxShadow: '-4px 0 20px rgba(0,0,0,0.06)',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '1.5px solid #E8ECF1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#2D3436' }}>Configura Blocco</div>
          <div style={{ fontSize: '0.65rem', color: '#B2BEC3', marginTop: 1 }}>{node.type?.replace('Node', '')}</div>
        </div>
        <button onClick={onClose} style={{ border: 'none', background: '#F4F5F9', borderRadius: 8, padding: 6, cursor: 'pointer', display: 'flex', color: '#636E72' }}>
          <X size={15} />
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 16px 16px' }}>
        <label style={lbl}>Nome blocco</label>
        <input style={ip} value={formData.label || ''} onChange={e => set('label', e.target.value)} placeholder="Nome del blocco" />
        {node.type === 'triggerNode' && renderTrigger()}
        {(node.type === 'conditionNode' || node.type === 'ifElseNode') && renderConditions()}
        {node.type === 'actionNode' && renderAction()}
        {node.type === 'delayNode' && (<>
          <label style={lbl}>Durata</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="number" min="1" style={{ ...ip, flex: 1 }} value={formData.delayValue || ''} onChange={e => set('delayValue', e.target.value)} placeholder="Valore" />
            <select style={{ ...ip, flex: 1 }} value={formData.delayUnit || 'secondi'} onChange={e => set('delayUnit', e.target.value)}>
              <option value="secondi">Secondi</option>
              <option value="minuti">Minuti</option>
            </select>
          </div>
        </>)}
        {node.type === 'chainNode' && (<>
          <label style={lbl}>Workflow da eseguire</label>
          <select style={ip} value={formData.targetWorkflowId || ''}
            onChange={e => { const wf = (workflows || []).find(w => w.id === e.target.value); set('targetWorkflowId', e.target.value); set('targetWorkflowName', wf?.name || ''); }}>
            <option value="">Seleziona workflow...</option>
            {(workflows || []).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </>)}
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 16px', borderTop: '1.5px solid #E8ECF1', display: 'flex', gap: 8 }}>
        <button onClick={handleSave} style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '9px', borderRadius: 10, border: 'none',
          background: saved ? '#00B894' : '#6C5CE7',
          color: '#fff', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer',
          transition: 'background 0.2s', fontFamily: "'Inter', sans-serif",
        }}>
          {saved ? <><Check size={14} /> Salvato</> : 'Applica'}
        </button>
        <button onClick={() => { onDelete(node.id); onClose(); }} style={{
          padding: '9px 12px', borderRadius: 10, border: '1.5px solid rgba(225,112,85,0.25)',
          background: 'rgba(225,112,85,0.07)', color: '#E17055',
          cursor: 'pointer', display: 'flex', alignItems: 'center',
        }}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
