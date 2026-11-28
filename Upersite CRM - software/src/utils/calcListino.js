// Listini del calcolatore integrato (public/calcolatore).
// Questo file è l'unica fonte dei prezzi "Standard": la pagina del calcolatore li riceve dal CRM.
// Nelle impostazioni si salvano i listini creati dall'utente (settings.calcListini), ognuno con le
// sole voci diverse da Standard, e quello in uso (settings.calcListinoAttivo).
// "_m" = valore di mercato mostrato al cliente come confronto.

export const LISTINO_GROUPS = [
    {
        title: 'Pacchetti',
        rows: [
            { label: 'Base (3 pagine)', price: 'pkg_base', market: 'pkg_base_m' },
            { label: 'Pro (5 pagine)', price: 'pkg_pro', market: 'pkg_pro_m' },
            { label: 'Premium (10 pagine)', price: 'pkg_premium', market: 'pkg_premium_m' },
        ],
    },
    {
        title: 'Opzioni',
        rows: [
            { label: 'Ottimizzazione SEO', price: 'seo', market: 'seo_m' },
            { label: 'Social & Google Maps', price: 'social', market: 'social_m' },
            { label: 'Pacchetto UI/UX (fino a 10 pagine)', price: 'uiux', market: 'uiux_m' },
            { label: 'Pacchetto UI/UX (oltre 10 pagine)', price: 'uiux_large' },
            { label: 'Area utente (Login)', price: 'user_area', market: 'user_area_m' },
            { label: 'Blog / News', price: 'blog', market: 'blog_m' },
            { label: 'Forum Community', price: 'forum', market: 'forum_m' },
            { label: 'Eventi gratuiti', price: 'events', market: 'events_m' },
            { label: 'Appuntamenti gratuiti', price: 'appointments', market: 'appointments_m' },
            { label: 'Chatbot AI', price: 'chatbot', market: 'chatbot_m' },
            { label: 'Newsletter', price: 'newsletter', market: 'newsletter_m' },
        ],
    },
    {
        title: 'Automazioni email',
        rows: [
            { label: 'Singola (1 automazione)', price: 'auto_70', market: 'auto_70_m' },
            { label: 'Base (fino a 2)', price: 'auto_130', market: 'auto_130_m' },
            { label: 'Avanzata (fino a 5)', price: 'auto_300', market: 'auto_300_m' },
            { label: 'Sconto Bundle Marketing con "Base"', price: 'discount_130' },
            { label: 'Sconto Bundle Marketing con "Avanzata"', price: 'discount_300' },
        ],
    },
    {
        title: 'Lingue e pagine extra',
        rows: [
            { label: 'Traduzioni: lingue 1-5 (per lingua)', price: 'lang_first', market: 'lang_m' },
            { label: 'Traduzioni: dalla 6ª lingua (per lingua)', price: 'lang_next' },
            { label: 'Pagine extra: prime 5 (per pagina)', price: 'page_first', market: 'page_m' },
            { label: 'Pagine extra: dalla 6ª (per pagina)', price: 'page_next' },
            { label: 'SEO sulle pagine extra (per pagina)', price: 'seo_extra_page' },
        ],
    },
    {
        title: 'Animazioni custom e revisioni',
        rows: [
            { label: 'Animazione S (cad.)', price: 'anim_s' },
            { label: 'Animazione M (cad.)', price: 'anim_m' },
            { label: 'Animazione L (cad.)', price: 'anim_l' },
            { label: 'Animazione XL (cad., + costo extra)', price: 'anim_xl' },
            { label: 'Round di revisione extra', price: 'revision' },
        ],
    },
];

