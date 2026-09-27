import React, { useState, useEffect } from 'react';
import { Gauge, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import TaskDetailModal from './TaskDetailModal';
import { fetchTasks } from '../api';

const ALL_7_MEMBERS = [
  { prenom: 'Henri', color: 'from-cyan-500 to-blue-600', border: 'border-cyan-500' },
  { prenom: 'Hortense', color: 'from-rose-500 to-pink-600', border: 'border-rose-500' },
  { prenom: 'Marguerite', color: 'from-purple-500 to-indigo-600', border: 'border-purple-500' },
  { prenom: 'Eugénie', color: 'from-amber-500 to-orange-600', border: 'border-amber-500' },
  { prenom: 'Joséphine', color: 'from-emerald-500 to-teal-600', border: 'border-emerald-500' },
  { prenom: 'Élisabeth', color: 'from-teal-500 to-emerald-600', border: 'border-teal-500' },
  { prenom: 'Frédéric', color: 'from-blue-500 to-indigo-600', border: 'border-blue-500' },
];

export default function WorkloadDashboard({ currentUser }) {
  const [workloadData, setWorkloadData] = useState(null);
  const [realTasks, setRealTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [totalChargePoints, setTotalChargePoints] = useState(100);
  const [selectedTask, setSelectedTask] = useState(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const [workloadRes, tasksRes] = await Promise.allSettled([
        fetch(`/api/workload/summary?total_charge_points=${totalChargePoints}`),
        fetchTasks(),
      ]);

      if (workloadRes.status === 'fulfilled' && workloadRes.value.ok) {
        const data = await workloadRes.value.json();
        setWorkloadData(data);
      } else if (workloadRes.status === 'fulfilled') {
        throw new Error(`HTTP ${workloadRes.value.status}: ${workloadRes.value.statusText || 'Échec de réponse serveur'}`);
      } else {
        throw workloadRes.reason || new Error('Erreur de chargement de la charge');
      }

      if (tasksRes.status === 'fulfilled' && Array.isArray(tasksRes.value)) {
        setRealTasks(tasksRes.value);
      }
    } catch (err) {
      console.error('Workload API error:', err);
      setErrorMsg(err.message || String(err) || 'Impossible de charger la jauge de charge');
      setWorkloadData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [totalChargePoints]);

  const statsMap = {};
  if (workloadData && workloadData.user_stats) {
    workloadData.user_stats.forEach((st) => {
      statsMap[st.user_name] = st;
    });
  }

  const getMemberTasks = (prenom) => {
    const pLower = prenom.toLowerCase();
    return realTasks.filter((t) => {
      if (!t) return false;
      const members = Array.isArray(t.assigned_members)
        ? t.assigned_members
        : (typeof t.assigned_members === 'string' && t.assigned_members.trim()
          ? (() => {
              try {
                const parsed = JSON.parse(t.assigned_members);
                return Array.isArray(parsed) ? parsed : [t.assigned_members];
              } catch (_) {
                return [t.assigned_members];
              }
            })()
          : []);

      const inAssigned = members.some((m) => String(m).toLowerCase().includes(pLower));
      const inResp = String(t.responsible || '').toLowerCase().includes(pLower);
      const inAssignedTo = String(t.assigned_to || '').toLowerCase().includes(pLower);
      const inCreatedBy = String(t.created_by || '').toLowerCase().includes(pLower);

      return inAssigned || inResp || inAssignedTo || inCreatedBy;
    });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-200">
            <Gauge className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">Jauge de Répartition des Charges (7 Associés)</h2>
            <p className="text-xs text-slate-500">Usage Proportionnel &amp; Répartition SCI • Missions réelles issues de la base</p>
          </div>
        </div>

        <button
          onClick={loadData}
          className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition shrink-0 cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Actualiser les jauges</span>
        </button>
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
                <span>⚠️ Erreur de lecture capteur / API</span>
              </h3>
              <p className="text-xs text-rose-700 font-bold mt-1">
                Échec de connexion à l'API de charge d'occupation. Aucun masquage silencieux.
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
                  <span>Enquêter / Réessayer</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Gauges & Clickable Task Badges for the 7 Members */}
          <div className="space-y-4 pt-2">
            {ALL_7_MEMBERS.map((member) => {
              const st = statsMap[member.prenom] || { total_days: 0, occupation_score: 0, target_charge_points: 0, charge_percentage: 0 };
              const pct = Math.min(100, Math.max(0, st.charge_percentage || 0));
              const memberTasks = getMemberTasks(member.prenom);

              return (
                <div
                  key={member.prenom}
                  className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3 transition hover:border-indigo-300 shadow-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${member.color} text-white flex items-center justify-center font-black text-sm shadow-sm shrink-0`}>
                        {member.prenom[0]}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h4 className="text-sm font-extrabold text-slate-900">{member.prenom}</h4>
                        </div>
                        <span className="text-[11px] text-slate-500">
                          {st.total_days} jour(s) d'occupation • Score d'usage : <strong className="text-slate-800">{st.occupation_score} pts</strong>
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-black text-indigo-600 block">
                        {st.target_charge_points} pts / 100
                      </span>
                      <span className="text-[10px] font-bold text-slate-500">
                        {pct}% de la charge SCI
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar / Gauge */}
                  <div className="w-full h-3 rounded-full bg-slate-200 overflow-hidden flex shadow-inner">
                    <div
                      style={{ width: `${pct}%` }}
                      className={`h-full bg-gradient-to-r ${member.color} transition-all duration-500 rounded-full`}
                    ></div>
                  </div>

                  {/* Clickable Real Task Badges per Member */}
                  <div className="pt-2 border-t border-slate-200/60 flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mr-1 shrink-0">
                      <CheckCircle2 className="w-3 h-3 text-indigo-600" />
                      Missions ({memberTasks.length}) :
                    </span>
                    {memberTasks.length === 0 ? (
                      <span className="text-[11px] text-slate-400 italic">
                        Aucune mission active assignée
                      </span>
                    ) : (
                      memberTasks.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => setSelectedTask(task)}
                          className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-white hover:bg-indigo-50 text-indigo-950 border border-slate-200 hover:border-indigo-300 transition-all shadow-xs cursor-pointer hover:scale-[1.02]"
                          title="Cliquer pour afficher la fiche détaillée"
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              task.status === 'EN_VOTE'
                                ? 'bg-amber-500 animate-pulse'
                                : ['VALIDE', 'CLOS', 'TERMINE'].includes(task.status)
                                ? 'bg-emerald-500'
                                : 'bg-indigo-500'
                            }`}
                          ></span>
                          <span className="truncate max-w-[220px]">📋 {task.title}</span>
                          {task.budget > 0 && (
                            <span className="text-[9px] font-mono font-bold bg-indigo-100 text-indigo-800 px-1.5 py-0.2 rounded-md">
                              {task.budget}€
                            </span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
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
