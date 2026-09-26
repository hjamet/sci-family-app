import React, { useState, useEffect } from 'react';
import { createTask } from '../api';
import CustomSelect from './CustomSelect';

const DOMAIN_CATEGORIES = [
  { id: 'Entretien', label: 'Entretien', icon: 'handyman', defaultSubject: 'Rosing', desc: 'Maintenance courante, petites réparations' },
  { id: 'Travaux', label: 'Travaux', icon: 'construction', defaultSubject: 'Presbytère', desc: 'Rénovation, gros œuvre, aménagements' },
  { id: 'Espaces verts', label: 'Espaces verts', icon: 'yard', defaultSubject: 'Jardin', desc: 'Tonte, élagage, taille des haies, verger' },
  { id: 'Administratif', label: 'Administratif', icon: 'description', defaultSubject: 'SCI', desc: 'Contrats, assurances, déclarations, devis' },
  { id: 'Piscine', label: 'Piscine', icon: 'pool', defaultSubject: 'Piscine', desc: 'Hivernage, filtres, robot, traitement de l\'eau' },
  { id: 'Chauffage', label: 'Chauffage', icon: 'thermostat', defaultSubject: 'Presbytère', desc: 'Chaudière, fioul, radiateurs, thermostats' },
];

const ASSOCIATES_LIST = [
  { id: 'henri', name: 'Henri Jamet', role: 'Gérance & Coordination' },
  { id: 'josephine', name: 'Joséphine Jamet', role: 'Coordinatrice & Séjours' },
  { id: 'hortense', name: 'Hortense Jamet', role: 'Associée' },
  { id: 'marguerite', name: 'Marguerite Jamet', role: 'Associée' },
  { id: 'eugenie', name: 'Eugénie Jamet', role: 'Associée' },
  { id: 'frederic', name: 'Frédéric Jamet', role: 'Associé' },
  { id: 'maman', name: 'Maman (Élisabeth) Jamet', role: 'Associée fondatrice' },
  { id: 'all', name: 'Tous les associés', role: 'Mission collective' },
];

const PRIORITY_LEVELS = [
  { id: 'Critique', label: 'Critique', color: 'text-error bg-error-container/40 border-error/30', dot: 'bg-error', desc: 'Blocage ou danger immédiat' },
  { id: 'Haute', label: 'Haute', color: 'text-amber-rich bg-amber-soft border-amber-300', dot: 'bg-amber-rich', desc: 'À traiter avant le prochain séjour' },
  { id: 'Normale', label: 'Normale', color: 'text-forest-deep bg-sage-soft border-emerald-300', dot: 'bg-secondary', desc: 'Entretien courant' },
  { id: 'Planifié', label: 'Planifié', color: 'text-on-surface-variant bg-canvas-slate border-slate-300', dot: 'bg-outline', desc: 'Sans urgence' },
];

const EFFORT_POINTS = [
  { points: 1, label: '1 pt', sub: 'Rapide (< 1h)', desc: 'Vérification, commande, micro-réparation' },
  { points: 2, label: '2 pts', sub: 'Demi-journée (~3h)', desc: 'Taille, ponçage, nettoyage approfondi' },
  { points: 3, label: '3 pts', sub: 'Journée entière (~7h)', desc: 'Chantier complet sur une journée' },
  { points: 5, label: '5 pts', sub: 'Multi-jours (2-3j)', desc: 'Gros chantier ou coordination prestataires' },
  { points: 8, label: '8 pts', sub: 'Expertise / Spécialiste', desc: 'Intervention complexe nécessitant artisan' },
];

