import React, { useState, useRef } from 'react';
import {
  Bold, Italic, Heading1, Heading2, List, ListOrdered,
  Quote, Link as LinkIcon, Minus, Eye, Edit3, Columns, HelpCircle
} from 'lucide-react';

/**
 * Moteur de rendu Markdown léger, sécurisé et stylé pour la famille
 */
export function MarkdownContent({ content }) {
  if (!content || !content.trim()) {
    return <p className="text-slate-400 italic text-xs">Aucune description saisie.</p>;
  }

  // Découpage par lignes pour gérer les blocs (titres, listes, citations)
  const lines = content.split('\n');
  const elements = [];
  let currentList = null;
  let listType = null; // 'ul' | 'ol'

  const flushList = () => {
    if (currentList && currentList.length > 0) {
      if (listType === 'ol') {
        elements.push(
          <ol key={`ol-${elements.length}`} className="list-decimal list-inside space-y-1 my-2 text-slate-700 text-xs sm:text-sm pl-1">
            {currentList.map((item, i) => (
              <li key={i} className="leading-relaxed">{parseInlineMarkdown(item)}</li>
            ))}
          </ol>
        );
      } else {
        elements.push(
          <ul key={`ul-${elements.length}`} className="list-disc list-inside space-y-1 my-2 text-slate-700 text-xs sm:text-sm pl-1">
            {currentList.map((item, i) => (
              <li key={i} className="leading-relaxed">{parseInlineMarkdown(item)}</li>
            ))}
          </ul>
        );
      }
      currentList = null;
      listType = null;
    }
  };

  // Parsing inline pour le gras, l'italique, les liens et le code
  function parseInlineMarkdown(text) {
    if (!text) return null;
    
    // Remplacement simple par regex
    const parts = [];
    let remaining = text;
    let keyIdx = 0;

    // Pattern combiné pour liens [label](url), gras **text**, italique *text*
    const combinedRegex = /(\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/;

    while (remaining) {
      const match = remaining.match(combinedRegex);
      if (!match) {
        parts.push(remaining);
        break;
      }

      const matchIndex = match.index;
      if (matchIndex > 0) {
        parts.push(remaining.substring(0, matchIndex));
      }

      if (match[2] && match[3]) {
        // Lien [texte](url)
        parts.push(
          <a
            key={keyIdx++}
            href={match[3]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary font-semibold hover:underline inline-flex items-center gap-0.5"
          >
            {match[2]}
          </a>
        );
      } else if (match[4]) {
        // Gras **texte**
        parts.push(<strong key={keyIdx++} className="font-bold text-slate-900">{match[4]}</strong>);
      } else if (match[5]) {
        // Italique *texte*
        parts.push(<em key={keyIdx++} className="italic text-slate-800">{match[5]}</em>);
      } else if (match[6]) {
        // Code `texte`
        parts.push(
          <code key={keyIdx++} className="px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded font-mono text-[11px]">
            {match[6]}
          </code>
        );
      }

      remaining = remaining.substring(matchIndex + match[0].length);
    }

    return parts;
  }

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trimEnd();

    // Ligne vide
    if (!line.trim()) {
      flushList();
      elements.push(<div key={`empty-${idx}`} className="h-2"></div>);
      return;
    }

    // Titre H1 : # Titre
    if (line.startsWith('# ')) {
      flushList();
      elements.push(
        <h3 key={`h1-${idx}`} className="font-bold text-base sm:text-lg text-slate-900 mt-3 mb-1.5 pb-1 border-b border-slate-200">
          {parseInlineMarkdown(line.slice(2))}
        </h3>
      );
      return;
    }

    // Titre H2 : ## Titre
    if (line.startsWith('## ')) {
      flushList();
      elements.push(
        <h4 key={`h2-${idx}`} className="font-bold text-sm sm:text-base text-forest-deep mt-2.5 mb-1">
          {parseInlineMarkdown(line.slice(3))}
        </h4>
      );
      return;
    }

    // Titre H3 : ### Titre
    if (line.startsWith('### ')) {
      flushList();
      elements.push(
        <h5 key={`h3-${idx}`} className="font-bold text-xs sm:text-sm text-slate-800 mt-2 mb-1">
          {parseInlineMarkdown(line.slice(4))}
        </h5>
      );
      return;
    }

    // Séparateur horizontal : --- ou ***
    if (/^(\*\*\*|---|___)$/.test(line.trim())) {
      flushList();
      elements.push(<hr key={`hr-${idx}`} className="my-3 border-t border-slate-200" />);
      return;
    }

    // Citation : > Texte
    if (line.startsWith('>')) {
      flushList();
      elements.push(
        <blockquote key={`quote-${idx}`} className="border-l-4 border-amber-400 bg-amber-50/60 pl-3 py-1.5 my-2 rounded-r-lg text-slate-700 italic text-xs sm:text-sm">
          {parseInlineMarkdown(line.replace(/^>\s*/, ''))}
        </blockquote>
      );
      return;
    }

    // Liste à puces : - élément ou * élément
    if (/^[-*]\s+/.test(line)) {
      if (listType !== 'ul') {
        flushList();
        listType = 'ul';
        currentList = [];
      }
      currentList.push(line.replace(/^[-*]\s+/, ''));
      return;
    }

    // Liste numérotée : 1. élément
    if (/^\d+\.\s+/.test(line)) {
      if (listType !== 'ol') {
        flushList();
        listType = 'ol';
        currentList = [];
      }
      currentList.push(line.replace(/^\d+\.\s+/, ''));
      return;
    }

    // Paragraphe classique
    flushList();
    elements.push(
      <p key={`p-${idx}`} className="text-slate-700 text-xs sm:text-sm leading-relaxed my-1">
        {parseInlineMarkdown(line)}
      </p>
    );
  });

  flushList();

  return <div className="rich-markdown-body space-y-1">{elements}</div>;
}

