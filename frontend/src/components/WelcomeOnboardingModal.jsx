import React, { useState, useEffect, useCallback } from 'react';
import { acknowledgeOnboarding } from '../api';

export default function WelcomeOnboardingModal({
  isOpen = false,
  onClose,
  release = null,
  pages = [],
  onAcknowledged,
}) {
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const totalPages = pages.length || 6;
  const currentPage = pages[currentPageIndex] || null;
  const isFirstPage = currentPageIndex === 0;
  const isLastPage = currentPageIndex === totalPages - 1;

  // Réinitialiser à la première page à chaque ouverture
  useEffect(() => {
    if (isOpen) {
      setCurrentPageIndex(0);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleNext = () => {
    if (!isLastPage) {
      setCurrentPageIndex((prev) => Math.min(prev + 1, totalPages - 1));
    }
  };

  const handlePrev = () => {
    if (!isFirstPage) {
      setCurrentPageIndex((prev) => Math.max(prev - 1, 0));
    }
  };

  const handleFinish = async () => {
    setIsSubmitting(true);
    try {
      const version = release?.version || '1.0.0';
      await acknowledgeOnboarding(version);
      if (onAcknowledged) {
        onAcknowledged(version);
      }
    } catch (err) {
      console.warn('Erreur acquittement onboarding:', err);
    } finally {
      setIsSubmitting(false);
      if (onClose) {
        onClose();
      }
    }
  };

  const handleSkip = async () => {
    setIsSubmitting(true);
    try {
      const version = release?.version || '1.0.0';
      await acknowledgeOnboarding(version);
      if (onAcknowledged) {
        onAcknowledged(version);
      }
    } catch (err) {
      console.warn('Erreur passage onboarding:', err);
    } finally {
      setIsSubmitting(false);
      if (onClose) {
        onClose();
      }
    }
  };

  // Raccourcis clavier (Flèches gauche/droite et Échap)
  const handleKeyDown = useCallback(
    (e) => {
      if (!isOpen) return;
      if (e.key === 'ArrowRight' && !isLastPage) {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft' && !isFirstPage) {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleSkip();
      }
    },
    [isOpen, isFirstPage, isLastPage, currentPageIndex]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!isOpen) return null;

  const progressPercent = Math.round(((currentPageIndex + 1) / totalPages) * 100);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200 select-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-modal-title"
    >
      <div className="relative w-full max-w-3xl bg-surface-container-lowest border border-border-subtle/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[88vh] text-on-surface animate-in zoom-in-95 duration-200">
        
        {/* Top Header : Badge release + Stepper + Bouton Fermer */}
        <div className="px-6 pt-5 pb-4 border-b border-border-subtle/60 bg-gradient-to-b from-surface-container-low/50 to-transparent">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20 shadow-2xs">
                <span className="material-symbols-outlined text-[15px]">auto_stories</span>
                {release?.version ? `Version ${release.version}` : 'Guide Pratique'}
              </span>
              <span className="hidden sm:inline-block text-xs font-semibold text-on-surface-variant">
                SCI Hellenvilliers
              </span>
            </div>

            {/* Bouton Fermer (croix) */}
            <button
              type="button"
              onClick={handleSkip}
              disabled={isSubmitting}
              className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-slate-200/60 transition-colors cursor-pointer"
              title="Fermer (Échap)"
              aria-label="Fermer"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          {/* Stepper Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-on-surface-variant">
              <span className="flex items-center gap-1.5 text-primary">
                <span className="material-symbols-outlined text-[16px]">
                  {currentPage?.icon || 'help'}
                </span>
                Page {currentPageIndex + 1} sur {totalPages}
              </span>
              <span className="text-slate-500 font-medium">{progressPercent}%</span>
            </div>

            {/* Barre de progression fine et moderne */}
            <div className="w-full bg-slate-200/80 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-primary h-1.5 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Mini-puces d'étapes cliquables */}
            <div className="flex items-center gap-1.5 pt-1">
              {pages.map((p, idx) => {
                const isActive = idx === currentPageIndex;
                const isPassed = idx < currentPageIndex;
                return (
                  <button
                    key={p.id || idx}
                    type="button"
                    onClick={() => setCurrentPageIndex(idx)}
                    className={`flex-1 h-1.5 rounded-full transition-all duration-200 cursor-pointer ${
                      isActive
                        ? 'bg-primary ring-2 ring-primary/30'
                        : isPassed
                        ? 'bg-emerald-600/70 hover:bg-emerald-600'
                        : 'bg-slate-200 hover:bg-slate-300'
                    }`}
                    title={`Aller à la page ${idx + 1} : ${p.title}`}
                    aria-label={`Étape ${idx + 1}`}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 sm:px-8 sm:py-6 space-y-6">
          {currentPage && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-3 duration-200" key={currentPage.id || currentPageIndex}>
              
              {/* En-tête de la page active */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-sage-soft text-primary flex items-center justify-center shrink-0 shadow-xs border border-sage-border/60">
                    <span className="material-symbols-outlined text-2xl">
                      {currentPage.icon || 'star'}
                    </span>
                  </div>
                  <div>
                    <h2 id="onboarding-modal-title" className="text-xl sm:text-2xl font-bold text-on-surface tracking-tight leading-snug">
                      {currentPage.title}
                    </h2>
                    {currentPage.subtitle && (
                      <p className="text-sm font-medium text-emerald-800/80">
                        {currentPage.subtitle}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Cartes d'explications ergonomiques */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
                {Array.isArray(currentPage.cards) && currentPage.cards.map((card, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-2xl bg-canvas-slate/80 hover:bg-canvas-slate border border-border-subtle/80 hover:border-primary/20 shadow-2xs transition-all duration-200 flex flex-col gap-2"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-white text-primary flex items-center justify-center shrink-0 border border-slate-200/80 shadow-3xs">
                        <span className="material-symbols-outlined text-[17px]">
                          {card.icon || 'check'}
                        </span>
                      </div>
                      <h3 className="font-bold text-sm text-on-surface leading-tight">
                        {card.title}
                      </h3>
                    </div>
                    <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed whitespace-pre-line pl-9.5">
                      {card.text}
                    </p>
                  </div>
                ))}
              </div>

              {/* Fallback si format simple paragraphe */}
              {(!currentPage.cards || currentPage.cards.length === 0) && Array.isArray(currentPage.paragraphs) && (
                <div className="space-y-3">
                  {currentPage.paragraphs.map((p, idx) => (
                    <div key={idx} className="p-4 rounded-2xl bg-canvas-slate border border-border-subtle text-sm text-on-surface-variant leading-relaxed">
                      {typeof p === 'string' ? p : p.text || p.title}
                    </div>
                  ))}
                </div>
              )}

            </div>
          )}
        </div>

        {/* Modal Footer : Navigation boutons */}
        <div className="px-6 py-4 border-t border-border-subtle/80 bg-surface-container-low/40 flex items-center justify-between gap-3">
          
          {/* Bouton Passer */}
          <button
            type="button"
            onClick={handleSkip}
            disabled={isSubmitting}
            className="text-xs sm:text-sm font-semibold text-slate-500 hover:text-slate-800 px-3 py-2 rounded-xl hover:bg-slate-200/50 transition-colors cursor-pointer"
          >
            Passer le guide
          </button>

          {/* Boutons Précédent & Suivant / Terminer */}
          <div className="flex items-center gap-2">
            {!isFirstPage && (
              <button
                type="button"
                onClick={handlePrev}
                disabled={isSubmitting}
                className="px-4 py-2.5 rounded-xl border border-border-subtle bg-white hover:bg-slate-50 text-on-surface text-xs sm:text-sm font-semibold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                Précédent
              </button>
            )}

            {!isLastPage ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-white text-xs sm:text-sm font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer hover:shadow-md"
              >
                Suivant
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinish}
                disabled={isSubmitting}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-700 via-primary to-emerald-900 hover:from-emerald-800 hover:to-emerald-950 text-white text-xs sm:text-sm font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Enregistrement...
                  </>
                ) : (
                  <>
                    C'est parti !
                    <span className="text-base">🚀</span>
                  </>
                )}
              </button>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
