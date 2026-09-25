import React from 'react';

export default function SejourTaskModal({ task, isOpen, onClose, onToggleComplete }) {
  if (!isOpen || !task) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-surface-container-lowest border border-border-subtle rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border-subtle pb-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
              task.priorityType === 'high' ? 'bg-amber-soft text-amber-rich' : 'bg-sage-soft text-primary'
            }`}>
              <span className="material-symbols-outlined text-[26px]">
                {task.priorityType === 'high' ? 'warning' : 'construction'}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                  task.priorityType === 'high' ? 'bg-amber-rich text-white' : 'bg-sage-soft text-primary'
                }`}>
                  {task.priority}
                </span>
                <span className="text-xs font-semibold text-on-surface-variant">
                  {task.date}
                </span>
              </div>
              <h2 className="font-headline-md text-base sm:text-lg text-primary font-bold mt-1">
                {task.title}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-canvas-slate hover:bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors"
            type="button"
            aria-label="Fermer"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 my-6">
          {/* Description */}
          <div className="p-4 rounded-2xl bg-canvas-slate border border-border-subtle">
            <span className="text-[11px] font-bold uppercase tracking-wider text-outline block mb-1">
              Description de la mission
            </span>
            <p className="text-xs sm:text-sm text-on-surface leading-relaxed">
              {task.description}
            </p>
          </div>

          {/* Budget & Responsibles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-white border border-border-subtle shadow-xs">
              <span className="text-[11px] text-on-surface-variant font-medium block">
                {task.budgetType || 'Budget prévisionnel'}
              </span>
              <span className={`font-headline-sm font-bold text-sm ${
                task.priorityType === 'high' ? 'text-amber-rich' : 'text-forest-deep'
              }`}>
                {task.budget}
              </span>
            </div>
            <div className="p-3.5 rounded-xl bg-white border border-border-subtle shadow-xs">
              <span className="text-[11px] text-on-surface-variant font-medium block">
                Responsable & Intervenant
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xs font-bold text-on-surface">{task.assignee}</span>
                <span className="text-xs text-on-surface-variant">({task.partner})</span>
              </div>
            </div>
          </div>

          {/* Detailed Points */}
          {task.details && task.details.points && (
            <div className="p-4 rounded-2xl bg-white border border-border-subtle shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-primary block mb-2">
                Points de contrôle & opérations à réaliser
              </span>
              <ul className="space-y-2">
                {task.details.points.map((pt, index) => (
                  <li key={index} className="flex items-start gap-2 text-xs text-on-surface leading-relaxed">
                    <span className="material-symbols-outlined text-[15px] text-primary shrink-0 mt-0.5">
                      check_circle
                    </span>
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Artisan Contact if present */}
          {task.details && task.details.artisan && (
            <div className="p-3.5 rounded-xl bg-amber-soft/40 border border-amber-rich/30 flex items-center justify-between gap-3">
              <div>
                <span className="text-[11px] font-bold text-amber-rich block">
                  Contact Artisan Partenaire
                </span>
                <span className="text-xs font-semibold text-on-surface">
                  {task.details.artisan}
                </span>
              </div>
              <a
                href="tel:0232351200"
                className="px-3 py-1.5 rounded-lg bg-amber-rich text-white font-label-sm text-xs font-bold flex items-center gap-1 hover:bg-amber-700 transition-colors shadow-xs"
              >
                <span className="material-symbols-outlined text-[15px]">call</span>
                Appeler
              </a>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-border-subtle">
          <button
            onClick={() => {
              if (onToggleComplete) onToggleComplete(task.id);
              onClose();
            }}
            className={`w-full sm:w-auto px-5 h-11 rounded-full font-label-md text-xs font-bold flex items-center justify-center gap-2 transition-colors ${
              task.status === 'completed'
                ? 'bg-sage-soft text-primary border border-sage-border'
                : 'bg-primary text-white hover:bg-forest-deep'
            }`}
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">
              {task.status === 'completed' ? 'published_with_changes' : 'task_alt'}
            </span>
            <span>
              {task.status === 'completed' ? 'Marquer comme à revoir' : 'Valider la mission réalisée'}
            </span>
          </button>
          
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 h-11 rounded-full bg-canvas-slate border border-border-subtle text-on-surface font-label-md text-xs font-semibold hover:bg-surface-container transition-colors"
            type="button"
          >
            Fermer
          </button>
        </div>

      </div>
    </div>
  );
}
