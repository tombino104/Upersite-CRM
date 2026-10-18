import { priceKey } from '../utils/aiUsage';

const inputStyle = { width: '84px', padding: '4px 6px' };

// Prezzo in euro per milione di token (entrata / uscita) di un modello cloud, salvato in ai.prices.
// I campi si salvano quando si esce (onBlur), per non riscrivere le impostazioni a ogni tasto.
export default function AIPriceInputs({ ai, save, provider, model, compact = false }) {
  const key = priceKey(provider, model);
  const price = ai.prices[key] || {};

  const setPrice = (field, value) => {
    const current = ai.prices[key] || { input: 0, output: 0 };
    const next = value === '' ? 0 : Math.max(0, Number(value) || 0);
    if (next === (current[field] || 0)) return;
    save({ ...ai, prices: { ...ai.prices, [key]: { ...current, [field]: next } } });
  };

  const field = (name, label) => (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
      {!compact && label}
      <input
        key={`${key}-${name}-${price[name] || 0}`}
        className="input"
        type="number"
        min="0"
        step="0.01"
        style={inputStyle}
        defaultValue={price[name] || ''}
        placeholder="0"
        aria-label={`Prezzo ${label.toLowerCase()} ${model}`}
        onBlur={e => setPrice(name, e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      />
    </label>
  );

  return (
    <span style={{ display: 'inline-flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
      {field('input', 'Entrata')}
      {field('output', 'Uscita')}
    </span>
  );
}
