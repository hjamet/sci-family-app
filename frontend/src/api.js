const API_BASE = '/api';

/**
 * Émetteur d'événements pour le centre d'alerte global fail-fast
 */
export function emitAppError(detail) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('app-error', {
        detail: {
          url: detail.url || 'Inconnue',
          method: detail.method || 'GET',
          status: detail.status ?? 0,
          message: detail.message || 'Erreur API inconnue',
          timestamp: Date.now(),
        },
      })
    );
  }
}

// Wrapper surveillé pour intercepter toutes les erreurs réseau et réponses HTTP non-ok (4xx, 5xx)
const _nativeFetch = (typeof window !== 'undefined' ? window.fetch.bind(window) : globalThis.fetch);

async function monitoredFetch(input, init = {}) {
  const method = (init && init.method) ? init.method.toUpperCase() : 'GET';
  const url = typeof input === 'string' ? input : (input?.url || (input?.toString ? input.toString() : ''));

  let res;
  try {
    res = await _nativeFetch(input, init);
  } catch (netErr) {
    const errorMsg = netErr?.message || 'Erreur réseau (serveur inaccessible ou connexion interrompue)';
    emitAppError({
      url,
      method,
      status: 0,
      message: errorMsg,
    });
    try {
      netErr._handledByGlobalAlert = true;
    } catch (_) {}
    throw netErr;
  }

  // Détection fail-fast si l'API retourne du HTML au lieu de JSON (ex: fallback SPA Vercel)
  const contentType = res.headers.get('content-type') || '';
  const isApiCall = typeof url === 'string' && (url.startsWith('/api') || url.includes('/api/'));
  if (isApiCall && contentType.includes('text/html')) {
    const errorMsg = "Réponse serveur invalide : l'API a retourné une page HTML au lieu de données JSON (Problème de routage Vercel / API hors ligne).";
    emitAppError({
      url,
      method,
      status: res.status,
      message: errorMsg,
    });
    const customErr = new Error(errorMsg);
    try {
      customErr._handledByGlobalAlert = true;
    } catch (_) {}
    throw customErr;
  }

  if (!res.ok) {
    let detailMsg = `HTTP ${res.status}${res.statusText ? ` (${res.statusText})` : ''}`;
    try {
      const clone = res.clone();
      if (contentType.includes('application/json')) {
        const json = await clone.json();
        if (json) {
          detailMsg = json.detail || json.message || JSON.stringify(json);
        }
      } else {
        const text = await clone.text();
        if (text && text.trim()) {
          detailMsg = text.trim().slice(0, 500);
        }
      }
    } catch (_) {}

    if (!init?.silentError) {
      emitAppError({
        url,
        method,
        status: res.status,
        message: typeof detailMsg === 'object' ? JSON.stringify(detailMsg) : String(detailMsg),
      });
    }
  }

  return res;
}

// Shadow global fetch for all API calls in this module
const fetch = monitoredFetch;

