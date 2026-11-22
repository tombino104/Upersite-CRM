import { useState, useEffect, useCallback } from 'react';
import { Folder, FolderPlus, ChevronLeft, HardDrive, Check, X } from 'lucide-react';
import { CRM_REQUEST_HEADERS } from '../utils/storage';

// Scelta di una cartella sul server (per i backup). Mostra solo le cartelle consentite dal server:
// con Docker /backups, /data e /cartelle (dove montare le cartelle di Umbrel), altrimenti la cartella utente.
export default function FolderPicker({ initialPath, onSelect, onClose }) {
    const [view, setView] = useState({ path: null, parent: null, dirs: [], roots: [] });
    const [error, setError] = useState('');
    const [newName, setNewName] = useState('');
    const [busy, setBusy] = useState(false);

    const load = useCallback(async (target) => {
        setError('');
        try {
            const res = await fetch(`/api/fs/dirs${target ? `?path=${encodeURIComponent(target)}` : ''}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Cartella non disponibile');
            setView(data);
        } catch (e) {
            // La cartella salvata non è più disponibile: si riparte dall'elenco delle cartelle consentite
            if (target) {
                setError(`${e.message}. Scegli tra le cartelle disponibili.`);
                const res = await fetch('/api/fs/dirs');
                if (res.ok) setView(await res.json());
            } else {
                setError(e.message);
            }
        }
    }, []);

    useEffect(() => { load(initialPath || ''); }, [load, initialPath]);

    const createFolder = async () => {
        if (!newName.trim() || !view.path) return;
        setBusy(true);
        setError('');
        try {
            const res = await fetch('/api/fs/mkdir', { method: 'POST', headers: CRM_REQUEST_HEADERS, body: JSON.stringify({ path: view.path, name: newName.trim() }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Impossibile creare la cartella');
            setNewName('');
            await load(data.path);
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="modal-overlay animate-fade-in" style={{ zIndex: 2400 }} onClick={onClose}>
            <div className="modal-content animate-scale-in fp-modal" onClick={e => e.stopPropagation()}>
                <div className="fp-head">
                    <h3>Scegli la cartella dei backup</h3>
                    <button className="btn btn-ghost btn-icon-sm" onClick={onClose} aria-label="Chiudi"><X size={18} aria-hidden="true" /></button>
                </div>

                <div className="fp-path">
                    {view.path ? (
                        <>
                            <button className="btn btn-ghost btn-sm" onClick={() => load(view.parent || '')} title="Cartella superiore">
                                <ChevronLeft size={16} aria-hidden="true" /> Su
                            </button>
                            <code>{view.path}</code>
                        </>
                    ) : (
                        <span>Cartelle disponibili</span>
                    )}
                </div>

                <div className="fp-list">
                    {!view.path && view.roots.map(root => (
                        <button key={root} className="fp-item" onClick={() => load(root)}>
                            <HardDrive size={18} aria-hidden="true" />
                            <span>{root}{view.hints?.[root] && <small className="fp-hint">sul server: {view.hints[root]}</small>}</span>
                        </button>
                    ))}
                    {view.path && view.dirs.map(name => (
                        <button key={name} className="fp-item" onClick={() => load(`${view.path.replace(/[\\/]+$/, '')}/${name}`)}>
                            <Folder size={18} aria-hidden="true" /> {name}
                        </button>
                    ))}
                    {view.path && view.dirs.length === 0 && <div className="fp-empty">Nessuna sottocartella</div>}
                    {!view.path && view.roots.length === 0 && <div className="fp-empty">Il server non ha cartelle disponibili</div>}
                </div>

                {view.path && (
                    <div className="fp-new">
                        <input className="input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nuova cartella"
                            onKeyDown={e => { if (e.key === 'Enter') createFolder(); }} />
                        <button className="btn btn-secondary" onClick={createFolder} disabled={busy || !newName.trim()}>
                            <FolderPlus size={16} aria-hidden="true" /> Crea
                        </button>
                    </div>
                )}

                {error && <div className="fp-error">{error}</div>}

                <div className="fp-actions">
                    <button className="btn btn-secondary" onClick={onClose}>Annulla</button>
                    <button className="btn btn-primary" disabled={!view.path} onClick={() => onSelect(view.path)}>
                        <Check size={16} aria-hidden="true" /> Usa questa cartella
                    </button>
                </div>

                <style>{`
                    .fp-modal { max-width: 520px; width: 100%; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
                    .fp-head { display: flex; align-items: center; justify-content: space-between; }
                    .fp-head h3 { margin: 0; font-size: 1rem; }
                    .fp-path { display: flex; align-items: center; gap: 8px; min-height: 32px; font-size: 0.85rem; color: var(--text-secondary); }
                    .fp-path code { font-size: 0.8rem; background: var(--bg-input); padding: 4px 8px; border-radius: 6px; overflow-wrap: anywhere; }
                    .fp-list { border: 1px solid var(--border); border-radius: 10px; max-height: 300px; overflow-y: auto; padding: 4px; }
                    .fp-item { width: 100%; display: flex; align-items: center; gap: 10px; padding: 9px 10px; border: none; border-radius: 8px;
                        background: transparent; color: var(--text-primary); font: inherit; font-size: 0.875rem; text-align: left; cursor: pointer; }
                    .fp-item svg { color: var(--text-secondary); flex-shrink: 0; }
                    .fp-item:hover { background: var(--bg-hover); }
                    .fp-hint { display: block; font-size: 0.72rem; color: var(--text-tertiary); }
                    .fp-empty { padding: 14px; text-align: center; color: var(--text-tertiary); font-size: 0.85rem; }
                    .fp-new { display: flex; gap: 8px; }
                    .fp-new .input { flex: 1; }
                    .fp-error { color: var(--danger); font-size: 0.8rem; }
                    .fp-actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
                `}</style>
            </div>
        </div>
    );
}
