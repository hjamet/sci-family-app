import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchProjects, fetchReservations, fetchTasks } from '../api';
import TaskDetailModal from './TaskDetailModal';
import VoteRoofModal from './VoteRoofModal';
import { extractParticipants } from '../pages/CalendarPage';
import { VoteCardSkeleton, CompactStaySkeleton, CardSkeleton } from './SkeletonLoaders';

export function formatLiteraryStayDates(startDateStr, endDateStr) {
  if (!startDateStr && !endDateStr) return 'Dates à confirmer';

  const parseParts = (str) => {
    if (!str || typeof str !== 'string') return null;
    const m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) {
      return {
        year: parseInt(m[1], 10),
        month: parseInt(m[2], 10) - 1,
        day: parseInt(m[3], 10),
      };
    }
    const d = new Date(str);
    if (isNaN(d.getTime())) return null;
    return {
      year: d.getFullYear(),
      month: d.getMonth(),
      day: d.getDate(),
    };
  };

  const startParts = parseParts(startDateStr);
  const endParts = parseParts(endDateStr);

  const daysOfWeek = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const months = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
  ];

  if (startParts && endParts) {
    const startDate = new Date(startParts.year, startParts.month, startParts.day, 12, 0, 0);
    const endDate = new Date(endParts.year, endParts.month, endParts.day, 12, 0, 0);

    const startDayName = daysOfWeek[startDate.getDay()];
    const endDayName = daysOfWeek[endDate.getDay()];
    const startMonthName = months[startParts.month];
    const endMonthName = months[endParts.month];

    return `Du ${startDayName} ${startParts.day} ${startMonthName} au ${endDayName} ${endParts.day} ${endMonthName} ${endParts.year}`;
  }

  if (startParts) {
    const startDate = new Date(startParts.year, startParts.month, startParts.day, 12, 0, 0);
    const startDayName = daysOfWeek[startDate.getDay()];
    const startMonthName = months[startParts.month];
    return `À partir du ${startDayName} ${startParts.day} ${startMonthName} ${startParts.year}`;
  }

  return 'Dates à confirmer';
}

