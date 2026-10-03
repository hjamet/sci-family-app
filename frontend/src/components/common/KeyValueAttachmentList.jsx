import React, { useState, useCallback } from 'react';

/**
 * Normalise les données de clés-valeurs depuis n'importe quel format (tableau, JSON string, etc.).
 */
export function parseKeyValues(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (!item) return null;
        if (typeof item === 'object') {
          const k = String(item.key || item.name || item.label || '').trim();
          const v = String(item.value || item.val || '').trim();
          if (k || v) return { key: k, value: v };
        } else if (typeof item === 'string' && item.includes(':')) {
          const [k, ...rest] = item.split(':');
          return { key: k.trim(), value: rest.join(':').trim() };
        }
        return null;
      })
      .filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parseKeyValues(parsed);
      if (typeof parsed === 'object' && parsed !== null) {
        return Object.entries(parsed).map(([key, value]) => ({
          key: String(key).trim(),
          value: String(value).trim(),
        }));
      }
    } catch (_) {}
  }
  return [];
}

/**
 * Détecte le type sémantique d'une paire clé/valeur pour lui associer une icône
 * et des styles harmonisés.
 */
function resolveKeyValueMeta(keyName = '', value = '') {
  const k = keyName.toLowerCase();
  const v = value.toLowerCase();

  // Téléphone
  if (k.includes('tel') || k.includes('téléphone') || k.includes('phone') || k.includes('mobile') || k.includes('portable')) {
    const cleanTel = value.replace(/[^0-9+]/g, '');
    return {
      type: 'phone',
      icon: 'call',
      badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60',
      iconColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800',
      actionUrl: cleanTel ? `tel:${cleanTel}` : null,
      actionTitle: 'Composer le numéro',
      actionIcon: 'phone_in_talk',
    };
  }

  // Email
  if (k.includes('email') || k.includes('mail') || k.includes('courriel') || v.includes('@')) {
    const cleanEmail = value.trim();
    return {
      type: 'email',
      icon: 'alternate_email',
      badgeColor: 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200 dark:border-sky-800/60',
      iconColor: 'bg-sky-100 text-sky-700 dark:bg-sky-950/70 dark:text-sky-300 border border-sky-200 dark:border-sky-800',
      actionUrl: `mailto:${cleanEmail}`,
      actionTitle: 'Envoyer un courriel',
      actionIcon: 'send',
    };
  }

  // Entreprise / Fournisseur / Prestataire / Artisan
  if (
    k.includes('entreprise') ||
    k.includes('société') ||
    k.includes('fournisseur') ||
    k.includes('artisan') ||
    k.includes('prestataire') ||
    k.includes('eurl') ||
    k.includes('sarl') ||
    k.includes('sas')
  ) {
    return {
      type: 'business',
      icon: 'domain',
      badgeColor: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60',
      iconColor: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800',
      actionUrl: null,
    };
  }

  // Contact / Personne
  if (k.includes('contact') || k.includes('interlocuteur') || k.includes('responsable') || k.includes('artisan')) {
    return {
      type: 'contact',
      icon: 'badge',
      badgeColor: 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800/60',
      iconColor: 'bg-purple-100 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300 border border-purple-200 dark:border-purple-800',
      actionUrl: null,
    };
  }

  // Devis / Facture / Montant / SIRET / IBAN
  if (k.includes('devis') || k.includes('facture') || k.includes('siret') || k.includes('iban') || k.includes('prix') || k.includes('montant')) {
    return {
      type: 'finance',
      icon: 'receipt_long',
      badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800/60',
      iconColor: 'bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
      actionUrl: null,
    };
  }

  // Lien URL
  if (v.startsWith('http://') || v.startsWith('https://')) {
    return {
      type: 'link',
      icon: 'language',
      badgeColor: 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border-teal-200 dark:border-teal-800/60',
      iconColor: 'bg-teal-100 text-teal-700 dark:bg-teal-950/70 dark:text-teal-300 border border-teal-200 dark:border-teal-800',
      actionUrl: value,
      actionTitle: 'Ouvrir le lien',
      actionIcon: 'open_in_new',
    };
  }

  // Par défaut
  return {
    type: 'generic',
    icon: 'label',
    badgeColor: 'bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300 border border-violet-200 dark:border-violet-800/60',
    iconColor: 'bg-violet-100 text-violet-700 dark:bg-violet-950/70 dark:text-violet-300 border border-violet-200 dark:border-violet-800',
    actionUrl: null,
  };
}

