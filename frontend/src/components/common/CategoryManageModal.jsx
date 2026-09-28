import React, { useState, useEffect } from 'react';
import { updateDocumentCategory, deleteDocumentCategory } from '../../api';

export const COLOR_OPTIONS = [
  { id: 'slate', name: 'Ardoise', bg: 'bg-slate-500', text: 'text-slate-700', border: 'border-slate-500', badgeBg: 'bg-slate-100 text-slate-800 border-slate-200' },
  { id: 'emerald', name: 'Émeraude', bg: 'bg-emerald-500', text: 'text-emerald-700', border: 'border-emerald-500', badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { id: 'amber', name: 'Ambre', bg: 'bg-amber-500', text: 'text-amber-700', border: 'border-amber-500', badgeBg: 'bg-amber-100 text-amber-800 border-amber-200' },
  { id: 'purple', name: 'Pourpre', bg: 'bg-purple-500', text: 'text-purple-700', border: 'border-purple-500', badgeBg: 'bg-purple-100 text-purple-800 border-purple-200' },
  { id: 'rose', name: 'Bordeaux', bg: 'bg-rose-700', text: 'text-rose-700', border: 'border-rose-700', badgeBg: 'bg-rose-100 text-rose-800 border-rose-200' },
  { id: 'sky', name: 'Bleu ciel', bg: 'bg-sky-500', text: 'text-sky-700', border: 'border-sky-500', badgeBg: 'bg-sky-100 text-sky-800 border-sky-200' },
  { id: 'teal', name: 'Vert sauge', bg: 'bg-teal-600', text: 'text-teal-700', border: 'border-teal-600', badgeBg: 'bg-teal-100 text-teal-800 border-teal-200' },
  { id: 'wood', name: 'Chêne', bg: 'bg-yellow-800', text: 'text-yellow-800', border: 'border-yellow-800', badgeBg: 'bg-amber-100 text-amber-900 border-amber-200' }
];

export const EMOJI_PRESETS = ['🏛️', '💶', '🔧', '⚖️', '🛡️', '📜', '📬', '🏠', '📝', '💡', '🌳', '📁', '📶', '🔑', '💧', '🔥', '🚨', '🧹', '🚗', '🏊'];

export default function CategoryManageModal({
  isOpen,
  onClose,
  category,
  onUpdated,
  onDeleted
}) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('📁');
  const [color, setColor] = useState('slate');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (category) {
      setName(category.name || '');
      setEmoji(category.emoji || '📁');
      setColor(category.color || 'slate');
      setError(null);
    }
  }, [category, isOpen]);

  if (!isOpen || !category) return null;

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Le nom de la catégorie ne peut pas être vide.');
      return;
    }
    setIsUpdating(true);
    setError(null);
    try {
      let updated = {
        ...category,
        name: name.trim(),
        emoji: emoji || '📁',
        color: color || 'slate'
      };
      const isNumericId = typeof category.id === 'number' || (typeof category.id === 'string' && /^\d+$/.test(category.id));
      if (isNumericId) {
        updated = await updateDocumentCategory(category.id, {
          name: name.trim(),
          emoji: emoji || '📁',
          color: color || 'slate'
        });
      }
      if (onUpdated) onUpdated(updated);
      onClose();
    } catch (err) {
      setError(err.message || 'Erreur lors de la mise à jour de la catégorie.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!category.id) return;
    if (window.confirm(`Êtes-vous certain de vouloir supprimer la catégorie « ${category.name} » ?`)) {
      setIsDeleting(true);
      setError(null);
      try {
        const isNumericId = typeof category.id === 'number' || (typeof category.id === 'string' && /^\d+$/.test(category.id));
        if (isNumericId) {
          await deleteDocumentCategory(category.id);
        }
        if (onDeleted) onDeleted(category.id, category);
        onClose();
      } catch (err) {
        setError(err.message || 'Erreur lors de la suppression de la catégorie.');
      } finally {
        setIsDeleting(false);
      }
    }
  };

  return (
    <div
      id="modal-category-manage"
      className="fixed inset-0 z-[70] bg-inverse-surface/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-surface-container-lowest w-full max-w-lg rounded-2xl p-6 sm:p-8 shadow-[0_20px_48px_-12px_rgba(15,23,42,0.25)] border border-border-subtle relative max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border-subtle">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-full bg-sage-soft flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[22px]">tune</span>
            </div>
            <div>
              <h3 className="font-headline-sm text-base sm:text-lg text-forest-deep font-bold">
                Gérer la catégorie
              </h3>
              <p className="font-body-md text-xs text-on-surface-variant">
                Modifier ou supprimer la catégorie « {category.name} »
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-surface-container text-on-surface-variant flex items-center justify-center transition-all cursor-pointer"
            aria-label="Fermer"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-error-container text-on-error-container text-xs flex items-center gap-2 border border-error/20">
            <span className="material-symbols-outlined text-[18px]">error</span>
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleUpdate} className="mt-4 flex flex-col gap-4">
          
          {/* Nom */}
          <div>
            <label htmlFor="manage-cat-name" className="block font-label-md text-xs font-bold text-on-surface mb-1">
              Nom de la catégorie *
            </label>
            <input
              id="manage-cat-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex : Wi-Fi & Réseau"
              className="w-full h-11 px-4 bg-surface-container-lowest border-2 border-border-subtle rounded-xl font-body-md text-sm text-on-surface focus:outline-none focus:border-primary transition-all"
            />
          </div>

          {/* Émoji */}
          <div>
            <label htmlFor="manage-cat-emoji" className="block font-label-md text-xs font-bold text-on-surface mb-1">
              Émoji / Icône représentatif
            </label>
            <div className="flex items-center gap-2">
              <input
                id="manage-cat-emoji"
                type="text"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                maxLength={3}
                className="w-14 h-11 text-center text-xl bg-surface-container-lowest border-2 border-border-subtle rounded-xl font-body-md text-on-surface focus:outline-none focus:border-primary transition-all"
              />
              <div className="flex items-center gap-1.5 flex-wrap flex-1 p-2 bg-surface-container-low rounded-xl border border-border-subtle overflow-x-auto max-h-24">
                {EMOJI_PRESETS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => setEmoji(em)}
                    className={`w-8 h-8 text-base rounded-lg hover:bg-white flex items-center justify-center transition-all cursor-pointer ${
                      emoji === em ? 'ring-2 ring-primary bg-white shadow-xs' : ''
                    }`}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Couleur */}
          <div>
            <label className="block font-label-md text-xs font-bold text-on-surface mb-1.5">
              Couleur associée
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setColor(c.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border cursor-pointer transition-all ${
                    color === c.id
                      ? 'ring-2 ring-primary ring-offset-1 font-bold shadow-xs'
                      : 'opacity-80 hover:opacity-100'
                  } ${c.badgeBg}`}
                >
                  <span className={`w-3 h-3 rounded-full ${c.bg}`}></span>
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="mt-4 pt-4 border-t border-border-subtle flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <button
              type="button"
              id="btn-delete-cat-manage"
              onClick={handleDelete}
              disabled={isDeleting || isUpdating}
              className="h-11 px-4 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-800 border border-rose-200 font-label-md text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
              <span>{isDeleting ? 'Suppression...' : 'Supprimer'}</span>
            </button>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-11 px-4 rounded-xl bg-surface-container-lowest border-2 border-border-subtle text-on-surface font-label-md text-xs hover:bg-canvas-slate transition-all cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={isUpdating || isDeleting || !name.trim()}
                className="h-11 px-5 rounded-xl bg-primary text-white font-label-md text-xs font-bold hover:bg-forest-deep transition-all flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {isUpdating ? 'sync' : 'save'}
                </span>
                <span>{isUpdating ? 'Enregistrement...' : 'Enregistrer'}</span>
              </button>
            </div>
          </div>

        </form>

      </div>
    </div>
  );
}
