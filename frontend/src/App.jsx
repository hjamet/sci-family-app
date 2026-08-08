import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import DashboardPage from './components/DashboardPage';
import VademecumPage from './components/VademecumPage';
import ProjectsPage from './components/ProjectsPage';
import ReservationsPage from './components/ReservationsPage';
import AdminPage from './components/AdminPage';
import NewProjectModal from './components/NewProjectModal';
import BookingModal from './components/BookingModal';
import VademecumModal from './components/VademecumModal';
import {
  fetchProjects, fetchReservations, fetchVademecum, fetchProperties, createProject
} from './api';

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => localStorage.getItem('sci_user') || 'Henri');
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('sci_theme') === 'dark');
  const [activeTab, setActiveTab] = useState('home'); // 'home' | 'vademecum' | 'signalements' | 'reservations' | 'admin'

  const [properties, setProperties] = useState([]);
  const [projects, setProjects] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [vademecumItems, setVademecumItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [isVademecumOpen, setIsVademecumOpen] = useState(false);
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [isBookingOpen, setIsBookingOpen] = useState(false);

  // Theme effect
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('sci_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('sci_theme', 'light');
    }
  }, [isDarkMode]);

  const loadData = async () => {
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
      console.error('Error loading SCI app data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateProject = async (projectData) => {
    await createProject(projectData);
    await loadData();
  };

  const handleBookStay = async () => {
    await loadData();
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      
      {/* Header / Top Navigation Bar */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        setCurrentUser={setCurrentUser}
        onOpenNewProject={() => setIsNewProjectOpen(true)}
        onOpenBooking={() => setIsBookingOpen(true)}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
      />

      {/* Main Content Area with Dedicated Page Views */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-3">
            <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Chargement de Viva Hellenvilliers...</p>
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

            {activeTab === 'vademecum' && (
              <VademecumPage
                properties={properties}
                currentUser={currentUser}
              />
            )}

            {activeTab === 'signalements' && (
              <ProjectsPage
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
              <AdminPage />
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
      <footer className="border-t border-slate-200/80 dark:border-slate-900 bg-white dark:bg-slate-950 py-6 mt-12 transition-colors">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-slate-500 dark:text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>© 2026 SCI Familiale Hellenvilliers — Portail des 7 membres associés.</p>
          <div className="flex items-center space-x-3">
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">Viva Hellenvilliers !!</span>
            <span>•</span>
            <span>FastAPI + React</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
