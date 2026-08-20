import React, { useState, useEffect } from 'react';
import {
  Vote, PlusCircle, CheckCircle, XCircle, AlertCircle, Euro, User,
  ThumbsUp, ThumbsDown, HelpCircle, ShieldCheck, Sparkles, Filter, MessageSquare
} from 'lucide-react';
import { fetchProjects, createProject, reviewProject, castProjectVote } from '../api';
import NewProjectModal from './NewProjectModal';
import CoordinatorApprovalModal from './CoordinatorApprovalModal';

export default function ProjectsPage({ properties, currentUser }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProperty, setSelectedProperty] = useState('Tous');
  const [selectedStatus, setSelectedStatus] = useState('Tous');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [approvalModalProject, setApprovalModalProject] = useState(null);
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
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 flex items-center space-x-1">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>Soumis à examen</span>
          </span>
        );
      case 'EN_VOTE':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-50 text-cyan-700 border border-cyan-200 flex items-center space-x-1 animate-pulse">
            <Vote className="h-3.5 w-3.5" />
            <span>Vote en cours</span>
          </span>
        );
      case 'APPROUVE':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center space-x-1">
            <CheckCircle className="h-3.5 w-3.5" />
            <span>Projet Approuvé</span>
          </span>
        );
      case 'REFUSE':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 flex items-center space-x-1">
            <XCircle className="h-3.5 w-3.5" />
            <span>Projet Refusé</span>
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-900 p-6 sm:p-8 text-white shadow-md w-full">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none"></div>

        <div className="w-full flex flex-row items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center space-x-2 text-xs font-bold text-indigo-300 uppercase tracking-widest mb-1">
              <Vote className="h-4 w-4 text-indigo-400" />
              <span>Initiatives & Projets SCI Familiale</span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-cyan-500/20 text-cyan-300 border border-cyan-400/30">
                1 personne = 1 vote
              </span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight">
              Problèmes et initiatives
            </h1>
            <p className="text-sm text-indigo-100/90 mt-1 max-w-xl">
              Soumettez vos idées de travaux ou réfections pour la propriété et participez au vote démocratique de la SCI.
            </p>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="px-5 py-3 bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-600 hover:to-cyan-600 text-white rounded-2xl text-sm font-extrabold shadow-lg shadow-indigo-500/20 transition-all transform hover:-translate-y-0.5 flex items-center justify-center space-x-2 shrink-0"
          >
            <PlusCircle className="h-4 w-4" />
            <span>Proposer une initiative</span>
          </button>
        </div>
      </div>

      {actionError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm flex items-center space-x-2">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Banner highlight for SOUMIS projects needing qualification */}
      {projects.some(p => p.status === 'SOUMIS') && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-pulse">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-amber-500 text-white rounded-xl font-bold shrink-0">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-amber-950">
                🚨 À QUALIFIER / TRAITER (Coordinateur)
              </h3>
              <p className="text-xs text-amber-800 mt-0.5">
                <strong>{projects.filter(p => p.status === 'SOUMIS').length} proposal(s) pending</strong> requiring coordinator qualification (5-field form, budget & quote) before opening votes.
              </p>
            </div>
          </div>
          <button
            onClick={() => setSelectedStatus('SOUMIS')}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl shadow transition shrink-0"
          >
            Consulter les projets à qualifier →
          </button>
        </div>
      )}

      {/* Prominent Tab Navigation Bar */}
      <div className="flex items-center space-x-2 border-b border-slate-200 pb-2 overflow-x-auto">
        <button
          onClick={() => setSelectedStatus('SOUMIS')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all ${
            selectedStatus === 'SOUMIS'
              ? 'bg-rose-600 text-white shadow-md'
              : 'bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100'
          }`}
        >
          <span>🚨 À QUALIFIER / TRAITER (Coordinateur)</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
            selectedStatus === 'SOUMIS' ? 'bg-rose-800 text-white' : 'bg-rose-200 text-rose-900'
          }`}>
            {projects.filter(p => p.status === 'SOUMIS').length}
          </span>
        </button>

        <button
          onClick={() => setSelectedStatus('EN_VOTE')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            selectedStatus === 'EN_VOTE'
              ? 'bg-cyan-600 text-white shadow-md'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <span>🗳️ En vote</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
            selectedStatus === 'EN_VOTE' ? 'bg-cyan-800 text-white' : 'bg-slate-100 text-slate-700'
          }`}>
            {projects.filter(p => p.status === 'EN_VOTE').length}
          </span>
        </button>

        <button
          onClick={() => setSelectedStatus('APPROUVE')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            selectedStatus === 'APPROUVE'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <span>⚡ Validés & En cours</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
            selectedStatus === 'APPROUVE' ? 'bg-emerald-800 text-white' : 'bg-slate-100 text-slate-700'
          }`}>
            {projects.filter(p => p.status === 'APPROUVE' || p.status === 'EN_COURS').length}
          </span>
        </button>

        <button
          onClick={() => setSelectedStatus('REFUSE')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            selectedStatus === 'REFUSE'
              ? 'bg-slate-800 text-white shadow-md'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <span>❌ Refusés</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
            selectedStatus === 'REFUSE' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
          }`}>
            {projects.filter(p => p.status === 'REFUSE').length}
          </span>
        </button>

        <button
          onClick={() => setSelectedStatus('Tous')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            selectedStatus === 'Tous'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <span>🌐 Tous les projets</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
            selectedStatus === 'Tous' ? 'bg-indigo-800 text-white' : 'bg-slate-100 text-slate-700'
          }`}>
            {projects.length}
          </span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-3">
          <Filter className="h-4 w-4 text-cyan-600" />
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Filtres :</span>
          
          <select
            value={selectedProperty}
            onChange={(e) => setSelectedProperty(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-xs text-slate-800 rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500"
          >
            <option value="Tous">Toutes les propriétés</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-xs text-slate-800 rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500"
          >
            <option value="Tous">Tous les statuts</option>
            <option value="SOUMIS">🚨 Soumis / À qualifier</option>
            <option value="EN_VOTE">🗳️ En vote</option>
            <option value="APPROUVE">⚡ Approuvé</option>
            <option value="REFUSE">❌ Refusé</option>
          </select>
        </div>

        <div className="text-xs text-slate-500">
          <span className="font-semibold text-slate-800">{projects.length}</span> élément(s) affiché(s)
        </div>
      </div>


      {/* Projects List Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 space-y-2">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500 shadow-sm">
          <Vote className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-800">Aucun projet trouvé</h3>
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
                className="bg-white border border-slate-200 hover:border-indigo-300 rounded-2xl p-6 shadow-sm hover:shadow-md transition flex flex-col justify-between group"
              >
                <div>
                  {/* Top Row: Property & Status */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-xs font-semibold text-cyan-700 bg-cyan-50 px-2.5 py-1 rounded-md border border-cyan-200">
                      {project.property?.name || 'Propriété'}
                    </span>
                    {getStatusBadge(project.status)}
                  </div>

                  {/* Title & Cost */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition">
                      {project.title}
                    </h3>
                    <div className="bg-slate-50 border border-slate-200 px-3 py-1 rounded-xl text-right shrink-0">
                      <span className="text-[10px] text-slate-500 uppercase font-semibold block">Coût Estimé</span>
                      <span className="text-sm font-black text-amber-700">{project.estimated_cost?.toLocaleString('fr-FR')} €</span>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-600 leading-relaxed mb-4 whitespace-pre-line">
                    {project.description}
                  </p>

                  {/* Submitter & Category */}
                  <div className="flex items-center justify-between text-xs text-slate-500 pb-4 border-b border-slate-200 mb-4">
                    <div className="flex items-center space-x-1.5">
                      <User className="h-3.5 w-3.5 text-indigo-600" />
                      <span>Proposé par <strong className="text-slate-800">{project.submitted_by}</strong></span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-medium text-[11px]">
                      {project.category}
                    </span>
                  </div>

                  {/* Coordinator Notes if present */}
                  {project.coordinator_notes && (
                    <div className="mb-4 p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-xs text-indigo-900 flex items-start space-x-2">
                      <ShieldCheck className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
                      <div>
                        <strong className="block font-semibold text-indigo-950">Note du Coordinateur (Henri) :</strong>
                        <span>{project.coordinator_notes}</span>
                      </div>
                    </div>
                  )}

                  {/* Live Voting Progress Bar */}
                  {project.status === 'EN_VOTE' || project.votes.length > 0 ? (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 space-y-3">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-slate-700 flex items-center space-x-1">
                          <Vote className="h-4 w-4 text-indigo-600" />
                          <span>Résultats du vote en direct ({summary.total_votes || 0} vote(s))</span>
                        </span>
                        <span className="text-indigo-600 font-bold">{summary.pour_pct || 0}% POUR</span>
                      </div>

                      {/* Multi-segmented Progress Bar */}
                      <div className="h-3 bg-slate-200 rounded-full overflow-hidden flex border border-slate-300">
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
                          className="bg-slate-400 transition-all duration-500"
                          title={`Abstention: ${summary.abstention}`}
                        ></div>
                      </div>

                      {/* Legend */}
                      <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1">
                        <span className="flex items-center space-x-1 text-emerald-700 font-semibold">
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                          <span>Pour: {summary.pour || 0} ({summary.pour_pct || 0}%)</span>
                        </span>
                        <span className="flex items-center space-x-1 text-rose-700 font-semibold">
                          <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                          <span>Contre: {summary.contre || 0} ({summary.contre_pct || 0}%)</span>
                        </span>
                        <span className="flex items-center space-x-1 text-slate-600 font-semibold">
                          <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                          <span>Abstention: {summary.abstention || 0} ({summary.abstention_pct || 0}%)</span>
                        </span>
                      </div>

                      {/* Member votes detail list */}
                      {project.votes.length > 0 && (
                        <div className="pt-2 border-t border-slate-200 space-y-1.5">
                          {project.votes.map((v) => (
                            <div key={v.id} className="flex items-center justify-between text-[11px] text-slate-700">
                              <span className="font-semibold text-slate-900">{v.user_name}</span>
                              <div className="flex items-center space-x-2">
                                {v.comment && <span className="text-slate-500 italic text-[10px]">"{v.comment}"</span>}
                                <span className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                                  v.vote === 'POUR' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                                  v.vote === 'CONTRE' ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                                  'bg-slate-100 text-slate-700 border border-slate-200'
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
                <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
                  
                  {/* Member Voting Controls */}
                  {project.status === 'EN_VOTE' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-700">Votre vote ({currentUser}) :</span>
                        {userHasVoted && (
                          <span className="text-[10px] text-indigo-600 font-medium">
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
                          className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={() => handleVote(project.id, 'POUR')}
                          className="py-2 px-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-bold text-xs rounded-xl flex items-center justify-center space-x-1 transition shadow-sm"
                        >
                          <ThumbsUp className="h-3.5 w-3.5" />
                          <span>Pour</span>
                        </button>

                        <button
                          onClick={() => handleVote(project.id, 'CONTRE')}
                          className="py-2 px-3 bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-800 font-bold text-xs rounded-xl flex items-center justify-center space-x-1 transition shadow-sm"
                        >
                          <ThumbsDown className="h-3.5 w-3.5" />
                          <span>Contre</span>
                        </button>

                        <button
                          onClick={() => handleVote(project.id, 'ABSTENTION')}
                          className="py-2 px-3 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-bold text-xs rounded-xl flex items-center justify-center space-x-1 transition shadow-sm"
                        >
                          <HelpCircle className="h-3.5 w-3.5" />
                          <span>Abstention</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Coordinator Decision Controls */}
                  {isCoordinator && (
                    <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-3 space-y-2">
                      <div className="flex items-center space-x-1.5 text-xs font-bold text-indigo-900">
                        <ShieldCheck className="h-4 w-4 text-indigo-600" />
                        <span>Action Coordinateur (Henri)</span>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          onClick={() => setApprovalModalProject(project)}
                          className="px-3.5 py-1.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-extrabold text-xs rounded-lg transition shadow-md flex items-center space-x-1.5"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          <span>⚡ Approuver & Qualifier (Modale 5 champs)</span>
                        </button>

                        {project.status === 'SOUMIS' && (
                          <button
                            onClick={() => handleCoordinatorReview(project.id, 'EN_VOTE', 'VOTE')}
                            className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold text-xs rounded-lg transition shadow-sm"
                          >
                            Soumettre au vote
                          </button>
                        )}

                        <button
                          onClick={() => handleCoordinatorReview(project.id, 'APPROUVE', 'DIRECT')}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg transition shadow-sm"
                        >
                          Approuver directement
                        </button>

                        <button
                          onClick={() => handleCoordinatorReview(project.id, 'REFUSE', 'DIRECT')}
                          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs rounded-lg transition shadow-sm"
                        >
                          Refuser
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

      {/* Coordinator Approval Modal */}
      {approvalModalProject && (
        <CoordinatorApprovalModal
          project={approvalModalProject}
          isOpen={!!approvalModalProject}
          onClose={() => setApprovalModalProject(null)}
          onRefresh={loadProjects}
        />
      )}

    </div>
  );
}
