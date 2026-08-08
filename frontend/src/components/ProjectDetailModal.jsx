import React, { useState } from 'react';
import {
  X, ThumbsUp, ThumbsDown, HelpCircle, ShieldCheck, User, Euro, Tag, AlertCircle, Edit3, Check, Sparkles, Image as ImageIcon
} from 'lucide-react';
import { reviewProject, castProjectVote } from '../api';

export default function ProjectDetailModal({ project, isOpen, onClose, currentUser, onRefresh }) {
  if (!isOpen || !project) return null;

  const isCoordinator = currentUser === 'Henri' || currentUser.includes('Henri');

  // Editing state for coordinator
  const [isEditing, setIsEditing] = useState(false);
  const [editCost, setEditCost] = useState(project.estimated_cost ? project.estimated_cost.toString() : '0');
  const [editCategory, setEditCategory] = useState(project.category || 'Non classé');
  const [editPriority, setEditPriority] = useState(project.priority || 'MOYENNE');
  const [editResponsible, setEditResponsible] = useState(project.responsible || '');
  const [editNotes, setEditNotes] = useState(project.coordinator_notes || '');
  const [savingEdit, setSavingEdit] = useState(false);
  const [votingLoading, setVotingLoading] = useState(false);
  const [activePhoto, setActivePhoto] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const summary = project.vote_summary || { total_votes: 0, pour: 0, contre: 0, abstention: 0, pour_pct: 0, contre_pct: 0 };
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
        coordinator_notes: editNotes.trim() || null,
        estimated_cost: isNaN(costNum) ? 0.0 : costNum,
        category: editCategory,
        priority: editPriority,
        responsible: editResponsible.trim() || null
      });

      setIsEditing(false);
      await onRefresh();
    } catch (err) {
      setErrorMsg(err.message || 'Erreur lors de la mise à jour par le coordinateur');
    } finally {
      setSavingEdit(false);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 sm:p-8 shadow-2xl relative text-slate-900">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Header */}
        <div className="border-b border-slate-100 pb-4 mb-5 pr-8">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {getPriorityBadge(project.priority)}
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
              {project.category}
            </span>
            <span className={`text-xs font-extrabold px-2.5 py-0.5 rounded-full ${
              project.status === 'EN_VOTE' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
              project.status === 'EN_COURS' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
              project.status === 'TERMINE' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
              'bg-slate-100 text-slate-700 border border-slate-200'
            }`}>
              Statut: {project.status}
            </span>
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-snug">
            {project.title}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Signalé par <strong className="text-slate-800">{project.submitted_by}</strong> le {new Date(project.created_at).toLocaleDateString('fr-FR')}
          </p>
        </div>

        {errorMsg && (
          <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center space-x-2">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="space-y-6">
          
          {/* SECTION 1: Soumission d'origine */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              <span>Signalement / Proposition d'origine</span>
            </h3>
            <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-normal">
              {project.description}
            </p>
          </div>

          {/* SECTION 2: Enrichissement du Coordinateur (Henri) */}
          <div className="p-5 rounded-2xl bg-indigo-50/70 border border-indigo-200 relative">
            <div className="flex items-center justify-between mb-3 border-b border-indigo-100 pb-2">
              <span className="text-xs font-black text-indigo-900 uppercase tracking-wider flex items-center space-x-1.5">
                <ShieldCheck className="h-4 w-4 text-indigo-600" />
                <span>Compléments Coordinateur (Henri)</span>
              </span>

              {isCoordinator && !isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center space-x-1 px-3 py-1 bg-white hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl border border-indigo-200 transition shadow-sm"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  <span>Qualifier / Éditer</span>
                </button>
              )}
            </div>

            {isCoordinator && isEditing ? (
              /* Inline Edit Form for Henri */
              <div className="space-y-3 pt-1">
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
                    <label className="block text-[10px] font-bold uppercase text-indigo-800 mb-1">Urgence</label>
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
                    <label className="block text-[10px] font-bold uppercase text-indigo-800 mb-1">Catégorie</label>
                    <select
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs text-slate-900 font-semibold"
                    >
                      <option value="🛠️ Maintenance / Réparation">🛠️ Maintenance / Réparation</option>
                      <option value="✨ Amélioration">✨ Amélioration</option>
                      <option value="➕ Nouveau Projet">➕ Nouveau Projet</option>
                      <option value="Non classé">Non classé</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-indigo-800 mb-1">Artisan / Supplier info</label>
                    <input
                      type="text"
                      placeholder="ex: Devis Riffael & Denis"
                      value={editResponsible}
                      onChange={(e) => setEditResponsible(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs text-slate-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-indigo-800 mb-1">Note & Devis Coordinateur</label>
                  <textarea
                    rows={3}
                    placeholder="Détails des investigations, devis reçus, planning d'intervention..."
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs text-slate-900"
                  />
                </div>

                {/* Coordinator Decision Buttons */}
                <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-3.5 py-1.5 bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
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
              /* Display Coordinator Info */
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-500 font-medium block">Coût estimé :</span>
                  <strong className="text-emerald-700 font-extrabold text-sm">
                    {project.estimated_cost ? `${project.estimated_cost.toLocaleString('fr-FR')} €` : 'Non chiffré (ou gratuit)'}
                  </strong>
                </div>

                <div>
                  <span className="text-slate-500 font-medium block">Artisan / Responsable :</span>
                  <strong className="text-indigo-950 font-bold">
                    {project.responsible || 'Non attribué'}
                  </strong>
                </div>

                {project.coordinator_notes && (
                  <div className="sm:col-span-2 pt-2 border-t border-indigo-100">
                    <span className="text-slate-500 font-medium block mb-0.5">Note du Coordinateur :</span>
                    <p className="text-indigo-900 italic font-medium">{project.coordinator_notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SECTION 3: Galerie Photos */}
          {photoList.length > 0 && (
            <div>
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3 flex items-center space-x-1.5">
                <ImageIcon className="h-4 w-4 text-slate-600" />
                <span>Photos & Pièces jointes ({photoList.length})</span>
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

          {/* SECTION 4: Système de Votes */}
          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-3 flex items-center justify-between">
              <span>Votes des Associés ({summary.total_votes}/7)</span>
              <span className="text-emerald-700 font-extrabold">{summary.pour_pct}% POUR</span>
            </h3>

            {/* Progress Bar */}
            <div className="w-full h-2.5 rounded-full bg-slate-200 overflow-hidden flex mb-4">
              <div className="bg-emerald-500 h-full transition-all duration-300" style={{ width: `${summary.pour_pct}%` }}></div>
              <div className="bg-rose-500 h-full transition-all duration-300" style={{ width: `${summary.contre_pct}%` }}></div>
              <div className="bg-slate-400 h-full transition-all duration-300" style={{ width: `${summary.abstention_pct}%` }}></div>
            </div>

            {/* Voting Action Buttons */}
            {project.status === 'EN_VOTE' && (
              <div className="mb-5 p-3.5 bg-white border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700">Exprimer votre vote ({currentUser}) :</span>
                  {userVote && <span className="text-indigo-600 font-extrabold text-[11px]">Voté actuellement : {userVote}</span>}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => handleVote('POUR')}
                    disabled={votingLoading}
                    className="py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center justify-center space-x-1.5 transition shadow-sm"
                  >
                    <ThumbsUp className="h-3.5 w-3.5" />
                    <span>Pour</span>
                  </button>

                  <button
                    onClick={() => handleVote('CONTRE')}
                    disabled={votingLoading}
                    className="py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl flex items-center justify-center space-x-1.5 transition shadow-sm"
                  >
                    <ThumbsDown className="h-3.5 w-3.5" />
                    <span>Contre</span>
                  </button>

                  <button
                    onClick={() => handleVote('ABSTENTION')}
                    disabled={votingLoading}
                    className="py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-xl flex items-center justify-center space-x-1.5 transition"
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                    <span>Abstention</span>
                  </button>
                </div>
              </div>
            )}

            {/* List of votes cast */}
            {votesList.length > 0 ? (
              <div className="space-y-2">
                {votesList.map((v) => (
                  <div key={v.id} className="p-2.5 bg-white rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800">{v.user_name}</span>
                    <span className={`font-extrabold px-2 py-0.5 rounded text-[11px] ${
                      v.vote === 'POUR' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                      v.vote === 'CONTRE' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {v.vote}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">Aucun vote enregistré pour l'instant.</p>
            )}
          </div>

        </div>

      </div>

      {/* Full Photo Modal Preview Overlay */}
      {activePhoto && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setActivePhoto(null)}>
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

    </div>
  );
}
