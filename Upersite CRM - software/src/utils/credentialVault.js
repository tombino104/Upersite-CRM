// Cifratura delle password delle credenziali clienti (AES-GCM 256).
// La chiave è ricavata dalla password master con PBKDF2: senza la password master
// le credenziali salvate in crm_data.json (e nei backup) non sono leggibili.
// Formato salvato nel campo `password`: enc:v1:<salt>:<iv>:<testo cifrato>  (base64)

const PREFIX = 'enc:v1:';
const PBKDF2_ITERATIONS = 210000;

// Cache delle chiavi già ricavate (PBKDF2 è volutamente lento)
const keyCache = new Map();
let sessionSalt = null;

function bytesToBase64(bytes) {
    return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(b64) {
    return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

function deriveKey(password, salt) {
    const cacheKey = `${bytesToBase64(salt)}|${password}`;
    if (!keyCache.has(cacheKey)) {
        keyCache.set(cacheKey, (async () => {
            const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
            return crypto.subtle.deriveKey(
                { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
                material,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );
        })());
    }
    return keyCache.get(cacheKey);
}

export function isEncrypted(value) {
    return typeof value === 'string' && value.startsWith(PREFIX);
}

export async function encryptSecret(plain, password) {
    if (!plain) return '';
    if (!sessionSalt) sessionSalt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, sessionSalt);
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)));
    return `${PREFIX}${bytesToBase64(sessionSalt)}:${bytesToBase64(iv)}:${bytesToBase64(cipher)}`;
}

// Restituisce il testo in chiaro. I valori legacy non cifrati vengono restituiti così come sono.
// Lancia un errore se la password non è quella usata per cifrare.
export async function decryptSecret(value, password) {
    if (!isEncrypted(value)) return value || '';
    const [saltB64, ivB64, cipherB64] = value.slice(PREFIX.length).split(':');
    const key = await deriveKey(password, base64ToBytes(saltB64));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(ivB64) }, key, base64ToBytes(cipherB64));
    return new TextDecoder().decode(plain);
}

// Dimentica le chiavi in memoria (logout / blocco per inattività)
export function clearCredentialKeys() {
    keyCache.clear();
    sessionSalt = null;
}

// Cifra le password ancora in chiaro. Restituisce { [customerId]: nuoveCredenziali } solo per i clienti modificati.
export async function encryptPlainCredentials(customers, password) {
    const changes = {};
    for (const customer of customers) {
        const creds = customer.credentials || [];
        if (!creds.some(c => c.password && !isEncrypted(c.password))) continue;
        changes[customer.id] = await Promise.all(creds.map(async c =>
            c.password && !isEncrypted(c.password) ? { ...c, password: await encryptSecret(c.password, password) } : c
        ));
    }
    return changes;
}

// Ricifra tutte le credenziali con una nuova password master.
// Quelle non decifrabili con la password attuale restano invariate e vengono contate in `failed`.
export async function reencryptCredentials(customers, oldPassword, newPassword) {
    let failed = 0;
    const updated = await Promise.all(customers.map(async customer => {
        if (!(customer.credentials || []).length) return customer;
        const credentials = await Promise.all(customer.credentials.map(async c => {
            if (!c.password) return c;
            try {
                const plain = await decryptSecret(c.password, oldPassword);
                return { ...c, password: await encryptSecret(plain, newPassword) };
            } catch {
                failed++;
                return c;
            }
        }));
        return { ...customer, credentials };
    }));
    return { customers: updated, failed };
}
