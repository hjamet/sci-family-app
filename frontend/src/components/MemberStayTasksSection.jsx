import React, { useState, useEffect } from 'react';
import { CheckSquare, Info, Sparkles, FileText } from 'lucide-react';
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

  // Filter tasks into 3 clear columns
  const arrivalTasks = tasks.filter(t => t.category === 'Arrivée');
  const stayTasks = tasks.filter(t => t.category === 'Pendant le séjour');
  const departureTasks = tasks.filter(t => t.category === 'Départ');

  if (loading) return null;

  const renderColumn = (title, icon, items) => (
    <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between">
      <div>
        <div className="flex items-center space-x-2 mb-3 pb-2 border-b border-slate-200">
          <span className="text-lg">{icon}</span>
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">{title}</h3>
          <span className="ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full bg-white text-slate-700 border border-slate-200">
            {items.filter(i => i.completed === 1).length}/{items.length}
          </span>
        </div>

        {items.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-4 text-center">Aucune consigne pour cette étape.</p>
        ) : (
          <div className="space-y-2.5">
            {items.map((task) => {
              const isDone = task.completed === 1;
              const isHovered = hoveredTaskId === task.id;

              return (
                <div
                  key={task.id}
                  onMouseEnter={() => setHoveredTaskId(task.id)}
                  onMouseLeave={() => setHoveredTaskId(null)}
                  className={`relative p-3 rounded-xl border transition-all duration-150 group cursor-pointer ${
                    isDone
                      ? 'bg-emerald-50/80 border-emerald-200 opacity-80'
                      : 'bg-white border-slate-200 hover:border-cyan-400 hover:bg-cyan-50/30'
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <input
                      type="checkbox"
                      checked={isDone}
                      onChange={(e) => handleToggle(task.id, e)}
                      className="mt-1 h-4 w-4 rounded text-cyan-600 focus:ring-cyan-500 border-slate-300 bg-white cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className={`text-xs font-bold leading-snug ${isDone ? 'line-through text-slate-400' : 'text-slate-800 group-hover:text-cyan-700'}`}>
                          {task.title}
                        </h4>
                        <Info className="h-3.5 w-3.5 text-cyan-600 group-hover:text-cyan-700 flex-shrink-0 ml-1" />
                      </div>
                      {task.frequency && (
                        <p className="text-[10px] text-slate-500 mt-0.5">{task.frequency}</p>
                      )}
                    </div>
                  </div>

                  {/* Hover Information Floating Tooltip Bubble */}
                  {isHovered && (
                    <div className="absolute z-50 left-0 sm:left-auto right-0 top-full mt-2 w-72 sm:w-80 p-4 bg-white border border-slate-200 rounded-2xl shadow-xl text-slate-800 text-xs animate-in fade-in zoom-in-95 duration-150">
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                        <span className="font-bold text-cyan-700 text-xs flex items-center space-x-1">
                          <Sparkles className="h-3.5 w-3.5" />
                          <span>Consignes & Détails</span>
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                          {task.category}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 leading-relaxed font-normal mb-3">
                        {task.description || "Consulter le Vademecum de la maison d'Hellenvilliers pour le détail pas-à-pas des manipulations."}
                      </p>

                      {task.notes && (
                        <div className="p-2 rounded-lg bg-indigo-50 border border-indigo-200 text-[11px] text-indigo-900 mb-2">
                          <strong className="block text-indigo-800 font-bold mb-0.5">Note du Coordinateur:</strong>
                          <span>{task.notes}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[10px] text-cyan-700 font-semibold pt-1 border-t border-slate-100">
                        <span className="flex items-center space-x-1">
                          <FileText className="h-3 w-3" />
                          <span>Fiche Vademecum rattachée</span>
                        </span>
                        <span className="underline cursor-pointer hover:text-cyan-800">Voir détails →</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <section className="mb-8">
      <div className="bg-white border border-slate-200 shadow-sm text-slate-900 rounded-3xl p-6 relative overflow-hidden">
        {/* Subtle decorative highlight */}
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-56 h-56 rounded-full bg-cyan-50 blur-3xl pointer-events-none"></div>

        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center space-x-2 text-xs font-extrabold text-cyan-700 uppercase tracking-widest mb-1">
              <CheckSquare className="h-4 w-4" />
              <span>Planning Automatique du Séjour</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
              <span>Mes Tâches pour ce Séjour</span>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-cyan-50 text-cyan-700 border border-cyan-200">
                {currentUser}
              </span>
            </h2>
            {stay ? (
              <p className="text-xs text-slate-600 mt-1">
                Prochain Séjour à Hellenvilliers (Semaine {stay.week_number}) — Du <strong className="text-slate-900">{stay.start_date}</strong> au <strong className="text-slate-900">{stay.end_date}</strong>
              </p>
            ) : (
              <p className="text-xs text-slate-500 mt-1">
                Consignes d'entretien et check-list courante pour la maison d'Hellenvilliers.
              </p>
            )}
          </div>

          {/* Progress Indicator */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-center min-w-[150px]">
            <span className="text-2xl font-black text-cyan-600">{completedCount}/{tasks.length}</span>
            <span className="block text-[10px] font-extrabold uppercase text-slate-500">Accomplies ({progressPct}%)</span>
            <div className="w-full h-1.5 rounded-full bg-slate-200 mt-1.5 overflow-hidden">
              <div className="bg-cyan-500 h-full transition-all duration-300" style={{ width: `${progressPct}%` }}></div>
            </div>
          </div>
        </div>

        {/* 3 Clear Columns Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {renderColumn("À l'arrivée", "🛬", arrivalTasks)}
          {renderColumn("Pendant le séjour", "🏊", stayTasks)}
          {renderColumn("Au départ", "🛫", departureTasks)}
        </div>
      </div>
    </section>
  );
}

