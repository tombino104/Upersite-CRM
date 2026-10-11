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

function storagePlugin() {
  return {
    name: 'crm-storage-plugin',
    configureServer(server) {
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
              const { backupPath, includeFiles = true } = JSON.parse(body);
              if (!backupPath) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Percorso non specificato' }));
                return;
              }
              if (typeof backupPath !== 'string' || !path.isAbsolute(backupPath)) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Il percorso di backup deve essere assoluto' }));
                return;
              }

              if (!fs.existsSync(STORAGE_FILE)) {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: 'Nessun dato da salvare' }));
                return;
              }

              // Leggi i dati originali
              const originalData = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf-8'));
              
              // Crea una copia per il backup
              let backupData = { ...originalData };
              
              // Se backup parziale, rimuovi completamente i file
              if (!includeFiles && backupData.customers) {
                backupData.customers = backupData.customers.map(customer => {
                  const customerCopy = { ...customer };
                  delete customerCopy.files; // Rimuovi completamente l'array files
                  return customerCopy;
                });
              }

              const now = new Date();
              const day = String(now.getDate()).padStart(2, '0');
              const month = String(now.getMonth() + 1).padStart(2, '0');
              const year = String(now.getFullYear()).slice(-2);
              const dateFolder = `${day}-${month}-${year}`;
              
              const targetDir = path.join(backupPath, dateFolder);
              if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
              }

              const hours = String(now.getHours()).padStart(2, '0');
              const minutes = String(now.getMinutes()).padStart(2, '0');
              const seconds = String(now.getSeconds()).padStart(2, '0');
              const timeSuffix = `${hours}-${minutes}-${seconds}`;

              // Naming intelligente
              const fileName = includeFiles 
                ? `backup_ore_${timeSuffix}.json`
                : `backup_ore_${timeSuffix}_LIGHT.json`;
              
              const targetFile = path.join(targetDir, fileName);
              fs.writeFileSync(targetFile, JSON.stringify(backupData, null, 2));

              // Copia nel backup anche i preventivi salvati come file (Preventivi/<cliente>/<file>)
              let quotesCopied = 0, quotesMissing = 0;
              if (includeFiles) {
                const quotesRoot = path.join(originalData.settings?.backupPath || backupPath, QUOTES_DIR);
                for (const customer of originalData.customers || []) {
                  for (const file of customer.files || []) {
                    if (!file.storedPath) continue;
                    try {
                      const relative = file.storedPath.replace(/^Preventivi\//, '');
                      const source = resolveInside(quotesRoot, relative);
                      const target = resolveInside(path.join(targetDir, QUOTES_DIR), relative);
                      if (!fs.existsSync(source)) { quotesMissing++; continue; }
                      fs.mkdirSync(path.dirname(target), { recursive: true });
                      fs.copyFileSync(source, target);
                      quotesCopied++;
                    } catch {
                      quotesMissing++;
                    }
                  }
                }
              }

              res.end(JSON.stringify({ success: true, folder: dateFolder, quotesCopied, quotesMissing }));
            } catch (e) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e.message }));
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
              const dir = resolveInside(path.join(getBackupRoot(), QUOTES_DIR), customerFolder);
              fs.mkdirSync(dir, { recursive: true });
              const finalName = freeFileName(dir, fileName);
              fs.writeFileSync(path.join(dir, finalName), Buffer.concat(chunks));
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ storedPath: `${QUOTES_DIR}/${customerFolder}/${finalName}` }));
            } catch (e) {
              sendError(res, e);
            }
          });
        } else if (req.url.startsWith('/api/quotes?') && req.method === 'GET') {
          // Legge un preventivo, solo dall'interno della cartella Preventivi
          try {
            const rel = new URL(req.url, 'http://localhost').searchParams.get('path') || '';
            const relative = rel.replace(/^Preventivi\//, '');
            const file = resolveInside(path.join(getBackupRoot(), QUOTES_DIR), relative);
            if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
              throw Object.assign(new Error('Preventivo non trovato nella cartella dei salvataggi'), { status: 404 });
            }
            res.setHeader('Content-Type', QUOTE_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
            fs.createReadStream(file).pipe(res);
          } catch (e) {
            sendError(res, e);
          }
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
  server: { port: 5173, strictPort: true }
})
