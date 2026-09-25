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
import BookingModal from './components/BookingModal';
import { fetchProperties } from './api';

export default function App() {
  const { isAuthenticated, currentUser, logout, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [properties, setProperties] = useState([]);
  const [isBookingOpen, setIsBookingOpen] = useState(false);

  // Sync active tab with current location pathname
  const getActiveTabFromPath = (path) => {
    if (path === '/reservations' || path === '/calendrier') return 'calendrier';
    if (path === '/tasks' || path === '/taches' || path === '/votes' || path === '/projets') return 'tasks';
    if (path === '/admin') return 'admin';
    if (path === '/vademecum' || path === '/sejour') return 'sejour';
    if (path === '/energie' || path === '/chauffage') return 'energie';
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
      <Routes>
        <Route path="/login" element={<LoginPage onLoginSuccess={handleLoginSuccess} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <div className="min-h-screen bg-canvas-slate text-on-surface flex flex-col font-sans selection:bg-emerald-100 selection:text-emerald-900 transition-colors duration-200">
      
      {/* Persistent Stitch Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        currentUser={currentUser}
        onLogout={logout}
        onNavigate={(path, tabId) => handleTabChange(tabId || path)}
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
              />
            }
          />
          <Route
            path="/sejour"
            element={
              <VademecumPage
                properties={properties}
                currentUser={currentUser}
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

    </div>
  );
}
