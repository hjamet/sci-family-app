import React, { useState, useEffect, useRef } from 'react';
import { createReservation, updateReservation, deleteReservation } from '../api';

function formatYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getDefaultWeekendRange() {
  const now = new Date();
  const day = now.getDay(); // 0: Dimanche, 1: Lundi, ..., 5: Vendredi, 6: Samedi
  let daysUntilFriday = (5 - day + 7) % 7;
  // Si nous sommes vendredi et qu'il est déjà 18h ou plus, basculer sur le vendredi de la semaine suivante
  if (daysUntilFriday === 0 && now.getHours() >= 18) {
    daysUntilFriday = 7;
  }
  const friday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilFriday);
  const sunday = new Date(friday.getFullYear(), friday.getMonth(), friday.getDate() + 2);
  return {
    startDate: formatYMD(friday),
    endDate: formatYMD(sunday),
    arrivalTime: '18:00',
    departureTime: '18:00',
  };
}

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

export function resolveSafeUserName(val) {
  if (!val) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'object') {
    if (typeof val.fullName === 'string' && val.fullName.trim()) return val.fullName.trim();
    if (typeof val.name === 'string' && val.name.trim()) return val.name.trim();
    if (typeof val.prenom === 'string' && val.prenom.trim()) {
      return `${val.prenom.trim()} Jamet`;
    }
    if (typeof val.username === 'string' && val.username.trim()) return val.username.trim();
  }
  return String(val || '').trim();
}

export function normalizeTimeInput(val, fallback = '15:00') {
  if (!val) return fallback;
  const str = typeof val === 'string' ? val.trim().toLowerCase() : String(val);
  const cleaned = str.replace('h', ':');
  if (/^\d{1,2}:\d{2}$/.test(cleaned)) {
    const [h, m] = cleaned.split(':');
    return `${h.padStart(2, '0')}:${m}`;
  }
  return fallback;
}

function resolveCurrentUserFullName(currentUser) {
  if (typeof currentUser === 'string' && currentUser.trim()) {
    try {
      const parsed = JSON.parse(currentUser);
      if (parsed && typeof parsed === 'object') {
        return resolveCurrentUserFullName(parsed);
      }
    } catch (_) {
      // Format chaîne simple
    }
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
    if (currentUser.username) return currentUser.username;
  }
  try {
    const stored = localStorage.getItem('sci_user');
    if (stored) {
      try {
        const parsedStored = JSON.parse(stored);
        if (parsedStored && typeof parsedStored === 'object') {
          return resolveCurrentUserFullName(parsedStored);
        }
      } catch (_) {
        // Format chaîne simple
      }
      const match = ASSOCIATES_LIST.find((a) =>
        a.toLowerCase().includes(stored.toLowerCase()) || stored.toLowerCase().includes(a.toLowerCase().split(' ')[0])
      );
      return match || stored;
    }
  } catch (e) {
    // ignore
  }
  return 'Henri Jamet';
}

class BookingErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Erreur capturée dans BookingModal:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div 
          className="fixed inset-0 top-0 left-0 right-0 bottom-0 m-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-rose-200 dark:border-rose-800 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-3xl">calendar_month</span>
            </div>
            <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100">
              Réservation de séjour sécurisée
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Un incident de rendu a été intercepté pour protéger l'intégrité de la session.
            </p>
            {this.state.error?.message && (
              <p className="text-[11px] font-mono text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-lg border border-rose-200 dark:border-rose-900 break-words max-h-24 overflow-y-auto text-left">
                {this.state.error.message}
              </p>
            )}
            <div className="pt-2 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  if (this.props.onClose) this.props.onClose();
                }}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs sm:text-sm transition-colors cursor-pointer"
              >
                Fermer la fenêtre
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function BookingModalContent({
  isOpen,
  onClose,
  initialWeek,
  initialYear = 2026,
  properties,
  currentUser = 'Henri Jamet',
  onBooked,
  initialReservation = null,
}) {
  const loggedInUserName = resolveSafeUserName(resolveCurrentUserFullName(currentUser)) || 'Henri Jamet';
  const isEditMode = Boolean(initialReservation && initialReservation.id);
  const applicant = resolveSafeUserName(isEditMode ? initialReservation?.user_name : loggedInUserName) || loggedInUserName;

  const normalizeStr = (str) =>
    (str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();

  const isCoordinator =
    normalizeStr(loggedInUserName).includes('henri') ||
    normalizeStr(loggedInUserName).includes('josephine') ||
    (typeof currentUser === 'object' && (currentUser?.role === 'Gérant' || currentUser?.role === 'Coordinatrice' || currentUser?.role === 'Coordinateur' || currentUser?.is_admin || currentUser?.isAdmin));

  const isOwner = !isEditMode || (
    initialReservation?.user_name &&
    (normalizeStr(loggedInUserName) === normalizeStr(initialReservation.user_name) ||
     normalizeStr(loggedInUserName).includes(normalizeStr(initialReservation.user_name)) ||
     normalizeStr(initialReservation.user_name).includes(normalizeStr(loggedInUserName)))
  );
  const isReadOnly = isEditMode && !isOwner && !isCoordinator;
  const authorName = initialReservation?.user_name || 'un autre associé';

  const todayStr = formatYMD(new Date());
  const defaultWeekend = getDefaultWeekendRange();

  const [selectedHouse, setSelectedHouse] = useState('all'); // 'all' | 'rosing' | 'presbytere'
  const [selectedRooms, setSelectedRooms] = useState([]); // Annotation 1 : Zéro chambre sélectionnée par défaut

  // Annotation 3 : Dates calculées dynamiquement au prochain week-end (Ven 18h00 - Dim 18h00)
  const [startDate, setStartDate] = useState(defaultWeekend.startDate);
  const [endDate, setEndDate] = useState(defaultWeekend.endDate);
  const [arrivalTime, setArrivalTime] = useState(defaultWeekend.arrivalTime);
  const [departureTime, setDepartureTime] = useState(defaultWeekend.departureTime);

  // Annotation 2 & 4 : Intitulé vide par défaut en mode création, Description facultative
  const [stayTitle, setStayTitle] = useState('');
  const [description, setDescription] = useState('');

  // Annotation 3 : Sélecteur multiple pour membres et chips pour invités
  const [selectedMembers, setSelectedMembers] = useState([loggedInUserName]);
  const [externalGuests, setExternalGuests] = useState([]);
  const [guestInputValue, setGuestInputValue] = useState('');

  // Annotation 1 : Régime de cohabitation à 3 options ('total' | 'other_building' | 'exclusive')
  const [cohabitationType, setCohabitationType] = useState('total');
  const [notes, setNotes] = useState('');

  // Contrôles domotiques d'anticipation
  const [poolHeating, setPoolHeating] = useState(false);
  const [presbytereHeating, setPresbytereHeating] = useState(false);
  const [presbytereHeatingManual, setPresbytereHeatingManual] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Annotation 9 : Mémorisation des valeurs initiales et confirmation de fermeture si dirty
  const initialSnapshotRef = useRef(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const isFormDirty = () => {
    if (isReadOnly) return false;
    if (!initialSnapshotRef.current) return false;
    const currentSnapshot = JSON.stringify({
      startDate,
      endDate,
      arrivalTime,
      departureTime,
      stayTitle: (stayTitle || '').trim(),
      description: (description || '').trim(),
      selectedRooms: [...(selectedRooms || [])].sort(),
      selectedMembers: [...(selectedMembers || [])].sort(),
      externalGuests: [...(externalGuests || [])].sort(),
      cohabitationType,
      notes: (notes || '').trim(),
      poolHeating: Boolean(poolHeating),
      presbytereHeating: Boolean(presbytereHeating),
    });
    return currentSnapshot !== initialSnapshotRef.current;
  };

  const handleSafeClose = () => {
    if (isFormDirty()) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleSafeClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isOpen,
    startDate,
    endDate,
    arrivalTime,
    departureTime,
    stayTitle,
    description,
    selectedRooms,
    selectedMembers,
    externalGuests,
    cohabitationType,
    notes,
    poolHeating,
    presbytereHeating,
    isReadOnly,
  ]);

  const rosingRooms = ROOMS.filter((r) => r.house === 'rosing');
  const presbytereRooms = ROOMS.filter((r) => r.house === 'presbytere');
  const safeSelectedRooms = Array.isArray(selectedRooms) ? selectedRooms : [];
  const hasSelectedRosing = safeSelectedRooms.some((rName) => {
    const found = ROOMS.find((r) => r.name === rName);
    return found ? found.house === 'rosing' : false;
  });
  const hasSelectedPresb = safeSelectedRooms.some((rName) => {
    const found = ROOMS.find((r) => r.name === rName);
    return found ? found.house === 'presbytere' : false;
  });
  const isOtherBuildingDisabled = hasSelectedRosing && hasSelectedPresb;

  useEffect(() => {
    if (isOtherBuildingDisabled && cohabitationType === 'other_building') {
      setCohabitationType('total');
    }
  }, [isOtherBuildingDisabled, cohabitationType]);

  useEffect(() => {
    if (initialReservation) {
      const initStart = initialReservation.start_date || defaultWeekend.startDate;
      const initEnd = initialReservation.end_date || defaultWeekend.endDate;
      const isSingleDay = initStart && initEnd && initStart === initEnd;
      const initArrival = normalizeTimeInput(initialReservation.arrival_time, isSingleDay ? '10:00' : '15:00');
      const initDeparture = normalizeTimeInput(initialReservation.departure_time, isSingleDay ? '18:00' : '11:00');

      setStartDate(initStart);
      setEndDate(initEnd);
      setArrivalTime(initArrival);
      setDepartureTime(initDeparture);

      let initTitle = initialReservation.title || '';
      let initDesc = '';
      let initNotes = '';

      // Décomposition intelligente des notes
      let rawNotes = typeof initialReservation.notes === 'string' ? initialReservation.notes : (initialReservation.notes ? String(initialReservation.notes) : '');
      let parsedMembers = [];
      let parsedGuests = [];

      const membresMatch = rawNotes.match(/\[Membres:\s*([^\]]+)\]/i);
      if (membresMatch) {
        parsedMembers = membresMatch[1].split(',').map((s) => resolveSafeUserName(s)).filter(Boolean);
        rawNotes = rawNotes.replace(membresMatch[0], '');
      }

      const invitesMatch = rawNotes.match(/\[Invités:\s*([^\]]+)\]/i);
      if (invitesMatch) {
        parsedGuests = invitesMatch[1].split(',').map((s) => String(s || '').trim()).filter(Boolean);
        rawNotes = rawNotes.replace(invitesMatch[0], '');
      }

      let initPool = false;
      if (rawNotes.toLowerCase().includes('piscine')) {
        initPool = true;
        setPoolHeating(true);
      }
      let initPresb = false;
      if (rawNotes.toLowerCase().includes('presbytère') || rawNotes.toLowerCase().includes('presbytere')) {
        initPresb = true;
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
          initTitle = parts[0];
          setStayTitle(parts[0]);
          if (parts[1]) {
            initDesc = parts[1];
            setDescription(parts[1]);
          }
          if (parts.length > 2) {
            initNotes = parts.slice(2).join(' • ');
            setNotes(initNotes);
          }
        } else {
          initDesc = parts[0];
          setDescription(parts[0]);
          if (parts.length > 1) {
            initNotes = parts.slice(1).join(' • ');
            setNotes(initNotes);
          }
        }
      } else {
        setNotes('');
        setDescription('');
      }

      let initMembers = [loggedInUserName];
      if (Array.isArray(parsedMembers) && parsedMembers.length > 0) {
        initMembers = parsedMembers;
        setSelectedMembers(parsedMembers);
      } else if (initialReservation.user_name) {
        initMembers = [resolveSafeUserName(initialReservation.user_name)];
        setSelectedMembers(initMembers);
      } else {
        setSelectedMembers([loggedInUserName]);
      }

      setExternalGuests(Array.isArray(parsedGuests) ? parsedGuests : []);

      // Résolution et parsing défensif de selected_rooms (gère Array, chaîne JSON ou liste virgules)
      let roomsArray = [];
      const rawRooms = initialReservation.selected_rooms;
      if (Array.isArray(rawRooms)) {
        roomsArray = rawRooms;
      } else if (typeof rawRooms === 'string' && rawRooms.trim()) {
        try {
          const parsed = JSON.parse(rawRooms);
          if (Array.isArray(parsed)) roomsArray = parsed;
          else roomsArray = [rawRooms.trim()];
        } catch (_) {
          roomsArray = rawRooms.split(',').map((s) => s.trim()).filter(Boolean);
        }
      }

      let normalizedRooms = [];
      if (roomsArray.length > 0) {
        normalizedRooms = roomsArray.map((r) => (r === 'Suite Parentale' ? 'Suite' : String(r).trim()));
        setSelectedRooms(normalizedRooms);
        const hasPresb = normalizedRooms.some((rName) => {
          const found = ROOMS.find((r) => r.name === rName);
          return found ? found.house === 'presbytere' : false;
        });
        if (hasPresb && !presbytereHeatingManual) {
          initPresb = true;
          setPresbytereHeating(true);
        }
      } else {
        setSelectedRooms([]);
      }

      let initCohabitation = 'total';
      if (initialReservation.cohabitation_type) {
        initCohabitation = initialReservation.cohabitation_type;
        setCohabitationType(initialReservation.cohabitation_type);
      } else if (initialReservation.accepts_extra_family === false) {
        initCohabitation = 'exclusive';
        setCohabitationType('exclusive');
      } else {
        setCohabitationType('total');
      }

      // Enregistrement de l'instantané initial pour détection des modifications non enregistrées
      initialSnapshotRef.current = JSON.stringify({
        startDate: initStart,
        endDate: initEnd,
        arrivalTime: initArrival,
        departureTime: initDeparture,
        stayTitle: (initTitle || '').trim(),
        description: (initDesc || '').trim(),
        selectedRooms: [...normalizedRooms].sort(),
        selectedMembers: [...initMembers].sort(),
        externalGuests: [...(Array.isArray(parsedGuests) ? parsedGuests : [])].sort(),
        cohabitationType: initCohabitation,
        notes: (initNotes || '').trim(),
        poolHeating: Boolean(initPool),
        presbytereHeating: Boolean(initPresb),
      });
    } else {
      const def = getDefaultWeekendRange();
      setStartDate(def.startDate);
      setEndDate(def.endDate);
      setArrivalTime(def.arrivalTime);
      setDepartureTime(def.departureTime);
      setStayTitle('');
      setDescription('');
      setSelectedMembers([loggedInUserName]);
      setExternalGuests([]);
      setGuestInputValue('');
      setCohabitationType('total');
      setNotes('');
      setSelectedRooms([]); // Annotation 1 : ZÉRO CHAMBRE SÉLECTIONNÉE PAR DÉFAUT
      setPoolHeating(false);
      setPresbytereHeating(false);
      setPresbytereHeatingManual(false);

      // Enregistrement de l'instantané initial pour détection des modifications en mode création
      initialSnapshotRef.current = JSON.stringify({
        startDate: def.startDate,
        endDate: def.endDate,
        arrivalTime: def.arrivalTime,
        departureTime: def.departureTime,
        stayTitle: '',
        description: '',
        selectedRooms: [],
        selectedMembers: [loggedInUserName].sort(),
        externalGuests: [],
        cohabitationType: 'total',
        notes: '',
        poolHeating: false,
        presbytereHeating: false,
      });
    }
  }, [initialReservation, isOpen, loggedInUserName]);

  const { week_number, year } = getISOWeekAndYear(startDate);

  const toggleRoom = (roomName) => {
    const current = Array.isArray(selectedRooms) ? selectedRooms : [];
    let nextRooms;
    if (current.includes(roomName)) {
      nextRooms = current.filter((r) => r !== roomName);
    } else {
      nextRooms = [...current, roomName];
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
    const current = Array.isArray(externalGuests) ? externalGuests : [];
    const trimmed = guestInputValue.trim();
    if (trimmed && !current.includes(trimmed)) {
      setExternalGuests([...current, trimmed]);
      setGuestInputValue('');
    }
  };

  const handleRemoveGuest = (guestName) => {
    const current = Array.isArray(externalGuests) ? externalGuests : [];
    setExternalGuests(current.filter((g) => g !== guestName));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isReadOnly) return;
    if (!startDate || !endDate) {
      setError("Veuillez sélectionner les dates d'arrivée et de départ.");
      return;
    }
    // Annotation 8 : Garde-fous de date (interdiction de réserver dans le passé en création et départ >= arrivée)
    if (!isEditMode && startDate < todayStr) {
      setError("Il n'est pas possible de réserver un séjour à une date passée.");
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
    try {
      setSubmitting(true);
      setError(null);

      const safeRooms = Array.isArray(selectedRooms) ? selectedRooms : [];
      const hasPresb = safeRooms.some((rName) => {
        const found = ROOMS.find((r) => r.name === rName);
        return found ? found.house === 'presbytere' : false;
      });
      const hasRosing = safeRooms.some((rName) => {
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
      const safeMembers = Array.isArray(selectedMembers) ? selectedMembers : [];
      const safeGuests = Array.isArray(externalGuests) ? externalGuests : [];
      if (safeMembers.length > 0) {
        notesParts.push(`[Membres: ${safeMembers.join(', ')}]`);
      }
      if (safeGuests.length > 0) {
        notesParts.push(`[Invités: ${safeGuests.join(', ')}]`);
      }
      if (domotiqueTags.length > 0) {
        notesParts.push(`[Domotique: ${domotiqueTags.join(' • ')}]`);
      }

      const totalOccupants = safeMembers.length + safeGuests.length;

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
        chambers_used: safeRooms.length,
        selected_rooms: safeRooms,
        rooms_count: safeRooms.length,
        cohabitation_type: cohabitationType,
        accepts_extra_family: cohabitationType !== 'exclusive',
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

  const handleDeleteBooking = async () => {
    const reservationId = initialReservation?.id;
    if (!reservationId) return;

    const confirmed = window.confirm("Êtes-vous certain de vouloir annuler ce séjour ?");
    if (!confirmed) return;

    try {
      setSubmitting(true);
      setError(null);
      await deleteReservation(reservationId);
      if (onBooked) await onBooked();
      onClose();
    } catch (err) {
      console.error('Erreur annulation séjour:', err);
      setError(err.message || "Erreur lors de l'annulation du séjour.");
    } finally {
      setSubmitting(false);
    }
  };

  const safeSelectedMembers = Array.isArray(selectedMembers) ? selectedMembers : [];
  const safeExternalGuests = Array.isArray(externalGuests) ? externalGuests : [];
  const totalOccupants = safeSelectedMembers.length + safeExternalGuests.length;

  return (
    <div
      aria-modal="true"
      role="dialog"
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 m-0 z-50 bg-inverse-surface/45 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
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
                  {isReadOnly
                    ? 'Détails de la réservation du séjour'
                    : isEditMode
                    ? 'Modifier la réservation du séjour'
                    : 'Réserver un Séjour au Domaine'}
                </h1>
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="font-body-md text-xs text-on-surface-variant">
                  {isReadOnly
                    ? 'Consultation des dates, participants, chambres et options domotiques'
                    : isEditMode
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
            onClick={handleSafeClose}
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

          {/* Callout doré explicatif en tête pour consultation en lecture seule (Annotation 5) */}
          {isReadOnly && (
            <div className="p-3.5 rounded-DEFAULT bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs sm:text-sm flex items-start gap-2.5 shadow-xs">
              <span className="material-symbols-outlined text-[22px] text-amber-700 dark:text-amber-400 shrink-0 mt-0.5">
                visibility
              </span>
              <div className="flex flex-col gap-0.5">
                <span className="font-bold">Consultation en lecture seule</span>
                <span>
                  Ce séjour a été programmé par <strong>{authorName}</strong>. Vous êtes en mode consultation : les modifications et annulations sont réservées à l'auteur de la réservation.
                </span>
              </div>
            </div>
          )}

          {/* SECTION 1: Intitulé du séjour & Description facultative (Annotation 4) */}
          <section className="flex flex-col gap-space-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm">
              <div className="flex flex-col gap-1.5">
                <label className="font-label-lg text-label-lg text-on-surface flex items-center gap-2" htmlFor="stay-title">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-surface-container-high text-forest-deep text-xs font-bold">1</span>
                  <span>Intitulé du séjour <span className="text-xs font-normal text-on-surface-variant">(facultatif)</span></span>
                </label>
                <input
                  id="stay-title"
                  type="text"
                  disabled={isReadOnly}
                  value={stayTitle || ''}
                  onChange={(e) => setStayTitle(e.target.value)}
                  placeholder="Ex: Vacances de Pâques, Retrouvailles... (laisser vide pour nom de l'associé)"
                  className="w-full h-11 px-3.5 bg-surface-container-lowest text-on-surface font-body-md text-body-md rounded-DEFAULT border-2 border-border-subtle focus:border-primary-container focus:outline-none transition-all placeholder:text-on-surface-variant/60 disabled:opacity-75 disabled:cursor-not-allowed"
                />
                <span className="font-body-md text-xs text-on-surface-variant">
                  Si laissé vide, le séjour portera automatiquement le nom de l'associé ({applicant}).
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-label-lg text-label-lg text-on-surface flex items-center gap-2" htmlFor="stay-description">
                  <span>Description du séjour <span className="text-xs font-normal text-on-surface-variant">(facultatif)</span></span>
                </label>
                <input
                  id="stay-description"
                  type="text"
                  disabled={isReadOnly}
                  value={description || ''}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Télétravail et taille des haies..."
                  className="w-full h-11 px-3.5 bg-surface-container-lowest text-on-surface font-body-md text-body-md rounded-DEFAULT border-2 border-border-subtle focus:border-primary-container focus:outline-none transition-all placeholder:text-on-surface-variant/60 disabled:opacity-75 disabled:cursor-not-allowed"
                />
                <span className="font-body-md text-xs text-on-surface-variant">
                  Précisions facultatives sur l'objet ou le programme du séjour.
                </span>
              </div>
            </div>
          </section>

          {/* SECTION 2: Dates & Heures (Annotation 8) */}
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
                      disabled={isReadOnly}
                      min={isEditMode && initialReservation?.start_date && initialReservation.start_date < todayStr ? initialReservation.start_date : todayStr}
                      value={startDate || ''}
                      onChange={(e) => {
                        const newStart = e.target.value;
                        setStartDate(newStart);
                        if (endDate && newStart > endDate) {
                          setEndDate(newStart);
                        }
                      }}
                      className="w-full h-11 px-3 bg-surface-container-lowest text-on-surface font-body-md text-body-md rounded-DEFAULT border border-border-subtle focus:border-primary-container focus:outline-none transition-colors disabled:opacity-75 disabled:cursor-not-allowed"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="sr-only" htmlFor="heure-arrivee">Heure d'arrivée</label>
                    <input
                      id="heure-arrivee"
                      type="time"
                      disabled={isReadOnly}
                      value={arrivalTime || '18:00'}
                      onChange={(e) => setArrivalTime(e.target.value)}
                      className="w-full h-11 px-3 bg-surface-container-lowest text-on-surface font-body-md text-body-md rounded-DEFAULT border border-border-subtle focus:border-primary-container focus:outline-none transition-colors disabled:opacity-75 disabled:cursor-not-allowed"
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
                      disabled={isReadOnly}
                      min={startDate || todayStr}
                      value={endDate || ''}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full h-11 px-3 bg-surface-container-lowest text-on-surface font-body-md text-body-md rounded-DEFAULT border border-border-subtle focus:border-primary-container focus:outline-none transition-colors disabled:opacity-75 disabled:cursor-not-allowed"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="sr-only" htmlFor="heure-depart">Heure de départ</label>
                    <input
                      id="heure-depart"
                      type="time"
                      disabled={isReadOnly}
                      value={departureTime || '18:00'}
                      onChange={(e) => setDepartureTime(e.target.value)}
                      className="w-full h-11 px-3 bg-surface-container-lowest text-on-surface font-body-md text-body-md rounded-DEFAULT border border-border-subtle focus:border-primary-container focus:outline-none transition-colors disabled:opacity-75 disabled:cursor-not-allowed"
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
                  {safeSelectedRooms.length} / {ROOMS.length} chambres sélectionnées
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
                    const isChecked = safeSelectedRooms.includes(room.name);
                    return (
                      <label
                        key={room.id}
                        className={`flex items-start gap-3 p-2.5 rounded-DEFAULT border transition-all select-none ${
                          isReadOnly ? 'cursor-default opacity-85' : 'cursor-pointer'
                        } ${
                          isChecked
                            ? 'bg-sage-soft/70 border-primary-container/40 text-forest-deep shadow-xs'
                            : 'bg-surface-container-lowest border-border-subtle/60 text-on-surface hover:bg-sage-soft/20'
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={isReadOnly}
                          checked={isChecked}
                          onChange={() => !isReadOnly && toggleRoom(room.name)}
                          className="room-checkbox mt-1 w-5 h-5 rounded accent-primary-container cursor-pointer shrink-0 disabled:cursor-not-allowed"
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
                    const isChecked = safeSelectedRooms.includes(room.name);
                    return (
                      <label
                        key={room.id}
                        className={`flex items-start gap-3 p-2.5 rounded-DEFAULT border transition-all select-none ${
                          isReadOnly ? 'cursor-default opacity-85' : 'cursor-pointer'
                        } ${
                          isChecked
                            ? 'bg-sage-soft/70 border-primary-container/40 text-forest-deep shadow-xs'
                            : 'bg-surface-container-lowest border-border-subtle/60 text-on-surface hover:bg-sage-soft/20'
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={isReadOnly}
                          checked={isChecked}
                          onChange={() => !isReadOnly && toggleRoom(room.name)}
                          className="room-checkbox mt-1 w-5 h-5 rounded accent-primary-container cursor-pointer shrink-0 disabled:cursor-not-allowed"
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
                  className={`flex items-start gap-2.5 p-2.5 rounded-DEFAULT border transition-all select-none ${
                    isReadOnly ? 'cursor-default opacity-85' : 'cursor-pointer'
                  } ${
                    poolHeating
                      ? 'bg-sage-soft/60 border-primary-container/40 hover:bg-sage-soft'
                      : 'bg-surface-container-lowest border-border-subtle hover:border-outline'
                  }`}
                >
                  <input
                    id="pool-heater-checkbox"
                    type="checkbox"
                    disabled={isReadOnly}
                    checked={poolHeating}
                    onChange={(e) => !isReadOnly && setPoolHeating(e.target.checked)}
                    className="mt-0.5 w-5 h-5 rounded accent-primary-container cursor-pointer shrink-0 disabled:cursor-not-allowed"
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
                  className={`flex items-start gap-2.5 p-2.5 rounded-DEFAULT border transition-all select-none ${
                    isReadOnly ? 'cursor-default opacity-85' : 'cursor-pointer'
                  } ${
                    presbytereHeating
                      ? 'bg-sage-soft/60 border-primary-container/40 hover:bg-sage-soft'
                      : 'bg-surface-container-lowest border-border-subtle hover:border-outline'
                  }`}
                >
                  <input
                    id="presbytere-heating-checkbox"
                    type="checkbox"
                    disabled={isReadOnly}
                    checked={presbytereHeating}
                    onChange={(e) => {
                      if (!isReadOnly) {
                        setPresbytereHeating(e.target.checked);
                        setPresbytereHeatingManual(true);
                      }
                    }}
                    className="mt-0.5 w-5 h-5 rounded accent-primary-container cursor-pointer shrink-0 disabled:cursor-not-allowed"
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
                      {safeSelectedMembers.length} associé{safeSelectedMembers.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5 max-h-[280px] overflow-y-auto pr-1">
                    {FAMILY_MEMBERS.map((member) => {
                      const isChecked = safeSelectedMembers.includes(member.name);
                      return (
                        <label
                          key={member.id}
                          className={`flex items-center justify-between p-2.5 rounded-DEFAULT select-none transition-colors border ${
                            isReadOnly ? 'cursor-default opacity-85' : 'cursor-pointer'
                          } ${
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
                            disabled={isReadOnly}
                            checked={isChecked}
                            onChange={() => {
                              if (isReadOnly) return;
                              if (isChecked) {
                                setSelectedMembers(safeSelectedMembers.filter((m) => m !== member.name));
                              } else {
                                setSelectedMembers([...safeSelectedMembers, member.name]);
                              }
                            }}
                            className="w-5 h-5 rounded accent-primary-container cursor-pointer shrink-0 disabled:cursor-not-allowed"
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
                      disabled={isReadOnly}
                      value={guestInputValue || ''}
                      onChange={(e) => setGuestInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (!isReadOnly) handleAddGuest();
                        }
                      }}
                      placeholder="Prénom ou Nom de l'invité..."
                      className="flex-1 h-11 px-3.5 bg-surface-container-lowest text-on-surface font-body-md text-body-md rounded-DEFAULT border border-border-subtle focus:border-primary-container focus:outline-none transition-colors placeholder:text-on-surface-variant/60 min-w-0 disabled:opacity-75 disabled:cursor-not-allowed"
                    />
                    <button
                      type="button"
                      disabled={isReadOnly}
                      onClick={handleAddGuest}
                      className="h-11 px-4 rounded-DEFAULT bg-sage-soft hover:bg-primary-container hover:text-white text-primary-container font-label-md text-label-md border border-sage-border flex items-center gap-1 transition-all shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="material-symbols-outlined text-[20px]">add</span>
                      Ajouter
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1 min-h-[44px] items-center p-2 rounded-DEFAULT bg-surface-container-lowest/80 border border-border-subtle/60">
                    {safeExternalGuests.length === 0 ? (
                      <span className="text-xs text-on-surface-variant/60 italic">
                        Aucun invité externe ajouté
                      </span>
                    ) : (
                      safeExternalGuests.map((guest, idx) => (
                        <span
                          key={`${guest}-${idx}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-lowest border border-border-subtle text-on-surface font-label-sm text-xs sm:text-sm shadow-xs animate-in fade-in zoom-in-95 duration-150"
                        >
                          <span className="material-symbols-outlined text-[16px] text-primary-container">
                            person
                          </span>
                          <span className="truncate max-w-[140px] sm:max-w-[180px]">{guest}</span>
                          {!isReadOnly && (
                            <button
                              type="button"
                              aria-label={`Retirer ${guest}`}
                              onClick={() => handleRemoveGuest(guest)}
                              className="w-4 h-4 rounded-full inline-flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-error-container transition-colors ml-0.5 cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[14px]">close</span>
                            </button>
                          )}
                        </span>
                      ))
                    )}
                  </div>
                </div>

              </div>
            </div>
          </section>

          {/* SECTION 6: Régime de cohabitation & Notes logistiques */}
          <section className="flex flex-col gap-space-xs">
            <label className="font-label-lg text-label-lg text-on-surface flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-surface-container-high text-forest-deep text-xs font-bold">6</span>
              Régime de cohabitation & Notes logistiques
            </label>

            {/* 3 Options Horizontales de Cohabitation */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Option 1 : Cohabitation Totale */}
              <button
                type="button"
                disabled={isReadOnly}
                onClick={() => !isReadOnly && setCohabitationType('total')}
                className={`flex flex-col items-start p-3.5 rounded-DEFAULT text-left border-2 transition-all ${
                  isReadOnly ? 'cursor-default' : 'cursor-pointer'
                } ${
                  cohabitationType === 'total'
                    ? 'bg-sage-soft/80 border-primary-container shadow-xs text-forest-deep'
                    : 'bg-surface-container-lowest border-border-subtle hover:bg-surface-container-low/50 text-on-surface'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1.5">
                  <div className="flex items-center gap-2 font-label-md text-label-md font-semibold">
                    <span className="material-symbols-outlined text-[20px] text-primary-container">groups</span>
                    <span>Totale</span>
                  </div>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    cohabitationType === 'total' ? 'border-primary-container' : 'border-border-subtle'
                  }`}>
                    {cohabitationType === 'total' && <div className="w-2 h-2 rounded-full bg-primary-container" />}
                  </div>
                </div>
                <p className="font-body-md text-xs text-on-surface-variant leading-snug">
                  Rosings & Presbytère ouverts aux autres associés sur les chambres libres.
                </p>
              </button>

              {/* Option 2 : Autre bâtiment uniquement */}
              <div className="relative group flex flex-col">
                <button
                  type="button"
                  disabled={isOtherBuildingDisabled || isReadOnly}
                  onClick={() => !isOtherBuildingDisabled && !isReadOnly && setCohabitationType('other_building')}
                  className={`flex-1 flex flex-col items-start p-3.5 rounded-DEFAULT text-left border-2 transition-all w-full ${
                    isOtherBuildingDisabled || isReadOnly
                      ? 'bg-surface-container-low/40 border-border-subtle/50 text-on-surface-variant/50 cursor-not-allowed opacity-60'
                      : cohabitationType === 'other_building'
                      ? 'bg-sage-soft/80 border-primary-container shadow-xs text-forest-deep cursor-pointer'
                      : 'bg-surface-container-lowest border-border-subtle hover:bg-surface-container-low/50 text-on-surface cursor-pointer'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1.5">
                    <div className="flex items-center gap-2 font-label-md text-label-md font-semibold">
                      <span className="material-symbols-outlined text-[20px] text-primary-container">cottage</span>
                      <span>Autre bâtiment</span>
                    </div>
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      cohabitationType === 'other_building' ? 'border-primary-container' : 'border-border-subtle'
                    }`}>
                      {cohabitationType === 'other_building' && <div className="w-2 h-2 rounded-full bg-primary-container" />}
                    </div>
                  </div>
                  <p className="font-body-md text-xs text-on-surface-variant leading-snug">
                    Cohabitation restreinte à l'autre maison uniquement.
                  </p>
                  {isOtherBuildingDisabled && (
                    <span className="mt-1.5 text-[11px] text-amber-700 font-medium">
                      Indisponible (chambres dans les deux maisons)
                    </span>
                  )}
                </button>
                {isOtherBuildingDisabled && (
                  <div className="hidden group-hover:block absolute -top-10 left-1/2 -translate-x-1/2 bg-forest-deep text-white text-xs px-2.5 py-1.5 rounded shadow-lg whitespace-nowrap z-20 pointer-events-none">
                    Indisponible : vous occupez déjà des chambres dans Rosings et le Presbytère.
                  </div>
                )}
              </div>

              {/* Option 3 : Exclusif (Privatisation) */}
              <button
                type="button"
                disabled={isReadOnly}
                onClick={() => !isReadOnly && setCohabitationType('exclusive')}
                className={`flex flex-col items-start p-3.5 rounded-DEFAULT text-left border-2 transition-all ${
                  isReadOnly ? 'cursor-default' : 'cursor-pointer'
                } ${
                  cohabitationType === 'exclusive'
                    ? 'bg-amber-50 border-amber-600 shadow-xs text-amber-900'
                    : 'bg-surface-container-lowest border-border-subtle hover:bg-surface-container-low/50 text-on-surface'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1.5">
                  <div className="flex items-center gap-2 font-label-md text-label-md font-semibold">
                    <span className="material-symbols-outlined text-[20px] text-amber-700">lock</span>
                    <span>Exclusif</span>
                  </div>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    cohabitationType === 'exclusive' ? 'border-amber-600' : 'border-border-subtle'
                  }`}>
                    {cohabitationType === 'exclusive' && <div className="w-2 h-2 rounded-full bg-amber-600" />}
                  </div>
                </div>
                <p className="font-body-md text-xs text-on-surface-variant leading-snug">
                  Privatisation du domaine entier. Charge corvées calculée sur les 7 chambres.
                </p>
              </button>
            </div>

            {/* Champ Notes & Précisions Logistiques (stay-notes) */}
            <div className="flex flex-col gap-1.5 pt-1">
              <label className="font-label-md text-label-md text-on-surface font-semibold flex items-center gap-1.5" htmlFor="stay-notes">
                <span className="material-symbols-outlined text-[18px] text-primary-container">edit_note</span>
                Précisions logistiques & Besoins spécifiques
              </label>
              <textarea
                id="stay-notes"
                rows={3}
                disabled={isReadOnly}
                value={notes || ''}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Heure d'arrivée estimée, besoins spécifiques, présence d'enfants en bas âge, animaux de compagnie..."
                className="w-full p-3 bg-surface-container-lowest text-on-surface font-body-md text-body-md rounded-DEFAULT border-2 border-border-subtle focus:border-primary-container focus:outline-none transition-colors resize-none placeholder:text-on-surface-variant/60 disabled:opacity-75 disabled:cursor-not-allowed"
              />
            </div>
          </section>

          {/* Modal Footer / Boutons d'action (Annotation 5 & 7) */}
          <footer className="flex items-center justify-between gap-3 pt-space-sm border-t border-border-subtle/80 flex-wrap shrink-0">
            {isReadOnly ? (
              <div className="w-full flex justify-end">
                <button
                  type="button"
                  onClick={handleSafeClose}
                  className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold inline-flex items-center gap-2 transition-all shadow-sm active:scale-95 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                  Fermer
                </button>
              </div>
            ) : (
              <>
                <div>
                  {isEditMode && (
                    <button
                      type="button"
                      onClick={handleDeleteBooking}
                      disabled={submitting}
                      className="px-5 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 shadow-sm active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                      Annuler ce séjour
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3 ml-auto">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2.5 rounded-xl bg-surface-container-lowest border-2 border-primary-container hover:bg-sage-soft active:bg-primary-fixed text-primary-container text-sm font-semibold inline-flex items-center gap-2 transition-all shadow-sm active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? (
                      <span className="inline-block w-4 h-4 border-2 border-primary-container border-t-transparent rounded-full animate-spin"></span>
                    ) : (
                      <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: '"FILL" 1' }}>
                        check_circle
                      </span>
                    )}
                    {isEditMode ? 'Mettre à jour le séjour' : 'Confirmer la réservation du séjour'}
                  </button>
                </div>
              </>
            )}
          </footer>

        </form>

        {/* Modale de confirmation Quitter sans enregistrer si dirty (Annotation 9) */}
        {showDiscardConfirm && (
          <div
            className="fixed inset-0 top-0 left-0 right-0 bottom-0 m-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
            role="dialog"
            aria-modal="true"
          >
            <div className="bg-surface-container-lowest rounded-2xl p-6 max-w-md w-full shadow-2xl border border-border-subtle space-y-4 animate-in zoom-in-95 duration-150">
              <div className="flex items-center gap-3 text-amber-700 dark:text-amber-400">
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[24px]">warning</span>
                </div>
                <h3 className="font-bold text-base text-on-surface">
                  Modifications non enregistrées
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">
                Vous avez modifié des informations sans les enregistrer. Voulez-vous vraiment quitter sans enregistrer vos modifications ?
              </p>
              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowDiscardConfirm(false)}
                  className="px-4 py-2.5 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface font-semibold text-xs sm:text-sm transition-colors cursor-pointer"
                >
                  Continuer la saisie
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDiscardConfirm(false);
                    onClose();
                  }}
                  className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs sm:text-sm transition-colors cursor-pointer shadow-sm active:scale-95"
                >
                  Quitter sans enregistrer
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default function BookingModal(props) {
  if (!props.isOpen) return null;
  return (
    <BookingErrorBoundary onClose={props.onClose}>
      <BookingModalContent {...props} />
    </BookingErrorBoundary>
  );
}
