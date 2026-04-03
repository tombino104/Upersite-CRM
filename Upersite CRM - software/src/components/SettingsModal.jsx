import { useMemo, useState, useEffect } from 'react';
import { getMasterPassword, setMasterPassword, exportData, importData, syncWithFileSystem, formatBytes, getStorageInfo } from '../utils/storage';

export default function SettingsModal({ settings, updateSettings, onClose, setCustomers, customers }) {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [backupSuccess, setBackupSuccess] = useState('');
    const [importSuccess, setImportSuccess] = useState('');
    const [realSize, setRealSize] = useState(null);

    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [clearPassword, setClearPassword] = useState('');
    const [clearError, setClearError] = useState('');
    const [isClearing, setIsClearing] = useState(false);

    useEffect(() => {
        getStorageInfo().then(info => {
            if (info && info.size) setRealSize(info.size);
        });
    }, []);

    const handleChangePassword = (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setBackupSuccess('');
        setImportSuccess('');

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

    const { totalUsed, appUsed, filesUsed, pctApp, pctFiles } = useMemo(() => {
        const list = Array.isArray(customers) ? customers : [];

        const files = list.flatMap(c => (c.files || []));
        const filesSize = files.reduce((sum, f) => sum + (Number(f.size) || 0), 0);

        const customersLite = list.map(c => {
            const { files: _files, ...rest } = (c || {});
            if (!_files) return rest;
            return {
                ...rest,
                files: (_files || []).map(f => {
                    const { data: _data, ...fRest } = (f || {});
                    return fRest;
                })
            };
        });

        const appJson = JSON.stringify({ customers: customersLite });
        const appSize = appJson.length * 2;

        const total = appSize + filesSize;
        const safeTotal = Math.max(total, 1);
        const pApp = (appSize / safeTotal) * 100;
        const pFiles = (filesSize / safeTotal) * 100;

        return {
            totalUsed: total,
            appUsed: appSize,
            filesUsed: filesSize,
            pctApp: Math.min(100, pApp),
            pctFiles: Math.min(100, pFiles)
        };
    }, [customers]);

    const handleImport = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (ev) => {
                const ok = await importData(ev.target.result);
                if (ok) {
                    syncWithFileSystem().then((data) => {
                        setCustomers(data.customers || []);
                        if (data.settings) updateSettings(data.settings);
                        setImportSuccess('Dati importati con successo!');
                    }).catch(() => {
                        setError('Import riuscito ma sincronizzazione fallita. Riprova.');
                    });
                } else {
                    setError('File non valido');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    const handleClearData = () => {
        setError('');
        setSuccess('');
        setBackupSuccess('');
        setImportSuccess('');
        setClearError('');
        setClearPassword('');
        setShowClearConfirm(true);
    };

    const executeClearData = async () => {
        setClearError('');
        setError('');
        setSuccess('');
        setBackupSuccess('');
        setImportSuccess('');

        if (clearPassword !== getMasterPassword()) {
            setClearError('Password errata');
            return;
        }

        setIsClearing(true);
        try {
            const empty = { customers: [], tags: [], settings: settings || {} };
            const ok = await importData(JSON.stringify(empty));
            if (!ok) {
                setClearError('Impossibile cancellare i dati');
                return;
            }
            const data = await syncWithFileSystem();
            setCustomers(data.customers || []);
            if (data.settings) updateSettings(data.settings);
            setImportSuccess('Tutti i dati sono stati cancellati.');
            setShowClearConfirm(false);
        } catch {
            setError('Errore durante la cancellazione dati.');
        } finally {
            setIsClearing(false);
        }
    };

    return (
        <>
            <div className="modal-overlay" style={{ zIndex: 2000 }}>
                <div className="modal-content animate-scale-in" style={{ maxWidth: '800px', width: '95%', maxHeight: '90vh', overflowY: 'auto', padding: '32px' }}>
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
                                <input type="password" className="input" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="••••••••" />
                            </div>
                            <div className="detail-group">
                                <label className="input-label">Conferma Nuova Password</label>
                                <input type="password" className="input" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••" />
                            </div>
                            {error && <div style={{ color: 'var(--danger)', fontSize: '0.8rem', fontWeight: 600, marginTop: '4px' }}>⚠️ {error}</div>}
                            {success && <div style={{ color: 'var(--success)', fontSize: '0.8rem', fontWeight: 600, marginTop: '4px' }}>✅ {success}</div>}
                            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>🔐 Aggiorna Password</button>
                        </form>
                    </div>

                    {/* Backup Section */}
                    <div className="settings-section" style={{ marginBottom: '32px' }}>
                        <h3 style={{ fontSize: '0.9rem', marginBottom: '16px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Backup Dati</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div className="detail-group">
                                <label className="input-label">Percorso Backup Automatico</label>
                                <input type="text" className="input"
                                    value={settings.backupPath || ''}
                                    onChange={e => updateSettings({ backupPath: e.target.value })}
                                    placeholder="C:\Users\...\Backup" />
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Cartella dove verranno creati i backup datati.</span>
                            </div>

                            <button className="btn btn-primary"
                                onClick={async () => {
                                    setBackupSuccess('');
                                    setError('');
                                    if (!settings.backupPath) {
                                        setError('Specifica prima un percorso di backup');
                                        return;
                                    }
                                    try {
                                        const { triggerAutoBackup } = await import('../utils/storage');
                                        const result = await triggerAutoBackup();
                                        if (result.success) {
                                            setBackupSuccess(`Backup creato: ${result.folder}`);
                                        } else {
                                            setError(`Errore backup: ${result.error}`);
                                        }
                                    } catch {
                                        setError('Errore di sistema durante il backup');
                                    }
                                }}
                                style={{ width: '100%', justifyContent: 'center', background: 'var(--primary)', color: 'white' }}>
                                💾 Crea Backup Ora
                            </button>

                            {backupSuccess && <div style={{ color: 'var(--success)', fontSize: '0.8rem', fontWeight: 600, marginTop: '8px', textAlign: 'center' }}>✅ {backupSuccess}</div>}

                            <div style={{ height: '1px', background: 'var(--border-light)', margin: '8px 0' }} />

                            <button className="btn btn-secondary" onClick={exportData} style={{ width: '100%', justifyContent: 'center' }}>
                                📥 Esporta Backup (JSON)
                            </button>
                            <button className="btn btn-secondary" onClick={handleImport} style={{ width: '100%', justifyContent: 'center' }}>
                                📤 Importa Backup
                            </button>
                            {importSuccess && <div style={{ color: 'var(--success)', fontSize: '0.8rem', fontWeight: 600, marginTop: '8px', textAlign: 'center' }}>✅ {importSuccess}</div>}
                            <div style={{ height: '1px', background: 'var(--border-light)', margin: '8px 0' }} />
                            <button className="btn btn-danger" onClick={handleClearData} style={{ width: '100%', justifyContent: 'center', opacity: 0.8 }}>
                                🗑️ Cancella Tutti i Dati
                            </button>
                            {importSuccess && importSuccess.includes('cancellati') && <div style={{ color: 'var(--success)', fontSize: '0.8rem', fontWeight: 600, marginTop: '8px', textAlign: 'center' }}>✅ {importSuccess}</div>}
                        </div>
                    </div>

                    {/* Clear Confirmation */}
                    {showClearConfirm && (
                        <div className="modal-overlay animate-fade-in" style={{ zIndex: 2100 }} onClick={() => !isClearing && setShowClearConfirm(false)}>
                            <div className="modal-content animate-scale-in" style={{ maxWidth: '420px', padding: '28px', borderTop: '4px solid var(--danger)' }} onClick={e => e.stopPropagation()}>
                                <div style={{ fontSize: '2.5rem', textAlign: 'center', marginBottom: '8px' }}>🗑️</div>
                                <h3 style={{ textAlign: 'center', color: 'var(--danger)', margin: '0 0 12px 0', fontSize: '1.05rem' }}>
                                    Cancellare TUTTI i dati?
                                </h3>
                                <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5, margin: '0 0 14px 0' }}>
                                    Per confermare inserisci la <strong>password master</strong>.
                                </p>

                                <div className="detail-group" style={{ marginBottom: '10px' }}>
                                    <label className="input-label">Password master</label>
                                    <input
                                        type="password"
                                        className="input"
                                        value={clearPassword}
                                        onChange={e => setClearPassword(e.target.value)}
                                        placeholder="••••••••"
                                        disabled={isClearing}
                                    />
                                    {clearError && <div style={{ color: 'var(--danger)', fontSize: '0.8rem', fontWeight: 600, marginTop: '6px' }}>⚠ {clearError}</div>}
                                </div>

                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '14px' }}>
                                    <button className="btn btn-secondary" onClick={() => setShowClearConfirm(false)} disabled={isClearing}>Annulla</button>
                                    <button className="btn btn-danger" onClick={executeClearData} disabled={isClearing}>
                                        {isClearing ? 'Cancellazione...' : 'Conferma e Cancella'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            </>
    );
}
