import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import MemberStayTasksSection from './components/MemberStayTasksSection';
import StayBalanceWidget from './components/StayBalanceWidget';
import ProjectsSection from './components/ProjectsSection';
import LinearStaysSection from './components/LinearStaysSection';
import VademecumModal from './components/VademecumModal';
import NewProjectModal from './components/NewProjectModal';
import BookingModal from './components/BookingModal';
import {
  fetchProjects, fetchReservations, fetchVademecum, fetchProperties,
  createProject, createReservation
} from './api';
import { Home, Sparkles, CheckCircle2, Vote, Calendar, BookOpen, ShieldCheck } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => localStorage.getItem('sci_user') || 'Henri');
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('sci_theme') === 'dark');

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

  // Stats summary calculation
  const pendingVotesCount = projects.filter(p => p.status === 'EN_VOTE').length;
  const nextStay = reservations.find(r => r.status === 'Confirmée');

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      
      {/* Header / Top Bar */}
      <Header
        currentUser={currentUser}
        setCurrentUser={setCurrentUser}
        onOpenVademecum={() => setIsVademecumOpen(true)}
        onOpenNewProject={() => setIsNewProjectOpen(true)}
        onOpenBooking={() => setIsBookingOpen(true)}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-3">
            <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Chargement du portail SCI Familiale...</p>
          </div>
        ) : (
          <>
            {/* Top Section - "Mes Tâches pour ce Séjour" */}
            <MemberStayTasksSection currentUser={currentUser} />

            {/* SECTION 1: Fil des Incidents, Projets & Réparations */}
            <ProjectsSection
              projects={projects}
              currentUser={currentUser}
              onRefreshProjects={loadData}
              onOpenNewProject={() => setIsNewProjectOpen(true)}
            />

            {/* SECTION 2: Calendrier Linéaire des Prochains Séjours & Export iCal */}
            <LinearStaysSection
              reservations={reservations}
              onOpenBooking={() => setIsBookingOpen(true)}
            />

            {/* SECTION 3: Équilibrage des Séjours (Positioned lower down below main feed - Requirement 6) */}
            <StayBalanceWidget reservations={reservations} />
          </>
        )}

      </main>

      {/* Vademecum Centralisé Modal */}
      <VademecumModal
        isOpen={isVademecumOpen}
        onClose={() => setIsVademecumOpen(false)}
        vademecumItems={vademecumItems}
        currentUser={currentUser}
        reservations={reservations}
      />

      {/* New Issue / Idea Submission Modal (Requirement 2) */}
      <NewProjectModal
        isOpen={isNewProjectOpen}
        onClose={() => setIsNewProjectOpen(false)}
        properties={properties}
        currentUser={currentUser}
        onSubmit={handleCreateProject}
      />

      {/* Booking Stay Modal */}
      <BookingModal
        isOpen={isBookingOpen}
        onClose={() => setIsBookingOpen(false)}
        properties={properties}
        currentUser={currentUser}
        onBooked={handleBookStay}
      />

      {/* Modern Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-900 bg-white dark:bg-slate-950 py-6 mt-12 transition-colors">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-slate-500 dark:text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>© 2026 SCI Familiale Hellenvilliers — Tous droits réservés aux 7 membres associés.</p>
          <div className="flex items-center space-x-3">
            <span className="font-medium text-slate-700 dark:text-slate-300">FastAPI + React</span>
            <span>•</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">Page Unique Épurée</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
