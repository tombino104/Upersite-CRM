// Cifratura nel browser: PBKDF2-SHA256 e AES-256-GCM.
//
// Il browser mette `crypto.subtle` a disposizione solo in un "contesto sicuro" (HTTPS o localhost).
// Aprendo il CRM da un indirizzo in HTTP (per esempio http://umbrel.local:8481 o l'IP del server in casa)
// `crypto.subtle` non esiste: senza un'alternativa non si potrebbe nemmeno creare la password.
// Quando manca, si usano le stesse funzioni in JavaScript puro (@noble). Il risultato è identico byte per byte,
// quindi password e dati restano compatibili tra i due modi. Il modo nativo è molto più veloce.
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { gcm } from '@noble/ciphers/aes.js';

const hasSubtle = () => typeof crypto !== 'undefined' && !!crypto.subtle;

const encoder = new TextEncoder();

// PBKDF2-SHA256: restituisce `length` byte
export async function pbkdf2Sha256(password, salt, iterations, length = 32) {
    if (hasSubtle()) {
        const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
        const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, length * 8);
        return new Uint8Array(bits);
    }
    return pbkdf2Async(sha256, encoder.encode(password), salt, { c: iterations, dkLen: length, asyncTick: 10 });
}

// AES-256-GCM: `key` è la chiave in byte; il risultato (e l'ingresso di decrypt) è testo cifrato + tag da 16 byte
export async function aesGcmEncrypt(key, iv, plain) {
    if (hasSubtle()) {
        const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['encrypt']);
        return new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, plain));
    }
    return gcm(key, iv).encrypt(plain);
}

export async function aesGcmDecrypt(key, iv, cipher) {
    if (hasSubtle()) {
        const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['decrypt']);
        return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, cipher));
    }
    return gcm(key, iv).decrypt(cipher);
}
