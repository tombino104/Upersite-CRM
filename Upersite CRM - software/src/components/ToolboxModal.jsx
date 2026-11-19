import { useState, useMemo } from 'react';
import { generateId } from '../utils/storage';

// Cassetta degli attrezzi: link ai tool online usati per lavorare sui siti. Salvata in settings.toolbox.

const ALL = '__all__';
const FAV = '__fav__';

const PALETTE = [
  ['#1F6B4F', '#6FA88E'], ['#2F6FA8', '#74B9FF'], ['#3A9A6B', '#55EFC4'], ['#C24E36', '#FAB1A0'],
  ['#F59E0B', '#E3A93C'], ['#E84393', '#FD79A8'], ['#2F8F8A', '#8FC7C3'], ['#5E665F', '#98A09A'],
];

// Aggiunge https:// se manca e restituisce un URL valido (o null)
function normalizeUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
    return /^https?:$/.test(url.protocol) && url.hostname.includes('.') ? url.href : null;
  } catch {
    return null;
  }
}

const hostOf = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

// Nome proposto dal dominio: "pagespeed.web.dev" -> "Pagespeed"
const suggestName = url => {
  const parts = hostOf(url).split('.');
  const base = parts[0];
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : '';
};

const colorsFor = name => {
  let hash = 0;
  for (const ch of name || '?') hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
};

