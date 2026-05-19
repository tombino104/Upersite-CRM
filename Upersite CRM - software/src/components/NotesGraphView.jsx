import { useEffect, useRef, useCallback, useState } from 'react';

/* ── Utility: extract note title from HTML ── */
function getNoteTitle(note) {
  const h1 = note.text?.match(/<h1[^>]*>(.*?)<\/h1>/i);
  if (h1) return h1[1].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().substring(0, 40);
  const text = (note.text || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  return text.substring(0, 40) || 'Nota senza titolo';
}

/* ── Utility: parse internal note links from HTML ── */
function parseNoteLinks(html, noteId) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html || '', 'text/html');
    const links = doc.querySelectorAll('a[data-internal-id][data-internal-type="note"]');
    const targets = new Set();
    links.forEach(l => {
      const tid = l.getAttribute('data-internal-id');
      if (tid && tid !== noteId) targets.add(tid);
    });
    return Array.from(targets);
  } catch { return []; }
}

/* ── Force-directed simulation ── */
function buildGraph(notes) {
  const nodeMap = {};
  notes.forEach((n, i) => {
    nodeMap[n.id] = {
      id: n.id,
      title: getNoteTitle(n),
      x: 0, y: 0,
      vx: 0, vy: 0,
      links: parseNoteLinks(n.text, n.id),
      degree: 0,
    };
  });

  // Count degrees
  Object.values(nodeMap).forEach(node => {
    node.links.forEach(tid => {
      if (nodeMap[tid]) {
        node.degree++;
        nodeMap[tid].degree++;
      }
    });
  });

  return nodeMap;
}

const REPULSION = 4000;
const ATTRACTION = 0.04;
const DAMPING = 0.82;
const CENTER_GRAVITY = 0.015;
const MIN_DIST = 30;

function simulate(nodes, edges, width, height, steps = 1) {
  const cx = width / 2, cy = height / 2;

  for (let s = 0; s < steps; s++) {
    const ids = Object.keys(nodes);

    // Reset forces
    ids.forEach(id => { nodes[id].fx = 0; nodes[id].fy = 0; });

    // Repulsion between all pairs
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = nodes[ids[i]], b = nodes[ids[j]];
        let dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const safeDist = Math.max(dist, MIN_DIST);
        const force = REPULSION / (safeDist * safeDist);
        const nx = dx / dist, ny = dy / dist;
        a.fx -= nx * force; a.fy -= ny * force;
        b.fx += nx * force; b.fy += ny * force;
      }
    }

    // Attraction along edges
    edges.forEach(([sid, tid]) => {
      const a = nodes[sid], b = nodes[tid];
      if (!a || !b) return;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const force = ATTRACTION * dist;
      const nx = dx / dist, ny = dy / dist;
      a.fx += nx * force; a.fy += ny * force;
      b.fx -= nx * force; b.fy -= ny * force;
    });

    // Center gravity
    ids.forEach(id => {
      const n = nodes[id];
      n.fx += (cx - n.x) * CENTER_GRAVITY;
      n.fy += (cy - n.y) * CENTER_GRAVITY;
    });

    // Integrate
    ids.forEach(id => {
      const n = nodes[id];
      if (n.pinned) return;
      n.vx = (n.vx + n.fx) * DAMPING;
      n.vy = (n.vy + n.fy) * DAMPING;
      n.x += n.vx;
      n.y += n.vy;
    });
  }
}

