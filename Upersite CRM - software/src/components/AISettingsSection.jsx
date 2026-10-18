import { useEffect, useState } from 'react';
import AIModelPicker from './AIModelPicker';
import AILocalModelsPanel from './AILocalModelsPanel';
import AIUsagePanel from './AIUsagePanel';
import AIChatDataPanel from './AIChatDataPanel';
import { aiCard, aiHintText, aiSectionTitle } from './aiSettingsStyles';
import AIPriceInputs from './AIPriceInputs';
import {
  AI_PROVIDERS,
  AI_PURPOSES,
  normalizeAISettings,
  applyAISettings,
  isLocalChoice,
  listModels,
  getAIStatus,
  setAIKey,
  findProvider
} from '../utils/aiClient';


// Impostazioni → Intelligenza artificiale.
// view: 'purposes' (quale IA per ogni funzione) | 'services' (indirizzi e chiavi) | 'models' (modelli locali)
//       | 'usage' (consumo token e costi) | 'chatData' (dati del CRM inviati alla chat)
export default function AISettingsSection({ settings, updateSettings, view = 'purposes', customers = [] }) {
  const ai = normalizeAISettings(settings);

  // Salva le impostazioni AI (le applica subito anche al client AI)
  const save = (next) => updateSettings({ ai: applyAISettings(next) });

  return (
    <div className="settings-section">
      {view === 'purposes' && <PurposesView ai={ai} save={save} />}
      {view === 'services' && <ServicesView ai={ai} save={save} />}
      {view === 'models' && <AILocalModelsPanel ai={ai} save={save} />}
      {view === 'usage' && <AIUsagePanel ai={ai} save={save} settings={settings} updateSettings={updateSettings} />}
      {view === 'chatData' && <AIChatDataPanel ai={ai} save={save} settings={settings} customers={customers} />}
    </div>
  );
}

