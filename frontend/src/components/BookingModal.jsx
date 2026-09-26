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

const FAMILY_MEMBERS = [
  { id: 'frederic', name: 'Frédéric Jamet', role: 'Usufruitier', initials: 'FJ', color: 'bg-emerald-800 text-white' },
  { id: 'elisabeth', name: 'Élisabeth Jamet', role: 'Usufruitière', initials: 'ÉJ', color: 'bg-teal-700 text-white' },
  { id: 'henri', name: 'Henri Jamet', role: 'Gérant', initials: 'HJ', color: 'bg-forest-deep text-white' },
  { id: 'josephine', name: 'Joséphine Jamet', role: 'Coordinatrice', initials: 'JJ', color: 'bg-amber-rich text-white' },
  { id: 'hortense', name: 'Hortense Jamet', role: 'Associée', initials: 'HJ', color: 'bg-lime-700 text-white' },
  { id: 'marguerite', name: 'Marguerite Jamet', role: 'Associée', initials: 'MJ', color: 'bg-teal-800 text-white' },
  { id: 'eugenie', name: 'Eugénie Jamet', role: 'Associée', initials: 'EJ', color: 'bg-amber-700 text-white' },
];

const ROOMS = [
  {
    id: 'rosing_haut_droite',
    name: 'Chambre Haut Droite',
    house: 'rosing',
    capacity: '2 personnes',
    assignment: 'Chambre de Marguerite',
  },
  {
    id: 'rosing_haut_gauche',
    name: 'Chambre Haut Gauche',
    house: 'rosing',
    capacity: '2 personnes',
    assignment: "Chambre d'Hortense",
  },
  {
    id: 'presb_bas',
    name: 'Chambre du bas',
    house: 'presbytere',
    capacity: '3 personnes',
    assignment: 'Chambre de Eugénie',
  },
  {
    id: 'presb_mezzanine',
    name: 'La Mezzanine',
    house: 'presbytere',
    capacity: '3 personnes',
    assignment: 'Chambre de Joséphine',
  },
  {
    id: 'presb_couloir_1',
    name: 'Première Chambre du Couloir',
    house: 'presbytere',
    capacity: '2 personnes',
    assignment: 'Ancienne chambre de Hortense',
  },
  {
    id: 'presb_couloir_2',
    name: 'Deuxième Chambre du Couloir',
    house: 'presbytere',
    capacity: '2 personnes',
    assignment: 'Chambre de Henri',
  },
  {
    id: 'presb_parentale',
    name: 'Suite',
    house: 'presbytere',
    capacity: '2 personnes',
    assignment: 'Chambre des parents',
  },
];

