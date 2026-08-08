import React, { useState, useEffect } from 'react';
import { AlertTriangle, Plus, Filter, MessageSquare, Camera, CheckCircle2, Clock, ShieldAlert, ArrowRight, User } from 'lucide-react';
import { fetchIssues } from '../api';
import NewIssueModal from './NewIssueModal';
import CommentModal from './CommentModal';

export default function IssuesPage({ properties, currentUser }) {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('Tous');
  const [categoryFilter, setCategoryFilter] = useState('Toutes');
  const [selectedProperty, setSelectedProperty] = useState('');
  
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState(null);

  const loadIssues = async () => {
    setLoading(true);
    try {
      const data = await fetchIssues({
        status: statusFilter,
        category: categoryFilter,
        property_id: selectedProperty || undefined
      });
      setIssues(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIssues();
  }, [statusFilter, categoryFilter, selectedProperty]);

  const priorityStyles = {
    Basse: 'bg-emerald-950/80 text-emerald-400 border-emerald-800/60',
    Moyenne: 'bg-amber-950/80 text-amber-400 border-amber-800/60',
    Haute: 'bg-orange-950/80 text-orange-400 border-orange-800/60',
    Urgent: 'bg-rose-950/80 text-rose-400 border-rose-800/60 glow-amber font-bold animate-pulse',
  };

  const statusStyles = {
    Ouvert: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
    'En cours': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    Résolu: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    Annulé: 'bg-slate-800 text-slate-400 border-slate-700',
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner / Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950 border border-slate-800 p-6 sm:p-8">
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none"></div>
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center space-x-2 text-xs font-semibold text-cyan-400 uppercase tracking-widest mb-1">
              <AlertTriangle className="h-4 w-4" />
              <span>Gestion & Maintenance du Patrimoine</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Registre des Incidents & Travaux
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-xl">
              Signalez un dysfonctionnement, partagez des photos et suivez les interventions en cours à Hellenvilliers et dans les chalets.
            </p>
          </div>

          <button
            onClick={() => setIsNewModalOpen(true)}
            className="flex items-center justify-center space-x-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold text-sm shadow-xl shadow-cyan-500/20 transition-all transform hover:-translate-y-0.5"
          >
            <Plus className="h-5 w-5" />
            <span>Signaler un Problème</span>
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="glass-card rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        {/* Status Tabs */}
        <div className="flex items-center space-x-1 overflow-x-auto pb-1 md:pb-0">
          {['Tous', 'Ouvert', 'En cours', 'Résolu'].map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                statusFilter === tab
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              {tab === 'Tous' ? 'Tous les incidents' : tab}
            </button>
          ))}
        </div>

        {/* Property & Category Selectors */}
        <div className="flex items-center space-x-3">
          
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="Toutes">Toutes catégories</option>
            <option value="Plomberie">🔧 Plomberie</option>
            <option value="Électricité">⚡ Électricité</option>
            <option value="Équipement">🛋️ Équipement</option>
            <option value="Structure">🏛️ Structure</option>
            <option value="Ménage">🧹 Ménage</option>
          </select>

          <select
            value={selectedProperty}
            onChange={(e) => setSelectedProperty(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="">Toutes les propriétés</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

        </div>

      </div>

      {/* Issues Feed Grid */}
      {loading ? (
        <div className="text-center py-12 text-slate-500 text-sm">Chargement du fil d'incidents...</div>
      ) : issues.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center border border-dashed border-slate-800">
          <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-200">Aucun incident à afficher</h3>
          <p className="text-xs text-slate-400 mt-1">Aucun problème ne correspond aux filtres sélectionnés.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {issues.map((issue) => (
            <div
              key={issue.id}
              onClick={() => setSelectedIssue(issue)}
              className="glass-card glass-card-hover rounded-2xl p-5 border border-slate-800 flex flex-col justify-between cursor-pointer group"
            >
              <div>
                {/* Header tags */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${priorityStyles[issue.priority] || 'bg-slate-800 text-slate-300'}`}>
                    {issue.priority}
                  </span>
                  <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${statusStyles[issue.status] || 'bg-slate-800 text-slate-300'}`}>
                    {issue.status}
                  </span>
                </div>

                {/* Title & Category */}
                <h3 className="font-bold text-slate-100 text-base group-hover:text-cyan-400 transition line-clamp-1 mb-1">
                  {issue.title}
                </h3>
                <p className="text-xs text-slate-400 line-clamp-2 mb-3 leading-relaxed">
                  {issue.description}
                </p>

                {/* Photo preview if present */}
                {issue.photo_url && (
                  <div className="relative rounded-xl overflow-hidden mb-3 border border-slate-800 h-32 bg-slate-950">
                    <img src={issue.photo_url} alt={issue.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                    <div className="absolute bottom-2 left-2 bg-slate-950/80 px-2 py-0.5 rounded-md text-[10px] text-cyan-400 font-semibold flex items-center space-x-1">
                      <Camera className="h-3 w-3" />
                      <span>Photo jointe</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Card Footer info */}
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center space-x-1.5 truncate">
                  <User className="h-3.5 w-3.5 text-slate-500" />
                  <span className="truncate">{issue.created_by}</span>
                </div>

                <div className="flex items-center space-x-3">
                  {issue.comments && issue.comments.length > 0 && (
                    <div className="flex items-center space-x-1 text-cyan-400 font-semibold">
                      <MessageSquare className="h-3.5 w-3.5" />
                      <span>{issue.comments.length}</span>
                    </div>
                  )}
                  <ArrowRight className="h-4 w-4 text-slate-600 group-hover:text-cyan-400 group-hover:translate-x-1 transition" />
                </div>
              </div>

            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      <NewIssueModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        properties={properties}
        currentUser={currentUser}
        onIssueCreated={loadIssues}
      />

      <CommentModal
        issue={selectedIssue}
        onClose={() => setSelectedIssue(null)}
        currentUser={currentUser}
        onUpdated={() => {
          loadIssues();
          // Keep current modal refreshed
          if (selectedIssue) {
            fetchIssues().then(all => {
              const updated = all.find(i => i.id === selectedIssue.id);
              if (updated) setSelectedIssue(updated);
            });
          }
        }}
      />

    </div>
  );
}
