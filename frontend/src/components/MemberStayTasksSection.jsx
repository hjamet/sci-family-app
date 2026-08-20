import React, { useState, useEffect } from 'react';
import { CheckSquare, Info, Sparkles, FileText, CheckCircle2 } from 'lucide-react';
import { fetchMemberCurrentStayTasks, toggleStayTask } from '../api';

export default function MemberStayTasksSection({ currentUser }) {
  const [stay, setStay] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hoveredTaskId, setHoveredTaskId] = useState(null);

  const loadMemberTasks = async () => {
    try {
      setLoading(true);
      const data = await fetchMemberCurrentStayTasks(currentUser);
      setStay(data.reservation);
      setTasks(data.tasks || []);
    } catch (err) {
      console.error('Error fetching member stay tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMemberTasks();
  }, [currentUser]);

  const handleToggle = async (assignmentId, e) => {
    e.stopPropagation();
    if (!stay) return;
    try {
      const updated = await toggleStayTask(stay.id, assignmentId);
      setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
    } catch (err) {
      console.error('Error toggling stay task:', err);
    }
  };

  const completedCount = tasks.filter(t => t.completed === 1).length;
  const progressPct = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  if (loading) return null;

  const getCategoryBadgeClass = (cat) => {
    switch (cat) {
      case 'Arrivée':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Pendant le séjour':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Départ':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <section className="mb-8">
      <div className="bg-white border border-slate-200/90 shadow-sm text-slate-900 rounded-3xl p-6 relative overflow-hidden">
        {/* Decorative highlight */}
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-56 h-56 rounded-full bg-cyan-50 blur-3xl pointer-events-none"></div>

        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100 relative z-10">
          <div>
            <div className="flex items-center space-x-2 text-xs font-extrabold text-cyan-700 uppercase tracking-widest mb-1">
              <CheckSquare className="h-4 w-4" />
              <span>Check-list & Consignes de Séjour</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
              <span>Mes Tâches</span>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-cyan-50 text-cyan-700 border border-cyan-200">
                {currentUser}
              </span>
            </h2>
            {stay ? (
              <p className="text-xs text-slate-600 mt-1">
                Séjour à Hellenvilliers (Semaine {stay.week_number}) — Du <strong className="text-slate-900">{stay.start_date}</strong> au <strong className="text-slate-900">{stay.end_date}</strong>
              </p>
            ) : (
              <p className="text-xs text-slate-500 mt-1">
                Consignes d'entretien et tâches attribuées pour le séjour.
              </p>
            )}
          </div>

          {/* Progress Indicator */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-center min-w-[170px] shrink-0">
            <div className="flex items-center justify-center space-x-1.5">
              <span className="text-2xl font-black text-cyan-600">{completedCount}/{tasks.length}</span>
              <span className="text-xs font-bold text-slate-400">tâches</span>
            </div>
            <span className="block text-[10px] font-extrabold uppercase text-slate-500 mt-0.5">
              Accomplies ({progressPct}%)
            </span>
            <div className="w-full h-2 rounded-full bg-slate-200 mt-2 overflow-hidden">
              <div
                className="bg-cyan-500 h-full transition-all duration-300 rounded-full"
                style={{ width: `${progressPct}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Single Flat Clean Vertical List */}
        {tasks.length === 0 ? (
          <div className="text-center py-8 bg-slate-50 rounded-2xl border border-slate-200/80">
            <CheckCircle2 className="h-8 w-8 text-slate-400 mx-auto mb-2" />
            <p className="text-xs text-slate-500 font-medium">Aucune tâche attribuée pour ce séjour.</p>
          </div>
        ) : (
          <div className="space-y-3 relative z-10">
            {tasks.map((task) => {
              const isDone = task.completed === 1;
              const isHovered = hoveredTaskId === task.id;

              return (
                <div
                  key={task.id}
                  onMouseEnter={() => setHoveredTaskId(task.id)}
                  onMouseLeave={() => setHoveredTaskId(null)}
                  className={`relative p-4 rounded-2xl border transition-all duration-150 group cursor-pointer ${
                    isDone
                      ? 'bg-emerald-50/70 border-emerald-200 text-slate-700'
                      : 'bg-white border-slate-200/90 hover:border-cyan-300 hover:bg-slate-50/60 shadow-sm'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start space-x-3.5 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={isDone}
                        onChange={(e) => handleToggle(task.id, e)}
                        className="mt-1 h-5 w-5 rounded-md text-cyan-600 focus:ring-cyan-500 border-slate-300 cursor-pointer shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                          <h3 className={`text-sm font-bold leading-snug ${isDone ? 'line-through text-slate-400' : 'text-slate-900 group-hover:text-cyan-800'}`}>
                            {task.title}
                          </h3>
                          {task.category && (
                            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border ${getCategoryBadgeClass(task.category)}`}>
                              {task.category}
                            </span>
                          )}
                        </div>

                        {task.description && (
                          <p className={`text-xs mt-1 leading-relaxed ${isDone ? 'text-slate-400' : 'text-slate-600'}`}>
                            {task.description}
                          </p>
                        )}

                        {task.frequency && (
                          <span className="inline-block text-[10px] font-medium text-slate-400 mt-1">
                            Fréquence : {task.frequency}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      <Info className="h-4 w-4 text-slate-400 group-hover:text-cyan-600 transition" />
                    </div>
                  </div>

                  {/* Floating Tooltip/Details on Hover */}
                  {isHovered && (
                    <div className="absolute z-50 right-4 top-full mt-2 w-80 p-4 bg-white border border-slate-200 rounded-2xl shadow-xl text-slate-800 text-xs animate-in fade-in zoom-in-95 duration-150">
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                        <span className="font-bold text-cyan-700 text-xs flex items-center space-x-1">
                          <Sparkles className="h-3.5 w-3.5" />
                          <span>Détails & Consignes</span>
                        </span>
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded border ${getCategoryBadgeClass(task.category)}`}>
                          {task.category}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 leading-relaxed font-normal mb-3">
                        {task.description || "Consulter le Vademecum de la maison d'Hellenvilliers pour le détail des étapes."}
                      </p>

                      {task.notes && (
                        <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-[11px] text-indigo-900 mb-2">
                          <strong className="block text-indigo-800 font-bold mb-0.5">Note du Coordinateur:</strong>
                          <span>{task.notes}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[10px] text-cyan-700 font-semibold pt-1 border-t border-slate-100">
                        <span className="flex items-center space-x-1">
                          <FileText className="h-3 w-3" />
                          <span>Vademecum rattaché</span>
                        </span>
                        <span className="underline">Voir fiches →</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
