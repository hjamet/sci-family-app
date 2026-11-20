import React, { useState, useEffect } from 'react';

const DISMISS_STORAGE_KEY = 'sci_pwa_install_dismissed_at';
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 jours

function isRunningStandalone() {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.matchMedia?.('(display-mode: standalone)').matches ||
      window.navigator?.standalone === true
  );
}

function isIosSafariBrowser() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIos = /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|Chrome/i.test(ua);
  return isIos && isSafari;
}

function wasRecentlyDismissed() {
  try {
    const raw = localStorage.getItem(DISMISS_STORAGE_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    return Number.isFinite(ts) && Date.now() - ts < DISMISS_TTL_MS;
  } catch (_) {
    return false;
  }
}

/**
 * Notification flottante Chrome/Edge/Android/PC/Mac (+ aide iOS Safari)
 * permettant d'installer le portail Domaine d'Hellenvilliers comme application web (PWA).
 */
export default function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(() =>
    typeof window !== 'undefined' ? window.__sciDeferredInstallPrompt || null : null
  );
  const [installed, setInstalled] = useState(() => isRunningStandalone());
  const [dismissed, setDismissed] = useState(() => wasRecentlyDismissed());
  const [installing, setInstalling] = useState(false);

  const isIos = isIosSafariBrowser();

  useEffect(() => {
    if (isRunningStandalone()) {
      setInstalled(true);
      return undefined;
    }

    const handleAvailable = () => {
      if (window.__sciDeferredInstallPrompt) {
        setDeferredPrompt(window.__sciDeferredInstallPrompt);
      }
    };

    const handleInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    if (window.__sciDeferredInstallPrompt) {
      setDeferredPrompt(window.__sciDeferredInstallPrompt);
    }

    window.addEventListener('sci-pwa-install-available', handleAvailable);
    window.addEventListener('sci-pwa-installed', handleInstalled);
    return () => {
      window.removeEventListener('sci-pwa-install-available', handleAvailable);
      window.removeEventListener('sci-pwa-installed', handleInstalled);
    };
  }, []);

  if (installed || dismissed) return null;
  if (!deferredPrompt && !isIos) return null;

  const handleInstallClick = async () => {
    const promptEvt = deferredPrompt || window.__sciDeferredInstallPrompt;
    if (!promptEvt) return;
    try {
      setInstalling(true);
      await promptEvt.prompt();
      const choice = await promptEvt.userChoice;
      if (choice?.outcome === 'accepted') {
        setInstalled(true);
        window.__sciDeferredInstallPrompt = null;
        setDeferredPrompt(null);
      } else {
        handleDismiss();
      }
    } catch (err) {
      console.warn('Prompt PWA interrompu:', err);
    } finally {
      setInstalling(false);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()));
    } catch (_) {}
  };

  return (
    <aside
      id="pwa-install-banner"
      role="region"
      aria-label="Installer l'application Domaine d'Hellenvilliers"
      className="bug-report-ignore fixed bottom-3 left-3 sm:bottom-5 sm:left-5 z-40 max-w-sm w-[calc(100vw-4.5rem)] sm:w-auto rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-primary/25 shadow-xl px-4 py-3 flex items-start gap-3 animate-in fade-in duration-200"
    >
      <img
        src="/icons/icon-192.png"
        alt="Domaine d'Hellenvilliers"
        className="w-10 h-10 rounded-xl shadow-xs shrink-0 mt-0.5"
      />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="text-xs font-bold text-forest-deep leading-snug">
            Installer Domaine d’Hellenvilliers
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Fermer la suggestion d'installation"
            className="text-slate-400 hover:text-slate-700 cursor-pointer -mt-0.5 -mr-1 p-0.5"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>

        {deferredPrompt ? (
          <>
            <p className="text-[11.5px] text-slate-600 leading-snug">
              Ajoutez l’application sur votre écran d’accueil ou votre bureau (Android, PC, Mac) pour y accéder en un clic.
            </p>
            <div className="flex items-center gap-2 pt-0.5">
              <button
                id="btn-pwa-install-confirm"
                type="button"
                disabled={installing}
                onClick={handleInstallClick}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-primary hover:bg-forest-deep text-white text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[15px]">install_mobile</span>
                <span>{installing ? 'Installation…' : 'Installer l’app'}</span>
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Plus tard
              </button>
            </div>
          </>
        ) : (
          <p className="text-[11.5px] text-slate-600 leading-snug">
            Sur iPhone / iPad : touchez <strong>Partager</strong> puis <strong>« Sur l’écran d’accueil »</strong> pour l’installer comme une app.
          </p>
        )}
      </div>
    </aside>
  );
}