/**
 * Composant RichTextEditor : Éditeur Markdown convivial avec barre d'outils, split view et aperçu
 */
export default function RichTextEditor({
  value = '',
  onChange,
  placeholder = 'Décrivez le sujet avec clarté...',
  label = 'Description',
  required = false,
  rows = 5,
  helperText
}) {
  const [viewMode, setViewMode] = useState('split'); // 'edit' | 'preview' | 'split'
  const [showHelp, setShowHelp] = useState(false);
  const textareaRef = useRef(null);

  // Insérer un balisage ou formater la sélection courante
  const insertSyntax = (prefix, suffix = '', defaultText = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentVal = textarea.value;
    const selectedText = currentVal.substring(start, end) || defaultText;

    const before = currentVal.substring(0, start);
    const after = currentVal.substring(end);

    const replacement = `${prefix}${selectedText}${suffix}`;
    const newValue = before + replacement + after;

    if (onChange) {
      onChange(newValue);
    }

    // Repositionner le curseur
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + prefix.length + selectedText.length + suffix.length;
      textarea.setSelectionRange(
        start + prefix.length,
        start + prefix.length + selectedText.length
      );
    }, 10);
  };

  const handleToolClick = (tool) => {
    switch (tool) {
      case 'bold':
        insertSyntax('**', '**', 'texte en gras');
        break;
      case 'italic':
        insertSyntax('*', '*', 'texte en italique');
        break;
      case 'h1':
        insertSyntax('# ', '', 'Titre principal');
        break;
      case 'h2':
        insertSyntax('## ', '', 'Sous-titre');
        break;
      case 'ul':
        insertSyntax('- ', '', 'Élément de liste');
        break;
      case 'ol':
        insertSyntax('1. ', '', 'Élément numéroté');
        break;
      case 'quote':
        insertSyntax('> ', '', 'Citation ou note importante');
        break;
      case 'link':
        insertSyntax('[', '](https://...)', 'Texte du lien');
        break;
      case 'hr':
        insertSyntax('\n---\n', '', '');
        break;
      default:
        break;
    }
  };

  return (
    <div className="w-full flex flex-col space-y-1.5">
      {/* En-tête avec label et basculeurs de vue */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
          <span>{label}</span>
          {required && <span className="text-rose-500 font-bold">*</span>}
        </label>

        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
          <button
            type="button"
            onClick={() => setViewMode('edit')}
            className={`px-2 py-1 rounded-md font-medium flex items-center gap-1 transition ${
              viewMode === 'edit'
                ? 'bg-white text-slate-900 shadow-sm font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Mode édition uniquement"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Éditer</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('preview')}
            className={`px-2 py-1 rounded-md font-medium flex items-center gap-1 transition ${
              viewMode === 'preview'
                ? 'bg-white text-slate-900 shadow-sm font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Aperçu du rendu final"
          >
            <Eye className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Aperçu</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('split')}
            className={`px-2 py-1 rounded-md font-medium flex items-center gap-1 transition ${
              viewMode === 'split'
                ? 'bg-white text-slate-900 shadow-sm font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Vue scindée (Édition + Aperçu en direct)"
          >
            <Columns className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Partagé</span>
          </button>

          <button
            type="button"
            onClick={() => setShowHelp(!showHelp)}
            className={`px-1.5 py-1 rounded-md text-slate-500 hover:text-slate-800 transition ${
              showHelp ? 'bg-amber-100 text-amber-800' : ''
            }`}
            title="Aide sur la mise en forme"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Guide rapide pliable */}
      {showHelp && (
        <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1 animate-in fade-in duration-200">
          <div className="font-bold flex items-center gap-1 text-amber-800">
            <span>💡 Guide express pour la famille</span>
          </div>
          <p className="text-[11px] text-amber-700">
            Utilisez les boutons de la barre d'outils ou tapez directement :
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[11px] pt-1">
            <span className="bg-white/80 px-2 py-1 rounded border border-amber-200/60"><strong>**Gras**</strong></span>
            <span className="bg-white/80 px-2 py-1 rounded border border-amber-200/60"><em>*Italique*</em></span>
            <span className="bg-white/80 px-2 py-1 rounded border border-amber-200/60"><code>- Liste à puces</code></span>
            <span className="bg-white/80 px-2 py-1 rounded border border-amber-200/60"><code># Titre</code></span>
          </div>
        </div>
      )}

      {/* Boîtier principal de l'éditeur */}
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm focus-within:ring-2 focus-within:ring-primary focus-within:border-primary transition">
        
        {/* Barre d'outils intuitive */}
        {viewMode !== 'preview' && (
          <div className="flex flex-wrap items-center gap-1 p-1.5 bg-slate-50 border-b border-slate-200 text-slate-700">
            <button
              type="button"
              onClick={() => handleToolClick('bold')}
              className="p-1.5 rounded hover:bg-slate-200 text-slate-700 hover:text-slate-900 transition"
              title="Gras (**texte**)"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => handleToolClick('italic')}
              className="p-1.5 rounded hover:bg-slate-200 text-slate-700 hover:text-slate-900 transition"
              title="Italique (*texte*)"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>

            <span className="w-px h-4 bg-slate-200 mx-0.5" />

            <button
              type="button"
              onClick={() => handleToolClick('h1')}
              className="p-1.5 rounded hover:bg-slate-200 text-slate-700 hover:text-slate-900 transition"
              title="Titre principal (# Titre)"
            >
              <Heading1 className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => handleToolClick('h2')}
              className="p-1.5 rounded hover:bg-slate-200 text-slate-700 hover:text-slate-900 transition"
              title="Sous-titre (## Titre)"
            >
              <Heading2 className="w-3.5 h-3.5" />
            </button>

            <span className="w-px h-4 bg-slate-200 mx-0.5" />

            <button
              type="button"
              onClick={() => handleToolClick('ul')}
              className="p-1.5 rounded hover:bg-slate-200 text-slate-700 hover:text-slate-900 transition"
              title="Liste à puces (- item)"
            >
              <List className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => handleToolClick('ol')}
              className="p-1.5 rounded hover:bg-slate-200 text-slate-700 hover:text-slate-900 transition"
              title="Liste numérotée (1. item)"
            >
              <ListOrdered className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => handleToolClick('quote')}
              className="p-1.5 rounded hover:bg-slate-200 text-slate-700 hover:text-slate-900 transition"
              title="Citation ou remarque (> texte)"
            >
              <Quote className="w-3.5 h-3.5" />
            </button>

            <span className="w-px h-4 bg-slate-200 mx-0.5" />

            <button
              type="button"
              onClick={() => handleToolClick('link')}
              className="p-1.5 rounded hover:bg-slate-200 text-slate-700 hover:text-slate-900 transition"
              title="Lien web ([titre](url))"
            >
              <LinkIcon className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => handleToolClick('hr')}
              className="p-1.5 rounded hover:bg-slate-200 text-slate-700 hover:text-slate-900 transition"
              title="Ligne de séparation (---)"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Corps de l'éditeur selon le mode */}
        <div className="relative">
          {/* 1. Mode Édition pure */}
          {viewMode === 'edit' && (
            <textarea
              ref={textareaRef}
              rows={rows}
              value={value}
              onChange={(e) => onChange && onChange(e.target.value)}
              placeholder={placeholder}
              className="w-full p-3 bg-white text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none resize-y min-h-[120px] font-sans leading-relaxed"
              required={required}
            />
          )}

          {/* 2. Mode Aperçu pur */}
          {viewMode === 'preview' && (
            <div className="p-3 bg-slate-50/50 min-h-[140px] max-h-[360px] overflow-y-auto">
              <MarkdownContent content={value} />
            </div>
          )}

          {/* 3. Mode Partagé (Split View) */}
          {viewMode === 'split' && (
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200 min-h-[140px]">
              {/* Colonne gauche : Saisie */}
              <div className="flex flex-col">
                <textarea
                  ref={textareaRef}
                  rows={rows}
                  value={value}
                  onChange={(e) => onChange && onChange(e.target.value)}
                  placeholder={placeholder}
                  className="w-full p-3 bg-white text-xs text-slate-900 placeholder-slate-400 focus:outline-none resize-none flex-1 min-h-[130px] font-sans leading-relaxed"
                  required={required}
                />
              </div>

              {/* Colonne droite : Rendu instantané */}
              <div className="p-3 bg-slate-50/70 overflow-y-auto max-h-[260px] min-h-[130px] flex flex-col">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block select-none">
                  Aperçu en direct
                </span>
                <div className="flex-1">
                  <MarkdownContent content={value} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {helperText && (
        <span className="text-[11px] text-slate-500">{helperText}</span>
      )}
    </div>
  );
}
