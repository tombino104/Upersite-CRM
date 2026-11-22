import { Component } from 'react';

// Se una schermata va in errore mostra un messaggio invece di una pagina bianca, con il pulsante per ricaricare.
// «Ricarica» dimentica anche l'ultima scheda delle Impostazioni, così un errore in una scheda non si ripresenta all'apertura.
export default class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        console.error('Errore nell\'interfaccia:', error, info?.componentStack);
    }

    reload = () => {
        try {
            for (const key of Object.keys(localStorage)) {
                if (key.toLowerCase().includes('settings') && key.toLowerCase().includes('tab')) localStorage.removeItem(key);
            }
        } catch { /* localStorage non disponibile */ }
        window.location.reload();
    };

    render() {
        if (!this.state.error) return this.props.children;
        const message = String(this.state.error?.message || this.state.error);
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 24 }}>
                <div style={{ maxWidth: 520, width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, textAlign: 'center' }}>
                    <h2 style={{ margin: '0 0 8px', fontSize: '1.15rem' }}>Qualcosa è andato storto</h2>
                    <p style={{ margin: '0 0 16px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        I tuoi dati non sono stati toccati. Ricarica la pagina per continuare; se succede ancora, manda questo messaggio:
                    </p>
                    <code style={{ display: 'block', background: 'var(--bg-input)', borderRadius: 8, padding: '10px 12px', fontSize: '0.8rem', textAlign: 'left', overflowWrap: 'anywhere', marginBottom: 18 }}>
                        {message}
                    </code>
                    <button className="btn btn-primary" onClick={this.reload}>Ricarica</button>
                </div>
            </div>
        );
    }
}
