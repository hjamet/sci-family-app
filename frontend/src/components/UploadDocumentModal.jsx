import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  fetchDocumentCategories,
  createDocumentCategory,
  uploadDocument
} from '../api';
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

  // Création dynamique d'une nouvelle catégorie
  const [isNewCategoryOpen, setIsNewCategoryOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatEmoji, setNewCatEmoji] = useState('📁');
  const [newCatColor, setNewCatColor] = useState('slate');
  const [isCreatingCat, setIsCreatingCat] = useState(false);

  // Édition / suppression d'une catégorie existante (Annotation 1)
  const [isEditCategoryModalOpen, setIsEditCategoryModalOpen] = useState(false);
  const [selectedCategoryToEdit, setSelectedCategoryToEdit] = useState(null);

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

  useEffect(() => {
    if (isOpen) {
      loadCategories();
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

  // Soumission de l'upload universel
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!uploadOrganisme.trim() || !uploadTitle.trim() || !uploadFile) {
      alert("Veuillez renseigner l'organisme, le titre et sélectionner un fichier.");
      return;
    }

    setIsSubmittingUpload(true);
    try {
      const deposant = (
        currentUser && typeof currentUser === 'object'
          ? (currentUser.name || currentUser.fullName || (currentUser.prenom ? `${currentUser.prenom} ${currentUser.nom || ''}`.trim() : null) || currentUser.id)
          : (typeof currentUser === 'string' && currentUser ? currentUser : null)
      ) || 'Henri Jamet';

      const primaryCat = uploadTags.length > 0 ? uploadTags.join(', ') : (categoriesList[0]?.name || defaultCategory || 'Travaux & Chantiers');
      const finalTags = uploadTags.length > 0 ? uploadTags : [primaryCat];

      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('organisme', uploadOrganisme.trim());
      formData.append('title', uploadTitle.trim());
      formData.append('category', primaryCat);
      formData.append('tags', JSON.stringify(finalTags));
      formData.append('uploaded_by', deposant);

      if (targetTaskId) {
        formData.append('task_id', String(targetTaskId));
      }
      if (targetProjectId) {
        formData.append('project_id', String(targetProjectId));
      }

      const newDoc = await uploadDocument(formData);

      if (onUploadSuccess) {
        await onUploadSuccess(newDoc);
      }

      onClose();
    } catch (err) {
      console.error('Erreur téléversement document universel:', err);
      window.dispatchEvent(new CustomEvent('app-error', {
        detail: {
          message: err.message || 'Erreur lors du téléversement du document',
          status: err.status || 500,
          endpoint: '/api/documents/upload'
        }
      }));
      alert(err.message || 'Erreur lors du téléversement du document.');
    } finally {
      setIsSubmittingUpload(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="modal-upload-document"
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[70] bg-inverse-surface/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div className="bg-surface-container-lowest w-full max-w-lg rounded-2xl p-space-lg shadow-[0_20px_48px_-12px_rgba(15,23,42,0.25)] border border-border-subtle relative max-h-[90vh] overflow-y-auto">
        
        {/* En-tête de la modale */}
        <div className="flex items-center justify-between pb-space-sm border-b border-border-subtle">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-full bg-sage-soft flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[22px]">upload_file</span>
            </div>
            <div>
              <h3 className="font-headline-sm text-base sm:text-lg text-forest-deep font-bold">
                Archiver un document officiel
              </h3>
              <p className="font-body-md text-xs text-on-surface-variant">
                {targetTaskId
                  ? `Indexation administrative et association à la tâche #${targetTaskId}`
                  : targetProjectId
                  ? `Indexation administrative et association au scrutin`
                  : "Dépôt certifié dans l'espace documentaire de la SCI"}
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

        {/* Formulaire d'upload */}
        <form onSubmit={handleSubmit} className="mt-space-md flex flex-col gap-4">
          
          {/* Zone Drag & Drop */}
          <div>
            <label className="block font-label-md text-xs font-bold text-on-surface mb-1.5">
              Fichier numérique certifié (PDF, Scan, Image) *
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
                {uploadFile ? "Fichier sélectionné prêt pour l'archivage" : "Format officiel PDF recommandé, scan ou image (Max 25 Mo)"}
              </span>
              <input
                ref={fileDropInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.webp"
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
              placeholder="Ex : SPoMi, Postfinance, Notaire, Declercq, Enedis, AXA, SCI..."
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

          {/* Champ 3 : Calcul automatique du Nom Canonique en direct */}
          <div className="p-3.5 bg-surface-container-low rounded-DEFAULT border border-border-subtle text-xs space-y-1">
            <div className="flex items-center justify-between text-slate-500 font-medium">
              <span>Nom d'enregistrement canonique officiel :</span>
              <span className="font-mono text-[10px] text-primary bg-white px-2 py-0.5 rounded border border-border-subtle font-bold">
                ORGANISME MMAAAA Titre.ext
              </span>
            </div>
            <div className="font-mono text-xs sm:text-sm font-bold text-forest-deep break-all">
              {canonicalFileName}
            </div>
          </div>

          {/* Sélecteur de Catégorie & Création de Catégorie */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="modal-doc-category-select" className="font-label-md text-xs font-bold text-on-surface">
                Catégorie d'archive *
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

            {/* Multi-Sélecteur d'étiquettes / badges avec création et édition (Annotations 1, 2 & 6) */}
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
              placeholder="Sélectionnez un ou plusieurs tags..."
            />
          </div>

          {/* Actions de la modale */}
          <div className="mt-2 pt-space-sm border-b-0 border-t border-border-subtle flex items-center justify-end gap-space-sm">
            <button
              id="btn-cancel-universal-upload"
              type="button"
              onClick={onClose}
              className="h-[48px] px-5 rounded-DEFAULT bg-surface-container-lowest border-2 border-border-subtle text-on-surface font-label-lg text-sm hover:bg-canvas-slate transition-all cursor-pointer"
            >
              Annuler
            </button>
            <button
              id="btn-submit-universal-upload"
              type="submit"
              disabled={isSubmittingUpload}
              className="h-[48px] px-6 rounded-DEFAULT bg-primary text-white font-label-lg text-sm font-bold hover:bg-forest-deep transition-all flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
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
