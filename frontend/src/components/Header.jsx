import React, { useState, useRef, useEffect } from 'react';
import {
  Home, BookOpen, AlertTriangle, Calendar, Landmark, LogOut,
  CheckSquare, Vote, User, ChevronDown, ShieldCheck, Mail, FlaskConical
} from 'lucide-react';

const FAMILY_MEMBERS = [
  { prenom: 'Henri', role: 'Coordinateur Général', email: 'henri@sci-familiale.fr', color: 'bg-cyan-600 text-white' },
  { prenom: 'Hortense', role: 'Responsable Espaces Verts', email: 'hortense@sci-familiale.fr', color: 'bg-rose-500 text-white' },
  { prenom: 'Marguerite', role: 'Responsable Équipements', email: 'marguerite@sci-familiale.fr', color: 'bg-purple-500 text-white' },
  { prenom: 'Eugénie', role: 'Responsable Peintures & Tri', email: 'eugenie@sci-familiale.fr', color: 'bg-amber-500 text-white' },
  { prenom: 'Joséphine', role: 'Coordinatrice Adjointe', email: 'josephine@sci-familiale.fr', color: 'bg-emerald-500 text-white' },
  { prenom: 'Élisabeth', prenomAlt: 'Maman', role: 'Garante du Patrimoine', email: 'maman@sci-familiale.fr', color: 'bg-teal-500 text-white' },
  { prenom: 'Maman', role: 'Garante du Patrimoine', email: 'maman@sci-familiale.fr', color: 'bg-teal-500 text-white' },
  { prenom: 'Frédéric', role: 'Responsable Électricité', email: 'frederic@sci-familiale.fr', color: 'bg-blue-500 text-white' },
];

