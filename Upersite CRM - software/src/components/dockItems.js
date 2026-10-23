import {
  IconAutomations, IconMonitor, IconAnalytics, IconCalculator, IconLeads, IconArchive, IconToolbox,
} from './dockIcons';

// Pulsanti tondi in basso a sinistra: elenco, icone e disposizione scelta nelle Impostazioni (settings.dock).

// L'ordine di questo elenco è la disposizione predefinita (da sinistra a destra)
export const DOCK_ITEMS = [
  {
    id: 'automations', title: 'Automazioni', colors: ['#7C3AED', '#6D28D9'], glow: '124, 58, 237', tilt: -5,
    Icon: IconAutomations,
  },
  {
    id: 'monitor', title: 'Monitoraggio', colors: ['#10B981', '#059669'], glow: '16, 185, 129', tilt: 5,
    Icon: IconMonitor,
  },
  {
    id: 'analytics', title: 'Panoramica Business', colors: ['#0984E3', '#0652DD'], glow: '9, 132, 227', tilt: -4,
    Icon: IconAnalytics,
  },
  {
    id: 'calculator', title: 'Calcolatore preventivi', colors: ['#F59E0B', '#D97706'], glow: '245, 158, 11', tilt: 5,
    Icon: IconCalculator,
  },
  {
    id: 'leads', title: 'Pipeline prospect', colors: ['#14B8A6', '#0F766E'], glow: '20, 184, 166', tilt: 5,
    Icon: IconLeads,
  },
  {
    id: 'archive', title: 'Archivio clienti', colors: ['#94A3B8', '#64748B'], glow: '100, 116, 139', tilt: 5,
    Icon: IconArchive,
  },
  {
    id: 'toolbox', title: 'Cassetta degli attrezzi', colors: ['#F97316', '#C2410C'], glow: '249, 115, 22', tilt: 5,
    Icon: IconToolbox,
  },
];

export const DOCK_ITEM_BY_ID = Object.fromEntries(DOCK_ITEMS.map(item => [item.id, item]));

export const DEFAULT_DOCK = { main: DOCK_ITEMS.map(i => i.id), more: [] };

// Disposizione valida a partire da quella salvata: ignora id sconosciuti e doppioni,
// e mette in barra i pulsanti che non compaiono da nessuna parte (es. aggiunti da una versione nuova).
export function resolveDock(saved) {
  const seen = new Set();
  const clean = list => (Array.isArray(list) ? list : []).filter(id => DOCK_ITEM_BY_ID[id] && !seen.has(id) && seen.add(id));
  const main = clean(saved?.main);
  const more = clean(saved?.more);
  const missing = DOCK_ITEMS.map(i => i.id).filter(id => !seen.has(id));
  return { main: [...main, ...missing], more };
}
