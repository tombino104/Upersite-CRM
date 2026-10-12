// Upersite CRM — Local Storage Persistence Layer



const STORAGE_KEY = 'upersite_crm_data';

const MASTER_KEY = 'upersite_crm_master';

// Header richiesto dal server locale per le richieste che modificano i dati (vedi vite.config.js)
export const CRM_REQUEST_HEADERS = { 'Content-Type': 'application/json', 'X-Upersite-CRM': '1' };

// Revisione del file dati caricata da questa finestra. Il server rifiuta (409) un salvataggio
// basato su una revisione vecchia: succede se un'altra finestra/scheda ha salvato nel frattempo.
let loadedRevision = null;

// Notifica all'interfaccia l'esito dei salvataggi: 'ok' | 'error' | 'conflict'
export const SAVE_STATUS_EVENT = 'upersite-save-status';

function emitSaveStatus(status, message = '') {
    window.dispatchEvent(new CustomEvent(SAVE_STATUS_EVENT, { detail: { status, message } }));
}

async function postStorage(payload, baseRevision) {
    const response = await fetch('/api/storage', {
        method: 'POST',
        headers: { ...CRM_REQUEST_HEADERS, ...(baseRevision ? { 'X-CRM-Base-Revision': baseRevision } : {}) },
        body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, revision: result.revision, error: result.error };
}



function trySetLocalStorage(key, value) {

    // Only allow small keys in localStorage (master password, settings)

    if (key === STORAGE_KEY && value.length > 1000000) {

        console.warn('Skipping localStorage for large data object');

        return false;

    }

    try {

        localStorage.setItem(key, value);

        return true;

    } catch (err) {

        console.warn('localStorage write failed:', err);

        return false;

    }

}



export const defaultData = {

    customers: [],

    tags: [],

    events: [],

    chatHistory: [],

    aiUsageStats: { date: '', count: 0 },

    workflows: [],

    workflowLogs: [],

    userProfile: {
        name: '',
        email: '',
        phone: '',
        company: '',
        role: '',
        photo: '',
        bio: '',
        preferences: {
        }
    },

    settings: {

        inactivityTimeout: 5 * 60 * 1000,

        defaultInstallments: 3,

        currency: 'EUR',

        backupPath: '',

        aiOptimization: false

    },

    tokenStats: {

        totalUsed: 0,

        totalSaved: 0

    }

};



export function loadData() {

    try {

        const raw = localStorage.getItem(STORAGE_KEY);

        if (!raw) return { ...defaultData };

        let data = JSON.parse(raw);

        // Unwrap logic per il caricamento legacy da localStorage

        if (data && data.data && data.metadata && data.data.customers) {

            data = data.data;

        }

        return data;

    } catch {

        return { ...defaultData };

    }

}



// Initial sync with file system

// adoptRevision=false per le letture che non caricano i dati nell'app (login, backup)
export async function syncWithFileSystem({ adoptRevision = true } = {}) {

    try {

        const response = await fetch('/api/storage');

        const revision = response.headers.get('X-CRM-Revision');

        let data = await response.json();

        if (adoptRevision) loadedRevision = revision;



        // Unwrap data if it comes in the "backup" format

        if (data && data.data && data.metadata && data.data.customers) {

            data = data.data;

        }



        if (data && Object.keys(data).length > 0) {

            // Non salviamo più l'intero dataset in localStorage per evitare limiti di 5MB

            // Il file è la fonte di verità per la password master

            if (data.masterPassword) {

                trySetLocalStorage(MASTER_KEY, data.masterPassword);

            } else {

                localStorage.removeItem(MASTER_KEY);

            }

            return data;

        }

    } catch (err) {

        console.error('Failed to sync with file system:', err);

    }

    return loadData(); // Fallback legacy se necessario

}



// I salvataggi sono messi in coda: uno alla volta, inviando sempre i dati più recenti
let saveInFlight = null;

let queuedData = null;

export function saveData(data) {

    queuedData = data;

    if (!saveInFlight) {

        saveInFlight = flushSaves().finally(() => { saveInFlight = null; });

    }

    return saveInFlight;

}

async function flushSaves() {

    while (queuedData) {

        const data = queuedData;

        queuedData = null;

        const masterPassword = localStorage.getItem(MASTER_KEY);

        try {

            const result = await postStorage({ ...data, masterPassword }, loadedRevision);

            if (result.ok) {

                loadedRevision = result.revision || loadedRevision;

                emitSaveStatus('ok');

            } else if (result.status === 409) {

                emitSaveStatus('conflict', "I dati sono stati modificati da un'altra finestra o scheda del CRM. Le ultime modifiche di questa finestra NON sono state salvate.");

                return;

            } else {

                emitSaveStatus('error', `Salvataggio non riuscito: ${result.error || 'errore ' + result.status}`);

            }

        } catch {

            emitSaveStatus('error', 'Salvataggio non riuscito: il server del CRM non risponde. Non chiudere la finestra e riavvia il CRM.');

        }

    }

}



// Hash della password master (PBKDF2-SHA256). Formato salvato:
// pbkdf2$<iterazioni>$<salt base64>$<hash base64>
const PBKDF2_ITERATIONS = 210000;

function bytesToBase64(bytes) {

    return btoa(String.fromCharCode(...bytes));

}

function base64ToBytes(b64) {

    return Uint8Array.from(atob(b64), c => c.charCodeAt(0));

}

async function derivePasswordHash(password, salt, iterations) {

    const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);

    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, keyMaterial, 256);

    return new Uint8Array(bits);

}

