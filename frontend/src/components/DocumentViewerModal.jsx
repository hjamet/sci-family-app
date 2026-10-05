import React, { useState, useEffect } from 'react';
import {
  Download,
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  ExternalLink,
  AlertCircle,
  Loader2
} from 'lucide-react';

/**
 * Extensions et classifications universelles de formats de fichiers.
 */
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'm4v', 'ogg', 'ogv', 'avi', 'mkv'];
const PDF_EXTENSIONS = ['pdf'];
const TEXT_EXTENSIONS = ['txt', 'md', 'json', 'csv', 'log'];
const SPREADSHEET_EXTENSIONS = ['xlsx', 'xls', 'ods', 'csv'];
const WORD_EXTENSIONS = ['docx', 'doc', 'odt', 'rtf'];
const ARCHIVE_EXTENSIONS = ['zip', 'rar', '7z', 'tar', 'gz'];

/**
 * Extrait l'extension d'un nom de fichier ou d'un chemin URL.
 */
function getExtension(filename) {
  if (!filename) return '';
  const clean = filename.split('?')[0].split('#')[0];
  const parts = clean.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

/**
 * Détermine le type de média de façon universelle :
 * Combine extension de fichier, champ mime_type/file_type et en-tête HTTP.
 */
function detectMediaType({ ext, mimeType, filename }) {
  const normalizedExt = (ext || getExtension(filename)).toLowerCase();
  const normalizedMime = (mimeType || '').toLowerCase().trim();

  // 1. Détection prioritaire par extension explicite
  if (IMAGE_EXTENSIONS.includes(normalizedExt)) return 'image';
  if (VIDEO_EXTENSIONS.includes(normalizedExt)) return 'video';
  if (PDF_EXTENSIONS.includes(normalizedExt)) return 'pdf';
  if (TEXT_EXTENSIONS.includes(normalizedExt)) return 'text';
  if ([...SPREADSHEET_EXTENSIONS, ...WORD_EXTENSIONS, ...ARCHIVE_EXTENSIONS].includes(normalizedExt)) return 'other';

  // 2. Détection par type MIME (si l'extension est absente ou générique)
  if (normalizedMime.startsWith('image/')) return 'image';
  if (normalizedMime.startsWith('video/')) return 'video';
  if (normalizedMime === 'application/pdf' || normalizedMime.includes('/pdf')) return 'pdf';
  if (normalizedMime.startsWith('text/') || normalizedMime === 'application/json') return 'text';
  if (
    normalizedMime.includes('spreadsheet') ||
    normalizedMime.includes('excel') ||
    normalizedMime.includes('word') ||
    normalizedMime.includes('officedocument') ||
    normalizedMime.includes('zip') ||
    normalizedMime.includes('compressed') ||
    normalizedMime.includes('tar')
  ) {
    return 'other';
  }

  // Par défaut, si non résolu
  return 'other';
}

/**
 * Détermine le type MIME exact à assigner au Blob créé.
 */
function resolveBlobMime({ mediaType, ext, serverHeaderMime, initialMime }) {
  if (mediaType === 'image') {
    if (serverHeaderMime?.startsWith('image/')) return serverHeaderMime;
    if (initialMime?.startsWith('image/')) return initialMime;
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    if (ext === 'gif') return 'image/gif';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'svg') return 'image/svg+xml';
    if (ext === 'bmp') return 'image/bmp';
    if (ext === 'ico') return 'image/x-icon';
    return 'image/jpeg';
  }
  if (mediaType === 'video') {
    if (serverHeaderMime?.startsWith('video/')) return serverHeaderMime;
    if (initialMime?.startsWith('video/')) return initialMime;
    if (ext === 'mp4' || ext === 'm4v') return 'video/mp4';
    if (ext === 'webm') return 'video/webm';
    if (ext === 'mov') return 'video/quicktime';
    if (ext === 'ogg' || ext === 'ogv') return 'video/ogg';
    return 'video/mp4';
  }
  if (mediaType === 'pdf') {
    return 'application/pdf';
  }
  if (mediaType === 'text') {
    return 'text/plain;charset=utf-8';
  }
  return serverHeaderMime || initialMime || 'application/octet-stream';
}

