// Upersite CRM — Editor Automazioni Full-Screen
// Design System: #6C5CE7 primary, light theme, Inter, radii 8/12/16px
import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  X, Plus, Search, Zap, Filter, Play, GitBranch, Clock, StopCircle, Link2,
  ChevronDown, ChevronRight, ToggleLeft, ToggleRight,
  AlertTriangle, CheckCircle, XCircle, Trash2, Copy, Save, Check,
} from 'lucide-react';
import { nodeTypes, nodeColors } from './WorkflowNodes';
import NodeConfigPanel from './NodeConfigPanel';
import { generateId } from '../../utils/storage';
import { validateWorkflow } from '../../utils/workflowRunner';
import { EventLabels } from '../../utils/workflowEvents';

// ─── Libreria blocchi ───
const BLOCK_LIBRARY = [
  {
    category: 'Trigger',
    icon: Zap,
    color: nodeColors.trigger.bg,
    blocks: [{ type: 'triggerNode', label: 'Trigger Evento', desc: 'Avvia il workflow' }],
  },
  {
    category: 'Condizioni',
    icon: Filter,
    color: nodeColors.condition.bg,
    blocks: [{ type: 'conditionNode', label: 'Condizione', desc: 'Filtra con regole logiche' }],
  },
  {
    category: 'Azioni',
    icon: Play,
    color: nodeColors.action.bg,
    blocks: [{ type: 'actionNode', label: 'Azione CRM', desc: 'Esegui un\'operazione' }],
  },
  {
    category: 'Controllo',
    icon: GitBranch,
    color: nodeColors.ifElse.bg,
    blocks: [
      { type: 'ifElseNode', label: 'IF / ELSE', desc: 'Bivio condizionale' },
      { type: 'delayNode', label: 'Attendi', desc: 'Pausa temporale' },
      { type: 'endNode', label: 'Termina', desc: 'Fine del workflow' },
      { type: 'chainNode', label: 'Esegui Workflow', desc: 'Collega ad altro workflow' },
    ],
  },
];

const statusInfo = {
  active:   { icon: CheckCircle,  color: '#00B894', label: 'Attivo' },
  warning:  { icon: AlertTriangle, color: '#FDCB6E', label: 'Warning' },
  broken:   { icon: XCircle,      color: '#E17055', label: 'Errore' },
  disabled: { icon: ToggleLeft,   color: '#B2BEC3', label: 'Off' },
};

// ─── Stili condivisi ───
const SIDEBAR_W = 248;
const LIBRARY_W = 210;

