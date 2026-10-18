import { useCallback, useEffect, useState } from 'react';
import {
  AI_PROVIDERS,
  findProvider,
  listLocalModels,
  loadLocalModel,
  unloadLocalModel,
  modelConfigKey
} from '../utils/aiClient';
import { aiCard, aiHintText, aiSectionTitle } from './aiSettingsStyles';

const CONTEXT_PRESETS = [4096, 8192, 16384, 32768, 65536, 131072];

function formatSize(bytes) {
  if (!bytes) return '';
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`;
}

function formatContext(n) {
  if (!n) return '';
  return n >= 1024 ? `${Math.round(n / 1024)}k` : String(n);
}

// Impostazioni → Intelligenza artificiale → Modelli locali:
// stato dei modelli di LM Studio, carica e scarica, contesto per ogni modello, un solo modello alla volta.
export default function AILocalModelsPanel({ ai, save }) {
  const localProviders = AI_PROVIDERS.filter(p => p.kind === 'local');
  const [providerId, setProviderId] = useState(() => {
    // Si parte dal servizio locale usato da qualche funzione, se c'è
    const used = Object.values(ai.purposes).find(c => findProvider(c.provider)?.kind === 'local');
    return used?.provider || 'lmstudio';
  });
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null); // { model, action }
  const [contextDrafts, setContextDrafts] = useState({});

  const provider = findProvider(providerId);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setState(await listLocalModels(providerId));
    } catch (err) {
      setState(null);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    setContextDrafts({});
    refresh();
  }, [refresh]);

  const savedContext = (model) => ai.models[modelConfigKey(providerId, model)]?.contextLength;
  const draftContext = (model) => contextDrafts[model] ?? (savedContext(model) ? String(savedContext(model)) : '');

  // Salva il contesto scelto per il modello (vale per tutte le funzioni che lo usano)
  const saveContext = (model, value) => {
    const n = Math.round(Number(value));
    const models = { ...ai.models };
    const key = modelConfigKey(providerId, model);
    if (n > 0) models[key] = { contextLength: n };
    else delete models[key];
    save({ ...ai, models });
    return n > 0 ? n : undefined;
  };

  const run = async (model, action, fn) => {
    setBusy({ model, action });
    setError('');
    try {
      setState(await fn());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const load = (model) => {
    const contextLength = saveContext(model, draftContext(model));
    run(model, 'load', () => loadLocalModel(providerId, model, { contextLength, exclusive: ai.exclusiveLocal }));
  };

  const unload = (model) => run(model, 'unload', () => unloadLocalModel(providerId, model));

  const setExclusive = (value) => save({ ...ai, exclusiveLocal: value });

  const models = state?.models || [];
  const loadedCount = models.filter(m => m.instances.length > 0).length;

  return (
    <>
      <span style={{ ...aiHintText, marginTop: 0, marginBottom: '14px' }}>
        Qui vedi quali modelli sono caricati in memoria, li carichi o scarichi e scegli il <strong>contesto</strong> di ognuno:
        quanto testo (in token) il modello può tenere a mente in una richiesta. Più contesto = più memoria del PC (RAM/VRAM) occupata.
        Il contesto scelto vale per tutte le funzioni che usano quel modello.
      </span>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' }}>
        <select className="input" style={{ flex: '0 1 220px' }} value={providerId} onChange={e => setProviderId(e.target.value)} aria-label="Servizio locale">
          {localProviders.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <button type="button" className="btn btn-secondary" onClick={refresh} disabled={loading}>
          {loading ? 'Aggiorno…' : '⟳ Aggiorna'}
        </button>
        {state?.supported && (
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            {loadedCount === 0 ? 'Nessun modello caricato' : `${loadedCount} ${loadedCount === 1 ? 'modello caricato' : 'modelli caricati'}`}
          </span>
        )}
      </div>

      <label style={{ ...aiCard, display: 'flex', gap: '10px', alignItems: 'flex-start', cursor: 'pointer' }}>
        <input type="checkbox" checked={ai.exclusiveLocal} onChange={e => setExclusive(e.target.checked)} style={{ marginTop: '3px' }} />
        <span>
          <strong style={{ fontSize: '0.85rem' }}>Un solo modello alla volta</strong>
          <span style={{ ...aiHintText, marginTop: '2px' }}>
            Caricando un modello (da qui o perché una funzione lo usa) gli altri modelli dello stesso servizio vengono scaricati,
            per non riempire la memoria del PC.
          </span>
        </span>
      </label>

      {error && <div className="alert alert-danger" style={{ marginBottom: '10px', fontSize: '0.82rem' }}>{error}</div>}

      {state && !state.supported && (
        <div style={aiCard}><span style={{ ...aiHintText, marginTop: 0 }}>{state.reason}</span></div>
      )}

      {state?.supported && models.length === 0 && (
        <div style={aiCard}><span style={{ ...aiHintText, marginTop: 0 }}>Nessun modello installato in {provider.label}. {provider.hint}</span></div>
      )}

      {state?.supported && models.length > 0 && <div style={aiSectionTitle}>Modelli di {provider.label}</div>}
      {state?.supported && models.map(m => {
        const loaded = m.instances.length > 0;
        const loadedContext = m.instances.find(i => i.contextLength)?.contextLength;
        const draft = draftContext(m.id);
        const isBusy = busy?.model === m.id;
        const tooBig = m.maxContextLength && Number(draft) > m.maxContextLength;
        const contextDiffers = loaded && loadedContext && Number(draft) > 0 && Number(draft) !== loadedContext;
        return (
          <div key={m.id} style={{ ...aiCard, borderLeft: `3px solid ${loaded ? 'var(--success)' : 'transparent'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'baseline' }}>
              <strong style={{ fontSize: '0.88rem', wordBreak: 'break-all' }}>{m.label}</strong>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: loaded ? 'var(--success)' : 'var(--text-tertiary)' }}>
                {loaded ? `● Caricato${loadedContext ? ` · contesto ${formatContext(loadedContext)}` : ''}` : '○ Non caricato'}
              </span>
            </div>
            <span style={{ ...aiHintText, marginTop: '2px' }}>
              {[formatSize(m.sizeBytes), m.maxContextLength ? `contesto massimo ${formatContext(m.maxContextLength)}` : ''].filter(Boolean).join(' · ')}
            </span>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginTop: '8px' }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }} htmlFor={`ctx-${m.id}`}>Contesto</label>
              <input
                id={`ctx-${m.id}`}
                className="input"
                type="number"
                min="512"
                step="512"
                style={{ width: '120px' }}
                value={draft}
                placeholder="predefinito"
                onChange={e => setContextDrafts(d => ({ ...d, [m.id]: e.target.value }))}
                onBlur={() => saveContext(m.id, draft)}
              />
              <select
                className="input"
                style={{ width: '110px' }}
                value=""
                onChange={e => {
                  if (!e.target.value) return;
                  setContextDrafts(d => ({ ...d, [m.id]: e.target.value }));
                  saveContext(m.id, e.target.value);
                }}
                aria-label="Contesti comuni"
              >
                <option value="">Scegli…</option>
                {CONTEXT_PRESETS.filter(n => !m.maxContextLength || n <= m.maxContextLength).map(n => (
                  <option key={n} value={n}>{formatContext(n)}</option>
                ))}
                {m.maxContextLength && <option value={m.maxContextLength}>max ({formatContext(m.maxContextLength)})</option>}
              </select>
              <div style={{ flex: 1 }} />
              {(!loaded || contextDiffers) && (
                <button type="button" className="btn btn-primary" disabled={!!busy || tooBig} onClick={() => load(m.id)}>
                  {isBusy && busy.action === 'load' ? 'Carico…' : loaded ? 'Ricarica con questo contesto' : 'Carica'}
                </button>
              )}
              {loaded && (
                <button type="button" className="btn btn-secondary" disabled={!!busy} onClick={() => unload(m.id)}>
                  {isBusy && busy.action === 'unload' ? 'Scarico…' : 'Scarica'}
                </button>
              )}
            </div>
            {tooBig && <span style={{ ...aiHintText, color: 'var(--danger)' }}>Più del contesto massimo del modello.</span>}
          </div>
        );
      })}
    </>
  );
}
