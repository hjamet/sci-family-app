import React, { useState, useEffect } from 'react';
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
import HeatingPage from './pages/HeatingPage';
import SettingsPage from './pages/SettingsPage';
import StatistiquesPage from './pages/StatistiquesPage';
import BookingModal from './components/BookingModal';
import VoteRoofModal from './components/VoteRoofModal';
import TaskDetailModal from './components/TaskDetailModal';
import BugReportButton from './components/BugReportButton';
import { fetchProperties, fetchProjects, fetchTaskById, castProjectVote, getCachedData } from './api';
import GlobalErrorAlert from './components/GlobalErrorAlert';

export default function App() {
  const { isAuthenticated, currentUser, logout, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [properties, setProperties] = useState(() => getCachedData('properties') || []);
  const [isBookingOpen, setIsBookingOpen] = useState(false);

  // Modales globales pour ouverture directe depuis les notifications (Annotation UI)
  const [isVoteModalOpen, setIsVoteModalOpen] = useState(false);
  const [activeVoteProject, setActiveVoteProject] = useState(null);

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [activeTask, setActiveTask] = useState(null);
  const [isBugReportMode, setIsBugReportMode] = useState(false);
  const [tempUploadedDocIds, setTempUploadedDocIds] = useState([]);

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
    setIsBugReportMode(false);
    setTempUploadedDocIds([]);
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

  const handleOpenBugReport = ({ task: bugTask, tempUploadedDocIds: docIds }) => {
    setActiveTask(bugTask);
    setIsBugReportMode(true);
    setTempUploadedDocIds(docIds || []);
    setIsTaskModalOpen(true);
  };

  // Sync active tab with current location pathname
  const getActiveTabFromPath = (path) => {
    if (path === '/reservations' || path === '/calendrier') return 'calendrier';
    if (path === '/tasks' || path === '/taches' || path === '/votes' || path === '/projets') return 'tasks';
    if (path === '/admin') return 'admin';
    if (path === '/vademecum' || path === '/sejour') return 'sejour';
    if (path === '/energie' || path === '/chauffage') return 'energie';
    if (path === '/parametres' || path === '/settings') return 'parametres';
    if (path === '/statistiques' || path === '/stats') return 'statistiques';
    return 'home';
  };

  const activeTab = getActiveTabFromPath(location.pathname);

  useEffect(() => {
    if (isAuthenticated) {
      fetchProperties()
        .then(setProperties)
        .catch((err) => console.warn('Properties load fallback:', err.message));
    }
  }, [isAuthenticated]);

  const handleTabChange = (tabId) => {
    const routeMap = {
      home: '/',
      reservations: '/calendrier',
      calendrier: '/calendrier',
      tasks: '/taches',
      taches: '/taches',
      votes: '/taches',
      projets: '/taches',
      admin: '/admin',
      vademecum: '/sejour',
      sejour: '/sejour',
      energie: '/energie',
      chauffage: '/energie',
      parametres: '/parametres',
      settings: '/parametres',
      statistiques: '/statistiques',
      stats: '/statistiques',
    };
    const targetPath = routeMap[tabId] || (typeof tabId === 'string' && tabId.startsWith('/') ? tabId : '/');
    navigate(targetPath);
  };

  const handleLoginSuccess = async ({ token, user }) => {
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
    navigate('/');
  };

  // Login Route handling
  if (!isAuthenticated) {
    return (
      <>
        <GlobalErrorAlert />
        <Routes>
          <Route path="/login" element={<LoginPage onLoginSuccess={handleLoginSuccess} />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-canvas-slate text-on-surface flex flex-col font-sans selection:bg-emerald-100 selection:text-emerald-900 transition-colors duration-200">
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
      />

      {/* Main Container */}
      <main className="flex-1 max-w-[1360px] w-full mx-auto px-gutter pt-6">
        <Routes>
          <Route
            path="/"
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
          <Route
            path="/energie"
            element={
              <HeatingPage
                currentUser={currentUser}
              />
            }
          />
          <Route
            path="/chauffage"
            element={
              <HeatingPage
                currentUser={currentUser}
              />
            }
          />
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
              />
            }
          />
          <Route path="/stats" element={<Navigate to="/statistiques" replace />} />
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

      {/* Global Task Detail Modal (Ouverture directe par-dessus la page active depuis les notifications ou le Bug Reporter) */}
      {isTaskModalOpen && (
        <TaskDetailModal
          isOpen={isTaskModalOpen}
          task={activeTask}
          isEditing={isBugReportMode}
          initialMode={isBugReportMode ? 'edit' : 'view'}
          isBugReport={isBugReportMode}
          tempUploadedDocIds={tempUploadedDocIds}
          onClose={() => {
            setIsTaskModalOpen(false);
            setActiveTask(null);
            setIsBugReportMode(false);
            setTempUploadedDocIds([]);
          }}
          currentUser={currentUser}
          onTaskUpdated={() => {}}
        />
      )}

      {/* Bouton Bug Reporter permanent */}
      <BugReportButton
        currentUser={currentUser}
        onOpenBugReport={handleOpenBugReport}
      />

    </div>
  );
}
