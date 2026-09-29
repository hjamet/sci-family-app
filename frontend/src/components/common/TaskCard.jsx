import React, { useState } from 'react';
import {
  isTaskPendingValidation,
  isTaskProposed,
  getTaskColorCategory,
  getTaskStatusMeta,
  isTaskAssignedToUser,
} from '../../utils/taskAssignment';


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
  onAccept,
  onReject,
  className = '',
}) {
  if (!task) return null;

  // Labels canoniques stricts du cycle de vie (Annotation 4) :
  // - PROPOSED ➔ « En attente de validation » (Orange ambre)
  // - TODO / EN_COURS ➔ « En cours » (Bleu)
  // - PENDING_VALIDATION ➔ « En attente d'archivage » (Vert émeraude)
  // - DONE ➔ « Archivée » (Gris sobre)
  const statusMeta = getTaskStatusMeta(task);
  const isProposed = statusMeta.status === 'PROPOSED';
  const isValidationTask = statusMeta.status === 'PENDING_VALIDATION';
  const isDone = statusMeta.status === 'DONE';
  const isInProgress = statusMeta.status === 'EN_COURS';

  const isCoordinator = Boolean(
    currentUser?.is_coordinator === true ||
    currentUser?.is_coordinator === 'true' ||
    currentUser?.is_coordinator === 1 ||
    (typeof currentUser === 'object' && (currentUser?.prenom?.toLowerCase() === 'henri' || currentUser?.prenom?.toLowerCase() === 'josephine' || currentUser?.prenom?.toLowerCase() === 'joséphine')) ||
    (typeof currentUser === 'string' && (currentUser.toLowerCase().includes('henri') || currentUser.toLowerCase().includes('josephine') || currentUser.toLowerCase().includes('joséphine')))
  );

  const isAssigned = isTaskAssignedToUser(task, currentUser);

  // Détermination du bouton d'action contextuel unique (Annotation 16)
  let actionButtonLabel = 'Consulter la tâche';
  let actionButtonIcon = 'visibility';
  let actionButtonClass = 'bg-surface-container-lowest border-sky-300 text-sky-900 hover:bg-sky-50 text-xs sm:text-sm';

  if (isCoordinator && isProposed) {
    actionButtonLabel = 'Arbitrer la création';
    actionButtonIcon = 'gavel';
    actionButtonClass = 'bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300 text-xs sm:text-sm font-bold';
  } else if (isAssigned && isInProgress) {
    actionButtonLabel = 'Marquer comme complétée';
    actionButtonIcon = 'check_circle';
    actionButtonClass = 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 text-xs sm:text-sm font-bold shadow-xs';
  } else if (isCoordinator && isValidationTask) {
    actionButtonLabel = 'Arbitrer la complétion';
    actionButtonIcon = 'verified';
    actionButtonClass = 'bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border-emerald-300 text-xs sm:text-sm font-bold';
  } else if (isProposed) {
    actionButtonClass = 'bg-amber-100/80 text-amber-900 border-amber-300 hover:bg-amber-200 text-xs sm:text-sm font-semibold';
  } else if (isValidationTask) {
    actionButtonClass = 'bg-emerald-100/80 text-emerald-900 border-emerald-300 hover:bg-emerald-200 text-xs sm:text-sm font-semibold';
  }

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

  // Resolve assignee name & initials (Annotation 3 : Pas d'auto-attribution au créateur)
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
    assigneeName = 'Non assignée';
  }

  const isUnassigned = !assigneeName || assigneeName === 'Non assignée';
  const displayAssigneeName = isProposed
    ? (task.created_by ? `Proposée par ${task.created_by}` : (isUnassigned ? 'En attente de désignation' : assigneeName))
    : assigneeName;

  const initials = isUnassigned
    ? '--'
    : (displayAssigneeName
        .split(' ')
        .filter(Boolean)
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase() || 'SCI');

  // Calcul d'avancement opérationnel strictement basé sur la checklist / subtasks
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
        isProposed
          ? 'bg-amber-50/70 dark:bg-amber-950/30 border-2 border-amber-300 dark:border-amber-700/60 hover:border-amber-400'
          : isValidationTask
          ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-2 border-emerald-300 dark:border-emerald-700/60 hover:border-emerald-400'
          : 'bg-surface-container-lowest border-2 border-slate-200/90 dark:border-slate-800 hover:border-sky-300 dark:hover:border-sky-700'
      } ${className}`}
    >
      <div>
        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-space-xs mb-3">
          {/* Badge Trichromatique Principal avec Labels Canoniques Stricts (Annotation 4) */}
          {statusMeta.status === 'PROPOSED' ? (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200 border border-amber-300 flex items-center gap-1">
              <span className="material-symbols-outlined text-[15px]">pending</span>
              En attente de validation
            </span>
          ) : statusMeta.status === 'PENDING_VALIDATION' ? (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200 border border-emerald-300 flex items-center gap-1">
              <span className="material-symbols-outlined text-[15px]">verified</span>
              En attente d'archivage
            </span>
          ) : statusMeta.status === 'DONE' ? (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 flex items-center gap-1">
              <span className="material-symbols-outlined text-[15px]">archive</span>
              Archivée
            </span>
          ) : (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200 border border-sky-200 flex items-center gap-1">
              <span className="material-symbols-outlined text-[15px]">play_circle</span>
              En cours
            </span>
          )}

          {/* Priority Badge */}
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-label-sm text-label-sm font-semibold ${
              isCritical
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
                isCritical
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
              isProposed
                ? 'text-amber-950 dark:text-amber-100 group-hover:text-amber-700'
                : isValidationTask
                ? 'text-emerald-950 dark:text-emerald-100 group-hover:text-emerald-700'
                : 'text-forest-deep group-hover:text-sky-700 dark:text-slate-100'
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

        {/* Progress Box (Uniquement si la tâche a des sous-tâches/checklist) */}
        {hasChecklist && (
          <div className="p-space-xs px-3 bg-surface-container-low rounded-DEFAULT mb-space-md border border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5 text-label-sm font-semibold text-forest-deep text-xs">
                <span className="material-symbols-outlined text-[18px] text-primary">
                  {task.step_icon || 'checklist'}
                </span>
                <span>{task.step_label || 'Avancement opérationnel'}</span>
              </div>
              <span
                className={`font-label-sm font-bold px-2 py-0.5 rounded-full text-xs ${
                  isProposed
                    ? 'text-amber-900 bg-amber-100 dark:bg-amber-900/50 dark:text-amber-200'
                    : isValidationTask
                    ? 'text-emerald-800 bg-emerald-100 dark:bg-emerald-900/50 dark:text-emerald-200'
                    : isCritical
                    ? 'text-error bg-error-container/40'
                    : isHigh
                    ? 'text-amber-rich bg-amber-soft'
                    : 'text-sky-800 bg-sky-100 dark:bg-sky-900/50 dark:text-sky-200'
                }`}
              >
                {progressPct}%
              </span>
            </div>

            <div className="w-full h-2 bg-surface-container-high rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 progress-shimmer ${
                  isProposed
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500'
                    : isValidationTask
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-600'
                    : isCritical
                    ? 'bg-gradient-to-r from-red-500 to-rose-600'
                    : isHigh
                    ? 'bg-gradient-to-r from-amber-500 to-emerald-600'
                    : 'bg-gradient-to-r from-sky-500 to-blue-600'
                }`}
                style={{ width: `${progressPct}%` }}
              ></div>
            </div>
          </div>
        )}
      </div>

      {/* Card Footer: Assignee & Action Buttons */}
      <div
        className={`pt-space-sm flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm border-t ${
          isProposed
            ? 'border-amber-200 dark:border-amber-800/60'
            : isValidationTask
            ? 'border-emerald-200 dark:border-emerald-800/60'
            : 'border-slate-100 dark:border-slate-800'
        }`}
      >
        <div className="flex items-center gap-2">
          <div className="flex -space-x-2 overflow-hidden">
            <div
              className={`w-8 h-8 rounded-full ${
                isProposed
                  ? 'bg-amber-600 text-white'
                  : isValidationTask
                  ? 'bg-emerald-700 text-white'
                  : 'bg-sky-700 text-white'
              } font-bold text-xs flex items-center justify-center ring-2 ring-surface-container-lowest`}
              title={displayAssigneeName}
            >
              {initials}
            </div>
          </div>
          <div className="flex flex-col">
            <span className="font-label-sm text-label-sm text-on-surface font-semibold leading-tight">
              {isProposed
                ? (task.created_by ? `Proposée par : ${task.created_by}` : (isUnassigned ? 'Non assignée' : assigneeName))
                : isValidationTask
                ? (task.created_by ? `Réalisée par : ${assigneeName || task.created_by}` : (isUnassigned ? 'Non assignée' : assigneeName))
                : (isUnassigned ? 'Non assignée' : assigneeName)}
            </span>
            <span className="text-[12px] text-on-surface-variant leading-tight">
              {isProposed
                ? 'En attente de validation'
                : isValidationTask
                ? "En attente d'archivage"
                : isDone
                ? 'Archivée'
                : task.role_label || (isUnassigned ? 'En attente de désignation' : 'Responsable de mission')}
            </span>
          </div>
        </div>

        {/* Bouton unique d'ouverture de modal avec libellé dynamique (Annotation 16) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (onOpen) onOpen(task);
          }}
          className={`h-[40px] px-4 rounded-DEFAULT transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer border-2 shadow-xs ${actionButtonClass}`}
        >
          <span className="material-symbols-outlined text-[18px]">{actionButtonIcon}</span>
          <span>{actionButtonLabel}</span>
        </button>
      </div>
    </article>
  );
}
