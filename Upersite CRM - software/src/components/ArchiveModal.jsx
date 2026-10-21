import { useState, useMemo } from 'react';
import { archiveKindLabel } from '../utils/leads';

const eur = n => '€ ' + (Number(n) || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = d => (d ? new Date(d).toLocaleDateString('it-IT') : '');

const FILTERS = [
  { id: 'all', label: 'Tutti' },
  { id: 'lost', label: 'Persi' },
  { id: 'closed', label: 'Lavoro concluso' },
  { id: 'other', label: 'Altro' },
];

const unpaidOf = c => (c.installments || []).filter(i => !i.paid);

export default function ArchiveModal({ customers, onRestore, onOpenCustomer, onClose }) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');

  const archived = useMemo(() => customers.filter(c => c.archivedAt), [customers]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return archived
      .filter(c => filter === 'all' || (c.archiveKind || 'other') === filter)
      .filter(c => !q || [c.name, c.company, c.email, c.archiveReason].some(v => (v || '').toLowerCase().includes(q)))
      .sort((a, b) => (b.archivedAt || '').localeCompare(a.archivedAt || ''));
  }, [archived, filter, query]);

  const count = id => archived.filter(c => id === 'all' || (c.archiveKind || 'other') === id).length;

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div className="modal-content animate-scale-in" style={{ maxWidth: 900, width: '94vw', maxHeight: '90vh', overflow: 'auto', padding: 24 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>📦 Archivio clienti</h2>
          <div style={{ flex: 1 }} />
          <input className="input" style={{ maxWidth: 240 }} placeholder="Cerca…" value={query} onChange={e => setQuery(e.target.value)} />
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {FILTERS.map(f => (
            <button key={f.id} className={`btn btn-sm ${filter === f.id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter(f.id)}>
              {f.label} ({count(f.id)})
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 32, fontSize: '.9rem' }}>
            {archived.length === 0
              ? 'Nessun cliente archiviato. Dalla scheda di un cliente puoi archiviarlo con “📦 Archivia”.'
              : 'Nessun risultato.'}
          </div>
        ) : shown.map(c => {
          const unpaid = unpaidOf(c);
          const due = unpaid.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
          return (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, background: 'var(--bg-input)', marginBottom: 8, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}{c.company ? <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}> · {c.company}</span> : null}</div>
                <div style={{ fontSize: '.75rem', color: 'var(--text-secondary)', marginTop: 3 }}>
                  <b>{archiveKindLabel(c.archiveKind)}</b>{c.archiveReason ? ` · ${c.archiveReason}` : ''} · archiviato il {fmtDate(c.archivedAt)}
                </div>
                {unpaid.length > 0 && (
                  <div style={{ fontSize: '.75rem', color: 'var(--danger)', marginTop: 3 }}>
                    ⚠️ {unpaid.length} {unpaid.length === 1 ? 'rata' : 'rate'} da incassare ({eur(due)})
                  </div>
                )}
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => onOpenCustomer(c)}>Apri scheda</button>
              <button className="btn btn-primary btn-sm" onClick={() => onRestore(c)}>Ripristina</button>
            </div>
          );
        })}
        <p style={{ fontSize: '.72rem', color: 'var(--text-tertiary)', margin: '14px 0 0' }}>
          Gli incassi dei clienti archiviati restano nelle statistiche e le rate non pagate restano tra quelle scadute. Per eliminare un cliente definitivamente apri la sua scheda (serve la password master).
        </p>
      </div>
    </div>
  );
}
