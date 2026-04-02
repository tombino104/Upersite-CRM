# Sistema di Versioning - Upersite CRM

## Versione Attuale
**v1.2.0-stable**

## Semantic Versioning (SemVer)

Utilizziamo il standard Semantic Versioning con il formato: `Major.Minor.Patch-Type`

### Tipi di Versione

- **Major (es. 2.0.0)**: Cambiamenti drastici, nuove funzionalità che non sono retrocompatibili
- **Minor (es. 1.5.0)**: Nuove funzionalità aggiunte in modo retrocompatibile  
- **Patch (es. 1.5.1)**: Correzione di bug e miglioramenti senza nuove funzionalità

### Stati di Release

- **stable**: Versione stabile per produzione (🟢)
- **beta**: Versione in test per utenti selezionati (🟡)
- **alpha**: Versione in sviluppo interno (🔴)

## Script di Versioning

Nel package.json sono disponibili questi script:

```bash
# Aggiorna patch (bugfix)
npm run version:patch

# Aggiorna minor (nuove funzionalità retrocompatibili)
npm run version:minor

# Aggiorna major (cambiamenti non retrocompatibili)
npm run version:major

# Crea versione alpha
npm run version:alpha

# Crea versione beta
npm run version:beta

# Imposta come stable
npm run version:stable
```

## Utilizzo nell'Applicazione

La versione è visibile in basso a sinistra dell'app con:
- Badge colorato secondo lo stato (🟢 stable, 🟡 beta, 🔴 alpha)
- Click per copiare la versione negli appunti
- Feedback visivo al click

## Struttura del Codice

- `package.json`: Versione ufficiale dell'app
- `src/utils/version.js`: Utilità per il versioning
- `src/App.jsx`: Visualizzazione della versione nell'interfaccia

## Linee Guida per il Versioning

### Quando usare Major:
- Rimozione di funzionalità esistenti
- Cambiamenti al database che richiedono migrazione
- Modifiche all'API che non sono retrocompatibili
- Cambiamenti architetturali importanti

### Quando usare Minor:
- Nuove funzionalità aggiunte
- Miglioramenti significativi esistenti
- Nuovi componenti o sezioni
- Integrazioni con nuovi servizi

### Quando usare Patch:
- Correzione di bug
- Miglioramenti delle prestazioni
- Fix di sicurezza
- Piccoli miglioramenti UI/UX

### Stati di Release:
- **alpha**: Sviluppo iniziale, funzionalità incomplete
- **beta**: Funzionalità complete, testing con utenti reali
- **stable**: Pronta per produzione, stabile e testata

## Esempi di Versionamento

```
1.2.0-stable  →  1.2.1-stable  (bugfix)
1.2.0-stable  →  1.3.0-stable  (nuove funzionalità)
1.2.0-stable  →  2.0.0-stable  (cambiamenti drastici)
1.2.0-stable  →  1.3.0-alpha   (sviluppo nuove funzionalità)
1.3.0-alpha   →  1.3.0-beta    (test con utenti)
1.3.0-beta    →  1.3.0-stable  (release produzione)
```

## Note Importanti

1. **Sincronizzazione**: La versione in `src/utils/version.js` deve sempre corrispondere a quella in `package.json`
2. **Backup**: Prima di major version, creare un backup completo
3. **Testing**: Le versioni beta e alpha devono essere testate accuratamente
4. **Documentazione**: Documentare sempre i cambiamenti in ogni release
