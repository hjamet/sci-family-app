import React from 'react';

/**
 * ThermalMasterSwitch - Interrupteur / Sélecteur segmenté Marche/Arrêt épuré
 * Conforme aux directives UI Annotator v8 d'Henri Jamet (Annotations 3 & 4) :
 * - Arrêt actif : fond rouge doux (bg-red-50 dark:bg-red-950/40), bordure rouge (border-red-300 dark:border-red-800), texte et icône rouge vif (text-red-700 dark:text-red-300)
 * - Marche actif : fond vert émeraude doux (bg-emerald-50 dark:bg-emerald-950/40), bordure émeraude (border-emerald-300 dark:border-emerald-800), texte et icône vert vif (text-emerald-700 dark:text-emerald-300)
 * - Épuration stricte : Zéro sous-titre encombrant, boutons compacts, épurés et tactiles.
 * - Harmonisation universelle des icônes/emojis.
 */
export default function ThermalMasterSwitch({
  isActive = false,
  onChange,
  disabled = false,
  offLabel = 'Arrêt',
  offIcon = 'power_settings_new',
  onLabel = 'Marche',
  onIcon = 'local_fire_department',
  className = '',
  ariaLabel = 'Interrupteur principal Marche / Arrêt'
}) {
  const renderIcon = (icon) => {
    if (!icon) return null;
    if (/\p{Extended_Pictographic}/u.test(icon) || icon.length <= 2) {
      return <span className="text-[18px] leading-none select-none">{icon}</span>;
    }
    return <span className="material-symbols-outlined text-[18px] leading-none select-none">{icon}</span>;
  };

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
        className={`w-full py-2.5 sm:py-3 px-3 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer text-center relative ${
          !isActive
            ? 'bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 shadow-sm ring-2 ring-red-400/20'
            : 'text-slate-400 hover:text-slate-600 hover:bg-white/50 dark:text-slate-500 dark:hover:text-slate-300 border border-transparent'
        }`}
        aria-pressed={!isActive}
        title={`Bascule en mode ${offLabel}`}
      >
        <span
          className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
            !isActive ? 'bg-red-600 dark:bg-red-400' : 'bg-slate-300 dark:bg-slate-600'
          }`}
        />
        {renderIcon(offIcon)}
        <span className="text-xs sm:text-sm font-extrabold tracking-wide uppercase">
          {offLabel}
        </span>
      </button>

      {/* Segment Marche */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(true)}
        className={`w-full py-2.5 sm:py-3 px-3 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer text-center relative ${
          isActive
            ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 shadow-sm ring-2 ring-emerald-400/20'
            : 'text-slate-400 hover:text-slate-600 hover:bg-white/50 dark:text-slate-500 dark:hover:text-slate-300 border border-transparent'
        }`}
        aria-pressed={isActive}
        title={`Bascule en mode ${onLabel}`}
      >
        {isActive ? (
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600 dark:bg-emerald-400"></span>
          </span>
        ) : (
          <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0" />
        )}
        {renderIcon(onIcon)}
        <span className="text-xs sm:text-sm font-extrabold tracking-wide uppercase">
          {onLabel}
        </span>
      </button>
    </div>
  );
}