function resolveCurrentUserFullName(currentUser) {
  if (typeof currentUser === 'string' && currentUser.trim()) {
    const match = ASSOCIATES_LIST.find(
      (a) => a.toLowerCase().includes(currentUser.toLowerCase()) || currentUser.toLowerCase().includes(a.toLowerCase().split(' ')[0])
    );
    return match || currentUser;
  }
  if (currentUser && typeof currentUser === 'object') {
    if (currentUser.fullName) return currentUser.fullName;
    if (currentUser.prenom) {
      const match = ASSOCIATES_LIST.find((a) =>
        a.toLowerCase().includes(currentUser.prenom.toLowerCase())
      );
      return match || `${currentUser.prenom} Jamet`;
    }
    if (currentUser.name) return currentUser.name;
  }
  try {
    const stored = localStorage.getItem('sci_user');
    if (stored) {
      const match = ASSOCIATES_LIST.find((a) =>
        a.toLowerCase().includes(stored.toLowerCase())
      );
      return match || stored;
    }
  } catch (e) {
    // ignore
  }
  return 'Henri Jamet';
}

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
  const loggedInUserName = resolveCurrentUserFullName(currentUser);
  const isEditMode = Boolean(initialReservation && initialReservation.id);
  const applicant = (isEditMode && initialReservation?.user_name) ? initialReservation.user_name : loggedInUserName;

  const [selectedHouse, setSelectedHouse] = useState('all'); // 'all' | 'rosing' | 'presbytere'
  const [selectedRooms, setSelectedRooms] = useState([]); // Annotation 1 : Zéro chambre sélectionnée par défaut

  const [startDate, setStartDate] = useState('2026-08-10');
  const [endDate, setEndDate] = useState('2026-08-17');
  const [arrivalTime, setArrivalTime] = useState('15:00');
  const [departureTime, setDepartureTime] = useState('11:00');

  // Annotation 4 : Pas d'associé déclarant manuel, Intitulé + Description facultative
  const [stayTitle, setStayTitle] = useState('Séjour estival en famille');
  const [description, setDescription] = useState('');

  // Annotation 3 : Sélecteur multiple pour membres et chips pour invités
  const [selectedMembers, setSelectedMembers] = useState([loggedInUserName]);
  const [externalGuests, setExternalGuests] = useState([]);
  const [guestInputValue, setGuestInputValue] = useState('');

  const [cohabitationAgreement, setCohabitationAgreement] = useState(true);
  const [notes, setNotes] = useState('');

  // Contrôles domotiques d'anticipation
  const [poolHeating, setPoolHeating] = useState(false);
  const [presbytereHeating, setPresbytereHeating] = useState(false);
  const [presbytereHeatingManual, setPresbytereHeatingManual] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (initialReservation) {
      if (initialReservation.start_date) setStartDate(initialReservation.start_date);
      if (initialReservation.end_date) setEndDate(initialReservation.end_date);
      const isSingleDay = initialReservation.start_date && initialReservation.end_date && initialReservation.start_date === initialReservation.end_date;
      if (initialReservation.arrival_time) {
        setArrivalTime(initialReservation.arrival_time);
      } else if (isSingleDay) {
        setArrivalTime('10:00');
      }
      if (initialReservation.departure_time) {
        setDepartureTime(initialReservation.departure_time);
      } else if (isSingleDay) {
        setDepartureTime('18:00');
      }
      if (initialReservation.title) setStayTitle(initialReservation.title);

      // Décomposition intelligente des notes
      let rawNotes = initialReservation.notes || '';
      let parsedMembers = [];
      let parsedGuests = [];

      const membresMatch = rawNotes.match(/\[Membres:\s*([^\]]+)\]/i);
      if (membresMatch) {
        parsedMembers = membresMatch[1].split(',').map((s) => s.trim()).filter(Boolean);
        rawNotes = rawNotes.replace(membresMatch[0], '');
      }

      const invitesMatch = rawNotes.match(/\[Invités:\s*([^\]]+)\]/i);
      if (invitesMatch) {
        parsedGuests = invitesMatch[1].split(',').map((s) => s.trim()).filter(Boolean);
        rawNotes = rawNotes.replace(invitesMatch[0], '');
      }

      if (rawNotes.toLowerCase().includes('piscine')) {
        setPoolHeating(true);
      }
      if (rawNotes.toLowerCase().includes('presbytère') || rawNotes.toLowerCase().includes('presbytere')) {
        setPresbytereHeating(true);
        setPresbytereHeatingManual(true);
      }

      const domotiqueMatch = rawNotes.match(/\[Domotique:\s*([^\]]+)\]/i);
      if (domotiqueMatch) {
        rawNotes = rawNotes.replace(domotiqueMatch[0], '');
      }

      const parts = rawNotes.split(' • ').map((s) => s.trim()).filter(Boolean);
      if (parts.length > 0) {
        if (!initialReservation.title && parts[0]) {
          setStayTitle(parts[0]);
          if (parts[1]) setDescription(parts[1]);
          if (parts.length > 2) setNotes(parts.slice(2).join(' • '));
        } else {
          setDescription(parts[0]);
          if (parts.length > 1) setNotes(parts.slice(1).join(' • '));
        }
      } else {
        setNotes('');
        setDescription('');
      }

      if (parsedMembers.length > 0) {
        setSelectedMembers(parsedMembers);
      } else if (initialReservation.user_name) {
        setSelectedMembers([initialReservation.user_name]);
      } else {
        setSelectedMembers([loggedInUserName]);
      }

      setExternalGuests(parsedGuests);

      if (Array.isArray(initialReservation.selected_rooms) && initialReservation.selected_rooms.length > 0) {
        const normalized = initialReservation.selected_rooms.map((r) => (r === 'Suite Parentale' ? 'Suite' : r));
        setSelectedRooms(normalized);
        const hasPresb = normalized.some((rName) => {
          const found = ROOMS.find((r) => r.name === rName);
          return found ? found.house === 'presbytere' : false;
        });
        if (hasPresb && !presbytereHeatingManual) {
          setPresbytereHeating(true);
        }
      } else {
        setSelectedRooms([]);
      }

      if (typeof initialReservation.accepts_extra_family === 'boolean') {
        setCohabitationAgreement(initialReservation.accepts_extra_family);
      }
    } else {
      setStartDate('2026-08-10');
      setEndDate('2026-08-17');
      setArrivalTime('15:00');
      setDepartureTime('11:00');
      setStayTitle('Séjour estival en famille');
      setDescription('');
      setSelectedMembers([loggedInUserName]);
      setExternalGuests([]);
      setGuestInputValue('');
      setCohabitationAgreement(true);
      setNotes('');
      setSelectedRooms([]); // Annotation 1 : ZÉRO CHAMBRE SÉLECTIONNÉE PAR DÉFAUT
      setPoolHeating(false);
      setPresbytereHeating(false);
      setPresbytereHeatingManual(false);
    }
  }, [initialReservation, isOpen, loggedInUserName]);

  if (!isOpen) return null;

  const { week_number, year } = getISOWeekAndYear(startDate);

  const toggleRoom = (roomName) => {
    let nextRooms;
    if (selectedRooms.includes(roomName)) {
      nextRooms = selectedRooms.filter((r) => r !== roomName);
    } else {
      nextRooms = [...selectedRooms, roomName];
    }
    setSelectedRooms(nextRooms);

    // Asservissement Chauffage Presbytère :
    // Passage auto à 20°C si chambres Presbytère sélectionnées, maintien à 12°C sinon
    const hasPresb = nextRooms.some((rName) => {
      const found = ROOMS.find((r) => r.name === rName);
      return found ? found.house === 'presbytere' : false;
    });

    if (!presbytereHeatingManual) {
      setPresbytereHeating(hasPresb);
    } else if (!hasPresb) {
      setPresbytereHeating(false);
      setPresbytereHeatingManual(false);
    }
  };

  const handleAddGuest = (e) => {
    if (e) e.preventDefault();
    const trimmed = guestInputValue.trim();
    if (trimmed && !externalGuests.includes(trimmed)) {
      setExternalGuests([...externalGuests, trimmed]);
      setGuestInputValue('');
    }
  };

  const handleRemoveGuest = (guestName) => {
    setExternalGuests(externalGuests.filter((g) => g !== guestName));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!startDate || !endDate) {
      setError("Veuillez sélectionner les dates d'arrivée et de départ.");
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      setError("La date de départ doit être postérieure ou égale à la date d'arrivée.");
      return;
    }
    if (startDate === endDate && arrivalTime && departureTime && departureTime <= arrivalTime) {
      setError("Pour une réservation sur une seule journée, l'heure de départ doit être postérieure à l'heure d'arrivée.");
      return;
    }
    if (!cohabitationAgreement) {
      setError("Veuillez accepter la charte de cohabitation bienveillante du domaine.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const hasPresb = selectedRooms.some((rName) => {
        const found = ROOMS.find((r) => r.name === rName);
        return found ? found.house === 'presbytere' : false;
      });
      const hasRosing = selectedRooms.some((rName) => {
        const found = ROOMS.find((r) => r.name === rName);
        return found ? found.house === 'rosing' : false;
      });

      const resolvedPropertyId = hasPresb && !hasRosing ? 2 : 1;
      const resolvedPropertyName = hasPresb && hasRosing
        ? 'Rosing & Presbytère'
        : (resolvedPropertyId === 2 ? 'Le Presbytère' : 'Villa Rosing');

      // Notes enrichies avec les consignes domotiques et participants
      const domotiqueTags = [];
      if (poolHeating) {
        domotiqueTags.push('Préchauffage Piscine 27°C');
      }
      if (presbytereHeating) {
        domotiqueTags.push('Chauffage Presbytère 20°C');
      } else if (hasPresb) {
        domotiqueTags.push('Chauffage Presbytère Hors-gel 12°C');
      }

      const notesParts = [];
      if (stayTitle && stayTitle.trim()) notesParts.push(stayTitle.trim());
      if (description && description.trim()) notesParts.push(description.trim());
      if (notes && notes.trim()) notesParts.push(notes.trim());
      if (selectedMembers.length > 0) {
        notesParts.push(`[Membres: ${selectedMembers.join(', ')}]`);
      }
      if (externalGuests.length > 0) {
        notesParts.push(`[Invités: ${externalGuests.join(', ')}]`);
      }
      if (domotiqueTags.length > 0) {
        notesParts.push(`[Domotique: ${domotiqueTags.join(' • ')}]`);
      }

      const totalOccupants = selectedMembers.length + externalGuests.length;

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
        guest_count: totalOccupants > 0 ? totalOccupants : 1,
        chambers_used: selectedRooms.length,
        selected_rooms: selectedRooms,
        rooms_count: selectedRooms.length,
        accepts_extra_family: cohabitationAgreement,
        notes: notesParts.join(' • '),
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

  const rosingRooms = ROOMS.filter((r) => r.house === 'rosing');
  const presbytereRooms = ROOMS.filter((r) => r.house === 'presbytere');
  const totalOccupants = selectedMembers.length + externalGuests.length;

  return (
    <div
      aria-modal="true"
      role="dialog"
      className="fixed inset-0 z-50 bg-inverse-surface/45 backdrop-blur-sm flex items-center justify-center p-gutter-mobile md:p-gutter overflow-y-auto"
    >
      <div className="w-full max-w-[780px] my-auto bg-surface-container-lowest rounded-lg shadow-[0_20px_48px_-12px_rgba(15,23,42,0.20)] p-space-md md:p-space-lg relative overflow-hidden flex flex-col max-h-[92vh] border border-border-subtle animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <header className="flex items-start justify-between pb-space-sm border-b border-border-subtle/80 shrink-0">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-sage-soft text-primary-container flex items-center justify-center shrink-0 shadow-sm">
              <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: '"FILL" 1' }}>
                calendar_month
              </span>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-headline-md text-headline-md text-on-surface tracking-tight">
                  {isEditMode ? 'Modifier la réservation du séjour' : 'Réserver un Séjour au Domaine'}
                </h1>
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="font-body-md text-xs text-on-surface-variant">
                  {isEditMode
                    ? 'Mise à jour des dates, participants, chambres et options domotiques'
                    : "Formulaire d'attribution des chambres, dates et participants"}
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-surface-container-low text-forest-deep text-xs font-medium border border-border-subtle">
                  <span className="material-symbols-outlined text-[13px] text-primary-container">person</span>
                  Déclarant : <strong className="font-semibold">{applicant}</strong>
                </span>
              </div>
            </div>
          </div>
          <button
            aria-label="Fermer la boîte de dialogue"
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors cursor-pointer"
            type="button"
          >
            <span className="material-symbols-outlined text-[24px]">close</span>
          </button>
        </header>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-space-md overflow-y-auto flex-1 py-space-sm pr-1 text-on-surface font-body-md text-body-md">
          
          {error && (
            <div className="p-3.5 rounded-DEFAULT bg-error-container text-on-error-container text-xs sm:text-sm flex items-center gap-2.5 border border-error/20">
              <span className="material-symbols-outlined text-[20px] text-error shrink-0">error</span>
              <span>{error}</span>
            </div>
          )}

          {/* SECTION 1: Intitulé du séjour & Description facultative (Parité Stitch) */}
          <section className="flex flex-col gap-space-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm">
              <div className="flex flex-col gap-1.5">
                <label className="font-label-lg text-label-lg text-on-surface flex items-center gap-2" htmlFor="stay-title">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-surface-container-high text-forest-deep text-xs font-bold">1</span>
                  Intitulé du séjour
                </label>
                <input
                  id="stay-title"
                  type="text"
                  value={stayTitle}
                  onChange={(e) => setStayTitle(e.target.value)}
                  placeholder="Ex: Vacances de Pâques, Retrouvailles..."
                  className="w-full h-11 px-3.5 bg-surface-container-lowest text-on-surface font-body-md text-body-md rounded-DEFAULT border-2 border-border-subtle focus:border-primary-container focus:outline-none transition-all placeholder:text-on-surface-variant/60"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-label-lg text-label-lg text-on-surface flex items-center gap-2" htmlFor="stay-description">
                  Description facultative du séjour
                </label>
                <input
                  id="stay-description"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Télétravail et taille des haies..."
                  className="w-full h-11 px-3.5 bg-surface-container-lowest text-on-surface font-body-md text-body-md rounded-DEFAULT border-2 border-border-subtle focus:border-primary-container focus:outline-none transition-all placeholder:text-on-surface-variant/60"
                />
              </div>
            </div>
          </section>

          {/* SECTION 2: Dates & Heures */}
          <section className="flex flex-col gap-space-xs">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="font-label-lg text-label-lg text-on-surface flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-surface-container-high text-forest-deep text-xs font-bold">2</span>
                Dates & Heures du séjour <span className="text-error">*</span>
              </label>
              <span className="px-2.5 py-0.5 rounded-full bg-sage-soft text-primary-container text-xs font-bold border border-sage-border">
                Semaine {week_number} • {year}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm">
              {/* Arrivée */}
              <div className="p-space-sm rounded-DEFAULT bg-surface-container-low flex flex-col gap-space-xs border border-border-subtle/50">
                <div className="flex items-center justify-between">
                  <span className="font-label-md text-label-md text-forest-deep flex items-center gap-1.5 font-semibold">
                    <span className="material-symbols-outlined text-primary-container text-[18px]">flight_land</span>
                    Arrivée au domaine
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  <div className="col-span-3">
                    <label className="sr-only" htmlFor="date-arrivee">Date d'arrivée</label>
                    <input
                      id="date-arrivee"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full h-11 px-3 bg-surface-container-lowest text-on-surface font-body-md text-body-md rounded-DEFAULT border border-border-subtle focus:border-primary-container focus:outline-none transition-colors"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="sr-only" htmlFor="heure-arrivee">Heure d'arrivée</label>
                    <input
                      id="heure-arrivee"
                      type="time"
                      value={arrivalTime}
                      onChange={(e) => setArrivalTime(e.target.value)}
                      className="w-full h-11 px-3 bg-surface-container-lowest text-on-surface font-body-md text-body-md rounded-DEFAULT border border-border-subtle focus:border-primary-container focus:outline-none transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Départ */}
              <div className="p-space-sm rounded-DEFAULT bg-surface-container-low flex flex-col gap-space-xs border border-border-subtle/50">
                <div className="flex items-center justify-between">
                  <span className="font-label-md text-label-md text-forest-deep flex items-center gap-1.5 font-semibold">
                    <span className="material-symbols-outlined text-primary-container text-[18px]">flight_takeoff</span>
                    Départ du domaine
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  <div className="col-span-3">
                    <label className="sr-only" htmlFor="date-depart">Date de départ</label>
                    <input
                      id="date-depart"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full h-11 px-3 bg-surface-container-lowest text-on-surface font-body-md text-body-md rounded-DEFAULT border border-border-subtle focus:border-primary-container focus:outline-none transition-colors"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="sr-only" htmlFor="heure-depart">Heure de départ</label>
                    <input
                      id="heure-depart"
                      type="time"
                      value={departureTime}
                      onChange={(e) => setDepartureTime(e.target.value)}
                      className="w-full h-11 px-3 bg-surface-container-lowest text-on-surface font-body-md text-body-md rounded-DEFAULT border border-border-subtle focus:border-primary-container focus:outline-none transition-colors"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 3: Sélection des Demeures & Chambres requises */}
          <section className="flex flex-col gap-space-xs">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="font-label-lg text-label-lg text-on-surface flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-surface-container-high text-forest-deep text-xs font-bold">3</span>
                Sélection des Demeures & Chambres requises
              </label>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-lg border border-border-subtle">
                  <button
                    type="button"
                    onClick={() => setSelectedHouse('all')}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                      selectedHouse === 'all'
                        ? 'bg-primary-container text-white shadow-xs'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    Toutes
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedHouse('rosing')}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                      selectedHouse === 'rosing'
                        ? 'bg-primary-container text-white shadow-xs'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    Rosing
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedHouse('presbytere')}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                      selectedHouse === 'presbytere'
                        ? 'bg-primary-container text-white shadow-xs'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    Presbytère
                  </button>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-sage-soft text-primary-container font-label-sm text-xs font-semibold border border-sage-border">
                  {selectedRooms.length} / {ROOMS.length} chambres sélectionnées
                </span>
              </div>
            </div>

            <div className={`grid grid-cols-1 ${selectedHouse === 'all' ? 'lg:grid-cols-2' : ''} gap-space-sm items-start`}>
              {/* Villa Rosing */}
              {(selectedHouse === 'all' || selectedHouse === 'rosing') && (
                <div className="p-space-sm bg-canvas-slate rounded-DEFAULT border border-border-subtle flex flex-col gap-2.5">
                  <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary-container">villa</span>
                      <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">Villa Rosing</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-surface-container-lowest text-on-surface-variant font-label-sm text-xs border border-border-subtle">
                      {rosingRooms.length} chambres
                    </span>
                  </div>
                  {rosingRooms.map((room) => {
                    const isChecked = selectedRooms.includes(room.name);
                    return (
                      <label
                        key={room.id}
                        className={`flex items-start gap-3 p-2.5 rounded-DEFAULT cursor-pointer border transition-all select-none ${
                          isChecked
                            ? 'bg-sage-soft/70 border-primary-container/40 text-forest-deep shadow-xs'
                            : 'bg-surface-container-lowest border-border-subtle/60 text-on-surface hover:bg-sage-soft/20'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleRoom(room.name)}
                          className="room-checkbox mt-1 w-5 h-5 rounded accent-primary-container cursor-pointer shrink-0"
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="font-label-md text-label-md text-on-surface font-semibold">{room.name}</span>
                          <span className="font-body-md text-xs text-on-surface-variant leading-tight mt-0.5">{room.capacity}</span>
                          <span className="font-body-md text-xs text-forest-deep/80 font-medium leading-tight">{room.assignment}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Le Presbytère */}
              {(selectedHouse === 'all' || selectedHouse === 'presbytere') && (
                <div className="p-space-sm bg-canvas-slate rounded-DEFAULT border border-border-subtle flex flex-col gap-2.5">
                  <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary-container">cottage</span>
                      <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">Le Presbytère</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-surface-container-lowest text-on-surface-variant font-label-sm text-xs border border-border-subtle">
                      {presbytereRooms.length} chambres
                    </span>
                  </div>
                  {presbytereRooms.map((room) => {
                    const isChecked = selectedRooms.includes(room.name);
                    return (
                      <label
                        key={room.id}
                        className={`flex items-start gap-3 p-2.5 rounded-DEFAULT cursor-pointer border transition-all select-none ${
                          isChecked
                            ? 'bg-sage-soft/70 border-primary-container/40 text-forest-deep shadow-xs'
                            : 'bg-surface-container-lowest border-border-subtle/60 text-on-surface hover:bg-sage-soft/20'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleRoom(room.name)}
                          className="room-checkbox mt-1 w-5 h-5 rounded accent-primary-container cursor-pointer shrink-0"
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="font-label-md text-label-md text-on-surface font-semibold">{room.name}</span>
                          <span className="font-body-md text-xs text-on-surface-variant leading-tight mt-0.5">{room.capacity}</span>
                          <span className="font-body-md text-xs text-forest-deep/80 font-medium leading-tight">{room.assignment}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* SECTION 4: Énergie & Confort Thermique (Anticipation de Séjour) */}
          <section className="flex flex-col gap-space-xs">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="font-label-lg text-label-lg text-on-surface flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-surface-container-high text-forest-deep text-xs font-bold">4</span>
                Énergie & Confort Thermique (Anticipation de Séjour)
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Switch 1 : Préchauffage Piscine */}
              <div className="p-3.5 rounded-DEFAULT bg-surface-container-low/70 border border-border-subtle flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-label-md text-label-md text-forest-deep flex items-center gap-1.5 font-semibold">
                    <span className="material-symbols-outlined text-[20px] text-primary-container">pool</span>
                    Option Bassin & Piscine (Villa Rosing)
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    poolHeating
                      ? 'bg-sage-soft text-primary-container border border-sage-border'
                      : 'bg-surface-container-high text-on-surface-variant border border-border-subtle'
                  }`}>
                    {poolHeating ? 'Préchauffage programmé (27°C)' : 'Éteinte (Standard)'}
                  </span>
                </div>
                <label
                  htmlFor="pool-heater-checkbox"
                  className={`flex items-start gap-2.5 p-2.5 rounded-DEFAULT border cursor-pointer transition-all select-none ${
                    poolHeating
                      ? 'bg-sage-soft/60 border-primary-container/40 hover:bg-sage-soft'
                      : 'bg-surface-container-lowest border-border-subtle hover:border-outline'
                  }`}
                >
                  <input
                    id="pool-heater-checkbox"
                    type="checkbox"
                    checked={poolHeating}
                    onChange={(e) => setPoolHeating(e.target.checked)}
                    className="mt-0.5 w-5 h-5 rounded accent-primary-container cursor-pointer shrink-0"
                  />
                  <div className="flex flex-col min-w-0">
                    <span className={`font-label-md text-label-md font-semibold ${poolHeating ? 'text-forest-deep' : 'text-on-surface'}`}>
                      Préchauffage Piscine
                    </span>
                    <span className="font-body-md text-xs text-on-surface-variant mt-0.5">
                      Activation consigne confort 27°C avant l'arrivée au domaine.
                    </span>
                  </div>
                </label>
              </div>

              {/* Switch 2 : Asservissement Chauffage Presbytère */}
              <div className="p-3.5 rounded-DEFAULT bg-surface-container-low/70 border border-border-subtle flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-label-md text-label-md text-forest-deep flex items-center gap-1.5 font-semibold">
                    <span className="material-symbols-outlined text-[20px] text-primary-container">thermostat</span>
                    Chauffage du Presbytère (Mise en route auto)
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    presbytereHeating
                      ? 'bg-sage-soft text-primary-container border border-sage-border'
                      : 'bg-surface-container-high text-on-surface-variant border border-border-subtle'
                  }`}>
                    {presbytereHeating ? 'Automatique (20°C)' : 'Hors-gel (12°C)'}
                  </span>
                </div>
                <label
                  htmlFor="presbytere-heating-checkbox"
                  className={`flex items-start gap-2.5 p-2.5 rounded-DEFAULT border cursor-pointer transition-all select-none ${
                    presbytereHeating
                      ? 'bg-sage-soft/60 border-primary-container/40 hover:bg-sage-soft'
                      : 'bg-surface-container-lowest border-border-subtle hover:border-outline'
                  }`}
                >
                  <input
                    id="presbytere-heating-checkbox"
                    type="checkbox"
                    checked={presbytereHeating}
                    onChange={(e) => {
                      setPresbytereHeating(e.target.checked);
                      setPresbytereHeatingManual(true);
                    }}
                    className="mt-0.5 w-5 h-5 rounded accent-primary-container cursor-pointer shrink-0"
                  />
                  <div className="flex flex-col min-w-0">
                    <span className={`font-label-md text-label-md font-semibold ${presbytereHeating ? 'text-forest-deep' : 'text-on-surface'}`}>
                      Asservissement Chauffage Presbytère
                    </span>
                    <span className="font-body-md text-xs text-on-surface-variant mt-0.5">
                      Passage auto à 20°C si chambres Presbytère sélectionnées, maintien à 12°C sinon.
                    </span>
                  </div>
                </label>
              </div>
            </div>
          </section>

          {/* SECTION 5: Composition du groupe & Invités extérieurs (Parité Stitch) */}
          <section className="flex flex-col gap-space-xs">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="font-label-lg text-label-lg text-on-surface flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-surface-container-high text-forest-deep text-xs font-bold">5</span>
                Composition du groupe & Invités extérieurs
              </label>
              <span className="px-2.5 py-0.5 rounded-full bg-sage-soft text-primary-container text-xs font-bold border border-sage-border">
                {totalOccupants} occupant{totalOccupants > 1 ? 's' : ''} au total
              </span>
            </div>

            <div className="p-space-sm rounded-DEFAULT bg-surface-container-low/70 border border-border-subtle flex flex-col gap-space-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md items-start">
                
                {/* Colonne 1 : Membres de la famille présents (Sélecteur multiple) */}
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-label-md text-label-md text-on-surface font-semibold">
                      Membres de la famille présents
                    </span>
                    <span className="text-xs text-on-surface-variant font-medium">
                      {selectedMembers.length} associé{selectedMembers.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5 max-h-[280px] overflow-y-auto pr-1">
                    {FAMILY_MEMBERS.map((member) => {
                      const isChecked = selectedMembers.includes(member.name);
                      return (
                        <label
                          key={member.id}
                          className={`flex items-center justify-between p-2.5 rounded-DEFAULT cursor-pointer transition-colors border select-none ${
                            isChecked
                              ? 'bg-sage-soft/60 border-primary-container/40 text-forest-deep shadow-xs'
                              : 'bg-surface-container-lowest border-border-subtle/70 text-on-surface hover:bg-surface-container-low/60'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${member.color}`}>
                              {member.initials}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="font-label-md text-label-md leading-tight font-medium">
                                {member.name}
                              </span>
                              <span className="font-body-md text-xs text-on-surface-variant">
                                {member.role}
                              </span>
                            </div>
                          </div>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setSelectedMembers(selectedMembers.filter((m) => m !== member.name));
                              } else {
                                setSelectedMembers([...selectedMembers, member.name]);
                              }
                            }}
                            className="w-5 h-5 rounded accent-primary-container cursor-pointer shrink-0"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Colonne 2 : Invités extérieurs (Input + Chips) */}
                <div className="flex flex-col gap-2.5">
                  <div className="flex flex-col">
                    <span className="font-label-md text-label-md text-on-surface font-semibold">
                      Invités extérieurs à la SCI
                    </span>
                    <span className="font-body-md text-xs text-on-surface-variant">
                      Amis, proches ou artisans hors associés
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={guestInputValue}
                      onChange={(e) => setGuestInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddGuest();
                        }
                      }}
                      placeholder="Prénom ou Nom de l'invité..."
                      className="flex-1 h-11 px-3.5 bg-surface-container-lowest text-on-surface font-body-md text-body-md rounded-DEFAULT border border-border-subtle focus:border-primary-container focus:outline-none transition-colors placeholder:text-on-surface-variant/60 min-w-0"
                    />
                    <button
                      type="button"
                      onClick={handleAddGuest}
                      className="h-11 px-4 rounded-DEFAULT bg-sage-soft hover:bg-primary-container hover:text-white text-primary-container font-label-md text-label-md border border-sage-border flex items-center gap-1 transition-all shrink-0 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[20px]">add</span>
                      Ajouter
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1 min-h-[44px] items-center p-2 rounded-DEFAULT bg-surface-container-lowest/80 border border-border-subtle/60">
                    {externalGuests.length === 0 ? (
                      <span className="text-xs text-on-surface-variant/60 italic">
                        Aucun invité externe ajouté
                      </span>
                    ) : (
                      externalGuests.map((guest, idx) => (
                        <span
                          key={`${guest}-${idx}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-lowest border border-border-subtle text-on-surface font-label-sm text-xs sm:text-sm shadow-xs animate-in fade-in zoom-in-95 duration-150"
                        >
                          <span className="material-symbols-outlined text-[16px] text-primary-container">
                            person
                          </span>
                          <span className="truncate max-w-[140px] sm:max-w-[180px]">{guest}</span>
                          <button
                            type="button"
                            aria-label={`Retirer ${guest}`}
                            onClick={() => handleRemoveGuest(guest)}
                            className="w-4 h-4 rounded-full inline-flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-error-container transition-colors ml-0.5 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[14px]">close</span>
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                </div>

              </div>
            </div>
          </section>

          {/* SECTION 6: Cohabitation & Notes logistiques */}
          <section className="flex flex-col gap-space-xs">
            <label className="font-label-lg text-label-lg text-on-surface flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-surface-container-high text-forest-deep text-xs font-bold">6</span>
              Cohabitation & Notes logistiques
            </label>

            {/* Option Cohabitation Conviviale */}
            <label className="flex items-start gap-3 p-3.5 rounded-DEFAULT bg-sage-soft/60 border border-sage-border cursor-pointer hover:bg-sage-soft transition-colors select-none">
              <input
                type="checkbox"
                checked={cohabitationAgreement}
                onChange={(e) => setCohabitationAgreement(e.target.checked)}
                className="mt-1 w-5 h-5 rounded accent-primary-container cursor-pointer shrink-0"
              />
              <div className="flex flex-col">
                <span className="font-label-md text-label-md text-forest-deep font-semibold">
                  J'accepte la cohabitation avec d'autres associés de la famille sur les chambres libres
                </span>
                <span className="font-body-md text-xs text-on-surface-variant mt-0.5">
                  Facilite les passages simultanés en respectant l'intimité de chaque aile du domaine.
                </span>
              </div>
            </label>

            {/* Champ Notes & Précisions Logistiques (stay-notes) */}
            <div className="flex flex-col gap-1.5 pt-1">
              <label className="font-label-md text-label-md text-on-surface font-semibold flex items-center gap-1.5" htmlFor="stay-notes">
                <span className="material-symbols-outlined text-[18px] text-primary-container">edit_note</span>
                Précisions logistiques & Besoins spécifiques
              </label>
              <textarea
                id="stay-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Heure d'arrivée estimée, besoins spécifiques, présence d'enfants en bas âge, animaux de compagnie..."
                className="w-full p-3 bg-surface-container-lowest text-on-surface font-body-md text-body-md rounded-DEFAULT border-2 border-border-subtle focus:border-primary-container focus:outline-none transition-colors resize-none placeholder:text-on-surface-variant/60"
              />
            </div>
          </section>

          {/* Modal Footer / Boutons d'action */}
          <footer className="flex items-center justify-end gap-3 pt-space-sm border-t border-border-subtle/80 flex-wrap shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="h-[52px] px-6 rounded-full bg-surface-container-lowest border-2 border-border-subtle hover:border-outline text-on-surface font-label-lg text-label-lg inline-flex items-center gap-2 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">cancel</span>
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="h-[52px] px-7 rounded-full bg-surface-container-lowest border-2 border-primary-container hover:bg-sage-soft active:bg-primary-fixed text-primary-container font-label-lg text-label-lg inline-flex items-center gap-2 transition-all shadow-sm cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <span className="inline-block w-5 h-5 border-2 border-primary-container border-t-transparent rounded-full animate-spin"></span>
              ) : (
                <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: '"FILL" 1' }}>
                  check_circle
                </span>
              )}
              {isEditMode ? 'Mettre à jour le séjour' : 'Confirmer la réservation du séjour'}
            </button>
          </footer>

        </form>

      </div>
    </div>
  );
}
