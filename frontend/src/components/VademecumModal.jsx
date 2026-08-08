import React, { useState, useEffect } from 'react';
import {
  X, Search, Copy, Check, Wifi, Key, Droplet, Flame, Trash2, Phone, AlertTriangle, ShieldCheck, Info, CheckSquare, Plus, Settings, Calendar, LogIn, LogOut, SunMedium
} from 'lucide-react';
import {
  fetchMaintenanceTasks, createMaintenanceTask, deleteMaintenanceTask,
  fetchMemberCurrentStayTasks, toggleStayTask, fetchReservations, fetchReservationTasks
} from '../api';

export default function VademecumModal({ isOpen, onClose, vademecumItems, currentUser, reservations = [] }) {
  const [activeTab, setActiveTab] = useState('vademecum'); // 'vademecum' | 'checklist' | 'admin_tasks'
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Toutes');
  const [copiedId, setCopiedId] = useState(null);

  // Member Stay Checklist state
  const [memberStay, setMemberStay] = useState(null);
  const [stayTasks, setStayTasks] = useState([]);
  const [selectedResId, setSelectedResId] = useState('');
  const [loadingTasks, setLoadingTasks] = useState(false);

  // Admin Task Manager state
  const [maintenanceTasks, setMaintenanceTasks] = useState([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskCat, setNewTaskCat] = useState('Arrivée');
  const [newTaskFreq, setNewTaskFreq] = useState('Chaque séjour');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [savingTask, setSavingTask] = useState(false);

  // Load Member Stay Checklist & Admin Tasks
  const loadChecklistData = async () => {
    setLoadingTasks(true);
    try {
      if (selectedResId) {
        const tasks = await fetchReservationTasks(selectedResId);
        setStayTasks(tasks);
        const resObj = reservations.find(r => r.id === parseInt(selectedResId, 10));
        if (resObj) setMemberStay(resObj);
      } else {
        const data = await fetchMemberCurrentStayTasks(currentUser || 'Henri');
        setMemberStay(data.reservation);
        setStayTasks(data.tasks || []);
        if (data.reservation) setSelectedResId(data.reservation.id.toString());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingTasks(false);
    }
  };

  const loadAdminTasks = async () => {
    try {
      const data = await fetchMaintenanceTasks();
      setMaintenanceTasks(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadChecklistData();
      loadAdminTasks();
    }
  }, [isOpen, currentUser, selectedResId]);

  if (!isOpen) return null;

  const categories = [
    'Toutes',
    'Wi-Fi & Réseau',
    'Accès & Clés',
    'Eau & Électricité',
    'Chauffage & Fioul',
    'Déchets & Recyclage',
    'Urgence & contacts'
  ];

  const filteredItems = vademecumItems.filter(item => {
    const matchesCategory = selectedCategory === 'Toutes' || item.category === selectedCategory;
    const matchesSearch = search === '' ||
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      item.content.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleCopyCode = (code, id) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleToggleTask = async (taskAssignmentId) => {
    if (!memberStay) return;
    try {
      const updated = await toggleStayTask(memberStay.id, taskAssignmentId);
      setStayTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateAdminTask = async (e) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    try {
      setSavingTask(true);
      await createMaintenanceTask({
        property_id: 1, // Hellenvilliers
        title: newTaskTitle.trim(),
        category: newTaskCat,
        frequency: newTaskFreq,
        description: newTaskDesc.trim() || null
      });
      setNewTaskTitle('');
      setNewTaskDesc('');
      await loadAdminTasks();
    } catch (err) {
      console.error(err);
    } finally {
      setSavingTask(false);
    }
  };

  const handleDeleteAdminTask = async (id) => {
    try {
      await deleteMaintenanceTask(id);
      await loadAdminTasks();
    } catch (err) {
      console.error(err);
    }
  };

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'Wi-Fi & Réseau':
        return <Wifi className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />;
      case 'Accès & Clés':
        return <Key className="h-4 w-4 text-amber-600 dark:text-amber-400" />;
      case 'Eau & Électricité':
        return <Droplet className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
      case 'Chauffage & Fioul':
        return <Flame className="h-4 w-4 text-rose-600 dark:text-rose-400" />;
      case 'Déchets & Recyclage':
        return <Trash2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />;
      case 'Urgence & contacts':
        return <Phone className="h-4 w-4 text-red-600 dark:text-red-400" />;
      default:
        return <Info className="h-4 w-4 text-slate-500" />;
    }
  };

  // Group stay tasks by category: Arrivée, Pendant le séjour, Départ
  const arrivalTasks = stayTasks.filter(t => t.category === 'Arrivée');
  const stayDurationTasks = stayTasks.filter(t => t.category === 'Pendant le séjour');
  const departureTasks = stayTasks.filter(t => t.category === 'Départ');

  const completedCount = stayTasks.filter(t => t.completed === 1).length;
  const progressPct = stayTasks.length > 0 ? Math.round((completedCount / stayTasks.length) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xl">📖</span>
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
                Vademecum & Checklist de Séjour (Hellenvilliers)
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Guide pratique de la maison, attribution automatique des tâches de maintenance et checklist membre
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <a
              href="https://docs.google.com/spreadsheets/d/1oV7ePIYys2bZ2LkCAPM8A31WHI8umTnD/edit?gid=241666300"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-sm"
              title="Ouvrir le Google Sheet Vademecum"
            >
              <span>Google Sheet Vademecum ↗</span>
            </a>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Multi-Tab Navigation */}
        <div className="px-6 pt-3 bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 flex items-center space-x-3 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('vademecum')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-t-2xl text-xs font-bold transition border-b-2 ${
              activeTab === 'vademecum'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-white dark:bg-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Info className="h-4 w-4" />
            <span>Consignes Vademecum</span>
          </button>

          <button
            onClick={() => setActiveTab('checklist')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-t-2xl text-xs font-bold transition border-b-2 ${
              activeTab === 'checklist'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-white dark:bg-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <CheckSquare className="h-4 w-4" />
            <span>Mon Séjour (Checklist & Tâches)</span>
            {stayTasks.length > 0 && (
              <span className="ml-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-extrabold">
                {completedCount}/{stayTasks.length}
              </span>
            )}
          </button>

          {currentUser === 'Henri' && (
            <button
              onClick={() => setActiveTab('admin_tasks')}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-t-2xl text-xs font-bold transition border-b-2 ${
                activeTab === 'admin_tasks'
                  ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400 bg-white dark:bg-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Settings className="h-4 w-4" />
              <span>Gestion Tâches Maintenance (Admin)</span>
            </button>
          )}
        </div>

        {/* TAB 1: VADEMECUM CENTRALISÉ */}
        {activeTab === 'vademecum' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Search & Category filter */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 space-y-3">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Rechercher une consigne (ex: Wifi, Fioul, Eau, Clé, Poubelles...)"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex space-x-2 overflow-x-auto pb-1 scrollbar-none">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                      selectedCategory === cat
                        ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Vademecum Items List */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {filteredItems.length === 0 ? (
                <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                  <Info className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-xs">Aucune consigne ne correspond à votre recherche.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredItems.map((item) => (
                    <div
                      key={item.id}
                      className="p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-950/60 shadow-sm flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center space-x-2">
                            <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800">
                              {getCategoryIcon(item.category)}
                            </div>
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              {item.category}
                            </span>
                          </div>
                          {item.importance === 'CRITIQUE' && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                              ⚠️ CRITIQUE
                            </span>
                          )}
                        </div>

                        <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-2 leading-snug">
                          {item.title}
                        </h4>

                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-4 whitespace-pre-line">
                          {item.content}
                        </p>
                      </div>

                      {item.code_to_copy && (
                        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl">
                          <span className="font-mono text-xs font-bold text-slate-900 dark:text-white select-all">
                            {item.code_to_copy}
                          </span>
                          <button
                            onClick={() => handleCopyCode(item.code_to_copy, item.id)}
                            className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition shadow-sm"
                          >
                            {copiedId === item.id ? (
                              <>
                                <Check className="h-3 w-3" />
                                <span>Copié !</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                <span>Copier</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: MEMBER CHECKLIST "MON SÉJOUR" */}
        {activeTab === 'checklist' && (
          <div className="p-6 overflow-y-auto flex-1 space-y-6">
            
            {/* Stay Selector Header */}
            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs font-extrabold uppercase text-emerald-700 dark:text-emerald-400 tracking-wider">
                  Checklist & Vademecum du Séjour
                </p>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5">
                  {memberStay ? `Séjour de ${memberStay.user_name} (Semaine ${memberStay.week_number})` : 'Aucun séjour sélectionné'}
                </h3>
                {memberStay && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                    Du {memberStay.start_date} au {memberStay.end_date} — {memberStay.notes || 'Vacances familiales'}
                  </p>
                )}
              </div>

              {/* Selector for other stays if desired */}
              <div className="flex items-center space-x-2">
                <label className="text-xs font-bold text-slate-500">Changer de séjour:</label>
                <select
                  value={selectedResId}
                  onChange={(e) => setSelectedResId(e.target.value)}
                  className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200"
                >
                  {reservations.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.user_name} (Sem. {r.week_number} - {r.start_date})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-slate-700 dark:text-slate-300">Progression des tâches d'entretien ({completedCount}/{stayTasks.length})</span>
                <span className="text-emerald-600 dark:text-emerald-400">{progressPct}% Accompli</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div className="bg-emerald-500 h-full transition-all duration-300" style={{ width: `${progressPct}%` }}></div>
              </div>
            </div>

            {/* 3 CHECKLIST SECTIONS */}

            {/* 1. Actions à l'Arrivée */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2 text-sm font-extrabold text-blue-600 dark:text-blue-400">
                <LogIn className="h-4 w-4" />
                <span>🛬 Actions à l'Arrivée</span>
              </div>
              <div className="space-y-2">
                {arrivalTasks.map(t => (
                  <label
                    key={t.id}
                    onClick={() => handleToggleTask(t.id)}
                    className={`flex items-start space-x-3 p-3.5 rounded-2xl border transition cursor-pointer ${
                      t.completed === 1
                        ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800/60 text-slate-500'
                        : 'bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 hover:border-blue-400'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={t.completed === 1}
                      onChange={() => {}}
                      className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                    />
                    <div className="flex-1">
                      <p className={`text-xs font-bold ${t.completed === 1 ? 'line-through text-slate-400' : 'text-slate-900 dark:text-white'}`}>
                        {t.title}
                      </p>
                      {t.frequency && <p className="text-[10px] text-slate-400 mt-0.5">Fréquence : {t.frequency}</p>}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* 2. Tâches Pendant le Séjour */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center space-x-2 text-sm font-extrabold text-amber-600 dark:text-amber-400">
                <SunMedium className="h-4 w-4" />
                <span>🏊 Tâches pendant le Séjour</span>
              </div>
              <div className="space-y-2">
                {stayDurationTasks.map(t => (
                  <label
                    key={t.id}
                    onClick={() => handleToggleTask(t.id)}
                    className={`flex items-start space-x-3 p-3.5 rounded-2xl border transition cursor-pointer ${
                      t.completed === 1
                        ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800/60 text-slate-500'
                        : 'bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 hover:border-amber-400'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={t.completed === 1}
                      onChange={() => {}}
                      className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                    />
                    <div className="flex-1">
                      <p className={`text-xs font-bold ${t.completed === 1 ? 'line-through text-slate-400' : 'text-slate-900 dark:text-white'}`}>
                        {t.title}
                      </p>
                      {t.frequency && <p className="text-[10px] text-slate-400 mt-0.5">Fréquence : {t.frequency}</p>}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* 3. Procédures de Départ */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center space-x-2 text-sm font-extrabold text-rose-600 dark:text-rose-400">
                <LogOut className="h-4 w-4" />
                <span>🛫 Procédures de Départ</span>
              </div>
              <div className="space-y-2">
                {departureTasks.map(t => (
                  <label
                    key={t.id}
                    onClick={() => handleToggleTask(t.id)}
                    className={`flex items-start space-x-3 p-3.5 rounded-2xl border transition cursor-pointer ${
                      t.completed === 1
                        ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800/60 text-slate-500'
                        : 'bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 hover:border-rose-400'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={t.completed === 1}
                      onChange={() => {}}
                      className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                    />
                    <div className="flex-1">
                      <p className={`text-xs font-bold ${t.completed === 1 ? 'line-through text-slate-400' : 'text-slate-900 dark:text-white'}`}>
                        {t.title}
                      </p>
                      {t.frequency && <p className="text-[10px] text-slate-400 mt-0.5">Fréquence : {t.frequency}</p>}
                    </div>
                  </label>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* TAB 3: ADMIN TASK MANAGEMENT */}
        {activeTab === 'admin_tasks' && currentUser === 'Henri' && (
          <div className="p-6 overflow-y-auto flex-1 space-y-6">
            <div className="p-4 rounded-2xl bg-cyan-950/40 border border-cyan-800 text-cyan-200">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-cyan-400">
                🛠️ Administration des Tâches Récurrentes (Henri)
              </h3>
              <p className="text-xs mt-1">
                Définissez les tâches de maintenance automatiques attribuées aux membres à chaque réservation (filtre piscine, linge, chaudière, clés, compteurs).
              </p>
            </div>

            {/* Create New Recurring Maintenance Task Form */}
            <form onSubmit={handleCreateAdminTask} className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
              <h4 className="text-xs font-bold uppercase text-slate-700 dark:text-slate-300">Ajouter une tâche récurrente</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <input
                    type="text"
                    placeholder="Titre de la tâche (ex: Nettoyage filtre piscine & chlore)"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    required
                  />
                </div>
                <div>
                  <select
                    value={newTaskCat}
                    onChange={(e) => setNewTaskCat(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="Arrivée">🛬 Arrivée</option>
                    <option value="Pendant le séjour">🏊 Pendant le séjour</option>
                    <option value="Départ">🛫 Départ</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <select
                    value={newTaskFreq}
                    onChange={(e) => setNewTaskFreq(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="Chaque séjour">Chaque séjour</option>
                    <option value="Hebdomadaire">Hebdomadaire</option>
                    <option value="Mensuel">Mensuel</option>
                    <option value="Saisonnier">Saisonnier</option>
                  </select>
                </div>
                <div>
                  <input
                    type="text"
                    placeholder="Description / consignes spécifiques..."
                    value={newTaskDesc}
                    onChange={(e) => setNewTaskDesc(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={savingTask}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold transition shadow-sm flex items-center space-x-1"
              >
                <Plus className="h-4 w-4" />
                <span>Enregistrer la tâche</span>
              </button>
            </form>

            {/* List of Recurring Maintenance Tasks */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase text-slate-500">Tâches de maintenance définies ({maintenanceTasks.length})</h4>
              <div className="space-y-2">
                {maintenanceTasks.map(t => (
                  <div
                    key={t.id}
                    className="p-3.5 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {t.category}
                        </span>
                        <h5 className="text-xs font-bold text-slate-900 dark:text-white">{t.title}</h5>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">Fréquence: {t.frequency} {t.description && `• ${t.description}`}</p>
                    </div>

                    <button
                      onClick={() => handleDeleteAdminTask(t.id)}
                      className="p-1.5 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950 transition"
                      title="Supprimer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 transition shadow-sm"
          >
            Fermer
          </button>
        </div>

      </div>
    </div>
  );
}
