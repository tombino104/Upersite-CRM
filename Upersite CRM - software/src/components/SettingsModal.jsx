import { useMemo, useState, useEffect } from 'react';
import { getMasterPassword, verifyMasterPassword, setMasterPassword, exportData, importData, formatBytes, getStorageInfo } from '../utils/storage';
import { reencryptCredentials } from '../utils/credentialVault';
import { APP_VERSION, formatVersionDisplay } from '../utils/version';
import { getAvailableModels, getCurrentModel, getCurrentSummaryModel, setAIModel, setAISummaryModel } from '../utils/aiTextService';
import CalculatorSettings from './CalculatorSettings';
import RestoreModal from './RestoreModal';
import ManualModal from './ManualModal';

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
    const [showRestore, setShowRestore] = useState(false);
    const [showManual, setShowManual] = useState(false);
    const [clearPassword, setClearPassword] = useState('');
    const [clearError, setClearError] = useState('');
    const [isClearing, setIsClearing] = useState(false);

    useEffect(() => {
        getStorageInfo().then(info => {
            if (info && info.size) setRealSize(info.size);
        });
    }, []);

    const handleChangePassword = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setBackupSuccess('');
        setImportSuccess('');

        if (!(await verifyMasterPassword(currentPassword))) {
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

        // Ricifra le credenziali dei clienti con la nuova password e salva tutto insieme
        const { customers: reencrypted, failed } = await reencryptCredentials(customers, currentPassword, newPassword);
        await setMasterPassword(newPassword, { persist: false });
        setCustomers(reencrypted);
        setSuccess(failed > 0
            ? `Password aggiornata. Attenzione: ${failed} credenziali non erano decifrabili e sono rimaste invariate.`
            : 'Password aggiornata con successo!');
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
                    // Ricarica l'app: tutti i dati (e la password del backup) vengono letti dal file importato
                    alert('Dati importati. Il CRM verrà ricaricato: accedi con la password del backup importato.');
                    window.location.reload();
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

        if (!(await verifyMasterPassword(clearPassword))) {
            setClearError('Password errata');
            return;
        }

        setIsClearing(true);
        try {
            // Manteniamo la password master: il file dati è la fonte di verità
            const empty = { customers: [], tags: [], settings: settings || {}, masterPassword: getMasterPassword() };
            const ok = await importData(JSON.stringify(empty));
            if (!ok) {
                setClearError('Impossibile cancellare i dati');
                return;
            }
            // Ricarica l'app, così nessun dato rimasto in memoria viene salvato di nuovo
            alert('Tutti i dati sono stati cancellati. Il CRM verrà ricaricato.');
            window.location.reload();
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

                    <button onClick={() => setShowManual(true)} style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: '14px', textAlign: 'left', cursor: 'pointer',
                        padding: '16px 18px', marginBottom: '28px', borderRadius: 'var(--radius-lg)', font: 'inherit',
                        border: '1px solid rgba(108,92,231,0.18)', background: 'linear-gradient(135deg, var(--primary-ghost), rgba(245,158,11,0.06))',
                    }}>
                        <span style={{ fontSize: '1.6rem' }}>📖</span>
                        <span style={{ flex: 1 }}>
                            <span style={{ display: 'block', fontWeight: 700, color: 'var(--text-primary)' }}>Manuale d'uso del CRM</span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Come funziona tutto: clienti, calcolatore, fogli ore, automazioni, backup e ripristino</span>
                        </span>
                        <span style={{ color: 'var(--primary)', fontWeight: 700 }}>Apri →</span>
                    </button>

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
                            
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', marginTop: '8px' }}>
                                <div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 500, marginBottom: '4px' }}>🖱️ Cursore Personalizzato CRM</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                                        Abilita i cursori custom per puntatore, manina di click e cursore di testo all'interno dell'app
                                    </div>
                                </div>
                                <label className="switch" style={{
                                    position: 'relative',
                                    display: 'inline-block',
                                    width: '44px',
                                    height: '24px'
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={settings.customCursor || false}
                                        onChange={e => updateSettings({ customCursor: e.target.checked })}
                                        style={{ opacity: 0, width: 0, height: 0 }}
                                    />
                                    <span style={{
                                        position: 'absolute',
                                        cursor: 'pointer',
                                        top: 0,
                                        left: 0,
                                        right: 0,
                                        bottom: 0,
                                        backgroundColor: settings.customCursor ? 'var(--primary)' : '#ccc',
                                        transition: '.4s',
                                        borderRadius: '24px'
                                    }}>
                                        <span style={{
                                            position: 'absolute',
                                            height: '18px',
                                            width: '18px',
                                            left: settings.customCursor ? '26px' : '3px',
                                            bottom: '3px',
                                            backgroundColor: 'white',
                                            transition: '.4s',
                                            borderRadius: '50%'
                                        }}></span>
                                    </span>
                                </label>
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
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Cartella dove verranno creati i backup datati: contiene solo le cartelle con data, ognuna con il file dati e una copia di <strong>Preventivi</strong> e <strong>Calcolatore</strong>. Gli originali di lavoro stanno nella cartella <strong>Dati</strong> del CRM.</span>
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
                                            setBackupSuccess(`Backup completo in ${result.folder}\\${result.file || ''}${result.dataFiles ? ` · ${result.dataFiles} file (preventivi e calcolatore)` : ''}${result.quotesMissing ? ` · ${result.quotesMissing} preventivi non trovati` : ''}`);
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

                            <button className="btn btn-secondary" onClick={() => setShowRestore(true)} disabled={!settings.backupPath} style={{ width: '100%', justifyContent: 'center' }}>
                                ♻️ Ripristina da un backup…
                            </button>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '-8px' }}>
                                Tutto (dati, preventivi, calcolatore) o solo alcuni clienti. Prima di ripristinare viene salvato lo stato attuale.
                            </span>

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

                    <CalculatorSettings settings={settings} updateSettings={updateSettings} />

                    {showRestore && <RestoreModal onClose={() => setShowRestore(false)} />}
                    {showManual && <ManualModal onClose={() => setShowManual(false)} />}

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

                    {/* AI Writing Tools Model Settings */}
                    <div className="settings-section" style={{ marginBottom: '32px', padding: '20px', background: 'var(--bg-hover)', borderRadius: 'var(--radius-lg)' }}>
                        <h3 style={{ fontSize: '0.9rem', marginBottom: '16px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🤖 AI Writing Tools</h3>
                        <div className="form-row">
                            <div className="detail-group" style={{ flex: 1 }}>
                                <label className="input-label">Modello AI Predefinito</label>
                                <select
                                    className="input"
                                    value={getCurrentModel().id}
                                    onChange={e => {
                                        setAIModel(e.target.value);
                                        updateSettings({ aiWritingModel: e.target.value });
                                    }}
                                    style={{ width: '100%' }}
                                >
                                    {getAvailableModels().map(model => (
                                        <option key={model.id} value={model.id}>
                                            {model.label} - {model.description}
                                        </option>
                                    ))}
                                </select>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '8px', display: 'block' }}>
                                    Modello utilizzato per gli strumenti di scrittura AI nel Rich Text Editor.
                                    {getCurrentModel().id === 'gemma-4-31b-it' ? ' Gemma 4 31B è ottimizzato per l\'italiano.' : ''}
                                </span>
                            </div>
                        </div>

                        <div className="form-row" style={{ marginTop: '16px' }}>
                            <div className="detail-group" style={{ flex: 1 }}>
                                <label className="input-label">Modello AI per Riassunti</label>
                                <select
                                    className="input"
                                    value={getCurrentSummaryModel().id}
                                    onChange={e => {
                                        setAISummaryModel(e.target.value);
                                        updateSettings({ aiSummaryModel: e.target.value });
                                    }}
                                    style={{ width: '100%' }}
                                >
                                    {getAvailableModels().map(model => (
                                        <option key={model.id} value={model.id}>
                                            {model.label} - {model.description}
                                        </option>
                                    ))}
                                </select>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '8px', display: 'block' }}>
                                    Modello specifico per il pulsante "Riassumi" nelle note.
                                </span>
                            </div>
                        </div>
                        <div style={{ marginTop: '12px', padding: '12px', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                            <strong>Modelli disponibili:</strong>
                            <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {getAvailableModels().map(model => (
                                    <div key={model.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{
                                            background: model.id === getCurrentModel().id ? 'var(--primary)' : 'var(--bg-secondary)',
                                            color: model.id === getCurrentModel().id ? 'white' : 'var(--text-secondary)',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            fontSize: '0.7rem',
                                            fontWeight: 600
                                        }}>
                                            {model.badge}
                                        </span>
                                        <span style={{ color: model.id === getCurrentModel().id ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                                            {model.label}: {model.description}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="settings-section" style={{ borderTop: '1px solid var(--border-light)', paddingTop: '24px' }}>
                        <h3 style={{ fontSize: '0.9rem', marginBottom: '16px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ottimizzazione AI</h3>

                        <div style={{ marginBottom: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)' }}>
                                <div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 500, marginBottom: '4px' }}>Ottimizzazione Token</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                                        Invia solo dati rilevanti al chatbot AI (task attivi, tickets aperti, rate da pagare)
                                    </div>
                                </div>
                                <label className="switch" style={{
                                    position: 'relative',
                                    display: 'inline-block',
                                    width: '44px',
                                    height: '24px'
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={settings.aiOptimization || false}
                                        onChange={e => updateSettings({ aiOptimization: e.target.checked })}
                                        style={{ opacity: 0, width: 0, height: 0 }}
                                    />
                                    <span style={{
                                        position: 'absolute',
                                        cursor: 'pointer',
                                        top: 0,
                                        left: 0,
                                        right: 0,
                                        bottom: 0,
                                        backgroundColor: settings.aiOptimization ? 'var(--primary)' : '#ccc',
                                        transition: '.4s',
                                        borderRadius: '24px'
                                    }}>
                                        <span style={{
                                            position: 'absolute',
                                            height: '18px',
                                            width: '18px',
                                            left: settings.aiOptimization ? '26px' : '3px',
                                            bottom: '3px',
                                            backgroundColor: 'white',
                                            transition: '.4s',
                                            borderRadius: '50%'
                                        }}></span>
                                    </span>
                                </label>
                            </div>
                        </div>

                        <div style={{ padding: '12px', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)' }}>
                            <div style={{ fontSize: '0.9rem', fontWeight: 500, marginBottom: '8px' }}>Statistiche Token Globali</div>
                            <div style={{ display: 'flex', gap: '24px', fontSize: '0.85rem' }}>
                                <div>
                                    <div style={{ color: 'var(--text-tertiary)', marginBottom: '2px' }}>Token usati</div>
                                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                        {settings.tokenStats?.totalUsed?.toLocaleString('it-IT') || 0}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ color: 'var(--text-tertiary)', marginBottom: '2px' }}>Token risparmiati</div>
                                    <div style={{ fontWeight: 600, color: 'var(--success)' }}>
                                        {settings.tokenStats?.totalSaved?.toLocaleString('it-IT') || 0}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ color: 'var(--text-tertiary)', marginBottom: '2px' }}>Risparmio</div>
                                    <div style={{ fontWeight: 600, color: 'var(--primary)' }}>
                                        {settings.tokenStats?.totalUsed > 0
                                            ? Math.round((settings.tokenStats.totalSaved / (settings.tokenStats.totalUsed + settings.tokenStats.totalSaved)) * 100) + '%'
                                            : '0%'
                                        }
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="settings-section" style={{ borderTop: '1px solid var(--border-light)', paddingTop: '24px' }}>
                        <h3 style={{ fontSize: '0.9rem', marginBottom: '16px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Informazioni App</h3>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)' }}>
                            <div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Versione</div>
                                <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>{formatVersionDisplay(APP_VERSION)}</div>
                            </div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', textAlign: 'right' }}>
                                <div>Upersite CRM</div>
                                <div>Sistema di gestione clienti</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

        </>
    );
}
