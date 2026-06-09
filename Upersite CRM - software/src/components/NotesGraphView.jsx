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

function simulate(nodes, edges, width, height, steps = 1, hideIsolated = false) {
  const cx = width / 2, cy = height / 2;

  for (let s = 0; s < steps; s++) {
    let ids = Object.keys(nodes);
    if (hideIsolated) {
      ids = ids.filter(id => nodes[id].degree > 0);
    }

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
      if (hideIsolated && (a.degree === 0 || b.degree === 0)) return;
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
  const [searchQuery, setSearchQuery] = useState('');
  const [hideIsolated, setHideIsolated] = useState(false);
  const stateRef = useRef({ 
    nodes: {}, 
    edges: [], 
    transform: { x: 0, y: 0, scale: 1 }, 
    drag: null, 
    hoveredId: null, 
    panStart: null, 
    tick: 0,
    searchQuery: '',
    hideIsolated: false
  });
  const [tooltip, setTooltip] = useState(null); // {x, y, title}

  // Sync state variables to ref for physics and drawing loop access
  stateRef.current.searchQuery = searchQuery;
  stateRef.current.hideIsolated = hideIsolated;

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

    // Scatter nodes in a circle, preserving existing positions if present
    const ids = Object.keys(nodeMap);
    const R = Math.min(200, 40 + ids.length * 20);
    const prevNodes = stateRef.current.nodes || {};

    // Get logical dimensions for positioning
    const rect = canvasRef.current?.getBoundingClientRect();
    const lw = rect?.width || 800;
    const lh = rect?.height || 600;

    ids.forEach((id, i) => {
      const existing = prevNodes[id];
      if (existing && existing.x !== 0 && existing.y !== 0) {
        nodeMap[id].x = existing.x;
        nodeMap[id].y = existing.y;
        nodeMap[id].vx = existing.vx;
        nodeMap[id].vy = existing.vy;
      } else {
        const angle = (i / ids.length) * Math.PI * 2;
        nodeMap[id].x = Math.cos(angle) * R + (lw / 2);
        nodeMap[id].y = Math.sin(angle) * R + (lh / 2);
      }
    });

    stateRef.current.nodes = nodeMap;
    stateRef.current.edges = edges;
    stateRef.current.tick = 0; // Reset simulation cooling
  }, [notes]);

  /* ── Canvas resize observer ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const rect = canvas.parentElement.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const ctx = canvas.getContext('2d');
      ctx.resetTransform();
      ctx.scale(dpr, dpr);
    });
    ro.observe(canvas.parentElement);
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext('2d');
    ctx.resetTransform();
    ctx.scale(dpr, dpr);

    return () => ro.disconnect();
  }, []);

  /* ── Node radius based on degree ── */
  const nodeRadius = (node) => 5 + Math.min(node.degree * 1.8, 12);

  /* ── Draw ── */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { nodes, edges, transform, hoveredId, searchQuery, hideIsolated } = stateRef.current;

    // Use logical width and height for drawing bounds
    const rect = canvas.getBoundingClientRect();
    const W = rect.width, H = rect.height;

    // We clear the entire physical canvas
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // Subtle grid dots
    ctx.fillStyle = 'rgba(15, 23, 42, 0.05)';
    const gs = 45 * transform.scale;
    const ox = transform.x % gs, oy = transform.y % gs;
    for (let gx = ox; gx < W; gx += gs) {
      for (let gy = oy; gy < H; gy += gs) {
        ctx.beginPath();
        ctx.arc(gx, gy, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.scale, transform.scale);

    let ids = Object.keys(nodes);
    if (hideIsolated) {
      ids = ids.filter(id => nodes[id].degree > 0);
    }

    if (ids.length === 0) {
      ctx.restore();
      ctx.fillStyle = '#64748b'; // Slate 500
      ctx.font = '14px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        hideIsolated && Object.keys(nodes).length > 0 
          ? 'Tutte le note sono isolate' 
          : 'Nessuna nota da visualizzare', 
        W / 2, 
        H / 2
      );
      return;
    }

    const query = (searchQuery || '').trim().toLowerCase();
    const hasQuery = query.length > 0;
    const matchesQuery = (node) => {
      if (!hasQuery) return true;
      return node.title.toLowerCase().includes(query);
    };

    // Draw edges
    edges.forEach(([sid, tid]) => {
      const a = nodes[sid], b = nodes[tid];
      if (!a || !b) return;
      if (hideIsolated && (a.degree === 0 || b.degree === 0)) return;

      const aMatches = matchesQuery(a);
      const bMatches = matchesQuery(b);

      let edgeOpacity = 1.0;
      if (hasQuery) {
        if (!aMatches || !bMatches) {
          edgeOpacity = 0.1;
        }
      }

      const isHoveredEdge = hoveredId === sid || hoveredId === tid;
      const isSelectedEdge = selectedNoteId === sid || selectedNoteId === tid;
      const isHighlighted = isHoveredEdge || isSelectedEdge;

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);

      if (isHighlighted) {
        ctx.strokeStyle = isSelectedEdge 
          ? `rgba(244, 63, 94, ${edgeOpacity * 0.8})` // Coral Rose
          : `rgba(6, 182, 212, ${edgeOpacity * 0.8})`; // Cyan
        ctx.lineWidth = 1.8;
      } else {
        ctx.strokeStyle = `rgba(148, 163, 184, ${edgeOpacity * 0.25})`; // Light slate
        ctx.lineWidth = 0.8;
      }
      ctx.stroke();
    });

    // Draw nodes
    ids.forEach(id => {
      const node = nodes[id];
      const r = nodeRadius(node);
      const isHovered = hoveredId === id;
      const isSelected = selectedNoteId === id;
      const isConnected = hoveredId && (nodes[hoveredId]?.links?.includes(id) || node.links?.includes(hoveredId));

      const matches = matchesQuery(node);
      let opacity = 1.0;
      if (hasQuery && !matches) {
        opacity = 0.15;
      }

      // Draw soft hover/selection background glow (crisp light theme shadow)
      if ((isHovered || isSelected) && opacity > 0.5) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 5, 0, Math.PI * 2);
        ctx.fillStyle = isSelected 
          ? 'rgba(244, 63, 94, 0.15)' // Pink-red shadow
          : 'rgba(6, 182, 212, 0.15)'; // Cyan shadow
        ctx.fill();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);

      if (isSelected) {
        ctx.fillStyle = `rgba(244, 63, 94, ${opacity})`; // Rose 500
      } else if (isHovered) {
        ctx.fillStyle = `rgba(6, 182, 212, ${opacity})`; // Cyan 500
      } else if (isConnected) {
        ctx.fillStyle = `rgba(99, 102, 241, ${opacity})`; // Indigo 500
      } else if (node.degree === 0) {
        ctx.fillStyle = `rgba(148, 163, 184, ${opacity})`; // Slate 400
      } else {
        // Dynamic indigo gradient based on degree
        const t = Math.min(node.degree / 6, 1);
        const r1 = Math.round(129 + t * (79 - 129));   // Indigo 400 (#818cf8) to Indigo 600 (#4f46e5)
        const g1 = Math.round(140 + t * (70 - 140));
        const b1 = Math.round(248 + t * (229 - 248));
        ctx.fillStyle = `rgba(${r1},${g1},${b1},${opacity})`;
      }
      ctx.fill();

      // Node border: standard white border to overlap gracefully
      ctx.strokeStyle = isSelected 
        ? `rgba(244, 63, 94, ${opacity})`
        : isHovered 
          ? `rgba(6, 182, 212, ${opacity})`
          : `rgba(255, 255, 255, ${opacity})`;
      ctx.lineWidth = isSelected || isHovered ? 2 : 1.5;
      ctx.stroke();

      // Node label
      const showLabel = transform.scale > 0.45 || isHovered || isSelected || (hasQuery && matches);
      if (showLabel) {
        const label = node.title.length > 20 ? node.title.substring(0, 20) + '…' : node.title;
        ctx.font = `${isSelected || isHovered || (hasQuery && matches) ? '600' : '400'} ${Math.max(9.5, 11 * transform.scale) / transform.scale}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = 'center';

        // White border around text for contrast
        ctx.strokeStyle = `rgba(255, 255, 255, ${opacity * 0.95})`;
        ctx.lineWidth = 3;

        if (isSelected) {
          ctx.fillStyle = `rgba(225, 29, 72, ${opacity})`; // Rose 700
        } else if (isHovered) {
          ctx.fillStyle = `rgba(8, 145, 178, ${opacity})`; // Cyan 700
        } else if (hasQuery && matches) {
          ctx.fillStyle = `rgba(15, 23, 42, ${opacity})`; // Slate 900
        } else {
          ctx.fillStyle = `rgba(71, 85, 105, ${opacity})`; // Slate 600
        }

        ctx.strokeText(label, node.x, node.y + r + 13);
        ctx.fillText(label, node.x, node.y + r + 13);
      }
    });

    ctx.restore();
  }, [selectedNoteId]);

  /* ── Animation loop with Cooldown optimization ── */
  useEffect(() => {
    const loop = () => {
      const { nodes, edges, tick, drag, panStart, hideIsolated } = stateRef.current;
      const canvas = canvasRef.current;
      if (canvas && Object.keys(nodes).length > 0) {
        // Only run physics if tick < 300 OR user is actively dragging/panning
        if (tick < 300 || drag || panStart) {
          const rect = canvas.getBoundingClientRect();
          const stepsPerFrame = tick < 100 ? 4 : 1;
          simulate(nodes, edges, rect.width, rect.height, stepsPerFrame, hideIsolated);
          stateRef.current.tick++;
        }
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
    const { nodes, hideIsolated } = stateRef.current;
    const ids = Object.keys(nodes);
    for (const id of ids) {
      const n = nodes[id];
      if (hideIsolated && n.degree === 0) continue;
      const r = nodeRadius(n) + 5;
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
    state.tick = 0; // Wake up physics to let graph settle after drag
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
    <div style={{ 
      position: 'relative', 
      width: '100%', 
      height: '100%', 
      minHeight: 520, 
      background: '#ffffff', 
      borderRadius: 20, 
      overflow: 'hidden', 
      border: '1px solid #e2e8f0',
      boxShadow: '0 4px 20px -2px rgba(0,0,0,0.05), 0 2px 8px -1px rgba(0,0,0,0.03)',
      fontFamily: '"Outfit", "Inter", system-ui, -apple-system, sans-serif'
    }}>
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

      {/* Floating Search Bar */}
      <div style={{
        position: 'absolute', top: 14, left: 14,
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(12px)',
        border: '1px solid #e2e8f0',
        borderRadius: 12, padding: '6px 12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        zIndex: 10,
        width: 220,
        transition: 'all 0.2s',
      }}>
        <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>🔍</span>
        <input
          type="text"
          placeholder="Cerca nota..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{
            border: 'none', background: 'transparent',
            outline: 'none', fontSize: '0.8rem', color: '#1e293b',
            width: '100%',
            fontFamily: 'inherit',
          }}
        />
        {searchQuery && (
          <button 
            onClick={() => setSearchQuery('')}
            style={{
              border: 'none', background: 'transparent',
              color: '#94a3b8', fontSize: '0.9rem', cursor: 'pointer',
              padding: '0 2px',
              display: 'flex', alignItems: 'center',
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: 'fixed', left: tooltip.x, top: tooltip.y,
          background: 'rgba(255, 255, 255, 0.95)', color: '#1e293b',
          padding: '6px 14px', borderRadius: 10, fontSize: '0.8rem', fontWeight: 600,
          pointerEvents: 'none', zIndex: 9999, border: '1px solid rgba(99, 102, 241, 0.15)',
          backdropFilter: 'blur(12px)', whiteSpace: 'nowrap',
          transform: 'translateX(-50%)',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -4px rgba(0, 0, 0, 0.05)',
        }}>
          {tooltip.title}
        </div>
      )}

      {/* Top-right stats pills group */}
      <div style={{
        position: 'absolute', top: 14, right: 14,
        display: 'flex', gap: 6, alignItems: 'center',
        zIndex: 10,
      }}>
        <div style={{
          background: '#eff6ff', border: '1px solid #bfdbfe',
          borderRadius: 20, padding: '4px 10px', fontSize: '0.72rem',
          color: '#1e40af', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
        }}>
          <span style={{ fontSize: '0.55rem' }}>🔵</span> {nodeCount} note
        </div>
        <div style={{
          background: '#f0fdf4', border: '1px solid #bbf7d0',
          borderRadius: 20, padding: '4px 10px', fontSize: '0.72rem',
          color: '#166534', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
        }}>
          <span style={{ fontSize: '0.55rem' }}>🟢</span> {edgeCount} collegamenti
        </div>
        {!hideIsolated && (
          <div style={{
            background: '#f8fafc', border: '1px solid #e2e8f0',
            borderRadius: 20, padding: '4px 10px', fontSize: '0.72rem',
            color: '#475569', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
            boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
          }}>
            <span style={{ fontSize: '0.55rem' }}>⚪</span> {isolatedCount} isolate
          </div>
        )}
      </div>

      {/* Bottom-left controls & legend panel */}
      <div style={{
        position: 'absolute', bottom: 14, left: 14,
        display: 'flex', flexDirection: 'column', gap: 6,
        zIndex: 10,
      }}>
        <label style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(12px)',
          border: '1px solid #e2e8f0',
          borderRadius: 10, padding: '6px 12px', fontSize: '0.75rem', color: '#475569',
          cursor: 'pointer', userSelect: 'none',
          boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
          transition: 'all 0.15s',
          fontWeight: 500,
        }}
        onMouseEnter={e => e.currentTarget.style.background = '#ffffff'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.85)'}
        >
          <input
            type="checkbox"
            checked={hideIsolated}
            onChange={e => {
              setHideIsolated(e.target.checked);
              stateRef.current.tick = 0; // Wake up physics to recalculate
            }}
            style={{
              cursor: 'pointer',
              accentColor: '#6366f1',
            }}
          />
          <span>Nascondi note isolate</span>
        </label>

        <div style={{
          display: 'flex', gap: 12, alignItems: 'center',
          background: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(12px)',
          border: '1px solid #e2e8f0',
          borderRadius: 10, padding: '6px 12px', fontSize: '0.7rem', color: '#64748b',
          boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
        }}>
          <span>🖱️ Trascina nodi</span>
          <span>⚙️ Zoom</span>
          <span>👆 Click per aprire</span>
        </div>
      </div>

      {/* Floating zoom/pan controls */}
      <div style={{ position: 'absolute', bottom: 14, right: 14, display: 'flex', gap: 6, zIndex: 10 }}>
        {[
          { label: '＋', action: () => { stateRef.current.transform.scale = Math.min(4, stateRef.current.transform.scale * 1.2); } },
          { label: '－', action: () => { stateRef.current.transform.scale = Math.max(0.15, stateRef.current.transform.scale * 0.83); } },
          { label: '⟳', action: () => { stateRef.current.transform = { x: 0, y: 0, scale: 1 }; stateRef.current.tick = 0; } },
        ].map(btn => (
          <button 
            key={btn.label} 
            onClick={btn.action} 
            style={{
              width: 34, height: 34, borderRadius: 10,
              background: 'rgba(255, 255, 255, 0.85)',
              backdropFilter: 'blur(12px)',
              border: '1px solid #e2e8f0',
              color: '#475569', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#6366f1';
              e.currentTarget.style.color = '#ffffff';
              e.currentTarget.style.borderColor = '#6366f1';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.85)';
              e.currentTarget.style.color = '#475569';
              e.currentTarget.style.borderColor = '#e2e8f0';
            }}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
}