/**
 * DocumentViewerModal
 * Visionneuse universelle intégrée pour PDFs, images, vidéos et documents.
 * Rendu spécifique et élégant selon le format réel avec détection universelle du type de contenu.
 */
export default function DocumentViewerModal({
  isOpen,
  onClose,
  document: docItem, // { url, file_url, filename, file_name, title, name, file_type, mime_type, file_size, size, content }
  fileUrl: explicitUrl,
  fileName: explicitName,
  fileType: explicitType,
  onDownload
}) {
  // Détermination de l'URL, du nom et de l'extension
  const rawUrl = explicitUrl || docItem?.file_url || docItem?.url || (docItem?.id ? `/api/documents/${docItem.id}/download` : '');
  const fileName = explicitName || docItem?.filename || docItem?.file_name || docItem?.title || docItem?.name || 'document';
  const ext = getExtension(fileName) || getExtension(docItem?.file_path) || getExtension(rawUrl);
  const rawType = explicitType || docItem?.mime_type || docItem?.file_type || docItem?.type || '';

  // États internes de visualisation et de typage
  const [blobUrl, setBlobUrl] = useState(null);
  const [textContent, setTextContent] = useState(docItem?.content || null);
  const [mediaTypeOverride, setMediaTypeOverride] = useState(null);
  const [formatNotice, setFormatNotice] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [serverContentType, setServerContentType] = useState(null);
  const [fetchedSize, setFetchedSize] = useState(null);

  // Contrôles pour les images
  const [zoomLevel, setZoomLevel] = useState(1);
  const [rotation, setRotation] = useState(0);

  // Résolution dynamique du type de média (avec prise en compte du format réel inspecté dans le binaire)
  const activeMediaType = mediaTypeOverride || detectMediaType({
    ext,
    mimeType: serverContentType || rawType,
    filename: fileName
  });

  // Calcul dynamique de la taille affichée
  const displaySize = (() => {
    if (docItem?.size && typeof docItem.size === 'string' && docItem.size !== '—') {
      return docItem.size;
    }
    const rawBytes = fetchedSize || (typeof docItem?.file_size === 'number' ? docItem.file_size : null);
    if (rawBytes) {
      if (rawBytes < 1024) return `${rawBytes} o`;
      if (rawBytes < 1024 * 1024) return `${(rawBytes / 1024).toFixed(1)} Ko`;
      return `${(rawBytes / (1024 * 1024)).toFixed(1)} Mo`;
    }
    return null;
  })();

  // Métadonnées d'affichage pour les cartes des formats non prévisualisables (Word, Excel, Archive, etc.)
  const getOtherCardMeta = () => {
    if (SPREADSHEET_EXTENSIONS.includes(ext)) {
      return {
        icon: 'table_view',
        color: 'text-emerald-600 dark:text-emerald-400',
        bg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60',
        label: 'Feuille de calcul'
      };
    }
    if (WORD_EXTENSIONS.includes(ext)) {
      return {
        icon: 'description',
        color: 'text-blue-600 dark:text-blue-400',
        bg: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800/60',
        label: 'Document traitement de texte'
      };
    }
    if (ARCHIVE_EXTENSIONS.includes(ext)) {
      return {
        icon: 'folder_zip',
        color: 'text-amber-600 dark:text-amber-400',
        bg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60',
        label: 'Archive compressée'
      };
    }
    return {
      icon: 'draft',
      color: 'text-slate-600 dark:text-slate-300',
      bg: 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700',
      label: 'Document'
    };
  };

  const otherMeta = getOtherCardMeta();

  // Chargement sécurisé du document pour affichage inline (contournement Content-Disposition: attachment)
  useEffect(() => {
    if (!isOpen || !rawUrl) {
      setBlobUrl(null);
      setTextContent(docItem?.content || null);
      setMediaTypeOverride(null);
      setFormatNotice(null);
      setLoadError(null);
      setServerContentType(null);
      setFetchedSize(null);
      setZoomLevel(1);
      setRotation(0);
      return;
    }

    // Si c'est déjà un data URL ou blob URL
    if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) {
      setBlobUrl(rawUrl);
      setIsLoading(false);
      return;
    }

    // Si on a déjà du contenu texte fourni directement
    if (activeMediaType === 'text' && docItem?.content) {
      setTextContent(docItem.content);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    let createdUrl = null;

    const fetchDocumentContent = async () => {
      setIsLoading(true);
      setLoadError(null);
      setMediaTypeOverride(null);
      setFormatNotice(null);

      try {
        const response = await fetch(rawUrl);
        if (!response.ok) {
          throw new Error(`Erreur HTTP ${response.status} (${response.statusText || 'Échec de chargement'})`);
        }

        // Extraction du Content-Type du header HTTP
        const headerContentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
        if (headerContentType && isMounted) {
          setServerContentType(headerContentType);
        }

        // Récupération de la taille si fournie par le serveur
        const contentLength = response.headers.get('content-length');
        if (contentLength && isMounted) {
          const parsedLen = parseInt(contentLength, 10);
          if (!isNaN(parsedLen) && parsedLen > 0) {
            setFetchedSize(parsedLen);
          }
        }

        // Type de média résolu avec l'en-tête serveur
        const resolvedMediaType = detectMediaType({
          ext,
          mimeType: headerContentType || rawType,
          filename: fileName
        });

        if (resolvedMediaType === 'text') {
          const text = await response.text();
          if (isMounted) setTextContent(text);
        } else {
          const blob = await response.blob();
          if (isMounted && blob.size > 0) {
            setFetchedSize(blob.size);
          }

          let effectiveMediaType = resolvedMediaType;

          // Si le document est identifié comme PDF, validation stricte de la signature magique
          if (resolvedMediaType === 'pdf') {
            const headerSlice = await blob.slice(0, 1024).arrayBuffer();
            const headerBytes = new Uint8Array(headerSlice);
            const headerStr = new TextDecoder('latin1').decode(headerBytes);
            const isRealPdf = headerStr.includes('%PDF-');

            if (!isRealPdf) {
              // Vérification si le document est du texte lisible (ex: Markdown Voicenotes ou note Obsidian)
              const hasNullBytes = headerBytes.slice(0, Math.min(headerBytes.length, 512)).some(b => b === 0);
              if (!hasNullBytes) {
                effectiveMediaType = 'text';
                const text = await blob.text();
                if (isMounted) {
                  setTextContent(text);
                  setMediaTypeOverride('text');
                  setFormatNotice('Ce document porte une extension .pdf mais son contenu réel est du texte brut / Markdown.');
                }
              } else {
                effectiveMediaType = 'other';
                if (isMounted) {
                  setMediaTypeOverride('other');
                  setFormatNotice("Ce document porte une extension .pdf mais sa structure binaire n'est pas un document PDF valide.");
                }
              }
            }
          }

          if (effectiveMediaType !== 'text') {
            // Détermination du bon type MIME selon le format réel
            const safeMime = resolveBlobMime({
              mediaType: effectiveMediaType,
              ext,
              serverHeaderMime: headerContentType,
              initialMime: rawType
            });

            const safeBlob = new Blob([blob], { type: safeMime });
            createdUrl = URL.createObjectURL(safeBlob);
            if (isMounted) {
              setBlobUrl(createdUrl);
            }
          }
        }
      } catch (err) {
        console.warn('DocumentViewerModal fetch notice:', err.message);
        if (isMounted) {
          setLoadError(`Aperçu direct indisponible (${err.message || 'Erreur réseau'}). Utilisez le bouton Télécharger pour le consulter.`);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchDocumentContent();

    return () => {
      isMounted = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [isOpen, rawUrl, fileName, ext, rawType]);

  // Raccourci clavier Échap
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Déclenchement du téléchargement universel
  const handleDownloadTrigger = () => {
    if (onDownload) {
      onDownload(docItem || { url: rawUrl, filename: fileName, name: fileName });
      return;
    }

    const downloadLink = document.createElement('a');
    downloadLink.href = blobUrl || rawUrl;
    downloadLink.download = fileName;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  };

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 0.25, 0.5));
  const handleResetZoom = () => {
    setZoomLevel(1);
    setRotation(0);
  };
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

  // Rendu de l'icône d'en-tête selon le format
  const renderHeaderIcon = () => {
    if (activeMediaType === 'pdf') {
      return <span className="material-symbols-outlined text-[22px] text-red-600">picture_as_pdf</span>;
    }
    if (activeMediaType === 'image') {
      return <span className="material-symbols-outlined text-[22px] text-emerald-600">image</span>;
    }
    if (activeMediaType === 'video') {
      return <span className="material-symbols-outlined text-[22px] text-violet-600">movie</span>;
    }
    if (activeMediaType === 'text') {
      return <span className="material-symbols-outlined text-[22px] text-blue-600">description</span>;
    }
    if (SPREADSHEET_EXTENSIONS.includes(ext)) {
      return <span className="material-symbols-outlined text-[22px] text-emerald-700">table_view</span>;
    }
    if (WORD_EXTENSIONS.includes(ext)) {
      return <span className="material-symbols-outlined text-[22px] text-blue-600">description</span>;
    }
    if (ARCHIVE_EXTENSIONS.includes(ext)) {
      return <span className="material-symbols-outlined text-[22px] text-amber-600">folder_zip</span>;
    }
    return <span className="material-symbols-outlined text-[22px] text-slate-600 dark:text-slate-300">draft</span>;
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 md:p-6 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-w-5xl w-full h-[88vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-150">
        
        {/* ==================== EN-TÊTE DE LA VISIONNEUSE ==================== */}
        <header className="px-4 py-3 sm:px-6 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700/60 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center shrink-0">
              {renderHeaderIcon()}
            </div>

            <div className="min-w-0">
              <h2
                className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 truncate"
                title={fileName}
              >
                {fileName}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <span className="uppercase font-semibold">{ext || (activeMediaType === 'pdf' ? 'PDF' : activeMediaType.toUpperCase())}</span>
                <span>•</span>
                <span>
                  {activeMediaType === 'image'
                    ? 'Image'
                    : activeMediaType === 'video'
                    ? 'Vidéo'
                    : activeMediaType === 'pdf'
                    ? 'Document PDF'
                    : activeMediaType === 'text'
                    ? (ext === 'pdf' ? 'Contenu texte / Markdown (source .pdf)' : 'Fichier texte')
                    : otherMeta.label}
                </span>
                {displaySize && (
                  <>
                    <span>•</span>
                    <span>{displaySize}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Actions d'en-tête */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Contrôles de zoom pour les images */}
            {activeMediaType === 'image' && (
              <div className="hidden sm:flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1 mr-1">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300 transition-colors"
                  title="Zoom arrière"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-[11px] font-mono px-1 min-w-[45px] text-center text-slate-600 dark:text-slate-300">
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300 transition-colors"
                  title="Zoom avant"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleRotate}
                  className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300 transition-colors"
                  title="Pivoter à 90°"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleResetZoom}
                  className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300 transition-colors"
                  title="Réinitialiser le zoom"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
                {blobUrl && (
                  <a
                    href={blobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300 transition-colors"
                    title="Plein écran dans un nouvel onglet"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            )}

            {/* Bouton de téléchargement direct pour tous les formats */}
            <button
              type="button"
              onClick={handleDownloadTrigger}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-white hover:bg-forest-deep transition-all text-xs font-bold shadow-sm cursor-pointer"
              title="Télécharger une copie locale"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Télécharger</span>
            </button>

            {/* Bouton Fermer ✕ */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Fermer la visionneuse"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* ==================== CORPS DE LA VISIONNEUSE ==================== */}
        <div className="flex-1 w-full h-full min-h-0 bg-slate-100 dark:bg-slate-950/70 relative flex items-center justify-center overflow-auto p-2 sm:p-4">
          
          {/* Indicateur de chargement */}
          {isLoading && (
            <div className="absolute inset-0 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xs flex flex-col items-center justify-center gap-3 z-20">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Chargement du document en cours...
              </p>
            </div>
          )}

          {/* Erreur de chargement */}
          {loadError && !isLoading && (
            <div className="flex flex-col items-center justify-center p-6 text-center max-w-md space-y-3">
              <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-600 flex items-center justify-center">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                Aperçu non disponible
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {loadError}
              </p>
              <button
                type="button"
                onClick={handleDownloadTrigger}
                className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-forest-deep transition-colors"
              >
                <Download className="w-4 h-4" />
                Télécharger le document
              </button>
            </div>
          )}

          {/* Rendu PDF */}
          {!loadError && activeMediaType === 'pdf' && (
            <div className="w-full h-full rounded-xl overflow-hidden shadow-inner bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
              {blobUrl ? (
                <iframe
                  src={blobUrl}
                  className="w-full h-[75vh] rounded-lg border-0"
                  title={fileName}
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Chargement sécurisé du document...
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Rendu Image */}
          {!loadError && activeMediaType === 'image' && (
            <div className="w-full h-full flex items-center justify-center overflow-auto select-none p-2 sm:p-4 rounded-xl bg-slate-950/70 dark:bg-black/90">
              {blobUrl || rawUrl?.startsWith('data:') || rawUrl?.startsWith('blob:') ? (
                <img
                  src={blobUrl || rawUrl}
                  alt={fileName}
                  style={{
                    transform: `scale(${zoomLevel}) rotate(${rotation}deg)`,
                    transition: 'transform 0.15s ease-out'
                  }}
                  className="max-h-[75vh] w-auto mx-auto object-contain rounded-lg shadow-lg"
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  <p className="text-xs text-slate-400">Chargement de l'image...</p>
                </div>
              )}
            </div>
          )}

          {/* Rendu Vidéo */}
          {!loadError && activeMediaType === 'video' && (
            <div className="w-full h-full flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 rounded-xl overflow-hidden">
              {blobUrl ? (
                <video
                  controls
                  playsInline
                  preload="metadata"
                  className="max-h-[75vh] w-full max-w-4xl mx-auto rounded-lg shadow-xl bg-black"
                  src={blobUrl}
                >
                  Votre navigateur ne prend pas en charge la lecture de vidéos au format {ext ? `.${ext}` : 'spécifié'}.
                  Vous pouvez télécharger le fichier pour le visionner localement.
                </video>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  <p className="text-xs font-semibold text-slate-300">
                    Chargement de la vidéo en cours...
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Rendu Texte Brut */}
          {!loadError && activeMediaType === 'text' && textContent && (
            <div className="w-full h-full max-w-4xl bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 overflow-y-auto">
              {formatNotice && (
                <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>{formatNotice}</span>
                </div>
              )}
              <pre className="font-mono text-xs sm:text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed select-text">
                {textContent}
              </pre>
            </div>
          )}

          {/* Rendu Autre format (Word, Excel, Archive, etc.) */}
          {!loadError && activeMediaType === 'other' && !isLoading && (
            <div className="w-full h-full flex items-center justify-center p-4">
              <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col items-center text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
                <div className={`w-20 h-20 rounded-2xl flex items-center justify-center border shadow-inner ${otherMeta.bg}`}>
                  <span className={`material-symbols-outlined text-[42px] ${otherMeta.color}`}>
                    {otherMeta.icon}
                  </span>
                </div>

                <div className="space-y-1.5 w-full">
                  <h3 className="font-bold text-base text-slate-900 dark:text-slate-100 truncate px-2" title={fileName}>
                    {fileName}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {otherMeta.label} {displaySize ? `• ${displaySize}` : ''}
                  </p>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed">
                  {formatNotice || "Ce format ne dispose pas de prévisualisation intégrée dans le navigateur. Téléchargez-le pour l'ouvrir dans votre application dédiée."}
                </p>

                <button
                  type="button"
                  onClick={handleDownloadTrigger}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-xs sm:text-sm font-bold hover:bg-forest-deep shadow-md hover:shadow-lg transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Télécharger le document</span>
                </button>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
