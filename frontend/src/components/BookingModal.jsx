import React, { useState, useEffect } from 'react';
import { createReservation, updateReservation } from '../api';

function getISOWeekAndYear(dateStr) {
  if (!dateStr) return { year: 2026, week_number: 30 };
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { year: 2026, week_number: 30 };
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  const weekNumber = 1 + Math.round((firstThursday - target.valueOf()) / 604800000);
  return { year: target.getFullYear(), week_number: weekNumber };
}

const ASSOCIATES_LIST = [
  'Henri Jamet',
  'Frédéric Jamet',
  'Élisabeth Jamet',
  'Joséphine Jamet',
  'Hortense Jamet',
  'Marguerite Jamet',
  'Eugénie Jamet',
];

const ROOMS = [
  { id: 'rosing_parentale', name: 'Chambre Parentale (Rosing)', house: 'rosing' },
  { id: 'rosing_bleue', name: 'Chambre Bleue (Rosing)', house: 'rosing' },
  { id: 'rosing_jaune', name: 'Chambre Jaune (Rosing)', house: 'rosing' },
  { id: 'rosing_dortoir', name: 'Dortoir des Enfants (Rosing)', house: 'rosing' },
  { id: 'presb_cure', name: 'Chambre du Curé (Presbytère)', house: 'presbytere' },
  { id: 'presb_jardin', name: 'Chambre du Jardin (Presbytère)', house: 'presbytere' },
  { id: 'presb_mezzanine', name: 'Mezzanine (Presbytère)', house: 'presbytere' },
];

