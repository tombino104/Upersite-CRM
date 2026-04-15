// Upersite CRM — Nodi Custom per React Flow
// Colori allineati al Design System: --primary #6C5CE7, --success #00B894, --danger #E17055
import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  Zap, Filter, Play, GitBranch, Clock, StopCircle, Link2,
  User, CreditCard, CheckSquare, Calendar, Settings, FileText, Tag
} from 'lucide-react';

// Palette dal design system dell'app
export const nodeColors = {
  trigger: { bg: '#6C5CE7', border: '#5A4BD1', text: '#fff', glow: 'rgba(108,92,231,0.18)' },
  condition: { bg: '#FDCB6E', border: '#f0b429', text: '#744210', glow: 'rgba(253,203,110,0.25)' },
  action: { bg: '#00B894', border: '#00a381', text: '#fff', glow: 'rgba(0,184,148,0.18)' },
  ifElse: { bg: '#0984E3', border: '#0773c5', text: '#fff', glow: 'rgba(9,132,227,0.18)' },
  delay: { bg: '#A29BFE', border: '#6C5CE7', text: '#fff', glow: 'rgba(162,155,254,0.25)' },
  end: { bg: '#E17055', border: '#c85f45', text: '#fff', glow: 'rgba(225,112,85,0.18)' },
  chain: { bg: '#00CEC9', border: '#00b5b0', text: '#fff', glow: 'rgba(0,206,201,0.18)' },
};

const triggerIcons = {
  'customer.created': User, 'customer.updated': User, 'customer.deleted': User, 'customer.status_changed': User,
  'payment.registered': CreditCard, 'payment.updated': CreditCard, 'payment.due_soon': CreditCard, 'payment.overdue': CreditCard,
  'task.created': CheckSquare, 'task.updated': CheckSquare, 'task.completed': CheckSquare, 'task.overdue': CheckSquare,
  'schedule.daily': Calendar, 'schedule.weekly': Calendar, 'schedule.monthly': Calendar, 'schedule.date': Calendar,
  'system.app_started': Settings, 'system.user_login': Settings, 'system.backup_completed': Settings,
  'note.created': FileText, 'note.updated': FileText, 'note.created_on_customer': FileText, 'note.updated_on_customer': FileText,
  'tag.added': Tag, 'tag.removed': Tag,
};

const handleStyle = {
  width: 10,
  height: 10,
  border: '2px solid #fff',
  boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
};

function BaseNode({ data, colors, icon: Icon, children, extraHandles, selected }) {
  const isRunning = data._running;
  const hasError = data._error;

  let borderStyle = '1.5px solid #E8ECF1';
  let shadowStyle = `0 2px 12px ${colors.glow}`;
  if (hasError) {
    borderStyle = '2px solid #E17055';
    shadowStyle = '0 0 0 3px rgba(225,112,85,0.2), 0 4px 16px rgba(225,112,85,0.2)';
  } else if (isRunning) {
    borderStyle = '2px solid #6C5CE7';
    shadowStyle = '0 0 0 3px rgba(108,92,231,0.15), 0 4px 16px rgba(108,92,231,0.2)';
  } else if (selected) {
    borderStyle = `2px solid ${colors.border}`;
    shadowStyle = `0 0 0 3px ${colors.glow}, 0 4px 16px ${colors.glow}`;
  }

  return (
    <div style={{
      minWidth: 210,
      maxWidth: 260,
      borderRadius: 12,
      overflow: 'hidden',
      background: '#FFFFFF',
      border: borderStyle,
      boxShadow: shadowStyle,
      fontFamily: "'Inter', -apple-system, sans-serif",
      transition: 'box-shadow 0.2s, border 0.2s',
    }}>
      {/* Header colorato */}
      <div style={{
        background: colors.bg,
        color: colors.text,
        padding: '9px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        fontSize: '0.72rem',
        fontWeight: 600,
        letterSpacing: '0.01em',
      }}>
        <div style={{
          width: 24, height: 24,
          borderRadius: 6,
          background: 'rgba(255,255,255,0.22)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          {Icon && <Icon size={13} />}
        </div>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {data.label || 'Blocco'}
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: '9px 12px', fontSize: '0.68rem', color: '#636E72', lineHeight: 1.5 }}>
        {children}
      </div>

      {/* Error badge */}
      {hasError && (
        <div style={{
          padding: '5px 12px',
          background: 'rgba(225,112,85,0.08)',
          borderTop: '1px solid rgba(225,112,85,0.2)',
          color: '#E17055',
          fontSize: '0.63rem',
          fontWeight: 500,
        }}>
          {data._errorMessage || 'Errore nel blocco'}
        </div>
      )}

      {!extraHandles && (
        <>
          <Handle type="target" position={Position.Top} style={{ ...handleStyle, background: colors.bg }} />
          <Handle type="source" position={Position.Bottom} style={{ ...handleStyle, background: colors.bg }} />
        </>
      )}
      {extraHandles}
    </div>
  );
}