export default function Header({
  activeTab,
  setActiveTab,
  currentUser,
  onLogout
}) {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const dropdownRef = useRef(null);

  const userPrenom = typeof currentUser === 'object' ? currentUser?.prenom : currentUser;
  const activeMember = FAMILY_MEMBERS.find(
    m => m.prenom.toLowerCase() === (userPrenom || '').toLowerCase() ||
         (m.prenomAlt && m.prenomAlt.toLowerCase() === (userPrenom || '').toLowerCase())
  ) || {
    prenom: userPrenom || 'Membre',
    role: 'Membre Associé SCI',
    email: `${(userPrenom || 'membre').toLowerCase()}@sci-familiale.fr`,
    color: 'bg-emerald-600 text-white'
  };

  // Close user dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const navItems = [
    { id: 'home', label: 'Accueil', icon: Home, color: 'text-emerald-500' },
    { id: 'tasks', label: 'Tâches', icon: CheckSquare, color: 'text-amber-500' },
    { id: 'votes', label: 'Votes', icon: Vote, color: 'text-rose-500' },
    { id: 'vademecum', label: 'Vademecum', icon: BookOpen, color: 'text-emerald-400' },
    { id: 'signalements', label: 'Problèmes', icon: AlertTriangle, color: 'text-amber-500' },
    { id: 'reservations', label: 'Planning', icon: Calendar, color: 'text-purple-500' },
    { id: 'admin', label: 'Infos Admin', icon: Landmark, color: 'text-blue-500' },
    { id: 'lab', label: '🧪 Labo Test', icon: FlaskConical, color: 'text-indigo-500' },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/95 backdrop-blur-md transition-colors shadow-sm">
      <div className="w-full px-4 sm:px-6 lg:px-8 max-w-[1500px] mx-auto">
        <div className="flex items-center justify-between h-16 gap-4">
          
          {/* Logo & Title */}
          <div
            onClick={() => setActiveTab('home')}
            className="flex items-center space-x-3 cursor-pointer group shrink-0"
          >
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-600 to-indigo-600 flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition-transform">
              <Home className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-lg tracking-tight text-slate-900">
                  Viva Hellenvilliers !!
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden xl:block">
                Portail des Associés & Gestion SCI
              </p>
            </div>
          </div>

          {/* Center Navigation Bar (Desktop & Tablet) */}
          <nav className="hidden lg:flex items-center justify-center flex-1 space-x-1 max-w-4xl bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200/60 shadow-inner">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id ||
                (item.id === 'votes' && activeTab === 'projects_vote') ||
                (item.id === 'tasks' && activeTab === 'stay_tasks');
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex-1 justify-center ${
                    isActive
                      ? 'bg-white text-slate-900 shadow-md scale-[1.02]'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? item.color : 'text-slate-400'}`} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* User Profile Dropdown (Right) */}
          <div className="relative shrink-0" ref={dropdownRef}>
            
            {/* Interactive User Trigger Button */}
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="flex items-center space-x-2.5 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 rounded-2xl px-3 py-1.5 transition shadow-sm cursor-pointer group"
              title="Menu Utilisateur & Compte"
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold shadow-sm ${activeMember.color}`}>
                {activeMember.prenom[0]}
              </div>
              <div className="hidden sm:flex flex-col text-left">
                <span className="text-xs font-extrabold text-slate-800 leading-tight">
                  {activeMember.prenom}
                </span>
                <span className="text-[9px] text-slate-500 font-medium truncate max-w-[110px]">
                  {activeMember.role}
                </span>
              </div>
              <ChevronDown className={`w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-transform duration-200 ${isUserMenuOpen ? 'rotate-180 text-indigo-600' : ''}`} />
            </button>

            {/* Dropdown Menu Popover */}
            {isUserMenuOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-white rounded-3xl border border-slate-200/90 shadow-2xl p-4 text-slate-800 z-50 animate-in fade-in zoom-in-95 duration-150 space-y-3">
                
                {/* User Details Header */}
                <div className="flex items-start space-x-3 pb-3 border-b border-slate-100">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-black shadow-sm shrink-0 ${activeMember.color}`}>
                    {activeMember.prenom[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-black text-slate-900 truncate">
                      {activeMember.prenom}
                    </h4>
                    <p className="text-[11px] font-bold text-indigo-600 flex items-center space-x-1 mt-0.5">
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{activeMember.role}</span>
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium flex items-center space-x-1 mt-1 truncate">
                      <Mail className="w-3 h-3 shrink-0 text-slate-400" />
                      <span className="truncate">{activeMember.email}</span>
                    </p>
                  </div>
                </div>

                {/* Quick Profile Links */}
                <div className="space-y-1">
                  <button
                    onClick={() => {
                      setActiveTab('tasks');
                      setIsUserMenuOpen(false);
                    }}
                    className="w-full flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 hover:text-amber-700 transition text-left"
                  >
                    <CheckSquare className="w-4 h-4 text-amber-500" />
                    <span>Mon Espace Tâches</span>
                  </button>

                  <button
                    onClick={() => {
                      setActiveTab('admin');
                      setIsUserMenuOpen(false);
                    }}
                    className="w-full flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 hover:text-blue-700 transition text-left"
                  >
                    <Landmark className="w-4 h-4 text-blue-500" />
                    <span>Informations & RIB SCI</span>
                  </button>
                </div>

                {/* Logout Button */}
                <div className="pt-2 border-t border-slate-100">
                  <button
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      onLogout();
                    }}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-2xl text-xs font-extrabold bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition shadow-sm group"
                  >
                    <LogOut className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
                    <span>Se déconnecter</span>
                  </button>
                </div>

              </div>
            )}

          </div>

        </div>

        {/* Mobile Navigation Tabs Bar */}
        <div className="flex lg:hidden overflow-x-auto space-x-1.5 py-2 border-t border-slate-200/60 scrollbar-none">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id ||
              (item.id === 'votes' && activeTab === 'projects_vote') ||
              (item.id === 'tasks' && activeTab === 'stay_tasks');
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 bg-slate-100 hover:bg-slate-200'
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
