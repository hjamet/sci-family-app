import React, { useState, useRef, useEffect } from 'react';

const LOGO_SRC = "https://lh3.googleusercontent.com/aida/AEtjO1XPkJA9U7CARtYXRqiCPhIByczBnBdNtGuBGIaMyna0c8Ams8nQu_bL_xLUxSm0ss6S3OHFS_n6B7nd2shejRa7UOjp65THsDhEKTpK_c7vICASOxbWet3Npaq5uEjMp0n1qWBqzcIJLOA643R5lKnnpnipatsdqzLoRZFTH3yd8h6IRXGs4HV3UIq2aiKXLu8bVu7FO6vMLYXv5-ilXUTx3C0CaKLCNIbtx6bjoStN";

const NAV_ITEMS = [
  { id: 'home', label: 'Tableau de bord', path: '/', icon: 'dashboard' },
  { id: 'tasks', label: 'Tâches', path: '/tasks', icon: 'checklist' },
  { id: 'votes', label: 'Votes', path: '/votes', icon: 'how_to_vote' },
  { id: 'admin', label: 'Administratif', path: '/admin', icon: 'folder_shared' },
  { id: 'reservations', label: 'Calendrier', path: '/reservations', icon: 'calendar_month' },
  { id: 'vademecum', label: 'Séjour', path: '/vademecum', icon: 'key' },
];

export default function Header({
  activeTab = 'home',
  setActiveTab,
  currentUser = 'Henri Jamet',
  onLogout,
  onNavigate,
}) {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const dropdownRef = useRef(null);

  const displayName = typeof currentUser === 'object'
    ? (currentUser?.prenom ? `${currentUser.prenom} ${currentUser.nom || 'Jamet'}` : 'Henri Jamet')
    : (currentUser || 'Henri Jamet');

  const initials = displayName
    .split(' ')
    .map(p => p[0])
    .join('')
    .substring(0, 2)
    .toUpperCase() || 'HJ';

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

  const handleTabClick = (item) => {
    if (setActiveTab) {
      setActiveTab(item.id);
    }
    if (onNavigate) {
      onNavigate(item.path, item.id);
    }
  };

  return (
    <header className="sticky top-0 inset-x-0 z-50 bg-surface-container-lowest/95 backdrop-blur-xl shadow-[0_1px_8px_rgba(6,95,70,0.06)] border-b border-border-subtle transition-colors">
      <div className="max-w-[1360px] mx-auto px-gutter h-20 flex items-center justify-between gap-gutter">
        
        {/* Brand Logo & Title */}
        <div
          onClick={() => handleTabClick(NAV_ITEMS[0])}
          className="flex items-center gap-space-md cursor-pointer select-none group"
        >
          <div className="w-10 h-10 rounded-xl bg-white shadow-sm border border-emerald-500/20 p-1 flex items-center justify-center transition-transform group-hover:scale-105">
            {!logoError ? (
              <img
                alt="Blason Domaine d'Hellenvilliers"
                className="w-full h-full object-contain rounded-lg"
                src={LOGO_SRC}
                onError={() => setLogoError(true)}
              />
            ) : (
              <div className="w-full h-full bg-forest-deep text-white font-bold text-sm flex items-center justify-center rounded-lg">
                H
              </div>
            )}
          </div>
          <div className="flex flex-col">
            <span className="font-headline-sm text-headline-sm text-forest-deep tracking-tight leading-none">
              Domaine d'Hellenvilliers
            </span>
            <span className="text-[11px] text-on-surface-variant font-medium mt-0.5 hidden sm:block">
              SCI Familiale • 7 associés
            </span>
          </div>
        </div>

        {/* Center Nav Items */}
        <nav className="hidden lg:flex items-center gap-space-xs">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id ||
              (item.id === 'votes' && activeTab === 'projects_vote') ||
              (item.id === 'tasks' && activeTab === 'stay_tasks');

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleTabClick(item)}
                className={`px-3 py-2 transition-all cursor-pointer font-label-sm text-label-sm ${
                  isActive
                    ? 'bg-sage-soft text-primary font-bold rounded-DEFAULT shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface rounded-DEFAULT hover:bg-canvas-slate'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* User Profile & Logout Dropdown */}
        <div className="relative flex items-center gap-space-sm" ref={dropdownRef}>
          <div className="hidden sm:flex flex-col text-right">
            <span className="font-label-sm text-label-sm text-on-surface font-semibold leading-tight">
              {displayName}
            </span>
            <span className="text-[11px] text-emerald-800 font-medium">
              Associé SCI
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="w-10 h-10 rounded-full bg-primary hover:bg-primary-container text-white flex items-center justify-center shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
            title="Menu profil"
          >
            <span className="material-symbols-outlined text-[20px]">person</span>
          </button>

          {/* Dropdown Menu */}
          {isUserMenuOpen && (
            <div className="absolute right-0 top-12 mt-2 w-56 rounded-2xl bg-white shadow-xl border border-border-subtle py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-4 py-2 border-b border-slate-100">
                <p className="text-xs text-on-surface-variant">Connecté en tant que</p>
                <p className="font-bold text-sm text-emerald-950 truncate">{displayName}</p>
                <p className="text-[11px] text-emerald-700 font-medium">Membre associé</p>
              </div>

              {/* Mobile nav links inside dropdown */}
              <div className="lg:hidden border-b border-slate-100 py-1">
                {NAV_ITEMS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      handleTabClick(item);
                      setIsUserMenuOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left text-xs font-semibold text-on-surface hover:bg-sage-soft flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[16px] text-primary">
                      {item.icon}
                    </span>
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    if (onLogout) onLogout();
                  }}
                  className="w-full px-4 py-2.5 text-left text-xs font-bold text-error hover:bg-error-container/30 flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">logout</span>
                  Se déconnecter
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </header>
  );
}
