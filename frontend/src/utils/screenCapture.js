/**
 * screenCapture.js - Helper de capture d'écran via html2canvas avec fallback robuste
 */
import html2canvas from 'html2canvas';

/**
 * Crée un canvas de fallback avec message informatif en cas d'échec de html2canvas
 */
function createFallbackCanvas(errorMsg) {
  const width = Math.min(window.innerWidth || 1280, 1920);
  const height = Math.min(window.innerHeight || 800, 1080);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // Fond stylisé ardoise
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    // Titre
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('SCI FAMILLE - CAPTURE D\'ÉCRAN DE SECOURS', 40, 60);

    // Métadonnées
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '16px monospace';
    ctx.fillText(`Date : ${new Date().toLocaleString('fr-FR')}`, 40, 100);
    ctx.fillText(`URL : ${window.location.href}`, 40, 130);
    ctx.fillText(`Résolution : ${width}x${height}`, 40, 160);

    ctx.fillStyle = '#f87171';
    ctx.font = '14px monospace';
    ctx.fillText(`Notice : La capture visuelle n'a pas pu être extraite par html2canvas (${errorMsg || 'Inconnue'}).`, 40, 210);
    ctx.fillText(`Veuillez consulter le rapport diagnostique .txt joint pour les détails d'erreurs.`, 40, 235);
  }

  return canvas;
}

/**
 * Capture l'écran actuel et retourne un objet File (PNG).
 * @param {string} filename - Nom du fichier de sortie
 * @returns {Promise<File>}
 */
export async function captureScreen(filename = 'capture_ecran.png') {
  let canvas;
  try {
    // Éléments à exclure (bouton de bug report, etc.)
    const ignoreElements = (element) => {
      if (!element || !element.classList) return false;
      return (
        element.classList.contains('bug-report-ignore') ||
        element.getAttribute('data-bug-ignore') === 'true'
      );
    };

    const isMobile = typeof window !== 'undefined' && (window.innerWidth < 768 || window.innerHeight < 768);
    const captureScale = isMobile ? 1 : Math.min(window.devicePixelRatio || 1, 1.25);

    canvas = await html2canvas(document.body, {
      logging: false,
      useCORS: true,
      allowTaint: true,
      scale: captureScale,
      ignoreElements,
      windowWidth: document.documentElement.clientWidth,
      windowHeight: document.documentElement.clientHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    });
  } catch (err) {
    console.warn('html2canvas a échoué, utilisation du canvas de fallback:', err);
    canvas = createFallbackCanvas(err?.message || 'Erreur html2canvas');
  }

  const outputFilename = (filename || 'capture_ecran.jpg').replace(/\.png$/i, '.jpg');

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        // Libération immédiate de la mémoire canvas
        try {
          canvas.width = 0;
          canvas.height = 0;
        } catch (_) {}

        if (blob) {
          const file = new File([blob], outputFilename, { type: 'image/jpeg' });
          resolve(file);
        } else {
          // Dernier recours si toBlob échoue
          const fallback = createFallbackCanvas('toBlob null');
          fallback.toBlob((fbBlob) => {
            const fbFile = new File([fbBlob || new Blob()], outputFilename, { type: 'image/jpeg' });
            resolve(fbFile);
          }, 'image/jpeg', 0.8);
        }
      },
      'image/jpeg',
      0.8
    );
  });
}