function PurposesView({ ai, save }) {
  const setPurpose = (purposeId, choice) => save({ ...ai, purposes: { ...ai.purposes, [purposeId]: choice } });

  return (
    <>
      <span style={{ ...aiHintText, marginTop: 0, marginBottom: '14px' }}>
        Scegli quale IA usare per ogni funzione. I servizi <strong>locali</strong> (LM Studio, Unsloth Studio) tengono i dati sul tuo computer;
        quelli <strong>cloud</strong> li inviano al servizio esterno. Indirizzi e chiavi si impostano in «Servizi e chiavi».
      </span>
      {AI_PURPOSES.map(purpose => {
        const choice = ai.purposes[purpose.id];
        return (
          <div key={purpose.id} style={aiCard}>
            <label className="input-label" style={{ marginBottom: '2px' }}>{purpose.label}</label>
            <span style={{ ...aiHintText, marginTop: 0, marginBottom: '8px' }}>{purpose.description}</span>
            <AIModelPicker value={choice} onChange={next => setPurpose(purpose.id, next)} />
            {/* Modelli cloud: prezzo per la stima dei costi (stesso prezzo in «Consumo e costi») */}
            {findProvider(choice.provider)?.kind === 'cloud' && choice.model && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Costo (€ per milione di token):</span>
                <AIPriceInputs ai={ai} save={save} provider={choice.provider} model={choice.model} />
              </div>
            )}
            {purpose.id === 'chat' && (
              <span style={{ ...aiHintText, color: isLocalChoice(choice) ? 'var(--success)' : 'var(--danger)' }}>
                {isLocalChoice(choice)
                  ? 'I dati del CRM inviati alla chat restano sul PC.'
                  : 'Attenzione: la chat invia a questo servizio cloud i dati del CRM scelti in «Dati inviati alla chat».'}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}

function ServicesView({ ai, save }) {
  const [urlDrafts, setUrlDrafts] = useState(ai.urls);
  const [tests, setTests] = useState({});
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState('');
  const [keyDrafts, setKeyDrafts] = useState({});
  const [keyMessages, setKeyMessages] = useState({});

  const refreshStatus = () => {
    setStatusError('');
    getAIStatus({ refresh: true }).then(setStatus).catch(err => setStatusError(err.message));
  };

  useEffect(() => {
    refreshStatus();
  }, []);

  // L'indirizzo si salva quando si esce dal campo (non a ogni tasto, per non ricaricare i modelli di continuo)
  const saveUrl = (providerId) => {
    const value = String(urlDrafts[providerId] || '').trim();
    if (value === ai.urls[providerId]) return;
    save({ ...ai, urls: { ...ai.urls, [providerId]: value } });
  };

  const testConnection = async (providerId) => {
    saveUrl(providerId);
    setTests(t => ({ ...t, [providerId]: { state: 'loading', text: 'Provo a collegarmi...' } }));
    try {
      const models = await listModels(providerId, { baseUrl: String(urlDrafts[providerId] || '').trim() });
      setTests(t => ({
        ...t,
        [providerId]: models.length > 0
          ? { state: 'ok', text: `✓ Collegato: ${models.length} ${models.length === 1 ? 'modello disponibile' : 'modelli disponibili'}` }
          : { state: 'warn', text: 'Collegato, ma nessun modello disponibile: caricane o scaricane uno.' }
      }));
    } catch (err) {
      setTests(t => ({ ...t, [providerId]: { state: 'error', text: err.message } }));
    }
  };

  const saveKey = async (providerId, value) => {
    setKeyMessages(m => ({ ...m, [providerId]: { state: 'loading', text: 'Salvo...' } }));
    try {
      await setAIKey(providerId, value);
      setKeyDrafts(d => ({ ...d, [providerId]: '' }));
      setKeyMessages(m => ({ ...m, [providerId]: { state: 'ok', text: value ? '✓ Chiave salvata' : '✓ Chiave cancellata' } }));
      refreshStatus();
    } catch (err) {
      setKeyMessages(m => ({ ...m, [providerId]: { state: 'error', text: err.message } }));
    }
  };

  const stateColor = (state) => state === 'ok' ? 'var(--success)' : state === 'loading' ? 'var(--text-tertiary)' : 'var(--danger)';

  return (
    <>
      <div style={{ ...aiSectionTitle, marginTop: 0 }}>Servizi sul PC o in rete locale</div>
      {AI_PROVIDERS.filter(p => p.kind === 'local').map(provider => {
        const test = tests[provider.id];
        return (
          <div key={provider.id} style={aiCard}>
            <label className="input-label" htmlFor={`ai-url-${provider.id}`}>{provider.label}</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input
                id={`ai-url-${provider.id}`}
                className="input"
                style={{ flex: '1 1 220px' }}
                value={urlDrafts[provider.id] || ''}
                placeholder={provider.defaultUrl}
                onChange={e => setUrlDrafts(d => ({ ...d, [provider.id]: e.target.value }))}
                onBlur={() => saveUrl(provider.id)}
              />
              <button type="button" className="btn btn-secondary" onClick={() => testConnection(provider.id)} disabled={test?.state === 'loading'}>
                Prova connessione
              </button>
            </div>
            {test && <span style={{ ...aiHintText, color: stateColor(test.state) }}>{test.text}</span>}
            <span style={aiHintText}>{provider.hint}</span>
          </div>
        );
      })}

      <div style={aiSectionTitle}>Chiavi</div>
      <span style={{ ...aiHintText, marginTop: '-4px', marginBottom: '10px' }}>
        Incolla la chiave e premi Salva: la conserva il server del CRM nel file <code>.env.local</code> sul tuo PC.
        Non finisce nei dati, nei backup o nel browser, e qui non viene mai mostrata (si vede solo se c'è).
      </span>
      {statusError && <span style={{ ...aiHintText, color: 'var(--danger)' }}>{statusError}</span>}
      {AI_PROVIDERS.filter(p => p.keyEnv).map(provider => {
        const info = status?.providers?.[provider.id];
        const label = !status ? '…' : info?.hasKey ? '✓ presente' : provider.keyRequired ? '✗ mancante' : 'non necessaria';
        const color = info?.hasKey ? 'var(--success)' : provider.keyRequired ? 'var(--danger)' : 'var(--text-tertiary)';
        const message = keyMessages[provider.id];
        const draft = keyDrafts[provider.id] || '';
        return (
          <div key={provider.id} style={aiCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '6px' }}>
              <label className="input-label" htmlFor={`ai-key-${provider.id}`} style={{ margin: 0 }}>
                {provider.label} <code style={{ fontSize: '0.7rem', textTransform: 'none' }}>{provider.keyEnv}</code>
              </label>
              <span style={{ color, fontWeight: 600, fontSize: '0.8rem' }}>{label}</span>
            </div>
            {info?.fromSystem ? (
              <span style={aiHintText}>Chiave impostata nelle variabili di sistema di Windows: si cambia da lì.</span>
            ) : (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input
                  id={`ai-key-${provider.id}`}
                  type="password"
                  className="input"
                  style={{ flex: '1 1 220px' }}
                  value={draft}
                  placeholder={info?.hasKey ? 'Nuova chiave (sostituisce quella salvata)' : 'Incolla la chiave'}
                  autoComplete="off"
                  onChange={e => setKeyDrafts(d => ({ ...d, [provider.id]: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter' && draft.trim()) saveKey(provider.id, draft.trim()); }}
                />
                <button type="button" className="btn btn-primary" disabled={!draft.trim() || message?.state === 'loading'} onClick={() => saveKey(provider.id, draft.trim())}>
                  Salva
                </button>
                {info?.hasKey && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={message?.state === 'loading'}
                    onClick={() => { if (window.confirm(`Cancellare la chiave di ${provider.label}?`)) saveKey(provider.id, ''); }}
                  >
                    Cancella
                  </button>
                )}
              </div>
            )}
            {message && <span style={{ ...aiHintText, color: stateColor(message.state) }}>{message.text}</span>}
            <span style={aiHintText}>{provider.hint}</span>
          </div>
        );
      })}
    </>
  );
}
