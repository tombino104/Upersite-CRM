// Cifratura a riposo dei dati del CRM (AES-256-GCM).
//
// Cosa viene cifrato: crm_data.json, le sue copie nei backup e i preventivi (Dati/Preventivi).
// La chiave NON sta nel codice né nei dati: la fornisci tu al server.
//
//   CRM_ENCRYPTION_KEY       la chiave: 32 byte in base64 oppure 64 caratteri esadecimali
//                            (generala con:  openssl rand -base64 32)
//                            In alternativa una frase lunga (almeno 20 caratteri), meno sicura.
//   CRM_ENCRYPTION_KEY_FILE  percorso di un file che contiene la chiave (es. un secret di Docker)
//
// Senza chiave i file restano in chiaro (come nelle versioni precedenti) e il server lo scrive nel log.
// Con la chiave i file in chiaro già presenti vengono cifrati all'avvio; i file cifrati si riconoscono
// dall'intestazione, quindi leggere file in chiaro o cifrati funziona sempre.
//
// ATTENZIONE: senza la chiave i dati cifrati non si recuperano. Conservala anche fuori dal server
// (per esempio nel password manager).
//
// Formato file: "UCRMENC1" (8 byte) | iv (12) | tag (16) | testo cifrato
import crypto from 'crypto'
import fs from 'fs'
import process from 'process'
import { Buffer } from 'buffer'

const MAGIC = Buffer.from('UCRMENC1')
const HEADER = MAGIC.length + 12 + 16

function loadKey() {
  let raw = process.env.CRM_ENCRYPTION_KEY
  const file = process.env.CRM_ENCRYPTION_KEY_FILE
  if (!raw && file) {
    try { raw = fs.readFileSync(file, 'utf-8') } catch (e) { throw new Error(`Impossibile leggere CRM_ENCRYPTION_KEY_FILE (${file}): ${e.message}`) }
  }
  raw = (raw || '').trim()
  if (!raw) return null
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex')
  if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(raw)) {
    const b = Buffer.from(raw, 'base64')
    if (b.length === 32) return b
  }
  if (raw.length < 20) throw new Error('La chiave di cifratura è troppo corta: usa 32 byte in base64 (openssl rand -base64 32) o una frase di almeno 20 caratteri')
  return crypto.scryptSync(raw, 'upersite-crm-v1', 32)
}

const KEY = loadKey()

export function isEnabled() {
  return KEY !== null
}

export function isEncrypted(buf) {
  return buf.length >= HEADER && buf.subarray(0, MAGIC.length).equals(MAGIC)
}

export function encrypt(buf) {
  if (!KEY) throw new Error('Chiave di cifratura non impostata')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv)
  const body = Buffer.concat([cipher.update(buf), cipher.final()])
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body])
}

export function decrypt(buf) {
  if (!KEY) throw new Error('I dati sono cifrati ma manca la chiave: imposta CRM_ENCRYPTION_KEY (o CRM_ENCRYPTION_KEY_FILE)')
  try {
    const iv = buf.subarray(MAGIC.length, MAGIC.length + 12)
    const tag = buf.subarray(MAGIC.length + 12, HEADER)
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(buf.subarray(HEADER)), decipher.final()])
  } catch {
    throw new Error('Impossibile decifrare i dati: la chiave di cifratura è errata o il file è danneggiato')
  }
}

// File letto dal disco: se è cifrato lo decifra, altrimenti lo restituisce com'è
export function decryptIfNeeded(buf) {
  return isEncrypted(buf) ? decrypt(buf) : buf
}

// Da scrivere su disco: cifrato se la chiave è impostata
export function protect(buf) {
  return KEY ? encrypt(buf) : buf
}
