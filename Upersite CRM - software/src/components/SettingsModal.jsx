import { useMemo, useState, useEffect, useRef } from 'react';
import { getMasterPassword, verifyMasterPassword, setMasterPassword, exportData, importData, formatBytes, getStorageInfo } from '../utils/storage';
import { reencryptCredentials } from '../utils/credentialVault';
import FolderPicker from './FolderPicker';
import { APP_VERSION, formatVersionDisplay } from '../utils/version';
import AISettingsSection from './AISettingsSection';
import CalculatorSettings from './CalculatorSettings';
import DockSettings from './DockSettings';
import RestoreModal from './RestoreModal';
import ManualModal from './ManualModal';

// Schede delle Impostazioni: una sezione alla volta invece di un'unica pagina lunga
const SETTINGS_TABS = [
    { id: 'general', icon: '🏠', label: 'Generale', description: 'Preferenze, manuale, versione' },
    { id: 'security', icon: '🔐', label: 'Sicurezza', description: 'Password master' },
    { id: 'backup', icon: '💾', label: 'Backup e dati', description: 'Backup, ripristino, import/export' },
    { id: 'calculator', icon: '🧮', label: 'Calcolatore', description: 'Listino e salvataggi' },
    { id: 'dock', icon: '🔘', label: 'Pulsanti', description: 'Ordine e menu ⋯' },
    { id: 'ai', icon: '🤖', label: 'Intelligenza artificiale', description: 'Servizi, modelli, token e costi' }
];

// Sotto-sezioni della scheda Intelligenza artificiale
const AI_SUBTABS = [
    { id: 'purposes', label: 'Quale IA per cosa' },
    { id: 'services', label: 'Servizi e chiavi' },
    { id: 'models', label: 'Modelli locali' },
    { id: 'chatData', label: 'Dati inviati alla chat' },
    { id: 'usage', label: 'Consumo e costi' }
];

const SETTINGS_TAB_STORAGE_KEY = 'upersite_settings_tab';

const SETTINGS_CSS = `
    .settings-modal {
        max-width: 1000px;
        width: 95%;
        height: min(88vh, 860px);
        padding: 0 !important;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }
    .settings-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 18px 24px;
        border-bottom: 1px solid var(--border-light);
        flex-shrink: 0;
    }
    .settings-body {
        display: flex;
        flex: 1;
        min-height: 0;
    }
    .settings-nav {
        width: 230px;
        flex-shrink: 0;
        padding: 14px 10px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        overflow-y: auto;
        background: var(--bg-hover);
        border-right: 1px solid var(--border-light);
    }
    .settings-nav-item {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 10px 12px;
        border: none;
        border-radius: var(--radius-md);
        background: transparent;
        color: var(--text-secondary);
        font: inherit;
        text-align: left;
        cursor: pointer;
        transition: background 0.15s, color 0.15s;
    }
    .settings-nav-item:hover {
        background: var(--bg-card);
        color: var(--text-primary);
    }
    .settings-nav-item.active {
        background: var(--bg-card);
        color: var(--primary);
        box-shadow: var(--shadow-sm);
    }
    .settings-nav-item:focus-visible {
        outline: 2px solid var(--primary-light);
        outline-offset: 1px;
    }
    .settings-nav-icon {
        font-size: 1.15rem;
        flex-shrink: 0;
    }
    .settings-nav-text {
        display: flex;
        flex-direction: column;
        min-width: 0;
    }
    .settings-nav-label {
        font-weight: 600;
        font-size: 0.88rem;
    }
    .settings-nav-text small {
        font-size: 0.7rem;
        color: var(--text-tertiary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .places-box { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--bg-input); font-size: 0.78rem; }
    .places-box > strong { font-size: 0.8rem; color: var(--text-primary); }
    .place-row { display: flex; flex-direction: column; gap: 2px; }
    .place-label { color: var(--text-tertiary); font-size: 0.72rem; }
    .place-row code { font-size: 0.78rem; overflow-wrap: anywhere; color: var(--text-primary); }
    .place-hint { color: var(--text-secondary); font-size: 0.74rem; }
    .place-status { font-size: 0.74rem; font-weight: 600; }
    .place-status.ok { color: var(--success); }
    .place-status.ko, .places-problem { color: var(--danger); font-weight: 600; }
    .settings-subnav {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        margin-bottom: 18px;
        padding: 4px;
        background: var(--bg-hover);
        border-radius: var(--radius-md);
        width: fit-content;
        max-width: 100%;
    }
    .settings-subnav-item {
        border: none;
        background: transparent;
        color: var(--text-secondary);
        font: inherit;
        font-size: 0.82rem;
        font-weight: 600;
        padding: 7px 14px;
        border-radius: var(--radius-sm);
        cursor: pointer;
    }
    .settings-subnav-item:hover {
        color: var(--text-primary);
    }
    .settings-subnav-item.active {
        background: var(--bg-card);
        color: var(--primary);
        box-shadow: var(--shadow-xs);
    }
    .settings-panel {
        flex: 1;
        min-width: 0;
        overflow-y: auto;
        padding: 24px 28px;
    }
    @media (max-width: 760px) {
        .settings-body {
            flex-direction: column;
        }
        .settings-nav {
            width: auto;
            flex-direction: row;
            overflow-x: auto;
            overflow-y: hidden;
            border-right: none;
            border-bottom: 1px solid var(--border-light);
            padding: 8px;
        }
        .settings-nav-item {
            width: auto;
            flex-shrink: 0;
            padding: 8px 12px;
        }
        .settings-nav-text small {
            display: none;
        }
        .settings-panel {
            padding: 18px 16px;
        }
    }
`;

