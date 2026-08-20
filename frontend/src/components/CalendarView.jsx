import React, { useState } from 'react';
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, MapPin,
  Users, CheckCircle2, AlertCircle, Plus, Eye, Home, Sparkles, Filter
} from 'lucide-react';

const MEMBER_COLORS = {
  Hortense: 'bg-rose-500 text-white',
  Marguerite: 'bg-purple-500 text-white',
  Eugénie: 'bg-amber-500 text-white',
  Joséphine: 'bg-emerald-500 text-white',
  Élisabeth: 'bg-teal-500 text-white',
  Frédéric: 'bg-blue-500 text-white',
  Henri: 'bg-cyan-500 text-white',
  Parents: 'bg-indigo-500 text-white',
};

const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

// Date math helpers
function formatDateISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

function getDaysInMonthGrid(year, monthIndex) {
  const firstDayOfMonth = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  
  let dayOfWeek = firstDayOfMonth.getDay() - 1;
  if (dayOfWeek < 0) dayOfWeek = 6;

  const grid = [];
  const prevMonthDays = new Date(year, monthIndex, 0).getDate();
  for (let i = dayOfWeek - 1; i >= 0; i--) {
    grid.push({
      date: new Date(year, monthIndex - 1, prevMonthDays - i),
      isCurrentMonth: false
    });
  }

  for (let i = 1; i <= daysInMonth; i++) {
    grid.push({
      date: new Date(year, monthIndex, i),
      isCurrentMonth: true
    });
  }

  const remaining = (7 - (grid.length % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    grid.push({
      date: new Date(year, monthIndex + 1, i),
      isCurrentMonth: false
    });
  }

  return grid;
}

function getWeekDays(baseDate) {
  const curr = new Date(baseDate);
  const day = curr.getDay();
  const diff = curr.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(curr.setDate(diff));
  
  const week = [];
  for (let i = 0; i < 7; i++) {
    const nextDay = new Date(monday);
    nextDay.setDate(monday.getDate() + i);
    week.push(nextDay);
  }
  return week;
}

export default function CalendarView({ reservations = [], selectedYear = 2026, onOpenBooking, currentUser }) {
  // View mode: 'mois' | 'semaine' | 'jour'
  const [subViewMode, setSubViewMode] = useState('mois');
  
  // Date states
  const [currentMonthIndex, setCurrentMonthIndex] = useState(7); // Default August (index 7)
  const [selectedDate, setSelectedDate] = useState(new Date(selectedYear, 7, 8)); // 8 August 2026

  // Helper to find stays active on a date
  const getStaysForDate = (dateObj) => {
    const dStr = formatDateISO(dateObj);
    const wNum = getWeekNumber(dateObj);

    return reservations.filter((r) => {
      if (r.start_date && r.end_date) {
        return r.start_date <= dStr && r.end_date >= dStr;
      }
      return r.week_number === wNum && r.year === dateObj.getFullYear();
    });
  };

  // Occupancy, Status & Scope details for a specific date
  const getDateStatusDetails = (dateObj) => {
    const stays = getStaysForDate(dateObj);
    const totalChambers = 7;
    
    let occupiedCount = 0;
    let hasExclusiveStay = false;
    let locations = new Set();

    stays.forEach((s) => {
      const count = s.chambers_used || s.rooms_count || 1;
      occupiedCount += count;
      if (s.accepts_extra_family === false) {
        hasExclusiveStay = true;
      }
      const prop = s.property_name || s.property?.name || "Presbytère";
      locations.add(prop);
    });

    const isFull = occupiedCount >= totalChambers || hasExclusiveStay;
    const isExclusive = hasExclusiveStay || (stays.length > 0 && Array.from(locations).includes("Domaine complet"));

    // Badge styling
    let statusBadge = {
      label: '🟢 Co-séjour bienvenu / Places disponibles',
      colorClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      badgeDot: 'bg-emerald-500',
      isRed: false
    };

    if (stays.length > 0 && isFull) {
      statusBadge = {
        label: isExclusive ? '🔴 Séjour exclusif / Domaine complet' : '🔴 Domaine complet (7/7)',
        colorClass: 'bg-rose-50 text-rose-800 border-rose-200',
        badgeDot: 'bg-rose-500',
        isRed: true
      };
    } else if (stays.length > 0 && hasExclusiveStay) {
      statusBadge = {
        label: '🔴 Séjour exclusif réservé',
        colorClass: 'bg-rose-50 text-rose-800 border-rose-200',
        badgeDot: 'bg-rose-500',
        isRed: true
      };
    }

    let locationTags = Array.from(locations);
    if (locationTags.length === 0) {
      locationTags = ['Domaine d\'Hellenvilliers'];
    }

    return {
      stays,
      occupiedCount: Math.min(totalChambers, occupiedCount),
      totalChambers,
      occupancyText: `${Math.min(totalChambers, occupiedCount)}/7 chambres réservées`,
      statusBadge,
      locationTags
    };
  };

  const handlePrevMonth = () => {
    if (currentMonthIndex === 0) {
      setCurrentMonthIndex(11);
    } else {
      setCurrentMonthIndex(currentMonthIndex - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonthIndex === 11) {
      setCurrentMonthIndex(0);
    } else {
      setCurrentMonthIndex(currentMonthIndex + 1);
    }
  };

  const handlePrevWeek = () => {
    const prev = new Date(selectedDate);
    prev.setDate(prev.getDate() - 7);
    setSelectedDate(prev);
  };

  const handleNextWeek = () => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 7);
    setSelectedDate(next);
  };

  const handlePrevDay = () => {
    const prev = new Date(selectedDate);
    prev.setDate(prev.getDate() - 1);
    setSelectedDate(prev);
  };

  const handleNextDay = () => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 1);
    setSelectedDate(next);
  };

  const daysGrid = getDaysInMonthGrid(selectedYear, currentMonthIndex);
  const weekDays = getWeekDays(selectedDate);
  const dayStatusDetails = getDateStatusDetails(selectedDate);

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6 animate-in fade-in duration-300">
      
      {/* Header Controls: Sub-View Selector (Mois, Semaine, Jour) & Date Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        
        {/* Sub-View Switcher Tabs */}
        <div className="flex items-center space-x-1 bg-slate-100 p-1.5 rounded-2xl shrink-0">
          <button
            onClick={() => setSubViewMode('mois')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
              subViewMode === 'mois'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            📅 Vue Mois
          </button>
          <button
            onClick={() => setSubViewMode('semaine')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
              subViewMode === 'semaine'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🗓️ Vue Semaine
          </button>
          <button
            onClick={() => setSubViewMode('jour')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
              subViewMode === 'jour'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🔍 Consultation Jour
          </button>
        </div>

        {/* Date Title & Prev/Next Buttons */}
        <div className="flex items-center space-x-3">
          {subViewMode === 'mois' && (
            <div className="flex items-center space-x-2">
              <button
                onClick={handlePrevMonth}
                className="p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-base font-extrabold text-slate-900 min-w-[150px] text-center">
                {MONTH_NAMES[currentMonthIndex]} {selectedYear}
              </span>
              <button
                onClick={handleNextMonth}
                className="p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {subViewMode === 'semaine' && (
            <div className="flex items-center space-x-2">
              <button
                onClick={handlePrevWeek}
                className="p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-extrabold text-slate-900 min-w-[180px] text-center">
                Du {formatDateISO(weekDays[0])} au {formatDateISO(weekDays[6])}
              </span>
              <button
                onClick={handleNextWeek}
                className="p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {subViewMode === 'jour' && (
            <div className="flex items-center space-x-2">
              <button
                onClick={handlePrevDay}
                className="p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-extrabold text-slate-900 min-w-[170px] text-center">
                {selectedDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
              <button
                onClick={handleNextDay}
                className="p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          <button
            onClick={() => setSelectedDate(new Date())}
            className="px-3 py-1.5 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-xl text-xs font-bold transition border border-purple-200"
          >
            Aujourd'hui
          </button>
        </div>

      </div>

      {/* VIEW MODE 1: MOIS (Month Grid View) */}
      {subViewMode === 'mois' && (
        <div className="space-y-4">
          <div className="grid grid-cols-7 gap-2 text-center text-xs font-black text-slate-400 uppercase tracking-wider">
            {DAY_NAMES.map((dayName) => (
              <div key={dayName} className="py-1 bg-slate-50 rounded-lg">{dayName}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2">
            {daysGrid.map((item, idx) => {
              const dateDetails = getDateStatusDetails(item.date);
              const isToday = formatDateISO(item.date) === formatDateISO(new Date());

              return (
                <div
                  key={idx}
                  onClick={() => {
                    setSelectedDate(item.date);
                    setSubViewMode('jour');
                  }}
                  className={`min-h-[110px] p-2.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                    !item.isCurrentMonth
                      ? 'bg-slate-50/50 border-slate-100 text-slate-300 opacity-60'
                      : isToday
                      ? 'bg-purple-50/60 border-purple-400 ring-2 ring-purple-300'
                      : 'bg-white border-slate-200 hover:border-purple-300 hover:shadow-md'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span className={`text-xs font-black rounded-full w-6 h-6 flex items-center justify-center ${
                      isToday ? 'bg-purple-600 text-white' : 'text-slate-900'
                    }`}>
                      {item.date.getDate()}
                    </span>

                    <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-md ${
                      dateDetails.occupiedCount > 0
                        ? dateDetails.statusBadge.isRed
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {dateDetails.occupiedCount}/7
                    </span>
                  </div>

                  <div className="mt-1 space-y-1">
                    {dateDetails.stays.slice(0, 2).map((stay) => {
                      const avatarStyle = MEMBER_COLORS[stay.user_name] || 'bg-slate-600 text-white';
                      return (
                        <div key={stay.id} className="flex items-center space-x-1 text-[10px] truncate p-1 rounded-lg bg-slate-100">
                          <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold ${avatarStyle}`}>
                            {stay.user_name[0]}
                          </span>
                          <span className="font-bold text-slate-800 truncate">{stay.user_name}</span>
                        </div>
                      );
                    })}

                    {dateDetails.stays.length > 2 && (
                      <span className="text-[9px] font-bold text-purple-600 block text-right">
                        +{dateDetails.stays.length - 2} séjour(s)
                      </span>
                    )}

                    {dateDetails.stays.length > 0 && (
                      <div className="pt-1 flex items-center space-x-1">
                        <span className={`w-2 h-2 rounded-full ${dateDetails.statusBadge.badgeDot}`}></span>
                        <span className="text-[9px] font-bold text-slate-600 truncate">
                          {dateDetails.locationTags[0]}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW MODE 2: SEMAINE (Week Grid View) */}
      {subViewMode === 'semaine' && (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {weekDays.map((dayDate, idx) => {
            const dateDetails = getDateStatusDetails(dayDate);
            const isToday = formatDateISO(dayDate) === formatDateISO(new Date());

            return (
              <div
                key={idx}
                className={`rounded-2xl p-4 border flex flex-col justify-between min-h-[260px] ${
                  isToday
                    ? 'bg-purple-50/50 border-purple-400 ring-2 ring-purple-200'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div>
                  <div className="flex justify-between items-center border-b border-slate-100 pb-2 mb-3">
                    <div>
                      <span className="text-[10px] font-black uppercase text-slate-400 block">
                        {DAY_NAMES[idx]}
                      </span>
                      <span className="text-sm font-black text-slate-900">
                        {dayDate.getDate()} {MONTH_NAMES[dayDate.getMonth()].slice(0, 3)}
                      </span>
                    </div>

                    <span className={`text-xs font-black px-2 py-0.5 rounded-lg border ${dateDetails.statusBadge.colorClass}`}>
                      {dateDetails.occupiedCount}/7
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1 mb-3">
                    {dateDetails.locationTags.map((tag, tIdx) => (
                      <span key={tIdx} className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-extrabold flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-purple-600" />
                        <span>{tag}</span>
                      </span>
                    ))}
                  </div>

                  {dateDetails.stays.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-4 text-center">Aucune réservation</p>
                  ) : (
                    <div className="space-y-2">
                      {dateDetails.stays.map((stay) => {
                        const avatarStyle = MEMBER_COLORS[stay.user_name] || 'bg-slate-700 text-white';
                        return (
                          <div key={stay.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                            <div className="flex items-center space-x-2">
                              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${avatarStyle}`}>
                                {stay.user_name[0]}
                              </div>
                              <span className="text-xs font-extrabold text-slate-900">{stay.user_name}</span>
                            </div>
                            <div className="text-[10px] text-slate-500 flex items-center justify-between">
                              <span>🛏️ {stay.chambers_used || stay.rooms_count || 1} ch.</span>
                              <span>👥 {stay.guest_count || 1} pers.</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => {
                    setSelectedDate(dayDate);
                    setSubViewMode('jour');
                  }}
                  className="mt-4 w-full py-1.5 text-xs font-extrabold bg-slate-100 hover:bg-purple-600 hover:text-white rounded-xl text-slate-700 transition flex items-center justify-center space-x-1"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Consulter la journée</span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* VIEW MODE 3: JOUR (Daily Consultation View) */}
      {subViewMode === 'jour' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          <div className="p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-900 to-purple-950 text-white space-y-4 shadow-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center space-x-2 text-xs font-bold text-purple-300 uppercase tracking-widest">
                  <Clock className="w-4 h-4 text-purple-400" />
                  <span>Consultation Journalière Détaillée</span>
                </div>
                <h2 className="text-2xl font-black tracking-tight mt-1">
                  {selectedDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </h2>
              </div>

              <div className="p-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 text-center shrink-0">
                <span className="text-[10px] uppercase font-bold text-purple-200 block">Taux d'Occupation</span>
                <span className="text-2xl font-black text-white">
                  {dayStatusDetails.occupiedCount} / 7
                </span>
                <span className="text-[10px] text-purple-200 block">Chambres Réservées</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/10">
              <span className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-extrabold shadow-sm border ${dayStatusDetails.statusBadge.colorClass}`}>
                <span className={`w-2.5 h-2.5 rounded-full ${dayStatusDetails.statusBadge.badgeDot}`}></span>
                <span>{dayStatusDetails.statusBadge.label}</span>
              </span>

              {dayStatusDetails.locationTags.map((tag, tIdx) => (
                <span key={tIdx} className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-full bg-white/20 text-white text-xs font-bold border border-white/20">
                  <MapPin className="w-3.5 h-3.5 text-purple-300" />
                  <span>{tag}</span>
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-base font-extrabold text-slate-900 flex items-center space-x-2">
              <Users className="w-5 h-5 text-purple-600" />
              <span>Membres présents & Séjours actifs ({dayStatusDetails.stays.length})</span>
            </h3>

            {dayStatusDetails.stays.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-slate-50 border border-slate-200">
                <p className="text-sm font-bold text-slate-600">Aucune réservation enregistrée pour cette journée.</p>
                <p className="text-xs text-slate-400 mt-1">Toutes les 7 chambres du domaine sont actuellement disponibles à la réservation.</p>
                
                <button
                  onClick={() => onOpenBooking && onOpenBooking(getWeekNumber(selectedDate))}
                  className="mt-4 inline-flex items-center space-x-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Réserver cette date maintenant</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {dayStatusDetails.stays.map((stay) => {
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
                    <div key={stay.id} className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-extrabold text-sm ${avatarStyle}`}>
                            {stay.user_name[0]}
                          </div>
                          <div>
                            <h4 className="text-sm font-extrabold text-slate-900">{stay.user_name}</h4>
                            <p className="text-xs text-slate-500">
                              {stay.property_name || stay.property?.name || "Domaine d'Hellenvilliers"}
                            </p>
                          </div>
                        </div>

                        <span className={`text-xs font-extrabold px-2.5 py-1 rounded-xl border ${
                          isCoStay
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                            : 'bg-rose-100 text-rose-800 border-rose-200'
                        }`}>
                          {isCoStay ? '🟢 Co-séjour' : '🔴 Séjour exclusif'}
                        </span>
                      </div>

                      {stay.start_date && stay.end_date && (
                        <div className="text-xs font-black text-indigo-900 dark:text-indigo-200 pt-1">
                          Du <span className="font-black">{stay.start_date}</span> au <span className="font-black">{stay.end_date}</span>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          🛏️ {chambersCount}/7 chambres réservées
                        </span>
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-extrabold bg-purple-50 text-purple-700 border border-purple-200">
                          📅 {durationDays} jours de séjour
                        </span>
                      </div>

                      {stay.notes && (
                        <p className="text-xs text-slate-600 bg-white p-2.5 rounded-xl border border-slate-200 italic">
                          "{stay.notes}"
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
