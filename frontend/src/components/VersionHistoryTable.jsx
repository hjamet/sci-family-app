import React, { useState, useEffect } from 'react';
import { fetchOnboardingHistory } from '../api';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d);
  } catch {
    return dateStr;
  }
}

export default function VersionHistoryTable({ onOpenOnboardingModal }) {
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchOnboardingHistory();
      if (Array.isArray(data)) {
        setReleases(data);
      } else {
        setReleases([]);
      }
    } catch (err) {
      console.warn('Erreur chargement historique des versions:', err);
      setError('Impossible de charger l\'historique des versions pour le moment.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const handleOpenRelease = (release) => {
    let parsedPages = null;
    if (release.pages_json) {
      try {
        parsedPages = typeof release.pages_json === 'string'
          ? JSON.parse(release.pages_json)
          : release.pages_json;
      } catch (e) {
        console.warn('Erreur parsing pages_json release:', e);
      }
    }

    if (onOpenOnboardingModal) {
      onOpenOnboardingModal(release.version, {
        release,
        pages: parsedPages,
        has_seen: true,
        needs_display: false,
      });
    }

    // Événement custom global
    window.dispatchEvent(
      new CustomEvent('open-onboarding', {
        detail: {
          version: release.version,
          release,
          pages: parsedPages,
        },
      })
    );
  };

  return (
    <section className="bg-surface-container-lowest rounded-3xl p-6 sm:p-7 border border-border-subtle shadow-xs space-y-5 animate-in fade-in duration-200">
      {/* En-tête de section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border-subtle/80">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-800 border border-emerald-200/80 flex items-center justify-center shrink-0 shadow-3xs">
            <span className="material-symbols-outlined text-[22px]">history_edu</span>
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold font-headline-md text-forest-deep flex items-center gap-2">
              <span>📜</span>
              <span>Historique des Versions & Notes de Mise à Jour (Patch Notes)</span>
            </h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Consultez l'historique complet des déploiements et rouvrez le guide explicatif ou le patch note de chaque version.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadHistory}
          disabled={loading}
          className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-emerald-800 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 transition-colors cursor-pointer"
          title="Actualiser la liste des versions"
        >
          <span className={`material-symbols-outlined text-[15px] ${loading ? 'animate-spin' : ''}`}>
            refresh
          </span>
          <span>Actualiser</span>
        </button>
      </div>

      {/* Contenu : Chargement, Erreur ou Tableau */}
      {loading ? (
        <div className="py-8 flex flex-col items-center justify-center gap-2 text-slate-500">
          <span className="material-symbols-outlined text-3xl animate-spin text-emerald-600">
            progress_activity
          </span>
          <span className="text-xs font-medium">Chargement des versions...</span>
        </div>
      ) : error ? (
        <div className="py-6 px-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-xs font-medium">
            <span className="material-symbols-outlined text-rose-600 text-lg">error</span>
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={loadHistory}
            className="text-xs font-bold underline hover:text-rose-950 cursor-pointer"
          >
            Réessayer
          </button>
        </div>
      ) : releases.length === 0 ? (
        <div className="py-8 text-center text-xs text-on-surface-variant">
          Aucune version enregistrée pour le moment.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border-subtle/80 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider bg-canvas-slate/50">
                <th className="py-3 px-4 rounded-l-xl">Version</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Titre & Contenu</th>
                <th className="py-3 px-4 text-right rounded-r-xl">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle/60 text-xs sm:text-sm">
              {releases.map((release) => {
                let pageCount = 0;
                if (release.pages_json) {
                  try {
                    const parsed = typeof release.pages_json === 'string'
                      ? JSON.parse(release.pages_json)
                      : release.pages_json;
                    if (Array.isArray(parsed)) {
                      pageCount = parsed.length;
                    }
                  } catch {
                    pageCount = 0;
                  }
                }

                const formattedVersion = release.version.startsWith('v')
                  ? release.version
                  : `v${release.version}`;

                return (
                  <tr
                    key={release.id || release.version}
                    className="hover:bg-slate-50/80 transition-colors group"
                  >
                    {/* Colonne 1 : Version */}
                    <td className="py-3.5 px-4 font-mono font-bold align-middle">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-emerald-100/80 text-emerald-900 border border-emerald-300 shadow-3xs">
                          <span className="material-symbols-outlined text-[14px] text-emerald-700">sell</span>
                          {formattedVersion}
                        </span>
                        {release.is_active && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Active
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Colonne 2 : Date */}
                    <td className="py-3.5 px-4 text-slate-700 font-medium whitespace-nowrap align-middle">
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[15px] text-slate-400">
                          calendar_today
                        </span>
                        <span>{formatDate(release.created_at)}</span>
                      </div>
                    </td>

                    {/* Colonne 3 : Titre */}
                    <td className="py-3.5 px-4 align-middle">
                      <div>
                        <div className="font-bold text-forest-deep text-xs sm:text-sm">
                          {release.title || 'Mise à jour SCI Familiale'}
                        </div>
                        {pageCount > 0 && (
                          <div className="text-[11px] text-on-surface-variant flex items-center gap-1 mt-0.5 font-medium">
                            <span className="material-symbols-outlined text-[13px] text-emerald-600">
                              menu_book
                            </span>
                            <span>{pageCount} section{pageCount > 1 ? 's' : ''} interactive{pageCount > 1 ? 's' : ''}</span>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Colonne 4 : Action */}
                    <td className="py-3.5 px-4 text-right align-middle whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleOpenRelease(release)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 hover:text-emerald-950 border border-emerald-200 hover:border-emerald-300 shadow-3xs hover:shadow-2xs transition-all cursor-pointer active:scale-95"
                        title={`Consulter le guide et les notes de la version ${formattedVersion}`}
                      >
                        <span className="material-symbols-outlined text-[16px]">visibility</span>
                        <span>Voir les notes</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
