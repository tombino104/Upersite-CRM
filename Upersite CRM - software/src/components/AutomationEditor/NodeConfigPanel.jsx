// Upersite CRM — Pannello Configurazione Nodo
// Design System: Inter, #6C5CE7 primary, radii 8/12px, light theme
import React, { useState, useEffect } from 'react';
import { X, Trash2, Check } from 'lucide-react';
import { EventLabels, EventCategories } from '../../utils/workflowEvents';
import { actionLabels } from './WorkflowNodes';

const ip = {  // inputStyle
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

const lbl = {  // labelStyle
  display: 'block',
  fontSize: '0.68rem',
  fontWeight: 600,
  color: '#636E72',
  marginBottom: 4,
  marginTop: 12,
};

const operators = ['=', '!=', '>', '<', '>=', '<=', 'contiene', 'non_contiene'];

export default function NodeConfigPanel({ node, onUpdate, onDelete, onClose, workflows }) {
  const [formData, setFormData] = useState({});
  const [saved, setSaved] = useState(false);

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

  /* ── Trigger config ── */
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

  /* ── Condition / IF-ELSE config ── */
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
            <input placeholder="Campo (es: cliente.stato)" style={{ ...ip, flex: 2 }}
              value={cond.field || ''} onChange={e => updCond(i, 'field', e.target.value)} />
            <select style={{ ...ip, flex: 1 }}
              value={cond.operator || '='} onChange={e => updCond(i, 'operator', e.target.value)}>
              {operators.map(op => <option key={op}>{op}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <input placeholder="Valore" style={{ ...ip, flex: 1 }}
              value={cond.value || ''} onChange={e => updCond(i, 'value', e.target.value)} />
            <button onClick={() => setFormData(prev => ({ ...prev, conditions: prev.conditions.filter((_, j) => j !== i) }))}
              style={{ padding: '4px 8px', border: '1.5px solid rgba(225,112,85,0.25)', background: 'rgba(225,112,85,0.07)', borderRadius: 8, color: '#E17055', cursor: 'pointer' }}>
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}
      <button
        onClick={() => setFormData(prev => ({ ...prev, conditions: [...(prev.conditions || []), { field: '', operator: '=', value: '' }] }))}
        style={{ width: '100%', padding: '7px', border: '2px dashed #E8ECF1', borderRadius: 10, background: 'transparent', cursor: 'pointer', fontSize: '0.74rem', color: '#636E72', fontFamily: "'Inter', sans-serif", marginTop: 2 }}>
        + Aggiungi condizione
      </button>
    </>
  );

  /* ── Action config ── */
  const renderAction = () => {
    const conf = formData.config || {};
    return (<>
      <label style={lbl}>Tipo Azione</label>
      <select style={ip} value={formData.actionType || ''} onChange={e => set('actionType', e.target.value)}>
        <option value="">Seleziona azione...</option>
        {Object.entries(actionLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>

      {formData.actionType === 'move_customer_status' && (<>
        <label style={lbl}>Stato destinazione</label>
        <select style={ip} value={conf.targetStatus || ''} onChange={e => setConf('targetStatus', e.target.value)}>
          <option value="">Seleziona...</option>
          {['prospect', 'working', 'completed', 'lost'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
      </>)}

      {(formData.actionType === 'add_tag' || formData.actionType === 'remove_tag') && (<>
        <label style={lbl}>Tag</label>
        <input style={ip} value={conf.tag || ''} onChange={e => setConf('tag', e.target.value)} placeholder="Es: #VIP" />
      </>)}

      {formData.actionType === 'create_task' && (<>
        <label style={lbl}>Titolo task</label>
        <input style={ip} value={conf.title || ''} onChange={e => setConf('title', e.target.value)} placeholder="Titolo del task" />
        <label style={lbl}>Priorita</label>
        <select style={ip} value={conf.priority || 'Media'} onChange={e => setConf('priority', e.target.value)}>
          {['Bassa', 'Media', 'Alta', 'Urgente'].map(p => <option key={p}>{p}</option>)}
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
        <label style={lbl}>Descrizione</label>
        <textarea style={{ ...ip, minHeight: 60, resize: 'vertical' }} value={conf.description || ''} onChange={e => setConf('description', e.target.value)} placeholder="Usa {{cliente.nome}} per variabili dinamiche" />
      </>)}

      {formData.actionType === 'create_subtask' && (<>
        <label style={lbl}>Titolo sotto-task</label>
        <input style={ip} value={conf.title || ''} onChange={e => setConf('title', e.target.value)} placeholder="Titolo del sotto-task" />
        <label style={lbl}>ID Task padre</label>
        <input style={ip} value={conf.parentTaskId || ''} onChange={e => setConf('parentTaskId', e.target.value)} placeholder="ID del task padre" />
        <label style={lbl}>Livello (1-3)</label>
        <select style={ip} value={conf.level || '1'} onChange={e => setConf('level', e.target.value)}>
          {['1', '2', '3'].map(l => <option key={l} value={l}>Livello {l}</option>)}
        </select>
      </>)}

      {formData.actionType === 'complete_task' && (<>
        <label style={lbl}>Nome task</label>
        <input style={ip} value={conf.taskName || ''} onChange={e => setConf('taskName', e.target.value)} placeholder="Nome esatto del task" />
        <label style={lbl}>Segna come</label>
        <select style={ip} value={conf.markAs || 'completato'} onChange={e => setConf('markAs', e.target.value)}>
          <option value="completato">Completato</option>
          <option value="da_fare">Da fare</option>
        </select>
      </>)}

      {(formData.actionType === 'create_note' || formData.actionType === 'append_note') && (<>
        {formData.actionType === 'append_note' && (<>
          <label style={lbl}>ID Nota esistente</label>
          <input style={ip} value={conf.noteId || ''} onChange={e => setConf('noteId', e.target.value)} placeholder="ID della nota" />
        </>)}
        <label style={lbl}>Testo</label>
        <textarea style={{ ...ip, minHeight: 70, resize: 'vertical' }} value={conf.text || ''} onChange={e => setConf('text', e.target.value)} placeholder="Usa {{cliente.nome}} per variabili dinamiche..." />
      </>)}
    </>);
  };

  return (
    <div style={{
      position: 'absolute', right: 0, top: 0, bottom: 0, width: 340,
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