export default function BookingModal({
  isOpen,
  onClose,
  initialWeek,
  initialYear = 2026,
  properties,
  currentUser = 'Henri Jamet',
  onBooked,
  initialReservation = null,
}) {
  const [applicant, setApplicant] = useState(currentUser || 'Henri Jamet');
  const [selectedHouse, setSelectedHouse] = useState('all'); // 'all' | 'rosing' | 'presbytere'
  const [selectedRooms, setSelectedRooms] = useState(['Chambre Parentale (Rosing)']);
  const [startDate, setStartDate] = useState('2026-08-10');
  const [endDate, setEndDate] = useState('2026-08-17');
  const [arrivalTime, setArrivalTime] = useState('15:00');
  const [departureTime, setDepartureTime] = useState('11:00');
  const [guestCount, setGuestCount] = useState(3);
  const [hasExternalGuests, setHasExternalGuests] = useState(false);
  const [externalGuestDetails, setExternalGuestDetails] = useState('');
  const [stayTitle, setStayTitle] = useState('Séjour estival en famille');
  const [cohabitationAgreement, setCohabitationAgreement] = useState(true);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const isEditMode = Boolean(initialReservation && initialReservation.id);

  useEffect(() => {
    if (initialReservation) {
      if (initialReservation.user_name) setApplicant(initialReservation.user_name);
      if (initialReservation.start_date) setStartDate(initialReservation.start_date);
      if (initialReservation.end_date) setEndDate(initialReservation.end_date);
      if (initialReservation.arrival_time) setArrivalTime(initialReservation.arrival_time);
      if (initialReservation.departure_time) setDepartureTime(initialReservation.departure_time);
      if (initialReservation.guest_count || initialReservation.guests) {
        setGuestCount(parseInt(initialReservation.guest_count || initialReservation.guests, 10) || 3);
      }
      if (initialReservation.title) setStayTitle(initialReservation.title);
      if (initialReservation.notes) setNotes(initialReservation.notes);
      if (Array.isArray(initialReservation.selected_rooms) && initialReservation.selected_rooms.length > 0) {
        setSelectedRooms(initialReservation.selected_rooms);
      }
      if (typeof initialReservation.accepts_extra_family === 'boolean') {
        setCohabitationAgreement(initialReservation.accepts_extra_family);
      }
    } else {
      if (currentUser) {
        const match = ASSOCIATES_LIST.find(a => a.toLowerCase().includes((currentUser || '').toLowerCase().split(' ')[0]));
        if (match) setApplicant(match);
      }
      setStartDate('2026-08-10');
      setEndDate('2026-08-17');
      setArrivalTime('15:00');
      setDepartureTime('11:00');
      setGuestCount(3);
      setHasExternalGuests(false);
      setExternalGuestDetails('');
      setStayTitle('Séjour estival en famille');
      setCohabitationAgreement(true);
      setNotes('');
      setSelectedRooms(['Chambre Parentale (Rosing)']);
    }
  }, [initialReservation, isOpen, currentUser]);

  if (!isOpen) return null;

  const { week_number, year } = getISOWeekAndYear(startDate);

  const toggleRoom = (roomName) => {
    if (selectedRooms.includes(roomName)) {
      if (selectedRooms.length > 1) {
        setSelectedRooms(selectedRooms.filter(r => r !== roomName));
      }
    } else {
      setSelectedRooms([...selectedRooms, roomName]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!startDate || !endDate) {
      setError('Veuillez sélectionner les dates d\'arrivée et de départ.');
      return;
    }
    if (new Date(endDate) <= new Date(startDate)) {
      setError('La date de départ doit être postérieure à la date d\'arrivée.');
      return;
    }
    if (!cohabitationAgreement) {
      setError('Veuillez accepter la charte de cohabitation bienveillante du domaine.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const resolvedPropertyId = selectedRooms.some(r => r.includes('Presbytère')) && !selectedRooms.some(r => r.includes('Rosing')) ? 2 : 1;
      const resolvedPropertyName = selectedRooms.some(r => r.includes('Presbytère')) && selectedRooms.some(r => r.includes('Rosing'))
        ? 'Rosing & Presbytère'
        : (resolvedPropertyId === 2 ? 'Le Presbytère' : 'Villa Rosing');

      const payload = {
        property_id: resolvedPropertyId,
        property_name: resolvedPropertyName,
        user_name: applicant,
        year: year,
        week_number: week_number,
        start_date: startDate,
        end_date: endDate,
        arrival_time: arrivalTime || '15:00',
        departure_time: departureTime || '11:00',
        guest_count: parseInt(guestCount, 10) || 1,
        chambers_used: selectedRooms.length,
        selected_rooms: selectedRooms,
        rooms_count: selectedRooms.length,
        accepts_extra_family: cohabitationAgreement,
        notes: `${stayTitle}${notes ? ` • ${notes}` : ''}${hasExternalGuests && externalGuestDetails ? ` [Invités extérieurs: ${externalGuestDetails}]` : ''}`,
      };

      if (isEditMode) {
        await updateReservation(initialReservation.id, payload);
      } else {
        await createReservation(payload);
      }
      if (onBooked) await onBooked();
      onClose();
    } catch (err) {
      console.error('Erreur réservation:', err);
      setError(err.message || 'Erreur lors de la réservation du séjour.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredRooms = ROOMS.filter(r => {
    if (selectedHouse === 'rosing') return r.house === 'rosing';
    if (selectedHouse === 'presbytere') return r.house === 'presbytere';
    return true;
  });

  return (
    <div
      aria-modal="true"
      role="dialog"
      className="fixed inset-0 z-50 bg-inverse-surface/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
    >
      <div className="w-full max-w-3xl my-auto bg-white rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh] border border-border-subtle animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <header className="bg-surface-container-low px-6 py-4 flex items-center justify-between border-b border-border-subtle shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sage-soft text-primary flex items-center justify-center font-bold">
              <span className="material-symbols-outlined text-[24px]">edit_calendar</span>
            </div>
            <div>
              <h2 className="font-headline-md text-lg sm:text-xl font-bold text-emerald-950">
                {isEditMode ? 'Modifier la réservation du séjour' : 'Réserver un séjour au Domaine'}
              </h2>
              <p className="text-xs text-on-surface-variant">
                {isEditMode ? 'Mise à jour des dates, horaires et attribution des chambres' : 'Formulaire en 5 étapes d\'attribution des chambres et dates'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white hover:bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer border border-slate-200"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </header>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1 min-h-0 text-sm">
          
          {error && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs sm:text-sm flex items-center gap-2.5">
              <span className="material-symbols-outlined text-[20px] text-red-600 shrink-0">error</span>
              <span>{error}</span>
            </div>
          )}

          {/* Étape 1 : Associé Demandeur */}
          <div className="space-y-2">
            <label className="font-label-md text-xs font-bold text-forest-deep uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-sage-soft text-primary flex items-center justify-center text-xs font-bold">1</span>
              Associé demandeur
            </label>
            <select
              value={applicant}
              onChange={(e) => setApplicant(e.target.value)}
              className="w-full h-11 px-3.5 bg-canvas-slate rounded-xl border border-slate-300 font-label-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
            >
              {ASSOCIATES_LIST.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          {/* Étape 2 : Demeure & Chambres */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="font-label-md text-xs font-bold text-forest-deep uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-sage-soft text-primary flex items-center justify-center text-xs font-bold">2</span>
                Demeure & Chambres souhaitées
              </label>
              <div className="flex items-center gap-1 text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedHouse('all')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${selectedHouse === 'all' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-700'}`}
                >
                  Toutes
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedHouse('rosing')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${selectedHouse === 'rosing' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-700'}`}
                >
                  Rosing
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedHouse('presbytere')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${selectedHouse === 'presbytere' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-700'}`}
                >
                  Presbytère
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filteredRooms.map((room) => {
                const isChecked = selectedRooms.includes(room.name);
                return (
                  <label
                    key={room.id}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border transition-all cursor-pointer select-none ${
                      isChecked
                        ? 'bg-sage-soft/70 border-primary text-forest-deep font-semibold shadow-xs'
                        : 'bg-canvas-slate border-slate-200 text-on-surface hover:bg-white'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleRoom(room.name)}
                      className="w-4 h-4 rounded text-primary accent-primary cursor-pointer"
                    />
                    <span className="text-xs sm:text-sm truncate">{room.name}</span>
                  </label>
                );
              })}
            </div>
            <p className="text-[11px] text-on-surface-variant italic">
              {selectedRooms.length} chambre{selectedRooms.length > 1 ? 's' : ''} sélectionnée{selectedRooms.length > 1 ? 's' : ''} sur 7 disponibles.
            </p>
          </div>

          {/* Étape 3 : Dates de Séjour & Horaires */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="font-label-md text-xs font-bold text-forest-deep uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-sage-soft text-primary flex items-center justify-center text-xs font-bold">3</span>
                Période de séjour (Semaine ISO {week_number})
              </label>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[11px] font-bold border border-emerald-200">
                Semaine {week_number} • {year}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <span className="text-xs text-on-surface-variant font-medium">Date d'arrivée</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full h-11 px-3 bg-canvas-slate rounded-xl border border-slate-300 font-label-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <span className="text-xs text-on-surface-variant font-medium">Date de départ</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full h-11 px-3 bg-canvas-slate rounded-xl border border-slate-300 font-label-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <span className="text-xs text-on-surface-variant font-medium flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px] text-primary">schedule</span>
                  Heure d'arrivée (défaut 15h00)
                </span>
                <input
                  type="time"
                  value={arrivalTime}
                  onChange={(e) => setArrivalTime(e.target.value)}
                  className="w-full h-10 px-3 bg-canvas-slate rounded-xl border border-slate-300 font-label-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <span className="text-xs text-on-surface-variant font-medium flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px] text-primary">schedule</span>
                  Heure de départ (défaut 11h00)
                </span>
                <input
                  type="time"
                  value={departureTime}
                  onChange={(e) => setDepartureTime(e.target.value)}
                  className="w-full h-10 px-3 bg-canvas-slate rounded-xl border border-slate-300 font-label-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Étape 4 : Composition & Invités */}
          <div className="space-y-3">
            <label className="font-label-md text-xs font-bold text-forest-deep uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-sage-soft text-primary flex items-center justify-center text-xs font-bold">4</span>
              Composition du groupe
            </label>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3.5 rounded-xl bg-canvas-slate border border-slate-200">
              <div className="space-y-0.5">
                <span className="font-label-md text-xs sm:text-sm font-semibold text-forest-deep block">
                  Nombre de participants
                </span>
                <span className="text-xs text-on-surface-variant">Adultes et enfants</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setGuestCount(Math.max(1, guestCount - 1))}
                  className="w-8 h-8 rounded-lg bg-white border border-slate-300 flex items-center justify-center font-bold text-base hover:bg-slate-50 cursor-pointer"
                >
                  -
                </button>
                <span className="font-headline-sm text-base font-bold text-emerald-950 w-6 text-center">
                  {guestCount}
                </span>
                <button
                  type="button"
                  onClick={() => setGuestCount(guestCount + 1)}
                  className="w-8 h-8 rounded-lg bg-white border border-slate-300 flex items-center justify-center font-bold text-base hover:bg-slate-50 cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-canvas-slate border border-slate-200 space-y-2">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hasExternalGuests}
                  onChange={(e) => setHasExternalGuests(e.target.checked)}
                  className="w-4 h-4 rounded text-primary accent-primary cursor-pointer"
                />
                <span className="text-xs sm:text-sm font-medium text-on-surface">
                  Présence d'invités extérieurs à la famille directe
                </span>
              </label>

              {hasExternalGuests && (
                <input
                  type="text"
                  value={externalGuestDetails}
                  onChange={(e) => setExternalGuestDetails(e.target.value)}
                  placeholder="Noms ou précision des invités (ex: amis de passage, couple ami)..."
                  className="w-full h-10 px-3 bg-white rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              )}
            </div>
          </div>

          {/* Étape 5 : Motif & Accord de Cohabitation */}
          <div className="space-y-3">
            <label className="font-label-md text-xs font-bold text-forest-deep uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-sage-soft text-primary flex items-center justify-center text-xs font-bold">5</span>
              Motif & Charte de Cohabitation
            </label>

            <div className="space-y-1">
              <span className="text-xs text-on-surface-variant font-medium">Titre ou objet du séjour</span>
              <input
                type="text"
                value={stayTitle}
                onChange={(e) => setStayTitle(e.target.value)}
                placeholder="Ex: Vacances d'été, week-end bricolage, retrouvailles..."
                className="w-full h-11 px-3 bg-canvas-slate rounded-xl border border-slate-300 font-label-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="p-3.5 rounded-xl bg-sage-soft/70 border border-emerald-200/80 space-y-1.5">
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={cohabitationAgreement}
                  onChange={(e) => setCohabitationAgreement(e.target.checked)}
                  className="w-4 h-4 rounded text-primary accent-primary cursor-pointer mt-0.5 shrink-0"
                />
                <span className="text-xs text-emerald-950 font-medium leading-relaxed">
                  <strong>Accord de cohabitation bienveillante :</strong> Je confirme respecter les règles de partage des pièces communes et la libération des chambres non réservées pour les autres associés.
                </span>
              </label>
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 font-label-md text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
            >
              Annuler
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 rounded-xl bg-white border-2 border-emerald-600 text-emerald-800 hover:bg-emerald-50 hover:text-emerald-950 font-label-md text-xs sm:text-sm font-bold shadow-sm hover:shadow transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <span className="inline-block w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></span>
              ) : (
                <span className="material-symbols-outlined text-[18px]">check_circle</span>
              )}
              <span>{isEditMode ? 'Mettre à jour le séjour' : 'Confirmer la réservation du séjour'}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
