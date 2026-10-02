import React, { useState, useRef, useEffect, useMemo } from 'react';
import { COLOR_OPTIONS } from './CategoryManageModal';

export function getTagColorClass(colorId) {
  const opt = COLOR_OPTIONS.find((c) => c.id === colorId);
  return opt ? opt.badgeBg : 'bg-slate-100 text-slate-800 border-slate-200';
}

export function parseDocumentTags(doc) {
  if (!doc) return [];
  if (Array.isArray(doc.tags)) {
    return doc.tags.filter(Boolean).map((t) => String(t).trim()).filter(Boolean);
  }
  if (typeof doc.tags === 'string' && doc.tags.trim()) {
    try {
      const parsed = JSON.parse(doc.tags);
      if (Array.isArray(parsed)) return parsed.map((t) => String(t).trim()).filter(Boolean);
    } catch (_) {}
    return doc.tags.split(',').map((t) => t.trim()).filter(Boolean);
  }
  if (Array.isArray(doc.categories)) {
    return doc.categories.filter(Boolean).map((t) => String(t).trim()).filter(Boolean);
  }
  if (typeof doc.category === 'string' && doc.category.trim()) {
    return doc.category.split(',').map((t) => t.trim()).filter(Boolean);
  }
  return [];
}

/**
 * TagMultiSelect
 * Sélecteur multiple de tags / étiquettes avec badges colorés,
 * suppression unitaire, ajout depuis les catégories existantes,
 * et boutons dédiés pour modifier l'étiquette ou en créer une nouvelle.
 */
