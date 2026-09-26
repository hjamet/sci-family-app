import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, X, Copy, Check, Trash2, ShieldAlert } from 'lucide-react';

/**
 * Calcul d'une clé de signature unique pour dédupliquer les erreurs
 * Signature basée sur : message + url + status (et méthode)
 */
function getErrorSignature(detail) {
  const method = (detail.method || '').toUpperCase().trim();
  const url = (detail.url || '').trim();
  const status = String(detail.status ?? '').trim();
  const message = String(detail.message || '').trim();
  return `${method}:::${url}:::${status}:::${message}`;
}

function formatTime(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Fonction globale exportée pour déclencher manuellement une alerte fail-fast
 */
export function triggerGlobalError(detail) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('app-error', { detail }));
  }
}

export default function GlobalErrorAlert() {
  const [errors, setErrors] = useState([]);
  const [copiedId, setCopiedId] = useState(null);

  // Fonction d'ajout ou d'incrémentation d'une erreur
  const pushError = useCallback((rawDetail) => {
    if (!rawDetail) return;

    const detail = {
      message: rawDetail.message || 'Une erreur inattendue est survenue.',
      url: rawDetail.url || (typeof window !== 'undefined' ? window.location.pathname : ''),
      method: rawDetail.method || '',
      status: rawDetail.status ?? 'ERREUR',
      stack: rawDetail.stack || null,
      timestamp: rawDetail.timestamp || Date.now(),
    };

    const signature = getErrorSignature(detail);

    setErrors((prevErrors) => {
      const existingIndex = prevErrors.findIndex((e) => e.signature === signature);

      if (existingIndex !== -1) {
        // Déduplication anti-boucle : incrémenter le compteur sans empiler
        const existing = prevErrors[existingIndex];
        const updated = {
          ...existing,
          count: existing.count + 1,
          lastSeen: new Date(),
          pulseKey: Date.now(), // force un re-render visuel de l'animation
        };

        const next = [...prevErrors];
        next.splice(existingIndex, 1);
        return [updated, ...next];
      }

      // Nouvelle erreur inédite
      const newErr = {
        id: `err-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        signature,
        message: detail.message,
        url: detail.url,
        method: detail.method,
        status: detail.status,
        stack: detail.stack,
        count: 1,
        firstSeen: new Date(),
        lastSeen: new Date(),
        pulseKey: Date.now(),
      };

      return [newErr, ...prevErrors];
    });
  }, []);

  // Écouteurs globaux
  useEffect(() => {
    // 1. Événement personnalisé émis par api.js ou tout module applicatif
    const handleAppError = (event) => {
      if (event?.detail) {
        pushError(event.detail);
      }
    };

    // 2. Écouteur global sur les erreurs runtime JS
    const handleWindowError = (event) => {
      // Ignorer les erreurs injectées par des extensions de navigateur externes
      const filename = event.filename || '';
      if (filename.includes('chrome-extension://') || filename.includes('moz-extension://')) {
        return;
      }

      const msg = event.message || event.error?.message || 'Erreur d\'exécution JavaScript';
      pushError({
        message: String(msg),
        url: filename || (typeof window !== 'undefined' ? window.location.pathname : ''),
        method: 'JS',
        status: 'RUNTIME',
        stack: event.error?.stack,
      });
    };

    // 3. Écouteur global sur les rejets de promesses non interceptées
    const handleUnhandledRejection = (event) => {
      const reason = event.reason;

      // Si l'erreur a déjà été émise et traitée par notre intercepteur api.js
      if (reason && reason._handledByGlobalAlert) {
        return;
      }

      let message = 'Promesse asynchrone non interceptée';
      let stack = null;

      if (reason instanceof Error) {
        message = reason.message;
        stack = reason.stack;
      } else if (typeof reason === 'string') {
        message = reason;
      } else if (reason && typeof reason === 'object') {
        message = reason.detail || reason.message || JSON.stringify(reason);
      }

      pushError({
        message: String(message),
        url: typeof window !== 'undefined' ? window.location.pathname : '',
        method: 'ASYNC',
        status: 'REJECTION',
        stack,
      });
    };

    window.addEventListener('app-error', handleAppError);
    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    // Exposition optionnelle pour test direct dans la console navigateur
    window.__triggerTestAppError = (custom) => {
      window.dispatchEvent(
        new CustomEvent('app-error', {
          detail: custom || {
            url: '/api/test/fail-fast',
            method: 'POST',
            status: 500,
            message: "AttributeError: 'str' object has no attribute 'get' (Erreur simulée Fail-Fast)",
          },
        })
      );
    };

    return () => {
      window.removeEventListener('app-error', handleAppError);
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      delete window.__triggerTestAppError;
    };
  }, [pushError]);

  // Actions utilisateur
  const dismissError = (id) => {
    setErrors((prev) => prev.filter((err) => err.id !== id));
  };

  const clearAllErrors = () => {
    setErrors([]);
  };

  const copyErrorDetails = (err) => {
    const text = [
      `[INCIDENT TECHNIQUE FAIL-FAST]`,
      `Statut: ${err.status}`,
      err.method || err.url ? `Requête: ${err.method || ''} ${err.url || ''}` : null,
      `Occurrences: ${err.count}`,
      `Première vue: ${formatTime(err.firstSeen)}`,
      `Dernière vue: ${formatTime(err.lastSeen)}`,
      `Message:`,
      err.message,
      err.stack ? `Stack Trace:\n${err.stack}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedId(err.id);
      setTimeout(() => setCopiedId(null), 2500);
    }
  };

  if (errors.length === 0) {
    return null;
  }

  const totalOccurrences = errors.reduce((acc, curr) => acc + (curr.count || 1), 0);

  return (
    <aside
      aria-label="Centre d'alerte technique globale"
      className="fixed top-4 right-4 z-[9999] max-w-lg w-[calc(100%-2rem)] sm:w-full flex flex-col gap-3 pointer-events-none"
    >
      {/* Barre d'actions globale si plusieurs alertes ou cumul */}
      {errors.length > 1 && (
        <div className="pointer-events-auto bg-rose-950/95 border border-rose-600/80 rounded-2xl px-4 py-2.5 shadow-2xl backdrop-blur-md flex items-center justify-between gap-3 text-white text-xs font-semibold animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2 text-rose-200">
            <ShieldAlert className="w-4 h-4 text-rose-400 animate-pulse flex-shrink-0" />
            <span>
              <strong className="text-white">{errors.length}</strong> incidents distincts •{' '}
              <strong className="text-white">{totalOccurrences}</strong> erreurs totales
            </span>
          </div>
          <button
            type="button"
            onClick={clearAllErrors}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-800/80 hover:bg-rose-700 text-rose-100 hover:text-white rounded-xl text-xs font-medium transition-colors border border-rose-600/50 shadow-sm"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Tout effacer
          </button>
        </div>
      )}

      {/* Cartes d'alertes détaillées */}
      {errors.map((err) => {
        const isRepeated = err.count > 1;

        return (
          <div
            key={err.id}
            role="alert"
            className="pointer-events-auto bg-rose-950/95 border-2 border-rose-600 text-white rounded-2xl p-4 shadow-2xl backdrop-blur-md relative overflow-hidden transition-all duration-300"
          >
            {/* Liseré supérieur d'accentuation */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 via-red-500 to-rose-600" />

            {/* En-tête de la carte */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <span className="p-1.5 bg-rose-900/80 rounded-lg border border-rose-700/60 text-rose-300 flex-shrink-0">
                  <AlertTriangle className="w-4 h-4 animate-pulse text-rose-300" />
                </span>
                <h4 className="font-bold text-sm tracking-tight text-white flex items-center gap-2">
                  Incident Technique
                </h4>

                {/* Badge statut HTTP ou type */}
                <span className="inline-flex items-center font-mono font-bold text-[11px] px-2 py-0.5 rounded-full bg-rose-900/90 text-rose-200 border border-rose-600">
                  {typeof err.status === 'number' ? `HTTP ${err.status}` : err.status}
                </span>

                {/* Badge compteur anti-boucle avec animation de pulsation */}
                {isRepeated && (
                  <span
                    key={err.pulseKey}
                    title={`Erreur survenue ${err.count} fois consécutives`}
                    className="inline-flex items-center gap-1 bg-rose-600 text-white font-mono font-extrabold text-xs px-2.5 py-0.5 rounded-full shadow-lg border border-rose-300 animate-pulse"
                  >
                    <span>(x{err.count})</span>
                  </span>
                )}
              </div>

              {/* Boutons d'action : Copier & Fermer (Persistance absolue : aucun dismiss auto) */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => copyErrorDetails(err)}
                  title="Copier les détails techniques pour le diagnostic"
                  aria-label="Copier les détails"
                  className="p-1.5 rounded-lg text-rose-300 hover:text-white hover:bg-rose-900/80 transition-colors"
                >
                  {copiedId === err.id ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => dismissError(err.id)}
                  title="Fermer cette notification (suppression manuelle requise)"
                  aria-label="Fermer la notification d'erreur"
                  className="p-1.5 rounded-lg text-rose-300 hover:text-white hover:bg-rose-800/80 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Méthode et URL de l'API ciblée si présente */}
            {(err.url || err.method) && (
              <div className="mt-2.5 flex items-center gap-2 bg-rose-900/40 px-2.5 py-1.5 rounded-lg border border-rose-800/60 font-mono text-xs text-rose-200 overflow-x-auto">
                {err.method && (
                  <span className="font-bold text-rose-300 flex-shrink-0">{err.method}</span>
                )}
                <span className="truncate select-all">{err.url}</span>
              </div>
            )}

            {/* Message d'erreur technique brut avec persistance et défilement */}
            <div className="mt-2 text-xs font-mono text-rose-100 bg-black/60 p-3 rounded-xl border border-rose-800/80 select-all whitespace-pre-wrap break-words max-h-40 overflow-y-auto shadow-inner leading-relaxed">
              {err.message}
            </div>

            {/* Horodatages et traçabilité anti-boucle */}
            <div className="mt-2.5 flex items-center justify-between text-[11px] font-mono text-rose-300/80 pt-1 border-t border-rose-900/50">
              <span>Détecté à {formatTime(err.firstSeen)}</span>
              {isRepeated ? (
                <span className="text-rose-200 font-semibold">
                  Dernier signal : {formatTime(err.lastSeen)} • Boucle de {err.count} occurrences
                </span>
              ) : (
                <span className="text-rose-400/90 italic">En attente de résolution manuelle</span>
              )}
            </div>
          </div>
        );
      })}
    </aside>
  );
}
