import React, { useState, useEffect, useRef } from 'react';
import { fetchReservations } from '../api';
import BookingModal from '../components/BookingModal';

const ASSOCIATES_LIST = [
  { id: 'all', label: 'Tous les 7 associés' },
  { id: 'henri', label: 'Henri Jamet', dotColor: 'bg-teal-600' },
  { id: 'frederic', label: 'Frédéric Jamet', dotColor: 'bg-emerald-700' },
  { id: 'elisabeth', label: 'Élisabeth Jamet', dotColor: 'bg-emerald-600' },
  { id: 'josephine', label: 'Joséphine Jamet', dotColor: 'bg-sky-600' },
  { id: 'hortense', label: 'Hortense Jamet', dotColor: 'bg-amber-600' },
  { id: 'marguerite', label: 'Marguerite Jamet', dotColor: 'bg-rose-600' },
  { id: 'eugenie', label: 'Eugénie Jamet', dotColor: 'bg-purple-600' },
];

const MONTH_NAMES_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

function formatYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDatesFromISOWeek(weekNumber, year = 2026) {
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7;
  const monday = new Date(year, 0, 4 - (jan4Day - 1) + (weekNumber - 1) * 7);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  return {
    startDate: formatYMD(monday),
    endDate: formatYMD(sunday),
  };
}

