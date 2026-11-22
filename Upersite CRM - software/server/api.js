// API del CRM (dati, backup, preventivi, calcolatore, AI): un solo modulo usato sia dal dev server
// di Vite (vite.config.js) sia dal server di produzione (server/index.js, usato anche da Docker).
//
// Percorsi (tutti configurabili, di default come prima: la cartella del progetto):
//   CRM_DATA_DIR  cartella che contiene crm_data.json e la sottocartella Dati/   (default: radice del progetto)
//   AI_ENV_FILE   file con le chiavi AI                                         (default: <CRM_DATA_DIR>/.env.local)
import { createAiProxy } from './aiProxy.js'
import { createAuth } from './auth.js'
import { isEnabled as encryptionEnabled, isEncrypted, encrypt, decryptIfNeeded, protect } from './vault.js'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import process from 'process'
import { Buffer } from 'buffer'
import { fileURLToPath } from 'url'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA_ROOT = process.env.CRM_DATA_DIR ? path.resolve(process.env.CRM_DATA_DIR) : PROJECT_ROOT
const STORAGE_FILE = path.join(DATA_ROOT, 'crm_data.json')

// Le richieste che modificano i dati devono avere questo header: un sito esterno
// aperto nel browser non può aggiungerlo senza superare il controllo CORS.
const CRM_HEADER = 'x-upersite-crm'

// Scrittura atomica: scrive su un file temporaneo e poi lo rinomina,
// così un crash a metà scrittura non corrompe crm_data.json.
function writeFileAtomic(filePath, content) {
  const tmp = `${filePath}.tmp`
  fs.writeFileSync(tmp, content, 'utf-8')
  fs.renameSync(tmp, filePath)
}

