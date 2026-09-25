import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchTasks, createTask } from '../api';
import TaskDetailModal from './TaskDetailModal';

const ALL_MEMBERS = [
  { id: 'all', label: 'Tous les associés (7)' },
  { id: 'henri', label: 'Henri Jamet' },
  { id: 'hortense', label: 'Hortense Jamet' },
  { id: 'alexandre', label: 'Alexandre Jamet' },
  { id: 'frederic', label: 'Frédéric Jamet' },
  { id: 'eugenie', label: 'Eugénie Jamet' },
  { id: 'marguerite', label: 'Marguerite Jamet' },
  { id: 'josephine', label: 'Joséphine Jamet' },
];

const DEFAULT_DEMO_TASKS = [
  {
    id: 1,
    ref: 'T-2026-088',
    title: 'Renégociation Contrat Jardinier EI Perrot & Fauche Tardive',
    description: 'Renégociation annuelle du contrat d\'entretien du parc de Rosing avec passage en déclaration CESU (crédit d\'impôt 50%) et fauche tardive validée en AG.',
    category: 'Espaces Verts & Parc',
    subject: 'Rosing',
    priority: 'Haute',
    status: 'EN_COURS',
    complexity: 'Modérée',
    budget: 3900,
    assignee: 'Hortense Jamet',
    assigned_members: ['Hortense Jamet', 'Alexandre Jamet', 'Henri Jamet'],
    step_label: 'Étape 2/4 : Établissement de l\'avenant',
    progress: 50,
    deadline: 'Sous 15 jours',
    avatarInitials: ['HJ', 'AJ', 'HJ'],
  },
  {
    id: 2,
    ref: 'T-2026-091',
    title: 'Contrôle & Expertise des Poutres Maîtresses',
    description: 'Diagnostic structurel de la charpente de la bibliothèque avant plâtrerie. Devis expert attendu sous 10 jours.',
    category: 'Bâti & Structure',
    subject: 'Presbytère',
    priority: 'Critique',
    status: 'EN_COURS',
    complexity: 'Expertise requise',
    budget: 1200,
    assignee: 'Henri Jamet',
    assigned_members: ['Henri Jamet', 'Frédéric Jamet'],
    step_label: 'Étape 1/3 : Visite expert programmée',
    progress: 33,
    deadline: 'Sous 10 jours',
    avatarInitials: ['HJ', 'FJ'],
  },
  {
    id: 3,
    ref: 'T-2026-094',
    title: 'Surveillance & Entretien Pompe à Chaleur Rosing',
    description: 'Vérification de consigne de température en lecture seule, taux de sel piscine et contrôle des filtres avant période estivale.',
    category: 'Équipements & Énergie',
    subject: 'Piscine',
    priority: 'Normale',
    status: 'EN_COURS',
    complexity: 'Faible',
    budget: 650,
    assignee: 'Frédéric Jamet',
    assigned_members: ['Frédéric Jamet'],
    step_label: 'Étape 3/4 : Télémétrie opérationnelle',
    progress: 75,
    deadline: 'Fin juillet',
    avatarInitials: ['FJ'],
  },
  {
    id: 4,
    ref: 'T-2026-098',
    title: 'Rénovation Peintures Salon & Tri Mobilier Hangar',
    description: 'Rafraîchissement des teintes du grand salon Presbytère et inventaire des meubles anciens conservés au hangar.',
    category: 'Décoration & Tri',
    subject: 'Presbytère',
    priority: 'Planifié',
    status: 'PLANIFIE',
    complexity: 'Modérée',
    budget: 800,
    assignee: 'Eugénie Jamet',
    assigned_members: ['Eugénie Jamet', 'Marguerite Jamet'],
    step_label: 'Étape 1/4 : Sélection des nuanciers',
    progress: 25,
    deadline: 'Automne 2026',
    avatarInitials: ['EJ', 'MJ'],
  },
  {
    id: 5,
    ref: 'T-2026-102',
    title: 'Remplacement Détecteurs Fumée & Extincteurs SCI',
    description: 'Contrôle quinquennal de sécurité incendie sur l\'ensemble des 7 chambres et des dépendances.',
    category: 'Sécurité & Normes',
    subject: 'SCI',
    priority: 'Normale',
    status: 'EN_COURS',
    complexity: 'Faible',
    budget: 350,
    assignee: 'Henri Jamet',
    assigned_members: ['Henri Jamet'],
    step_label: 'Étape 2/2 : Commande livrée',
    progress: 90,
    deadline: 'Immédiat',
    avatarInitials: ['HJ'],
  },
  {
    id: 6,
    ref: 'T-2026-105',
    title: 'Installation Répéteurs Wi-Fi Mesh Parc & Cabanes',
    description: 'Couverture réseau sans fil vers le verger et la grange pour assurer le travail à distance des associés en séjour.',
    category: 'Réseau & Numérique',
    subject: 'Rosing',
    priority: 'Haute',
    status: 'EN_COURS',
    complexity: 'Modérée',
    budget: 450,
    assignee: 'Henri Jamet',
    assigned_members: ['Henri Jamet', 'Alexandre Jamet'],
    step_label: 'Étape 2/3 : Câblage testé',
    progress: 60,
    deadline: 'Avant 15 août',
    avatarInitials: ['HJ', 'AJ'],
  },
];

