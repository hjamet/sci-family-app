import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { captureScreen } from '../utils/screenCapture';
import { generateDiagnosticReport } from '../utils/errorLogger';
import { uploadDocument, createTask, emitAppError } from '../api';

/**
 * BugReportButton (Annotation 5 — ultra-rapide et ultra-simple)
 * - Ouverture instantanée (< 10 ms) d'une modale dédiée à 1 seul champ (Description).
 * - Capture d'écran et logs techniques préparés en arrière-plan sans bloquer la saisie.
 * - Téléversement parallèle au clic Envoyer et création d'une tâche directement attribuée à Henri.
 */
export default function BugReportButton({ currentUser = null }) {
  const location = useLocation();
  const isMrCollinsPage =
    location.pathname === '/' ||
    location.pathname === '/grille-pain' ||
    location.pathname === '/mr-collins';

  const [isOpen, setIsOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [captureStatus, setCaptureStatus] = useState('idle'); // 'idle' | 'capturing' | 'ready' | 'unavailable'
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [successToast, setSuccessToast] = useState(null);

  const capturePromiseRef = useRef(null);
  const screenshotFileRef = useRef(null);
  const diagnosticTextRef = useRef('');
  const pageUrlRef = useRef('');
  const timestampRef = useRef('');
  const textareaRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 30);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !isSubmitting) {
        handleClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, isSubmitting]);

  const resolveReporterName = () => {
    if (currentUser && typeof currentUser === 'object') {
      return currentUser.name || currentUser.fullName || currentUser.prenom || 'Membre SCI';
    }
    if (typeof currentUser === 'string' && currentUser.trim()) return currentUser.trim();
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sci_user') || 'Membre SCI';
    }
    return 'Membre SCI';
  };

  const handleOpen = () => {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    timestampRef.current = ts;
    pageUrlRef.current = typeof window !== 'undefined' ? window.location.href : '';
    screenshotFileRef.current = null;
    setSubmitError(null);
    setDescription('');

    // 1. Logs techniques synchrones (~1 ms)
    try {
      diagnosticTextRef.current = generateDiagnosticReport();
    } catch (_) {
      diagnosticTextRef.current = `Date : ${new Date().toISOString()}\nURL : ${pageUrlRef.current}\n`;
    }

    // 2. Ouverture immédiate de la modale (< 25 ms), puis capture d'écran asynchrone en arrière-plan
    // (la modale porte la classe .bug-report-ignore donc html2canvas l'exclut proprement)
    setCaptureStatus('capturing');
    setIsOpen(true);

    capturePromiseRef.current = new Promise((resolve) => {
      setTimeout(() => {
        captureScreen(`capture_bug_${ts}.jpg`)
          .then((file) => {
            screenshotFileRef.current = file;
            setCaptureStatus('ready');
            resolve(file);
          })
          .catch((err) => {
            console.warn("Capture d'écran non disponible:", err);
            screenshotFileRef.current = null;
            setCaptureStatus('unavailable');
            resolve(null);
          });
      }, 25);
    });
  };

  const handleClose = () => {
    if (isSubmitting) return;
    setIsOpen(false);
    setDescription('');
    setSubmitError(null);
    capturePromiseRef.current = null;
    screenshotFileRef.current = null;
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    const trimmed = description.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const reporter = resolveReporterName();
      const ts = timestampRef.current || new Date().toISOString().replace(/[:.]/g, '-');
      const nowStr = new Date().toLocaleDateString('fr-FR');

      // Attendre la capture si elle n'est pas déjà finie (quasi instantané)
      let screenshotFile = screenshotFileRef.current;
      if (!screenshotFile && capturePromiseRef.current) {
        screenshotFile = await capturePromiseRef.current;
      }

      const diagnosticBlob = new Blob([diagnosticTextRef.current || 'Aucun log capturé.'], {
        type: 'text/plain;charset=utf-8',
      });
      const diagnosticFile = new File([diagnosticBlob], `rapport_diagnostic_${ts}.txt`, {
        type: 'text/plain;charset=utf-8',
      });

      // Téléversement parallèle de la capture et des logs (2x plus rapide)
      const uploadTasks = [];

      if (screenshotFile) {
        const fdScreen = new FormData();
        fdScreen.append('file', screenshotFile);
        fdScreen.append('organisme', 'Bug Reporter');
        fdScreen.append('title', `Capture bug - ${nowStr}`);
        fdScreen.append('category', 'Autre');
        fdScreen.append('uploaded_by', reporter);
        uploadTasks.push(
          uploadDocument(fdScreen)
            .then((doc) => ({ kind: 'screenshot', doc }))
            .catch((err) => {
              console.warn('Upload capture ignoré:', err);
              return null;
            })
        );
      }

      const fdDiag = new FormData();
      fdDiag.append('file', diagnosticFile);
      fdDiag.append('organisme', 'Bug Reporter');
      fdDiag.append('title', `Logs diagnostic - ${nowStr}.txt`);
      fdDiag.append('category', 'Autre');
      fdDiag.append('uploaded_by', reporter);
      uploadTasks.push(
        uploadDocument(fdDiag)
          .then((doc) => ({ kind: 'logs', doc }))
          .catch((err) => {
            console.warn('Upload diagnostic ignoré:', err);
            return null;
          })
      );

      const uploadResults = (await Promise.all(uploadTasks)).filter(Boolean);
      const docIds = [];
      const attachedDocs = [];
      uploadResults.forEach(({ kind, doc }) => {
        if (!doc?.id) return;
        docIds.push(doc.id);
        attachedDocs.push({
          id: doc.id,
          name: doc.title || (kind === 'screenshot' ? `Capture bug - ${nowStr}` : `Logs diagnostic - ${nowStr}.txt`),
          title: doc.title || (kind === 'screenshot' ? `Capture bug - ${nowStr}` : `Logs diagnostic - ${nowStr}.txt`),
          filename: doc.file_name || (kind === 'screenshot' ? `capture_bug_${ts}.jpg` : `rapport_diagnostic_${ts}.txt`),
          file_url: doc.file_url || `/api/documents/${doc.id}/download`,
          url: doc.file_url || `/api/documents/${doc.id}/download`,
          type: kind === 'screenshot' ? 'Image' : 'Text',
          size: doc.file_size ? `${Math.max(1, Math.round(doc.file_size / 1024))} Ko` : '',
          category: 'Autre',
          uploaded_at: new Date().toISOString(),
        });
      });

      // Titre automatique propre à partir de la description (l'utilisateur n'a rien à saisir d'autre)
      const firstLine = trimmed.split('\n')[0].trim();
      const shortSummary = firstLine.length > 68 ? `${firstLine.slice(0, 65)}…` : firstLine;
      const autoTitle = `[Bug] ${shortSummary}`;
      const fullDescription = `${trimmed}\n\n---\nSignalé par : ${reporter}\nPage : ${pageUrlRef.current || 'Inconnue'}`;

      await createTask({
        title: autoTitle,
        description: fullDescription,
        subject: 'SCI',
        category: 'Site Web & Bug',
        priority: 'Haute',
        complexity: 'Modérée',
        status: 'EN_COURS',
        is_bug_report: true,
        assigned_members: ['Henri Jamet'],
        checklist: [],
        documents: attachedDocs,
        document_ids: docIds,
        is_recurring: false,
        auto_assign_by_workload: false,
        created_by: reporter,
      });

      setIsOpen(false);
      setDescription('');
      setSuccessToast('Signalement envoyé à Henri avec la capture et les logs !');
      setTimeout(() => setSuccessToast(null), 4500);
    } catch (err) {
      console.error('Erreur soumission signalement bug:', err);
      const msg = err?.message || "Impossible d'envoyer le signalement.";
      setSubmitError(msg);
      emitAppError({
        url: '/api/tasks',
        method: 'POST',
        status: 500,
        message: msg,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {successToast && (
        <div className="bug-report-ignore fixed bottom-16 right-4 sm:bottom-20 sm:right-6 z-50 bg-forest-deep text-white px-4 py-2.5 rounded-full shadow-xl flex items-center gap-2 border border-emerald-400/30 text-xs font-semibold animate-in fade-in duration-200">
          <span className="material-symbols-outlined text-emerald-300 text-[18px]">check_circle</span>
          <span>{successToast}</span>
        </div>
      )}

      <div
        className={`bug-report-ignore fixed z-40 ${
          isMrCollinsPage
            ? 'top-[5.35rem] left-3 lg:top-auto lg:left-auto lg:bottom-5 lg:right-5'
            : 'bottom-3 right-3 sm:bottom-5 sm:right-5'
        }`}
      >
        <button
          id="btn-bug-report"
          type="button"
          onClick={handleOpen}
          title="Signaler un bug ou proposer une amélioration"
          aria-label="Signaler un bug ou proposer une amélioration"
          className="group relative w-9 h-9 sm:w-11 sm:h-11 rounded-full p-0 flex items-center justify-center bg-rose-700/90 hover:bg-rose-800 text-white shadow-md hover:shadow-xl transition-all duration-200 cursor-pointer border border-rose-300/40 hover:scale-105 active:scale-95"
        >
          <span className="material-symbols-outlined text-[18px] sm:text-[22px] transition-transform duration-200 group-hover:rotate-12">
            pest_control
          </span>
        </button>
      </div>

      {isOpen && (
        <div
          id="bug-report-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bug-report-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
          className="bug-report-ignore fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[2px] flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-border-subtle shadow-2xl overflow-hidden"
          >
            <div className="px-5 py-3.5 bg-rose-50/80 border-b border-rose-200/70 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-rose-700 text-white flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px]">pest_control</span>
                </span>
                <h2 id="bug-report-modal-title" className="font-headline-sm text-sm sm:text-base font-bold text-rose-950">
                  Signaler un bug ou une idée
                </h2>
              </div>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleClose}
                aria-label="Fermer"
                className="w-7 h-7 rounded-full hover:bg-rose-200/60 text-rose-800 flex items-center justify-center cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="p-5 space-y-3.5">
              <div className="space-y-1.5">
                <label
                  htmlFor="bug-report-description"
                  className="text-xs font-bold text-slate-700 block"
                >
                  Décrivez le problème ou l’amélioration souhaitée
                </label>
                <textarea
                  id="bug-report-description"
                  ref={textareaRef}
                  rows={5}
                  required
                  disabled={isSubmitting}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && description.trim()) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  placeholder="Ex : Quand je clique sur le bouton X, il ne se passe rien..."
                  className="w-full p-3 rounded-xl bg-slate-50 focus:bg-white border border-slate-200 focus:border-rose-500 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none resize-none leading-relaxed"
                />
              </div>

              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50/75 border border-emerald-200/80 text-[11.5px] text-emerald-950">
                <span
                  className={`material-symbols-outlined text-[16px] text-emerald-700 shrink-0 ${
                    captureStatus === 'capturing' ? 'animate-spin' : ''
                  }`}
                >
                  {captureStatus === 'capturing' ? 'progress_activity' : 'verified'}
                </span>
                <span>
                  Assigné automatiquement à <strong>Henri</strong> •{' '}
                  {captureStatus === 'capturing'
                    ? 'Capture d’écran & logs en préparation…'
                    : captureStatus === 'ready'
                    ? 'Capture d’écran & logs joints automatiquement'
                    : 'Logs techniques joints automatiquement'}
                </span>
              </div>

              {submitError && (
                <div className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs font-semibold">
                  {submitError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleClose}
                  className="px-4 py-2 rounded-full text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  id="btn-bug-report-submit"
                  type="submit"
                  disabled={isSubmitting || !description.trim()}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  <span className={`material-symbols-outlined text-[16px] ${isSubmitting ? 'animate-spin' : ''}`}>
                    {isSubmitting ? 'progress_activity' : 'send'}
                  </span>
                  <span>{isSubmitting ? 'Envoi en cours…' : 'Envoyer à Henri'}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