/* ── Main Component ── */
export default function NotesGraphView({ notes, onNoteClick, selectedNoteId }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const stateRef = useRef({ nodes: {}, edges: [], transform: { x: 0, y: 0, scale: 1 }, drag: null, hoveredId: null, panStart: null, tick: 0 });
  const [hoveredTitle, setHoveredTitle] = useState(null);
  const [tooltip, setTooltip] = useState(null); // {x, y, title}

  /* ── Build / rebuild graph when notes change ── */
  useEffect(() => {
    const nodeMap = buildGraph(notes);
    const edges = [];
    const seen = new Set();
    Object.values(nodeMap).forEach(node => {
      node.links.forEach(tid => {
        if (!nodeMap[tid]) return;
        const key = [node.id, tid].sort().join('|');
        if (!seen.has(key)) { seen.add(key); edges.push([node.id, tid]); }
      });
    });

    // Scatter nodes in a circle to start
    const ids = Object.keys(nodeMap);
    const R = Math.min(200, 40 + ids.length * 20);
    ids.forEach((id, i) => {
      const angle = (i / ids.length) * Math.PI * 2;
      nodeMap[id].x = Math.cos(angle) * R + (canvasRef.current?.width / 2 || 400);
      nodeMap[id].y = Math.sin(angle) * R + (canvasRef.current?.height / 2 || 300);
    });

    stateRef.current.nodes = nodeMap;
    stateRef.current.edges = edges;
    stateRef.current.tick = 0;
  }, [notes]);

  /* ── Canvas resize observer ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    });
    ro.observe(canvas.parentElement);
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    return () => ro.disconnect();
  }, []);

  /* ── Node radius based on degree ── */
  const nodeRadius = (node) => 5 + Math.min(node.degree * 2, 12);

  /* ── Draw ── */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { nodes, edges, transform, hoveredId, tick } = stateRef.current;
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // Dark background
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    // Grid dots (subtle)
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    const gs = 40 * transform.scale;
    const ox = transform.x % gs, oy = transform.y % gs;
    for (let gx = ox; gx < W; gx += gs)
      for (let gy = oy; gy < H; gy += gs) {
        ctx.beginPath(); ctx.arc(gx, gy, 1, 0, Math.PI * 2); ctx.fill();
      }

    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.scale, transform.scale);

    const ids = Object.keys(nodes);
    if (ids.length === 0) {
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Nessuna nota da visualizzare', W / 2, H / 2);
      return;
    }

    // Draw edges
    edges.forEach(([sid, tid]) => {
      const a = nodes[sid], b = nodes[tid];
      if (!a || !b) return;
      const isHighlighted = hoveredId === sid || hoveredId === tid || selectedNoteId === sid || selectedNoteId === tid;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = isHighlighted ? 'rgba(124,101,255,0.85)' : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = isHighlighted ? 1.5 : 0.8;
      ctx.stroke();
    });

    // Draw nodes
    ids.forEach(id => {
      const node = nodes[id];
      const r = nodeRadius(node);
      const isHovered = hoveredId === id;
      const isSelected = selectedNoteId === id;
      const isConnected = hoveredId && (nodes[hoveredId]?.links?.includes(id) || node.links?.includes(hoveredId));

      // Glow
      if (isHovered || isSelected) {
        const grd = ctx.createRadialGradient(node.x, node.y, r * 0.5, node.x, node.y, r * 2.5);
        grd.addColorStop(0, isSelected ? 'rgba(124,101,255,0.5)' : 'rgba(100,220,255,0.35)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath();
        ctx.arc(node.x, node.y, r * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);

      if (isSelected) {
        ctx.fillStyle = '#a78bfa';
      } else if (isHovered) {
        ctx.fillStyle = '#60d4fa';
      } else if (isConnected) {
        ctx.fillStyle = '#818cf8';
      } else if (node.degree === 0) {
        ctx.fillStyle = '#374151';
      } else {
        // Color by degree
        const t = Math.min(node.degree / 6, 1);
        const r1 = Math.round(99 + t * (167 - 99));
        const g1 = Math.round(102 + t * (139 - 102));
        const b1 = Math.round(241 + t * (250 - 241));
        ctx.fillStyle = `rgb(${r1},${g1},${b1})`;
      }

      ctx.fill();

      // Node border
      ctx.strokeStyle = isSelected ? '#c4b5fd' : isHovered ? '#93e6ff' : 'rgba(255,255,255,0.15)';
      ctx.lineWidth = isHovered || isSelected ? 1.5 : 0.5;
      ctx.stroke();

      // Label
      const showLabel = transform.scale > 0.5 || isHovered || isSelected;
      if (showLabel) {
        const label = node.title.length > 22 ? node.title.substring(0, 22) + '…' : node.title;
        ctx.font = `${isSelected || isHovered ? 600 : 400} ${Math.max(9, 11 * transform.scale) / transform.scale}px Inter, sans-serif`;
        ctx.fillStyle = isSelected ? '#e9d5ff' : isHovered ? '#bae6fd' : 'rgba(255,255,255,0.55)';
        ctx.textAlign = 'center';
        ctx.fillText(label, node.x, node.y + r + 13);
      }
    });

    ctx.restore();
  }, [selectedNoteId]);

  /* ── Animation loop ── */
  useEffect(() => {
    const loop = () => {
      const { nodes, edges, tick } = stateRef.current;
      const canvas = canvasRef.current;
      if (canvas && Object.keys(nodes).length > 0) {
        const stepsPerFrame = tick < 200 ? 4 : 1;
        simulate(nodes, edges, canvas.width, canvas.height, stepsPerFrame);
        stateRef.current.tick++;
      }
      draw();
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  /* ── World-space coordinates ── */
  const toWorld = (cx, cy) => {
    const { transform } = stateRef.current;
    return {
      x: (cx - transform.x) / transform.scale,
      y: (cy - transform.y) / transform.scale,
    };
  };

  /* ── Hit test ── */
  const hitNode = (wx, wy) => {
    const { nodes } = stateRef.current;
    for (const id of Object.keys(nodes)) {
      const n = nodes[id];
      const r = nodeRadius(n) + 4;
      if ((wx - n.x) ** 2 + (wy - n.y) ** 2 < r * r) return n;
    }
    return null;
  };

  /* ── Mouse events ── */
  const handleMouseMove = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const state = stateRef.current;

    // Pan
    if (state.panStart) {
      state.transform.x += cx - state.panStart.cx;
      state.transform.y += cy - state.panStart.cy;
      state.panStart = { cx, cy };
      return;
    }

    // Drag node
    if (state.drag) {
      const { x, y } = toWorld(cx, cy);
      state.drag.x = x; state.drag.y = y;
      state.drag.vx = 0; state.drag.vy = 0;
      return;
    }

    // Hover
    const { x, y } = toWorld(cx, cy);
    const hit = hitNode(x, y);
    state.hoveredId = hit?.id || null;
    if (hit) {
      setTooltip({ x: e.clientX, y: e.clientY - 36, title: hit.title });
      canvasRef.current.style.cursor = 'pointer';
    } else {
      setTooltip(null);
      canvasRef.current.style.cursor = 'grab';
    }
  }, []);

  const handleMouseDown = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const { x, y } = toWorld(cx, cy);
    const hit = hitNode(x, y);
    const state = stateRef.current;

    if (hit) {
      hit.pinned = true;
      state.drag = hit;
      canvasRef.current.style.cursor = 'grabbing';
    } else {
      state.panStart = { cx, cy };
      canvasRef.current.style.cursor = 'grabbing';
    }
    e.preventDefault();
  }, []);

  const handleMouseUp = useCallback((e) => {
    const state = stateRef.current;
    if (state.drag) {
      state.drag.pinned = false;
      state.drag = null;
    }
    state.panStart = null;
    canvasRef.current.style.cursor = 'grab';
  }, []);

  const handleClick = useCallback((e) => {
    if (stateRef.current.panStart) return; // was panning
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const { x, y } = toWorld(cx, cy);
    const hit = hitNode(x, y);
    if (hit && onNoteClick) {
      const note = notes.find(n => n.id === hit.id);
      if (note) onNoteClick(note);
    }
  }, [notes, onNoteClick]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const state = stateRef.current;
    const factor = e.deltaY < 0 ? 1.1 : 0.91;
    const newScale = Math.max(0.15, Math.min(4, state.transform.scale * factor));
    state.transform.x = cx - (cx - state.transform.x) * (newScale / state.transform.scale);
    state.transform.y = cy - (cy - state.transform.y) * (newScale / state.transform.scale);
    state.transform.scale = newScale;
  }, []);

  /* ── Stats ── */
  const nodeCount = notes.length;
  const edgeCount = stateRef.current.edges?.length || 0;
  const linkedCount = new Set(stateRef.current.edges?.flatMap(e => e) || []).size;
  const isolatedCount = nodeCount - linkedCount;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 520, background: '#0d1117', borderRadius: 20, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%', cursor: 'grab' }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
        onWheel={handleWheel}
      />

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: 'fixed', left: tooltip.x, top: tooltip.y,
          background: 'rgba(20,20,35,0.95)', color: '#e2e8f0',
          padding: '5px 12px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600,
          pointerEvents: 'none', zIndex: 9999, border: '1px solid rgba(124,101,255,0.4)',
          backdropFilter: 'blur(8px)', whiteSpace: 'nowrap',
          transform: 'translateX(-50%)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}>
          {tooltip.title}
        </div>
      )}

      {/* Top-right stats pill */}
      <div style={{
        position: 'absolute', top: 14, right: 14,
        display: 'flex', gap: 8, alignItems: 'center',
      }}>
        <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '4px 14px', fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', display: 'flex', gap: 16 }}>
          <span>🔵 {nodeCount} note</span>
          <span>🔗 {edgeCount} collegamenti</span>
          <span>⚪ {isolatedCount} isolate</span>
        </div>
      </div>

      {/* Bottom legend */}
      <div style={{
        position: 'absolute', bottom: 14, left: 14,
        display: 'flex', gap: 16, alignItems: 'center',
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12, padding: '6px 14px', fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)',
      }}>
        <span>🖱 Trascina nodi</span>
        <span>⚙ Scorri per zoom</span>
        <span>👆 Click per aprire</span>
      </div>

      {/* Controls */}
      <div style={{ position: 'absolute', bottom: 14, right: 14, display: 'flex', gap: 6 }}>
        {[
          { label: '+', action: () => { stateRef.current.transform.scale = Math.min(4, stateRef.current.transform.scale * 1.2); } },
          { label: '−', action: () => { stateRef.current.transform.scale = Math.max(0.15, stateRef.current.transform.scale * 0.83); } },
          { label: '⟳', action: () => { stateRef.current.transform = { x: 0, y: 0, scale: 1 }; stateRef.current.tick = 0; } },
        ].map(btn => (
          <button key={btn.label} onClick={btn.action} style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.6)', fontSize: '1rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(124,101,255,0.25)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
}
