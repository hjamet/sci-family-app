import React, { useState } from 'react';
import {
  Home, BookOpen, Plus, Calendar, Sun, Moon, ChevronDown, Check, User
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
  currentUser,
  setCurrentUser,
  onOpenVademecum,
  onOpenNewProject,
  onOpenBooking,
  isDarkMode,
  setIsDarkMode
}) {
  const [isMemberDropdownOpen, setIsMemberDropdownOpen] = useState(false);

  const activeMember = FAMILY_MEMBERS.find(m => m.prenom === currentUser) || FAMILY_MEMBERS[6];

  const handleSelectMember = (prenom) => {
    setCurrentUser(prenom);
    localStorage.setItem('sci_user', prenom);
    setIsMemberDropdownOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Title */}
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-2xl bg-slate-900 dark:bg-slate-800 flex items-center justify-center text-white shadow-sm">
              <Home className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-lg tracking-tight text-slate-900 dark:text-white">
                  Viva Hellenvilliers !!
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
                Portail des Associés & Gestion
              </p>
            </div>
          </div>

          {/* Quick Action Controls */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            
            {/* Prominent Vademecum Button */}
            <button
              onClick={onOpenVademecum}
              className="flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm hover:shadow transition-all"
              title="Guides et informations pratiques d'Hellenvilliers"
            >
              <BookOpen className="h-4 w-4" />
              <span className="hidden md:inline">Vademecum & Infos Pratiques</span>
              <span className="md:hidden">Vademecum</span>
            </button>

            {/* Propose Project / Report Issue Button (Requirement 1) */}
            <button
              onClick={onOpenNewProject}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition"
              title="Signaler un problème, une idée ou un projet (avec photos)"
            >
              <Plus className="h-4 w-4 text-white" />
              <span>Signaler un problème, une idée ou un projet</span>
            </button>

            {/* Book Stay Button */}
            <button
              onClick={onOpenBooking}
              className="flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition"
            >
              <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="hidden sm:inline">Réserver un séjour</span>
            </button>

            {/* Member Profile Switcher Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsMemberDropdownOpen(!isMemberDropdownOpen)}
                className="flex items-center space-x-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 transition"
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${activeMember.color}`}>
                  {activeMember.prenom[0]}
                </div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{activeMember.prenom}</span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>

              {isMemberDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Changer de membre</p>
                  </div>
                  <div className="py-1">
                    {FAMILY_MEMBERS.map((member) => (
                      <button
                        key={member.prenom}
                        onClick={() => handleSelectMember(member.prenom)}
                        className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition ${
                          member.prenom === currentUser ? 'font-bold bg-slate-50/80 dark:bg-slate-800/80 text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'
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
      </div>
    </header>
  );
}
