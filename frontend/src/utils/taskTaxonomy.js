/**
 * Taxonomie canonique orthogonale des tâches SCI Hellenvilliers (DRY) :
 * - URGENCE    : à quel point faut-il agir vite ? (pilote uniquement le système d'avance & le tri par urgence)
 * - DIFFICULTÉ : à quel point la tâche est pesante pour celui qui s'en charge ? (pilote uniquement les points 1/2/3/5/8)
 * - PRÉSENCE   : sur place (domaine) vs à distance
 */

function stripAccentsLower(val) {
  return String(val || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export const URGENCY_OPTIONS = [
  {
    value: 'Immédiate',
    label: 'Immédiate — Action au plus vite',
    shortLabel: 'Immédiate',
    badgeLabel: 'Urgence : Immédiate',
    hint: 'Attribuée dès la prochaine venue confirmée (ou sur place maintenant)',
    icon: 'local_fire_department',
    badgeClass: 'bg-rose-100 text-rose-900 border border-rose-300 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-800',
    dotClass: 'bg-rose-600',
    rank: 4,
  },
  {
    value: 'Rapide',
    label: 'Rapide — Dans les prochaines semaines',
    shortLabel: 'Rapide',
    badgeLabel: 'Urgence : Rapide',
    hint: 'Attribuée si une venue confirmée a lieu sous 30 jours',
    icon: 'bolt',
    badgeClass: 'bg-amber-100 text-amber-950 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800',
    dotClass: 'bg-amber-600',
    rank: 3,
  },
  {
    value: 'Normale',
    label: 'Normale — Sans précipitation',
    shortLabel: 'Normale',
    badgeLabel: 'Urgence : Normale',
    hint: 'Attribuée uniquement si une venue a lieu sous 14 jours, sinon vivier sur place',
    icon: 'schedule',
    badgeClass: 'bg-sage-soft text-forest-deep border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800',
    dotClass: 'bg-secondary',
    rank: 2,
  },
  {
    value: 'Sans urgence',
    label: "Sans urgence — Quand l'occasion se présente",
    shortLabel: 'Sans urgence',
    badgeLabel: 'Sans urgence',
    hint: "Vivier volontaire pur sur /sejour (jamais forcée tant que l'échéance est lointaine)",
    icon: 'event_available',
    badgeClass: 'bg-slate-100 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    dotClass: 'bg-slate-400',
    rank: 1,
  },
];

export const URGENCY_LEVELS = URGENCY_OPTIONS.map((u) => u.value);

export const DIFFICULTY_OPTIONS = [
  {
    value: 'Très facile',
    label: 'Très facile (1 pt)',
    shortLabel: 'Très facile',
    points: 1,
    hint: 'Quelques minutes, geste rapide ou simple coup de fil',
    badgeClass: 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700',
  },
  {
    value: 'Facile',
    label: 'Facile (2 pts)',
    shortLabel: 'Facile',
    points: 2,
    hint: 'Petite intervention simple ou démarche courte',
    badgeClass: 'bg-sky-50 text-sky-900 border border-sky-200 dark:bg-sky-950/50 dark:text-sky-200 dark:border-sky-800',
  },
  {
    value: 'Moyenne',
    label: 'Moyenne (3 pts)',
    shortLabel: 'Moyenne',
    points: 3,
    hint: 'Mission standard, coordination ou petit bricolage',
    badgeClass: 'bg-indigo-50 text-indigo-900 border border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-200 dark:border-indigo-800',
  },
  {
    value: 'Difficile',
    label: 'Difficile (5 pts)',
    shortLabel: 'Difficile',
    points: 5,
    hint: 'Chantier conséquent, plusieurs échanges ou suivi technique',
    badgeClass: 'bg-purple-50 text-purple-900 border border-purple-200 dark:bg-purple-950/50 dark:text-purple-200 dark:border-purple-800',
  },
  {
    value: 'Très difficile',
    label: 'Très difficile (8 pts)',
    shortLabel: 'Très difficile',
    points: 8,
    hint: 'Gros dossier lourd, complexe ou très exigeant',
    badgeClass: 'bg-fuchsia-50 text-fuchsia-950 border border-fuchsia-300 dark:bg-fuchsia-950/50 dark:text-fuchsia-200 dark:border-fuchsia-800',
  },
];

export const DIFFICULTY_LEVELS = DIFFICULTY_OPTIONS.map((d) => d.value);

export function normalizeUrgency(raw) {
  const clean = stripAccentsLower(raw);
  if (!clean) return 'Normale';
  if (['immediate', 'critique', 'urgent', 'urgente', 'tres urgente'].includes(clean)) {
    return 'Immédiate';
  }
  if (['rapide', 'haute', 'high', 'elevee', 'importante', 'prioritaire'].includes(clean)) {
    return 'Rapide';
  }
  if (['sans urgence', 'planifie', 'planifiee', 'basse', 'low', 'faible', 'aucune'].includes(clean)) {
    return 'Sans urgence';
  }
  return 'Normale';
}

export function getUrgencyMeta(raw) {
  const canonical = normalizeUrgency(raw);
  return URGENCY_OPTIONS.find((u) => u.value === canonical) || URGENCY_OPTIONS[2];
}

export function getUrgencyRank(raw) {
  return getUrgencyMeta(raw).rank;
}

export function normalizeDifficulty(raw) {
  const clean = stripAccentsLower(raw);
  if (!clean) return 'Moyenne';
  if (clean.includes('tres facile') || clean.includes('neglig') || clean === '1') {
    return 'Très facile';
  }
  if (clean.includes('tres difficile') || clean.includes('tres elev') || clean === '8') {
    return 'Très difficile';
  }
  if (clean.includes('facile') || clean.includes('faible') || clean === '2') {
    return 'Facile';
  }
  if (clean.includes('difficile') || clean.includes('elev') || clean.includes('expertise') || clean === '5') {
    return 'Difficile';
  }
  return 'Moyenne';
}

export function getDifficultyPoints(raw, explicitPoints = null) {
  if (explicitPoints !== null && explicitPoints !== undefined && !Number.isNaN(Number(explicitPoints)) && Number(explicitPoints) > 0) {
    return Number(explicitPoints);
  }
  const canonical = normalizeDifficulty(raw);
  const found = DIFFICULTY_OPTIONS.find((d) => d.value === canonical);
  return found ? found.points : 3;
}

export function getDifficultyMeta(raw, explicitPoints = null) {
  const canonical = normalizeDifficulty(raw);
  const found = DIFFICULTY_OPTIONS.find((d) => d.value === canonical) || DIFFICULTY_OPTIONS[2];
  const points = getDifficultyPoints(canonical, explicitPoints);
  return {
    ...found,
    points,
    badgeLabel: `${found.shortLabel} · ${points} pt${points > 1 ? 's' : ''}`,
  };
}

export function isTaskOnsite(task) {
  if (!task) return true;
  if (task.onsite_presence === false || task.onsite_presence === 0 || task.onsite_presence === 'false') {
    return false;
  }
  return true;
}

export function isTaskInOnsitePool(task) {
  if (!task || !isTaskOnsite(task)) return false;
  if (task.is_in_onsite_pool === true) return true;
  const st = String(task.status || '').toUpperCase().trim();
  if (!['EN_COURS', 'A_FAIRE', 'TODO'].includes(st)) return false;
  const hasMembers = Array.isArray(task.assigned_members) && task.assigned_members.filter(Boolean).length > 0;
  return !hasMembers && !task.assignee_id && !task.assignee;
}
