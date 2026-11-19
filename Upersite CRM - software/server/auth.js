// Autenticazione lato server del CRM.
//
// - La password è la password master già usata dal CRM (hash PBKDF2 salvato in crm_data.json, campo
//   masterPassword): il server la verifica e, se corretta, crea una sessione.
// - La sessione è un cookie casuale HttpOnly + SameSite=Strict (Secure quando si arriva in HTTPS).
//   Le sessioni stanno solo in memoria: riavviando il server tutti devono rifare il login.
// - Tutte le /api/* tranne /api/auth/* richiedono la sessione. Unica eccezione: finché la password master
//   non è stata creata (primo avvio) il CRM è in "modalità configurazione" e le API sono aperte.
// - Tentativi di login limitati per indirizzo (blocco crescente dopo 5 errori).
//
// Variabili d'ambiente:
//   CRM_SESSION_HOURS  ore di inattività dopo cui la sessione scade     (default 12)
//   CRM_TRUST_PROXY    1 = fidati di X-Forwarded-For / CF-Connecting-IP (da usare dietro Tailscale/Cloudflare)
import crypto from 'crypto'
import process from 'process'
import { Buffer } from 'buffer'
import { promisify } from 'util'

const pbkdf2 = promisify(crypto.pbkdf2)

const COOKIE = 'crm_session'
const SESSION_MS = (Number(process.env.CRM_SESSION_HOURS) || 12) * 3600 * 1000
const MAX_SESSIONS = 50
const MAX_FAILS_BEFORE_LOCK = 5

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex')
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a))
  const y = Buffer.from(String(b))
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

function parseCookies(header) {
  const out = {}
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim()
  }
  return out
}

function clientIp(req) {
  if (process.env.CRM_TRUST_PROXY === '1') {
    const cf = req.headers['cf-connecting-ip']
    if (cf) return String(cf)
    const xff = req.headers['x-forwarded-for']
    if (xff) return String(xff).split(',')[0].trim()
  }
  return req.socket.remoteAddress || 'unknown'
}

function sendJson(res, status, body, headers = {}) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v)
  res.end(JSON.stringify(body))
}

function readBody(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', chunk => {
      size += chunk.length
      if (size > limit) { reject(Object.assign(new Error('Richiesta troppo grande'), { status: 413 })); req.destroy(); return }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

// Verifica la password contro il valore salvato: hash "pbkdf2$<iterazioni>$<salt b64>$<hash b64>"
// oppure, per i dati molto vecchi, password in chiaro.
async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || !password || typeof stored !== 'string' || !stored) return { ok: false }
  if (!stored.startsWith('pbkdf2$')) {
    // Password legacy salvata in chiaro: se è corretta il chiamante la converte in hash
    return safeEqual(password, stored) ? { ok: true, legacy: true } : { ok: false }
  }
  const [, iterations, saltB64, hashB64] = stored.split('$')
  const expected = Buffer.from(hashB64, 'base64')
  const iter = Number(iterations)
  if (!expected.length || !Number.isInteger(iter) || iter < 1 || iter > 5_000_000) return { ok: false }
  const actual = await pbkdf2(password, Buffer.from(saltB64, 'base64'), iter, expected.length, 'sha256')
  return { ok: crypto.timingSafeEqual(actual, expected) }
}

// Stesso formato che usa il browser (src/utils/storage.js), così le due parti restano compatibili
async function hashPassword(password) {
  const iterations = 210000
  const salt = crypto.randomBytes(16)
  const hash = await pbkdf2(password, salt, iterations, 32, 'sha256')
  return `pbkdf2$${iterations}$${salt.toString('base64')}$${hash.toString('base64')}`
}