export const LISTINO_DEFAULTS = {
    pkg_base: 400, pkg_base_m: 690, pkg_pro: 650, pkg_pro_m: 1380, pkg_premium: 1250, pkg_premium_m: 2300,
    seo: 140, seo_m: 207, social: 30, social_m: 104,
    uiux: 50, uiux_large: 100, uiux_m: 184,
    user_area: 60, user_area_m: 518, blog: 70, blog_m: 173, forum: 65, forum_m: 138,
    events: 90, events_m: 207, appointments: 90, appointments_m: 207,
    chatbot: 300, chatbot_m: 800, newsletter: 130, newsletter_m: 311,
    auto_70: 70, auto_70_m: 374, auto_130: 130, auto_130_m: 748, auto_300: 300, auto_300_m: 1093,
    discount_130: 30, discount_300: 50,
    lang_first: 40, lang_next: 60, lang_m: 288,
    page_first: 50, page_next: 70, page_m: 138, seo_extra_page: 25,
    anim_s: 30, anim_m: 50, anim_l: 90, anim_xl: 150,
    revision: 30,
};

export const STANDARD_ID = 'standard';
export const STANDARD_NAME = 'Standard';
const FILE_FORMAT = 'upersite-listino';
const FILE_VERSION = 1;

const isPrice = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const sameName = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const newId = () => `listino-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// Solo le voci valide e diverse da Standard
export function cleanListinoOverrides(overrides) {
    const clean = {};
    Object.entries(overrides || {}).forEach(([key, value]) => {
        if (!Object.hasOwn(LISTINO_DEFAULTS, key) || !isPrice(value)) return;
        if (value !== LISTINO_DEFAULTS[key]) clean[key] = value;
    });
    return clean;
}

export function getListino(overrides) {
    return { ...LISTINO_DEFAULTS, ...cleanListinoOverrides(overrides) };
}

// Listini salvati e id di quello in uso. Dati di prima dei listini (settings.calcListino, anche da un
// backup vecchio): le modifiche diventano il listino "Personalizzato", già attivo.
export function getListiniState(settings) {
    let listini;
    let activeId = settings?.calcListinoAttivo;
    if (Array.isArray(settings?.calcListini)) {
        listini = settings.calcListini.filter(l => isObject(l) && l.id && l.id !== STANDARD_ID);
    } else {
        const old = cleanListinoOverrides(settings?.calcListino);
        listini = Object.keys(old).length ? [{ id: 'personalizzato', nome: 'Personalizzato', creatoIl: null, prezzi: old }] : [];
        activeId = listini[0]?.id;
    }
    if (!listini.some(l => l.id === activeId)) activeId = STANDARD_ID;
    return { listini, activeId };
}

export function getAllListini(settings) {
    return [{ id: STANDARD_ID, nome: STANDARD_NAME, prezzi: {} }, ...getListiniState(settings).listini];
}

// Listino in uso, con tutti i prezzi
export function getActiveListino(settings) {
    const { activeId } = getListiniState(settings);
    const found = getAllListini(settings).find(l => l.id === activeId);
    return { id: found.id, nome: found.nome, prezzi: getListino(found.prezzi) };
}

// Le funzioni qui sotto restituiscono le impostazioni da salvare con updateSettings
const patch = (listini, activeId) => ({ calcListini: listini, calcListinoAttivo: activeId, calcListino: null });

export function uniqueListinoName(name, listini) {
    const base = String(name).trim() || 'Listino';
    const taken = (n) => sameName(n, STANDARD_NAME) || listini.some(l => sameName(l.nome, n));
    let result = base;
    for (let i = 2; taken(result); i++) result = `${base} (${i})`;
    return result;
}

export function selectListino(settings, id) {
    return patch(getListiniState(settings).listini, id);
}

// Nuovo listino (diventa quello in uso); prezzi = {} per partire da Standard
export function addListino(settings, name, prezzi = {}) {
    const { listini } = getListiniState(settings);
    const item = { id: newId(), nome: uniqueListinoName(name, listini), creatoIl: new Date().toISOString(), prezzi: cleanListinoOverrides(prezzi) };
    return patch([...listini, item], item.id);
}

export function renameListino(settings, id, name) {
    const { listini, activeId } = getListiniState(settings);
    const others = listini.filter(l => l.id !== id);
    return patch(listini.map(l => l.id === id ? { ...l, nome: uniqueListinoName(name, others) } : l), activeId);
}

export function deleteListino(settings, id) {
    const { listini, activeId } = getListiniState(settings);
    return patch(listini.filter(l => l.id !== id), activeId === id ? STANDARD_ID : activeId);
}

// value null = torna al prezzo Standard
export function setListinoPrice(settings, id, key, value) {
    const { listini, activeId } = getListiniState(settings);
    return patch(listini.map(l => {
        if (l.id !== id) return l;
        const prezzi = { ...l.prezzi };
        if (value === null) delete prezzi[key];
        else prezzi[key] = value;
        return { ...l, prezzi: cleanListinoOverrides(prezzi) };
    }), activeId);
}

/* ── Import / export JSON ── */

export function buildListinoFile(listini) {
    return {
        formato: FILE_FORMAT,
        versione: FILE_VERSION,
        esportatoIl: new Date().toISOString(),
        listini: listini.map(l => ({ nome: l.nome, prezzi: getListino(l.prezzi) })),
    };
}

// Legge un file esportato (anche scritto a mano e parziale: le voci mancanti valgono come Standard)
export function parseListinoFile(text) {
    let data;
    try { data = JSON.parse(String(text).replace(/^\uFEFF/, '')); } catch { throw new Error('Il file non è un JSON valido.'); }
    if (!isObject(data) || data.formato !== FILE_FORMAT) throw new Error(`Non è un file di listini (manca "formato": "${FILE_FORMAT}").`);
    if (data.versione !== FILE_VERSION) throw new Error('Versione del file non supportata.');
    if (!Array.isArray(data.listini) || !data.listini.length) throw new Error('Il file non contiene listini.');
    return data.listini.map((l, i) => {
        const nome = isObject(l) && typeof l.nome === 'string' ? l.nome.trim() : '';
        if (!nome) throw new Error(`Il listino n. ${i + 1} non ha un nome.`);
        if (!isObject(l.prezzi)) throw new Error(`Il listino «${nome}» non ha i prezzi.`);
        const valid = {};
        const discarded = [];
        Object.entries(l.prezzi).forEach(([key, value]) => {
            if (Object.hasOwn(LISTINO_DEFAULTS, key) && isPrice(value)) valid[key] = value;
            else discarded.push(key);
        });
        if (!Object.keys(valid).length) throw new Error(`Il listino «${nome}» non contiene nessun prezzo valido.`);
        return { nome, prezzi: cleanListinoOverrides(valid), discarded };
    });
}

// Voci che cambiano tra due listini: [{ key, label, from, to }]
export function diffListini(from, to) {
    const a = getListino(from);
    const b = getListino(to);
    const labels = {};
    LISTINO_GROUPS.forEach(g => g.rows.forEach(r => {
        labels[r.price] = r.label;
        if (r.market) labels[r.market] = `${r.label} (mercato)`;
    }));
    return Object.keys(LISTINO_DEFAULTS).filter(k => a[k] !== b[k]).map(k => ({ key: k, label: labels[k] || k, from: a[k], to: b[k] }));
}

// items = [{ nome, prezzi, replaceId }] — replaceId sostituisce quel listino, altrimenti si crea una copia.
// Il listino in uso non cambia.
export function importListini(settings, items) {
    const state = getListiniState(settings);
    let listini = state.listini;
    items.forEach(item => {
        const prezzi = cleanListinoOverrides(item.prezzi);
        if (item.replaceId && listini.some(l => l.id === item.replaceId)) {
            listini = listini.map(l => l.id === item.replaceId ? { ...l, prezzi } : l);
        } else {
            listini = [...listini, { id: newId(), nome: uniqueListinoName(item.nome, listini), creatoIl: new Date().toISOString(), prezzi }];
        }
    });
    return patch(listini, state.activeId);
}

export function findListinoByName(settings, name) {
    return getListiniState(settings).listini.find(l => sameName(l.nome, name)) || null;
}

export const CALC_PACKAGE_NAMES = { base: 'Base', pro: 'Pro', premium: 'Premium' };
