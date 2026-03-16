// Upersite CRM — Local Storage Persistence Layer

const STORAGE_KEY = 'upersite_crm_data';
const MASTER_KEY = 'upersite_crm_master';

function trySetLocalStorage(key, value) {
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
    settings: {
        inactivityTimeout: 5 * 60 * 1000,
        defaultInstallments: 3,
        currency: 'EUR'
    }
};

export function loadData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...defaultData };
        return JSON.parse(raw);
    } catch {
        return { ...defaultData };
    }
}

// Initial sync with file system
export async function syncWithFileSystem() {
    try {
        const response = await fetch('/api/storage');
        const data = await response.json();
        if (data && Object.keys(data).length > 0) {
            trySetLocalStorage(STORAGE_KEY, JSON.stringify(data));
            if (data.masterPassword) {
                trySetLocalStorage(MASTER_KEY, data.masterPassword);
            }
            return data;
        }
    } catch (err) {
        console.error('Failed to sync with file system:', err);
    }
    return loadData();
}

export function saveData(data) {
    const serialized = JSON.stringify(data);
    trySetLocalStorage(STORAGE_KEY, serialized);

    const masterPassword = localStorage.getItem(MASTER_KEY);
    return fetch('/api/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, masterPassword })
    }).catch(err => console.error('Persistence failed:', err));
}

export function getMasterPassword() {
    return localStorage.getItem(MASTER_KEY);
}

export function setMasterPassword(password) {
    trySetLocalStorage(MASTER_KEY, password);
    const data = loadData();
    saveData(data); // This will trigger file write
}

export function hasMasterPassword() {
    return !!localStorage.getItem(MASTER_KEY);
}

export function resetMasterPassword() {
    localStorage.removeItem(MASTER_KEY);
    const data = loadData();
    saveData(data);
}

export async function exportData() {
    let data;
    try {
        const response = await fetch('/api/storage');
        const fileData = await response.json();
        data = (fileData && Object.keys(fileData).length > 0) ? fileData : loadData();
    } catch {
        data = loadData();
    }

    let totalFiles = 0;
    if (data.customers && Array.isArray(data.customers)) {
        data.customers.forEach(customer => {
            if (customer.files && Array.isArray(customer.files)) {
                totalFiles += customer.files.length;
            }
        });
    }

    const completeBackup = {
        version: "1.0.0",
        exportDate: new Date().toISOString(),
        data: data,
        metadata: {
            totalCustomers: data.customers ? data.customers.length : 0,
            totalFiles: totalFiles,
            totalTags: data.tags ? data.tags.length : 0,
            includesFiles: true,
            includesFileStructure: true,
            includesFolderStructure: true,
            note: "Backup completo con tutti i file e strutture delle cartelle incluse"
        }
    };

    const blob = new Blob([JSON.stringify(completeBackup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `upersite-crm-backup-completo-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

export async function importData(jsonString) {
    try {
        const backup = JSON.parse(jsonString);

        // Gestisce sia il nuovo formato completo che il vecchio formato
        let data;
        if (backup.data && backup.metadata) {
            data = backup.data;
            console.log(`Importato backup completo: ${backup.metadata.totalCustomers} clienti, ${backup.metadata.totalFiles} file`);
        } else if (backup.customers && Array.isArray(backup.customers)) {
            data = backup;
            console.log('Importato backup in formato legacy');
        } else {
            return false;
        }

        await saveData(data);
        return true;
    } catch (error) {
        console.error('Errore durante l\'importazione:', error);
        return false;
    }
}

export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// File storage using base64 in localStorage
export function saveFile(customerId, file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
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
        if (localStorage.hasOwnProperty(key)) {
            total += (localStorage[key].length + key.length) * 2; // UTF-16
        }
    }
    return total;
}

export function getAppDataSize() {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? data.length * 2 : 0;
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