export default function AutomationEditor({
  isOpen, onClose,
  workflows, workflowLogs,
  onSaveWorkflow, onDeleteWorkflow,
  crmData,
}) {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(null);
  const [isEditorActive, setIsEditorActive] = useState(false); // FIX: mostra canvas anche per nuovi wf
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [workflowName, setWorkflowName] = useState('');
  const [workflowEnabled, setWorkflowEnabled] = useState(true);
  const [executionConditions, setExecutionConditions] = useState({ requireLogin: false, background: false });
  const [selectedNode, setSelectedNode] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('editor');
  const [expandedCategories, setExpandedCategories] = useState({ Trigger: true, Condizioni: true, Azioni: true, Controllo: true });
  const [hasChanges, setHasChanges] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [rfInstance, setRfInstance] = useState(null);

  // ─── Carica workflow selezionato ───
  useEffect(() => {
    if (selectedWorkflowId) {
      const wf = workflows.find(w => w.id === selectedWorkflowId);
      if (wf) {
        setNodes(wf.nodes || []);
        setEdges(wf.edges || []);
        setWorkflowName(wf.name || '');
        setWorkflowEnabled(wf.enabled !== false);
        setExecutionConditions(wf.executionConditions || { requireLogin: false, requireUnlocked: false });
        setHasChanges(false);
        setIsEditorActive(true);
      }
    }
  }, [selectedWorkflowId]);

  const markChanged = () => setHasChanges(true);

  const onNodesChange = useCallback((changes) => {
    setNodes(nds => applyNodeChanges(changes, nds));
    markChanged();
  }, []);

  const onEdgesChange = useCallback((changes) => {
    setEdges(eds => applyEdgeChanges(changes, eds));
    markChanged();
  }, []);

  const onConnect = useCallback((params) => {
    setEdges(eds => addEdge({
      ...params,
      type: 'smoothstep',
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#B2BEC3' },
      style: { stroke: '#B2BEC3', strokeWidth: 1.8 },
    }, eds));
    markChanged();
  }, []);

  const onNodeClick = useCallback((_, node) => setSelectedNode(node), []);
  const onPaneClick = useCallback(() => setSelectedNode(null), []);

  // ─── Aggiungi blocco al canvas ───
  const addBlock = useCallback((blockType, blockLabel) => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const position = rfInstance
      ? rfInstance.screenToFlowPosition({ x: cx, y: cy })
      : { x: 200 + Math.random() * 100, y: 150 + Math.random() * 100 };

    const newNode = {
      id: generateId(),
      type: blockType,
      position,
      data: { label: blockLabel, conditions: [], config: {} },
    };
    setNodes(nds => [...nds, newNode]);
    markChanged();
  }, [rfInstance]);

  // ─── Aggiorna dati nodo ───
  const updateNodeData = useCallback((nodeId, newData) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...newData } } : n));
    markChanged();
  }, []);

  const deleteNode = useCallback((nodeId) => {
    setNodes(nds => nds.filter(n => n.id !== nodeId));
    setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
    setSelectedNode(null);
    markChanged();
  }, []);

  // ─── Salva ───
  const handleSave = useCallback(() => {
    const wf = {
      id: selectedWorkflowId || generateId(),
      name: workflowName || 'Workflow senza nome',
      enabled: workflowEnabled,
      executionConditions,
      nodes,
      edges,
      updatedAt: new Date().toISOString(),
      createdAt: (workflows || []).find(w => w.id === selectedWorkflowId)?.createdAt || new Date().toISOString(),
    };
    const validation = validateWorkflow(wf, crmData);
    wf.status = validation.status;
    wf.validationErrors = validation.errors;
    wf.validationWarnings = validation.warnings;
    onSaveWorkflow(wf);
    setSelectedWorkflowId(wf.id);
    setHasChanges(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1600);
  }, [selectedWorkflowId, workflowName, workflowEnabled, executionConditions, nodes, edges, onSaveWorkflow, crmData, workflows]);

  // ─── Nuovo workflow ───
  const handleNew = useCallback(() => {
    setSelectedWorkflowId(null);
    setNodes([]);
    setEdges([]);
    setWorkflowName('Nuovo Workflow');
    setWorkflowEnabled(true);
    setExecutionConditions({ requireLogin: false, background: false });
    setSelectedNode(null);
    setHasChanges(false);
    setIsEditorActive(true); // <-- FIX: mostra subito il canvas
    setActiveTab('editor');
  }, []);

  const handleDuplicate = useCallback(() => {
    if (!selectedWorkflowId) return;
    const wf = (workflows || []).find(w => w.id === selectedWorkflowId);
    if (!wf) return;
    const dup = { ...wf, id: generateId(), name: wf.name + ' (copia)', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    onSaveWorkflow(dup);
    setSelectedWorkflowId(dup.id);
  }, [selectedWorkflowId, workflows, onSaveWorkflow]);

  const handleDelete = useCallback(() => {
    if (!selectedWorkflowId) return;
    if (window.confirm('Eliminare questo workflow?')) {
      onDeleteWorkflow(selectedWorkflowId);
      setSelectedWorkflowId(null);
      setIsEditorActive(false);
      setNodes([]); setEdges([]);
      setWorkflowName(''); setHasChanges(false);
    }
  }, [selectedWorkflowId, onDeleteWorkflow]);

  const filteredWorkflows = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return (workflows || []).filter(w => !q || (w.name || '').toLowerCase().includes(q));
  }, [workflows, searchQuery]);

  const currentLogs = useMemo(() => {
    if (!selectedWorkflowId) return [];
    return (workflowLogs || [])
      .filter(l => l.workflowId === selectedWorkflowId)
      .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
      .slice(0, 50);
  }, [selectedWorkflowId, workflowLogs]);

  const downloadLogs = useCallback(() => {
    if (!currentLogs || currentLogs.length === 0) return;
    const wf = workflows.find(w => w.id === selectedWorkflowId);
    const fileName = `logs_${(wf?.name || 'workflow').replace(/\s+/g, '_').toLowerCase()}_${new Date().toISOString().slice(0, 10)}.txt`;

    const content = `LOG DI ESECUZIONE - UPERSITE CRM\n` +
      `Workflow: ${wf?.name || 'Senza nome'}\n` +
      `ID: ${selectedWorkflowId}\n` +
      `Data Estrazione: ${new Date().toLocaleString('it-IT')}\n` +
      `--------------------------------------------------\n\n` +
      currentLogs.map(log => {
        let text = `[${new Date(log.startedAt).toLocaleString('it-IT')}] STATO: ${log.status.toUpperCase()}\n`;
        if (log.triggeredBy) text += `TRIGGER: ${EventLabels[log.triggeredBy] || log.triggeredBy}\n`;
        if (log.error) text += `ERRORE: ${log.error}\n`;
        if (log.steps && log.steps.length > 0) {
          text += `PASSAGGI:\n`;
          log.steps.forEach((step, i) => {
            const resultStr = typeof step.result === 'object' ? (step.result.detail || JSON.stringify(step.result)) : step.result;
            text += `  ${i + 1}. [${step.nodeType}] ${step.label || 'Senza label'}: ${resultStr}\n`;
          });
        }
        return text + '\n' + '='.repeat(50);
      }).join('\n\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }, [currentLogs, selectedWorkflowId, workflows]);

  if (!isOpen) return null;

  const showCanvas = isEditorActive;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#F8F9FC',
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>

      {/* ── Top Bar ─────────────────────────────── */}
      <div style={{
        height: 54, background: '#fff',
        borderBottom: '1.5px solid #E8ECF1',
        display: 'flex', alignItems: 'center',
        padding: '0 16px', gap: 12, flexShrink: 0,
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      }}>
        {/* Logo + titolo sezione */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 160 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: 'linear-gradient(135deg, #6C5CE7, #A29BFE)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Zap size={16} color="#fff" />
          </div>
          <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#2D3436' }}>Automazioni</span>
        </div>

        {/* Separatore verticale */}
        <div style={{ width: 1, height: 28, background: '#E8ECF1', margin: '0 4px' }} />

        {/* Nome workflow (solo se canvas attivo) */}
        {showCanvas && (
          <input
            value={workflowName}
            onChange={e => { setWorkflowName(e.target.value); markChanged(); }}
            style={{
              background: '#F4F5F9', border: '1.5px solid #E8ECF1', borderRadius: 8,
              padding: '6px 12px', color: '#2D3436', fontSize: '0.82rem',
              fontWeight: 600, width: 220, outline: 'none',
              fontFamily: "'Inter', sans-serif", transition: 'border 0.15s',
            }}
            onFocus={e => e.target.style.borderColor = '#6C5CE7'}
            onBlur={e => e.target.style.borderColor = '#E8ECF1'}
            placeholder="Nome workflow..."
          />
        )}

        <div style={{ flex: 1 }} />

        {/* Tabs */}
        {showCanvas && (
          <div style={{ display: 'flex', background: '#F4F5F9', borderRadius: 10, padding: 3 }}>
            {['editor', 'logs'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                padding: '5px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontSize: '0.74rem', fontWeight: 600, fontFamily: "'Inter', sans-serif",
                background: activeTab === tab ? '#fff' : 'transparent',
                color: activeTab === tab ? '#6C5CE7' : '#636E72',
                boxShadow: activeTab === tab ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s',
              }}>
                {tab === 'editor' ? 'Editor' : 'Log & Debug'}
              </button>
            ))}
          </div>
        )}

        {/* Toggle attivo/disattivo */}
        {showCanvas && (
          <button onClick={() => { setWorkflowEnabled(v => !v); markChanged(); }} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: workflowEnabled ? 'rgba(0,184,148,0.08)' : 'rgba(225,112,85,0.08)',
            border: `1.5px solid ${workflowEnabled ? '#00B894' : '#E17055'}`,
            borderRadius: 8, padding: '5px 12px', cursor: 'pointer',
            color: workflowEnabled ? '#00B894' : '#E17055',
            fontSize: '0.72rem', fontWeight: 600, fontFamily: "'Inter', sans-serif", transition: 'all 0.15s',
          }}>
            {workflowEnabled ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
            {workflowEnabled ? 'Attivo' : 'Off'}
          </button>
        )}

        {/* Condizioni esecuzione */}
        {showCanvas && (
          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { key: 'requireLogin', label: 'Solo login' },
              { key: 'background', label: 'Background' },
            ].map(c => (
              <button key={c.key} onClick={() => { setExecutionConditions(p => ({ ...p, [c.key]: !p[c.key] })); markChanged(); }}
                title={c.label}
                style={{
                  padding: '5px 10px', borderRadius: 8, border: '1.5px solid',
                  borderColor: executionConditions[c.key] ? '#FDCB6E' : '#E8ECF1',
                  background: executionConditions[c.key] ? 'rgba(253,203,110,0.1)' : '#F4F5F9',
                  color: executionConditions[c.key] ? '#b7860a' : '#B2BEC3',
                  cursor: 'pointer', fontSize: '0.65rem', fontWeight: 600,
                  fontFamily: "'Inter', sans-serif", transition: 'all 0.15s',
                }}>
                {c.label}
              </button>
            ))}
          </div>
        )}

        {/* Salva */}
        {showCanvas && (
          <button onClick={handleSave} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 18px',
            borderRadius: 10, border: 'none', cursor: 'pointer',
            background: savedFlash ? '#00B894' : hasChanges ? '#6C5CE7' : '#F4F5F9',
            color: (savedFlash || hasChanges) ? '#fff' : '#B2BEC3',
            fontWeight: 600, fontSize: '0.78rem', fontFamily: "'Inter', sans-serif",
            transition: 'all 0.2s',
            boxShadow: hasChanges ? '0 2px 10px rgba(108,92,231,0.25)' : 'none',
          }}>
            {savedFlash ? <><Check size={14} /> Salvato</> : <><Save size={14} /> Salva</>}
          </button>
        )}

        {/* Chiudi */}
        <button onClick={onClose} style={{
          border: '1.5px solid #E8ECF1', background: '#F4F5F9', borderRadius: 8,
          padding: 6, cursor: 'pointer', display: 'flex', color: '#636E72',
          transition: 'all 0.15s', marginLeft: 4,
        }}>
          <X size={16} />
        </button>
      </div>

      {/* ── Main ────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Left: Lista Workflow ─────────────── */}
        <div style={{
          width: SIDEBAR_W, background: '#fff',
          borderRight: '1.5px solid #E8ECF1',
          display: 'flex', flexDirection: 'column', flexShrink: 0,
        }}>
          <div style={{ padding: '12px' }}>
            <button onClick={handleNew} style={{
              width: '100%', padding: '9px', borderRadius: 10,
              border: '2px dashed rgba(108,92,231,0.3)',
              background: 'rgba(108,92,231,0.04)', cursor: 'pointer',
              color: '#6C5CE7', fontWeight: 600, fontSize: '0.76rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              marginBottom: 10, fontFamily: "'Inter', sans-serif",
              transition: 'all 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(108,92,231,0.08)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(108,92,231,0.04)'}
            >
              <Plus size={15} /> Nuovo Workflow
            </button>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#B2BEC3' }} />
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%', padding: '7px 10px 7px 28px',
                  borderRadius: 8, border: '1.5px solid #E8ECF1',
                  background: '#F4F5F9', color: '#2D3436', fontSize: '0.74rem',
                  outline: 'none', fontFamily: "'Inter', sans-serif", boxSizing: 'border-box',
                }}
                placeholder="Cerca..."
              />
            </div>
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '0 8px 12px' }}>
            {filteredWorkflows.length === 0 && (
              <div style={{ padding: '20px 12px', textAlign: 'center', color: '#B2BEC3', fontSize: '0.74rem' }}>
                Nessun workflow trovato
              </div>
            )}
            {filteredWorkflows.map(wf => {
              const st = statusInfo[wf.status] || statusInfo.active;
              const StIcon = st.icon;
              const isSelected = wf.id === selectedWorkflowId;
              return (
                <div key={wf.id}
                  onClick={() => { setSelectedWorkflowId(wf.id); setActiveTab('editor'); }}
                  style={{
                    padding: '9px 10px', borderRadius: 10, cursor: 'pointer', marginBottom: 3,
                    background: isSelected ? 'rgba(108,92,231,0.07)' : 'transparent',
                    border: isSelected ? '1.5px solid rgba(108,92,231,0.2)' : '1.5px solid transparent',
                    transition: 'all 0.12s',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#F8F9FC'; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <StIcon size={13} color={wf.enabled === false ? '#B2BEC3' : st.color} />
                    <span style={{
                      flex: 1, fontSize: '0.78rem', fontWeight: isSelected ? 600 : 400,
                      color: isSelected ? '#2D3436' : '#636E72',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {wf.name || 'Senza nome'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.62rem', color: '#B2BEC3', marginTop: 3, paddingLeft: 20 }}>
                    {(wf.nodes || []).length} blocchi
                    {wf.enabled === false && ' · Disattivato'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Center: Canvas o Log ─────────────── */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {activeTab === 'editor' ? (
            showCanvas ? (
              /* Canvas React Flow */
              <div style={{ width: '100%', height: '100%' }}>
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onNodeClick={onNodeClick}
                  onPaneClick={onPaneClick}
                  onInit={setRfInstance}
                  nodeTypes={nodeTypes}
                  fitView
                  deleteKeyCode="Delete"
                  proOptions={{ hideAttribution: true }}
                  style={{ background: '#F8F9FC' }}
                >
                  <Background color="#D0D3D9" gap={24} size={1.2} variant="dots" />
                  <Controls style={{
                    background: '#fff', border: '1.5px solid #E8ECF1',
                    borderRadius: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  }} />
                  <MiniMap
                    nodeColor={n => nodeColors[n.type?.replace('Node', '')]?.bg || '#B2BEC3'}
                    style={{ background: '#fff', border: '1.5px solid #E8ECF1', borderRadius: 10 }}
                    maskColor="rgba(248,249,252,0.7)"
                  />
                </ReactFlow>

                {/* Toolbar blocchi in basso */}
                <div style={{
                  position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
                  display: 'flex', gap: 4, alignItems: 'center',
                  background: '#fff', borderRadius: 14, padding: '6px 10px',
                  border: '1.5px solid #E8ECF1',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                }}>
                  {[
                    { type: 'triggerNode',   label: 'Trigger',   icon: Zap,        c: nodeColors.trigger },
                    { type: 'conditionNode', label: 'Condizione', icon: Filter,     c: nodeColors.condition },
                    { type: 'actionNode',    label: 'Azione',    icon: Play,       c: nodeColors.action },
                    { type: 'ifElseNode',    label: 'IF/ELSE',   icon: GitBranch,  c: nodeColors.ifElse },
                    { type: 'delayNode',     label: 'Attendi',   icon: Clock,      c: nodeColors.delay },
                    { type: 'endNode',       label: 'Fine',      icon: StopCircle, c: nodeColors.end },
                    { type: 'chainNode',     label: 'Chain',     icon: Link2,      c: nodeColors.chain },
                  ].map((b, i) => (
                    <React.Fragment key={b.type}>
                      {i === 2 && <div style={{ width: 1, height: 28, background: '#E8ECF1', margin: '0 4px' }} />}
                      {i === 4 && <div style={{ width: 1, height: 28, background: '#E8ECF1', margin: '0 4px' }} />}
                      <button
                        onClick={() => addBlock(b.type, b.label)}
                        title={b.label}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                          padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                          background: 'transparent', color: b.c.bg,
                          fontSize: '0.6rem', fontWeight: 600,
                          fontFamily: "'Inter', sans-serif", transition: 'background 0.12s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#F4F5F9'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <b.icon size={16} />
                        {b.label}
                      </button>
                    </React.Fragment>
                  ))}
                </div>

                {/* Config Panel nodo selezionato */}
                {selectedNode && (
                  <NodeConfigPanel
                    node={selectedNode}
                    onUpdate={updateNodeData}
                    onDelete={deleteNode}
                    onClose={() => setSelectedNode(null)}
                    workflows={workflows}
                    crmData={crmData}
                  />
                )}
              </div>
            ) : (
              /* Empty State */
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', height: '100%', gap: 16,
              }}>
                <div style={{
                  width: 72, height: 72, borderRadius: 20,
                  background: 'rgba(108,92,231,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Zap size={32} color="#6C5CE7" />
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#2D3436' }}>
                  Crea la tua prima automazione
                </div>
                <div style={{ fontSize: '0.78rem', color: '#636E72', maxWidth: 380, textAlign: 'center', lineHeight: 1.7 }}>
                  Seleziona un workflow dalla lista a sinistra oppure creane uno nuovo per iniziare a costruire flussi automatici.
                </div>
                <button onClick={handleNew} style={{
                  padding: '10px 24px', borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: '#6C5CE7', color: '#fff', fontWeight: 600, fontSize: '0.82rem',
                  display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'Inter', sans-serif",
                  boxShadow: '0 4px 16px rgba(108,92,231,0.3)',
                }}>
                  <Plus size={16} /> Nuovo Workflow
                </button>
              </div>
            )
          ) : (
            /* ── Log Tab ── */
            <div style={{ height: '100%', overflow: 'auto', padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#2D3436' }}>
                  Log & Debug
                </div>
                {currentLogs.length > 0 && (
                  <button onClick={downloadLogs} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 8, border: '1.5px solid #E8ECF1',
                    background: '#fff', cursor: 'pointer', color: '#6C5CE7',
                    fontSize: '0.72rem', fontWeight: 600, fontFamily: "'Inter', sans-serif",
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(108,92,231,0.04)'; e.currentTarget.style.borderColor = '#6C5CE7'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#E8ECF1'; }}
                  >
                    <Save size={14} /> Scarica Log (.txt)
                  </button>
                )}
              </div>
              {currentLogs.length === 0 ? (
                <div style={{
                  padding: '40px 20px', textAlign: 'center',
                  background: '#fff', borderRadius: 14, border: '1.5px solid #E8ECF1',
                  color: '#B2BEC3', fontSize: '0.78rem',
                }}>
                  Nessuna esecuzione registrata per questo workflow.
                </div>
              ) : (
                currentLogs.map(log => (
                  <div key={log.id} style={{
                    background: '#fff', border: '1.5px solid #E8ECF1', borderRadius: 12,
                    padding: 14, marginBottom: 8,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: log.status === 'completed' ? '#00B894' : log.status === 'error' ? '#E17055' : '#FDCB6E',
                        }} />
                        <span style={{ color: '#2D3436', fontSize: '0.78rem', fontWeight: 600 }}>
                          {log.status === 'completed' ? 'Completato' : log.status === 'error' ? 'Errore' : log.status === 'skipped' ? 'Saltato' : 'In corso'}
                        </span>
                      </div>
                      <span style={{ color: '#B2BEC3', fontSize: '0.64rem' }}>
                        {new Date(log.startedAt).toLocaleString('it-IT')}
                      </span>
                    </div>
                    {log.triggeredBy && (
                      <div style={{ color: '#636E72', fontSize: '0.68rem', marginBottom: 6 }}>
                        Trigger: <b>{EventLabels[log.triggeredBy] || log.triggeredBy}</b>
                      </div>
                    )}
                    {log.error && (
                      <div style={{
                        padding: '6px 10px', background: 'rgba(225,112,85,0.07)',
                        borderRadius: 8, color: '#E17055', fontSize: '0.7rem', marginBottom: 6,
                        border: '1px solid rgba(225,112,85,0.2)',
                      }}>
                        {log.error}
                      </div>
                    )}
                    {(log.steps || []).length > 0 && (
                      <div style={{ borderLeft: '2px solid rgba(108,92,231,0.2)', paddingLeft: 10, marginLeft: 4, marginTop: 6 }}>
                        {log.steps.map((step, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: '0.65rem', color: '#636E72' }}>
                            <span style={{ fontWeight: 500, color: '#2D3436' }}>{step.label || step.nodeType}</span>
                            <span>{typeof step.result === 'object' ? step.result?.detail : step.result}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* ── Right: Libreria Blocchi ──────────── */}
        {activeTab === 'editor' && showCanvas && (
          <div style={{
            width: LIBRARY_W, background: '#fff',
            borderLeft: '1.5px solid #E8ECF1',
            overflow: 'auto', flexShrink: 0,
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ padding: '14px 14px 6px', fontSize: '0.68rem', fontWeight: 700, color: '#B2BEC3', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Libreria
            </div>

            {BLOCK_LIBRARY.map(cat => {
              const CatIcon = cat.icon;
              const isExpanded = expandedCategories[cat.category] !== false;
              return (
                <div key={cat.category}>
                  <button
                    onClick={() => setExpandedCategories(p => ({ ...p, [cat.category]: !p[cat.category] }))}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 7,
                      padding: '8px 14px', border: 'none', cursor: 'pointer',
                      background: 'transparent', color: '#2D3436',
                      fontSize: '0.76rem', fontWeight: 600, fontFamily: "'Inter', sans-serif",
                    }}>
                    {isExpanded ? <ChevronDown size={13} color="#B2BEC3" /> : <ChevronRight size={13} color="#B2BEC3" />}
                    <CatIcon size={13} color={cat.color} />
                    {cat.category}
                  </button>

                  {isExpanded && cat.blocks.map(block => (
                    <button
                      key={block.type}
                      onClick={() => addBlock(block.type, block.label)}
                      style={{
                        width: '100%', display: 'flex', flexDirection: 'column',
                        padding: '7px 14px 7px 34px',
                        border: 'none', cursor: 'pointer', background: 'transparent',
                        textAlign: 'left', fontFamily: "'Inter', sans-serif", transition: 'background 0.12s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#F4F5F9'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <span style={{ fontSize: '0.74rem', fontWeight: 500, color: '#2D3436' }}>{block.label}</span>
                      <span style={{ fontSize: '0.61rem', color: '#B2BEC3', marginTop: 1 }}>{block.desc}</span>
                    </button>
                  ))}
                </div>
              );
            })}

            {/* Azioni workflow */}
            {selectedWorkflowId && (
              <div style={{ padding: '14px', borderTop: '1.5px solid #E8ECF1', marginTop: 'auto' }}>
                <div style={{ fontSize: '0.64rem', fontWeight: 700, color: '#B2BEC3', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Azioni
                </div>
                <button onClick={handleDuplicate} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 7,
                  padding: '7px 10px', borderRadius: 8, border: '1.5px solid #E8ECF1',
                  background: '#F4F5F9', color: '#636E72', fontSize: '0.72rem',
                  marginBottom: 6, fontFamily: "'Inter', sans-serif", cursor: 'pointer',
                }}>
                  <Copy size={12} /> Duplica
                </button>
                <button onClick={handleDelete} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 7,
                  padding: '7px 10px', borderRadius: 8,
                  border: '1.5px solid rgba(225,112,85,0.25)',
                  background: 'rgba(225,112,85,0.06)', color: '#E17055',
                  fontSize: '0.72rem', fontFamily: "'Inter', sans-serif", cursor: 'pointer',
                }}>
                  <Trash2 size={12} /> Elimina
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
