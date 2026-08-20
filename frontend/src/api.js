const API_BASE = '/api';

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
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prenom, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erreur lors de la connexion');
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

export async function fetchAdminDocuments() {
  const res = await fetch(`${API_BASE}/admin-documents`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Erreur lors du chargement des documents administratifs');
  return res.json();
}

export async function deleteAdminDocument(filename) {
  const res = await fetch(`${API_BASE}/admin-documents/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Erreur lors de la suppression du document');
  return res.json();
}

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