const COMMON_KEY_SUGGESTIONS = [
  'Entreprise',
  'Téléphone',
  'Email',
  'Contact',
  'SIRET',
  'Réf. devis',
  'IBAN',
];

/**
 * Composant unifié réutilisable pour afficher et gérer les pièces jointes
 * sous forme de clés-valeurs (coordonnées, entreprise, téléphone, email, siret, etc.)
 * Utilisable pour les Tâches ET pour les Votes/Scrutins.
 */
export default function KeyValueAttachmentList({
  items = [],
  onChange = null,
  isEditing = false,
  title = "Informations clés & Coordonnées",
  hideList = false,
  hideForm = false,
  className = "",
}) {
  const safeItems = parseKeyValues(items);

  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [inputError, setInputError] = useState('');
  const [copiedKeyIndex, setCopiedKeyIndex] = useState(null);
  const [copiedValueIndex, setCopiedValueIndex] = useState(null);

  const copyToClipboard = useCallback((textToCopy, isKey, index) => {
    if (!textToCopy) return;
    try {
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(textToCopy);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = textToCopy;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      if (isKey) {
        setCopiedKeyIndex(index);
        setTimeout(() => setCopiedKeyIndex(null), 2000);
      } else {
        setCopiedValueIndex(index);
        setTimeout(() => setCopiedValueIndex(null), 2000);
      }
    } catch (err) {
      console.warn("Échec de la copie dans le presse-papier:", err);
    }
  }, []);

  const handleAdd = (e) => {
    if (e) e.preventDefault();
    const cleanK = newKey.trim();
    const cleanV = newValue.trim();

    if (!cleanK) {
      setInputError("Veuillez renseigner le nom de la clé (ex: Entreprise, Téléphone, Email).");
      return;
    }
    if (!cleanV) {
      setInputError("Veuillez renseigner la valeur associée.");
      return;
    }

    const updated = [
      ...safeItems,
      { key: cleanK, value: cleanV },
    ];

    if (onChange) {
      onChange(updated);
    }

    setNewKey('');
    setNewValue('');
    setInputError('');
  };

  const handleRemove = (indexToRemove) => {
    const updated = safeItems.filter((_, idx) => idx !== indexToRemove);
    if (onChange) {
      onChange(updated);
    }
  };

  // En consultation pure : si aucune clé-valeur n'est renseignée, ne pas afficher d'encombrement
  if (!isEditing && safeItems.length === 0) {
    return null;
  }

  return (
    <div className={`flex flex-col gap-2.5 pt-2 ${className}`}>
      {/* En-tête de section si non masqué */}
      {!hideList && (
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-on-surface flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[18px] text-violet-600 dark:text-violet-400">
              dataset
            </span>
            <span>{title}</span>
            {safeItems.length > 0 && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
                {safeItems.length}
              </span>
            )}
          </label>
        </div>
      )}

      {/* Liste des cartes Clé-Valeur */}
      {!hideList && safeItems.length > 0 && (
        <div className="flex flex-col gap-2">
          {safeItems.map((item, idx) => {
            const meta = resolveKeyValueMeta(item.key, item.value);
            const isCopied = copiedIndex === idx;

            return (
              <div
                key={`kv-${idx}-${item.key}`}
                className="p-3 bg-canvas-slate dark:bg-slate-900/50 rounded-xl flex items-center justify-between gap-3 shadow-xs border border-slate-200 dark:border-slate-800 hover:border-violet-300 dark:hover:border-violet-700 transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${meta.iconColor}`}
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {meta.icon}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-label-md text-xs font-bold text-on-surface truncate">
                        {item.key}
                      </p>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(item.key, true, idx)}
                        className={`h-5 px-1.5 rounded text-[10px] font-semibold flex items-center gap-0.5 transition-all cursor-pointer ${
                          copiedKeyIndex === idx
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'bg-white dark:bg-slate-800 text-slate-500 hover:text-emerald-700 border border-slate-200 dark:border-slate-700'
                        }`}
                        title="Copier le libellé de la clé"
                        aria-label={`Copier la clé ${item.key}`}
                      >
                        <span className="material-symbols-outlined text-[11px]">
                          {copiedKeyIndex === idx ? 'check' : 'content_copy'}
                        </span>
                        <span>{copiedKeyIndex === idx ? 'Clé copiée !' : 'Clé'}</span>
                      </button>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 border ${meta.badgeColor}`}>
                        Clé-valeur
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-0.5 min-w-0">
                      {meta.actionUrl ? (
                        <a
                          href={meta.actionUrl}
                          target={meta.type === 'link' ? '_blank' : undefined}
                          rel={meta.type === 'link' ? 'noopener noreferrer' : undefined}
                          className="font-body-md text-xs sm:text-sm font-semibold text-primary hover:underline truncate"
                          title={`${meta.actionTitle || 'Ouvrir'} : ${item.value}`}
                        >
                          {item.value}
                        </a>
                      ) : (
                        <span
                          className="font-body-md text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 select-all truncate"
                          title={item.value}
                        >
                          {item.value}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Bouton d'action directe (Appeler / Écrire / Ouvrir si disponible) */}
                  {meta.actionUrl && (
                    <a
                      href={meta.actionUrl}
                      target={meta.type === 'link' ? '_blank' : undefined}
                      rel={meta.type === 'link' ? 'noopener noreferrer' : undefined}
                      className="h-8 px-2.5 rounded-lg bg-surface-container-lowest border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1 cursor-pointer shadow-xs"
                      title={meta.actionTitle || 'Consulter'}
                    >
                      <span className="material-symbols-outlined text-[15px]">
                        {meta.actionIcon || 'open_in_new'}
                      </span>
                      <span className="hidden sm:inline">
                        {meta.type === 'phone' ? 'Appeler' : meta.type === 'email' ? 'Écrire' : 'Ouvrir'}
                      </span>
                    </a>
                  )}

                  {/* Bouton de copie en 1 clic pour la valeur */}
                  <button
                    type="button"
                    onClick={() => copyToClipboard(item.value, false, idx)}
                    className={`h-8 px-2.5 rounded-lg border text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer shadow-xs ${
                      copiedValueIndex === idx
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-400 text-emerald-800 dark:text-emerald-200 scale-102'
                        : 'bg-surface-container-lowest border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                    title="Copier la valeur dans le presse-papier"
                    aria-label={`Copier ${item.value}`}
                  >
                    <span className="material-symbols-outlined text-[15px] text-primary">
                      {copiedValueIndex === idx ? 'check' : 'content_copy'}
                    </span>
                    <span className="hidden sm:inline">
                      {copiedValueIndex === idx ? 'Copié !' : 'Copier'}
                    </span>
                  </button>

                  {/* Bouton de suppression en mode édition */}
                  {isEditing && (
                    <button
                      type="button"
                      onClick={() => handleRemove(idx)}
                      className="h-8 w-8 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-100 transition-colors flex items-center justify-center cursor-pointer shadow-xs"
                      title="Supprimer cette paire clé-valeur"
                      aria-label={`Supprimer ${item.key}`}
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Formulaire d'ajout rapide (visible en mode édition) */}
      {isEditing && !hideForm && (
        <div className="p-3 bg-canvas-slate dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col gap-2">
          {/* Suggestions rapides de clés */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Suggestions :
            </span>
            {COMMON_KEY_SUGGESTIONS.map((sugg) => (
              <button
                key={sugg}
                type="button"
                onClick={() => {
                  setNewKey(sugg);
                  if (inputError) setInputError('');
                }}
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border transition-colors cursor-pointer ${
                  newKey.toLowerCase() === sugg.toLowerCase()
                    ? 'bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-950 dark:text-violet-300'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {sugg}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
            <div className="sm:col-span-5">
              <input
                type="text"
                value={newKey}
                onChange={(e) => {
                  setNewKey(e.target.value);
                  if (inputError) setInputError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAdd();
                  }
                }}
                placeholder="Nom de la clé (ex: Entreprise, Téléphone, Email...)"
                className="w-full h-9 px-3 text-xs bg-white dark:bg-slate-900 text-on-surface rounded-lg border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-slate-400 font-medium"
              />
            </div>
            <div className="sm:col-span-7 flex items-center gap-1.5">
              <input
                type="text"
                value={newValue}
                onChange={(e) => {
                  setNewValue(e.target.value);
                  if (inputError) setInputError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAdd();
                  }
                }}
                placeholder="Valeur associée (ex: EURL Bompais, 02 32 34 47 55...)"
                className="w-full h-9 px-3 text-xs bg-white dark:bg-slate-900 text-on-surface rounded-lg border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-slate-400 font-medium"
              />
              <button
                type="button"
                onClick={handleAdd}
                className="h-9 px-3 shrink-0 rounded-lg bg-violet-700 hover:bg-violet-800 text-white text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer shadow-xs active:scale-95"
                title="Ajouter cette paire clé-valeur"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                <span className="whitespace-nowrap">+ Ajouter</span>
              </button>
            </div>
          </div>
          {inputError && (
            <p className="text-[11px] text-rose-600 font-medium">{inputError}</p>
          )}
        </div>
      )}
    </div>
  );
}
