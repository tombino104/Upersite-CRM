// Ripristino da una cartella del computer (anche non zippata): la cartella si sceglie dal browser,
// qui si capisce cosa contiene e i file vengono caricati sul server, che li tratta come un backup.
//
// Cartelle riconosciute:
//   • cartella di un backup datato:   backup_ore_*.json + Preventivi/ + Calcolatore/ (+ altre)
//   • cartella dei dati del CRM:      crm_data.json + Dati/Preventivi + Dati/Calcolatore
//   • cartella con un export JSON:    upersite-crm-backup-*.json (+ Preventivi/ e Calcolatore/ accanto)
//   • una cartella che ne contiene più d'una (es. tutta la cartella dei backup): si sceglie quale usare

import { CRM_REQUEST_HEADERS } from './storage';

const DATA_FILE_RE = /^(backup_ore_.*|crm_data|upersite-crm-backup.*)\.json$/i;
const JUNK_RE = /^(\.DS_Store|Thumbs\.db|desktop\.ini|\._.*|.*\.tmp)$/i;
const NORMAL_NAMES = { preventivi: 'Preventivi', calcolatore: 'Calcolatore' };

const baseName = (rel) => rel.split('/').pop();
const dirName = (rel) => rel.split('/').slice(0, -1).join('/');

// Percorso dentro il backup: "Dati/Preventivi/x.pdf" → "Preventivi/x.pdf"; i nomi delle due cartelle note si normalizzano
function innerPath(rest) {
    const parts = rest.split('/');
    if (NORMAL_NAMES[parts[0].toLowerCase()]) parts[0] = NORMAL_NAMES[parts[0].toLowerCase()];
    return parts.join('/');
}

export function analyzeFolder(fileList) {
    const entries = Array.from(fileList)
        .map(file => ({ file, rel: (file.webkitRelativePath || file.name).replace(/\\/g, '/') }))
        .filter(e => !JUNK_RE.test(baseName(e.rel)) && !/(^|\/)(\.import|node_modules|\.git)(\/|$)/.test(e.rel));
    if (!entries.length) return { candidates: [], total: 0 };

    const dataFiles = entries.filter(e => DATA_FILE_RE.test(baseName(e.rel)));
    const candidates = dataFiles.map(data => {
        const base = dirName(data.rel);
        const prefix = base ? base + '/' : '';
        const isDataFolder = /^crm_data\.json$/i.test(baseName(data.rel));
        const isDayBackup = /^backup_ore_/i.test(baseName(data.rel));
        const files = [];
        for (const e of entries) {
            if (e === data || !e.rel.startsWith(prefix)) continue;
            let rest = e.rel.slice(prefix.length);
            if (!rest.includes('/')) continue; // file sciolti accanto al JSON: non fanno parte del backup
            if (isDataFolder && /^dati\//i.test(rest)) rest = rest.slice(5); // la cartella Dati è la radice di Preventivi/Calcolatore/...
            else if (isDataFolder && !NORMAL_NAMES[rest.split('/')[0].toLowerCase()]) continue; // altre cartelle accanto ai dati (es. i backup) restano fuori
            const top = rest.split('/')[0];
            // Un export JSON non ha altre cartelle oltre alle due note; un backup datato sì (le "altre cartelle" di Dati)
            if (!isDayBackup && !isDataFolder && !NORMAL_NAMES[top.toLowerCase()]) continue;
            if (isDataFolder && !rest.includes('/')) continue;
            files.push({ file: e.file, rel: innerPath(rest) });
        }
        const count = (name) => files.filter(f => f.rel.startsWith(name + '/')).length;
        return {
            key: data.rel,
            data: data.file,
            dataName: baseName(data.rel),
            folderLabel: base.split('/').pop() || '(cartella scelta)',
            modified: data.file.lastModified || 0,
            files,
            quotes: count('Preventivi'),
            calc: count('Calcolatore'),
            bytes: files.reduce((n, f) => n + f.file.size, 0) + data.file.size,
        };
    }).sort((a, b) => b.modified - a.modified);

    return { candidates, total: entries.length };
}

async function postJson(url, init = {}) {
    const res = await fetch(url, { method: 'POST', headers: CRM_REQUEST_HEADERS, ...init });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Errore ${res.status}`);
    return data;
}

// Carica la cartella scelta sul server. onProgress(fatti, totale). Restituisce { folder, file, ... } da usare come un backup.
export async function uploadCandidate(candidate, onProgress = () => {}) {
    const start = await postJson('/api/restore/stage/start');
    const total = candidate.files.length + 1;
    let done = 0;
    let skipped = 0;
    try {
        await postJson(`/api/restore/stage/file?id=${start.id}&path=${encodeURIComponent('@data')}`, { body: candidate.data });
        onProgress(++done, total);
        const queue = [...candidate.files];
        const worker = async () => {
            while (queue.length) {
                const item = queue.shift();
                const res = await postJson(`/api/restore/stage/file?id=${start.id}&path=${encodeURIComponent(item.rel)}`, { body: item.file });
                if (res.skipped) skipped++;
                onProgress(++done, total);
            }
        };
        await Promise.all([worker(), worker(), worker()]);
    } catch (err) {
        await discardStage(start.id).catch(() => {});
        throw err;
    }
    return { ...start, skipped, size: candidate.data.size, quotes: candidate.quotes, calc: candidate.calc };
}

export function discardStage(folderOrId) {
    const id = String(folderOrId).replace(/^import-/, '');
    return postJson(`/api/restore/stage/discard?id=${id}`);
}
