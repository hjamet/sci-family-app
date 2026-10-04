/**
 * fileUpload.js
 * Utilitaire universel de traitement et téléversement de fichiers pour la SCI Hellenvilliers.
 *
 * Architecture ZÉRO LIMITE (Google Drive 70 To) :
 * 1. Fichiers <= 3.5 Mo : Téléversement direct rapide via POST /api/documents/upload.
 * 2. Fichiers > 3.5 Mo (PDF haute résolution, photos brutes, archives > 30 Mo) :
 *    Google Drive v3 Resumable Upload initié par le serveur avec Strict Drive Jail (ALLOWED_FOLDER_ID).
 *    Envoi par morceaux de 2 Mo (multiples de 256 Kio) :
 *    - Tentative d'envoi direct vers Google Drive.
 *    - Repli transparent en mode relayé via PUT /api/documents/upload/resumable/chunk si contraintes CORS.
 *    - Finalisation via POST /api/documents/upload/resumable/complete.
 * 3. Mobile friendly : lecture préalable en mémoire ArrayBuffer (contourne SAF Android)
 *    et compression d'images (JPEG max 2400px, q=0.8) pour préserver la RAM des smartphones.
 */

function getAuthHeaders(extraHeaders = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('sci_token') : null;
  const headers = { ...extraHeaders };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export const DIRECT_UPLOAD_THRESHOLD = 3.5 * 1024 * 1024; // 3.5 Mo (seuil pour basculer en Resumable Drive)
export const CHUNK_SIZE = 2 * 1024 * 1024; // 2 Mo par morceau (multiple exact de 256 Kio: 8 x 256 KiB)
const MAX_IMAGE_LONG_SIDE = 2400; // 2400 px max côté long
const JPEG_COMPRESSION_QUALITY = 0.8; // Qualité JPEG optimale

/**
 * Traduit une erreur réseau ou HTTP en français clair pour les utilisateurs.
 */
export function friendlyErrorMessage(err, status = 0) {
  const rawMsg = (err && (err.detail || err.message)) ? String(err.detail || err.message) : '';

  if (rawMsg.includes('Fichier non disponible hors ligne')) {
    return rawMsg;
  }
  if (status === 413 || rawMsg.includes('FUNCTION_PAYLOAD_TOO_LARGE') || rawMsg.includes('Too Large')) {
    return "Le fichier envoyé directement dépasse la limite du relais. L'envoi fractionné automatique prend le relais.";
  }
  if (status === 504 || rawMsg.includes('FUNCTION_INVOCATION_TIMEOUT') || rawMsg.includes('Gateway Timeout')) {
    return "Le serveur a mis trop de temps à répondre (délai dépassé). Veuillez réessayer.";
  }
  if (rawMsg.toLowerCase().includes('failed to fetch') || rawMsg.toLowerCase().includes('networkerror')) {
    return "Impossible de joindre le serveur. Vérifiez votre connexion internet.";
  }
  if (status === 401) {
    return "Votre session a expiré. Veuillez vous reconnecter.";
  }
  if (status === 403) {
    return "Action non autorisée sur ce document.";
  }

  return rawMsg || "Erreur lors du téléversement du document.";
}

/**
 * Lit le fichier en mémoire vive (ArrayBuffer) pour contourner les blocages
 * des sélecteurs de fichiers distants (Android Google Drive, Cloud Storage SAF).
 */
export async function readFileToMemory(file) {
  if (!file) {
    throw new Error("Aucun fichier sélectionné.");
  }

  let buffer;
  try {
    buffer = await file.arrayBuffer();
  } catch (err) {
    throw new Error("Fichier non disponible hors ligne, téléchargez-le d'abord sur le téléphone.");
  }

  if (!buffer || buffer.byteLength === 0) {
    throw new Error("Fichier non disponible hors ligne, téléchargez-le d'abord sur le téléphone.");
  }

  return new File([buffer], file.name, {
    type: file.type || 'application/octet-stream',
    lastModified: file.lastModified || Date.now()
  });
}

/**
 * Compresse une image côté client (JPEG, max long 2400px, q=0.8)
 * en ménageant strictement la mémoire vive (createImageBitmap + libération immédiate).
 * Cette optimisation préserve la mémoire des smartphones sans être une limite serveur.
 */
export async function compressImageIfApplicable(file) {
  const isImage = (
    (file.type && file.type.startsWith('image/')) ||
    /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name || '')
  );

  if (!isImage) {
    return file;
  }

  try {
    // 1. Décodage mémoire via createImageBitmap si disponible (évite le DOM Image lourd)
    let bitmap = null;
    if (typeof window !== 'undefined' && typeof window.createImageBitmap === 'function') {
      try {
        bitmap = await window.createImageBitmap(file);
      } catch (bitmapErr) {
        bitmap = null;
      }
    }

    let width, height;
    let imageSource = null;

    if (bitmap) {
      width = bitmap.width;
      height = bitmap.height;
      imageSource = bitmap;
    } else {
      // Repli gracieux via HTMLImageElement
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = objectUrl;
      });
      width = img.naturalWidth || img.width;
      height = img.naturalHeight || img.height;
      imageSource = img;
      URL.revokeObjectURL(objectUrl);
    }

    if (!width || !height) {
      if (bitmap && typeof bitmap.close === 'function') bitmap.close();
      return file;
    }

    // Calcul du redimensionnement (côté long ~2400px)
    const maxDim = Math.max(width, height);
    let targetWidth = width;
    let targetHeight = height;

    if (maxDim > MAX_IMAGE_LONG_SIDE) {
      const scale = MAX_IMAGE_LONG_SIDE / maxDim;
      targetWidth = Math.round(width * scale);
      targetHeight = Math.round(height * scale);
    }

    // 2. Dessin sur canvas
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imageSource, 0, 0, targetWidth, targetHeight);

    // Libération immédiate de la mémoire bitmap
    if (bitmap && typeof bitmap.close === 'function') {
      bitmap.close();
    }

    // 3. Export JPEG 0.8
    const compressedBlob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', JPEG_COMPRESSION_QUALITY);
    });

    // Libération immédiate du canvas
    canvas.width = 0;
    canvas.height = 0;

    if (!compressedBlob) {
      return file;
    }

    // Si la compression est plus lourde que l'original (ex. tout petit PNG), conserver l'original
    if (compressedBlob.size >= file.size && maxDim <= MAX_IMAGE_LONG_SIDE) {
      return file;
    }

    const baseName = (file.name || 'image').substring(0, (file.name || 'image').lastIndexOf('.')) || (file.name || 'image');
    return new File([compressedBlob], `${baseName}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now()
    });
  } catch (err) {
    console.warn("Échec compression image client, utilisation du fichier brut:", err);
    return file;
  }
}

/**
 * Prépare un fichier pour l'envoi :
 * 1. Lit en mémoire vive (SAF Android)
 * 2. Compresse si image (JPEG max 2400px)
 * ZÉRO LIMITE DE TAILLE : tout fichier est admis.
 */
export async function prepareFileForUpload(file) {
  const memoryFile = await readFileToMemory(file);
  const processedFile = await compressImageIfApplicable(memoryFile);
  return processedFile;
}

/**
 * Téléversement universel robuste pour documents administratifs, factures et fichiers lourds.
 * - Files <= 3.5 Mo : POST direct /api/documents/upload.
 * - Files > 3.5 Mo : Google Drive v3 Resumable Upload (direct ou relayé) sans limite de taille.
 *
 * @param {File|Blob} file
 * @param {Object} metadata { organisme, title, category, tags, task_id, project_id, uploaded_by }
 * @param {Function} onProgress Callback (percent: number, statusText: string)
 * @returns {Promise<Object>} Document créé dans AdminDocument
 */
export async function uploadUniversalDocument(file, metadata = {}, onProgress = null) {
  if (onProgress) onProgress(5, "Préparation du fichier...");

  const preparedFile = await prepareFileForUpload(file);
  const authHeaders = getAuthHeaders();

  // Mode 1 : Fichier <= 3.5 Mo -> Envoi direct rapide
  if (preparedFile.size <= DIRECT_UPLOAD_THRESHOLD) {
    if (onProgress) onProgress(20, "Téléversement en cours...");

    const formData = new FormData();
    formData.append('file', preparedFile);
    formData.append('organisme', (metadata.organisme || 'SCI').trim());
    formData.append('title', (metadata.title || 'Document').trim());
    if (metadata.category) formData.append('category', metadata.category);
    if (metadata.tags) {
      const tagsVal = Array.isArray(metadata.tags) ? JSON.stringify(metadata.tags) : String(metadata.tags);
      formData.append('tags', tagsVal);
    }
    if (metadata.task_id) formData.append('task_id', String(metadata.task_id));
    if (metadata.project_id) formData.append('project_id', String(metadata.project_id));
    if (metadata.uploaded_by) formData.append('uploaded_by', metadata.uploaded_by);

    let res;
    try {
      res = await fetch('/api/documents/upload', {
        method: 'POST',
        headers: authHeaders,
        body: formData
      });
    } catch (netErr) {
      throw new Error(friendlyErrorMessage(netErr));
    }

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(friendlyErrorMessage(errJson, res.status));
    }

    if (onProgress) onProgress(100, "Document archivé avec succès !");
    return res.json();
  }

  // Mode 2 : Fichier > 3.5 Mo -> Google Drive v3 Resumable Upload
  const totalChunks = Math.ceil(preparedFile.size / CHUNK_SIZE);
  if (onProgress) onProgress(10, `Initialisation Google Drive (${totalChunks} morceaux)...`);

  // Étape 2a : Init session resumable
  let initRes;
  try {
    initRes = await fetch('/api/documents/upload/resumable/init', {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filename: preparedFile.name,
        total_size: preparedFile.size,
        mimetype: preparedFile.type || 'application/pdf',
        organisme: (metadata.organisme || 'SCI').trim(),
        title: (metadata.title || 'Document').trim(),
        category: metadata.category,
        tags: metadata.tags,
        task_id: metadata.task_id ? Number(metadata.task_id) : null,
        project_id: metadata.project_id ? Number(metadata.project_id) : null,
        uploaded_by: metadata.uploaded_by || 'Henri Jamet'
      })
    });
  } catch (netErr) {
    throw new Error(friendlyErrorMessage(netErr));
  }

  if (!initRes.ok) {
    const errJson = await initRes.json().catch(() => ({}));
    throw new Error(friendlyErrorMessage(errJson, initRes.status));
  }

  const { upload_url, canonical_filename, mimetype } = await initRes.json();
  if (!upload_url) {
    throw new Error("Le serveur n'a renvoyé aucune URL de téléversement Google Drive.");
  }

  // Étape 2b : Téléversement des morceaux (Direct ou Relayé)
  let directCorsBlocked = false;
  let finalDriveFileId = null;

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(preparedFile.size, start + CHUNK_SIZE);
    const chunkBlob = preparedFile.slice(start, end);
    const contentRange = `bytes ${start}-${end - 1}/${preparedFile.size}`;

    const currentPercent = Math.round(15 + ((i + 1) / totalChunks) * 75);
    if (onProgress) onProgress(currentPercent, `Envoi du morceau ${i + 1}/${totalChunks} (${currentPercent}%)...`);

    let chunkSuccess = false;

    // Tentative 1 : Envoi direct à Google Drive (si CORS autorisé)
    if (!directCorsBlocked) {
      try {
        const directRes = await fetch(upload_url, {
          method: 'PUT',
          headers: {
            'Content-Range': contentRange,
            'Content-Type': mimetype || 'application/octet-stream'
          },
          body: chunkBlob
        });

        if (directRes.status === 308) {
          // Resume Incomplete, morceau accepté
          chunkSuccess = true;
        } else if (directRes.status === 200 || directRes.status === 201) {
          // Fichier terminé sur Google Drive !
          const gData = await directRes.json();
          finalDriveFileId = gData.id;
          chunkSuccess = true;
        } else {
          // Erreur HTTP Google -> bascule sur le mode relayé
          directCorsBlocked = true;
        }
      } catch (directErr) {
        // Bloqué par CORS ou erreur réseau directe -> bascule sur le relais Vercel
        directCorsBlocked = true;
      }
    }

    // Tentative 2 : Repli transparent sur le relais Vercel
    if (!chunkSuccess) {
      let relayRes;
      try {
        relayRes = await fetch('/api/documents/upload/resumable/chunk', {
          method: 'PUT',
          headers: {
            ...authHeaders,
            'X-Upload-Url': upload_url,
            'Content-Range': contentRange,
            'Content-Type': mimetype || 'application/octet-stream'
          },
          body: chunkBlob
        });
      } catch (netErr) {
        throw new Error(friendlyErrorMessage(netErr));
      }

      if (relayRes.status === 308) {
        chunkSuccess = true;
      } else if (relayRes.status === 200 || relayRes.status === 201) {
        const gData = await relayRes.json();
        finalDriveFileId = gData.id;
        chunkSuccess = true;
      } else {
        const errJson = await relayRes.json().catch(() => ({}));
        throw new Error(friendlyErrorMessage(errJson, relayRes.status));
      }
    }
  }

  // Étape 2c : Finalisation dans AdminDocument
  if (onProgress) onProgress(95, "Finalisation de l'archivage Google Drive...");

  if (!finalDriveFileId) {
    throw new Error("L'archivage sur Google Drive n'a pas renvoyé d'identifiant de fichier valide.");
  }

  let completeRes;
  try {
    completeRes = await fetch('/api/documents/upload/resumable/complete', {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        drive_file_id: finalDriveFileId,
        filename: canonical_filename,
        file_size: preparedFile.size,
        mimetype: mimetype || preparedFile.type || 'application/pdf',
        organisme: (metadata.organisme || 'SCI').trim(),
        title: (metadata.title || 'Document').trim(),
        category: metadata.category,
        tags: metadata.tags,
        task_id: metadata.task_id ? Number(metadata.task_id) : null,
        project_id: metadata.project_id ? Number(metadata.project_id) : null,
        uploaded_by: metadata.uploaded_by || 'Henri Jamet'
      })
    });
  } catch (netErr) {
    throw new Error(friendlyErrorMessage(netErr));
  }

  if (!completeRes.ok) {
    const errJson = await completeRes.json().catch(() => ({}));
    throw new Error(friendlyErrorMessage(errJson, completeRes.status));
  }

  if (onProgress) onProgress(100, "Document archivé avec succès !");
  return completeRes.json();
}
