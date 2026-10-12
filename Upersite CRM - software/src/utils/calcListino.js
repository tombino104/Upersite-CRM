// Listino del calcolatore integrato (public/calcolatore).
// I default sono identici a quelli scritti nella pagina del calcolatore: nelle Impostazioni
// si salvano solo le voci cambiate (settings.calcListino), che la pagina riceve all'avvio.
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

// Solo le voci valide e diverse dal default (quelle che la pagina del calcolatore deve sovrascrivere)
export function cleanListinoOverrides(overrides) {
    const clean = {};
    Object.entries(overrides || {}).forEach(([key, value]) => {
        if (!(key in LISTINO_DEFAULTS)) return;
        if (typeof value !== 'number' || !isFinite(value) || value < 0) return;
        if (value !== LISTINO_DEFAULTS[key]) clean[key] = value;
    });
    return clean;
}

export function getListino(overrides) {
    return { ...LISTINO_DEFAULTS, ...cleanListinoOverrides(overrides) };
}

export const CALC_PACKAGE_NAMES = { base: 'Base', pro: 'Pro', premium: 'Premium' };
