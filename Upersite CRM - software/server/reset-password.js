// Password master dimenticata: toglie la password dal file dati, così al prossimo accesso se ne crea una nuova.
// I dati dei clienti restano. Le password della sezione Accessi (cifrate con la vecchia password master)
// restano illeggibili finché non reimposti la stessa password di prima.
//
// Va eseguito dove gira il server, con le stesse variabili d'ambiente (in particolare la chiave di cifratura):
//   npm run reset-password
//   Docker:  docker exec upersite-crm node server/reset-password.js
//
// Finché non crei la nuova password il CRM è in "modalità configurazione" e chiunque lo raggiunga
// può impostarla: fallo subito dopo il reset.
import fs from 'fs'
import { Buffer } from 'buffer'
import path from 'path'
import process from 'process'
import { fileURLToPath } from 'url'
import { decryptIfNeeded, protect } from './vault.js'

const root = process.env.CRM_DATA_DIR
  ? path.resolve(process.env.CRM_DATA_DIR)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const file = path.join(root, 'crm_data.json')

if (!fs.existsSync(file)) {
  console.error(`File dati non trovato: ${file}`)
  process.exit(1)
}

let data
try {
  data = JSON.parse(decryptIfNeeded(fs.readFileSync(file)).toString('utf-8'))
} catch (e) {
  console.error(`Impossibile leggere i dati: ${e.message}`)
  process.exit(1)
}

if (!data.masterPassword) {
  console.log('Nessuna password master impostata: non c\'è niente da reimpostare.')
  process.exit(0)
}

// Copia di sicurezza accanto al file (con lo stesso tipo di protezione), poi scrittura atomica
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
fs.copyFileSync(file, `${file}.prima-del-reset-${stamp}`)
delete data.masterPassword
const tmp = `${file}.tmp`
fs.writeFileSync(tmp, protect(Buffer.from(JSON.stringify(data, null, 2), 'utf-8')))
fs.renameSync(tmp, file)

console.log('Password master rimossa. Apri subito il CRM e crea una nuova password.')
console.log(`Copia di sicurezza del file precedente: ${file}.prima-del-reset-${stamp}`)
