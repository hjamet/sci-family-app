import React, { useState, useEffect } from 'react';
import { Calendar, Plus, CheckCircle2, Clock, XCircle, User, Info, MapPin, List, Grid, LayoutGrid } from 'lucide-react';
import { fetchReservations } from '../api';
import BookingModal from './BookingModal';
import HouseUsageChart from './HouseUsageChart';
import CalendarView from './CalendarView';

const MEMBER_COLORS = {
  Hortense: 'bg-rose-500 text-white ring-rose-300',
  Marguerite: 'bg-purple-500 text-white ring-purple-300',
  Eugénie: 'bg-amber-500 text-white ring-amber-300',
  Joséphine: 'bg-emerald-500 text-white ring-emerald-300',
  Élisabeth: 'bg-teal-500 text-white ring-teal-300',
  Frédéric: 'bg-blue-500 text-white ring-blue-300',
  Henri: 'bg-cyan-500 text-white ring-cyan-300',
  Parents: 'bg-indigo-500 text-white ring-indigo-300',
};

const MONTH_NAMES = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export default function ReservationsPage({ properties, currentUser }) {
  const [selectedYear, setSelectedYear] = useState(2026);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);

  const [viewMode, setViewMode] = useState('agenda'); // Default view: 'agenda'
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [targetWeek, setTargetWeek] = useState(null);

  const loadReservations = async () => {
    setLoading(true);
    try {
      const data = await fetchReservations({
        year: selectedYear
      });
      setReservations(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReservations();
  }, [selectedYear]);

  const sortedStays = [...reservations].sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

  const handleOpenBooking = (weekNum) => {
    setTargetWeek(weekNum || 30);
    setBookingModalOpen(true);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-purple-950 border border-slate-800 p-6 sm:p-8 text-white shadow-md w-full">
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 rounded-full bg-purple-500/10 blur-3xl pointer-events-none"></div>

        <div className="w-full flex flex-row items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center space-x-2 text-xs font-semibold text-purple-300 uppercase tracking-widest mb-1">
              <Calendar className="h-4 w-4 text-purple-400" />
              <span>Domaine d'Hellenvilliers • Vue Unifiée 7 Chambres</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
              Réservations & Planning Familial
            </h1>
            <p className="text-sm text-purple-100/80 mt-1 max-w-xl">
              Agenda des séjours sur l'ensemble du domaine (Villa Rosing & Presbytère) et projection de l'occupation.
            </p>
          </div>

          <button
            onClick={() => handleOpenBooking(30)}
            className="flex items-center justify-center space-x-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-sm shadow-xl shadow-purple-500/20 transition-all transform hover:-translate-y-0.5"
          >
            <Plus className="h-5 w-5" />
            <span>Réserver un séjour</span>
          </button>
        </div>
      </div>

      {/* 12-Month Projected House Usage SVG Bar Chart */}
      <HouseUsageChart reservations={reservations} />

      {/* Control Bar: Year Filter & View Switcher (Unified 7-room Estate View, Dropdown removed) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        
        <div className="flex items-center space-x-4">
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-0.5">Année de Consultation</label>
            <div className="flex items-center space-x-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-1">
              {[2026, 2027].map((y) => (
                <button
                  key={y}
                  onClick={() => setSelectedYear(y)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                    selectedYear === y
                      ? 'bg-purple-600 text-white'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>

          <div className="hidden sm:block border-l border-slate-200 dark:border-slate-800 h-8"></div>

          <div className="hidden sm:flex items-center space-x-2 text-xs font-semibold text-slate-500">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span>Domaine Unifié (7 Chambres Total)</span>
          </div>
        </div>

        {/* View Switcher: Calendar Tri-Vues vs Agenda vs Grid */}
        <div className="flex items-center space-x-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Vue:</span>
          <div className="flex items-center space-x-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-1">
            <button
              onClick={() => setViewMode('calendar')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-bold transition ${
                viewMode === 'calendar' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Agenda Tri-Vues (Mois/Semaine/Jour)</span>
            </button>
            <button
              onClick={() => setViewMode('agenda')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-bold transition ${
                viewMode === 'agenda' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <List className="h-3.5 w-3.5" />
              <span>Agenda Linéaire</span>
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-bold transition ${
                viewMode === 'grid' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Grid className="h-3.5 w-3.5" />
              <span>Grille 52 Semaines</span>
            </button>
          </div>
        </div>

      </div>

      {/* Main Content */}
      {loading ? (
        <div className="text-center py-12 text-slate-500 text-sm">Chargement de l'agenda...</div>
      ) : viewMode === 'calendar' ? (
        /* TRI-VUES CALENDAR VIEW (Mois / Semaine / Jour) */
        <CalendarView
          reservations={reservations}
          selectedYear={selectedYear}
          onOpenBooking={handleOpenBooking}
          currentUser={currentUser}
        />
      ) : viewMode === 'agenda' ? (
        /* LINEAR AGENDA VIEW */
        <div className="space-y-3">
          {sortedStays.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
              <p className="text-sm text-slate-500">Aucune réservation pour cette année.</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/60">
              {sortedStays.map((stay) => {
                const avatarStyle = MEMBER_COLORS[stay.user_name] || 'bg-slate-700 text-white';
                const chambersCount = stay.chambers_used || stay.rooms_count || (stay.selected_rooms ? stay.selected_rooms.length : 1);
                
                let durationDays = 7;
                if (stay.start_date && stay.end_date) {
                  const s = new Date(stay.start_date);
                  const e = new Date(stay.end_date);
                  if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
                    durationDays = Math.max(1, Math.round(Math.abs(e - s) / (1000 * 60 * 60 * 24)) + 1);
                  }
                }
                const isCoStay = stay.accepts_extra_family !== false;

                return (
                  <div
                    key={stay.id}
                    className="p-5 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="flex items-start sm:items-center space-x-4">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-extrabold text-sm shrink-0 shadow-sm ${avatarStyle}`}>
                        {stay.user_name[0]}
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center space-x-3 flex-wrap">
                          <span className="font-extrabold text-base text-slate-900 dark:text-white">{stay.user_name}</span>
                          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                            • {stay.property_name || stay.property?.name || "Domaine d'Hellenvilliers"}
                          </span>
                        </div>

                        {/* Prominent / Bold Date Range */}
                        <div className="text-sm sm:text-base font-black text-indigo-900 dark:text-indigo-200">
                          Du <span className="font-black">{stay.start_date}</span> au <span className="font-black">{stay.end_date}</span>
                        </div>

                        {/* Dynamic Badges */}
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-extrabold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                            🛏️ {chambersCount}/7 chambres réservées
                          </span>
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-extrabold bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                            📅 {durationDays} jours de séjour
                          </span>
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-extrabold border ${
                            isCoStay
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                              : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                          }`}>
                            {isCoStay ? '🟢 Co-séjour' : '🔴 Séjour exclusif'}
                          </span>
                        </div>

                        {stay.notes && (
                          <p className="text-xs text-slate-600 dark:text-slate-300 italic mt-1 bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                            "{stay.notes}"
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* GRID VIEW (52 Weeks) */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {Array.from({ length: 52 }, (_, i) => i + 1).map((w) => {
            const stay = reservations.find(r => r.week_number === w);
            const isConfirmed = stay && stay.status === 'Confirmée';
            const isPending = stay && stay.status === 'Demande en attente';

            return (
              <div
                key={w}
                className={`rounded-2xl p-3.5 border transition-all flex flex-col justify-between ${
                  isConfirmed
                    ? 'border-emerald-500/50 bg-emerald-950/20'
                    : isPending
                    ? 'border-amber-500/50 bg-amber-950/20'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                }`}
              >
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-black text-slate-900 dark:text-white">Semaine {w}</span>
                    <span className="text-[10px] text-slate-400">{MONTH_NAMES[Math.min(11, Math.floor((w - 1) / 4.35))]}</span>
                  </div>
                  {stay ? (
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      👤 {stay.user_name}
                      <p className="text-[10px] text-slate-400 mt-1">{stay.status}</p>
                    </div>
                  ) : (
                    <span className="text-xs text-emerald-600 font-medium">Libre</span>
                  )}
                </div>
                <button
                  onClick={() => handleOpenBooking(w)}
                  className="mt-3 w-full py-1 text-xs font-bold bg-slate-100 hover:bg-purple-600 hover:text-white dark:bg-slate-800 rounded-xl transition"
                >
                  {stay ? 'Détails' : 'Réserver'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Booking Modal */}
      <BookingModal
        isOpen={bookingModalOpen}
        onClose={() => setBookingModalOpen(false)}
        initialWeek={targetWeek}
        initialYear={selectedYear}
        properties={properties}
        currentUser={currentUser}
        onBooked={loadReservations}
      />

    </div>
  );
}
