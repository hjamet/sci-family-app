import React, { useState, useEffect } from 'react';
import { AlertCircle, X } from 'lucide-react';
import Header from './components/Header';
import LoginPage from './components/LoginPage';
import DashboardPage from './components/DashboardPage';
import VademecumPage from './components/VademecumPage';
import ProjectsPage from './components/ProjectsPage';
import ReservationsPage from './components/ReservationsPage';
import AdminPage from './components/AdminPage';
import TasksPage from './components/TasksPage';
import TestStudioPage from './components/TestStudioPage';
import NewProjectModal from './components/NewProjectModal';
import BookingModal from './components/BookingModal';
import VademecumModal from './components/VademecumModal';
import {
  fetchProjects, fetchReservations, fetchVademecum, fetchProperties, createProject
} from './api';

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('sci_token') || null);
  const [currentUser, setCurrentUser] = useState(() => localStorage.getItem('sci_user') || null);
  const [activeTab, setActiveTab] = useState('home'); // 'home' | 'tasks' | 'votes' | 'vademecum' | 'signalements' | 'reservations' | 'admin'

  const [properties, setProperties] = useState([]);
  const [projects, setProjects] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [vademecumItems, setVademecumItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState(null);

  // Modals state
  const [isVademecumOpen, setIsVademecumOpen] = useState(false);
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [isBookingOpen, setIsBookingOpen] = useState(false);

  // Force Light Theme across the entire application
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('sci_theme', 'light');
  }, []);

  const loadData = async () => {
    if (!token) return;
    try {
      setLoading(true);
      setApiError(null);
      const [propsData, projData, resData, vadeData] = await Promise.all([
        fetchProperties(),
        fetchProjects(),
        fetchReservations(),
        fetchVademecum()
      ]);
      setProperties(propsData);
      setProjects(projData);
      setReservations(resData);
      setVademecumItems(vadeData);
    } catch (err) {
      console.error('Erreur lors du chargement des données SCI:', err);
      const msg = err.message || 'Erreur d\'accès à l\'API ou aux services ViCare.';
      setApiError(msg);
      // If unauthorized token error, clear session
      if (msg.includes('Jeton') || msg.includes('401') || msg.includes('unauthorized')) {
        handleLogout();
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      loadData();
    }
  }, [token]);

  const handleLoginSuccess = async ({ token: newToken, user: newUser }) => {
    const userPrenom = typeof newUser === 'string' ? newUser : (newUser?.prenom || newUser?.name || 'Membre');
    localStorage.setItem('sci_token', newToken);
    localStorage.setItem('sci_user', userPrenom);
    setToken(newToken);
    setCurrentUser(userPrenom);
    setActiveTab('home');
    setApiError(null);
    // Synchronously reload app data after setting credentials
    try {
      setLoading(true);
      const [propsData, projData, resData, vadeData] = await Promise.all([
        fetchProperties(),
        fetchProjects(),
        fetchReservations(),
        fetchVademecum()
      ]);
      setProperties(propsData);
      setProjects(projData);
      setReservations(resData);
      setVademecumItems(vadeData);
    } catch (err) {
      console.error('Erreur après la connexion:', err);
      setApiError(err.message || 'Erreur lors du rechargement des données.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('sci_token');
    localStorage.removeItem('sci_user');
    setToken(null);
    setCurrentUser(null);
    setApiError(null);
  };

  const handleCreateProject = async (projectData) => {
    try {
      await createProject(projectData);
      await loadData();
    } catch (err) {
      console.error('Erreur création projet:', err);
      setApiError(err.message || 'Erreur lors de la création du projet.');
    }
  };

  const handleBookStay = async () => {
    try {
      await loadData();
    } catch (err) {
      console.error('Erreur réservation:', err);
      setApiError(err.message || 'Erreur lors de la réservation.');
    }
  };

  // If no token is present, display dedicated LoginPage view
  if (!token) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans transition-colors duration-200">
      
      {/* Header / Top Navigation Bar */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      {/* Main Content Area with Dedicated Page Views */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Transparent Red Error Banner for API or ViCare Failures */}
        {apiError && (
          <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium flex items-center justify-between shadow-sm animate-in fade-in duration-200">
            <div className="flex items-center space-x-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <span>{apiError}</span>
            </div>
            <button
              onClick={() => setApiError(null)}
              className="p-1 hover:bg-red-100 rounded-lg transition text-slate-500 hover:text-red-700"
              title="Fermer l'alerte"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {loading && (properties.length === 0 && projects.length === 0) ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-3">
            <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-semibold text-slate-500">Chargement de Viva Hellenvilliers...</p>
          </div>
        ) : (
          <>
            {activeTab === 'home' && (
              <DashboardPage
                currentUser={currentUser}
                setActiveTab={setActiveTab}
                onOpenNewProject={() => setIsNewProjectOpen(true)}
                onOpenBooking={() => setIsBookingOpen(true)}
              />
            )}

            {(activeTab === 'tasks' || activeTab === 'stay_tasks') && (
              <TasksPage currentUser={currentUser} />
            )}

            {(activeTab === 'votes' || activeTab === 'projects_vote' || activeTab === 'signalements') && (
              <ProjectsPage
                properties={properties}
                currentUser={currentUser}
              />
            )}

            {activeTab === 'vademecum' && (
              <VademecumPage
                properties={properties}
                currentUser={currentUser}
              />
            )}

            {activeTab === 'reservations' && (
              <ReservationsPage
                properties={properties}
                currentUser={currentUser}
              />
            )}

            {activeTab === 'admin' && (
              <AdminPage currentUser={currentUser} />
            )}

            {(activeTab === 'lab' || activeTab === 'test_studio') && (
              <TestStudioPage currentUser={currentUser} />
            )}
          </>
        )}
      </main>

      {/* Global Modals */}
      <VademecumModal
        isOpen={isVademecumOpen}
        onClose={() => setIsVademecumOpen(false)}
        vademecumItems={vademecumItems}
        currentUser={currentUser}
        reservations={reservations}
      />

      <NewProjectModal
        isOpen={isNewProjectOpen}
        onClose={() => setIsNewProjectOpen(false)}
        properties={properties}
        currentUser={currentUser}
        onSubmit={handleCreateProject}
      />

      <BookingModal
        isOpen={isBookingOpen}
        onClose={() => setIsBookingOpen(false)}
        properties={properties}
        currentUser={currentUser}
        onBooked={handleBookStay}
      />

      {/* Modern Minimalist Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12 transition-colors">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>© 2026 SCI Familiale Hellenvilliers — Portail des 7 membres associés.</p>
          <div className="flex items-center space-x-3">
            <span className="font-semibold text-emerald-600">Viva Hellenvilliers !!</span>
            <span>•</span>
            <span>FastAPI + React</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
