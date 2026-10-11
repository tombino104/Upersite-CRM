const { contextBridge, ipcRenderer } = require('electron');

// Esponi solo le API necessarie al renderer (contextIsolation attivo)
contextBridge.exposeInMainWorld('electronAPI', {
    // Apre un file o una cartella con l'applicazione predefinita di Windows
    openPath: (path) => ipcRenderer.invoke('open-path', path),
    // Evidenzia il file nel File Explorer (Windows)
    showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath)
});
