import React, { useMemo, useState } from 'react';

const DEFAULT_ASSOCIATES = [
  'Henri Jamet',
  'Joséphine Jamet',
  'Hortense Jamet',
  'Marguerite Jamet',
  'Eugénie Jamet',
  'Élisabeth Jamet',
];

const COMPLEXITY_WEIGHTS = {
  'négligeable': 1,
  'negligeable': 1,
  'faible': 2,
  'modérée': 3,
  'moderee': 3,
  'élevée': 5,
  'elevee': 5,
  'très élevée': 8,
  'tres elevee': 8,
  'critique': 8,
};

function getTaskPoints(t) {
  if (!t) return 3;
  if (t.charge_points !== undefined && t.charge_points !== null && !isNaN(Number(t.charge_points))) {
    return Number(t.charge_points);
  }
  const comp = String(t.complexity || '').toLowerCase().trim();
  return COMPLEXITY_WEIGHTS[comp] || 3;
}

function normalizeStatus(st) {
  const s = String(st || '').toUpperCase().trim();
  if (['EN_COURS', 'IN_PROGRESS', 'EN COURS'].includes(s)) return 'EN_COURS';
  if (['A_FAIRE', 'TODO', 'A FAIRE'].includes(s)) return 'A_FAIRE';
  if (['PROPOSED', 'PROPOSEE', 'PROPOSÉE'].includes(s)) return 'PROPOSED';
  if (['DONE', 'TERMINEE', 'TERMINÉE', 'COMPLETED', 'ARCHIVED'].includes(s)) return 'DONE';
  return s;
}

function isTaskAssignedToAssociate(task, associateName) {
  if (!task || !associateName) return false;
  const aNorm = associateName.toLowerCase().trim();
  const aClean = aNorm.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const checkMatch = (val) => {
    if (!val) return false;
    const vNorm = String(val).toLowerCase().trim();
    const vClean = vNorm.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return vClean === aClean || vClean.includes(aClean) || aClean.includes(vClean);
  };

  if (Array.isArray(task.assigned_members)) {
    if (task.assigned_members.some(checkMatch)) return true;
  } else if (typeof task.assigned_members === 'string' && task.assigned_members.startsWith('[')) {
    try {
      const arr = JSON.parse(task.assigned_members);
      if (Array.isArray(arr) && arr.some(checkMatch)) return true;
    } catch (_) {}
  }
  if (checkMatch(task.assignee)) return true;
  if (checkMatch(task.assignee_name)) return true;
  return false;
}

/**
 * Sélecteur d'attribution équitable réutilisable pour les tâches de la SCI.
 * Affiche la grille des associés triés par charge et équité, le badge Top 1,
 * les motifs de charge, le toggle auto-attribution, et optionnellement un bouton d'enregistrement direct.
 */
