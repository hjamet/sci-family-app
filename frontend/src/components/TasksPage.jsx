import React, { useState, useEffect, useRef } from 'react';
import {
  CheckSquare, Info, Sparkles, FileText, CheckCircle2, Calendar, User, Clock, AlertCircle,
  Upload, X, Paperclip, ShieldCheck, Check, FileCode, Image as ImageIcon, File, Download, Plus
} from 'lucide-react';
import {
  fetchMemberCurrentStayTasks, toggleStayTask, uploadTaskDocuments,
  submitTaskCompletion, validateTaskCompletion, fetchTasks, createTask
} from '../api';

export default function TasksPage({ currentUser }) {
  const activeUser = currentUser || localStorage.getItem('sci_user') || 'Membre';
  const isCoordinator = activeUser === 'Henri';

  const [stay, setStay] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hoveredTaskId, setHoveredTaskId] = useState(null);
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL'); // 'ALL' | 'TODO' | 'PENDING' | 'DONE'

  // Completion Modal State
  const [completingTask, setCompletingTask] = useState(null);
  const [completionNotes, setCompletionNotes] = useState('');
  const [completionFiles, setCompletionFiles] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [validatingTaskId, setValidatingTaskId] = useState(null);
  const fileInputRef = useRef(null);

  // New Task Creation Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('Pendant le séjour');
  const [newDescription, setNewDescription] = useState('');
  const [newAssignedUser, setNewAssignedUser] = useState(activeUser);
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  const loadMemberTasks = async () => {
    try {
      setLoading(true);
      const data = await fetchMemberCurrentStayTasks(activeUser);
      setStay(data?.reservation || null);
      let list = data?.tasks || [];
      if (list.length === 0) {
        list = await fetchTasks({ user_name: activeUser });
      }
      if (list.length === 0) {
        list = await fetchTasks();
      }
      if (list.length === 0) {
        try {
          const mTasks = await fetchMaintenanceTasks();
          list = mTasks.map(m => ({
            id: `mt-${m.id}`,
            title: m.title,
            category: m.category || 'Pendant le séjour',
            description: m.description || '',
            frequency: m.frequency || 'Chaque séjour',
            completed: 0,
            status: 'A_FAIRE'
          }));
        } catch (mErr) {
          console.error('Failed to fetch maintenance tasks template:', mErr);
        }
      }
      setTasks(list || []);
    } catch (err) {
      console.error('Error fetching member tasks:', err);
      try {
        const fallback = await fetchTasks();
        setTasks(fallback || []);
      } catch (fErr) {
        console.error('Fallback fetchTasks failed:', fErr);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTaskSubmit = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      setIsCreatingTask(true);
      await createTask({
        title: newTitle.trim(),
        category: newCategory,
        description: newDescription.trim(),
        assigned_user: newAssignedUser,
        property_id: stay ? stay.property_id : 1
      });
      setNewTitle('');
      setNewDescription('');
      setIsCreateModalOpen(false);
      await loadMemberTasks();
    } catch (err) {
      alert(err.message || 'Erreur lors de la création de la tâche');
    } finally {
      setIsCreatingTask(false);
    }
  };

  useEffect(() => {
    loadMemberTasks();
  }, [activeUser]);

  const handleToggle = async (task, e) => {
    if (e) e.stopPropagation();
    if (task.status === 'EN_ATTENTE_VALIDATION' || task.status === 'ARCHIVEE') {
      return;
    }
    // Open completion modal directly so member can provide notes and uploads
    openCompletionModal(task);
  };

  const openCompletionModal = (task) => {
    setCompletingTask(task);
    setCompletionNotes(task.completion_notes || '');
    setCompletionFiles([]);
  };

  const closeCompletionModal = () => {
    setCompletingTask(null);
    setCompletionNotes('');
    setCompletionFiles([]);
    setIsSubmitting(false);
  };

  // Multi-File Upload Handlers inside modal
  const handleFilesSelected = (files) => {
    const fileList = Array.from(files);
    setCompletionFiles(prev => [...prev, ...fileList]);
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesSelected(e.target.files);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  };

  const handleRemoveFile = (index) => {
    setCompletionFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Submit Completion (Transition to EN_ATTENTE_VALIDATION)
  const handleCompletionSubmit = async (e) => {
    e.preventDefault();
    if (!completingTask) return;

    try {
      setIsSubmitting(true);
      let uploadedUrls = [];

      if (completionFiles.length > 0) {
        const uploadRes = await uploadTaskDocuments(completionFiles);
        uploadedUrls = uploadRes.document_urls || [];
      }

      // Preserve any existing completion docs
      const existingDocs = Array.isArray(completingTask.completion_docs) ? completingTask.completion_docs : [];
      const allDocs = [...existingDocs, ...uploadedUrls];

      const updated = await submitTaskCompletion(completingTask.id, {
        completion_notes: completionNotes,
        completion_docs: allDocs
      });

      setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
      closeCompletionModal();
    } catch (err) {
      console.error('Error submitting task completion:', err);
      alert(err.message || 'Erreur lors de la soumission de la finalisation');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Coordinator Action: Validate Completion (Transition to ARCHIVEE)
  const handleValidateCompletion = async (taskId, e) => {
    if (e) e.stopPropagation();
    try {
      setValidatingTaskId(taskId);
      const updated = await validateTaskCompletion(taskId);
      setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
    } catch (err) {
      console.error('Error validating task completion:', err);
      alert(err.message || 'Erreur lors de la validation');
    } finally {
      setValidatingTaskId(null);
    }
  };

  // Helper for file type badges
  const getFileBadge = (url) => {
    const filename = url.split('/').pop();
    const ext = filename.split('.').pop().toLowerCase();
    if (ext === 'pdf') {
      return { icon: FileText, color: 'text-red-600 bg-red-50 border-red-200', label: 'PDF' };
    } else if (ext === 'md' || ext === 'markdown') {
      return { icon: FileCode, color: 'text-emerald-600 bg-emerald-50 border-emerald-200', label: 'MD' };
    } else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
      return { icon: ImageIcon, color: 'text-blue-600 bg-blue-50 border-blue-200', label: ext.toUpperCase() };
    } else {
      return { icon: File, color: 'text-amber-600 bg-amber-50 border-amber-200', label: ext.toUpperCase() };
    }
  };

  // Categories & Filtering
  const baseCategories = ['Arrivée', 'Pendant le séjour', 'Départ'];
  const extraCategories = Array.from(new Set(tasks.map(t => t.category).filter(Boolean)));
  const allCategories = ['ALL', ...Array.from(new Set([...baseCategories, ...extraCategories]))];

  const filteredTasks = tasks.filter(t => {
    const matchCat = filterCategory === 'ALL' || t.category === filterCategory;
    let matchStatus = true;
    if (filterStatus === 'TODO') {
      matchStatus = t.completed === 0 && t.status !== 'EN_ATTENTE_VALIDATION' && t.status !== 'ARCHIVEE';
    } else if (filterStatus === 'PENDING') {
      matchStatus = t.status === 'EN_ATTENTE_VALIDATION';
    } else if (filterStatus === 'DONE') {
      matchStatus = t.completed === 1 || t.status === 'ARCHIVEE';
    }
    return matchCat && matchStatus;
  });

  const pendingValidationCount = tasks.filter(t => t.status === 'EN_ATTENTE_VALIDATION').length;
  const completedCount = tasks.filter(t => t.completed === 1 || t.status === 'ARCHIVEE').length;
  const todoCount = tasks.length - completedCount;
  const progressPct = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  const getCategoryBadgeClass = (cat) => {
    switch (cat) {
      case 'Arrivée':
        return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800';
      case 'Pendant le séjour':
        return 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800';
      case 'Départ':
        return 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300';
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-amber-500 via-amber-600 to-yellow-600 p-6 sm:p-8 text-white shadow-md w-full">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 rounded-full bg-white/10 blur-3xl pointer-events-none"></div>

        <div className="w-full flex flex-row items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center space-x-2 text-xs font-bold text-amber-100 uppercase tracking-widest mb-1">
              <CheckSquare className="h-4 w-4" />
              <span>Gestion & Checklist de Séjour SCI</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight">
              Mes Tâches Attribuées
            </h1>
            <p className="text-sm text-amber-100/90 mt-1 max-w-xl">
              Consignes d'arrivée, d'entretien du domaine et de départ réservées à <strong className="underline">{activeUser}</strong>.
            </p>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center space-x-2 px-4 py-2.5 rounded-2xl bg-white text-amber-800 hover:bg-amber-50 font-black text-sm shadow-md transition transform hover:scale-105"
            >
              <Plus className="h-4 w-4 text-amber-600" />
              <span>➕ Créer / Attribuer une Tâche</span>
            </button>

            <div className="hidden md:flex items-center space-x-3 bg-white/15 backdrop-blur-md border border-white/20 rounded-2xl px-4 py-2.5 shadow-sm">
              <div className="w-9 h-9 rounded-full bg-white text-amber-700 flex items-center justify-center font-black text-sm uppercase">
                {activeUser[0]}
              </div>
              <div>
                <span className="text-[10px] text-amber-100 font-bold uppercase block">Membre Connecté</span>
                <span className="text-sm font-black text-white">{activeUser}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Task List Container */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm rounded-3xl p-6 sm:p-8 relative overflow-hidden">
        
        {/* Progress & Info Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xl font-black text-slate-900 dark:text-white">
                Checklist Personnelle
              </h2>
              {stay && (
                <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
                  Semaine {stay.week_number}
                </span>
              )}
            </div>
            {stay ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Séjour actif du <strong className="text-slate-800 dark:text-slate-200">{stay.start_date}</strong> au <strong className="text-slate-800 dark:text-slate-200">{stay.end_date}</strong>
              </p>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Tâches récurrentes et consignes d'entretien du Domaine d'Hellenvilliers.
              </p>
            )}
          </div>

          {tasks.length > 0 && (
            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 text-center min-w-[220px] shrink-0">
              <div className="flex items-center justify-center space-x-1.5">
                <span className="text-2xl font-black text-amber-600 dark:text-amber-400">{completedCount}/{tasks.length}</span>
                <span className="text-xs font-bold text-slate-400">tâches</span>
              </div>
              <span className="block text-[10px] font-extrabold uppercase text-slate-500 mt-0.5">
                Accomplies ({progressPct}%)
              </span>
              <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 mt-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-amber-500 to-emerald-500 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${progressPct}%` }}
                ></div>
              </div>
            </div>
          )}
        </div>

        {/* UI Tab Management: Status Tabs & Category Tabs */}
        {tasks.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
            {/* Category Tabs */}
            <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-none">
              <span className="text-xs font-bold text-slate-400 uppercase mr-1">Catégorie:</span>
              {allCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition whitespace-nowrap ${
                    filterCategory === cat
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  {cat === 'ALL' ? 'Toutes les catégories' : cat}
                </button>
              ))}
            </div>

            {/* Status Tabs */}
            <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl shrink-0">
              <button
                onClick={() => setFilterStatus('ALL')}
                className={`px-3 py-1 text-xs font-extrabold rounded-lg transition ${
                  filterStatus === 'ALL' ? 'bg-white dark:bg-slate-900 text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                }`}
              >
                Toutes ({tasks.length})
              </button>
              <button
                onClick={() => setFilterStatus('TODO')}
                className={`px-3 py-1 text-xs font-extrabold rounded-lg transition ${
                  filterStatus === 'TODO' ? 'bg-white dark:bg-slate-900 text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                }`}
              >
                En cours ({todoCount})
              </button>
              {pendingValidationCount > 0 && (
                <button
                  onClick={() => setFilterStatus('PENDING')}
                  className={`px-3 py-1 text-xs font-extrabold rounded-lg transition ${
                    filterStatus === 'PENDING' ? 'bg-white dark:bg-slate-900 text-amber-700 shadow-sm' : 'text-amber-700 font-bold hover:text-amber-900 dark:text-amber-400'
                  }`}
                >
                  ⏳ En validation ({pendingValidationCount})
                </button>
              )}
              <button
                onClick={() => setFilterStatus('DONE')}
                className={`px-3 py-1 text-xs font-extrabold rounded-lg transition ${
                  filterStatus === 'DONE' ? 'bg-white dark:bg-slate-900 text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                }`}
              >
                Terminées ({completedCount})
              </button>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm font-medium">
            Chargement de vos tâches...
          </div>
        ) : tasks.length === 0 ? (
          /* Empty State */
          <div className="text-center py-16 px-4 bg-slate-50 dark:bg-slate-950 rounded-3xl border border-dashed border-slate-300 dark:border-slate-800 my-4">
            <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-4 shadow-inner">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-black text-slate-800 dark:text-slate-200">
              🎉 Vous n'avez aucune tâche attribuée pour le moment.
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 max-w-md mx-auto">
              Profitez pleinement de votre séjour à Hellenvilliers ! Les tâches d'arrivée et de départ apparaîtront ici lors de vos séjours réservés.
            </p>
          </div>
        ) : (
          /* Tasks List */
          <div className="space-y-4">
            {filteredTasks.map((task) => {
              const isPending = task.status === 'EN_ATTENTE_VALIDATION';
              const isArchived = task.status === 'ARCHIVEE';
              const isDone = task.completed === 1 || isArchived;
              const isHovered = hoveredTaskId === task.id;

              const docsList = Array.isArray(task.completion_docs)
                ? task.completion_docs
                : (task.completion_docs ? [task.completion_docs] : []);

              return (
                <div
                  key={task.id}
                  onMouseEnter={() => setHoveredTaskId(task.id)}
                  onMouseLeave={() => setHoveredTaskId(null)}
                  className={`relative p-5 rounded-2xl border transition-all duration-150 group ${
                    isArchived
                      ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/60'
                      : isPending
                      ? 'bg-amber-50/60 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800'
                      : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-amber-400 dark:hover:border-amber-600 shadow-sm'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex items-start space-x-3.5 flex-1 min-w-0">
                      
                      {/* Checkbox / Action Trigger */}
                      <button
                        type="button"
                        onClick={(e) => handleToggle(task, e)}
                        className={`mt-0.5 h-6 w-6 rounded-lg flex items-center justify-center border transition shrink-0 ${
                          isArchived
                            ? 'bg-emerald-600 border-emerald-600 text-white cursor-default'
                            : isPending
                            ? 'bg-amber-500 border-amber-500 text-white cursor-default'
                            : 'border-slate-300 hover:border-amber-500 bg-white dark:bg-slate-800'
                        }`}
                        title={isArchived ? "Tâche validée" : isPending ? "En attente de validation" : "Finaliser cette tâche"}
                      >
                        {isArchived ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : isPending ? (
                          <Clock className="h-4 w-4 animate-spin" />
                        ) : null}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                          <h3 className={`text-base font-bold leading-snug ${isDone ? 'text-slate-700 dark:text-slate-300' : 'text-slate-900 dark:text-white'}`}>
                            {task.title}
                          </h3>

                          {task.category && (
                            <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-md border ${getCategoryBadgeClass(task.category)}`}>
                              {task.category}
                            </span>
                          )}

                          {/* Status Badge */}
                          {isPending && (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-300">
                              <Clock className="w-3 h-3 text-amber-700" />
                              <span>⏳ En attente de validation Coordinateur</span>
                            </span>
                          )}
                          {isArchived && (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                              <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                              <span>✅ Validée & Archivée</span>
                            </span>
                          )}
                        </div>

                        {task.description && (
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                            {task.description}
                          </p>
                        )}

                        {/* Completion Notes Section */}
                        {task.completion_notes && (
                          <div className="mt-3 p-3 rounded-xl bg-amber-100/60 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-slate-800 dark:text-slate-200">
                            <span className="font-extrabold text-amber-900 dark:text-amber-300 block mb-0.5 flex items-center space-x-1">
                              <FileText className="w-3.5 h-3.5" />
                              <span>Compte rendu / Notes de réalisation :</span>
                            </span>
                            <p className="leading-relaxed">{task.completion_notes}</p>
                          </div>
                        )}

                        {/* Uploaded Justificatifs / Documents Chips */}
                        {docsList.length > 0 && (
                          <div className="mt-3 space-y-1">
                            <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider block">
                              Justificatifs & Factures joints ({docsList.length}) :
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {docsList.map((docUrl, idx) => {
                                const badge = getFileBadge(docUrl);
                                const BadgeIcon = badge.icon;
                                const filename = docUrl.split('/').pop().split('_', 2).pop() || 'Justificatif';

                                return (
                                  <a
                                    key={idx}
                                    href={docUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`flex items-center space-x-1.5 px-3 py-1 rounded-xl border text-xs font-bold transition shadow-sm hover:scale-105 ${badge.color}`}
                                    title={`Télécharger ${filename}`}
                                  >
                                    <BadgeIcon className="w-3.5 h-3.5 shrink-0" />
                                    <span className="truncate max-w-[160px]">{filename}</span>
                                    <Download className="w-3 h-3 ml-0.5 opacity-70" />
                                  </a>
                                );
                              })}
                            </div>
                          </div>
                        )}

                      </div>
                    </div>

                    {/* Action Buttons Right Side */}
                    <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
                      
                      {/* Coordinator Henri Validation Action Button */}
                      {isCoordinator && isPending && (
                        <button
                          type="button"
                          onClick={(e) => handleValidateCompletion(task.id, e)}
                          disabled={validatingTaskId === task.id}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md transition flex items-center space-x-1.5 animate-pulse"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>{validatingTaskId === task.id ? 'Validation...' : '✅ Valider la finalisation'}</span>
                        </button>
                      )}

                      {/* Member Finalize Button (if not already pending/archived) */}
                      {!isPending && !isArchived && (
                        <button
                          type="button"
                          onClick={() => openCompletionModal(task)}
                          className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow transition flex items-center space-x-1"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>Finaliser & Justifier</span>
                        </button>
                      )}

                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* MEMBER TASK COMPLETION MODAL */}
      {completingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-lg w-full p-6 shadow-2xl space-y-5">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-2xl bg-amber-100 text-amber-700">
                  <CheckSquare className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Finaliser la Tâche
                  </h3>
                  <p className="text-xs text-slate-500 truncate max-w-[280px]">
                    {completingTask.title}
                  </p>
                </div>
              </div>

              <button
                onClick={closeCompletionModal}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCompletionSubmit} className="space-y-4 text-xs">
              
              <div className="space-y-1">
                <label className="block font-extrabold text-slate-700">
                  Compte rendu / Notes d'accomplissement
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Décrivez les actions réalisées (ex: Ramonage effectué, fioul vérifié, facture jointe)..."
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-amber-500 focus:outline-none text-slate-900 font-medium"
                />
              </div>

              {/* Multi-File Upload Drag & Drop Zone */}
              <div className="space-y-2 pt-1">
                <label className="block font-extrabold text-slate-700 flex items-center justify-between">
                  <span>Joindre des justificatifs / factures</span>
                  <span className="text-[10px] text-slate-400">PDF, JPG, PNG, MD</span>
                </label>

                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all ${
                    isDragOver
                      ? 'border-amber-500 bg-amber-50/50 scale-[1.01]'
                      : 'border-slate-200 bg-slate-50/50 hover:border-amber-500/50'
                  }`}
                >
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png,.md,.txt"
                    ref={fileInputRef}
                    onChange={handleFileInputChange}
                    className="hidden"
                  />

                  <div className="flex flex-col items-center justify-center space-y-1.5">
                    <div className="p-2.5 rounded-full bg-amber-100 text-amber-700">
                      <Upload className="w-5 h-5" />
                    </div>
                    <div className="text-xs font-bold text-slate-800">
                      Glissez vos factures/photos ici ou <span className="text-amber-600 underline">parcourez</span>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Stockage automatique dans /uploads/documents/
                    </p>
                  </div>
                </div>

                {/* Selected Files Preview List */}
                {completionFiles.length > 0 && (
                  <div className="space-y-1.5 pt-2">
                    <span className="text-[11px] font-bold text-slate-700">
                      Fichiers prêts à être envoyés ({completionFiles.length}) :
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {completionFiles.map((file, idx) => (
                        <div
                          key={idx}
                          className="flex items-center space-x-2 px-3 py-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold"
                        >
                          <Paperclip className="w-3.5 h-3.5 text-amber-600" />
                          <span className="truncate max-w-[140px]">{file.name}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveFile(idx)}
                            className="text-slate-400 hover:text-red-600 ml-1"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeCompletionModal}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-black rounded-xl shadow-md transition flex items-center space-x-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSubmitting ? 'Envoi...' : 'Soumettre pour validation'}</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* CREATE & ATTRIBUTE TASK MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-2xl bg-amber-500 text-white">
                  <Plus className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    ➕ Créer / Attribuer une Tâche
                  </h3>
                  <p className="text-xs text-slate-500">
                    Ajouter une consigne ou tâche d'entretien au Domaine SCI
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTaskSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="block font-extrabold text-slate-700">
                  Titre de la Tâche *
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex: Vérification vannes d'eau & fioul"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-amber-500 focus:outline-none text-slate-900 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block font-extrabold text-slate-700">
                    Catégorie
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-amber-500 text-slate-900 font-medium"
                  >
                    <option value="Arrivée">Arrivée</option>
                    <option value="Pendant le séjour">Pendant le séjour</option>
                    <option value="Départ">Départ</option>
                    <option value="Entretien & Réparation">Entretien & Réparation</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block font-extrabold text-slate-700">
                    Membre Référent / Attribué
                  </label>
                  <select
                    value={newAssignedUser}
                    onChange={(e) => setNewAssignedUser(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-amber-500 text-slate-900 font-medium"
                  >
                    {['Henri', 'Hortense', 'Marguerite', 'Eugénie', 'Joséphine', 'Maman', 'Frédéric'].map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block font-extrabold text-slate-700">
                  Consignes & Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Consignes précises ou localisation de l'intervention..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-amber-500 focus:outline-none text-slate-900 font-medium"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isCreatingTask}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-black rounded-xl shadow-md transition flex items-center space-x-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>{isCreatingTask ? 'Création...' : 'Créer & Attribuer'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
