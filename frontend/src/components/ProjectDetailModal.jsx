import React, { useState, useEffect } from 'react';
import {
  X, ThumbsUp, ThumbsDown, HelpCircle, ShieldCheck, User, Euro, Tag, AlertCircle, Edit3, Check, Sparkles, Image as ImageIcon, FileText, ExternalLink, Star, Gavel, Calendar, Send, MessageSquare, Paperclip
} from 'lucide-react';
import { reviewProject, castProjectVote, fetchProjectComments, addProjectComment } from '../api';
import CoordinatorApprovalModal from './CoordinatorApprovalModal';


export default function ProjectDetailModal({ project, isOpen, onClose, currentUser, onRefresh }) {
  if (!isOpen || !project) return null;

  const isCoordinator = currentUser === 'Henri' || currentUser.includes('Henri');

  // Editing state for coordinator
  const [isEditing, setIsEditing] = useState(false);
  const [editCost, setEditCost] = useState(project.estimated_cost ? project.estimated_cost.toString() : '0');
  const [editCategory, setEditCategory] = useState(project.category || 'Non classé');
  const [editPriority, setEditPriority] = useState(project.priority || 'MOYENNE');
  const [editClassification, setEditClassification] = useState(project.classification || 'SIGNALEMENT');
  const [editResponsible, setEditResponsible] = useState(project.responsible || '');
  const [editNotes, setEditNotes] = useState(project.coordinator_notes || '');
  const [editDevisUrl, setEditDevisUrl] = useState(project.devis_url || '');
  const [editChargeStars, setEditChargeStars] = useState(project.charge_stars || 3);
  
  const [savingEdit, setSavingEdit] = useState(false);
  const [votingLoading, setVotingLoading] = useState(false);
  const [activePhoto, setActivePhoto] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [showReportAgModal, setShowReportAgModal] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);

  // Thread comment state
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [localComments, setLocalComments] = useState(project.comments || []);

  const summary = project.vote_summary || { total_votes: 0, pour: 0, contre: 0, abstention: 0, pour_pct: 0, contre_pct: 0, report_prochaine_ag: 0 };
  const votesList = project.votes || [];
  const userVoteObj = votesList.find(v => v.user_name === currentUser);
  const userVote = userVoteObj ? userVoteObj.vote : null;

  const photoList = project.photo_urls && project.photo_urls.length > 0
    ? project.photo_urls
    : (project.photo_url ? [project.photo_url] : []);

  const handleVote = async (voteType) => {
    try {
      setVotingLoading(true);
      setErrorMsg(null);
      await castProjectVote(project.id, {
        user_name: currentUser,
        vote: voteType,
      });
      setShowReportAgModal(false);
      await onRefresh();
    } catch (err) {
      setErrorMsg(err.message || 'Impossible d\'enregistrer le vote');
    } finally {
      setVotingLoading(false);
    }
  };

  const handleSaveCoordinatorReview = async (decisionMode) => {
    try {
      setSavingEdit(true);
      setErrorMsg(null);
      const costNum = parseFloat(editCost);
      const newStatus = decisionMode === 'SOUMETTRE_AU_VOTE' ? 'EN_VOTE' : 'EN_COURS';

      await reviewProject(project.id, {
        status: newStatus,
        decision_mode: decisionMode,
        classification: editClassification,
        coordinator_notes: editNotes.trim() || null,
        estimated_cost: isNaN(costNum) ? 0.0 : costNum,
        category: editCategory,
        priority: editPriority,
        responsible: editResponsible.trim() || null,
        devis_url: editDevisUrl.trim() || null,
        charge_stars: editChargeStars
      });

      setIsEditing(false);
      await onRefresh();
    } catch (err) {
      setErrorMsg(err.message || 'Erreur lors de la mise à jour par le coordinateur');
    } finally {
      setSavingEdit(false);
    }
  };

  const loadProjectComments = async () => {
    try {
      if (project && project.id) {
        const commentsData = await fetchProjectComments(project.id);
        setLocalComments(commentsData);
      }
    } catch (err) {
      console.error("Error fetching project comments:", err);
    }
  };

  useEffect(() => {
    if (project && project.id) {
      setLocalComments(project.comments || []);
      loadProjectComments();
      const interval = setInterval(loadProjectComments, 4000);
      return () => clearInterval(interval);
    }
  }, [project?.id]);

  const handleAddThreadComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    try {
      setSubmittingComment(true);
      const createdComment = await addProjectComment(project.id, {
        author_name: currentUser,
        content: commentText.trim()
      });
      setLocalComments(prev => [...prev, createdComment]);
      setCommentText('');
    } catch (err) {
      setErrorMsg(err.message || 'Impossible d\'ajouter le commentaire');
    } finally {
      setSubmittingComment(false);
    }
  };


  const getPriorityBadge = (prio) => {
    const p = (prio || 'MOYENNE').toUpperCase();
    if (p === 'URGENT') {
      return <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-100 text-rose-700 border border-rose-200">🔴 URGENT</span>;
    }
    if (p === 'HAUTE') {
      return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">🟠 HAUTE</span>;
    }
    if (p === 'MOYENNE') {
      return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">🟡 MOYENNE</span>;
    }
    return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">🟢 BASSE</span>;
  };

  const getClassificationBadge = (cls) => {
    const isSignalement = cls === 'SIGNALEMENT' || project.category?.includes('Maintenance') || project.priority === 'URGENT';
    if (isSignalement) {
      return <span className="px-3 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-800 border border-rose-300 flex items-center space-x-1 shadow-sm"><span>🚨</span><span>Signalement</span></span>;
    }
    return <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-300 flex items-center space-x-1 shadow-sm"><span>💡</span><span>Initiative</span></span>;
  };

  const renderStars = (starCount, isClickable = false) => {
    const stars = [1, 2, 3, 4, 5];
    return (
      <div className="flex items-center space-x-1">
        {stars.map((s) => (
          <Star
            key={s}
            onClick={() => isClickable && setEditChargeStars(s)}
            className={`h-4 w-4 ${isClickable ? 'cursor-pointer transform hover:scale-125 transition' : ''} ${
              s <= starCount ? 'text-amber-400 fill-amber-400' : 'text-slate-300'
            }`}
          />
        ))}
        <span className="text-xs font-bold text-slate-600 ml-1.5">{starCount}/5 ★</span>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-6xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 shadow-2xl relative text-slate-900">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 p-2 rounded-xl hover:bg-slate-100 transition z-10"
        >
          <X className="h-6 w-6" />
        </button>

        {/* Modal Top Header */}
        <div className="border-b border-slate-100 pb-4 mb-6 pr-12">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {getClassificationBadge(project.classification)}
            {getPriorityBadge(project.priority)}
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
              {project.category}
            </span>
            <span className={`text-xs font-extrabold px-3 py-1 rounded-full ${
              project.status === 'EN_VOTE' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
              project.status === 'EN_COURS' ? 'bg-blue-100 text-blue-800 border border-blue-300' :
              project.status === 'REPORT_AG' ? 'bg-purple-100 text-purple-900 border border-purple-300' :
              project.status === 'TERMINE' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
              'bg-slate-100 text-slate-700 border border-slate-200'
            }`}>
              Statut: {project.status === 'REPORT_AG' ? '🏛️ Reporté à l\'AG' : project.status}
            </span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-snug">
            {project.title}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Signalé par <strong className="text-slate-800">{project.submitted_by}</strong> le {new Date(project.created_at).toLocaleDateString('fr-FR')}
          </p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-xs flex items-center space-x-2">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* 2-COLUMN SPLIT LAYOUT (lg:grid-cols-12) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT COLUMN (lg:col-span-7) */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Issue Description */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <span>Description complète & Détails du besoin</span>
              </h3>
              <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-normal">
                {project.description}
              </p>
            </div>

            {/* Henri Qualification & Technical Details (Left Column) */}
            <div className="p-5 rounded-2xl bg-indigo-50/70 border border-indigo-200 relative">
              <div className="flex items-center justify-between mb-4 border-b border-indigo-100 pb-2">
                <span className="text-xs font-black text-indigo-900 uppercase tracking-wider flex items-center space-x-1.5">
                  <ShieldCheck className="h-4 w-4 text-indigo-600" />
                  <span>Qualification & Évaluation Coordinateur (Henri)</span>
                </span>

                {isCoordinator && (
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setShowApprovalModal(true)}
                      className="flex items-center space-x-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl transition shadow-sm"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span>⚡ Modale Approbation Henri</span>
                    </button>
                    {!isEditing && (
                      <button
                        onClick={() => setIsEditing(true)}
                        className="flex items-center space-x-1 px-3 py-1 bg-white hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl border border-indigo-200 transition shadow-sm"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span>Éditer</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {isCoordinator && isEditing ? (
                /* Inline Edit Form for Henri */
                <div className="space-y-4">
                  
                  {/* Qualification Type Pills */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-indigo-800 mb-1.5">Qualification Henri</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setEditClassification('SIGNALEMENT')}
                        className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 border transition ${
                          editClassification === 'SIGNALEMENT'
                            ? 'bg-rose-600 text-white border-rose-600 shadow'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <span>🚨 Signalement (Urgence)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditClassification('INITIATIVE')}
                        className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 border transition ${
                          editClassification === 'INITIATIVE'
                            ? 'bg-amber-500 text-white border-amber-500 shadow'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <span>💡 Initiative / Amélioration</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-indigo-800 mb-1">Coût estimé (€)</label>
                      <input
                        type="number"
                        value={editCost}
                        onChange={(e) => setEditCost(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs text-slate-900 font-bold"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase text-indigo-800 mb-1">Niveau d'Urgence</label>
                      <select
                        value={editPriority}
                        onChange={(e) => setEditPriority(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs text-slate-900 font-semibold"
                      >
                        <option value="URGENT">🔴 URGENT</option>
                        <option value="HAUTE">🟠 HAUTE</option>
                        <option value="MOYENNE">🟡 MOYENNE</option>
                        <option value="BASSE">🟢 BASSE</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-indigo-800 mb-1">Artisan / Supplier Info</label>
                      <input
                        type="text"
                        placeholder="ex: Devis Riffael & Denis"
                        value={editResponsible}
                        onChange={(e) => setEditResponsible(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase text-indigo-800 mb-1">Lien Devis PDF (URL)</label>
                      <input
                        type="text"
                        placeholder="ex: https://.../devis.pdf"
                        value={editDevisUrl}
                        onChange={(e) => setEditDevisUrl(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs text-slate-900"
                      />
                    </div>
                  </div>

                  {/* Rating Stars Selection (1-5★) */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-indigo-800 mb-1">Charge & Complexité (1-5★)</label>
                    <div className="p-2 bg-white rounded-xl border border-indigo-200 inline-block">
                      {renderStars(editChargeStars, true)}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-indigo-800 mb-1">Note Coordinateur</label>
                    <textarea
                      rows={2}
                      placeholder="Détails des investigations, devis reçus, planning..."
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs text-slate-900"
                    />
                  </div>

                  {/* Decision Buttons */}
                  <div className="pt-2 flex flex-wrap gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveCoordinatorReview('SOUMETTRE_AU_VOTE')}
                      disabled={savingEdit}
                      className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow transition"
                    >
                      🗳️ Soumettre au vote
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveCoordinatorReview('VALIDER_DIRECTEMENT')}
                      disabled={savingEdit}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow transition"
                    >
                      ⚡ Valider directement
                    </button>
                  </div>
                </div>
              ) : (
                /* Display Mode */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 font-medium block mb-0.5">Qualification :</span>
                    {getClassificationBadge(project.classification)}
                  </div>

                  <div>
                    <span className="text-slate-500 font-medium block mb-0.5">Coût estimé (€) :</span>
                    <strong className="text-emerald-700 font-extrabold text-sm">
                      {project.estimated_cost ? `${project.estimated_cost.toLocaleString('fr-FR')} €` : 'Non chiffré (ou gratuit)'}
                    </strong>
                  </div>

                  <div>
                    <span className="text-slate-500 font-medium block mb-0.5">Artisan / Fournisseur :</span>
                    <strong className="text-indigo-950 font-bold">
                      {project.responsible || 'Non attribué'}
                    </strong>
                  </div>

                  <div>
                    <span className="text-slate-500 font-medium block mb-0.5">Charge & Complexité (1-5★) :</span>
                    {renderStars(project.charge_stars || 3, false)}
                  </div>

                  {/* Attached Documents List */}
                  {project.document_urls && project.document_urls.length > 0 && (
                    <div className="sm:col-span-2 p-3 bg-white rounded-xl border border-indigo-200 space-y-2">
                      <div className="flex items-center justify-between text-indigo-900 font-bold text-xs">
                        <div className="flex items-center space-x-1.5">
                          <Paperclip className="h-4 w-4 text-indigo-600 shrink-0" />
                          <span>Documents Coordinateur ({project.document_urls.length})</span>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        {project.document_urls.map((docUrl, idx) => {
                          const fileName = docUrl.split('/').pop();
                          const cleanName = fileName.length > 33 && fileName[32] === '_' ? fileName.substring(33) : fileName;
                          return (
                            <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                              <span className="font-medium text-slate-800 truncate pr-2">{cleanName}</span>
                              <a
                                href={docUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] rounded flex items-center space-x-1 shrink-0 transition"
                              >
                                <span>Consulter</span>
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Devis PDF Link */}
                  {(project.devis_url || project.coordinator_notes?.includes('http')) && (
                    <div className="sm:col-span-2 p-3 bg-white rounded-xl border border-indigo-200 flex items-center justify-between">
                      <div className="flex items-center space-x-2 text-indigo-900">
                        <FileText className="h-4 w-4 text-indigo-600 shrink-0" />
                        <span className="font-bold">Devis Prestataire (PDF)</span>
                      </div>
                      <a
                        href={project.devis_url || '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-[11px] font-bold flex items-center space-x-1 hover:bg-indigo-700 transition"
                      >
                        <span>Consulter le PDF</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}

                  {project.coordinator_notes && (
                    <div className="sm:col-span-2 pt-2 border-t border-indigo-100">
                      <span className="text-slate-500 font-medium block mb-0.5">Note & Instructions Coordinateur :</span>
                      <p className="text-indigo-950 italic font-medium">{project.coordinator_notes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Photos Gallery */}
            {photoList.length > 0 && (
              <div>
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3 flex items-center space-x-1.5">
                  <ImageIcon className="h-4 w-4 text-slate-600" />
                  <span>Photos & Pièces Jointes ({photoList.length})</span>
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {photoList.map((url, idx) => (
                    <div
                      key={idx}
                      onClick={() => setActivePhoto(url)}
                      className="aspect-video rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 cursor-pointer hover:opacity-90 hover:scale-[1.02] transition shadow-sm"
                    >
                      <img src={url} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* RIGHT COLUMN (lg:col-span-5) */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-6">
            
            {/* TOP RIGHT: Voting Results & 4 Action Buttons */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
                  <span>Votes des 7 Associés</span>
                  <span className="text-slate-400 font-normal">({summary.total_votes}/7)</span>
                </h3>
                <span className="text-emerald-700 font-black text-sm">{summary.pour_pct}% POUR</span>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-3 rounded-full bg-slate-200 overflow-hidden flex shadow-inner">
                <div className="bg-emerald-500 h-full transition-all duration-300" style={{ width: `${summary.pour_pct}%` }} title="Pour"></div>
                <div className="bg-rose-500 h-full transition-all duration-300" style={{ width: `${summary.contre_pct}%` }} title="Contre"></div>
                <div className="bg-slate-400 h-full transition-all duration-300" style={{ width: `${summary.abstention_pct}%` }} title="Abstention"></div>
              </div>

              {/* THE 4 VOTING ACTION BUTTONS */}
              {project.status === 'EN_VOTE' && (
                <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-2.5 shadow-sm">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800">Votre choix ({currentUser}) :</span>
                    {userVote && <span className="text-indigo-600 font-extrabold text-[11px]">Vote : {userVote}</span>}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {/* 1. Pour */}
                    <button
                      onClick={() => handleVote('POUR')}
                      disabled={votingLoading}
                      className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center justify-center space-x-1.5 transition shadow"
                    >
                      <ThumbsUp className="h-4 w-4" />
                      <span>Pour</span>
                    </button>

                    {/* 2. Contre */}
                    <button
                      onClick={() => handleVote('CONTRE')}
                      disabled={votingLoading}
                      className="py-2.5 px-3 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl flex items-center justify-center space-x-1.5 transition shadow"
                    >
                      <ThumbsDown className="h-4 w-4" />
                      <span>Contre</span>
                    </button>

                    {/* 3. Abstention */}
                    <button
                      onClick={() => handleVote('ABSTENTION')}
                      disabled={votingLoading}
                      className="py-2.5 px-3 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-xl flex items-center justify-center space-x-1.5 transition"
                    >
                      <HelpCircle className="h-4 w-4" />
                      <span>Abstention</span>
                    </button>

                    {/* 4. Report AG */}
                    <button
                      onClick={() => setShowReportAgModal(true)}
                      disabled={votingLoading}
                      className="py-2.5 px-3 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl flex items-center justify-center space-x-1.5 transition shadow"
                    >
                      <Gavel className="h-4 w-4" />
                      <span>Report AG</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Member votes breakdown */}
              {votesList.length > 0 ? (
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {votesList.map((v) => (
                    <div key={v.id} className="p-2 bg-white rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800">{v.user_name}</span>
                      <span className={`font-extrabold px-2 py-0.5 rounded text-[10px] ${
                        v.vote === 'POUR' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        v.vote === 'CONTRE' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                        v.vote === 'REPORT_PROCHAINE_AG' || v.vote === 'REPORT_AG' ? 'bg-purple-50 text-purple-800 border border-purple-200' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {v.vote === 'REPORT_PROCHAINE_AG' ? '🏛️ REPORT AG' : v.vote}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">Aucun vote enregistré pour l'instant.</p>
              )}
            </div>

            {/* BOTTOM RIGHT: ProjectCommentThread (Discussion Feed & Input - 100% Light Theme) */}
            <div className="p-5 rounded-2xl bg-slate-50 text-slate-900 border border-slate-200 flex-1 flex flex-col justify-between min-h-[300px]">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3 flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <MessageSquare className="h-4 w-4 text-blue-600" />
                    <span>Fil de Discussion (Projet)</span>
                  </div>
                  <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold">
                    {localComments.length}
                  </span>
                </h3>

                {/* Comment Feed Stream */}
                <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                  {localComments.length > 0 ? (
                    localComments.map((c) => (
                      <div
                        key={c.id}
                        className={`p-3 rounded-xl border text-xs leading-relaxed ${
                          c.author_name === currentUser
                            ? 'bg-blue-50 border-blue-200 text-slate-900 ml-3'
                            : 'bg-white border-slate-200 text-slate-800 mr-3 shadow-sm'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span className="font-extrabold text-blue-700">{c.author_name}</span>
                          <span className="text-[9px] text-slate-500 font-mono">
                            {new Date(c.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p>{c.content}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500 italic text-center py-6 bg-white/80 rounded-xl border border-dashed border-slate-300">
                      Aucun message. Posez une question ou commentez ce projet !
                    </p>
                  )}
                </div>
              </div>

              {/* Chat Input Form */}
              <form onSubmit={handleAddThreadComment} className="pt-3 border-t border-slate-200 flex items-center space-x-2 mt-3">
                <input
                  type="text"
                  placeholder="Poser une question ou commenter..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  className="flex-1 bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  disabled={submittingComment || !commentText.trim()}
                  className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center space-x-1 transition disabled:opacity-40 shadow"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Envoyer</span>
                </button>
              </form>
            </div>

          </div>

        </div>

      </div>

      {/* POP-UP CONFIRMATION MODAL ON "Report AG" */}
      {showReportAgModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 text-slate-900">
            <div className="flex items-center space-x-3 text-amber-600">
              <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200">
                <Gavel className="h-6 w-6" />
              </div>
              <h3 className="text-base font-extrabold">Report à l'Assemblée Générale</h3>
            </div>

            <p className="text-xs text-slate-700 leading-relaxed bg-amber-50/80 p-4 rounded-2xl border border-amber-200 font-medium">
              Confirmation de report à l'AG : Êtes-vous sûr de vouloir reporter ce projet à la prochaine Assemblée Générale ? Cette action exercera un droit de veto individuel et réorientera le projet vers l'ordre du jour de la prochaine AG.
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowReportAgModal(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-200 transition"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => handleVote('REPORT_PROCHAINE_AG')}
                disabled={votingLoading}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow transition"
              >
                Confirmer le report à l'AG
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Photo Lightbox Overlay */}
      {activePhoto && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={() => setActivePhoto(null)}>
          <div className="relative max-w-4xl w-full">
            <img src={activePhoto} alt="Agrandissement photo" className="w-full h-auto max-h-[85vh] object-contain rounded-2xl" />
            <button
              onClick={() => setActivePhoto(null)}
              className="absolute top-2 right-2 p-2 bg-black/60 text-white rounded-full hover:bg-black"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>
      )}

      {/* Coordinator Approval Modal */}
      {showApprovalModal && (
        <CoordinatorApprovalModal
          project={project}
          isOpen={showApprovalModal}
          onClose={() => setShowApprovalModal(false)}
          onRefresh={onRefresh}
        />
      )}

    </div>
  );
}
