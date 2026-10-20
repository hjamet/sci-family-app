import React from 'react';

/**
 * Modale de confirmation réutilisable pour l'abandon de modifications non enregistrées.
 * Utilisée dans TaskDetailModal, VoteRoofModal et BookingModal.
 */
export default function DiscardChangesModal({
  isOpen,
  onCancel,
  onConfirm,
  title = 'Modifications non enregistrées',
  message = 'Vous avez modifié des informations sans les enregistrer. Voulez-vous vraiment quitter sans enregistrer vos modifications ?',
  confirmText = 'Quitter sans enregistrer',
  cancelText = 'Continuer la saisie',
}) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 m-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-surface-container-lowest rounded-2xl p-6 max-w-md w-full shadow-2xl border border-border-subtle space-y-4 animate-in zoom-in-95 duration-150">
        <div className="flex items-center gap-3 text-amber-700 dark:text-amber-400">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[24px]">warning</span>
          </div>
          <h3 className="font-bold text-base text-on-surface">
            {title}
          </h3>
        </div>
        <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">
          {message}
        </p>
        <div className="pt-2 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface font-semibold text-xs sm:text-sm transition-colors cursor-pointer"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs sm:text-sm transition-colors cursor-pointer shadow-sm active:scale-95"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
