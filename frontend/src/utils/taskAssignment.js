/**
 * Utilitaires partagés pour l'assignation et le cycle de vie des tâches
 * Utilisé par TasksPage, VademecumPage et DashboardPage pour garantir
 * une synchronisation absolue des compteurs et des filtres.
 */

export const CANONICAL_ASSOCIATES_MAP = {
  henri: 1,
  hortense: 2,
  marguerite: 3,
  eugenie: 4,
  josephine: 5,
  maman: 6,
  elisabeth: 6,
  frederic: 7,
};

export const MEMBER_ID_TO_NAME = {
  1: 'Henri Jamet',
  2: 'Hortense Jamet',
  3: 'Marguerite Jamet',
  4: 'Eugénie Jamet',
  5: 'Joséphine Jamet',
  6: 'Élisabeth Jamet',
  7: 'Frédéric Jamet',
};

export function resolveMemberDisplayName(val) {
  if (val === null || val === undefined || val === '') return null;
  const strVal = String(val).trim();
  const numId = parseInt(strVal, 10);
  if (!isNaN(numId) && MEMBER_ID_TO_NAME[numId]) {
    return MEMBER_ID_TO_NAME[numId];
  }
  const lower = stripAccents(strVal);
  for (const [key, id] of Object.entries(CANONICAL_ASSOCIATES_MAP)) {
    if (lower.startsWith(key) || lower.includes(key)) {
      return MEMBER_ID_TO_NAME[id];
    }
  }
  return strVal;
}

