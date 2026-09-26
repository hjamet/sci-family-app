import React, { useState, useRef, useEffect } from 'react';

/**
 * CustomSelect - Sélecteur déroulant moderne, accessible et ergonomique
 * Remplace avantageusement les balises <select> natives disgracieuses
 * 
 * Props:
 * - value: Valeur sélectionnée
 * - onChange: Callback déclenché à la sélection (reçoit { target: { value, name } } pour compatibilité totale avec les handlers de formulaires)
 * - options: Array d'options [{ value, label, icon, badge, dotColor, disabled }] ou Array de strings/nombres
 * - placeholder: Texte indicatif si aucune valeur sélectionnée
 * - className: Classes Tailwind additionnelles pour le bouton conteneur
 * - dropdownClassName: Classes additionnelles pour le menu flottant
 * - disabled: Si true, désactive le sélecteur
 * - id: Identifiant HTML pour accessibilité
 * - name: Nom de champ de formulaire
 */
export default function CustomSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Sélectionner...',
  className = '',
  dropdownClassName = '',
  disabled = false,
  id,
  name,
  ariaLabel,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Normalise les options qu'elles soient passées sous forme d'objets ou de valeurs scalaires
  const normalizedOptions = React.useMemo(() => {
    return options.map((opt) => {
      if (opt !== null && typeof opt === 'object') {
        return {
          value: opt.value !== undefined ? opt.value : opt.id,
          label: opt.label !== undefined ? opt.label : (opt.name || String(opt.value)),
          icon: opt.icon || null,
          badge: opt.badge || null,
          dotColor: opt.dotColor || null,
          disabled: Boolean(opt.disabled),
        };
      }
      return {
        value: opt,
        label: String(opt),
        icon: null,
        badge: null,
        dotColor: null,
        disabled: false,
      };
    });
  }, [options]);

  // Trouve l'option active correspondant à la valeur courante
  const selectedOption = normalizedOptions.find(
    (opt) => String(opt.value) === String(value)
  ) || null;

  // Fermeture automatique au clic à l'extérieur
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (opt) => {
    if (opt.disabled || disabled) return;

    if (typeof onChange === 'function') {
      // Fournit un événement synthétique compatible avec e.target.value
      // tout en supportant les callbacks attendant directement la valeur
      const syntheticEvent = {
        target: { value: opt.value, name: id || name },
        currentTarget: { value: opt.value, name: id || name },
        value: opt.value,
      };
      onChange(syntheticEvent);
    }
    setIsOpen(false);
  };

  return (
    <div className={`relative w-full ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`} ref={containerRef}>
      {/* Bouton ergonomique fermé */}
      <button
        type="button"
        id={id}
        name={name}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel || placeholder}
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={`w-full min-h-[44px] bg-white dark:bg-surface-container border border-slate-200 dark:border-slate-700/80 rounded-xl px-3.5 py-2 text-sm flex items-center justify-between gap-2 shadow-xs hover:border-slate-300 dark:hover:border-slate-600 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary select-none ${className}`}
      >
        <div className="flex items-center gap-2.5 truncate min-w-0">
          {selectedOption?.dotColor && (
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${selectedOption.dotColor}`} />
          )}
          {selectedOption?.icon && (
            <span className="material-symbols-outlined text-[18px] text-primary shrink-0">
              {selectedOption.icon}
            </span>
          )}
          <span className={`truncate ${selectedOption ? 'text-slate-800 dark:text-slate-100 font-medium' : 'text-slate-400 dark:text-slate-500'}`}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          {selectedOption?.badge && (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary shrink-0">
              {selectedOption.badge}
            </span>
          )}
        </div>

        <span
          className={`material-symbols-outlined text-[20px] text-slate-400 dark:text-slate-500 transition-transform duration-200 shrink-0 ${
            isOpen ? 'rotate-180 text-primary' : ''
          }`}
        >
          expand_more
        </span>
      </button>

      {/* Menu déroulant flottant positionné en dessous */}
      {isOpen && (
        <div
          role="listbox"
          tabIndex={-1}
          className={`absolute left-0 mt-1.5 w-full min-w-[200px] z-50 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-100 dark:border-slate-800 py-1.5 max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-150 ${dropdownClassName}`}
        >
          {normalizedOptions.length === 0 ? (
            <div className="px-3.5 py-2.5 text-xs text-slate-400 dark:text-slate-500 text-center italic">
              Aucune option disponible
            </div>
          ) : (
            normalizedOptions.map((opt, idx) => {
              const isSelected = String(opt.value) === String(value);

              return (
                <div
                  key={`${opt.value}-${idx}`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(opt)}
                  className={`px-3.5 py-2.5 text-sm flex items-center justify-between gap-2.5 cursor-pointer transition-colors ${
                    opt.disabled
                      ? 'opacity-40 cursor-not-allowed bg-slate-50/50'
                      : isSelected
                      ? 'text-primary font-semibold bg-primary/5 dark:bg-primary/10'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate min-w-0">
                    {opt.dotColor && (
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${opt.dotColor}`} />
                    )}
                    {opt.icon && (
                      <span className="material-symbols-outlined text-[18px] text-primary shrink-0">
                        {opt.icon}
                      </span>
                    )}
                    <span className="truncate">{opt.label}</span>
                    {opt.badge && (
                      <span className="px-2 py-0.2 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {opt.badge}
                      </span>
                    )}
                  </div>

                  {isSelected && (
                    <span className="material-symbols-outlined text-[18px] text-primary shrink-0">
                      check
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
