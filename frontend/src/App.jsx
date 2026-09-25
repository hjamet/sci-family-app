import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Header from './components/Header';
import LoginPage from './components/LoginPage';
import DashboardPage from './components/DashboardPage';
import ReservationsPage from './components/ReservationsPage';
import TasksPage from './components/TasksPage';
import ProjectsPage from './components/ProjectsPage';
import AdminPage from './components/AdminPage';
import VademecumPage from './components/VademecumPage';
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
    if (path === '/reservations') return 'reservations';
    if (path === '/tasks') return 'tasks';
    if (path === '/votes') return 'votes';
    if (path === '/admin') return 'admin';
    if (path === '/vademecum') return 'vademecum';
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
      reservations: '/reservations',
      tasks: '/tasks',
      votes: '/votes',
      admin: '/admin',
      vademecum: '/vademecum',
    };
    const targetPath = routeMap[tabId] || '/';
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
        onNavigate={(path, tabId) => handleTabChange(tabId)}
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
              <ReservationsPage
                properties={properties}
                currentUser={currentUser}
              />
            }
          />
          <Route
            path="/tasks"
            element={
              <TasksPage
                currentUser={currentUser}
              />
            }
          />
          <Route
            path="/votes"
            element={
              <ProjectsPage
                properties={properties}
                currentUser={currentUser}
              />
            }
          />
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

      {/* Minimalist Signature Footer */}
      <footer className="border-t border-border-subtle bg-surface-container-lowest py-6 mt-12 transition-colors">
        <div className="max-w-[1360px] mx-auto px-gutter text-center text-xs text-on-surface-variant flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© 2026 SCI Familiale Hellenvilliers — Portail des 7 membres associés du Domaine d'Hellenvilliers.</p>
          <div className="flex items-center space-x-3 text-xs">
            <span className="font-semibold text-emerald-800">Viva Hellenvilliers !!</span>
            <span>•</span>
            <span>FastAPI & Supabase • React & Vite</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
