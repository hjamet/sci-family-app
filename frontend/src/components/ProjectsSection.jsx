import React, { useState } from 'react';
import {
  Vote, ThumbsUp, ThumbsDown, HelpCircle, Plus, Wrench, Sparkles, CheckCircle2, AlertCircle, ChevronRight
} from 'lucide-react';
import { castProjectVote } from '../api';
import ProjectDetailModal from './ProjectDetailModal';

export default function ProjectsSection({ projects, currentUser, onRefreshProjects, onOpenNewProject }) {
  const [activeFeedTab, setActiveFeedTab] = useState('voting'); // 'voting' | 'in_progress' | 'archived'
  const [categoryFilter, setCategoryFilter] = useState('Toutes');
  const [selectedProject, setSelectedProject] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const categories = [
    'Toutes',
    '🛠️ Maintenance / Réparation',
    '✨ Amélioration',
    '➕ Nouveau Projet',
    'Non classé'
  ];

  const filteredProjects = projects.filter(p => {
    return categoryFilter === 'Toutes' || p.category === categoryFilter;
  });

  // Priority sorting helper (URGENT -> HAUTE -> MOYENNE -> BASSE)
  const priorityWeight = (p) => {
    const prio = (p.priority || 'MOYENNE').toUpperCase();
    if (prio === 'URGENT') return 1;
    if (prio === 'HAUTE') return 2;
    if (prio === 'MOYENNE') return 3;
    if (prio === 'BASSE') return 4;
    return 5;
  };

  // Group separation
  const votingItems = filteredProjects
    .filter(p => p.status === 'EN_VOTE' || p.status === 'SOUMIS')
    .sort((a, b) => priorityWeight(a) - priorityWeight(b));

  const inProgressItems = filteredProjects
    .filter(p => p.status === 'EN_COURS' || p.status === 'APPROUVE')
    .sort((a, b) => priorityWeight(a) - priorityWeight(b));

  const completedItems = filteredProjects
    .filter(p => p.status === 'TERMINE' || p.status === 'RESOLU' || p.status === 'REFUSE')
    .sort((a, b) => priorityWeight(a) - priorityWeight(b));

  const getPriorityBadge = (prio) => {
    const p = (prio || 'MOYENNE').toUpperCase();
    if (p === 'URGENT') {
      return <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-700 border border-rose-200 animate-pulse">🔴 URGENT</span>;
    }
    if (p === 'HAUTE') {
      return <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200">🟠 HAUTE</span>;
    }
    if (p === 'MOYENNE') {
      return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">🟡 MOYENNE</span>;
    }
    return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">🟢 BASSE</span>;
  };

  const renderCompactCard = (project) => {
    const summary = project.vote_summary || { total_votes: 0, pour: 0, contre: 0, abstention: 0, pour_pct: 0, contre_pct: 0 };
    const thumbnail = project.photo_urls && project.photo_urls.length > 0 ? project.photo_urls[0] : project.photo_url;

    return (
      <div
        key={project.id}
        onClick={() => setSelectedProject(project)}
        className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer flex items-center space-x-3.5 group text-slate-900"
      >
        {/* Compact Thumbnail */}
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={project.title}
            className="w-16 h-16 rounded-xl object-cover shrink-0 border border-slate-100"
          />
        ) : (
          <div className="w-16 h-16 rounded-xl bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center text-xl">
            🛠️
          </div>
        )}

        {/* Dense Card Information */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2 mb-1">
            {getPriorityBadge(project.priority)}
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 truncate border border-indigo-100">
              {project.category}
            </span>
          </div>

          <h3 className="text-xs font-bold text-slate-900 truncate group-hover:text-indigo-600 transition">
            {project.title}
          </h3>

          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1.5">
            <span>Par <strong className="text-slate-700">{project.submitted_by}</strong></span>
            <span className="font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[10px] flex items-center space-x-1">
              <span>🗳️</span>
              <span>{summary.total_votes}/7 ({summary.pour_pct}% Pour)</span>
            </span>
          </div>
        </div>

        <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-500 transition shrink-0" />
      </div>
    );
  };

  return (
    <section className="mb-14">
      {/* Section Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200">
              <Wrench className="h-5 w-5" />
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Fil des Incidents, Projets & Réparations
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Plateforme centralisée SCI Familiale : cartes synthétiques & modal de qualification et vote
          </p>
        </div>

        {/* Submit Button (Requirement 1) */}
        <button
          onClick={onOpenNewProject}
          className="flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition transform hover:-translate-y-0.5"
        >
          <Plus className="h-4 w-4" />
          <span>Signaler un problème, une idée ou un projet</span>
        </button>
      </div>

      {/* Category Filter Pills Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 mb-6 flex items-center space-x-3 overflow-x-auto shadow-sm">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider shrink-0">Filtrer par catégorie:</span>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              categoryFilter === cat
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {errorMsg && (
        <div className="mb-6 p-4 rounded-xl bg-rose-50 text-rose-800 border border-rose-200 text-xs flex items-center space-x-2">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Sleek Feed Tab Bar */}
      <div className="flex items-center space-x-2 border-b border-slate-200 mb-6 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveFeedTab('voting')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeFeedTab === 'voting'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-white text-slate-600 border border-slate-200 hover:text-slate-900'
          }`}
        >
          <span>🗳️ À voter</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
            activeFeedTab === 'voting' ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-700'
          }`}>
            {votingItems.length}
          </span>
        </button>

        <button
          onClick={() => setActiveFeedTab('in_progress')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeFeedTab === 'in_progress'
              ? 'bg-amber-500 text-white shadow-md'
              : 'bg-white text-slate-600 border border-slate-200 hover:text-slate-900'
          }`}
        >
          <span>⚡ Validés & En cours</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
            activeFeedTab === 'in_progress' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-700'
          }`}>
            {inProgressItems.length}
          </span>
        </button>

        <button
          onClick={() => setActiveFeedTab('archived')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeFeedTab === 'archived'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'bg-white text-slate-600 border border-slate-200 hover:text-slate-900'
          }`}
        >
          <span>🗄️ Archives / Terminés</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
            activeFeedTab === 'archived' ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700'
          }`}>
            {completedItems.length}
          </span>
        </button>
      </div>

      {/* TAB 1: 🗳️ À voter */}
      {activeFeedTab === 'voting' && (
        <div>
          {votingItems.length === 0 ? (
            <div className="p-8 bg-white border border-slate-200 rounded-2xl text-center text-xs text-slate-400 italic shadow-sm">
              Aucun projet en attente de vote actuellement.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {votingItems.map(renderCompactCard)}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ⚡ Validés & En cours */}
      {activeFeedTab === 'in_progress' && (
        <div>
          {inProgressItems.length === 0 ? (
            <div className="p-8 bg-white border border-slate-200 rounded-2xl text-center text-xs text-slate-400 italic shadow-sm">
              Aucune intervention en cours d'exécution.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {inProgressItems.map(renderCompactCard)}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: 🗄️ Archives / Terminés */}
      {activeFeedTab === 'archived' && (
        <div>
          {completedItems.length === 0 ? (
            <div className="p-8 bg-white border border-slate-200 rounded-2xl text-center text-xs text-slate-400 italic shadow-sm">
              Aucun projet archivé pour l'instant.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {completedItems.map(renderCompactCard)}
            </div>
          )}
        </div>
      )}

      {/* Elegant Project Detail Modal */}
      <ProjectDetailModal
        project={selectedProject}
        isOpen={!!selectedProject}
        onClose={() => setSelectedProject(null)}
        currentUser={currentUser}
        onRefresh={onRefreshProjects}
      />

    </section>
  );
}
