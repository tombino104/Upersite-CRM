import { useState, useEffect, useRef } from 'react';
import { DOCK_ITEM_BY_ID } from './dockItems.js';

// Barra dei pulsanti in basso. Su computer è una barra sottile in basso a sinistra; quelli messi "nel menu"
// (Impostazioni → Pulsanti) stanno nel menu ⋯. Su telefono diventa la barra di navigazione in fondo allo
// schermo: i primi pulsanti restano visibili, gli altri finiscono nel menu ⋯.

const MOBILE_QUERY = '(max-width: 768px)';
const MOBILE_VISIBLE = 4; // pulsanti visibili sul telefono, oltre al menu ⋯

const css = `
.dock {
  position: fixed; bottom: 24px; left: 24px; z-index: 960; /* sopra il pulsante della chat (950), sotto le finestre (1000) */
  display: flex; align-items: center; gap: 2px; padding: 5px;
  background: var(--bg-card, #fff); border: 1px solid var(--border, #E2E0D8); border-radius: 14px;
  box-shadow: 0 4px 16px rgba(23, 32, 28, 0.08);
}
.dock-btn {
  position: relative; width: 42px; height: 42px; border-radius: 10px; border: none; padding: 0;
  background: transparent; color: var(--text-secondary, #5E665F); cursor: pointer;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
  transition: background 0.15s ease, color 0.15s ease;
}
.dock-btn svg { width: 20px; height: 20px; stroke-width: 1.9; flex-shrink: 0; }
.dock-btn:hover, .dock-btn[aria-expanded="true"] { background: var(--bg-hover, #EFEEE8); color: var(--text-primary, #17201C); }
.dock-btn:focus-visible { outline: 2px solid var(--primary, #1F6B4F); outline-offset: 1px; }
.dock-btn-label { display: none; }
.dock-sep { width: 1px; height: 24px; background: var(--border, #E2E0D8); margin: 0 3px; }
.dock-more { position: relative; display: flex; }
.dock-count {
  position: absolute; top: 3px; right: 3px; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px;
  background: var(--primary, #1F6B4F); color: #fff; font-size: 0.62rem; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.dock-menu {
  position: absolute; bottom: calc(100% + 12px); left: -6px; min-width: 230px; padding: 6px;
  background: var(--bg-card, #fff); border: 1px solid var(--border, #E2E0D8); border-radius: 12px;
  box-shadow: 0 10px 30px rgba(23, 32, 28, 0.14);
  opacity: 0; transform: translateY(6px); pointer-events: none; transition: opacity 0.15s ease, transform 0.15s ease;
}
.dock-more.open .dock-menu { opacity: 1; transform: translateY(0); pointer-events: auto; }
.dock-menu-item {
  width: 100%; display: flex; align-items: center; gap: 10px; padding: 9px 10px; border: none; border-radius: 8px;
  background: transparent; color: var(--text-primary, #17201C); font: inherit; font-size: 0.875rem; text-align: left; cursor: pointer;
}
.dock-menu-item svg { width: 18px; height: 18px; stroke-width: 1.9; color: var(--text-secondary, #5E665F); flex-shrink: 0; }
.dock-menu-item:hover { background: var(--bg-hover, #EFEEE8); }

@media ${MOBILE_QUERY} {
  .dock {
    left: 0; right: 0; bottom: 0; border-radius: 0; border-width: 1px 0 0; box-shadow: none;
    padding: 4px 6px calc(4px + env(safe-area-inset-bottom, 0px)); gap: 0; justify-content: space-around;
  }
  .dock > .dock-btn, .dock-more { flex: 1 1 0; min-width: 0; }
  .dock > .dock-btn, .dock-more > .dock-btn { width: 100%; height: 52px; }
  .dock-btn-label {
    display: block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font-size: 0.62rem; font-weight: 600; line-height: 1;
  }
  .dock-sep { display: none; }
  .dock-count { top: 4px; right: calc(50% - 20px); }
  .dock-menu { left: auto; right: 0; bottom: calc(100% + 10px); }
}
@media (prefers-reduced-motion: reduce) {
  .dock-btn, .dock-menu { transition: none !important; }
}
`;

function useIsMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return mobile;
}

// Nome corto sotto l'icona (solo telefono)
const shortTitle = title => title.split(' ')[0];

export default function FloatingDock({ layout, actions }) {
  const [open, setOpen] = useState(false);
  const moreRef = useRef(null);
  const isMobile = useIsMobile();

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

  // Sul telefono solo i primi pulsanti stanno nella barra: gli altri si aggiungono al menu
  const mainIds = isMobile ? layout.main.slice(0, MOBILE_VISIBLE) : layout.main;
  const menuIds = isMobile ? [...layout.main.slice(MOBILE_VISIBLE), ...layout.more] : layout.more;
  const mainItems = mainIds.map(id => DOCK_ITEM_BY_ID[id]);
  const menuItems = menuIds.map(id => DOCK_ITEM_BY_ID[id]);

  return (
    <nav className="dock" aria-label="Strumenti">
      <style>{css}</style>

      {mainItems.map(item => (
        <button key={item.id} className="dock-btn" title={item.title} aria-label={item.title} onClick={() => run(item.id)}>
          <item.Icon />
          <span className="dock-btn-label">{shortTitle(item.title)}</span>
        </button>
      ))}

      {menuItems.length > 0 && (
        <>
          {mainItems.length > 0 && <span className="dock-sep" aria-hidden="true" />}
          <div ref={moreRef} className={`dock-more${open ? ' open' : ''}`}>
            <div className="dock-menu" role="menu" aria-hidden={!open}>
              {menuItems.map(item => (
                <button key={item.id} className="dock-menu-item" role="menuitem" tabIndex={open ? 0 : -1} onClick={() => run(item.id)}>
                  <item.Icon />
                  {item.title}
                </button>
              ))}
            </div>
            <button
              className="dock-btn" title="Altri strumenti" aria-label="Altri strumenti" aria-haspopup="menu" aria-expanded={open}
              onClick={() => setOpen(o => !o)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
              </svg>
              <span className="dock-btn-label">Altro</span>
              {!isMobile && <span className="dock-count">{menuItems.length}</span>}
            </button>
          </div>
        </>
      )}
    </nav>
  );
}