// Helper to inject Authorization header if token exists in localStorage
function getAuthHeaders(extraHeaders = {}) {
  const token = localStorage.getItem('sci_token');
  const headers = { ...extraHeaders };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

function getAuthJsonHeaders(extraHeaders = {}) {
  return getAuthHeaders({ 'Content-Type': 'application/json', ...extraHeaders });
}

// ==================== CACHE STALE-WHILE-REVALIDATE (SWR) HYBRIDE MÉMOIRE + SESSIONSTORAGE ====================
// Offre un affichage immédiat (0 ms) des scrutins, tâches et données clés lors de la navigation
// tout en garantissant une revalidation automatique en arrière-plan et une invalidation chirurgicale sur mutation.

const memoryCache = new Map();
const inFlightRequests = new Map();

const SESSION_PREFIX = 'sci_swr_';

/**
 * Récupère une entrée en cache pour affichage instantané (Stale-While-Revalidate).
 * Priorité : Mémoire vive (< 1ms) puis sessionStorage (< 5ms).
 */
export function getCachedData(key) {
  if (!key) return null;

  // 1. Recherche en mémoire vive
  if (memoryCache.has(key)) {
    const entry = memoryCache.get(key);
    if (Date.now() - entry.timestamp < (entry.ttl || 300000)) {
      return entry.data;
    }
  }

  // 2. Recherche de secours en sessionStorage
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const raw = sessionStorage.getItem(`${SESSION_PREFIX}${key}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Date.now() - parsed.timestamp < (parsed.ttl || 300000)) {
          memoryCache.set(key, parsed);
          return parsed.data;
        } else {
          sessionStorage.removeItem(`${SESSION_PREFIX}${key}`);
        }
      }
    } catch (_) {}
  }

  return null;
}

/**
 * Enregistre une donnée en cache (Mémoire + SessionStorage).
 */
export function setCachedData(key, data, ttlMs = 120000) {
  if (!key || data === undefined) return;
  const entry = { data, timestamp: Date.now(), ttl: ttlMs };
  memoryCache.set(key, entry);

  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      sessionStorage.setItem(`${SESSION_PREFIX}${key}`, JSON.stringify(entry));
    } catch (_) {}
  }
}

/**
 * Invalide les requêtes en cours et purge le cache mémoire et session.
 * Appelé systématiquement lors des mutations (votes, création de tâche, etc.).
 */
export function invalidateApiCache(prefixOrKey = '') {
  if (!prefixOrKey) {
    inFlightRequests.clear();
    memoryCache.clear();
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        const keys = Object.keys(sessionStorage).filter(k => k.startsWith(SESSION_PREFIX));
        keys.forEach(k => sessionStorage.removeItem(k));
      } catch (_) {}
    }
    return;
  }

  // Nettoyage inFlight
  for (const k of inFlightRequests.keys()) {
    if (k.startsWith(prefixOrKey) || k.includes(prefixOrKey)) {
      inFlightRequests.delete(k);
    }
  }

  // Nettoyage memoryCache
  for (const k of memoryCache.keys()) {
    if (k.startsWith(prefixOrKey) || k.includes(prefixOrKey)) {
      memoryCache.delete(k);
    }
  }

  // Nettoyage sessionStorage
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const keys = Object.keys(sessionStorage).filter(k => 
        k.startsWith(`${SESSION_PREFIX}${prefixOrKey}`) || k.includes(prefixOrKey)
      );
      keys.forEach(k => sessionStorage.removeItem(k));
    } catch (_) {}
  }
}

/**
 * Exécute un fetch avec déduplication des requêtes en vol et mise en cache SWR véritable.
 * Si les données sont en cache et qu'aucun forceRefresh n'est demandé :
 * - Retourne instantanément la donnée en cache (< 1ms).
 * - Déclenche une revalidation silencieuse en arrière-plan sans bloquer l'UI.
 */
export async function swrFetch(cacheKey, fetcher, options = {}) {
  const forceRefresh = options?.forceRefresh === true;

  // 1. SWR instantané : si données en cache et pas de rafraîchissement forcé
  if (!forceRefresh) {
    const cached = getCachedData(cacheKey);
    if (cached !== null && cached !== undefined) {
      // Revalidation silencieuse en arrière-plan si aucune requête identique n'est déjà en vol
      if (!inFlightRequests.has(cacheKey)) {
        const bgPromise = (async () => {
          try {
            const fresh = await fetcher();
            if (fresh !== undefined && fresh !== null) {
              setCachedData(cacheKey, fresh, options.ttl || 120000);
            }
            return fresh;
          } catch (_) {
            // Erreur silencieuse en arrière-plan, la donnée en cache reste valide
            return cached;
          } finally {
            inFlightRequests.delete(cacheKey);
          }
        })();
        inFlightRequests.set(cacheKey, bgPromise);
      }
      return cached;
    }
  }

  // 2. Déduplication : si une requête identique est déjà en vol AU MÊME INSTANT t, mutualiser la Promise
  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey);
  }

  const promise = (async () => {
    try {
      const freshData = await fetcher();
      if (freshData !== undefined && freshData !== null) {
        setCachedData(cacheKey, freshData, options.ttl || 120000);
      }
      return freshData;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, promise);
  return promise;
}

// Auth & Users
export async function loginUser(prenom, password) {
  const cleanPrenom = (typeof prenom === 'string' && prenom.trim()) ? prenom.trim() : '';
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prenom: cleanPrenom, password: (password || '').trim() }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors de la connexion');
  }
  invalidateApiCache();
  return res.json();
}

export async function requestPasswordReset(prenom) {
  const cleanPrenom = (typeof prenom === 'string' && prenom.trim()) ? prenom.trim() : '';
  const res = await fetch(`${API_BASE}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prenom: cleanPrenom }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors de la réinitialisation du mot de passe');
  }
  return res.json();
}