async function hashPassword(password) {

    const salt = crypto.getRandomValues(new Uint8Array(16));

    const hash = await derivePasswordHash(password, salt, PBKDF2_ITERATIONS);

    return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;

}

function isHashedPassword(stored) {

    return typeof stored === 'string' && stored.startsWith('pbkdf2$');

}




export function getMasterPassword() {

    return localStorage.getItem(MASTER_KEY);

}



export async function verifyMasterPassword(password) {

    const stored = getMasterPassword();

    if (!stored || typeof password !== 'string') return false;

    if (!isHashedPassword(stored)) {

        // Password legacy salvata in chiaro: se corretta, la convertiamo subito in hash

        if (password !== stored) return false;

        await setMasterPassword(password);

        return true;

    }

    const [, iterations, saltB64, hashB64] = stored.split('$');

    const expected = base64ToBytes(hashB64);

    const actual = await derivePasswordHash(password, base64ToBytes(saltB64), Number(iterations));

    if (actual.length !== expected.length) return false;

    let diff = 0;

    for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];

    return diff === 0;

}



// persist=false: aggiorna solo la password in memoria; verrà scritta nel file al prossimo salvataggio
// dei dati (usato dal cambio password per salvarla insieme alle credenziali ricifrate).
export async function setMasterPassword(password, { persist = true } = {}) {

    const hashed = await hashPassword(password);

    trySetLocalStorage(MASTER_KEY, hashed);

    if (!persist) return;

    // Aggiorna solo il campo masterPassword nel file, senza toccare gli altri dati

    try {

        const response = await fetch('/api/storage');

        const readRevision = response.headers.get('X-CRM-Revision');

        const current = await response.json();

        const result = await postStorage({ ...defaultData, ...current, masterPassword: hashed }, readRevision);

        // Se questa finestra era aggiornata, lo resta anche dopo la scrittura

        if (result.ok && loadedRevision === readRevision) loadedRevision = result.revision;

        if (!result.ok) emitSaveStatus('error', `Salvataggio della password non riuscito: ${result.error || 'errore ' + result.status}`);

    } catch (err) {

        console.error('Persistence failed:', err);

        emitSaveStatus('error', 'Salvataggio della password non riuscito: il server del CRM non risponde.');

    }

}



export function hasMasterPassword() {

    return !!localStorage.getItem(MASTER_KEY);

}



