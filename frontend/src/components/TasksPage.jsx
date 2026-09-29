import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchTasks,
  createTask,
  fetchProjects,
  validateTask,
  invalidateTask,
  acceptTask,
  rejectTask,
  deleteProject,
  getCachedData,
} from '../api';
import TaskDetailModal from './TaskDetailModal';
import VoteRoofModal from './VoteRoofModal';
import { CardSkeleton, TasksContainerSkeleton, VoteCardSkeleton } from './SkeletonLoaders';
import CustomSelect from './CustomSelect';
import TaskCard from './common/TaskCard';
import WhatsAppPollView from './common/WhatsAppPollView';

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

import {
  resolveUserMeta,
  isTaskOpen,
  isTaskPendingValidation,
  isTaskProposed,
  getTaskColorCategory,
  isTaskAssignedToUser,
} from '../utils/taskAssignment';

export {
  resolveUserMeta,
  isTaskOpen,
  isTaskPendingValidation,
  isTaskProposed,
  getTaskColorCategory,
  isTaskAssignedToUser,
};

export default function TasksPage({ currentUser = 'Henri Jamet' }) {
  const navigate = useNavigate();

  // Tasks & Projects state initialisés instantanément depuis le cache SWR (< 1ms)
  const [tasks, setTasks] = useState(() => getCachedData('tasks') || []);
  const [projects, setProjects] = useState(() => getCachedData('projects') || []);
  const [loading, setLoading] = useState(() => !getCachedData('tasks') && !getCachedData('projects'));

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('urgency');
  const [selectedAssignee, setSelectedAssignee] = useState('all');
  const [selectedSubject, setSelectedSubject] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedPriority, setSelectedPriority] = useState('Toutes');
  const [workflowFilter, setWorkflowFilter] = useState('OPEN'); // 'ALL' | 'PROPOSED' | 'OPEN' | 'PENDING_VALIDATION' | 'ARCHIVED'
  const [voteFilter, setVoteFilter] = useState('OPEN'); // 'ALL' | 'PROPOSED' | 'OPEN' | 'PENDING_VALIDATION' | 'ARCHIVED'

  // Voting Spotlight Carrousel State
  const [activeVoteIndex, setActiveVoteIndex] = useState(0);

  // Modal states unifiées (Annotation 2 & 16)
  const [inspectingTask, setInspectingTask] = useState(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isTaskEditingDirect, setIsTaskEditingDirect] = useState(false);
  const [isRoofVoteModalOpen, setIsRoofVoteModalOpen] = useState(false);
  const [selectedVoteForModal, setSelectedVoteForModal] = useState(null);
  const [isVoteModalInitialEditing, setIsVoteModalInitialEditing] = useState(false);

  const handleOpenCreateTask = () => {
    setInspectingTask({
      title: '',
      description: '',
      subject: 'Rosing',
      complexity: 'Modérée',
      budget: 0,
      assigned_members: [],
      assignee: null,
      status: 'PROPOSED',
      checklist: [
        { text: 'Diagnostic initial et constat sur place', done: false },
        { text: 'Demande de devis et consultation des artisans', done: false },
        { text: 'Validation budgétaire en coordination', done: false },
        { text: 'Réalisation des travaux et contrôle final', done: false },
      ]
    });
    setIsTaskEditingDirect(true);
    setIsTaskModalOpen(true);
  };

  // ANNOTATION 9 : Câblage direct de « Proposer un vote » sur la modale unifiée VoteRoofModal
  const handleOpenCreateVote = () => {
    setSelectedVoteForModal({
      isNew: true,
      title: '',
      description: '',
      category: 'Presbytère',
      options: ['Approuver le projet', 'Rejeter le projet'],
      allow_multiple_choices: false,
    });
    setIsVoteModalInitialEditing(true);
    setIsRoofVoteModalOpen(true);
  };

  const handleOpenInspectTask = (t) => {
    setInspectingTask(t);
    setIsTaskEditingDirect(false);
    setIsTaskModalOpen(true);
  };

  // Dynamic filter options based on authentic members and active tasks count
  const memberFilterOptions = useMemo(() => {
    return AUTHENTIC_ASSOCIATES.map((m) => {
      if (m.id === 'all') {
        return { id: 'all', label: `Tous les associés (${tasks.length})` };
      }
      const memberMeta = resolveUserMeta({ prenom: m.shortName, name: m.name, id: m.id });
      const count = tasks.filter((t) => isTaskAssignedToUser(t, memberMeta)).length;
      return { id: m.id, label: `${m.name} (${count})`, name: m.name };
    });
  }, [tasks]);

  // Helpers de classification des délibérations / scrutins (Annotations 8, 10, 11)
  const isVoteArchived = (p) => {
    if (!p) return false;
    const st = String(p.status || '').toUpperCase().trim();
    return ['ARCHIVE', 'ARCHIVEE', 'CLOS', 'TERMINE', 'ADOPTE', 'APPROUVE', 'REJETE', 'REFUSE'].includes(st);
  };

  const isVoteProposed = (p) => {
    if (!p || isVoteArchived(p)) return false;
    const st = String(p.status || '').toUpperCase().trim();
    return ['SOUMIS', 'SOUMISE', 'PROPOSE', 'PROPOSEE', 'PROPOSED'].includes(st);
  };

  const isVotePendingValidation = (p) => {
    if (!p || isVoteArchived(p)) return false;
    const st = String(p.status || '').toUpperCase().trim();
    return ['EN_ATTENTE_VALIDATION', 'PENDING_VALIDATION', 'ARBITRAGE', 'REPORT_AG', 'A_ARBITRER'].includes(st);
  };

  const isVoteOpen = (p) => {
    if (!p || isVoteArchived(p) || isVoteProposed(p) || isVotePendingValidation(p)) return false;
    return true;
  };

  // Compteurs dynamiques des délibérations
  const countVotesAll = projects.length;
  const countVotesProposed = useMemo(() => projects.filter(p => isVoteProposed(p)).length, [projects]);
  const countVotesOpen = useMemo(() => projects.filter(p => isVoteOpen(p)).length, [projects]);
  const countVotesPendingValidation = useMemo(() => projects.filter(p => isVotePendingValidation(p)).length, [projects]);
  const countVotesArchived = useMemo(() => projects.filter(p => isVoteArchived(p)).length, [projects]);

  const handleVoteFilterChange = (newFilter) => {
    setVoteFilter(newFilter);
    setActiveVoteIndex(0);
  };

  // Liste des scrutins pour le carrousel filtrée selon voteFilter (Annotations 8, 10, 11)
  const votesList = useMemo(() => {
    if (!projects || projects.length === 0) {
      return [];
    }
    const filteredProjects = projects.filter((p) => {
      if (!p) return false;
      if (voteFilter === 'ALL') return true;
      if (voteFilter === 'PROPOSED') return isVoteProposed(p);
      if (voteFilter === 'OPEN') return isVoteOpen(p);
      if (voteFilter === 'PENDING_VALIDATION') return isVotePendingValidation(p);
      if (voteFilter === 'ARCHIVED') return isVoteArchived(p);
      return true;
    });

    return filteredProjects.map((p, idx) => {
      const votes = Array.isArray(p.votes) ? p.votes : [];
      const pourVotes = votes.filter(v => v && ['OUI', 'POUR'].includes(String(v.vote || v.choice || '').toUpperCase()));
      const absVotes = votes.filter(v => v && String(v.vote || v.choice || '').toUpperCase() === 'ABSTENTION');
      const contreVotes = votes.filter(v => v && ['NON', 'CONTRE'].includes(String(v.vote || v.choice || '').toUpperCase()));
      const reportAgVotes = votes.filter(v => {
        if (!v) return false;
        const voteStr = String(v.vote || v.choice || '').toUpperCase();
        return voteStr === 'REPORT_AG' || voteStr === 'DEMANDE_AG' || voteStr === 'REPORT_PROCHAINE_AG' || voteStr === 'REPORT AG';
      });
      const pourCount = pourVotes.length;
      const totalCast = pourCount + absVotes.length + contreVotes.length + reportAgVotes.length;
      const pourPct = Math.round((pourCount / 7) * 100);
      const absPct = Math.round((absVotes.length / 7) * 100);
      const reportAgPct = Math.round((reportAgVotes.length / 7) * 100);
      const contrePct = Math.round((contreVotes.length / 7) * 100);
      const attentePct = Math.max(0, 100 - pourPct - absPct - reportAgPct - contrePct);
      const isRoof = p.title && String(p.title).toLowerCase().includes('toiture');

      return {
        ...p,
        id: p.id,
        number: `${idx + 1} sur ${filteredProjects.length}`,
        badgeStatus: p.status === 'EN_COURS' ? 'Vote formel en cours' : (p.status || 'Consultation'),
        budgetText: `Enveloppe budgétaire : ${(p.estimated_cost || 0).toLocaleString('fr-FR')} € TTC`,
        title: p.title,
        description: p.description || '',
        votes: votes,
        documents: p.documents || p.files || p.document_urls || [],
        participationText: `Participation : ${totalCast}/7 voix exprimées (${Math.round((totalCast / 7) * 100)}%)`,
        quorumText: reportAgVotes.length > 0 ? 'Débat en AG sollicité' : (pourCount >= 4 ? 'Majorité qualifiée acquise' : 'En cours d\'instruction'),
        pourWidth: `${pourPct}%`,
        abstentionWidth: `${absPct}%`,
        reportAgWidth: `${reportAgPct}%`,
        contreWidth: `${contrePct}%`,
        attenteWidth: `${attentePct}%`,
        pourLabel: `${pourCount} Pour`,
        hasContre: contreVotes.length > 0,
        contreLabel: `${contreVotes.length} Contre`,
        abstentionLabel: `${absVotes.length} Abstention`,
        reportAgLabel: `${reportAgVotes.length} Report AG`,
        attenteLabel: `${Math.max(0, 7 - totalCast)} en attente`,
        deadline: 'Consultation active',
        reporter: {
          name: p.submitted_by || 'Henri Jamet',
          initials: String(p.submitted_by || 'Henri Jamet').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(),
          role: p.submitted_by === 'Henri Jamet' ? 'Rapporteur du dossier' : 'Porteur du projet',
        },
        isRoofVote: isRoof,
      };
    });
  }, [projects, voteFilter]);

  const currentVote = votesList.length > 0 ? (votesList[activeVoteIndex] || votesList[0]) : null;

  const loadTasks = async (options = {}) => {
    try {
      if ((!tasks || tasks.length === 0) && (!projects || projects.length === 0)) setLoading(true);
      const [taskResult, projResult] = await Promise.allSettled([
        fetchTasks({}, options),
        fetchProjects({}, options),
      ]);
      if (taskResult.status === 'fulfilled' && Array.isArray(taskResult.value)) {
        setTasks(taskResult.value);
      }
      if (projResult.status === 'fulfilled' && Array.isArray(projResult.value)) {
        setProjects(projResult.value);
      }
    } catch (err) {
      console.warn('API loadTasks notice:', err);
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
    await loadTasks({ forceRefresh: true });
  };

  const handleTaskUpdated = async (updatedTask) => {
    if (updatedTask && updatedTask.id) {
      setTasks((prev) => {
        const exists = prev.some((t) => t.id === updatedTask.id || (updatedTask.ref && t.ref === updatedTask.ref));
        if (exists) {
          return prev.map((t) => (t.id === updatedTask.id || (updatedTask.ref && t.ref === updatedTask.ref)) ? { ...t, ...updatedTask } : t);
        }
        return [updatedTask, ...prev];
      });
    }
    await loadTasks({ forceRefresh: true });
  };

  const handleVoteRoofSubmit = async (updatedProject) => {
    if (updatedProject?.deleted) {
      setProjects(prev => prev.filter(p => p.id !== updatedProject.projectId));
    } else if (updatedProject?.id) {
      setProjects(prev => {
        const idx = prev.findIndex(p => p.id === updatedProject.id);
        if (idx >= 0) {
          return prev.map(p => p.id === updatedProject.id ? updatedProject : p);
        }
        return [updatedProject, ...prev];
      });
    }
    await loadTasks({ forceRefresh: true });
  };

  const userMeta = useMemo(() => resolveUserMeta(currentUser), [currentUser]);

  const isCoordinator = Boolean(
    currentUser?.is_coordinator === true ||
    currentUser?.is_coordinator === 'true' ||
    currentUser?.is_coordinator === 1 ||
    userMeta?.lowerPrenom === 'henri' ||
    userMeta?.lowerPrenom === 'josephine' ||
    String(currentUser?.name || currentUser?.prenom || currentUser || '').toLowerCase().includes('henri') ||
    String(currentUser?.name || currentUser?.prenom || currentUser || '').toLowerCase().includes('josephine') ||
    String(currentUser?.name || currentUser?.prenom || currentUser || '').toLowerCase().includes('joséphine')
  );

  const currentUserName = typeof currentUser === 'object'
    ? (currentUser?.name || currentUser?.prenom || '')
    : (currentUser || '');
  const currentUserLower = currentUserName.toLowerCase();

  const canManageCurrentVote = Boolean(
    currentVote && (
      isCoordinator ||
      currentUserLower === 'henri jamet' ||
      (currentVote.submitted_by && currentUserLower.includes(String(currentVote.submitted_by).toLowerCase().split(' ')[0])) ||
      (currentVote.created_by && (String(currentVote.created_by).toLowerCase() === currentUserLower || currentUserLower.includes(String(currentVote.created_by).toLowerCase())))
    )
  );

  const handleEditVote = (vote) => {
    setSelectedVoteForModal(vote);
    setIsVoteModalInitialEditing(true);
    setIsRoofVoteModalOpen(true);
  };

  const handleDeleteVote = async (vote) => {
    if (!vote?.id) return;
    const ok = window.confirm(`Êtes-vous sûr de vouloir supprimer définitivement le scrutin « ${vote.title} » ? Cette action est irréversible.`);
    if (!ok) return;
    try {
      await deleteProject(vote.id);
      setProjects(prev => prev.filter(p => p.id !== vote.id));
      await loadTasks({ forceRefresh: true });
    } catch (err) {
      alert(`Erreur lors de la suppression du scrutin : ${err.message}`);
    }
  };

  const isVoteAuthor = (vote) => {
    if (!vote) return false;
    const authorStr = String(vote.submitted_by || vote.created_by || vote.author || vote.reporter?.name || '').toLowerCase();
    if (!authorStr) return false;
    if (userMeta?.lowerPrenom && authorStr.includes(userMeta.lowerPrenom)) return true;
    if (userMeta?.lowerName && authorStr.includes(userMeta.lowerName)) return true;
    if (currentUserLower && (authorStr.includes(currentUserLower) || currentUserLower.includes(authorStr))) return true;
    return false;
  };

  const renderVoteActionButton = (vote) => {
    if (!vote) return null;
    const isAuthor = isVoteAuthor(vote);

    if (isVoteOpen(vote)) {
      return (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setSelectedVoteForModal(vote);
            setIsVoteModalInitialEditing(false);
            setIsRoofVoteModalOpen(true);
          }}
          className="h-[44px] px-5 rounded-DEFAULT bg-emerald-600 hover:bg-emerald-700 text-white border-2 border-emerald-600 font-label-md text-label-md transition-all flex items-center gap-2 font-bold cursor-pointer shadow-sm"
          type="button"
        >
          <span className="material-symbols-outlined text-[18px]">how_to_vote</span>
          <span>Participer au vote</span>
        </button>
      );
    }

    if (isVoteProposed(vote)) {
      if (isCoordinator) {
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedVoteForModal(vote);
              setIsVoteModalInitialEditing(false);
              setIsRoofVoteModalOpen(true);
            }}
            className="h-[44px] px-5 rounded-DEFAULT bg-amber-500 hover:bg-amber-600 text-white border-2 border-amber-500 font-label-md text-label-md transition-all flex items-center gap-2 font-bold cursor-pointer shadow-sm"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">gavel</span>
            <span>Arbitrer la création</span>
          </button>
        );
      }
      if (isAuthor) {
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleEditVote(vote);
            }}
            className="h-[44px] px-5 rounded-DEFAULT bg-slate-700 hover:bg-slate-800 text-white border-2 border-slate-700 font-label-md text-label-md transition-all flex items-center gap-2 font-bold cursor-pointer shadow-sm"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">edit</span>
            <span>Éditer</span>
          </button>
        );
      }
      return (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setSelectedVoteForModal(vote);
            setIsVoteModalInitialEditing(false);
            setIsRoofVoteModalOpen(true);
          }}
          className="h-[44px] px-5 rounded-DEFAULT bg-surface-container-lowest border-2 border-outline-variant text-on-surface hover:bg-canvas-slate font-label-md text-label-md transition-all flex items-center gap-2 font-semibold cursor-pointer"
          type="button"
        >
          <span className="material-symbols-outlined text-[18px]">visibility</span>
          <span>Consulter la proposition</span>
        </button>
      );
    }

    if (isVotePendingValidation(vote)) {
      if (isCoordinator) {
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedVoteForModal(vote);
              setIsVoteModalInitialEditing(false);
              setIsRoofVoteModalOpen(true);
            }}
            className="h-[44px] px-5 rounded-DEFAULT bg-emerald-600 hover:bg-emerald-700 text-white border-2 border-emerald-600 font-label-md text-label-md transition-all flex items-center gap-2 font-bold cursor-pointer shadow-sm"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">verified</span>
            <span>Arbitrer la validation</span>
          </button>
        );
      }
      if (isAuthor) {
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleEditVote(vote);
            }}
            className="h-[44px] px-5 rounded-DEFAULT bg-slate-700 hover:bg-slate-800 text-white border-2 border-slate-700 font-label-md text-label-md transition-all flex items-center gap-2 font-bold cursor-pointer shadow-sm"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">edit</span>
            <span>Éditer</span>
          </button>
        );
      }
      return (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setSelectedVoteForModal(vote);
            setIsVoteModalInitialEditing(false);
            setIsRoofVoteModalOpen(true);
          }}
          className="h-[44px] px-5 rounded-DEFAULT bg-surface-container-lowest border-2 border-outline-variant text-on-surface hover:bg-canvas-slate font-label-md text-label-md transition-all flex items-center gap-2 font-semibold cursor-pointer"
          type="button"
        >
          <span className="material-symbols-outlined text-[18px]">visibility</span>
          <span>Consulter le résultat</span>
        </button>
      );
    }

    // Archivé ou par défaut
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          setSelectedVoteForModal(vote);
          setIsVoteModalInitialEditing(false);
          setIsRoofVoteModalOpen(true);
        }}
        className="h-[44px] px-5 rounded-DEFAULT bg-surface-container-lowest border-2 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-label-md text-label-md transition-all flex items-center gap-2 font-semibold cursor-pointer"
        type="button"
      >
        <span className="material-symbols-outlined text-[18px]">inventory_2</span>
        <span>Consulter les résultats</span>
      </button>
    );
  };

  const handleValidateTask = async (taskId) => {
    try {
      setTasks(prev => prev.map(t => (t.id === taskId || t.ref === taskId) ? { ...t, status: 'DONE' } : t));
      await validateTask(taskId);
      await loadTasks({ forceRefresh: true });
    } catch (err) {
      console.error('Erreur validation tâche:', err);
      alert(err.message || 'Erreur lors de la validation');
      await loadTasks({ forceRefresh: true });
    }
  };

  const handleInvalidateTask = async (taskId) => {
    const reason = window.prompt("Motif de l'invalidation / demande de révision (optionnel) :", "");
    if (reason === null) return;
    try {
      setTasks(prev => prev.map(t => (t.id === taskId || t.ref === taskId) ? { ...t, status: 'PROPOSED' } : t));
      await invalidateTask(taskId, reason);
      await loadTasks({ forceRefresh: true });
    } catch (err) {
      console.error('Erreur invalidation tâche:', err);
      alert(err.message || "Erreur lors de l'invalidation");
      await loadTasks({ forceRefresh: true });
    }
  };

  const handleAcceptTask = async (taskToAccept) => {
    try {
      setTasks(prev => prev.map(t => (t.id === taskToAccept.id || t.ref === taskToAccept.ref) ? { ...t, status: 'EN_COURS' } : t));
      await acceptTask(taskToAccept.id);
      await loadTasks({ forceRefresh: true });
    } catch (err) {
      console.error('Erreur acceptation tâche:', err);
      alert(err.message || "Erreur lors de l'acceptation de la tâche");
      await loadTasks({ forceRefresh: true });
    }
  };

  const handleRejectTask = async (taskToReject) => {
    const reason = window.prompt("Motif du refus de la proposition (optionnel) :", "");
    if (reason === null) return;
    try {
      setTasks(prev => prev.map(t => (t.id === taskToReject.id || t.ref === taskToReject.ref) ? { ...t, status: 'REJECTED' } : t));
      await rejectTask(taskToReject.id, reason);
      await loadTasks({ forceRefresh: true });
    } catch (err) {
      console.error('Erreur refus tâche:', err);
      alert(err.message || "Erreur lors du refus de la tâche");
      await loadTasks({ forceRefresh: true });
    }
  };

  // Tâches archivées vs actives (Annotation 1 & 4)
  const isArchivedTask = (t) => !isTaskOpen(t) || t?.status === 'DONE' || t?.status === 'ARCHIVEE' || t?.status === 'TERMINEE';

  const archivedTasks = useMemo(() => tasks.filter(t => isArchivedTask(t)), [tasks]);
  const activeTasks = useMemo(() => tasks.filter(t => !isArchivedTask(t)), [tasks]);
  const nbArchived = archivedTasks.length;
  const nbActive = activeTasks.length;

  // Compteurs dynamiques des onglets de cycle de vie (Annotation 17)
  const countProposed = useMemo(() => activeTasks.filter(t => isTaskProposed(t)).length, [activeTasks]);
  const countInProgress = useMemo(() => activeTasks.filter(t => !isTaskProposed(t) && !isTaskPendingValidation(t)).length, [activeTasks]);
  const countPendingValidation = useMemo(() => activeTasks.filter(t => isTaskPendingValidation(t)).length, [activeTasks]);

  // Filtrage des tâches selon les 5 onglets unifiés (Annotations 1, 2, 9)
  const filteredTasks = tasks.filter((t) => {
    const archived = isArchivedTask(t);
    if (workflowFilter === 'ARCHIVED') {
      if (!archived) return false;
    } else if (workflowFilter === 'PROPOSED') {
      if (archived || !isTaskProposed(t)) return false;
    } else if (workflowFilter === 'OPEN') {
      if (archived || isTaskProposed(t) || isTaskPendingValidation(t)) return false;
    } else if (workflowFilter === 'PENDING_VALIDATION') {
      if (archived || !isTaskPendingValidation(t)) return false;
    } else if (workflowFilter === 'ALL') {
      // Toutes les missions : afficher toutes les tâches sans restriction de statut
    }

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
      const assoc = AUTHENTIC_ASSOCIATES.find(a => a.id === selectedAssignee);
      const targetMeta = resolveUserMeta(assoc ? { prenom: assoc.shortName, name: assoc.name, id: assoc.id } : selectedAssignee);
      
      const isTargetCurrentUser = targetMeta && userMeta && (
        (targetMeta.id && userMeta.id && Number(targetMeta.id) === Number(userMeta.id)) ||
        (targetMeta.lowerPrenom && userMeta.lowerPrenom && targetMeta.lowerPrenom === userMeta.lowerPrenom)
      );

      const isPendingVal = isTaskPendingValidation(t);
      const isProposedVal = isTaskProposed(t);
      if (isCoordinator && isTargetCurrentUser && (isPendingVal || isProposedVal)) {
        // Tâche à valider ou proposée incluse dans "Mes tâches" pour le coordinateur
      } else if (!isTaskAssignedToUser(t, targetMeta)) {
        return false;
      }
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

  // Comptages dynamiques pour les pilules (alignés sur l'onglet actif)
  const currentViewTasks = workflowFilter === 'ARCHIVED'
    ? archivedTasks
    : workflowFilter === 'ALL'
    ? tasks
    : activeTasks;
  const countsByPriority = {
    Toutes: currentViewTasks.length,
    Critique: currentViewTasks.filter(t => t.priority === 'Critique').length,
    Haute: currentViewTasks.filter(t => t.priority === 'Haute').length,
    Normale: currentViewTasks.filter(t => t.priority === 'Normale').length,
    Planifié: currentViewTasks.filter(t => t.priority === 'Planifié').length,
  };

  // 1. Calculs des Tâches (Annotation 9 : robustesse filtre et calcul tâches ouvertes)
  const completedTasksCount = nbArchived;
  const totalTasks = tasks.length;
  const totalOpenTasksCount = nbActive;

  // Mes tâches parmi les tâches ouvertes (inclus les tâches à valider ou proposées pour le coordinateur)
  const myOpenTasksCount = useMemo(() => {
    return tasks.filter(t => {
      if (!isTaskOpen(t)) return false;
      if (isCoordinator && (isTaskPendingValidation(t) || isTaskProposed(t))) return true;
      return isTaskAssignedToUser(t, userMeta);
    }).length;
  }, [tasks, userMeta, isCoordinator]);

  // Section conditionnelle "Mes Missions" attribuées à l'utilisateur connecté (Annotation 7)
  const myAssignedTasks = useMemo(() => {
    return tasks.filter(t => (isTaskOpen(t) || isTaskPendingValidation(t) || isTaskProposed(t)) && isTaskAssignedToUser(t, userMeta));
  }, [tasks, userMeta]);

  // Avancement global
  const avgProgress = totalTasks === 0 || totalOpenTasksCount === 0
    ? 100
    : Math.round((completedTasksCount / totalTasks) * 100);

  // 2. Calculs des Votes (Annotation 5 : Compteur dynamique aligné sur la base de données)
  const openVotes = useMemo(() => {
    if (!projects || !Array.isArray(projects)) return [];
    return projects.filter(p => {
      if (!p) return false;
      const st = String(p.status || '').toUpperCase().trim();
      return !['ARCHIVE', 'ARCHIVEE', 'CLOS', 'TERMINE', 'ADOPTE', 'REJETE'].includes(st);
    });
  }, [projects]);

  const totalOpenVotesCount = openVotes.length;

  const myPendingVotesCount = useMemo(() => {
    return openVotes.filter(p => {
      const votes = Array.isArray(p.votes) ? p.votes : [];
      const hasVoted = votes.some(v => {
        const voter = (typeof v?.user_name === 'string'
          ? v.user_name
          : (typeof v?.author === 'string'
            ? v.author
            : (typeof v?.name === 'string'
              ? v.name
              : (typeof v?.user === 'string'
                ? v.user
                : (v?.user?.name || v?.user?.prenom || ''))))).toLowerCase();
        return (
          (userMeta.lowerName && voter.includes(userMeta.lowerName)) ||
          (userMeta.lowerPrenom && voter.includes(userMeta.lowerPrenom)) ||
          (userMeta.id != null && (v.user_id === userMeta.id || v.member_id === userMeta.id))
        );
      });
      return !hasVoted;
    }).length;
  }, [openVotes, userMeta]);

  return (
    <div className="flex flex-col w-full pb-16">
      
      {/* ========================================================================= */}
      {/* 1. EN-TÊTE HARMONISÉ HERO                                                 */}
      {/* ========================================================================= */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-100/90 via-blue-50/60 to-slate-100/80 border border-slate-200/80 dark:bg-slate-900/30 dark:border-slate-800/40 p-6 sm:p-8 shadow-sm mb-6">
        {/* Subtle decorative glow */}
        <div className="absolute -right-24 -top-24 w-96 h-96 rounded-full bg-slate-200/50 dark:bg-slate-800/20 blur-3xl pointer-events-none"></div>
        <div className="absolute -left-12 -bottom-12 w-64 h-64 rounded-full bg-blue-100/40 dark:bg-blue-900/10 blur-2xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-200/80 text-slate-800 dark:bg-slate-800/60 dark:text-slate-200 font-label-sm text-xs font-semibold uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-slate-600 dark:bg-slate-400 animate-pulse"></span>
              DOMAINE D'HELLENVILLIERS • TRAVAUX &amp; INTENDANCE
            </span>
            <h1 className="font-display-lg text-2xl sm:text-3xl lg:text-display-lg text-forest-deep dark:text-slate-100 tracking-tight font-bold mt-2">
              Tâches, Chantiers &amp; Missions
            </h1>
            <p className="font-body-md text-sm sm:text-base text-on-surface-variant dark:text-slate-300 leading-relaxed">
              Missions réparties entre associés, avancement des travaux et votes décisionnels.
            </p>
          </div>

          {/* Actions : Style Signature */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0 pt-2 md:pt-0">
            <button
              onClick={() => window.print()}
              className="group flex items-center justify-center gap-2 px-5 py-3.5 rounded-DEFAULT bg-white dark:bg-slate-900 border-2 border-outline-variant text-on-surface hover:bg-canvas-slate hover:border-outline font-label-lg text-sm sm:text-base font-semibold transition-all duration-200 shadow-sm cursor-pointer whitespace-nowrap"
              type="button"
            >
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant group-hover:scale-110 transition-transform">download</span>
              <span>Exporter PDF</span>
            </button>

            <button
              onClick={handleOpenCreateVote}
              className="group flex items-center justify-center gap-2 px-5 py-3.5 rounded-DEFAULT bg-white dark:bg-slate-900 border-2 border-primary-container text-primary-container hover:bg-sage-soft font-label-lg text-sm sm:text-base font-bold shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer whitespace-nowrap"
              type="button"
            >
              <span className="material-symbols-outlined text-[22px] group-hover:scale-110 transition-transform">how_to_vote</span>
              <span>Proposer un vote</span>
            </button>

            <button
              onClick={handleOpenCreateTask}
              className="group flex items-center justify-center gap-2 px-5 py-3.5 rounded-DEFAULT bg-white dark:bg-slate-900 border-2 border-primary text-primary hover:bg-sage-soft font-label-lg text-sm sm:text-base font-bold shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer whitespace-nowrap"
              type="button"
            >
              <span className="material-symbols-outlined text-[22px] group-hover:scale-110 transition-transform">add_task</span>
              <span>+ Proposer une tâche</span>
            </button>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 2. KPI OVERVIEW STRIP: 3 METRIC CARDS UNIFIÉES (Annotation 1)              */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-8 max-w-[1100px] mx-auto w-full">
        
        {/* Élément 1 : Avancement global */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-all">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                Avancement global
              </span>
              <div className="flex items-baseline gap-1 mt-2">
                {(loading && (!tasks || tasks.length === 0) && (!projects || projects.length === 0)) ? (
                  <span className="w-16 h-8 bg-slate-200 dark:bg-slate-700 rounded animate-pulse inline-block"></span>
                ) : (
                  <>
                    <span className="text-3xl font-extrabold text-forest-deep dark:text-slate-100 leading-none">
                      {avgProgress}
                    </span>
                    <span className="text-lg font-bold text-forest-deep dark:text-slate-200">%</span>
                  </>
                )}
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 flex items-center justify-center shrink-0 border border-emerald-100 dark:border-emerald-900/40">
              <span className="material-symbols-outlined text-[24px]">task_alt</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{completedTasksCount} / {totalTasks} chantiers achevés</span>
            <span className={`font-semibold ${totalOpenTasksCount > 0 ? 'text-primary' : 'text-emerald-700 dark:text-emerald-400'}`}>
              {totalOpenTasksCount > 0 ? `${totalOpenTasksCount} en cours` : '100% à jour'}
            </span>
          </div>
        </div>

        {/* Élément 2 : Mes votes à exprimer */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-all">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                Votes à exprimer
              </span>
              <div className="flex items-baseline gap-2 mt-2">
                {(loading && (!projects || projects.length === 0)) ? (
                  <span className="w-16 h-8 bg-slate-200 dark:bg-slate-700 rounded animate-pulse inline-block"></span>
                ) : (
                  <span className="text-3xl font-extrabold text-forest-deep dark:text-slate-100 leading-none">
                    {myPendingVotesCount} / {totalOpenVotesCount}
                  </span>
                )}
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">scrutins ouverts</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 flex items-center justify-center shrink-0 border border-blue-100 dark:border-blue-900/40">
              <span className="material-symbols-outlined text-[24px]">how_to_vote</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 text-xs">
            <span className={`w-2 h-2 rounded-full ${myPendingVotesCount > 0 ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></span>
            <span className={myPendingVotesCount > 0 ? 'text-amber-800 dark:text-amber-300 font-semibold' : 'text-slate-500 dark:text-slate-400'}>
              {myPendingVotesCount > 0
                ? `${myPendingVotesCount} vote${myPendingVotesCount > 1 ? 's' : ''} en attente de votre voix`
                : 'Tous vos votes sont exprimés'}
            </span>
          </div>
        </div>

        {/* Élément 3 : Mes tâches confiées */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-all">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                Mes tâches
              </span>
              <div className="flex items-baseline gap-2 mt-2">
                {(loading && (!tasks || tasks.length === 0)) ? (
                  <span className="w-16 h-8 bg-slate-200 dark:bg-slate-700 rounded animate-pulse inline-block"></span>
                ) : (
                  <span className="text-3xl font-extrabold text-forest-deep dark:text-slate-100 leading-none">
                    {myOpenTasksCount} / {totalOpenTasksCount}
                  </span>
                )}
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">tâches ouvertes</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 flex items-center justify-center shrink-0 border border-amber-100 dark:border-amber-900/40">
              <span className="material-symbols-outlined text-[24px]">assignment_ind</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 text-xs">
            <span className={`w-2 h-2 rounded-full ${myOpenTasksCount > 0 ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'}`}></span>
            <span className="text-slate-600 dark:text-slate-400">
              {myOpenTasksCount > 0
                ? `${myOpenTasksCount} mission${myOpenTasksCount > 1 ? 's' : ''} sous votre responsabilité`
                : 'Aucune tâche assignée'}
            </span>
          </div>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* 2b. ONGLETS DE SÉLECTION DES DÉLIBÉRATIONS & SCRUTINS (Annotations 8, 10, 11) */}
      {/* ========================================================================= */}
      <div className="flex flex-wrap items-center gap-2 mb-4 p-1.5 bg-surface-container-low dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-800">
        
        {/* 1. Toutes les Délibérations (ALL) */}
        <button
          type="button"
          onClick={() => handleVoteFilterChange('ALL')}
          className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-label-md text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
            voteFilter === 'ALL'
              ? 'bg-slate-700 text-white shadow-sm font-bold'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">how_to_vote</span>
          <span className="whitespace-nowrap">Tous</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-bold ${
              voteFilter === 'ALL'
                ? 'bg-white/20 text-white'
                : 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200'
            }`}
          >
            {countVotesAll}
          </span>
        </button>

        {/* 2. Propositions en attente (PROPOSED, ambre) */}
        <button
          type="button"
          onClick={() => handleVoteFilterChange('PROPOSED')}
          className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-label-md text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
            voteFilter === 'PROPOSED'
              ? 'bg-amber-500 text-white shadow-sm font-bold'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">gavel</span>
          <span className="whitespace-nowrap">En attente de création</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-bold ${
              voteFilter === 'PROPOSED'
                ? 'bg-white/20 text-white'
                : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
            }`}
          >
            {countVotesProposed}
          </span>
        </button>

        {/* 3. Scrutins en cours (OPEN, bleu) */}
        <button
          type="button"
          onClick={() => handleVoteFilterChange('OPEN')}
          className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-label-md text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
            voteFilter === 'OPEN'
              ? 'bg-primary text-white shadow-sm font-bold'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">play_circle</span>
          <span className="whitespace-nowrap">En cours</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-bold ${
              voteFilter === 'OPEN'
                ? 'bg-white/20 text-white'
                : 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200'
            }`}
          >
            {countVotesOpen}
          </span>
        </button>

        {/* 4. En attente de validation (PENDING_VALIDATION, émeraude) */}
        <button
          type="button"
          onClick={() => handleVoteFilterChange('PENDING_VALIDATION')}
          className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-label-md text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
            voteFilter === 'PENDING_VALIDATION'
              ? 'bg-emerald-600 text-white shadow-sm font-bold'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">verified</span>
          <span className="whitespace-nowrap">En attente de validation</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-bold ${
              voteFilter === 'PENDING_VALIDATION'
                ? 'bg-white/20 text-white'
                : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
            }`}
          >
            {countVotesPendingValidation}
          </span>
        </button>

        {/* 5. Scrutins archivés (ARCHIVED, gris) */}
        <button
          type="button"
          onClick={() => handleVoteFilterChange('ARCHIVED')}
          className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-label-md text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
            voteFilter === 'ARCHIVED'
              ? 'bg-slate-600 text-white shadow-sm font-bold'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">inventory_2</span>
          <span className="whitespace-nowrap">Archivés</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-bold ${
              voteFilter === 'ARCHIVED'
                ? 'bg-white/20 text-white'
                : 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200'
            }`}
          >
            {countVotesArchived}
          </span>
        </button>

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
                {/* ANNOTATION 2 : Titre de section des scrutins synchronisé avec voteFilter */}
                <h2 className="font-headline-sm text-headline-sm text-forest-deep font-bold">
                  {voteFilter === 'ALL'
                    ? 'Toutes les Délibérations'
                    : voteFilter === 'PROPOSED'
                    ? 'Propositions en attente'
                    : voteFilter === 'PENDING_VALIDATION'
                    ? "En attente d'arbitrage"
                    : voteFilter === 'ARCHIVED'
                    ? 'Scrutins archivés'
                    : 'Scrutins en cours'}
                </h2>
                {currentVote && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sage-soft text-primary">
                    Vote {currentVote.number}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              onClick={handleOpenCreateVote}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary-container/10 hover:bg-primary-container/20 text-primary-container border border-primary-container/30 font-label-md text-xs sm:text-sm font-bold transition-all cursor-pointer shadow-sm whitespace-nowrap"
              type="button"
              title="Proposer une nouvelle délibération ou un vote"
            >
              <span className="material-symbols-outlined text-[18px]">how_to_vote</span>
              <span>Proposer un vote</span>
            </button>

            {votesList.length > 1 && (
              <div className="flex items-center gap-1">
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
          </div>
        </div>

        {/* Voting Card (Dynamic, Skeleton or Empty State) */}
        {(loading && (!projects || projects.length === 0)) ? (
          <VoteCardSkeleton />
        ) : currentVote ? (
          <div
            onClick={() => {
              setSelectedVoteForModal(currentVote);
              setIsRoofVoteModalOpen(true);
            }}
            className="bg-surface-container-low rounded-xl p-space-md border border-subtle hover:shadow-md transition-all cursor-pointer group flex flex-col gap-4"
          >
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-space-md">
              <div className="space-y-1.5 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-label-sm text-xs font-semibold border border-slate-200 dark:border-slate-700">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    {currentVote.status === 'EN_VOTE' ? 'Scrutin ouvert' : (currentVote.status === 'SOUMIS' ? 'En délibération' : (currentVote.badgeStatus || 'Consultation'))}
                  </span>
                  {/* Annotation 7 : Mention budget purgée */}
                </div>
                <h3 className="font-headline-sm text-headline-sm text-forest-deep pt-1 font-bold group-hover:text-primary transition-colors">
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
              </div>
            </div>

            {/* Rendu dynamique du sondage WhatsApp (indicateurs visuels purs non cliquables - Annotations 5 & 9) */}
            <WhatsAppPollView
              project={currentVote}
              currentUser={currentUser}
              compact={true}
              readOnly={true}
              onCastVote={null}
              showPendingVoters={true}
              showQuorumNotice={false}
            />

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
                {renderVoteActionButton(currentVote)}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-surface-container-low rounded-lg p-space-lg border border-subtle flex flex-col items-center justify-center text-center py-12">
            <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant mb-3">
              <span className="material-symbols-outlined text-[28px]">how_to_vote</span>
            </div>
            <h3 className="font-headline-sm text-headline-sm text-forest-deep font-bold mb-1">
              {voteFilter === 'ALL'
                ? 'Aucune délibération enregistrée'
                : voteFilter === 'PROPOSED'
                ? 'Aucune proposition en attente'
                : voteFilter === 'PENDING_VALIDATION'
                ? "Aucun scrutin en attente d'arbitrage"
                : voteFilter === 'ARCHIVED'
                ? 'Aucun scrutin archivé'
                : 'Aucun scrutin statutaire en cours'}
            </h3>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-md text-sm mb-4">
              Les projets et initiatives de travaux soumis à la délibération et au vote des associés de la SCI apparaîtront ici.
            </p>
            <button
              onClick={handleOpenCreateVote}
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

          {/* Sorting Controller & Quick Create Task Button */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-space-sm shrink-0">
            <div className="flex items-center gap-space-xs shrink-0">
              <span className="font-label-sm text-label-sm text-on-surface-variant whitespace-nowrap flex items-center gap-1 font-semibold">
                <span className="material-symbols-outlined text-[18px]">sort</span>
                Trier par :
              </span>
              <CustomSelect
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                options={[
                  { value: 'urgency', label: "Degré d'urgence (priorité haute)", icon: 'priority_high' },
                  { value: 'deadline', label: "Date d'échéance la plus proche", icon: 'event' },
                  { value: 'budget_desc', label: "Budget prévisionnel (décroissant)", icon: 'euro' },
                  { value: 'updated', label: "Dernière mise à jour", icon: 'update' },
                ]}
                className="h-[52px] min-w-[240px]"
              />
            </div>

            <button
              type="button"
              onClick={handleOpenCreateTask}
              className="h-[52px] px-5 rounded-DEFAULT bg-primary text-white hover:bg-forest-deep font-label-md text-label-md font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm shrink-0 whitespace-nowrap"
              title="Proposer une nouvelle tâche"
            >
              <span className="material-symbols-outlined text-[20px]">add</span>
              <span>Proposer une tâche</span>
            </button>
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
            <CustomSelect
              id="assigneeFilter"
              value={selectedAssignee}
              onChange={(e) => setSelectedAssignee(e.target.value)}
              options={memberFilterOptions.map((m) => ({
                value: m.id,
                label: m.label,
                icon: 'person'
              }))}
              className="h-[46px]"
            />
          </div>

          {/* Domaine / Catégorie (Spécification Annotation 5) */}
          <div className="flex flex-col gap-1.5">
            <label className="font-label-sm text-label-sm text-on-surface font-semibold flex items-center gap-1.5" htmlFor="categoryFilter">
              <span className="material-symbols-outlined text-[18px] text-primary">category</span>
              Domaine / Catégorie
            </label>
            <CustomSelect
              id="categoryFilter"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              options={[
                { value: 'all', label: 'Tous les domaines', icon: 'category' },
                { value: 'entretien', label: 'Entretien', icon: 'handyman' },
                { value: 'travaux', label: 'Travaux', icon: 'construction' },
                { value: 'espaces verts', label: 'Espaces verts', icon: 'yard' },
                { value: 'administratif', label: 'Administratif', icon: 'description' },
                { value: 'piscine', label: 'Piscine', icon: 'pool' },
                { value: 'chauffage', label: 'Chauffage', icon: 'thermostat' },
              ]}
              className="h-[46px]"
            />
          </div>

          {/* Lieu / Bâtiment */}
          <div className="flex flex-col gap-1.5">
            <label className="font-label-sm text-label-sm text-on-surface font-semibold flex items-center gap-1.5" htmlFor="subjectFilter">
              <span className="material-symbols-outlined text-[18px] text-primary">label</span>
              Sujet / Lieu
            </label>
            <CustomSelect
              id="subjectFilter"
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              options={[
                { value: 'all', label: 'Tous les sujets', icon: 'domain' },
                { value: 'rosing', label: 'Rosing (Maison Principale)', icon: 'home' },
                { value: 'presbytere', label: 'Presbytère', icon: 'cottage' },
                { value: 'piscine', label: 'Piscine & Pool house', icon: 'pool' },
                { value: 'jardin', label: 'Jardin & Espaces verts', icon: 'yard' },
                { value: 'sci', label: 'SCI (Gouvernance & Général)', icon: 'account_balance' },
              ]}
              className="h-[46px]"
            />
          </div>
        </div>

      </section>

      {/* ========================================================================= */}
      {/* 5. ONGLETS DE CYCLE DE VIE & FILTRAGE WORKFLOW (Annotation 17)            */}
      {/* ========================================================================= */}
      {/* ========================================================================= */}
      {/* 5. ONGLETS DE CYCLE DE VIE & FILTRAGE WORKFLOW (Annotations 1, 2, 9)       */}
      {/* ========================================================================= */}
      <div className="flex flex-wrap items-center gap-2 mb-4 p-1.5 bg-surface-container-low dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-800">
        
        {/* 1. Toutes les Missions (ALL) */}
        <button
          type="button"
          onClick={() => setWorkflowFilter('ALL')}
          className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-label-md text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
            workflowFilter === 'ALL'
              ? 'bg-slate-700 text-white shadow-sm font-bold'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">checklist</span>
          <span className="whitespace-nowrap">Toutes</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-bold ${
              workflowFilter === 'ALL'
                ? 'bg-white/20 text-white'
                : 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200'
            }`}
          >
            {tasks.length}
          </span>
        </button>

        {/* 2. En cours d'arbitrage pour création (PROPOSED, ambre) */}
        <button
          type="button"
          onClick={() => setWorkflowFilter('PROPOSED')}
          className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-label-md text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
            workflowFilter === 'PROPOSED'
              ? 'bg-amber-500 text-white shadow-sm font-bold'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">gavel</span>
          <span className="whitespace-nowrap">En attente de création</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-bold ${
              workflowFilter === 'PROPOSED'
                ? 'bg-white/20 text-white'
                : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
            }`}
          >
            {countProposed}
          </span>
        </button>

        {/* 3. En cours (par défaut) (OPEN, bleu) */}
        <button
          type="button"
          onClick={() => setWorkflowFilter('OPEN')}
          className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-label-md text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
            workflowFilter === 'OPEN'
              ? 'bg-primary text-white shadow-sm font-bold'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">play_circle</span>
          <span className="whitespace-nowrap">En cours</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-bold ${
              workflowFilter === 'OPEN'
                ? 'bg-white/20 text-white'
                : 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200'
            }`}
          >
            {countInProgress}
          </span>
        </button>

        {/* 4. En cours d'arbitrage pour complétion (PENDING_VALIDATION, émeraude) */}
        <button
          type="button"
          onClick={() => setWorkflowFilter('PENDING_VALIDATION')}
          className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-label-md text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
            workflowFilter === 'PENDING_VALIDATION'
              ? 'bg-emerald-600 text-white shadow-sm font-bold'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">verified</span>
          <span className="whitespace-nowrap">En attente de validation</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-bold ${
              workflowFilter === 'PENDING_VALIDATION'
                ? 'bg-white/20 text-white'
                : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
            }`}
          >
            {countPendingValidation}
          </span>
        </button>

        {/* 5. Terminées et archivées (ARCHIVED, gris) */}
        <button
          type="button"
          onClick={() => setWorkflowFilter('ARCHIVED')}
          className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-label-md text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
            workflowFilter === 'ARCHIVED'
              ? 'bg-slate-600 text-white shadow-sm font-bold'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">inventory_2</span>
          <span className="whitespace-nowrap">Archivées</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-bold ${
              workflowFilter === 'ARCHIVED'
                ? 'bg-white/20 text-white'
                : 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200'
            }`}
          >
            {nbArchived}
          </span>
        </button>

      </div>

      {/* ========================================================================= */}
      {/* 5a. SECTION CONDITIONNELLE : MES MISSIONS (Annotation 7)                  */}
      {/* ========================================================================= */}
      {myAssignedTasks.length > 0 && selectedAssignee === 'all' && (
        <section className="mb-space-lg" id="myAssignedTasksSection">
          <div className="flex items-center justify-between gap-3 mb-space-md">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[24px] text-primary">assignment_ind</span>
              <h2 className="font-headline-md text-headline-md text-forest-deep tracking-tight font-bold">
                Mes Missions
              </h2>
              <span className="bg-primary/10 text-primary font-label-sm text-label-sm font-bold px-2.5 py-0.5 rounded-full">
                {myAssignedTasks.length}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-md mb-8">
            {myAssignedTasks.map((t) => (
              <TaskCard
                key={`my-${t.id || t.ref}`}
                task={t}
                currentUser={currentUser}
                onOpen={(taskToOpen) => handleOpenInspectTask(taskToOpen)}
                onAccept={handleAcceptTask}
                onReject={handleRejectTask}
              />
            ))}
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* 5b. SECTION TITLE & COUNTER SUMMARY (Stitch)                              */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-space-md">
        <div className="flex items-center gap-2">
          {/* Titre dynamique synchronisé avec l'onglet actif */}
          <h2 className="font-headline-md text-headline-md text-forest-deep tracking-tight font-bold">
            {workflowFilter === 'ALL'
              ? 'Toutes les Missions'
              : workflowFilter === 'PROPOSED'
              ? "En cours d'arbitrage pour création"
              : workflowFilter === 'PENDING_VALIDATION'
              ? "En cours d'arbitrage pour complétion"
              : workflowFilter === 'ARCHIVED'
              ? 'Missions Terminées & Archivées'
              : 'Missions En Cours'}
          </h2>
          <span className="bg-sage-soft text-forest-deep font-label-sm text-label-sm font-bold px-2.5 py-0.5 rounded-full">
            {sortedTasks.length} affichés
          </span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 6. GRID OF TASK CARDS (Stitch)                                           */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-md" id="tasksContainer">
        {(loading && (!tasks || tasks.length === 0)) ? (
          <TasksContainerSkeleton count={4} />
        ) : sortedTasks.length === 0 ? (
          <div className="col-span-full bg-surface-container-low border border-subtle rounded-2xl p-8 flex flex-col items-center justify-center text-center py-12">
            <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant mb-3">
              <span className="material-symbols-outlined text-[28px]">{workflowFilter === 'ARCHIVED' ? 'inventory_2' : 'checklist'}</span>
            </div>
            <h3 className="font-headline-sm text-headline-sm text-forest-deep font-bold mb-4">
              {workflowFilter === 'ARCHIVED'
                ? 'Aucune tâche archivée'
                : workflowFilter === 'PROPOSED'
                ? "Aucune tâche en cours d'arbitrage pour création"
                : workflowFilter === 'PENDING_VALIDATION'
                ? "Aucune tâche en cours d'arbitrage pour complétion"
                : workflowFilter === 'ALL'
                ? 'Aucune mission trouvée'
                : 'Aucune tâche en cours'}
            </h3>
            {workflowFilter !== 'ARCHIVED' && (
              <button
                type="button"
                onClick={handleOpenCreateTask}
                className="h-[48px] px-6 rounded-DEFAULT bg-surface-container-lowest border-2 border-primary text-primary hover:bg-sage-soft font-label-md text-label-md transition-all flex items-center gap-2.5 font-bold cursor-pointer shadow-sm hover:shadow"
              >
                <span className="material-symbols-outlined text-[22px]">add_task</span>
                <span>Soumettre une nouvelle proposition de tâche</span>
              </button>
            )}
          </div>
        ) : (
          sortedTasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              currentUser={currentUser}
              onOpen={(taskToOpen) => handleOpenInspectTask(taskToOpen)}
              onAccept={handleAcceptTask}
              onReject={handleRejectTask}
            />
          ))
        )}
      </div>

      {/* ========================================================================= */}
      {/* 7. MODALES CONNECTÉES                                                     */}
      {/* ========================================================================= */}

      {/* Modale de Vote Unifiée avec Projet Dynamique & ErrorBoundary (Annotations 1 & 9) */}
      <VoteRoofModal
        isOpen={isRoofVoteModalOpen}
        onClose={() => {
          setIsRoofVoteModalOpen(false);
          setSelectedVoteForModal(null);
          setIsVoteModalInitialEditing(false);
        }}
        currentUser={currentUser}
        initialEditing={isVoteModalInitialEditing}
        project={selectedVoteForModal || currentVote}
        onVoteSubmit={handleVoteRoofSubmit}
      />

      {/* Modale de Consultation et Édition Détaillée de Tâche Unifiée (Annotation 16) */}
      {isTaskModalOpen && (
        <TaskDetailModal
          isOpen={isTaskModalOpen}
          task={inspectingTask}
          isEditing={isTaskEditingDirect}
          initialMode={isTaskEditingDirect ? 'edit' : 'view'}
          onClose={() => {
            setIsTaskModalOpen(false);
            setInspectingTask(null);
            setIsTaskEditingDirect(false);
          }}
          currentUser={currentUser}
          onTaskUpdated={handleTaskUpdated}
        />
      )}

    </div>
  );
}