export async function fetchUsers(options = {}) {
  return swrFetch('users', async () => {
    const res = await fetch(`${API_BASE}/users`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Erreur lors du chargement des utilisateurs');
    return res.json();
  }, { ttl: 300000, forceRefresh: options?.forceRefresh });
}

export async function fetchProperties(options = {}) {
  return swrFetch('properties', async () => {
    const res = await fetch(`${API_BASE}/properties`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Erreur lors du chargement des propriétés');
    return res.json();
  }, { ttl: 300000, forceRefresh: options?.forceRefresh });
}


// Issues
export async function fetchIssues(params = {}) {
  const query = new URLSearchParams();
  if (params.status && params.status !== 'Tous') query.append('status', params.status);
  if (params.priority && params.priority !== 'Toutes') query.append('priority', params.priority);
  if (params.category && params.category !== 'Toutes') query.append('category', params.category);
  if (params.property_id) query.append('property_id', params.property_id);

  const res = await fetch(`${API_BASE}/issues?${query.toString()}`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Erreur lors de la récupération des problèmes');
  return res.json();
}

export async function createIssue(data) {
  const res = await fetch(`${API_BASE}/issues`, {
    method: 'POST',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors de la création de l\'incident');
  }
  return res.json();
}

export async function uploadPhoto(file) {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/issues/upload-photo`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData,
  });
  if (!res.ok) throw new Error('Erreur lors de l\'envoi de la photo');
  return res.json();
}

export async function uploadPhotos(files) {
  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append('files', files[i]);
  }

  const res = await fetch(`${API_BASE}/issues/upload-photos`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData,
  });
  if (!res.ok) throw new Error('Erreur lors de l\'envoi des photos');
  return res.json();
}

export async function updateIssue(issueId, data) {
  const res = await fetch(`${API_BASE}/issues/${issueId}`, {
    method: 'PATCH',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erreur lors de la mise à jour de l\'incident');
  return res.json();
}

export async function addIssueComment(issueId, data) {
  const res = await fetch(`${API_BASE}/issues/${issueId}/comments`, {
    method: 'POST',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erreur lors de l\'ajout du commentaire');
  return res.json();
}


// Reservations
export async function fetchReservations(params = {}, options = {}) {
  const query = new URLSearchParams();
  if (params.property_id) query.append('property_id', params.property_id);
  if (params.year) query.append('year', params.year);
  if (params.status && params.status !== 'Tous') query.append('status', params.status);
  const qStr = query.toString();
  const cacheKey = `reservations${qStr ? `?${qStr}` : ''}`;

  return swrFetch(cacheKey, async () => {
    const res = await fetch(`${API_BASE}/reservations?${qStr}`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Erreur lors de la récupération des réservations');
    return res.json();
  }, { ttl: 30000, forceRefresh: options?.forceRefresh });
}

export async function createReservation(data) {
  const res = await fetch(`${API_BASE}/reservations`, {
    method: 'POST',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors de la réservation');
  }
  invalidateApiCache('reservations');
  return res.json();
}

export async function updateReservation(resId, data) {
  const res = await fetch(`${API_BASE}/reservations/${resId}`, {
    method: 'PATCH',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erreur lors de la mise à jour de la réservation');
  invalidateApiCache('reservations');
  return res.json();
}

export async function deleteReservation(resId) {
  const res = await fetch(`${API_BASE}/reservations/${resId}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Erreur lors de la suppression de la réservation');
  invalidateApiCache('reservations');
  return true;
}


// Projects & Voting System
export async function fetchProjects(params = {}, options = {}) {
  const query = new URLSearchParams();
  if (params.property_id) query.append('property_id', params.property_id);
  if (params.status && params.status !== 'Tous') query.append('status', params.status);
  const qStr = query.toString();
  const cacheKey = `projects${qStr ? `?${qStr}` : ''}`;

  return swrFetch(cacheKey, async () => {
    const res = await fetch(`${API_BASE}/projects?${qStr}`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Erreur lors de la récupération des projets');
    return res.json();
  }, { ttl: 25000, forceRefresh: options?.forceRefresh });
}

export async function createProject(data) {
  const res = await fetch(`${API_BASE}/projects`, {
    method: 'POST',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors de la création du projet');
  }
  invalidateApiCache('projects');
  return res.json();
}

export async function updateProject(projectId, data) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/review`, {
    method: 'PATCH',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors de la mise à jour du projet');
  }
  invalidateApiCache('projects');
  return res.json();
}

export async function reviewProject(projectId, data) {
  return updateProject(projectId, data);
}

export async function updateProjectCost(projectId, estimatedCost, coordinatorNotes) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/cost`, {
    method: 'PATCH',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify({
      estimated_cost: estimatedCost,
      coordinator_notes: coordinatorNotes
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors de la mise à jour du coût estimé');
  }
  invalidateApiCache('projects');
  return res.json();
}

export async function uploadProjectDocuments(files) {
  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append('files', files[i]);
  }

  const res = await fetch(`${API_BASE}/projects/upload-documents`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData,
  });
  if (!res.ok) throw new Error('Erreur lors de l\'envoi des documents');
  return res.json();
}

export async function approveProjectByCoordinator(projectId, approvalData) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/approve`, {
    method: 'POST',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify(approvalData),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors de l\'approbation du projet par le coordinateur');
  }
  invalidateApiCache('projects');
  return res.json();
}

export async function castProjectVote(projectId, data) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/vote`, {
    method: 'POST',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors de l\'enregistrement du vote');
  }
  invalidateApiCache('projects');
  return res.json();
}

export async function fetchProjectComments(projectId) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/comments`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Erreur lors de la récupération des commentaires du projet');
  return res.json();
}

export async function addProjectComment(projectId, data) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/comments`, {
    method: 'POST',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors de l\'ajout du commentaire au projet');
  }
  invalidateApiCache('projects');
  return res.json();
}