// Preferenze salvate nel browser (modello AI, scelte del calcolatore, ecc.): finiscono nel backup del giorno.
// Esclusi i dati completi e la password master, che sono già nel file dati.
export function getBrowserPrefs() {
    const prefs = {};
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key === STORAGE_KEY || key === MASTER_KEY) continue;
            const value = localStorage.getItem(key);
            if (typeof value === 'string' && value.length <= 200000) prefs[key] = value;
        }
    } catch { /* localStorage non disponibile */ }
    return prefs;
}

// Rimette le preferenze di un backup ripristinato (stesse esclusioni di getBrowserPrefs)
export function applyBrowserPrefs(prefs) {
    if (!prefs || typeof prefs !== 'object') return;
    Object.entries(prefs).forEach(([key, value]) => {
        if (key === STORAGE_KEY || key === MASTER_KEY || typeof value !== 'string') return;
        try { localStorage.setItem(key, value); } catch { /* spazio esaurito: preferenza saltata */ }
    });
}

export async function triggerAutoBackup(options = {}) {

    try {

        const data = await syncWithFileSystem({ adoptRevision: false });

        const backupPath = data.settings?.backupPath;

        if (!backupPath) return { success: false, error: 'Percorso non configurato' };



        const { includeFiles = true } = options;



        const response = await fetch('/api/backup/auto', {

            method: 'POST',

            headers: CRM_REQUEST_HEADERS,

            body: JSON.stringify({ backupPath, includeFiles, prefs: getBrowserPrefs() })

        });



        if (!response.ok) {

            const err = await response.json();

            throw new Error(err.error || 'Errore durante il backup automatico');

        }



        return await response.json();

    } catch (err) {

        console.error('Auto backup failed:', err);

        return { success: false, error: err.message };

    }

}



export async function exportData() {

    // Invece di creare un blob in memoria nel browser (che può fallire con 40MB+),

    // usiamo l'endpoint del server che streamma il file direttamente.

    window.location.href = '/api/backup/export';

}



export async function importData(jsonString) {

    try {

        // Inviamo il file al server per il salvataggio diretto

        const response = await fetch('/api/backup/import', {

            method: 'POST',

            headers: CRM_REQUEST_HEADERS,

            body: jsonString

        });



        if (!response.ok) {

            const err = await response.json();

            throw new Error(err.error || 'Errore server durante l\'importazione');

        }



        return true;

    } catch (error) {

        console.error('Errore durante l\'importazione:', error);

        alert('Errore: ' + error.message);

        return false;

    }

}



export function generateId() {

    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);

}



// File storage using base64 in localStorage

export function saveFile(customerId, file, onProgress) {

    return new Promise((resolve, reject) => {

        const reader = new FileReader();

        reader.onprogress = (e) => {

            if (typeof onProgress === 'function' && e && e.lengthComputable) {

                onProgress(e.loaded, e.total);

            }

        };

        reader.onload = () => {

            if (typeof onProgress === 'function') {

                const total = file?.size || 0;

                onProgress(total, total);

            }

            const fileData = {

                id: generateId(),

                name: file.name,

                path: file.webkitRelativePath || file.name,

                type: file.type,

                size: file.size,

                data: reader.result,

                uploadedAt: new Date().toISOString(),

            };

            resolve(fileData);

        };

        reader.onerror = reject;

        reader.readAsDataURL(file);

    });

}



