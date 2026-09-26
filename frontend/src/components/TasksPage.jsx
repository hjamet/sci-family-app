import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchTasks, createTask, fetchProjects, createProject } from '../api';
import TaskDetailModal from './TaskDetailModal';
import VoteRoofModal from './VoteRoofModal';
import NewProjectModal from './NewProjectModal';
import NewTaskModal from './NewTaskModal';

const AUTHENTIC_ASSOCIATES = [
  { id: 'all', name: 'Tous les associés', shortName: 'Tous' },
  { id: 'henri', name: 'Henri Jamet', shortName: 'Henri' },
  { id: 'hortense', name: 'Hortense Jamet', shortName: 'Hortense' },
  { id: 'marguerite', name: 'Marguerite Jamet', shortName: 'Marguerite' },
  { id: 'eugenie', name: 'Eugénie Jamet', shortName: 'Eugénie' },
  { id: 'josephine', name: 'Joséphine Jamet', shortName: 'Joséphine' },
  { id: 'maman', name: 'Maman (Élisabeth) Jamet', shortName: 'Maman' },
  { id: 'frederic', name: 'Frédéric Jamet', shortName: 'Frédéric' },
];

export default function TasksPage({ currentUser = 'Henri Jamet' }) {
  const navigate = useNavigate();

  // Tasks state
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('urgency');
  const [selectedPriority, setSelectedPriority] = useState('Toutes');
  const [selectedAssignee, setSelectedAssignee] = useState('all');
  const [selectedSubject, setSelectedSubject] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Voting Spotlight Carrousel State
  const [activeVoteIndex, setActiveVoteIndex] = useState(0);

  // Modal states
  const [inspectingTask, setInspectingTask] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isRoofVoteModalOpen, setIsRoofVoteModalOpen] = useState(false);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);

  // Dynamic filter options based on authentic members and active tasks count
  const memberFilterOptions = useMemo(() => {
    return AUTHENTIC_ASSOCIATES.map((m) => {
      if (m.id === 'all') {
        return { id: 'all', label: `Tous les associés (${tasks.length})` };
      }
      const count = tasks.filter((t) => {
        const target = m.shortName.toLowerCase();
        return (
          t.assignee?.toLowerCase().includes(target) ||
          (Array.isArray(t.assigned_members) && t.assigned_members.some((am) => am.toLowerCase().includes(target)))
        );
      }).length;
      return { id: m.id, label: `${m.name} (${count})`, name: m.name };
    });
  }, [tasks]);

  // Synchronisation des votes de toiture
  const [roofVoteStats, setRoofVoteStats] = useState({
    pourCount: 4,
    totalCount: 7,
    pourPct: 57,
    abstentionPct: 14,
    attentePct: 29,
    pourNames: 'Hortense, Henri, Marguerite, Eugénie',
    hasVoted: true,
  });

  // Liste des scrutins en cours pour le carrousel (dérivée dynamiquement des projets réels en BDD)
  const votesList = useMemo(() => {
    if (!projects || projects.length === 0) {
      return [];
    }
    return projects.map((p, idx) => {
      const votes = p.votes || [];
      const pourVotes = votes.filter(v => ['OUI', 'POUR'].includes(v.vote));
      const absVotes = votes.filter(v => v.vote === 'ABSTENTION');
      const contreVotes = votes.filter(v => ['NON', 'CONTRE'].includes(v.vote));
      const pourCount = pourVotes.length;
      const pourPct = Math.round((pourCount / 7) * 100);
      const absPct = Math.round((absVotes.length / 7) * 100);
      const attentePct = Math.max(0, 100 - pourPct - absPct);
      const isRoof = p.title && p.title.toLowerCase().includes('toiture');

      return {
        id: p.id,
        number: `${idx + 1} sur ${projects.length}`,
        badgeStatus: p.status === 'EN_COURS' ? 'Vote formel en cours' : (p.status || 'Consultation'),
        budgetText: `Enveloppe budgétaire : ${(p.estimated_cost || 0).toLocaleString('fr-FR')} € TTC`,
        title: p.title,
        description: p.description || '',
        participationText: `Participation : ${votes.length}/7 voix exprimées (${Math.round((votes.length / 7) * 100)}%)`,
        quorumText: votes.length >= 4 ? 'Majorité qualifiée acquise' : 'En cours d\'instruction',
        pourWidth: `${pourPct}%`,
        abstentionWidth: `${absPct}%`,
        attenteWidth: `${attentePct}%`,
        pourLabel: `${pourCount} Pour`,
        abstentionLabel: `${absVotes.length} Abstention`,
        attenteLabel: `${Math.max(0, 7 - votes.length)} en attente`,
        deadline: 'Consultation active',
        reporter: {
          name: p.submitted_by || 'Henri Jamet',
          initials: (p.submitted_by || 'Henri Jamet').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(),
          role: p.submitted_by === 'Henri Jamet' ? 'Rapporteur du dossier' : 'Porteur du projet',
        },
        isRoofVote: isRoof,
      };
    });
  }, [projects]);

  const currentVote = votesList.length > 0 ? (votesList[activeVoteIndex] || votesList[0]) : null;

  const loadTasks = async () => {
    try {
      setLoading(true);
      const [taskData, projData] = await Promise.all([
        fetchTasks().catch(err => {
          console.warn('API fetchTasks fallback:', err);
          return [];
        }),
        fetchProjects().catch(err => {
          console.warn('API fetchProjects fallback:', err);
          return [];
        }),
      ]);
      setTasks(Array.isArray(taskData) ? taskData : []);
      setProjects(Array.isArray(projData) ? projData : []);
    } catch (err) {
      console.warn('API loadTasks fallback:', err);
      setTasks([]);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const handleTaskCreated = async (createdTask) => {
    if (createdTask) {
      setTasks((prev) => {
        if (prev.some((t) => t.id === createdTask.id || (createdTask.ref && t.ref === createdTask.ref))) {
          return prev;
        }
        return [createdTask, ...prev];
      });
    }
    await loadTasks();
  };

  const handleCreateProjectSubmit = async (projectData) => {
    try {
      await createProject(projectData);
      setIsNewProjectModalOpen(false);
      await loadTasks();
      alert('Initiative créée et soumise au vote statutaire de la SCI.');
    } catch (err) {
      console.error('Erreur création initiative:', err);
      setIsNewProjectModalOpen(false);
    }
  };

  const handleVoteRoofSubmit = (voteResult) => {
    if (voteResult?.vote === 'POUR') {
      setRoofVoteStats(prev => ({
        ...prev,
        pourCount: 5,
        pourPct: 71,
        abstentionPct: 14,
        attentePct: 15,
        pourNames: 'Hortense, Henri, Marguerite, Eugénie, Associé',
      }));
    }
  };

  // Filtrage des tâches
  const filteredTasks = tasks.filter((t) => {
    // Recherche textuelle
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const match =
        t.title?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.subject?.toLowerCase().includes(q) ||
        t.assignee?.toLowerCase().includes(q) ||
        t.ref?.toLowerCase().includes(q) ||
        t.category?.toLowerCase().includes(q);
      if (!match) return false;
    }

    // Filtre Priorité
    if (selectedPriority !== 'Toutes') {
      if (t.priority?.toLowerCase() !== selectedPriority.toLowerCase()) return false;
    }

    // Filtre Assigné
    if (selectedAssignee !== 'all') {
      const target = selectedAssignee.toLowerCase();
      const matchesAssignee =
        t.assignee?.toLowerCase().includes(target) ||
        (Array.isArray(t.assigned_members) && t.assigned_members.some((m) => m.toLowerCase().includes(target)));
      if (!matchesAssignee) return false;
    }

    // Filtre Sujet
    if (selectedSubject !== 'all') {
      if (t.subject?.toLowerCase() !== selectedSubject.toLowerCase()) return false;
    }

    // Filtre Domaine / Catégorie
    if (selectedCategory !== 'all') {
      const cat = selectedCategory.toLowerCase();
      const taskCat = (t.category || '').toLowerCase();
      if (!taskCat.includes(cat)) return false;
    }

    return true;
  });

  // Tri des tâches
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    if (sortBy === 'urgency') {
      const priorityOrder = { Critique: 4, Haute: 3, Normale: 2, Planifié: 1 };
      return (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
    }
    if (sortBy === 'budget_desc') {
      return (b.budget || 0) - (a.budget || 0);
    }
    if (sortBy === 'deadline') {
      return (a.id || 0) - (b.id || 0);
    }
    return 0;
  });

  // Comptages dynamiques pour les pilules
  const countsByPriority = {
    Toutes: tasks.length,
    Critique: tasks.filter(t => t.priority === 'Critique').length,
    Haute: tasks.filter(t => t.priority === 'Haute').length,
    Normale: tasks.filter(t => t.priority === 'Normale').length,
    Planifié: tasks.filter(t => t.priority === 'Planifié').length,
  };

  const currentUserName = typeof currentUser === 'string' ? currentUser : 'Henri Jamet';
  const myTasksCount = tasks.filter(t => 
    t.assignee === currentUserName || 
    t.assignee_name === currentUserName || 
    (Array.isArray(t.assigned_members) && t.assigned_members.includes(currentUserName))
  ).length;

  const completedTasksCount = tasks.filter(t => 
    t.status === 'TERMINÉE' || 
    t.status === 'TERMINEE' || 
    t.status === 'VALIDÉ' || 
    t.status === 'VALIDE' || 
    t.status === 'ARCHIVÉ' || 
    t.status === 'ARCHIVEE' || 
    t.status === 'completed'
  ).length;

  const totalTasks = tasks.length;
  const openTasksCount = Math.max(0, totalTasks - completedTasksCount);

  // ANNOTATION 4 : Avec 0 tâche (ou 0 tâche ouverte restante), l'avancement doit être strictement de 100% !
  const avgProgress = totalTasks === 0 || openTasksCount === 0 
    ? 100 
    : Math.round((completedTasksCount / totalTasks) * 100);

  return (
    <div className="flex flex-col w-full pb-16">
      
      {/* ========================================================================= */}
      {/* 1. EN-TÊTE HARMONISÉ HERO                                                 */}
      {/* ========================================================================= */}
      <section className="relative overflow-hidden rounded-2xl bg-slate-100/80 border border-slate-200/80 dark:bg-slate-900/30 dark:border-slate-800/40 p-6 sm:p-8 shadow-sm mb-6">
        {/* Subtle decorative glow */}
        <div className="absolute -right-24 -top-24 w-96 h-96 rounded-full bg-slate-200/50 dark:bg-slate-800/20 blur-3xl pointer-events-none"></div>
        <div className="absolute -left-12 -bottom-12 w-64 h-64 rounded-full bg-blue-100/40 dark:bg-blue-900/10 blur-2xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-200/80 text-slate-800 dark:bg-slate-800/60 dark:text-slate-200 font-label-sm text-xs font-semibold uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-slate-600 dark:bg-slate-400 animate-pulse"></span>
              ENTRETIEN & DÉCISIONS
            </span>
            <h1 className="font-display-lg text-2xl sm:text-3xl lg:text-display-lg text-forest-deep dark:text-slate-100 tracking-tight font-bold mt-2">
              Tâches & Chantiers
            </h1>
            <p className="font-body-md text-sm sm:text-base text-on-surface-variant dark:text-slate-300 leading-relaxed">
              Missions réparties entre associés, avancement des travaux et votes décisionnels.
            </p>
          </div>

          {/* Actions : Style Signature */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0 pt-2 md:pt-0">
            <button
              onClick={() => window.print()}
              className="group flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-white dark:bg-slate-900 border-2 border-outline-variant text-on-surface hover:bg-canvas-slate hover:border-outline font-label-lg text-sm sm:text-base transition-all duration-200 shadow-sm cursor-pointer whitespace-nowrap"
              type="button"
            >
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant group-hover:scale-110 transition-transform">download</span>
              <span>Exporter en PDF</span>
            </button>

            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="group flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-white dark:bg-slate-900 border-2 border-primary text-primary hover:bg-sage-soft font-label-lg text-sm sm:text-base font-bold shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer whitespace-nowrap"
              type="button"
            >
              <span className="material-symbols-outlined text-[22px] group-hover:scale-110 transition-transform">add_task</span>
              <span>+ Proposer une tâche</span>
            </button>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 2. KPI OVERVIEW STRIP: 3 METRIC CARDS (Stitch)                            */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-space-md mb-space-lg max-w-[1100px] mx-auto w-full">
        
        {/* KPI 1 : Tâches Ouvertes */}
        <div className="bg-surface-container-lowest rounded-lg p-space-md shadow-sm flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider block">
                Tâches Ouvertes
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="font-display-lg text-display-lg text-forest-deep font-bold leading-none">
                  {tasks.length}
                </span>
                <span className="font-label-sm text-label-sm text-on-surface-variant">chantiers</span>
              </div>
            </div>
            <div className="w-11 h-11 rounded-DEFAULT bg-sage-soft flex items-center justify-center text-primary-container">
              <span className="material-symbols-outlined text-[24px]">construction</span>
            </div>
          </div>
          <div className="mt-4 pt-3 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${countsByPriority.Critique + countsByPriority.Haute > 0 ? 'bg-error animate-pulse' : 'bg-outline-variant'}`}></span>
            <span className={`font-label-sm text-label-sm ${countsByPriority.Critique + countsByPriority.Haute > 0 ? 'text-error font-semibold' : 'text-on-surface-variant'}`}>
              {countsByPriority.Critique + countsByPriority.Haute} chantiers prioritaires
            </span>
            <span className="text-on-surface-variant font-body-md text-body-md">à traiter</span>
          </div>
        </div>

        {/* KPI 2 : Mes Tâches Directes */}
        <div className="bg-surface-container-lowest rounded-lg p-space-md shadow-sm flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider block">
                Mes Tâches Directes
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="font-display-lg text-display-lg text-primary font-bold leading-none">
                  {myTasksCount}
                </span>
                <span className="font-label-sm text-label-sm text-on-surface-variant">chantiers actifs</span>
              </div>
            </div>
            <div className="w-11 h-11 rounded-DEFAULT bg-surface-container-high flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[24px]">assignment_ind</span>
            </div>
          </div>
          <div className="mt-4 pt-3 flex items-center gap-1.5 text-on-surface-variant font-label-sm text-label-sm">
            <span className="w-2 h-2 rounded-full bg-primary"></span>
            <span>{currentUserName} (Gérance SCI)</span>
          </div>
        </div>

        {/* KPI 3 : Avancement Global */}
        <div className="bg-surface-container-lowest rounded-lg p-space-md shadow-sm flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider block">
                Avancement Global
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="font-display-lg text-display-lg text-forest-deep font-bold leading-none">{avgProgress}</span>
                <span className="font-headline-sm text-headline-sm text-forest-deep font-semibold">%</span>
              </div>
            </div>
            <div className="w-12 h-12 relative flex items-center justify-center">
              <svg className="w-12 h-12 transform -rotate-90" viewBox="0 0 44 44">
                <circle className="text-surface-container" cx="22" cy="22" fill="none" r="18" stroke="currentColor" strokeWidth="4"></circle>
                <circle
                  className="text-primary-container"
                  cx="22"
                  cy="22"
                  fill="none"
                  r="18"
                  stroke="currentColor"
                  strokeDasharray="113.1"
                  strokeDashoffset={113.1 - (113.1 * (avgProgress / 100))}
                  strokeLinecap="round"
                  strokeWidth="4"
                ></circle>
              </svg>
              <span className="absolute text-[11px] font-bold text-forest-deep">
                {totalTasks === 0 ? '100%' : `${completedTasksCount}/${totalTasks}`}
              </span>
            </div>
          </div>
          <div className="mt-4 pt-3 flex items-center justify-between text-on-surface-variant font-label-sm text-label-sm">
            <span>{completedTasksCount} chantiers achevés</span>
            <span className="text-primary font-semibold">{openTasksCount} en cours</span>
          </div>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* 3. DÉMOCRATIE FAMILIALE & SCRUTINS EN COURS (Spotlight Unifié Stitch)    */}
      {/* ========================================================================= */}
      <section className="mb-space-lg bg-surface-container-lowest rounded-xl p-space-md lg:p-space-lg shadow-sm flex flex-col gap-space-md border border-border-subtle">
        
        {/* Section Header with Navigation and New Vote Trigger */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md border-b border-subtle pb-space-md">
          <div className="flex items-center gap-space-sm">
            <div className="w-12 h-12 rounded-full bg-sage-soft flex items-center justify-center text-primary-container shrink-0">
              <span className="material-symbols-outlined text-[26px]">how_to_vote</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-headline-sm text-headline-sm text-forest-deep font-bold">
                  Démocratie Familiale & Scrutins en cours
                </h2>
                {currentVote && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sage-soft text-primary">
                    Vote {currentVote.number}
                  </span>
                )}
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant mt-0.5 text-xs sm:text-sm">
                Règle de Délégation & Seuil Budgétaire : Vote statutaire requis pour tout engagement &gt; 300 € sur les fonds communs de la SCI
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {votesList.length > 1 && (
              <div className="flex items-center gap-1 mr-2">
                <button
                  onClick={() => setActiveVoteIndex(prev => (prev > 0 ? prev - 1 : votesList.length - 1))}
                  className="w-9 h-9 rounded-DEFAULT border-2 border-outline-variant text-on-surface-variant flex items-center justify-center hover:bg-canvas-slate transition-colors cursor-pointer"
                  title="Précédent"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                </button>
                <button
                  onClick={() => setActiveVoteIndex(prev => (prev < votesList.length - 1 ? prev + 1 : 0))}
                  className="w-9 h-9 rounded-DEFAULT border-2 border-outline-variant text-on-surface-variant flex items-center justify-center hover:bg-canvas-slate transition-colors cursor-pointer"
                  title="Suivant"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                </button>
              </div>
            )}

            <button
              onClick={() => setIsNewProjectModalOpen(true)}
              className="h-[46px] px-5 rounded-DEFAULT bg-surface-container-lowest border-2 border-primary-container text-primary-container font-label-md text-label-md hover:bg-sage-soft hover:border-primary transition-all flex items-center gap-2 shadow-sm font-semibold cursor-pointer"
              type="button"
            >
              <span className="material-symbols-outlined text-[20px]">how_to_vote</span>
              <span>Ouvrir un vote formel</span>
            </button>
          </div>
        </div>

        {/* Voting Card (Dynamic or Empty State) */}
        {currentVote ? (
          <div className="bg-surface-container-low rounded-lg p-space-md border border-subtle">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-space-md mb-space-sm">
              <div className="space-y-1.5 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-soft text-amber-rich font-label-sm text-label-sm font-semibold">
                    <span className="w-2 h-2 rounded-full bg-amber-rich animate-pulse"></span>
                    {currentVote.badgeStatus}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-lowest text-forest-deep font-label-sm text-label-sm font-semibold border border-subtle">
                    <span className="material-symbols-outlined text-[16px] text-primary">account_balance_wallet</span>
                    {currentVote.budgetText}
                  </span>
                </div>
                <h3 className="font-headline-sm text-headline-sm text-forest-deep pt-1 font-bold">
                  {currentVote.title}
                </h3>
                <p className="font-body-md text-body-md text-on-surface-variant text-xs sm:text-sm">
                  {currentVote.description}
                </p>
              </div>

              <div className="flex flex-col items-start lg:items-end gap-1 shrink-0">
                <span className="font-label-sm text-label-sm text-forest-deep font-semibold">
                  {currentVote.participationText}
                </span>
                <span className="text-[12px] text-primary font-medium flex items-center gap-1">
                  <span className="material-symbols-outlined text-[15px]">verified</span>
                  {currentVote.quorumText}
                </span>
              </div>
            </div>

            {/* Tri-segmented Progress Bar */}
            <div className="w-full h-3 bg-surface-container-highest rounded-full overflow-hidden flex my-2">
              <div className="h-full bg-primary transition-all duration-500" style={{ width: currentVote.pourWidth }} title="Pour"></div>
              <div className="h-full bg-amber-rich transition-all duration-500" style={{ width: currentVote.abstentionWidth }} title="Abstention"></div>
              <div className="h-full bg-outline-variant transition-all duration-500" style={{ width: currentVote.attenteWidth }} title="En attente"></div>
            </div>

            {/* Detailed Voter Breakdown */}
            <div className="flex flex-wrap items-center justify-between text-[12px] text-on-surface-variant pt-1 pb-space-sm">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="flex items-center gap-1.5 font-medium text-forest-deep">
                  <span className="w-2.5 h-2.5 rounded-full bg-primary"></span>
                  {currentVote.pourLabel}
                </span>
                <span className="flex items-center gap-1.5 font-medium text-amber-rich">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-rich"></span>
                  {currentVote.abstentionLabel}
                </span>
                <span className="flex items-center gap-1.5 text-on-surface-variant">
                  <span className="w-2.5 h-2.5 rounded-full bg-outline-variant"></span>
                  {currentVote.attenteLabel}
                </span>
              </div>
              <span className="text-xs italic">{currentVote.deadline}</span>
            </div>

            {/* Card Footer: Reporter and Action Buttons */}
            <div className="border-t border-subtle pt-space-sm flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-full bg-primary text-on-primary font-bold text-xs flex items-center justify-center ring-2 ring-surface-container-lowest"
                  title={currentVote.reporter.name}
                >
                  {currentVote.reporter.initials}
                </div>
                <div className="flex flex-col">
                  <span className="font-label-sm text-label-sm text-on-surface font-semibold leading-tight">
                    {currentVote.reporter.name}
                  </span>
                  <span className="text-[12px] text-on-surface-variant leading-tight">
                    {currentVote.reporter.role}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsRoofVoteModalOpen(true)}
                  className="h-[44px] px-4 rounded-DEFAULT bg-surface-container-lowest border-2 border-outline-variant text-on-surface font-label-md text-label-md hover:bg-canvas-slate transition-all flex items-center gap-2 cursor-pointer font-medium"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[18px] text-on-surface-variant">visibility</span>
                  <span>Voir le dossier</span>
                </button>

                <button
                  onClick={() => setIsRoofVoteModalOpen(true)}
                  className="h-[44px] px-5 rounded-DEFAULT bg-surface-container-lowest border-2 border-primary-container text-primary-container font-label-md text-label-md hover:bg-sage-soft transition-all flex items-center gap-2 font-bold cursor-pointer"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[18px] text-primary-container">how_to_vote</span>
                  <span>Participer au vote</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-surface-container-low rounded-lg p-space-lg border border-subtle flex flex-col items-center justify-center text-center py-12">
            <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant mb-3">
              <span className="material-symbols-outlined text-[28px]">how_to_vote</span>
            </div>
            <h3 className="font-headline-sm text-headline-sm text-forest-deep font-bold mb-1">
              Aucun scrutin statutaire en cours
            </h3>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-md text-sm mb-4">
              Les projets et engagements de dépenses (&gt; 300 €) soumis à la délibération et au vote des associés de la SCI apparaîtront ici.
            </p>
            <button
              onClick={() => setIsNewProjectModalOpen(true)}
              className="h-[44px] px-5 rounded-DEFAULT bg-surface-container-lowest border-2 border-primary-container text-primary-container font-label-md text-label-md hover:bg-sage-soft transition-all flex items-center gap-2 font-bold cursor-pointer"
              type="button"
            >
              <span className="material-symbols-outlined text-[18px]">add_circle</span>
              <span>Soumettre un nouveau projet au vote</span>
            </button>
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* 4. FILTRATION & SEARCH CONTROL CONSOLE (Stitch)                           */}
      {/* ========================================================================= */}
      <section className="bg-surface-container-lowest rounded-xl p-space-md lg:p-space-lg shadow-sm mb-space-lg flex flex-col gap-space-md border border-border-subtle">
        
        {/* Top Row: Search Input + Sorting Selector */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-space-md">
          {/* Search Input with icon */}
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-[22px]">
              search
            </span>
            <input
              id="taskSearchInput"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher par mot-clé, artisan, pièce ou lot..."
              className="w-full h-[52px] pl-12 pr-4 bg-canvas-slate rounded-DEFAULT text-on-surface font-body-md text-body-md focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary-container transition-all"
            />
          </div>

          {/* Sorting Controller */}
          <div className="flex items-center gap-space-xs shrink-0">
            <span className="font-label-sm text-label-sm text-on-surface-variant whitespace-nowrap flex items-center gap-1 font-semibold">
              <span className="material-symbols-outlined text-[18px]">sort</span>
              Trier par :
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="h-[52px] px-4 pr-9 bg-canvas-slate rounded-DEFAULT font-label-sm text-label-sm text-on-surface font-semibold focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer transition-colors"
            >
              <option value="urgency">Degré d'urgence (priorité haute)</option>
              <option value="deadline">Date d'échéance la plus proche</option>
              <option value="budget_desc">Budget prévisionnel (décroissant)</option>
              <option value="updated">Dernière mise à jour</option>
            </select>
          </div>
        </div>

        {/* Filter Multi-Level Row: Urgence Chips */}
        <div className="flex flex-col gap-space-xs">
          <span className="font-label-sm text-label-sm text-on-surface-variant font-semibold uppercase tracking-wider">
            Priorité & Niveau d'Alerte :
          </span>
          <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-none" id="priorityFilters">
            {[
              { id: 'Toutes', label: 'Toutes', dotClass: '' },
              { id: 'Critique', label: 'Critique', dotClass: 'bg-error' },
              { id: 'Haute', label: 'Haute', dotClass: 'bg-amber-rich' },
              { id: 'Normale', label: 'Normale', dotClass: 'bg-secondary' },
              { id: 'Planifié', label: 'Planifié', dotClass: 'bg-outline' },
            ].map((p) => {
              const isActive = selectedPriority === p.id;
              const count = countsByPriority[p.id] || 0;

              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPriority(p.id)}
                  className={`filter-pill px-4 py-2 rounded-full font-label-sm text-label-sm flex items-center gap-2 cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-sage-soft text-primary font-bold shadow-sm'
                      : 'bg-canvas-slate text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                  }`}
                >
                  {p.dotClass && <span className={`w-2 h-2 rounded-full ${p.dotClass}`}></span>}
                  <span>{p.label}</span>
                  <span
                    className={`text-[11px] px-1.5 py-0.5 rounded-full font-bold ${
                      isActive ? 'bg-primary/10 text-primary' : 'bg-outline/10 text-on-surface-variant'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Filter Multi-Level Row: Dropdown Selectors for Associés, Catégorie, Bâtiments */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-space-sm pt-2">
          {/* Associé Responsable */}
          <div className="flex flex-col gap-1.5">
            <label className="font-label-sm text-label-sm text-on-surface font-semibold flex items-center gap-1.5" htmlFor="assigneeFilter">
              <span className="material-symbols-outlined text-[18px] text-primary">groups</span>
              Responsable / Associé
            </label>
            <select
              id="assigneeFilter"
              value={selectedAssignee}
              onChange={(e) => setSelectedAssignee(e.target.value)}
              className="h-[46px] px-3.5 bg-canvas-slate rounded-DEFAULT font-label-sm text-label-sm text-on-surface font-medium focus:ring-2 focus:ring-primary focus:outline-none cursor-pointer"
            >
              {memberFilterOptions.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Domaine / Catégorie (Spécification Annotation 5) */}
          <div className="flex flex-col gap-1.5">
            <label className="font-label-sm text-label-sm text-on-surface font-semibold flex items-center gap-1.5" htmlFor="categoryFilter">
              <span className="material-symbols-outlined text-[18px] text-primary">category</span>
              Domaine / Catégorie
            </label>
            <select
              id="categoryFilter"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="h-[46px] px-3.5 bg-canvas-slate rounded-DEFAULT font-label-sm text-label-sm text-on-surface font-medium focus:ring-2 focus:ring-primary focus:outline-none cursor-pointer"
            >
              <option value="all">Tous les domaines</option>
              <option value="entretien">Entretien</option>
              <option value="travaux">Travaux</option>
              <option value="espaces verts">Espaces verts</option>
              <option value="administratif">Administratif</option>
              <option value="piscine">Piscine</option>
              <option value="chauffage">Chauffage</option>
            </select>
          </div>

          {/* Lieu / Bâtiment */}
          <div className="flex flex-col gap-1.5">
            <label className="font-label-sm text-label-sm text-on-surface font-semibold flex items-center gap-1.5" htmlFor="subjectFilter">
              <span className="material-symbols-outlined text-[18px] text-primary">label</span>
              Sujet / Lieu
            </label>
            <select
              id="subjectFilter"
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="h-[46px] px-3.5 bg-canvas-slate rounded-DEFAULT font-label-sm text-label-sm text-on-surface font-medium focus:ring-2 focus:ring-primary focus:outline-none cursor-pointer"
            >
              <option value="all">Tous les sujets</option>
              <option value="rosing">Rosing</option>
              <option value="presbytere">Presbytère</option>
              <option value="piscine">Piscine</option>
              <option value="jardin">Jardin</option>
              <option value="sci">SCI</option>
            </select>
          </div>
        </div>

      </section>

      {/* ========================================================================= */}
      {/* 5. SECTION TITLE & COUNTER SUMMARY (Stitch)                              */}
      {/* ========================================================================= */}
      <div className="flex items-center justify-between mb-space-md">
        <div className="flex items-center gap-2">
          <h2 className="font-headline-md text-headline-md text-forest-deep tracking-tight font-bold">
            Chantiers Actifs & Arbitrages
          </h2>
          <span className="bg-sage-soft text-forest-deep font-label-sm text-label-sm font-bold px-2.5 py-0.5 rounded-full">
            {sortedTasks.length} affichés
          </span>
        </div>
        <span className="font-label-sm text-label-sm text-on-surface-variant hidden sm:inline-block">
          Dernière synchronisation le 24 mai 2026 à 09:42
        </span>
      </div>

      {/* ========================================================================= */}
      {/* 6. GRID OF TASK CARDS (Stitch)                                           */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-md" id="tasksContainer">
        {sortedTasks.length === 0 ? (
          <div className="col-span-full py-12 px-6 bg-surface-container-lowest rounded-xl border border-dashed border-border-subtle flex flex-col items-center justify-center text-center">
            <div className="w-14 h-14 rounded-full bg-sage-soft text-forest-deep flex items-center justify-center mb-3">
              <span className="material-symbols-outlined text-[32px]">checklist_rtl</span>
            </div>
            <h4 className="font-headline-sm text-base font-bold text-forest-deep">
              Aucune tâche ne correspond à vos critères
            </h4>
            <p className="font-body-md text-xs sm:text-sm text-on-surface-variant max-w-md mt-1">
              Modifiez vos termes de recherche ou réinitialisez les filtres pour afficher l'ensemble des chantiers.
            </p>
            <div className="flex items-center gap-3 mt-4">
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedPriority('Toutes');
                  setSelectedAssignee('all');
                  setSelectedSubject('all');
                  setSelectedCategory('all');
                }}
                className="px-4 py-2 bg-canvas-slate text-on-surface text-xs font-bold rounded-DEFAULT hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Réinitialiser les filtres
              </button>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="px-4 py-2 bg-sage-soft text-primary-container text-xs font-bold rounded-DEFAULT hover:bg-emerald-100 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">add_task</span>
                <span>Proposer une tâche</span>
              </button>
            </div>
          </div>
        ) : (
          sortedTasks.map((t) => {
            const isCritical = t.priority === 'Critique';
            const isHigh = t.priority === 'Haute';
            const isNormal = t.priority === 'Normale';

            return (
              <article
                key={t.id}
                className="bg-surface-container-lowest rounded-xl p-space-md lg:p-space-lg shadow-sm hover:shadow-md transition-all flex flex-col justify-between group border border-border-subtle"
              >
                <div>
                  {/* Badges row */}
                  <div className="flex flex-wrap items-center gap-space-xs mb-3">
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
                      {t.priority}
                    </span>

                    {/* Domaine / Catégorie */}
                    {t.category && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sage-soft text-forest-deep font-label-sm text-label-sm font-semibold">
                        <span className="material-symbols-outlined text-[16px] text-primary">
                          {t.category === 'Entretien' ? 'handyman' :
                           t.category === 'Travaux' ? 'construction' :
                           t.category === 'Espaces verts' ? 'yard' :
                           t.category === 'Administratif' ? 'description' :
                           t.category === 'Piscine' ? 'pool' :
                           t.category === 'Chauffage' ? 'thermostat' : 'category'}
                        </span>
                        {t.category}
                      </span>
                    )}

                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-canvas-slate text-on-surface font-label-sm text-label-sm">
                      <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
                        {t.subject_icon || 'home_work'}
                      </span>
                      {t.subject}
                    </span>

                    {/* Estimation de charge / points */}
                    {t.complexity && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-canvas-slate text-on-surface-variant font-label-sm text-label-sm border border-slate-200">
                        <span className="material-symbols-outlined text-[15px] text-primary">bolt</span>
                        <span>{t.complexity}</span>
                      </span>
                    )}

                    {t.extra_tag && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-canvas-slate text-on-surface font-label-sm text-label-sm">
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
                          {t.extra_tag === 'SCI' ? 'account_balance' : t.extra_tag === 'Piscine' ? 'pool' : 'home'}
                        </span>
                        {t.extra_tag}
                      </span>
                    )}
                  </div>

                  {/* Title & Budget */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-2">
                    <h3 className="font-headline-sm text-headline-sm text-forest-deep group-hover:text-primary transition-colors font-bold">
                      {t.title}
                    </h3>
                    <div className="shrink-0 bg-sage-soft px-3 py-1 rounded-DEFAULT text-right">
                      <span className="text-[11px] block font-medium text-on-surface-variant leading-none">
                        {t.budget_type || 'Estimation'}
                      </span>
                      <span className="font-label-md text-label-md text-forest-deep font-bold">
                        {t.budget_label || (t.budget ? `~${t.budget} € TTC` : 'Inclus SCI')}
                      </span>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="font-body-md text-body-md text-on-surface-variant mb-space-md text-xs sm:text-sm leading-relaxed">
                    {t.description}
                  </p>

                  {/* Progress Box with Shimmer */}
                  <div className="p-space-xs px-3 bg-surface-container-low rounded-DEFAULT mb-space-md border border-slate-100">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5 text-label-sm font-semibold text-forest-deep text-xs">
                        <span className="material-symbols-outlined text-[18px] text-primary">
                          {t.step_icon || 'checklist'}
                        </span>
                        <span>{t.step_label || 'Avancement opérationnel'}</span>
                      </div>
                      <span
                        className={`font-label-sm font-bold px-2 py-0.5 rounded-full text-xs ${
                          isCritical
                            ? 'text-error bg-error-container/40'
                            : isHigh
                            ? 'text-amber-rich bg-amber-soft'
                            : 'text-primary bg-sage-soft'
                        }`}
                      >
                        {t.progress || 50}%
                      </span>
                    </div>

                    <div className="w-full h-2 bg-surface-container-high rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 progress-shimmer ${
                          isCritical
                            ? 'bg-gradient-to-r from-red-500 to-rose-600'
                            : isHigh
                            ? 'bg-gradient-to-r from-amber-500 to-emerald-600'
                            : 'bg-gradient-to-r from-teal-500 to-emerald-600'
                        }`}
                        style={{ width: `${t.progress || 50}%` }}
                      ></div>
                    </div>
                  </div>

                </div>

                {/* Card Footer: Assignee & Action */}
                <div className="pt-space-sm flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-2 overflow-hidden">
                      {t.avatars && t.avatars.length > 0 ? (
                        t.avatars.map((av, idx) => (
                          <div
                            key={idx}
                            className={`w-8 h-8 rounded-full ${av.bg || 'bg-primary text-on-primary'} font-bold text-xs flex items-center justify-center ring-2 ring-surface-container-lowest`}
                            title={av.name}
                          >
                            {av.initials}
                          </div>
                        ))
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-primary text-on-primary font-bold text-xs flex items-center justify-center ring-2 ring-surface-container-lowest">
                          HJ
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-label-sm text-label-sm text-on-surface font-semibold leading-tight">
                        {t.assignee || 'Henri Jamet'}
                      </span>
                      <span className="text-[12px] text-on-surface-variant leading-tight">
                        {t.role_label || 'Responsable de mission'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setInspectingTask(t)}
                    className="h-[46px] px-5 bg-surface-container-lowest border-2 border-primary-container text-primary-container font-label-md text-label-md rounded-DEFAULT hover:bg-sage-soft hover:border-primary transition-all flex items-center justify-center gap-2 shrink-0 font-semibold cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px] text-primary-container">visibility</span>
                    <span>Consulter la tâche</span>
                  </button>
                </div>

              </article>
            );
          })
        )}
      </div>

      {/* ========================================================================= */}
      {/* 7. MODALES CONNECTÉES                                                     */}
      {/* ========================================================================= */}

      {/* Modale de Vote Toiture Presbytère (Stitch) */}
      <VoteRoofModal
        isOpen={isRoofVoteModalOpen}
        onClose={() => setIsRoofVoteModalOpen(false)}
        currentUser={typeof currentUser === 'string' ? currentUser : 'Henri Jamet'}
        onVoteSubmit={handleVoteRoofSubmit}
      />

      {/* Modale d'Ouverture de Vote Formel (Initiative SCI) */}
      <NewProjectModal
        isOpen={isNewProjectModalOpen}
        onClose={() => setIsNewProjectModalOpen(false)}
        properties={[{ id: 1, name: 'Domaine d\'Hellenvilliers' }]}
        currentUser={typeof currentUser === 'string' ? currentUser : 'Henri Jamet'}
        onSubmit={handleCreateProjectSubmit}
      />

      {/* Modale de Consultation et Édition Détaillée de Tâche */}
      {inspectingTask && (
        <TaskDetailModal
          isOpen={Boolean(inspectingTask)}
          task={inspectingTask}
          onClose={() => setInspectingTask(null)}
          currentUser={currentUser}
          onTaskUpdated={loadTasks}
        />
      )}

      {/* Modale de Création Propre et Complète de Tâche (Annotations 4 & 5) */}
      <NewTaskModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        currentUser={currentUser}
        onTaskCreated={handleTaskCreated}
      />

    </div>
  );
}
