import React, { useState, useEffect, useMemo } from 'react';
import { fetchDocuments, attachDocumentsToTask, attachDocumentsToProject } from '../api';

export default function SelectExistingDocumentModal({
  isOpen,
  onClose,
  targetTaskId = null,
  targetProjectId = null,
  alreadyAttachedDocIds = [],
  onAttachSuccess = null,
}) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Set des IDs déjà rattachés
  const alreadyAttachedSet = useMemo(() => {
    const s = new Set();
    if (Array.isArray(alreadyAttachedDocIds)) {
      alreadyAttachedDocIds.forEach((item) => {
        if (typeof item === 'number' || typeof item === 'string') {
          s.add(String(item));
        } else if (item && typeof item === 'object') {
          if (item.id) s.add(String(item.id));
          if (item.drive_file_id) s.add(String(item.drive_file_id));
        }
      });
    }
    return s;
  }, [alreadyAttachedDocIds]);

  // Chargement des documents de la SCI à l'ouverture
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    async function loadDocs() {
      setLoading(true);
      setError(null);
      setSelectedIds(new Set());
      setSearchTerm('');
      setSelectedCategory('all');
      try {
        const data = await fetchDocuments();
        if (isMounted) {
          setDocuments(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (isMounted) {
          console.error('Erreur chargement documents existants:', err);
          setError(err.message || 'Impossible de charger les documents de la SCI');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadDocs();
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Liste unique des catégories présentes
  const categories = useMemo(() => {
    const cats = new Set();
    documents.forEach((d) => {
      if (d.category) cats.add(d.category);
    });
    return Array.from(cats).sort();
  }, [documents]);

  // Filtrage en temps réel
  const filteredDocuments = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return documents.filter((doc) => {
      // Filtre catégorie
      if (selectedCategory !== 'all' && doc.category !== selectedCategory) {
        return false;
      }
      // Filtre recherche textuelle
      if (!term) return true;
      const title = (doc.title || doc.name || '').toLowerCase();
      const filename = (doc.filename || doc.file_name || '').toLowerCase();
      const notes = (doc.notes || '').toLowerCase();
      const category = (doc.category || '').toLowerCase();
      const uploader = (doc.uploaded_by || '').toLowerCase();

      return (
        title.includes(term) ||
        filename.includes(term) ||
        notes.includes(term) ||
        category.includes(term) ||
        uploader.includes(term)
      );
    });
  }, [documents, searchTerm, selectedCategory]);

  const toggleSelectDoc = (docId) => {
    const numId = Number(docId);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(numId)) {
        next.delete(numId);
      } else {
        next.add(numId);
      }
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    const selectable = filteredDocuments.filter(
      (d) => !alreadyAttachedSet.has(String(d.id))
    );
    const allSelected = selectable.every((d) => selectedIds.has(Number(d.id)));

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        selectable.forEach((d) => next.delete(Number(d.id)));
      } else {
        selectable.forEach((d) => next.add(Number(d.id)));
      }
      return next;
    });
  };

  const handleConfirmAttach = async () => {
    if (selectedIds.size === 0) return;

    const idsArray = Array.from(selectedIds);
    const selectedDocObjects = documents.filter((d) => selectedIds.has(Number(d.id)));

    setIsSubmitting(true);
    try {
      if (targetTaskId) {
        await attachDocumentsToTask(targetTaskId, idsArray);
      } else if (targetProjectId) {
        await attachDocumentsToProject(targetProjectId, idsArray);
      }

      if (onAttachSuccess) {
        onAttachSuccess(selectedDocObjects);
      }
      onClose();
    } catch (err) {
      console.error('Erreur attachement documents:', err);
      alert(err.message || "Erreur lors de l'association des documents.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="select-doc-modal-title"
    >
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <header className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/60 dark:bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">folder_shared</span>
            </div>
            <div>
              <h2
                id="select-doc-modal-title"
                className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100"
              >
                Documents de la SCI Hellenvilliers
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sélectionnez un document déjà en ligne pour l'associer sans le ré-uploader
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Fermer"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </header>

        {/* Barre de Recherche et Filtres */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row gap-2.5 shrink-0">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
              search
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher par titre, organisme, catégorie..."
              className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">cancel</span>
              </button>
            )}
          </div>

          {categories.length > 0 && (
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer text-slate-700 dark:text-slate-300"
            >
              <option value="all">Toutes catégories ({documents.length})</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Liste des Documents avec cases à cocher */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 divide-y divide-slate-100 dark:divide-slate-800/60 min-h-[220px]">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
              <span className="material-symbols-outlined text-3xl animate-spin text-emerald-600">
                progress_activity
              </span>
              <span>Chargement des documents archivés...</span>
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-50 text-rose-800 rounded-xl text-xs flex items-center gap-2">
              <span className="material-symbols-outlined">error</span>
              <span>{error}</span>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-center text-slate-400 text-xs">
              <span className="material-symbols-outlined text-3xl">description</span>
              <span>Aucun document trouvé{searchTerm ? ' pour cette recherche' : ''}.</span>
            </div>
          ) : (
            filteredDocuments.map((doc) => {
              const isAttached = alreadyAttachedSet.has(String(doc.id));
              const isSelected = selectedIds.has(Number(doc.id));
              const isPdf =
                (doc.filename || doc.file_name || doc.title || '').toLowerCase().endsWith('.pdf') ||
                (doc.file_type || '').includes('pdf');
              const isImg =
                (doc.filename || doc.file_name || '').match(/\.(png|jpe?g|webp|gif|svg)$/i) ||
                (doc.file_type || '').startsWith('image/');

              return (
                <div
                  key={doc.id}
                  onClick={() => {
                    if (!isAttached) toggleSelectDoc(doc.id);
                  }}
                  className={`pt-2 first:pt-0 flex items-center justify-between gap-3 p-2.5 rounded-xl transition-colors cursor-pointer select-none ${
                    isAttached
                      ? 'opacity-60 bg-slate-50 dark:bg-slate-800/40 cursor-not-allowed'
                      : isSelected
                      ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <input
                      type="checkbox"
                      checked={isSelected || isAttached}
                      disabled={isAttached}
                      onChange={() => toggleSelectDoc(doc.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer"
                    />

                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        isPdf
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                          : isImg
                          ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[20px]">
                        {isPdf ? 'picture_as_pdf' : isImg ? 'image' : 'description'}
                      </span>
                    </div>

                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {doc.title || doc.filename || doc.file_name}
                        </span>
                        {isAttached && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-semibold shrink-0">
                            Déjà associé
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {doc.category && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                            {doc.category}
                          </span>
                        )}
                        {doc.notes && <span>{doc.notes}</span>}
                        {doc.file_size && (
                          <span>• {Math.round(doc.file_size / 1024)} Ko</span>
                        )}
                        {doc.uploaded_by && (
                          <span className="hidden sm:inline">• Déposé par {doc.uploaded_by}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bouton téléchargement / vue rapide */}
                  {(doc.file_url || doc.url || doc.id) && (
                    <a
                      href={doc.file_url || doc.url || `/api/documents/${doc.id}/download`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-slate-800 transition-colors"
                      title="Ouvrir le document"
                    >
                      <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                    </a>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <footer className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {filteredDocuments.length > 0 && (
              <button
                type="button"
                onClick={handleSelectAllFiltered}
                className="text-xs text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 font-semibold cursor-pointer underline"
              >
                Tout sélectionner / désélectionner
              </button>
            )}
            <span className="text-xs text-slate-500 font-medium ml-2">
              {selectedIds.size} sélectionné(s)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleConfirmAttach}
              disabled={selectedIds.size === 0 || isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[18px]">add_link</span>
              <span>{isSubmitting ? 'Association...' : 'Associer la sélection'}</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
