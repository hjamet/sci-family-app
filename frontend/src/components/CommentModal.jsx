import React, { useState, useEffect } from 'react';
import { X, Send, User, Calendar, Tag, ShieldCheck, CheckCircle, Clock, AlertTriangle, Image as ImageIcon, Euro, Edit3, Check } from 'lucide-react';
import { addIssueComment, updateIssue } from '../api';

export default function CommentModal({ issue, onClose, currentUser, onUpdated }) {
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [newStatus, setNewStatus] = useState(issue?.status || 'Ouvert');
  const [assignedTo, setAssignedTo] = useState(issue?.assigned_to || '');
  const [category, setCategory] = useState(issue?.category || '🐛 Corrections / Réparations');
  const [estimatedCost, setEstimatedCost] = useState(issue?.estimated_cost ? issue.estimated_cost.toString() : '');

  const isCoordinator = currentUser === 'Henri';

  useEffect(() => {
    if (issue) {
      setNewStatus(issue.status || 'Ouvert');
      setAssignedTo(issue.assigned_to || '');
      setCategory(issue.category || '🐛 Corrections / Réparations');
      setEstimatedCost(issue.estimated_cost ? issue.estimated_cost.toString() : '');
    }
  }, [issue]);

  if (!issue) return null;

  const handleSendComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    setSubmitting(true);
    try {
      await addIssueComment(issue.id, {
        author_name: currentUser,
        content: commentText
      });
      setCommentText('');
      onUpdated();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (statusVal) => {
    try {
      await updateIssue(issue.id, { status: statusVal, assigned_to: assignedTo });
      setNewStatus(statusVal);
      onUpdated();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSaveCoordinatorFields = async () => {
    try {
      const costNum = estimatedCost ? parseFloat(estimatedCost) : 0.0;
      await updateIssue(issue.id, {
        category,
        estimated_cost: costNum,
        assigned_to: assignedTo
      });
      onUpdated();
    } catch (err) {
      alert(err.message);
    }
  };

  // Priority color maps
  const priorityBadge = {
    Basse: 'bg-emerald-950/80 text-emerald-400 border-emerald-800/60',
    Moyenne: 'bg-amber-950/80 text-amber-400 border-amber-800/60',
    Haute: 'bg-orange-950/80 text-orange-400 border-orange-800/60',
    Urgent: 'bg-rose-950/80 text-rose-400 border-rose-800/60 glow-amber',
  }[issue.priority] || 'bg-slate-800 text-slate-300';

  const statusBadge = {
    Ouvert: 'bg-sky-500/20 text-sky-400 border-sky-500/40',
    'En cours': 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    Résolu: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    Annulé: 'bg-slate-700/50 text-slate-400 border-slate-600/40',
  }[issue.status] || 'bg-slate-800 text-slate-300';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="glass-modal w-full max-w-2xl rounded-2xl p-6 shadow-2xl relative border border-slate-700/60 flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-4">
          <div className="pr-6">
            <div className="flex items-center space-x-2 mb-1.5 flex-wrap gap-y-1">
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${priorityBadge}`}>
                {issue.priority}
              </span>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${statusBadge}`}>
                {issue.status}
              </span>
              <span className="text-xs font-medium text-cyan-400 bg-cyan-950/60 px-2.5 py-0.5 rounded-full border border-cyan-800">
                {issue.category}
              </span>
              {issue.estimated_cost > 0 && (
                <span className="text-xs font-bold text-emerald-400 bg-emerald-950/60 px-2.5 py-0.5 rounded-full border border-emerald-800">
                  {issue.estimated_cost} €
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold text-slate-100">{issue.title}</h2>
            <p className="text-xs text-slate-400 mt-1 flex items-center space-x-2">
              <span>Signalé par <strong className="text-slate-300">{issue.created_by}</strong></span>
              <span>•</span>
              <span>{new Date(issue.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
          
          {/* Description */}
          <div className="bg-slate-900/90 rounded-xl p-4 border border-slate-800 text-sm text-slate-200 leading-relaxed whitespace-pre-line">
            {issue.description}
          </div>

          {/* Photo attachment if available */}
          {issue.photo_url && (
            <div className="rounded-xl overflow-hidden border border-slate-700 bg-slate-900/60 p-2">
              <div className="text-xs font-semibold text-slate-400 mb-2 flex items-center space-x-1.5">
                <ImageIcon className="h-4 w-4 text-cyan-400" />
                <span>Photo / Pièce jointe</span>
              </div>
              <img
                src={issue.photo_url}
                alt={issue.title}
                className="w-full max-h-64 object-cover rounded-lg border border-slate-800 hover:scale-[1.01] transition duration-200"
              />
            </div>
          )}

          {/* RESPONSIBILITY BADGE ("Qui s'occupe de quoi") */}
          <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 flex items-center justify-between text-xs text-amber-200 font-medium">
            <div className="flex items-center space-x-2">
              <User className="h-4 w-4 text-amber-400 shrink-0" />
              <span>Qui s'occupe de quoi : <strong className="text-amber-300 font-bold">{issue.assigned_to || 'Non assigné'}</strong></span>
            </div>
          </div>

          {/* COORDINATOR MANAGEMENT PORTAL (Vue Henri) */}
          {isCoordinator && (
            <div className="p-4 rounded-2xl bg-cyan-950/40 border border-cyan-800 space-y-3">
              <div className="flex items-center space-x-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
                <ShieldCheck className="h-4 w-4" />
                <span>Portail Coordinateur (Vue Henri) — Édition des paramètres</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                {/* Category */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">Catégorie</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="🛠️ Travaux & Améliorations">🛠️ Travaux & Améliorations</option>
                    <option value="➕ Ajouts / Nouveautés">➕ Ajouts / Nouveautés</option>
                    <option value="🐛 Corrections / Réparations">🐛 Corrections / Réparations</option>
                  </select>
                </div>

                {/* Estimated Cost */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">Coût estimé (€)</label>
                  <input
                    type="number"
                    placeholder="ex: 450"
                    value={estimatedCost}
                    onChange={(e) => setEstimatedCost(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {/* Assigned Member / Responsibility */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">Qui s'occupe de quoi</label>
                  <input
                    type="text"
                    placeholder="ex: Henri & Frédéric"
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleSaveCoordinatorFields}
                  className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow transition flex items-center space-x-1"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Enregistrer les paramètres</span>
                </button>
              </div>
            </div>
          )}

          {/* Status Bar */}
          <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800/80 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-2">
              <span className="text-slate-400 font-medium">Statut:</span>
              <div className="flex items-center space-x-1">
                {['Ouvert', 'En cours', 'Résolu'].map((st) => (
                  <button
                    key={st}
                    onClick={() => handleUpdateStatus(st)}
                    className={`px-2.5 py-1 rounded-lg font-medium transition ${
                      issue.status === st
                        ? 'bg-cyan-500 text-white font-semibold'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Discussion Thread */}
          <div className="pt-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center space-x-1.5">
              <span>Fil de discussion</span>
              <span className="bg-slate-800 text-cyan-400 px-2 py-0.5 rounded-full text-[10px]">
                {issue.comments?.length || 0}
              </span>
            </h3>

            <div className="space-y-3">
              {issue.comments && issue.comments.length > 0 ? (
                issue.comments.map((c) => (
                  <div
                    key={c.id}
                    className={`p-3 rounded-xl border ${
                      c.author_name === currentUser
                        ? 'bg-cyan-950/30 border-cyan-800/40 ml-4'
                        : 'bg-slate-900/80 border-slate-800 mr-4'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-cyan-400">{c.author_name}</span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(c.created_at).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-slate-200 leading-relaxed">{c.content}</p>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-400 italic text-center py-3 bg-slate-900/40 rounded-xl border border-dashed border-slate-800">
                  Aucun commentaire pour le moment. Soyez le premier à répondre !
                </p>
              )}
            </div>
          </div>

        </div>

        {/* Comment Input Footer */}
        <form onSubmit={handleSendComment} className="pt-3 border-t border-slate-800 flex items-center space-x-2">
          <input
            type="text"
            placeholder="Écrire une réponse..."
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
          />
          <button
            type="submit"
            disabled={submitting || !commentText.trim()}
            className="px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs flex items-center space-x-1.5 transition disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" />
            <span>Envoyer</span>
          </button>
        </form>

      </div>
    </div>
  );
}
