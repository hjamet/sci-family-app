import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  fetchNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  fetchProjects,
  fetchTasks,
  fetchReservations,
  fetchPiscineStatus
} from '../api';

function formatRelativeTime(dateString) {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return 'À l\'instant';
    if (diffMins < 60) return `${diffMins} min`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} h`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays} j`;
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  } catch {
    return dateString;
  }
}

export default function NotificationBell({
  currentUser,
  onViewEmail,
  onOpenVoteModal,
  onOpenTaskModal,
  onOpenBookingModal,
  onNavigate,
  setActiveTab
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);

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

  const [localReadIds, setLocalReadIds] = useState(() => {
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

  const persistLocalReadIds = (newIds) => {
    setLocalReadIds(newIds);
    try {
      const key = getStorageKey(currentUser);
      localStorage.setItem(key, JSON.stringify(newIds));
    } catch (err) {
      console.warn('Erreur persistance notifications lues:', err);
    }
  };

  // Chargement principal des notifications (backend DB + dynamic fallbacks)
  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true);
      // 1. Récupération des notifications persistées en base
      let backendNotifs = [];
      try {
        const res = await fetchNotifications();
        if (Array.isArray(res)) {
          backendNotifs = res;
        }
      } catch (err) {
        console.warn('Fallback notifications DB:', err.message);
      }

      // 2. Récupération des éléments dynamiques pour compléter (projets actifs, tâches assignées)
      const [projRes, taskRes, resRes] = await Promise.allSettled([
        fetchProjects(),
        fetchTasks(),
        fetchReservations(),
      ]);

      const dynamicNotifs = [];
      const userFirst = typeof currentUser === 'string'
        ? currentUser.split(' ')[0]
        : (currentUser?.prenom || 'Henri');

      // Projets en cours de vote non déjà dans backendNotifs
      if (projRes.status === 'fulfilled' && Array.isArray(projRes.value)) {
        projRes.value
          .filter((p) => p.status === 'voting' || p.status === 'open' || p.is_voting || p.status === 'EN_VOTE')
          .forEach((p) => {
            const exists = backendNotifs.some(
              (n) => n.link_id === String(p.id) && (n.type === 'vote' || n.type === 'project')
            );
            if (!exists) {
              dynamicNotifs.push({
                id: `dyn-vote-${p.id}`,
                title: `Scrutin ouvert : ${p.title}`,
                description: p.description ? p.description.slice(0, 80) + '...' : 'Votre vote d\'associé est requis.',
                type: 'vote',
                link_id: p.id,
                projectId: p.id,
                project: p,
                link_path: '/taches',
                created_at: p.created_at || new Date().toISOString(),
                is_read: false
              });
            }
          });
      }

      // Tâches assignées non résolues
      if (taskRes.status === 'fulfilled' && Array.isArray(taskRes.value)) {
        taskRes.value
          .filter((t) => {
            if (t.status === 'DONE' || t.status === 'VALIDE') return false;
            const assigned = Array.isArray(t.assigned_members) ? t.assigned_members.join(' ') : String(t.responsible || '');
            return assigned.toLowerCase().includes(userFirst.toLowerCase()) || t.priority === 'URGENT';
          })
          .slice(0, 3)
          .forEach((t) => {
            const exists = backendNotifs.some((n) => n.link_id === String(t.id) && n.type === 'task');
            if (!exists) {
              dynamicNotifs.push({
                id: `dyn-task-${t.id}`,
                title: `${t.priority === 'URGENT' ? '🚨 ' : ''}${t.title}`,
                description: t.description ? t.description.slice(0, 80) + '...' : 'Mission en attente d\'action.',
                type: 'task',
                link_id: t.id,
                taskId: t.id,
                task: t,
                link_path: '/taches',
                created_at: t.created_at || new Date().toISOString(),
                is_read: false
              });
            }
          });
      }

      // Séjours imminents
      if (resRes.status === 'fulfilled' && Array.isArray(resRes.value)) {
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
            const exists = backendNotifs.some((n) => n.link_id === String(r.id) && n.type === 'booking');
            if (!exists) {
              dynamicNotifs.push({
                id: `dyn-res-${r.id}`,
                title: `Séjour : ${r.house === 'rosing' ? 'Villa Rosing' : 'Presbytère'}`,
                description: `Du ${r.start_date} au ${r.end_date} (${r.status || 'Confirmé'}).`,
                type: 'booking',
                link_id: r.id,
                reservation: r,
                link_path: '/calendrier',
                created_at: r.created_at || new Date().toISOString(),
                is_read: false
              });
            }
          });
      }

      // Fusion et déduplication
      const allCombined = [...backendNotifs, ...dynamicNotifs];
      setNotifications(allCombined);
    } catch (err) {
      console.warn('Erreur chargement notifications globales:', err);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 45000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  // Écoute de l'événement global email-dispatched pour affichage temps réel dans la cloche (Annotation 13)
  useEffect(() => {
    const handleEmailDispatched = (event) => {
      const email = event.detail;
      if (!email) return;

      const newNotif = {
        id: `email-dispatch-${email.id || Date.now()}`,
        title: email.subject || 'Nouvel e-mail envoyé',
        description: `Notification e-mail transmise à : ${(email.recipients_names || email.recipients || []).join(', ') || 'famille'}.`,
        type: 'email',
        email_entry: email,
        email: email,
        created_at: email.created_at || new Date().toISOString(),
        is_read: false,
        link_path: null
      };

      setNotifications((prev) => [newNotif, ...prev.filter((n) => n.id !== newNotif.id)]);
      // Re-synchronisation douce avec le backend
      setTimeout(loadNotifications, 2000);
    };

    window.addEventListener('email-dispatched', handleEmailDispatched);
    return () => {
      window.removeEventListener('email-dispatched', handleEmailDispatched);
    };
  }, [loadNotifications]);

  // Fermeture au clic extérieur ou touche Escape
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Décompte des notifications non lues
  const isNotifRead = (notif) => {
    if (notif.is_read) return true;
    if (localReadIds.includes(String(notif.id))) return true;
    return false;
  };

  const unreadNotifications = notifications.filter((n) => !isNotifRead(n));
  const unreadCount = unreadNotifications.length;

  const handleMarkAllAsRead = async (e) => {
    if (e) e.stopPropagation();
    try {
      await markAllNotificationsAsRead();
    } catch (err) {
      console.warn('Erreur markAllNotificationsAsRead API:', err);
    }
    const allIds = notifications.map((n) => String(n.id));
    const updated = Array.from(new Set([...localReadIds, ...allIds]));
    persistLocalReadIds(updated);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const handleNotificationClick = async (notif) => {
    // 1. Marquage comme lu local et distant
    if (!isNotifRead(notif)) {
      const updated = [...localReadIds, String(notif.id)];
      persistLocalReadIds(updated);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
      );
      if (typeof notif.id === 'number' || !isNaN(Number(notif.id))) {
        markNotificationAsRead(notif.id).catch(() => {});
      }
    }

    // 2. Fermer le popover
    setIsOpen(false);

    // 3. Ouvrir directement la modale associée
    if (notif.type === 'vote' || notif.type === 'project') {
      if (onOpenVoteModal) {
        onOpenVoteModal(notif.link_id || notif.projectId || notif.id, notif.project);
        return;
      }
    }

    if (notif.type === 'task') {
      if (onOpenTaskModal) {
        onOpenTaskModal(notif.link_id || notif.taskId || notif.id, notif.task);
        return;
      }
    }

    if (notif.type === 'booking' || notif.type === 'sejour') {
      if (onOpenBookingModal) {
        onOpenBookingModal();
        return;
      }
    }

    // 4. Si notification e-mail pure avec modal d'aperçu
    const emailData = notif.email || notif.email_entry;
    if (emailData && onViewEmail && notif.type === 'email') {
      onViewEmail(emailData);
      return;
    }

    // 5. Navigation de repli
    if (setActiveTab && (notif.tabId || notif.link_path)) {
      const tab = notif.tabId || notif.link_path.replace('/', '');
      setActiveTab(tab);
    }
    if (onNavigate && (notif.link_path || notif.path)) {
      onNavigate(notif.link_path || notif.path);
    }
  };

  const renderNotifIcon = (type) => {
    switch (type) {
      case 'vote':
      case 'project':
        return {
          icon: 'how_to_vote',
          bg: 'bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-300'
        };
      case 'task':
        return {
          icon: 'assignment_ind',
          bg: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300'
        };
      case 'booking':
      case 'sejour':
        return {
          icon: 'cottage',
          bg: 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300'
        };
      case 'thermal':
        return {
          icon: 'thermostat',
          bg: 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300'
        };
      case 'email':
        return {
          icon: 'mail',
          bg: 'bg-teal-100 text-teal-700 dark:bg-teal-900/60 dark:text-teal-300'
        };
      default:
        return {
          icon: 'notifications',
          bg: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
        };
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bouton Cloche avec Badge */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-9 h-9 rounded-full flex items-center justify-center transition-all relative cursor-pointer ${
          isOpen
            ? 'bg-sage-soft text-primary ring-2 ring-primary/40 shadow-xs font-bold'
            : 'bg-canvas-slate hover:bg-sage-soft/70 text-on-surface-variant hover:text-primary border border-border-subtle shadow-xs'
        }`}
        title="Notifications, Alertes & E-mails"
        aria-label="Notifications, Alertes & E-mails"
        aria-expanded={isOpen}
      >
        <span className="material-symbols-outlined text-[20px]">notifications</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 bg-amber-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-xs animate-pulse ring-2 ring-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Déroulant des Notifications */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-88 sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50 p-3 animate-in fade-in zoom-in-95 duration-150">
          {/* En-tête */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px] text-primary">notifications</span>
              <span className="font-bold text-xs text-slate-900 dark:text-slate-100">
                Notifications &amp; E-mails
              </span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 text-[10px] font-bold">
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllAsRead}
                className="text-[11px] font-semibold text-primary hover:text-primary-container dark:text-emerald-400 hover:underline cursor-pointer"
              >
                Tout marquer comme lu
              </button>
            )}
          </div>

          {/* Liste des Notifications */}
          <div className="flex flex-col gap-1.5 max-h-80 overflow-y-auto pr-1">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 px-4 text-center">
                <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-primary flex items-center justify-center mb-2 shadow-2xs">
                  <span className="material-symbols-outlined text-[20px]">done_all</span>
                </div>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Aucune notification
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Toutes vos alertes et votes sont à jour.
                </p>
              </div>
            ) : (
              notifications.map((notif) => {
                const isRead = isNotifRead(notif);
                const iconCfg = renderNotifIcon(notif.type);
                const emailData = notif.email || notif.email_entry;

                return (
                  <div
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className={`p-2.5 rounded-xl transition-all cursor-pointer flex items-start gap-2.5 border shadow-2xs group relative ${
                      isRead
                        ? 'bg-slate-50/60 dark:bg-slate-800/40 border-slate-100 dark:border-slate-800/60 opacity-80 hover:opacity-100'
                        : 'bg-emerald-50/80 dark:bg-emerald-950/30 hover:bg-emerald-100/80 dark:hover:bg-emerald-900/40 border-emerald-200/70 dark:border-emerald-800/50'
                    }`}
                  >
                    {/* Icône de type */}
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 transition-transform group-hover:scale-105 ${iconCfg.bg}`}
                    >
                      <span className="material-symbols-outlined text-[16px]">{iconCfg.icon}</span>
                    </div>

                    {/* Contenu principal */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p
                          className={`text-xs truncate font-bold text-slate-900 dark:text-slate-100 group-hover:text-primary transition-colors ${
                            !isRead ? 'text-primary dark:text-emerald-400' : ''
                          }`}
                        >
                          {notif.title}
                        </p>
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {formatRelativeTime(notif.created_at)}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2 mt-0.5 leading-snug">
                        {notif.description}
                      </p>
                    </div>

                    {/* Bouton Action E-mail direct (Annotation 13) */}
                    {emailData && onViewEmail && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewEmail(emailData);
                        }}
                        className="w-7 h-7 rounded-lg bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 hover:bg-teal-100 hover:text-teal-900 border border-teal-200 dark:border-teal-800 flex items-center justify-center shrink-0 transition-colors shadow-2xs cursor-pointer ml-0.5"
                        title="Consulter l'e-mail officiel dans la modale"
                        aria-label="Consulter l'e-mail"
                      >
                        <span className="material-symbols-outlined text-[15px]">mark_email_read</span>
                      </button>
                    )}

                    {/* Pastille non-lu */}
                    {!isRead && (
                      <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 mt-2"></span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
