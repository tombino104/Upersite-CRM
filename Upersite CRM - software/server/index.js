// Server di produzione del CRM: serve l'app compilata (dist/) e le API (/api/*) sulla stessa porta.
// Nessuna dipendenza esterna, solo Node.
//
// Variabili d'ambiente:
//   PORT          porta in ascolto                       (default 3000)
//   HOST          indirizzo in ascolto                   (default 0.0.0.0)
//   CRM_DATA_DIR  cartella dei dati (crm_data.json, Dati/) (default: radice del progetto)
//   AI_ENV_FILE   file con le chiavi AI                  (default: <CRM_DATA_DIR>/.env.local)
import http from 'http'
import fs from 'fs'
import path from 'path'
import process from 'process'
import { fileURLToPath } from 'url'
import { createApiMiddleware, initApi, DATA_ROOT } from './api.js'

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const PORT = Number(process.env.PORT) || 3000
const HOST = process.env.HOST || '0.0.0.0'

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8', '.map': 'application/json', '.webmanifest': 'application/manifest+json',
  '.pdf': 'application/pdf', '.wasm': 'application/wasm'
}

function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405
    res.end()
    return
  }
  let pathname
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname) } catch { res.statusCode = 400; res.end(); return }
  let file = path.join(DIST, pathname)
  // Mai fuori da dist/
  if (file !== DIST && !file.startsWith(DIST + path.sep)) { res.statusCode = 403; res.end(); return }
  try {
    if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html')
    const stat = fs.statSync(file)
    if (!stat.isFile()) throw new Error('not a file')
    res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream')
    res.setHeader('Content-Length', stat.size)
    // I file in assets/ hanno il nome con hash: si possono tenere in cache a lungo
    res.setHeader('Cache-Control', pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache')
    if (req.method === 'HEAD') { res.end(); return }
    fs.createReadStream(file).pipe(res)
  } catch {
    res.statusCode = 404
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('Non trovato')
  }
}

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error(`[CRM] App non compilata: manca ${path.join(DIST, 'index.html')}. Esegui prima "npm run build".`)
  process.exit(1)
}

try {
  initApi()
} catch (e) {
  console.error(`[CRM] Impossibile avviare: ${e.message}`)
  process.exit(1)
}
const api = createApiMiddleware()

const server = http.createServer((req, res) => {
  // Le API rispondono sempre in JSON, come nel dev server
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'same-origin')
  if (req.url === '/healthz') {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: true }))
    return
  }
  api(req, res, () => serveStatic(req, res))
})

server.listen(PORT, HOST, () => {
  console.log(`[CRM] Upersite CRM in ascolto su http://${HOST}:${PORT} · dati in ${DATA_ROOT}`)
})

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`[CRM] ${sig}: arresto del server`)
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 3000).unref()
  })
}
