import { useState } from 'react';
import { hasMasterPassword, getMasterPassword, setMasterPassword, resetMasterPassword } from '../utils/storage';

export default function Login({ onLogin }) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isSetup, setIsSetup] = useState(!hasMasterPassword());
    const [confirmPassword, setConfirmPassword] = useState('');
    const [shake, setShake] = useState(false);
    const [showReset, setShowReset] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (isSetup) {
            if (password.length < 4) {
                setError('La password deve avere almeno 4 caratteri');
                triggerShake();
                return;
            }
            if (password !== confirmPassword) {
                setError('Le password non corrispondono');
                triggerShake();
                return;
            }
            setMasterPassword(password);
            onLogin();
        } else {
            if (password === getMasterPassword()) {
                onLogin();
            } else {
                setError('Password errata');
                triggerShake();
            }
        }
    };

    const handleReset = () => {
        resetMasterPassword();
        setIsSetup(true);
        setPassword('');
        setConfirmPassword('');
        setError('');
        setShowReset(false);
    };

    const triggerShake = () => {
        setShake(true);
        setTimeout(() => setShake(false), 600);
    };

    return (
        <div className="login-screen">
            <div className="login-bg-orb login-bg-orb-1" />
            <div className="login-bg-orb login-bg-orb-2" />
            <div className="login-bg-orb login-bg-orb-3" />

            <div className={`login-card ${shake ? 'login-shake' : ''}`}>
                <div className="login-logo">
                    <div className="login-logo-icon">U</div>
                    <h1 className="login-title">Upersite CRM</h1>
                    <p className="login-subtitle">
                        {isSetup ? 'Crea la tua password master' : 'Inserisci la password per accedere'}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="login-form">
                    <div className="login-field">
                        <label className="input-label">Password</label>
                        <input
                            type="password"
                            className="input login-input"
                            value={password}
                            onChange={e => { setPassword(e.target.value); setError(''); }}
                            placeholder="••••••••"
                            autoFocus
                        />
                    </div>

                    {isSetup && (
                        <div className="login-field animate-fade-in-up">
                            <label className="input-label">Conferma Password</label>
                            <input
                                type="password"
                                className="input login-input"
                                value={confirmPassword}
                                onChange={e => { setConfirmPassword(e.target.value); setError(''); }}
                                placeholder="••••••••"
                            />
                        </div>
                    )}

                    {error && (
                        <div className="login-error animate-fade-in-up">
                            <span>⚠</span> {error}
                        </div>
                    )}

                    <button type="submit" className="btn btn-primary login-btn">
                        {isSetup ? 'Crea Password' : 'Accedi'}
                        <span className="login-btn-arrow">→</span>
                    </button>
                </form>

                {!isSetup && (
                    <div className="login-reset-section">
                        {showReset ? (
                            <div className="login-reset-confirm animate-fade-in-up">
                                <p className="login-reset-warning">⚠️ Questo resetterà la password. I dati dei clienti saranno mantenuti.</p>
                                <div className="login-reset-buttons">
                                    <button className="btn btn-danger btn-sm" onClick={handleReset}>Conferma Reset</button>
                                    <button className="btn btn-ghost btn-sm" onClick={() => setShowReset(false)}>Annulla</button>
                                </div>
                            </div>
                        ) : (
                            <button className="login-reset-btn" onClick={() => setShowReset(true)}>
                                Password dimenticata?
                            </button>
                        )}
                    </div>
                )}
            </div>

            <style>{`
        .login-screen {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #F8F9FC 0%, #EDE7F6 50%, #F0F4FF 100%);
          position: relative;
          overflow: hidden;
        }

        .login-bg-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.5;
          animation: floatOrb 8s ease-in-out infinite;
        }

        .login-bg-orb-1 {
          width: 400px; height: 400px;
          background: rgba(108, 92, 231, 0.15);
          top: -100px; right: -100px;
          animation-delay: 0s;
        }
        .login-bg-orb-2 {
          width: 300px; height: 300px;
          background: rgba(0, 206, 201, 0.12);
          bottom: -80px; left: -80px;
          animation-delay: -3s;
        }
        .login-bg-orb-3 {
          width: 200px; height: 200px;
          background: rgba(108, 92, 231, 0.1);
          top: 50%; left: 50%;
          animation-delay: -5s;
        }

        @keyframes floatOrb {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -30px) scale(1.05); }
          66% { transform: translate(-20px, 20px) scale(0.95); }
        }

        .login-card {
          background: rgba(255,255,255,0.85);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.8);
          border-radius: var(--radius-2xl);
          padding: 48px 40px;
          width: 100%;
          max-width: 420px;
          box-shadow: 0 20px 60px rgba(108, 92, 231, 0.08), 0 1px 3px rgba(0,0,0,0.04);
          animation: fadeInScale 0.6s var(--ease-spring);
          position: relative;
          z-index: 1;
        }

        .login-shake { animation: shake 0.5s var(--ease-out); }

        .login-logo { text-align: center; margin-bottom: 32px; }

        .login-logo-icon {
          width: 64px; height: 64px;
          background: linear-gradient(135deg, var(--primary), var(--primary-dark));
          color: white;
          border-radius: var(--radius-lg);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 1.75rem;
          font-weight: 800;
          margin-bottom: 16px;
          box-shadow: 0 8px 24px rgba(108, 92, 231, 0.3);
        }

        .login-title { font-size: 1.5rem; font-weight: 800; color: var(--text-primary); margin-bottom: 4px; }
        .login-subtitle { font-size: 0.875rem; color: var(--text-secondary); }
        .login-form { display: flex; flex-direction: column; gap: 16px; }
        .login-field { display: flex; flex-direction: column; }

        .login-input {
          padding: 14px 16px;
          font-size: 1rem;
          border-radius: var(--radius-md);
          background: rgba(244, 245, 249, 0.8);
        }

        .login-error {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          background: var(--danger-bg);
          color: var(--danger);
          border-radius: var(--radius-md);
          font-size: 0.8125rem;
          font-weight: 500;
        }

        .login-btn {
          margin-top: 8px; padding: 14px;
          font-size: 1rem; border-radius: var(--radius-md);
        }

        .login-btn-arrow { transition: transform var(--duration-normal) var(--ease-out); }
        .login-btn:hover .login-btn-arrow { transform: translateX(4px); }

        .login-reset-section {
          margin-top: 20px;
          text-align: center;
        }

        .login-reset-btn {
          border: none;
          background: none;
          color: var(--text-tertiary);
          font-family: var(--font);
          font-size: 0.8125rem;
          cursor: pointer;
          transition: color var(--duration-fast);
        }

        .login-reset-btn:hover {
          color: var(--primary);
        }

        .login-reset-confirm {
          padding: 14px;
          background: var(--danger-bg);
          border-radius: var(--radius-md);
        }

        .login-reset-warning {
          font-size: 0.8125rem;
          color: var(--danger);
          margin-bottom: 12px;
        }

        .login-reset-buttons {
          display: flex;
          gap: 8px;
          justify-content: center;
        }
      `}</style>
        </div>
    );
}
