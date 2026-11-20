import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Header from './components/Header';
import LoginPage from './components/LoginPage';
import DashboardPage from './components/DashboardPage';
import CalendarPage from './pages/CalendarPage';
import TasksPage from './pages/TasksPage';
import ProjectsPage from './components/ProjectsPage';
import AdminPage from './components/AdminPage';
import VademecumPage from './components/VademecumPage';
import SettingsPage from './pages/SettingsPage';
import StatistiquesPage from './pages/StatistiquesPage';
import ToasterPage from './pages/ToasterPage';
import BookingModal from './components/BookingModal';
import VoteRoofModal from './components/VoteRoofModal';
import TaskDetailModal from './components/TaskDetailModal';
import BugReportButton from './components/BugReportButton';
import PwaInstallBanner from './components/PwaInstallBanner';
import EmailPreviewModal from './components/EmailPreviewModal';
import WelcomeOnboardingModal from './components/WelcomeOnboardingModal';
import { fetchProperties, fetchProjects, fetchTaskById, castProjectVote, getCachedData, fetchCurrentOnboarding } from './api';
import GlobalErrorAlert from './components/GlobalErrorAlert';

export default function App() {
  const { isAuthenticated, currentUser, logout, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [properties, setProperties] = useState(() => getCachedData('properties') || []);
  const [isBookingOpen, setIsBookingOpen] = useState(false);

  // Modale globale de prévisualisation des emails simulés / envoyés
  const [previewEmail, setPreviewEmail] = useState(null);

  // Modales globales pour ouverture directe depuis les notifications (Annotation UI)
  const [isVoteModalOpen, setIsVoteModalOpen] = useState(false);
  const [activeVoteProject, setActiveVoteProject] = useState(null);

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [activeTask, setActiveTask] = useState(null);

  // Onboarding & Patch Notes évolutifs
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [onboardingData, setOnboardingData] = useState(null);

  const handleOpenVoteModal = async (projectId, projectData) => {
    if (projectData && (projectData.title || projectData.id)) {
      setActiveVoteProject(projectData);
      setIsVoteModalOpen(true);
      return;
    }

    try {
      const allProjects = await fetchProjects();
      let matched = null;
      if (Array.isArray(allProjects)) {
        if (projectId && projectId !== 'roof') {
          matched = allProjects.find((p) => String(p.id) === String(projectId));
        }
        if (!matched) {
          matched = allProjects.find((p) => p.status === 'EN_VOTE' || p.status === 'SOUMIS');
        }
      }
      if (matched) {
        setActiveVoteProject(matched);
        setIsVoteModalOpen(true);
      } else {
        navigate('/taches');
      }
    } catch {
      navigate('/taches');
    }
  };

  const handleOpenTaskModal = async (taskId, taskData) => {
    if (taskData && taskData.title) {
      setActiveTask(taskData);
      setIsTaskModalOpen(true);
      return;
    }

    if (taskId) {
      try {
        const fullTask = await fetchTaskById(taskId);
        if (fullTask) {
          setActiveTask(fullTask);
          setIsTaskModalOpen(true);
          return;
        }
      } catch (err) {
        console.warn('Erreur chargement tâche par ID:', err);
      }
    }

    navigate('/taches');
  };

  // Sync active tab with current location pathname (Mr. Collins est désormais la page par défaut la plus à gauche)
  const getActiveTabFromPath = (path) => {
    if (path === '/' || path === '/grille-pain' || path === '/mr-collins') return 'mr-collins';
    if (path === '/tableau-de-bord' || path === '/dashboard') return 'home';
    if (path === '/reservations' || path === '/calendrier') return 'calendrier';
    if (path === '/tasks' || path === '/taches' || path === '/votes' || path === '/projets') return 'tasks';
    if (path === '/admin') return 'admin';
    if (path === '/vademecum' || path === '/sejour' || path === '/energie' || path === '/chauffage') return 'sejour';
    if (path === '/parametres' || path === '/settings') return 'parametres';
    if (path === '/statistiques' || path === '/stats') return 'statistiques';
    return 'mr-collins';
  };

  const activeTab = getActiveTabFromPath(location.pathname);

  useEffect(() => {
    if (isAuthenticated) {
      fetchProperties()
        .then(setProperties)
        .catch((err) => console.warn('Properties load fallback:', err.message));

      // Vérification auto-affichage du guide d'onboarding / patch notes
      fetchCurrentOnboarding()
        .then((data) => {
          if (data && data.release) {
            setOnboardingData(data);
            if (data.needs_display) {
              setIsOnboardingOpen(true);
            }
          }
        })
        .catch((err) => console.warn('Onboarding check fallback:', err.message));
    }
  }, [isAuthenticated]);

  const handleOpenOnboarding = useCallback(async (targetVersion = null, directData = null) => {
    if (directData && directData.release && directData.pages && directData.pages.length > 0) {
      setOnboardingData(directData);
      setIsOnboardingOpen(true);
      return;
    }
    try {
      const fresh = await fetchCurrentOnboarding(targetVersion);
      if (fresh && fresh.release) {
        setOnboardingData(fresh);
      }
    } catch (err) {
      console.warn('Erreur chargement version onboarding:', err);
    }
    setIsOnboardingOpen(true);
  }, []);

  useEffect(() => {
    const handleGlobalOpen = (e) => {
      const version = e?.detail?.version || null;
      let directData = null;
      if (e?.detail?.release) {
        let pages = e.detail.pages;
        if (!pages && e.detail.release.pages_json) {
          try {
            pages = typeof e.detail.release.pages_json === 'string'
              ? JSON.parse(e.detail.release.pages_json)
              : e.detail.release.pages_json;
          } catch {
            pages = null;
          }
        }
        if (pages && Array.isArray(pages) && pages.length > 0) {
          directData = {
            release: e.detail.release,
            pages,
            has_seen: true,
            needs_display: false
          };
        }
      }
      handleOpenOnboarding(version, directData);
    };

    window.addEventListener('open-onboarding', handleGlobalOpen);
    return () => window.removeEventListener('open-onboarding', handleGlobalOpen);
  }, [handleOpenOnboarding]);

  const handleTabChange = (tabId) => {
    const routeMap = {
      'mr-collins': '/',
      'grille-pain': '/',
      toaster: '/',
      assistant: '/',
      home: '/tableau-de-bord',
      dashboard: '/tableau-de-bord',
      'tableau-de-bord': '/tableau-de-bord',
      reservations: '/calendrier',
      calendrier: '/calendrier',
      tasks: '/taches',
      taches: '/taches',
      votes: '/taches',
      projets: '/taches',
      admin: '/admin',
      vademecum: '/sejour',
      sejour: '/sejour',
      energie: '/sejour',
      chauffage: '/sejour',
      parametres: '/parametres',
      settings: '/parametres',
      statistiques: '/statistiques',
      stats: '/statistiques',
    };
    const targetPath = routeMap[tabId] || (typeof tabId === 'string' && tabId.startsWith('/') ? tabId : '/');
    navigate(targetPath);
  };

  const handleLoginSuccess = async ({ token, user }) => {
    let targetAfterLogin = '/';
    try {
      const savedRedirect = sessionStorage.getItem('sci_post_login_redirect');
      if (savedRedirect && savedRedirect.startsWith('/') && !savedRedirect.startsWith('/login')) {
        targetAfterLogin = savedRedirect;
        sessionStorage.removeItem('sci_post_login_redirect');
      }
    } catch (_) {}
    if (token) {
      localStorage.setItem('sci_token', token);
      const userPrenom = typeof user === 'string'
        ? user
        : (user?.prenom || user?.name || 'Membre');
      localStorage.setItem('sci_user', userPrenom);
      if (login) {
        await login(user, token);
      }
    }
    navigate(targetAfterLogin, { replace: true });
  };

  // Login Route handling
  if (!isAuthenticated) {
    if (location.pathname && location.pathname !== '/' && location.pathname !== '/login') {
      try {
        sessionStorage.setItem('sci_post_login_redirect', `${location.pathname}${location.search || ''}`);
      } catch (_) {}
    }
    return (
      <>
        <GlobalErrorAlert />
        <PwaInstallBanner />
        <Routes>
          <Route path="/login" element={<LoginPage onLoginSuccess={handleLoginSuccess} />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </>
    );
  }

  const isGrillePainRoute =
    location.pathname === '/' ||
    location.pathname === '/grille-pain' ||
    location.pathname === '/mr-collins';

  return (
    <div
      className={`${
        isGrillePainRoute ? 'h-[100dvh] overflow-hidden' : 'min-h-screen'
      } bg-canvas-slate text-on-surface flex flex-col font-sans selection:bg-emerald-100 selection:text-emerald-900 transition-colors duration-200`}
    >
      <GlobalErrorAlert />
      
      {/* Persistent Stitch Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        currentUser={currentUser}
        onLogout={logout}
        onNavigate={(path, tabId) => handleTabChange(tabId || path)}
        onOpenVoteModal={handleOpenVoteModal}
        onOpenTaskModal={handleOpenTaskModal}
        onOpenBookingModal={() => setIsBookingOpen(true)}
        onViewEmail={(email) => setPreviewEmail(email)}
        onOpenOnboardingModal={handleOpenOnboarding}
      />

      {/* Main Container (Annotation 4 : hauteur fixe viewport sur /grille-pain afin que seul le chat scrolle et l'input reste ancré en bas) */}
      <main
        className={
          isGrillePainRoute
            ? 'flex-1 min-h-0 max-w-[1360px] w-full mx-auto px-gutter pt-3 pb-3 flex flex-col overflow-hidden'
            : 'flex-1 max-w-[1360px] w-full mx-auto px-gutter pt-6'
        }
      >
        <Routes>
          <Route
            path="/"
            element={
              <ToasterPage
                currentUser={currentUser}
              />
            }
          />
          <Route
            path="/mr-collins"
            element={
              <ToasterPage
                currentUser={currentUser}
              />
            }
          />
          <Route
            path="/tableau-de-bord"
            element={
              <DashboardPage
                currentUser={currentUser}
                setActiveTab={handleTabChange}
                onOpenBooking={() => setIsBookingOpen(true)}
              />
            }
          />
          <Route
            path="/dashboard"
            element={
              <DashboardPage
                currentUser={currentUser}
                setActiveTab={handleTabChange}
                onOpenBooking={() => setIsBookingOpen(true)}
              />
            }
          />
          <Route
            path="/reservations"
            element={
              <CalendarPage
                properties={properties}
                currentUser={currentUser}
              />
            }
          />
          <Route
            path="/calendrier"
            element={
              <CalendarPage
                properties={properties}
                currentUser={currentUser}
              />
            }
          />
          <Route path="/tasks" element={<Navigate to="/taches" replace />} />
          <Route
            path="/taches"
            element={
              <TasksPage
                currentUser={currentUser}
              />
            }
          />
          <Route path="/votes" element={<Navigate to="/taches" replace />} />
          <Route path="/projets" element={<Navigate to="/taches" replace />} />
          <Route
            path="/admin"
            element={
              <AdminPage
                currentUser={currentUser}
              />
            }
          />
          <Route
            path="/vademecum"
            element={
              <VademecumPage
                properties={properties}
                currentUser={currentUser}
                onOpenBooking={() => setIsBookingOpen(true)}
              />
            }
          />
          <Route
            path="/sejour"
            element={
              <VademecumPage
                properties={properties}
                currentUser={currentUser}
                onOpenBooking={() => setIsBookingOpen(true)}
              />
            }
          />
          <Route path="/energie" element={<Navigate to="/sejour" replace />} />
          <Route path="/chauffage" element={<Navigate to="/sejour" replace />} />
          <Route
            path="/parametres"
            element={
              <SettingsPage
                currentUser={currentUser}
              />
            }
          />
          <Route path="/settings" element={<Navigate to="/parametres" replace />} />
          <Route
            path="/statistiques"
            element={
              <StatistiquesPage
                currentUser={currentUser}
                onOpenOnboardingModal={handleOpenOnboarding}
              />
            }
          />
          <Route path="/stats" element={<Navigate to="/statistiques" replace />} />
          <Route
            path="/grille-pain"
            element={
              <ToasterPage
                currentUser={currentUser}
              />
            }
          />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Global Booking Modal */}
      <BookingModal
        isOpen={isBookingOpen}
        onClose={() => setIsBookingOpen(false)}
        properties={properties}
        currentUser={currentUser}
      />

      {/* Global Vote Roof Modal (Ouverture directe par-dessus la page active depuis les notifications) */}
      <VoteRoofModal
        isOpen={isVoteModalOpen}
        onClose={() => {
          setIsVoteModalOpen(false);
          setActiveVoteProject(null);
        }}
        currentUser={currentUser}
        project={activeVoteProject}
        onVoteSubmit={async (voteData) => {
          try {
            const projId = activeVoteProject?.id || 1;
            await castProjectVote(projId, voteData);
          } catch (err) {
            console.warn('Erreur soumission vote modal global:', err);
          }
        }}
      />

      {/* Global Task Detail Modal (Ouverture directe par-dessus la page active depuis les notifications) */}
      {isTaskModalOpen && (
        <TaskDetailModal
          isOpen={isTaskModalOpen}
          task={activeTask}
          isEditing={false}
          initialMode="view"
          onClose={() => {
            setIsTaskModalOpen(false);
            setActiveTask(null);
          }}
          currentUser={currentUser}
          onTaskUpdated={() => {}}
        />
      )}

      {/* Notification d'installation PWA Chrome/Edge (Android, PC, Mac) & iOS Safari */}
      <PwaInstallBanner />

      {/* Bouton Bug Reporter ultra-rapide permanent */}
      <BugReportButton currentUser={currentUser} />

      {/* Modale d'aperçu du rendu HTML de l'e-mail */}
      <EmailPreviewModal
        isOpen={Boolean(previewEmail)}
        email={previewEmail}
        onClose={() => setPreviewEmail(null)}
      />

      {/* Modale d'Onboarding Multi-Pages & Patch Notes Évolutifs */}
      <WelcomeOnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        release={onboardingData?.release}
        pages={onboardingData?.pages || []}
        onAcknowledged={(version) => {
          setOnboardingData((prev) =>
            prev ? { ...prev, has_seen: true, needs_display: false } : prev
          );
        }}
      />

    </div>
  );
}
