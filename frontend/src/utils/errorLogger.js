/**
 * errorLogger.js - Module de collecte et journalisation des erreurs frontend
 * Tampon circulaire d'erreurs (console.error, console.warn, window.error, unhandledrejection, app-error)
 * Génération automatique de rapport diagnostique pour le Bug Reporter.
 */

const MAX_LOGS = 60;
const errorBuffer = [];
let isInitialized = false;

function addLogEntry(entry) {
  const logItem = {
    timestamp: new Date().toISOString(),
    ...entry,
  };
  errorBuffer.push(logItem);
  if (errorBuffer.length > MAX_LOGS) {
    errorBuffer.shift();
  }
}

/**
 * Initialise les écouteurs d'erreurs et remplace console.error / console.warn
 */
export function initErrorLogger() {
  if (isInitialized || typeof window === 'undefined') return;
  isInitialized = true;

  // Interception de console.error
  const originalConsoleError = console.error;
  console.error = (...args) => {
    try {
      const message = args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg, getCircularReplacer()) : String(arg))).join(' ');
      addLogEntry({
        type: 'console.error',
        message,
      });
    } catch (_) {}
    originalConsoleError.apply(console, args);
  };

  // Interception de console.warn
  const originalConsoleWarn = console.warn;
  console.warn = (...args) => {
    try {
      const message = args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg, getCircularReplacer()) : String(arg))).join(' ');
      addLogEntry({
        type: 'console.warn',
        message,
      });
    } catch (_) {}
    originalConsoleWarn.apply(console, args);
  };

  // Erreurs JS globales
  window.addEventListener('error', (event) => {
    try {
      addLogEntry({
        type: 'window.onerror',
        message: event.message || 'Erreur JavaScript non spécifiée',
        filename: event.filename || '',
        lineno: event.lineno || 0,
        colno: event.colno || 0,
        stack: event.error?.stack || '',
      });
    } catch (_) {}
  });

  // Rejets de promesses non gérés
  window.addEventListener('unhandledrejection', (event) => {
    try {
      const reason = event.reason;
      addLogEntry({
        type: 'unhandledrejection',
        message: typeof reason === 'object' ? (reason?.message || JSON.stringify(reason, getCircularReplacer())) : String(reason),
        stack: reason?.stack || '',
      });
    } catch (_) {}
  });

  // Événements d'erreurs réseau et API applicatives (emitAppError)
  window.addEventListener('app-error', (event) => {
    try {
      const detail = event.detail || {};
      addLogEntry({
        type: 'app-error',
        message: `[API ${detail.method || 'GET'} ${detail.url || ''}] HTTP ${detail.status}: ${detail.message || ''}`,
        apiDetail: detail,
      });
    } catch (_) {}
  });
}

function getCircularReplacer() {
  const seen = new WeakSet();
  return (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    return value;
  };
}

/**
 * Récupère les logs actuels
 */
export function getErrorLogs() {
  return [...errorBuffer];
}

/**
 * Génère un rapport diagnostique complet au format texte/markdown
 */
export function generateDiagnosticReport() {
  const now = new Date();
  let currentUser = 'Non connecté';
  try {
    currentUser = localStorage.getItem('sci_user') || 'Non connecté';
  } catch (_) {}

  const url = typeof window !== 'undefined' ? window.location.href : 'Inconnu';
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'Inconnu';
  const screenSize = typeof window !== 'undefined' && window.screen 
    ? `${window.screen.width}x${window.screen.height} (Fenêtre: ${window.innerWidth}x${window.innerHeight})`
    : 'Inconnu';

  let report = `# RAPPORT DE DIAGNOSTIC TECHNIQUE - SCI FAMILLE\n`;
  report += `Généré le : ${now.toISOString()} (${now.toLocaleString('fr-FR')})\n`;
  report += `--------------------------------------------------\n\n`;

  report += `## ENVIRONNEMENT\n`;
  report += `- Utilisateur actif : ${currentUser}\n`;
  report += `- URL courante : ${url}\n`;
  report += `- Écran / Fenêtre : ${screenSize}\n`;
  report += `- Navigateur (User Agent) : ${userAgent}\n\n`;

  report += `## DERNIERS ÉVÉNEMENTS & ERREURS CONSOLE (${errorBuffer.length})\n`;
  if (errorBuffer.length === 0) {
    report += `Aucune erreur ou avertissement enregistré dans la session courante.\n`;
  } else {
    errorBuffer.forEach((log, index) => {
      report += `[${index + 1}] [${log.timestamp}] [${log.type.toUpperCase()}]\n`;
      report += `    Message : ${log.message}\n`;
      if (log.filename) {
        report += `    Fichier : ${log.filename}:${log.lineno}:${log.colno}\n`;
      }
      if (log.stack) {
        report += `    Stack :\n${log.stack.split('\n').map(l => '      ' + l).join('\n')}\n`;
      }
      report += `\n`;
    });
  }

  report += `--------------------------------------------------\n`;
  report += `Fin du rapport diagnostique.\n`;

  return report;
}
