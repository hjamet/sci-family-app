import React, { useState, useRef, useEffect } from 'react';

export const CHAT_ALLOWED_EMOJIS = ['👍', '❤️', '👏', '🎉', '👀', '✅', '🔥', '🙏'];

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
 * Composant de chat familial unifié et réutilisable (FamilyChat)
 * Zéro duplication de code, respect strict des prénoms (zéro badges de rôle),
 * palette 8 emojis, règle anti-self-react et fail-fast.
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
  className = '',
}) {
  const [inputText, setInputText] = useState('');
  const [activeEmojiPickerMsgId, setActiveEmojiPickerMsgId] = useState(null);
  const chatBottomRef = useRef(null);

  const currentUserName = typeof currentUser === 'string'
    ? currentUser
    : (currentUser?.name || currentUser?.prenom || 'Henri Jamet');
  const currentUserId = typeof currentUser === 'object' ? currentUser?.id : null;

  // Défilement automatique au dernier message
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Fermer le popover emoji si on clique ailleurs
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (activeEmojiPickerMsgId && !e.target.closest('.emoji-popover-container')) {
        setActiveEmojiPickerMsgId(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [activeEmojiPickerMsgId]);

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    const text = inputText.trim();
    if (!text || disabled) return;

    if (onSendMessage) {
      onSendMessage(text);
    }
    setInputText('');
  };

  const handleEmojiSelect = (messageId, emoji) => {
    if (onAddReaction) {
      onAddReaction(messageId, emoji);
    }
    setActiveEmojiPickerMsgId(null);
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
                    <p className="whitespace-pre-wrap">{msg.content || msg.text}</p>

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

                            {/* Popover flottant des 8 emojis */}
                            {activeEmojiPickerMsgId === msg.id && (
                              <div className="absolute left-0 bottom-8 z-30 bg-white shadow-xl border border-slate-200 rounded-xl p-1.5 flex gap-1 animate-in zoom-in-95 duration-100">
                                {CHAT_ALLOWED_EMOJIS.map((emoji) => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => handleEmojiSelect(msg.id, emoji)}
                                    className="p-1 hover:bg-emerald-50 rounded text-base cursor-pointer transition-transform hover:scale-125"
                                    title={emoji}
                                  >
                                    {emoji}
                                  </button>
                                ))}
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
          <textarea
            rows={2}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={disabled}
            placeholder={placeholder}
            className="w-full bg-canvas-slate rounded-xl p-2.5 sm:p-3 text-xs sm:text-sm text-on-surface placeholder:text-outline border border-slate-300 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 shadow-inner resize-none outline-none disabled:opacity-50"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
        </div>

        <div className="flex items-center justify-between pt-0.5">
          <div className="flex items-center gap-1.5">
            {onAttachClick && (
              <button
                type="button"
                onClick={onAttachClick}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white text-slate-500 hover:text-emerald-800 hover:bg-sage-soft transition-colors border border-slate-200 cursor-pointer"
                title="Joindre un document"
              >
                <span className="material-symbols-outlined text-[18px]">attach_file</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setInputText((prev) => prev + (prev.length > 0 && !prev.endsWith(' ') ? ' ' : '') + '👍 ')}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white text-slate-500 hover:text-emerald-800 hover:bg-sage-soft transition-colors border border-slate-200 cursor-pointer"
              title="Ajouter un emoji"
            >
              <span className="material-symbols-outlined text-[18px]">sentiment_satisfied</span>
            </button>
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
    </div>
  );
}
