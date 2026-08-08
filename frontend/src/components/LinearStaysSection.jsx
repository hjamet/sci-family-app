import React, { useState } from 'react';
import { Calendar, User, Clock, CheckCircle2, AlertCircle, Plus, MapPin, ChevronRight, FileText, Lock, Download } from 'lucide-react';

const MEMBER_COLORS = {
  Henri: 'bg-cyan-500 text-white ring-cyan-300',
  Hortense: 'bg-rose-500 text-white ring-rose-300',
  Marguerite: 'bg-purple-500 text-white ring-purple-300',
  Eugénie: 'bg-amber-500 text-white ring-amber-300',
  Joséphine: 'bg-emerald-500 text-white ring-emerald-300',
  Élisabeth: 'bg-teal-500 text-white ring-teal-300',
  Frédéric: 'bg-blue-500 text-white ring-blue-300',
};

const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

export default function LinearStaysSection({ reservations, onOpenBooking }) {
  const [filterStatus, setFilterStatus] = useState('Tous');

  // Sort stays chronologically
  const sortedStays = [...reservations]
    .filter(r => filterStatus === 'Tous' || r.status === filterStatus)
    .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

  const formatDateRange = (startStr, endStr) => {
    if (!startStr || !endStr) return '';
    const d1 = new Date(startStr);
    const d2 = new Date(endStr);
    const day1 = d1.getDate();
    const day2 = d2.getDate();
    const month1 = MONTH_NAMES[d1.getMonth()];
    const month2 = MONTH_NAMES[d2.getMonth()];
    const year = d1.getFullYear();

    if (month1 === month2) {
      return `${day1} — ${day2} ${month1} ${year}`;
    }
    return `${day1} ${month1} — ${day2} ${month2} ${year}`;
  };

  const handleExportICS = () => {
    window.open('/api/calendar/ics', '_blank');
  };

  return (
    <section className="mb-14">
      {/* Section Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-xl bg-slate-900 dark:bg-slate-800 text-white shadow-sm">
              <Calendar className="h-5 w-5 text-blue-400" />
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Planning des Séjours — Vue Agenda Linéaire
            </h2>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Agenda chronologique style Google Calendar Schedule : liste des réservations, associés et export iCal (.ics)
          </p>
        </div>

        {/* Action Controls & Filter */}
        <div className="flex flex-wrap items-center gap-3">
          {/* iCal Export Button */}
          <button
            onClick={handleExportICS}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-sm transition"
            title="Synchroniser avec Google Calendar ou Outlook"
          >
            <Download className="h-4 w-4 text-emerald-500" />
            <span>Export Google Calendar (.ics)</span>
          </button>

          <button
            onClick={onOpenBooking}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition"
          >
            <Plus className="h-4 w-4" />
            <span>Réserver un séjour</span>
          </button>
        </div>
      </div>

      {/* Linear Agenda Schedule View (Google Calendar Schedule style) */}
      {sortedStays.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
          <Calendar className="h-10 w-10 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Aucun séjour enregistré.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/60">
          
          {sortedStays.map((stay, idx) => {
            const avatarStyle = MEMBER_COLORS[stay.user_name] || 'bg-slate-700 text-white ring-slate-400';

            return (
              <div
                key={stay.id || idx}
                className="p-4 sm:p-5 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition flex flex-col md:flex-row md:items-center justify-between gap-4 group"
              >
                
                {/* Left Column: Date & Week Badge */}
                <div className="flex items-start sm:items-center space-x-4 min-w-[240px]">
                  <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700 text-center min-w-[70px] flex-shrink-0">
                    <span className="block text-[10px] font-extrabold uppercase text-blue-600 dark:text-blue-400 tracking-wider">
                      S{stay.week_number}
                    </span>
                    <span className="block text-sm font-black text-slate-900 dark:text-white">
                      {stay.year}
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        {formatDateRange(stay.start_date, stay.end_date)}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      <MapPin className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                      <span>{stay.property_name || stay.property?.name || "Maison d'Hellenvilliers"}</span>
                    </div>
                  </div>
                </div>

                {/* Middle Column: Member Avatar & Details */}
                <div className="flex items-center space-x-3.5 flex-1 min-w-[200px]">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-base shadow-sm ring-2 ring-offset-2 dark:ring-offset-slate-900 ${avatarStyle}`}>
                    {stay.user_name ? stay.user_name[0] : 'M'}
                  </div>

                  <div>
                    <div className="flex items-center space-x-2">
                      <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                        {stay.user_name}
                      </h4>
                      <span className="text-[11px] font-semibold text-slate-400">
                        • Membre Associé
                      </span>
                    </div>

                    {stay.notes && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 italic mt-0.5 line-clamp-1">
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
    </section>
  );
}
