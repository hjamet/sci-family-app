import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  X,
  HardDrive,
  CheckCircle2,
  Lock
} from 'lucide-react';
import { fetchDriveStatus, fetchDriveOAuthUrl } from '../api';

export default function DriveReauthBanner({
  driveStatus: propDriveStatus,
  onRefresh,
  currentUser,
  className = ''
}) {
  const [driveStatus, setDriveStatus] = useState(propDriveStatus || null);
  const [loading, setLoading] = useState(false);
  const [reauthLoading, setReauthLoading] = useState(false);
  const [localError, setLocalError] = useState(null);
  const [successNotif, setSuccessNotif] = useState(false);
  const [urlErrorNotif, setUrlErrorNotif] = useState(null);

  const isCoordinator = Boolean(
    currentUser?.is_coordinator ||
    (typeof currentUser === 'string' && currentUser.toLowerCase().includes('henri')) ||
    (currentUser?.name && currentUser.name.toLowerCase().includes('henri')) ||
    (currentUser?.fullName && currentUser.fullName.toLowerCase().includes('henri')) ||
    (currentUser?.email && currentUser.email.toLowerCase().includes('henri'))
  );

  // Détection des retours OAuth via paramètres d'URL (?drive_connected=true ou ?drive_error=...)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('drive_connected') === 'true') {
        setSuccessNotif(true);
        loadStatus();
        // Nettoyer l'URL proprement sans rechargement
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
      } else if (urlParams.get('drive_error')) {
        setUrlErrorNotif(decodeURIComponent(urlParams.get('drive_error')));
        // Nettoyer l'URL
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
      }
    }
  }, []);

  useEffect(() => {
    if (propDriveStatus) {
      setDriveStatus(propDriveStatus);
    } else {
      loadStatus();
    }
  }, [propDriveStatus]);

  const loadStatus = async () => {
    try {
      setLoading(true);
      const data = await fetchDriveStatus();
      setDriveStatus(data);
      setLocalError(null);
    } catch (err) {
      console.warn('Drive status check notice:', err.message);
      setDriveStatus({
        connected: false,
        status: 'error',
        message: err.message || 'Impossible de joindre le statut Google Drive.'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStartOAuth = async () => {
    try {
      setReauthLoading(true);
      setLocalError(null);
      const data = await fetchDriveOAuthUrl();
      if (data && data.auth_url) {
        window.location.href = data.auth_url;
      } else {
        throw new Error("Le serveur n'a renvoyé aucune URL d'autorisation Google OAuth.");
      }
    } catch (err) {
      console.error('Erreur démarrage OAuth Google Drive:', err);
      setLocalError(err.message || 'Impossible de lancer la reconnexion Google Drive.');
      setReauthLoading(false);
    }
  };

  // 1. Notification de succès après reconnexion OAuth
  if (successNotif) {
    return (
      <aside
        id="drive-reauth-success"
        role="status"
        className={`rounded-2xl border-2 border-emerald-300 bg-emerald-50/95 p-4 sm:p-5 text-emerald-950 shadow-sm mb-space-md ${className}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-emerald-900">
                Connexion Google Drive rétablie avec succès !
              </h3>
              <p className="text-xs sm:text-sm text-emerald-800 mt-1 leading-relaxed">
                Le jeton d'accès a été renouvelé et enregistré en base de données. Le téléversement de documents volumineux (&gt; 3.5 Mo) et de photos brutes est immédiatement opérationnel.
              </p>
            </div>
          </div>
          <button
            onClick={() => setSuccessNotif(false)}
            className="p-1 rounded-lg hover:bg-emerald-200/80 text-emerald-700 transition shrink-0"
            title="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </aside>
    );
  }

  // 2. Erreur passée en URL
  if (urlErrorNotif) {
    return (
      <aside
        id="drive-reauth-url-error"
        role="alert"
        className={`rounded-2xl border-2 border-rose-300 bg-rose-50/95 p-4 sm:p-5 text-rose-950 shadow-sm mb-space-md ${className}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 border border-rose-200 text-rose-700 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-rose-900">
                Échec de la reconnexion Google Drive
              </h3>
              <p className="text-xs sm:text-sm text-rose-800 mt-1 leading-relaxed">
                {urlErrorNotif}
              </p>
              {isCoordinator && (
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={handleStartOAuth}
                    disabled={reauthLoading}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
                  >
                    {reauthLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <HardDrive className="w-3.5 h-3.5" />}
                    <span>Réessayer la reconnexion</span>
                  </button>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => setUrlErrorNotif(null)}
            className="p-1 rounded-lg hover:bg-rose-200/80 text-rose-700 transition shrink-0"
            title="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </aside>
    );
  }

  // 3. Statut normal : si connecté et pas d'erreur, aucun affichage intrusif
  if (driveStatus?.connected) {
    return null;
  }

  // 4. Statut non encore chargé
  if (!driveStatus && loading) {
    return null;
  }

  // 5. Statut déconnecté ou expiré -> Bannière d'alerte Fail-Loud
  const isExpired = driveStatus?.status === 'expired' || (driveStatus?.message && driveStatus.message.toLowerCase().includes('expir'));

  return (
    <aside
      id="drive-reauth-banner"
      role="alert"
      className={`rounded-2xl border-2 p-4 sm:p-5 shadow-sm transition-all duration-200 mb-space-md ${
        isExpired
          ? 'bg-amber-50/95 border-amber-300 text-amber-950'
          : 'bg-rose-50/95 border-rose-300 text-rose-950'
      } ${className}`}
    >
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        {/* En-tête & Description */}
        <div className="flex items-start gap-3.5 min-w-0 flex-1">
          <div
            className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border shadow-xs ${
              isExpired
                ? 'bg-amber-100 text-amber-700 border-amber-200'
                : 'bg-rose-100 text-rose-700 border-rose-200'
            }`}
          >
            {isExpired ? (
              <AlertTriangle className="w-5 h-5" />
            ) : (
              <ShieldAlert className="w-6 h-6 animate-pulse" />
            )}
          </div>

          <div className="space-y-1.5 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-sm sm:text-base leading-tight">
                {isExpired
                  ? 'Stockage Google Drive déconnecté (Jeton expiré)'
                  : 'Liaison Google Drive indisponible'}
              </h3>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                  isExpired
                    ? 'bg-amber-200/80 text-amber-900 border border-amber-300'
                    : 'bg-rose-200/80 text-rose-900 border border-rose-300'
                }`}
              >
                {isExpired ? 'Jeton expiré' : 'Déconnecté'}
              </span>
            </div>

            <p className="text-xs sm:text-sm leading-relaxed opacity-90 max-w-3xl">
              {driveStatus?.message ||
                "Le jeton d'accès Google Drive n'est plus valide. Le téléversement direct de pièces volumineuses (> 3.5 Mo) est suspendu jusqu'à la reconnexion."}
            </p>

            <div className="text-xs opacity-80 pt-0.5">
              💡 Les documents légers (&le; 3.5 Mo) restent opérationnels.
            </div>

            {localError && (
              <div className="mt-2 p-2.5 bg-rose-100 border border-rose-300 rounded-lg text-xs text-rose-900">
                {localError}
              </div>
            )}
          </div>
        </div>

        {/* Boutons d'action */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 shrink-0 self-start lg:self-center">
          {isCoordinator ? (
            <button
              id="btn-reconnect-drive"
              type="button"
              onClick={handleStartOAuth}
              disabled={reauthLoading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-forest-deep text-white rounded-xl text-xs sm:text-sm font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
            >
              {reauthLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <HardDrive className="w-4 h-4" />
              )}
              <span>🔗 Reconnecter Google Drive</span>
            </button>
          ) : (
            <div className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
              Henri a été prévenu pour reconnecter le stockage.
            </div>
          )}

          <button
            type="button"
            onClick={async () => {
              await loadStatus();
              if (onRefresh) onRefresh();
            }}
            disabled={loading}
            className="p-2 rounded-xl border border-border-subtle bg-surface-container-lowest hover:bg-surface-container text-on-surface-variant transition cursor-pointer"
            title="Rafraîchir le statut"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    </aside>
  );
}