export default function NewTaskModal({
  isOpen,
  onClose,
  currentUser = 'Henri Jamet',
  onTaskCreated,
}) {
  const [title, setTitle] = useState('');
  const [description, setNewDescription] = useState('');
  const [category, setCategory] = useState('Entretien');
  const [subject, setSubject] = useState('Rosing');
  const [assignee, setAssignee] = useState(
    typeof currentUser === 'string' && currentUser ? currentUser : 'Henri Jamet'
  );
  const [priority, setPriority] = useState('Normale');
  const [points, setPoints] = useState(2);
  const [budget, setBudget] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Synchronise le sujet par défaut lors du changement de domaine / catégorie
  useEffect(() => {
    const found = DOMAIN_CATEGORIES.find(c => c.id === category);
    if (found && found.defaultSubject) {
      setSubject(found.defaultSubject);
    }
  }, [category]);

  if (!isOpen) return null;

  const currentUserName = typeof currentUser === 'string' ? currentUser : 'Henri Jamet';
  const numericBudget = parseFloat(budget) || 0;
  const isAboveThreshold = numericBudget > 300;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Veuillez saisir un titre pour la tâche.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');

      const complexityLabel = `${points} pt${points > 1 ? 's' : ''}`;
      const payload = {
        title: title.trim(),
        description: description.trim(),
        category: category,
        subject: subject,
        priority: priority,
        complexity: complexityLabel,
        budget: numericBudget,
        budget_notes: isAboveThreshold ? 'Engagement > 300 € (seuil statutaire SCI)' : 'Délégation courante',
        assignee: assignee,
        assignee_name: assignee,
        assigned_members: assignee === 'Tous les associés' ? ['Tous'] : [assignee],
        created_by: currentUserName,
        status: 'EN_COURS',
        progress: 0,
      };

      let createdTask = null;
      try {
        createdTask = await createTask(payload);
      } catch (apiErr) {
        console.warn('API createTask non disponible ou erreur, bascule sur enregistrement local:', apiErr);
      }

      if (!createdTask) {
        // Fallback local complet et fluide
        createdTask = {
          id: Date.now(),
          ref: `T-2026-${Math.floor(100 + Math.random() * 900)}`,
          title: title.trim(),
          description: description.trim() || 'Tâche enregistrée au registre du domaine.',
          category: category,
          subject: subject,
          priority: priority,
          complexity: complexityLabel,
          status: 'EN_COURS',
          budget: numericBudget,
          budget_label: numericBudget > 0 ? `${numericBudget.toLocaleString('fr-FR')} € TTC` : 'Inclus SCI',
          budget_type: isAboveThreshold ? 'Vote statutaire requis (>300€)' : 'Budget prévisionnel',
          assignee: assignee,
          assigned_members: [assignee],
          role_label: assignee === 'Henri Jamet' ? 'Gérance SCI' : 'Responsable désigné',
          step_label: 'Étape 1/3 : Cadrage initial',
          step_icon: 'construction',
          progress: 0,
          deadline: 'Sous 30 jours',
          subject_icon: subject === 'Presbytère' ? 'home_work' : subject === 'Piscine' ? 'pool' : subject === 'Jardin' ? 'yard' : 'home',
          avatars: [
            {
              initials: assignee.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'HJ',
              name: assignee,
              bg: 'bg-primary text-on-primary'
            }
          ],
        };
      }

      if (onTaskCreated) {
        await onTaskCreated(createdTask);
      }
      onClose();
    } catch (err) {
      console.error('Erreur lors de l\'enregistrement de la tâche:', err);
      setError(err.message || 'Une erreur est survenue lors de l\'enregistrement.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      aria-modal="true"
      role="dialog"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150"
    >
      <div className="bg-surface-container-lowest rounded-2xl sm:rounded-3xl p-6 sm:p-7 max-w-xl w-full shadow-2xl border border-slate-200 space-y-5 animate-in zoom-in-95 duration-150 my-auto text-on-surface">
        
        {/* En-tête de la modale */}
        <div className="flex items-center justify-between border-b border-subtle pb-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-sage-soft text-primary-container flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px]">add_task</span>
            </div>
            <div>
              <h3 className="font-headline-sm text-base sm:text-lg font-bold text-forest-deep">
                Nouvelle tâche ou mission
              </h3>
              <p className="text-xs text-on-surface-variant">
                Registre opérationnel • Domaine d'Hellenvilliers & SCI
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-canvas-slate hover:bg-surface-container text-on-surface-variant flex items-center justify-center cursor-pointer transition-colors"
            title="Fermer"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {error && (
          <div className="p-3 bg-error-container/30 border border-error/30 text-error rounded-DEFAULT text-xs flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">error</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs sm:text-sm">
          
          {/* 1. Titre de la tâche */}
          <div className="space-y-1.5">
            <label className="font-semibold text-on-surface flex items-center justify-between">
              <span>Titre de la tâche ou mission *</span>
              <span className="text-[11px] text-on-surface-variant font-normal">Requis</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Remplacement vanne radiateur bibliothèque, Taille de la haie ouest..."
              className="w-full h-11 px-3.5 bg-canvas-slate rounded-DEFAULT border border-slate-300 focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary-container text-on-surface font-body-md transition-all"
            />
          </div>

          {/* 2. Description */}
          <div className="space-y-1.5">
            <label className="font-semibold text-on-surface block">
              Description & consignes d'exécution
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Précisions techniques, outillage nécessaire, localisation exacte, pièces à commander..."
              className="w-full p-3 bg-canvas-slate rounded-DEFAULT border border-slate-300 focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary-container text-on-surface font-body-md resize-none transition-all"
            />
          </div>

          {/* 3. Domaine / Catégorie & Lieu / Bâtiment */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            
            {/* Domaine / Catégorie (Spécification Henri) */}
            <div className="space-y-1.5">
              <label className="font-semibold text-on-surface flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-primary">category</span>
                <span>Domaine / Catégorie *</span>
              </label>
              <CustomSelect
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                options={DOMAIN_CATEGORIES.map((c) => ({
                  value: c.id,
                  label: `${c.label} — ${c.desc}`,
                  icon: c.icon,
                }))}
                className="h-10"
              />
            </div>

            {/* Sujet / Bâtiment associé */}
            <div className="space-y-1.5">
              <label className="font-semibold text-on-surface flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-primary">home_work</span>
                <span>Lieu / Bâtiment</span>
              </label>
              <CustomSelect
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                options={[
                  { value: 'Rosing', label: 'Rosing (Maison Principale)', icon: 'home' },
                  { value: 'Presbytère', label: 'Presbytère', icon: 'cottage' },
                  { value: 'Piscine', label: 'Piscine & Pool house', icon: 'pool' },
                  { value: 'Jardin', label: 'Jardin, Parc & Verger', icon: 'yard' },
                  { value: 'SCI', label: 'SCI (Gouvernance & Général)', icon: 'account_balance' },
                ]}
                className="h-10"
              />
            </div>

          </div>

          {/* 4. Responsable affecté & Niveau de priorité */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            
            {/* Responsable affecté (Associés) */}
            <div className="space-y-1.5">
              <label className="font-semibold text-on-surface flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-primary">person</span>
                <span>Responsable affecté *</span>
              </label>
              <CustomSelect
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                options={ASSOCIATES_LIST.map((m) => ({
                  value: m.name,
                  label: `${m.name} (${m.role})`,
                  icon: 'person',
                }))}
                className="h-10"
              />
            </div>

            {/* Niveau de priorité / urgence */}
            <div className="space-y-1.5">
              <label className="font-semibold text-on-surface flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-primary">flag</span>
                <span>Niveau de priorité *</span>
              </label>
              <CustomSelect
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                options={PRIORITY_LEVELS.map((p) => ({
                  value: p.id,
                  label: `${p.label} — ${p.desc}`,
                  dotColor: p.dot,
                }))}
                className="h-10"
              />
            </div>

          </div>

          {/* 5. Estimation de charge / points & Budget prévisionnel */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
            
            {/* Estimation de charge / points */}
            <div className="space-y-1.5">
              <label className="font-semibold text-on-surface flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-primary">bolt</span>
                  <span>Charge estimée (points)</span>
                </span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-sage-soft text-primary">
                  {points} pt{points > 1 ? 's' : ''}
                </span>
              </label>
              <CustomSelect
                value={points}
                onChange={(e) => setPoints(parseInt(e.target.value, 10))}
                options={EFFORT_POINTS.map((pt) => ({
                  value: pt.points,
                  label: `${pt.label} — ${pt.sub} (${pt.desc})`,
                  icon: 'bolt',
                }))}
                className="h-10"
              />
            </div>

            {/* Budget prévisionnel (€ TTC) */}
            <div className="space-y-1.5">
              <label className="font-semibold text-on-surface flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-primary">euro</span>
                  <span>Budget estimé (€ TTC)</span>
                </span>
                <span className="text-[11px] text-on-surface-variant">Seuil SCI : 300 €</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="0 € (si outillage existant)"
                  className="w-full h-10 px-3 pr-10 bg-canvas-slate rounded-DEFAULT border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary font-medium text-on-surface"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant font-semibold text-xs">
                  €
                </span>
              </div>
            </div>

          </div>

          {/* Bannière indicative seuil statutaire SCI si > 300 € */}
          {isAboveThreshold && (
            <div className="p-2.5 rounded-DEFAULT bg-amber-soft border border-amber-300 text-amber-rich text-xs flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] shrink-0">account_balance_wallet</span>
              <span>
                <strong>Engagement &gt; 300 € :</strong> Cette tâche dépassera le seuil de délégation courante et fera l'objet d'un vote formel des associés.
              </span>
            </div>
          )}

          {/* Barre d'actions : Annuler et Enregistrer la tâche */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-subtle">
            <button
              type="button"
              onClick={onClose}
              className="h-[46px] px-5 rounded-DEFAULT bg-surface-container-lowest border-2 border-outline-variant text-on-surface font-label-md text-label-md font-semibold hover:bg-canvas-slate hover:border-outline transition-all cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting || !title.trim()}
              className="h-[46px] px-6 rounded-DEFAULT bg-surface-container-lowest border-2 border-primary-container text-primary-container font-label-md text-label-md hover:bg-sage-soft hover:border-primary font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
                  <span>Enregistrement...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[20px] text-primary-container">check_circle</span>
                  <span>Enregistrer la tâche</span>
                </>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