// Lettura e scrittura dei file protetti (dati, copie nei backup, preventivi): cifrati su disco se è
// impostata la chiave, in chiaro altrimenti. La lettura riconosce da sola i file in chiaro o cifrati.
function readStoredBuffer(file) {
  return decryptIfNeeded(fs.readFileSync(file))
}
function readStoredText(file) {
  return readStoredBuffer(file).toString('utf-8')
}
function writeStored(file, data) {
  writeFileAtomic(file, protect(Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf-8')))
}

// Revisione del file dati: cambia a ogni scrittura (anche se il file viene modificato a mano)
function getRevision() {
  if (!fs.existsSync(STORAGE_FILE)) return '0'
  const stats = fs.statSync(STORAGE_FILE)
  return `${stats.mtimeMs}-${stats.size}`
}

function rejectForeignRequest(req, res) {
  if (req.headers[CRM_HEADER] === '1') return false
  res.statusCode = 403
  res.end(JSON.stringify({ error: 'Richiesta non autorizzata' }))
  return true
}

// Le /api rispondono solo alle pagine del CRM: nessun altro sito, nemmeno un altro server su localhost
// (stesso "site" per il browser), può leggere o modificare i dati. Le richieste senza questi header
// (es. gli script di avvio .vbs) passano.
function rejectCrossSite(req, res) {
  const site = req.headers['sec-fetch-site']
  const origin = req.headers.origin
  let foreign = site === 'cross-site' || site === 'same-site'
  if (!foreign && origin) {
    try { foreign = new URL(origin).host !== req.headers.host } catch { foreign = true }
  }
  if (!foreign) return false
  res.statusCode = 403
  res.end(JSON.stringify({ error: 'Richiesta non autorizzata' }))
  return true
}

// ── Preventivi: file veri nella sottocartella "Preventivi" della cartella dei salvataggi ──

const QUOTES_DIR = 'Preventivi'
const QUOTE_TYPES = { '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
const MAX_QUOTE_BYTES = 100 * 1024 * 1024

// File di lavoro (preventivi, calcolatore) nella cartella del CRM, accanto a crm_data.json: nella cartella
// dei backup restano solo le cartelle con data, che ne contengono una copia
const DATA_DIR = path.join(path.dirname(STORAGE_FILE), 'Dati')

function getQuotesRoot() {
  migrateLegacyFolders()
  const root = path.join(DATA_DIR, QUOTES_DIR)
  fs.mkdirSync(root, { recursive: true })
  return root
}

// Cartella dei salvataggi scelta nelle Impostazioni, letta dal file dati (non dal browser)
function getBackupRoot() {
  const data = fs.existsSync(STORAGE_FILE) ? JSON.parse(readStoredText(STORAGE_FILE)) : {}
  const backupPath = data.settings?.backupPath
  if (typeof backupPath !== 'string' || !path.isAbsolute(backupPath) || !fs.existsSync(backupPath)) {
    throw Object.assign(new Error('Imposta una cartella dei salvataggi valida nelle Impostazioni (e controlla che il disco sia collegato)'), { status: 400 })
  }
  return backupPath
}

// Nome sicuro per file e cartelle di Windows
function safeName(name, fallback) {
  // eslint-disable-next-line no-control-regex
  const clean = String(name || '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '').trim().slice(0, 100)
  return clean || fallback
}

// Risolve un percorso relativo impedendo di uscire dalla cartella `root` (es. con ..\..\)
function resolveInside(root, rel) {
  const base = path.resolve(root)
  const full = path.resolve(base, rel)
  if (full !== base && !full.startsWith(base + path.sep)) {
    throw Object.assign(new Error('Percorso non valido'), { status: 400 })
  }
  return full
}

// Nome libero nella cartella: se esiste già aggiunge la data (ed eventualmente un numero), senza sovrascrivere
function freeFileName(dir, fileName) {
  if (!fs.existsSync(path.join(dir, fileName))) return fileName
  const ext = path.extname(fileName)
  const stem = path.basename(fileName, ext)
  const date = new Date().toISOString().slice(0, 10)
  for (let i = 1; ; i++) {
    const candidate = `${stem}_${date}${i > 1 ? `_${i}` : ''}${ext}`
    if (!fs.existsSync(path.join(dir, candidate))) return candidate
  }
}

function sendError(res, e) {
  res.statusCode = e.status || 500
  res.end(JSON.stringify({ error: e.message }))
}

// ── Calcolatore: cartella delle configurazioni e dei pacchetti completi ──
// Modalità "crm" (default): <cartella dei salvataggi>\Calcolatore. Modalità "custom": un percorso scelto nelle Impostazioni.

const CALC_DIR = 'Calcolatore'
const MAX_CALC_BYTES = 100 * 1024 * 1024

function readSettings() {
  const data = fs.existsSync(STORAGE_FILE) ? JSON.parse(readStoredText(STORAGE_FILE)) : {}
  return data.settings || {}
}

// Cartelle di sistema (e radici dei dischi) che non possono fare da cartella del calcolatore:
// lì un file scritto dal CRM potrebbe essere eseguito da Windows
function isSystemFolder(dir) {
  const full = path.resolve(dir).toLowerCase().replace(/[\\/]+$/, '')
  if (full === path.parse(full).root.toLowerCase().replace(/[\\/]+$/, '')) return true
  const env = process.env
  const forbidden = [env.SystemRoot || env.windir, env.ProgramFiles, env['ProgramFiles(x86)'], env.ProgramData,
    env.APPDATA && path.join(env.APPDATA, 'Microsoft', 'Windows', 'Start Menu')]
    .filter(Boolean).map(p => path.resolve(p).toLowerCase())
  return forbidden.some(p => full === p || full.startsWith(p + path.sep))
}

function getCalcRoot() {
  const calc = readSettings().calcStorage || {}
  if (calc.mode === 'custom') {
    const custom = calc.customPath
    if (typeof custom !== 'string' || !path.isAbsolute(custom) || !fs.existsSync(custom)) {
      throw Object.assign(new Error('La cartella del calcolatore scelta nelle Impostazioni non esiste (o il disco non è collegato)'), { status: 400 })
    }
    if (isSystemFolder(custom)) {
      throw Object.assign(new Error('La cartella del calcolatore non può essere una cartella di sistema o la radice di un disco'), { status: 400 })
    }
    return custom
  }
  migrateLegacyFolders()
  const root = path.join(DATA_DIR, CALC_DIR)
  fs.mkdirSync(root, { recursive: true })
  return root
}

// Fino alla 1.21.0 Preventivi e Calcolatore stavano nella radice della cartella dei backup: si spostano in Dati.
// Ogni file viene copiato, verificato e solo dopo tolto dalla vecchia posizione; se esiste già un file diverso
// con lo stesso nome, quello vecchio resta dov'è (nessun dato perso).
let legacyMigrated = false

function moveTreeSafely(src, dest, report) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      moveTreeSafely(from, to, report)
      if (fs.readdirSync(from).length === 0) fs.rmdirSync(from)
    } else if (entry.isFile()) {
      const data = fs.readFileSync(from)
      if (fs.existsSync(to)) {
        if (Buffer.compare(fs.readFileSync(to), data) !== 0) { report.kept.push(from); continue }
      } else {
        fs.writeFileSync(to, data)
        if (Buffer.compare(fs.readFileSync(to), data) !== 0) { report.kept.push(from); continue }
      }
      fs.unlinkSync(from)
      report.moved++
    }
  }
}

function migrateLegacyFolders() {
  if (legacyMigrated) return
  let backupPath
  try { backupPath = getBackupRoot() } catch { return } // disco non collegato: si riprova alla prossima richiesta
  const report = { moved: 0, kept: [] }
  for (const name of [QUOTES_DIR, CALC_DIR]) {
    const src = path.join(backupPath, name)
    if (statKind(src) !== 'directory') continue
    moveTreeSafely(src, path.join(DATA_DIR, name), report)
    if (fs.readdirSync(src).length === 0) fs.rmdirSync(src)
  }
  legacyMigrated = true
  if (report.moved || report.kept.length) {
    console.log(`[CRM] Spostati ${report.moved} file da ${backupPath} a ${DATA_DIR}` + (report.kept.length ? ` · lasciati al loro posto (nome già usato con contenuto diverso): ${report.kept.join(', ')}` : ''))
  }
}

// Percorso relativo dal calcolatore ("Configurazioni/Mario - Pro.json"): ogni parte deve essere un nome valido
function calcPath(root, rel) {
  const parts = String(rel || '').split('/').filter(Boolean)
  for (const part of parts) {
    const invalid = /[<>:"\\|?*]/.test(part) || [...part].some(ch => ch.charCodeAt(0) < 32) || /[. ]$/.test(part)
    if (part === '.' || part === '..' || part.length > 200 || invalid) {
      throw Object.assign(new Error(`Nome non valido: ${part}`), { status: 400 })
    }
  }
  return resolveInside(root, parts.join(path.sep))
}

function statKind(file) {
  if (!fs.existsSync(file)) return 'missing'
  return fs.statSync(file).isDirectory() ? 'directory' : 'file'
}

const CALC_TYPES = {
  '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
}

function handleCalcFs(req, res) {
  const url = new URL(req.url, 'http://localhost')
  const op = url.searchParams.get('op')
  const rel = url.searchParams.get('path') || ''
  const root = getCalcRoot()
  const target = calcPath(root, rel)
  res.setHeader('Content-Type', 'application/json')

  if (req.method === 'GET' && op === 'stat') {
    res.end(JSON.stringify({ kind: statKind(target) }))
  } else if (req.method === 'GET' && op === 'list') {
    if (statKind(target) !== 'directory') throw Object.assign(new Error('Cartella non trovata'), { status: 404 })
    const entries = fs.readdirSync(target, { withFileTypes: true })
      .filter(d => d.isFile() || d.isDirectory())
      .map(d => ({ name: d.name, kind: d.isDirectory() ? 'directory' : 'file' }))
    res.end(JSON.stringify({ entries }))
  } else if (req.method === 'GET' && op === 'read') {
    if (statKind(target) !== 'file') throw Object.assign(new Error('File non trovato'), { status: 404 })
    res.setHeader('Content-Type', CALC_TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream')
    fs.createReadStream(target).pipe(res)
  } else if (req.method === 'POST' && op === 'mkdir') {
    fs.mkdirSync(target, { recursive: true })
    res.end(JSON.stringify({ success: true }))
  } else if (req.method === 'POST' && op === 'remove') {
    // Solo file singoli (le configurazioni): le cartelle non si cancellano da qui
    if (target === path.resolve(root) || statKind(target) !== 'file') throw Object.assign(new Error('Si possono eliminare solo file'), { status: 400 })
    fs.unlinkSync(target)
    res.end(JSON.stringify({ success: true }))
  } else if (req.method === 'POST' && op === 'write') {
    if (target === path.resolve(root)) throw Object.assign(new Error('Percorso non valido'), { status: 400 })
    // Il calcolatore salva solo configurazioni e documenti: nessun altro tipo di file (es. programmi)
    if (!CALC_TYPES[path.extname(target).toLowerCase()]) throw Object.assign(new Error('Tipo di file non ammesso'), { status: 400 })
    const chunks = []
    let size = 0
    req.on('data', chunk => { size += chunk.length; if (size <= MAX_CALC_BYTES) chunks.push(chunk) })
    req.on('end', () => {
      try {
        if (size > MAX_CALC_BYTES) throw Object.assign(new Error('File troppo grande (max 100MB)'), { status: 413 })
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, Buffer.concat(chunks))
        res.end(JSON.stringify({ success: true }))
      } catch (e) {
        sendError(res, e)
      }
    })
  } else {
    throw Object.assign(new Error('Operazione non valida'), { status: 400 })
  }
}

// Copia (mai sposta) le configurazioni .json di una cartella esistente in Calcolatore\Configurazioni.
// I file con lo stesso nome già presenti non vengono toccati.
function importCalcConfigs(from) {
  if (typeof from !== 'string' || !path.isAbsolute(from) || statKind(from) !== 'directory') {
    throw Object.assign(new Error('La cartella da importare non esiste (serve un percorso assoluto)'), { status: 400 })
  }
  const dest = path.join(getCalcRoot(), 'Configurazioni')
  if (path.resolve(from) === path.resolve(dest)) throw Object.assign(new Error('È già la cartella del calcolatore'), { status: 400 })
  fs.mkdirSync(dest, { recursive: true })
  let copied = 0, skipped = 0
  let settings = null
  for (const d of fs.readdirSync(from, { withFileTypes: true })) {
    if (!d.isFile() || !/\.json$/i.test(d.name)) continue
    const source = path.join(from, d.name)
    if (d.name === 'impostazioni-calcolatore.json') {
      try { settings = JSON.parse(fs.readFileSync(source, 'utf-8')) } catch { settings = null }
    }
    const target = path.join(dest, d.name)
    if (fs.existsSync(target)) { skipped++; continue }
    fs.copyFileSync(source, target)
    copied++
  }
  return { copied, skipped, settings, dest }
}

// ── Backup completo e ripristino ──
// Un backup scrive TUTTO nella sua cartella (<cartella backup>\gg-mm-aa\hh-mm-ss): file dati (con le preferenze
// del browser), cartella Dati (Preventivi, Calcolatore e ogni altra sottocartella) e, se è in una cartella
// scelta a mano, anche la cartella del calcolatore. Il ripristino legge solo da lì.

const DAY_FOLDER_RE = /^\d{2}-\d{2}-\d{2}$/
// Ogni backup ha la sua cartella con l'ora dentro quella del giorno: <backup>/gg-mm-aa/hh-mm-ss. Così più backup
// nello stesso giorno non si mescolano (ognuno ha il suo file dati con i suoi Preventivi e Calcolatore).
// Fino alla 2.0.4 il file stava direttamente nella cartella del giorno: si leggono ancora.
const TIME_FOLDER_RE = /^\d{2}-\d{2}-\d{2}(_\d+)?$/
const BACKUP_FOLDER_RE = /^\d{2}-\d{2}-\d{2}(\/\d{2}-\d{2}-\d{2}(_\d+)?)?$/
const BACKUP_FILE_RE = /^backup_ore_\d{2}-\d{2}-\d{2}(_[A-Z0-9-]+)*\.json$/

function pad2(n) { return String(n).padStart(2, '0') }

function countFiles(dir) {
  if (statKind(dir) !== 'directory') return 0
  return fs.readdirSync(dir, { withFileTypes: true })
    .reduce((n, e) => n + (e.isDirectory() ? countFiles(path.join(dir, e.name)) : e.isFile() ? 1 : 0), 0)
}

// Copia una cartella dentro un'altra senza mai cancellare nulla (i file con lo stesso nome vengono aggiornati)
function copyTree(src, dest) {
  if (statKind(src) !== 'directory') return 0
  fs.mkdirSync(dest, { recursive: true })
  fs.cpSync(src, dest, { recursive: true, force: true })
  return countFiles(src)
}

// Preferenze del browser (localStorage) mandate dal CRM: solo testo piccolo, mai i dati completi o la password
const PREF_SKIP = new Set(['upersite_crm_data', 'upersite_crm_master'])
function cleanPrefs(prefs) {
  const out = {}
  if (!prefs || typeof prefs !== 'object') return out
  for (const [k, v] of Object.entries(prefs)) {
    if (PREF_SKIP.has(k) || typeof v !== 'string' || v.length > 200000) continue
    out[k] = v
  }
  return out
}

// Percorsi spiegati in parole semplici: CRM_PATH_HINTS="/data=Apps/mia-app/data/data;/backups=Apps/mia-app/data/backups"
// (percorso dentro il container = dove lo si trova sul server). Serve solo a dire all'utente dove andare a guardare.
function pathHint(p) {
  if (!p) return null
  const full = path.resolve(p)
  let best = null
  for (const part of String(process.env.CRM_PATH_HINTS || '').split(';')) {
    const i = part.indexOf('=')
    if (i <= 0) continue
    const key = path.resolve(part.slice(0, i).trim())
    if ((full === key || full.startsWith(key + path.sep)) && (!best || key.length > best.key.length)) {
      best = { key, text: part.slice(i + 1).trim() }
    }
  }
  if (!best) return null
  const rest = path.relative(best.key, full).split(path.sep).filter(Boolean).join('/')
  return rest ? `${best.text}/${rest}` : best.text
}

function isInside(parent, child) {
  const rel = path.relative(path.resolve(parent), path.resolve(child))
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

// La cartella dei backup deve esistere davvero, essere scrivibile e stare fuori da Dati (si copierebbe dentro se stessa)
function checkBackupDir(dir) {
  if (typeof dir !== 'string' || !dir.trim()) return { ok: false, reason: 'Nessuna cartella dei backup scelta' }
  if (!path.isAbsolute(dir)) return { ok: false, reason: 'Il percorso di backup deve essere assoluto (es. /backups)' }
  if (statKind(dir) !== 'directory') return { ok: false, reason: `La cartella ${dir} non esiste sul server: scegline una con «Sfoglia…» o creala` }
  if (isInside(DATA_DIR, dir)) return { ok: false, reason: 'La cartella dei backup non può stare dentro la cartella Dati: scegline un\'altra' }
  try { fs.accessSync(dir, fs.constants.W_OK) } catch { return { ok: false, reason: `Il CRM non può scrivere in ${dir} (permessi della cartella)` } }
  return { ok: true }
}

function createBackup(backupPath, { includeFiles = true, suffix = '', prefs = null } = {}) {
  const check = checkBackupDir(backupPath)
  if (!check.ok) throw Object.assign(new Error(check.reason), { status: 400 })
  if (!fs.existsSync(STORAGE_FILE)) throw Object.assign(new Error('Nessun dato da salvare'), { status: 404 })
  migrateLegacyFolders()

  const originalData = JSON.parse(readStoredText(STORAGE_FILE))
  const backupData = { ...originalData }
  if (!includeFiles && backupData.customers) {
    backupData.customers = backupData.customers.map(c => { const copy = { ...c }; delete copy.files; return copy })
  }
  const cleanedPrefs = cleanPrefs(prefs)
  if (Object.keys(cleanedPrefs).length) backupData.browserPrefs = cleanedPrefs
  backupData.backupInfo = { createdAt: new Date().toISOString(), version: 2, includeFiles }

  const now = new Date()
  const folder = `${pad2(now.getDate())}-${pad2(now.getMonth() + 1)}-${String(now.getFullYear()).slice(-2)}`
  const time = `${pad2(now.getHours())}-${pad2(now.getMinutes())}-${pad2(now.getSeconds())}`
  // Una cartella nuova per ogni backup (se nello stesso secondo ce n'è già una si aggiunge _2, _3…)
  let timeFolder = time
  for (let i = 2; fs.existsSync(path.join(backupPath, folder, timeFolder)); i++) timeFolder = `${time}_${i}`
  const targetDir = path.join(backupPath, folder, timeFolder)
  fs.mkdirSync(targetDir, { recursive: true })
  let file = `backup_ore_${time}${includeFiles ? '' : '_LIGHT'}${suffix}.json`
  for (let i = 2; fs.existsSync(path.join(targetDir, file)); i++) file = file.replace(/(_\d+)?\.json$/, `_${i}.json`)
  writeStored(path.join(targetDir, file), JSON.stringify(backupData, null, 2))
  // Controllo finale: il file deve esistere davvero sul disco, altrimenti non si dice "salvato"
  if (statKind(path.join(targetDir, file)) !== 'file' || fs.statSync(path.join(targetDir, file)).size === 0) {
    throw Object.assign(new Error(`Il backup non risulta scritto in ${targetDir}`), { status: 500 })
  }

  let dataFiles = 0, calcCopied = false, quotesCopied = 0, quotesMissing = 0
  if (includeFiles) {
    // Tutta la cartella Dati: Preventivi, Calcolatore e qualunque altra sottocartella
    dataFiles = copyTree(DATA_DIR, targetDir)
    quotesCopied = countFiles(path.join(DATA_DIR, QUOTES_DIR))
    calcCopied = statKind(path.join(targetDir, CALC_DIR)) === 'directory'
    // Calcolatore in una cartella scelta a mano: copiato comunque dentro la cartella del giorno
    try {
      const calcRoot = getCalcRoot()
      if (path.resolve(calcRoot) !== path.resolve(path.join(DATA_DIR, CALC_DIR))) {
        dataFiles += copyTree(calcRoot, path.join(targetDir, CALC_DIR))
        calcCopied = true
      }
    } catch { /* cartella personalizzata non raggiungibile: segnalato da calcCopied */ }
    // Preventivi collegati ai clienti ma assenti dal disco (per avvisare)
    for (const c of originalData.customers || []) {
      for (const f of c.files || []) {
        if (!f.storedPath) continue
        try {
          if (statKind(resolveInside(path.join(DATA_DIR, QUOTES_DIR), f.storedPath.replace(/^Preventivi\//, ''))) !== 'file') quotesMissing++
        } catch { quotesMissing++ }
      }
    }
  }
  return { success: true, folder: `${folder}/${timeFolder}`, file, dataFiles, quotesCopied, quotesMissing, calcCopied, root: backupPath, path: targetDir, hint: pathHint(targetDir) }
}

// gg-mm-aa → aaaa-mm-gg (senza passare da Date: con il fuso orario il giorno slitterebbe)
function dayFolderIso(name) {
  const [d, m, y] = name.split('-')
  return `20${y}-${m}-${d}`
}

function backupEntries(dir, folder) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(f => f.isFile() && BACKUP_FILE_RE.test(f.name))
    .map(f => ({
      folder,
      file: f.name,
      time: f.name.slice(11, 19).replace(/-/g, ':'),
      light: f.name.includes('_LIGHT'),
      beforeRestore: f.name.includes('PRIMA-DEL-RIPRISTINO'),
      size: fs.statSync(path.join(dir, f.name)).size,
      quotes: countFiles(path.join(dir, QUOTES_DIR)),
      calc: countFiles(path.join(dir, CALC_DIR)),
    }))
}

function listBackups() {
  const backupPath = getBackupRoot()
  const days = fs.readdirSync(backupPath, { withFileTypes: true })
    .filter(e => e.isDirectory() && DAY_FOLDER_RE.test(e.name))
    .map(e => {
      const dir = path.join(backupPath, e.name)
      // Formato attuale: una sottocartella per backup. Formato vecchio: i file direttamente nella cartella del giorno.
      const backups = [
        ...backupEntries(dir, e.name),
        ...fs.readdirSync(dir, { withFileTypes: true })
          .filter(f => f.isDirectory() && TIME_FOLDER_RE.test(f.name))
          .flatMap(f => backupEntries(path.join(dir, f.name), `${e.name}/${f.name}`)),
      ].sort((a, b) => (b.time + b.folder + b.file).localeCompare(a.time + a.folder + a.file))
      return { folder: e.name, date: dayFolderIso(e.name), backups }
    })
    .filter(d => d.backups.length)
    .sort((a, b) => b.date.localeCompare(a.date))
  return { root: backupPath, days }
}

// Cartella caricata dal computer per un ripristino: viene messa da parte in .import/<id> e trattata come un backup
const STAGING_ROOT = path.join(DATA_ROOT, '.import')
const STAGE_FOLDER_RE = /^import-[a-f0-9]{16}$/
const STAGE_FILE = 'backup_ore_00-00-00_IMPORT.json'
const STAGE_MAX_FILE = 100 * 1024 * 1024
const STAGE_MAX_DATA = 400 * 1024 * 1024
const STAGE_MAX_TOTAL = 2 * 1024 * 1024 * 1024
const STAGE_BLOCKED = new Set(['.exe', '.bat', '.cmd', '.com', '.scr', '.ps1', '.vbs', '.js', '.msi', '.lnk', '.dll', '.sh'])
const stageBytes = new Map()

function stageDir(id) {
  if (!/^[a-f0-9]{16}$/.test(String(id || ''))) throw Object.assign(new Error('Caricamento non valido'), { status: 400 })
  return path.join(STAGING_ROOT, id)
}

function removeTree(dir) { fs.rmSync(dir, { recursive: true, force: true }) }

// Cartelle caricate e mai usate (finestra chiusa a metà): dopo un giorno si tolgono
function purgeOldStages() {
  if (statKind(STAGING_ROOT) !== 'directory') return
  for (const e of fs.readdirSync(STAGING_ROOT, { withFileTypes: true })) {
    const full = path.join(STAGING_ROOT, e.name)
    try { if (Date.now() - fs.statSync(full).mtimeMs > 24 * 3600 * 1000) { removeTree(full); stageBytes.delete(e.name) } } catch { /* già tolta */ }
  }
}

function stageStart() {
  purgeOldStages()
  const id = crypto.randomBytes(8).toString('hex')
  fs.mkdirSync(path.join(STAGING_ROOT, id), { recursive: true })
  stageBytes.set(id, 0)
  return { id, folder: `import-${id}`, file: STAGE_FILE }
}

// Un file della cartella: rel = percorso dentro il backup ("Preventivi/Mario/x.pdf"), oppure "@data" per il file dei dati
function stageFile(id, rel, body) {
  const dir = stageDir(id)
  if (statKind(dir) !== 'directory') throw Object.assign(new Error('Caricamento scaduto: riparti dalla scelta della cartella'), { status: 404 })
  const isData = rel === '@data'
  if (body.length > (isData ? STAGE_MAX_DATA : STAGE_MAX_FILE)) throw Object.assign(new Error('File troppo grande'), { status: 413 })
  const total = (stageBytes.get(id) || 0) + body.length
  if (total > STAGE_MAX_TOTAL) throw Object.assign(new Error('La cartella è troppo grande (max 2 GB)'), { status: 413 })
  if (isData) {
    let parsed
    try { parsed = JSON.parse(decryptIfNeeded(body).toString('utf-8')) } catch { throw Object.assign(new Error("Il file dei dati non è leggibile (JSON non valido o cifrato con un'altra chiave)"), { status: 400 }) }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.customers)) throw Object.assign(new Error('Il file non sembra un backup del CRM (mancano i clienti)'), { status: 400 })
    fs.writeFileSync(path.join(dir, STAGE_FILE), body)
    stageBytes.set(id, total)
    return { ok: true }
  }
  const target = calcPath(dir, rel)
  if (target === path.resolve(dir) || path.basename(target) === STAGE_FILE) throw Object.assign(new Error('Percorso non valido'), { status: 400 })
  if (STAGE_BLOCKED.has(path.extname(target).toLowerCase())) return { ok: true, skipped: true }
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, body)
  stageBytes.set(id, total)
  return { ok: true }
}

function backupLocation(folder, file) {
  if (STAGE_FOLDER_RE.test(String(folder || '')) && file === STAGE_FILE) {
    const dir = stageDir(folder.slice(7))
    const jsonFile = path.join(dir, STAGE_FILE)
    if (statKind(jsonFile) !== 'file') throw Object.assign(new Error('Cartella caricata non trovata: caricala di nuovo'), { status: 404 })
    return { dir, jsonFile, staged: true }
  }
  if (!BACKUP_FOLDER_RE.test(String(folder || '')) || !BACKUP_FILE_RE.test(String(file || ''))) {
    throw Object.assign(new Error('Backup non valido'), { status: 400 })
  }
  const dir = path.join(getBackupRoot(), ...folder.split('/'))
  const jsonFile = path.join(dir, file)
  if (statKind(jsonFile) !== 'file') throw Object.assign(new Error('Backup non trovato'), { status: 404 })
  return { dir, jsonFile }
}

function readJsonFile(file) {
  return JSON.parse(readStoredText(file))
}

function inspectBackup(folder, file) {
  const { dir, jsonFile } = backupLocation(folder, file)
  const data = readJsonFile(jsonFile)
  const current = fs.existsSync(STORAGE_FILE) ? readJsonFile(STORAGE_FILE) : {}
  const currentIds = new Set((current.customers || []).map(c => c.id))
  const customers = (data.customers || []).map(c => ({
    id: c.id, name: c.name || 'Senza nome', company: c.company || '', status: c.status || '',
    quoteAmount: c.quoteAmount || '', quotes: (c.files || []).filter(f => f.isQuote).length,
    hasCalc: !!c.calcConfig, existsNow: currentIds.has(c.id),
  })).sort((a, b) => a.name.localeCompare(b.name, 'it'))
  return {
    folder, file,
    createdAt: data.backupInfo?.createdAt || fs.statSync(jsonFile).mtime.toISOString(),
    light: file.includes('_LIGHT'),
    customers,
    counts: {
      customers: customers.length,
      currentCustomers: (current.customers || []).length,
      events: (data.events || []).length,
      workflows: (data.workflows || []).length,
      tags: (data.tags || []).length,
      tools: (data.settings?.toolbox || []).length,
      docs: (data.settings?.toolboxDocs || []).length,
    },
    samePassword: (data.masterPassword || null) === (current.masterPassword || null),
    hasPrefs: !!data.browserPrefs,
    quotes: countFiles(path.join(dir, QUOTES_DIR)),
    calc: countFiles(path.join(dir, CALC_DIR)),
    other: fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory() && e.name !== QUOTES_DIR && e.name !== CALC_DIR && !TIME_FOLDER_RE.test(e.name)).map(e => e.name),
  }
}

// Ripristino: prima salva sempre lo stato attuale (backup "PRIMA-DEL-RIPRISTINO" nella cartella di oggi),
// poi rimette dati e file. I file non vengono mai cancellati: quelli del backup vengono rimessi al loro posto.
function applyRestore(args) {
  const { dir, staged } = backupLocation(args.folder, args.file)
  const result = applyRestoreFrom(args)
  if (staged) {
    // I file arrivati dal computer sono in chiaro: si cifrano come tutti gli altri, poi si toglie la copia temporanea
    if (encryptionEnabled()) encryptExistingFiles()
    removeTree(dir)
    stageBytes.delete(path.basename(dir))
  }
  return result
}

function applyRestoreFrom({ folder, file, mode = 'all', parts = {}, customerIds = [], prefs = null }) {
  const { dir, jsonFile } = backupLocation(folder, file)
  const backup = readJsonFile(jsonFile)
  const backupPath = getBackupRoot()
  const safety = createBackup(backupPath, { suffix: '_PRIMA-DEL-RIPRISTINO', prefs })
  const current = readJsonFile(STORAGE_FILE)
  const result = { safety: { folder: safety.folder, file: safety.file }, restored: [] }

  if (mode === 'customers') {
    const ids = new Set((customerIds || []).map(String))
    const chosen = (backup.customers || []).filter(c => ids.has(String(c.id)))
    if (!chosen.length) throw Object.assign(new Error('Nessun cliente scelto'), { status: 400 })
    const byId = new Map(chosen.map(c => [String(c.id), c]))
    const customers = (current.customers || []).map(c => byId.has(String(c.id)) ? byId.get(String(c.id)) : c)
    const existing = new Set(customers.map(c => String(c.id)))
    chosen.forEach(c => { if (!existing.has(String(c.id))) customers.push(c) })
    writeStored(STORAGE_FILE, JSON.stringify({ ...current, customers }, null, 2))
    // Preventivi di quei clienti (le loro cartelle in Preventivi)
    const folders = new Set()
    chosen.forEach(c => (c.files || []).forEach(f => {
      if (f.storedPath) folders.add(f.storedPath.replace(/^Preventivi\//, '').split('/')[0])
    }))
    let quotes = 0
    folders.forEach(name => {
      try { quotes += copyTree(resolveInside(path.join(dir, QUOTES_DIR), name), resolveInside(getQuotesRoot(), name)) } catch { /* cartella assente nel backup */ }
    })
    result.restored.push(`${chosen.length} client${chosen.length === 1 ? 'e' : 'i'}: ${chosen.map(c => c.name).join(', ')}`)
    if (quotes) result.restored.push(`${quotes} file di preventivi`)
    return result
  }

  if (parts.data !== false) {
    const { browserPrefs, backupInfo: _info, ...data } = backup
    // La cartella dei backup e quella del calcolatore restano quelle attuali (il backup può venire da un altro PC)
    const settings = { ...(data.settings || {}) }
    settings.backupPath = current.settings?.backupPath ?? settings.backupPath
    if (current.settings?.calcStorage) settings.calcStorage = current.settings.calcStorage
    writeStored(STORAGE_FILE, JSON.stringify({ ...data, settings }, null, 2))
    result.restored.push(`dati del CRM (${(data.customers || []).length} clienti, impostazioni, eventi, automazioni)`)
    if (browserPrefs) result.prefs = browserPrefs
  }
  if (parts.preventivi !== false) {
    const n = copyTree(path.join(dir, QUOTES_DIR), getQuotesRoot())
    if (n) result.restored.push(`${n} file di preventivi`)
  }
  if (parts.calcolatore !== false) {
    const n = copyTree(path.join(dir, CALC_DIR), getCalcRoot())
    if (n) result.restored.push(`${n} file del calcolatore`)
  }
  if (parts.altro !== false) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name === QUOTES_DIR || e.name === CALC_DIR || TIME_FOLDER_RE.test(e.name)) continue
      const n = copyTree(path.join(dir, e.name), path.join(DATA_DIR, e.name))
      if (n) result.restored.push(`${n} file in ${e.name}`)
    }
  }
  return result
}

// Password master salvata nel file dati (hash). null = non ancora creata. Se il file esiste ma non si legge
// restituisce un valore che nessuna password può soddisfare: meglio bloccare l'accesso che aprirlo.
const UNREADABLE = 'pbkdf2$0$'
let masterPasswordCache = { key: null, value: null }
function readMasterPassword() {
  if (!fs.existsSync(STORAGE_FILE)) return null
  const st = fs.statSync(STORAGE_FILE)
  const key = `${st.mtimeMs}-${st.size}`
  if (masterPasswordCache.key !== key) {
    let value
    try { value = JSON.parse(readStoredText(STORAGE_FILE)).masterPassword || null } catch { value = UNREADABLE }
    masterPasswordCache = { key, value }
  }
  return masterPasswordCache.value
}

function writeMasterPassword(hashed) {
  const data = readJsonFile(STORAGE_FILE)
  writeStored(STORAGE_FILE, JSON.stringify({ ...data, masterPassword: hashed }, null, 2))
}

// File con le chiavi AI: lo legge e lo scrive solo il server. AI_ENV_FILE serve ai test per usare un file a parte.
const AI_ENV_FILE = process.env.AI_ENV_FILE ? path.resolve(process.env.AI_ENV_FILE) : path.join(DATA_ROOT, '.env.local')

export { DATA_ROOT, STORAGE_FILE }

// Cifra i file ancora in chiaro (crm_data.json e preventivi). Ogni file viene riscritto in modo atomico
// e prima di sostituire l'originale si controlla che il risultato, decifrato, sia identico.
function encryptExistingFiles() {
  const files = []
  if (fs.existsSync(STORAGE_FILE)) files.push(STORAGE_FILE)
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.isFile() && !e.name.endsWith('.tmp') && QUOTE_TYPES[path.extname(e.name).toLowerCase()]) files.push(p)
    }
  }
  walk(path.join(DATA_DIR, QUOTES_DIR))
  let done = 0
  for (const file of files) {
    const plain = fs.readFileSync(file)
    if (isEncrypted(plain)) continue
    const sealed = encrypt(plain)
    if (Buffer.compare(decryptIfNeeded(sealed), plain) !== 0) throw new Error(`Verifica della cifratura non riuscita per ${file}`)
    writeFileAtomic(file, sealed)
    done++
  }
  if (done) console.log(`[CRM] Cifrati ${done} file che erano in chiaro`)
}

