const { shell } = require('electron');

window.addEventListener('DOMContentLoaded', () => {
    // Preload script
});

// Esponi l'API shell per aprire percorsi
window.electronAPI = {
    openPath: async (path) => {
        try {
            await shell.openPath(path);
        } catch (error) {
            console.error('Errore nell\'aprire il percorso:', error);
            throw error;
        }
    }
};
