import React, { useState } from 'react';

export default function SejourEditModal({ stayData, isOpen, onClose, onSave }) {
  if (!isOpen) return null;

  const [arrivalDate, setArrivalDate] = useState(stayData?.arrivalDate || 'Vendredi 19 Oct. • 18h00');
  const [departureDate, setDepartureDate] = useState(stayData?.departureDate || 'Dimanche 25 Oct. • 18h00');
  const [stayStatus, setStayStatus] = useState(stayData?.status || 'Mission technique sur place');
  const [weekLabel, setWeekLabel] = useState(stayData?.weekLabel || 'Semaine 42 (Automne 2026)');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (onSave) {
      onSave({
        arrivalDate,
        departureDate,
        status: stayStatus,
        weekLabel
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-surface-container-lowest border border-border-subtle rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border-subtle pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-sage-soft text-primary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[26px]">edit_calendar</span>
            </div>
            <div>
              <h2 className="font-headline-md text-headline-md text-primary font-bold">
                Paramètres du Séjour au Domaine
              </h2>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Mise à jour des dates et statut pour les associés
              </p>
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 my-6">
          <div>
            <label className="block text-xs font-bold text-on-surface mb-1.5">
              Période & Semaine
            </label>
            <input
              type="text"
              value={weekLabel}
              onChange={(e) => setWeekLabel(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-canvas-slate border border-border-subtle rounded-xl text-xs font-semibold text-on-surface focus:outline-none focus:border-primary"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-on-surface mb-1.5">
              Type / Statut de la venue
            </label>
            <input
              type="text"
              value={stayStatus}
              onChange={(e) => setStayStatus(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-canvas-slate border border-border-subtle rounded-xl text-xs font-semibold text-on-surface focus:outline-none focus:border-primary"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-on-surface mb-1.5">
                Date & Heure d'Arrivée
              </label>
              <input
                type="text"
                value={arrivalDate}
                onChange={(e) => setArrivalDate(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-canvas-slate border border-border-subtle rounded-xl text-xs font-semibold text-on-surface focus:outline-none focus:border-primary"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-on-surface mb-1.5">
                Date & Heure de Départ
              </label>
              <input
                type="text"
                value={departureDate}
                onChange={(e) => setDepartureDate(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-canvas-slate border border-border-subtle rounded-xl text-xs font-semibold text-on-surface focus:outline-none focus:border-primary"
                required
              />
            </div>
          </div>

          {/* Occupants Info notice */}
          <div className="p-3.5 rounded-xl bg-sage-soft/40 border border-sage-border text-xs text-on-surface-variant flex items-start gap-2">
            <span className="material-symbols-outlined text-[18px] text-primary shrink-0 mt-0.5">
              info
            </span>
            <span>
              Les modifications de dates synchronisent automatiquement le préchauffage de la pompe à chaleur et la mise en hors-gel automatique.
            </span>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-4 border-t border-border-subtle">
            <button
              onClick={onClose}
              type="button"
              className="w-full sm:w-auto px-5 h-11 rounded-full bg-canvas-slate border border-border-subtle text-on-surface font-label-md text-xs font-semibold hover:bg-surface-container transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="w-full sm:w-auto px-6 h-11 rounded-full bg-primary text-white font-label-md text-xs font-bold hover:bg-forest-deep transition-colors shadow-sm"
            >
              Enregistrer les modifications
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
