import React, { useState, useRef, useEffect } from 'react';
import DocumentViewerModal from '../DocumentViewerModal';
import UploadDocumentModal from '../UploadDocumentModal';

/**
 * Palette riche d'émojis universels pour le chat familial et les réactions (Annotation 10) :
 * Réactions universelles expressives et élégantes
 */
export const CHAT_EMOJI_PALETTE = [
  '👍', '❤️', '🎉', '👏', '🔥', '🤔',
  '🚀', '💡', '😂', '🏠', '🌿', '🏊',
  '❄️', '✅', '⚠️', '☕', '🙏', '🤝'
];

export const CHAT_ALLOWED_EMOJIS = CHAT_EMOJI_PALETTE;

/**
 * Extraction pure du prénom sans titres ni suffixes.
 * Ex: "Henri Jamet" -> "Henri", "Maman (Élisabeth) Jamet" -> "Élisabeth"
 */
export function formatAuthorFirstName(fullName) {
  if (!fullName) return 'Associé';
  const cleaned = String(fullName).trim();
  if (cleaned.includes('(') && cleaned.includes(')')) {
    const match = cleaned.match(/\((.*?)\)/);
    if (match && match[1]) return match[1].trim();
  }
  return cleaned.split(' ')[0] || 'Associé';
}

/**
 * Extraction des initiales pour l'avatar
 */
function getInitials(name) {
  if (!name) return '??';
  const parts = String(name).trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/**
 * Normalisation universelle des réactions :
 * Supporte format tableau [{ emoji: '👍', count: 2 }]
 * et format objet { '👍': 2, '❤️': 1 }
 */
function normalizeReactions(reactions) {
  if (!reactions) return [];
  if (Array.isArray(reactions)) {
    return reactions.filter(r => r && r.emoji && r.count > 0);
  }
  if (typeof reactions === 'object') {
    return Object.entries(reactions)
      .filter(([_, count]) => count > 0)
      .map(([emoji, count]) => ({ emoji, count }));
  }
  return [];
}

/**
 * Liste par défaut des 7 associés authentiques de la famille Jamet
 */
export const DEFAULT_FAMILY_MEMBERS = [
  { id: 1, name: 'Henri Jamet', firstName: 'Henri' },
  { id: 2, name: 'Joséphine Jamet', firstName: 'Joséphine' },
  { id: 3, name: 'Frédéric Jamet', firstName: 'Frédéric' },
  { id: 4, name: 'Marguerite Jamet', firstName: 'Marguerite' },
  { id: 5, name: 'Hortense Jamet', firstName: 'Hortense' },
  { id: 6, name: 'Eugénie Jamet', firstName: 'Eugénie' },
  { id: 7, name: 'Eva Jamet', firstName: 'Eva' }
];

/**
 * Rendu visuel soigné des messages :
 * - Détecte les liens/badges de documents administratifs : 📎 [Titre](URL), [Titre](URL), ou 📎 [Titre]
 *   et les rend cliquables pour ouvrir directement DocumentViewerModal sans téléchargement forcé (Annotation 10).
 * - Remplace chaque mention @Prénom par un badge surligné raffiné tout en préservant le texte et les sauts de ligne.
 */
export function renderMessageContent(content, onOpenDocument = null) {
  if (!content) return null;
  const text = String(content);

  // Regex combinée pour capturer :
  // 1. Documents avec lien markdown : 📎? [Titre](URL)
  // 2. Documents avec badge simple : 📎 [Titre]
  // 3. Mentions : @Prénom
  const combinedRegex = /(?:📎\s*)?\[([^\]]+)\]\(([^)]+)\)|📎\s*\[([^\]]+)\]|@([A-Za-zÀ-ÖØ-öø-ÿ]+)/g;

  const elements = [];
  let lastIndex = 0;
  let match;

  while ((match = combinedRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      elements.push(text.substring(lastIndex, match.index));
    }

    if (match[1] && match[2]) {
      // Cas 1 : [Titre](URL) ou 📎 [Titre](URL)
      const docTitle = match[1];
      const docUrl = match[2];
      elements.push(
        <button
          key={`doc-link-${match.index}`}
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (onOpenDocument) {
              onOpenDocument({
                url: docUrl,
                file_url: docUrl,
                filename: docTitle,
                title: docTitle,
                name: docTitle
              });
            }
          }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 mx-1 my-0.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-xs hover:bg-emerald-100 hover:border-emerald-400 transition-colors cursor-pointer text-left align-middle"
          title={`Consulter « ${docTitle} » sans téléchargement`}
        >
          <span className="material-symbols-outlined text-[16px] text-emerald-700">description</span>
          <span className="truncate max-w-[200px] sm:max-w-[320px]">{docTitle}</span>
          <span className="text-[10px] uppercase font-bold text-emerald-700 bg-white/80 px-1 py-0.5 rounded border border-emerald-200">
            Consulter
          </span>
        </button>
      );
    } else if (match[3]) {
      // Cas 2 : 📎 [Titre]
      const docTitle = match[3];
      elements.push(
        <button
          key={`doc-badge-${match.index}`}
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (onOpenDocument) {
              onOpenDocument({
                filename: docTitle,
                title: docTitle,
                name: docTitle
              });
            }
          }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 mx-1 my-0.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-xs hover:bg-emerald-100 hover:border-emerald-400 transition-colors cursor-pointer text-left align-middle"
          title={`Consulter « ${docTitle} » sans téléchargement`}
        >
          <span className="material-symbols-outlined text-[16px] text-emerald-700">description</span>
          <span className="truncate max-w-[200px] sm:max-w-[320px]">{docTitle}</span>
          <span className="text-[10px] uppercase font-bold text-emerald-700 bg-white/80 px-1 py-0.5 rounded border border-emerald-200">
            Consulter
          </span>
        </button>
      );
    } else if (match[4]) {
      // Cas 3 : @Prénom ou @all / @tous (Annotation 10)
      const name = match[4];
      const isCollective = name.toLowerCase() === 'all' || name.toLowerCase() === 'tous';
      if (isCollective) {
        elements.push(
          <span
            key={`mention-${match.index}-${name}`}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md text-xs font-bold bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 shadow-xs align-middle"
          >
            <span>📢</span>
            <span>@all</span>
          </span>
        );
      } else {
        elements.push(
          <span
            key={`mention-${match.index}-${name}`}
            className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded-md text-xs font-semibold bg-sky-50 dark:bg-sky-950/50 text-sky-800 dark:text-sky-200 border border-sky-200 dark:border-sky-800 shadow-xs align-middle"
          >
            @{name}
          </span>
        );
      }
    }

    lastIndex = combinedRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    elements.push(text.substring(lastIndex));
  }

  return elements;
}

