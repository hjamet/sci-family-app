import React, { useState } from 'react';
import { captureScreen } from '../utils/screenCapture';
import { generateDiagnosticReport } from '../utils/errorLogger';
import { uploadDocument, emitAppError } from '../api';

/**
 * BugReportButton
 * Bouton flottant permanent en bas à droite permettant à tout utilisateur de signaler
 * un bug ou une amélioration avec capture d'écran automatique et journal de diagnostic technique.
 */
export default function BugReportButton({ onOpenBugReport, currentUser = null }) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleClick = async () => {
    if (isProcessing) return;

    try {
      setIsProcessing(true);

      const resolvedUploader = (
        currentUser && typeof currentUser === 'object'
          ? (currentUser.name || currentUser.fullName || currentUser.prenom || currentUser.id)
          : (typeof currentUser === 'string' && currentUser ? currentUser : null)
      ) || (typeof window !== 'undefined' ? localStorage.getItem('sci_user') : null) || 'Membre SCI';

      // 1. Capture d'écran de l'état actuel de l'application
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const screenshotFile = await captureScreen(`capture_bug_${timestamp}.png`);

      // 2. Génération du rapport de diagnostic technique (logs d'erreurs, console, viewport, etc.)
      const diagnosticText = generateDiagnosticReport();
      const diagnosticBlob = new Blob([diagnosticText], { type: 'text/plain;charset=utf-8' });
      const diagnosticFile = new File([diagnosticBlob], `rapport_diagnostic_${timestamp}.txt`, {
        type: 'text/plain;charset=utf-8',
      });

      // 3. Téléversement automatique des 2 pièces jointes via uploadDocument
      const nowStr = new Date().toLocaleDateString('fr-FR');

      // 3a. Téléversement de la capture d'écran
      const fdScreenshot = new FormData();
      fdScreenshot.append('file', screenshotFile);
      fdScreenshot.append('organisme', 'Bug Reporter');
      fdScreenshot.append('title', `Capture d'écran - ${nowStr}`);
      fdScreenshot.append('category', 'Travaux & Chantiers');
      fdScreenshot.append('uploaded_by', resolvedUploader);
      const uploadedScreenshot = await uploadDocument(fdScreenshot);

      // 3b. Téléversement du rapport de diagnostic
      const fdReport = new FormData();
      fdReport.append('file', diagnosticFile);
      fdReport.append('organisme', 'Bug Reporter');
      fdReport.append('title', `Rapport technique diagnostic - ${nowStr}.txt`);
      fdReport.append('category', 'Travaux & Chantiers');
      fdReport.append('uploaded_by', resolvedUploader);
      const uploadedReport = await uploadDocument(fdReport);

      const tempDocIds = [uploadedScreenshot?.id, uploadedReport?.id].filter(Boolean);

      // 4. Préparation des documents attachés normalisés pour TaskDetailModal
      const attachedDocs = [
        {
          id: uploadedScreenshot?.id,
          name: uploadedScreenshot?.title || `Capture d'écran - ${nowStr}`,
          title: uploadedScreenshot?.title || `Capture d'écran - ${nowStr}`,
          filename: uploadedScreenshot?.file_name || `capture_bug_${timestamp}.png`,
          file_url: uploadedScreenshot?.file_url || `/api/documents/${uploadedScreenshot?.id}/download`,
          url: uploadedScreenshot?.file_url || `/api/documents/${uploadedScreenshot?.id}/download`,
          type: 'Image',
          size: uploadedScreenshot?.file_size ? `${Math.round(uploadedScreenshot.file_size / 1024)} Ko` : '',
          category: 'Travaux & Chantiers',
          uploaded_at: new Date().toISOString(),
        },
        {
          id: uploadedReport?.id,
          name: uploadedReport?.title || `Rapport technique diagnostic - ${nowStr}.txt`,
          title: uploadedReport?.title || `Rapport technique diagnostic - ${nowStr}.txt`,
          filename: uploadedReport?.file_name || `rapport_diagnostic_${timestamp}.txt`,
          file_url: uploadedReport?.file_url || `/api/documents/${uploadedReport?.id}/download`,
          url: uploadedReport?.file_url || `/api/documents/${uploadedReport?.id}/download`,
          type: 'Text',
          file_type: 'text/plain',
          size: uploadedReport?.file_size ? `${Math.round(uploadedReport.file_size / 1024)} Ko` : '',
          category: 'Travaux & Chantiers',
          uploaded_at: new Date().toISOString(),
        },
      ];

      // 5. Structure de la tâche de signalement pré-remplie et assignée à Henri Jamet
      const bugTaskData = {
        title: `Signalement Bug / Amélioration (${resolvedUploader} - ${nowStr})`,
        description: '',
        subject: 'SCI',
        category: 'Travaux & Chantiers',
        complexity: 'Modérée',
        assigned_members: ['Henri Jamet'],
        assignee: 'Henri Jamet',
        status: 'PROPOSED',
        isBugReport: true,
        checklist: [
          { text: "Analyser l'anomalie ou la proposition d'amélioration", done: false },
          { text: 'Reproduire ou valider le besoin sur environnement de test', done: false },
          { text: 'Déployer le correctif / l\'optimisation', done: false },
          { text: 'Valider avec le membre ayant fait le retour', done: false },
        ],
        documents: attachedDocs,
        onsite_presence: false,
        is_recurring: false,
        auto_assign_by_workload: false,
      };

      if (onOpenBugReport) {
        onOpenBugReport({
          task: bugTaskData,
          tempUploadedDocIds: tempDocIds,
        });
      }
    } catch (err) {
      console.error('Erreur lors du déclenchement du Bug Reporter:', err);
      emitAppError({
        url: '/api/documents/upload',
        method: 'POST',
        status: 500,
        message: `Échec de l'initialisation du rapport de bug : ${err.message || 'Erreur inconnue'}`,
      });
      alert(`Impossible d'initialiser le rapport de bug : ${err.message || 'Erreur technique'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bug-report-ignore fixed bottom-6 right-6 z-40">
      <button
        id="btn-bug-report"
        type="button"
        disabled={isProcessing}
        onClick={handleClick}
        title="Signaler un bug ou proposer une amélioration"
        aria-label="Signaler un bug ou proposer une amélioration"
        className="group relative w-12 h-12 rounded-full p-0 flex items-center justify-center bg-rose-700 hover:bg-rose-800 text-white shadow-lg hover:shadow-xl transition-all duration-200 cursor-pointer border-2 border-rose-400/40 hover:scale-105 active:scale-95 disabled:opacity-75 disabled:pointer-events-none"
      >
        {isProcessing ? (
          <span className="material-symbols-outlined text-[22px] animate-spin">
            progress_activity
          </span>
        ) : (
          <>
            <span className="material-symbols-outlined text-[24px] transition-transform duration-200 group-hover:rotate-12">
              pest_control
            </span>
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-300"></span>
            </span>
          </>
        )}
      </button>
    </div>
  );
}
