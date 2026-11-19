import { useState, useEffect, useRef } from 'react';
import { DOCK_ITEM_BY_ID } from './dockItems.js';

// Pulsanti tondi in basso a sinistra. Quelli messi "nel menu" escono verso l'alto dal pallino ⋯,
// uno dopo l'altro, come lo stack dei Download nel Dock di macOS.

const STEP = 70; // 60px di pulsante + 10px di spazio

const css = `
.dock { position: fixed; bottom: 30px; left: 100px; z-index: 100; display: flex; align-items: flex-end; gap: 10px; }
.dock-btn {
  position: relative; width: 60px; height: 60px; border-radius: 50%; border: none; color: #fff; cursor: pointer;
  display: flex; align-items: center; justify-content: center; padding: 0;
  box-shadow: 0 4px 14px rgba(var(--glow), 0.25);
  transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.dock-btn:hover { transform: scale(1.1) rotate(var(--tilt, 5deg)); box-shadow: 0 6px 18px rgba(var(--glow), 0.32); }
.dock-btn:focus-visible { outline: 3px solid rgba(var(--glow), 0.55); outline-offset: 3px; }
.dock-more { position: relative; }
.dock-more-icon { display: flex; transition: transform 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
.dock-more.open .dock-more-icon { transform: rotate(90deg); }
.dock-count {
  position: absolute; top: -4px; right: -4px; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 10px;
  background: var(--primary, #1F6B4F); color: #fff; font-size: 0.68rem; font-weight: 700; border: 2px solid #fff;
  display: flex; align-items: center; justify-content: center; transition: opacity 0.2s, transform 0.3s;
}
.dock-more.open .dock-count { opacity: 0; transform: scale(0.4); }
.dock-fan-item {
  position: absolute; left: 0; bottom: calc(var(--n) * ${STEP}px); width: 60px; height: 60px;
  transform: translateY(calc(var(--n) * ${STEP}px)) scale(0.35); opacity: 0; pointer-events: none;
  transition: transform 0.35s cubic-bezier(0.4, 0, 0.9, 0.5) var(--close-delay), opacity 0.22s ease var(--close-delay);
}
.dock-more.open .dock-fan-item {
  transform: translateY(0) scale(1); opacity: 1; pointer-events: auto;
  transition: transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) var(--open-delay), opacity 0.25s ease var(--open-delay);
}
.dock-label {
  position: absolute; left: 72px; top: 50%; transform: translateY(-50%) translateX(-6px); white-space: nowrap; pointer-events: none;
  background: var(--bg-card, #fff); color: var(--text-primary, #17201C); font-size: 0.78rem; font-weight: 600;
  padding: 5px 11px; border-radius: 9px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.14); opacity: 0;
  transition: opacity 0.2s ease, transform 0.25s ease;
}
.dock-more.open .dock-label { opacity: 1; transform: translateY(-50%); transition-delay: calc(var(--open-delay) + 0.12s); }
@media (max-width: 768px) {
  .dock { left: 12px; bottom: 14px; gap: 4px; }
  .dock-btn, .dock-fan-item { width: 40px; height: 40px; }
  .dock-btn svg { width: 20px; height: 20px; }
  .dock-label { left: 50px; }
}
@media (prefers-reduced-motion: reduce) {
  .dock-btn, .dock-more-icon, .dock-fan-item, .dock-label { transition-duration: 0.01s !important; transition-delay: 0s !important; }
}
`;

const dockButtonStyle = () => ({
  background: '#17201C',
  '--glow': '23, 32, 28',
  '--tilt': '0deg',
});

export default function FloatingDock({ layout, actions }) {
  const [open, setOpen] = useState(false);
  const moreRef = useRef(null);

  // Il menu si chiude con un click fuori o con Esc
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = e => { if (moreRef.current && !moreRef.current.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = id => {
    setOpen(false);
    actions[id]?.();
  };

  const moreItems = layout.more.map(id => DOCK_ITEM_BY_ID[id]);

  return (
    <div className="dock">
      <style>{css}</style>

      {layout.main.map(id => {
        const item = DOCK_ITEM_BY_ID[id];
        return (
          <button key={id} className="dock-btn" title={item.title} aria-label={item.title} style={dockButtonStyle(item)} onClick={() => run(id)}>
            <item.Icon />
          </button>
        );
      })}

      {moreItems.length > 0 && (
        <div ref={moreRef} className={`dock-more${open ? ' open' : ''}`}>
          {moreItems.map((item, i) => (
            <div
              key={item.id} className="dock-fan-item" aria-hidden={!open}
              style={{ '--n': i + 1, '--open-delay': `${i * 45}ms`, '--close-delay': `${(moreItems.length - 1 - i) * 30}ms` }}
            >
              <button className="dock-btn" tabIndex={open ? 0 : -1} title={item.title} aria-label={item.title} style={dockButtonStyle(item)} onClick={() => run(item.id)}>
                <item.Icon />
              </button>
              <span className="dock-label">{item.title}</span>
            </div>
          ))}

          <button
            className="dock-btn" title="Altri pulsanti" aria-label="Altri pulsanti" aria-expanded={open}
            style={{ background: '#3E4741', '--glow': '23, 32, 28', '--tilt': '0deg' }}
            onClick={() => setOpen(o => !o)}
          >
            <span className="dock-more-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
              </svg>
            </span>
            <span className="dock-count">{moreItems.length}</span>
          </button>
        </div>
      )}
    </div>
  );
}
