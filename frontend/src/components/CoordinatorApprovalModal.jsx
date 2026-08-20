import React, { useState, useEffect } from 'react';
import {
  X, Upload, FileText, Vote, Zap, Euro, ShieldCheck, AlertCircle,
  Trash2, Paperclip, File, ExternalLink, Sparkles, Loader2, Scale, XCircle, CheckCircle2
} from 'lucide-react';
import { uploadProjectDocuments, approveProjectByCoordinator } from '../api';

export default function CoordinatorApprovalModal({ project, isOpen, onClose, onRefresh, onSuccess }) {
  if (!isOpen || !project) return null;

  const [estimatedCost, setEstimatedCost] = useState(
    project.estimated_cost !== undefined && project.estimated_cost !== null
      ? project.estimated_cost.toString()
      : '0'
  );
  const [coordinatorNotes, setCoordinatorNotes] = useState(project.coordinator_notes || '');
  const [classification, setClassification] = useState(project.classification || 'SIGNALEMENT');
  const [taskWeight, setTaskWeight] = useState(project.task_weight || 'MOYEN');
  const [documentUrls, setDocumentUrls] = useState(project.document_urls || []);

  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  // Validation criteria checks (5 Mandatory Fields)
  const parsedCost = parseFloat(estimatedCost);
  const isCostValid = estimatedCost !== '' && !isNaN(parsedCost) && parsedCost >= 0;
  const isNotesValid = coordinatorNotes.trim().length >= 5;
  const isDocsValid = Array.isArray(documentUrls) && documentUrls.length > 0;
  const isClassificationValid = classification === 'SIGNALEMENT' || classification === 'INITIATIVE';
  const isTaskWeightValid = ['MINEUR', 'MOYEN', 'MAJEUR', 'CRITIQUE'].includes(taskWeight);

  const isFormValid = isCostValid && isNotesValid && isDocsValid && isClassificationValid && isTaskWeightValid;

  // Sync props if project changes
  useEffect(() => {
    if (project) {
      setEstimatedCost(
        project.estimated_cost !== undefined && project.estimated_cost !== null
          ? project.estimated_cost.toString()
          : '0'
      );
      setCoordinatorNotes(project.coordinator_notes || '');
      setClassification(project.classification || 'SIGNALEMENT');
      setTaskWeight(project.task_weight || 'MOYEN');
      setDocumentUrls(project.document_urls || []);
      setErrorMsg(null);
    }
  }, [project]);


  const handleFileUpload = async (files) => {
    if (!files || files.length === 0) return;
    try {
      setIsUploading(true);
      setErrorMsg(null);
      const fileList = Array.from(files);
      const res = await uploadProjectDocuments(fileList);
      if (res && res.document_urls) {
        setDocumentUrls(prev => [...prev, ...res.document_urls]);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Erreur lors de l\'envoi des documents');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  const handleRemoveDoc = (indexToRemove) => {
    setDocumentUrls(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSubmit = async (decisionMode) => {
    if (!isFormValid) return;
    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      const costNum = parseFloat(estimatedCost);
      const finalCost = isNaN(costNum) ? 0.0 : Math.max(0, costNum);
      const newStatus = decisionMode === 'SOUMETTRE_AU_VOTE' 
        ? 'EN_VOTE' 
        : decisionMode === 'REFUSE' || decisionMode === 'REFUSER' 
        ? 'REFUSE' 
        : 'APPROUVE';

      const approvalPayload = {
        estimated_cost: finalCost,
        coordinator_notes: coordinatorNotes.trim() || null,
        document_urls: documentUrls,
        classification: classification,
        task_weight: taskWeight,
        status: newStatus,
        decision_mode: decisionMode,
        responsible: project.responsible || null
      };

      const updatedProject = await approveProjectByCoordinator(project.id, approvalPayload);

      if (onSuccess) {
        onSuccess(updatedProject);
      }
      if (onRefresh) {
        await onRefresh();
      }
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Erreur lors du traitement de la décision par le coordinateur');
    } finally {
      setIsSubmitting(false);
    }
  };


  const getFileName = (url) => {
    if (!url) return 'Document';
    const parts = url.split('/');
    const fullName = parts[parts.length - 1];
    // Remove UUID prefix if present (32 hex + underscore)
    if (fullName.length > 33 && fullName[32] === '_') {
      return fullName.substring(33);
    }
    return fullName;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 shadow-2xl relative text-slate-900">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 p-2 rounded-xl hover:bg-slate-100 transition z-10"
        >
          <X className="h-6 w-6" />
        </button>

        {/* Modal Header */}
        <div className="border-b border-slate-100 pb-4 mb-6 pr-12">
          <div className="flex items-center space-x-2 text-indigo-600 mb-1">
            <ShieldCheck className="h-5 w-5" />
            <span className="text-xs font-black uppercase tracking-wider">Espace Coordinateur (Henri)</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Approbation & Qualification du Projet
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Projet : <strong className="text-slate-800">{project.title}</strong> (Soumis par {project.submitted_by})
          </p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-xs flex items-center space-x-2">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form Body - 5 Structured Fields */}
        <div className="space-y-6">
          
          {/* FIELD 1: Coût Estimé (€) */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-2 flex items-center space-x-1.5">
              <Euro className="h-4 w-4 text-emerald-600" />
              <span>1. Coût Estimé (€)</span>
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={estimatedCost}
                onChange={(e) => setEstimatedCost(e.target.value)}
                className="w-full pl-4 pr-12 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-sm">€</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">
              Indiquez le montant approximatif des travaux ou du devis.
            </p>
          </div>

          {/* FIELD 2: Note du Coordinateur */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-2 flex items-center space-x-1.5">
              <FileText className="h-4 w-4 text-indigo-600" />
              <span>2. Note du Coordinateur</span>
            </label>
            <textarea
              rows={3}
              placeholder="Saisissez des recommandations, précisions techniques, artisans envisagés, devis associés..."
              value={coordinatorNotes}
              onChange={(e) => setCoordinatorNotes(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            />
          </div>

          {/* FIELD 3: Documents Multiples (Dropzone & Upload) */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-2 flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <Paperclip className="h-4 w-4 text-cyan-600" />
                <span>3. Documents Multiples (Devis, Plans, Factures)</span>
              </div>
              <span className="text-[10px] text-slate-500 font-normal">
                {documentUrls.length} document(s) joint(s)
              </span>
            </label>

            {/* Dropzone Container */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-5 text-center transition cursor-pointer bg-white ${
                dragOver ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-300 hover:border-indigo-400'
              }`}
            >
              <input
                type="file"
                multiple
                id="coord-doc-upload"
                className="hidden"
                onChange={(e) => handleFileUpload(e.target.files)}
                disabled={isUploading}
              />
              <label htmlFor="coord-doc-upload" className="cursor-pointer block">
                {isUploading ? (
                  <div className="flex flex-col items-center justify-center space-y-2 py-2">
                    <Loader2 className="h-7 w-7 text-indigo-600 animate-spin" />
                    <span className="text-xs font-bold text-indigo-600">Téléversement des documents en cours...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center space-y-1.5 py-1">
                    <Upload className="h-7 w-7 text-indigo-500" />
                    <span className="text-xs font-bold text-slate-800">
                      Glissez-déposez vos fichiers ici ou <span className="text-indigo-600 underline">parcourez</span>
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Supports: PDF, PNG, JPG, DOCX, XLSX (Stockage automatique dans <code className="bg-slate-100 px-1 py-0.5 rounded text-[9px]">/uploads/documents/</code>)
                    </span>
                  </div>
                )}
              </label>
            </div>

            {/* List of Attached Documents */}
            {documentUrls.length > 0 && (
              <div className="mt-3 space-y-2">
                {documentUrls.map((url, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-xl text-xs shadow-sm hover:border-slate-300 transition"
                  >
                    <div className="flex items-center space-x-2 min-w-0 pr-2">
                      <File className="h-4 w-4 text-indigo-600 shrink-0" />
                      <span className="font-semibold text-slate-800 truncate" title={getFileName(url)}>
                        {getFileName(url)}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 shrink-0">
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1 text-slate-400 hover:text-indigo-600 transition"
                        title="Voir le document"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      <button
                        type="button"
                        onClick={() => handleRemoveDoc(index)}
                        className="p-1 text-slate-400 hover:text-rose-600 transition"
                        title="Supprimer le document"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* FIELD 4: Classification (SIGNALEMENT vs INITIATIVE) */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-2 flex items-center space-x-1.5">
              <Sparkles className="h-4 w-4 text-amber-500" />
              <span>4. Classification du Projet</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setClassification('SIGNALEMENT')}
                className={`py-3 px-4 rounded-xl text-xs font-black flex items-center justify-center space-x-2 border transition shadow-sm ${
                  classification === 'SIGNALEMENT'
                    ? 'bg-rose-600 text-white border-rose-600 shadow-md ring-2 ring-rose-300'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span>🚨</span>
                <div className="text-left">
                  <div className="font-bold">SIGNALEMENT</div>
                  <div className="text-[10px] font-normal opacity-90">Incident / Réparation urgente</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setClassification('INITIATIVE')}
                className={`py-3 px-4 rounded-xl text-xs font-black flex items-center justify-center space-x-2 border transition shadow-sm ${
                  classification === 'INITIATIVE'
                    ? 'bg-amber-500 text-white border-amber-500 shadow-md ring-2 ring-amber-300'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span>💡</span>
                <div className="text-left">
                  <div className="font-bold">INITIATIVE</div>
                  <div className="text-[10px] font-normal opacity-90">Amélioration / Embellissement</div>
                </div>
              </button>
            </div>
          </div>

          {/* FIELD 5: Poids de la Tâche (MINEUR, MOYEN, MAJEUR, CRITIQUE) */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-2 flex items-center space-x-1.5">
              <Scale className="h-4 w-4 text-purple-600" />
              <span>5. Poids de la Tâche (Charge & Complexité)</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { value: 'MINEUR', label: '🟢 MINEUR', desc: 'Petite tâche' },
                { value: 'MOYEN', label: '🟡 MOYEN', desc: 'Effort modéré' },
                { value: 'MAJEUR', label: '🟠 MAJEUR', desc: 'Travaux importants' },
                { value: 'CRITIQUE', label: '🔴 CRITIQUE', desc: 'Urgence critique' },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setTaskWeight(item.value)}
                  className={`py-2.5 px-2 rounded-xl text-xs font-extrabold flex flex-col items-center justify-center border transition shadow-sm ${
                    taskWeight === item.value
                      ? 'bg-indigo-900 text-white border-indigo-900 ring-2 ring-indigo-400 shadow-md'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span>{item.label}</span>
                  <span className={`text-[9px] font-normal mt-0.5 ${taskWeight === item.value ? 'text-indigo-200' : 'text-slate-400'}`}>
                    {item.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Validation Status Indicator Checklist */}
        <div className={`mt-6 p-4 rounded-2xl border text-xs space-y-2 transition ${
          isFormValid
            ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
            : 'bg-amber-50/80 border-amber-200 text-amber-900'
        }`}>
          <div className="flex items-center justify-between font-extrabold">
            <span className="flex items-center space-x-1.5">
              {isFormValid ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
              )}
              <span>
                {isFormValid
                  ? 'Formulaire Pré-Décisionnel Complété — Décision Coordinateur Débloquée'
                  : '5 Champs Pré-Décisionnels Obligatoires à Compléter pour Débloquer la Décision :'}
              </span>
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/70 border border-slate-200">
              {[isCostValid, isNotesValid, isDocsValid, isClassificationValid, isTaskWeightValid].filter(Boolean).length}/5 valide(s)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 text-[11px] pt-1 border-t border-slate-200/60">
            <span className={`flex items-center space-x-1 font-semibold ${isCostValid ? 'text-emerald-700' : 'text-slate-500'}`}>
              <span>{isCostValid ? '✅' : '❌'}</span>
              <span>Coût estimé (≥ 0 €)</span>
            </span>
            <span className={`flex items-center space-x-1 font-semibold ${isNotesValid ? 'text-emerald-700' : 'text-slate-500'}`}>
              <span>{isNotesValid ? '✅' : '❌'}</span>
              <span>Note coordinateur (≥ 5 car.)</span>
            </span>
            <span className={`flex items-center space-x-1 font-semibold ${isDocsValid ? 'text-emerald-700' : 'text-slate-500'}`}>
              <span>{isDocsValid ? '✅' : '❌'}</span>
              <span>Document joint (≥ 1 fichier)</span>
            </span>
            <span className={`flex items-center space-x-1 font-semibold ${isClassificationValid ? 'text-emerald-700' : 'text-slate-500'}`}>
              <span>{isClassificationValid ? '✅' : '❌'}</span>
              <span>Classification sélectionnée</span>
            </span>
            <span className={`flex items-center space-x-1 font-semibold ${isTaskWeightValid ? 'text-emerald-700' : 'text-slate-500'}`}>
              <span>{isTaskWeightValid ? '✅' : '❌'}</span>
              <span>Poids de tâche sélectionné</span>
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-full sm:w-auto px-4 py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-bold rounded-xl transition"
          >
            Annuler
          </button>

          {/* 1. Refuser */}
          <button
            type="button"
            onClick={() => handleSubmit('REFUSE')}
            disabled={isSubmitting || isUploading || !isFormValid}
            className="w-full sm:w-auto px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold rounded-xl shadow transition flex items-center justify-center space-x-1.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            <span>❌ Refuser</span>
          </button>

          {/* 2. Soumettre au Vote */}
          <button
            type="button"
            onClick={() => handleSubmit('SOUMETTRE_AU_VOTE')}
            disabled={isSubmitting || isUploading || !isFormValid}
            className="w-full sm:w-auto px-4.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold rounded-xl shadow transition flex items-center justify-center space-x-1.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Vote className="h-4 w-4" />}
            <span>🗳️ Soumettre au Vote</span>
          </button>

          {/* 3. Valider & Approuver Directement */}
          <button
            type="button"
            onClick={() => handleSubmit('VALIDER_DIRECTEMENT')}
            disabled={isSubmitting || isUploading || !isFormValid}
            className="w-full sm:w-auto px-4.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl shadow transition flex items-center justify-center space-x-1.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            <span>⚡ Valider & Approuver Directement</span>
          </button>
        </div>


      </div>
    </div>
  );
}
