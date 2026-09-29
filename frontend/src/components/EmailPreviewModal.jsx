import React, { useEffect } from 'react';

export default function EmailPreviewModal({ isOpen, onClose, email }) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !email) return null;

  const formattedDate = email.created_at
    ? new Date(email.created_at).toLocaleString('fr-FR', {
        dateStyle: 'full',
        timeStyle: 'medium',
      })
    : "Aujourd'hui";

  const recipientsList = Array.isArray(email.recipients)
    ? email.recipients
    : (email.recipients ? [email.recipients] : []);

  const namesList = Array.isArray(email.recipients_names) && email.recipients_names.length > 0
    ? email.recipients_names
    : recipientsList;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="email-preview-title"
      className="fixed inset-0 z-[10000] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-4xl w-full flex flex-col max-h-[92vh] overflow-hidden my-auto animate-in zoom-in-95 duration-200">
        {/* En-tête de la modale */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xl" role="img" aria-label="enveloppe">📬</span>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 px-2.5 py-0.5 rounded-full">
                Aperçu de l'e-mail
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 px-2.5 py-0.5 rounded-full">
                Simulé (Coupe-circuit actif)
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>

          <h2
            id="email-preview-title"
            className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mt-1 leading-snug"
          >
            {email.subject || "Notification d'activité"}
          </h2>

          {/* Métadonnées de l'email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-400 mt-1 pt-2 border-t border-slate-200/80 dark:border-slate-800/80">
            <div>
              <span className="font-semibold text-slate-700 dark:text-slate-300">📅 Date d'émission :</span>{' '}
              {formattedDate}
            </div>
            {email.trigger_action && (
              <div>
                <span className="font-semibold text-slate-700 dark:text-slate-300">⚡ Événement déclencheur :</span>{' '}
                <span className="font-mono bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[11px]">
                  {email.trigger_action}
                </span>
              </div>
            )}
            <div className="sm:col-span-2 flex items-start gap-1 flex-wrap">
              <span className="font-semibold text-slate-700 dark:text-slate-300 shrink-0">👥 Destinataire(s) :</span>
              <div className="flex flex-wrap gap-1">
                {namesList.map((n, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-[11px] font-medium"
                  >
                    {n}
                  </span>
                ))}
                {recipientsList.length > 0 && namesList !== recipientsList && (
                  <span className="text-[11px] text-slate-500 italic ml-1 self-center">
                    ({recipientsList.join(', ')})
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Corps de l'email rendu dans une iframe sandboxée */}
        <div className="flex-1 bg-slate-100 dark:bg-slate-950 overflow-hidden relative min-h-[400px]">
          {email.html_content ? (
            <iframe
              title={`Aperçu email : ${email.subject}`}
              srcDoc={email.html_content}
              sandbox="allow-same-origin allow-popups"
              className="w-full h-[520px] sm:h-[560px] border-0 bg-[#f7f6f2]"
            />
          ) : (
            <div className="p-8 text-center text-slate-500">
              Aucun contenu HTML disponible pour cet e-mail.
            </div>
          )}
        </div>

        {/* Pied de page */}
        <div className="p-3 sm:p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <span>🛡️</span>
            <span>
              Coupe-circuit de sécurité actif : aucun flux réseau n'a été transmis à l'extérieur.
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs sm:text-sm px-4 py-2 rounded-xl shadow-sm transition-colors ml-auto cursor-pointer"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
