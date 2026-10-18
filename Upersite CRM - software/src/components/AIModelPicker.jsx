import { useEffect, useState } from 'react';
import {
  AI_PROVIDERS,
  GEMINI_MODELS,
  findProvider,
  defaultGeminiModel,
  getProviderUrl,
  listModels,
  getAIStatus,
  AI_KEYS_CHANGED_EVENT
} from '../utils/aiClient';

// Scelta di servizio AI + modello. value: { provider, model }; onChange(nuovaScelta).
// I modelli dei servizi locali e di Ollama Cloud vengono chiesti al servizio (tramite il server del CRM);
// se l'elenco non si carica si può scrivere il nome del modello a mano.
export default function AIModelPicker({ value, onChange, disabled = false }) {
  const provider = findProvider(value?.provider) || findProvider('gemini');
  const isGemini = provider.id === 'gemini';
  const baseUrl = provider.kind === 'local' ? getProviderUrl(provider.id) : '';

  const [models, setModels] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [manual, setManual] = useState(false);
  const [status, setStatus] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    const loadStatus = () => getAIStatus().then(s => { if (active) setStatus(s); }).catch(() => {});
    loadStatus();
    // Chiave salvata o cancellata in «Servizi e chiavi»: si aggiornano stato ed elenco dei modelli
    const onKeysChanged = () => {
      loadStatus();
      setReloadToken(t => t + 1);
    };
    window.addEventListener(AI_KEYS_CHANGED_EVENT, onKeysChanged);
    return () => {
      active = false;
      window.removeEventListener(AI_KEYS_CHANGED_EVENT, onKeysChanged);
    };
  }, []);

  // Elenco modelli del servizio scelto
  useEffect(() => {
    if (isGemini) {
      setModels(null);
      setError('');
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    listModels(provider.id, { baseUrl, signal: controller.signal })
      .then(list => {
        setModels(list);
        setManual(list.length === 0);
        // Servizio appena scelto e nessun modello indicato: si propone il primo disponibile
        if (!value?.model && list.length > 0) onChange({ provider: provider.id, model: list[0].id });
      })
      .catch(err => {
        if (err?.code === 'aborted') return;
        setModels(null);
        setManual(true);
        setError(err.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
    // value/onChange esclusi apposta: l'elenco si ricarica solo cambiando servizio, indirizzo o con ⟳
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider.id, baseUrl, isGemini, reloadToken]);

  const changeProvider = (id) => {
    setManual(false);
    onChange({ provider: id, model: id === 'gemini' ? defaultGeminiModel().id : '' });
  };

  const keyInfo = status?.providers?.[provider.id];
  const keyMissing = keyInfo && keyInfo.keyRequired && !keyInfo.hasKey;

  const modelOptions = models ? [...models] : [];
  if (value?.model && !modelOptions.some(m => m.id === value.model)) {
    modelOptions.unshift({ id: value.model, label: `${value.model} (non trovato)` });
  }

  return (
    <div className="ai-picker">
      <div className="ai-picker-row">
        <select
          className="input ai-picker-provider"
          value={provider.id}
          onChange={e => changeProvider(e.target.value)}
          disabled={disabled}
          aria-label="Servizio AI"
        >
          <optgroup label="Sul PC o in rete locale: i dati restano qui">
            {AI_PROVIDERS.filter(p => p.kind === 'local').map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </optgroup>
          <optgroup label="Cloud: i dati vanno al servizio esterno">
            {AI_PROVIDERS.filter(p => p.kind === 'cloud').map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </optgroup>
        </select>

        {isGemini ? (
          <select
            className="input ai-picker-model"
            value={value?.model || defaultGeminiModel().id}
            onChange={e => onChange({ provider: 'gemini', model: e.target.value })}
            disabled={disabled}
            aria-label="Modello"
          >
            {GEMINI_MODELS.map(m => <option key={m.id} value={m.id}>{m.label} ({m.badge})</option>)}
          </select>
        ) : manual || !models ? (
          <input
            className="input ai-picker-model"
            value={value?.model || ''}
            onChange={e => onChange({ provider: provider.id, model: e.target.value.trim() })}
            placeholder={loading ? 'Carico i modelli...' : 'Nome del modello (es. qwen3:8b)'}
            disabled={disabled}
            aria-label="Nome del modello"
          />
        ) : (
          <select
            className="input ai-picker-model"
            value={value?.model || ''}
            onChange={e => onChange({ provider: provider.id, model: e.target.value })}
            disabled={disabled}
            aria-label="Modello"
          >
            {modelOptions.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        )}

        {!isGemini && (
          <button
            type="button"
            className="btn btn-ghost ai-picker-reload"
            onClick={() => setReloadToken(t => t + 1)}
            disabled={disabled || loading}
            title="Ricarica l'elenco dei modelli"
            aria-label="Ricarica l'elenco dei modelli"
          >
            {loading ? '…' : '⟳'}
          </button>
        )}
      </div>

      <div className="ai-picker-meta">
        <span className={`ai-picker-badge ${provider.kind}`}>{provider.kind === 'local' ? 'locale' : 'cloud'}</span>
        {keyMissing && <span className="ai-picker-warn">Manca {keyInfo.keyEnv} nel file .env.local</span>}
        {error && <span className="ai-picker-error">{error}</span>}
      </div>

      <style>{`
        .ai-picker { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
        .ai-picker-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
        .ai-picker-provider { flex: 0 1 190px; min-width: 150px; }
        .ai-picker-model { flex: 1 1 200px; min-width: 150px; }
        .ai-picker-reload { padding: 6px 10px; min-width: 34px; }
        .ai-picker-meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 0.72rem; }
        .ai-picker-badge { padding: 1px 8px; border-radius: 999px; font-weight: 600; }
        .ai-picker-badge.local { background: var(--success-bg); color: var(--success); }
        .ai-picker-badge.cloud { background: var(--primary-ghost); color: var(--primary); }
        .ai-picker-warn { color: var(--danger); }
        .ai-picker-error { color: var(--danger); }
      `}</style>
    </div>
  );
}
