// Utilità per il versioning dell'applicazione

export const APP_VERSION = '1.13.0-stable';

export const VERSION_TYPES = {
  MAJOR: 'major',
  MINOR: 'minor', 
  PATCH: 'patch',
  ALPHA: 'alpha',
  BETA: 'beta',
  STABLE: 'stable'
};

export const getVersionInfo = () => {
  const [version, type = 'stable'] = APP_VERSION.split('-');
  const [major, minor, patch] = version.split('.').map(Number);
  
  return {
    full: APP_VERSION,
    version,
    type,
    major,
    minor,
    patch,
    isStable: type === 'stable',
    isPreRelease: type !== 'stable',
    display: `v${APP_VERSION}`
  };
};

export const formatVersionDisplay = (version = APP_VERSION) => {
  const info = getVersionInfo(version);
  
  let badge = '';
  if (info.isStable) {
    badge = '🟢';
  } else if (info.type === 'beta') {
    badge = '🟡';
  } else if (info.type === 'alpha') {
    badge = '🔴';
  }
  
  return `${badge} v${info.full}`;
};

export const copyVersionToClipboard = async (version = APP_VERSION) => {
  try {
    await navigator.clipboard.writeText(`Upersite CRM v${version}`);
    return true;
  } catch (error) {
    console.error('Errore nella copia della versione:', error);
    return false;
  }
};

// Funzioni per il versioning automatico
export const getNextVersion = (currentVersion = APP_VERSION, type = VERSION_TYPES.PATCH) => {
  const [version] = currentVersion.split('-');
  const [major, minor, patch] = version.split('.').map(Number);
  
  switch (type) {
    case VERSION_TYPES.MAJOR:
      return `${major + 1}.0.0-stable`;
    case VERSION_TYPES.MINOR:
      return `${major}.${minor + 1}.0-stable`;
    case VERSION_TYPES.PATCH:
      return `${major}.${minor}.${patch + 1}-stable`;
    case VERSION_TYPES.ALPHA:
      return `${major}.${minor}.${patch + 1}-alpha`;
    case VERSION_TYPES.BETA:
      return `${major}.${minor}.${patch + 1}-beta`;
    default:
      return currentVersion;
  }
};

// Validazione versione SemVer
export const isValidSemVer = (version) => {
  const semVerRegex = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|stable)(?:\.[1-9]\d*)?)?$/;
  return semVerRegex.test(version);
};