export default function TasksPage({ currentUser = 'Henri Jamet' }) {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('urgency');
  const [selectedPriority, setSelectedPriority] = useState('Toutes');
  const [selectedAssignee, setSelectedAssignee] = useState('all');
  const [selectedSubject, setSelectedSubject] = useState('all');

  // Modal states
  const [inspectingTask, setInspectingTask] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // New task form state
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newSubject, setNewSubject] = useState('Rosing');
  const [newPriority, setNewPriority] = useState('Normale');
  const [newBudget, setNewBudget] = useState(300);
  const [newAssignee, setNewAssignee] = useState('Henri Jamet');
  const [creating, setCreating] = useState(false);

  const loadTasks = async () => {
    try {
      setLoading(true);
      const data = await fetchTasks();
      if (Array.isArray(data)) {
        setTasks(data);
      } else {
        setTasks(DEFAULT_DEMO_TASKS);
      }
    } catch (err) {
      console.warn('API fetchTasks fallback to defaults:', err);
      setTasks(DEFAULT_DEMO_TASKS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      setCreating(true);
      const payload = {
        title: newTitle.trim(),
        description: newDescription.trim(),
        subject: newSubject,
        priority: newPriority,
        budget: parseFloat(newBudget) || 0,
        assignee_name: newAssignee,
        assigned_members: [newAssignee],
        category: 'Chantier du Domaine',
      };
      await createTask(payload);
      setIsCreateModalOpen(false);
      setNewTitle('');
      setNewDescription('');
      await loadTasks();
    } catch (err) {
      console.error('Erreur création tâche:', err);
      alert(err.message || 'Erreur lors de la création de la tâche.');
    } finally {
      setCreating(false);
    }
  };

  // Filter tasks
  const filteredTasks = tasks.filter((t) => {
    // Search
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const match =
        t.title?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.subject?.toLowerCase().includes(q) ||
        t.assignee?.toLowerCase().includes(q) ||
        t.ref?.toLowerCase().includes(q);
      if (!match) return false;
    }

    // Priority filter
    if (selectedPriority !== 'Toutes') {
      if (t.priority?.toLowerCase() !== selectedPriority.toLowerCase()) return false;
    }

    // Assignee filter
    if (selectedAssignee !== 'all') {
      const target = selectedAssignee.toLowerCase();
      const matchesAssignee =
        t.assignee?.toLowerCase().includes(target) ||
        (Array.isArray(t.assigned_members) && t.assigned_members.some((m) => m.toLowerCase().includes(target)));
      if (!matchesAssignee) return false;
    }

    // Subject filter
    if (selectedSubject !== 'all') {
      if (t.subject?.toLowerCase() !== selectedSubject.toLowerCase()) return false;
    }

    return true;
  });

  // Sort tasks
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    if (sortBy === 'urgency') {
      const priorityOrder = { Critique: 3, Haute: 2, Normale: 1, Planifié: 0 };
      return (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
    }
    if (sortBy === 'budget_desc') {
      return (b.budget || 0) - (a.budget || 0);
    }
    return 0;
  });

  // Metrics computation
  const openTasksCount = tasks.filter((t) => t.status !== 'ARCHIVEE' && t.status !== 'TERMINE').length;
  const directTasksCount = tasks.filter((t) => {
    const userFirst = (currentUser || 'Henri').split(' ')[0].toLowerCase();
    return (
      t.assignee?.toLowerCase().includes(userFirst) ||
      (Array.isArray(t.assigned_members) && t.assigned_members.some((m) => m.toLowerCase().includes(userFirst)))
    );
  }).length;
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === 'TERMINE' || t.status === 'ARCHIVEE' || (t.progress_percent ?? t.progress) === 100).length;
  const percent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const strokeDashoffset = 113 - (113 * percent) / 100;
  const priorityTasksCount = tasks.filter((t) => (t.priority === 'Critique' || t.priority === 'Haute') && t.status !== 'TERMINE' && t.status !== 'ARCHIVEE').length;

  return (
    <div className="flex flex-col w-full pb-16 space-y-space-lg">
      
      {/* ==================== 1. TOP AMBIENT BANNER & ACTIONS ==================== */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md pt-space-xs">
        <div className="space-y-1.5 max-w-3xl">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sage-soft text-primary font-label-sm text-xs font-semibold">
            <span className="material-symbols-outlined text-[16px]">domain</span>
            Domaine d'Hellenvilliers • Travaux & Intendance
          </span>
          <h1 className="font-headline-lg text-2xl sm:text-3xl lg:text-headline-lg text-forest-deep tracking-tight mt-1 font-bold">
            Registre des Tâches, Chantiers & Missions
          </h1>
          <p className="font-body-md text-xs sm:text-sm text-on-surface-variant">
            Suivi opérationnel, attribution aux associés, budgets prévisionnels et protocoles de clôture.
          </p>
        </div>

        {/* Buttons adhering to Stitch signature style: bg-white, border-2, icon + text */}
        <div className="flex items-center gap-space-sm shrink-0 flex-wrap">
          <button
            type="button"
            onClick={() => window.print()}
            className="h-[48px] px-4 rounded-2xl bg-white border-2 border-outline-variant text-on-surface font-label-md text-xs sm:text-sm hover:bg-canvas-slate hover:border-outline transition-all duration-200 flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px] text-on-surface-variant">download</span>
            <span>Exporter en PDF</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="h-[48px] px-5 rounded-2xl bg-white border-2 border-primary-container text-primary-container font-label-md text-xs sm:text-sm font-bold hover:bg-sage-soft hover:border-primary transition-all duration-200 flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px] text-primary-container">add_task</span>
            <span>Nouvelle tâche ou mission</span>
          </button>
        </div>
      </div>

      {/* ==================== 2. KPI OVERVIEW STRIP (3 CARDS) ==================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-space-md max-w-[1100px] mx-auto w-full">
        
        {/* KPI 1 : Tâches Ouvertes */}
        <div className="bg-surface-container-lowest rounded-2xl p-space-md shadow-sm border border-border-subtle flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <span className="font-label-sm text-xs text-on-surface-variant uppercase tracking-wider block font-semibold">
                Tâches Ouvertes
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="font-display-lg text-3xl font-bold text-forest-deep leading-none">
                  {openTasksCount ?? 0}
                </span>
                <span className="font-label-sm text-xs text-on-surface-variant">chantiers</span>
              </div>
            </div>
            <div className="w-11 h-11 rounded-xl bg-sage-soft flex items-center justify-center text-primary-container">
              <span className="material-symbols-outlined text-[24px]">construction</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-error animate-pulse"></span>
            <span className="font-semibold text-error">{priorityTasksCount} chantiers prioritaires</span>
            <span className="text-on-surface-variant">à traiter</span>
          </div>
        </div>

        {/* KPI 2 : Mes Tâches Directes */}
        <div className="bg-surface-container-lowest rounded-2xl p-space-md shadow-sm border border-border-subtle flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <span className="font-label-sm text-xs text-on-surface-variant uppercase tracking-wider block font-semibold">
                Mes Tâches Directes
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="font-display-lg text-3xl font-bold text-primary leading-none">
                  {directTasksCount ?? 0}
                </span>
                <span className="font-label-sm text-xs text-on-surface-variant">chantiers actifs</span>
              </div>
            </div>
            <div className="w-11 h-11 rounded-xl bg-surface-container-high flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[24px]">assignment_ind</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-xs text-on-surface-variant">
            <span className="w-2 h-2 rounded-full bg-primary"></span>
            <span>{currentUser || 'Henri Jamet'} (Gérance SCI)</span>
          </div>
        </div>

        {/* KPI 3 : Avancement Global (SVG Gauge) */}
        <div className="bg-surface-container-lowest rounded-2xl p-space-md shadow-sm border border-border-subtle flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <span className="font-label-sm text-xs text-on-surface-variant uppercase tracking-wider block font-semibold">
                Avancement Global
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="font-display-lg text-3xl font-bold text-forest-deep leading-none">{percent}</span>
                <span className="font-headline-sm text-lg font-semibold text-forest-deep">%</span>
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
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  strokeWidth="4"
                ></circle>
              </svg>
              <span className="absolute text-[11px] font-bold text-forest-deep">{completedTasks}/{totalTasks}</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-on-surface-variant">
            <span>{completedTasks} jalons validés</span>
            <span className="text-primary font-semibold">{openTasksCount} en cours</span>
          </div>
        </div>

      </div>

      {/* ==================== 3. FILTRATION & SEARCH CONSOLE ==================== */}
      <section className="bg-surface-container-lowest rounded-2xl p-4 sm:p-space-md lg:p-space-lg shadow-sm border border-border-subtle flex flex-col gap-space-md">
        
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
              className="w-full h-[50px] pl-12 pr-4 bg-canvas-slate rounded-xl text-on-surface font-body-md text-xs sm:text-sm border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-container transition-all"
            />
          </div>

          {/* Sorting Controller */}
          <div className="flex items-center gap-space-xs shrink-0">
            <span className="font-label-sm text-xs text-on-surface-variant whitespace-nowrap flex items-center gap-1 font-semibold">
              <span className="material-symbols-outlined text-[18px]">sort</span>
              Trier par :
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="h-[50px] px-3.5 pr-8 bg-canvas-slate rounded-xl font-label-sm text-xs sm:text-sm text-on-surface font-semibold border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer transition-colors"
            >
              <option value="urgency">Degré d'urgence (priorité haute)</option>
              <option value="budget_desc">Budget prévisionnel (décroissant)</option>
            </select>
          </div>
        </div>

        {/* Priority Filter Pills */}
        <div className="flex flex-col gap-1.5">
          <span className="font-label-sm text-xs text-on-surface-variant font-semibold uppercase tracking-wider">
            Priorité & Niveau d'Alerte :
          </span>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {['Toutes', 'Critique', 'Haute', 'Normale', 'Planifié'].map((p) => {
              const isActive = selectedPriority === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setSelectedPriority(p)}
                  className={`px-4 py-2 rounded-full font-label-sm text-xs flex items-center gap-2 transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-sage-soft text-primary font-bold shadow-xs'
                      : 'bg-canvas-slate text-on-surface-variant hover:bg-slate-200'
                  }`}
                >
                  {p === 'Critique' && <span className="w-2 h-2 rounded-full bg-error"></span>}
                  {p === 'Haute' && <span className="w-2 h-2 rounded-full bg-amber-rich"></span>}
                  {p === 'Normale' && <span className="w-2 h-2 rounded-full bg-secondary"></span>}
                  {p === 'Planifié' && <span className="w-2 h-2 rounded-full bg-outline"></span>}
                  <span>{p}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Dropdown Selectors for Associés and Sujets */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm pt-1">
          {/* Associé Responsable */}
          <div className="flex flex-col gap-1">
            <label className="font-label-sm text-xs text-on-surface font-semibold flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px] text-primary">groups</span>
              Responsable / Associé
            </label>
            <select
              value={selectedAssignee}
              onChange={(e) => setSelectedAssignee(e.target.value)}
              className="h-[44px] px-3.5 bg-canvas-slate rounded-xl font-label-sm text-xs text-on-surface font-medium border border-slate-200 focus:ring-2 focus:ring-primary focus:outline-none cursor-pointer"
            >
              {ALL_MEMBERS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Lieu / Sujet */}
          <div className="flex flex-col gap-1">
            <label className="font-label-sm text-xs text-on-surface font-semibold flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px] text-primary">label</span>
              Sujet
            </label>
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="h-[44px] px-3.5 bg-canvas-slate rounded-xl font-label-sm text-xs text-on-surface font-medium border border-slate-200 focus:ring-2 focus:ring-primary focus:outline-none cursor-pointer"
            >
              <option value="all">Tous les sujets</option>
              <option value="rosing">Rosing</option>
              <option value="presbytere">Presbytère</option>
              <option value="piscine">Piscine</option>
              <option value="sci">SCI</option>
            </select>
          </div>
        </div>

      </section>

      {/* ==================== 4. GRILLE DES CARTES DE TÂCHES ==================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
        {sortedTasks.length === 0 ? (
          <div className="col-span-full py-12 px-6 bg-surface-container-lowest rounded-2xl border border-dashed border-border-subtle flex flex-col items-center justify-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-sage-soft text-forest-deep flex items-center justify-center mb-3">
              <span className="material-symbols-outlined text-[32px]">checklist_rtl</span>
            </div>
            <h4 className="font-headline-sm text-base font-bold text-forest-deep">
              Aucune tâche ne correspond à vos critères
            </h4>
            <p className="font-body-md text-xs sm:text-sm text-on-surface-variant max-w-md mt-1">
              Aucun chantier ou mission trouvé avec ces filtres. Essayez de réinitialiser la recherche ou de modifier les critères.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setSelectedPriority('Toutes');
                setSelectedAssignee('all');
                setSelectedSubject('all');
              }}
              className="mt-4 px-4 py-2 bg-sage-soft text-forest-deep text-xs font-bold rounded-xl hover:bg-emerald-100 transition-colors cursor-pointer"
            >
              Réinitialiser les filtres
            </button>
          </div>
        ) : (
          sortedTasks.map((t) => {
            const isCritical = t.priority === 'Critique';
            const isHigh = t.priority === 'Haute';
            const progressVal = t.progress_percent ?? t.progress ?? 50;
            const displayAssignee = (Array.isArray(t.assigned_members) && t.assigned_members.length > 0 ? t.assigned_members[0] : null) ?? t.assignee ?? 'Henri Jamet';
            const avatarInitials = (displayAssignee || 'HJ').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'HJ';

            return (
              <article
                key={t.id}
                className={`rounded-2xl p-5 shadow-sm border transition-all duration-200 flex flex-col justify-between gap-4 hover:shadow-md ${
                  isCritical
                    ? 'bg-red-50/40 border-red-200'
                    : isHigh
                    ? 'bg-amber-soft/20 border-amber-200'
                    : 'bg-white border-border-subtle'
                }`}
              >
                {/* Header tags & budget */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                        isCritical
                          ? 'bg-error text-white'
                          : isHigh
                          ? 'bg-amber-rich text-white'
                          : 'bg-emerald-100 text-forest-deep'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[13px]">
                        {isCritical ? 'error' : isHigh ? 'warning' : 'check_circle'}
                      </span>
                      {t.priority} • {t.category?.split(' ')[0] || 'Chantier'}
                    </span>

                    <span className="px-2.5 py-0.5 rounded-full bg-canvas-slate border border-slate-200 text-xs font-semibold text-forest-deep">
                      {t.subject || 'Rosing'}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-[11px] text-on-surface-variant block">Budget prév.</span>
                    <span className="font-bold text-xs sm:text-sm text-forest-deep">
                      {t.budget ? `~${t.budget.toLocaleString('fr-FR')} € TTC` : 'Inclus SCI'}
                    </span>
                  </div>
                </div>

                {/* Title & Description */}
                <div>
                  <h3 className="font-headline-sm text-base font-bold text-forest-deep">
                    {t.title}
                  </h3>
                  <p className="font-body-md text-xs sm:text-sm text-on-surface-variant leading-relaxed mt-1 line-clamp-2">
                    {t.description}
                  </p>
                </div>

                {/* Multi-step Progress Bar with Shimmer */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-on-surface-variant">
                    <span className="font-medium text-forest-deep">
                      {t.step_label || 'Avancement du chantier'}
                    </span>
                    <span className="font-bold text-primary">{progressVal}%</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden border border-slate-200/60">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-600 to-teal-600 rounded-full progress-shimmer transition-all duration-500"
                      style={{ width: `${progressVal}%` }}
                    ></div>
                  </div>
                </div>

                {/* Assignee & Action button */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center font-bold text-xs">
                      {avatarInitials}
                    </div>
                    <div className="flex flex-col leading-tight">
                      <span className="text-xs font-semibold text-on-surface">
                        {displayAssignee}
                      </span>
                      <span className="text-[11px] text-on-surface-variant">
                        {t.deadline || 'Sous 15 jours'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setInspectingTask(t)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border-2 border-emerald-600 text-emerald-800 hover:bg-emerald-50 text-xs font-bold transition-all shadow-xs cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">visibility</span>
                    Consulter la tâche
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* ==================== 5. ENCART DE DÉLÉGATION JURIDIQUE ==================== */}
      <section className="bg-surface-container-lowest rounded-2xl p-5 border border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-soft text-amber-rich flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[24px]">gavel</span>
          </div>
          <div>
            <h4 className="font-headline-sm text-sm font-bold text-forest-deep">
              Règle de Délégation & Seuil Budgétaire (300 €)
            </h4>
            <p className="font-body-md text-xs text-on-surface-variant">
              Toute intervention dépassant le montant de 300 € TTC requiert obligatoirement un vote d'approbation préalable de la SCI.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('/votes')}
          className="px-4 py-2 rounded-xl bg-white border-2 border-amber-rich text-amber-rich hover:bg-amber-soft text-xs font-bold shadow-xs whitespace-nowrap cursor-pointer"
        >
          Ouvrir un vote formel
        </button>
      </section>

      {/* Detail / Edit Modal */}
      {inspectingTask && (
        <TaskDetailModal
          isOpen={Boolean(inspectingTask)}
          task={inspectingTask}
          onClose={() => setInspectingTask(null)}
          currentUser={currentUser}
          onTaskUpdated={loadTasks}
        />
      )}

      {/* Task Creation Modal */}
      {isCreateModalOpen && (
        <div
          aria-modal="true"
          role="dialog"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-xl w-full shadow-2xl border border-slate-200 space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-sage-soft text-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-[24px]">add_task</span>
                </div>
                <div>
                  <h3 className="font-headline-sm text-base sm:text-lg font-bold text-forest-deep">
                    Nouvelle tâche ou mission
                  </h3>
                  <p className="text-xs text-on-surface-variant">
                    Ajout au registre du Domaine d'Hellenvilliers
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4 text-xs sm:text-sm">
              <div className="space-y-1">
                <label className="font-semibold text-on-surface block">Titre de la mission</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ex: Réparation volets bibliothèque, taille haie..."
                  className="w-full h-11 px-3 bg-canvas-slate rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-on-surface block">Description détaillée</label>
                <textarea
                  rows={3}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Objectif, urgence, prestataires éventuels..."
                  className="w-full p-3 bg-canvas-slate rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-on-surface block">Sujet</label>
                  <select
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                    className="w-full h-10 px-3 bg-canvas-slate rounded-xl border border-slate-300 cursor-pointer"
                  >
                    <option value="Rosing">Rosing</option>
                    <option value="Presbytère">Presbytère</option>
                    <option value="Piscine">Piscine</option>
                    <option value="Jardin">Jardin</option>
                    <option value="SCI">SCI</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-on-surface block">Priorité</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value)}
                    className="w-full h-10 px-3 bg-canvas-slate rounded-xl border border-slate-300 cursor-pointer"
                  >
                    <option value="Critique">Critique</option>
                    <option value="Haute">Haute</option>
                    <option value="Normale">Normale</option>
                    <option value="Planifié">Planifié</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-on-surface block">Budget prévisionnel (€ TTC)</label>
                  <input
                    type="number"
                    value={newBudget}
                    onChange={(e) => setNewBudget(e.target.value)}
                    className="w-full h-10 px-3 bg-canvas-slate rounded-xl border border-slate-300"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-on-surface block">Responsable assigné</label>
                  <select
                    value={newAssignee}
                    onChange={(e) => setNewAssignee(e.target.value)}
                    className="w-full h-10 px-3 bg-canvas-slate rounded-xl border border-slate-300 cursor-pointer"
                  >
                    {ALL_MEMBERS.filter((m) => m.id !== 'all').map((m) => (
                      <option key={m.id} value={m.label}>{m.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 font-semibold hover:bg-slate-100 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 rounded-xl bg-white border-2 border-emerald-600 text-emerald-800 hover:bg-emerald-50 font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[16px]">add_circle</span>
                  Créer la tâche
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
