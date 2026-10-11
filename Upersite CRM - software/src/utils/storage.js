// Upersite CRM — Local Storage Persistence Layer



const STORAGE_KEY = 'upersite_crm_data';

const MASTER_KEY = 'upersite_crm_master';

// Header richiesto dal server locale per le richieste che modificano i dati (vedi vite.config.js)
export const CRM_REQUEST_HEADERS = { 'Content-Type': 'application/json', 'X-Upersite-CRM': '1' };



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

export async function syncWithFileSystem() {

    try {

        const response = await fetch('/api/storage');

        let data = await response.json();



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



export function saveData(data) {

    // Saltiamo il salvataggio in localStorage per i dati pesanti

    // trySetLocalStorage(STORAGE_KEY, JSON.stringify(data)); // RIMOSSO



    const masterPassword = localStorage.getItem(MASTER_KEY);

    return fetch('/api/storage', {

        method: 'POST',

        headers: CRM_REQUEST_HEADERS,

        body: JSON.stringify({ ...data, masterPassword })

    }).catch(err => console.error('Persistence failed:', err));

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



export async function setMasterPassword(password) {

    const hashed = await hashPassword(password);

    trySetLocalStorage(MASTER_KEY, hashed);

    // Aggiorna solo il campo masterPassword nel file, senza toccare gli altri dati

    const response = await fetch('/api/storage');

    const current = await response.json();

    return fetch('/api/storage', {

        method: 'POST',

        headers: CRM_REQUEST_HEADERS,

        body: JSON.stringify({ ...defaultData, ...current, masterPassword: hashed })

    }).catch(err => console.error('Persistence failed:', err));

}



export function hasMasterPassword() {

    return !!localStorage.getItem(MASTER_KEY);

}



export async function triggerAutoBackup(options = {}) {

    try {

        const data = await syncWithFileSystem();

        const backupPath = data.settings?.backupPath;

        if (!backupPath) return { success: false, error: 'Percorso non configurato' };



        const { includeFiles = true } = options;



        const response = await fetch('/api/backup/auto', {

            method: 'POST',

            headers: CRM_REQUEST_HEADERS,

            body: JSON.stringify({ backupPath, includeFiles })

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

