import { app, BrowserWindow, ipcMain, shell } from 'electron';
import fs from 'fs';
import net from 'net';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;

const WEBVIEW_ALLOWED = /^https:\/\/([a-z0-9-]+\.)*uptimerobot\.com(\/|$)/i;

// Indirizzo del server del CRM. CRM_URL serve ai test per usare un server a parte.
const APP_URL = process.env.CRM_URL || 'http://localhost:5173';
const APP_ORIGIN = new URL(APP_URL).origin;

// Pagine del CRM: il server del CRM (sviluppo) o i file di dist (app impacchettata)
function isAppUrl(url) {
    try {
        const u = new URL(url);
        return isDev ? u.origin === APP_ORIGIN : u.protocol === 'file:';
    } catch {
        return false;
    }
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        titleBarStyle: 'hidden',
        titleBarOverlay: {
            color: '#ffffff',
            symbolColor: '#2D3436',
            height: 48
        },
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            // Serve per mostrare UptimeRobot dentro il CRM (blocca gli iframe)
            webviewTag: true
        }
    });

    // I link esterni si aprono nel browser di sistema, non dentro l'app
    const openExternally = ({ url }) => {
        if (/^https?:\/\//i.test(url)) shell.openExternal(url);
        return { action: 'deny' };
    };
    win.webContents.setWindowOpenHandler(openExternally);

    // La finestra resta sempre sul CRM: un link verso un altro sito si apre nel browser di sistema
    // (una pagina esterna caricata qui avrebbe accesso a electronAPI)
    const keepInApp = (event, url) => {
        if (isAppUrl(url)) return;
        event.preventDefault();
        openExternally({ url });
    };
    win.webContents.on('will-navigate', keepInApp);
    win.webContents.on('will-redirect', keepInApp);

    // Il <webview> può caricare solo UptimeRobot, senza preload né accesso a Node
    win.webContents.on('will-attach-webview', (event, webPreferences, params) => {
        delete webPreferences.preload;
        webPreferences.nodeIntegration = false;
        webPreferences.contextIsolation = true;
        webPreferences.sandbox = true;
        if (!WEBVIEW_ALLOWED.test(params.src)) event.preventDefault();
    });

    win.webContents.on('did-attach-webview', (_event, guest) => {
        guest.setWindowOpenHandler(openExternally);
        guest.on('will-navigate', (e, url) => {
            if (!WEBVIEW_ALLOWED.test(url)) {
                e.preventDefault();
                openExternally({ url });
            }
        });
    });

    if (isDev) {
        win.loadURL(APP_URL);
        win.webContents.openDevTools();
    } else {
        win.loadFile(path.join(__dirname, '../dist/index.html'));
    }
}

// File che non si aprono mai dal CRM (programmi, script, collegamenti, dischi virtuali, Office con macro):
// i percorsi arrivano dalle note e dai dati, che possono essere incollati o importati
const BLOCKED_EXTENSIONS = new Set([
    'exe', 'com', 'bat', 'cmd', 'scr', 'msi', 'msp', 'pif', 'cpl', 'dll', 'sys', 'drv',
    'ps1', 'psm1', 'psd1', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'ws', 'hta', 'py', 'pyw',
    'lnk', 'url', 'website', 'appref-ms', 'application', 'settingcontent-ms', 'search-ms', 'library-ms', 'scf',
    'jar', 'msc', 'chm', 'reg', 'inf', 'iso', 'img', 'vhd', 'vhdx',
    'xll', 'xlam', 'xlsm', 'docm', 'pptm', 'one', 'diagcab', 'theme', 'gadget', 'msix', 'appx'
]);

// Percorsi di rete (\\server\cartella) ammessi solo verso la rete locale:
// un server esterno riceverebbe le credenziali di Windows
function isLocalNetworkHost(host) {
    if (net.isIPv4(host)) {
        return /^(127|10)\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    }
    if (net.isIP(host)) return false;
    return host.toLowerCase().endsWith('.local') || !host.includes('.');
}

// Controlla un percorso ricevuto dal renderer e lo restituisce normalizzato (lancia un errore se non è ammesso)
function checkPath(targetPath, { allowExecutable = false } = {}) {
    if (typeof targetPath !== 'string' || !path.win32.isAbsolute(targetPath) || /^[\\/]{2}[?.][\\/]/.test(targetPath)) {
        throw new Error('Percorso non valido');
    }
    const full = path.win32.resolve(targetPath);
    // Due punti dopo l'unità = flusso alternativo di un file (documento.pdf:nascosto.exe)
    if (full.slice(2).includes(':')) throw new Error('Percorso non valido');
    if (full.startsWith('\\\\') && !isLocalNetworkHost(full.slice(2).split('\\')[0])) {
        throw new Error('Si aprono solo percorsi di rete della rete locale');
    }
    if (!allowExecutable) {
        // Windows ignora punti e spazi finali: "programma.exe." aprirebbe programma.exe
        const ext = path.win32.extname(path.win32.basename(full).replace(/[. ]+$/, '')).slice(1).toLowerCase();
        let isDirectory = false;
        try { isDirectory = fs.statSync(full).isDirectory(); } catch { /* non esiste: lo segnala shell.openPath */ }
        if (!isDirectory && BLOCKED_EXTENSIONS.has(ext)) throw new Error('Per sicurezza i file eseguibili non si aprono dal CRM');
    }
    return full;
}

// Le chiamate IPC sono accettate solo dalle pagine del CRM
function checkSender(event) {
    if (!isAppUrl(event.senderFrame?.url || '')) throw new Error('Richiesta non autorizzata');
}

// Il renderer non ha accesso a Node: apre file e cartelle tramite questi canali IPC
ipcMain.handle('open-path', async (event, targetPath) => {
    checkSender(event);
    const errorMsg = await shell.openPath(checkPath(targetPath));
    if (errorMsg) throw new Error(errorMsg);
});

// Mostrare un file in Esplora risorse non lo apre: qui sono ammessi anche gli eseguibili
ipcMain.handle('show-item-in-folder', (event, filePath) => {
    checkSender(event);
    shell.showItemInFolder(checkPath(filePath, { allowExecutable: true }));
});

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
