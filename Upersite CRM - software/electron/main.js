import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;

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
            sandbox: true
        }
    });

    // I link esterni si aprono nel browser di sistema, non dentro l'app
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//i.test(url)) shell.openExternal(url);
        return { action: 'deny' };
    });

    if (isDev) {
        win.loadURL('http://localhost:5173');
        win.webContents.openDevTools();
    } else {
        win.loadFile(path.join(__dirname, '../dist/index.html'));
    }
}

// Il renderer non ha accesso a Node: apre file e cartelle tramite questi canali IPC
ipcMain.handle('open-path', async (_event, targetPath) => {
    if (typeof targetPath !== 'string' || !path.isAbsolute(targetPath)) {
        throw new Error('Percorso non valido');
    }
    const errorMsg = await shell.openPath(targetPath);
    if (errorMsg) throw new Error(errorMsg);
});

ipcMain.handle('show-item-in-folder', (_event, filePath) => {
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
        throw new Error('Percorso non valido');
    }
    shell.showItemInFolder(filePath);
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