// readMasterPassword(): valore salvato (stringa) o null se non ancora creata
// writeMasterPassword(hashed): lo riscrive nel file dati
export function createAuth({ readMasterPassword, writeMasterPassword }) {
  const sessions = new Map() // sha256(token) -> { lastSeen }
  const attempts = new Map() // ip -> { fails, lockedUntil, lockMs }

  function pruneSessions() {
    const now = Date.now()
    for (const [id, s] of sessions) if (now - s.lastSeen > SESSION_MS) sessions.delete(id)
    // Tetto di sicurezza: si tengono le più recenti
    if (sessions.size > MAX_SESSIONS) {
      const sorted = [...sessions.entries()].sort((a, b) => a[1].lastSeen - b[1].lastSeen)
      for (const [id] of sorted.slice(0, sessions.size - MAX_SESSIONS)) sessions.delete(id)
    }
  }

  function sessionIdFrom(req) {
    const token = parseCookies(req.headers.cookie)[COOKIE]
    return token ? sha256(token) : null
  }

  function hasValidSession(req, { touch = true } = {}) {
    const id = sessionIdFrom(req)
    if (!id) return false
    const s = sessions.get(id)
    if (!s) return false
    const now = Date.now()
    if (now - s.lastSeen > SESSION_MS) { sessions.delete(id); return false }
    if (touch) s.lastSeen = now
    return true
  }

  function isSetupMode() {
    return !readMasterPassword()
  }

  function cookieHeader(req, token, maxAgeSec) {
    const secure = req.socket.encrypted || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https'
    return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`
  }

  // true = la richiesta può usare le API (sessione valida, oppure primo avvio senza password)
  function isAllowed(req) {
    return isSetupMode() || hasValidSession(req)
  }

  async function login(req, res) {
    const ip = clientIp(req)
    const state = attempts.get(ip) || { fails: 0, lockedUntil: 0, lockMs: 15000 }
    const now = Date.now()
    if (state.lockedUntil > now) {
      const retryAfter = Math.ceil((state.lockedUntil - now) / 1000)
      sendJson(res, 429, { error: 'Troppi tentativi', retryAfter }, { 'Retry-After': String(retryAfter) })
      return
    }

    let password
    try { password = JSON.parse(await readBody(req)).password } catch { sendJson(res, 400, { error: 'Richiesta non valida' }); return }

    const stored = readMasterPassword()
    if (!stored) { sendJson(res, 409, { error: 'Password non ancora creata' }); return }

    const result = await verifyPassword(password, stored)
    if (!result.ok) {
      state.fails += 1
      if (state.fails >= MAX_FAILS_BEFORE_LOCK) {
        state.lockedUntil = Date.now() + state.lockMs
        state.lockMs = Math.min(state.lockMs * 2, 15 * 60 * 1000)
        state.fails = 0
      }
      attempts.set(ip, state)
      sendJson(res, 401, { error: 'Password errata' })
      return
    }

    attempts.delete(ip)
    if (result.legacy) {
      // Password vecchia in chiaro: la si trasforma subito in hash
      try { writeMasterPassword(await hashPassword(password)) } catch (e) { console.error('[CRM] Conversione password non riuscita:', e.message) }
    }

    // Una nuova sessione sostituisce quella eventualmente già presente in questo browser
    const oldId = sessionIdFrom(req)
    if (oldId) sessions.delete(oldId)
    pruneSessions()
    const token = crypto.randomBytes(32).toString('hex')
    sessions.set(sha256(token), { lastSeen: Date.now() })
    sendJson(res, 200, { success: true }, { 'Set-Cookie': cookieHeader(req, token, Math.floor(SESSION_MS / 1000)) })
  }

  function logout(req, res) {
    const id = sessionIdFrom(req)
    if (id) sessions.delete(id)
    sendJson(res, 200, { success: true }, { 'Set-Cookie': cookieHeader(req, '', 0) })
  }

  function status(req, res) {
    const setup = isSetupMode()
    sendJson(res, 200, { setup, authenticated: setup || hasValidSession(req, { touch: false }) })
  }

  // Gestisce le richieste /api/auth/*
  function handle(req, res) {
    const url = req.url.split('?')[0]
    if (url === '/api/auth/status' && req.method === 'GET') return status(req, res)
    if (url === '/api/auth/login' && req.method === 'POST') {
      login(req, res).catch(e => sendJson(res, e.status || 500, { error: e.message || 'Errore' }))
      return
    }
    if (url === '/api/auth/logout' && req.method === 'POST') return logout(req, res)
    sendJson(res, 404, { error: 'Non trovato' })
  }

  return { handle, isAllowed }
}
