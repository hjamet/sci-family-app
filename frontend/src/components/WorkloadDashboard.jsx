import React, { useState, useEffect, useMemo } from 'react';
import {
  Gauge,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Trophy,
  TrendingUp,
  Calendar,
  Sparkles,
  Info,
  Award,
  CheckSquare
} from 'lucide-react';
import TaskDetailModal from './TaskDetailModal';
import { fetchTasks, fetchReservations } from '../api';
import { resolveUserMeta, isTaskAssignedToUser } from '../utils/taskAssignment';
import ErrorBoundary from './common/ErrorBoundary';

const ALL_7_MEMBERS = [
  { id: 1, prenom: 'Henri', fullName: 'Henri Jamet', role: 'Coordinateur Général (Chauffage, CCA)', color: 'from-cyan-500 to-blue-600', badgeColor: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  { id: 2, prenom: 'Hortense', fullName: 'Hortense Jamet', role: 'Responsable Espaces Verts (Jardin, Starlink)', color: 'from-rose-500 to-pink-600', badgeColor: 'bg-rose-50 text-rose-700 border-rose-200' },
  { id: 3, prenom: 'Marguerite', fullName: 'Marguerite Jamet', role: 'Responsable Équipements (Buanderie)', color: 'from-purple-500 to-indigo-600', badgeColor: 'bg-purple-50 text-purple-700 border-purple-200' },
  { id: 4, prenom: 'Eugénie', fullName: 'Eugénie Jamet', role: 'Responsable Peintures & Tri Sélectif', color: 'from-amber-500 to-orange-600', badgeColor: 'bg-amber-50 text-amber-700 border-amber-200' },
  { id: 5, prenom: 'Joséphine', fullName: 'Joséphine Jamet', role: 'Coordinatrice Adjointe (Clés, Boîtier)', color: 'from-emerald-500 to-teal-600', badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { id: 6, prenom: 'Élisabeth', aliases: ['Maman', 'Elisabeth'], fullName: 'Maman (Élisabeth) Jamet', role: 'Membre Associé', color: 'from-teal-500 to-emerald-600', badgeColor: 'bg-teal-50 text-teal-700 border-teal-200' },
  { id: 7, prenom: 'Frédéric', fullName: 'Frédéric Jamet', role: 'Responsable Électricité & Linky Tempo', color: 'from-blue-500 to-indigo-600', badgeColor: 'bg-blue-50 text-blue-700 border-blue-200' },
];

function isTaskCompleted(task) {
  if (!task) return false;
  const raw = (task.status || '').trim().toUpperCase();
  const normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_\s-]+/g, '_');
  const completedStatuses = [
    'TERMINE',
    'TERMINEE',
    'VALIDE',
    'VALIDEE',
    'CLOS',
    'CLOTURE',
    'CLOTUREE',
    'COMPLETED',
    'ARCHIVEE',
    'ARCHIVE',
  ];
  return completedStatuses.includes(normalized);
}

const PERIOD_OPTIONS = [
  { id: 'all', label: 'Tout' },
  { id: '1_year', label: 'Dernière année' },
  { id: '3_months', label: 'Derniers 3 mois' },
];

