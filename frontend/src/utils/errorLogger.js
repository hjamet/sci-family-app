/**
 * errorLogger.js - Module de collecte et journalisation persistante des erreurs frontend
 * - Tampon circulaire local (pour le Bug Reporter)
 * - Persistance automatique en base PostgreSQL via POST /api/error-logs/client
 *   (console.error, window.onerror, unhandledrejection, app-error, reportClientError)
 */

const MAX_LOGS = 60;
const errorBuffer = [];
let isInitialized = false;
const recentReportTimestamps = new Map();
const DEDUP_WINDOW_MS = 5000;

function getAuthTokenAndUser() {
  let token = null;
  let memberName = null;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      token = window.localStorage.getItem('sci_token');
      const rawUser = window.localStorage.getItem('sci_user');
      if (rawUser) {
        try {
          const parsed = JSON.parse(rawUser);
          memberName = parsed?.name || parsed?.prenom || rawUser;
        } catch (_) {
          memberName = rawUser;
        }
      }
    }
  } catch (_) {}
  return { token, memberName };
}

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
 * Envoie une erreur applicative/client au backend pour persistance dans `app_error_logs`.
 * Protégé contre les boucles infinies et dédupliqué sur 5s.
 */
export function reportClientError({
  source = 'frontend_error',
  severity = 'error',
  message = 'Erreur client non spécifiée',
  errorType = null,
  stackTrace = null,
  endpoint = null,
  httpMethod = null,
  statusCode = null,
  context = null,
} = {}) {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return;
  const msgStr = String(message || '').trim();
  if (!msgStr) return;

  // Garde-fou anti-boucle : ne jamais re-journaliser une erreur issue de /api/error-logs
  const epStr = String(endpoint || '');
  if (epStr.includes('/api/error-logs') || msgStr.includes('/api/error-logs')) {
    return;
  }

  const dedupKey = `${source}|${statusCode || ''}|${epStr}|${msgStr.slice(0, 180)}`;
  const now = Date.now();
  const prevTs = recentReportTimestamps.get(dedupKey) || 0;
  if (now - prevTs < DEDUP_WINDOW_MS) {
    return;
  }
  recentReportTimestamps.set(dedupKey, now);
  if (recentReportTimestamps.size > 100) {
    const oldestKey = recentReportTimestamps.keys().next().value;
    if (oldestKey) recentReportTimestamps.delete(oldestKey);
  }

  const { token, memberName } = getAuthTokenAndUser();
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const body = {
    source: String(source || 'frontend_error').slice(0, 60),
    severity: String(severity || 'error').slice(0, 20),
    message: msgStr.slice(0, 4000),
    error_type: errorType ? String(errorType).slice(0, 120) : null,
    stack_trace: stackTrace ? String(stackTrace).slice(0, 12000) : null,
    endpoint: endpoint ? String(endpoint).slice(0, 255) : null,
    http_method: httpMethod ? String(httpMethod).slice(0, 16) : null,
    status_code: Number.isFinite(Number(statusCode)) ? Number(statusCode) : null,
    page_url: window.location?.href ? String(window.location.href).slice(0, 500) : null,
    member_name: memberName ? String(memberName).slice(0, 120) : null,
    context: context && typeof context === 'object' ? context : null,
  };

  try {
    fetch('/api/error-logs/client', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  } catch (_) {}
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
      const message = args
        .map((arg) =>
          arg instanceof Error
            ? `${arg.name}: ${arg.message}`
            : typeof arg === 'object'
            ? JSON.stringify(arg, getCircularReplacer())
            : String(arg)
        )
        .join(' ');
      const errObj = args.find((a) => a instanceof Error);
      addLogEntry({
        type: 'console.error',
        message,
        stack: errObj?.stack || '',
      });
      // Persister en BDD sauf bruit React dev/hydration non critique
      if (message && !message.includes('Download the React DevTools') && !message.includes('/api/error-logs')) {
        reportClientError({
          source: 'frontend_console_error',
          severity: 'error',
          message,
          errorType: errObj?.name || 'ConsoleError',
          stackTrace: errObj?.stack || null,
        });
      }
    } catch (_) {}
    originalConsoleError.apply(console, args);
  };

  // Interception de console.warn
  const originalConsoleWarn = console.warn;
  console.warn = (...args) => {
    try {
      const message = args
        .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg, getCircularReplacer()) : String(arg)))
        .join(' ');
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
      const msg = event.message || 'Erreur JavaScript non spécifiée';
      const stack = event.error?.stack || `${event.filename || ''}:${event.lineno || 0}:${event.colno || 0}`;
      addLogEntry({
        type: 'window.onerror',
        message: msg,
        filename: event.filename || '',
        lineno: event.lineno || 0,
        colno: event.colno || 0,
        stack,
      });
      reportClientError({
        source: 'frontend_error',
        severity: 'critical',
        message: msg,
        errorType: event.error?.name || 'Error',
        stackTrace: stack,
        context: { filename: event.filename, lineno: event.lineno, colno: event.colno },
      });
    } catch (_) {}
  });

  // Rejets de promesses non gérés
  window.addEventListener('unhandledrejection', (event) => {
    try {
      const reason = event.reason;
      const msg =
        typeof reason === 'object'
          ? reason?.message || JSON.stringify(reason, getCircularReplacer())
          : String(reason);
      const stack = reason?.stack || '';
      addLogEntry({
        type: 'unhandledrejection',
        message: msg,
        stack,
      });
      reportClientError({
        source: 'frontend_unhandled_rejection',
        severity: 'error',
        message: msg,
        errorType: reason?.name || 'UnhandledRejection',
        stackTrace: stack || null,
      });
    } catch (_) {}
  });

  // Événements d'erreurs réseau et API applicatives (emitAppError)
  window.addEventListener('app-error', (event) => {
    try {
      const detail = event.detail || {};
      const msg = `[API ${detail.method || 'GET'} ${detail.url || ''}] HTTP ${detail.status}: ${detail.message || ''}`;
      addLogEntry({
        type: 'app-error',
        message: msg,
        apiDetail: detail,
      });
      reportClientError({
        source: 'frontend_api_error',
        severity: Number(detail.status) >= 500 ? 'critical' : 'error',
        message: msg,
        errorType: 'ApiError',
        endpoint: detail.url || null,
        httpMethod: detail.method || null,
        statusCode: detail.status || null,
        context: detail,
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
  const screenSize =
    typeof window !== 'undefined' && window.screen
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
        report += `    Stack :\n${log.stack
          .split('\n')
          .map((l) => '      ' + l)
          .join('\n')}\n`;
      }
      report += `\n`;
    });
  }

  report += `--------------------------------------------------\n`;
  report += `Fin du rapport diagnostique.\n`;

  return report;
}
