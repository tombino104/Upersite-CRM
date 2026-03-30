import { useMemo, useState, useEffect } from 'react';
import { getMasterPassword, setMasterPassword, exportData, importData, syncWithFileSystem, formatBytes, getStorageInfo } from '../utils/storage';

export default function SettingsModal({ settings, updateSettings, onClose, setCustomers, customers }) {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
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
                        setSuccess('Dati importati con successo!');
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
        setClearError('');
        setClearPassword('');
        setShowClearConfirm(true);
    };

    const executeClearData = async () => {
        setClearError('');
        setError('');
        setSuccess('');

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
            setSuccess('Tutti i dati sono stati cancellati.');
            setShowClearConfirm(false);
        } catch {
            setError('Errore durante la cancellazione dati.');
        } finally {
            setIsClearing(false);
        }
    };

    return (
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

                <div className="settings-section" style={{ marginBottom: '32px' }}>
                    <h3 style={{ fontSize: '0.9rem', marginBottom: '16px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Memoria</h3>

                    <div style={{ background: 'var(--bg-hover)', borderRadius: 'var(--radius-lg)', padding: '16px', border: '1px solid var(--border-light)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '0.85rem' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Spazio usato</span>
                            <strong>{formatBytes(totalUsed)}</strong>
                        </div>

                        {realSize !== null && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '0.78rem' }}>
                                <span style={{ color: 'var(--text-tertiary)' }}>Dimensione reale (file)</span>
                                <strong style={{ color: 'var(--text-secondary)' }}>{formatBytes(realSize)}</strong>
                            </div>
                        )}

                        <div style={{ height: '14px', borderRadius: '999px', background: 'rgba(0,0,0,0.06)', overflow: 'hidden', border: '1px solid var(--border-light)' }}>
                            <div style={{ display: 'flex', width: '100%', height: '100%' }}>
                                <div style={{ width: `${pctApp}%`, background: 'var(--primary)', height: '100%' }} />
                                <div style={{ width: `${pctFiles}%`, background: 'var(--warning)', height: '100%' }} />
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: 'var(--primary)', marginRight: 6 }} />App/Dati</span>
                            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: 'var(--warning)', marginRight: 6 }} />File</span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '0.8rem' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>App/Dati: <strong style={{ color: 'var(--text-primary)' }}>{formatBytes(appUsed)}</strong></span>
                            <span style={{ color: 'var(--text-secondary)' }}>File: <strong style={{ color: 'var(--text-primary)' }}>{formatBytes(filesUsed)}</strong></span>
                        </div>

                        <div style={{ marginTop: '8px', fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                            Totale = dimensione dati CRM (senza base64) + somma reale dei file caricati.
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
                        <div className="detail-group" style={{ marginBottom: '8px' }}>
                            <label className="input-label">Percorso Backup Generico</label>
                            <input type="text" className="input"
                                value={settings.backupPath || ''}
                                onChange={e => updateSettings({ backupPath: e.target.value })}
                                placeholder="C:\Users\...\Backup" />
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Cartella dove verranno creati i backup datati.</span>
                        </div>

                        <button className="btn btn-primary"
                            onClick={async () => {
                                setSuccess('');
                                setError('');
                                if (!settings.backupPath) {
                                    setError('Specifica prima un percorso di backup');
                                    return;
                                }
                                try {
                                    const { triggerAutoBackup } = await import('../utils/storage');
                                    const result = await triggerAutoBackup();
                                    if (result.success) {
                                        setSuccess(`Backup creato: ${result.folder}`);
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

                        <div style={{ height: '1px', background: 'var(--border-light)', margin: '8px 0' }} />

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
    );
}
