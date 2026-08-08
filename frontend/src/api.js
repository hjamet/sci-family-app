const API_BASE = '/api';

// Auth & Users
export async function loginUser(prenom, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prenom, password }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Erreur lors de la connexion');
  }
  return res.json();
}

export async function fetchUsers() {
  const res = await fetch(`${API_BASE}/users`);
  if (!res.ok) throw new Error('Erreur lors du chargement des utilisateurs');
  return res.json();
}

export async function fetchProperties() {
  const res = await fetch(`${API_BASE}/properties`);
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

  const res = await fetch(`${API_BASE}/issues?${query.toString()}`);
  if (!res.ok) throw new Error('Erreur lors de la récupération des problèmes');
  return res.json();
}

export async function createIssue(data) {
  const res = await fetch(`${API_BASE}/issues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Erreur lors de la création de l\'incident');
  }
  return res.json();
}

export async function uploadPhoto(file) {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/issues/upload-photo`, {
    method: 'POST',
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
    body: formData,
  });
  if (!res.ok) throw new Error('Erreur lors de l\'envoi des photos');
  return res.json();
}

export async function updateIssue(issueId, data) {
  const res = await fetch(`${API_BASE}/issues/${issueId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erreur lors de la mise à jour de l\'incident');
  return res.json();
}

export async function addIssueComment(issueId, data) {
  const res = await fetch(`${API_BASE}/issues/${issueId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

  const res = await fetch(`${API_BASE}/reservations?${query.toString()}`);
  if (!res.ok) throw new Error('Erreur lors de la récupération des réservations');
  return res.json();
}

export async function createReservation(data) {
  const res = await fetch(`${API_BASE}/reservations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Erreur lors de la réservation');
  }
  return res.json();
}

export async function updateReservation(resId, data) {
  const res = await fetch(`${API_BASE}/reservations/${resId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erreur lors de la mise à jour de la réservation');
  return res.json();
}

export async function deleteReservation(resId) {
  const res = await fetch(`${API_BASE}/reservations/${resId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Erreur lors de la suppression de la réservation');
  return true;
}


// Projects & Voting System
export async function fetchProjects(params = {}) {
  const query = new URLSearchParams();
  if (params.property_id) query.append('property_id', params.property_id);
  if (params.status && params.status !== 'Tous') query.append('status', params.status);

  const res = await fetch(`${API_BASE}/projects?${query.toString()}`);
  if (!res.ok) throw new Error('Erreur lors de la récupération des projets');
  return res.json();
}

export async function createProject(data) {
  const res = await fetch(`${API_BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Erreur lors de la création du projet');
  }
  return res.json();
}

export async function reviewProject(projectId, data) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/review`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Erreur lors de la révision du projet');
  }
  return res.json();
}

export async function updateProjectCost(projectId, estimatedCost, coordinatorNotes) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/cost`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      estimated_cost: estimatedCost,
      coordinator_notes: coordinatorNotes
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Erreur lors de la mise à jour du coût estimé');
  }
  return res.json();
}

export async function castProjectVote(projectId, data) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Erreur lors de l\'enregistrement du vote');
  }
  return res.json();
}



// Member Availabilities & Smart Match (Crossed Calendar)
export async function fetchAvailabilities(propertyId, year = 2026) {
  const res = await fetch(`${API_BASE}/availabilities?property_id=${propertyId}&year=${year}`);
  if (!res.ok) throw new Error('Erreur lors du chargement des disponibilités');
  return res.json();
}

export async function setAvailability(data) {
  const res = await fetch(`${API_BASE}/availabilities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erreur lors de l\'enregistrement de la disponibilité');
  return res.json();
}

export async function setAvailabilitiesBatch(data) {
  const res = await fetch(`${API_BASE}/availabilities/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erreur lors de l\'enregistrement des disponibilités');
  return res.json();
}

export async function fetchSmartMatch(propertyId, year = 2026) {
  const res = await fetch(`${API_BASE}/availabilities/smart-match?property_id=${propertyId}&year=${year}`);
  if (!res.ok) throw new Error('Erreur lors du calcul Smart Match');
  return res.json();
}


// Maintenance Tasks & Stay Checklist
export async function fetchMaintenanceTasks(propertyId) {
  const query = propertyId ? `?property_id=${propertyId}` : '';
  const res = await fetch(`${API_BASE}/maintenance-tasks${query}`);
  if (!res.ok) throw new Error('Erreur lors de la récupération des tâches de maintenance');
  return res.json();
}

export async function createMaintenanceTask(data) {
  const res = await fetch(`${API_BASE}/maintenance-tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Erreur lors de la création de la tâche');
  }
  return res.json();
}

export async function deleteMaintenanceTask(taskId) {
  const res = await fetch(`${API_BASE}/maintenance-tasks/${taskId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Erreur lors de la suppression de la tâche');
  return true;
}

export async function fetchReservationTasks(reservationId) {
  const res = await fetch(`${API_BASE}/reservations/${reservationId}/tasks`);
  if (!res.ok) throw new Error('Erreur lors du chargement des tâches attribuées au séjour');
  return res.json();
}

export async function toggleStayTask(reservationId, assignmentId) {
  const res = await fetch(`${API_BASE}/reservations/${reservationId}/tasks/${assignmentId}/toggle`, {
    method: 'PATCH',
  });
  if (!res.ok) throw new Error('Erreur lors du changement d\'état de la tâche');
  return res.json();
}

export async function fetchMemberCurrentStayTasks(userName) {
  const res = await fetch(`${API_BASE}/members/${encodeURIComponent(userName)}/current-stay-tasks`);
  if (!res.ok) throw new Error('Erreur lors du chargement de la checklist du membre');
  return res.json();
}


// Vademecum Centralisé
export async function fetchVademecum(params = {}) {
  const query = new URLSearchParams();
  if (params.property_id) query.append('property_id', params.property_id);
  if (params.category && params.category !== 'Toutes') query.append('category', params.category);

  const res = await fetch(`${API_BASE}/vademecum?${query.toString()}`);
  if (!res.ok) throw new Error('Erreur lors de la récupération des fiches Vademecum');
  return res.json();
}

export async function createVademecumItem(data) {
  const res = await fetch(`${API_BASE}/vademecum`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Erreur lors de la création de la fiche Vademecum');
  }
  return res.json();
}

export async function updateVademecumItem(itemId, data) {
  const res = await fetch(`${API_BASE}/vademecum/${itemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erreur lors de la mise à jour de la fiche Vademecum');
  return res.json();
}

export async function deleteVademecumItem(itemId) {
  const res = await fetch(`${API_BASE}/vademecum/${itemId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Erreur lors de la suppression de la fiche Vademecum');
  return true;
}


// Dashboard Stats
export async function fetchStats() {
  const res = await fetch(`${API_BASE}/stats`);
  if (!res.ok) throw new Error('Erreur lors de la récupération des statistiques');
  return res.json();
}


