import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  RefreshCw,
  ShieldAlert,
  HardDrive
} from 'lucide-react';
import { fetchDriveStatus } from '../api';

/**
 * DriveReauthBanner
 * Bandeau d'alerte non actionnable pour l'état du stockage Google Drive.
 * Visible EXCLUSIVEMENT pour Henri (propriétaire du stockage).
 * Aucun bouton ni flux de reconnexion in-app (le jeton est géré en variable d'environnement).
 */
export default function DriveReauthBanner({
  driveStatus: propDriveStatus,
  onRefresh,
  currentUser,
  className = ''
}) {
  const [driveStatus, setDriveStatus] = useState(propDriveStatus || null);
  const [loading, setLoading] = useState(false);

  // Identification stricte du compte d'Henri (pas de rôle coordinateur générique)
  const isHenri = Boolean(
    (typeof currentUser === 'string' && currentUser.toLowerCase().includes('henri')) ||
    (currentUser?.prenom && currentUser.prenom.toLowerCase().includes('henri')) ||
    (currentUser?.name && currentUser.name.toLowerCase().includes('henri')) ||
    (currentUser?.fullName && currentUser.fullName.toLowerCase().includes('henri')) ||
    (currentUser?.email && (
      currentUser.email.toLowerCase().includes('henri') ||
      currentUser.email.toLowerCase().includes('hellenvillierssci')
    ))
  );

  useEffect(() => {
    if (propDriveStatus) {
      setDriveStatus(propDriveStatus);
    } else if (isHenri) {
      loadStatus();
    }
  }, [propDriveStatus, isHenri]);

  const loadStatus = async () => {
    try {
      setLoading(true);
      const data = await fetchDriveStatus();
      setDriveStatus(data);
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

  // 1. Strict confinement d'affichage : Henri uniquement
  if (!isHenri) {
    return null;
  }

  // 2. Statut connecté : aucun affichage d'alerte nécessaire
  if (driveStatus?.connected) {
    return null;
  }

  // 3. Statut en cours de premier chargement
  if (!driveStatus && loading) {
    return null;
  }

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
                Google Drive déconnecté
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

            <p className="text-xs sm:text-sm font-medium leading-relaxed opacity-95 max-w-3xl">
              Google Drive déconnecté : régénérer le jeton (procédure dans la note d'accès).
            </p>

            <div className="text-xs opacity-80 pt-0.5">
              💡 Les envois légers (&le; 3.5 Mo) restent opérationnels. Les pièces volumineuses sont suspendues.
            </div>
          </div>
        </div>

        {/* Bouton de contrôle (rafraîchissement du statut uniquement, non actionnable sur le jeton) */}
        <div className="flex items-center gap-2.5 shrink-0 self-start lg:self-center">
          <button
            type="button"
            onClick={async () => {
              await loadStatus();
              if (onRefresh) onRefresh();
            }}
            disabled={loading}
            className="p-2 rounded-xl border border-border-subtle bg-surface-container-lowest hover:bg-surface-container text-on-surface-variant transition cursor-pointer"
            title="Rafraîchir le statut Google Drive"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    </aside>
  );
}
