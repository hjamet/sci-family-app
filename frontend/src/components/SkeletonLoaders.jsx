import React from 'react';

/**
 * CardSkeleton : Carte générique avec animation de pulsation douce
 * Utilisée pour les chantiers, tâches et conteneurs d'information
 */
export function CardSkeleton({ className = '' }) {
  return (
    <div
      className={`animate-pulse bg-slate-100/90 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 rounded-2xl p-6 flex flex-col justify-between ${className}`}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-20 h-6 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
            <div className="w-24 h-6 bg-slate-200/80 dark:bg-slate-700/80 rounded-full"></div>
          </div>
          <div className="w-16 h-6 bg-slate-200/60 dark:bg-slate-700/60 rounded-full"></div>
        </div>

        <div className="w-3/4 h-5 bg-slate-200 dark:bg-slate-700 rounded-md mt-2"></div>
        <div className="w-full h-3.5 bg-slate-200/70 dark:bg-slate-700/70 rounded-md"></div>
        <div className="w-2/3 h-3.5 bg-slate-200/60 dark:bg-slate-700/60 rounded-md"></div>
      </div>

      <div className="pt-5 mt-4 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700"></div>
          <div className="w-24 h-3.5 bg-slate-200 dark:bg-slate-700 rounded-md"></div>
        </div>
        <div className="w-20 h-7 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
      </div>
    </div>
  );
}

/**
 * TasksContainerSkeleton : Affiche 3 ou N cartes squelettes de tâches
 */
export function TasksContainerSkeleton({ count = 3, className = '' }) {
  return (
    <>
      {Array.from({ length: count }).map((_, idx) => (
        <CardSkeleton key={idx} className={className} />
      ))}
    </>
  );
}

/**
 * TableSkeleton : Lignes de tableau grisées pulsantes
 */
