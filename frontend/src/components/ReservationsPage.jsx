import React, { useState, useEffect } from 'react';
import { Calendar, Plus, CheckCircle2, Clock, XCircle, User, Info, MapPin, List, Grid } from 'lucide-react';
import { fetchReservations } from '../api';
import BookingModal from './BookingModal';

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
  const [selectedPropertyId, setSelectedPropertyId] = useState(properties[0]?.id || 1);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);

  const [viewMode, setViewMode] = useState('agenda'); // 'agenda' | 'grid'
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [targetWeek, setTargetWeek] = useState(null);

  const loadReservations = async () => {
    setLoading(true);
    try {
      const data = await fetchReservations({
        property_id: selectedPropertyId,
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
  }, [selectedPropertyId, selectedYear]);

  const sortedStays = [...reservations].sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

  const handleOpenBooking = (weekNum) => {
    setTargetWeek(weekNum || 30);
    setBookingModalOpen(true);
  };

  return (
    <div className="space-y-6">
      
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900 to-blue-950 border border-slate-800 p-6 sm:p-8">
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 rounded-full bg-blue-500/10 blur-3xl pointer-events-none"></div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center space-x-2 text-xs font-semibold text-blue-400 uppercase tracking-widest mb-1">
              <Calendar className="h-4 w-4" />
              <span>Planning & Partage Familial</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Calendrier & Agenda Linéaire des Séjours
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-xl">
              Consultez l'agenda chronologique des séjours (style Google Schedule) et posez vos options de réservation.
            </p>
          </div>

          <button
            onClick={() => handleOpenBooking(30)}
            className="flex items-center justify-center space-x-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm shadow-xl shadow-blue-500/20 transition-all transform hover:-translate-y-0.5"
          >
            <Plus className="h-5 w-5" />
            <span>Réserver un séjour</span>
          </button>
        </div>
      </div>

      {/* Control Bar: Filters & View Switcher */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        
        <div className="flex items-center space-x-4">
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-0.5">Propriété</label>
            <select
              value={selectedPropertyId}
              onChange={(e) => setSelectedPropertyId(parseInt(e.target.value))}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:border-blue-500"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-0.5">Année</label>
            <div className="flex items-center space-x-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-1">
              {[2026, 2027].map((y) => (
                <button
                  key={y}
                  onClick={() => setSelectedYear(y)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                    selectedYear === y
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* View Switcher: Agenda vs Grid */}
        <div className="flex items-center space-x-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Vue:</span>
          <div className="flex items-center space-x-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-1">
            <button
              onClick={() => setViewMode('agenda')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-bold transition ${
                viewMode === 'agenda' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <List className="h-3.5 w-3.5" />
              <span>Agenda Linéaire</span>
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-bold transition ${
                viewMode === 'grid' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'
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
      ) : viewMode === 'agenda' ? (
        /* LINEAR AGENDA VIEW (Google Calendar Schedule style) */
        <div className="space-y-3">
          {sortedStays.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
              <p className="text-sm text-slate-500">Aucune réservation pour cette année.</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/60">
              {sortedStays.map((stay) => {
                const avatarStyle = MEMBER_COLORS[stay.user_name] || 'bg-slate-700 text-white';
                const isConfirmed = stay.status === 'Confirmée';

                return (
                  <div
                    key={stay.id}
                    className="p-5 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-center min-w-[75px]">
                        <span className="block text-[10px] font-black uppercase text-blue-600 dark:text-blue-400">S{stay.week_number}</span>
                        <span className="block text-xs font-bold text-slate-900 dark:text-white">{stay.year}</span>
                      </div>

                      <div>
                        <div className="flex items-center space-x-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${avatarStyle}`}>
                            {stay.user_name[0]}
                          </div>
                          <span className="font-extrabold text-sm text-slate-900 dark:text-white">{stay.user_name}</span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          {stay.property_name || stay.property?.name || "Maison d'Hellenvilliers"} • Du {stay.start_date} au {stay.end_date}
                        </p>
                        {stay.notes && (
                          <p className="text-xs text-slate-600 dark:text-slate-300 italic mt-0.5">"{stay.notes}"</p>
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
                  className="mt-3 w-full py-1 text-xs font-bold bg-slate-100 hover:bg-blue-600 hover:text-white dark:bg-slate-800 rounded-xl transition"
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
