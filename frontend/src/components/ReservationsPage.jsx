import React, { useState, useEffect } from 'react';
import { fetchReservations } from '../api';
import BookingModal from './BookingModal';
import StayBalanceWidget from './common/StayBalanceWidget';

const ASSOCIATES_LIST = [
  { id: 'all', label: 'Tous les 7 associés' },
  { id: 'henri', label: 'Henri Jamet' },
  { id: 'frederic', label: 'Frédéric Jamet (Usufruitier)' },
  { id: 'elisabeth', label: 'Élisabeth Jamet (Usufruitière)' },
  { id: 'josephine', label: 'Joséphine Jamet' },
  { id: 'hortense', label: 'Hortense Jamet' },
  { id: 'marguerite', label: 'Marguerite Jamet' },
  { id: 'eugenie', label: 'Eugénie Jamet' },
];

export default function ReservationsPage({ properties, currentUser = 'Henri Jamet' }) {
  const [selectedYear, setSelectedYear] = useState(2026);
  const [viewMode, setViewMode] = useState('agenda'); // 'agenda' | 'month' | 'year'
  const [houseFilter, setHouseFilter] = useState('all'); // 'all' | 'rosing' | 'presbytere'
  const [memberFilter, setMemberFilter] = useState('all');
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [editingReservation, setEditingReservation] = useState(null);

  const loadReservations = async () => {
    try {
      setLoading(true);
      const data = await fetchReservations({ year: selectedYear });
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

  const handleResetFilters = () => {
    setHouseFilter('all');
    setMemberFilter('all');
    setSelectedYear(2026);
  };

  // Filter reservations based on active filters
  const filteredReservations = reservations.filter((r) => {
    if (houseFilter === 'rosing' && !r.property_name?.toLowerCase().includes('rosing')) return false;
    if (houseFilter === 'presbytere' && !r.property_name?.toLowerCase().includes('presbytère')) return false;
    if (memberFilter !== 'all' && !r.user_name?.toLowerCase().includes(memberFilter.toLowerCase())) return false;
    return true;
  });

  // Default demonstration stays if API returns empty list
  const defaultStays = [
    {
      id: 'demo_1',
      week_number: 29,
      start_date: '2026-07-13',
      end_date: '2026-07-19',
      arrival_time: '15h00',
      departure_time: '11h00',
      user_name: 'Alexandre Jamet',
      property_name: 'Villa Rosing',
      status: 'Confirmé',
      title: '« Préparation estivale & tonte du parc »',
      rooms: '3 chambres : Ch. Parentale Rosing, Ch. Jaune, Ch. Bleue',
      guests: '4 personnes (Alexandre, Mathilde + 2 enfants)',
      dotColor: 'bg-sky-600',
      weekBg: 'bg-sky-50 text-sky-800',
    },
    {
      id: 'demo_2',
      week_number: 31,
      start_date: '2026-07-27',
      end_date: '2026-08-03',
      arrival_time: '16h00',
      departure_time: '10h30',
      user_name: 'Hortense Jamet',
      property_name: 'Villa Rosing',
      status: 'Confirmé',
      title: '« Vacances d\'été famille & activités bord de Seine »',
      rooms: '3 chambres : Ch. Parentale, Ch. Bleue, Dortoir des Enfants',
      guests: '4 adultes + 1 enfant (Clémence)',
      dotColor: 'bg-amber-600',
      weekBg: 'bg-amber-50 text-amber-900',
    },
    {
      id: 'demo_3',
      week_number: 33,
      start_date: '2026-08-10',
      end_date: '2026-08-17',
      arrival_time: '12h00',
      departure_time: '15h00',
      user_name: 'Famille Jamet (7/7)',
      property_name: 'Villa Rosing & Le Presbytère',
      status: 'Rassemblement Plénier',
      title: '« Grande Retrouvaille Familiale, Fête de l\'Assomption & Réunion Annuelle de Gérance »',
      rooms: '7 chambres occupées (100% de capacité)',
      guests: '12 membres de la famille réunis (7/7 branches)',
      dotColor: 'bg-forest-deep',
      weekBg: 'bg-emerald-100 text-forest-deep',
      isPlenary: true,
    },
    {
      id: 'demo_4',
      week_number: 36,
      start_date: '2026-08-31',
      end_date: '2026-09-06',
      arrival_time: '14h00',
      departure_time: '17h00',
      user_name: 'Frédéric & Élisabeth Jamet',
      property_name: 'Le Presbytère',
      status: 'Confirmé',
      title: '« Calme de fin d\'été & intendance paysagère »',
      rooms: '2 chambres : Ch. du Curé, Ch. du Jardin',
      guests: '2 personnes (Parents Usufruitiers)',
      dotColor: 'bg-forest-deep',
      weekBg: 'bg-surface-container-low text-forest-deep',
    },
    {
      id: 'demo_5',
      week_number: 42,
      start_date: '2026-10-19',
      end_date: '2026-10-25',
      arrival_time: '18h00',
      departure_time: '18h00',
      user_name: 'Henri Jamet',
      property_name: 'Villa Rosing',
      status: 'En attente confirmation gérant',
      title: '« Contrôle annuel de toiture & hivernage de la pompe à chaleur »',
      rooms: '2 chambres : Ch. Parentale, Ch. Jaune',
      guests: '3 personnes (Henri, Sophie + 1 artisan)',
      dotColor: 'bg-teal-600',
      weekBg: 'bg-teal-50 text-teal-800',
      isPending: true,
    },
  ];

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
    : defaultStays;

  return (
    <div className="flex flex-col w-full pb-16 space-y-space-lg">
      
      {/* ========================================== */}
      {/* 1. EN-TÊTE DE PAGE STATUTAIRE & ACTIONS   */}
      {/* ========================================== */}
      <section className="w-full pt-4">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-6">
          <div className="flex flex-col">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sage-soft text-primary font-label-sm text-xs font-semibold self-start mb-2">
              <span className="material-symbols-outlined text-[16px]">domain</span>
              Domaine d'Hellenvilliers • Saison {selectedYear}
            </span>
            <h1 className="font-display-lg text-2xl sm:text-3xl lg:text-display-lg text-forest-deep leading-tight">
              Calendrier d'Occupation & Passages des Associés
            </h1>
            <p className="font-body-xl text-xs sm:text-sm text-on-surface-variant mt-2 max-w-3xl">
              Régulation harmonieuse des 7 chambres entre la <strong className="font-semibold text-forest-deep">Villa Rosing</strong> (4 ch.) et <strong className="font-semibold text-forest-deep">Le Presbytère</strong> (3 ch.).
            </p>
          </div>

          {/* Action Primaire : Ouvrir Réservation */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                setEditingReservation(null);
                setIsBookingOpen(true);
              }}
              className="group flex items-center justify-center gap-2 px-6 py-3.5 bg-white border-2 border-primary text-primary hover:bg-sage-soft font-label-lg text-sm sm:text-base font-bold rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[22px] group-hover:scale-110 transition-transform">
                edit_calendar
              </span>
              <span>Réserver un nouveau séjour</span>
            </button>
          </div>
        </div>

        {/* Barre de Contrôles & Filtres Horizontale */}
        <div className="bg-surface-container-lowest rounded-2xl p-4 sm:p-space-md shadow-sm border border-border-subtle flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-4">
          
          {/* Commutateur de Vues */}
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

          {/* Filtres Multiples */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Sélecteur Année */}
            <div className="relative min-w-[120px]">
              <select
                id="year-selector"
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                className="w-full appearance-none bg-canvas-slate text-on-surface font-label-md text-xs sm:text-sm py-2.5 pl-3.5 pr-8 rounded-xl border border-slate-300 focus:outline-none focus:bg-white transition-colors cursor-pointer"
              >
                <option value={2026}>Année 2026</option>
                <option value={2027}>Année 2027</option>
              </select>
              <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant text-[18px]">
                expand_more
              </span>
            </div>

            {/* Filtre Maison */}
            <div className="relative min-w-[180px]">
              <select
                id="house-filter"
                value={houseFilter}
                onChange={(e) => setHouseFilter(e.target.value)}
                className="w-full appearance-none bg-canvas-slate text-on-surface font-label-md text-xs sm:text-sm py-2.5 pl-3.5 pr-8 rounded-xl border border-slate-300 focus:outline-none focus:bg-white transition-colors cursor-pointer"
              >
                <option value="all">Toutes les demeures (7 ch.)</option>
                <option value="rosing">Villa Rosing (4 ch.)</option>
                <option value="presbytere">Le Presbytère (3 ch.)</option>
              </select>
              <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant text-[18px]">
                roofing
              </span>
            </div>

            {/* Filtre Associé */}
            <div className="relative min-w-[190px]">
              <select
                id="member-filter"
                value={memberFilter}
                onChange={(e) => setMemberFilter(e.target.value)}
                className="w-full appearance-none bg-canvas-slate text-on-surface font-label-md text-xs sm:text-sm py-2.5 pl-3.5 pr-8 rounded-xl border border-slate-300 focus:outline-none focus:bg-white transition-colors cursor-pointer"
              >
                {ASSOCIATES_LIST.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
              <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant text-[18px]">
                group
              </span>
            </div>

            <button
              type="button"
              onClick={handleResetFilters}
              title="Réinitialiser les filtres"
              className="p-2.5 text-on-surface-variant hover:text-forest-deep bg-canvas-slate hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">refresh</span>
            </button>
          </div>

        </div>
      </section>

      {/* ========================================== */}
      {/* 2. STAY BALANCE : QUOTAS & RÉPARTITION     */}
      {/* ========================================== */}
      <StayBalanceWidget
        year={selectedYear}
        selectedMember={memberFilter !== 'all' ? memberFilter : null}
        onSelectMember={(name) => setMemberFilter(name.split(' ')[0].toLowerCase())}
      />

      {/* ========================================== */}
      {/* 3. AGENDA & PLANNING CHRONOLOGIQUE         */}
      {/* ========================================== */}
      <div className="w-full space-y-6">
        
        {/* VUE 1 : AGENDA */}
        {viewMode === 'agenda' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <h2 className="font-headline-md text-lg sm:text-headline-md text-forest-deep">
                  Planning des Séjours à Venir
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-sage-soft text-primary-container font-label-sm text-xs font-semibold">
                  {displayStays.length} séjours programmés
                </span>
              </div>
            </div>

            <div className="space-y-4">
              {displayStays.map((stay) => (
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
                          stay.isPending ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
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
              ))}
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
                  <h2 className="font-headline-md text-lg sm:text-headline-md text-forest-deep">
                    Août 2026
                  </h2>
                  <p className="font-body-md text-xs sm:text-sm text-on-surface-variant">
                    Occupation estivale simultanée des deux demeures (Villa Rosing & Presbytère)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="p-2 rounded-xl bg-canvas-slate hover:bg-slate-200 text-on-surface-variant transition-colors cursor-pointer"
                  title="Mois précédent"
                >
                  <span className="material-symbols-outlined text-[20px]">chevron_left</span>
                </button>
                <span className="font-label-md text-xs sm:text-sm px-3 py-1.5 rounded-xl bg-sage-soft text-forest-deep font-bold">
                  Août 2026
                </span>
                <button
                  type="button"
                  className="p-2 rounded-xl bg-canvas-slate hover:bg-slate-200 text-on-surface-variant transition-colors cursor-pointer"
                  title="Mois suivant"
                >
                  <span className="material-symbols-outlined text-[20px]">chevron_right</span>
                </button>
              </div>
            </div>

            {/* Monthly Calendar Grid */}
            <div className="grid grid-cols-7 gap-px bg-border-subtle border border-border-subtle rounded-xl overflow-hidden mt-6 text-xs">
              {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => (
                <div key={d} className="bg-surface-container-low p-2.5 text-center font-label-sm font-bold text-on-surface-variant uppercase tracking-wider">
                  {d}
                </div>
              ))}

              {/* Leading days from July */}
              {[27, 28, 29, 30, 31].map((day) => (
                <div key={`prev_${day}`} className="bg-canvas-slate/60 min-h-[90px] p-2 text-outline-variant">
                  <span className="font-semibold">{day}</span>
                </div>
              ))}

              {/* Days 1 to 3 */}
              <div className="bg-surface-container-lowest min-h-[90px] p-2">
                <span className="font-semibold text-on-surface">1</span>
                <div className="mt-1 text-[11px] bg-amber-soft text-amber-rich font-semibold px-1.5 py-0.5 rounded truncate">Hortense (Rosing)</div>
              </div>
              <div className="bg-surface-container-lowest min-h-[90px] p-2">
                <span className="font-semibold text-on-surface">2</span>
                <div className="mt-1 text-[11px] bg-amber-soft text-amber-rich font-semibold px-1.5 py-0.5 rounded truncate">Hortense (Rosing)</div>
              </div>
              <div className="bg-surface-container-lowest min-h-[90px] p-2">
                <span className="font-semibold text-on-surface">3</span>
                <div className="mt-1 text-[11px] bg-amber-soft text-amber-rich font-semibold px-1.5 py-0.5 rounded truncate">Dép. 10h30 Hortense</div>
              </div>

              {/* Days 4 to 9 : Free */}
              {[4, 5, 6, 7, 8].map((day) => (
                <div key={`free_${day}`} className="bg-surface-container-lowest min-h-[90px] p-2">
                  <span className="font-semibold text-on-surface">{day}</span>
                  <div className="mt-1 text-[11px] text-on-surface-variant/70 italic">Manoir libre</div>
                </div>
              ))}

              <div className="bg-surface-container-lowest min-h-[90px] p-2">
                <span className="font-semibold text-on-surface">9</span>
                <div className="mt-1 text-[11px] text-forest-deep font-medium">Préparation Assomption</div>
              </div>

              {/* Plenary SCI week : 10 to 16 */}
              {[10, 11, 12, 13, 14, 15, 16].map((day) => (
                <div key={`plenary_${day}`} className="bg-sage-soft/50 min-h-[90px] p-2 border-l-2 border-forest-deep">
                  <span className="font-bold text-forest-deep">{day}</span>
                  <div className="mt-1 text-[11px] bg-forest-deep text-white font-bold px-1.5 py-0.5 rounded truncate">
                    ★ Plénier SCI
                  </div>
                  <div className="mt-0.5 text-[10px] text-forest-deep font-semibold">
                    {day === 15 ? 'Fête Assomption' : '7/7 branches'}
                  </div>
                </div>
              ))}

              {/* Days 17 to 30 */}
              <div className="bg-surface-container-lowest min-h-[90px] p-2">
                <span className="font-semibold text-on-surface">17</span>
                <div className="mt-1 text-[11px] bg-emerald-50 text-emerald-800 font-semibold px-1.5 py-0.5 rounded truncate">Dép. 15h00 Plénier</div>
              </div>

              {[18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30].map((day) => (
                <div key={`free_late_${day}`} className="bg-surface-container-lowest min-h-[90px] p-2">
                  <span className="font-semibold text-on-surface">{day}</span>
                  <div className="mt-1 text-[11px] text-on-surface-variant/70 italic">Manoir libre</div>
                </div>
              ))}

              {/* Day 31 */}
              <div className="bg-surface-container-lowest min-h-[90px] p-2">
                <span className="font-semibold text-on-surface">31</span>
                <div className="mt-1 text-[11px] bg-sage-soft text-forest-deep font-semibold px-1.5 py-0.5 rounded truncate">Frédéric & Élisabeth</div>
                <div className="mt-0.5 text-[10px] text-emerald-700">(Presbytère)</div>
              </div>

              {/* Trailing days into Sept */}
              {[1, 2, 3, 4, 5, 6].map((day) => (
                <div key={`next_${day}`} className="bg-canvas-slate/60 min-h-[90px] p-2 text-outline-variant">
                  <span className="font-semibold">{day}</span>
                </div>
              ))}
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
                <h2 className="font-headline-md text-lg sm:text-headline-md text-forest-deep">
                  Vue Annuelle : 52 Semaines ({selectedYear})
                </h2>
                <p className="font-body-md text-xs sm:text-sm text-on-surface-variant mt-1">
                  Vision panoramique de la répartition des séjours et des périodes d'affluence familiale.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-sage-soft text-forest-deep font-semibold text-xs">
                  5 semaines réservées
                </span>
                <span className="px-3 py-1 rounded-full bg-canvas-slate text-on-surface-variant font-medium text-xs">
                  47 semaines libres
                </span>
              </div>
            </div>

            {/* 52-Week Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-13 gap-2 mt-6">
              {Array.from({ length: 52 }, (_, i) => i + 1).map((w) => {
                const isBooked = [29, 31, 33, 36, 42].includes(w);
                const isPlenary = w === 33;
                return (
                  <div
                    key={w}
                    className={`p-2.5 rounded-xl text-center border transition-all ${
                      isPlenary
                        ? 'bg-forest-deep text-white border-forest-deep font-bold shadow-xs'
                        : isBooked
                        ? 'bg-sage-soft text-forest-deep border-primary/30 font-semibold'
                        : 'bg-canvas-slate text-on-surface-variant border-border-subtle hover:bg-white'
                    }`}
                  >
                    <span className="text-[11px] font-bold uppercase tracking-wider block">
                      S{w < 10 ? `0${w}` : w}
                    </span>
                    <p className="text-[11px] mt-1 truncate">
                      {isPlenary ? '★ Plénier' : isBooked ? 'Réservé' : 'Libre'}
                    </p>
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
