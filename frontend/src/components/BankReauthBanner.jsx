import React, { useState, useEffect } from 'react';
import { AlertTriangle, RefreshCw, ExternalLink, Clock, ShieldAlert } from 'lucide-react';
import { fetchBankStatus, triggerBankSync, startBankAuth } from '../api';

export default function BankReauthBanner({
  bankStatus: propBankStatus,
  onRefresh,
  className = ''
}) {
  const [bankStatus, setBankStatus] = useState(propBankStatus || null);
  const [loading, setLoading] = useState(false);
  const [reauthLoading, setReauthLoading] = useState(false);
  const [localError, setLocalError] = useState(null);

  useEffect(() => {
    if (propBankStatus) {
      setBankStatus(propBankStatus);
    } else {
      loadStatus();
    }
  }, [propBankStatus]);

  const loadStatus = async () => {
    try {
      setLoading(true);
      const data = await fetchBankStatus();
      setBankStatus(data);
      setLocalError(null);
    } catch (err) {
      console.warn('Bank status fetch notice:', err.message);
      // Mode dégradé en cas d'erreur de communication API
      setBankStatus((prev) => prev || {
        status: 'error',
        needs_reauth: true,
        message: 'Liaison bancaire indisponible : impossible d\'interroger le service bancaire.',
        total_balance: 0.0,
        last_synced_at: null,
      });
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
        throw new Error('URL d\'autorisation indisponible');
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

  // RÈGLE D'OR HENRI : En temps normal (API fonctionnelle, statut OK, pas de ré-auth requise),
  // l'interface reste STRICTEMENT et TOTALEMENT épurée (ZÉRO bannière, ZÉRO message résiduel).
  if (!bankStatus || (!bankStatus.needs_reauth && bankStatus.status === 'ok')) {
    return null;
  }

  const isExpiringSoon = bankStatus.status === 'expiring_soon';
  const lastSyncTimestamp = bankStatus.last_successful_sync || bankStatus.last_synced_at;
  const formattedLastSync = lastSyncTimestamp
    ? new Date(lastSyncTimestamp).toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <aside
      role="alert"
      className={`rounded-2xl border-2 p-4 sm:p-5 shadow-sm transition-all duration-200 mb-space-md ${
        isExpiringSoon
          ? 'bg-amber-50/95 border-amber-300 text-amber-950'
          : 'bg-rose-50/95 border-rose-300 text-rose-950'
      } ${className}`}
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        
        {/* En-tête & Description */}
        <div className="flex items-start gap-3.5">
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

          <div className="space-y-1">
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

            {/* Mode Dégradé Sécurisé : Indication claire de la date du dernier relevé en cache */}
            <div className="flex items-center gap-1.5 pt-1 text-xs opacity-80">
              <Clock className="w-3.5 h-3.5" />
              <span>
                {formattedLastSync
                  ? `Dernière synchronisation réussie le ${formattedLastSync}.`
                  : 'Affichage des données en cache local.'}
              </span>
            </div>

            {localError && (
              <p className="text-xs text-rose-700 font-semibold pt-1">
                {localError}
              </p>
            )}
          </div>
        </div>

        {/* Boutons d'Action */}
        <div className="flex items-center gap-2.5 shrink-0 self-end lg:self-center">
          <button
            type="button"
            onClick={handleManualSync}
            disabled={loading || reauthLoading}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border text-xs font-semibold bg-white transition-all shadow-xs cursor-pointer ${
              isExpiringSoon
                ? 'border-amber-300 text-amber-900 hover:bg-amber-100/60'
                : 'border-rose-300 text-rose-900 hover:bg-rose-100/60'
            } disabled:opacity-50`}
            title="Tester l'interrogation de l'API bancaire"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Vérification...' : 'Tester'}</span>
          </button>

          <button
            type="button"
            onClick={handleReauth}
            disabled={reauthLoading}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white shadow-sm transition-all duration-150 active:scale-95 cursor-pointer whitespace-nowrap ${
              isExpiringSoon
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-rose-600 hover:bg-rose-700'
            } disabled:opacity-50`}
          >
            {reauthLoading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Connexion Tilisy...</span>
              </>
            ) : (
              <>
                <span>Renouveler via Tilisy</span>
                <ExternalLink className="w-4 h-4" />
              </>
            )}
          </button>
        </div>

      </div>
    </aside>
  );
}