// Prepara le cartelle all'avvio (sposta le vecchie cartelle dei backup in Dati/)
// ── Cartelle: backup predefinito e cartelle che si possono sfogliare dalle Impostazioni ──
//   CRM_BACKUP_DIR    cartella dei backup usata finché non se ne sceglie un'altra (Docker: /backups)
//   CRM_BROWSE_ROOTS  cartelle che "Sfoglia…" può mostrare, separate da ":" (";" su Windows)
//                     (Docker: /backups e /cartelle, dove montare le cartelle di Umbrel). Default: la cartella utente.
const DEFAULT_BACKUP_DIR = process.env.CRM_BACKUP_DIR ? path.resolve(process.env.CRM_BACKUP_DIR) : null

function browseRoots() {
  const list = process.env.CRM_BROWSE_ROOTS
    ? process.env.CRM_BROWSE_ROOTS.split(path.delimiter)
    : [DEFAULT_BACKUP_DIR, os.homedir()]
  const seen = new Set()
  return list.filter(Boolean).map(p => path.resolve(p))
    .filter(p => !seen.has(p) && seen.add(p) && statKind(p) === 'directory')
}

function defaultBackupDir() {
  return DEFAULT_BACKUP_DIR && statKind(DEFAULT_BACKUP_DIR) === 'directory' ? DEFAULT_BACKUP_DIR : null
}