// Icona del sito (favicon). Se non carica passa a un servizio alternativo e poi alla lettera colorata.
function ToolIcon({ tool, size = 56 }) {
  const host = hostOf(tool.url);
  const sources = useMemo(() => [
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`,
    `https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`,
  ], [host]);
  // Tentativo corrente legato al dominio: se l'indirizzo cambia si riparte dalla prima fonte
  const [tried, setTried] = useState({ host, n: 0 });
  const attempt = tried.host === host ? tried.n : 0;
  const setAttempt = fn => setTried({ host, n: fn(attempt) });
  const [c1] = colorsFor(tool.name);

  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.3, flexShrink: 0, overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: attempt < sources.length ? 'var(--bg-input)' : c1,
      border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-xs)',
    }}>
      {attempt < sources.length ? (
        <img
          src={sources[attempt]} alt="" loading="lazy" referrerPolicy="no-referrer"
          style={{ width: size * 0.58, height: size * 0.58, objectFit: 'contain' }}
          onError={() => setAttempt(a => a + 1)}
          onLoad={e => { if (e.currentTarget.naturalWidth <= 16 && attempt === 0) setAttempt(1); }}
        />
      ) : (
        <span style={{ color: '#fff', fontWeight: 700, fontSize: size * 0.42 }}>{(tool.name || '?').charAt(0).toUpperCase()}</span>
      )}
    </div>
  );
}

function ToolForm({ cfg, initial, categories, onSave, onCancel }) {
  const [url, setUrl] = useState(initial?.url || '');
  const [name, setName] = useState(initial?.name || '');
  const [nameTouched, setNameTouched] = useState(Boolean(initial));
  const [category, setCategory] = useState(initial?.category || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [favorite, setFavorite] = useState(Boolean(initial?.favorite));
  const [error, setError] = useState('');

  const normalized = normalizeUrl(url);
  const preview = { url: normalized || '', name: name || suggestName(normalized || '') || '?' };

  const changeUrl = value => {
    setUrl(value);
    setError('');
    if (!nameTouched) setName(suggestName(normalizeUrl(value) || ''));
  };

  const submit = e => {
    e.preventDefault();
    if (!normalized) { setError(`Inserisci un indirizzo valido, ad esempio ${cfg.urlPlaceholder}`); return; }
    onSave({
      id: initial?.id || generateId(),
      url: normalized,
      name: name.trim() || suggestName(normalized),
      category: category.trim(),
      description: description.trim(),
      favorite,
      createdAt: initial?.createdAt || new Date().toISOString(),
    });
  };

  return (
    <div className="modal-overlay animate-fade-in" style={{ zIndex: 1100 }} onClick={onCancel}>
      <form className="modal-content animate-scale-in" style={{ maxWidth: 480, width: '92vw', padding: 24 }} onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
          {normalized ? <ToolIcon tool={preview} size={52} /> : <div style={{ width: 52, height: 52, borderRadius: 16, background: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>🔧</div>}
          <h3 style={{ margin: 0 }}>{initial ? cfg.editTitle : cfg.newTitle}</h3>
        </div>

        <label style={{ fontSize: '.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Indirizzo (link)</label>
        <input className="input" autoFocus placeholder={cfg.urlPlaceholder} value={url} onChange={e => changeUrl(e.target.value)} style={{ marginBottom: error ? 4 : 12 }} />
        {error && <div style={{ color: 'var(--danger)', fontSize: '.75rem', marginBottom: 10 }}>{error}</div>}

        <label style={{ fontSize: '.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Nome</label>
        <input className="input" placeholder="Come lo chiami" value={name} onChange={e => { setName(e.target.value); setNameTouched(true); }} style={{ marginBottom: 12 }} />

        <label style={{ fontSize: '.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Categoria</label>
        <input className="input" list={`toolbox-categories-${cfg.id}`} placeholder={cfg.categoryPlaceholder} value={category} onChange={e => setCategory(e.target.value)} style={{ marginBottom: 12 }} />
        <datalist id={`toolbox-categories-${cfg.id}`}>{categories.map(c => <option key={c} value={c} />)}</datalist>

        <label style={{ fontSize: '.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{cfg.descriptionLabel}</label>
        <input className="input" placeholder="Una riga di promemoria" value={description} onChange={e => setDescription(e.target.value)} style={{ marginBottom: 14 }} />

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.85rem', cursor: 'pointer', marginBottom: 20 }}>
          <input type="checkbox" checked={favorite} onChange={e => setFavorite(e.target.checked)} />
          ⭐ Tienilo tra i preferiti (sempre in alto)
        </label>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Annulla</button>
          <button type="submit" className="btn btn-primary" style={{ background: cfg.gradient }}>{initial ? 'Salva' : 'Aggiungi'}</button>
        </div>
      </form>
    </div>
  );
}

function ToolCard({ tool, onEdit, onDelete, onToggleFavorite }) {
  const [hover, setHover] = useState(false);
  const [c1] = colorsFor(tool.name);
  const open = () => window.open(tool.url, '_blank', 'noopener,noreferrer');

  const miniBtn = { width: 26, height: 26, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.8rem' };

  return (
    <div
      role="link" tabIndex={0} title={tool.url}
      onClick={open}
      onKeyDown={e => { if (e.key === 'Enter') open(); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', cursor: 'pointer', padding: 16, borderRadius: 18, background: 'var(--bg-card)',
        border: `1px solid ${hover ? c1 : 'var(--border)'}`,
        boxShadow: hover ? '0 10px 30px rgba(0,0,0,0.10)' : 'var(--shadow-card)',
        transform: hover ? 'translateY(-3px)' : 'none',
        transition: 'all .25s cubic-bezier(0.175,0.885,0.32,1.275)',
        display: 'flex', flexDirection: 'column', gap: 12, minHeight: 130,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <ToolIcon tool={tool} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tool.name}</div>
          <div style={{ fontSize: '.72rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hostOf(tool.url)}</div>
        </div>
      </div>
      {tool.description && (
        <div style={{ fontSize: '.8rem', color: 'var(--text-secondary)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{tool.description}</div>
      )}
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
        {tool.category && (
          <span style={{ fontSize: '.68rem', fontWeight: 600, padding: '2px 9px', borderRadius: 999, background: 'var(--primary-ghost)', color: 'var(--primary)' }}>{tool.category}</span>
        )}
      </div>

      <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4, opacity: hover || tool.favorite ? 1 : 0, transition: 'opacity .2s' }} onClick={e => e.stopPropagation()}>
        <button className="btn btn-ghost" style={{ ...miniBtn, opacity: tool.favorite ? 1 : 0.6 }} title={tool.favorite ? 'Togli dai preferiti' : 'Aggiungi ai preferiti'} onClick={() => onToggleFavorite(tool)}>{tool.favorite ? '⭐' : '☆'}</button>
        {hover && <button className="btn btn-ghost" style={miniBtn} title="Modifica" onClick={() => onEdit(tool)}>✏️</button>}
        {hover && <button className="btn btn-ghost" style={miniBtn} title="Elimina" onClick={() => onDelete(tool)}>🗑️</button>}
      </div>
    </div>
  );
}


const BOARDS = {
  tools: {
    id: 'tools', label: 'Attrezzi', icon: '🧰', singular: 'attrezzo', plural: 'attrezzi',
    gradient: '#D97706', accent: '#B45309',
    subtitle: n => (n === 0 ? 'I tuoi tool online, sempre a portata di mano' : `${n} ${n === 1 ? 'attrezzo' : 'attrezzi'} per lavorare sui siti`),
    emptyTitle: 'La cassetta è vuota',
    emptyText: 'Aggiungi i siti che usi di più (PageSpeed, Search Console, un contrasto colori…): l’icona viene presa dal sito.',
    emptyButton: '+ Aggiungi il primo attrezzo',
    notFound: 'Nessun attrezzo trovato.',
    newTitle: 'Nuovo attrezzo', editTitle: 'Modifica attrezzo',
    urlPlaceholder: 'pagespeed.web.dev', categoryPlaceholder: 'es. SEO, Velocità, Design…',
    descriptionLabel: 'A cosa serve (facoltativo)', searchPlaceholder: 'Cerca un attrezzo…',
    deleteNote: 'Viene tolto solo dalla cassetta, il sito non viene toccato.',
  },
  docs: {
    id: 'docs', label: 'Documenti', icon: '📚', singular: 'documento', plural: 'documenti',
    gradient: '#2F6FA8', accent: '#0652DD',
    subtitle: n => (n === 0 ? 'Guide, modelli e risorse da tenere sotto mano' : `${n} ${n === 1 ? 'documento' : 'documenti'} e risorse utili`),
    emptyTitle: 'Nessun documento salvato',
    emptyText: 'Aggiungi i link a guide, modelli, documentazioni e risorse che ti servono ma non sono strumenti.',
    emptyButton: '+ Aggiungi il primo documento',
    notFound: 'Nessun documento trovato.',
    newTitle: 'Nuovo documento', editTitle: 'Modifica documento',
    urlPlaceholder: 'docs.google.com/document/…', categoryPlaceholder: 'es. Guide, Modelli, Contratti…',
    descriptionLabel: 'Di cosa parla (facoltativo)', searchPlaceholder: 'Cerca un documento…',
    deleteNote: 'Viene tolto solo da qui, il documento originale non viene toccato.',
  },
};

// Una scheda (attrezzi o documenti): ricerca, filtri per categoria, griglia e modulo di aggiunta
function LinkBoard({ cfg, items, onChange }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(ALL);
  const [editing, setEditing] = useState(null); // null | 'new' | elemento
  const [confirmDelete, setConfirmDelete] = useState(null);

  const categories = useMemo(() => [...new Set(items.map(t => t.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it')), [items]);
  // Se l'ultima voce di una categoria viene tolta, si torna a "Tutti"
  const activeCategory = category === ALL || category === FAV || categories.includes(category) ? category : ALL;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter(t => activeCategory === ALL || (activeCategory === FAV ? t.favorite : t.category === activeCategory))
      .filter(t => !q || [t.name, t.url, t.category, t.description].some(v => (v || '').toLowerCase().includes(q)))
      .sort((a, b) => (Number(b.favorite) - Number(a.favorite)) || a.name.localeCompare(b.name, 'it'));
  }, [items, query, activeCategory]);

  const favCount = items.filter(t => t.favorite).length;

  const save = item => {
    onChange(items.some(t => t.id === item.id) ? items.map(t => (t.id === item.id ? item : t)) : [...items, item]);
    setEditing(null);
  };

  const remove = item => {
    onChange(items.filter(t => t.id !== item.id));
    setConfirmDelete(null);
  };

  const chip = (id, label, count) => (
    <button key={id} className={`btn btn-sm ${activeCategory === id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setCategory(id)}>
      {label} ({count})
    </button>
  );

  return (
    <>
      <div style={{ padding: '0 24px 14px', background: cfg.gradient, color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180, fontSize: '.8rem', opacity: 0.9 }}>{cfg.subtitle(items.length)}</div>
          <input className="input" style={{ maxWidth: 240, background: 'rgba(255,255,255,0.95)' }} placeholder={cfg.searchPlaceholder} value={query} onChange={e => setQuery(e.target.value)} />
          <button className="btn" style={{ background: '#fff', color: cfg.accent, fontWeight: 700 }} onClick={() => setEditing('new')}>+ Aggiungi</button>
        </div>
      </div>

      <div style={{ padding: 24 }}>
        {items.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
            {chip(ALL, 'Tutti', items.length)}
            {favCount > 0 && chip(FAV, '⭐ Preferiti', favCount)}
            {categories.map(c => chip(c, c, items.filter(t => t.category === c).length))}
          </div>
        )}

        {items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: '3rem', marginBottom: 8 }}>{cfg.icon}</div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>{cfg.emptyTitle}</div>
            <div style={{ fontSize: '.85rem', marginBottom: 18 }}>{cfg.emptyText}</div>
            <button className="btn btn-primary" style={{ background: cfg.gradient }} onClick={() => setEditing('new')}>{cfg.emptyButton}</button>
          </div>
        ) : shown.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 32, fontSize: '.9rem' }}>{cfg.notFound}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14 }}>
            {shown.map(t => (
              <ToolCard
                key={t.id} tool={t}
                onEdit={setEditing}
                onDelete={setConfirmDelete}
                onToggleFavorite={tool => onChange(items.map(x => (x.id === tool.id ? { ...x, favorite: !x.favorite } : x)))}
              />
            ))}
          </div>
        )}

        {items.length > 0 && (
          <p style={{ fontSize: '.72rem', color: 'var(--text-tertiary)', margin: '18px 0 0' }}>
            Le icone sono caricate dal sito di ogni link (tramite il servizio favicon di Google). Il click apre il link in una nuova scheda.
          </p>
        )}
      </div>

      {editing && (
        <ToolForm cfg={cfg} initial={editing === 'new' ? null : editing} categories={categories} onSave={save} onCancel={() => setEditing(null)} />
      )}

      {confirmDelete && (
        <div className="modal-overlay animate-fade-in" style={{ zIndex: 1100 }} onClick={e => { e.stopPropagation(); setConfirmDelete(null); }}>
          <div className="modal-content animate-scale-in" style={{ maxWidth: 380, width: '90vw', padding: 24 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 8px' }}>Eliminare “{confirmDelete.name}”?</h3>
            <p style={{ margin: '0 0 20px', fontSize: '.85rem', color: 'var(--text-secondary)' }}>{cfg.deleteNote}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Annulla</button>
              <button className="btn btn-primary" style={{ background: 'var(--danger)' }} onClick={() => remove(confirmDelete)}>Elimina</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function ToolboxModal({ tools, docs, onChangeTools, onChangeDocs, onClose }) {
  const [tab, setTab] = useState('tools');
  const cfg = BOARDS[tab];
  const counts = { tools: tools.length, docs: docs.length };

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div className="modal-content animate-scale-in" style={{ maxWidth: 1000, width: '94vw', maxHeight: '90vh', overflow: 'auto', padding: 0 }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '20px 24px 0', background: cfg.gradient, color: '#fff', borderRadius: '16px 16px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <span style={{ fontSize: '2rem' }}>{cfg.icon}</span>
            <h2 style={{ margin: 0, flex: 1, fontSize: '1.3rem', color: '#fff' }}>Cassetta degli attrezzi</h2>
            <button className="btn btn-ghost" style={{ color: '#fff' }} onClick={onClose}>✕</button>
          </div>
          <div role="tablist" style={{ display: 'flex', gap: 4 }}>
            {Object.values(BOARDS).map(b => (
              <button
                key={b.id} role="tab" aria-selected={tab === b.id} onClick={() => setTab(b.id)}
                style={{
                  border: 'none', cursor: 'pointer', padding: '9px 18px', fontWeight: 700, fontSize: '.85rem',
                  borderRadius: '12px 12px 0 0',
                  background: tab === b.id ? 'rgba(255,255,255,0.97)' : 'rgba(255,255,255,0.2)',
                  color: tab === b.id ? b.accent : '#fff',
                }}
              >
                {b.icon} {b.label} <span style={{ opacity: 0.7, fontWeight: 600 }}>({counts[b.id]})</span>
              </button>
            ))}
          </div>
        </div>

        {/* key: cambiando scheda ricerca, filtri e moduli aperti ripartono puliti */}
        <LinkBoard
          key={tab} cfg={cfg}
          items={tab === 'tools' ? tools : docs}
          onChange={tab === 'tools' ? onChangeTools : onChangeDocs}
        />
      </div>
    </div>
  );
}