export function TableSkeleton({ rows = 5, cols = 5, className = '' }) {
  return (
    <div className={`w-full overflow-hidden bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm ${className}`}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-100/80 dark:bg-slate-800 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
              {Array.from({ length: cols }).map((_, idx) => (
                <th key={idx} className="py-3 px-4">
                  <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-16 animate-pulse"></div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {Array.from({ length: rows }).map((_, rIdx) => (
              <tr key={rIdx} className="animate-pulse">
                {Array.from({ length: cols }).map((_, cIdx) => (
                  <td key={cIdx} className="py-3.5 px-4">
                    <div
                      className="h-3.5 bg-slate-200/80 dark:bg-slate-700/80 rounded"
                      style={{ width: `${Math.max(40, ((rIdx + cIdx) * 17) % 65 + 35)}%` }}
                    ></div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * ThermalMetricSkeleton : Tuile métrique thermique (ViCare / Klereo) avec cercle/valeur pulsante
 */
export function ThermalMetricSkeleton({ title = 'Chargement télémétrie...', className = '' }) {
  return (
    <div
      className={`animate-pulse p-5 rounded-2xl bg-canvas-slate/80 border border-border-subtle flex flex-col justify-between gap-5 shadow-sm min-w-0 ${className}`}
    >
      <div className="flex flex-col gap-4">
        {/* En-tête de la tuile */}
        <div className="flex items-center justify-between border-b border-border-subtle pb-3 gap-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700"></div>
            <div className="w-32 h-5 bg-slate-200 dark:bg-slate-700 rounded-md"></div>
          </div>
          <div className="w-20 h-5 bg-slate-200/80 dark:bg-slate-700/80 rounded-full"></div>
        </div>

        {/* 2 métriques en grille */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 bg-white/80 dark:bg-slate-800/80 rounded-xl border border-border-subtle flex flex-col gap-1.5 shadow-xs">
            <div className="w-20 h-3 bg-slate-200 dark:bg-slate-700 rounded"></div>
            <div className="w-14 h-6 bg-slate-200 dark:bg-slate-700 rounded-md"></div>
          </div>
          <div className="p-3 bg-white/80 dark:bg-slate-800/80 rounded-xl border border-border-subtle flex flex-col gap-1.5 shadow-xs">
            <div className="w-20 h-3 bg-slate-200 dark:bg-slate-700 rounded"></div>
            <div className="w-14 h-6 bg-slate-200 dark:bg-slate-700 rounded-md"></div>
          </div>
        </div>

        {/* Consigne / Régulateur */}
        <div className="p-3.5 bg-white/80 dark:bg-slate-800/80 rounded-xl border border-border-subtle flex items-center justify-between gap-2 shadow-sm">
          <div className="space-y-1">
            <div className="w-28 h-4 bg-slate-200 dark:bg-slate-700 rounded"></div>
            <div className="w-36 h-3 bg-slate-200/70 dark:bg-slate-700/70 rounded"></div>
          </div>
          <div className="w-28 h-9 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
        </div>

        {/* Modes de régulation */}
        <div className="space-y-1.5">
          <div className="w-28 h-3 bg-slate-200 dark:bg-slate-700 rounded"></div>
          <div className="grid grid-cols-3 gap-1.5 bg-white/80 dark:bg-slate-800/80 p-1 rounded-xl border border-border-subtle">
            <div className="h-8 bg-slate-200/80 dark:bg-slate-700/80 rounded-lg"></div>
            <div className="h-8 bg-slate-200/80 dark:bg-slate-700/80 rounded-lg"></div>
            <div className="h-8 bg-slate-200/80 dark:bg-slate-700/80 rounded-lg"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * VoteCardSkeleton : Squelette pour la bannière de scrutin / démocratie familiale
 */
export function VoteCardSkeleton({ className = '' }) {
  return (
    <div
      className={`animate-pulse bg-surface-container-low rounded-xl p-5 lg:p-6 border border-subtle flex flex-col gap-4 ${className}`}
    >
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="space-y-2 flex-1">
          <div className="flex items-center gap-2">
            <div className="w-36 h-6 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
            <div className="w-44 h-6 bg-slate-200/80 dark:bg-slate-700/80 rounded-full"></div>
          </div>
          <div className="w-2/3 h-6 bg-slate-200 dark:bg-slate-700 rounded-md mt-2"></div>
          <div className="w-full h-4 bg-slate-200/70 dark:bg-slate-700/70 rounded-md"></div>
          <div className="w-4/5 h-4 bg-slate-200/60 dark:bg-slate-700/60 rounded-md"></div>
        </div>
        <div className="flex flex-col items-start lg:items-end gap-1.5 shrink-0">
          <div className="w-36 h-4 bg-slate-200 dark:bg-slate-700 rounded"></div>
          <div className="w-28 h-4 bg-slate-200/70 dark:bg-slate-700/70 rounded"></div>
        </div>
      </div>

      {/* Barre de progression tri-segmentée */}
      <div className="w-full h-3 bg-slate-200/80 dark:bg-slate-700/80 rounded-full my-1"></div>

      {/* Répartition des votes */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-20 h-4 bg-slate-200 dark:bg-slate-700 rounded"></div>
          <div className="w-20 h-4 bg-slate-200 dark:bg-slate-700 rounded"></div>
          <div className="w-20 h-4 bg-slate-200 dark:bg-slate-700 rounded"></div>
        </div>
        <div className="w-24 h-4 bg-slate-200/60 dark:bg-slate-700/60 rounded"></div>
      </div>

      {/* Footer avec rapporteur et boutons */}
      <div className="border-t border-subtle pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-1">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700"></div>
          <div className="space-y-1">
            <div className="w-24 h-3.5 bg-slate-200 dark:bg-slate-700 rounded"></div>
            <div className="w-20 h-3 bg-slate-200/70 dark:bg-slate-700/70 rounded"></div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-28 h-9 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
          <div className="w-32 h-9 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
        </div>
      </div>
    </div>
  );
}

/**
 * StayCardSkeleton : Squelette pour un séjour dans le planning / calendrier
 */
export function StayCardSkeleton({ className = '' }) {
  return (
    <article
      className={`animate-pulse bg-surface-container-lowest rounded-2xl p-5 lg:p-6 shadow-sm border border-border-subtle ${className}`}
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="flex items-start sm:items-center gap-4 min-w-[240px]">
          <div className="w-14 h-14 rounded-2xl bg-slate-200 dark:bg-slate-700 shrink-0"></div>
          <div className="space-y-2">
            <div className="w-44 h-5 bg-slate-200 dark:bg-slate-700 rounded-md"></div>
            <div className="w-32 h-3.5 bg-slate-200/70 dark:bg-slate-700/70 rounded"></div>
          </div>
        </div>

        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-24 h-6 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
            <div className="w-28 h-6 bg-slate-200/80 dark:bg-slate-700/80 rounded-full"></div>
          </div>
          <div className="w-48 h-4 bg-slate-200 dark:bg-slate-700 rounded"></div>
          <div className="w-36 h-3 bg-slate-200/70 dark:bg-slate-700/70 rounded"></div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="w-20 h-8 bg-slate-200 dark:bg-slate-700 rounded-xl"></div>
          <div className="w-20 h-8 bg-slate-200 dark:bg-slate-700 rounded-xl"></div>
        </div>
      </div>
    </article>
  );
}

/**
 * BankMetricSkeleton : Squelette pour les tuiles de synthèse financière (Entrées, Sorties, Trésorerie)
 */
export function BankMetricSkeleton({ className = '' }) {
  return (
    <div
      className={`animate-pulse bg-surface-container-lowest rounded-lg p-space-md shadow-sm border border-border-subtle flex flex-col justify-between relative overflow-hidden ${className}`}
    >
      <div className="flex items-start justify-between gap-space-xs">
        <div className="space-y-2.5 flex-1">
          <div className="w-32 h-3.5 bg-slate-200 dark:bg-slate-700 rounded"></div>
          <div className="w-28 h-7 bg-slate-200 dark:bg-slate-700 rounded-md mt-1"></div>
        </div>
        <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0"></div>
      </div>
      <div className="mt-4 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div className="w-24 h-3 bg-slate-200/70 dark:bg-slate-700/70 rounded"></div>
      </div>
    </div>
  );
}
