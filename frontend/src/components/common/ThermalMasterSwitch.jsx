import React from 'react';

/**
 * ThermalMasterSwitch - Interrupteur / Sélecteur segmenté XXL Marche/Arrêt
 * Conforme aux directives UI Annotator d'Henri Jamet (Annotation 1 ECS & Annotation 2 Chauffage).
 * Composant tactile sobre, élégant, 100% asservi aux données dynamiques réelles.
 */
export default function ThermalMasterSwitch({
  isActive = false,
  onChange,
  disabled = false,
  offLabel = 'Arrêt',
  offSubtitle = 'Éteint / Veille',
  offIcon = 'power_settings_new',
  onLabel = 'Marche',
  onSubtitle = 'En marche / Chauffe active',
  onIcon = 'local_fire_department',
  className = '',
  ariaLabel = 'Interrupteur principal Marche / Arrêt'
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`w-full bg-slate-100/90 dark:bg-slate-800/80 p-1.5 rounded-2xl border border-border-subtle grid grid-cols-2 gap-2 shadow-inner select-none transition-opacity ${
        disabled ? 'opacity-50 pointer-events-none' : ''
      } ${className}`}
    >
      {/* Segment Arrêt */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(false)}
        className={`w-full py-3.5 px-3 rounded-xl transition-all duration-200 flex flex-col items-center justify-center gap-1 cursor-pointer text-center relative ${
          !isActive
            ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm border border-slate-200/90 dark:border-slate-600 ring-2 ring-slate-400/20'
            : 'text-slate-400 hover:text-slate-600 hover:bg-white/50 dark:text-slate-500 dark:hover:text-slate-300'
        }`}
        aria-pressed={!isActive}
        title={`Bascule en mode ${offLabel}`}
      >
        <div className="flex items-center justify-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 transition-colors ${
              !isActive ? 'bg-slate-500 dark:bg-slate-300' : 'bg-slate-300 dark:bg-slate-600'
            }`}
          />
          <span className="material-symbols-outlined text-[18px]">
            {offIcon}
          </span>
          <span className="text-sm sm:text-base font-extrabold tracking-wide uppercase">
            {offLabel}
          </span>
        </div>
        <span
          className={`text-[11px] font-medium leading-tight truncate max-w-full px-1 ${
            !isActive
              ? 'text-slate-600 dark:text-slate-300 font-semibold'
              : 'text-slate-400 dark:text-slate-500'
          }`}
        >
          {offSubtitle}
        </span>
      </button>

      {/* Segment Marche */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(true)}
        className={`w-full py-3.5 px-3 rounded-xl transition-all duration-200 flex flex-col items-center justify-center gap-1 cursor-pointer text-center relative ${
          isActive
            ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-900/20 border border-emerald-500/80 ring-2 ring-emerald-500/30'
            : 'text-slate-400 hover:text-slate-600 hover:bg-white/50 dark:text-slate-500 dark:hover:text-slate-300'
        }`}
        aria-pressed={isActive}
        title={`Bascule en mode ${onLabel}`}
      >
        <div className="flex items-center justify-center gap-2">
          {isActive ? (
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-200 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
            </span>
          ) : (
            <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0" />
          )}
          <span className="material-symbols-outlined text-[18px]">
            {onIcon}
          </span>
          <span className="text-sm sm:text-base font-extrabold tracking-wide uppercase">
            {onLabel}
          </span>
        </div>
        <span
          className={`text-[11px] font-medium leading-tight truncate max-w-full px-1 ${
            isActive ? 'text-emerald-100 font-semibold' : 'text-slate-400 dark:text-slate-500'
          }`}
        >
          {onSubtitle}
        </span>
      </button>
    </div>
  );
}
