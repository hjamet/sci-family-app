import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  fetchDocumentCategories,
  createDocumentCategory,
  fetchDriveStatus,
  createMemberExpense
} from '../api';
import { uploadUniversalDocument, friendlyErrorMessage } from '../utils/fileUpload';
import { resolveUserMeta } from '../utils/taskAssignment';
import CustomSelect from './CustomSelect';
import CategoryManageModal from './CategoryManageModal';
import TagMultiSelect from './TagMultiSelect';

const COLOR_OPTIONS = [
  { id: 'slate', name: 'Ardoise', bg: 'bg-slate-500', text: 'text-slate-700', border: 'border-slate-500', badgeBg: 'bg-slate-100 text-slate-800 border-slate-200' },
  { id: 'emerald', name: 'Émeraude', bg: 'bg-emerald-500', text: 'text-emerald-700', border: 'border-emerald-500', badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { id: 'amber', name: 'Ambre', bg: 'bg-amber-500', text: 'text-amber-700', border: 'border-amber-500', badgeBg: 'bg-amber-100 text-amber-800 border-amber-200' },
  { id: 'purple', name: 'Pourpre', bg: 'bg-purple-500', text: 'text-purple-700', border: 'border-purple-500', badgeBg: 'bg-purple-100 text-purple-800 border-purple-200' },
  { id: 'rose', name: 'Bordeaux', bg: 'bg-rose-700', text: 'text-rose-700', border: 'border-rose-700', badgeBg: 'bg-rose-100 text-rose-800 border-rose-200' },
  { id: 'sky', name: 'Bleu ciel', bg: 'bg-sky-500', text: 'text-sky-700', border: 'border-sky-500', badgeBg: 'bg-sky-100 text-sky-800 border-sky-200' },
  { id: 'teal', name: 'Vert sauge', bg: 'bg-teal-600', text: 'text-teal-700', border: 'border-teal-600', badgeBg: 'bg-teal-100 text-teal-800 border-teal-200' },
  { id: 'wood', name: 'Chêne', bg: 'bg-yellow-800', text: 'text-yellow-800', border: 'border-yellow-800', badgeBg: 'bg-amber-100 text-amber-900 border-amber-200' }
];

const EMOJI_PRESETS = ['📁', '🏛️', '💶', '🔧', '⚖️', '🛡️', '📜', '📬', '🏠', '📝', '💡', '🌳'];

/**
 * UploadDocumentModal
 * Composant universel de téléversement et indexation canonique de documents administratifs.
 * Utilisable dans :
 * - Page Administratif
 * - Détail de tâche (TaskDetailModal)
 * - Discussion familiale (FamilyChat)
 *
 * Conforme aux Annotations 10 & 11 et à la règle Fail-Fast & DRY radical.
 */
export default function UploadDocumentModal({
  isOpen,
  onClose,
  onUploadSuccess,
  targetTaskId = null,
  targetProjectId = null,
  defaultCategory = null,
  currentUser = null,
  initialFile = null
}) {
  const [categoriesList, setCategoriesList] = useState([]);
  const [uploadOrganisme, setUploadOrganisme] = useState('');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadTags, setUploadTags] = useState(() => (defaultCategory ? [defaultCategory] : []));
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isSubmittingUpload, setIsSubmittingUpload] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState('');
  const [uploadPercent, setUploadPercent] = useState(0);
  const [payerType, setPayerType] = useState('sci'); // 'sci' | 'member'
  const [advanceAmount, setAdvanceAmount] = useState('');

  // Création dynamique d'une nouvelle catégorie
  const [isNewCategoryOpen, setIsNewCategoryOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatEmoji, setNewCatEmoji] = useState('📁');
  const [newCatColor, setNewCatColor] = useState('slate');
  const [isCreatingCat, setIsCreatingCat] = useState(false);

  // Édition / suppression d'une catégorie existante (Annotation 1)
  const [isEditCategoryModalOpen, setIsEditCategoryModalOpen] = useState(false);
  const [selectedCategoryToEdit, setSelectedCategoryToEdit] = useState(null);
  const [driveStatus, setDriveStatus] = useState(null);

  const fileDropInputRef = useRef(null);

  // Chargement des catégories réelles
  const loadCategories = async () => {
    try {
      const cats = await fetchDocumentCategories();
      if (Array.isArray(cats) && cats.length > 0) {
        setCategoriesList(cats);
        setUploadTags((prev) => {
          if (prev.length > 0) return prev;
          const matched = defaultCategory ? cats.find(c => c.name.toLowerCase() === defaultCategory.toLowerCase()) : null;
          return [matched ? matched.name : cats[0].name];
        });
      }
    } catch (err) {
      console.warn('Erreur chargement des catégories de documents:', err);
    }
  };

  const checkDriveStatus = async () => {
    try {
      const status = await fetchDriveStatus();
      setDriveStatus(status);
    } catch {
      // Ignorer silencieusement si API inaccessible
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadCategories();
      checkDriveStatus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (defaultCategory) {
      setUploadTags((prev) => (prev.includes(defaultCategory) ? prev : [defaultCategory, ...prev]));
    }
  }, [defaultCategory]);

  useEffect(() => {
    if (initialFile && isOpen) {
      setUploadFile(initialFile);
      setUploadedFileName(initialFile.name);
      if (!uploadTitle) {
        const base = initialFile.name.substring(0, initialFile.name.lastIndexOf('.')) || initialFile.name;
        setUploadTitle(base);
      }
    }
  }, [initialFile, isOpen]);

  // Réinitialisation à la fermeture
  useEffect(() => {
    if (!isOpen) {
      setUploadOrganisme('');
      setUploadTitle('');
      setUploadFile(null);
      setUploadedFileName('');
      setIsDraggingFile(false);
      setIsSubmittingUpload(false);
      setIsNewCategoryOpen(false);
      setNewCatName('');
      setNewCatEmoji('📁');
      setNewCatColor('slate');
      setSelectedCategoryToEdit(null);
      setUploadTags(defaultCategory ? [defaultCategory] : (categoriesList[0] ? [categoriesList[0].name] : []));
      setUploadProgressText('');
      setUploadPercent(0);
      setPayerType('sci');
      setAdvanceAmount('');
    }
  }, [isOpen]);

  // Nom de fichier canonique en temps réel : [ORGANISME] [MMAAAA] [Titre].[ext]
  const canonicalFileName = useMemo(() => {
    const org = (uploadOrganisme || '').trim() || 'ORGANISME';
    const title = (uploadTitle || '').trim() || 'Titre du document';
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = String(now.getFullYear());
    const mmaaaa = `${mm}${yyyy}`;

    let ext = '.pdf';
    if (uploadedFileName) {
      const lastDot = uploadedFileName.lastIndexOf('.');
      if (lastDot !== -1) {
        ext = uploadedFileName.substring(lastDot);
      }
    }
    return `${org} ${mmaaaa} ${title}${ext}`;
  }, [uploadOrganisme, uploadTitle, uploadedFileName]);

  // Création d'une catégorie
  const handleCreateCategorySubmit = async () => {
    if (!newCatName.trim()) return;
    try {
      setIsCreatingCat(true);
      const created = await createDocumentCategory({
        name: newCatName.trim(),
        emoji: newCatEmoji || '📁',
        color: newCatColor || 'slate'
      });
      setCategoriesList((prev) => [...prev, created]);
      setUploadTags((prev) => [...prev, created.name]);
      setIsNewCategoryOpen(false);
      setNewCatName('');
      setNewCatEmoji('📁');
      setNewCatColor('slate');
    } catch (err) {
      alert(`Erreur création catégorie : ${err.message || 'Impossible de créer la catégorie'}`);
    } finally {
      setIsCreatingCat(false);
    }
  };

  // Soumission de l'upload universel avec chunking automatique et gestion d'erreurs claire
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!uploadOrganisme.trim() || !uploadTitle.trim() || !uploadFile) {
      alert("Veuillez renseigner l'organisme, le titre et sélectionner un fichier.");
      return;
    }

    if (payerType === 'member') {
      const parsedAmount = parseFloat(advanceAmount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        alert("Veuillez renseigner un montant valide pour votre avance de frais (ex : 45.50).");
        return;
      }
    }

    setIsSubmittingUpload(true);
    setUploadPercent(5);
    setUploadProgressText("Préparation du document...");

    try {
      const userMeta = resolveUserMeta(currentUser);
      const deposant = userMeta.name || 'Henri Jamet';

      const primaryCat = uploadTags.length > 0 ? uploadTags.join(', ') : (categoriesList[0]?.name || defaultCategory || 'Travaux & Chantiers');
      const finalTags = uploadTags.length > 0 ? uploadTags : [primaryCat];

      const newDoc = await uploadUniversalDocument(
        uploadFile,
        {
          organisme: uploadOrganisme.trim(),
          title: uploadTitle.trim(),
          category: primaryCat,
          tags: finalTags,
          task_id: targetTaskId,
          project_id: targetProjectId,
          uploaded_by: deposant
        },
        (percent, statusText) => {
          setUploadPercent(percent);
          setUploadProgressText(statusText);
        }
      );

      // Si le membre a avancé les frais, créer l'avance de frais liée au document
      if (payerType === 'member') {
        try {
          const expenseFormData = new FormData();
          expenseFormData.append('member_id', String(userMeta.id || 1));
          expenseFormData.append('title', uploadTitle.trim());
          expenseFormData.append('amount', String(parseFloat(advanceAmount)));
          expenseFormData.append('category', primaryCat);
          if (newDoc && newDoc.id) {
            expenseFormData.append('document_id', String(newDoc.id));
          }
          expenseFormData.append('notes', `Avance déclarée lors du dépôt de document : ${uploadTitle.trim()}`);
          await createMemberExpense(expenseFormData);
        } catch (expErr) {
          console.error("Erreur création avance de frais liée:", expErr);
          alert(`Document déposé avec succès, mais l'enregistrement de l'avance a échoué : ${expErr.message || expErr}`);
        }
      }

      if (onUploadSuccess) {
        await onUploadSuccess(newDoc);
      }

      onClose();
    } catch (err) {
      console.error('Erreur téléversement document universel:', err);
      const friendlyMsg = friendlyErrorMessage(err);
      window.dispatchEvent(new CustomEvent('app-error', {
        detail: {
          message: friendlyMsg,
          status: err.status || 500,
          endpoint: '/api/documents/upload'
        }
      }));
      alert(friendlyMsg);
    } finally {
      setIsSubmittingUpload(false);
      setUploadProgressText('');
      setUploadPercent(0);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="modal-upload-document"
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[70] bg-inverse-surface/50 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150"
    >
      <div className="bg-surface-container-lowest w-full max-w-lg rounded-2xl shadow-[0_20px_48px_-12px_rgba(15,23,42,0.25)] border border-border-subtle relative flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* En-tête de la modale */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border-subtle shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-full bg-sage-soft flex items-center justify-center text-primary shrink-0">
              <span className="material-symbols-outlined text-[22px]">upload_file</span>
            </div>
            <div>
              <h3 className="font-headline-sm text-base sm:text-lg text-forest-deep font-bold">
                Déposer un document
              </h3>
              <p className="font-body-md text-xs text-on-surface-variant">
                {targetTaskId
                  ? `Indexation et association à la tâche #${targetTaskId}`
                  : targetProjectId
                  ? `Indexation et association au scrutin`
                  : "Dépôt dans l'espace documentaire de la SCI"}
              </p>
            </div>
          </div>
          <button
            id="btn-close-upload-modal"
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-surface-container text-on-surface-variant flex items-center justify-center transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Formulaire d'upload avec corps scrollable et pied fixe */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          
          <div className="overflow-y-auto p-4 sm:p-5 space-y-4 flex-1">
            {/* Zone Drag & Drop */}
            <div>
              <label className="block font-label-md text-xs font-bold text-on-surface mb-1.5">
                Fichier (PDF ou image) *
              </label>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingFile(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingFile(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingFile(false);
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    const file = e.dataTransfer.files[0];
                    setUploadFile(file);
                    setUploadedFileName(file.name);
                    if (!uploadTitle) {
                      const base = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
                      setUploadTitle(base);
                    }
                  }
                }}
                onClick={() => fileDropInputRef.current?.click()}
                className={`border-2 border-dashed rounded-DEFAULT p-space-md flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                  isDraggingFile
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                    : uploadFile
                    ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20'
                    : 'border-border-subtle hover:border-primary bg-surface-container-low'
                }`}
              >
                <span className={`material-symbols-outlined text-[36px] mb-1 ${uploadFile ? 'text-emerald-600' : 'text-primary'}`}>
                  {uploadFile ? 'task' : 'cloud_upload'}
                </span>
                <span className="font-label-md text-sm text-on-surface font-semibold">
                  {uploadedFileName ? uploadedFileName : "Glissez votre document ici ou parcourez vos dossiers"}
                </span>
                <span className="font-body-md text-xs text-on-surface-variant mt-0.5">
                  {uploadFile ? "Fichier sélectionné prêt pour l'envoi" : "Format PDF recommandé, scan ou photo (Max 25 Mo)"}
                </span>
                <input
                  ref={fileDropInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.webp,.heic,.heif,image/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      const file = e.target.files[0];
                      setUploadFile(file);
                      setUploadedFileName(file.name);
                      if (!uploadTitle) {
                        const base = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
                        setUploadTitle(base);
                      }
                    }
                  }}
                />
              </div>

              {/* Avertissement / Info sur fichiers volumineux */}
              {uploadFile && uploadFile.size > 3.5 * 1024 * 1024 && (
                driveStatus && !driveStatus.connected ? (
                  <div className="mt-2.5 p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950 flex items-start gap-2.5">
                    <span className="material-symbols-outlined text-[18px] text-amber-700 shrink-0 mt-0.5">warning</span>
                    <div className="leading-relaxed">
                      <span className="font-bold">Stockage volumineux : </span>
                      Ce document fait {(uploadFile.size / (1024 * 1024)).toFixed(1)} Mo. Le stockage Google Drive est temporairement déconnecté (jeton expiré). Henri peut le reconnecter en 1 clic dans l'onglet Administratif.
                    </div>
                  </div>
                ) : (
                  <div className="mt-2.5 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-emerald-600 shrink-0">cloud_done</span>
                    <span>Fichier volumineux ({(uploadFile.size / (1024 * 1024)).toFixed(1)} Mo) pris en charge par le relais Google Drive.</span>
                  </div>
                )
              )}
            </div>

            {/* Champ 1 : Organisme */}
            <div>
              <label htmlFor="modal-doc-organisme-input" className="block font-label-md text-xs font-bold text-on-surface mb-1">
                1. Organisme émetteur ou destinataire *
              </label>
              <input
                id="modal-doc-organisme-input"
                type="text"
                required
                placeholder="Ex : Engie, Notaire, Enedis, Artisans, AXA, SCI..."
                value={uploadOrganisme}
                onChange={(e) => setUploadOrganisme(e.target.value)}
                className="w-full h-[48px] px-4 bg-surface-container-lowest border-2 border-border-subtle rounded-DEFAULT font-body-md text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
              />
            </div>

            {/* Champ 2 : Titre du document */}
            <div>
              <label htmlFor="modal-doc-title-input" className="block font-label-md text-xs font-bold text-on-surface mb-1">
                2. Titre du document *
              </label>
              <input
                id="modal-doc-title-input"
                type="text"
                required
                placeholder="Ex : Facture entretien chaudière, Devis toiture, Extrait RNE..."
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                className="w-full h-[48px] px-4 bg-surface-container-lowest border-2 border-border-subtle rounded-DEFAULT font-body-md text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
              />
            </div>

            {/* Champ 3 : Calcul automatique du Nom Standardisé en direct */}
            <div className="p-3 bg-surface-container-low rounded-DEFAULT border border-border-subtle text-xs space-y-1">
              <div className="flex items-center justify-between text-slate-500 font-medium">
                <span>Nom de fichier standardisé :</span>
                <span className="font-mono text-[10px] text-primary bg-white px-2 py-0.5 rounded border border-border-subtle font-bold">
                  ORGANISME MMAAAA Titre.ext
                </span>
              </div>
              <div className="font-mono text-xs sm:text-sm font-bold text-forest-deep break-all">
                {canonicalFileName}
              </div>
            </div>

            {/* Section Qui a payé ? */}
            <div className="p-3.5 bg-surface-container-low rounded-DEFAULT border border-border-subtle space-y-3">
              <label className="block font-label-md text-xs font-bold text-on-surface">
                Qui a payé ? *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPayerType('sci')}
                  className={`p-3 rounded-lg border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                    payerType === 'sci'
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border-subtle hover:border-slate-300 bg-surface-container-lowest'
                  }`}
                >
                  <span className={`material-symbols-outlined text-[20px] ${payerType === 'sci' ? 'text-primary' : 'text-slate-400'}`}>
                    account_balance
                  </span>
                  <div>
                    <div className={`text-xs font-bold ${payerType === 'sci' ? 'text-primary' : 'text-slate-700'}`}>
                      La SCI doit payer
                    </div>
                    <div className="text-[11px] text-on-surface-variant">
                      Facture à régler par la SCI
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPayerType('member')}
                  className={`p-3 rounded-lg border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                    payerType === 'member'
                      ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/20 ring-1 ring-emerald-600'
                      : 'border-border-subtle hover:border-slate-300 bg-surface-container-lowest'
                  }`}
                >
                  <span className={`material-symbols-outlined text-[20px] ${payerType === 'member' ? 'text-emerald-700' : 'text-slate-400'}`}>
                    receipt_long
                  </span>
                  <div>
                    <div className={`text-xs font-bold ${payerType === 'member' ? 'text-emerald-700' : 'text-slate-700'}`}>
                      J'ai payé moi-même
                    </div>
                    <div className="text-[11px] text-on-surface-variant">
                      Avance de frais à vous créditer
                    </div>
                  </div>
                </button>
              </div>

              {payerType === 'member' && (
                <div className="pt-2 border-t border-border-subtle/60 space-y-2 animate-in fade-in duration-150">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Montant avancé (€) *
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        required={payerType === 'member'}
                        placeholder="Ex : 45.50"
                        value={advanceAmount}
                        onChange={(e) => setAdvanceAmount(e.target.value)}
                        className="w-full h-11 px-3 pr-8 bg-surface-container-lowest border-2 border-border-subtle rounded-DEFAULT font-body-md text-sm text-on-surface focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                        €
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Une tâche de validation sera automatiquement assignée à Henri, et le montant crédité sur votre trésorerie SCI dès validation.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Sélecteur Multi-Tags & Création de Catégorie (Annotation 2) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="modal-doc-tags-select" className="font-label-md text-xs font-bold text-on-surface">
                  Étiquettes &amp; Catégories d'archive *
                </label>
                <button
                  type="button"
                  onClick={() => setIsNewCategoryOpen(!isNewCategoryOpen)}
                  className="text-xs text-primary hover:text-forest-deep font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {isNewCategoryOpen ? 'remove_circle' : 'add_circle'}
                  </span>
                  <span>{isNewCategoryOpen ? 'Masquer' : '+ Nouvelle catégorie'}</span>
                </button>
              </div>

              {/* Sous-formulaire de création de catégorie maison */}
              {isNewCategoryOpen && (
                <div className="p-3.5 mb-3 bg-surface-container-low rounded-DEFAULT border border-primary/30 space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-forest-deep flex items-center gap-1">
                      <span className="material-symbols-outlined text-[16px] text-primary">palette</span>
                      Créer une catégorie maison
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Nom</label>
                      <input
                        type="text"
                        placeholder="Ex: Assurance Habitation"
                        value={newCatName}
                        onChange={(e) => setNewCatName(e.target.value)}
                        className="w-full h-9 px-2.5 bg-white border border-border-subtle rounded text-xs focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Émoji</label>
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={newCatEmoji}
                          onChange={(e) => setNewCatEmoji(e.target.value)}
                          className="w-12 h-9 text-center bg-white border border-border-subtle rounded text-sm focus:outline-none focus:border-primary"
                          maxLength={3}
                        />
                        <div className="flex items-center gap-0.5 overflow-x-auto py-0.5">
                          {EMOJI_PRESETS.slice(0, 6).map((em) => (
                            <button
                              key={em}
                              type="button"
                              onClick={() => setNewCatEmoji(em)}
                              className={`w-7 h-7 text-xs rounded hover:bg-white cursor-pointer ${newCatEmoji === em ? 'ring-2 ring-primary bg-white' : ''}`}
                            >
                              {em}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Palette de couleurs */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1.5">Couleur associée</label>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {COLOR_OPTIONS.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setNewCatColor(c.id)}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border cursor-pointer transition-all ${
                            newCatColor === c.id
                              ? 'ring-2 ring-primary ring-offset-1 font-bold shadow-xs'
                              : 'opacity-80 hover:opacity-100'
                          } ${c.badgeBg}`}
                        >
                          <span className={`w-2.5 h-2.5 rounded-full ${c.bg}`}></span>
                          <span>{c.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-border-subtle">
                    <button
                      type="button"
                      onClick={() => setIsNewCategoryOpen(false)}
                      className="px-3 py-1.5 rounded text-xs text-slate-600 hover:bg-white cursor-pointer"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateCategorySubmit}
                      disabled={isCreatingCat || !newCatName.trim()}
                      className="px-3 py-1.5 rounded bg-primary text-white text-xs font-bold hover:bg-forest-deep disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                    >
                      {isCreatingCat ? 'Création...' : 'Valider la catégorie'}
                    </button>
                  </div>
                </div>
              )}

              {/* Multi-Sélecteur d'étiquettes */}
              <TagMultiSelect
                id="modal-doc-tags-select"
                selectedTags={uploadTags}
                onChange={(newTags) => setUploadTags(newTags)}
                availableCategories={categoriesList}
                onOpenCreateCategory={() => setIsNewCategoryOpen(true)}
                onOpenEditCategory={(catName) => {
                  const targetCat = categoriesList.find((c) => c.name === catName) || {
                    id: `virtual-${catName}`,
                    name: catName,
                    emoji: '📁',
                    color: 'slate'
                  };
                  setSelectedCategoryToEdit(targetCat);
                  setIsEditCategoryModalOpen(true);
                }}
                placeholder="Sélectionnez une ou plusieurs étiquettes..."
              />
            </div>

            {/* Indicateur de progression du téléversement */}
            {isSubmittingUpload && (
              <div className="mt-3 p-3 bg-surface-container-low rounded-DEFAULT border border-border-subtle animate-in fade-in duration-200">
                <div className="flex items-center justify-between text-xs font-semibold text-primary mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                    <span>{uploadProgressText || 'Téléversement en cours...'}</span>
                  </span>
                  <span>{uploadPercent}%</span>
                </div>
                <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300 rounded-full"
                    style={{ width: `${Math.max(5, uploadPercent)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Actions de la modale - Pied FIXE toujours visible sur mobile */}
          <div className="p-3 sm:p-4 border-t border-border-subtle shrink-0 flex items-center justify-end gap-3 bg-surface-container-lowest">
            <button
              id="btn-cancel-universal-upload"
              type="button"
              onClick={onClose}
              className="h-[44px] px-5 rounded-DEFAULT bg-surface-container-lowest border-2 border-border-subtle text-on-surface font-label-lg text-sm hover:bg-canvas-slate transition-all cursor-pointer"
            >
              Annuler
            </button>
            <button
              id="btn-submit-universal-upload"
              type="submit"
              disabled={isSubmittingUpload}
              className="h-[44px] px-6 rounded-DEFAULT bg-primary text-white font-label-lg text-sm font-bold hover:bg-forest-deep transition-all flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[20px]">
                {isSubmittingUpload ? 'sync' : 'check'}
              </span>
              <span>{isSubmittingUpload ? 'Envoi en cours...' : 'Envoyer'}</span>
            </button>
          </div>

        </form>

      </div>

      {/* Modale d'édition / suppression de catégorie existante (Annotation 1) */}
      <CategoryManageModal
        isOpen={isEditCategoryModalOpen}
        onClose={() => {
          setIsEditCategoryModalOpen(false);
          setSelectedCategoryToEdit(null);
        }}
        category={selectedCategoryToEdit || categoriesList.find((c) => uploadTags.includes(c.name)) || categoriesList[0]}
        onUpdated={(updated) => {
          setCategoriesList((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
          if (selectedCategoryToEdit) {
            setUploadTags((prev) => prev.map((t) => (t === selectedCategoryToEdit.name ? updated.name : t)));
          }
          setSelectedCategoryToEdit(null);
        }}
        onDeleted={(id, deletedCat) => {
          const remaining = categoriesList.filter((c) => c.id !== id);
          setCategoriesList(remaining);
          if (deletedCat && deletedCat.name) {
            setUploadTags((prev) => prev.filter((t) => t !== deletedCat.name));
          }
          setSelectedCategoryToEdit(null);
        }}
      />
    </div>
  );
}