export default function CalendarPage({ properties, currentUser = 'Henri Jamet' }) {
  const [selectedYear, setSelectedYear] = useState(2026);
  const [viewMode, setViewMode] = useState('agenda'); // 'agenda' | 'month' | 'year'
  const [currentDate, setCurrentDate] = useState(() => new Date(2026, 7, 1)); // Août 2026 par défaut
  const [dragStart, setDragStart] = useState(null);
  const [dragEnd, setDragEnd] = useState(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isDraggingRange, setIsDraggingRange] = useState(false);
  const [filterRosing, setFilterRosing] = useState(true);
  const [filterPresbytere, setFilterPresbytere] = useState(true);
  const [memberFilter, setMemberFilter] = useState('all');
  const [isMemberDropdownOpen, setIsMemberDropdownOpen] = useState(false);
  const memberDropdownRef = useRef(null);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [editingReservation, setEditingReservation] = useState(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (memberDropdownRef.current && !memberDropdownRef.current.contains(event.target)) {
        setIsMemberDropdownOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsMemberDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const loadReservations = async () => {
    try {
      setLoading(true);
      const params = selectedYear ? { year: selectedYear } : {};
      const data = await fetchReservations(params);
      setReservations(data || []);
    } catch (err) {
      console.error('Erreur chargement réservations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReservations();
  }, [selectedYear]);

  // Synchronise l'année du calendrier mensuel avec le filtre d'année s'il change
  useEffect(() => {
    if (selectedYear && currentDate.getFullYear() !== selectedYear) {
      setCurrentDate((prev) => new Date(selectedYear, prev.getMonth(), 1));
    }
  }, [selectedYear]);

  const handlePrevMonth = () => {
    setCurrentDate((prev) => {
      const next = new Date(prev.getFullYear(), prev.getMonth() - 1, 1);
      if (selectedYear !== null && next.getFullYear() !== selectedYear) {
        setSelectedYear(next.getFullYear());
      }
      return next;
    });
  };

  const handleNextMonth = () => {
    setCurrentDate((prev) => {
      const next = new Date(prev.getFullYear(), prev.getMonth() + 1, 1);
      if (selectedYear !== null && next.getFullYear() !== selectedYear) {
        setSelectedYear(next.getFullYear());
      }
      return next;
    });
  };

  const handleResetFilters = () => {
    setFilterRosing(true);
    setFilterPresbytere(true);
    setMemberFilter('all');
    setIsMemberDropdownOpen(false);
    setSelectedYear(2026);
    setCurrentDate(new Date(2026, 7, 1));
  };

  const handleOpenBooking = (startDateStr, endDateStr) => {
    let start = startDateStr;
    let end = endDateStr || startDateStr;
    if (start > end) {
      const temp = start;
      start = end;
      end = temp;
    }
    const isSingleDay = start === end;
    setEditingReservation({
      start_date: start,
      end_date: end,
      user_name: currentUser || 'Henri Jamet',
      arrival_time: isSingleDay ? '10:00' : '15:00',
      departure_time: isSingleDay ? '18:00' : '11:00',
    });
    setIsBookingOpen(true);
  };

  const handleMouseDown = (dateStr) => {
    setDragStart(dateStr);
    setDragEnd(dateStr);
    setIsSelecting(true);
    setIsDraggingRange(false);
  };

  const handleMouseEnter = (dateStr) => {
    if (isSelecting) {
      if (dateStr !== dragStart) {
        setIsDraggingRange(true);
      }
      setDragEnd(dateStr);
    }
  };

  const handleMouseUp = (dateStr) => {
    if (isSelecting) {
      setIsSelecting(false);
      if (isDraggingRange && dragStart && dragEnd && dragStart !== dragEnd) {
        handleOpenBooking(dragStart, dragEnd);
      }
      setDragStart(null);
      setDragEnd(null);
      setTimeout(() => setIsDraggingRange(false), 50);
    }
  };

  const handleCellClick = (dateStr) => {
    if (isDraggingRange) return;
    handleOpenBooking(dateStr, dateStr);
  };

  // Filter reservations based on active filters
  const filteredReservations = reservations.filter((r) => {
    if (selectedYear && r.year && r.year !== selectedYear) return false;
    const isRosing = r.property_name?.toLowerCase().includes('rosing');
    const isPresbytere = r.property_name?.toLowerCase().includes('presbytère') || r.property_name?.toLowerCase().includes('presbytere');
    if (!filterRosing && !filterPresbytere) return true;
    if (filterRosing && !filterPresbytere && !isRosing) return false;
    if (!filterRosing && filterPresbytere && !isPresbytere) return false;
    if (memberFilter !== 'all') {
      const normalize = (str) =>
        (str || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase();
      const targetId = normalize(memberFilter);
      const memberObj = ASSOCIATES_LIST.find((m) => m.id === memberFilter);
      const targetName = memberObj ? normalize(memberObj.label) : '';
      const userName = normalize(r.user_name);
      const matchesName = userName.includes(targetId) || (targetName && userName.includes(targetName));
      const matchesParents = (memberFilter === 'frederic' || memberFilter === 'elisabeth') && userName.includes('parent');
      if (!matchesName && !matchesParents) return false;
    }
    return true;
  });

  const displayStays = filteredReservations.length > 0
    ? filteredReservations.map((r, idx) => ({
        id: r.id || `res_${idx}`,
        week_number: r.week_number || 30,
        start_date: r.start_date,
        end_date: r.end_date,
        arrival_time: r.arrival_time || '15h00',
        departure_time: r.departure_time || '11h00',
        user_name: r.user_name || 'Membre SCI',
        property_name: r.property_name || 'Villa Rosing',
        status: r.status || 'Confirmé',
        title: r.notes ? `« ${r.notes} »` : '« Séjour au domaine »',
        rooms: r.selected_rooms ? `${r.selected_rooms.length} chambres : ${r.selected_rooms.join(', ')}` : `${r.chambers_used || 1} chambre(s)`,
        guests: `${r.guest_count || 2} personne(s)`,
        dotColor: 'bg-sky-600',
        weekBg: 'bg-sky-50 text-sky-800',
      }))
    : [];

  // Calcul du dictionnaire de semaines réservées pour la vue 52 Semaines
  const bookedWeeksMap = {};
  displayStays.forEach((stay) => {
    if (stay.week_number) {
      bookedWeeksMap[stay.week_number] = stay;
    }
  });

  const bookedWeeksCount = Object.keys(bookedWeeksMap).length;
  const freeWeeksCount = Math.max(0, 52 - bookedWeeksCount);

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  // Grille mensuelle dynamique (décalage du 1er jour, 28/29/30/31 jours, complétion 7 jours)
  const calendarDays = (() => {
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDayWeekday = (firstDayOfMonth.getDay() + 6) % 7; // Lun = 0, Dim = 6

    const prevMonthDaysCount = new Date(currentYear, currentMonth, 0).getDate();
    const prevMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;

    const days = [];

    // Jours du mois précédent
    for (let i = firstDayWeekday - 1; i >= 0; i--) {
      const dayNum = prevMonthDaysCount - i;
      const dateStr = formatYMD(new Date(prevMonthYear, prevMonth, dayNum));
      days.push({
        day: dayNum,
        dateStr,
        isCurrentMonth: false,
      });
    }

    // Jours du mois en cours
    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const dateStr = formatYMD(new Date(currentYear, currentMonth, dayNum));
      days.push({
        day: dayNum,
        dateStr,
        isCurrentMonth: true,
      });
    }

    // Jours du mois suivant pour compléter les semaines de 7 jours
    const totalCells = Math.ceil(days.length / 7) * 7;
    const nextMonthYear = currentMonth === 11 ? currentYear + 1 : currentYear;
    const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
    const trailingCount = totalCells - days.length;

    for (let dayNum = 1; dayNum <= trailingCount; dayNum++) {
      const dateStr = formatYMD(new Date(nextMonthYear, nextMonth, dayNum));
      days.push({
        day: dayNum,
        dateStr,
        isCurrentMonth: false,
      });
    }

    return days;
  })();

  const selectedMember = ASSOCIATES_LIST.find((m) => m.id === memberFilter) || ASSOCIATES_LIST[0];

  return (
    <div className="flex flex-col w-full pb-16 space-y-6">
      
      {/* ========================================================================= */}
      {/* 1. EN-TÊTE HARMONISÉ HERO                                                 */}
      {/* ========================================================================= */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-50/80 via-yellow-50/60 to-amber-50/70 border border-amber-200/60 dark:bg-amber-950/20 dark:border-amber-800/40 p-6 sm:p-8 shadow-sm mb-6">
        {/* Subtle decorative glow */}
        <div className="absolute -right-24 -top-24 w-96 h-96 rounded-full bg-amber-200/40 dark:bg-amber-800/10 blur-3xl pointer-events-none"></div>
        <div className="absolute -left-12 -bottom-12 w-64 h-64 rounded-full bg-yellow-200/30 dark:bg-yellow-800/10 blur-2xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100/90 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200 font-label-sm text-xs font-semibold uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-amber-600 dark:bg-amber-400 animate-pulse"></span>
              DOMAINE D'HELLENVILLIERS • PLANNING
            </span>
            <h1 className="font-display-lg text-2xl sm:text-3xl lg:text-display-lg text-forest-deep dark:text-amber-50 tracking-tight font-bold mt-2">
              Calendrier des Séjours
            </h1>
            <p className="font-body-md text-sm sm:text-base text-on-surface-variant dark:text-amber-200/80 leading-relaxed">
              Réservations des associés, occupation des demeures et calendrier 2026-2027.
            </p>
          </div>

          {/* Boutons d'Action Rapide */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0 pt-2 md:pt-0">
            <button
              type="button"
              onClick={() => {
                setEditingReservation(null);
                setIsBookingOpen(true);
              }}
              className="group flex items-center justify-center gap-2 px-5 py-3.5 rounded-DEFAULT bg-white dark:bg-slate-900 border-2 border-primary text-primary hover:bg-sage-soft font-label-lg text-sm sm:text-base font-bold shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[22px] group-hover:scale-110 transition-transform">
                event_available
              </span>
              <span>+ Nouveau séjour</span>
            </button>
          </div>
        </div>
      </section>

      {/* Barre de Contrôles & Filtres Horizontale */}
      <section className="w-full">
        <div className="bg-surface-container-lowest rounded-2xl p-4 sm:p-space-md shadow-sm border border-border-subtle flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-4">
          
          {/* Commutateur de Vues (3 onglets Stitch) */}
          <div className="flex items-center p-1 bg-surface-container-low rounded-xl self-start xl:self-auto">
            <button
              type="button"
              onClick={() => setViewMode('agenda')}
              className={`px-3 sm:px-4 py-2 rounded-lg font-label-md text-xs sm:text-sm transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'agenda'
                  ? 'bg-white text-primary font-bold shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">view_timeline</span>
              Planning & Agenda
            </button>

            <button
              type="button"
              onClick={() => setViewMode('month')}
              className={`px-3 sm:px-4 py-2 rounded-lg font-label-md text-xs sm:text-sm transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'month'
                  ? 'bg-white text-primary font-bold shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">calendar_view_month</span>
              Vue Mensuelle
            </button>

            <button
              type="button"
              onClick={() => setViewMode('year')}
              className={`px-3 sm:px-4 py-2 rounded-lg font-label-md text-xs sm:text-sm transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'year'
                  ? 'bg-white text-primary font-bold shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">view_week</span>
              52 Semaines
            </button>
          </div>

          {/* Filtres Multiples Alignés Stitch */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Années : Bouton 'Toutes' + Saisie libre d'année */}
            <div className="flex items-center gap-1.5 bg-canvas-slate p-1 rounded-xl border border-border-subtle">
              <button
                type="button"
                id="btn-all-years"
                onClick={() => setSelectedYear(null)}
                className={`px-2.5 py-1 text-[13px] font-label-sm font-semibold rounded-lg transition-all shadow-xs cursor-pointer ${
                  !selectedYear
                    ? 'bg-forest-deep text-white'
                    : 'bg-white text-on-surface hover:bg-slate-100'
                }`}
                title="Voir toutes les années"
              >
                Toutes
              </button>
              <div className="flex items-center gap-1 pr-1.5 pl-1">
                <span className="material-symbols-outlined text-[16px] text-on-surface-variant">calendar_today</span>
                <input
                  type="number"
                  id="year-input"
                  min="2020"
                  max="2035"
                  placeholder="2026"
                  value={selectedYear || ''}
                  onChange={(e) => {
                    const val = e.target.value ? parseInt(e.target.value, 10) : null;
                    setSelectedYear(val);
                  }}
                  className="w-14 bg-transparent text-[13px] font-label-md font-semibold text-on-surface focus:outline-none text-center"
                  title="Saisir une année (ex. 2026)"
                />
              </div>
            </div>

            {/* Séparateur vertical discret */}
            <div className="hidden sm:block w-px h-6 bg-border-subtle"></div>

            {/* Demeures : Pilules à cocher élégantes */}
            <div className="flex items-center gap-1.5">
              <label
                className={`cursor-pointer select-none inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-label-sm text-[13px] font-medium border transition-all ${
                  filterRosing
                    ? 'bg-sage-soft text-forest-deep border-emerald-700/30 hover:bg-emerald-100'
                    : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                }`}
                title="Filtrer Villa Rosing"
              >
                <input
                  type="checkbox"
                  id="filter-rosing"
                  checked={filterRosing}
                  onChange={(e) => setFilterRosing(e.target.checked)}
                  className="accent-forest-deep w-3.5 h-3.5 rounded cursor-pointer"
                />
                <span className="material-symbols-outlined text-[16px] text-forest-deep">roofing</span>
                <span className="font-semibold">Villa Rosing</span>
                <span className="text-[11px] text-emerald-800 font-normal">(4 ch.)</span>
              </label>

              <label
                className={`cursor-pointer select-none inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-label-sm text-[13px] font-medium border transition-all ${
                  filterPresbytere
                    ? 'bg-sage-soft text-forest-deep border-emerald-700/30 hover:bg-emerald-100'
                    : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                }`}
                title="Filtrer Le Presbytère"
              >
                <input
                  type="checkbox"
                  id="filter-presbytere"
                  checked={filterPresbytere}
                  onChange={(e) => setFilterPresbytere(e.target.checked)}
                  className="accent-forest-deep w-3.5 h-3.5 rounded cursor-pointer"
                />
                <span className="material-symbols-outlined text-[16px] text-forest-deep">cottage</span>
                <span className="font-semibold">Le Presbytère</span>
                <span className="text-[11px] text-emerald-800 font-normal">(3 ch.)</span>
              </label>
            </div>

            {/* Séparateur vertical discret */}
            <div className="hidden sm:block w-px h-6 bg-border-subtle"></div>

            {/* Associés : Sélecteur épuré & élégant */}
            <div className="relative min-w-[210px]" ref={memberDropdownRef}>
              <label className="sr-only" htmlFor="member-filter">Filtrer par Associé</label>
              {/* Native select accessible / fallback / test compatibility */}
              <select
                id="member-filter"
                value={memberFilter}
                onChange={(e) => setMemberFilter(e.target.value)}
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
              >
                {ASSOCIATES_LIST.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>

              {/* Bouton sélecteur fermé */}
              <button
                type="button"
                id="member-filter-trigger"
                onClick={() => setIsMemberDropdownOpen((prev) => !prev)}
                aria-haspopup="listbox"
                aria-expanded={isMemberDropdownOpen}
                className="w-full flex items-center justify-between gap-2.5 py-2 px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50/80 dark:bg-stone-900/60 hover:bg-stone-100/90 dark:hover:bg-stone-800/80 text-stone-800 dark:text-stone-200 text-xs sm:text-sm font-medium shadow-xs focus:outline-none focus:ring-2 focus:ring-amber-600/30 focus:border-amber-600 transition-all duration-150 cursor-pointer"
              >
                <div className="flex items-center gap-2 truncate">
                  {selectedMember.id === 'all' ? (
                    <span className="material-symbols-outlined text-[18px] text-amber-800/70 dark:text-amber-400/80 shrink-0">
                      filter_list
                    </span>
                  ) : (
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${selectedMember.dotColor || 'bg-amber-600'}`}></span>
                  )}
                  <span className="truncate font-medium">
                    {selectedMember.label}
                  </span>
                </div>
                <span
                  className={`material-symbols-outlined text-[18px] text-stone-400 dark:text-stone-500 transition-transform duration-200 shrink-0 ${
                    isMemberDropdownOpen ? 'rotate-180 text-amber-700 dark:text-amber-400' : ''
                  }`}
                >
                  expand_more
                </span>
              </button>

              {/* Menu flottant ouvert raffiné */}
              {isMemberDropdownOpen && (
                <div
                  role="listbox"
                  className="absolute right-0 sm:left-0 mt-1.5 w-full min-w-[220px] bg-white dark:bg-stone-900 rounded-xl shadow-lg border border-stone-200 dark:border-stone-700/80 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 overflow-hidden"
                >
                  {ASSOCIATES_LIST.map((m) => {
                    const isSelected = memberFilter === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          setMemberFilter(m.id);
                          setIsMemberDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 text-xs sm:text-sm text-left transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-amber-50/90 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 font-semibold'
                            : 'text-stone-700 dark:text-stone-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 hover:text-stone-900 dark:text-stone-100'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          {m.id === 'all' ? (
                            <span className="material-symbols-outlined text-[16px] text-stone-400 dark:text-stone-500 shrink-0">
                              groups
                            </span>
                          ) : (
                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${m.dotColor || 'bg-amber-600'}`}></span>
                          )}
                          <span className="truncate">{m.label}</span>
                        </div>
                        {isSelected && (
                          <span className="material-symbols-outlined text-[17px] text-amber-700 dark:text-amber-400 shrink-0 ml-2">
                            check
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleResetFilters}
              title="Réinitialiser les filtres"
              className="p-2 text-on-surface-variant hover:text-forest-deep bg-canvas-slate hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">refresh</span>
            </button>
          </div>

        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION « Équilibre des séjours et présence » SUPPRIMÉE FORMELLEMENT      */}
      {/* Conformité stricte avec le nouveau design épuré Stitch validé par Henri.   */}
      {/* ========================================================================= */}

      {/* ========================================== */}
      {/* 2. AGENDA & PLANNING CHRONOLOGIQUE         */}
      {/* ========================================== */}
      <div className="w-full space-y-6">
        
        {/* VUE 1 : AGENDA */}
        {viewMode === 'agenda' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <h2 className="font-headline-md text-lg sm:text-headline-md text-forest-deep font-bold">
                  Planning des Séjours à Venir
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-sage-soft text-primary-container font-label-sm text-xs font-semibold">
                  {displayStays.length} séjours programmés
                </span>
              </div>
            </div>

            <div className="space-y-4">
              {displayStays.length === 0 ? (
                <div className="py-12 px-6 bg-surface-container-lowest rounded-2xl border border-dashed border-border-subtle flex flex-col items-center justify-center text-center">
                  <div className="w-14 h-14 rounded-full bg-sage-soft text-forest-deep flex items-center justify-center mb-3">
                    <span className="material-symbols-outlined text-[32px]">event_busy</span>
                  </div>
                  <h4 className="font-headline-sm text-base font-bold text-forest-deep">
                    Aucun séjour planifié pour le moment
                  </h4>
                  <p className="font-body-md text-xs sm:text-sm text-on-surface-variant max-w-md mt-1">
                    Le calendrier du domaine est entièrement disponible. Vous pouvez programmer un nouveau passage via « Réserver un séjour ».
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingReservation(null);
                      setIsBookingOpen(true);
                    }}
                    className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-DEFAULT bg-white border-2 border-primary text-primary font-label-md text-xs font-bold hover:bg-sage-soft transition-colors shadow-sm cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]">add_circle</span>
                    <span>Réserver un séjour</span>
                  </button>
                </div>
              ) : (
                displayStays.map((stay) => (
                  <article
                    key={stay.id}
                    className="bg-surface-container-lowest rounded-2xl p-5 lg:p-6 shadow-sm hover:shadow-md transition-all duration-200 border border-border-subtle"
                  >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                    
                    {/* Week & Date badge */}
                    <div className="flex items-start sm:items-center gap-4 min-w-[240px]">
                      <div className={`w-14 h-14 rounded-2xl ${stay.weekBg || 'bg-sky-50 text-sky-800'} flex flex-col items-center justify-center shrink-0 shadow-xs border border-black/5`}>
                        <span className="text-[10px] font-label-sm uppercase font-bold tracking-wider">Sem.</span>
                        <span className="font-headline-md text-xl leading-none font-bold">{stay.week_number}</span>
                      </div>
                      <div>
                        <p className="font-headline-sm text-sm sm:text-base font-bold text-on-surface">
                          {stay.start_date} — {stay.end_date}
                        </p>
                        <div className="flex items-center gap-1.5 text-on-surface-variant text-xs mt-0.5">
                          <span className="material-symbols-outlined text-[15px]">schedule</span>
                          <span>Arr. {stay.arrival_time} • Dép. {stay.departure_time}</span>
                        </div>
                      </div>
                    </div>

                    {/* Stay details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-sage-soft text-primary-container">
                          <span className={`w-2 h-2 rounded-full ${stay.dotColor || 'bg-primary'}`}></span>
                          {stay.user_name}
                        </span>
                        <span className="px-2.5 py-1 rounded-full text-xs bg-canvas-slate text-on-surface font-medium border border-slate-200">
                          {stay.property_name}
                        </span>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1 ${
                          stay.isPending ? 'bg-amber-soft text-amber-rich border border-amber-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        }`}>
                          <span className="material-symbols-outlined text-[14px]">
                            {stay.isPending ? 'hourglass_empty' : 'check_circle'}
                          </span>
                          {stay.status}
                        </span>
                      </div>

                      <h3 className="font-headline-sm text-sm sm:text-base text-on-surface font-semibold mb-2">
                        {stay.title}
                      </h3>

                      <div className="flex flex-wrap items-center gap-y-1.5 gap-x-4 text-on-surface-variant text-xs">
                        <span className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[16px] text-primary-container">king_bed</span>
                          {stay.rooms}
                        </span>
                        <span className="text-outline-variant">•</span>
                        <span className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[16px] text-primary-container">groups</span>
                          {stay.guests}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0 self-end lg:self-center">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingReservation(stay);
                          setIsBookingOpen(true);
                        }}
                        className="px-3 py-1.5 bg-white text-on-surface-variant hover:text-forest-deep text-xs font-semibold rounded-xl border border-slate-300 hover:bg-canvas-slate transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">visibility</span>
                        Détails
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingReservation(stay);
                          setIsBookingOpen(true);
                        }}
                        className="px-3 py-1.5 bg-white text-forest-deep hover:bg-sage-soft text-xs font-bold rounded-xl border-2 border-emerald-600 transition-colors flex items-center gap-1 cursor-pointer shadow-xs"
                      >
                        <span className="material-symbols-outlined text-[16px]">edit</span>
                        Modifier
                      </button>
                    </div>

                  </div>
                </article>
              )))}
            </div>
          </div>
        )}

        {/* VUE 2 : VUE MENSUELLE */}
        {viewMode === 'month' && (
          <div className="bg-surface-container-lowest rounded-2xl p-6 lg:p-8 shadow-sm border border-border-subtle animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border-subtle">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sage-soft text-forest-deep flex items-center justify-center">
                  <span className="material-symbols-outlined text-[24px]">calendar_month</span>
                </div>
                <div>
                  <h2 className="font-headline-md text-lg sm:text-headline-md text-forest-deep font-bold">
                    {MONTH_NAMES_FR[currentMonth]} {currentYear}
                  </h2>
                  <p className="font-body-md text-xs sm:text-sm text-on-surface-variant">
                    {currentMonth >= 5 && currentMonth <= 8
                      ? 'Occupation estivale simultanée des deux demeures (Villa Rosing & Presbytère)'
                      : 'Occupation et présences au domaine (Villa Rosing & Le Presbytère)'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-2 rounded-xl bg-canvas-slate hover:bg-slate-200 text-on-surface-variant transition-colors cursor-pointer"
                  title="Mois précédent"
                  aria-label="Mois précédent"
                >
                  <span className="material-symbols-outlined text-[20px]">chevron_left</span>
                </button>
                <span className="font-label-md text-xs sm:text-sm px-3 py-1.5 rounded-xl bg-sage-soft text-forest-deep font-bold min-w-[130px] text-center">
                  {MONTH_NAMES_FR[currentMonth]} {currentYear}
                </span>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="p-2 rounded-xl bg-canvas-slate hover:bg-slate-200 text-on-surface-variant transition-colors cursor-pointer"
                  title="Mois suivant"
                  aria-label="Mois suivant"
                >
                  <span className="material-symbols-outlined text-[20px]">chevron_right</span>
                </button>
              </div>
            </div>

            {/* Monthly Calendar Grid */}
            <div
              className="grid grid-cols-7 gap-px bg-border-subtle border border-border-subtle rounded-xl overflow-hidden mt-6 text-xs select-none"
              onMouseLeave={() => {
                if (isSelecting) {
                  setIsSelecting(false);
                  setDragStart(null);
                  setDragEnd(null);
                  setIsDraggingRange(false);
                }
              }}
            >
              {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => (
                <div key={d} className="bg-surface-container-low p-2.5 text-center font-label-sm font-bold text-on-surface-variant uppercase tracking-wider">
                  {d}
                </div>
              ))}

              {calendarDays.map((cell, idx) => {
                const dayStays = displayStays.filter((s) => s.start_date <= cell.dateStr && cell.dateStr <= s.end_date);
                const hasStay = dayStays.length > 0;
                
                // Selection highlight calculation
                const minDrag = dragStart && dragEnd ? (dragStart < dragEnd ? dragStart : dragEnd) : null;
                const maxDrag = dragStart && dragEnd ? (dragStart < dragEnd ? dragEnd : dragStart) : null;
                const isInSelectedRange = isSelecting && minDrag && maxDrag && cell.dateStr >= minDrag && cell.dateStr <= maxDrag;

                let cellBg = cell.isCurrentMonth ? 'bg-surface-container-lowest' : 'bg-canvas-slate/60 text-outline-variant';
                if (isInSelectedRange) {
                  cellBg = 'bg-emerald-100 ring-2 ring-forest-deep text-forest-deep font-bold z-10';
                } else if (hasStay) {
                  const anyPlenary = dayStays.some((s) => s?.isPlenary || s?.status === 'Rassemblement Plénier');
                  cellBg = anyPlenary ? 'bg-sage-soft/50 border-l-2 border-forest-deep' : 'bg-emerald-50/50';
                }

                return (
                  <div
                    key={`${cell.dateStr}_${idx}`}
                    onMouseDown={() => handleMouseDown(cell.dateStr)}
                    onMouseEnter={() => handleMouseEnter(cell.dateStr)}
                    onMouseUp={() => handleMouseUp(cell.dateStr)}
                    onClick={() => handleCellClick(cell.dateStr)}
                    className={`group min-h-[95px] p-2 transition-all cursor-pointer hover:bg-slate-100/70 hover:shadow-xs relative flex flex-col justify-between ${cellBg}`}
                    title={`Date : ${cell.dateStr} — Cliquer pour réserver ou glisser pour une plage`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className={`font-semibold ${cell.isCurrentMonth ? (hasStay ? 'text-forest-deep font-bold' : 'text-on-surface') : 'text-outline-variant'}`}>
                          {cell.day}
                        </span>
                        <span className="material-symbols-outlined text-[14px] opacity-0 group-hover:opacity-100 transition-opacity text-primary" title="Réserver ce jour">
                          add_circle
                        </span>
                      </div>

                      {hasStay && (
                        <div className="space-y-1 mt-1">
                          {dayStays.map((stay) => {
                            const isPlenary = stay?.isPlenary || stay?.status === 'Rassemblement Plénier';
                            return (
                              <div
                                key={stay.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingReservation(stay);
                                  setIsBookingOpen(true);
                                }}
                                className={`text-[11px] font-semibold px-1.5 py-0.5 rounded truncate cursor-pointer hover:opacity-85 transition-opacity ${
                                  isPlenary ? 'bg-forest-deep text-white font-bold' : 'bg-sage-soft text-forest-deep'
                                }`}
                                title={`${stay.user_name} (${stay.property_name}) — Cliquer pour modifier`}
                              >
                                {stay.user_name}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-4 mt-6 pt-4 border-t border-border-subtle text-xs text-on-surface-variant">
              <span className="font-bold text-forest-deep">Légende :</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-forest-deep"></span>
                Plénier SCI (100% de capacité)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-amber-600"></span>
                Hortense Jamet (Branche B)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-emerald-700"></span>
                Frédéric & Élisabeth (Usufruitiers)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-teal-600"></span>
                Henri Jamet (Branche A)
              </span>
            </div>
          </div>
        )}

        {/* VUE 3 : 52 SEMAINES */}
        {viewMode === 'year' && (
          <div className="bg-surface-container-lowest rounded-2xl p-6 lg:p-8 shadow-sm border border-border-subtle animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border-subtle">
              <div>
                <h2 className="font-headline-md text-lg sm:text-headline-md text-forest-deep font-bold">
                  Vue Annuelle : 52 Semaines ({selectedYear || '2026'})
                </h2>
                <p className="font-body-md text-xs sm:text-sm text-on-surface-variant mt-1">
                  Vision panoramique de la répartition des séjours et des périodes d'affluence familiale.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-sage-soft text-forest-deep font-semibold text-xs">
                  {bookedWeeksCount} semaines réservées
                </span>
                <span className="px-3 py-1 rounded-full bg-canvas-slate text-on-surface-variant font-medium text-xs">
                  {freeWeeksCount} semaines libres
                </span>
              </div>
            </div>

            {/* 52-Week Grid responsive (4 trimestres en desktop) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-13 gap-2 mt-6">
              {Array.from({ length: 52 }, (_, i) => i + 1).map((w) => {
                const stay = bookedWeeksMap[w];
                const isBooked = !!stay;
                const isPlenary = isBooked && (stay?.isPlenary || stay?.status === 'Rassemblement Plénier');
                const { startDate: weekStartDate, endDate: weekEndDate } = getDatesFromISOWeek(w, selectedYear || 2026);
                
                // Coloration thématique fidèle Stitch
                let cellClass = 'bg-canvas-slate text-on-surface-variant border-border-subtle hover:bg-white';
                let labelText = 'Libre';
                let labelClass = 'text-outline-variant';

                if (isPlenary) {
                  cellClass = 'bg-emerald-100 text-forest-deep border-forest-deep shadow-sm font-extrabold';
                  labelText = '★ Plénier';
                  labelClass = 'text-forest-deep font-extrabold';
                } else if (isBooked) {
                  const firstName = stay?.user_name?.split(' ')[0] || 'Réservé';
                  if (stay?.user_name?.toLowerCase().includes('hortense')) {
                    cellClass = 'bg-amber-50 text-amber-900 border-amber-600/30 font-semibold';
                    labelText = 'Hortense';
                    labelClass = 'text-amber-900 font-bold';
                  } else if (stay?.user_name?.toLowerCase().includes('frédéric') || stay?.user_name?.toLowerCase().includes('parents')) {
                    cellClass = 'bg-sage-soft text-forest-deep border-emerald-700/30 font-semibold';
                    labelText = 'Parents';
                    labelClass = 'text-forest-deep font-bold';
                  } else if (stay?.user_name?.toLowerCase().includes('henri')) {
                    cellClass = 'bg-teal-50 text-teal-800 border-teal-600/30 font-semibold';
                    labelText = 'Henri';
                    labelClass = 'text-teal-800 font-bold';
                  } else {
                    cellClass = 'bg-sage-soft text-forest-deep border-primary/30 font-semibold';
                    labelText = firstName;
                    labelClass = 'text-forest-deep font-semibold';
                  }
                }

                return (
                  <div
                    key={w}
                    onClick={() => {
                      if (stay) {
                        setEditingReservation(stay);
                        setIsBookingOpen(true);
                      } else {
                        handleOpenBooking(weekStartDate, weekEndDate);
                      }
                    }}
                    title={
                      stay
                        ? `Semaine ${w} (${weekStartDate} au ${weekEndDate}) : ${stay.user_name} (${stay.property_name}) — Cliquer pour voir ou modifier`
                        : `Semaine ${w} (${weekStartDate} au ${weekEndDate}) : Libre — Cliquer pour réserver ce créneau`
                    }
                    className={`p-2.5 rounded-xl text-center border transition-all cursor-pointer hover:shadow-md hover:scale-[1.02] ${cellClass}`}
                  >
                    <span className="text-[11px] font-bold uppercase tracking-wider block">
                      S{w < 10 ? `0${w}` : w}
                    </span>
                    <p className={`text-[11px] mt-1 truncate ${labelClass}`}>
                      {labelText}
                    </p>
                    <span className="text-[9px] opacity-60 block mt-0.5 truncate">
                      {weekStartDate.slice(5)} → {weekEndDate.slice(5)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {/* Booking Modal */}
      <BookingModal
        isOpen={isBookingOpen}
        onClose={() => {
          setIsBookingOpen(false);
          setEditingReservation(null);
        }}
        properties={properties}
        currentUser={currentUser}
        initialReservation={editingReservation}
        onBooked={loadReservations}
      />

    </div>
  );
}
