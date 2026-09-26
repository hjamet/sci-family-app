import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Image as ImageIcon,
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
 * DocumentViewerModal
 * Visionneuse universelle intégrée pour PDFs, images et documents sans téléchargement forcé.
 * Conforme à l'Annotation 9.
 */
export default function DocumentViewerModal({
  isOpen,
  onClose,
  document: docItem, // { url, file_url, filename, file_name, title, name, file_type, mime_type, content }
  fileUrl: explicitUrl,
  fileName: explicitName,
  fileType: explicitType,
  onDownload
}) {
  // Détermination de l'URL, du nom et de l'extension
  const rawUrl = explicitUrl || docItem?.file_url || docItem?.url || (docItem?.id ? `/api/documents/${docItem.id}/download` : '');
  const fileName = explicitName || docItem?.filename || docItem?.file_name || docItem?.title || docItem?.name || 'document';
  
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const rawType = explicitType || docItem?.file_type || docItem?.mime_type || '';
  
  const isPdf = ext === 'pdf' || rawType.includes('pdf');
  const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp'].includes(ext) || rawType.startsWith('image/');
  const isText = ['txt', 'md', 'json', 'csv', 'log'].includes(ext) || rawType.startsWith('text/');

  // États internes de visualisation
  const [blobUrl, setBlobUrl] = useState(null);
  const [textContent, setTextContent] = useState(docItem?.content || null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // Contrôles pour les images
  const [zoomLevel, setZoomLevel] = useState(1);
  const [rotation, setRotation] = useState(0);

  // Chargement sécurisé du document pour affichage inline (contournement Content-Disposition: attachment)
  useEffect(() => {
    if (!isOpen || !rawUrl) {
      setBlobUrl(null);
      setTextContent(docItem?.content || null);
      setLoadError(null);
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
    if (isText && docItem?.content) {
      setTextContent(docItem.content);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    let createdUrl = null;

    const fetchDocumentContent = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const response = await fetch(rawUrl);
        if (!response.ok) {
          throw new Error(`Erreur HTTP ${response.status} lors de la récupération du fichier`);
        }

        if (isText) {
          const text = await response.text();
          if (isMounted) setTextContent(text);
        } else {
          const blob = await response.blob();
          // Forcer le mime-type correct pour affichage dans l'iframe ou la balise img
          const mime = isPdf ? 'application/pdf' : (isImage ? `image/${ext === 'jpg' ? 'jpeg' : ext}` : blob.type);
          const safeBlob = new Blob([blob], { type: mime });
          createdUrl = URL.createObjectURL(safeBlob);
          if (isMounted) {
            setBlobUrl(createdUrl);
          }
        }
      } catch (err) {
        console.warn('DocumentViewerModal fetch notice:', err.message);
        // Fallback : utiliser directement l'URL brute
        if (isMounted) {
          setBlobUrl(rawUrl);
          if (!isPdf && !isImage && !isText) {
            setLoadError('Format de fichier non prévisualisable directement.');
          }
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
  }, [isOpen, rawUrl, fileName, isPdf, isImage, isText]);

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

  // Déclenchement du téléchargement
  const handleDownloadTrigger = () => {
    if (onDownload) {
      onDownload(docItem || { url: rawUrl, filename: fileName });
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

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 md:p-6 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-w-5xl w-full h-[88vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-150">
        
        {/* ==================== EN-TÊTE DE LA VISIONNEUSE ==================== */}
        <header className="px-4 py-3 sm:px-6 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700/60 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary/10 dark:bg-primary/20 text-primary flex items-center justify-center shrink-0">
              {isPdf ? (
                <span className="material-symbols-outlined text-[22px] text-red-600">picture_as_pdf</span>
              ) : isImage ? (
                <ImageIcon className="w-5 h-5 text-emerald-600" />
              ) : (
                <FileText className="w-5 h-5 text-primary" />
              )}
            </div>

            <div className="min-w-0">
              <h2
                className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 truncate"
                title={fileName}
              >
                {fileName}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <span className="uppercase font-semibold">{ext || 'FICHIER'}</span>
                <span>•</span>
                <span>Mode consultation sécurisé</span>
              </p>
            </div>
          </div>

          {/* Actions d'en-tête */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Contrôles de zoom pour les images */}
            {isImage && (
              <div className="hidden sm:flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1 mr-1">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300"
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
                  className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300"
                  title="Zoom avant"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleRotate}
                  className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300"
                  title="Pivoter à 90°"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleResetZoom}
                  className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300"
                  title="Réinitialiser le zoom"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Bouton de téléchargement direct [📥 Télécharger] */}
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
          {!loadError && isPdf && (
            <div className="w-full h-full rounded-xl overflow-hidden shadow-inner bg-slate-200 dark:bg-slate-800">
              <iframe
                src={blobUrl || rawUrl}
                className="w-full h-full border-none"
                title={fileName}
              />
            </div>
          )}

          {/* Rendu Image */}
          {!loadError && isImage && (
            <div className="w-full h-full flex items-center justify-center overflow-auto select-none">
              <img
                src={blobUrl || rawUrl}
                alt={fileName}
                style={{
                  transform: `scale(${zoomLevel}) rotate(${rotation}deg)`,
                  transition: 'transform 0.15s ease-out'
                }}
                className="max-h-full max-w-full object-contain mx-auto rounded-lg shadow-md"
              />
            </div>
          )}

          {/* Rendu Texte / Devis simulé */}
          {!loadError && !isPdf && !isImage && (
            <div className="w-full h-full max-w-3xl bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 overflow-y-auto">
              <div className="border-b border-slate-200 dark:border-slate-800 pb-3 mb-4 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Contenu textuel certifié
                </span>
                <span className="text-xs text-slate-400">
                  SCI FAMILIALE D'HELLENVILLIERS
                </span>
              </div>
              <pre className="font-mono text-xs sm:text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                {textContent || 'Fichier sans aperçu textuel.'}
              </pre>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
