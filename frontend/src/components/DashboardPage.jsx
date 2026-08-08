import React, { useState, useEffect } from 'react';
import {
  ShieldCheck, AlertCircle, Clock, CheckCircle2, Wrench, UserCheck, Check, X,
  ArrowUpRight, Building, Sparkles, Vote, Users, BookOpen
} from 'lucide-react';
import { fetchStats, fetchIssues, fetchReservations, updateIssue, updateReservation } from '../api';

export default function DashboardPage({ properties, currentUser, setActiveTab }) {
  const [stats, setStats] = useState(null);
  const [issues, setIssues] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [sData, iData, rData] = await Promise.all([
        fetchStats(),
        fetchIssues({ status: 'Tous' }),
        fetchReservations({ status: 'Tous' })
      ]);
      setStats(sData);
      setIssues(iData);
      setReservations(rData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const handleApproveReservation = async (resId) => {
    try {
      await updateReservation(resId, { status: 'Confirmée' });
      loadDashboardData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRejectReservation = async (resId) => {
    try {
      await updateReservation(resId, { status: 'Refusée' });
      loadDashboardData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleUpdateIssueStatus = async (issueId, newStatus) => {
    try {
      await updateIssue(issueId, { status: newStatus });
      loadDashboardData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleQuickAssign = async (issueId, artisanName) => {
    try {
      await updateIssue(issueId, { assigned_to: artisanName, status: 'En cours' });
      loadDashboardData();
    } catch (err) {
      alert(err.message);
    }
  };

  const pendingReservations = reservations.filter(r => r.status === 'Demande en attente');
  const activeIssues = issues.filter(i => i.status !== 'Résolu' && i.status !== 'Annulé');

  return (
    <div className="space-y-6">
      
      {/* Hero / Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 p-6 sm:p-8">
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none"></div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center space-x-2 text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-1">
              <ShieldCheck className="h-4 w-4 text-indigo-400" />
              <span>Espace Coordinateur SCI Familiale</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Tableau de Pilotage Henri
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-xl">
              Vue synthétique globale pour piloter la SCI, arbitrer les votes de projets, valider les réservations et coordonner les travaux.
            </p>
          </div>

          <div className="flex items-center space-x-2 bg-indigo-950/60 border border-indigo-800/60 rounded-2xl px-4 py-2 text-xs font-semibold text-indigo-300">
            <Sparkles className="h-4 w-4 text-amber-400" />
            <span>Connecté : {currentUser}</span>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        
        {/* KPI 1: Projets & Votes */}
        <div
          onClick={() => setActiveTab && setActiveTab('projects')}
          className="glass-card rounded-2xl p-5 border border-slate-800 relative overflow-hidden cursor-pointer hover:border-cyan-500/50 transition group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Projets & Votes</span>
            <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <Vote className="h-5 w-5" />
            </div>
          </div>
          <div className="text-3xl font-black text-white">{stats?.active_votes_count ?? 0}</div>
          <p className="text-[11px] text-cyan-400 mt-1 font-medium group-hover:underline">
            {stats?.pending_projects_count ?? 0} en attente d'examen →
          </p>
        </div>

        {/* KPI 2: Calendrier Croisé */}
        <div
          onClick={() => setActiveTab && setActiveTab('crossed_calendar')}
          className="glass-card rounded-2xl p-5 border border-slate-800 relative overflow-hidden cursor-pointer hover:border-indigo-500/50 transition group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Smart Match</span>
            <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <div className="text-3xl font-black text-white">5 M.</div>
          <p className="text-[11px] text-indigo-400 mt-1 font-medium group-hover:underline">Voir les semaines idéales →</p>
        </div>

        {/* KPI 3: Vademecum */}
        <div
          onClick={() => setActiveTab && setActiveTab('vademecum')}
          className="glass-card rounded-2xl p-5 border border-slate-800 relative overflow-hidden cursor-pointer hover:border-emerald-500/50 transition group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Vademecum</span>
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <BookOpen className="h-5 w-5" />
            </div>
          </div>
          <div className="text-3xl font-black text-white">7 Fiches</div>
          <p className="text-[11px] text-emerald-400 mt-1 font-medium group-hover:underline">Codes & Consignes →</p>
        </div>

        {/* KPI 4: Incidents */}
        <div
          onClick={() => setActiveTab && setActiveTab('issues')}
          className="glass-card rounded-2xl p-5 border border-slate-800 relative overflow-hidden cursor-pointer hover:border-rose-500/50 transition group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Urgences</span>
            <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
              <AlertCircle className="h-5 w-5" />
            </div>
          </div>
          <div className="text-3xl font-black text-white">{stats?.urgent_issues_count ?? 0}</div>
          <p className="text-[11px] text-rose-400 mt-1 font-medium group-hover:underline">Incidents à traiter →</p>
        </div>

        {/* KPI 5: Séjours */}
        <div
          onClick={() => setActiveTab && setActiveTab('crossed_calendar')}
          className="glass-card rounded-2xl p-5 border border-slate-800 relative overflow-hidden cursor-pointer hover:border-amber-500/50 transition group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Réservations</span>
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <div className="text-3xl font-black text-white">{reservations.length}</div>
          <p className="text-[11px] text-amber-400 mt-1 font-medium group-hover:underline">Séjours confirmés →</p>
        </div>

      </div>

      {/* Main Action Panels Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Panel 1: Planning des Séjours */}
        <div className="glass-card rounded-3xl p-6 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <h2 className="text-lg font-bold text-slate-100">Prochains Séjours Familiaux</h2>
              </div>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                {reservations.length} séjour(s)
              </span>
            </div>

            {loading ? (
              <p className="text-xs text-slate-500 text-center py-6">Chargement...</p>
            ) : reservations.length === 0 ? (
              <div className="text-center py-8 bg-slate-900/40 rounded-2xl border border-dashed border-slate-800">
                <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-300">Aucun séjour réservé.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {reservations.slice(0, 5).map((r) => (
                  <div
                    key={r.id}
                    className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-bold text-slate-100">{r.user_name}</span>
                        <span className="text-xs font-semibold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-md border border-emerald-800/60">
                          Semaine {r.week_number} ({r.year})
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Du <strong className="text-slate-300">{r.start_date}</strong> au <strong className="text-slate-300">{r.end_date}</strong>
                      </p>
                    </div>

                    <span className="text-xs font-semibold text-emerald-400 bg-emerald-950 px-2.5 py-1 rounded-full border border-emerald-800">
                      Confirmé
                    </span>

                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Panel 2: Incidents Prioritaires */}
        <div className="glass-card rounded-3xl p-6 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400">
                  <AlertCircle className="h-4 w-4" />
                </div>
                <h2 className="text-lg font-bold text-slate-100">Actions Rapides sur Incidents</h2>
              </div>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/40">
                {activeIssues.length} ouvert(s)
              </span>
            </div>

            {loading ? (
              <p className="text-xs text-slate-500 text-center py-6">Chargement...</p>
            ) : activeIssues.length === 0 ? (
              <div className="text-center py-8 bg-slate-900/40 rounded-2xl border border-dashed border-slate-800">
                <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-300">Aucun incident ouvert nécessite d'action.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeIssues.map((issue) => (
                  <div
                    key={issue.id}
                    className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center space-x-2 mb-1">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            issue.priority === 'Urgent' ? 'bg-rose-950 text-rose-400 border border-rose-800' : 'bg-amber-950 text-amber-400 border border-amber-800'
                          }`}>
                            {issue.priority}
                          </span>
                          <span className="text-xs font-bold text-slate-100">{issue.title}</span>
                        </div>
                        <p className="text-xs text-slate-400 line-clamp-1">{issue.description}</p>
                      </div>

                      <span className="text-[11px] font-medium text-slate-400 bg-slate-950 px-2 py-1 rounded-md border border-slate-800">
                        {issue.status}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                      
                      <div className="flex items-center space-x-1">
                        <span className="text-slate-500 font-medium">Statut:</span>
                        {issue.status !== 'En cours' && (
                          <button
                            onClick={() => handleUpdateIssueStatus(issue.id, 'En cours')}
                            className="px-2 py-1 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500 hover:text-slate-950 font-bold transition"
                          >
                            Passer "En cours"
                          </button>
                        )}
                        {issue.status !== 'Résolu' && (
                          <button
                            onClick={() => handleUpdateIssueStatus(issue.id, 'Résolu')}
                            className="px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-slate-950 font-bold transition"
                          >
                            Marquer "Résolu"
                          </button>
                        )}
                      </div>

                      <div className="flex items-center space-x-1">
                        <span className="text-slate-500 font-medium">Artisan:</span>
                        {issue.assigned_to ? (
                          <span className="text-cyan-400 font-semibold bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/50">
                            {issue.assigned_to}
                          </span>
                        ) : (
                          <button
                            onClick={() => {
                              const name = prompt("Nom de l'artisan / intervenant:", "Jean Dupont (Plombier)");
                              if (name) handleQuickAssign(issue.id, name);
                            }}
                            className="px-2 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition flex items-center space-x-1"
                          >
                            <UserCheck className="h-3 w-3" />
                            <span>Affecter</span>
                          </button>
                        )}
                      </div>

                    </div>

                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
