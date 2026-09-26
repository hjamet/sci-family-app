import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchProjects, fetchReservations, fetchTasks } from '../api';

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

          {/* Boutons d'Action Rapide : Style Signature (Fond Blanc + Bordure 2px + Icône + Texte) */}
          <div className="flex flex-wrap sm:flex-nowrap items-stretch gap-space-xs sm:gap-space-sm pt-space-xs xl:pt-0">
            <button
              type="button"
              onClick={() => {
                if (onOpenBooking) onOpenBooking();
                else navigateTo('/calendrier');
              }}
              className="group flex items-center justify-center gap-2 px-5 py-3.5 rounded-DEFAULT bg-white border-2 border-primary text-primary hover:bg-sage-soft font-label-lg text-sm sm:text-label-lg transition-all duration-200 shadow-sm cursor-pointer whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[22px] group-hover:scale-110 transition-transform">
                event_available
              </span>
              <span>Réserver un séjour</span>
            </button>

            <button
              type="button"
              onClick={() => navigateTo('/sejour')}
              className="group flex items-center justify-center gap-2 px-5 py-3.5 rounded-DEFAULT bg-white border-2 border-outline-variant text-on-surface hover:border-outline hover:bg-canvas-slate font-label-lg text-sm sm:text-label-lg transition-all duration-200 shadow-sm cursor-pointer whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[22px] text-primary group-hover:rotate-12 transition-transform">
                key
              </span>
              <span>Voir le Vadémécum</span>
            </button>

            <button
              type="button"
              onClick={() => navigateTo('/taches')}
              className="flex items-center justify-center gap-2 px-5 py-3.5 rounded-DEFAULT bg-white border-2 border-primary text-primary hover:bg-sage-soft font-label-lg text-sm sm:text-label-lg font-semibold transition-all shadow-sm cursor-pointer whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[22px]">checklist</span>
              <span>Voir toutes les tâches</span>
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
            <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center text-emerald-200 group-hover:bg-white group-hover:text-[#065f46] transition-all duration-300 shadow-sm">
              <span className="material-symbols-outlined text-[28px]">how_to_vote</span>
            </div>
            <span className="opacity-90 group-hover:opacity-100 transition-opacity duration-300 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-sm text-emerald-100">
              1 voix = 1 pers.
            </span>
          </div>
          <div className="relative z-10 mt-3">
            <h3 className="font-headline-md text-headline-sm font-bold tracking-tight text-white flex items-center justify-between">
              <span>Votes & Chantiers</span>
              <span className="material-symbols-outlined text-sm opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 text-white">
                arrow_forward
              </span>
            </h3>
            <p className="font-body-md text-xs leading-relaxed text-emerald-100/90 font-medium mt-2">
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
            <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center text-blue-200 group-hover:bg-white group-hover:text-[#0f4c81] transition-all duration-300 shadow-sm">
              <span className="material-symbols-outlined text-[28px]">folder_shared</span>
            </div>
            <span className="opacity-90 group-hover:opacity-100 transition-opacity duration-300 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-sm text-blue-100">
              Statuts & CCA
            </span>
          </div>
          <div className="relative z-10 mt-3">
            <h3 className="font-headline-md text-headline-sm font-bold tracking-tight text-white flex items-center justify-between">
              <span>Administratif & Budget</span>
              <span className="material-symbols-outlined text-sm opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 text-white">
                arrow_forward
              </span>
            </h3>
            <p className="font-body-md text-xs leading-relaxed text-blue-100/90 font-medium mt-2">
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
            <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center text-amber-200 group-hover:bg-white group-hover:text-[#d97706] transition-all duration-300 shadow-sm">
              <span className="material-symbols-outlined text-[28px]">calendar_month</span>
            </div>
            <span className="opacity-90 group-hover:opacity-100 transition-opacity duration-300 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-sm text-amber-100">
              52 Semaines
            </span>
          </div>
          <div className="relative z-10 mt-3">
            <h3 className="font-headline-md text-headline-sm font-bold tracking-tight text-white flex items-center justify-between">
              <span>Calendrier des Passages</span>
              <span className="material-symbols-outlined text-sm opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 text-white">
                arrow_forward
              </span>
            </h3>
            <p className="font-body-md text-xs leading-relaxed text-amber-100/90 font-medium mt-2">
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
            <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center text-teal-200 group-hover:bg-white group-hover:text-[#0d9488] transition-all duration-300 shadow-sm">
              <span className="material-symbols-outlined text-[28px]">key</span>
            </div>
            <span
              onClick={(e) => {
                e.stopPropagation();
                navigateTo('/energie');
              }}
              className="opacity-90 group-hover:opacity-100 transition-opacity duration-300 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-sm text-teal-100 hover:bg-white/30 cursor-pointer"
              title="Consulter la télémesure & chauffage ViCare"
            >
              Guide & Énergie
            </span>
          </div>
          <div className="relative z-10 mt-3">
            <h3 className="font-headline-md text-headline-sm font-bold tracking-tight text-white flex items-center justify-between">
              <span>Séjour & Chauffage</span>
              <span className="material-symbols-outlined text-sm opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 text-white">
                arrow_forward
              </span>
            </h3>
            <p className="font-body-md text-xs leading-relaxed text-teal-100/90 font-medium mt-2">
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
              Tous les votes ({projects.length})
            </button>
          </div>
        </div>

        {activeVote ? (
          <article className="bg-white rounded-xl p-space-md border border-outline-variant/30 flex flex-col gap-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold">
                  Majorité statutaire requise
                </span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-canvas-slate border border-outline-variant/30 text-xs font-bold text-forest-deep self-start sm:self-auto">
                <span className="text-on-surface-variant font-normal">Enveloppe budgétaire :</span>
                {activeVote.estimated_cost ? `${activeVote.estimated_cost.toLocaleString('fr-FR')} € TTC` : 'Non renseigné'}
              </div>
            </div>

            <div>
              <h3 className="font-headline-md text-base sm:text-headline-sm font-bold text-forest-deep">
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
                  Participation : {activeVote.votes?.length || 0}/7 voix exprimées ({Math.round(((activeVote.votes?.length || 0) / 7) * 100)}%)
                </span>
                <span className="font-bold text-primary">
                  {(activeVote.votes?.length || 0) >= 4 ? 'Majorité qualifiée acquise' : 'En cours d\'instruction'}
                </span>
              </div>

              <div className="w-full h-2.5 rounded-full bg-surface-container overflow-hidden flex">
                <div 
                  className="bg-primary h-full transition-all duration-500" 
                  style={{ width: `${Math.round(((activeVote.votes?.filter(v => ['OUI', 'POUR'].includes(v.vote)).length || 0) / 7) * 100)}%` }} 
                  title="Pour"
                ></div>
                <div 
                  className="bg-amber-rich h-full transition-all duration-500" 
                  style={{ width: `${Math.round(((activeVote.votes?.filter(v => v.vote === 'ABSTENTION').length || 0) / 7) * 100)}%` }} 
                  title="Abstention"
                ></div>
                <div 
                  className="bg-error h-full transition-all duration-500" 
                  style={{ width: `${Math.round(((activeVote.votes?.filter(v => ['NON', 'CONTRE'].includes(v.vote)).length || 0) / 7) * 100)}%` }} 
                  title="Contre"
                ></div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-on-surface-variant pt-1">
                <span className="flex items-center gap-1.5 font-medium">
                  <span className="w-2 h-2 rounded-full bg-primary inline-block"></span>
                  {activeVote.votes?.filter(v => ['OUI', 'POUR'].includes(v.vote)).length || 0} Pour
                </span>
                <span className="flex items-center gap-1.5 font-medium">
                  <span className="w-2 h-2 rounded-full bg-amber-rich inline-block"></span>
                  {activeVote.votes?.filter(v => v.vote === 'ABSTENTION').length || 0} Abstention
                </span>
                <span className="italic text-on-surface-variant/80">
                  {Math.max(0, 7 - (activeVote.votes?.length || 0))} en attente
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
                  <span className="text-[11px] text-on-surface-variant">Membre Associé</span>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => navigateTo('/taches')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-DEFAULT bg-white border-2 border-outline-variant text-on-surface font-label-sm text-xs font-semibold hover:border-outline hover:bg-canvas-slate transition-colors shadow-sm cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px] text-primary">visibility</span>
                  Voir le dossier
                </button>
                <button
                  type="button"
                  onClick={() => navigateTo('/taches')}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-DEFAULT bg-white border-2 border-primary text-primary font-label-sm text-xs font-bold hover:bg-sage-soft transition-colors shadow-sm cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">how_to_vote</span>
                  Participer
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
              onClick={() => {
                if (onOpenNewProject) onOpenNewProject();
                else navigateTo('/taches');
              }}
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
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sage-soft text-primary font-label-sm text-label-sm font-semibold">
                <span className="material-symbols-outlined text-[16px]">date_range</span>
                Calendrier 52 Semaines
              </span>
              <span className="text-xs text-on-surface-variant font-medium">Saison 2026</span>
            </div>
            <h2 className="font-headline-md text-headline-md text-forest-deep font-bold tracking-tight">
              Prochains Séjours au Domaine
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
              Réservations confirmées et présences familiales à Rosing et au Presbytère.
            </p>
          </div>

          {displayedStays.length > 0 ? (
            <div className="flex flex-col space-y-3 max-h-[390px] overflow-y-auto pr-1">
              {displayedStays.map((stay, idx) => {
                const weekLabel = stay.week_number ? `Semaine ${stay.week_number}` : (stay.week ? `Semaine ${stay.week}` : `Séjour #${idx + 1}`);
                const dateRange = stay.start_date && stay.end_date
                  ? `(${stay.start_date} - ${stay.end_date})`
                  : '(Dates à confirmer)';

                // Épuration : suppression des badges redondants obsolètes ("Confirmé", "Réunion Annuelle & Fête")
                const rawStatus = (stay.status || '').trim();
                const isRedundantStatus = !rawStatus ||
                  rawStatus.toLowerCase() === 'confirmé' ||
                  rawStatus.toLowerCase() === 'confirme' ||
                  rawStatus.toLowerCase() === 'confirmed' ||
                  rawStatus.toLowerCase().includes('réunion annuelle') ||
                  rawStatus.toLowerCase().includes('reunion annuelle') ||
                  rawStatus.toLowerCase().includes('fête') ||
                  rawStatus.toLowerCase().includes('fete') ||
                  rawStatus.toLowerCase() === 'en_attente' ||
                  rawStatus.toLowerCase() === 'pending';

                const showContextTag = !isRedundantStatus;

                const familyName = stay.user_name || stay.title || 'Associé SCI';
                const isGathering = stay.is_gathering ||
                  familyName.toLowerCase().includes('retrouvaille') ||
                  rawStatus.toLowerCase().includes('retrouvaille') ||
                  (stay.guests >= 7 && (stay.property_name?.includes('&') || stay.chambers_used >= 7));

                const highlightLabel = stay.highlight_label || (isGathering ? '(7/7 associés)' : null);
                const guestsCount = stay.guest_count || stay.guests || 1;
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

                const buttonIcon = isGathering ? 'groups' : 'visibility';

                return (
                  <article
                    key={stay.id || idx}
                    className="rounded-xl bg-white p-3.5 border border-outline-variant/30 flex flex-col justify-between gap-2.5 hover:shadow-md transition-all"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="font-label-md text-label-md font-bold text-forest-deep">{weekLabel}</span>
                        <span className="text-xs text-on-surface-variant font-medium">{dateRange}</span>
                      </div>

                      {showContextTag && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-xs font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-outline"></span>
                          {rawStatus}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div>
                        {isGathering ? (
                          <p className="font-body-md text-forest-deep font-bold text-sm leading-tight">
                            {familyName} {highlightLabel && <span className="text-secondary font-semibold text-xs">{highlightLabel}</span>}
                          </p>
                        ) : (
                          <p className="font-body-md text-on-surface font-semibold text-sm leading-tight">
                            {familyName} <span className="text-on-surface-variant font-normal text-xs">({guestsCount} pers.)</span>
                          </p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-on-surface-variant pt-1">
                          <span className="inline-flex items-center gap-1">
                            <span className="material-symbols-outlined text-[15px] text-primary">{propIcon}</span>
                            {propName}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <span className="material-symbols-outlined text-[15px] text-primary">{roomIcon}</span>
                            {roomsCount} chambre{roomsCount > 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => navigateTo('/calendrier')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-DEFAULT bg-white border-2 border-primary text-primary font-label-sm text-xs font-semibold hover:bg-sage-soft transition-colors shadow-sm whitespace-nowrap cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">{buttonIcon}</span>
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
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-soft text-amber-rich font-label-sm text-label-sm font-semibold">
                  <span className="material-symbols-outlined text-[16px]">shield_person</span>
                  Coordinateur & Gérant
                </span>
                <span className="text-xs text-on-surface-variant font-medium">Henri Jamet</span>
              </div>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sage-soft text-primary font-label-sm text-xs font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                {tasks.length} Tâche{tasks.length > 1 ? 's' : ''} active{tasks.length > 1 ? 's' : ''}
              </span>
            </div>
            <h2 className="font-headline-md text-headline-md text-forest-deep font-bold tracking-tight">
              Missions & Tâches sous votre responsabilité
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
              Suivi des chantiers, arbitrages opérationnels et missions d'intendance confiées aux associés.
            </p>
          </div>

          {displayedTasks.length > 0 ? (
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
                      <div className="text-right">
                        <span className="text-xs text-on-surface-variant font-medium block">Budget prévisionnel</span>
                        <span className={`font-headline-sm font-bold text-sm ${isHigh ? 'text-amber-rich' : 'text-forest-deep'}`}>
                          {budgetText}
                        </span>
                      </div>
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

    </div>
  );
}