export default function TagMultiSelect({
  selectedTags = [],
  onChange,
  availableCategories = [],
  onOpenCreateCategory,
  onOpenEditCategory,
  id = 'tag-multi-select',
  placeholder = 'Ajouter une étiquette...',
  className = '',
  disabled = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Normalisation des tags sélectionnés sous forme de string[]
  const tagsArray = useMemo(() => {
    if (Array.isArray(selectedTags)) return selectedTags;
    if (typeof selectedTags === 'string') {
      try {
        const parsed = JSON.parse(selectedTags);
        if (Array.isArray(parsed)) return parsed;
      } catch (_) {}
      return selectedTags.split(',').map((t) => t.trim()).filter(Boolean);
    }
    return [];
  }, [selectedTags]);

  // Fermeture automatique au clic en dehors
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAddTag = (tagName) => {
    const trimmed = tagName.trim();
    if (!trimmed) return;
    if (!tagsArray.includes(trimmed)) {
      const next = [...tagsArray, trimmed];
      if (typeof onChange === 'function') {
        onChange(next);
      }
    }
    setSearchTerm('');
    setIsOpen(false);
  };

  const handleRemoveTag = (tagName, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const next = tagsArray.filter((t) => t !== tagName);
    if (typeof onChange === 'function') {
      onChange(next);
    }
  };

  // Filtrage des catégories existantes non encore associées
  const filteredCategories = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return availableCategories.filter((cat) => {
      const nameMatch = !term || cat.name.toLowerCase().includes(term);
      const notAlreadySelected = !tagsArray.includes(cat.name);
      return nameMatch && notAlreadySelected;
    });
  }, [availableCategories, searchTerm, tagsArray]);

  // Dernière étiquette sélectionnée (pour le bouton modifier rapide)
  const activeSelectedTag = tagsArray.length > 0 ? tagsArray[tagsArray.length - 1] : null;

  return (
    <div ref={containerRef} className={`relative flex flex-col gap-2 ${className}`}>
      
      {/* Conteneur principal avec les badges et l'input de sélection */}
      <div className="flex items-center gap-2">
        <div
          id={id}
          onClick={() => {
            if (!disabled) {
              setIsOpen(true);
              inputRef.current?.focus();
            }
          }}
          className={`flex-1 min-h-[48px] p-2 bg-surface-container-lowest border-2 rounded-DEFAULT flex items-center flex-wrap gap-1.5 cursor-pointer transition-all ${
            isOpen ? 'border-primary ring-2 ring-primary/10' : 'border-border-subtle hover:border-outline'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {/* Badges des tags sélectionnés */}
          {tagsArray.map((tagName) => {
            const catObj = availableCategories.find((c) => c.name === tagName);
            const badgeClass = getTagColorClass(catObj?.color);
            return (
              <span
                key={tagName}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold border ${badgeClass} shadow-2xs group animate-in fade-in duration-100`}
              >
                <span>{catObj?.emoji || '📁'}</span>
                <span>{tagName}</span>

                {/* Bouton rapide d'édition du tag spécifique */}
                {onOpenEditCategory && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onOpenEditCategory(tagName);
                    }}
                    title={`Modifier l'étiquette « ${tagName} »`}
                    className="w-4 h-4 rounded hover:bg-black/10 flex items-center justify-center transition-colors cursor-pointer text-slate-500 hover:text-slate-800"
                  >
                    <span className="material-symbols-outlined text-[13px]">edit</span>
                  </button>
                )}

                {/* Bouton de suppression du tag */}
                {!disabled && (
                  <button
                    type="button"
                    onClick={(e) => handleRemoveTag(tagName, e)}
                    title={`Retirer l'étiquette « ${tagName} »`}
                    className="w-4 h-4 rounded hover:bg-black/10 flex items-center justify-center transition-colors cursor-pointer text-slate-500 hover:text-rose-700"
                  >
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                )}
              </span>
            );
          })}

          {/* Champ de saisie / filtre */}
          <input
            ref={inputRef}
            type="text"
            disabled={disabled}
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              if (!isOpen) setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            placeholder={tagsArray.length === 0 ? placeholder : 'Ajouter un tag...'}
            className="flex-1 min-w-[120px] bg-transparent border-none text-xs sm:text-sm text-on-surface focus:outline-none placeholder:text-on-surface-variant/60 py-1"
          />

          {/* Flèche d'ouverture du menu */}
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              if (!disabled) setIsOpen(!isOpen);
            }}
            className="text-on-surface-variant hover:text-on-surface p-1 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">
              {isOpen ? 'expand_less' : 'expand_more'}
            </span>
          </button>
        </div>

        {/* Bouton d'édition contextuel sur l'étiquette sélectionnée */}
        {onOpenEditCategory && activeSelectedTag && (
          <button
            type="button"
            id={`${id}-btn-edit-tag`}
            onClick={() => onOpenEditCategory(activeSelectedTag)}
            className="h-[48px] px-3 rounded-DEFAULT border-2 border-border-subtle bg-surface-container-lowest text-on-surface hover:text-primary hover:border-primary flex items-center gap-1.5 transition-all cursor-pointer shadow-xs shrink-0"
            title={`Modifier ou supprimer l'étiquette « ${activeSelectedTag} »`}
          >
            <span className="material-symbols-outlined text-[18px] text-primary">edit_note</span>
            <span className="font-semibold text-xs hidden sm:inline">Modifier</span>
          </button>
        )}

        {/* Bouton de création directe d'une nouvelle étiquette */}
        {onOpenCreateCategory && (
          <button
            type="button"
            id={`${id}-btn-create-tag`}
            onClick={onOpenCreateCategory}
            className="h-[48px] px-3 rounded-DEFAULT border-2 border-border-subtle bg-surface-container-lowest text-on-surface hover:text-forest-deep hover:border-primary flex items-center gap-1.5 transition-all cursor-pointer shadow-xs shrink-0"
            title="Créer une nouvelle étiquette"
          >
            <span className="material-symbols-outlined text-[18px] text-primary">add_circle</span>
            <span className="font-semibold text-xs hidden sm:inline">+ Étiquette</span>
          </button>
        )}
      </div>

      {/* Menu déroulant des étiquettes disponibles */}
      {isOpen && !disabled && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-surface-container-lowest rounded-lg border-2 border-border-subtle shadow-lg p-2 max-h-56 overflow-y-auto animate-in fade-in duration-100 flex flex-col gap-1">
          {filteredCategories.length > 0 ? (
            filteredCategories.map((cat) => {
              const badgeClass = getTagColorClass(cat.color);
              return (
                <div
                  key={cat.id || cat.name}
                  onClick={() => handleAddTag(cat.name)}
                  className="flex items-center justify-between px-3 py-2 rounded hover:bg-surface-container cursor-pointer transition-colors text-xs text-on-surface"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{cat.emoji || '📁'}</span>
                    <span className="font-medium">{cat.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${badgeClass}`}>
                      {cat.color || 'slate'}
                    </span>
                    {onOpenEditCategory && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenEditCategory(cat.name);
                        }}
                        title={`Modifier l'étiquette « ${cat.name} »`}
                        className="p-1 text-slate-400 hover:text-primary rounded hover:bg-black/5 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[15px]">edit</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-2 text-center text-xs text-on-surface-variant">
              {searchTerm ? (
                <div className="flex flex-col items-center gap-1">
                  <span>Aucune étiquette existante ne correspond à « {searchTerm} ».</span>
                  <button
                    type="button"
                    onClick={() => handleAddTag(searchTerm)}
                    className="text-primary font-bold hover:underline cursor-pointer"
                  >
                    + Utiliser « {searchTerm} »
                  </button>
                </div>
              ) : (
                <span>Toutes les étiquettes disponibles sont déjà sélectionnées.</span>
              )}
            </div>
          )}

          {/* Raccourci vers la création */}
          {onOpenCreateCategory && (
            <div className="pt-1.5 mt-1 border-t border-border-subtle flex items-center justify-between px-2">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenCreateCategory();
                }}
                className="text-xs text-primary hover:text-forest-deep font-bold flex items-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">add_circle</span>
                <span>Créer une nouvelle étiquette personnalisée</span>
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
