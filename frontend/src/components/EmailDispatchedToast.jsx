import React, { useState, useEffect, useRef } from 'react';

// Palette de couleurs pour les pastilles des associés
const MEMBER_COLORS = {
  henri: 'bg-emerald-700 text-emerald-100 border-emerald-500',
  marguerite: 'bg-indigo-700 text-indigo-100 border-indigo-500',
  hortense: 'bg-rose-700 text-rose-100 border-rose-500',
  eugenie: 'bg-amber-700 text-amber-100 border-amber-500',
  josephine: 'bg-purple-700 text-purple-100 border-purple-500',
  frederic: 'bg-teal-700 text-teal-100 border-teal-500',
  elizabeth: 'bg-cyan-700 text-cyan-100 border-cyan-500',
  default: 'bg-slate-700 text-slate-100 border-slate-500',
};

function getBadgeColor(name = '') {
  const clean = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [key, color] of Object.entries(MEMBER_COLORS)) {
    if (clean.includes(key)) return color;
  }
  return MEMBER_COLORS.default;
}

export default function EmailDispatchedToast({ onViewEmail }) {
  const [currentToast, setCurrentToast] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const handleEmailDispatched = (event) => {
      const email = event.detail;
      if (!email) return;

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      setCurrentToast({
        id: email.id || Date.now(),
        email: email,
      });

      // Durée 8s avant disparition automatique
      timerRef.current = setTimeout(() => {
        setCurrentToast(null);
      }, 8000);
    };

    window.addEventListener('email-dispatched', handleEmailDispatched);
    return () => {
      window.removeEventListener('email-dispatched', handleEmailDispatched);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!currentToast) return null;

  const { email } = currentToast;
  const names = email.recipients_names && email.recipients_names.length > 0
    ? email.recipients_names
    : (email.recipients || []);

  const isSent = (email.status === 'sent' && !email.is_simulated) || Boolean(email.delivered);

  const handleDismiss = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setCurrentToast(null);
  };

  const handleView = () => {
    if (onViewEmail) {
      onViewEmail(email);
    }
    handleDismiss();
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed bottom-5 right-5 z-[9999] max-w-sm sm:max-w-md w-full animate-in fade-in slide-in-from-bottom-5 duration-300"
    >
      <div className="bg-slate-900/95 backdrop-blur-md border border-emerald-500/40 text-slate-100 shadow-2xl rounded-2xl p-4 overflow-hidden relative">
        {/* Liseré émeraude décoratif en haut */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-600" />

        {/* En-tête du Toast */}
        <div className="flex items-center justify-between gap-2 mb-2 pt-0.5">
          <div className="flex items-center gap-2">
            <span className="text-lg" role="img" aria-label="courrier">✉️</span>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              Notification e-mail
            </span>
            {isSent ? (
              <span className="bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                Envoyé
              </span>
            ) : (
              <span className="bg-amber-950/80 text-amber-300 border border-amber-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                Simulé
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Fermer la notification"
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Sujet de l'e-mail */}
        <div className="text-sm font-semibold text-white mb-2 line-clamp-2 leading-snug">
          {email.subject || "Nouvelle notification d'activité"}
        </div>

        {/* Destinataires / Pastilles collaborateurs ciblés */}
        {names && names.length > 0 && (
          <div className="mb-3">
            <div className="text-[11px] text-slate-400 mb-1 font-medium">Destinataires :</div>
            <div className="flex flex-wrap gap-1.5 max-h-16 overflow-y-auto">
              {names.slice(0, 5).map((name, idx) => (
                <span
                  key={idx}
                  className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full border font-medium ${getBadgeColor(name)}`}
                >
                  {name}
                </span>
              ))}
              {names.length > 5 && (
                <span className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                  +{names.length - 5}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Bouton d'action et timer */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 mt-1">
          <span className="text-[11px] text-slate-400">
            {isSent ? 'Transmis via Resend' : 'Mode simulation actif (coupe-circuit)'}
          </span>
          <button
            type="button"
            onClick={handleView}
            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm transition-all cursor-pointer"
          >
            <span>👁️</span>
            <span>Voir le message</span>
          </button>
        </div>
      </div>
    </div>
  );
}