export async function deleteProject(projectId) {
  const res = await fetch(`${API_BASE}/projects/${projectId}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors de la suppression du projet');
  }
  invalidateApiCache('projects');
  return true;
}




// Member Availabilities & Smart Match (Crossed Calendar)
export async function fetchAvailabilities(propertyId, year = 2026) {
  const res = await fetch(`${API_BASE}/availabilities?property_id=${propertyId}&year=${year}`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Erreur lors du chargement des disponibilités');
  return res.json();
}

export async function setAvailability(data) {
  const res = await fetch(`${API_BASE}/availabilities`, {
    method: 'POST',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erreur lors de l\'enregistrement de la disponibilité');
  return res.json();
}

export async function setAvailabilitiesBatch(data) {
  const res = await fetch(`${API_BASE}/availabilities/batch`, {
    method: 'POST',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erreur lors de l\'enregistrement des disponibilités');
  return res.json();
}

export async function fetchSmartMatch(propertyId, year = 2026) {
  const res = await fetch(`${API_BASE}/availabilities/smart-match?property_id=${propertyId}&year=${year}`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Erreur lors du calcul Smart Match');
  return res.json();
}


// Maintenance Tasks & Stay Checklist
export async function fetchMaintenanceTasks(propertyId) {
  const query = propertyId ? `?property_id=${propertyId}` : '';
  const res = await fetch(`${API_BASE}/maintenance-tasks${query}`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Erreur lors de la récupération des tâches de maintenance');
  return res.json();
}

export async function createMaintenanceTask(data) {
  const res = await fetch(`${API_BASE}/maintenance-tasks`, {
    method: 'POST',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors de la création de la tâche');
  }
  return res.json();
}

export async function deleteMaintenanceTask(taskId) {
  const res = await fetch(`${API_BASE}/maintenance-tasks/${taskId}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Erreur lors de la suppression de la tâche');
  return true;
}

export async function fetchReservationTasks(reservationId) {
  const res = await fetch(`${API_BASE}/reservations/${reservationId}/tasks`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Erreur lors du chargement des tâches attribuées au séjour');
  return res.json();
}

export async function toggleStayTask(reservationId, assignmentId) {
  const res = await fetch(`${API_BASE}/reservations/${reservationId}/tasks/${assignmentId}/toggle`, {
    method: 'PATCH',
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Erreur lors du changement d\'état de la tâche');
  return res.json();
}

export async function fetchTaskDocuments(taskId) {
  const res = await fetch(`${API_BASE}/tasks/${taskId}/documents`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Erreur lors de la récupération des documents de la tâche');
  return res.json();
}

export async function attachDocumentsToTask(taskId, documentIds) {
  const res = await fetch(`${API_BASE}/tasks/${taskId}/documents/attach`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ document_ids: documentIds }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Erreur lors de l'association des documents à la tâche");
  }
  invalidateApiCache('tasks');
  return res.json();
}

export async function attachDocumentsToProject(projectId, documentIds) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/documents/attach`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ document_ids: documentIds }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Erreur lors de l'association des documents au scrutin");
  }
  invalidateApiCache('projects');
  return res.json();
}

export async function uploadTaskDocuments(files, taskId = null) {
  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append('files', files[i]);
  }
  if (taskId) {
    formData.append('task_id', String(taskId));
  }
  const res = await fetch(`${API_BASE}/tasks/upload-documents`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData,
  });
  if (!res.ok) throw new Error('Erreur lors de l\'envoi des justificatifs');
  return res.json();
}

export async function submitTaskCompletion(assignmentId, completionData) {
  const res = await fetch(`${API_BASE}/tasks/${assignmentId}/complete`, {
    method: 'POST',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify(completionData),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors de la soumission de la tâche');
  }
  return res.json();
}

export async function validateTaskCompletion(assignmentId) {
  const res = await fetch(`${API_BASE}/tasks/${assignmentId}/validate-completion`, {
    method: 'POST',
    headers: getAuthJsonHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors de la validation de la finalisation');
  }
  return res.json();
}

export async function fetchAdminDocuments(params = {}) {
  const query = new URLSearchParams();
  if (params.category && params.category !== 'all' && params.category !== 'Toutes') query.append('category', params.category);
  const res = await fetch(`${API_BASE}/documents?${query.toString()}`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Erreur lors du chargement des documents administratifs');
  return res.json();
}

export const fetchDocuments = fetchAdminDocuments;

export async function fetchDocumentCategories() {
  const res = await fetch(`${API_BASE}/documents/categories`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Erreur lors du chargement des catégories de documents');
  return res.json();
}

export async function createDocumentCategory(data) {
  const res = await fetch(`${API_BASE}/documents/categories`, {
    method: 'POST',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors de la création de la catégorie');
  }
  return res.json();
}

export async function updateDocumentCategory(id, data) {
  const res = await fetch(`${API_BASE}/documents/categories/${id}`, {
    method: 'PUT',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors de la mise à jour de la catégorie');
  }
  return res.json();
}

export async function deleteDocumentCategory(id) {
  const res = await fetch(`${API_BASE}/documents/categories/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors de la suppression de la catégorie');
  }
  return res.json();
}

export async function uploadDocument(formData) {
  const res = await fetch(`${API_BASE}/documents/upload`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors du téléversement du document');
  }
  return res.json();
}

export async function createAccountingTransaction(formData) {
  const res = await fetch(`${API_BASE}/accounting/transactions`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors de l\'enregistrement de la dépense');
  }
  return res.json();
}

