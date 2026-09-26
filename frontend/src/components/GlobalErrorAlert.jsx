import React, { useState, useEffect, useCallback } from 'react';
import { X, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';

/**
 * Calcul d'une clé de signature unique pour dédupliquer les erreurs.
 * Signature basée sur : méthode + url + statut + message.
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

function formatISODate(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString();
}

/**
 * Copie robuste dans le presse-papier avec fallback textarea
 */
async function copyToClipboard(text) {
  if (typeof window === 'undefined') return false;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    console.warn('Clipboard API direct failed, using textarea fallback:', err);
  }

  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '-9999px';
    textArea.style.left = '-9999px';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('All clipboard copy methods failed:', err);
    return false;
  }
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
  const [copied, setCopied] = useState(false);
  const [expandedIds, setExpandedIds] = useState(() => new Set());

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
        // Déduplication anti-boucle : incrémenter le compteur sans multiplier les lignes
        const existing = prevErrors[existingIndex];
        const updated = {
          ...existing,
          count: existing.count + 1,
          lastSeen: new Date(),
          pulseKey: Date.now(),
        };

        const next = [...prevErrors];
        next.splice(existingIndex, 1);
        return [updated, ...next];
      }

      // Nouvelle erreur inédite ajoutée à la liste cumulée
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

  // Écouteurs globaux (événements personnalisés et erreurs runtime JS/asynchrones)
  useEffect(() => {
    // 1. Événement personnalisé émis par api.js ou tout composant
    const handleAppError = (event) => {
      if (event?.detail) {
        pushError(event.detail);
      }
    };

    // 2. Écouteur global sur les erreurs runtime JS
    const handleWindowError = (event) => {
      const filename = event.filename || '';
      if (filename.includes('chrome-extension://') || filename.includes('moz-extension://')) {
        return;
      }

      const msg = event.message || event.error?.message || "Erreur d'exécution JavaScript";
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
  const clearAllErrors = () => {
    setErrors([]);
    setExpandedIds(new Set());
  };

  const toggleExpand = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Copie globale du rapport d'incidents
  const copyAllErrorsReport = async () => {
    if (errors.length === 0) return;

    const totalOccurrences = errors.reduce((acc, curr) => acc + (curr.count || 1), 0);
    const now = new Date();
    const activeUrl = typeof window !== 'undefined' ? window.location.href : 'Inconnue';
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'Inconnu';

    const header = [
      '============================================================',
      "RAPPORT D'INCIDENTS TECHNIQUES — SCI FAMILY APP",
      `Généré le        : ${now.toISOString()} (${now.toLocaleString('fr-FR')})`,
      `Page active      : ${activeUrl}`,
      `Navigateur       : ${userAgent}`,
      `Incidents uniques: ${errors.length}`,
      `Total erreurs    : ${totalOccurrences}`,
      '============================================================',
      '',
    ].join('\n');

    const incidentBlocks = errors.map((err, idx) => {
      const lines = [
        `[INCIDENT #${idx + 1}]`,
        `- Statut       : ${typeof err.status === 'number' ? `HTTP ${err.status}` : err.status}`,
        `- Méthode / Typ: ${err.method || 'N/A'}`,
        `- Cible / URL  : ${err.url || 'N/A'}`,
        `- Occurrences  : ${err.count} fois`,
        `- Détecté à    : ${formatISODate(err.firstSeen)} (${formatTime(err.firstSeen)})`,
        `- Dernier vu   : ${formatISODate(err.lastSeen)} (${formatTime(err.lastSeen)})`,
        `- Message      :`,
        `  ${String(err.message).replace(/\n/g, '\n  ')}`,
      ];

      if (err.stack) {
        lines.push(`- Stack Trace  :\n${err.stack}`);
      }

      lines.push('------------------------------------------------------------');
      return lines.join('\n');
    });

    const fullReport = `${header}${incidentBlocks.join('\n\n')}\n=== FIN DU RAPPORT ===\n`;

    const success = await copyToClipboard(fullReport);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (errors.length === 0) {
    return null;
  }

  const totalOccurrences = errors.reduce((acc, curr) => acc + (curr.count || 1), 0);

  return (
    <aside
      aria-label="Centre d'alerte technique globale"
      className="fixed bottom-5 right-5 z-50 max-w-md w-[calc(100%-2.5rem)] sm:w-full transition-all duration-300 ease-out pointer-events-auto"
    >
      <div className="bg-slate-900/90 dark:bg-slate-950/95 backdrop-blur-xl border border-rose-500/30 text-slate-100 rounded-2xl shadow-2xl p-4 relative overflow-hidden flex flex-col">
        {/* Liseré supérieur subtil avec dégradé doux rose / ambre */}
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-rose-500/80 via-amber-500/60 to-rose-500/80" />

        {/* En-tête : Badge avec pulsation douce, Titre et Compteur */}
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-white/10">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Indicateur de pulsation rouge/ambre doux */}
            <span className="relative flex h-2.5 w-2.5 flex-shrink-0" aria-hidden="true">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
            </span>

            <div className="flex items-baseline gap-2 min-w-0">
              <h4 className="font-semibold text-sm tracking-tight text-white truncate">
                Anomalie technique détectée
              </h4>
              <span className="text-[11px] font-medium text-slate-300 bg-white/10 px-2 py-0.5 rounded-full flex-shrink-0">
                {totalOccurrences} {totalOccurrences > 1 ? 'erreurs enregistrées' : 'erreur enregistrée'}
              </span>
            </div>
          </div>

          {/* Bouton fermeture manuelle globale (✕ discret) */}
          <button
            type="button"
            onClick={clearAllErrors}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
            title="Fermer et masquer l'alerte"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Zone de liste cumulée scrollable (Stricte carte unique pour tous les incidents) */}
        <div className="mt-2.5 max-h-48 overflow-y-auto space-y-2 pr-1 divide-y divide-white/10">
          {errors.map((err) => {
            const isRepeated = err.count > 1;
            const isExpanded = expandedIds.has(err.id);

            return (
              <div key={err.id} className="pt-2 first:pt-0">
                {/* Ligne d'en-tête de l'item */}
                <div className="flex items-center justify-between gap-1.5 text-xs">
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                    {/* Badge statut HTTP ou code d'erreur */}
                    <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 flex-shrink-0">
                      {typeof err.status === 'number' ? `HTTP ${err.status}` : err.status}
                    </span>

                    {/* Méthode HTTP ou source */}
                    {err.method && (
                      <span className="font-mono text-[10px] font-semibold text-slate-400 uppercase flex-shrink-0">
                        {err.method}
                      </span>
                    )}

                    {/* Badge compteur anti-boucle */}
                    {isRepeated && (
                      <span
                        key={err.pulseKey}
                        className="inline-flex items-center font-mono font-bold text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/30 text-rose-200 border border-rose-400/40 animate-pulse flex-shrink-0"
                        title={`Erreur survenue ${err.count} fois`}
                      >
                        (x{err.count})
                      </span>
                    )}
                  </div>

                  {/* Horodatage */}
                  <span className="font-mono text-[10px] text-slate-400 flex-shrink-0">
                    {formatTime(err.lastSeen || err.firstSeen)}
                  </span>
                </div>

                {/* URL cible / endpoint */}
                {err.url && (
                  <div className="mt-1 text-[11px] font-mono text-slate-300 truncate select-all">
                    {err.url}
                  </div>
                )}

                {/* Message d'erreur compact et dépliable */}
                <div
                  onClick={() => toggleExpand(err.id)}
                  className="mt-1 text-[11px] font-mono text-slate-300 bg-black/40 hover:bg-black/60 rounded-lg p-2 border border-white/5 cursor-pointer transition-colors"
                  title="Cliquer pour afficher ou masquer les détails"
                >
                  <div className={isExpanded ? 'whitespace-pre-wrap break-words' : 'line-clamp-2 break-all'}>
                    {err.message}
                  </div>

                  {err.stack && isExpanded && (
                    <pre className="mt-2 pt-2 border-t border-white/10 text-[10px] text-slate-400 whitespace-pre-wrap overflow-x-auto max-h-32">
                      {err.stack}
                    </pre>
                  )}

                  <div className="mt-1 flex items-center justify-end text-[10px] text-slate-500">
                    {isExpanded ? (
                      <span className="flex items-center gap-0.5">
                        <ChevronUp className="w-3 h-3" /> Réduire
                      </span>
                    ) : (
                      <span className="flex items-center gap-0.5">
                        <ChevronDown className="w-3 h-3" /> Détails
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pied : Bouton unique de copie globale et bouton Fermer */}
        <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-2">
          <button
            type="button"
            onClick={copyAllErrorsReport}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all duration-200 shadow-md active:scale-[0.99] bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white border border-rose-400/30"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-300" />
                <span>✓ Rapport copié !</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-rose-200" />
                <span>📋 Copier tout le rapport</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={clearAllErrors}
            className="px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-white/10 transition-colors"
            title="Masquer le centre d'alerte et vider la liste"
          >
            Fermer
          </button>
        </div>
      </div>
    </aside>
  );
}