function WorkloadDashboardInner({ currentUser, period: propPeriod = 'all' }) {
  const [realTasks, setRealTasks] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState(propPeriod);

  const selectedPeriodOption = PERIOD_OPTIONS.find((opt) => opt.id === selectedPeriod) || PERIOD_OPTIONS[0];
  const selectedPeriodLabel = selectedPeriodOption.label;

  // Synchronisation avec la prop period si elle change
  useEffect(() => {
    if (propPeriod) {
      setSelectedPeriod(propPeriod);
    }
  }, [propPeriod]);

  const loadData = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);

      const [tasksRes, resDataRes] = await Promise.allSettled([
        fetchTasks(),
        fetchReservations(),
      ]);

      if (tasksRes.status === 'fulfilled' && Array.isArray(tasksRes.value)) {
        setRealTasks(tasksRes.value);
      } else if (tasksRes.status === 'rejected') {
        throw tasksRes.reason || new Error('Erreur de chargement des tâches');
      }

      if (resDataRes.status === 'fulfilled' && Array.isArray(resDataRes.value)) {
        setReservations(resDataRes.value);
      }
    } catch (err) {
      console.error('Workload API error:', err);
      setErrorMsg(err.message || String(err) || 'Impossible de charger les données statistiques');
      setRealTasks([]);
      setReservations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Calcul dynamique 100% réel des scores et du ratio gamifié d'implication selon la période sélectionnée
  const processedMembers = useMemo(() => {
    const daysByMember = {};
    ALL_7_MEMBERS.forEach((m) => {
      daysByMember[m.prenom] = 0;
    });

    const now = new Date();
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const filteredRes = (reservations || []).filter((r) => {
      const st = (r.status || '').toLowerCase();
      if (!['confirmée', 'confirmee', 'demande en attente'].includes(st)) {
        return false;
      }
      if (!r.start_date) return false;
      if (selectedPeriod === 'all') return true;
      const startDate = new Date(r.start_date);
      const endDate = r.end_date ? new Date(r.end_date) : startDate;
      if (selectedPeriod === '1_year') return endDate >= oneYearAgo;
      if (selectedPeriod === '3_months') return endDate >= threeMonthsAgo;
      return true;
    });

    filteredRes.forEach((r) => {
      const d1 = new Date(r.start_date);
      const d2 = new Date(r.end_date || r.start_date);
      const diffDays = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1);
      const rUser = (r.user_name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      ALL_7_MEMBERS.forEach((m) => {
        const pNorm = m.prenom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (rUser.includes(pNorm) || (m.aliases && m.aliases.some((al) => rUser.includes(al.toLowerCase())))) {
          daysByMember[m.prenom] += diffDays;
        }
      });
    });

    const list = ALL_7_MEMBERS.map((member) => {
      const userMeta = resolveUserMeta({
        id: member.id,
        prenom: member.prenom,
        name: member.fullName,
      });

      // Tâches réelles associées
      const memberTasks = realTasks.filter((t) => isTaskAssignedToUser(t, userMeta));

      // Tâches réelles complétées / validées
      const completedTasks = memberTasks.filter((t) => isTaskCompleted(t));

      // 1. Score d'utilisation / occupation (jours réels passés au domaine)
      const score_usage = daysByMember[member.prenom] || 0;

      // 2. Score de missions / tâches accomplies (tâches validées)
      const score_taches = completedTasks.length;

      // 3. Algorithme d'équilibre participatif :
      // ratio = (score_taches + 0.5) / (score_usage + 0.5)
      // Robustesse sans division par zéro.
      const ratio = (score_taches + 0.5) / (score_usage + 0.5);

      return {
        ...member,
        score_usage,
        score_taches,
        ratio,
        memberTasks,
        completedTasks,
      };
    });

    // Détection d'égalité globale des scores et ratios
    const allEqual = list.length > 0 && list.every(
      (m) => Math.abs(m.ratio - list[0].ratio) < 0.001 &&
             m.score_taches === list[0].score_taches &&
             m.score_usage === list[0].score_usage
    );

    if (allEqual) {
      // En cas d'égalité totale : ordre alphabétique neutre, aucun classement arbitraire
      list.sort((a, b) => a.prenom.localeCompare(b.prenom));
    } else {
      // Tri décroissant selon le ratio d'implication
      list.sort((a, b) => {
        if (Math.abs(b.ratio - a.ratio) > 0.001) {
          return b.ratio - a.ratio;
        }
        if (b.score_taches !== a.score_taches) {
          return b.score_taches - a.score_taches;
        }
        if (a.score_usage !== b.score_usage) {
          return a.score_usage - b.score_usage;
        }
        return a.prenom.localeCompare(b.prenom);
      });
    }

    return list;
  }, [selectedPeriod, reservations, realTasks]);

  // Échelles max pour les barres de progression
  const maxUsage = useMemo(() => {
    const max = Math.max(...processedMembers.map((m) => m.score_usage), 0);
    return max > 0 ? max : 14;
  }, [processedMembers]);

  const maxTasks = useMemo(() => {
    const max = Math.max(...processedMembers.map((m) => m.score_taches), 0);
    return max > 0 ? max : 5;
  }, [processedMembers]);

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-200">
            <Trophy className="h-6 w-6 text-amber-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-extrabold text-slate-900">
                Équilibre d'Implication &amp; Double Jauge (7 Associés)
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              Indicateur d'engagement : équilibre des missions accomplies et de la présence au domaine
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* Période moderne (Annotation 9) */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSelectedPeriod(opt.id)}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  selectedPeriod === opt.id
                    ? 'bg-white text-indigo-700 font-black shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            onClick={loadData}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition shrink-0 cursor-pointer"
            title="Rafraîchir les jauges et le classement"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Actualiser</span>
          </button>
        </div>
      </div>

      {/* Explanatory Rule Banner */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-amber-50/80 via-indigo-50/50 to-emerald-50/80 border border-amber-200/70 text-slate-700 text-xs flex items-start gap-3 shadow-2xs">
        <Sparkles className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong className="text-slate-900 font-bold">Équilibre de participation :</strong>{' '}
          Cet indicateur met en regard le nombre de missions réalisées et le temps passé au domaine :{' '}
          <code className="px-1.5 py-0.5 bg-white/90 border border-slate-200 rounded font-mono font-bold text-indigo-700">
            (missions validées + 0.5) / (séjours + 0.5)
          </code>
          . Il permet de valoriser les contributions de chacun dans un esprit d'entraide familiale.
        </div>
      </div>

      {/* Prominent Red Alert Card on API Failure */}
      {errorMsg ? (
        <div className="p-6 rounded-3xl bg-rose-50 border-2 border-rose-500 text-rose-900 shadow-md animate-in fade-in duration-200">
          <div className="flex items-start space-x-4">
            <div className="p-3 bg-rose-600 text-white rounded-2xl shrink-0">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-black text-rose-950 flex items-center gap-2">
                <span>⚠️ Erreur de lecture des statistiques en base</span>
              </h3>
              <p className="text-xs text-rose-700 font-bold mt-1">
                Échec de connexion ou de calcul des réservations / tâches réelles. Zéro donnée factice inventée.
              </p>
              <div className="mt-3 p-3 bg-rose-100/90 border border-rose-300 rounded-xl font-mono text-xs text-rose-950 break-all">
                <strong>Raw error trace :</strong> {errorMsg}
              </div>
              <div className="mt-4 flex items-center space-x-3">
                <button
                  onClick={loadData}
                  disabled={loading}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl shadow transition flex items-center space-x-2 cursor-pointer"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  <span>Réessayer la synchronisation</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Members List sorted descending by implication ratio */}
          <div className="space-y-4 pt-1">
            {(() => {
              const allEqual = processedMembers.length > 0 && processedMembers.every(
                (m) => Math.abs(m.ratio - processedMembers[0].ratio) < 0.001 &&
                       m.score_taches === processedMembers[0].score_taches &&
                       m.score_usage === processedMembers[0].score_usage
              );

              return processedMembers.map((member, index) => {
                const isFirst = !allEqual && index === 0;
                const isSecond = !allEqual && index === 1;
                const isThird = !allEqual && index === 2;

                const medal = allEqual ? null : isFirst ? '🥇' : isSecond ? '🥈' : isThird ? '🥉' : null;
                const rankLabel = allEqual
                  ? 'Ex-æquo'
                  : isFirst
                  ? '#1 Premier contributeur'
                  : isSecond
                  ? '#2'
                  : isThird
                  ? '#3'
                  : `#${index + 1}`;

                const pctUsage = member.score_usage > 0
                  ? Math.min(100, Math.round((member.score_usage / maxUsage) * 100))
                  : 0;

                const pctTasks = member.score_taches > 0
                  ? Math.min(100, Math.round((member.score_taches / maxTasks) * 100))
                  : 0;

                return (
                  <div
                    key={member.prenom}
                    className={`p-4 sm:p-5 rounded-2xl border transition-all shadow-xs ${
                      isFirst
                        ? 'bg-gradient-to-r from-amber-50/70 via-white to-amber-50/30 border-amber-300 ring-2 ring-amber-400/20 shadow-sm'
                        : 'bg-slate-50/80 border-slate-200/80 hover:border-indigo-300'
                    }`}
                  >
                    {/* Member Card Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/60">
                      <div className="flex items-center space-x-3">
                        <div className="relative shrink-0">
                          <div
                            className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${member.color} text-white flex items-center justify-center font-black text-sm shadow-sm`}
                          >
                            {member.prenom[0]}
                          </div>
                          {medal && (
                            <span
                              className="absolute -top-1.5 -right-1.5 text-base drop-shadow-xs"
                              title={`Podium ${rankLabel}`}
                            >
                              {medal}
                            </span>
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-extrabold text-slate-900">{member.fullName}</h4>
                            <span
                              className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                                isFirst
                                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                                  : 'bg-slate-200 text-slate-700 border-slate-300'
                              }`}
                            >
                              {rankLabel}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 font-medium">
                            {member.role}
                          </p>
                        </div>
                      </div>

                      {/* Implication Ratio Badge */}
                      <div className="flex items-center gap-2 self-start sm:self-auto">
                        <div className="text-right">
                          <div className="flex items-center gap-1.5 justify-end">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                              Ratio d'implication :
                            </span>
                            <span
                              className={`text-sm sm:text-base font-black px-2 py-0.5 rounded-xl border ${
                                member.ratio >= 2.0
                                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                  : member.ratio >= 1.0
                                  ? 'bg-indigo-100 text-indigo-900 border-indigo-300'
                                  : 'bg-slate-100 text-slate-800 border-slate-200'
                              }`}
                              title={`Formule: (${member.score_taches} + 0.5) / (${member.score_usage} + 0.5)`}
                            >
                              {member.ratio.toFixed(2)}
                            </span>
                          </div>
                          {isFirst && (
                            <span className="text-[10px] font-extrabold text-amber-700 block">
                              ✨ Première contribution
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                  {/* DOUBLE BARRES DISTINCTES ET ÉLÉGANTES (Annotation 10) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3">
                    {/* BARRE 1 : SCORE D'UTILISATION / OCCUPATION */}
                    <div className="p-3 bg-white rounded-xl border border-slate-200/80 space-y-1.5 shadow-2xs">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-600 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                          <span>1. Score d'occupation :</span>
                        </span>
                        <span className="font-black text-indigo-950 font-mono">
                          {member.score_usage} {member.score_usage > 1 ? 'jours' : 'jour'}
                        </span>
                      </div>

                      <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden shadow-inner">
                        <div
                          style={{ width: `${pctUsage}%` }}
                          className="h-full bg-gradient-to-r from-indigo-500 to-blue-600 transition-all duration-500 rounded-full"
                          title={`${member.score_usage} jours d'occupation (${pctUsage}% du max)`}
                        ></div>
                      </div>

                      <div className="flex justify-between items-center text-[10px] text-slate-400">
                        <span>Présence au domaine ({selectedPeriodLabel})</span>
                        <span>{pctUsage}% relative</span>
                      </div>
                    </div>

                    {/* BARRE 2 : SCORE DE CORVÉES / TÂCHES ACCOMPLIES */}
                    <div className="p-3 bg-white rounded-xl border border-slate-200/80 space-y-1.5 shadow-2xs">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-600 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>2. Score de tâches accomplies :</span>
                        </span>
                        <span className="font-black text-emerald-900 font-mono">
                          {member.score_taches} {member.score_taches > 1 ? 'tâches validées' : 'tâche validée'}
                        </span>
                      </div>

                      <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden shadow-inner">
                        <div
                          style={{ width: `${pctTasks}%` }}
                          className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500 rounded-full"
                          title={`${member.score_taches} tâches validées (${pctTasks}% du max)`}
                        ></div>
                      </div>

                      <div className="flex justify-between items-center text-[10px] text-slate-400">
                        <span>Missions validées &amp; clôturées</span>
                        <span>{pctTasks}% relative</span>
                      </div>
                    </div>
                  </div>

                  {/* Clickable Real Task Badges per Member */}
                  <div className="pt-3 mt-1 border-t border-slate-200/60 flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mr-1 shrink-0">
                      <CheckSquare className="w-3 h-3 text-indigo-600" />
                      Missions assignées ({member.memberTasks.length}) :
                    </span>
                    {member.memberTasks.length === 0 ? (
                      <span className="text-[11px] text-slate-400 italic">
                        Aucune mission active assignée
                      </span>
                    ) : (
                      member.memberTasks.map((task) => {
                        const completed = isTaskCompleted(task);
                        return (
                          <button
                            key={task.id}
                            type="button"
                            onClick={() => setSelectedTask(task)}
                            className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all shadow-2xs cursor-pointer hover:scale-[1.02] ${
                              completed
                                ? 'bg-emerald-50/80 text-emerald-950 border-emerald-200 hover:border-emerald-400'
                                : task.status === 'EN_VOTE'
                                ? 'bg-amber-50 text-amber-950 border-amber-200 hover:border-amber-400'
                                : 'bg-white text-indigo-950 border-slate-200 hover:border-indigo-300'
                            }`}
                            title={`Cliquer pour afficher la fiche détaillée (${task.status})`}
                          >
                            <span
                              className={`w-2 h-2 rounded-full ${
                                completed
                                  ? 'bg-emerald-500'
                                  : task.status === 'EN_VOTE'
                                  ? 'bg-amber-500 animate-pulse'
                                  : 'bg-indigo-500'
                              }`}
                            ></span>
                            <span className="truncate max-w-[220px]">📋 {task.title}</span>
                            {completed && (
                              <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded">
                                Validée
                              </span>
                            )}
                            {task.budget > 0 && (
                              <span className="text-[9px] font-mono font-bold bg-indigo-100 text-indigo-800 px-1.5 py-0.2 rounded-md">
                                {task.budget}€
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            });
          })()}
          </div>
        </>
      )}

      {/* Unique Standard TaskDetailModal (DRY Radical) */}
      {selectedTask && (
        <TaskDetailModal
          isOpen={Boolean(selectedTask)}
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          currentUser={currentUser || 'Henri Jamet'}
          onTaskUpdated={loadData}
        />
      )}
    </div>
  );
}

export default function WorkloadDashboard(props) {
  return (
    <ErrorBoundary
      title="Jauge d'Implication & Double Barre indisponible"
      description="Une anomalie s'est produite lors de l'évaluation des statistiques d'équité. L'affichage du reste de la page reste opérationnel."
    >
      <WorkloadDashboardInner {...props} />
    </ErrorBoundary>
  );
}
