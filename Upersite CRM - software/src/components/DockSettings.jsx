import { useState } from 'react';
import { DOCK_ITEM_BY_ID, DEFAULT_DOCK, resolveDock } from './dockItems.js';

// Impostazioni → Pulsanti: ordine dei pulsanti della barra in basso e quali stanno nel menu ⋯

const LISTS = [
  { key: 'main', title: 'In barra', hint: 'Sempre visibili, nell’ordine da sinistra a destra' },
  { key: 'more', title: 'Nel menu ⋯', hint: 'Si aprono dal pulsante ⋯ alla fine della barra' },
];

const css = `
.dk-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 760px) { .dk-grid { grid-template-columns: 1fr; } }
.dk-list { background: var(--bg-input); border-radius: 14px; padding: 12px; min-height: 120px; border: 2px dashed transparent; transition: border-color .15s, background .15s; }
.dk-list.over { border-color: var(--primary-light); background: var(--primary-ghost); }
.dk-row { display: flex; align-items: center; gap: 10px; background: var(--bg-card); border: 1px solid var(--border-light); border-radius: 12px; padding: 8px 10px; margin-bottom: 8px; cursor: grab; }
.dk-row.dragging { opacity: .4; }
.dk-row.target { box-shadow: 0 -3px 0 var(--primary); }
.dk-dot { width: 36px; height: 36px; border-radius: 50%; flex: none; display: flex; align-items: center; justify-content: center; color: #fff; }
.dk-dot > span { display: flex; transform: scale(.62); }
.dk-name { flex: 1; min-width: 0; font-size: .85rem; font-weight: 600; color: var(--text-primary); }
.dk-handle { color: var(--text-tertiary); letter-spacing: -2px; user-select: none; }
.dk-empty { text-align: center; color: var(--text-tertiary); font-size: .78rem; padding: 18px 8px; }
`;

// `item` si usa come <item.Icon />: il linter non lo conta come uso, ma serve (senza, la scheda Pulsanti va in errore)
// eslint-disable-next-line no-unused-vars
function MiniDot({ item }) {
  return (
    <span className="dk-dot" style={{ background: '#17201C' }}>
      <span><item.Icon /></span>
    </span>
  );
}

export default function DockSettings({ settings, updateSettings }) {
  const layout = resolveDock(settings.dock);
  const [dragId, setDragId] = useState(null);
  const [overList, setOverList] = useState(null);
  const [overRow, setOverRow] = useState(null);

  const save = next => updateSettings({ dock: next });

  // Sposta `id` nella lista `to`, prima di `beforeId` (o in fondo)
  const place = (id, to, beforeId = null) => {
    const next = { main: layout.main.filter(x => x !== id), more: layout.more.filter(x => x !== id) };
    const at = beforeId ? next[to].indexOf(beforeId) : -1;
    next[to].splice(at < 0 ? next[to].length : at, 0, id);
    save(next);
  };

  const nudge = (listKey, id, delta) => {
    const list = [...layout[listKey]];
    const i = list.indexOf(id);
    const j = i + delta;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    save({ ...layout, [listKey]: list });
  };

  const endDrag = () => { setDragId(null); setOverList(null); setOverRow(null); };

  const isDefault = JSON.stringify(layout) === JSON.stringify(DEFAULT_DOCK);

  return (
    <>
      <style>{css}</style>
      <h3 style={{ margin: '0 0 6px' }}>Pulsanti in basso a sinistra</h3>
      <p style={{ margin: '0 0 16px', fontSize: '.85rem', color: 'var(--text-secondary)' }}>
        Trascina i pulsanti per cambiarne l’ordine, oppure da una lista all’altra per metterli nel menu <b>⋯</b>. Quelli nel menu si aprono dal pulsante ⋯ alla fine della barra. Sul telefono la barra mostra i primi 4 pulsanti e mette gli altri nel menu. Le modifiche si vedono subito.
      </p>

      <div className="dk-grid">
        {LISTS.map(({ key, title, hint }) => (
          <div key={key}>
            <div style={{ fontWeight: 700, fontSize: '.9rem' }}>{title} <span style={{ color: 'var(--text-tertiary)', fontWeight: 600 }}>({layout[key].length})</span></div>
            <div style={{ fontSize: '.72rem', color: 'var(--text-tertiary)', margin: '2px 0 8px' }}>{hint}</div>
            <div
              className={`dk-list${overList === key && dragId ? ' over' : ''}`}
              onDragOver={e => { if (dragId) { e.preventDefault(); setOverList(key); } }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) { setOverList(null); setOverRow(null); } }}
              onDrop={e => { e.preventDefault(); if (dragId) place(dragId, key, null); endDrag(); }}
            >
              {layout[key].length === 0 && <div className="dk-empty">{key === 'more' ? 'Nessun pulsante nel menu: trascina qui quelli che vuoi nascondere.' : 'Nessun pulsante in barra.'}</div>}
              {layout[key].map((id, i) => {
                const item = DOCK_ITEM_BY_ID[id];
                const other = key === 'main' ? 'more' : 'main';
                return (
                  <div
                    key={id}
                    className={`dk-row${dragId === id ? ' dragging' : ''}${overRow === id && dragId !== id ? ' target' : ''}`}
                    draggable
                    onDragStart={e => { setDragId(id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); }}
                    onDragEnd={endDrag}
                    onDragOver={e => { if (dragId) { e.preventDefault(); e.stopPropagation(); setOverList(key); setOverRow(id); } }}
                    onDrop={e => { e.preventDefault(); e.stopPropagation(); if (dragId && dragId !== id) place(dragId, key, id); endDrag(); }}
                  >
                    <span className="dk-handle" aria-hidden="true">⋮⋮</span>
                    <MiniDot item={item} />
                    <span className="dk-name">{item.title}</span>
                    <button className="btn btn-ghost btn-sm" style={{ padding: '2px 7px' }} disabled={i === 0} onClick={() => nudge(key, id, -1)} aria-label={`Sposta ${item.title} su`}>▲</button>
                    <button className="btn btn-ghost btn-sm" style={{ padding: '2px 7px' }} disabled={i === layout[key].length - 1} onClick={() => nudge(key, id, 1)} aria-label={`Sposta ${item.title} giù`}>▼</button>
                    <button className="btn btn-secondary btn-sm" style={{ whiteSpace: 'nowrap' }} onClick={() => place(id, other)}>
                      {key === 'main' ? 'Nel menu ⋯' : 'In barra'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        <button className="btn btn-secondary btn-sm" disabled={isDefault} onClick={() => save({ main: [...DEFAULT_DOCK.main], more: [] })}>
          Ripristina disposizione predefinita
        </button>
      </div>
    </>
  );
}
