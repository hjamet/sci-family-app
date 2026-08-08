import React, { useState, useEffect } from 'react';
import {
  Vote, PlusCircle, CheckCircle, XCircle, AlertCircle, Euro, User,
  ThumbsUp, ThumbsDown, HelpCircle, ShieldCheck, Sparkles, Filter, MessageSquare
} from 'lucide-react';
import { fetchProjects, createProject, reviewProject, castProjectVote } from '../api';
import NewProjectModal from './NewProjectModal';

export default function ProjectsPage({ properties, currentUser }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProperty, setSelectedProperty] = useState('Tous');
  const [selectedStatus, setSelectedStatus] = useState('Tous');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [votingComment, setVotingComment] = useState({});
  const [coordinatorNotesInput, setCoordinatorNotesInput] = useState({});
  const [actionError, setActionError] = useState(null);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const params = {};
      if (selectedProperty !== 'Tous') params.property_id = selectedProperty;
      if (selectedStatus !== 'Tous') params.status = selectedStatus;
      const data = await fetchProjects(params);
      setProjects(data);
    } catch (err) {
      console.error('Error fetching projects:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, [selectedProperty, selectedStatus]);

  const handleCreateProject = async (projData) => {
    await createProject(projData);
    await loadProjects();
  };

  const handleVote = async (projectId, voteType) => {
    try {
      setActionError(null);
      const comment = votingComment[projectId] || '';
      await castProjectVote(projectId, {
        user_name: currentUser,
        vote: voteType,
        comment: comment.trim() || null
      });
      setVotingComment({ ...votingComment, [projectId]: '' });
      await loadProjects();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleCoordinatorReview = async (projectId, newStatus, decisionMode) => {
    try {
      setActionError(null);
      const notes = coordinatorNotesInput[projectId] || '';
      await reviewProject(projectId, {
        status: newStatus,
        decision_mode: decisionMode,
        coordinator_notes: notes.trim() || null
      });
      await loadProjects();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const isCoordinator = currentUser.includes('Henri') || currentUser === 'Henri Jamet';

  const getStatusBadge = (status) => {
    switch (status) {
      case 'SOUMIS':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center space-x-1">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>Soumis à examen</span>
          </span>
        );
      case 'EN_VOTE':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 flex items-center space-x-1 animate-pulse">
            <Vote className="h-3.5 w-3.5" />
            <span>Vote en cours</span>
          </span>
        );
      case 'APPROUVE':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center space-x-1">
            <CheckCircle className="h-3.5 w-3.5" />
            <span>Projet Approuvé</span>
          </span>
        );
      case 'REFUSE':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center space-x-1">
            <XCircle className="h-3.5 w-3.5" />
            <span>Projet Refusé</span>
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-300">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-900/90 to-cyan-950/40 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-black text-white tracking-tight">Système de Projets & Votes</h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              1 personne = 1 vote
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Soumettez vos idées de travaux ou réfections pour la propriété et participez au vote démocratique de la SCI.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white rounded-xl text-sm font-semibold shadow-lg transition flex items-center justify-center space-x-2 shrink-0"
        >
          <PlusCircle className="h-4 w-4" />
          <span>Proposer un Projet</span>
        </button>
      </div>

      {actionError && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-sm flex items-center space-x-2">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
        <div className="flex items-center space-x-3">
          <Filter className="h-4 w-4 text-cyan-400" />
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Filtres :</span>
          
          <select
            value={selectedProperty}
            onChange={(e) => setSelectedProperty(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-500"
          >
            <option value="Tous">Toutes les propriétés</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-500"
          >
            <option value="Tous">Tous les statuts</option>
            <option value="SOUMIS">Soumis à examen</option>
            <option value="EN_VOTE">En vote</option>
            <option value="APPROUVE">Approuvé</option>
            <option value="REFUSE">Refusé</option>
          </select>
        </div>

        <div className="text-xs text-slate-400">
          <span className="font-semibold text-slate-200">{projects.length}</span> projet(s) affiché(s)
        </div>
      </div>

      {/* Projects List Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 space-y-2">
          <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
          <Vote className="h-12 w-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-200">Aucun projet trouvé</h3>
          <p className="text-xs mt-1">Soyez le premier à proposer une amélioration pour la SCI !</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {projects.map((project) => {
            const summary = project.vote_summary || {};
            const userVoteObj = project.votes.find((v) => v.user_name === currentUser);
            const userHasVoted = !!userVoteObj;

            return (
              <div
                key={project.id}
                className="bg-slate-900 border border-slate-800/80 hover:border-slate-700 rounded-2xl p-6 shadow-xl flex flex-col justify-between transition group"
              >
                <div>
                  {/* Top Row: Property & Status */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-xs font-semibold text-cyan-400 bg-cyan-950/80 px-2.5 py-1 rounded-md border border-cyan-900/50">
                      {project.property?.name || 'Propriété'}
                    </span>
                    {getStatusBadge(project.status)}
                  </div>

                  {/* Title & Cost */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="text-lg font-bold text-white group-hover:text-cyan-300 transition">
                      {project.title}
                    </h3>
                    <div className="bg-slate-950 border border-slate-800 px-3 py-1 rounded-xl text-right shrink-0">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Coût Estimé</span>
                      <span className="text-sm font-black text-amber-400">{project.estimated_cost?.toLocaleString('fr-FR')} €</span>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-300 leading-relaxed mb-4 whitespace-pre-line">
                    {project.description}
                  </p>

                  {/* Submitter & Category */}
                  <div className="flex items-center justify-between text-xs text-slate-400 pb-4 border-b border-slate-800 mb-4">
                    <div className="flex items-center space-x-1.5">
                      <User className="h-3.5 w-3.5 text-cyan-400" />
                      <span>Proposé par <strong className="text-slate-200">{project.submitted_by}</strong></span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-medium text-[11px]">
                      {project.category}
                    </span>
                  </div>

                  {/* Coordinator Notes if present */}
                  {project.coordinator_notes && (
                    <div className="mb-4 p-3 bg-indigo-950/40 border border-indigo-800/40 rounded-xl text-xs text-indigo-200 flex items-start space-x-2">
                      <ShieldCheck className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="block font-semibold text-indigo-300">Note du Coordinateur (Henri) :</strong>
                        <span>{project.coordinator_notes}</span>
                      </div>
                    </div>
                  )}

                  {/* Live Voting Progress Bar */}
                  {project.status === 'EN_VOTE' || project.votes.length > 0 ? (
                    <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 mb-4 space-y-3">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-slate-300 flex items-center space-x-1">
                          <Vote className="h-4 w-4 text-cyan-400" />
                          <span>Résultats du vote en direct ({summary.total_votes || 0} vote(s))</span>
                        </span>
                        <span className="text-cyan-400 font-bold">{summary.pour_pct || 0}% POUR</span>
                      </div>

                      {/* Multi-segmented Progress Bar */}
                      <div className="h-3 bg-slate-900 rounded-full overflow-hidden flex border border-slate-800">
                        <div
                          style={{ width: `${summary.pour_pct || 0}%` }}
                          className="bg-emerald-500 transition-all duration-500"
                          title={`Pour: ${summary.pour}`}
                        ></div>
                        <div
                          style={{ width: `${summary.contre_pct || 0}%` }}
                          className="bg-rose-500 transition-all duration-500"
                          title={`Contre: ${summary.contre}`}
                        ></div>
                        <div
                          style={{ width: `${summary.abstention_pct || 0}%` }}
                          className="bg-slate-600 transition-all duration-500"
                          title={`Abstention: ${summary.abstention}`}
                        ></div>
                      </div>

                      {/* Legend */}
                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                        <span className="flex items-center space-x-1 text-emerald-400 font-medium">
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                          <span>Pour: {summary.pour || 0} ({summary.pour_pct || 0}%)</span>
                        </span>
                        <span className="flex items-center space-x-1 text-rose-400 font-medium">
                          <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                          <span>Contre: {summary.contre || 0} ({summary.contre_pct || 0}%)</span>
                        </span>
                        <span className="flex items-center space-x-1 text-slate-400 font-medium">
                          <span className="w-2 h-2 rounded-full bg-slate-500"></span>
                          <span>Abstention: {summary.abstention || 0} ({summary.abstention_pct || 0}%)</span>
                        </span>
                      </div>

                      {/* Member votes detail list */}
                      {project.votes.length > 0 && (
                        <div className="pt-2 border-t border-slate-900 space-y-1.5">
                          {project.votes.map((v) => (
                            <div key={v.id} className="flex items-center justify-between text-[11px] text-slate-300">
                              <span className="font-semibold text-slate-200">{v.user_name}</span>
                              <div className="flex items-center space-x-2">
                                {v.comment && <span className="text-slate-400 italic text-[10px]">"{v.comment}"</span>}
                                <span className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                                  v.vote === 'POUR' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/50' :
                                  v.vote === 'CONTRE' ? 'bg-rose-950 text-rose-400 border border-rose-800/50' :
                                  'bg-slate-800 text-slate-400'
                                }`}>
                                  {v.vote}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}

                </div>

                {/* Bottom Actions Section */}
                <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-3">
                  
                  {/* Member Voting Controls */}
                  {project.status === 'EN_VOTE' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-300">Votre vote ({currentUser}) :</span>
                        {userHasVoted && (
                          <span className="text-[10px] text-cyan-400 font-medium">
                            Déjà voté : <strong>{userVoteObj.vote}</strong> (Modifiable)
                          </span>
                        )}
                      </div>

                      <div className="flex items-center space-x-2">
                        <input
                          type="text"
                          placeholder="Remarque facultative..."
                          value={votingComment[project.id] || ''}
                          onChange={(e) => setVotingComment({ ...votingComment, [project.id]: e.target.value })}
                          className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-500"
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={() => handleVote(project.id, 'POUR')}
                          className="py-2 px-3 bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-700/50 text-emerald-300 font-semibold text-xs rounded-xl flex items-center justify-center space-x-1 transition shadow"
                        >
                          <ThumbsUp className="h-3.5 w-3.5" />
                          <span>Pour</span>
                        </button>

                        <button
                          onClick={() => handleVote(project.id, 'CONTRE')}
                          className="py-2 px-3 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-700/50 text-rose-300 font-semibold text-xs rounded-xl flex items-center justify-center space-x-1 transition shadow"
                        >
                          <ThumbsDown className="h-3.5 w-3.5" />
                          <span>Contre</span>
                        </button>

                        <button
                          onClick={() => handleVote(project.id, 'ABSTENTION')}
                          className="py-2 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-semibold text-xs rounded-xl flex items-center justify-center space-x-1 transition shadow"
                        >
                          <HelpCircle className="h-3.5 w-3.5" />
                          <span>Abstention</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Coordinator Decision Controls */}
                  {isCoordinator && (
                    <div className="bg-slate-950/90 border border-indigo-900/40 rounded-xl p-3 space-y-2">
                      <div className="flex items-center space-x-1.5 text-xs font-bold text-indigo-300">
                        <ShieldCheck className="h-4 w-4 text-indigo-400" />
                        <span>Action Coordinateur (Henri)</span>
                      </div>

                      <input
                        type="text"
                        placeholder="Note ou commentaire de décision..."
                        value={coordinatorNotesInput[project.id] || ''}
                        onChange={(e) => setCoordinatorNotesInput({ ...coordinatorNotesInput, [project.id]: e.target.value })}
                        className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                      />

                      <div className="flex flex-wrap gap-2">
                        {project.status === 'SOUMIS' && (
                          <button
                            onClick={() => handleCoordinatorReview(project.id, 'EN_VOTE', 'VOTE')}
                            className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs rounded-lg transition shadow"
                          >
                            Soumettre au vote des membres
                          </button>
                        )}

                        <button
                          onClick={() => handleCoordinatorReview(project.id, 'APPROUVE', 'DIRECT')}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg transition shadow"
                        >
                          Approuver directement
                        </button>

                        <button
                          onClick={() => handleCoordinatorReview(project.id, 'REFUSE', 'DIRECT')}
                          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs rounded-lg transition shadow"
                        >
                          Refuser le projet
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Project Modal */}
      <NewProjectModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        properties={properties}
        currentUser={currentUser}
        onSubmit={handleCreateProject}
      />

    </div>
  );
}