function readStoredTab() {
    try {
        const saved = localStorage.getItem(SETTINGS_TAB_STORAGE_KEY);
        return SETTINGS_TABS.some(t => t.id === saved) ? saved : 'general';
    } catch {
        return 'general';
    }
}

function PlaceRow({ label, place, status }) {
    if (!place) return null;
    return (
        <div className="place-row">
            <span className="place-label">{label}</span>
            <code>{place.path || '—'}</code>
            {place.hint && <span className="place-hint">Sul server: <strong>{place.hint}</strong></span>}
            {status && place.path && <span className={`place-status ${place.ok ? 'ok' : 'ko'}`}>{place.ok ? '✓ esiste e si può scrivere' : '✗ non utilizzabile'}</span>}
        </div>
    );
}

export default function SettingsModal({ settings, updateSettings, onClose, setCustomers, customers }) {
    // Scheda aperta: si ricorda l'ultima usata
    const [tab, setTab] = useState(readStoredTab);
    const panelRef = useRef(null);
    const selectTab = (id) => {
        setTab(id);
        if (panelRef.current) panelRef.current.scrollTop = 0;
        try {
            localStorage.setItem(SETTINGS_TAB_STORAGE_KEY, id);
        } catch {
            // localStorage non disponibile: si riparte da Generale
        }
    };
    const [backupError, setBackupError] = useState('');
    const [aiView, setAiView] = useState('purposes');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [showFolderPicker, setShowFolderPicker] = useState(false);
    const [backupSuccess, setBackupSuccess] = useState('');
    const [importSuccess, setImportSuccess] = useState('');
    const [realSize, setRealSize] = useState(null);
    // Dove sono davvero i file (letto dal server) e se la cartella dei backup funziona
    const [places, setPlaces] = useState(null);
    const loadPlaces = () => getStorageInfo().then(info => setPlaces(info?.places || null));

    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [showRestore, setShowRestore] = useState(false);
    const [showManual, setShowManual] = useState(false);
    const [clearPassword, setClearPassword] = useState('');
    const [clearError, setClearError] = useState('');
    const [isClearing, setIsClearing] = useState(false);

    useEffect(() => {
        getStorageInfo().then(info => {
            if (info && info.size) setRealSize(info.size);
            setPlaces(info?.places || null);
        });
    }, []);

    // Cambiando cartella il salvataggio sul server parte dopo un attimo: poi si ricontrolla
    useEffect(() => {
        const timer = setTimeout(() => { getStorageInfo().then(info => setPlaces(info?.places || null)); }, 2500);
        return () => clearTimeout(timer);
    }, [settings.backupPath]);

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
                <div className="modal-content animate-scale-in settings-modal" role="dialog" aria-modal="true" aria-label="Impostazioni">
                    <div className="settings-header">
                        <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700 }}>⚙️ Impostazioni</h2>
                        <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Chiudi">✕</button>
                    </div>

                    <div className="settings-body">
                        <nav className="settings-nav" role="tablist" aria-label="Sezioni delle impostazioni" aria-orientation="vertical">
                            {SETTINGS_TABS.map(t => (
                                <button
                                    key={t.id}
                                    type="button"
                                    role="tab"
                                    id={`settings-tab-${t.id}`}
                                    aria-selected={tab === t.id}
                                    aria-controls="settings-panel"
                                    className={`settings-nav-item${tab === t.id ? ' active' : ''}`}
                                    onClick={() => selectTab(t.id)}
                                >
                                    <span className="settings-nav-icon" aria-hidden="true">{t.icon}</span>
                                    <span className="settings-nav-text">
                                        <span className="settings-nav-label">{t.label}</span>
                                        <small>{t.description}</small>
                                    </span>
                                </button>
                            ))}
                        </nav>

                        <div className="settings-panel" id="settings-panel" role="tabpanel" aria-labelledby={`settings-tab-${tab}`} ref={panelRef}>
                            {tab === 'general' && (
                                <>
                            <button onClick={() => setShowManual(true)} style={{
                                width: '100%', display: 'flex', alignItems: 'center', gap: '14px', textAlign: 'left', cursor: 'pointer',
                                padding: '16px 18px', marginBottom: '28px', borderRadius: 'var(--radius-lg)', font: 'inherit',
                                border: '1px solid rgba(31, 107, 79,0.18)', background: 'var(--primary-ghost)',
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
                                </>
                            )}

                            {tab === 'security' && (
                                <>
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
                                </>
                            )}

                            {tab === 'backup' && (
                                <>
                            {/* Backup Section */}
                            <div className="settings-section" style={{ marginBottom: '32px' }}>
                                <h3 style={{ fontSize: '0.9rem', marginBottom: '16px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Backup Dati</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    <div className="detail-group">
                                        <label className="input-label">Percorso Backup Automatico</label>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <input type="text" className="input" style={{ flex: 1 }}
                                                value={settings.backupPath || ''}
                                                onChange={e => updateSettings({ backupPath: e.target.value })}
                                                placeholder="/backups" />
                                            <button type="button" className="btn btn-secondary" onClick={() => setShowFolderPicker(true)}>Sfoglia…</button>
                                        </div>
                                        {showFolderPicker && (
                                            <FolderPicker
                                                initialPath={settings.backupPath || ''}
                                                onClose={() => setShowFolderPicker(false)}
                                                onSelect={p => { updateSettings({ backupPath: p }); setShowFolderPicker(false); }}
                                            />
                                        )}
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Con «Sfoglia…» scegli una cartella che esiste già sul server (o ne crei una nuova); su Umbrel puoi anche collegarne una tua dalle impostazioni dell'app: compare in <strong>/cartelle</strong>. Ogni backup crea la sua cartella (data e ora), con dentro il file dati e una copia di <strong>Preventivi</strong> e <strong>Calcolatore</strong>.</span>
                                    </div>

                                    {places && (
                                        <div className="places-box">
                                            <strong>Dove si trovano i tuoi file (letto dal server)</strong>
                                            <PlaceRow label="Dati del CRM" place={places.dataFile} />
                                            <PlaceRow label="Preventivi e calcolatore (originali)" place={places.filesDir} />
                                            <PlaceRow label="Cartella dei backup" place={places.backup} status />
                                            {places.backup && !places.backup.ok && places.backup.problem && (
                                                <div className="places-problem">⚠️ {places.backup.problem}</div>
                                            )}
                                        </div>
                                    )}

                                    <button className="btn btn-primary"
                                        onClick={async () => {
                                            setBackupSuccess('');
                                            setBackupError('');
                                            if (!settings.backupPath) {
                                                setBackupError('Specifica prima un percorso di backup');
                                                return;
                                            }
                                            try {
                                                const { triggerAutoBackup } = await import('../utils/storage');
                                                const result = await triggerAutoBackup();
                                                if (result.success) {
                                                    const where = result.path ? `${result.path}${result.path.includes('\\') ? '\\' : '/'}${result.file || ''}` : `${result.folder}/${result.file || ''}`;
                                                    setBackupSuccess(`Backup salvato e verificato sul disco: ${where}${result.hint ? ` (sul server: ${result.hint})` : ''}${result.dataFiles ? ` · ${result.dataFiles} file (preventivi e calcolatore)` : ''}${result.quotesMissing ? ` · ${result.quotesMissing} preventivi non trovati` : ''}`);
                                                    loadPlaces();
                                                } else {
                                                    setBackupError(`Errore backup: ${result.error}`);
                                                }
                                            } catch {
                                                setBackupError('Errore di sistema durante il backup');
                                            }
                                        }}
                                        style={{ width: '100%', justifyContent: 'center', background: 'var(--primary)', color: 'white' }}>
                                        💾 Crea Backup Ora
                                    </button>

                                    {backupSuccess && <div style={{ color: 'var(--success)', fontSize: '0.8rem', fontWeight: 600, marginTop: '8px', textAlign: 'center' }}>✅ {backupSuccess}</div>}
                                    {backupError && <div style={{ color: 'var(--danger)', fontSize: '0.8rem', fontWeight: 600, marginTop: '8px', textAlign: 'center' }}>⚠️ {backupError}</div>}

                                    <button className="btn btn-secondary" onClick={() => setShowRestore(true)} style={{ width: '100%', justifyContent: 'center' }}>
                                        ♻️ Ripristina da un backup…
                                    </button>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '-8px' }}>
                                        Da un backup salvato qui o da una cartella del tuo computer (anche non zippata, da Mac o Windows). Tutto (dati, preventivi, calcolatore) o solo alcuni clienti. Prima di ripristinare viene salvato lo stato attuale.
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
                                </>
                            )}

                            {tab === 'calculator' && (
                                <>
                            <CalculatorSettings settings={settings} updateSettings={updateSettings} />
                                </>
                            )}

                            {tab === 'dock' && (
                                <DockSettings settings={settings} updateSettings={updateSettings} />
                            )}

                            {tab === 'ai' && (
                                <>
                            <div className="settings-subnav" role="tablist" aria-label="Sezioni dell'intelligenza artificiale">
                                {AI_SUBTABS.map(s => (
                                    <button
                                        key={s.id}
                                        type="button"
                                        role="tab"
                                        aria-selected={aiView === s.id}
                                        className={`settings-subnav-item${aiView === s.id ? ' active' : ''}`}
                                        onClick={() => setAiView(s.id)}
                                    >
                                        {s.label}
                                    </button>
                                ))}
                            </div>

                            <AISettingsSection settings={settings} updateSettings={updateSettings} view={aiView} customers={customers} />
                                </>
                            )}
                        </div>
                    </div>

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
                </div>
            </div>

            <style>{SETTINGS_CSS}</style>
        </>
    );
}