export default function DashboardPage({
  currentUser = 'Henri',
  setActiveTab,
  onOpenNewProject,
  onOpenBooking,
}) {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inspectingTask, setInspectingTask] = useState(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isTaskEditingDirect, setIsTaskEditingDirect] = useState(false);
  const [isRoofVoteModalOpen, setIsRoofVoteModalOpen] = useState(false);

  const handleOpenCreateTask = () => {
    setInspectingTask({
      title: '',
      description: '',
      subject: 'Rosing',
      complexity: 'Modérée',
      budget: 0,
      assigned_members: [typeof currentUser === 'string' ? currentUser : (currentUser?.prenom ? `${currentUser.prenom} ${currentUser.nom || 'Jamet'}` : 'Henri Jamet')],
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

  const handleOpenCreateVote = () => {
    setInspectingTask({
      title: '',
      description: '',
      subject: 'Presbytère',
      complexity: 'Élevée',
      budget: 1500,
      isVoteInitiative: true,
      assigned_members: [typeof currentUser === 'string' ? currentUser : (currentUser?.prenom ? `${currentUser.prenom} ${currentUser.nom || 'Jamet'}` : 'Henri Jamet')],
      checklist: [
        { text: 'Demande et analyse des devis contradictoires', done: false },
        { text: 'Consultation et vote des 7 associés statutaires', done: false },
        { text: 'Engagement des dépenses et validation gérance', done: false },
        { text: 'Contrôle de conformité et réception des travaux', done: false },
      ]
    });
    setIsTaskEditingDirect(true);
    setIsTaskModalOpen(true);
  };

  const userPrenom = typeof currentUser === 'object'
    ? (currentUser?.prenom || 'Henri')
    : (currentUser ? currentUser.split(' ')[0] : 'Henri');

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const [projData, resData, taskData] = await Promise.all([
        fetchProjects().catch(() => []),
        fetchReservations().catch(() => []),
        fetchTasks().catch(() => []),
      ]);
      setProjects(projData || []);
      setReservations(resData || []);
      setTasks(taskData || []);
    } catch (err) {
      console.error('Erreur chargement dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const navigateTo = (target) => {
    const routeMap = {
      home: '/',
      reservations: '/calendrier',
      calendrier: '/calendrier',
      tasks: '/taches',
      taches: '/taches',
      votes: '/taches',
      democratie: '/taches',
      admin: '/admin',
      administratif: '/admin',
      'finances-cca': '/admin',
      vademecum: '/sejour',
      sejour: '/sejour',
      energie: '/energie',
    };
    const cleanKey = typeof target === 'string' && target.startsWith('/') ? target.slice(1) : target;
    const destPath = routeMap[target] || routeMap[cleanKey] || (typeof target === 'string' && target.startsWith('/') ? target : `/${target}`);

    if (setActiveTab) {
      if (target === '/calendrier' || target === 'calendrier' || target === 'reservations') {
        setActiveTab('reservations');
      } else if (target === '/taches' || target === 'taches' || target === 'tasks' || target === '/votes' || target === 'votes' || target === 'democratie') {
        setActiveTab('tasks');
      } else if (target === '/sejour' || target === 'sejour' || target === 'vademecum') {
        setActiveTab('vademecum');
      } else if (target === '/energie' || target === 'energie') {
        setActiveTab('vademecum');
      } else if (target === '/admin' || target === 'admin') {
        setActiveTab('admin');
      } else {
        setActiveTab(target);
      }
    }

    navigate(destPath);
  };

  // Find active project or null
  const activeVote = projects.find(p => p.status === 'EN_VOTE' || p.status === 'SOUMIS' || p.status === 'EN_COURS') || (projects.length > 0 ? projects[0] : null);

  const activeVoteVotes = activeVote?.votes || [];
  const activeVotePour = activeVoteVotes.filter(v => ['OUI', 'POUR'].includes((v.vote || '').toUpperCase()));
  const activeVoteAbs = activeVoteVotes.filter(v => (v.vote || '').toUpperCase() === 'ABSTENTION');
  const activeVoteContre = activeVoteVotes.filter(v => ['NON', 'CONTRE'].includes((v.vote || '').toUpperCase()));
  const activeVoteReportAg = activeVoteVotes.filter(v => {
    const voteStr = (v.vote || '').toUpperCase();
    return voteStr === 'REPORT_AG' || voteStr === 'DEMANDE_AG' || voteStr === 'REPORT_PROCHAINE_AG' || voteStr === 'REPORT AG';
  });
  const activeVoteCastCount = activeVotePour.length + activeVoteAbs.length + activeVoteContre.length + activeVoteReportAg.length;
  const activeVotePendingCount = Math.max(0, 7 - activeVoteCastCount);

  const displayedStays = reservations && reservations.length > 0
    ? reservations.slice(0, 5)
    : [];

  const displayedTasks = tasks && tasks.length > 0
    ? tasks.slice(0, 4)
    : [];

  return (
    <div className="flex flex-col w-full space-y-space-lg sm:space-y-space-xl pb-16">
      
      {/* ==================== BANNIÈRE D'ACCUEIL CHALEUREUSE ==================== */}
      <section className="relative overflow-hidden rounded-2xl bg-surface-container-lowest p-6 sm:p-space-lg lg:p-margin shadow-sm border border-border-subtle">
        {/* Subtle decorative glow */}
        <div className="absolute -right-24 -top-24 w-96 h-96 rounded-full bg-sage-soft/40 blur-3xl pointer-events-none"></div>
        <div className="absolute -left-12 -bottom-12 w-64 h-64 rounded-full bg-amber-soft/30 blur-2xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-space-lg">
          <div className="space-y-space-xs max-w-3xl">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sage-soft text-primary font-label-sm text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
              Domaine d'Hellenvilliers • SCI Familiale
            </span>
            <h1 className="font-display-lg text-2xl sm:text-3xl lg:text-display-lg text-forest-deep tracking-tight mt-2">
              Bonjour {userPrenom},
            </h1>
            <p className="font-body-md text-sm sm:text-base text-on-surface-variant leading-relaxed">
              Bienvenue sur le portail des 7 associés. Consultez les plannings de passage, les arbitrages budgétaires et le registre des chantiers.
            </p>
          </div>

          {/* Grille 2x2 des 4 Boutons d'Action Rapide */}
          <div className="grid grid-cols-2 gap-3 w-full sm:w-auto shrink-0 pt-space-xs xl:pt-0">
            <button
              type="button"
              onClick={() => {
                if (onOpenBooking) onOpenBooking();
                else navigateTo('/calendrier');
              }}
              className="group rounded-2xl p-3 flex items-center gap-2.5 text-left transition-all hover:scale-[1.02] shadow-sm cursor-pointer bg-amber-500/10 hover:bg-amber-500/20 text-amber-900 dark:text-amber-200 border border-amber-500/20"
            >
              <span className="material-symbols-outlined text-[22px] shrink-0 group-hover:scale-110 transition-transform">
                event_available
              </span>
              <span className="font-label-lg text-xs sm:text-sm font-semibold leading-tight">
                Réserver un séjour
              </span>
            </button>

            <button
              type="button"
              onClick={handleOpenCreateTask}
              className="group rounded-2xl p-3 flex items-center gap-2.5 text-left transition-all hover:scale-[1.02] shadow-sm cursor-pointer bg-sky-500/10 hover:bg-sky-500/20 text-sky-900 dark:text-sky-200 border border-sky-500/20"
            >
              <span className="material-symbols-outlined text-[22px] shrink-0 group-hover:scale-110 transition-transform">
                add_task
              </span>
              <span className="font-label-lg text-xs sm:text-sm font-semibold leading-tight">
                Proposer une tâche
              </span>
            </button>

            <button
              type="button"
              onClick={() => navigateTo('/sejour')}
              className="group rounded-2xl p-3 flex items-center gap-2.5 text-left transition-all hover:scale-[1.02] shadow-sm cursor-pointer bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-900 dark:text-emerald-200 border border-emerald-500/20"
            >
              <span className="material-symbols-outlined text-[22px] shrink-0 group-hover:scale-110 transition-transform">
                key
              </span>
              <span className="font-label-lg text-xs sm:text-sm font-semibold leading-tight">
                Voir le Vadémécum
              </span>
            </button>

            <button
              type="button"
              onClick={() => navigateTo('/taches')}
              className="group rounded-2xl p-3 flex items-center gap-2.5 text-left transition-all hover:scale-[1.02] shadow-sm cursor-pointer bg-rose-500/10 hover:bg-rose-500/20 text-rose-900 dark:text-rose-200 border border-rose-500/20"
            >
              <span className="material-symbols-outlined text-[22px] shrink-0 group-hover:scale-110 transition-transform">
                checklist
              </span>
              <span className="font-label-lg text-xs sm:text-sm font-semibold leading-tight">
                Voir les chantiers / tâches
              </span>
            </button>
          </div>
        </div>
      </section>


      {/* ==================== 4 GRANDS ENCADRÉS THÉMATIQUES INTERACTIFS ==================== */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
        
        {/* Pilier 1 : Votes & Chantiers */}
        <div
          onClick={() => navigateTo('/votes')}
          className="group relative overflow-hidden rounded-2xl min-h-[160px] p-space-md bg-gradient-to-br from-[#065f46] to-[#044e39] text-white shadow-md transition-all duration-300 transform hover:-translate-y-1 hover:shadow-xl cursor-pointer flex flex-col justify-between"
        >
          <div className="absolute -right-6 -bottom-6 w-32 h-32 rounded-full bg-white/10 blur-xl pointer-events-none group-hover:scale-150 transition-transform duration-500"></div>
          <div className="relative z-10 flex items-center justify-between gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center text-emerald-200 group-hover:bg-white group-hover:text-[#065f46] transition-all duration-200 shadow-sm opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto">
              <span className="material-symbols-outlined text-[28px]">how_to_vote</span>
            </div>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-sm text-emerald-100">
              1 voix = 1 pers.
            </span>
          </div>
          <div className="relative z-10 mt-3">
            <h3 className="font-headline-md text-headline-sm font-bold tracking-tight text-white flex items-center justify-between">
              <span>Votes & Chantiers</span>
              <span className="material-symbols-outlined text-sm opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 text-white pointer-events-none group-hover:pointer-events-auto">
                arrow_forward
              </span>
            </h3>
            <p className="font-body-md text-xs leading-relaxed text-emerald-100/90 font-medium mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto">
              Liste des tâches à faire et des décisions à prendre.
            </p>
          </div>
        </div>

        {/* Pilier 2 : Administratif & Budget */}
        <div
          onClick={() => navigateTo('/admin')}
          className="group relative overflow-hidden rounded-2xl min-h-[160px] p-space-md bg-gradient-to-br from-[#0f4c81] to-[#0a355c] text-white shadow-md transition-all duration-300 transform hover:-translate-y-1 hover:shadow-xl cursor-pointer flex flex-col justify-between"
        >
          <div className="absolute -right-6 -bottom-6 w-32 h-32 rounded-full bg-white/10 blur-xl pointer-events-none group-hover:scale-150 transition-transform duration-500"></div>
          <div className="relative z-10 flex items-center justify-between gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center text-blue-200 group-hover:bg-white group-hover:text-[#0f4c81] transition-all duration-200 shadow-sm opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto">
              <span className="material-symbols-outlined text-[28px]">folder_shared</span>
            </div>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-sm text-blue-100">
              Statuts & CCA
            </span>
          </div>
          <div className="relative z-10 mt-3">
            <h3 className="font-headline-md text-headline-sm font-bold tracking-tight text-white flex items-center justify-between">
              <span>Administratif & Budget</span>
              <span className="material-symbols-outlined text-sm opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 text-white pointer-events-none group-hover:pointer-events-auto">
                arrow_forward
              </span>
            </h3>
            <p className="font-body-md text-xs leading-relaxed text-blue-100/90 font-medium mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto">
              Factures des membres, aperçu des comptes banquaires et Documents administratifs de la SCI
            </p>
          </div>
        </div>

        {/* Pilier 3 : Calendrier des Passages */}
        <div
          onClick={() => navigateTo('/calendrier')}
          className="group relative overflow-hidden rounded-2xl min-h-[160px] p-space-md bg-gradient-to-br from-[#d97706] to-[#92400e] text-white shadow-md transition-all duration-300 transform hover:-translate-y-1 hover:shadow-xl cursor-pointer flex flex-col justify-between"
        >
          <div className="absolute -right-6 -bottom-6 w-32 h-32 rounded-full bg-white/10 blur-xl pointer-events-none group-hover:scale-150 transition-transform duration-500"></div>
          <div className="relative z-10 flex items-center justify-between gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center text-amber-200 group-hover:bg-white group-hover:text-[#d97706] transition-all duration-200 shadow-sm opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto">
              <span className="material-symbols-outlined text-[28px]">calendar_month</span>
            </div>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-sm text-amber-100">
              52 Semaines
            </span>
          </div>
          <div className="relative z-10 mt-3">
            <h3 className="font-headline-md text-headline-sm font-bold tracking-tight text-white flex items-center justify-between">
              <span>Calendrier des Passages</span>
              <span className="material-symbols-outlined text-sm opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 text-white pointer-events-none group-hover:pointer-events-auto">
                arrow_forward
              </span>
            </h3>
            <p className="font-body-md text-xs leading-relaxed text-amber-100/90 font-medium mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto">
              Réservation et calendrier des passages
            </p>
          </div>
        </div>

        {/* Pilier 4 : Séjour & Chauffage */}
        <div
          onClick={() => navigateTo('/sejour')}
          className="group relative overflow-hidden rounded-2xl min-h-[160px] p-space-md bg-gradient-to-br from-[#0d9488] to-[#115e59] text-white shadow-md transition-all duration-300 transform hover:-translate-y-1 hover:shadow-xl cursor-pointer flex flex-col justify-between"
        >
          <div className="absolute -right-6 -bottom-6 w-32 h-32 rounded-full bg-white/10 blur-xl pointer-events-none group-hover:scale-150 transition-transform duration-500"></div>
          <div className="relative z-10 flex items-center justify-between gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center text-teal-200 group-hover:bg-white group-hover:text-[#0d9488] transition-all duration-200 shadow-sm opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto">
              <span className="material-symbols-outlined text-[28px]">key</span>
            </div>
            <span
              onClick={(e) => {
                e.stopPropagation();
                navigateTo('/energie');
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-sm text-teal-100 hover:bg-white/30 cursor-pointer"
              title="Consulter la télémesure & chauffage ViCare"
            >
              Guide & Énergie
            </span>
          </div>
          <div className="relative z-10 mt-3">
            <h3 className="font-headline-md text-headline-sm font-bold tracking-tight text-white flex items-center justify-between">
              <span>Séjour & Chauffage</span>
              <span className="material-symbols-outlined text-sm opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 text-white pointer-events-none group-hover:pointer-events-auto">
                arrow_forward
              </span>
            </h3>
            <p className="font-body-md text-xs leading-relaxed text-teal-100/90 font-medium mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto">
              Gestion du Chauffage et de la piscine pour le séjour, tâches attribuées et Vademecum
            </p>
          </div>
        </div>

      </section>

      {/* ==================== SCRUTIN FAMILIAL EN COURS ==================== */}
      <section className="w-full bg-surface-container-lowest rounded-2xl p-6 sm:p-space-lg shadow-sm border-2 border-primary/30 flex flex-col space-y-space-md relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm border-b border-outline-variant/20 pb-space-sm">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-10 h-10 rounded-xl bg-sage-soft text-primary flex items-center justify-center font-bold">
              <span className="material-symbols-outlined text-[24px]">how_to_vote</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-headline-md text-base sm:text-headline-sm text-forest-deep font-bold tracking-tight">
                  Démocratie Familiale & Scrutins en cours
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-sage-soft text-primary font-label-sm text-xs font-bold">
                  Vote actif
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigateTo('/taches')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-DEFAULT bg-white border-2 border-outline-variant text-on-surface-variant font-label-sm text-xs font-semibold hover:border-outline hover:bg-canvas-slate transition-colors shadow-sm cursor-pointer"
            >
              Tous les votes {loading ? '' : `(${projects.length})`}
            </button>
          </div>
        </div>

        {loading ? (
          <VoteCardSkeleton />
        ) : activeVote ? (
          <article
            onClick={() => setIsRoofVoteModalOpen(true)}
            className="bg-white rounded-xl p-space-md border border-outline-variant/30 flex flex-col gap-4 shadow-sm hover:shadow-md transition-all cursor-pointer group"
          >
            <div>
              <h3 className="font-headline-md text-base sm:text-headline-sm font-bold text-forest-deep group-hover:text-primary transition-colors">
                {activeVote.title}
              </h3>
              <p className="font-body-md text-on-surface-variant text-xs sm:text-sm leading-relaxed mt-1">
                {activeVote.description}
              </p>
            </div>

            {/* Participation bar */}
            <div className="bg-canvas-slate rounded-xl p-space-sm border border-outline-variant/30 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-forest-deep flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-primary">poll</span>
                  Participation : {activeVoteCastCount}/7 voix exprimées ({Math.round((activeVoteCastCount / 7) * 100)}%)
                </span>
                <span className={`font-bold ${activeVoteReportAg.length > 0 ? 'text-purple-700' : 'text-primary'}`}>
                  {activeVoteReportAg.length > 0
                    ? 'Débat en AG sollicité'
                    : (activeVotePour.length >= 4 ? 'Majorité qualifiée acquise' : 'En cours d\'instruction')}
                </span>
              </div>

              <div className="w-full h-2.5 rounded-full bg-surface-container overflow-hidden flex">
                <div 
                  className="bg-primary h-full transition-all duration-500" 
                  style={{ width: `${Math.round((activeVotePour.length / 7) * 100)}%` }} 
                  title="Pour"
                ></div>
                <div 
                  className="bg-amber-rich h-full transition-all duration-500" 
                  style={{ width: `${Math.round((activeVoteAbs.length / 7) * 100)}%` }} 
                  title="Abstention"
                ></div>
                <div 
                  className="bg-purple-700 h-full transition-all duration-500" 
                  style={{ width: `${Math.round((activeVoteReportAg.length / 7) * 100)}%` }} 
                  title="Report AG"
                ></div>
                <div 
                  className="bg-error h-full transition-all duration-500" 
                  style={{ width: `${Math.round((activeVoteContre.length / 7) * 100)}%` }} 
                  title="Contre"
                ></div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-on-surface-variant pt-1">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex items-center gap-1.5 font-medium">
                    <span className="w-2 h-2 rounded-full bg-primary inline-block"></span>
                    {activeVotePour.length} Pour
                  </span>
                  {activeVoteContre.length > 0 && (
                    <span className="flex items-center gap-1.5 font-medium text-rose-700">
                      <span className="w-2 h-2 rounded-full bg-rose-600 inline-block"></span>
                      {activeVoteContre.length} Contre
                    </span>
                  )}
                  <span className="flex items-center gap-1.5 font-medium">
                    <span className="w-2 h-2 rounded-full bg-amber-rich inline-block"></span>
                    {activeVoteAbs.length} Abstention
                  </span>
                  <span className="flex items-center gap-1.5 font-medium text-purple-800">
                    <span className="w-2 h-2 rounded-full bg-purple-700 inline-block"></span>
                    {activeVoteReportAg.length} Report AG
                  </span>
                </div>
                <span className="italic text-on-surface-variant/80">
                  {activeVotePendingCount} en attente
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-outline-variant/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#065f46] text-white flex items-center justify-center font-bold text-xs">
                  {(activeVote.submitted_by || 'Henri Jamet').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-xs font-semibold text-on-surface">Rapporteur : {activeVote.submitted_by || 'Henri Jamet'}</span>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsRoofVoteModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-DEFAULT bg-white border-2 border-primary text-primary font-label-sm text-xs font-bold hover:bg-sage-soft transition-colors shadow-sm cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">how_to_vote</span>
                  Participer au vote
                </button>
              </div>
            </div>
          </article>
        ) : (
          <div className="bg-white rounded-xl p-space-lg border border-outline-variant/30 flex flex-col items-center justify-center text-center py-8">
            <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant mb-2">
              <span className="material-symbols-outlined text-[24px]">how_to_vote</span>
            </div>
            <h3 className="font-headline-sm text-sm font-bold text-forest-deep mb-1">
              Aucun scrutin statutaire actif
            </h3>
            <p className="font-body-md text-on-surface-variant text-xs max-w-sm mb-3">
              Tous les arbitrages de dépenses et projets majeurs sont à jour. Les futurs scrutins statutaires (&gt; 300 €) s'afficheront ici.
            </p>
            <button
              type="button"
              onClick={handleOpenCreateVote}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-DEFAULT bg-white border-2 border-primary text-primary font-label-sm text-xs font-bold hover:bg-sage-soft transition-colors shadow-sm cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">add_circle</span>
              Proposer une initiative au vote
            </button>
          </div>
        )}
      </section>

      {/* ==================== SECTION SCINDÉE : SÉJOURS & MISSIONS ==================== */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-space-lg items-start">
        
        {/* Colonne Gauche : Prochains Séjours au Domaine */}
        <div className="flex flex-col space-y-space-md bg-surface-container-lowest rounded-2xl p-6 sm:p-space-lg shadow-sm border border-outline-variant/30">
          <div className="space-y-space-xs border-b border-outline-variant/20 pb-space-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs text-on-surface-variant font-medium">Saison 2026</span>
            </div>
            <h2 className="font-headline-md text-headline-md text-forest-deep font-bold tracking-tight">
              Prochains Séjours au Domaine
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
              Réservations et présences familiales à Rosing et au Presbytère.
            </p>
          </div>

          {loading ? (
            <CompactStaySkeleton count={3} />
          ) : displayedStays.length > 0 ? (
            <div className="flex flex-col space-y-3 max-h-[390px] overflow-y-auto pr-1">
              {displayedStays.map((stay, idx) => {
                const { members = [], guests = [], cleanDescription = '' } = extractParticipants(stay);
                const stayTitle = stay.title || stay.property_name || (stay.property_id === 2 ? 'Le Presbytère' : 'Rosing');
                const stayDescription = cleanDescription || stay.description || '';

                const propName = stay.property_name || (stay.property_id === 2 ? 'Le Presbytère' : 'Rosing');
                const roomsCount = stay.chambers_used || stay.rooms_count || (Array.isArray(stay.selected_rooms) ? stay.selected_rooms.length : 1);

                let propIcon = 'home';
                let roomIcon = 'bed';
                const lowerProp = propName.toLowerCase();
                if (lowerProp.includes('rosing') && lowerProp.includes('presbytère')) {
                  propIcon = 'domain';
                  roomIcon = 'meeting_room';
                } else if (lowerProp.includes('presbytère') || lowerProp.includes('presbytere')) {
                  propIcon = 'cottage';
                  roomIcon = 'bed';
                }

                return (
                  <article
                    key={stay.id || idx}
                    className="rounded-xl bg-white p-4 border border-outline-variant/30 flex flex-col justify-between gap-3 hover:shadow-md transition-all"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sage-soft border border-sage-border text-primary font-label-sm text-xs font-semibold">
                        <span className="material-symbols-outlined text-[15px] text-primary">calendar_month</span>
                        <span>{formatLiteraryStayDates(stay.start_date, stay.end_date)}</span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <h3 className="font-headline-sm text-base text-forest-deep font-bold leading-tight">
                        {stayTitle}
                      </h3>

                      {stayDescription ? (
                        <p className="font-body-md text-xs text-on-surface-variant italic leading-relaxed">
                          « {stayDescription} »
                        </p>
                      ) : null}

                      {/* Badges séparés : Membres famille (émeraude) & Invités extérieurs (ambre) */}
                      {(members.length > 0 || guests.length > 0) && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          {members.map((member, mIdx) => (
                            <span
                              key={`mem-${mIdx}`}
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200"
                            >
                              <span className="material-symbols-outlined text-[13px]">person</span>
                              <span>{member}</span>
                            </span>
                          ))}
                          {guests.map((guest, gIdx) => (
                            <span
                              key={`gst-${gIdx}`}
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200"
                            >
                              <span className="material-symbols-outlined text-[13px]">group</span>
                              <span>{guest}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-outline-variant/20">
                      <div className="flex items-center gap-3 text-xs text-on-surface-variant">
                        <span className="inline-flex items-center gap-1">
                          <span className="material-symbols-outlined text-[15px] text-primary">{propIcon}</span>
                          {propName}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <span className="material-symbols-outlined text-[15px] text-primary">{roomIcon}</span>
                          {roomsCount} chambre{roomsCount > 1 ? 's' : ''}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => navigateTo('/calendrier')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-DEFAULT bg-white border-2 border-primary text-primary font-label-sm text-xs font-semibold hover:bg-sage-soft transition-colors shadow-sm whitespace-nowrap cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">visibility</span>
                        Voir détails
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl bg-white p-space-lg border border-outline-variant/30 flex flex-col items-center justify-center text-center py-10 space-y-2">
              <div className="w-12 h-12 rounded-full bg-sage-soft/60 flex items-center justify-center text-primary mb-1">
                <span className="material-symbols-outlined text-[26px]">cottage</span>
              </div>
              <h3 className="font-headline-sm text-forest-deep font-bold text-sm">
                Aucun séjour planifié actuellement
              </h3>
              <p className="font-body-md text-on-surface-variant text-xs max-w-xs leading-relaxed">
                Le manoir et le presbytère sont libres d'occupation. Réservez une semaine pour vous ou votre famille.
              </p>
            </div>
          )}

          <div className="pt-space-xs">
            <button
              type="button"
              onClick={() => {
                if (onOpenBooking) onOpenBooking();
                else navigateTo('/calendrier');
              }}
              className="flex items-center justify-center gap-2 w-full px-5 py-3 rounded-DEFAULT bg-white border-2 border-primary text-primary hover:bg-sage-soft font-label-lg text-label-lg font-semibold transition-all shadow-sm cursor-pointer"
            >
              <span className="material-symbols-outlined text-[22px]">add_circle_outline</span>
              Réserver un nouveau séjour
            </button>
          </div>
        </div>

        {/* Colonne Droite : Missions & Tâches sous votre responsabilité */}
        <div className="flex flex-col space-y-space-md bg-surface-container-lowest rounded-2xl p-6 sm:p-space-lg shadow-sm border border-outline-variant/30">
          <div className="space-y-space-xs border-b border-outline-variant/20 pb-space-sm">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs text-on-surface-variant font-medium">Henri Jamet</span>
              </div>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sage-soft text-primary font-label-sm text-xs font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                {loading ? (
                  <span className="w-16 h-3 bg-primary/20 rounded animate-pulse inline-block"></span>
                ) : (
                  `${tasks.length} Tâche${tasks.length > 1 ? 's' : ''} active${tasks.length > 1 ? 's' : ''}`
                )}
              </span>
            </div>
            <h2 className="font-headline-md text-headline-md text-forest-deep font-bold tracking-tight">
              Missions & Tâches sous votre responsabilité
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
              Suivi des chantiers, arbitrages opérationnels et missions d'intendance confiées aux associés.
            </p>
          </div>

          {loading ? (
            <div className="flex flex-col space-y-space-sm">
              <CardSkeleton className="p-4" />
              <CardSkeleton className="p-4" />
            </div>
          ) : displayedTasks.length > 0 ? (
            <div className="flex flex-col space-y-space-sm">
              {displayedTasks.map((t, idx) => {
                const isHigh = t.priority === 'Critique' || t.priority === 'Haute';
                const category = t.category || 'Domaine';
                const deadline = t.deadline || t.timeline || 'Sous 10 jours';
                const budgetText = t.budget
                  ? `Devis ~${t.budget} €`
                  : (t.cost_estimate ? `~${t.cost_estimate} €` : 'Inclus SCI');
                const assignee = (Array.isArray(t.assigned_members) && t.assigned_members.length > 0 ? t.assigned_members[0] : null) || t.assignee || 'Henri Jamet';
                const initials = assignee.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'HJ';
                const secondaries = Array.isArray(t.assigned_members) && t.assigned_members.length > 1
                  ? `Avec ${t.assigned_members.slice(1).join(', ')}`
                  : (t.subject ? `Emplacement : ${t.subject}` : 'Chantier domaine');

                return (
                  <article
                    key={t.id || idx}
                    className={`rounded-xl p-space-md shadow-sm flex flex-col gap-3 transition-all hover:shadow-md ${
                      isHigh
                        ? 'bg-amber-soft/30 border-2 border-amber-rich/40'
                        : 'bg-white border border-outline-variant/30'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                          isHigh ? 'bg-amber-rich text-white' : 'bg-emerald-100 text-emerald-900'
                        }`}>
                          <span className="material-symbols-outlined text-[14px]">
                            {isHigh ? 'warning' : 'assignment'}
                          </span>
                          {isHigh ? `Priorité ${t.priority} • ${category}` : `Normal • ${category}`}
                        </span>
                        <span className={`text-xs font-semibold ${isHigh ? 'text-amber-rich' : 'text-on-surface-variant'}`}>
                          {deadline}
                        </span>
                      </div>
                      {t.budget ? (
                        <div className="text-right">
                          <span className="text-xs text-on-surface-variant font-medium block">Budget devis</span>
                          <span className={`font-headline-sm font-bold text-sm ${isHigh ? 'text-amber-rich' : 'text-forest-deep'}`}>
                            ~{t.budget} €
                          </span>
                        </div>
                      ) : null}
                    </div>

                    <div>
                      <h3 className="font-headline-sm text-headline-sm text-forest-deep font-bold">
                        {t.title}
                      </h3>
                      <p className="font-body-md text-on-surface-variant text-xs leading-relaxed mt-1 line-clamp-2">
                        {t.description}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-amber-rich/20 flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full text-white flex items-center justify-center font-bold text-xs ${
                          isHigh ? 'bg-amber-rich' : 'bg-[#065f46]'
                        }`}>
                          {initials}
                        </div>
                        <div className="flex flex-col leading-tight">
                          <span className="text-xs font-semibold text-on-surface">En charge : {assignee}</span>
                          <span className="text-[11px] text-on-surface-variant">{secondaries}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (t.link) navigateTo(t.link);
                          else if (t.category?.toLowerCase().includes('énergie') || t.category?.toLowerCase().includes('energie') || t.title?.toLowerCase().includes('pompe à chaleur')) {
                            navigateTo('/energie');
                          } else {
                            navigateTo('/taches');
                          }
                        }}
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-DEFAULT bg-white border-2 font-label-sm text-xs font-bold transition-colors shadow-sm cursor-pointer ${
                          isHigh
                            ? 'border-amber-rich text-amber-rich hover:bg-amber-soft'
                            : 'border-primary text-primary hover:bg-sage-soft'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          {isHigh ? 'construction' : 'visibility'}
                        </span>
                        Consulter la tâche
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl bg-white p-space-lg border border-outline-variant/30 flex flex-col items-center justify-center text-center py-10 space-y-2">
              <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant mb-1">
                <span className="material-symbols-outlined text-[26px]">task_alt</span>
              </div>
              <h3 className="font-headline-sm text-forest-deep font-bold text-sm">
                Aucune mission en cours
              </h3>
              <p className="font-body-md text-on-surface-variant text-xs max-w-xs leading-relaxed">
                Toutes les tâches d'intendance et chantiers du Domaine sont à jour ou archivés.
              </p>
            </div>
          )}

          <div className="pt-space-xs">
            <button
              type="button"
              onClick={() => navigateTo('/taches')}
              className="flex items-center justify-center gap-2 w-full px-5 py-3 rounded-DEFAULT bg-white border-2 border-primary text-primary hover:bg-sage-soft font-label-lg text-label-lg font-semibold transition-all shadow-sm cursor-pointer"
            >
              <span className="material-symbols-outlined text-[22px]">checklist</span>
              Voir toutes les tâches
            </button>
          </div>
        </div>

      </section>

      {/* Modale de Consultation et Création Détaillée de Tâche Unifiée (Annotation 16) */}
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
          onTaskUpdated={() => {
            loadDashboardData();
          }}
        />
      )}

      {/* Modale de Vote Toiture Presbytère Unifiée (Annotation 1) */}
      <VoteRoofModal
        isOpen={isRoofVoteModalOpen}
        onClose={() => setIsRoofVoteModalOpen(false)}
        currentUser={currentUser}
        project={activeVote}
        onVoteSubmit={() => {
          loadDashboardData();
        }}
      />

    </div>
  );
}