function stripAccents(str) {
  if (!str || typeof str !== 'string') return '';
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

/**
 * Résout les métadonnées de l'utilisateur (id numérique, prénom, nom) de façon infaillible.
 */
export function resolveUserMeta(currentUser) {
  let name = '';
  let id = null;
  let prenom = '';

  if (typeof currentUser === 'string' && currentUser.trim()) {
    name = currentUser.trim();
    prenom = name.split(' ')[0];
  } else if (currentUser && typeof currentUser === 'object') {
    id = currentUser.id ?? currentUser.member_id ?? null;
    prenom = currentUser.prenom || (currentUser.name ? currentUser.name.split(' ')[0] : '');
    name = currentUser.name || currentUser.fullName || (prenom ? `${prenom} Jamet` : '');
  }

  if (!prenom) {
    try {
      const stored = localStorage.getItem('sci_user');
      if (stored) {
        prenom = stored.trim().split(' ')[0];
        name = stored.includes('Jamet') ? stored.trim() : `${prenom} Jamet`;
      }
    } catch (_) {}
  }

  if (!prenom) prenom = 'Henri';
  if (!name) name = `${prenom} Jamet`;

  const lowerPrenom = stripAccents(prenom);
  const lowerName = stripAccents(name);

  // Résolution robuste de l'ID numérique
  let numericId = null;
  if (id != null && !isNaN(parseInt(id, 10))) {
    numericId = parseInt(id, 10);
  } else if (CANONICAL_ASSOCIATES_MAP[lowerPrenom]) {
    numericId = CANONICAL_ASSOCIATES_MAP[lowerPrenom];
  }

  return {
    name,
    prenom,
    id: numericId,
    lowerPrenom,
    lowerName,
  };
}

/**
 * Vérifie si une tâche est encore ouverte (non achevée, non archivée).
 */
export function isTaskOpen(task) {
  if (!task) return false;
  const raw = (task.status || '').trim();
  const st = raw.toUpperCase();
  const norm = stripAccents(raw).toLowerCase().replace(/[_\s-]+/g, '_');
  const closedNormalized = [
    'terminee',
    'termine',
    'archivee',
    'archive',
    'completed',
    'annulee',
    'annule',
    'cloturee',
    'cloture',
    'closed',
    'refusee',
    'refuse',
    'rejected',
  ];
  return !closedNormalized.includes(norm);
}

/**
 * Vérifie si une tâche est en attente de validation par le coordinateur.
 */
export function isTaskPendingValidation(task) {
  if (!task) return false;
  const rawStatus = (task.status || '').trim();
  const st = rawStatus.toUpperCase();
  const normalized = stripAccents(rawStatus).toLowerCase().replace(/[_\s-]+/g, '_');
  return (
    st === 'PENDING_VALIDATION' ||
    st === 'EN_ATTENTE_VALIDATION' ||
    st === 'EN_ATTENTE_DE_VALIDATION' ||
    st === 'A_VALIDER' ||
    st === 'À_VALIDER' ||
    st === 'À VALIDER' ||
    st === 'A VALIDER' ||
    normalized === 'pending_validation' ||
    normalized === 'en_attente_validation' ||
    normalized === 'en_attente_de_validation' ||
    normalized === 'a_valider' ||
    Boolean(task.pending_validation) ||
    Boolean(task.requires_coordinator_validation)
  );
}

/**
 * Vérifie si une tâche est proposée (en attente d'approbation initiale par le coordinateur).
 */
export function isTaskProposed(task) {
  if (!task) return false;
  const rawStatus = (task.status || '').trim();
  const st = rawStatus.toUpperCase();
  const normalized = stripAccents(rawStatus).toLowerCase().replace(/[_\s-]+/g, '_');

  // Pare-feu strict : les tâches d'arbitrage d'avance de trésorerie sont DIRECTEMENT ACTIVES (exigence Henri)
  const taskTitle = (task.title || '').toLowerCase();
  const taskCat = (task.category || '').toLowerCase();
  if (
    taskTitle.includes('validation avance') ||
    taskCat.includes('trésorerie') ||
    taskCat.includes('tresorerie')
  ) {
    return false;
  }

  // Pare-feu strict : une tâche active (TODO, EN_COURS, OPEN) ou déjà fermée n'est JAMAIS proposée (Annotation 14)
  if (
    ['TODO', 'EN_COURS', 'OPEN', 'IN_PROGRESS', 'ACTIVE', 'A_FAIRE', 'DONE', 'TERMINE', 'TERMINEE', 'ARCHIVEE', 'PENDING_VALIDATION'].includes(st) ||
    ['todo', 'en_cours', 'open', 'in_progress', 'active', 'a_faire', 'done', 'termine', 'terminee', 'archivee', 'pending_validation'].includes(normalized)
  ) {
    return false;
  }

  return (
    st === 'PROPOSED' ||
    st === 'PROPOSEE' ||
    st === 'PROPOSÉE' ||
    st === 'SOUMIS' ||
    st === 'SOUMISE' ||
    st === 'A_REVOIR' ||
    st === 'À_REVOIR' ||
    st === 'A REVOIR' ||
    st === 'À REVOIR' ||
    st === 'A_APPROUVER' ||
    st === 'EN_ATTENTE_APPROBATION' ||
    st === 'PENDING_APPROVAL' ||
    normalized === 'proposed' ||
    normalized === 'proposee' ||
    normalized === 'a_revoir' ||
    normalized === 'soumise' ||
    normalized === 'soumis' ||
    normalized === 'a_approuver' ||
    Boolean(task.is_proposed)
  );
}

/**
 * Détermine la catégorie trichromatique d'une tâche :
 * - 'orange' : proposée en attente d'approbation initiale (PROPOSED, A_REVOIR)
 * - 'green' : terminée demandant validation finale du coordinateur (PENDING_VALIDATION, A_VALIDER)
 * - 'blue' : en cours (EN_COURS, IN_PROGRESS, TODO, etc.)
 */
export function getTaskColorCategory(task) {
  if (isTaskProposed(task)) return 'orange';
  if (isTaskPendingValidation(task)) return 'green';
  return 'blue';
}

/**
 * Retourne le label canonique strict, le statut normalisé et le style de badge (Annotation 4 & 18) :
 * - PROPOSED : "En attente de création" (Badge orange/ambre)
 * - PENDING_VALIDATION : "En attente de validation" (Badge vert émeraude)
 * - EN_COURS / TODO : "En cours" (Badge bleu)
 * - DONE / ARCHIVEE : "Archivée" (Badge gris)
 */
export function getTaskStatusMeta(task) {
  if (!task) {
    return {
      status: 'PROPOSED',
      label: 'En attente de création',
      color: 'orange',
      badgeClass: 'bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200 border-amber-300',
      icon: 'pending'
    };
  }

  const rawStatus = (task.status || '').trim();
  const st = rawStatus.toUpperCase();
  const normalized = stripAccents(rawStatus).toLowerCase().replace(/[_\s-]+/g, '_');

  // 1. Tâche terminée / archivée
  if (
    !isTaskOpen(task) ||
    ['DONE', 'TERMINE', 'TERMINEE', 'ARCHIVE', 'ARCHIVEE', 'CLOS', 'CLOTURE', 'CLOTUREE'].includes(st) ||
    ['done', 'termine', 'terminee', 'archive', 'archivee', 'clos', 'cloture', 'cloturee'].includes(normalized)
  ) {
    return {
      status: 'DONE',
      label: 'Archivée',
      color: 'gray',
      badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300',
      icon: 'archive'
    };
  }

  // 2. Tâche effectuée par le membre, attend la confirmation finale et validation par le coordinateur (Annotation 18)
  if (isTaskPendingValidation(task)) {
    return {
      status: 'PENDING_VALIDATION',
      label: "En attente de validation",
      color: 'green',
      badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200 border-emerald-300',
      icon: 'verified'
    };
  }

  // 3. Tâche proposée, attend que le coordinateur valide la création (Annotation 18)
  if (isTaskProposed(task)) {
    return {
      status: 'PROPOSED',
      label: 'En attente de création',
      color: 'orange',
      badgeClass: 'bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200 border-amber-300',
      icon: 'pending'
    };
  }

  // 4. Tâche active, validée par le coordinateur et assignée au responsable
  return {
    status: 'EN_COURS',
    label: 'En cours',
    color: 'blue',
    badgeClass: 'bg-sky-50 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200 border-sky-200',
    icon: 'play_circle'
  };
}


/**
 * Comparateur universel d'assignation d'une tâche à un utilisateur donné.
 * Compare par :
 * - IDs directs (assigned_member_id, assignee_id, assigned_to_id, member_id, user_id)
 * - Assignee textuels (assignee, assignee_name, assigned_to, responsible)
 * - Tableaux de membres assignés (objets, noms, IDs numériques, chaînes JSON)
 * - Mentions dans le titre ou la description (@prenom, [référent: prenom])
 * - Fallback created_by / submitted_by si aucune assignation explicite n'est présente.
 */
export function isTaskAssignedToUser(task, userMetaOrUser) {
  if (!task || !userMetaOrUser) return false;

  const userMeta = (userMetaOrUser.lowerPrenom !== undefined && userMetaOrUser.id !== undefined)
    ? userMetaOrUser
    : resolveUserMeta(userMetaOrUser);

  const uId = userMeta.id;
  const uFirst = userMeta.lowerPrenom;
  const uName = userMeta.lowerName;

  const matchesUser = (val) => {
    if (val == null) return false;
    // Si c'est un identifiant numérique ou une chaîne convertible
    if (typeof val === 'number' || (typeof val === 'string' && /^\d+$/.test(val.trim()))) {
      const num = parseInt(val, 10);
      return uId != null && num === uId;
    }
    const s = stripAccents(String(val));
    if (!s) return false;
    if (uFirst && (s === uFirst || s.includes(uFirst) || uFirst.includes(s))) return true;
    if (uName && (s === uName || s.includes(uName) || uName.includes(s))) return true;
    return false;
  };

  // 1. Tous les champs ID de la tâche
  const directIds = [
    task.assigned_member_id,
    task.assignee_id,
    task.assigned_to_id,
    task.member_id,
    task.user_id,
    task.target_member_id,
  ];
  for (const tid of directIds) {
    if (tid != null && !isNaN(parseInt(tid, 10))) {
      if (uId != null && parseInt(tid, 10) === uId) return true;
    }
  }

  // 2. Champs directs textuels (assignee, assigned_to, responsible...)
  const directFields = [
    task.assignee,
    task.assignee_name,
    task.assigned_to,
    task.assigned_to_name,
    task.responsible,
    task.member_name,
  ];
  for (const field of directFields) {
    if (matchesUser(field)) return true;
  }

  // 3. Assigned members (tableau d'objets, d'IDs ou de noms, ou JSON string)
  const rawMembers = task.assigned_members || task.assignees || task.members;
  let membersList = [];
  if (Array.isArray(rawMembers)) {
    membersList = rawMembers;
  } else if (typeof rawMembers === 'string' && rawMembers.trim()) {
    try {
      const parsed = JSON.parse(rawMembers);
      if (Array.isArray(parsed)) membersList = parsed;
      else membersList = [rawMembers];
    } catch (_) {
      membersList = rawMembers.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }

  for (const m of membersList) {
    if (typeof m === 'object' && m !== null) {
      if (matchesUser(m.id ?? m.member_id ?? m.user_id)) return true;
      if (matchesUser(m.name || m.prenom || m.fullName)) return true;
    } else {
      if (matchesUser(m)) return true;
    }
  }

  // 4. Mention explicite dans le titre ou la description
  const fullText = stripAccents(`${task.title || ''} ${task.description || ''}`);
  if (uFirst && uFirst.length >= 3) {
    if (
      fullText.includes(`referent: ${uFirst}`) ||
      fullText.includes(`referente: ${uFirst}`) ||
      fullText.includes(`referent : ${uFirst}`) ||
      fullText.includes(`referente : ${uFirst}`) ||
      fullText.includes(`assigne: ${uFirst}`) ||
      fullText.includes(`assignee: ${uFirst}`) ||
      fullText.includes(`assigne a: ${uFirst}`) ||
      fullText.includes(`assignee a: ${uFirst}`) ||
      fullText.includes(`en charge: ${uFirst}`) ||
      fullText.includes(`@${uFirst}`)
    ) {
      return true;
    }
  }

  // Annotation 3 : Zéro auto-attribution au créateur. Une tâche sans membre explicitement assigné
  // n'est attribuée à personne et attend la désignation formelle par le coordinateur.
  return false;
}
