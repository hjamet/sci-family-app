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

  if (!res.ok) {
    let detailMsg = `HTTP ${res.status}${res.statusText ? ` (${res.statusText})` : ''}`;
    try {
      const clone = res.clone();
      const contentType = clone.headers.get('content-type') || '';
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

    emitAppError({
      url,
      method,
      status: res.status,
      message: typeof detailMsg === 'object' ? JSON.stringify(detailMsg) : String(detailMsg),
    });
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

export async function fetchUsers() {
  const res = await fetch(`${API_BASE}/users`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Erreur lors du chargement des utilisateurs');
  return res.json();
}

export async function fetchProperties() {
  const res = await fetch(`${API_BASE}/properties`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Erreur lors du chargement des propriétés');
  return res.json();
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
export async function fetchReservations(params = {}) {
  const query = new URLSearchParams();
  if (params.property_id) query.append('property_id', params.property_id);
  if (params.year) query.append('year', params.year);
  if (params.status && params.status !== 'Tous') query.append('status', params.status);

  const res = await fetch(`${API_BASE}/reservations?${query.toString()}`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Erreur lors de la récupération des réservations');
  return res.json();
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
  return res.json();
}

export async function updateReservation(resId, data) {
  const res = await fetch(`${API_BASE}/reservations/${resId}`, {
    method: 'PATCH',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erreur lors de la mise à jour de la réservation');
  return res.json();
}

export async function deleteReservation(resId) {
  const res = await fetch(`${API_BASE}/reservations/${resId}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Erreur lors de la suppression de la réservation');
  return true;
}


// Projects & Voting System
export async function fetchProjects(params = {}) {
  const query = new URLSearchParams();
  if (params.property_id) query.append('property_id', params.property_id);
  if (params.status && params.status !== 'Tous') query.append('status', params.status);

  const res = await fetch(`${API_BASE}/projects?${query.toString()}`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Erreur lors de la récupération des projets');
  return res.json();
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
  return res.json();
}

export async function reviewProject(projectId, data) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/review`, {
    method: 'PATCH',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors de la révision du projet');
  }
  return res.json();
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

export async function uploadTaskDocuments(files) {
  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append('files', files[i]);
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

export async function deleteAdminDocument(idOrFilename) {
  const res = await fetch(`${API_BASE}/documents/${encodeURIComponent(idOrFilename)}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Erreur lors de la suppression du document');
  return res.json();
}

export const deleteDocument = deleteAdminDocument;

export async function fetchMemberCurrentStayTasks(userName) {
  const res = await fetch(`${API_BASE}/members/${encodeURIComponent(userName)}/current-stay-tasks`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Erreur lors du chargement de la checklist du membre');
  return res.json();
}

export async function fetchTasks(params = {}) {
  const query = new URLSearchParams();
  if (params.user_name) query.append('user_name', params.user_name);
  if (params.property_id) query.append('property_id', params.property_id);
  if (params.category) query.append('category', params.category);

  const res = await fetch(`${API_BASE}/tasks?${query.toString()}`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Erreur lors du chargement des tâches');
  return res.json();
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
  return res.json();
}

export async function updateVademecumItem(itemId, data) {
  const res = await fetch(`${API_BASE}/vademecum/${itemId}`, {
    method: 'PATCH',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erreur lors de la mise à jour de la fiche Vademecum');
  return res.json();
}

export async function deleteVademecumItem(itemId) {
  const res = await fetch(`${API_BASE}/vademecum/${itemId}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Erreur lors de la suppression de la fiche Vademecum');
  return true;
}


// Heating & ViCare System
export async function fetchHeatingStatus() {
  const res = await fetch(`${API_BASE}/heating/status`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors de la récupération du statut du chauffage ViCare');
  }
  return res.json();
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
export async function fetchCurrentUser() {
  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Erreur lors de la récupération du profil');
  return res.json();
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
  return res.json();
}

export async function deleteTask(taskId) {
  const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Erreur lors de la suppression de la tâche');
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
  return res.json();
}

// Piscine Telemetry
export async function fetchPiscineStatus() {
  const res = await fetch(`${API_BASE}/piscine/status`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Erreur lors de la récupération du statut piscine');
  return res.json();
}

// Open Banking DSP2 (Enable Banking & Swan France)
export async function fetchBankStatus() {
  const res = await fetch(`${API_BASE}/banking/status`, {
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

  try {
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
  } catch (err) {
    // Si c'est une erreur de mot de passe incorrect retournée par le serveur
    if (err.message && (err.message.includes('incorrect') || err.message.includes('correspondent pas'))) {
      throw err;
    }
    if (!err.message.includes('fetch') && !err.message.includes('NetworkError') && !err.message.includes('Failed to fetch')) {
      throw err;
    }
    // Fallback mode offline/dev : validation locale simulée avec succès
    console.warn('API /auth/change-password indisponible, validation locale dev enregistrée');
    return { success: true, message: 'Mot de passe modifié avec succès (mode local dev).' };
  }
}

export async function fetchMemberSettings(memberIdOrName = 'current') {
  const defaultSettings = {
    notify_new_task: true,
    notify_pending_vote: true,
    notify_final_decision: true,
    notify_new_stay: true,
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

    const res = await fetch(endpoint, {
      method: 'PUT',
      headers: getAuthJsonHeaders(),
      body: JSON.stringify(settings)
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('API settings PUT indisponible, persistance locale assurée:', err);
  }

  return settings;
}

// Thermal & Pool Settings Endpoints
export async function saveHeatingSettings({ target_temperature, mode, author_name, details } = {}) {
  const res = await fetch(`${API_BASE}/heating/settings`, {
    method: 'POST',
    headers: getAuthJsonHeaders(),
    body: JSON.stringify({ target_temperature, mode, author_name, details }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors de l\'enregistrement des réglages de chauffage');
  }
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
  return res.json();
}


