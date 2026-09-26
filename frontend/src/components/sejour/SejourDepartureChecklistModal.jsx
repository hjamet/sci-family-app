import React, { useState } from 'react';

const INITIAL_CHECKLIST = [
  { id: 'heat', label: "Baisser la consigne de chauffage à 12°C (Mode Hors-gel sur l'écran PAC)", done: true },
  { id: 'radiators', label: "Fermer les robinets thermostatiques des chambres d'étage", done: true },
  { id: 'water_heater', label: "Basculer le ballon d'eau chaude en mode Éco / Veille prolongée", done: false },
  { id: 'fridge', label: "Vider le réfrigérateur, couper l'alimentation et caler la porte entrouverte", done: false },
  { id: 'valve', label: "Fermer la vanne d'arrêt générale d'eau dans le cellier sous l'escalier", done: false },
  { id: 'waste', label: "Déposer les bacs au point de collecte Mesnil-sur-Iton (lundi matin)", done: false },
  { id: 'shutters', label: "Fermer tous les volets roulants et battants du rez-de-chaussée", done: false },
  { id: 'keys', label: "Verrouiller la porte principale et ranger le trousseau dans le boîtier à code", done: false },
];

export default function SejourDepartureChecklistModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  const [items, setItems] = useState(INITIAL_CHECKLIST);

  const toggleItem = (id) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, done: !item.done } : item))
    );
  };

  const handleCheckAll = () => {
    setItems((prev) => prev.map((item) => ({ ...item, done: true })));
  };

  const handleReset = () => {
    setItems((prev) => prev.map((item) => ({ ...item, done: false })));
  };

  const completedCount = items.filter((i) => i.done).length;
  const progressPercent = Math.round((completedCount / items.length) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-surface-container-lowest border border-border-subtle rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border-subtle pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-soft text-amber-rich flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[28px]">checklist_rtl</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-headline-md text-headline-md text-primary font-bold">
                  Protocole de Départ & Hors-Gel
                </h2>
              </div>
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

        {/* Progress Bar */}
        <div className="my-5 p-4 rounded-2xl bg-canvas-slate border border-border-subtle">
          <div className="flex items-center justify-between text-xs font-semibold mb-2">
            <span className="text-on-surface flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-primary">task_alt</span>
              Progression de la fermeture
            </span>
            <span className="text-primary font-bold">
              {completedCount} / {items.length} ({progressPercent}%)
            </span>
          </div>
          <div className="w-full h-3 bg-surface-container-high rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-600 to-primary transition-all duration-300 rounded-full"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
        </div>

        {/* Checklist items */}
        <div className="space-y-2.5 my-4">
          {items.map((item, idx) => (
            <div
              key={item.id}
              onClick={() => toggleItem(item.id)}
              className={`p-3.5 rounded-xl border flex items-center gap-3.5 cursor-pointer transition-all ${
                item.done
                  ? 'bg-sage-soft/40 border-sage-border text-on-surface shadow-xs'
                  : 'bg-white border-border-subtle text-on-surface-variant hover:border-outline-variant hover:bg-canvas-slate'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                  item.done
                    ? 'bg-primary border-primary text-white'
                    : 'border-outline-variant bg-white text-transparent'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">check</span>
              </div>
              <span className={`text-xs sm:text-sm font-medium leading-tight ${item.done ? 'line-through text-on-surface-variant' : 'text-on-surface font-semibold'}`}>
                {idx + 1}. {item.label}
              </span>
            </div>
          ))}
        </div>

        {/* Quick bulk actions */}
        <div className="flex items-center justify-between gap-2 pt-2 pb-4 text-xs">
          <button
            onClick={handleCheckAll}
            className="text-primary hover:text-forest-deep font-semibold flex items-center gap-1"
            type="button"
          >
            <span className="material-symbols-outlined text-[15px]">done_all</span>
            Tout cocher
          </button>
          <button
            onClick={handleReset}
            className="text-on-surface-variant hover:text-error font-semibold flex items-center gap-1"
            type="button"
          >
            <span className="material-symbols-outlined text-[15px]">restart_alt</span>
            Réinitialiser
          </button>
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border-subtle">
          <div className="text-xs text-on-surface-variant">
            {progressPercent === 100 ? (
              <span className="text-secondary font-bold flex items-center gap-1">
                <span className="material-symbols-outlined text-[18px]">verified</span>
                Domaine 100% sécurisé pour l'absence. Bon retour !
              </span>
            ) : (
              <span>Pensez à bien valider tous les points avant de quitter les lieux.</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 h-11 rounded-full bg-primary text-white font-label-md text-sm font-semibold hover:bg-forest-deep transition-colors shadow-sm"
            type="button"
          >
            Terminer et enregistrer
          </button>
        </div>

      </div>
    </div>
  );
}
