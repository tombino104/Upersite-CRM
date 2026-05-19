import React, { useMemo, useEffect, useRef, useState } from 'react';

/* ─── SVG Radar animato ─── */
function polarXY(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function RadarChart({ data, size = 460 }) {
  const [progress, setProgress] = useState(0);
  const cx = size / 2, cy = size / 2;
  const maxR = size * 0.36;
  const n = data.length;
  const levels = 5;

  useEffect(() => {
    setProgress(0);
    let start = null;
    const duration = 900;
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      // ease out cubic
      setProgress(1 - Math.pow(1 - p, 3));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [data]);

  const angleStep = 360 / n;

  const grids = Array.from({ length: levels }, (_, lvl) => {
    const r = (maxR * (lvl + 1)) / levels;
    return Array.from({ length: n }, (_, i) => {
      const p = polarXY(cx, cy, r, i * angleStep);
      return `${p.x},${p.y}`;
    }).join(' ');
  });

  const axisEnds = Array.from({ length: n }, (_, i) => polarXY(cx, cy, maxR, i * angleStep));

  const animatedPoints = data.map((d, i) => {
    const r = maxR * Math.max(0, Math.min(1, (d.value / 100) * progress));
    return polarXY(cx, cy, r, i * angleStep);
  });
  const polyPath = animatedPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z';

  const labelR = maxR + 34;
  const labels = data.map((d, i) => {
    const angle = i * angleStep;
    const p = polarXY(cx, cy, labelR, angle);
    const sin = Math.cos(((angle - 90) * Math.PI) / 180);
    return { ...p, label: d.label, value: d.value, color: d.color, sin };
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible', display: 'block' }}>
      <defs>
        <radialGradient id="radarGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(108,92,231,0.35)" />
          <stop offset="100%" stopColor="rgba(108,92,231,0.08)" />
        </radialGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Griglie */}
      {grids.map((pts, lvl) => (
        <polygon key={lvl} points={pts} fill={lvl === levels - 1 ? 'rgba(108,92,231,0.04)' : 'none'}
          stroke="rgba(108,92,231,0.14)" strokeWidth={1} />
      ))}

      {/* Percentuali livello */}
      {Array.from({ length: levels }, (_, lvl) => {
        const r = (maxR * (lvl + 1)) / levels;
        return <text key={lvl} x={cx + 4} y={cy - r + 11} fontSize="9" fill="rgba(120,120,150,0.55)"
          fontFamily="Inter,sans-serif">{Math.round(((lvl + 1) / levels) * 100)}</text>;
      })}

      {/* Assi */}
      {axisEnds.map((p, i) => (
        <line key={i} x1={cx} y1={cy} x2={p.x.toFixed(1)} y2={p.y.toFixed(1)}
          stroke="rgba(108,92,231,0.2)" strokeWidth={1} strokeDasharray="4 3" />
      ))}

      {/* Area dati */}
      <path d={polyPath} fill="url(#radarGrad)" stroke="rgba(108,92,231,0.9)"
        strokeWidth={2.5} strokeLinejoin="round" filter="url(#glow)" />

      {/* Punti sui vertici */}
      {animatedPoints.map((p, i) => (
        <g key={i}>
          <circle cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={7} fill={data[i].color}
            opacity={0.2} />
          <circle cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={4.5} fill={data[i].color}
            stroke="#fff" strokeWidth={2} filter="url(#glow)" />
        </g>
      ))}

      {/* Etichette */}
      {labels.map((l, i) => {
        const anchor = l.sin > 0.15 ? 'start' : l.sin < -0.15 ? 'end' : 'middle';
        return (
          <g key={i}>
            <text x={l.x.toFixed(1)} y={(l.y - 8).toFixed(1)} textAnchor={anchor}
              fontSize="12" fontWeight="700" fill={l.color} fontFamily="Inter,sans-serif"
              filter="url(#glow)">{l.label}</text>
            <text x={l.x.toFixed(1)} y={(l.y + 6).toFixed(1)} textAnchor={anchor}
              fontSize="11" fontWeight="500" fill="rgba(80,80,110,0.8)" fontFamily="Inter,sans-serif">
              {l.value}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ─── Calcoli ─── */
function computeRadarData(customers) {
  const total = customers.length;
  if (total === 0) return [
    { label: 'Sviluppo', value: 0, color: '#6C5CE7' },
    { label: 'Produzione', value: 0, color: '#00B894' },
    { label: 'Liquidità', value: 0, color: '#FDCB6E' },
    { label: 'Crediti\nAperti', value: 0, color: '#E17055' },
    { label: 'Storico', value: 0, color: '#0984E3' },
    { label: 'Qualità DB', value: 0, color: '#A29BFE' },
  ];

  const prospects = customers.filter(c => c.status === 'prospect').length;
  const working = customers.filter(c => c.status === 'working').length;
  const completed = customers.filter(c => c.status === 'completed').length;

  let paid = 0, unpaid = 0;
  customers.forEach(c => (c.installments || []).forEach(i => { i.paid ? paid++ : unpaid++; }));
  const tot = paid + unpaid;
  const liquidita = tot > 0 ? Math.round((paid / tot) * 100) : 0;
  const crediti = tot > 0 ? Math.round((unpaid / tot) * 100) : 0;

  let qSum = 0;
  customers.forEach(c => {
    let s = 0;
    if ((c.tags || []).length > 0) s += 34;
    if ((c.notes || []).length > 0) s += 33;
    if ((c.links || []).length > 0 || (c.credentials || []).length > 0) s += 33;
    qSum += s;
  });

  return [
    { label: 'Sviluppo', value: Math.round((prospects / total) * 100), color: '#6C5CE7' },
    { label: 'Produzione', value: Math.round((working / total) * 100), color: '#00B894' },
    { label: 'Liquidità', value: liquidita, color: '#FDCB6E' },
    { label: 'Crediti', value: crediti, color: '#E17055' },
    { label: 'Storico', value: Math.round((completed / total) * 100), color: '#0984E3' },
    { label: 'Qualità DB', value: Math.round(qSum / total), color: '#A29BFE' },
  ];
}

function computeFinancials(customers) {
  let inc = 0, da = 0;
  customers.forEach(c => (c.installments || []).forEach(i => {
    const a = parseFloat(i.amount) || 0;
    i.paid ? (inc += a) : (da += a);
  }));
  return { inc, da };
}

const fmt = v => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);

/* ─── Descrizioni espandibili ─── */
const EXPLANATIONS = [
  {
    key: 'sviluppo', color: '#6C5CE7', label: 'Sviluppo Commerciale',
    short: 'Quota % di clienti in stato Prospect sul totale.',
    detail: 'Misura la salute della tua pipeline commerciale. Conta i contatti in stato "Prospect" e li divide per il numero totale di clienti nel CRM. Un valore alto indica che stai attivamente generando nuovi contatti. Un valore basso non è necessariamente negativo: potrebbe significare che quasi tutto il tuo portafoglio è già attivo o storico.'
  },
  {
    key: 'produzione', color: '#00B894', label: 'Produzione',
    short: 'Quota % di clienti attivi in lavorazione.',
    detail: 'Mostra il carico operativo attuale della tua agenzia. Conta i clienti in stato "In Lavorazione" rispetto al totale. Se questa percentuale è molto alta, sei in piena fase di delivery. Se è bassa, o stai acquisendo (vedi Sviluppo) o hai già completato molti lavori (vedi Storico).'
  },
  {
    key: 'liquidita', color: '#FDCB6E', label: 'Liquidità Acquisita',
    short: 'Percentuale di rate già incassate sul totale delle rate registrate.',
    detail: 'Calcolato come: rate con stato "Saldato" ÷ totale rate registrate nel CRM. Ogni volta che segni una rata come incassata, questo valore sale. Un punteggio alto significa che il denaro fatturato sta effettivamente entrando in cassa.'
  },
  {
    key: 'crediti', color: '#E17055', label: 'Crediti Aperti',
    short: 'Percentuale di rate non ancora incassate sul totale.',
    detail: 'È il complemento esatto della Liquidità: rate in sospeso ÷ totale rate. Rappresenta la quota di fatturato che non hai ancora incassato. Un valore alto è un segnale che potrebbe valere la pena dedicare del tempo al recupero crediti o a sollecitare i clienti in ritardo.'
  },
  {
    key: 'storico', color: '#0984E3', label: 'Storico Acquisito',
    short: 'Quota % di clienti con stato Completato.',
    detail: 'Rappresenta la tua esperienza sul mercato in termini di progetti portati a termine. Più è alto, più hai una base storica solida di lavori completati. Questo dato cresce naturalmente nel tempo ed è un indicatore della "stazza" della tua agenzia.'
  },
  {
    key: 'qualita', color: '#A29BFE', label: 'Qualità del Database',
    short: 'Media di completezza delle schede clienti (Tag + Note + Link/Credenziali).',
    detail: 'Per ogni cliente vengono verificati 3 campi: Tags assegnati (+34%), Note scritte (+33%), Link o Credenziali salvati (+33%). Il risultato viene mediato su tutti i clienti. Un database ben compilato è un asset: riduce il rischio di perdere informazioni importanti e rende il CRM più utile nel tempo.'
  },
];

function AccordionItem({ item, open, onToggle }) {
  const bodyRef = useRef(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (bodyRef.current) {
      setHeight(open ? bodyRef.current.scrollHeight : 0);
    }
  }, [open]);

  return (
    <div style={{
      borderRadius: 12, overflow: 'hidden',
      border: `1px solid ${open ? item.color + '44' : 'var(--border-light, #e8e8f0)'}`,
      marginBottom: 8, transition: 'border-color 0.3s',
    }}>
      <button onClick={onToggle} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', background: open ? `${item.color}0f` : 'transparent',
        border: 'none', cursor: 'pointer', transition: 'background 0.3s',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
          <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{item.label}</span>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{item.short}</span>
        </div>
        <div style={{
          width: 22, height: 22, borderRadius: '50%',
          background: open ? item.color : 'var(--bg-input, #f0f0f8)',
          color: open ? '#fff' : 'var(--text-tertiary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1rem', fontWeight: 700, flexShrink: 0,
          transition: 'all 0.3s',
          transform: open ? 'rotate(45deg)' : 'rotate(0deg)',
        }}>+</div>
      </button>
      <div ref={bodyRef} style={{
        maxHeight: height, overflow: 'hidden',
        transition: 'max-height 0.4s cubic-bezier(0.4,0,0.2,1)',
      }}>
        <div style={{ padding: '0 16px 14px 36px', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          {item.detail}
        </div>
      </div>
    </div>
  );
}

/* ─── KPI Card ─── */
function KpiCard({ label, value, color, bg, icon }) {
  return (
    <div style={{ flex: '1 1 140px', background: bg, borderRadius: 16, padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ color, display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon}
        <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color }}>{label}</span>
      </div>
      <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
    </div>
  );
}

/* ─── Barra distribuzione ─── */
function StatusRow({ label, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
        <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
        <span style={{ color, fontWeight: 700 }}>{count} <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>({pct}%)</span></span>
      </div>
      <div style={{ height: 6, borderRadius: 99, background: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)' }} />
      </div>
    </div>
  );
}

/* ─── Componente principale ─── */
export default function CRMAnalyticsModal({ customers = [], onClose }) {
  const overlayRef = useRef(null);
  const [openExp, setOpenExp] = useState(null);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const radarData = useMemo(() => computeRadarData(customers), [customers]);
  const { inc, da } = useMemo(() => computeFinancials(customers), [customers]);
  const total = customers.length;

  const statuses = [
    { label: 'Prospect', count: customers.filter(c => c.status === 'prospect').length, color: '#6C5CE7' },
    { label: 'In Lavorazione', count: customers.filter(c => c.status === 'working').length, color: '#00B894' },
    { label: 'Sospesi', count: customers.filter(c => c.status === 'paused').length, color: '#FDCB6E' },
    { label: 'Completati', count: customers.filter(c => c.status === 'completed').length, color: '#0984E3' },
  ];

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1500,
        background: 'rgba(8,8,24,0.75)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'rmFadeIn 0.2s ease',
      }}
    >
      <div style={{
        background: 'var(--bg-primary, #fff)', borderRadius: 28,
        boxShadow: '0 40px 120px rgba(0,0,0,0.35), 0 0 0 1px rgba(108,92,231,0.1)',
        width: '96vw', maxWidth: 1180, maxHeight: '93vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        animation: 'rmScaleIn 0.35s cubic-bezier(0.175,0.885,0.32,1.275)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '28px 36px 20px',
          borderBottom: '1px solid var(--border-light, #ebebf5)',
          background: 'linear-gradient(135deg, rgba(108,92,231,0.04) 0%, transparent 60%)',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.14em', color: 'var(--primary, #6C5CE7)', textTransform: 'uppercase', marginBottom: 6 }}>
              Upersite CRM · Business Intelligence
            </div>
            <h2 style={{ margin: 0, fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.15 }}>
              Panoramica del Business
            </h2>
            <p style={{ margin: '6px 0 0', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
              Dati aggiornati in tempo reale · <strong>{total}</strong> clienti nel database
            </p>
          </div>
          <button onClick={onClose} style={{
            background: 'var(--bg-input, #f0f0f8)', border: 'none', borderRadius: '50%',
            width: 40, height: 40, cursor: 'pointer', fontSize: '1rem', color: 'var(--text-secondary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = '#FFE0E0'; e.currentTarget.style.color = '#E17055'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-input, #f0f0f8)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >✕</button>
        </div>

        {/* Body scrollabile */}
        <div style={{ overflow: 'auto', flex: 1, padding: '28px 36px 32px' }}>

          {/* Riga principale: Radar + destra */}
          <div style={{ display: 'flex', gap: 36, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 32 }}>

            {/* Radar */}
            <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <RadarChart data={radarData} size={460} />
              {/* Legenda */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', justifyContent: 'center', marginTop: 12 }}>
                {radarData.map((d, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem' }}>
                    <div style={{ width: 9, height: 9, borderRadius: '50%', background: d.color }} />
                    <span style={{ color: d.color, fontWeight: 700 }}>{d.value}%</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{d.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Colonna destra */}
            <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* KPI finanziari */}
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <KpiCard label="Totale Incassato" value={fmt(inc)} color="#00B894" bg="rgba(0,184,148,0.07)"
                  icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>} />
                <KpiCard label="Da Incassare" value={fmt(da)} color="#E17055" bg="rgba(225,112,85,0.07)"
                  icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>} />
              </div>

              {/* Distribuzione clienti */}
              <div style={{ background: 'var(--bg-secondary, #f8f8fc)', borderRadius: 18, padding: '20px 22px' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 16 }}>
                  Distribuzione Clienti
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {statuses.map((s, i) => <StatusRow key={i} {...s} total={total} />)}
                </div>
              </div>

              {/* Tassi finanziari */}
              {(inc + da) > 0 && (
                <div style={{ background: 'rgba(108,92,231,0.05)', border: '1px solid rgba(108,92,231,0.14)', borderRadius: 18, padding: '18px 22px' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--primary, #6C5CE7)', textTransform: 'uppercase', marginBottom: 14 }}>
                    Situazione Finanziaria
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <StatusRow label="Rate Incassate" count={radarData[2].value} total={100} color="#00B894" />
                    <StatusRow label="Rate in Sospeso" count={radarData[3].value} total={100} color="#E17055" />
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: 10 }}>
                    Totale fatturato registrato: <strong style={{ color: 'var(--text-primary)' }}>{fmt(inc + da)}</strong>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sezione spiegazioni espandibili */}
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.14em', color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 16 }}>
              Come viene calcolato ogni indicatore
            </div>
            {EXPLANATIONS.map((item, i) => (
              <AccordionItem
                key={item.key}
                item={item}
                open={openExp === i}
                onToggle={() => setOpenExp(openExp === i ? null : i)}
              />
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes rmFadeIn { from { opacity:0 } to { opacity:1 } }
        @keyframes rmScaleIn { from { opacity:0; transform:scale(0.94) translateY(12px) } to { opacity:1; transform:scale(1) translateY(0) } }
      `}</style>
    </div>
  );
}
