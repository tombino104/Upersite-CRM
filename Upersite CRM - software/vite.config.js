import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { Buffer } from 'buffer'

const STORAGE_FILE = path.resolve(__dirname, 'crm_data.json')

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
  const data = fs.existsSync(STORAGE_FILE) ? JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf-8')) : {}
  const backupPath = data.settings?.backupPath
  if (typeof backupPath !== 'string' || !path.isAbsolute(backupPath) || !fs.existsSync(backupPath)) {
    throw Object.assign(new Error('Imposta una cartella dei salvataggi valida nelle Impostazioni (e controlla che il disco sia collegato)'), { status: 400 })
  }
  return backupPath
}

// Nome sicuro per file e cartelle di Windows
function safeName(name, fallback) {
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
  const data = fs.existsSync(STORAGE_FILE) ? JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf-8')) : {}
  return data.settings || {}
}

function getCalcRoot() {
  const calc = readSettings().calcStorage || {}
  if (calc.mode === 'custom') {
    const custom = calc.customPath
    if (typeof custom !== 'string' || !path.isAbsolute(custom) || !fs.existsSync(custom)) {
      throw Object.assign(new Error('La cartella del calcolatore scelta nelle Impostazioni non esiste (o il disco non è collegato)'), { status: 400 })
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
// Un backup scrive TUTTO nella cartella del giorno (<cartella backup>\gg-mm-aa): file dati (con le preferenze
// del browser), cartella Dati (Preventivi, Calcolatore e ogni altra sottocartella) e, se è in una cartella
// scelta a mano, anche la cartella del calcolatore. Il ripristino legge solo da lì.

const DAY_FOLDER_RE = /^\d{2}-\d{2}-\d{2}$/
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

function createBackup(backupPath, { includeFiles = true, suffix = '', prefs = null } = {}) {
  if (typeof backupPath !== 'string' || !path.isAbsolute(backupPath)) {
    throw Object.assign(new Error('Il percorso di backup deve essere assoluto'), { status: 400 })
  }
  if (!fs.existsSync(STORAGE_FILE)) throw Object.assign(new Error('Nessun dato da salvare'), { status: 404 })
  migrateLegacyFolders()

  const originalData = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf-8'))
  const backupData = { ...originalData }
  if (!includeFiles && backupData.customers) {
    backupData.customers = backupData.customers.map(c => { const copy = { ...c }; delete copy.files; return copy })
  }
  const cleanedPrefs = cleanPrefs(prefs)
  if (Object.keys(cleanedPrefs).length) backupData.browserPrefs = cleanedPrefs
  backupData.backupInfo = { createdAt: new Date().toISOString(), version: 2, includeFiles }

  const now = new Date()
  const folder = `${pad2(now.getDate())}-${pad2(now.getMonth() + 1)}-${String(now.getFullYear()).slice(-2)}`
  const targetDir = path.join(backupPath, folder)
  fs.mkdirSync(targetDir, { recursive: true })
  const time = `${pad2(now.getHours())}-${pad2(now.getMinutes())}-${pad2(now.getSeconds())}`
  let file = `backup_ore_${time}${includeFiles ? '' : '_LIGHT'}${suffix}.json`
  for (let i = 2; fs.existsSync(path.join(targetDir, file)); i++) file = file.replace(/(_\d+)?\.json$/, `_${i}.json`)
  fs.writeFileSync(path.join(targetDir, file), JSON.stringify(backupData, null, 2))

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
  return { success: true, folder, file, dataFiles, quotesCopied, quotesMissing, calcCopied }
}

// gg-mm-aa → aaaa-mm-gg (senza passare da Date: con il fuso orario il giorno slitterebbe)
function dayFolderIso(name) {
  const [d, m, y] = name.split('-')
  return `20${y}-${m}-${d}`
}

function listBackups() {
  const backupPath = getBackupRoot()
  const days = fs.readdirSync(backupPath, { withFileTypes: true })
    .filter(e => e.isDirectory() && DAY_FOLDER_RE.test(e.name))
    .map(e => {
      const dir = path.join(backupPath, e.name)
      const backups = fs.readdirSync(dir, { withFileTypes: true })
        .filter(f => f.isFile() && BACKUP_FILE_RE.test(f.name))
        .map(f => ({
          file: f.name,
          time: f.name.slice(11, 19).replace(/-/g, ':'),
          light: f.name.includes('_LIGHT'),
          beforeRestore: f.name.includes('PRIMA-DEL-RIPRISTINO'),
          size: fs.statSync(path.join(dir, f.name)).size,
        }))
        .sort((a, b) => b.file.localeCompare(a.file))
      return {
        folder: e.name,
        date: dayFolderIso(e.name),
        backups,
        quotes: countFiles(path.join(dir, QUOTES_DIR)),
        calc: countFiles(path.join(dir, CALC_DIR)),
      }
    })
    .filter(d => d.backups.length)
    .sort((a, b) => b.date.localeCompare(a.date))
  return { root: backupPath, days }
}

function backupLocation(folder, file) {
  if (!DAY_FOLDER_RE.test(String(folder || '')) || !BACKUP_FILE_RE.test(String(file || ''))) {
    throw Object.assign(new Error('Backup non valido'), { status: 400 })
  }
  const dir = path.join(getBackupRoot(), folder)
  const jsonFile = path.join(dir, file)
  if (statKind(jsonFile) !== 'file') throw Object.assign(new Error('Backup non trovato'), { status: 404 })
  return { dir, jsonFile }
}

function readJsonFile(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'))
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
    },
    samePassword: (data.masterPassword || null) === (current.masterPassword || null),
    hasPrefs: !!data.browserPrefs,
    quotes: countFiles(path.join(dir, QUOTES_DIR)),
    calc: countFiles(path.join(dir, CALC_DIR)),
    other: fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory() && e.name !== QUOTES_DIR && e.name !== CALC_DIR).map(e => e.name),
  }
}

