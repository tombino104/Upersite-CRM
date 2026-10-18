import { useState } from 'react';
import { AI_PROVIDERS, AI_PURPOSES, findProvider, findGeminiModel } from '../utils/aiClient';
import { USAGE_PERIODS, summarizeUsage, estimateCost, priceKey } from '../utils/aiUsage';
import { aiCard, aiHintText, aiSectionTitle } from './aiSettingsStyles';
import AIPriceInputs from './AIPriceInputs';

const fmt = (n) => Math.round(n || 0).toLocaleString('it-IT');
const fmtEuro = (n) => (n || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: n > 0 && n < 0.01 ? 4 : 2 });

const purposeLabel = (id) => AI_PURPOSES.find(p => p.id === id)?.label || 'Altro';
const modelLabel = (provider, model) => (provider === 'gemini' ? findGeminiModel(model)?.label : null) || model;

const th = { textAlign: 'left', padding: '6px 8px', fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', whiteSpace: 'nowrap' };
const td = { padding: '6px 8px', fontSize: '0.8rem', borderTop: '1px solid var(--border-light)', verticalAlign: 'middle' };
const num = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };

// Impostazioni → Intelligenza artificiale → Consumo e costi
export default function AIUsagePanel({ ai, save, settings, updateSettings }) {
  const [period, setPeriod] = useState('30d');
  const summary = summarizeUsage(settings.aiUsageLog, period);
  const priceOf = (row) => ai.prices[priceKey(row.provider, row.model)];
  const tokenCost = summary.byModel.reduce((sum, row) => sum + estimateCost(row, priceOf(row)), 0);
  const monthlySubscriptions = Object.values(ai.subscriptions).reduce((sum, v) => sum + v, 0);

  // Modelli cloud a cui dare un prezzo: quelli scelti nelle funzioni e quelli già usati (in qualsiasi periodo)
  const cloudModels = [];
  const addCloudModel = (provider, model) => {
    if (!model || findProvider(provider)?.kind !== 'cloud') return;
    if (!cloudModels.some(m => m.provider === provider && m.model === model)) cloudModels.push({ provider, model });
  };
  Object.values(ai.purposes).forEach(c => addCloudModel(c.provider, c.model));
  summarizeUsage(settings.aiUsageLog, 'all').byModel.forEach(r => addCloudModel(r.provider, r.model));

  const setSubscription = (providerId, value) => {
    const amount = value === '' ? 0 : Math.max(0, Number(value) || 0);
    if (amount === (ai.subscriptions[providerId] || 0)) return;
    const subscriptions = { ...ai.subscriptions };
    if (amount > 0) subscriptions[providerId] = amount;
    else delete subscriptions[providerId];
    save({ ...ai, subscriptions });
  };

  const resetLog = () => {
    if (window.confirm('Azzerare tutto lo storico dei consumi di token? Prezzi e abbonamenti restano.')) {
      updateSettings({ aiUsageLog: {} });
    }
  };

  const sortedModels = [...summary.byModel].sort((a, b) => (b.input + b.output) - (a.input + a.output));
  const sortedPurposes = [...summary.byPurpose].sort((a, b) => (b.input + b.output) - (a.input + a.output));

  return (
    <>
      <span style={{ ...aiHintText, marginTop: 0, marginBottom: '14px' }}>
        Token usati dalle funzioni AI. I numeri sono quelli restituiti dai servizi dopo ogni risposta
        (<strong>entrata</strong> = testo inviato, <strong>uscita</strong> = risposta). I costi sono una stima calcolata dai prezzi che imposti in fondo a questa pagina.
      </span>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' }}>
        <select className="input" style={{ flex: '0 1 200px' }} value={period} onChange={e => setPeriod(e.target.value)} aria-label="Periodo">
          {USAGE_PERIODS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn btn-ghost" onClick={resetLog}>Azzera storico</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginBottom: '6px' }}>
        {[
          ['Richieste', fmt(summary.totals.requests)],
          ['Token in entrata', fmt(summary.totals.input)],
          ['Token in uscita', fmt(summary.totals.output)],
          ['Costo stimato (token)', fmtEuro(tokenCost)],
          ...(monthlySubscriptions > 0 ? [['Abbonamenti al mese', fmtEuro(monthlySubscriptions)]] : [])
        ].map(([label, value]) => (
          <div key={label} style={{ ...aiCard, marginBottom: 0 }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>{label}</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </div>
      {summary.totals.estimated > 0 && (
        <span style={aiHintText}>
          {summary.totals.estimated} {summary.totals.estimated === 1 ? 'richiesta ha' : 'richieste hanno'} numeri stimati (il servizio non li ha restituiti).
        </span>
      )}

      {summary.totals.requests === 0 ? (
        <div style={{ ...aiCard, marginTop: '12px' }}><span style={{ ...aiHintText, marginTop: 0 }}>Nessuna richiesta AI in questo periodo.</span></div>
      ) : (
        <>
          <div style={aiSectionTitle}>Per modello</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Modello</th>
                  <th style={{ ...th, textAlign: 'right' }}>Rich.</th>
                  <th style={{ ...th, textAlign: 'right' }}>Entrata</th>
                  <th style={{ ...th, textAlign: 'right' }}>Uscita</th>
                  <th style={{ ...th, textAlign: 'right' }}>Costo</th>
                </tr>
              </thead>
              <tbody>
                {sortedModels.map(row => {
                  const provider = findProvider(row.provider);
                  const local = provider?.kind === 'local';
                  const price = priceOf(row);
                  return (
                    <tr key={row.provider + row.model}>
                      <td style={td}>
                        <div style={{ fontWeight: 600, wordBreak: 'break-all' }}>{modelLabel(row.provider, row.model)}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>{provider?.label || row.provider}{local ? ' · locale' : ''}</div>
                      </td>
                      <td style={num}>{fmt(row.requests)}</td>
                      <td style={num}>{fmt(row.input)}</td>
                      <td style={num}>{fmt(row.output)}</td>
                      <td style={num}>
                        {local ? <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>sul PC: gratis</span>
                          : price ? fmtEuro(estimateCost(row, price))
                            : <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>prezzo non impostato</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={aiSectionTitle}>Per funzione</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Funzione</th>
                  <th style={{ ...th, textAlign: 'right' }}>Rich.</th>
                  <th style={{ ...th, textAlign: 'right' }}>Entrata</th>
                  <th style={{ ...th, textAlign: 'right' }}>Uscita</th>
                  <th style={{ ...th, textAlign: 'right' }}>Entrata media</th>
                </tr>
              </thead>
              <tbody>
                {sortedPurposes.map(row => (
                  <tr key={row.purpose}>
                    <td style={td}>{purposeLabel(row.purpose)}</td>
                    <td style={num}>{fmt(row.requests)}</td>
                    <td style={num}>{fmt(row.input)}</td>
                    <td style={num}>{fmt(row.output)}</td>
                    <td style={num}>{fmt(row.requests ? row.input / row.requests : 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div style={aiSectionTitle}>Prezzi e abbonamenti</div>
      <span style={{ ...aiHintText, marginTop: '-4px', marginBottom: '10px' }}>
        Alcuni servizi si pagano a token (prezzo per milione di token, es. Google Gemini a pagamento), altri con un abbonamento
        mensile (es. il piano di Ollama Cloud). Con i piani gratuiti lascia 0. I modelli locali sono sempre gratis.
      </span>

      <div style={aiCard}>
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>Abbonamento mensile (€)</div>
        {AI_PROVIDERS.filter(p => p.kind === 'cloud').map(p => (
          <label key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', padding: '4px 0', fontSize: '0.82rem' }}>
            {p.label}
            <input
              key={`${p.id}-${ai.subscriptions[p.id] || 0}`}
              className="input"
              type="number"
              min="0"
              step="0.01"
              style={{ width: '100px', padding: '4px 6px' }}
              defaultValue={ai.subscriptions[p.id] || ''}
              placeholder="0"
              aria-label={`Abbonamento mensile ${p.label}`}
              onBlur={e => setSubscription(p.id, e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            />
          </label>
        ))}
      </div>

      <div style={aiCard}>
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>Prezzo per milione di token (€)</div>
        {cloudModels.length === 0 ? (
          <span style={{ ...aiHintText, marginTop: 0 }}>Nessun modello cloud scelto o usato finora: compariranno qui (e sotto ogni funzione in «Quale IA per cosa»).</span>
        ) : cloudModels.map(m => (
          <div key={m.provider + m.model} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '4px 0' }}>
            <span style={{ fontSize: '0.82rem' }}>
              <strong style={{ wordBreak: 'break-all' }}>{modelLabel(m.provider, m.model)}</strong>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}> · {findProvider(m.provider)?.label}</span>
            </span>
            <AIPriceInputs ai={ai} save={save} provider={m.provider} model={m.model} />
          </div>
        ))}
      </div>
    </>
  );
}
