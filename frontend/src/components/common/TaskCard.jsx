import React from 'react';
import { isTaskPendingValidation } from '../../utils/taskAssignment';

function getCategoryIcon(cat) {
  if (!cat) return 'category';
  const c = String(cat).toLowerCase();
  if (c.includes('entretien')) return 'handyman';
  if (c.includes('travaux') || c.includes('bâti') || c.includes('bati')) return 'construction';
  if (c.includes('vert') || c.includes('jardin')) return 'yard';
  if (c.includes('admin') || c.includes('gestion')) return 'description';
  if (c.includes('piscine') || c.includes('bassin')) return 'pool';
  if (c.includes('chauffage') || c.includes('énergie') || c.includes('energie')) return 'thermostat';
  return 'category';
}

function getSubjectIcon(sub) {
  if (!sub) return 'home_work';
  const s = String(sub).toLowerCase();
  if (s.includes('rosing')) return 'home_work';
  if (s.includes('presbytère') || s.includes('presbytere')) return 'cottage';
  if (s.includes('cabane')) return 'holiday_village';
  if (s.includes('piscine')) return 'pool';
  if (s.includes('hangar') || s.includes('garage')) return 'warehouse';
  if (s.includes('jardin')) return 'yard';
  if (s.includes('sci')) return 'account_balance';
  return 'home_work';
}

