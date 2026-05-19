const { shell } = require('electron');

window.addEventListener('DOMContentLoaded', () => {
    // Preload script
});

// Esponi l'API shell per aprire percorsi
window.electronAPI = {
    openPath: async (path) => {
        try {
            // shell.openPath returns an error string if it fails, or an empty string if successful
            const errorMsg = await shell.openPath(path);
            if (errorMsg) {
                throw new Error(errorMsg);
            }
        } catch (error) {
            console.error('Errore nell\'aprire il percorso:', error);
            throw error;
        }
    },
    showItemInFolder: async (filePath) => {
        try {
            // Evidenzia il file nel File Explorer (Windows)
            shell.showItemInFolder(filePath);
        } catch (error) {
            console.error('Errore nel mostrare il file nella cartella:', error);
            throw error;
        }
    }
};
