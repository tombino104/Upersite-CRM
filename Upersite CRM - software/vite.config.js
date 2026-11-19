import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createApiMiddleware, initApi } from './server/api.js'

// In sviluppo (npm run dev) le API del CRM girano dentro il dev server di Vite.
// In produzione le stesse API sono servite da server/index.js (npm start, Docker).
function storagePlugin() {
  return {
    name: 'crm-storage-plugin',
    configureServer(server) {
      initApi()
      server.middlewares.use(createApiMiddleware())
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), storagePlugin()],
  base: './',
  // Porta fissa. Dati/ (preventivi, calcolatore) cambia mentre lavori: non deve far ricaricare la pagina.
  // .env.local (chiavi AI) viene riscritto dalle Impostazioni: il server lo rilegge da solo, senza riavviarsi
  // (un riavvio ricaricherebbe l'app e chiederebbe di nuovo la password).
  // Sicurezza: niente CORS (l'app e il calcolatore sono sulla stessa origine) e il file dati,
  // la cartella Dati e i file .env non si scaricano come file statici (si leggono solo tramite /api)
  server: {
    port: 5173,
    strictPort: true,
    cors: false,
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', 'crm_data.json*', '**/Dati/**'] },
    watch: { ignored: ['**/Dati/**', '**/.env.local', '**/*.saving.local'] }
  }
})