export default function TaskEquityAssignmentSelector({
  selectedMembers = [],
  onChangeMembers,
  autoAssign = false,
  onChangeAutoAssign,
  associates = DEFAULT_ASSOCIATES,
  allTasks = [],
  currentTaskId = null,
  recommendations = [],
  onSaveDirect = null,
  isSaving = false,
  readOnly = false,
  title = 'Attribution de la mission — Membres associés (triés par équité de charge) :',
  className = '',
}) {
  const [directSaveSuccess, setDirectSaveSuccess] = useState(false);
  const [directSaveError, setDirectSaveError] = useState('');

  // 1. Filtrage strict de Frédéric Jamet (exempté de corvées par équité financière)
  const eligibleAssociates = useMemo(() => {
    const list = Array.isArray(associates) && associates.length > 0 ? associates : DEFAULT_ASSOCIATES;
    return list.filter((name) => name && !/fr[eé]d[eé]ric/i.test(name));
  }, [associates]);

  // 2. Calcul des charges réelles de chaque associé
  const sortedAssociatesByEquity = useMemo(() => {
    const now = Date.now();
    const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;

    // Si des recommandations backend sont fournies et qu'il n'y a pas de allTasks transmis
    const recMap = new Map();
    if (Array.isArray(recommendations) && recommendations.length > 0) {
      recommendations.forEach((rec, idx) => {
        const rName = rec.name || rec.member_name || rec.prenom || '';
        if (rName) {
          recMap.set(rName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''), {
            rec,
            idx,
          });
        }
      });
    }

    const associatesData = eligibleAssociates.map((assocName) => {
      const cleanAssoc = assocName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const recInfo = recMap.get(cleanAssoc);

      let activeCount = 0;
      let activePoints = 0;
      const activeTitles = [];
      let historicalCount365d = 0;
      let historicalPoints365d = 0;

      if (Array.isArray(allTasks) && allTasks.length > 0) {
        allTasks.forEach((t) => {
          if (!t) return;
          if (currentTaskId && (t.id === currentTaskId || String(t.id) === String(currentTaskId))) {
            return; // On ne compte pas la tâche en cours d'attribution
          }

          if (isTaskAssignedToAssociate(t, assocName)) {
            const st = normalizeStatus(t.status);
            const pts = getTaskPoints(t);
            const title = String(t.title || 'Tâche').trim();

            if (['EN_COURS', 'A_FAIRE', 'PROPOSED'].includes(st)) {
              activeCount += 1;
              activePoints += pts;
              activeTitles.push(title);
            } else if (st === 'DONE') {
              const dStr = t.completed_at || t.updated_at || t.date || t.created_at;
              let isWithin365d = true;
              if (dStr) {
                const taskTime = new Date(dStr).getTime();
                if (!isNaN(taskTime) && taskTime < oneYearAgo) {
                  isWithin365d = false;
                }
              }
              if (isWithin365d) {
                historicalCount365d += 1;
                historicalPoints365d += pts;
              }
            }
          }
        });
      } else if (recInfo && recInfo.rec) {
        // Fallback sur les métriques du backend si allTasks n'est pas fourni
        const r = recInfo.rec;
        activeCount = r.active_tasks_count || (r.active_tasks ? r.active_tasks.length : 0);
        activePoints = r.active_charge_points || 0;
        if (r.active_tasks && Array.isArray(r.active_tasks)) {
          r.active_tasks.forEach((at) => activeTitles.push(at.title || 'Tâche'));
        }
        historicalCount365d = r.completed_tasks_count || 0;
        historicalPoints365d = r.completed_charge_points || 0;
      }

      // Construction du motif d'équité
      let reason = '';
      if (recInfo && recInfo.rec && recInfo.rec.reason) {
        reason = recInfo.rec.reason;
      } else if (activeCount === 0) {
        if (historicalPoints365d > 0) {
          reason = `aucune tâche en cours — historique 12 mois : ${historicalPoints365d} pts`;
        } else {
          reason = 'aucune tâche en cours (disponible)';
        }
      } else if (activeCount === 1) {
        const rawT = activeTitles[0] || 'tâche';
        const shortT = rawT.length <= 30 ? rawT : `${rawT.slice(0, 28).rstrip ? rawT.slice(0, 28).trim() : rawT.slice(0, 28)}…`;
        reason = `1 tâche en cours (${activePoints} pts) : ${shortT}`;
      } else {
        const snippet = activeTitles.slice(0, 2).join(', ');
        reason = `${activeCount} tâches en cours (${activePoints} pts) : ${snippet}${activeTitles.length > 2 ? '…' : ''}`;
      }

      return {
        name: assocName,
        activeCount,
        activePoints,
        historicalCount365d,
        historicalPoints365d,
        activeTitles,
        reason,
        recOrder: recInfo ? recInfo.idx : 99,
      };
    });

    // Tri selon les règles d'équité :
    // 1. Priorité de la recommandation backend si présente
    // 2. Charge active la plus faible (activePoints)
    // 3. Historique 12 mois le plus faible (historicalPoints365d)
    associatesData.sort((a, b) => {
      if (recMap.size > 0 && a.recOrder !== b.recOrder) {
        return a.recOrder - b.recOrder;
      }
      if (a.activePoints !== b.activePoints) {
        return a.activePoints - b.activePoints;
      }
      if (a.activeCount !== b.activeCount) {
        return a.activeCount - b.activeCount;
      }
      if (a.historicalPoints365d !== b.historicalPoints365d) {
        return a.historicalPoints365d - b.historicalPoints365d;
      }
      return a.name.localeCompare(b.name);
    });

    return associatesData;
  }, [eligibleAssociates, allTasks, currentTaskId, recommendations]);

  // Clic sur l'associé : bascule la sélection
  const handleToggleAssociate = (assocName) => {
    if (readOnly) return;
    const current = Array.isArray(selectedMembers) ? selectedMembers : [];
    let updated;

    if (current.includes(assocName)) {
      updated = current.filter((m) => m !== assocName);
    } else {
      updated = [...current, assocName];
    }

    if (typeof onChangeMembers === 'function') {
      onChangeMembers(updated);
    }
    // Choisir manuellement un associé désactive le mode auto-assign strict
    if (typeof onChangeAutoAssign === 'function') {
      onChangeAutoAssign(false);
    }
  };

  // Clic sur le bouton d'auto-attribution équitable
  const handleToggleAutoAssign = () => {
    if (readOnly) return;
    const nextVal = !autoAssign;
    if (typeof onChangeAutoAssign === 'function') {
      onChangeAutoAssign(nextVal);
    }
    if (nextVal && sortedAssociatesByEquity.length > 0) {
      const top1 = sortedAssociatesByEquity[0].name;
      if (typeof onChangeMembers === 'function') {
        onChangeMembers([top1]);
      }
    }
  };

  // Enregistrement direct (mode view)
  const handleDirectSave = async () => {
    if (typeof onSaveDirect !== 'function' || isSaving) return;
    setDirectSaveError('');
    setDirectSaveSuccess(false);
    try {
      await onSaveDirect(selectedMembers, autoAssign);
      setDirectSaveSuccess(true);
      setTimeout(() => setDirectSaveSuccess(false), 3000);
    } catch (err) {
      setDirectSaveError(err.message || "Erreur lors de l'enregistrement de l'attribution");
    }
  };

  const selectedCount = Array.isArray(selectedMembers) ? selectedMembers.length : 0;

  return (
    <div className={`p-3.5 bg-white/90 dark:bg-slate-900/80 rounded-xl border border-emerald-300 dark:border-emerald-700/60 text-xs space-y-3 ${className}`}>
      {/* Header avec switch Auto-attribution et compteur */}
      <div className="flex flex-wrap items-center justify-between gap-2 font-bold text-forest-deep dark:text-emerald-300">
        <span className="flex items-center gap-1.5">
          <span>⚖️</span>
          <span>{title}</span>
        </span>
        <div className="flex items-center gap-2">
          {/* Bouton / Switch Auto-attribution équitable */}
          <button
            type="button"
            disabled={readOnly}
            onClick={handleToggleAutoAssign}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all cursor-pointer border ${
              autoAssign
                ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-xs'
                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-amber-400'
            }`}
            title="Attribue automatiquement au membre ayant la charge la plus équitable"
          >
            <span className={`material-symbols-outlined text-[15px] ${autoAssign ? 'text-amber-700 animate-pulse' : 'text-slate-500'}`}>
              bolt
            </span>
            <span>Auto-attribution équitable</span>
          </button>

          <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 font-semibold border border-emerald-300">
            {selectedCount} sélectionné{selectedCount > 1 ? 's' : ''} sur {sortedAssociatesByEquity.length}
          </span>
        </div>
      </div>

      <p className="text-[11px] text-on-surface-variant leading-relaxed">
        Cochez un ou plusieurs associés en charge de cette mission. Les associés sont classés par priorité d'équité selon l'occupation et les corvées accomplies.
      </p>

      {/* Grille des associés triés par équité */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {sortedAssociatesByEquity.map((associate, idx) => {
          const isSelected = Array.isArray(selectedMembers) && selectedMembers.includes(associate.name);
          const isTop1 = idx === 0;

          return (
            <button
              key={`assoc-${associate.name}`}
              type="button"
              disabled={readOnly}
              onClick={() => handleToggleAssociate(associate.name)}
              className={`p-2.5 rounded-xl border text-left flex items-center justify-between gap-2.5 transition-all select-none ${
                readOnly ? 'cursor-default' : 'cursor-pointer'
              } ${
                isSelected
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500 shadow-xs ring-1 ring-emerald-500/30'
                  : 'bg-canvas-slate/60 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {/* Checkbox stylée */}
                <div
                  className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${
                    isSelected
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'border-slate-400 bg-white dark:bg-slate-800'
                  }`}
                >
                  {isSelected && (
                    <span className="material-symbols-outlined text-[14px]">check</span>
                  )}
                </div>

                <div className="min-w-0 flex flex-col flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 font-bold ${
                        isTop1
                          ? 'bg-emerald-700 text-white'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <span className="font-semibold text-on-surface dark:text-slate-100 truncate text-xs">
                      {associate.name}
                    </span>
                  </div>
                  {associate.reason && (
                    <span className="text-[10px] text-on-surface-variant truncate pl-5" title={associate.reason}>
                      {associate.reason}
                    </span>
                  )}
                </div>
              </div>

              {isTop1 && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 shrink-0">
                  Top 1
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Message de statut d'attribution */}
      {selectedCount === 0 ? (
        <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">warning</span>
          <span>Veuillez sélectionner au moins un membre associé pour cette tâche.</span>
        </p>
      ) : (
        <p className="text-[11px] text-emerald-900/90 dark:text-emerald-300/90">
          ℹ️ La tâche sera assignée à : <strong>{selectedMembers.join(', ')}</strong>.
        </p>
      )}

      {/* Action optionnelle d'enregistrement direct (mode view) */}
      {typeof onSaveDirect === 'function' && (
        <div className="pt-2 border-t border-emerald-200 dark:border-emerald-800/60 flex flex-wrap items-center justify-between gap-2">
          <div>
            {directSaveSuccess && (
              <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1 animate-in fade-in">
                <span className="material-symbols-outlined text-[15px]">check_circle</span>
                Attribution enregistrée avec succès !
              </span>
            )}
            {directSaveError && (
              <span className="text-[11px] font-bold text-rose-600 flex items-center gap-1">
                <span className="material-symbols-outlined text-[15px]">error</span>
                {directSaveError}
              </span>
            )}
          </div>
          <button
            type="button"
            disabled={isSaving || selectedCount === 0}
            onClick={handleDirectSave}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs shadow-xs transition-all cursor-pointer active:scale-95"
          >
            {isSaving ? (
              <>
                <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                <span>Enregistrement...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[16px]">save</span>
                <span>Enregistrer l'attribution</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