// Ripristino: prima salva sempre lo stato attuale (backup "PRIMA-DEL-RIPRISTINO" nella cartella di oggi),
// poi rimette dati e file. I file non vengono mai cancellati: quelli del backup vengono rimessi al loro posto.
function applyRestore({ folder, file, mode = 'all', parts = {}, customerIds = [], prefs = null }) {
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
    writeFileAtomic(STORAGE_FILE, JSON.stringify({ ...current, customers }, null, 2))
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
    writeFileAtomic(STORAGE_FILE, JSON.stringify({ ...data, settings }, null, 2))
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
      if (!e.isDirectory() || e.name === QUOTES_DIR || e.name === CALC_DIR) continue
      const n = copyTree(path.join(dir, e.name), path.join(DATA_DIR, e.name))
      if (n) result.restored.push(`${n} file in ${e.name}`)
    }
  }
  return result
}

function storagePlugin() {
  return {
    name: 'crm-storage-plugin',
    configureServer(server) {
      try { migrateLegacyFolders() } catch (e) { console.error('[CRM] Spostamento cartelle non riuscito:', e.message) }
      server.middlewares.use((req, res, next) => {
        if (req.url === '/api/storage' && req.method === 'GET') {
          if (!fs.existsSync(STORAGE_FILE)) {
            res.end(JSON.stringify({}));
            return;
          }
          const revision = getRevision();
          const data = fs.readFileSync(STORAGE_FILE, 'utf-8');
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('X-CRM-Revision', revision);
          res.end(data);
        } else if (req.url === '/api/storage-info' && req.method === 'GET') {
          if (!fs.existsSync(STORAGE_FILE)) {
            res.end(JSON.stringify({ size: 0 }));
            return;
          }
          const stats = fs.statSync(STORAGE_FILE);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ 
            size: stats.size,
            lastModified: stats.mtime
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
          const fileStream = fs.createReadStream(STORAGE_FILE);
          fileStream.pipe(res);
        } else if (req.url === '/api/backup/import' && req.method === 'POST') {
          if (rejectForeignRequest(req, res)) return;
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              // Validazione minima: deve essere un oggetto JSON valido
              const parsed = JSON.parse(body);
              if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
              writeFileAtomic(STORAGE_FILE, body);
              res.end(JSON.stringify({ success: true }));
            } catch (e) {
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
              fs.writeFileSync(path.join(dir, finalName), Buffer.concat(chunks));
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
            fs.createReadStream(file).pipe(res);
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
              fs.accessSync(dir, fs.constants.W_OK);
              res.end(JSON.stringify({ success: true }));
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
              writeFileAtomic(STORAGE_FILE, body);
              res.end(JSON.stringify({ success: true, revision: getRevision() }));
            } catch (e) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: e.message }));
            }
          });
        } else {
          next();
        }
      });
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), storagePlugin()],
  base: './',
  // Porta fissa: i collegamenti di avvio ed Electron aprono sempre http://localhost:5173
  // Dati/ (preventivi, calcolatore) cambia mentre lavori: non deve far ricaricare la pagina
  server: { port: 5173, strictPort: true, watch: { ignored: ['**/Dati/**'] } }
})