// Cartella dentro una delle cartelle consentite, altrimenti errore
function insideBrowseRoot(target) {
  const full = path.resolve(String(target || ''))
  const root = browseRoots().find(r => full === r || full.startsWith(r + path.sep))
  if (!root) throw Object.assign(new Error('Cartella non consentita'), { status: 403 })
  return { full, root }
}

function listDirs(target) {
  const roots = browseRoots()
  if (!target) return { path: null, parent: null, dirs: [], roots }
  const { full, root } = insideBrowseRoot(target)
  if (statKind(full) !== 'directory') throw Object.assign(new Error('La cartella non esiste'), { status: 404 })
  const dirs = fs.readdirSync(full, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('.'))
    .map(e => e.name)
    .sort((a, b) => a.localeCompare(b, 'it'))
  return { path: full, parent: full === root ? null : path.dirname(full), dirs, roots }
}

function makeDir(parent, name) {
  const { full } = insideBrowseRoot(parent)
  const clean = safeName(name, '')
  if (!clean) throw Object.assign(new Error('Nome della cartella non valido'), { status: 400 })
  const target = path.join(full, clean)
  fs.mkdirSync(target, { recursive: true })
  return { path: target }
}

// Dove sono davvero i file del CRM (percorsi letti dal server, non scritti a mano) e se la cartella dei backup funziona
function describePlaces() {
  let configured = null
  try { configured = readSettings().backupPath || null } catch { /* file dati non leggibile */ }
  const backupDir = configured || defaultBackupDir()
  const check = backupDir ? checkBackupDir(backupDir) : { ok: false, reason: 'Nessuna cartella dei backup scelta' }
  let calcDir = null
  try { calcDir = getCalcRoot() } catch { /* cartella personalizzata non raggiungibile */ }
  const place = (p) => p ? { path: p, hint: pathHint(p) } : null
  return {
    dataFile: place(STORAGE_FILE),
    filesDir: place(DATA_DIR),
    quotesDir: place(path.join(DATA_DIR, QUOTES_DIR)),
    calcDir: place(calcDir),
    backup: backupDir ? { ...place(backupDir), ok: check.ok, problem: check.ok ? null : check.reason } : { ok: false, problem: check.reason },
  }
}

