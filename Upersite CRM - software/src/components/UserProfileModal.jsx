import React, { useState, useRef, useEffect } from 'react';

export default function UserProfileModal({ isOpen, onClose, userProfile, onUpdate }) {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        company: '',
        role: '',
        bio: '',
        preferences: {}
    });
    
    const [previewUrl, setPreviewUrl] = useState('');
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const fileInputRef = useRef(null);

    useEffect(() => {
        if (isOpen && userProfile) {
            setFormData({
                name: userProfile.name || '',
                email: userProfile.email || '',
                phone: userProfile.phone || '',
                company: userProfile.company || '',
                role: userProfile.role || '',
                bio: userProfile.bio || '',
                preferences: userProfile.preferences || {}
            });
            setPreviewUrl(userProfile.photo || '');
            setHasUnsavedChanges(false);
        }
    }, [isOpen, userProfile]);

    const handleInputChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
        setHasUnsavedChanges(true);
    };

    const handlePhotoUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) { // 5MB limit
                alert('La foto non può superare i 5MB');
                return;
            }

            const reader = new FileReader();
            reader.onload = (event) => {
                const base64 = event.target.result;
                setPreviewUrl(base64);
                setFormData(prev => ({ ...prev, photo: base64 }));
                setHasUnsavedChanges(true);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSave = () => {
        const updatedProfile = {
            ...formData,
            photo: previewUrl
        };
        onUpdate(updatedProfile);
        onClose();
    };

    const handleSaveAndClose = () => {
        const updatedProfile = {
            ...formData,
            photo: previewUrl
        };
        onUpdate(updatedProfile);
        setHasUnsavedChanges(false);
        onClose();
    };

    const handleRemovePhoto = () => {
        setPreviewUrl('');
        setFormData(prev => ({ ...prev, photo: '' }));
        setHasUnsavedChanges(true);
    };

    const handleCloseWithConfirm = () => {
        if (hasUnsavedChanges) {
            setShowConfirmDialog(true);
        } else {
            onClose();
        }
    };

    const handleConfirmClose = () => {
        setHasUnsavedChanges(false);
        setShowConfirmDialog(false);
        onClose();
    };

    const handleCancelClose = () => {
        setShowConfirmDialog(false);
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && handleCloseWithConfirm()}>
            <div className="modal-content animate-scale-in" style={{ maxWidth: '600px', padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        👤 Profilo Utente
                    </h2>
                    <button className="btn btn-ghost btn-icon" onClick={handleCloseWithConfirm}>✕</button>
                </div>

                <div style={{ display: 'flex', gap: '24px' }}>
                    {/* Foto Profilo */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                        <div style={{ 
                            width: '120px', 
                            height: '120px', 
                            borderRadius: '50%', 
                            background: previewUrl || 'var(--bg-hover)', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            fontSize: '3rem',
                            color: 'var(--text-tertiary)',
                            overflow: 'hidden',
                            border: '2px solid var(--border-light)'
                        }}>
                            {previewUrl ? (
                                <img 
                                    src={previewUrl} 
                                    alt="Profile" 
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                            ) : (
                                '👤'
                            )}
                        </div>
                        
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handlePhotoUpload}
                            style={{ display: 'none' }}
                        />
                        
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button 
                                className="btn btn-secondary btn-sm"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                📷 Carica Foto
                            </button>
                            {previewUrl && (
                                <button 
                                    className="btn btn-ghost btn-sm"
                                    onClick={handleRemovePhoto}
                                    title="Rimuovi foto"
                                >
                                    🗑️
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Form Dati */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                Nome Completo
                            </label>
                            <input
                                type="text"
                                className="input"
                                value={formData.name}
                                onChange={(e) => handleInputChange('name', e.target.value)}
                                placeholder="Mario Rossi"
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                Email
                            </label>
                            <input
                                type="email"
                                className="input"
                                value={formData.email}
                                onChange={(e) => handleInputChange('email', e.target.value)}
                                placeholder="mario@esempio.com"
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                Telefono
                            </label>
                            <input
                                type="tel"
                                className="input"
                                value={formData.phone}
                                onChange={(e) => handleInputChange('phone', e.target.value)}
                                placeholder="+39 333 1234567"
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                Azienda/Studio
                            </label>
                            <input
                                type="text"
                                className="input"
                                value={formData.company}
                                onChange={(e) => handleInputChange('company', e.target.value)}
                                placeholder="Upersite Studio"
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                Ruolo/Professione
                            </label>
                            <input
                                type="text"
                                className="input"
                                value={formData.role}
                                onChange={(e) => handleInputChange('role', e.target.value)}
                                placeholder="Sviluppatore CRM"
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                Bio
                            </label>
                            <textarea
                                className="input"
                                value={formData.bio}
                                onChange={(e) => handleInputChange('bio', e.target.value)}
                                placeholder="Breve descrizione personale..."
                                rows={3}
                                style={{ resize: 'vertical' }}
                            />
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                    <button className="btn btn-ghost" onClick={handleCloseWithConfirm}>
                        Annulla
                    </button>
                    <button className="btn btn-primary" onClick={handleSaveAndClose}>
                        💾 Salva Profilo
                    </button>
                </div>

                {/* Confirmation Dialog */}
                {showConfirmDialog && (
                    <div className="modal-overlay animate-fade-in" style={{ zIndex: 2100 }} onClick={handleCancelClose}>
                        <div className="modal-content animate-scale-in" style={{ maxWidth: '420px', padding: '28px', borderTop: '4px solid var(--warning)' }} onClick={e => e.stopPropagation()}>
                            <div style={{ fontSize: '2.5rem', textAlign: 'center', marginBottom: '8px' }}>⚠️</div>
                            <h3 style={{ textAlign: 'center', color: 'var(--warning)', margin: '0 0 12px 0', fontSize: '1.05rem' }}>
                                Abbandonare le modifiche?
                            </h3>
                            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5, margin: '0 0 20px 0' }}>
                                Ci sono modifiche non salvate. Sei sicuro di voler chiudere senza salvare?
                            </p>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                <button className="btn btn-secondary" onClick={handleCancelClose}>
                                    Annulla
                                </button>
                                <button className="btn btn-warning" onClick={handleConfirmClose}>
                                    Abbandona modifiche
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
