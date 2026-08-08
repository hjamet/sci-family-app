import React, { useState, useEffect } from 'react';
import {
  BookOpen, PlusCircle, Calendar, Landmark, Sparkles, AlertCircle, CheckCircle2,
  Clock, ShieldCheck, User, Vote, ArrowRight, ChevronRight, Check
} from 'lucide-react';
import MemberStayTasksSection from './MemberStayTasksSection';
import { fetchStats, fetchProjects, fetchReservations } from '../api';

export default function DashboardPage({ currentUser, setActiveTab, onOpenNewProject, onOpenBooking }) {
  const [stats, setStats] = useState(null);
  const [projects, setProjects] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const [sData, pData, rData] = await Promise.all([
        fetchStats(),
        fetchProjects(),
        fetchReservations()
      ]);
      setStats(sData);
      setProjects(pData);
      setReservations(rData);
    } catch (err) {
      console.error("Error loading home dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const pendingVotesCount = projects.filter(p => p.status === 'EN_VOTE' || p.status === 'SOUMIS').length;
  const nextStay = reservations.find(r => r.status === 'Confirmée');

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-slate-200/80 dark:border-slate-800 p-6 sm:p-8 shadow-sm">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-72 h-72 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none"></div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center space-x-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-1">
              <Sparkles className="h-4 w-4" />
              <span>Domaine d'Hellenvilliers • SCI Familiale</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Viva Hellenvilliers !!
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-xl">
              Bienvenue sur le portail des associés. Sélectionnez un espace ci-dessous pour consulter les consignes, signaler un besoin, réserver vos dates ou consulter l'admin.
            </p>
          </div>

          <div className="flex items-center space-x-3 bg-white/80 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-2.5 shadow-sm">
            <div className="w-8 h-8 rounded-full bg-cyan-500 text-white flex items-center justify-center font-bold text-xs">
              {currentUser[0]}
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-semibold uppercase block">Membre Connecté</span>
              <span className="text-xs font-extrabold text-slate-900 dark:text-white">{currentUser}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4 LARGE COLOR NAVIGATION TILES / BUTTONS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        
        {/* TILE 1: 🟢 Vademecum (Vert Émeraude) */}
        <div
          onClick={() => setActiveTab('vademecum')}
          className="group relative overflow-hidden rounded-3xl p-6 bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-lg hover:shadow-xl hover:scale-[1.01] transition-all duration-200 cursor-pointer border border-emerald-500/30"
        >
          <div className="absolute top-0 right-0 -mt-6 -mr-6 w-32 h-32 rounded-full bg-white/10 blur-xl pointer-events-none group-hover:scale-150 transition-transform"></div>

          <div className="flex justify-between items-start mb-4">
            <div className="p-3.5 rounded-2xl bg-white/20 backdrop-blur-md text-white border border-white/20 shadow-sm">
              <BookOpen className="h-7 w-7" />
            </div>
            <span className="flex items-center space-x-1 text-xs font-extrabold bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-white border border-white/20">
              <span>7 Fiches</span>
              <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
            </span>
          </div>

          <h2 className="text-2xl font-black tracking-tight mb-1">Vademecum & Consignes</h2>
          <p className="text-xs text-emerald-100/90 leading-relaxed max-w-sm">
            Accès immédiat aux codes Wi-Fi, clés, consignes de chauffage Tempo, eau, poubelles et contacts d'urgence.
          </p>
        </div>

        {/* TILE 2: 🟠 Signaler un Problème / Proposer un Projet (Corail / Ambre) */}
        <div
          onClick={() => setActiveTab('signalements')}
          className="group relative overflow-hidden rounded-3xl p-6 bg-gradient-to-br from-amber-500 to-rose-600 text-white shadow-lg hover:shadow-xl hover:scale-[1.01] transition-all duration-200 cursor-pointer border border-amber-400/30"
        >
          <div className="absolute top-0 right-0 -mt-6 -mr-6 w-32 h-32 rounded-full bg-white/10 blur-xl pointer-events-none group-hover:scale-150 transition-transform"></div>

          <div className="flex justify-between items-start mb-4">
            <div className="p-3.5 rounded-2xl bg-white/20 backdrop-blur-md text-white border border-white/20 shadow-sm">
              <PlusCircle className="h-7 w-7" />
            </div>
            <span className="flex items-center space-x-1 text-xs font-extrabold bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-white border border-white/20">
              <span>{pendingVotesCount} en vote</span>
              <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
            </span>
          </div>

          <h2 className="text-2xl font-black tracking-tight mb-1">Signaler un Problème / Projet</h2>
          <p className="text-xs text-amber-100/90 leading-relaxed max-w-sm">
            Formulaire de signalement rapide avec photos, suivi des idées de travaux, votes des 7 membres et décisions Henri.
          </p>
        </div>

        {/* TILE 3: 🟣 Réservations & Séjours (Indigo / Violet) */}
        <div
          onClick={() => setActiveTab('reservations')}
          className="group relative overflow-hidden rounded-3xl p-6 bg-gradient-to-br from-indigo-600 to-purple-700 text-white shadow-lg hover:shadow-xl hover:scale-[1.01] transition-all duration-200 cursor-pointer border border-indigo-500/30"
        >
          <div className="absolute top-0 right-0 -mt-6 -mr-6 w-32 h-32 rounded-full bg-white/10 blur-xl pointer-events-none group-hover:scale-150 transition-transform"></div>

          <div className="flex justify-between items-start mb-4">
            <div className="p-3.5 rounded-2xl bg-white/20 backdrop-blur-md text-white border border-white/20 shadow-sm">
              <Calendar className="h-7 w-7" />
            </div>
            <span className="flex items-center space-x-1 text-xs font-extrabold bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-white border border-white/20">
              <span>Agenda Linéaire</span>
              <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
            </span>
          </div>

          <h2 className="text-2xl font-black tracking-tight mb-1">Réservations & Planning</h2>
          <p className="text-xs text-indigo-100/90 leading-relaxed max-w-sm">
            Calendrier linéaire des séjours, réservation Villa Rosing, Presbytère ou les Deux, et checklists de séjour.
          </p>
        </div>

        {/* TILE 4: 🔵 Informations Administratives (Ardoise / Bleu Ciel) */}
        <div
          onClick={() => setActiveTab('admin')}
          className="group relative overflow-hidden rounded-3xl p-6 bg-gradient-to-br from-slate-700 to-blue-800 text-white shadow-lg hover:shadow-xl hover:scale-[1.01] transition-all duration-200 cursor-pointer border border-slate-600/30"
        >
          <div className="absolute top-0 right-0 -mt-6 -mr-6 w-32 h-32 rounded-full bg-white/10 blur-xl pointer-events-none group-hover:scale-150 transition-transform"></div>

          <div className="flex justify-between items-start mb-4">
            <div className="p-3.5 rounded-2xl bg-white/20 backdrop-blur-md text-white border border-white/20 shadow-sm">
              <Landmark className="h-7 w-7" />
            </div>
            <span className="flex items-center space-x-1 text-xs font-extrabold bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-white border border-white/20">
              <span>RIB & Statuts</span>
              <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
            </span>
          </div>

          <h2 className="text-2xl font-black tracking-tight mb-1">Informations Administratives</h2>
          <p className="text-xs text-blue-100/90 leading-relaxed max-w-sm">
            RIB SCI, Statuts constitutifs, Actes notariés, Budget annuel 17 157 €/an et simulateur CCA 50 €/mois.
          </p>
        </div>

      </div>

      {/* MEMBER STAY TASKS CHECKLIST WIDGET */}
      <div className="space-y-4">
        <MemberStayTasksSection currentUser={currentUser} />
      </div>

      {/* QUICK OVERVIEW & UPCOMING STAYS SUMMARY */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Next Stay Card */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
            <div className="flex items-center space-x-2">
              <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-400">
                <Clock className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Prochains Séjours à Hellenvilliers</h3>
            </div>
            <button
              onClick={() => setActiveTab('reservations')}
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center space-x-1"
            >
              <span>Voir tout l'agenda</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {loading ? (
            <p className="text-xs text-slate-400 py-6 text-center">Chargement des séjours...</p>
          ) : reservations.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">Aucun séjour planifié pour le moment.</p>
          ) : (
            <div className="space-y-3">
              {reservations.slice(0, 3).map((r) => (
                <div key={r.id} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center font-extrabold text-xs">
                      {r.user_name[0]}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white">{r.user_name}</h4>
                      <p className="text-[11px] text-slate-500">
                        Du <strong className="text-slate-700 dark:text-slate-300">{r.start_date}</strong> au <strong className="text-slate-700 dark:text-slate-300">{r.end_date}</strong>
                      </p>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    Semaine {r.week_number}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SCI Key Figures Summary */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
              <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
                <Landmark className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Repères SCI</h3>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">Budget Annuel Total :</span>
                <span className="font-extrabold text-slate-900 dark:text-white">17 157 € / an</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">Cotisation CCA Suggérée :</span>
                <span className="font-extrabold text-indigo-600 dark:text-indigo-400">50 € / mois</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">Jardinier (EI PERROT) :</span>
                <span className="font-bold text-amber-600 dark:text-amber-400">3 900 € TTC/an</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">Associés Égaux :</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">7 Membres Famille</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => setActiveTab('admin')}
            className="mt-6 w-full py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl transition"
          >
            Accéder aux infos financières & RIB →
          </button>
        </div>

      </div>

    </div>
  );
}
