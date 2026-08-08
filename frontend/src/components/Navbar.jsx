import React from 'react';
import {
  Home, AlertTriangle, Calendar, ShieldCheck, UserCheck, Sparkles,
  Vote, BookOpen, Users, LogIn, LogOut
} from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, currentUser, setCurrentUser, onOpenAuthModal }) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-950/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Title */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-indigo-500 to-amber-400 p-0.5 glow-cyan">
              <div className="h-full w-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Home className="h-5 w-5 text-cyan-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-cyan-400">
                  SCI Familiale
                </span>
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-400 border border-cyan-800/50">
                  Hellenvilliers
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">Portail des Associés & Gestion</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden lg:flex items-center space-x-1">
            
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'dashboard'
                  ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
              <span>Tableau de Bord</span>
            </button>

            <button
              onClick={() => setActiveTab('projects')}
              className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'projects'
                  ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <Vote className="h-4 w-4" />
              <span>Projets & Votes</span>
            </button>

            <button
              onClick={() => setActiveTab('crossed_calendar')}
              className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'crossed_calendar'
                  ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <Users className="h-4 w-4" />
              <span>Calendrier Croisé</span>
            </button>

            <button
              onClick={() => setActiveTab('vademecum')}
              className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'vademecum'
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <BookOpen className="h-4 w-4" />
              <span>Vademecum</span>
            </button>

            <button
              onClick={() => setActiveTab('issues')}
              className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'issues'
                  ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <AlertTriangle className="h-4 w-4" />
              <span>Incidents</span>
            </button>

            <button
              onClick={() => setActiveTab('reservations')}
              className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'reservations'
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <Calendar className="h-4 w-4" />
              <span>Réservations</span>
            </button>

          </nav>

          {/* User Auth Profile Badge */}
          <div className="flex items-center space-x-3">
            
            <button
              onClick={onOpenAuthModal}
              className="flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl px-3 py-1.5 transition"
            >
              <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></div>
              <UserCheck className="h-4 w-4 text-cyan-400" />
              <span className="text-xs font-bold text-slate-200">{currentUser}</span>
              <span className="text-[10px] text-slate-400 hidden xs:inline">(Changer)</span>
            </button>

          </div>

        </div>

        {/* Mobile Navigation Bar */}
        <div className="flex lg:hidden overflow-x-auto space-x-1 py-2 border-t border-slate-900 scrollbar-none">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
              activeTab === 'dashboard' ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-400'
            }`}
          >
            Tableau
          </button>
          <button
            onClick={() => setActiveTab('projects')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
              activeTab === 'projects' ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-400'
            }`}
          >
            Projets & Votes
          </button>
          <button
            onClick={() => setActiveTab('crossed_calendar')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
              activeTab === 'crossed_calendar' ? 'bg-indigo-500/20 text-indigo-300' : 'text-slate-400'
            }`}
          >
            Calendrier Croisé
          </button>
          <button
            onClick={() => setActiveTab('vademecum')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
              activeTab === 'vademecum' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-400'
            }`}
          >
            Vademecum
          </button>
          <button
            onClick={() => setActiveTab('issues')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
              activeTab === 'issues' ? 'bg-rose-500/20 text-rose-400' : 'text-slate-400'
            }`}
          >
            Incidents
          </button>
          <button
            onClick={() => setActiveTab('reservations')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
              activeTab === 'reservations' ? 'bg-amber-500/20 text-amber-400' : 'text-slate-400'
            }`}
          >
            Réservations
          </button>
        </div>

      </div>
    </header>
  );
}
