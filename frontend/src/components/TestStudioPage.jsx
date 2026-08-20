import React, { useState, useEffect, useMemo } from 'react';
import {
  FlaskConical, Calendar, Users, CheckSquare, Vote, Plus, Trash2,
  CheckCircle2, XCircle, Clock, AlertTriangle, Send, ShieldCheck,
  ArrowRight, BarChart3, RefreshCw, ChevronRight, Info, Sparkles,
  UserCheck, Gavel, Layers, Sliders, Check, Edit3, TrendingUp, X,
  Building, HelpCircle, CheckCircle, Percent
} from 'lucide-react';

import {
  fetchProjects, createProject, reviewProject, castProjectVote, deleteProject,
  fetchAvailabilities, setAvailabilitiesBatch, fetchSmartMatch, fetchTasks, createTask
} from '../api';

const FAMILY_MEMBERS = [
  { prenom: 'Henri', role: 'Coordinateur Général', color: 'bg-cyan-600 text-white', badgeBg: 'bg-cyan-50 border-cyan-200 text-cyan-800' },
  { prenom: 'Hortense', role: 'Responsable Espaces Verts', color: 'bg-rose-500 text-white', badgeBg: 'bg-rose-50 border-rose-200 text-rose-800' },
  { prenom: 'Marguerite', role: 'Responsable Équipements', color: 'bg-purple-500 text-white', badgeBg: 'bg-purple-50 border-purple-200 text-purple-800' },
  { prenom: 'Joséphine', role: 'Coordinatrice Adjointe', color: 'bg-emerald-500 text-white', badgeBg: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
  { prenom: 'Eugénie', role: 'Responsable Peintures & Tri', color: 'bg-amber-500 text-white', badgeBg: 'bg-amber-50 border-amber-200 text-amber-800' },
  { prenom: 'Frédéric', role: 'Responsable Électricité', color: 'bg-blue-500 text-white', badgeBg: 'bg-blue-50 border-blue-200 text-blue-800' },
  { prenom: 'Maman', role: 'Garante du Patrimoine', color: 'bg-teal-500 text-white', badgeBg: 'bg-teal-50 border-teal-200 text-teal-800' }
];

const INITIAL_TASKS = [
  { id: 1, title: 'Tonte de la pelouse & Désherbage massif', category: 'Espaces Verts', weight: 'Lourd', points: 3, property: 'Le Presbytère' },
  { id: 2, title: 'Contrôle niveau Fioul & Pression Chauffage', category: 'Maintenance & Équipements', weight: 'Critique', points: 5, property: 'Le Presbytère' },
  { id: 3, title: 'Nettoyage terrasse & Mobilier de jardin', category: 'Propreté & Tri', weight: 'Moyen', points: 2, property: 'Le Presbytère' },
  { id: 4, title: 'Evacuation tri sélectif & Poubelles', category: 'Propreté & Tri', weight: 'Faible', points: 1, property: 'Le Presbytère' },
  { id: 5, title: 'Inspection toiture & Nettoyage gouttières', category: 'Maintenance & Équipements', weight: 'Lourd', points: 3, property: 'Villa Rosing' },
  { id: 6, title: 'Vérification disjoncteurs & Remplacement ampoules', category: 'Électricité & Securité', weight: 'Moyen', points: 2, property: 'Le Presbytère' },
  { id: 7, title: 'Inventaire vaisselle & Linge de maison', category: 'Inspection Général', weight: 'Faible', points: 1, property: 'Villa Rosing' }
];

export default function TestStudioPage({ currentUser }) {
  const [activeTab, setActiveTab] = useState('presences'); // 'presences' | 'workflow'
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null);

  // Tab 1 States: Member Presences & Dynamic Task Assignment
  const [membersPresence, setMembersPresence] = useState({
    Henri: { status: 'PRESENT', startDate: '2026-08-10', endDate: '2026-08-17', week: 33 },
    Hortense: { status: 'PRESENT', startDate: '2026-08-10', endDate: '2026-08-17', week: 33 },
    Marguerite: { status: 'OPTIONNEL', startDate: '2026-08-12', endDate: '2026-08-15', week: 33 },
    Joséphine: { status: 'PRESENT', startDate: '2026-08-10', endDate: '2026-08-17', week: 33 },
    Eugénie: { status: 'IMPOSSIBLE', startDate: '', endDate: '', week: 33 },
    Frédéric: { status: 'PRESENT', startDate: '2026-08-11', endDate: '2026-08-16', week: 33 },
    Maman: { status: 'PRESENT', startDate: '2026-08-10', endDate: '2026-08-17', week: 33 }
  });

  const [tasksList, setTasksList] = useState(INITIAL_TASKS);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskCategory, setNewTaskCategory] = useState('Espaces Verts');
  const [newTaskWeight, setNewTaskWeight] = useState('Moyen');
  const [newTaskProperty, setNewTaskProperty] = useState('Le Presbytère');
  const [smartMatchResults, setSmartMatchResults] = useState([]);
  const [simulatedAssignments, setSimulatedAssignments] = useState(null);

  // Tab 2 States: Submission & Coordinator Workflow
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  // Phase 1 Submission Form
  const [newProject, setNewProject] = useState({
    title: '',
    description: '',
    category: '🛠️ Maintenance / Réparation',
    priority: 'MOYENNE',
    property_id: 2,
    estimated_cost: 450,
    submitted_by: typeof currentUser === 'string' ? currentUser : (currentUser?.prenom || 'Henri')
  });

  // Phase 2 Coordinator Form
  const [coordinatorEdit, setCoordinatorEdit] = useState({
    estimated_cost: 0,
    responsible: '',
    classification: 'SIGNALEMENT',
    priority: 'MOYENNE',
    task_weight: 'MOYEN',
    coordinator_notes: ''
  });

  // Show Toast Notification
  const showToast = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Load Projects from Backend
  const loadProjectsData = async () => {
    try {
      setLoading(true);
      const data = await fetchProjects();
      setProjects(data);
      if (data.length > 0 && !selectedProjectId) {
        setSelectedProjectId(data[0].id);
      }
    } catch (err) {
      console.error('Erreur chargement projets:', err);
      showToast(err.message || 'Erreur chargement projets', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjectsData();
  }, []);

  // Update Coordinator edit form when selected project changes
  const selectedProject = useMemo(() => {
    return projects.find(p => p.id === Number(selectedProjectId)) || projects[0] || null;
  }, [projects, selectedProjectId]);

  useEffect(() => {
    if (selectedProject) {
      setCoordinatorEdit({
        estimated_cost: selectedProject.estimated_cost || 0,
        responsible: selectedProject.responsible || '',
        classification: selectedProject.classification || 'SIGNALEMENT',
        priority: selectedProject.priority || 'MOYENNE',
        task_weight: selectedProject.task_weight || 'MOYEN',
        coordinator_notes: selectedProject.coordinator_notes || ''
      });
    }
  }, [selectedProject]);

  // --- TAB 1 HANDLERS ---
  const handlePresenceStatusChange = (memberPrenom, newStatus) => {
    setMembersPresence(prev => ({
      ...prev,
      [memberPrenom]: {
        ...prev[memberPrenom],
        status: newStatus
      }
    }));
  };

  const handlePresenceDateChange = (memberPrenom, field, val) => {
    setMembersPresence(prev => ({
      ...prev,
      [memberPrenom]: {
        ...prev[memberPrenom],
        [field]: val
      }
    }));
  };

  const applyPresencePreset = (presetType) => {
    if (presetType === 'ALL_PRESENT') {
      const updated = {};
      FAMILY_MEMBERS.forEach(m => {
        updated[m.prenom] = { status: 'PRESENT', startDate: '2026-08-10', endDate: '2026-08-17', week: 33 };
      });
      setMembersPresence(updated);
      showToast('Preset appliqué: Tous les 7 membres sont présents !');
    } else if (presetType === 'WEEKEND') {
      const updated = {};
      FAMILY_MEMBERS.forEach((m, idx) => {
        const isPresent = idx % 2 === 0;
        updated[m.prenom] = {
          status: isPresent ? 'PRESENT' : 'OPTIONNEL',
          startDate: '2026-08-14',
          endDate: '2026-08-16',
          week: 33
        };
      });
      setMembersPresence(updated);
      showToast('Preset appliqué: Week-end prolongé (4 présent, 3 optionnel)');
    } else if (presetType === 'RESET') {
      const updated = {};
      FAMILY_MEMBERS.forEach(m => {
        updated[m.prenom] = { status: 'IMPOSSIBLE', startDate: '', endDate: '', week: 33 };
      });
      setMembersPresence(updated);
      showToast('Réinitialisation des présences effectuée');
    }
  };

  const handleAddTask = (e) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    const pointsMap = { Faible: 1, Moyen: 2, Lourd: 3, Critique: 5 };
    const newTask = {
      id: Date.now(),
      title: newTaskTitle,
      category: newTaskCategory,
      weight: newTaskWeight,
      points: pointsMap[newTaskWeight] || 2,
      property: newTaskProperty
    };
    setTasksList(prev => [...prev, newTask]);
    setNewTaskTitle('');
    showToast(`Tâche "${newTask.title}" ajoutée au laboratoire.`);
  };

  const handleRemoveTask = (taskId) => {
    setTasksList(prev => prev.filter(t => t.id !== taskId));
    showToast('Tâche supprimée du catalogue.');
  };

  // Run Task Assignment Simulation & call Backend Availabilities API
  const handleRunSimulation = async () => {
    try {
      setLoading(true);
      // 1. Prepare batch payload for backend API
      const availabilitiesPayload = {
        property_id: 2,
        year: 2026,
        user_name: typeof currentUser === 'string' ? currentUser : (currentUser?.prenom || 'Henri'),
        availabilities: FAMILY_MEMBERS.map(m => ({
          week_number: 33,
          user_name: m.prenom,
          status: membersPresence[m.prenom]?.status || 'OPTIONNEL',
          notes: `Simulé du ${membersPresence[m.prenom]?.startDate || 'N/A'} au ${membersPresence[m.prenom]?.endDate || 'N/A'}`
        }))
      };

      // Call API /api/availabilities/batch & /api/availabilities/smart-match
      await setAvailabilitiesBatch(availabilitiesPayload);
      const matchRes = await fetchSmartMatch(2, 2026);
      setSmartMatchResults(matchRes);

      // 2. Perform Dynamic Task Balancing Simulation algorithm
      const presentMembers = FAMILY_MEMBERS.filter(m =>
        membersPresence[m.prenom]?.status === 'PRESENT' || membersPresence[m.prenom]?.status === 'OPTIONNEL'
      );

      if (presentMembers.length === 0) {
        showToast('Aucun membre présent pour recevoir les tâches.', 'error');
        setSimulatedAssignments(null);
        return;
      }

      // Distribute tasks among present members in round-robin sorted by weight
      const sortedTasks = [...tasksList].sort((a, b) => b.points - a.points);
      const memberAssignments = {};
      presentMembers.forEach(m => {
        memberAssignments[m.prenom] = {
          member: m,
          tasks: [],
          totalPoints: 0,
          status: membersPresence[m.prenom]?.status
        };
      });

      sortedTasks.forEach(task => {
        // Find present member with lowest total points
        const sortedAssignees = Object.values(memberAssignments).sort((a, b) => a.totalPoints - b.totalPoints);
        const targetMember = sortedAssignees[0];
        if (targetMember) {
          targetMember.tasks.push(task);
          targetMember.totalPoints += task.points;
        }
      });

      setSimulatedAssignments(memberAssignments);
      showToast('Simulation de répartition des tâches effectuée avec succès !');
    } catch (err) {
      console.error('Erreur simulation:', err);
      showToast(err.message || 'Erreur lors de la simulation', 'error');
    } finally {
      setLoading(false);
    }
  };


  // --- TAB 2 HANDLERS: Submission, Coordinator Review & Voting ---

  // Phase 1: Submit new project
  const handleSubmitProject = async (e) => {
    e.preventDefault();
    if (!newProject.title.trim() || !newProject.description.trim()) {
      showToast('Veuillez remplir le titre et la description.', 'error');
      return;
    }

    try {
      setLoading(true);
      const created = await createProject({
        ...newProject,
        estimated_cost: Number(newProject.estimated_cost) || 0
      });
      showToast(`Nouveau projet "${created.title}" soumis avec succès !`);
      setNewProject({
        title: '',
        description: '',
        category: '🛠️ Maintenance / Réparation',
        priority: 'MOYENNE',
        property_id: 2,
        estimated_cost: 450,
        submitted_by: typeof currentUser === 'string' ? currentUser : (currentUser?.prenom || 'Henri')
      });
      await loadProjectsData();
    } catch (err) {
      console.error('Erreur soumission projet:', err);
      showToast(err.message || 'Erreur création projet', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Phase 2: Coordinator Actions
  const handleCoordinatorAction = async (actionType) => {
    if (!selectedProject) {
      showToast('Veuillez sélectionner un projet.', 'error');
      return;
    }

    try {
      setLoading(true);
      const projId = selectedProject.id;

      if (actionType === 'VALIDER_DIRECTEMENT') {
        // Action 1: Set status to EN_COURS
        await reviewProject(projId, {
          status: 'EN_COURS',
          decision_mode: 'VALIDER_DIRECTEMENT',
          estimated_cost: Number(coordinatorEdit.estimated_cost),
          responsible: coordinatorEdit.responsible,
          classification: coordinatorEdit.classification,
          priority: coordinatorEdit.priority,
          task_weight: coordinatorEdit.task_weight,
          coordinator_notes: coordinatorEdit.coordinator_notes
        });
        showToast(`Projet #${projId} validé directement -> Statut EN_COURS`);
      } else if (actionType === 'SOUMETTRE_AU_VOTE') {
        // Action 2: Set status to EN_VOTE
        await reviewProject(projId, {
          status: 'EN_VOTE',
          decision_mode: 'SOUMETTRE_AU_VOTE',
          estimated_cost: Number(coordinatorEdit.estimated_cost),
          responsible: coordinatorEdit.responsible,
          classification: coordinatorEdit.classification,
          priority: coordinatorEdit.priority,
          task_weight: coordinatorEdit.task_weight,
          coordinator_notes: coordinatorEdit.coordinator_notes
        });
        showToast(`Projet #${projId} soumis au vote familial -> Statut EN_VOTE`);
      } else if (actionType === 'PROCHAINE_AG') {
        // Action 3: Set status to PROCHAINE_AG / REPORT_AG
        await reviewProject(projId, {
          status: 'PROCHAINE_AG',
          decision_mode: 'DECALER_AG',
          add_to_ag_agenda: true,
          estimated_cost: Number(coordinatorEdit.estimated_cost),
          responsible: coordinatorEdit.responsible,
          classification: coordinatorEdit.classification,
          priority: coordinatorEdit.priority,
          task_weight: coordinatorEdit.task_weight,
          coordinator_notes: coordinatorEdit.coordinator_notes
        });
        showToast(`Projet #${projId} décalé à la prochaine Assemblée Générale (AG)`);
      } else if (actionType === 'SUPPRIMER') {
        // Action 4: Hard DELETE request to /api/projects/{id}
        await deleteProject(projId);
        showToast(`Projet #${projId} supprimé définitivement du système.`, 'info');
      }

      await loadProjectsData();
    } catch (err) {
      console.error('Erreur action coordinateur:', err);
      showToast(err.message || 'Erreur lors de la mise à jour par le coordinateur', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Phase 3: Simulate Member Vote
  const handleSimulateVote = async (memberPrenom, voteValue) => {
    if (!selectedProject) return;
    if (selectedProject.status !== 'EN_VOTE' && selectedProject.status !== 'SOUMIS') {
      showToast('Seuls les projets en statut "EN_VOTE" ou "SOUMIS" acceptent des votes.', 'warning');
      return;
    }

    try {
      setLoading(true);
      await castProjectVote(selectedProject.id, {
        user_name: memberPrenom,
        vote: voteValue,
        comment: `Vote ${voteValue} simulé via le Laboratoire de Test`
      });
      showToast(`Vote "${voteValue}" enregistré pour ${memberPrenom}`);
      await loadProjectsData();
    } catch (err) {
      console.error('Erreur vote:', err);
      showToast(err.message || 'Erreur enregistrement vote', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Preset Vote simulation
  const handleApplyVotePreset = async (presetType) => {
    if (!selectedProject) return;
    try {
      setLoading(true);
      for (const m of FAMILY_MEMBERS) {
        let v = 'POUR';
        if (presetType === 'UNANIMOUS_YES') v = 'POUR';
        else if (presetType === 'MAJORITY_YES') v = m.prenom === 'Frédéric' || m.prenom === 'Eugénie' ? 'CONTRE' : 'POUR';
        else if (presetType === 'VETO_AG') v = m.prenom === 'Maman' ? 'REPORT_PROCHAINE_AG' : 'POUR';

        await castProjectVote(selectedProject.id, {
          user_name: m.prenom,
          vote: v,
          comment: `Preset ${presetType} simulé dans le labo`
        });
      }
      showToast(`Preset de vote "${presetType}" appliqué aux 7 membres !`);
      await loadProjectsData();
    } catch (err) {
      console.error('Erreur preset vote:', err);
      showToast(err.message || 'Erreur application preset vote', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Calculate Vote Breakdown metrics for selected project
  const voteMetrics = useMemo(() => {
    if (!selectedProject || !selectedProject.votes) {
      return { pour: 0, contre: 0, abstention: 0, total: 0, pourPct: 0, unanimity: false, majority: false, vetoAg: false };
    }
    const votes = selectedProject.votes;
    const pour = votes.filter(v => ['POUR', 'OUI'].includes(v.vote.toUpperCase())).length;
    const contre = votes.filter(v => ['CONTRE', 'NON'].includes(v.vote.toUpperCase())).length;
    const abstention = votes.filter(v => v.vote.toUpperCase() === 'ABSTENTION').length;
    const reportAg = votes.filter(v => v.vote.toUpperCase() === 'REPORT_PROCHAINE_AG').length;
    const total = votes.length;
    const pourPct = total > 0 ? Math.round((pour / 7) * 100) : 0;

    return {
      pour,
      contre,
      abstention,
      reportAg,
      total,
      pourPct,
      unanimity: pour === 7,
      majority: pour >= 4,
      vetoAg: reportAg > 0
    };
  }, [selectedProject]);


  return (
    <div className="space-y-8 pb-16">
      
      {/* Toast Alert Banner */}
      {notification && (
        <div className={`fixed top-20 right-6 z-50 p-4 rounded-2xl shadow-xl border flex items-center space-x-3 transition-all animate-in fade-in slide-in-from-top-4 duration-300 ${
          notification.type === 'error' ? 'bg-rose-600 text-white border-rose-700' :
          notification.type === 'warning' ? 'bg-amber-500 text-white border-amber-600' :
          notification.type === 'info' ? 'bg-blue-600 text-white border-blue-700' :
          'bg-emerald-600 text-white border-emerald-700'
        }`}>
          {notification.type === 'error' ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
          <span className="text-xs font-bold">{notification.message}</span>
        </div>
      )}

      {/* Hero Header Section */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-extrabold">
              <FlaskConical className="w-4 h-4 text-indigo-400 animate-pulse" />
              <span>Laboratoire de Test & Sandbox API</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Laboratoire de Test Interactive SCI
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl font-medium">
              Module de simulation en temps réel connecté à l'API FastAPI. Testez l'attribution dynamique des tâches selon la présence des 7 membres et le protocole complet de soumission & vote.
            </p>
          </div>

          {/* Tab Switcher Buttons */}
          <div className="flex items-center bg-slate-800/90 p-1.5 rounded-2xl border border-slate-700/80 shrink-0 self-start md:self-auto shadow-inner">
            <button
              onClick={() => setActiveTab('presences')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-extrabold transition-all ${
                activeTab === 'presences'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>1. Présence & Tâches</span>
            </button>
            <button
              onClick={() => setActiveTab('workflow')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-extrabold transition-all ${
                activeTab === 'workflow'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Vote className="w-4 h-4" />
              <span>2. Soumission & Décision</span>
            </button>
          </div>
        </div>
      </div>


      {/* ========================================================================= */}
      {/* TAB 1: SIMULATION ATTRIBUTION DES TÂCHES SELON LA PRÉSENCE */}
      {/* ========================================================================= */}
      {activeTab === 'presences' && (
        <div className="space-y-8 animate-in fade-in duration-200">

          {/* Top Presets & Controls */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center space-x-2">
                  <Calendar className="w-5 h-5 text-indigo-600" />
                  <span>Saisie des Présences des 7 Membres Familiaux</span>
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Définissez la présence exacte de chaque membre sur la période pour calculer la répartition équitable des tâches.
                </p>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => applyPresencePreset('ALL_PRESENT')}
                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition flex items-center space-x-1"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>100% Présents</span>
                </button>
                <button
                  onClick={() => applyPresencePreset('WEEKEND')}
                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition flex items-center space-x-1"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Week-end Pâques</span>
                </button>
                <button
                  onClick={() => applyPresencePreset('RESET')}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition flex items-center space-x-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Effacer</span>
                </button>
              </div>
            </div>

            {/* Members Presence Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {FAMILY_MEMBERS.map((member) => {
                const presence = membersPresence[member.prenom] || { status: 'OPTIONNEL', startDate: '', endDate: '' };
                return (
                  <div
                    key={member.prenom}
                    className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 hover:border-slate-300 transition space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2.5">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold ${member.color}`}>
                          {member.prenom[0]}
                        </div>
                        <div>
                          <h4 className="text-xs font-extrabold text-slate-900">{member.prenom}</h4>
                          <p className="text-[10px] text-slate-500 font-medium truncate max-w-[120px]">{member.role}</p>
                        </div>
                      </div>
                    </div>

                    {/* Presence Status Selector Buttons */}
                    <div className="grid grid-cols-3 gap-1 bg-white p-1 rounded-xl border border-slate-200">
                      {['PRESENT', 'OPTIONNEL', 'IMPOSSIBLE'].map((st) => (
                        <button
                          key={st}
                          onClick={() => handlePresenceStatusChange(member.prenom, st)}
                          className={`py-1 rounded-lg text-[10px] font-extrabold transition ${
                            presence.status === st
                              ? st === 'PRESENT' ? 'bg-emerald-600 text-white shadow-sm' :
                                st === 'OPTIONNEL' ? 'bg-amber-500 text-white shadow-sm' :
                                'bg-rose-600 text-white shadow-sm'
                              : 'text-slate-500 hover:bg-slate-100'
                          }`}
                        >
                          {st === 'PRESENT' ? 'Présent' : st === 'OPTIONNEL' ? 'Option' : 'Absent'}
                        </button>
                      ))}
                    </div>

                    {/* Date Pickers */}
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 block mb-0.5">Arrivée</label>
                        <input
                          type="date"
                          value={presence.startDate}
                          onChange={(e) => handlePresenceDateChange(member.prenom, 'startDate', e.target.value)}
                          className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-slate-700 text-[11px] font-semibold"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 block mb-0.5">Départ</label>
                        <input
                          type="date"
                          value={presence.endDate}
                          onChange={(e) => handlePresenceDateChange(member.prenom, 'endDate', e.target.value)}
                          className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-slate-700 text-[11px] font-semibold"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Run Simulation Trigger */}
            <div className="pt-2 flex justify-end">
              <button
                onClick={handleRunSimulation}
                disabled={loading}
                className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-700 hover:to-emerald-700 text-white font-extrabold text-xs rounded-2xl shadow-lg transition flex items-center space-x-2"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>Calculer & Attribuer Dynamiquement les Tâches</span>
              </button>
            </div>
          </div>


          {/* Catalogue of Tasks to Attribute */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left: Task List & Custom Add */}
            <div className="lg:col-span-1 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-6">
              <div>
                <h3 className="text-sm font-black text-slate-900 flex items-center space-x-2">
                  <CheckSquare className="w-4 h-4 text-amber-500" />
                  <span>Catalogue des Tâches ({tasksList.length})</span>
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Tâches réelles à ventiler selon le poids de charge.
                </p>
              </div>

              {/* Add Custom Task Form */}
              <form onSubmit={handleAddTask} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <h4 className="text-xs font-extrabold text-slate-800 flex items-center space-x-1.5">
                  <Plus className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Ajouter une Tâche Personnalisée</span>
                </h4>
                <input
                  type="text"
                  placeholder="Intitulé de la tâche..."
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                />

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-0.5">Catégorie</label>
                    <select
                      value={newTaskCategory}
                      onChange={(e) => setNewTaskCategory(e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-slate-200 rounded-xl text-[11px] font-semibold"
                    >
                      <option>Espaces Verts</option>
                      <option>Maintenance & Équipements</option>
                      <option>Propreté & Tri</option>
                      <option>Électricité & Securité</option>
                      <option>Inspection Général</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-0.5">Poids (Charge)</label>
                    <select
                      value={newTaskWeight}
                      onChange={(e) => setNewTaskWeight(e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-slate-200 rounded-xl text-[11px] font-semibold"
                    >
                      <option value="Faible">Faible (1 pt)</option>
                      <option value="Moyen">Moyen (2 pts)</option>
                      <option value="Lourd">Lourd (3 pts)</option>
                      <option value="Critique">Critique (5 pts)</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Ajouter au Catalogue</span>
                </button>
              </form>

              {/* Tasks List */}
              <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-1">
                {tasksList.map(task => (
                  <div key={task.id} className="p-3 bg-white border border-slate-200 rounded-2xl hover:border-indigo-300 transition flex items-center justify-between group">
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="text-xs font-bold text-slate-800 truncate">{task.title}</p>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className="text-[10px] font-semibold text-slate-500">{task.category}</span>
                        <span className="text-[10px] text-slate-300">•</span>
                        <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-md ${
                          task.weight === 'Critique' ? 'bg-rose-100 text-rose-700' :
                          task.weight === 'Lourd' ? 'bg-amber-100 text-amber-700' :
                          task.weight === 'Moyen' ? 'bg-blue-100 text-blue-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {task.weight} ({task.points} pt{task.points > 1 ? 's' : ''})
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveTask(task.id)}
                      className="p-1 text-slate-300 hover:text-rose-600 transition"
                      title="Supprimer la tâche"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Dynamic Task Allocation Results Matrix */}
            <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-black text-slate-900 flex items-center space-x-2">
                    <BarChart3 className="w-5 h-5 text-emerald-600" />
                    <span>Matrice d'Attribution Dynamique par Membre</span>
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Résultat de l'algorithme d'équilibrage de charge selon les fenêtres de présence.
                  </p>
                </div>

                {simulatedAssignments && (
                  <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-extrabold flex items-center space-x-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Simulation Validée</span>
                  </span>
                )}
              </div>

              {!simulatedAssignments ? (
                <div className="py-16 text-center space-y-3 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                  <FlaskConical className="w-10 h-10 text-indigo-400 mx-auto animate-bounce" />
                  <p className="text-xs font-bold text-slate-600">
                    Ajustez les présences ci-dessus puis cliquez sur "Calculer & Attribuer Dynamiquement".
                  </p>
                  <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                    L'algorithme ventile équitablement les points de charge entre les membres présents.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Summary Bar */}
                  <div className="grid grid-cols-3 gap-4 p-4 bg-slate-900 text-white rounded-2xl">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block">Membres Présents</span>
                      <span className="text-lg font-black text-emerald-400">
                        {Object.values(simulatedAssignments).length} / 7
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block">Total Points Tâches</span>
                      <span className="text-lg font-black text-amber-400">
                        {Object.values(simulatedAssignments).reduce((sum, item) => sum + item.totalPoints, 0)} pts
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block">Moyenne Charge / Membre</span>
                      <span className="text-lg font-black text-indigo-300">
                        {Object.values(simulatedAssignments).length > 0
                          ? (Object.values(simulatedAssignments).reduce((sum, item) => sum + item.totalPoints, 0) / Object.values(simulatedAssignments).length).toFixed(1)
                          : 0} pts
                      </span>
                    </div>
                  </div>

                  {/* Individual Member Task Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.values(simulatedAssignments).map(({ member, tasks, totalPoints, status }) => (
                      <div key={member.prenom} className="p-4 rounded-2xl border border-slate-200 bg-white shadow-sm space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2.5">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold ${member.color}`}>
                              {member.prenom[0]}
                            </div>
                            <div>
                              <h4 className="text-xs font-extrabold text-slate-900">{member.prenom}</h4>
                              <p className="text-[10px] text-slate-500 font-medium">{member.role}</p>
                            </div>
                          </div>
                          <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl text-xs font-black">
                            {totalPoints} pts
                          </span>
                        </div>

                        {/* Allocated Tasks */}
                        <div className="space-y-1.5">
                          {tasks.length === 0 ? (
                            <p className="text-[11px] text-slate-400 italic py-2">Aucune tâche attribuée</p>
                          ) : (
                            tasks.map(t => (
                              <div key={t.id} className="p-2 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-[11px]">
                                <span className="font-semibold text-slate-800 truncate flex-1 pr-2">{t.title}</span>
                                <span className="font-extrabold text-slate-500 text-[10px] bg-white px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
                                  {t.points} pt{t.points > 1 ? 's' : ''}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </div>

        </div>
      )}


      {/* ========================================================================= */}
      {/* TAB 2: WORKFLOW DE SOUMISSION, VALIDATION & VOTE (PROTOCOLE DE DÉCISION) */}
      {/* ========================================================================= */}
      {activeTab === 'workflow' && (
        <div className="space-y-10 animate-in fade-in duration-200">

          {/* PHASE 1: SOUMISSION D'UN PROJET / TASK IDEA */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
            <div className="flex items-center space-x-3 pb-4 border-b border-slate-100">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black">
                1
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center space-x-2">
                  <Send className="w-5 h-5 text-indigo-600" />
                  <span>Phase 1: Soumission d'Idée ou de Projet par un Membre</span>
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Formulaire permettant à n'importe quel membre d'initier une demande de travaux ou équipement.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmitProject} className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-4 md:col-span-2">
                <div>
                  <label className="text-xs font-extrabold text-slate-700 block mb-1">Titre de la proposition</label>
                  <input
                    type="text"
                    required
                    placeholder="ex: Installation Borne Recharge Véhicule Électrique"
                    value={newProject.title}
                    onChange={(e) => setNewProject({ ...newProject, title: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-extrabold text-slate-700 block mb-1">Description détaillée</label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Expliquez la nécessité, la proposition d'artisan et l'intérêt pour la SCI Familiale..."
                    value={newProject.description}
                    onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="space-y-4 bg-slate-50/70 p-4 rounded-2xl border border-slate-200/80">
                <div>
                  <label className="text-xs font-extrabold text-slate-700 block mb-1">Catégorie</label>
                  <select
                    value={newProject.category}
                    onChange={(e) => setNewProject({ ...newProject, category: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold"
                  >
                    <option>🛠️ Maintenance / Réparation</option>
                    <option>🌳 Espaces Verts</option>
                    <option>🎨 Peinture & Aménagement</option>
                    <option>⚡ Électricité & Chauffage</option>
                    <option>🏊 Équipements</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-extrabold text-slate-700 block mb-1">Priorité</label>
                    <select
                      value={newProject.priority}
                      onChange={(e) => setNewProject({ ...newProject, priority: e.target.value })}
                      className="w-full px-2 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold"
                    >
                      <option value="BASSE">Basse</option>
                      <option value="MOYENNE">Moyenne</option>
                      <option value="HAUTE">Haute</option>
                      <option value="URGENT">Urgent</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-extrabold text-slate-700 block mb-1">Coût Estimé (€)</label>
                    <input
                      type="number"
                      value={newProject.estimated_cost}
                      onChange={(e) => setNewProject({ ...newProject, estimated_cost: e.target.value })}
                      className="w-full px-2 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-extrabold text-slate-700 block mb-1">Soumis Par</label>
                  <select
                    value={newProject.submitted_by}
                    onChange={(e) => setNewProject({ ...newProject, submitted_by: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold"
                  >
                    {FAMILY_MEMBERS.map(m => (
                      <option key={m.prenom} value={m.prenom}>{m.prenom} ({m.role})</option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-md transition flex items-center justify-center space-x-2"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Soumettre le Projet au Système</span>
                </button>
              </div>
            </form>
          </div>


          {/* PROJECT SELECTOR DROPDOWN FOR COORDINATOR REVIEW & VOTING */}
          <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-extrabold text-indigo-400 uppercase tracking-wider">Sélection de Projet pour le Sandbox</span>
              <h3 className="text-base font-black text-white">Sélectionnez le projet à examiner & tester :</h3>
            </div>
            <div className="min-w-[280px]">
              <select
                value={selectedProjectId || ''}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-indigo-400"
              >
                {projects.map(p => (
                  <option key={p.id} value={p.id}>
                    #{p.id} — {p.title} ({p.status})
                  </option>
                ))}
              </select>
            </div>
          </div>


          {/* PHASE 2: COORDINATOR ROLE & ACTIONS */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
            <div className="flex items-center space-x-3 pb-4 border-b border-slate-100">
              <div className="w-10 h-10 rounded-2xl bg-cyan-50 text-cyan-600 flex items-center justify-center font-black">
                2
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center space-x-2">
                  <ShieldCheck className="w-5 h-5 text-cyan-600" />
                  <span>Phase 2: Rôle Coordinateur (Henri) — Instruction & Décisions</span>
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Complétez le dossier (artisan, coût, classification) puis exécutez l'une des 4 actions de gouvernance.
                </p>
              </div>
            </div>

            {selectedProject ? (
              <div className="space-y-6">
                
                {/* Project Details Editor */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div>
                    <label className="text-[11px] font-extrabold text-slate-600 block mb-1">Coût Estimé Final (€)</label>
                    <input
                      type="number"
                      value={coordinatorEdit.estimated_cost}
                      onChange={(e) => setCoordinatorEdit({ ...coordinatorEdit, estimated_cost: e.target.value })}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-extrabold text-slate-600 block mb-1">Responsable / Artisan</label>
                    <input
                      type="text"
                      placeholder="ex: Jean Dupont (Plombier)"
                      value={coordinatorEdit.responsible}
                      onChange={(e) => setCoordinatorEdit({ ...coordinatorEdit, responsible: e.target.value })}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-extrabold text-slate-600 block mb-1">Classification</label>
                    <select
                      value={coordinatorEdit.classification}
                      onChange={(e) => setCoordinatorEdit({ ...coordinatorEdit, classification: e.target.value })}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                    >
                      <option value="SIGNALEMENT">SIGNALEMENT (Urgent/Entretien)</option>
                      <option value="INITIATIVE">INITIATIVE (Projet d'Amélioration)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-extrabold text-slate-600 block mb-1">Poids de Charge Tâche</label>
                    <select
                      value={coordinatorEdit.task_weight}
                      onChange={(e) => setCoordinatorEdit({ ...coordinatorEdit, task_weight: e.target.value })}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                    >
                      <option value="MINEUR">MINEUR</option>
                      <option value="MOYEN">MOYEN</option>
                      <option value="MAJEUR">MAJEUR</option>
                      <option value="CRITIQUE">CRITIQUE</option>
                    </select>
                  </div>

                  <div className="md:col-span-4">
                    <label className="text-[11px] font-extrabold text-slate-600 block mb-1">Notes du Coordinateur</label>
                    <input
                      type="text"
                      placeholder="Commentaires d'analyse ou remarques logistiques..."
                      value={coordinatorEdit.coordinator_notes}
                      onChange={(e) => setCoordinatorEdit({ ...coordinatorEdit, coordinator_notes: e.target.value })}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                    />
                  </div>
                </div>

                {/* THE 4 COORDINATOR ACTIONS */}
                <div className="space-y-3">
                  <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                    ⚡ Actions Décisionnelles du Coordinateur :
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    
                    {/* Action 1: Valider directement */}
                    <button
                      onClick={() => handleCoordinatorAction('VALIDER_DIRECTEMENT')}
                      className="p-4 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-extrabold text-xs transition flex flex-col items-start space-y-2 text-left shadow-sm group"
                    >
                      <div className="flex items-center space-x-2">
                        <CheckCircle className="w-5 h-5 text-emerald-600 group-hover:scale-110 transition-transform" />
                        <span className="font-black">1. Valider directement</span>
                      </div>
                      <span className="text-[10px] text-emerald-600 font-medium">
                        Passe le statut en <strong className="underline">EN_COURS</strong> (sans vote requis)
                      </span>
                    </button>

                    {/* Action 2: Soumettre au vote */}
                    <button
                      onClick={() => handleCoordinatorAction('SOUMETTRE_AU_VOTE')}
                      className="p-4 rounded-2xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-800 font-extrabold text-xs transition flex flex-col items-start space-y-2 text-left shadow-sm group"
                    >
                      <div className="flex items-center space-x-2">
                        <Vote className="w-5 h-5 text-indigo-600 group-hover:scale-110 transition-transform" />
                        <span className="font-black">2. Soumettre au vote</span>
                      </div>
                      <span className="text-[10px] text-indigo-600 font-medium">
                        Passe le statut en <strong className="underline">EN_VOTE</strong> pour consultation des 7 membres
                      </span>
                    </button>

                    {/* Action 3: Décaler à la prochaine AG */}
                    <button
                      onClick={() => handleCoordinatorAction('PROCHAINE_AG')}
                      className="p-4 rounded-2xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 font-extrabold text-xs transition flex flex-col items-start space-y-2 text-left shadow-sm group"
                    >
                      <div className="flex items-center space-x-2">
                        <Gavel className="w-5 h-5 text-amber-600 group-hover:scale-110 transition-transform" />
                        <span className="font-black">3. Décaler à l'AG</span>
                      </div>
                      <span className="text-[10px] text-amber-600 font-medium">
                        Passe le statut en <strong className="underline">PROCHAINE_AG</strong> & ordre du jour
                      </span>
                    </button>

                    {/* Action 4: Supprimer */}
                    <button
                      onClick={() => handleCoordinatorAction('SUPPRIMER')}
                      className="p-4 rounded-2xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-800 font-extrabold text-xs transition flex flex-col items-start space-y-2 text-left shadow-sm group"
                    >
                      <div className="flex items-center space-x-2">
                        <Trash2 className="w-5 h-5 text-rose-600 group-hover:scale-110 transition-transform" />
                        <span className="font-black">4. Supprimer (Hard DELETE)</span>
                      </div>
                      <span className="text-[10px] text-rose-600 font-medium">
                        Envoie requête HARD DELETE <code className="text-[9px] bg-rose-100 px-1 rounded">/api/projects/id</code>
                      </span>
                    </button>

                  </div>
                </div>

              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">Aucun projet disponible.</p>
            )}
          </div>


          {/* PHASE 3: SIMULATION DES VOTES */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-black">
                  3
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 flex items-center space-x-2">
                    <Vote className="w-5 h-5 text-rose-600" />
                    <span>Phase 3: Simulation des Votes des 7 Membres</span>
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Vote interactif pour chaque associé de la SCI & calcul d'unanimité / majorité en temps réel.
                  </p>
                </div>
              </div>

              {/* Vote Presets */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleApplyVotePreset('UNANIMOUS_YES')}
                  className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold hover:bg-emerald-100 transition"
                >
                  Unanimité POUR (7/7)
                </button>
                <button
                  onClick={() => handleApplyVotePreset('MAJORITY_YES')}
                  className="px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold hover:bg-indigo-100 transition"
                >
                  Majorité (5/7)
                </button>
                <button
                  onClick={() => handleApplyVotePreset('VETO_AG')}
                  className="px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl text-xs font-bold hover:bg-amber-100 transition"
                >
                  Veto AG (Maman)
                </button>
              </div>
            </div>

            {selectedProject ? (
              <div className="space-y-6">
                
                {/* 7 Members Interactive Voting Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {FAMILY_MEMBERS.map((member) => {
                    const currentMemberVote = selectedProject.votes?.find(
                      v => v.user_name.toLowerCase() === member.prenom.toLowerCase()
                    )?.vote;

                    return (
                      <div key={member.prenom} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold ${member.color}`}>
                              {member.prenom[0]}
                            </div>
                            <span className="text-xs font-extrabold text-slate-900">{member.prenom}</span>
                          </div>
                          {currentMemberVote && (
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                              ['POUR', 'OUI'].includes(currentMemberVote.toUpperCase()) ? 'bg-emerald-100 text-emerald-800' :
                              ['CONTRE', 'NON'].includes(currentMemberVote.toUpperCase()) ? 'bg-rose-100 text-rose-800' :
                              currentMemberVote.toUpperCase() === 'REPORT_PROCHAINE_AG' ? 'bg-amber-100 text-amber-800' :
                              'bg-slate-200 text-slate-700'
                            }`}>
                              {currentMemberVote}
                            </span>
                          )}
                        </div>

                        {/* Interactive Vote Action Buttons for member */}
                        <div className="grid grid-cols-3 gap-1 bg-white p-1 rounded-xl border border-slate-200">
                          <button
                            onClick={() => handleSimulateVote(member.prenom, 'POUR')}
                            className="py-1 rounded-lg text-[10px] font-black bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-700 transition"
                          >
                            👍 POUR
                          </button>
                          <button
                            onClick={() => handleSimulateVote(member.prenom, 'CONTRE')}
                            className="py-1 rounded-lg text-[10px] font-black bg-rose-50 hover:bg-rose-600 hover:text-white text-rose-700 transition"
                          >
                            👎 CONTRE
                          </button>
                          <button
                            onClick={() => handleSimulateVote(member.prenom, 'ABSTENTION')}
                            className="py-1 rounded-lg text-[10px] font-black bg-slate-100 hover:bg-slate-700 hover:text-white text-slate-600 transition"
                          >
                            ✋ ABS
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* LIVE VOTE PROGRESS & RESULTS DASHBOARD */}
                <div className="p-6 bg-slate-900 text-white rounded-3xl space-y-4 shadow-xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-black text-white flex items-center space-x-2">
                        <BarChart3 className="w-4 h-4 text-emerald-400" />
                        <span>Résultat du Vote en Temps Réel — Projet #{selectedProject.id}</span>
                      </h4>
                      <p className="text-xs text-slate-400 font-medium">
                        Dépouillement des suffrages exprimés ({voteMetrics.total} / 7 associés ont voté).
                      </p>
                    </div>

                    <div className="flex items-center space-x-2">
                      {voteMetrics.unanimity ? (
                        <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 rounded-full text-xs font-black flex items-center space-x-1">
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>✨ Unanimité Attainte (7/7 POUR)</span>
                        </span>
                      ) : voteMetrics.majority ? (
                        <span className="px-3 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 rounded-full text-xs font-black">
                          ⚖️ Majorité Adoptée ({voteMetrics.pour}/7 POUR)
                        </span>
                      ) : voteMetrics.vetoAg ? (
                        <span className="px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-400/30 rounded-full text-xs font-black">
                          🏛️ Veto AG Invoqué (Reporté)
                        </span>
                      ) : (
                        <span className="px-3 py-1 bg-slate-800 text-slate-300 rounded-full text-xs font-bold">
                          Vote En Cours...
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar Visualizer */}
                  <div className="space-y-1.5">
                    <div className="h-4 w-full bg-slate-800 rounded-full overflow-hidden flex">
                      <div
                        style={{ width: `${(voteMetrics.pour / 7) * 100}%` }}
                        className="bg-emerald-500 transition-all duration-500 flex items-center justify-center text-[9px] font-black text-slate-950"
                        title={`Pour: ${voteMetrics.pour}`}
                      >
                        {voteMetrics.pour > 0 ? `${voteMetrics.pour}` : ''}
                      </div>
                      <div
                        style={{ width: `${(voteMetrics.contre / 7) * 100}%` }}
                        className="bg-rose-500 transition-all duration-500 flex items-center justify-center text-[9px] font-black text-white"
                        title={`Contre: ${voteMetrics.contre}`}
                      >
                        {voteMetrics.contre > 0 ? `${voteMetrics.contre}` : ''}
                      </div>
                      <div
                        style={{ width: `${(voteMetrics.abstention / 7) * 100}%` }}
                        className="bg-slate-500 transition-all duration-500 flex items-center justify-center text-[9px] font-black text-white"
                        title={`Abstention: ${voteMetrics.abstention}`}
                      >
                        {voteMetrics.abstention > 0 ? `${voteMetrics.abstention}` : ''}
                      </div>
                    </div>

                    <div className="flex justify-between text-[11px] font-extrabold text-slate-400 px-1 pt-1">
                      <span className="text-emerald-400">👍 Pour : {voteMetrics.pour}</span>
                      <span className="text-rose-400">👎 Contre : {voteMetrics.contre}</span>
                      <span className="text-slate-300">✋ Abstention : {voteMetrics.abstention}</span>
                    </div>
                  </div>
                </div>

              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">Sélectionnez un projet pour simuler les votes.</p>
            )}
          </div>


          {/* PHASE 4: SUIVI DE CLASSIFICATION EN TEMPS RÉEL (PIPELINE BOARD) */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
            <div className="flex items-center space-x-3 pb-4 border-b border-slate-100">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-black">
                4
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center space-x-2">
                  <Layers className="w-5 h-5 text-amber-600" />
                  <span>Phase 4: Suivi de Classification en Temps Réel (Pipeline KANBAN)</span>
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Visualisation du cycle de vie complet des projets de la SCI dans les différentes colonnes de statut.
                </p>
              </div>
            </div>

            {/* PIPELINE COLUMNS */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              
              {/* Column 1: Nouveau / Soumis */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <span className="text-xs font-black text-slate-700 flex items-center space-x-1">
                    <Clock className="w-3.5 h-3.5 text-blue-500" />
                    <span>Nouveau / Soumis</span>
                  </span>
                  <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded-full text-[10px] font-black">
                    {projects.filter(p => p.status === 'SOUMIS').length}
                  </span>
                </div>
                <div className="space-y-2">
                  {projects.filter(p => p.status === 'SOUMIS').map(p => (
                    <div
                      key={p.id}
                      onClick={() => setSelectedProjectId(p.id)}
                      className={`p-3 bg-white rounded-xl border text-xs font-bold cursor-pointer transition ${
                        selectedProjectId === p.id ? 'border-indigo-600 ring-2 ring-indigo-100 shadow-md' : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <p className="font-extrabold text-slate-900 truncate">{p.title}</p>
                      <p className="text-[10px] text-slate-500 mt-1">{p.estimated_cost}€ • Par {p.submitted_by}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Column 2: Review Coordinateur */}
              <div className="bg-cyan-50/50 rounded-2xl p-4 border border-cyan-200/80 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-cyan-200">
                  <span className="text-xs font-black text-cyan-800 flex items-center space-x-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-cyan-600" />
                    <span>Review Coordinateur</span>
                  </span>
                  <span className="px-2 py-0.5 bg-cyan-200 text-cyan-800 rounded-full text-[10px] font-black">
                    {projects.filter(p => p.status === 'SOUMIS' || p.coordinator_notes).length}
                  </span>
                </div>
                <div className="space-y-2">
                  {projects.filter(p => p.coordinator_notes && p.status !== 'EN_VOTE' && p.status !== 'EN_COURS').map(p => (
                    <div
                      key={p.id}
                      onClick={() => setSelectedProjectId(p.id)}
                      className={`p-3 bg-white rounded-xl border text-xs font-bold cursor-pointer transition ${
                        selectedProjectId === p.id ? 'border-cyan-600 ring-2 ring-cyan-100 shadow-md' : 'border-slate-200 hover:border-cyan-300'
                      }`}
                    >
                      <p className="font-extrabold text-slate-900 truncate">{p.title}</p>
                      <p className="text-[10px] text-cyan-700 italic mt-1 line-clamp-1">"{p.coordinator_notes}"</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Column 3: En Vote */}
              <div className="bg-indigo-50/50 rounded-2xl p-4 border border-indigo-200/80 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-indigo-200">
                  <span className="text-xs font-black text-indigo-800 flex items-center space-x-1">
                    <Vote className="w-3.5 h-3.5 text-indigo-600" />
                    <span>En Vote</span>
                  </span>
                  <span className="px-2 py-0.5 bg-indigo-200 text-indigo-800 rounded-full text-[10px] font-black">
                    {projects.filter(p => p.status === 'EN_VOTE').length}
                  </span>
                </div>
                <div className="space-y-2">
                  {projects.filter(p => p.status === 'EN_VOTE').map(p => (
                    <div
                      key={p.id}
                      onClick={() => setSelectedProjectId(p.id)}
                      className={`p-3 bg-white rounded-xl border text-xs font-bold cursor-pointer transition ${
                        selectedProjectId === p.id ? 'border-indigo-600 ring-2 ring-indigo-100 shadow-md' : 'border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      <p className="font-extrabold text-slate-900 truncate">{p.title}</p>
                      <p className="text-[10px] text-indigo-600 font-extrabold mt-1">
                        {p.votes?.length || 0}/7 votes comptabilisés
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Column 4: En Cours / AG */}
              <div className="bg-amber-50/50 rounded-2xl p-4 border border-amber-200/80 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-amber-200">
                  <span className="text-xs font-black text-amber-800 flex items-center space-x-1">
                    <Gavel className="w-3.5 h-3.5 text-amber-600" />
                    <span>En Cours / AG</span>
                  </span>
                  <span className="px-2 py-0.5 bg-amber-200 text-amber-800 rounded-full text-[10px] font-black">
                    {projects.filter(p => ['EN_COURS', 'PROCHAINE_AG', 'REPORT_AG'].includes(p.status)).length}
                  </span>
                </div>
                <div className="space-y-2">
                  {projects.filter(p => ['EN_COURS', 'PROCHAINE_AG', 'REPORT_AG'].includes(p.status)).map(p => (
                    <div
                      key={p.id}
                      onClick={() => setSelectedProjectId(p.id)}
                      className={`p-3 bg-white rounded-xl border text-xs font-bold cursor-pointer transition ${
                        selectedProjectId === p.id ? 'border-amber-600 ring-2 ring-amber-100 shadow-md' : 'border-slate-200 hover:border-amber-300'
                      }`}
                    >
                      <p className="font-extrabold text-slate-900 truncate">{p.title}</p>
                      <span className={`inline-block text-[9px] font-black px-2 py-0.5 rounded-md mt-1 ${
                        p.status === 'EN_COURS' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {p.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Column 5: Terminé / Archivé */}
              <div className="bg-emerald-50/50 rounded-2xl p-4 border border-emerald-200/80 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-emerald-200">
                  <span className="text-xs font-black text-emerald-800 flex items-center space-x-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Terminé / Archivé</span>
                  </span>
                  <span className="px-2 py-0.5 bg-emerald-200 text-emerald-800 rounded-full text-[10px] font-black">
                    {projects.filter(p => ['TERMINE', 'APPROUVE', 'ARCHIVEE'].includes(p.status)).length}
                  </span>
                </div>
                <div className="space-y-2">
                  {projects.filter(p => ['TERMINE', 'APPROUVE', 'ARCHIVEE'].includes(p.status)).map(p => (
                    <div
                      key={p.id}
                      onClick={() => setSelectedProjectId(p.id)}
                      className="p-3 bg-white rounded-xl border border-slate-200 text-xs font-bold"
                    >
                      <p className="font-extrabold text-slate-900 truncate">{p.title}</p>
                      <span className="text-[9px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md mt-1 inline-block">
                        {p.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>

        </div>
      )}

    </div>
  );
}
