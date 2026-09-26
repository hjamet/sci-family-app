import React, { useState, useRef, useEffect } from 'react';

// Logo SVG épuré et architectural : Monogramme 'H' surmonté du toit de la bâtisse familiale
function HouseHLogo({ className = "w-10 h-10" }) {
  return (
    <div
      className={`${className} rounded-xl bg-sage-soft text-primary flex items-center justify-center p-1.5 shadow-sm border border-sage-border/60 transition-all duration-200 group-hover:scale-105 group-hover:bg-primary group-hover:text-white`}
    >
      <svg
        viewBox="0 0 36 36"
        className="w-full h-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Logo Domaine d'Hellenvilliers"
      >
        {/* Toit de la bâtisse avec débord architectural */}
        <path
          d="M 5 15 L 18 5 L 31 15"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Cheminée épurée sur le versant droit */}
        <path
          d="M 23 8.8 V 5.5 H 26 V 11.2"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Monogramme 'H' formant les piliers et la structure du domaine */}
        <line x1="11" y1="16" x2="11" y2="30.5" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" />
        <line x1="25" y1="16" x2="25" y2="30.5" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" />
        <line x1="11" y1="23" x2="25" y2="23" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

const NAV_ITEMS = [
  { id: 'home', label: 'Tableau de bord', path: '/', icon: 'dashboard' },
  { id: 'sejour', label: 'Séjour', path: '/sejour', icon: 'cottage' },
  { id: 'calendrier', label: 'Calendrier', path: '/calendrier', icon: 'calendar_month' },
  { id: 'taches', label: 'Tâches & Chantiers', path: '/taches', icon: 'checklist' },
  { id: 'admin', label: 'Administratif', path: '/admin', icon: 'folder_shared' },
];

export default function Header({
  activeTab = 'home',
  setActiveTab,
  currentUser = 'Henri Jamet',
  onLogout,
  onNavigate,
}) {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const dropdownRef = useRef(null);
  const mobileMenuRef = useRef(null);

  const displayName = typeof currentUser === 'object'
    ? (currentUser?.prenom ? `${currentUser.prenom} ${currentUser.nom || 'Jamet'}` : 'Henri Jamet')
    : (currentUser || 'Henri Jamet');

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsUserMenuOpen(false);
      }
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target)) {
        setIsMobileMenuOpen(false);
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
    setIsMobileMenuOpen(false);
    setIsUserMenuOpen(false);
  };

  const isItemActive = (item) => {
    if (activeTab === item.id) return true;
    if (item.id === 'home' && (activeTab === 'home' || activeTab === '')) return true;
    if (item.id === 'sejour' && (activeTab === 'sejour' || activeTab === 'vademecum')) return true;
    if (item.id === 'calendrier' && (activeTab === 'calendrier' || activeTab === 'reservations')) return true;
    if (item.id === 'taches' && (activeTab === 'taches' || activeTab === 'tasks')) return true;
    if (item.id === 'admin' && activeTab === 'admin') return true;
    return false;
  };

  return (
    <header className="sticky top-0 inset-x-0 z-50 bg-surface-container-lowest/90 backdrop-blur-xl border-b border-border-subtle shadow-[0_1px_8px_rgba(6,95,70,0.06)] transition-colors">
      <div className="h-20 max-w-[1360px] mx-auto px-6 lg:px-12 flex items-center justify-between gap-6">
        
        {/* Brand Logo & Title */}
        <div
          onClick={() => handleTabClick(NAV_ITEMS[0])}
          className="flex items-center gap-3 shrink-0 cursor-pointer select-none group"
        >
          <HouseHLogo className="w-10 h-10" />
          <div className="flex flex-col">
            <span className="font-headline-sm text-headline-sm text-primary leading-tight tracking-tight">
              Domaine d'Hellenvilliers
            </span>
            <span className="font-label-sm text-label-sm text-on-surface-variant font-normal">
              Portail Familial &amp; Patrimonial
            </span>
          </div>
        </div>

        {/* Center Nav Items (Stitch Canonical Pill Navigation) */}
        <nav
          className="hidden lg:flex items-center gap-1 bg-surface-container-low/70 p-1.5 rounded-full shadow-[0_1px_4px_rgba(6,95,70,0.03)]"
          data-active-classes="bg-sage-soft text-primary font-bold rounded-full"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = isItemActive(item);

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleTabClick(item)}
                className={`px-4 py-2 rounded-full font-label-md text-label-md transition-all cursor-pointer ${
                  isActive
                    ? 'bg-sage-soft text-primary font-bold shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* User Profile, Mobile Menu Button & Logout Dropdown */}
        <div className="flex items-center gap-3 shrink-0" ref={dropdownRef}>
          <div className="hidden sm:flex flex-col text-right">
            <span className="font-label-md text-label-md text-on-surface leading-tight font-semibold">
              {displayName}
            </span>
            <span className="font-label-sm text-xs text-on-surface-variant">
              Gérant / Coordinateur
            </span>
          </div>

          {/* User Profile Avatar Button */}
          <button
            type="button"
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="w-9 h-9 rounded-full bg-primary hover:bg-primary-container text-white flex items-center justify-center ring-2 ring-primary/20 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
            title="Menu profil"
            aria-label="Menu profil"
          >
            <span className="material-symbols-outlined text-[18px]">person</span>
          </button>

          {/* Mobile Menu Hamburger Button */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="lg:hidden w-9 h-9 rounded-xl bg-canvas-slate hover:bg-surface-container border border-border-subtle text-forest-deep flex items-center justify-center transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
            title="Menu de navigation"
            aria-label="Menu de navigation"
          >
            <span className="material-symbols-outlined text-[20px]">
              {isMobileMenuOpen ? 'close' : 'menu'}
            </span>
          </button>

          {/* User Profile Dropdown Menu */}
          {isUserMenuOpen && (
            <div className="absolute right-6 top-16 mt-2 w-56 rounded-2xl bg-white shadow-xl border border-border-subtle py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-4 py-2 border-b border-slate-100">
                <p className="text-xs text-on-surface-variant">Connecté en tant que</p>
                <p className="font-bold text-sm text-emerald-950 truncate">{displayName}</p>
                <p className="text-[11px] text-emerald-700 font-medium">Gérant / Coordinateur</p>
              </div>

              {/* Mobile nav links inside dropdown fallback */}
              <div className="lg:hidden border-b border-slate-100 py-1">
                {NAV_ITEMS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleTabClick(item)}
                    className="w-full px-4 py-2 text-left text-xs font-semibold text-on-surface hover:bg-sage-soft flex items-center gap-2 cursor-pointer"
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

      {/* Fluid Mobile Navigation Drawer */}
      {isMobileMenuOpen && (
        <div ref={mobileMenuRef} className="lg:hidden border-t border-border-subtle bg-surface-container-lowest/98 backdrop-blur-xl px-6 py-3 shadow-md animate-in slide-in-from-top-2 duration-150">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {NAV_ITEMS.map((item) => {
              const active = isItemActive(item);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleTabClick(item)}
                  className={`p-3 rounded-xl text-left font-label-md text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                    active
                      ? 'bg-sage-soft text-primary font-bold shadow-xs'
                      : 'text-on-surface hover:bg-canvas-slate'
                  }`}
                >
                  <span className={`material-symbols-outlined text-[18px] ${active ? 'text-primary' : 'text-outline'}`}>
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
}