export function initApi() {
  // Se i dati sono cifrati ma la chiave manca o è sbagliata ci si ferma subito, con un messaggio chiaro
  if (fs.existsSync(STORAGE_FILE)) readStoredBuffer(STORAGE_FILE)
  if (encryptionEnabled()) encryptExistingFiles()
  else console.warn('[CRM] ATTENZIONE: CRM_ENCRYPTION_KEY non impostata, i dati restano in chiaro sul disco')
  try { migrateLegacyFolders() } catch (e) { console.error('[CRM] Spostamento cartelle non riuscito:', e.message) }
}

// Middleware (req, res, next) per tutte le richieste /api/*; le altre passano a next()
export function createApiMiddleware() {
  // Funzioni AI: il server inoltra le richieste ai servizi (LM Studio, Ollama, Gemini...) con le chiavi di .env.local
  const aiProxy = createAiProxy({ envFile: AI_ENV_FILE, rejectForeignRequest })
  const auth = createAuth({ readMasterPassword, writeMasterPassword })

  return (req, res, next) => {
        if (req.url.startsWith('/api/')) {
          if (rejectCrossSite(req, res)) return;
          // Login, logout e stato della sessione
          if (req.url.startsWith('/api/auth/')) {
            if (req.method === 'POST' && rejectForeignRequest(req, res)) return;
            auth.handle(req, res);
            return;
          }
          // Tutto il resto delle API richiede la sessione (o il primo avvio, senza password master)
          if (!auth.isAllowed(req)) {
            res.statusCode = 401;
            // Distingue la sessione scaduta da altri 401 (es. chiave di un servizio AI non valida)
            res.setHeader('X-CRM-Auth', 'required');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Accesso richiesto' }));
            return;
          }
        }
        if (req.url.startsWith('/api/ai/')) {
          aiProxy.handle(req, res);
        } else if (req.url === '/api/storage' && req.method === 'GET') {
          if (!fs.existsSync(STORAGE_FILE)) {
            res.end(JSON.stringify({}));
            return;
          }
          const revision = getRevision();
          let data = readStoredText(STORAGE_FILE);
          // Se non è stata scelta una cartella dei backup si propone quella predefinita (Docker: /backups);
          // l'app la salva al primo salvataggio, quindi i backup funzionano senza impostare nulla
          const fallback = defaultBackupDir();
          if (fallback) {
            try {
              const parsed = JSON.parse(data);
              if (parsed && typeof parsed === 'object' && !parsed.settings?.backupPath) {
                data = JSON.stringify({ ...parsed, settings: { ...(parsed.settings || {}), backupPath: fallback } }, null, 2);
              }
            } catch { /* file non leggibile come JSON: si manda com'è */ }
          }
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('X-CRM-Revision', revision);
          res.end(data);
        } else if (req.url === '/api/storage-info' && req.method === 'GET') {
          if (!fs.existsSync(STORAGE_FILE)) {
            res.end(JSON.stringify({ size: 0, places: describePlaces() }));
            return;
          }
          const stats = fs.statSync(STORAGE_FILE);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ 
            size: stats.size,
            lastModified: stats.mtime,
            places: describePlaces()
          }));
        } else if (req.url === '/api/backup/export' && req.method === 'GET') {
          if (!fs.existsSync(STORAGE_FILE)) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'Nessun dato trovato' }));
            return;
          }
          const fileName = `upersite-crm-backup-${new Date().toISOString().split('T')[0]}.json`;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
          // Il file scaricato è sempre in chiaro, così si può reimportare anche altrove
          res.end(readStoredBuffer(STORAGE_FILE));
        } else if (req.url === '/api/backup/import' && req.method === 'POST') {
          if (rejectForeignRequest(req, res)) return;
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              // Validazione minima: deve essere un oggetto JSON valido
              const parsed = JSON.parse(body);
              if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
              // Come nel ripristino: la cartella dei backup e quella del calcolatore restano quelle attuali
              // (un file importato non può spostarle altrove)
              const current = fs.existsSync(STORAGE_FILE) ? readJsonFile(STORAGE_FILE) : {};
              const settings = { ...(parsed.settings || {}) };
              settings.backupPath = current.settings?.backupPath ?? settings.backupPath;
              if (current.settings?.calcStorage) settings.calcStorage = current.settings.calcStorage;
              const changed = JSON.stringify(settings.backupPath) !== JSON.stringify(parsed.settings?.backupPath)
                || JSON.stringify(settings.calcStorage) !== JSON.stringify(parsed.settings?.calcStorage);
              // Sempre con a capo e indentazione, così il file (e l'export) si legge
              writeStored(STORAGE_FILE, JSON.stringify(changed ? { ...parsed, settings } : parsed, null, 2));
              res.end(JSON.stringify({ success: true }));
            } catch {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'File JSON non valido' }));
            }
          });
        } else if (req.url === '/api/backup/auto' && req.method === 'POST') {
          if (rejectForeignRequest(req, res)) return;
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const { backupPath, includeFiles = true, prefs = null } = JSON.parse(body);
              if (!backupPath) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Percorso non specificato' }));
                return;
              }
              // Si salva solo nella cartella scelta nelle Impostazioni (letta dal file dati), mai altrove
              const configured = readSettings().backupPath;
              if (typeof configured !== 'string' || typeof backupPath !== 'string' || path.resolve(configured) !== path.resolve(backupPath)) {
                throw Object.assign(new Error('Il percorso non è la cartella dei salvataggi scelta nelle Impostazioni'), { status: 400 });
              }
              res.end(JSON.stringify(createBackup(backupPath, { includeFiles, prefs })));
            } catch (e) {
              sendError(res, e);
            }
          });
        } else if (req.url === '/api/quotes' && req.method === 'POST') {
          // Carica un preventivo: corpo = file binario, nomi negli header
          if (rejectForeignRequest(req, res)) return;
          const chunks = [];
          let size = 0;
          req.on('data', chunk => { size += chunk.length; if (size <= MAX_QUOTE_BYTES) chunks.push(chunk); });
          req.on('end', () => {
            try {
              if (size > MAX_QUOTE_BYTES) throw Object.assign(new Error('File troppo grande (max 100MB)'), { status: 413 });
              const fileName = safeName(decodeURIComponent(req.headers['x-file-name'] || ''), 'Preventivo.pdf');
              const ext = path.extname(fileName).toLowerCase();
              if (!QUOTE_TYPES[ext]) throw Object.assign(new Error('Sono ammessi solo file PDF o DOCX'), { status: 400 });
              const customerFolder = safeName(decodeURIComponent(req.headers['x-customer-name'] || ''), 'Senza nome');
              const dir = resolveInside(getQuotesRoot(), customerFolder);
              fs.mkdirSync(dir, { recursive: true });
              const finalName = freeFileName(dir, fileName);
              writeStored(path.join(dir, finalName), Buffer.concat(chunks));
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ storedPath: `${QUOTES_DIR}/${customerFolder}/${finalName}` }));
            } catch (e) {
              sendError(res, e);
            }
          });
        } else if (req.url === '/api/quotes/delete' && req.method === 'POST') {
          // Elimina definitivamente un preventivo (solo su richiesta esplicita dell'utente).
          // Le copie nei backup con data non vengono toccate.
          if (rejectForeignRequest(req, res)) return;
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const { path: rel } = JSON.parse(body || '{}');
              const relative = String(rel || '').replace(/^Preventivi\//, '');
              const quotesRoot = getQuotesRoot();
              const file = resolveInside(quotesRoot, relative);
              if (file === path.resolve(quotesRoot)) throw Object.assign(new Error('Percorso non valido'), { status: 400 });
              if (fs.existsSync(file) && fs.statSync(file).isFile()) fs.unlinkSync(file);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true }));
            } catch (e) {
              sendError(res, e);
            }
          });
        } else if (req.url.startsWith('/api/quotes?') && req.method === 'GET') {
          // Legge un preventivo, solo dall'interno della cartella Preventivi
          try {
            const rel = new URL(req.url, 'http://localhost').searchParams.get('path') || '';
            const relative = rel.replace(/^Preventivi\//, '');
            const file = resolveInside(getQuotesRoot(), relative);
            if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
              throw Object.assign(new Error('Preventivo non trovato nella cartella dei salvataggi'), { status: 404 });
            }
            res.setHeader('Content-Type', QUOTE_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
            res.end(readStoredBuffer(file));
          } catch (e) {
            sendError(res, e);
          }
        } else if ((req.url === '/api/restore/list' || req.url.startsWith('/api/restore/inspect?')) && req.method === 'GET') {
          // Elenco e anteprima dei backup (solo lettura)
          if (rejectForeignRequest(req, res)) return;
          res.setHeader('Content-Type', 'application/json');
          try {
            if (req.url === '/api/restore/list') {
              res.end(JSON.stringify(listBackups()));
            } else {
              const q = new URL(req.url, 'http://localhost').searchParams;
              res.end(JSON.stringify(inspectBackup(q.get('folder'), q.get('file'))));
            }
          } catch (e) {
            sendError(res, e);
          }
        } else if (req.url.startsWith('/api/restore/stage') && req.method === 'POST') {
          // Cartella del computer caricata per il ripristino: start → un file alla volta → (ripristino) oppure discard
          if (rejectForeignRequest(req, res)) return;
          const q = new URL(req.url, 'http://localhost');
          const chunks = [];
          let size = 0;
          const limit = (q.searchParams.get('path') === '@data' ? STAGE_MAX_DATA : STAGE_MAX_FILE) + 1;
          req.on('data', chunk => { size += chunk.length; if (size <= limit) chunks.push(chunk); });
          req.on('end', () => {
            res.setHeader('Content-Type', 'application/json');
            try {
              if (q.pathname === '/api/restore/stage/start') {
                res.end(JSON.stringify(stageStart()));
              } else if (q.pathname === '/api/restore/stage/file') {
                if (size >= limit) throw Object.assign(new Error('File troppo grande'), { status: 413 });
                res.end(JSON.stringify(stageFile(q.searchParams.get('id'), q.searchParams.get('path') || '', Buffer.concat(chunks))));
              } else if (q.pathname === '/api/restore/stage/discard') {
                const id = q.searchParams.get('id');
                removeTree(stageDir(id));
                stageBytes.delete(id);
                res.end(JSON.stringify({ success: true }));
              } else {
                throw Object.assign(new Error('Richiesta non valida'), { status: 404 });
              }
            } catch (e) {
              sendError(res, e);
            }
          });
        } else if (req.url === '/api/restore/apply' && req.method === 'POST') {
          // Ripristino da un backup (dopo aver salvato lo stato attuale)
          if (rejectForeignRequest(req, res)) return;
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            res.setHeader('Content-Type', 'application/json');
            try {
              res.end(JSON.stringify(applyRestore(JSON.parse(body || '{}'))));
            } catch (e) {
              sendError(res, e);
            }
          });
        } else if (req.url.startsWith('/api/calc/fs?')) {
          // File del calcolatore integrato (usato dalla pagina public/calcolatore)
          if (rejectForeignRequest(req, res)) return;
          try {
            handleCalcFs(req, res);
          } catch (e) {
            sendError(res, e);
          }
        } else if (req.url === '/api/calc/info' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          try {
            res.end(JSON.stringify({ root: getCalcRoot() }));
          } catch (e) {
            sendError(res, e);
          }
        } else if ((req.url === '/api/calc/import' || req.url === '/api/calc/verify') && req.method === 'POST') {
          if (rejectForeignRequest(req, res)) return;
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            res.setHeader('Content-Type', 'application/json');
            try {
              const parsed = JSON.parse(body || '{}');
              if (req.url === '/api/calc/import') {
                res.end(JSON.stringify(importCalcConfigs(parsed.from)));
                return;
              }
              // Verifica di una cartella scelta a mano: deve esistere ed essere scrivibile
              const dir = parsed.path;
              if (typeof dir !== 'string' || !path.isAbsolute(dir) || statKind(dir) !== 'directory') {
                throw Object.assign(new Error('La cartella non esiste (serve un percorso assoluto, es. D:\\Lavoro\\Calcolatore)'), { status: 400 });
              }
              if (isSystemFolder(dir)) {
                throw Object.assign(new Error('Scegli una cartella tua: non una cartella di sistema o la radice di un disco'), { status: 400 });
              }
              fs.accessSync(dir, fs.constants.W_OK);
              res.end(JSON.stringify({ success: true }));
            } catch (e) {
              sendError(res, e);
            }
          });
        } else if (req.url.startsWith('/api/fs/dirs') && req.method === 'GET') {
          // Elenco delle sottocartelle (solo dentro le cartelle consentite)
          res.setHeader('Content-Type', 'application/json');
          try {
            const q = new URL(req.url, 'http://localhost').searchParams;
            const listing = listDirs(q.get('path'));
            const hints = {};
            for (const r of listing.roots) { const h = pathHint(r); if (h) hints[r] = h; }
            res.end(JSON.stringify({ ...listing, hints, defaultBackup: defaultBackupDir() }));
          } catch (e) {
            sendError(res, e);
          }
        } else if (req.url === '/api/fs/mkdir' && req.method === 'POST') {
          if (rejectForeignRequest(req, res)) return;
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            res.setHeader('Content-Type', 'application/json');
            try {
              const { path: parent, name } = JSON.parse(body || '{}');
              res.end(JSON.stringify(makeDir(parent, name)));
            } catch (e) {
              sendError(res, e);
            }
          });
        } else if (req.url === '/api/storage' && req.method === 'POST') {
          if (rejectForeignRequest(req, res)) return;
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.customers)) {
                throw new Error('Formato dati non valido');
              }
              // Rifiuta i salvataggi basati su dati vecchi (un'altra finestra ha salvato nel frattempo)
              const baseRevision = req.headers['x-crm-base-revision'];
              if (baseRevision && baseRevision !== getRevision()) {
                res.statusCode = 409;
                res.end(JSON.stringify({ error: "Il file dati è stato modificato da un'altra finestra" }));
                return;
              }
              // Il browser manda il JSON compatto: si salva con a capo e indentazione, così il file (e l'export) si legge
              writeStored(STORAGE_FILE, JSON.stringify(parsed, null, 2));
              res.end(JSON.stringify({ success: true, revision: getRevision() }));
            } catch (e) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: e.message }));
            }
          });
        } else {
          next();
        }
  }
}
