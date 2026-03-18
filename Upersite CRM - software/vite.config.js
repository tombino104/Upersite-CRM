import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const STORAGE_FILE = path.resolve(__dirname, 'crm_data.json')

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
          const data = fs.readFileSync(STORAGE_FILE, 'utf-8');
          res.setHeader('Content-Type', 'application/json');
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
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              // Validazione minima: deve essere un JSON valido
              JSON.parse(body);
              fs.writeFileSync(STORAGE_FILE, body, 'utf-8');
              res.end(JSON.stringify({ success: true }));
            } catch (e) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'File JSON non valido' }));
            }
          });
        } else if (req.url === '/api/storage' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            fs.writeFileSync(STORAGE_FILE, body, 'utf-8');
            res.end(JSON.stringify({ success: true }));
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
  base: './'
})
