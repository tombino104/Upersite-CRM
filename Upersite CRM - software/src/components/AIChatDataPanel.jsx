import { useMemo } from 'react';
import { findProvider, getModelContextLength, describeChoice } from '../utils/aiClient';
import { CHAT_DATA_FIELDS, CHAT_DATA_PRESETS, matchingPreset, buildCrmContext, estimateTokens } from '../utils/chatContext';
import { summarizeUsage } from '../utils/aiUsage';
import { aiCard, aiHintText, aiSectionTitle } from './aiSettingsStyles';

const fmt = (n) => Math.round(n || 0).toLocaleString('it-IT');

// Impostazioni → Intelligenza artificiale → Dati inviati alla chat.
// A ogni domanda la chat riceve i dati del CRM scelti qui: meno dati = meno token (e meno dati che escono dal PC
// con un servizio cloud), ma risposte che non possono tenere conto di ciò che è stato escluso.
export default function AIChatDataPanel({ ai, save, settings, customers }) {
  const options = ai.chatData;
  const preset = matchingPreset(options);

  const setOptions = (next) => save({ ...ai, chatData: next });

  // Stima dal contenuto attuale del CRM (gli eventi del calendario non sono inclusi nella stima)
  const estimate = useMemo(() => {
    const chosen = estimateTokens(buildCrmContext(customers, [], options));
    const complete = estimateTokens(buildCrmContext(customers, [], CHAT_DATA_PRESETS[0].options));
    return { chosen, complete, saved: Math.max(0, complete - chosen) };
  }, [customers, options]);

  // Token reali delle domande alla chat negli ultimi 30 giorni
  const chatUsage = summarizeUsage(settings.aiUsageLog, '30d').byPurpose.find(r => r.purpose === 'chat');
  const realAverage = chatUsage?.requests ? chatUsage.input / chatUsage.requests : null;

  const chatChoice = ai.purposes.chat;
  const chatProvider = findProvider(chatChoice.provider);
  const chatContext = chatProvider?.kind === 'local' ? getModelContextLength(chatChoice.provider, chatChoice.model) : null;

  return (
    <>
      <span style={{ ...aiHintText, marginTop: 0, marginBottom: '14px' }}>
        A ogni domanda la chat riceve i dati del CRM scelti qui. Meno dati significa meno token (risposte più veloci, costi più bassi
        e meno informazioni inviate ai servizi cloud), ma la chat non potrà rispondere su ciò che hai escluso.
      </span>

      <div style={{ ...aiSectionTitle, marginTop: 0 }}>Profilo</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '8px' }}>
        {CHAT_DATA_PRESETS.map(p => {
          const active = preset?.id === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setOptions(p.options)}
              aria-pressed={active}
              style={{
                ...aiCard,
                marginBottom: 0,
                textAlign: 'left',
                cursor: 'pointer',
                font: 'inherit',
                border: `2px solid ${active ? 'var(--primary)' : 'transparent'}`,
                background: active ? 'var(--primary-ghost)' : 'var(--bg-input)'
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.88rem', color: active ? 'var(--primary)' : 'var(--text-primary)' }}>{p.label}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>{p.description}</div>
            </button>
          );
        })}
      </div>
      {!preset && <span style={aiHintText}>Profilo personalizzato.</span>}

      <div style={aiSectionTitle}>Cosa includere</div>
      <div style={{ ...aiCard, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px 16px' }}>
        {CHAT_DATA_FIELDS.map(field => (
          <label key={field.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
            {field.label}
            <select className="input" value={options[field.id]} onChange={e => setOptions({ ...options, [field.id]: e.target.value })}>
              {field.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        ))}
      </div>

      <div style={aiSectionTitle}>Quanti token</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px' }}>
        <div style={{ ...aiCard, marginBottom: 0 }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Dati del CRM per domanda (stima)</div>
          <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>~{fmt(estimate.chosen)}</div>
        </div>
        <div style={{ ...aiCard, marginBottom: 0 }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Risparmio rispetto a «Completo»</div>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--success)' }}>
            ~{fmt(estimate.saved)}{estimate.complete > 0 ? ` (${Math.round((estimate.saved / estimate.complete) * 100)}%)` : ''}
          </div>
        </div>
        <div style={{ ...aiCard, marginBottom: 0 }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Entrata media reale (30 giorni)</div>
          <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>{realAverage === null ? '—' : fmt(realAverage)}</div>
        </div>
      </div>
      <span style={aiHintText}>
        La stima conta solo i dati del CRM, calcolati sui clienti di adesso. L'entrata reale (dal servizio) comprende anche
        le istruzioni e gli ultimi messaggi della conversazione. Dettagli in «Consumo e costi».
      </span>
      {chatContext && estimate.chosen > chatContext * 0.8 && (
        <div className="alert alert-warning" style={{ marginTop: '10px', fontSize: '0.8rem' }}>
          La chat usa {describeChoice(chatChoice)} con un contesto di {fmt(chatContext)} token: questi dati ne occupano quasi tutto
          (o lo superano). Riduci i dati inviati o aumenta il contesto in «Modelli locali».
        </div>
      )}
    </>
  );
}
