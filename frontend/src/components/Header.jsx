import React, { useState, useRef, useEffect } from 'react';
import { fetchTasks, fetchProjects, fetchPiscineStatus, fetchReservations } from '../api';

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
  { id: 'taches', label: 'Tâches', path: '/taches', icon: 'checklist' },
  { id: 'admin', label: 'Administratif', path: '/admin', icon: 'folder_shared' },
];

export default function Header({
  activeTab = 'home',
  setActiveTab,
  currentUser = 'Henri Jamet',
  onLogout,
  onNavigate,
  onOpenVoteModal,
  onOpenTaskModal,
  onOpenBookingModal,
}) {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const dropdownRef = useRef(null);
  const notifRef = useRef(null);
  const mobileMenuRef = useRef(null);

  const displayName = typeof currentUser === 'object'
    ? (currentUser?.prenom ? `${currentUser.prenom} ${currentUser.nom || 'Jamet'}` : 'Henri Jamet')
    : (currentUser || 'Henri Jamet');

  const resolveUserId = (user) => {
    if (!user) return 'default';
    if (typeof user === 'object') {
      return user.id ?? (user.prenom ? user.prenom.toLowerCase() : 'user');
    }
    return String(user).toLowerCase().replace(/\s+/g, '_');
  };

  const getStorageKey = (user) => {
    const uid = resolveUserId(user);
    return `sci_read_notifications_${uid}`;
  };

  const [notifications, setNotifications] = useState([
    {
      id: 'notif-vote-roof',
      title: 'Vote toiture ouvert',
      description: 'Consultation sur le devis Riffael & Denis (2 400 €).',
      type: 'vote',
      projectId: 'roof',
      path: '/taches',
      tabId: 'taches',
      time: 'En cours',
      icon: 'how_to_vote',
    },
    {
      id: 'notif-task-placo',
      title: 'Tâche assignée : Placo bibliothèque',
      description: 'Chantier prioritaire suite à infiltration.',
      type: 'task',
      taskId: 'task-placo',
      path: '/taches',
      tabId: 'taches',
      time: 'Prioritaire',
      icon: 'assignment_ind',
    },
    {
      id: 'notif-pool-ph',
      title: 'Alerte Bassin Klereo',
      description: 'Niveau bas bidon pH à renouveler.',
      type: 'alert',
      path: '/sejour',
      tabId: 'sejour',
      time: 'Télémétrie',
      icon: 'pool',
    },
  ]);

  const [readNotifIds, setReadNotifIds] = useState(() => {
    try {
      const key = getStorageKey(currentUser);
      const saved = localStorage.getItem(key);
      if (saved) return JSON.parse(saved);
      const legacy = localStorage.getItem('sci_read_notifications');
      return legacy ? JSON.parse(legacy) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      const key = getStorageKey(currentUser);
      const saved = localStorage.getItem(key);
      if (saved) {
        setReadNotifIds(JSON.parse(saved));
      } else {
        const legacy = localStorage.getItem('sci_read_notifications');
        if (legacy) setReadNotifIds(JSON.parse(legacy));
      }
    } catch (err) {
      console.warn('Erreur synchronisation notifications lues:', err);
    }
  }, [currentUser]);

  const persistReadIds = (newIds) => {
    setReadNotifIds(newIds);
    try {
      const key = getStorageKey(currentUser);
      localStorage.setItem(key, JSON.stringify(newIds));
    } catch (err) {
      console.warn('Erreur persistance readNotifIds:', err);
    }
  };

  useEffect(() => {
    let isMounted = true;
    async function loadDynamicNotifications() {
      try {
        const [poolRes, projRes, taskRes, resRes] = await Promise.allSettled([
          fetchPiscineStatus(),
          fetchProjects(),
          fetchTasks(),
          fetchReservations(),
        ]);

        const dynamicNotifs = [];

        // 1. Alertes piscine réelles
        if (poolRes.status === 'fulfilled' && poolRes.value?.alerts?.length > 0) {
          poolRes.value.alerts.forEach((alertText, idx) => {
            dynamicNotifs.push({
              id: `pool-alert-${idx}`,
              title: 'Alerte Équipement Piscine',
              description: alertText,
              type: 'alert',
              path: '/sejour',
              tabId: 'sejour',
              time: 'Télémétrie',
              icon: 'pool',
            });
          });
        }

        // 2. Projets en vote ouvert
        if (projRes.status === 'fulfilled' && Array.isArray(projRes.value)) {
          projRes.value
            .filter((p) => p.status === 'voting' || p.status === 'open' || p.is_voting)
            .forEach((p) => {
              dynamicNotifs.push({
                id: `proj-vote-${p.id}`,
                title: `Vote ouvert : ${p.title}`,
                description: p.description ? p.description.slice(0, 75) + '...' : 'Votre avis d\'associé est requis.',
                type: 'vote',
                projectId: p.id,
                project: p,
                path: '/taches',
                tabId: 'taches',
                time: 'Vote actif',
                icon: 'how_to_vote',
              });
            });
        }

        // 3. Tâches urgentes ou assignées
        if (taskRes.status === 'fulfilled' && Array.isArray(taskRes.value)) {
          const userFirst = typeof currentUser === 'string' ? currentUser.split(' ')[0] : (currentUser?.prenom || 'Henri');
          taskRes.value
            .filter((t) => {
              if (t.status === 'DONE' || t.status === 'VALIDE') return false;
              const assigned = Array.isArray(t.assigned_members) ? t.assigned_members.join(' ') : String(t.responsible || '');
              return assigned.toLowerCase().includes(userFirst.toLowerCase()) || t.priority === 'URGENT';
            })
            .slice(0, 3)
            .forEach((t) => {
              dynamicNotifs.push({
                id: `task-assign-${t.id}`,
                title: `${t.priority === 'URGENT' ? '🚨 ' : ''}${t.title}`,
                description: t.description ? t.description.slice(0, 75) + '...' : 'Tâche en attente d\'action.',
                type: 'task',
                taskId: t.id,
                task: t,
                path: '/taches',
                tabId: 'taches',
                time: t.priority === 'URGENT' ? 'Urgent' : 'En cours',
                icon: 'assignment_ind',
              });
            });
        }

        // 4. Séjours et réservations imminents
        if (resRes.status === 'fulfilled' && Array.isArray(resRes.value)) {
          const userFirst = typeof currentUser === 'string' ? currentUser.split(' ')[0] : (currentUser?.prenom || 'Henri');
          const todayStr = new Date().toISOString().split('T')[0];
          resRes.value
            .filter((r) => {
              if (r.status === 'Refusée' || r.status === 'Annulée') return false;
              const isUpcoming = (r.end_date && r.end_date >= todayStr) || (r.start_date && r.start_date >= todayStr);
              if (!isUpcoming) return false;
              const rUser = (r.user_name || '').toLowerCase();
              return rUser.includes(userFirst.toLowerCase());
            })
            .slice(0, 2)
            .forEach((r) => {
              dynamicNotifs.push({
                id: `stay-booking-${r.id}`,
                title: `Séjour : ${r.house === 'rosing' ? 'Rosing' : 'Presbytère'}`,
                description: `Du ${r.start_date} au ${r.end_date} (${r.status || 'Confirmé'}).`,
                type: 'sejour',
                path: '/calendrier',
                tabId: 'calendrier',
                time: 'Séjour',
                icon: 'cottage',
                reservation: r,
              });
            });
        }

        if (isMounted && dynamicNotifs.length > 0) {
          setNotifications((prev) => {
            const existingIds = new Set(prev.map((n) => n.id));
            const newOnes = dynamicNotifs.filter((n) => !existingIds.has(n.id));
            return [...newOnes, ...prev];
          });
        }
      } catch (err) {
        console.warn('Erreur chargement notifications dynamiques:', err);
      }
    }

    loadDynamicNotifications();
    return () => {
      isMounted = false;
    };
  }, [typeof currentUser === 'object' ? (currentUser?.id || currentUser?.prenom || 'Henri') : (currentUser || 'Henri')]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsUserMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setIsNotifOpen(false);
      }
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target)) {
        setIsMobileMenuOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsNotifOpen(false);
        setIsUserMenuOpen(false);
        setIsMobileMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const unreadNotifications = notifications.filter((n) => !readNotifIds.includes(n.id));
  const unreadCount = unreadNotifications.length;

  const markAllAsRead = (e) => {
    if (e) e.stopPropagation();
    const allIds = notifications.map((n) => n.id);
    const updated = Array.from(new Set([...readNotifIds, ...allIds]));
    persistReadIds(updated);
  };

  const handleNotificationClick = (notif) => {
    // 1. Ajouter l'ID de la notification à readNotificationIds et persister
    if (!readNotifIds.includes(notif.id)) {
      const updated = [...readNotifIds, notif.id];
      persistReadIds(updated);
    }

    // 2. Fermer le popover de notifications
    setIsNotifOpen(false);

    // 3. Ouvrir immédiatement la modale associée sans recharger ni changer de page
    if (notif.type === 'vote') {
      if (onOpenVoteModal) {
        onOpenVoteModal(notif.projectId || notif.project?.id || notif.id, notif.project);
        return;
      }
    }

    if (notif.type === 'task') {
      if (onOpenTaskModal) {
        onOpenTaskModal(notif.taskId || notif.task?.id || notif.id, notif.task);
        return;
      }
    }

    if (notif.type === 'sejour' || notif.type === 'booking') {
      if (onOpenBookingModal) {
        onOpenBookingModal();
        return;
      }
    }

    // Fallback navigation si alerte ou aucun gestionnaire de modale
    if (setActiveTab && notif.tabId) {
      setActiveTab(notif.tabId);
    }
    if (onNavigate && notif.path) {
      onNavigate(notif.path, notif.tabId);
    }
  };

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

        {/* Action Toolbar : [🔔 Notifications] [⚙️ Paramètres] [📊 Statistiques] [👤 Profil] */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="hidden sm:flex flex-col text-right">
            <span className="font-label-md text-label-md text-on-surface leading-tight font-semibold">
              {displayName}
            </span>
          </div>

          {/* 1. Bouton [🔔 Notifications] avec popover élégant */}
          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => {
                setIsNotifOpen((prev) => !prev);
                setIsUserMenuOpen(false);
              }}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all relative cursor-pointer ${
                isNotifOpen
                  ? 'bg-sage-soft text-primary ring-2 ring-primary/40 shadow-xs font-bold'
                  : 'bg-canvas-slate hover:bg-sage-soft/70 text-on-surface-variant hover:text-primary border border-border-subtle shadow-xs'
              }`}
              title="Notifications & Alertes"
              aria-label="Notifications & Alertes"
            >
              <span className="material-symbols-outlined text-[20px]">notifications</span>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 bg-amber-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-xs animate-pulse ring-2 ring-white">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Menu Déroulant Popover Notifications */}
            {isNotifOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50 p-3 animate-in fade-in zoom-in-95 duration-150">
                {/* En-tête */}
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px] text-primary">notifications</span>
                    <span className="font-bold text-xs text-slate-900 dark:text-slate-100">Notifications</span>
                    {unreadCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 text-[10px] font-bold">
                        {unreadCount}
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={markAllAsRead}
                      className="text-[11px] font-semibold text-primary hover:text-primary-container dark:text-emerald-400 hover:underline cursor-pointer"
                    >
                      Tout marquer comme lu
                    </button>
                  )}
                </div>

                {/* Liste des notifications non lues (disparaissent dès qu'elles sont lues) */}
                <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto pr-1">
                  {unreadNotifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6 px-4 text-center">
                      <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-primary flex items-center justify-center mb-2 shadow-2xs">
                        <span className="material-symbols-outlined text-[20px]">done_all</span>
                      </div>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Aucune notification en attente
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Toutes vos notifications et votes ont été traités.
                      </p>
                    </div>
                  ) : (
                    unreadNotifications.map((notif) => (
                      <div
                        key={notif.id}
                        onClick={() => handleNotificationClick(notif)}
                        className="p-2.5 rounded-xl transition-all cursor-pointer flex items-start gap-2.5 bg-emerald-50/70 dark:bg-emerald-950/30 hover:bg-emerald-100/70 dark:hover:bg-emerald-900/40 border border-emerald-200/60 dark:border-emerald-800/40 shadow-2xs group"
                      >
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 transition-transform group-hover:scale-105 ${
                            notif.type === 'alert'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300'
                              : notif.type === 'vote'
                              ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-300'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[16px]">{notif.icon || 'notifications'}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <p className="text-xs truncate font-bold text-slate-900 dark:text-slate-100 group-hover:text-primary transition-colors">
                              {notif.title}
                            </p>
                            <span className="text-[10px] text-slate-400 shrink-0">{notif.time}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5 leading-snug">
                            {notif.description}
                          </p>
                        </div>
                        <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 mt-2"></span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 2. Bouton [⚙️ Paramètres] */}
          <button
            type="button"
            onClick={() => {
              if (setActiveTab) setActiveTab('parametres');
              if (onNavigate) onNavigate('/parametres', 'parametres');
              setIsUserMenuOpen(false);
              setIsNotifOpen(false);
            }}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
              activeTab === 'parametres'
                ? 'bg-sage-soft text-primary ring-2 ring-primary/40 shadow-xs font-bold'
                : 'bg-canvas-slate hover:bg-sage-soft/70 text-on-surface-variant hover:text-primary border border-border-subtle shadow-xs'
            }`}
            title="Paramètres & Préférences"
            aria-label="Paramètres & Préférences"
          >
            <span className="material-symbols-outlined text-[19px]">settings</span>
          </button>

          {/* 3. Bouton [📊 Statistiques] */}
          <button
            type="button"
            onClick={() => {
              if (setActiveTab) setActiveTab('statistiques');
              if (onNavigate) onNavigate('/statistiques', 'statistiques');
              setIsUserMenuOpen(false);
              setIsNotifOpen(false);
            }}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
              activeTab === 'statistiques'
                ? 'bg-sage-soft text-primary ring-2 ring-primary/40 shadow-xs font-bold'
                : 'bg-canvas-slate hover:bg-sage-soft/70 text-on-surface-variant hover:text-primary border border-border-subtle shadow-xs'
            }`}
            title="Statistiques & Finances"
            aria-label="Statistiques & Finances"
          >
            <span className="material-symbols-outlined text-[19px]">bar_chart</span>
          </button>

          {/* 4. Bouton [👤 Profil] avec menu déroulant */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => {
                setIsUserMenuOpen(!isUserMenuOpen);
                setIsNotifOpen(false);
              }}
              className="w-9 h-9 rounded-full bg-primary hover:bg-primary-container text-white flex items-center justify-center ring-2 ring-primary/20 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              title="Menu profil"
              aria-label="Menu profil"
            >
              <span className="material-symbols-outlined text-[18px]">person</span>
            </button>

            {/* User Profile Dropdown Menu */}
            {isUserMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl bg-white shadow-xl border border-border-subtle py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-4 py-2 border-b border-slate-100">
                  <p className="text-xs text-on-surface-variant">Connecté en tant que</p>
                  <p className="font-bold text-sm text-emerald-950 truncate">{displayName}</p>
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
            {/* Bouton Notifications dans le menu mobile */}
            <button
              type="button"
              onClick={() => {
                setIsMobileMenuOpen(false);
                setIsNotifOpen(true);
              }}
              className="p-3 rounded-xl text-left font-label-md text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer text-on-surface hover:bg-canvas-slate"
            >
              <span className="material-symbols-outlined text-[18px] text-outline">
                notifications
              </span>
              <span className="truncate">Notifications {unreadCount > 0 ? `(${unreadCount})` : ''}</span>
            </button>
            {/* Bouton Paramètres dans le menu mobile */}
            <button
              type="button"
              onClick={() => {
                setIsMobileMenuOpen(false);
                if (setActiveTab) setActiveTab('parametres');
                if (onNavigate) onNavigate('/parametres', 'parametres');
              }}
              className={`p-3 rounded-xl text-left font-label-md text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'parametres'
                  ? 'bg-sage-soft text-primary font-bold shadow-xs'
                  : 'text-on-surface hover:bg-canvas-slate'
              }`}
            >
              <span className={`material-symbols-outlined text-[18px] ${activeTab === 'parametres' ? 'text-primary' : 'text-outline'}`}>
                settings
              </span>
              <span className="truncate">Paramètres</span>
            </button>
            {/* Bouton Statistiques dans le menu mobile */}
            <button
              type="button"
              onClick={() => {
                setIsMobileMenuOpen(false);
                if (setActiveTab) setActiveTab('statistiques');
                if (onNavigate) onNavigate('/statistiques', 'statistiques');
              }}
              className={`p-3 rounded-xl text-left font-label-md text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'statistiques'
                  ? 'bg-sage-soft text-primary font-bold shadow-xs'
                  : 'text-on-surface hover:bg-canvas-slate'
              }`}
            >
              <span className={`material-symbols-outlined text-[18px] ${activeTab === 'statistiques' ? 'text-primary' : 'text-outline'}`}>
                bar_chart
              </span>
              <span className="truncate">Statistiques</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