// ─── TRIGGER NODE ───
export const TriggerNode = memo(({ data, selected }) => {
  const IconComp = triggerIcons[data.eventType] || Zap;
  return (
    <BaseNode data={data} colors={nodeColors.trigger} icon={Zap} selected={selected}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <IconComp size={12} color={nodeColors.trigger.bg} />
        <span style={{ color: '#2D3436', fontWeight: 500 }}>{data.eventLabel || 'Seleziona evento...'}</span>
      </div>
      {data.eventConfig && Object.values(data.eventConfig).some(Boolean) && (
        <div style={{ marginTop: 6, padding: '4px 8px', background: '#F8F9FC', borderRadius: 6, fontSize: '0.62rem', border: '1px solid #E8ECF1' }}>
          {Object.entries(data.eventConfig).filter(([, v]) => v).map(([k, v]) => (
            <div key={k}><b style={{ color: '#6C5CE7' }}>{k}:</b> {v}</div>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ ...handleStyle, background: nodeColors.trigger.bg }} />
    </BaseNode>
  );
});
TriggerNode.displayName = 'TriggerNode';

// ─── CONDITION NODE ───
export const ConditionNode = memo(({ data, selected }) => {
  const conditions = data.conditions || [];
  return (
    <BaseNode data={data} colors={nodeColors.condition} icon={Filter} selected={selected}>
      {conditions.length === 0 ? (
        <span style={{ color: '#B2BEC3', fontStyle: 'italic' }}>Nessuna condizione</span>
      ) : (
        <div>
          <div style={{ marginBottom: 4, fontWeight: 600, color: '#636E72', fontSize: '0.62rem' }}>
            Logica: <span style={{ color: '#2D3436' }}>{data.logic || 'AND'}</span>
          </div>
          {conditions.slice(0, 3).map((c, i) => (
            <div key={i} style={{
              padding: '2px 6px', margin: '2px 0', background: 'rgba(253,203,110,0.12)',
              borderRadius: 6, fontSize: '0.61rem', border: '1px solid rgba(253,203,110,0.4)',
              color: '#2D3436',
            }}>
              {c.field} <b>{c.operator}</b> "{c.value}"
            </div>
          ))}
          {conditions.length > 3 && (
            <div style={{ fontSize: '0.59rem', color: '#B2BEC3', marginTop: 2 }}>+{conditions.length - 3} altre...</div>
          )}
        </div>
      )}
    </BaseNode>
  );
});
ConditionNode.displayName = 'ConditionNode';

// ─── ACTION NODE ───
export const actionLabels = {
  move_customer_status: 'Sposta stato cliente',
  add_tag: 'Aggiungi tag',
  remove_tag: 'Rimuovi tag',
  create_task: 'Crea task',
  create_subtask: 'Crea sotto-task',
  update_task: 'Aggiorna task',
  complete_task: 'Completa task',
  create_note: 'Crea nota',
  append_note: 'Aggiungi a nota',
  create_backup: 'Crea backup',
  export_backup: 'Esporta backup',
};

export const ActionNode = memo(({ data, selected }) => {
  const config = data.config || {};
  return (
    <BaseNode data={data} colors={nodeColors.action} icon={Play} selected={selected}>
      <div style={{ fontWeight: 600, color: '#2D3436', marginBottom: 4, fontSize: '0.68rem' }}>
        {actionLabels[data.actionType] || <span style={{ color: '#B2BEC3', fontWeight: 400 }}>Seleziona azione...</span>}
      </div>
      {Object.keys(config).length > 0 && (
        <div style={{ padding: '4px 8px', background: 'rgba(0,184,148,0.06)', borderRadius: 6, fontSize: '0.61rem', border: '1px solid rgba(0,184,148,0.2)' }}>
          {Object.entries(config).filter(([, v]) => v).slice(0, 3).map(([k, v]) => (
            <div key={k} style={{ margin: '1px 0', color: '#2D3436' }}>
              <span style={{ color: '#00B894', fontWeight: 600 }}>{k}:</span> {String(v).substring(0, 28)}
            </div>
          ))}
        </div>
      )}
    </BaseNode>
  );
});
ActionNode.displayName = 'ActionNode';

// ─── IF/ELSE NODE ───
export const IfElseNode = memo(({ data, selected }) => {
  const conditions = data.conditions || [];
  return (
    <BaseNode data={data} colors={nodeColors.ifElse} icon={GitBranch} selected={selected}
      extraHandles={
        <>
          <Handle type="target" position={Position.Top} style={{ ...handleStyle, background: nodeColors.ifElse.bg }} />
          <Handle type="source" position={Position.Bottom} id="if"
            style={{ ...handleStyle, background: '#00B894', left: '28%' }} />
          <Handle type="source" position={Position.Bottom} id="else"
            style={{ ...handleStyle, background: '#E17055', left: '72%' }} />
        </>
      }
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ color: '#00B894', fontWeight: 600, fontSize: '0.62rem' }}>IF (vero)</span>
        <span style={{ color: '#E17055', fontWeight: 600, fontSize: '0.62rem' }}>ELSE (falso)</span>
      </div>
      {conditions.length > 0 ? (
        conditions.slice(0, 2).map((c, i) => (
          <div key={i} style={{
            padding: '2px 6px', margin: '2px 0', background: 'rgba(9,132,227,0.07)',
            borderRadius: 6, fontSize: '0.61rem', border: '1px solid rgba(9,132,227,0.2)',
          }}>
            {c.field} <b>{c.operator}</b> "{c.value}"
          </div>
        ))
      ) : (
        <span style={{ color: '#B2BEC3', fontStyle: 'italic' }}>Configura condizioni...</span>
      )}
    </BaseNode>
  );
});
IfElseNode.displayName = 'IfElseNode';

// ─── DELAY NODE ───
export const DelayNode = memo(({ data, selected }) => (
  <BaseNode data={data} colors={nodeColors.delay} icon={Clock} selected={selected}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500, color: '#2D3436' }}>
      <Clock size={12} color={nodeColors.delay.bg} />
      <span>
        {data.delayValue
          ? `Attendi ${data.delayValue} ${data.delayUnit || 'secondi'}`
          : <span style={{ color: '#B2BEC3', fontWeight: 400 }}>Configura attesa...</span>}
      </span>
    </div>
  </BaseNode>
));
DelayNode.displayName = 'DelayNode';

// ─── END NODE ───
export const EndNode = memo(({ data, selected }) => (
  <BaseNode data={data} colors={nodeColors.end} icon={StopCircle} selected={selected}>
    <span style={{ color: '#2D3436', fontWeight: 500 }}>Termina il workflow</span>
    <Handle type="target" position={Position.Top} style={{ ...handleStyle, background: nodeColors.end.bg }} />
  </BaseNode>
));
EndNode.displayName = 'EndNode';

// ─── CHAIN NODE ───
export const ChainNode = memo(({ data, selected }) => (
  <BaseNode data={data} colors={nodeColors.chain} icon={Link2} selected={selected}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#2D3436', fontWeight: 500 }}>
      <Link2 size={12} color={nodeColors.chain.bg} />
      <span>{data.targetWorkflowName || <span style={{ color: '#B2BEC3', fontWeight: 400 }}>Seleziona workflow...</span>}</span>
    </div>
  </BaseNode>
));
ChainNode.displayName = 'ChainNode';

export const nodeTypes = {
  triggerNode: TriggerNode,
  conditionNode: ConditionNode,
  actionNode: ActionNode,
  ifElseNode: IfElseNode,
  delayNode: DelayNode,
  endNode: EndNode,
  chainNode: ChainNode,
};