export default function TaskCard({
  task,
  currentUser,
  onOpen,
  className = '',
}) {
  if (!task) return null;

  const isValidationTask = isTaskPendingValidation(task);

  // Normalize priority to 'Normale', 'Haute', 'Critique'
  const rawPriority = (task.priority || 'Normale').trim();
  const normalizedPriority = rawPriority.toLowerCase() === 'normal' || rawPriority.toLowerCase() === 'normale'
    ? 'Normale'
    : rawPriority.toLowerCase() === 'haute' || rawPriority.toLowerCase() === 'high'
    ? 'Haute'
    : rawPriority.toLowerCase() === 'critique' || rawPriority.toLowerCase() === 'urgent'
    ? 'Critique'
    : rawPriority.charAt(0).toUpperCase() + rawPriority.slice(1).toLowerCase();

  const isCritical = normalizedPriority === 'Critique';
  const isHigh = normalizedPriority === 'Haute';
  const isNormal = normalizedPriority === 'Normale' || !normalizedPriority;

  const subject = task.subject || task.location || task.domaine || task.property_name || '';
  const complexity = task.complexity || (task.difficulty ? (task.difficulty === 'Modérée' ? 'Modérée' : task.difficulty) : '');

  // Resolve assignee name & initials
  let assigneeName = '';
  if (Array.isArray(task.assigned_members) && task.assigned_members.length > 0) {
    const first = task.assigned_members[0];
    assigneeName = typeof first === 'object' ? (first.name || first.prenom) : String(first);
  } else if (task.assignee) {
    assigneeName = String(task.assignee);
  } else if (task.assigned_to) {
    assigneeName = String(task.assigned_to);
  } else if (task.responsible) {
    assigneeName = String(task.responsible);
  } else {
    assigneeName = 'Henri Jamet';
  }

  const displayAssigneeName = isValidationTask ? (task.created_by || assigneeName) : assigneeName;
  const initials = displayAssigneeName
    ? displayAssigneeName
        .split(' ')
        .filter(Boolean)
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'HJ';

  // Annotation 1: Calcul d'avancement opérationnel strictement basé sur la checklist / subtasks
  const parseItems = (raw) => {
    if (Array.isArray(raw) && raw.length > 0) return raw;
    if (typeof raw === 'string' && raw.trim()) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (_) {}
    }
    return [];
  };
  const checklistItems = parseItems(task.checklist).length > 0
    ? parseItems(task.checklist)
    : parseItems(task.subtasks);

  const hasChecklist = checklistItems.length > 0;
  const totalSteps = checklistItems.length;
  const completedSteps = hasChecklist
    ? checklistItems.filter((item) =>
        Boolean(item && (item.done || item.completed || item.status === 'done' || item.status === 'completed'))
      ).length
    : 0;
  const progressPct = hasChecklist ? Math.round((completedSteps / totalSteps) * 100) : 0;

  return (
    <article
      onClick={() => onOpen && onOpen(task)}
      className={`rounded-xl p-space-md lg:p-space-lg shadow-sm hover:shadow-md transition-all flex flex-col justify-between group cursor-pointer ${
        isValidationTask
          ? 'bg-purple-50/80 dark:bg-purple-950/40 border-2 border-purple-300 dark:border-purple-700/60 shadow-sm'
          : 'bg-surface-container-lowest border border-border-subtle'
      } ${className}`}
    >
      <div>
        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-space-xs mb-3">
          {isValidationTask && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200 border border-purple-300 flex items-center gap-1">
              <span className="material-symbols-outlined text-[15px]">verified</span> En attente de validation
            </span>
          )}

          {/* Priority Badge */}
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-label-sm text-label-sm font-semibold ${
              isValidationTask
                ? 'bg-purple-200/80 text-purple-900 dark:bg-purple-800 dark:text-purple-100'
                : isCritical
                ? 'bg-error-container/60 text-error'
                : isHigh
                ? 'bg-amber-soft text-amber-rich'
                : isNormal
                ? 'bg-sage-soft text-forest-deep'
                : 'bg-canvas-slate text-on-surface-variant'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isValidationTask
                  ? 'bg-purple-600'
                  : isCritical
                  ? 'bg-error'
                  : isHigh
                  ? 'bg-amber-rich'
                  : isNormal
                  ? 'bg-secondary'
                  : 'bg-outline'
              }`}
            ></span>
            {normalizedPriority}
          </span>

          {/* Emplacement / Sujet */}
          {subject && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-canvas-slate text-on-surface font-label-sm text-label-sm">
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
                {task.subject_icon || getSubjectIcon(subject)}
              </span>
              {subject}
            </span>
          )}

          {/* Estimation de complexité */}
          {complexity && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-canvas-slate text-on-surface-variant font-label-sm text-label-sm border border-slate-200">
              <span className="material-symbols-outlined text-[15px] text-primary">bolt</span>
              <span>{complexity}</span>
            </span>
          )}

          {/* Domaine / Catégorie */}
          {task.category && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sage-soft text-forest-deep font-label-sm text-label-sm font-semibold">
              <span className="material-symbols-outlined text-[16px] text-primary">
                {getCategoryIcon(task.category)}
              </span>
              {task.category}
            </span>
          )}

          {/* Extra Tag si existant */}
          {task.extra_tag && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-canvas-slate text-on-surface font-label-sm text-label-sm">
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
                {task.extra_tag === 'SCI' ? 'account_balance' : task.extra_tag === 'Piscine' ? 'pool' : 'home'}
              </span>
              {task.extra_tag}
            </span>
          )}

          {/* Budget alloué ou devis */}
          {task.budget ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-canvas-slate text-forest-deep font-label-sm text-label-sm border border-slate-200 ml-auto">
              <span className="text-xs text-on-surface-variant font-medium">Devis :</span>
              <span className="font-bold">~{task.budget} €</span>
            </span>
          ) : null}
        </div>

        {/* Title */}
        <div className="mb-2">
          <h3
            className={`font-headline-sm text-headline-sm font-bold transition-colors ${
              isValidationTask
                ? 'text-purple-950 dark:text-purple-100'
                : 'text-forest-deep group-hover:text-primary'
            }`}
          >
            {task.title}
          </h3>
        </div>

        {/* Description */}
        {task.description && (
          <p className="font-body-md text-body-md text-on-surface-variant mb-space-md text-xs sm:text-sm leading-relaxed line-clamp-3">
            {task.description}
          </p>
        )}

        {/* Progress Box with Shimmer (Annotation 1 : Uniquement si la tâche a des sous-tâches/checklist) */}
        {hasChecklist && (
          <div className="p-space-xs px-3 bg-surface-container-low rounded-DEFAULT mb-space-md border border-slate-100">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5 text-label-sm font-semibold text-forest-deep text-xs">
                <span className="material-symbols-outlined text-[18px] text-primary">
                  {task.step_icon || 'checklist'}
                </span>
                <span>{task.step_label || 'Avancement opérationnel'}</span>
              </div>
              <span
                className={`font-label-sm font-bold px-2 py-0.5 rounded-full text-xs ${
                  isValidationTask
                    ? 'text-purple-800 bg-purple-100'
                    : isCritical
                    ? 'text-error bg-error-container/40'
                    : isHigh
                    ? 'text-amber-rich bg-amber-soft'
                    : 'text-primary bg-sage-soft'
                }`}
              >
                {progressPct}%
              </span>
            </div>

            <div className="w-full h-2 bg-surface-container-high rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 progress-shimmer ${
                  isValidationTask
                    ? 'bg-gradient-to-r from-purple-500 to-indigo-600'
                    : isCritical
                    ? 'bg-gradient-to-r from-red-500 to-rose-600'
                    : isHigh
                    ? 'bg-gradient-to-r from-amber-500 to-emerald-600'
                    : 'bg-gradient-to-r from-teal-500 to-emerald-600'
                }`}
                style={{ width: `${progressPct}%` }}
              ></div>
            </div>
          </div>
        )}
      </div>

      {/* Card Footer: Assignee & Action Button */}
      <div
        className={`pt-space-sm flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm border-t ${
          isValidationTask ? 'border-purple-200 dark:border-purple-800' : 'border-slate-100'
        }`}
      >
        <div className="flex items-center gap-2">
          <div className="flex -space-x-2 overflow-hidden">
            <div
              className={`w-8 h-8 rounded-full ${
                isValidationTask ? 'bg-purple-700 text-white' : 'bg-primary text-on-primary'
              } font-bold text-xs flex items-center justify-center ring-2 ring-surface-container-lowest`}
              title={displayAssigneeName}
            >
              {initials}
            </div>
          </div>
          <div className="flex flex-col">
            <span className="font-label-sm text-label-sm text-on-surface font-semibold leading-tight">
              {isValidationTask
                ? `Soumis par : ${task.created_by || assigneeName}`
                : assigneeName}
            </span>
            <span className="text-[12px] text-on-surface-variant leading-tight">
              {isValidationTask
                ? 'Validation coordinateur requise'
                : task.role_label || 'Responsable de mission'}
            </span>
          </div>
        </div>

        {/* Unified Action Button: Consulter la tâche */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (onOpen) onOpen(task);
          }}
          className={`h-[42px] px-5 rounded-DEFAULT transition-all flex items-center justify-center gap-2 shrink-0 font-semibold cursor-pointer border-2 shadow-xs ${
            isValidationTask
              ? 'bg-purple-100/80 text-purple-900 border-purple-300 hover:bg-purple-200 font-label-md text-xs sm:text-sm'
              : 'bg-surface-container-lowest border-primary-container text-primary-container font-label-md text-xs sm:text-sm hover:bg-sage-soft hover:border-primary'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">visibility</span>
          <span>Consulter la tâche</span>
        </button>
      </div>
    </article>
  );
}