export function formatBytes(bytes) {

    if (bytes === 0) return '0 B';

    const k = 1024;

    const sizes = ['B', 'KB', 'MB', 'GB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];

}



export function getTotalStorageUsed() {

    let total = 0;

    for (let key in localStorage) {

        if (Object.prototype.hasOwnProperty.call(localStorage, key)) {

            total += (localStorage[key].length + key.length) * 2; // UTF-16

        }

    }

    return total;

}



export function getAppDataSize() {

    const data = localStorage.getItem(STORAGE_KEY);

    return data ? data.length * 2 : 0;

}



export async function getStorageInfo() {

    try {

        const response = await fetch('/api/storage-info');

        if (!response.ok) return null;

        return await response.json();

    } catch (err) {

        console.error('Failed to get storage info:', err);

        return null;

    }

}



// Sanitize number: no negatives

export function sanitizePositiveNumber(value) {

    const num = parseFloat(value);

    if (isNaN(num) || num < 0) return '';

    return value;

}



// Add-ons / Pricing catalog

export const PACKAGES = [

    { id: 'base', label: 'Base (3 pagine)', price: 690 },

    { id: 'pro', label: 'Pro (5 pagine)', price: 1380 },

    { id: 'premium', label: 'Premium (10 pagine)', price: 2300 },

];



export const ADDONS = [

    { id: 'seo', label: 'Ottimizzazione SEO', price: 207 },

    { id: 'social_maps', label: 'Social & Google Maps', price: 104 },

    { id: 'animations', label: 'Animazioni UI/UX', price: 184 },

    { id: 'translations', label: 'Traduzioni (per lingua)', price: 288 },

    { id: 'user_area', label: 'Area utente (Login)', price: 518 },

    { id: 'blog', label: 'Blog/News', price: 173 },

    { id: 'blog_articles', label: 'Articoli blog (3-10)', price: 391 },

    { id: 'forum', label: 'Forum Community', price: 138 },

    { id: 'events', label: 'Eventi gratuiti', price: 207 },

    { id: 'appointments', label: 'Appuntamenti gratuiti', price: 207 },

    { id: 'newsletter', label: 'Newsletter', price: 311 },

    { id: 'email_automation', label: 'Automazioni email', price: 748 },

    { id: 'extra_pages', label: 'Pagine extra (Premium)', price: 138 },

];




// ── Preventivi come file nella cartella dei salvataggi (sottocartella "Preventivi") ──

// Carica un preventivo (File o Blob) e restituisce il percorso relativo salvato nel cliente

export async function uploadQuote(file, fileName, customerName) {

    const response = await fetch('/api/quotes', {

        method: 'POST',

        headers: {

            'X-Upersite-CRM': '1',

            'Content-Type': 'application/octet-stream',

            'X-File-Name': encodeURIComponent(fileName),

            'X-Customer-Name': encodeURIComponent(customerName || '')

        },

        body: file

    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) throw new Error(result.error || `Caricamento non riuscito (errore ${response.status})`);

    return result.storedPath;

}

// Scarica un preventivo salvato e lo restituisce come data URL (per anteprima e download)

export async function fetchQuoteDataUrl(storedPath) {

    const response = await fetch(`/api/quotes?path=${encodeURIComponent(storedPath)}`);

    if (!response.ok) {

        const result = await response.json().catch(() => ({}));

        throw new Error(result.error || 'Preventivo non trovato');

    }

    const blob = await response.blob();

    return new Promise((resolve, reject) => {

        const reader = new FileReader();

        reader.onload = () => resolve(reader.result);

        reader.onerror = () => reject(new Error('Lettura del preventivo non riuscita'));

        reader.readAsDataURL(blob);

    });

}

// Sposta nella cartella i preventivi ancora salvati dentro crm_data.json (base64).

// Restituisce { [customerId]: nuoviFiles } solo per i clienti migrati: il base64 viene tolto

// soltanto dopo un caricamento riuscito.

export async function migrateQuotesToFolder(customers) {

    const changes = {};

    for (const customer of customers) {

        const files = customer.files || [];

        if (!files.some(f => f.isQuote && f.data && !f.storedPath)) continue;

        const updated = [];

        for (const f of files) {

            if (f.isQuote && f.data && !f.storedPath) {

                const blob = await (await fetch(f.data)).blob();

                const storedPath = await uploadQuote(blob, f.name || 'Preventivo.pdf', customer.name);

                const { data: _data, ...rest } = f;

                updated.push({ ...rest, storedPath });

            } else {

                updated.push(f);

            }

        }

        changes[customer.id] = updated;

    }

    return changes;

}



// Elimina definitivamente un preventivo dalla cartella Preventivi (le copie nei backup restano)

export async function deleteQuote(storedPath) {

    const response = await fetch('/api/quotes/delete', {

        method: 'POST',

        headers: CRM_REQUEST_HEADERS,

        body: JSON.stringify({ path: storedPath })

    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) throw new Error(result.error || `Eliminazione non riuscita (errore ${response.status})`);

}
