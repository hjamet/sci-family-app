import React, { useState } from 'react';

/**
 * Normalise une URL en ajoutant le protocole https:// si nécessaire.
 */
function normalizeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

/**
 * Extrait un libellé propre (nom d'hôte + chemin tronqué) à partir d'une URL brute.
 */
function extractHostnameOrCleanUrl(urlStr) {
  try {
    const parsed = new URL(normalizeUrl(urlStr));
    const host = parsed.hostname.replace(/^www\./i, '');
    const path = parsed.pathname.length > 1 ? parsed.pathname : '';
    const clean = `${host}${path}`;
    return clean.length > 40 ? `${clean.slice(0, 37)}...` : clean;
  } catch (e) {
    return urlStr;
  }
}

/**
 * Composant réutilisable pour afficher et gérer des liens web externes
 * (documentation, manuels fabricants, liens de devis, articles).
 * Utilisable en mode lecture pure ou en mode édition.
 */
export default function ExternalLinksSection({
  links = [],
  onChange = null,
  isEditing = false,
  title = "Liens web & Sources externes",
  hideList = false,
}) {
  const [newUrl, setNewUrl] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [inputError, setInputError] = useState('');

  const safeLinks = Array.isArray(links) ? links : [];

  const handleAddLink = (e) => {
    if (e) e.preventDefault();
    const trimmedUrl = newUrl.trim();
    if (!trimmedUrl) {
      setInputError("Veuillez renseigner une adresse web valide.");
      return;
    }

    const fullUrl = normalizeUrl(trimmedUrl);
    const cleanTitle = newTitle.trim() || extractHostnameOrCleanUrl(fullUrl);

    const updated = [
      ...safeLinks,
      {
        url: fullUrl,
        title: cleanTitle,
      },
    ];

    if (onChange) {
      onChange(updated);
    }

    setNewUrl('');
    setNewTitle('');
    setInputError('');
  };

  const handleRemoveLink = (indexToRemove) => {
    const updated = safeLinks.filter((_, idx) => idx !== indexToRemove);
    if (onChange) {
      onChange(updated);
    }
  };

  // En consultation pure : si aucun lien n'est associé, ne pas encombrer visuellement la section
  if (!isEditing && safeLinks.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2.5 pt-2">
      {/* En-tête de section */}
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-on-surface flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[18px] text-sky-600 dark:text-sky-400">
            language
          </span>
          <span>{title}</span>
          {safeLinks.length > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
              {safeLinks.length}
            </span>
          )}
        </label>
      </div>

      {/* Formulaire d'ajout rapide (visible uniquement en mode édition) */}
      {isEditing && (
        <div className="p-3 bg-canvas-slate dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-700/80 flex flex-col gap-2">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
            <div className="sm:col-span-7">
              <input
                type="url"
                value={newUrl}
                onChange={(e) => {
                  setNewUrl(e.target.value);
                  if (inputError) setInputError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddLink();
                  }
                }}
                placeholder="https://... (ex: notice klereo.fr, manuel piscine)"
                className="w-full h-9 px-3 text-xs bg-white dark:bg-slate-900 text-on-surface rounded-lg border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-slate-400"
              />
            </div>
            <div className="sm:col-span-5 flex items-center gap-1.5">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddLink();
                  }
                }}
                placeholder="Intitulé de la ressource web (ex: Page produit, Notice, Devis)"
                className="w-full h-9 px-3 text-xs bg-white dark:bg-slate-900 text-on-surface rounded-lg border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={handleAddLink}
                className="h-9 px-3 shrink-0 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer shadow-xs active:scale-95"
                title="Ajouter ce lien externe"
              >
                <span className="material-symbols-outlined text-[16px]">add_link</span>
                <span className="whitespace-nowrap">+ Ajouter</span>
              </button>
            </div>
          </div>
          {inputError && (
            <p className="text-[11px] text-rose-600 font-medium">{inputError}</p>
          )}
        </div>
      )}

      {/* Liste des liens cliquables */}
      {!hideList && safeLinks.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {safeLinks.map((item, idx) => {
            const rawUrl = typeof item === 'string' ? item : item?.url || '';
            const normalized = normalizeUrl(rawUrl);
            const displayTitle = (typeof item === 'object' && item?.title) ? item.title : extractHostnameOrCleanUrl(normalized);

            return (
              <div
                key={`${normalized}-${idx}`}
                className="group flex items-center justify-between gap-2.5 p-2.5 rounded-lg bg-canvas-slate dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80 hover:border-sky-300 dark:hover:border-sky-700 hover:bg-sky-50/50 dark:hover:bg-sky-950/20 transition-all shadow-xs"
              >
                <a
                  href={normalized}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer group-hover:text-sky-900 dark:group-hover:text-sky-200"
                  title={`Ouvrir dans un nouvel onglet : ${normalized}`}
                >
                  <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-950/80 text-sky-800 dark:text-sky-300 flex items-center justify-center shrink-0 border border-sky-200 dark:border-sky-800/60 shadow-2xs group-hover:scale-105 transition-transform">
                    <span className="material-symbols-outlined text-[18px]">
                      language
                    </span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-xs text-on-surface truncate group-hover:text-sky-800 dark:group-hover:text-sky-300">
                      {displayTitle}
                    </span>
                    <span className="text-[11px] text-on-surface-variant font-mono truncate max-w-full">
                      {normalized}
                    </span>
                  </div>
                  <span className="material-symbols-outlined text-[15px] text-slate-400 group-hover:text-sky-700 ml-auto shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
                    open_in_new
                  </span>
                </a>

                {isEditing && (
                  <button
                    type="button"
                    onClick={() => handleRemoveLink(idx)}
                    className="h-7 w-7 rounded-md bg-transparent hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600 transition-colors flex items-center justify-center cursor-pointer shrink-0"
                    title="Supprimer ce lien"
                    aria-label={`Supprimer ${displayTitle}`}
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
