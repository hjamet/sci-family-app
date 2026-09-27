import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Clock,
  ShieldAlert,
  ShieldCheck,
  X,
  Info,
  Terminal
} from 'lucide-react';
import { fetchBankStatus, triggerBankSync, startBankAuth } from '../api';

export default function BankReauthBanner({
  bankStatus: propBankStatus,
  onRefresh,
  className = '',
  urlError = null
}) {
  const [bankStatus, setBankStatus] = useState(propBankStatus || null);
  const [loading, setLoading] = useState(false);
  const [reauthLoading, setReauthLoading] = useState(false);
  const [localError, setLocalError] = useState(null);
  const [isReauthModalOpen, setIsReauthModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (propBankStatus) {
      setBankStatus(propBankStatus);
    } else {
      loadStatus();
    }
  }, [propBankStatus]);

  // Fermeture de la modale par touche Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isReauthModalOpen) {
        setIsReauthModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isReauthModalOpen]);

  const loadStatus = async () => {
    try {
      setLoading(true);
      const data = await fetchBankStatus();
      setBankStatus(data);
      setLocalError(null);
    } catch (err) {
      console.warn('Bank status fetch notice:', err.message);
      // Mode dégradé sécurisé en cas d'erreur de communication API
      setBankStatus((prev) => ({
        ...(prev || {}),
        status: 'error',
        needs_reauth: true,
        message: 'Liaison bancaire indisponible : impossible d\'interroger le service bancaire.',
        raw_error: err.message || 'Impossible d\'interroger le service bancaire.',
        error_code: err.status || 'NET_ERROR',
        error_details: err.stack || err.message,
        last_sync_attempt: new Date().toISOString(),
        total_balance: prev?.total_balance ?? 0.0,
        last_synced_at: prev?.last_synced_at ?? null,
      }));
    } finally {
      setLoading(false);
    }
  };

  const handleReauth = async () => {
    try {
      setReauthLoading(true);
      setLocalError(null);
      let targetUrl = bankStatus?.reauth_url;

      if (!targetUrl) {
        const authData = await startBankAuth();
        targetUrl = authData?.url;
      }

      if (targetUrl) {
        window.location.href = targetUrl;
      } else {
        throw new Error('URL d\'autorisation Tilisy indisponible.');
      }
    } catch (err) {
      console.error('Erreur lancement ré-authentification bancaire:', err);
      setLocalError(err.message || 'Impossible de lancer la ré-authentification.');
      setReauthLoading(false);
    }
  };

  const handleManualSync = async () => {
    try {
      setLoading(true);
      setLocalError(null);
      await triggerBankSync();
      await loadStatus();
      if (onRefresh) onRefresh();
    } catch (err) {
      console.warn('Échec synchronisation bancaire manuelle:', err);
      await loadStatus();
    } finally {
      setLoading(false);
    }
  };

  // Formatage des dates sécurisé
  const formatDateTime = (timestamp) => {
    if (!timestamp) return null;
    try {
      const d = new Date(timestamp);
      if (isNaN(d.getTime())) return null;
      return d.toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return null;
    }
  };

  // Normalisation des chaînes pour éviter tout crash si un objet est retourné
  const normalizeErrorString = (val) => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    try {
      return JSON.stringify(val, null, 2);
    } catch {
      return String(val);
    }
  };

  // RÈGLE D'OR HENRI : En temps normal (API fonctionnelle, statut OK, pas de ré-auth requise, zéro erreur URL),
  // l'interface reste STRICTEMENT et TOTALEMENT épurée (ZÉRO bannière, ZÉRO message résiduel).
  const hasError = Boolean(
    urlError ||
    (bankStatus && (bankStatus.needs_reauth || bankStatus.status !== 'ok' || bankStatus.raw_error))
  );

  if (!bankStatus && !urlError) {
    return null;
  }

  if (!hasError) {
    return null;
  }

  const isExpiringSoon = bankStatus?.status === 'expiring_soon' && !urlError;
  const lastSyncTimestamp = bankStatus?.last_successful_sync || bankStatus?.last_synced_at;
  const formattedLastSync = formatDateTime(lastSyncTimestamp);
  const formattedLastAttempt = formatDateTime(bankStatus?.last_sync_attempt);

  // Extraction des champs de diagnostic technique
  const rawError = bankStatus?.raw_error || urlError || (bankStatus?.status === 'error' ? bankStatus?.message : null);
  const rawErrorText = normalizeErrorString(rawError);
  const errorCode = bankStatus?.error_code ? String(bankStatus.error_code) : (urlError ? 'REDIRECT_ERROR' : null);
  const errorDetailsText = normalizeErrorString(bankStatus?.error_details);

  // Copie dans le presse-papier du rapport d'incident complet
  const handleCopyError = (e) => {
    if (e) e.stopPropagation();
    const nowStr = new Date().toLocaleString('fr-FR');
    const reportLines = [
      `=== RAPPORT D'INCIDENT LIAISON BANCAIRE SWAN / TILISY ===`,
      `Date du constat : ${nowStr}`,
      `Statut liaison : ${bankStatus.status || 'inconnu'} (needs_reauth: ${Boolean(bankStatus.needs_reauth)})`,
      errorCode ? `Code d'erreur : ${errorCode}` : null,
      `Détail technique : ${rawErrorText || "Aucune réponse de l'API bancaire"}`,
      errorDetailsText && errorDetailsText !== rawErrorText ? `Précisions : ${errorDetailsText}` : null,
      formattedLastAttempt ? `Dernière tentative d'interrogation : ${formattedLastAttempt}` : null,
      formattedLastSync ? `Dernière synchronisation réussie : ${formattedLastSync}` : 'Dernière synchronisation réussie : Aucune',
      localError ? `Erreur interface locale : ${localError}` : null,
      bankStatus.aspsp_name ? `Fournisseur ASPSP : ${bankStatus.aspsp_name} (${bankStatus.aspsp_country || 'FR'})` : null,
      bankStatus.application_id ? `Application ID : ${bankStatus.application_id}` : null,
    ];
    const textToCopy = reportLines.filter(Boolean).join('\n');

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }).catch((err) => {
        console.warn('Erreur écriture presse-papier:', err);
      });
    }
  };

  return (
    <>
      <aside
        id="bank-reauth-banner"
        role="alert"
        className={`rounded-2xl border-2 p-4 sm:p-5 shadow-sm transition-all duration-200 mb-space-md ${
          isExpiringSoon
            ? 'bg-amber-50/95 border-amber-300 text-amber-950'
            : 'bg-rose-50/95 border-rose-300 text-rose-950'
        } ${className}`}
      >
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          
          {/* En-tête & Description */}
          <div className="flex items-start gap-3.5 min-w-0 flex-1">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border shadow-xs ${
                isExpiringSoon
                  ? 'bg-amber-100 text-amber-700 border-amber-200'
                  : 'bg-rose-100 text-rose-700 border-rose-200'
              }`}
            >
              {isExpiringSoon ? (
                <AlertTriangle className="w-5 h-5" />
              ) : (
                <ShieldAlert className="w-6 h-6 animate-pulse" />
              )}
            </div>

            <div className="space-y-1.5 min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base leading-tight">
                  {isExpiringSoon
                    ? 'Liaison bancaire à renouveler'
                    : '⚠️ Liaison bancaire interrompue'}
                </h3>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                    isExpiringSoon
                      ? 'bg-amber-200/80 text-amber-900 border border-amber-300'
                      : 'bg-rose-200/80 text-rose-900 border border-rose-300'
                  }`}
                >
                  {isExpiringSoon ? 'À renouveler' : 'Interrompue'}
                </span>
              </div>

              <p className="text-xs sm:text-sm leading-relaxed opacity-90 max-w-3xl">
                {bankStatus.message && !bankStatus.message.includes('180')
                  ? bankStatus.message
                  : 'La liaison bancaire est interrompue ou nécessite un renouvellement pour actualiser les soldes et écritures en direct.'}
              </p>

              {/* Date du dernier relevé en cache */}
              <div className="flex items-center gap-1.5 pt-0.5 text-xs opacity-80">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {formattedLastSync
                    ? `Dernière synchronisation réussie le ${formattedLastSync}.`
                    : 'Affichage des données en cache local.'}
                </span>
              </div>

              {/* Bloc de diagnostic technique explicite */}
              <div
                id="bank-diagnostic-box"
                className={`mt-3 p-3 sm:p-3.5 rounded-xl border text-xs transition-all ${
                  isExpiringSoon
                    ? 'bg-amber-100/70 border-amber-300 text-amber-950'
                    : 'bg-rose-100/70 border-rose-300 text-rose-950'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2 font-sans">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="material-symbols-outlined text-[16px] opacity-75">terminal</span>
                    <span className="text-[11px] uppercase tracking-wider font-bold">
                      Diagnostic technique
                    </span>
                    {errorCode && (
                      <span
                        id="bank-error-code-badge"
                        className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold border ${
                          isExpiringSoon
                            ? 'bg-amber-200 text-amber-950 border-amber-400'
                            : 'bg-rose-200 text-rose-950 border-rose-400'
                        }`}
                      >
                        Code : {errorCode}
                      </span>
                    )}
                  </div>

                  {/* Bouton discret Copier l'erreur avec icône content_copy */}
                  <button
                    id="btn-copy-bank-error"
                    type="button"
                    onClick={handleCopyError}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-sans font-bold transition-all shadow-2xs cursor-pointer ${
                      copied
                        ? 'bg-emerald-600 border-emerald-700 text-white'
                        : 'bg-white/95 hover:bg-white text-slate-800 border-slate-300 hover:border-slate-400 active:scale-95'
                    }`}
                    title="Copier le rapport d'incident complet"
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      {copied ? 'check' : 'content_copy'}
                    </span>
                    <span>{copied ? 'Copié !' : "Copier l'erreur"}</span>
                  </button>
                </div>

                {/* Encadré monospace / code sobre : Détail technique */}
                <div
                  id="bank-raw-error-details"
                  className="p-2.5 rounded-lg bg-white/85 dark:bg-slate-900/70 border border-black/5 dark:border-white/10 break-words whitespace-pre-wrap select-text leading-relaxed font-mono text-[11px] sm:text-xs text-slate-900 dark:text-slate-100"
                >
                  <span className="font-bold opacity-70">Détail technique : </span>
                  <span>{rawErrorText || "Aucune réponse de l'API bancaire"}</span>
                  {errorDetailsText && errorDetailsText !== rawErrorText && (
                    <div className="mt-1.5 pt-1.5 border-t border-black/5 dark:border-white/10 opacity-90 text-[10.5px]">
                      <span className="font-bold opacity-70">Précisions : </span>
                      <span>{errorDetailsText}</span>
                    </div>
                  )}
                </div>

                {formattedLastAttempt && (
                  <div className="mt-2 text-[10.5px] font-sans opacity-80 flex items-center gap-1">
                    <Clock className="w-3 h-3 shrink-0" />
                    <span>Dernière tentative d'interrogation : {formattedLastAttempt}.</span>
                  </div>
                )}
              </div>

              {localError && (
                <p className="text-xs text-rose-700 font-semibold pt-1">
                  {localError}
                </p>
              )}
            </div>
          </div>

          {/* Boutons d'Action */}
          <div className="flex sm:flex-col lg:flex-col xl:flex-row items-stretch sm:items-end lg:items-end xl:items-center gap-2 shrink-0 self-end lg:self-start">
            <button
              id="btn-bank-manual-sync"
              type="button"
              onClick={handleManualSync}
              disabled={loading || reauthLoading}
              className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border text-xs font-semibold bg-white transition-all shadow-xs cursor-pointer ${
                isExpiringSoon
                  ? 'border-amber-300 text-amber-900 hover:bg-amber-100/60'
                  : 'border-rose-300 text-rose-900 hover:bg-rose-100/60'
              } disabled:opacity-50`}
              title="Tester l'interrogation de l'API bancaire"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Vérification...' : 'Tester'}</span>
            </button>

            {/* Ouvre le modal de renouvellement bancaire avec diagnostic complet */}
            <button
              id="btn-open-bank-reauth-modal"
              type="button"
              onClick={() => setIsReauthModalOpen(true)}
              disabled={reauthLoading}
              className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white shadow-sm transition-all duration-150 active:scale-95 cursor-pointer whitespace-nowrap ${
                isExpiringSoon
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-rose-600 hover:bg-rose-700'
              } disabled:opacity-50`}
              title="Afficher les explications et renouveler la liaison bancaire"
            >
              <span>Renouveler via Tilisy</span>
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>

        </div>
      </aside>

      {/* ========================================================================= */}
      {/* MODAL DE RÉ-AUTHENTIFICATION & RENOUVELLEMENT BANCAIRE TILISY              */}
      {/* ========================================================================= */}
      {isReauthModalOpen && (
        <div
          id="modal-bank-reauth"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-bank-reauth-title"
          className="fixed inset-0 z-50 bg-inverse-surface/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setIsReauthModalOpen(false)}
        >
          <div
            className="bg-surface-container-lowest dark:bg-slate-900 w-full max-w-xl rounded-2xl p-6 shadow-2xl border border-border-subtle relative max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* En-tête de la modale */}
            <div className="flex items-start justify-between pb-4 border-b border-border-subtle gap-3">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${
                  isExpiringSoon
                    ? 'bg-amber-100 text-amber-800 border-amber-200'
                    : 'bg-rose-100 text-rose-800 border-rose-200'
                }`}>
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <h2 id="modal-bank-reauth-title" className="font-headline-sm text-base sm:text-lg text-forest-deep dark:text-slate-100 font-bold leading-tight">
                    Renouvellement de la liaison bancaire
                  </h2>
                  <p className="font-body-md text-xs text-on-surface-variant dark:text-slate-400 mt-0.5">
                    Authentification sécurisée DSP2 Swan via Tilisy (Enable Banking)
                  </p>
                </div>
              </div>

              <button
                id="btn-close-reauth-modal"
                type="button"
                onClick={() => setIsReauthModalOpen(false)}
                className="w-9 h-9 rounded-full hover:bg-surface-container dark:hover:bg-slate-800 text-on-surface-variant flex items-center justify-center transition-all cursor-pointer shrink-0"
                title="Fermer"
                aria-label="Fermer la modale"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Corps de la modale */}
            <div className="mt-4 space-y-4 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
              
              <div className="p-3.5 bg-surface-container-low dark:bg-slate-800/60 rounded-xl border border-border-subtle leading-relaxed space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-forest-deep dark:text-emerald-400 text-xs">
                  <Info className="w-4 h-4 text-primary shrink-0" />
                  <span>Cadre réglementaire européen DSP2</span>
                </div>
                <p className="text-xs text-on-surface-variant dark:text-slate-300">
                  Pour votre sécurité, l'accès bancaire en lecture seule requiert une ré-autorisation tous les 180 jours. Si la liaison a été interrompue ou si un renouvellement récent n'a pas abouti, examinez le diagnostic ci-dessous avant de relancer l'autorisation.
                </p>
              </div>

              {/* Bloc d'erreur exacte de la dernière tentative */}
              <div className="p-4 rounded-xl border border-rose-300 bg-rose-50/90 dark:bg-rose-950/30 dark:border-rose-900 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-xs uppercase tracking-wider text-rose-900 dark:text-rose-300 flex items-center gap-1.5">
                    <Terminal className="w-4 h-4 text-rose-700" />
                    Erreur exacte de la dernière tentative
                  </span>

                  <div className="flex items-center gap-2">
                    {errorCode && (
                      <span
                        id="modal-bank-error-code"
                        className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-rose-200 text-rose-900 border border-rose-300"
                      >
                        Code : {errorCode}
                      </span>
                    )}

                    <button
                      id="modal-btn-copy-error"
                      type="button"
                      onClick={handleCopyError}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-sans font-bold transition-all shadow-2xs cursor-pointer ${
                        copied
                          ? 'bg-emerald-600 border-emerald-700 text-white'
                          : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-300 active:scale-95'
                      }`}
                      title="Copier le rapport d'incident complet"
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {copied ? 'check' : 'content_copy'}
                      </span>
                      <span>{copied ? 'Copié !' : "Copier"}</span>
                    </button>
                  </div>
                </div>

                {/* Monospace exact */}
                <div
                  id="modal-raw-error-text"
                  className="font-mono text-xs text-rose-950 dark:text-rose-200 bg-white/90 dark:bg-slate-950/80 p-3 rounded-lg border border-rose-200 dark:border-rose-900/60 break-words whitespace-pre-wrap select-text leading-relaxed"
                >
                  <span className="font-bold text-rose-700 dark:text-rose-400">Détail technique : </span>
                  <span>{rawErrorText || "Aucune réponse de l'API bancaire"}</span>
                  {errorDetailsText && errorDetailsText !== rawErrorText && (
                    <div className="mt-2 pt-2 border-t border-rose-100 dark:border-rose-900/40 text-[11px]">
                      <span className="font-bold text-rose-700 dark:text-rose-400">Précisions : </span>
                      <span>{errorDetailsText}</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between text-[11px] text-rose-800 dark:text-rose-300/80 pt-0.5 gap-2">
                  {formattedLastAttempt && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Tentative : {formattedLastAttempt}
                    </span>
                  )}
                  {formattedLastSync && (
                    <span>Dernière synchro OK : {formattedLastSync}</span>
                  )}
                </div>
              </div>

              {/* Causes fréquentes d'échec */}
              <div className="space-y-2 pt-1">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Pourquoi Tilisy peut-il échouer lors du renouvellement ?
                </h4>
                <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                  <li className="flex items-start gap-2">
                    <span className="text-base leading-none">📱</span>
                    <span>
                      <strong className="text-slate-800 dark:text-slate-200">Session non validée sur votre téléphone :</strong> la notification d'authentification forte (SCA) sur l'application bancaire Swan n'a pas été validée dans les 5 minutes imparties.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-base leading-none">🔍</span>
                    <span>
                      <strong className="text-slate-800 dark:text-slate-200">Compte introuvable ou mandat modifié :</strong> l'identifiant de compte lié lors du consentement ne correspond pas au compte SCI actuellement interrogé par l'API.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-base leading-none">✍️</span>
                    <span>
                      <strong className="text-slate-800 dark:text-slate-200">Signature ou jeton invalide :</strong> la session de consentement a été annulée ou l'autorisation a expiré avant finalisation.
                    </span>
                  </li>
                </ul>
              </div>

              {localError && (
                <div className="p-3 bg-rose-100 text-rose-900 rounded-lg text-xs font-semibold">
                  {localError}
                </div>
              )}

            </div>

            {/* Pied de la modale */}
            <div className="mt-6 pt-4 border-t border-border-subtle flex flex-wrap items-center justify-end gap-3">
              <button
                id="modal-btn-cancel"
                type="button"
                onClick={() => setIsReauthModalOpen(false)}
                className="h-11 px-5 rounded-DEFAULT bg-surface-container-lowest dark:bg-slate-800 border-2 border-border-subtle text-on-surface dark:text-slate-200 font-label-md text-xs font-semibold hover:bg-canvas-slate transition-all cursor-pointer"
              >
                Fermer
              </button>

              <button
                id="modal-btn-submit-reauth"
                type="button"
                onClick={handleReauth}
                disabled={reauthLoading}
                className="h-11 px-6 rounded-DEFAULT bg-primary text-white font-label-md text-xs font-bold hover:bg-forest-deep transition-all flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
              >
                {reauthLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Redirection vers Tilisy...</span>
                  </>
                ) : (
                  <>
                    <span>Ouvrir Tilisy pour autoriser l'accès</span>
                    <ExternalLink className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
