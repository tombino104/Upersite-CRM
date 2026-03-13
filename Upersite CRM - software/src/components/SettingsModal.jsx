import { useState } from 'react';
import { getMasterPassword, setMasterPassword, exportData, importData, loadData } from '../utils/storage';

export default function SettingsModal({ settings, updateSettings, onClose, setCustomers }) {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleChangePassword = (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (currentPassword !== getMasterPassword()) {
            setError('Password attuale errata');
            return;
        }
        if (newPassword.length < 4) {
            setError('La nuova password deve avere almeno 4 caratteri');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('Le nuove password non corrispondono');
            return;
        }

        setMasterPassword(newPassword);
        setSuccess('Password aggiornata con successo!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
    };

    const handleImport = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                if (importData(ev.target.result)) {
                    const data = loadData();
                    setCustomers(data.customers || []);
                    // We also need to reload settings if they were in the backup
                    if (data.settings) updateSettings(data.settings);
                    setSuccess('Dati importati con successo!');
                } else {
                    setError('File non valido');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    const handleClearData = () => {
        if (confirm('Sei SICURO di voler cancellare TUTTI i dati? Questa operazione non è reversibile (a meno che tu non abbia un backup).')) {
            const empty = { customers: [] };
            importData(JSON.stringify(empty));
            setCustomers([]);
            setSuccess('Tutti i dati sono stati cancellati.');
        }
    };

    return (
        <div className="modal-overlay" style={{ zIndex: 2000 }}>
            <div className="modal-content animate-scale-in" style={{ maxWidth: '500px', width: '90%', maxHeight: '90vh', overflowY: 'auto', padding: '32px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>⚙️ Impostazioni</h2>
                    <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
                </div>

                <div className="settings-section" style={{ marginBottom: '32px' }}>
                    <h3 style={{ fontSize: '0.9rem', marginBottom: '16px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Preferenze App</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div className="detail-group">
                            <label className="input-label">Timeout Inattività (minuti)</label>
                            <input type="number" className="input"
                                value={(settings.inactivityTimeout || 300000) / 60000}
                                onChange={e => updateSettings({ inactivityTimeout: (parseInt(e.target.value) || 5) * 60000 })}
                                min="1" max="60" />
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>L'app si bloccherà dopo questo tempo di inattività.</span>
                        </div>
                        <div className="detail-group">
                            <label className="input-label">Numero Rate Default (Avanzate)</label>
                            <input type="number" className="input"
                                value={settings.defaultInstallments || 3}
                                onChange={e => updateSettings({ defaultInstallments: parseInt(e.target.value) || 1 })}
                                min="1" max="24" />
                        </div>
                    </div>
                </div>

                <div className="settings-section" style={{ marginBottom: '32px', padding: '20px', background: 'var(--bg-hover)', borderRadius: 'var(--radius-lg)' }}>
                    <h3 style={{ fontSize: '0.9rem', marginBottom: '16px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sicurezza Password</h3>
                    <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div className="detail-group">
                            <label className="input-label">Password Attuale</label>
                            <input type="password" className="input" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="••••••••" />
                        </div>
                        <div className="detail-group">
                            <label className="input-label">Nuova Password</label>
                            <input type="password" className="input" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min. 4 caratteri" />
                        </div>
                        <div className="detail-group">
                            <label className="input-label">Conferma Nuova Password</label>
                            <input type="password" className="input" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Ripeti password" />
                        </div>
                        {error && <div style={{ color: 'var(--danger)', fontSize: '0.8rem', fontWeight: 600 }}>⚠ {error}</div>}
                        {success && <div style={{ color: 'var(--success)', fontSize: '0.8rem', fontWeight: 600 }}>✅ {success}</div>}
                        <button type="submit" className="btn btn-primary" style={{ marginTop: '8px' }}>Aggiorna Password</button>
                    </form>
                </div>

                <div className="settings-section" style={{ marginBottom: '32px' }}>
                    <h3 style={{ fontSize: '0.9rem', marginBottom: '16px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Dati & Backup</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <button className="btn btn-secondary" onClick={exportData} style={{ width: '100%', justifyContent: 'center' }}>
                            📥 Esporta Backup (JSON)
                        </button>
                        <button className="btn btn-secondary" onClick={handleImport} style={{ width: '100%', justifyContent: 'center' }}>
                            📤 Importa Backup
                        </button>
                        <div style={{ height: '1px', background: 'var(--border-light)', margin: '8px 0' }} />
                        <button className="btn btn-danger" onClick={handleClearData} style={{ width: '100%', justifyContent: 'center', opacity: 0.8 }}>
                            🗑️ Cancella Tutti i Dati
                        </button>
                    </div>
                </div>

                <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    Upersite CRM v1.0.0 — Sviluppato per Loren
                </div>
            </div>
        </div>
    );
}
