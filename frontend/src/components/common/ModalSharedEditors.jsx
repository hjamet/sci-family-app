import React, { useState } from 'react';
import KeyValueAttachmentList, { parseKeyValues } from './KeyValueAttachmentList';

/**
 * Normalise une URL en ajoutant https:// si absent.
 */
function normalizeUrl(url) {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * Composant mutualisé d'édition et affichage des clés-valeurs / métadonnées personnalisées.
 * Utilisé dans TaskDetailModal et VoteRoofModal.
 */
export function KeyValuesEditor({
  items = [],
  onChange,
  isEditing = true,
  title = 'Informations clés & Coordonnées attachées',
  addTitle = 'Ajouter une information clé (Entreprise, téléphone, email...)',
  className = '',
}) {
  return (
    <div className={`space-y-3 ${className}`}>
      {items && items.length > 0 && (
        <KeyValueAttachmentList
          items={items}
          onChange={onChange}
          isEditing={isEditing}
          hideForm={true}
          hideList={false}
          title={title}
        />
      )}

      {isEditing && typeof onChange === 'function' && (
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
          <KeyValueAttachmentList
            items={items}
            onChange={onChange}
            isEditing={true}
            hideList={true}
            title={addTitle}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Composant mutualisé d'édition et affichage des liens web externes.
 * Utilisé dans TaskDetailModal et VoteRoofModal.
 */
export function ExternalLinksEditor({
  links = [],
  onChange,
  isEditing = true,
  title = 'Liens web & Ressources externes',
  className = '',
}) {
  const [newUrl, setNewUrl] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [error, setError] = useState('');

  const handleAddLink = (e) => {
    if (e) e.preventDefault();
    setError('');

    const rawUrl = newUrl.trim();
    if (!rawUrl) {
      setError('Veuillez renseigner une adresse web valide.');
      return;
    }

    const cleanUrl = normalizeUrl(rawUrl);
    const cleanTitle = newTitle.trim() || cleanUrl;

    const newLinkItem = {
      title: cleanTitle,
      url: cleanUrl,
    };

    if (typeof onChange === 'function') {
      onChange([...links, newLinkItem]);
    }

    setNewUrl('');
    setNewTitle('');
  };

  const handleRemoveLink = (indexToRemove) => {
    if (typeof onChange === 'function') {
      onChange(links.filter((_, idx) => idx !== indexToRemove));
    }
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Formulaire d'ajout rapide (visible en mode édition) */}
      {isEditing && typeof onChange === 'function' && (
        <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <span className="material-symbols-outlined text-[16px] text-sky-600">add_link</span>
            <span>Ajouter un lien web ou une ressource externe</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Titre du lien (ex: Devis toiture PDF, Page fournisseur...)"
              className="h-8 px-2.5 bg-white dark:bg-slate-800 rounded-lg text-xs border border-slate-300 dark:border-slate-700 text-on-surface focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            <div className="flex gap-2">
              <input
                type="text"
                value={newUrl}
                onChange={(e) => {
                  setNewUrl(e.target.value);
                  if (error) setError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddLink();
                  }
                }}
                placeholder="https://exemple.fr/ressource..."
                className="flex-1 h-8 px-2.5 bg-white dark:bg-slate-800 rounded-lg text-xs border border-slate-300 dark:border-slate-700 text-on-surface focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono"
              />
              <button
                type="button"
                onClick={handleAddLink}
                className="h-8 px-3 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer shrink-0"
              >
                <span className="material-symbols-outlined text-[15px]">add</span>
                <span>Ajouter</span>
              </button>
            </div>
          </div>

          {error && (
            <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">{error}</p>
          )}
        </div>
      )}

      {/* Liste des liens rattachés */}
      {links && links.length > 0 && (
        <div className="space-y-2">
          {links.map((linkItem, lIdx) => {
            const rawUrl = typeof linkItem === 'string' ? linkItem : (linkItem?.url || '');
            const normalized = normalizeUrl(rawUrl);
            const linkTitle = (typeof linkItem === 'object' && linkItem?.title) ? linkItem.title : (normalized || 'Ressource web');

            return (
              <div
                key={`link-${lIdx}`}
                className="p-2.5 sm:p-3 bg-canvas-slate/80 dark:bg-slate-900/60 rounded-xl flex items-center justify-between gap-3 shadow-xs border border-slate-200 dark:border-slate-800"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 flex items-center justify-center shrink-0 border border-sky-200 dark:border-sky-800/60">
                    <span className="material-symbols-outlined text-[18px]">language</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-semibold text-xs text-on-surface break-words" title={linkTitle}>
                        {linkTitle}
                      </p>
                      <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200 border border-sky-200 shrink-0">
                        Lien web
                      </span>
                    </div>
                    <a
                      href={normalized}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-sky-600 dark:text-sky-400 hover:underline break-all block truncate max-w-xs sm:max-w-md font-mono"
                      title={normalized}
                    >
                      {normalized}
                    </a>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <a
                    href={normalized}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-7 sm:h-8 px-2 sm:px-2.5 rounded-lg bg-surface-container-lowest border border-sky-400 text-sky-800 text-xs font-semibold hover:bg-sky-50 transition-colors flex items-center gap-1 cursor-pointer"
                    title="Ouvrir dans un nouvel onglet"
                  >
                    <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                    <span className="hidden sm:inline">Ouvrir</span>
                  </a>
                  {isEditing && typeof onChange === 'function' && (
                    <button
                      type="button"
                      onClick={() => handleRemoveLink(lIdx)}
                      className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-rose-50 border border-rose-300 text-rose-700 hover:bg-rose-100 transition-colors flex items-center justify-center cursor-pointer shadow-xs"
                      title="Supprimer ce lien web"
                    >
                      <span className="material-symbols-outlined text-[15px]">delete</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default {
  KeyValuesEditor,
  ExternalLinksEditor,
};
