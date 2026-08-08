import React, { useState } from 'react';
import {
  Home, BookOpen, AlertTriangle, Calendar, Landmark, Plus, Sun, Moon,
  ChevronDown, Check, User, Vote
} from 'lucide-react';

const FAMILY_MEMBERS = [
  { prenom: 'Henri', role: 'Coordinateur', color: 'bg-cyan-500 text-white border-cyan-600' },
  { prenom: 'Hortense', role: 'Associé', color: 'bg-rose-500 text-white border-rose-600' },
  { prenom: 'Marguerite', role: 'Associé', color: 'bg-purple-500 text-white border-purple-600' },
  { prenom: 'Eugénie', role: 'Associé', color: 'bg-amber-500 text-white border-amber-600' },
  { prenom: 'Joséphine', role: 'Associé', color: 'bg-emerald-500 text-white border-emerald-600' },
  { prenom: 'Élisabeth', role: 'Associé', color: 'bg-teal-500 text-white border-teal-600' },
  { prenom: 'Frédéric', role: 'Associé', color: 'bg-blue-500 text-white border-blue-600' },
];

export default function Header({
  activeTab,
  setActiveTab,
  currentUser,
  setCurrentUser,
  onOpenNewProject,
  onOpenBooking,
  isDarkMode,
  setIsDarkMode
}) {
  const [isMemberDropdownOpen, setIsMemberDropdownOpen] = useState(false);

  const activeMember = FAMILY_MEMBERS.find(m => m.prenom === currentUser) || FAMILY_MEMBERS[0];

  const handleSelectMember = (prenom) => {
    setCurrentUser(prenom);
    localStorage.setItem('sci_user', prenom);
    setIsMemberDropdownOpen(false);
  };

  const navItems = [
    { id: 'home', label: 'Accueil', icon: Home, color: 'text-emerald-500' },
    { id: 'vademecum', label: 'Vademecum', icon: BookOpen, color: 'text-emerald-400' },
    { id: 'signalements', label: 'Projets & Signalements', icon: AlertTriangle, color: 'text-amber-500' },
    { id: 'reservations', label: 'Réservations & Planning', icon: Calendar, color: 'text-purple-500' },
    { id: 'admin', label: 'Infos Admin', icon: Landmark, color: 'text-blue-500' },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Title */}
          <div
            onClick={() => setActiveTab('home')}
            className="flex items-center space-x-3 cursor-pointer group"
          >
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-600 to-indigo-600 flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition-transform">
              <Home className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-lg tracking-tight text-slate-900 dark:text-white">
                  Viva Hellenvilliers !!
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
                Portail des Associés & Gestion SCI
              </p>
            </div>
          </div>

          {/* Center Navigation Bar (Desktop) */}
          <nav className="hidden lg:flex items-center space-x-1 bg-slate-100/80 dark:bg-slate-900/80 p-1 rounded-2xl border border-slate-200/60 dark:border-slate-800">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? item.color : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Quick Controls Right */}
          <div className="flex items-center space-x-2">
            
            {/* Quick Action Button (+ Signalement) */}
            <button
              onClick={onOpenNewProject}
              className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-sm transition"
              title="Signaler un problème ou proposer un projet"
            >
              <Plus className="h-4 w-4" />
              <span>Signaler</span>
            </button>

            {/* Member Profile Switcher Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsMemberDropdownOpen(!isMemberDropdownOpen)}
                className="flex items-center space-x-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 transition"
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${activeMember.color}`}>
                  {activeMember.prenom[0]}
                </div>
                <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200">{activeMember.prenom}</span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>

              {isMemberDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-2 z-50 animate-in fade-in duration-150">
                  <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Changer de membre</p>
                  </div>
                  <div className="py-1">
                    {FAMILY_MEMBERS.map((member) => (
                      <button
                        key={member.prenom}
                        onClick={() => handleSelectMember(member.prenom)}
                        className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition ${
                          member.prenom === currentUser
                            ? 'font-extrabold bg-slate-50 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${member.color}`}>
                            {member.prenom[0]}
                          </div>
                          <div>
                            <p className="font-semibold">{member.prenom}</p>
                            <p className="text-[10px] text-slate-400">{member.role}</p>
                          </div>
                        </div>
                        {member.prenom === currentUser && <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Dark/Light Theme Switcher */}
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 transition"
              title="Basculer le thème clair / sombre"
            >
              {isDarkMode ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-slate-600" />}
            </button>

          </div>

        </div>

        {/* Mobile Navigation Tabs Bar */}
        <div className="flex lg:hidden overflow-x-auto space-x-1 py-2 border-t border-slate-200/60 dark:border-slate-800 scrollbar-none">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                  isActive
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                    : 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-900'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

      </div>
    </header>
  );
}