/**
 * Composant de chat familial unifié et réutilisable (FamilyChat)
 * Zéro duplication de code, respect strict des prénoms (zéro badges de rôle),
 * palette 8 emojis, règle anti-self-react, autocomplétion des mentions @ et fail-fast.
 */
export default function FamilyChat({
  messages = [],
  onSendMessage,
  onAddReaction,
  currentUser = 'Henri Jamet',
  title = 'Fil de discussion familial',
  placeholder = 'Votre message à la famille...',
  disabled = false,
  onRetryMessage = null,
  onAttachClick = null,
  taskId = null,
  defaultCategory = 'Travaux & Chantiers',
  onOpenDocument = null,
  onUploadDocumentSuccess = null,
  members = null,
  className = '',
}) {
  const [inputText, setInputText] = useState('');
  const [activeEmojiPickerMsgId, setActiveEmojiPickerMsgId] = useState(null);
  const [isInputEmojiPickerOpen, setIsInputEmojiPickerOpen] = useState(false);
  const inputEmojiPickerRef = useRef(null);
  const lastSelectionRef = useRef({ start: 0, end: 0 });

  // Visionneuse universelle et upload intégrés (Annotation 10 & 11)
  const [isChatUploadModalOpen, setIsChatUploadModalOpen] = useState(false);
  const [viewerDoc, setViewerDoc] = useState(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  const handleOpenDoc = (doc) => {
    if (onOpenDocument) {
      onOpenDocument(doc);
    } else {
      setViewerDoc(doc);
      setIsViewerOpen(true);
    }
  };

  const handleChatUploadSuccess = async (newDoc) => {
    const docLinkMsg = `📎 [${newDoc.title || newDoc.name} - ${newDoc.filename || newDoc.name}](${newDoc.file_url || newDoc.url})`;
    if (onSendMessage) {
      await onSendMessage(docLinkMsg);
    }
    if (onUploadDocumentSuccess) {
      onUploadDocumentSuccess(newDoc);
    }
  };

  // États pour l'autocomplétion des mentions @
  const [isMentionMenuOpen, setIsMentionMenuOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [highlightedMemberIndex, setHighlightedMemberIndex] = useState(0);

  const chatBottomRef = useRef(null);
  const textareaRef = useRef(null);
  const mentionMenuRef = useRef(null);
  const menuListRef = useRef(null);

  const currentUserName = typeof currentUser === 'string'
    ? currentUser
    : (currentUser?.name || currentUser?.prenom || 'Henri Jamet');
  const currentUserId = typeof currentUser === 'object' ? currentUser?.id : null;

  // Normalisation de la liste des membres (props ou 7 associés par défaut)
  const normalizedMembers = (members && members.length > 0 ? members : DEFAULT_FAMILY_MEMBERS).map((m) => {
    const firstName = m.firstName || m.prenom || formatAuthorFirstName(m.name || '');
    return {
      ...m,
      firstName,
      name: m.name || firstName
    };
  });

  // Filtrage dynamique insensible à la casse et aux accents (Annotation 10)
  const normalizeStr = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const collectiveEntry = {
    id: 'collective_all',
    isCollective: true,
    firstName: 'all',
    name: 'Tous les associés',
    badge: '📢 @all'
  };

  const q = normalizeStr(mentionQuery);
  const showCollective = !q || 'all'.includes(q) || 'tous'.includes(q) || normalizeStr('tous les associes').includes(q);

  const matchedMembers = normalizedMembers.filter((m) => {
    if (!q) return true;
    return normalizeStr(m.firstName).includes(q) || normalizeStr(m.name).includes(q);
  });

  const filteredMembers = showCollective ? [collectiveEntry, ...matchedMembers] : matchedMembers;

  // Défilement automatique au dernier message
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Réinitialiser la surbrillance au premier résultat dès que la recherche change
  useEffect(() => {
    setHighlightedMemberIndex(0);
  }, [mentionQuery]);

  // Défiler jusqu'à l'élément sélectionné dans le menu flottant
  useEffect(() => {
    if (menuListRef.current && menuListRef.current.children[highlightedMemberIndex]) {
      menuListRef.current.children[highlightedMemberIndex].scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedMemberIndex]);

  // Fermer le popover de mention si clic en dehors
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (
        mentionMenuRef.current &&
        !mentionMenuRef.current.contains(e.target) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target)
      ) {
        setIsMentionMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Fermer les popovers emoji si on clique ailleurs
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (activeEmojiPickerMsgId && !e.target.closest('.emoji-popover-container')) {
        setActiveEmojiPickerMsgId(null);
      }
      if (
        isInputEmojiPickerOpen &&
        inputEmojiPickerRef.current &&
        !inputEmojiPickerRef.current.contains(e.target)
      ) {
        setIsInputEmojiPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [activeEmojiPickerMsgId, isInputEmojiPickerOpen]);

  // Détection de frappe de l'arobase
  const checkMentionTrigger = (text, cursorPos) => {
    const textBefore = text.slice(0, cursorPos);
    const match = textBefore.match(/(?:^|\s)@([A-Za-zÀ-ÖØ-öø-ÿ]*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setIsMentionMenuOpen(true);
    } else {
      setIsMentionMenuOpen(false);
      setMentionQuery('');
    }
  };

  const handleInputChange = (e) => {
    const text = e.target.value;
    const cursorPos = e.target.selectionStart;
    lastSelectionRef.current = { start: cursorPos, end: cursorPos };
    setInputText(text);
    checkMentionTrigger(text, cursorPos);
  };

  const handleInputKeyUp = (e) => {
    const cursorPos = textareaRef.current ? textareaRef.current.selectionStart : inputText.length;
    lastSelectionRef.current = { start: cursorPos, end: cursorPos };
    if (isMentionMenuOpen && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
      return;
    }
    checkMentionTrigger(inputText, cursorPos);
  };

  const handleInputClick = () => {
    const cursorPos = textareaRef.current ? textareaRef.current.selectionStart : inputText.length;
    lastSelectionRef.current = { start: cursorPos, end: cursorPos };
    checkMentionTrigger(inputText, cursorPos);
  };

  // Insertion d'un membre sélectionné à l'endroit exact de l'arobase
  const handleSelectMember = (member) => {
    if (!member || !textareaRef.current) return;
    const currentText = inputText;
    const cursorPos = textareaRef.current.selectionStart ?? currentText.length;
    const textBefore = currentText.slice(0, cursorPos);
    const textAfter = currentText.slice(cursorPos);

    const match = textBefore.match(/(?:^|\s)@([A-Za-zÀ-ÖØ-öø-ÿ]*)$/);
    if (!match) {
      setIsMentionMenuOpen(false);
      return;
    }

    const atIndex = match.index + (match[0].startsWith('@') ? 0 : 1);
    const beforeAt = textBefore.slice(0, atIndex);
    const cleanAfter = textAfter.startsWith(' ') ? textAfter.slice(1) : textAfter;

    let inserted;
    if (member.isCollective || member.firstName === 'all' || member.firstName === 'tous') {
      inserted = '@all ';
    } else {
      const memberFirstName = member.firstName || member.prenom || formatAuthorFirstName(member.name);
      inserted = `@${memberFirstName} `;
    }
    const newText = beforeAt + inserted + cleanAfter;

    setInputText(newText);
    setIsMentionMenuOpen(false);
    setMentionQuery('');

    const newCursorPos = beforeAt.length + inserted.length;
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    });
  };

  const handleKeyDown = (e) => {
    if (isMentionMenuOpen && filteredMembers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedMemberIndex((prev) => (prev + 1) % filteredMembers.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedMemberIndex((prev) => (prev - 1 + filteredMembers.length) % filteredMembers.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleSelectMember(filteredMembers[highlightedMemberIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsMentionMenuOpen(false);
        return;
      }
    }

    if (e.key === 'Escape' && isInputEmojiPickerOpen) {
      e.preventDefault();
      setIsInputEmojiPickerOpen(false);
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    const text = inputText.trim();
    if (!text || disabled) return;

    if (onSendMessage) {
      onSendMessage(text);
    }
    setInputText('');
    setIsMentionMenuOpen(false);
    setMentionQuery('');
  };

  const handleEmojiSelect = (messageId, emoji) => {
    if (onAddReaction) {
      onAddReaction(messageId, emoji);
    }
    setActiveEmojiPickerMsgId(null);
  };

  // Insertion d'un émoji dans le champ texte à la position du curseur (Annotation 10)
  const handleInsertEmoji = (emoji) => {
    const textarea = textareaRef.current;
    let start = lastSelectionRef.current.start;
    let end = lastSelectionRef.current.end;

    if (textarea && typeof textarea.selectionStart === 'number' && document.activeElement === textarea) {
      start = textarea.selectionStart;
      end = textarea.selectionEnd;
    }

    if (typeof start !== 'number' || start < 0 || start > inputText.length) start = inputText.length;
    if (typeof end !== 'number' || end < start || end > inputText.length) end = start;

    const textBefore = inputText.slice(0, start);
    const textAfter = inputText.slice(end);

    const spaceBefore = textBefore.length > 0 && !textBefore.endsWith(' ') ? ' ' : '';
    const spaceAfter = textAfter.startsWith(' ') ? '' : ' ';
    const inserted = `${spaceBefore}${emoji}${spaceAfter}`;

    const newText = textBefore + inserted + textAfter;
    setInputText(newText);
    setIsInputEmojiPickerOpen(false);

    const newCursorPos = textBefore.length + inserted.length;
    lastSelectionRef.current = { start: newCursorPos, end: newCursorPos };

    requestAnimationFrame(() => {
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }
    });
  };

  return (
    <div className={`flex flex-col h-full bg-canvas-slate min-h-0 ${className}`}>
      {/* En-tête du Chat */}
      {title && (
        <div className="px-4 py-3 bg-surface-container-lowest border-b border-border-subtle flex items-center justify-between shrink-0 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">forum</span>
            <h2 className="font-headline-sm text-xs sm:text-sm font-bold text-forest-deep tracking-tight">
              {title}
            </h2>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-sage-soft text-primary font-label-sm text-[11px] font-semibold">
            {messages.length} message{messages.length > 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Zone des messages défilante */}
      <div className="p-3 sm:p-4 flex-1 overflow-y-auto flex flex-col gap-3 min-h-0">
        {messages.length === 0 ? (
          <div className="text-center py-10 text-on-surface-variant text-xs space-y-2 my-auto">
            <span className="material-symbols-outlined text-3xl text-emerald-600 block">chat_bubble_outline</span>
            <p>Aucun message pour l'instant. Soyez le premier à commenter !</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const authorRaw = msg.author_name || msg.author || 'Membre';
            const authorFirstName = formatAuthorFirstName(authorRaw);
            const initials = msg.initials || getInitials(authorRaw);

            // Règle anti-self-react stricte
            const isOwnMessage = Boolean(
              (msg.author && currentUserName && msg.author.trim().toLowerCase() === currentUserName.trim().toLowerCase()) ||
              (msg.author_name && currentUserName && msg.author_name.trim().toLowerCase() === currentUserName.trim().toLowerCase()) ||
              (formatAuthorFirstName(authorRaw).toLowerCase() === formatAuthorFirstName(currentUserName).toLowerCase()) ||
              (currentUserId && (msg.user_id === currentUserId || msg.author_id === currentUserId))
            );

            const reactionsList = normalizeReactions(msg.reactions);

            // Formatage de la date / heure
            let displayDate = msg.date || '';
            if (!displayDate && msg.created_at) {
              displayDate = new Date(msg.created_at).toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
              });
            }

            return (
              <div
                key={msg.id || index}
                className={`flex items-start gap-2.5 w-full transition-opacity duration-150 ${
                  msg.isOptimistic ? 'opacity-70' : 'opacity-100'
                }`}
              >
                {/* Avatar initiales */}
                <div className="w-8 h-8 rounded-full bg-surface-container-highest text-on-surface flex items-center justify-center text-xs font-bold shrink-0 border border-slate-200">
                  {initials}
                </div>

                <div className="flex flex-col flex-1 max-w-[85%]">
                  {/* Ligne méta : PRÉNOM STRICT (zéro rôle / titre) + Heure */}
                  <div className="flex items-center gap-2 mb-1 px-0.5">
                    <span className="text-xs font-bold text-primary">
                      {authorFirstName}
                    </span>
                    <span className="text-[11px] text-outline flex items-center gap-1">
                      {msg.isOptimistic ? (
                        <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                          <span className="material-symbols-outlined text-[13px] animate-spin">schedule</span>
                          En cours de transmission...
                        </span>
                      ) : (
                        displayDate
                      )}
                    </span>
                  </div>

                  {/* Bulle de message */}
                  <div
                    className={`p-3 rounded-2xl rounded-tl-none shadow-xs text-xs sm:text-sm leading-relaxed border ${
                      msg.isError
                        ? 'border-rose-400 bg-rose-50/70 text-rose-950'
                        : 'border-slate-200 bg-white text-on-surface'
                    }`}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">{renderMessageContent(msg.content || msg.text, handleOpenDoc)}</p>

                    {/* Fail-Fast Erreur & Bouton Réessayer */}
                    {msg.isError && (
                      <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-rose-200 text-xs">
                        <span className="text-rose-700 font-semibold flex items-center gap-1">
                          <span className="material-symbols-outlined text-[15px]">error</span>
                          Échec de transmission ({msg.errorMessage || 'Erreur réseau'})
                        </span>
                        {onRetryMessage && (
                          <button
                            type="button"
                            onClick={() => onRetryMessage(msg)}
                            className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer shadow-xs"
                          >
                            <span className="material-symbols-outlined text-[14px]">refresh</span>
                            Réessayer
                          </button>
                        )}
                      </div>
                    )}

                    {/* Barre de Réactions multi-emojis */}
                    {!msg.isOptimistic && !msg.isError && (
                      <div className="flex items-center gap-1.5 mt-2 pt-1.5 border-t border-slate-100 flex-wrap">
                        {reactionsList.map((r, rIdx) => (
                          <button
                            key={rIdx}
                            type="button"
                            disabled={isOwnMessage}
                            onClick={() => !isOwnMessage && handleEmojiSelect(msg.id, r.emoji)}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-slate-200 transition-colors ${
                              isOwnMessage
                                ? 'bg-slate-50 text-slate-500 cursor-default opacity-85'
                                : 'bg-slate-50 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 cursor-pointer'
                            }`}
                            title={isOwnMessage ? 'Vous ne pouvez pas réagir à votre propre message' : `Réagir avec ${r.emoji}`}
                          >
                            <span>{r.emoji}</span>
                            <span className="text-[10px] font-bold">{r.count}</span>
                          </button>
                        ))}

                        {/* Bouton d'ajout de réaction (INTERDIT SUR SES PROPRES MESSAGES) */}
                        {!isOwnMessage && (
                          <div className="relative inline-block emoji-popover-container">
                            <button
                              type="button"
                              onClick={() => setActiveEmojiPickerMsgId(activeEmojiPickerMsgId === msg.id ? null : msg.id)}
                              className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs transition-colors border border-slate-200 cursor-pointer"
                              title="Ajouter une réaction"
                            >
                              +
                            </button>

                            {/* Popover flottant de la palette d'émojis */}
                            {activeEmojiPickerMsgId === msg.id && (
                              <div className="absolute left-0 bottom-8 z-30 bg-white dark:bg-slate-900 shadow-xl border border-slate-200 dark:border-slate-800 rounded-2xl p-2 w-56 sm:w-60 animate-in zoom-in-95 duration-100">
                                <div className="grid grid-cols-6 gap-1">
                                  {CHAT_ALLOWED_EMOJIS.map((emoji) => (
                                    <button
                                      key={emoji}
                                      type="button"
                                      onClick={() => handleEmojiSelect(msg.id, emoji)}
                                      className="w-8 h-8 flex items-center justify-center hover:bg-emerald-50 dark:hover:bg-slate-800 rounded-lg text-base cursor-pointer transition-transform hover:scale-125"
                                      title={emoji}
                                    >
                                      {emoji}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={chatBottomRef} />
      </div>

      {/* Console de saisie */}
      <form onSubmit={handleSubmit} className="p-3 sm:p-3.5 bg-white flex flex-col gap-2 border-t border-slate-200 shadow-sm shrink-0">
        <div className="relative">
          {/* Popover / Menu flottant d'autocomplétion des mentions */}
          {isMentionMenuOpen && (
            <div
              ref={mentionMenuRef}
              className="absolute bottom-full left-0 mb-2 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150"
            >
              <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400 select-none">
                <span className="flex items-center gap-1.5">
                  <span className="text-primary font-bold">@</span>
                  Mentionner un associé
                </span>
                <span className="text-[10px] font-normal text-slate-400">
                  ↑↓ Naviguer • ↵ Valider
                </span>
              </div>

              <div className="max-h-56 overflow-y-auto p-1.5 space-y-0.5" ref={menuListRef}>
                {filteredMembers.length === 0 ? (
                  <div className="px-3 py-3 text-center text-xs text-slate-400 dark:text-slate-500">
                    Aucun associé trouvé
                  </div>
                ) : (
                  filteredMembers.map((member, idx) => {
                    const isSelected = idx === highlightedMemberIndex;
                    if (member.isCollective) {
                      return (
                        <button
                          key="collective_all"
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelectMember(member);
                          }}
                          onMouseEnter={() => setHighlightedMemberIndex(idx)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-xl flex items-center gap-2.5 text-xs transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-amber-100/90 dark:bg-amber-950/70 text-amber-950 dark:text-amber-100 font-medium'
                              : 'text-amber-900 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-900/30'
                          }`}
                        >
                          <div className="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center text-[11px] font-bold shrink-0 shadow-xs">
                            📢
                          </div>
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="truncate font-bold text-amber-900 dark:text-amber-100">@all</span>
                            <span className="truncate text-[10px] text-amber-700/80 dark:text-amber-300/80">
                              Tous les associés (notification générale)
                            </span>
                          </div>
                          {isSelected && (
                            <span className="material-symbols-outlined text-[14px] text-amber-700 dark:text-amber-400 shrink-0">
                              check
                            </span>
                          )}
                        </button>
                      );
                    }
                    const initials = getInitials(member.name || member.firstName);
                    return (
                      <button
                        key={member.id || member.firstName || idx}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectMember(member);
                        }}
                        onMouseEnter={() => setHighlightedMemberIndex(idx)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-xl flex items-center gap-2.5 text-xs transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-900 dark:text-sky-100 font-medium'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                        }`}
                      >
                        <div className="w-6 h-6 rounded-full bg-surface-container-highest text-on-surface flex items-center justify-center text-[10px] font-bold text-primary shrink-0 border border-slate-200 dark:border-slate-700">
                          {initials}
                        </div>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="truncate font-semibold">@{member.firstName}</span>
                          {member.name && member.name !== member.firstName && (
                            <span className="truncate text-[10px] text-slate-400 dark:text-slate-500">
                              {member.name}
                            </span>
                          )}
                        </div>
                        {isSelected && (
                          <span className="material-symbols-outlined text-[14px] text-sky-600 dark:text-sky-400 shrink-0">
                            check
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          <textarea
            ref={textareaRef}
            rows={2}
            value={inputText}
            onChange={handleInputChange}
            onKeyUp={handleInputKeyUp}
            onClick={handleInputClick}
            onSelect={(e) => {
              lastSelectionRef.current = {
                start: e.target.selectionStart,
                end: e.target.selectionEnd,
              };
            }}
            disabled={disabled}
            placeholder={placeholder}
            className="w-full bg-canvas-slate rounded-lg px-3.5 py-2.5 text-xs sm:text-sm text-on-surface placeholder:text-outline border border-slate-300 dark:border-slate-700 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 shadow-inner resize-none outline-none disabled:opacity-50"
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className="flex items-center justify-between pt-0.5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                if (onAttachClick) {
                  onAttachClick();
                } else {
                  setIsChatUploadModalOpen(true);
                }
              }}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white text-slate-500 hover:text-emerald-800 hover:bg-sage-soft transition-colors border border-slate-200 cursor-pointer"
              title="Joindre un document administratif"
            >
              <span className="material-symbols-outlined text-[18px]">attach_file</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const newText = inputText + (inputText.length > 0 && !inputText.endsWith(' ') ? ' ' : '') + '@';
                setInputText(newText);
                setIsMentionMenuOpen(true);
                setMentionQuery('');
                requestAnimationFrame(() => {
                  if (textareaRef.current) {
                    textareaRef.current.focus();
                    textareaRef.current.setSelectionRange(newText.length, newText.length);
                  }
                });
              }}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white text-slate-500 hover:text-emerald-800 hover:bg-sage-soft transition-colors border border-slate-200 cursor-pointer font-bold text-sm"
              title="Mentionner un membre (@)"
            >
              @
            </button>

            {/* Bouton et popover d'émojis variés (Annotation 10) */}
            <div className="relative inline-block input-emoji-picker-container" ref={inputEmojiPickerRef}>
              <button
                type="button"
                onClick={() => setIsInputEmojiPickerOpen((prev) => !prev)}
                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors border cursor-pointer ${
                  isInputEmojiPickerOpen
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 ring-1 ring-emerald-300'
                    : 'bg-white text-slate-500 hover:text-emerald-800 hover:bg-sage-soft border-slate-200'
                }`}
                title="Ajouter un emoji"
                aria-expanded={isInputEmojiPickerOpen}
                aria-label="Ajouter un emoji"
              >
                <span className="material-symbols-outlined text-[18px]">sentiment_satisfied</span>
              </button>

              {/* Popover compact d'émojis riches */}
              {isInputEmojiPickerOpen && (
                <div
                  className="absolute bottom-full left-0 mb-2 w-64 p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150"
                  role="dialog"
                  aria-label="Palette d'émojis"
                >
                  <div className="px-1.5 pb-1.5 mb-1.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400 select-none">
                    <span className="flex items-center gap-1">
                      <span>✨</span>
                      <span>Émojis</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-normal">18 réactions</span>
                  </div>
                  <div className="grid grid-cols-6 gap-1">
                    {CHAT_EMOJI_PALETTE.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => handleInsertEmoji(emoji)}
                        className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-emerald-50 dark:hover:bg-slate-800 text-lg cursor-pointer transition-transform hover:scale-125 active:scale-95"
                        title={emoji}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={disabled || !inputText.trim()}
            className="px-4 py-1.5 rounded-xl bg-forest-deep hover:bg-forest-deep/90 text-white font-semibold text-xs sm:text-sm flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <span>Envoyer</span>
            <span className="material-symbols-outlined text-[16px]">send</span>
          </button>
        </div>
      </form>

      {/* Visionneuse universelle intégrée pour les documents du chat (Annotation 10) */}
      <DocumentViewerModal
        isOpen={isViewerOpen}
        onClose={() => {
          setIsViewerOpen(false);
          setViewerDoc(null);
        }}
        document={viewerDoc}
      />

      {/* Modale d'upload universelle autonome (Annotation 10 & 11) */}
      {!onAttachClick && (
        <UploadDocumentModal
          isOpen={isChatUploadModalOpen}
          onClose={() => setIsChatUploadModalOpen(false)}
          targetTaskId={taskId}
          defaultCategory={defaultCategory}
          currentUser={currentUser}
          onUploadSuccess={handleChatUploadSuccess}
        />
      )}
    </div>
  );
}
