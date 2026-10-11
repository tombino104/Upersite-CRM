import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

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

              res.end(JSON.stringify({ success: true, folder: dateFolder }));
            } catch (e) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e.message }));
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
  server: { port: 5173, strictPort: true }
})