export async function deleteAdminDocument(idOrFilename) {
  const res = await fetch(`${API_BASE}/documents/${encodeURIComponent(idOrFilename)}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Erreur lors de la suppression du document');
  return res.json();
}

export const deleteDocument = deleteAdminDocument;

export async function updateDocument(id, data) {
  const res = await fetch(`${API_BASE}/documents/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors du renommage du document');
  }
  return res.json();
}

export const renameDocument = updateDocument;

export async function fetchMemberCurrentStayTasks(userName) {
  const res = await fetch(`${API_BASE}/members/${encodeURIComponent(userName)}/current-stay-tasks`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Erreur lors du chargement de la checklist du membre');
  return res.json();
}

export async function fetchTasks(params = {}, options = {}) {
  const query = new URLSearchParams();
  if (params.user_name) query.append('user_name', params.user_name);
  if (params.property_id) query.append('property_id', params.property_id);
  if (params.category) query.append('category', params.category);
  const qStr = query.toString();
  const cacheKey = `tasks${qStr ? `?${qStr}` : ''}`;

  return swrFetch(cacheKey, async () => {
    const res = await fetch(`${API_BASE}/tasks?${qStr}`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Erreur lors du chargement des tâches');
    return res.json();
  }, { ttl: 20000, forceRefresh: options?.forceRefresh });
}

export async function createTask(taskData) {
  const res = await fetch(`${API_BASE}/tasks`, {
    method: 'POST',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify(taskData),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors de la création de la tâche');
  }
  invalidateApiCache('tasks');
  return res.json();
}



// Vademecum Centralisé
export async function fetchVademecum(params = {}) {
  const query = new URLSearchParams();
  if (params.property_id) query.append('property_id', params.property_id);
  if (params.category && params.category !== 'Toutes') query.append('category', params.category);

  const res = await fetch(`${API_BASE}/vademecum?${query.toString()}`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Erreur lors de la récupération des fiches Vademecum');
  return res.json();
}

export async function createVademecumItem(data) {
  const res = await fetch(`${API_BASE}/vademecum`, {
    method: 'POST',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors de la création de la fiche Vademecum');
  }
  invalidateApiCache('vademecum');
  return res.json();
}

export async function updateVademecumItem(itemId, data) {
  const res = await fetch(`${API_BASE}/vademecum/${itemId}`, {
    method: 'PATCH',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erreur lors de la mise à jour de la fiche Vademecum');
  invalidateApiCache('vademecum');
  return res.json();
}

export async function deleteVademecumItem(itemId) {
  const res = await fetch(`${API_BASE}/vademecum/${itemId}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Erreur lors de la suppression de la fiche Vademecum');
  invalidateApiCache('vademecum');
  return true;
}


export async function fetchHeatingStatus(options = {}) {
  return swrFetch('heating_status', async () => {
    const query = (options?.forceRefresh || options?.refresh) ? '?refresh=true' : '';
    const res = await fetch(`${API_BASE}/heating/status${query}`, {
      headers: getAuthHeaders(),
      silentError: options?.silentError ?? true,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Erreur lors de la récupération du statut du chauffage ViCare');
    }
    return res.json();
  });
}

export async function setHeatingMode(mode) {
  const res = await fetch(`${API_BASE}/heating/mode`, {
    method: 'POST',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify({ mode }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors du changement de mode de chauffage ViCare');
  }
  invalidateApiCache('heating');
  return res.json();
}

export async function setHeatingTemperature(target_temperature) {
  const res = await fetch(`${API_BASE}/heating/temperature`, {
    method: 'POST',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify({ target_temperature }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors du changement de température ViCare');
  }
  invalidateApiCache('heating');
  return res.json();
}

export async function setDhwMode(is_active) {
  const res = await fetch(`${API_BASE}/heating/dhw/mode`, {
    method: 'POST',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify({ is_active: Boolean(is_active) }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors du changement de mode ECS');
  }
  invalidateApiCache('heating');
  return res.json();
}

export async function setDhwTemperature(target_temperature) {
  const res = await fetch(`${API_BASE}/heating/dhw/temperature`, {
    method: 'POST',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify({ target_temperature: Number(target_temperature) }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors du changement de consigne ECS');
  }
  invalidateApiCache('heating');
  return res.json();
}

// Dashboard Stats
export async function fetchStats() {
  const res = await fetch(`${API_BASE}/stats`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Erreur lors de la récupération des statistiques');
  return res.json();
}

// Auth Current User
export async function fetchCurrentUser(options = {}) {
  return swrFetch('current_user', async () => {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Erreur lors de la récupération du profil');
    return res.json();
  }, { ttl: 60000, forceRefresh: options?.forceRefresh });
}

// Rooms
export async function fetchRooms() {
  const res = await fetch(`${API_BASE}/rooms`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Erreur lors du chargement des chambres');
  return res.json();
}

// Reservations Stay Balance
export async function fetchStayBalance(year = 2026) {
  const res = await fetch(`${API_BASE}/reservations/balance?year=${year}`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Erreur lors de la récupération de l\'équilibre des séjours');
  return res.json();
}

// Unified Tasks API
export async function fetchTaskById(taskId) {
  const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Tâche introuvable');
  return res.json();
}

export async function updateTask(taskId, data) {
  const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
    method: 'PATCH',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors de la mise à jour de la tâche');
  }
  invalidateApiCache('tasks');
  return res.json();
}

export async function closeTask(taskId, completionData) {
  const res = await fetch(`${API_BASE}/tasks/${taskId}/close`, {
    method: 'POST',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify(completionData)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors de la clôture de la tâche');
  }
  invalidateApiCache('tasks');
  return res.json();
}

export async function requestTaskValidation(taskId, data = {}) {
  const res = await fetch(`${API_BASE}/tasks/${taskId}/submit-completion`, {
    method: 'POST',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors de la demande de validation');
  }
  invalidateApiCache('tasks');
  return res.json();
}


export async function validateTask(taskId) {
  const res = await fetch(`${API_BASE}/tasks/${taskId}/validate`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors de la validation de la tâche');
  }
  invalidateApiCache('tasks');
  return res.json();
}

export async function invalidateTask(taskId, explanation = '') {
  const res = await fetch(`${API_BASE}/tasks/${taskId}/invalidate`, {
    method: 'POST',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify({ explanation })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors de l\'invalidation de la tâche');
  }
  invalidateApiCache('tasks');
  return res.json();
}

export async function acceptTask(taskId) {
  const res = await fetch(`${API_BASE}/tasks/${taskId}/accept`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors de l\'acceptation de la tâche');
  }
  invalidateApiCache('tasks');
  return res.json();
}

export async function rejectTask(taskId, reason = '') {
  const res = await fetch(`${API_BASE}/tasks/${taskId}/reject`, {
    method: 'POST',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify({ reason })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors du refus de la tâche');
  }
  invalidateApiCache('tasks');
  return res.json();
}

export async function deleteTask(taskId) {
  const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Erreur lors de la suppression de la tâche');
  invalidateApiCache('tasks');
  return true;
}

// Task Comments & Reactions
export async function fetchTaskComments(taskId) {
  const res = await fetch(`${API_BASE}/tasks/${taskId}/comments`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Erreur lors du chargement des commentaires');
  return res.json();
}

export async function addTaskComment(taskId, commentData) {
  const res = await fetch(`${API_BASE}/tasks/${taskId}/comments`, {
    method: 'POST',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify(commentData)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors de l\'ajout du commentaire');
  }
  invalidateApiCache('tasks');
  return res.json();
}

export async function reactToTaskComment(taskId, commentId, emoji, userName) {
  const res = await fetch(`${API_BASE}/tasks/${taskId}/comments/${commentId}/react`, {
    method: 'POST',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify({ emoji, user_name: userName })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors de la réaction');
  }
  invalidateApiCache('tasks');
  return res.json();
}

export const fetchTaskMessages = fetchTaskComments;
export const addTaskMessage = addTaskComment;

// Piscine Telemetry
export async function fetchPiscineStatus(options = {}) {
  return swrFetch('pool_status', async () => {
    const query = (options?.forceRefresh || options?.refresh) ? '?refresh=true' : '';
    const res = await fetch(`${API_BASE}/pool/status${query}`, {
      headers: getAuthHeaders(),
      silentError: options?.silentError ?? true,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Erreur lors de la récupération du statut piscine Klereo');
    }
    return res.json();
  });
}

export async function setPoolPumpMode(modeOrActive) {
  const is_active = typeof modeOrActive === 'boolean' ? modeOrActive : modeOrActive !== 'Arrêt' && modeOrActive !== 'arret';
  const res = await fetch(`${API_BASE}/pool/pump/mode`, {
    method: 'POST',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify({ is_active, mode: is_active ? 'marche' : 'arret' }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors du changement de mode de la pompe piscine');
  }
  invalidateApiCache('pool');
  return res.json();
}

export async function setPoolHeatingMode(modeOrActive) {
  const is_active = typeof modeOrActive === 'boolean' ? modeOrActive : modeOrActive !== 'Arrêt' && modeOrActive !== 'arret';
  const res = await fetch(`${API_BASE}/pool/heating/mode`, {
    method: 'POST',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify({ is_active, mode: is_active ? 'marche' : 'arret' }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors du changement de mode du chauffage piscine');
  }
  invalidateApiCache('pool');
  return res.json();
}

// Open Banking DSP2 (Enable Banking & Swan France)
export async function fetchBankStatus(options = {}) {
  return swrFetch('bank_status', async () => {
    const query = (options?.forceRefresh || options?.refresh) ? '?refresh=true' : '';
    const res = await fetch(`${API_BASE}/banking/status${query}`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      let detail = '';
      try {
        const err = await res.json();
        detail = err.detail || err.message;
      } catch {
        try { detail = (await res.text()).slice(0, 150); } catch {}
      }
      throw new Error(detail || `Erreur lors de la récupération du statut bancaire (HTTP ${res.status})`);
    }
    return res.json();
  });
}

export async function fetchBankAccounts() {
  const res = await fetch(`${API_BASE}/banking/accounts`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) {
    let detail = '';
    try {
      const err = await res.json();
      detail = err.detail || err.message;
    } catch {
      try { detail = (await res.text()).slice(0, 150); } catch {}
    }
    throw new Error(detail || `Erreur lors de la récupération des comptes bancaires (HTTP ${res.status})`);
  }
  return res.json();
}

export async function fetchBankTransactions(params = {}) {
  const query = new URLSearchParams();
  if (params.category) query.append('category', params.category);
  if (params.limit) query.append('limit', params.limit);
  const res = await fetch(`${API_BASE}/banking/transactions?${query.toString()}`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) {
    let detail = '';
    try {
      const err = await res.json();
      detail = err.detail || err.message;
    } catch {
      try { detail = (await res.text()).slice(0, 150); } catch {}
    }
    throw new Error(detail || `Erreur lors de la récupération des transactions bancaires (HTTP ${res.status})`);
  }
  return res.json();
}

export async function triggerBankSync() {
  const res = await fetch(`${API_BASE}/banking/sync`, {
    method: 'POST',
    headers: getAuthJsonHeaders()
  });
  if (!res.ok) {
    let detail = '';
    try {
      const err = await res.json();
      detail = err.detail || err.message;
    } catch {
      try { detail = (await res.text()).slice(0, 150); } catch {}
    }
    throw new Error(detail || `Erreur lors de la synchronisation bancaire (HTTP ${res.status})`);
  }
  invalidateApiCache('bank');
  return res.json();
}

export async function startBankAuth(redirectUrl) {
  const res = await fetch(`${API_BASE}/banking/auth/start`, {
    method: 'POST',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify({ redirect_url: redirectUrl })
  });
  if (!res.ok) {
    let detail = '';
    try {
      const err = await res.json();
      detail = err.detail || err.message;
    } catch {
      try { detail = (await res.text()).slice(0, 150); } catch {}
    }
    throw new Error(detail || `Erreur lors de l'initialisation de l'authentification bancaire (HTTP ${res.status})`);
  }
  return res.json();
}

// ==========================================
// Paramètres & Profil Utilisateur (Settings)
// ==========================================

export async function fetchUserProfile() {
  try {
    const res = await fetch(`${API_BASE}/auth/profile`, {
      headers: getAuthHeaders()
    });
    if (res.ok) {
      const data = await res.json();
      localStorage.setItem('sci_user_profile', JSON.stringify(data));
      if (data.email) localStorage.setItem('sci_user_email', data.email);
      return data;
    }
  } catch (err) {
    console.warn('API /auth/profile indisponible, fallback local:', err);
  }

  // Fallback local résilient
  const cachedProfile = localStorage.getItem('sci_user_profile');
  if (cachedProfile) {
    try {
      return JSON.parse(cachedProfile);
    } catch (_) {}
  }

  const storedPrenom = localStorage.getItem('sci_user') || 'Henri';
  const storedEmail = localStorage.getItem('sci_user_email') || `${storedPrenom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}@sci-familiale.fr`;

  return {
    id: 1,
    prenom: storedPrenom,
    name: `${storedPrenom} Jamet`,
    email: storedEmail,
    role: storedPrenom.toLowerCase().includes('henri')
      ? 'Nu-propriétaire • Gérant & Coordinateur Opérationnel'
      : 'Membre Associé'
  };
}

export async function updateUserProfile(data) {
  try {
    const res = await fetch(`${API_BASE}/auth/profile`, {
      method: 'PATCH',
      headers: getAuthJsonHeaders(),
      body: JSON.stringify(data)
    });
    if (res.ok) {
      const updated = await res.json();
      localStorage.setItem('sci_user_profile', JSON.stringify(updated));
      if (updated.email) localStorage.setItem('sci_user_email', updated.email);
      return updated;
    } else {
      const err = await res.json().catch(() => ({}));
      if (err.detail) throw new Error(err.detail);
    }
  } catch (err) {
    if (err.message && !err.message.includes('fetch')) {
      throw err;
    }
    console.warn('API /auth/profile PATCH fallback local:', err);
  }

  // Fallback local résilient
  if (data.email) {
    localStorage.setItem('sci_user_email', data.email);
  }
  const cachedProfile = localStorage.getItem('sci_user_profile');
  let profileObj = cachedProfile ? JSON.parse(cachedProfile) : {};
  profileObj = { ...profileObj, ...data };
  localStorage.setItem('sci_user_profile', JSON.stringify(profileObj));
  return profileObj;
}

export async function changeUserPassword({ currentPassword, newPassword, confirmPassword }) {
  // Validation côté client
  if (!newPassword || !newPassword.trim()) {
    throw new Error('Veuillez saisir votre nouveau mot de passe.');
  }
  if (confirmPassword !== undefined && newPassword !== confirmPassword) {
    throw new Error('Le nouveau mot de passe et sa confirmation ne correspondent pas.');
  }
  if (newPassword.trim().length < 4) {
    throw new Error('Le nouveau mot de passe doit comporter au moins 4 caractères.');
  }

  const payload = {
    new_password: newPassword,
    confirm_password: confirmPassword
  };
  if (currentPassword) {
    payload.current_password = currentPassword;
  }

  const res = await fetch(`${API_BASE}/auth/change-password`, {
    method: 'POST',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify(payload)
  });
  if (res.ok) {
    return await res.json();
  }
  const err = await res.json().catch(() => ({}));
  throw new Error(err.detail || 'Erreur lors du changement de mot de passe.');
}

export async function fetchMemberSettings(memberIdOrName = 'current') {
  const defaultSettings = {
    notify_new_task: true,
    notify_pending_vote: true,
    notify_final_decision: true,
    notify_new_stay: true,
    notify_mentions: true,
    notif_thermal_changes: false,
    notify_thermal_changes: false
  };

  const cacheKey = `sci_settings_${memberIdOrName}`;

  try {
    const endpoint = memberIdOrName === 'current'
      ? `${API_BASE}/auth/settings`
      : `${API_BASE}/members/${encodeURIComponent(memberIdOrName)}/settings`;

    const res = await fetch(endpoint, {
      headers: getAuthHeaders()
    });
    if (res.ok) {
      const data = await res.json();
      const merged = { ...defaultSettings, ...data };
      localStorage.setItem(cacheKey, JSON.stringify(merged));
      return merged;
    }
  } catch (err) {
    console.warn('API settings indisponible, fallback local:', err);
  }

  // Fallback local
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      return { ...defaultSettings, ...JSON.parse(cached) };
    } catch (_) {}
  }

  return defaultSettings;
}

export async function updateMemberSettings(memberIdOrName = 'current', settings) {
  const cacheKey = `sci_settings_${memberIdOrName}`;
  localStorage.setItem(cacheKey, JSON.stringify(settings));

  try {
    const endpoint = memberIdOrName === 'current'
      ? `${API_BASE}/auth/settings`
      : `${API_BASE}/members/${encodeURIComponent(memberIdOrName)}/settings`;

    let res = await fetch(endpoint, {
      method: 'PUT',
      headers: getAuthJsonHeaders(),
      body: JSON.stringify(settings)
    });
    if (res.ok) {
      return await res.json();
    }
    // Fallback alternatif si /settings/notifications est ciblé
    const altRes = await fetch(`${API_BASE}/settings/notifications`, {
      method: 'PUT',
      headers: getAuthJsonHeaders(),
      body: JSON.stringify(settings)
    });
    if (altRes.ok) {
      return await altRes.json();
    }
  } catch (err) {
    console.warn('API settings PUT indisponible, persistance locale assurée:', err);
  }

  return settings;
}

// Thermal & Pool Settings Endpoints
export async function saveHeatingSettings({
  target_temperature,
  frost_temperature,
  is_heating_active,
  is_dhw_active,
  dhw_target_temperature,
  mode,
  author_name,
  details
} = {}) {
  const res = await fetch(`${API_BASE}/heating/settings`, {
    method: 'POST',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify({
      target_temperature,
      frost_temperature,
      is_heating_active,
      is_dhw_active,
      dhw_target_temperature,
      mode,
      author_name,
      details
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors de l\'enregistrement des réglages thermiques');
  }
  invalidateApiCache('heating');
  return res.json();
}

export async function savePoolSettings({ target_temperature, filtration_mode, mode, author_name, details } = {}) {
  const res = await fetch(`${API_BASE}/pool/settings`, {
    method: 'POST',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify({ target_temperature, filtration_mode, mode, author_name, details }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors de l\'enregistrement des réglages piscine');
  }
  invalidateApiCache('pool');
  return res.json();
}


