import React, { useState, useEffect } from 'react';
import { X, Calendar as CalendarIcon, Info, Users, CheckSquare, AlertCircle, Home } from 'lucide-react';
import { createReservation } from '../api';

function getISOWeekAndYear(dateStr) {
  if (!dateStr) return { year: 2026, week_number: 1 };
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { year: 2026, week_number: 1 };
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

export const EXACT_SCI_ROOMS = [
  // Le Presbytère (5 chambres)
  { id: "presbytere_1", name: "Suite parentale Presbytère", property: "Le Presbytère", property_id: 2, defaultUser: "Frédéric" },
  { id: "presbytere_2", name: "Chambre Henri Presbytère", property: "Le Presbytère", property_id: 2, defaultUser: "Henri" },
  { id: "presbytere_3", name: "Chambre Hortense Presbytère", property: "Le Presbytère", property_id: 2, defaultUser: "Hortense" },
  { id: "presbytere_4", name: "Chambre Joséphine Presbytère", property: "Le Presbytère", property_id: 2, defaultUser: "Joséphine" },
  { id: "presbytere_5", name: "Chambre Eugénie et Alexandre Presbytère", property: "Le Presbytère", property_id: 2, defaultUser: "Eugénie" },
  // Villa Rosings (2 chambres)
  { id: "rosing_1", name: "Chambre Marguerite Rosings", property: "Villa Rosings", property_id: 1, defaultUser: "Marguerite" },
  { id: "rosing_2", name: "Chambre Hortense Rosings", property: "Villa Rosings", property_id: 1, defaultUser: "Élisabeth" },
];

export default function BookingModal({ isOpen, onClose, initialWeek, initialYear, properties, currentUser, onBooked }) {
  const [userName, setUserName] = useState(currentUser || 'Henri');
  const [selectedRooms, setSelectedRooms] = useState([]);
  const [startDate, setStartDate] = useState('2026-08-10');
  const [endDate, setEndDate] = useState('2026-08-16');
  const [guestCount, setGuestCount] = useState(2);
  const [acceptsExtraFamily, setAcceptsExtraFamily] = useState(true);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Auto-check default room for the logged-in member
  useEffect(() => {
    const activeUser = currentUser || userName;
    setUserName(activeUser);

    let defaultRoom = 'Suite parentale Presbytère';
    if (activeUser.includes('Henri')) defaultRoom = 'Chambre Henri Presbytère';
    else if (activeUser.includes('Hortense')) defaultRoom = 'Chambre Hortense Presbytère';
    else if (activeUser.includes('Marguerite')) defaultRoom = 'Chambre Marguerite Rosings';
    else if (activeUser.includes('Eugénie')) defaultRoom = 'Chambre Eugénie et Alexandre Presbytère';
    else if (activeUser.includes('Joséphine')) defaultRoom = 'Chambre Joséphine Presbytère';
    else if (activeUser.includes('Élisabeth')) defaultRoom = 'Chambre Hortense Rosings';
    else if (activeUser.includes('Frédéric')) defaultRoom = 'Suite parentale Presbytère';

    setSelectedRooms([defaultRoom]);
  }, [currentUser, isOpen]);

  if (!isOpen) return null;

  const toggleRoom = (roomName) => {
    if (selectedRooms.includes(roomName)) {
      if (selectedRooms.length === 1) return; // Keep at least 1 room checked
      setSelectedRooms(selectedRooms.filter(r => r !== roomName));
    } else {
      setSelectedRooms([...selectedRooms, roomName]);
    }
  };

  const handleStartDateChange = (val) => {
    setStartDate(val);
    if (!endDate || endDate < val) {
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        d.setDate(d.getDate() + 6);
        setEndDate(d.toISOString().split('T')[0]);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedRooms.length === 0) {
      setError('Veuillez sélectionner au moins 1 chambre pour votre séjour.');
      return;
    }
    setSubmitting(true);
    setError('');

    try {
      const { year, week_number } = getISOWeekAndYear(startDate);

      const hasPresbytere = selectedRooms.some(r => r.includes('Presbytère'));
      const hasRosings = selectedRooms.some(r => r.includes('Rosings') || r.includes('Rosing'));

      let propertyName = "Le Presbytère";
      let propId = 2;

      if (hasPresbytere && hasRosings) {
        propertyName = "Le Presbytère & Villa Rosings";
        propId = 2;
      } else if (hasRosings) {
        propertyName = "Villa Rosings";
        propId = 1;
      }

      await createReservation({
        property_id: propId,
        property_name: propertyName,
        properties: hasPresbytere && hasRosings ? ["Le Presbytère", "Villa Rosings"] : [propertyName],
        selected_rooms: selectedRooms,
        rooms_count: selectedRooms.length,
        user_name: userName,
        year,
        week_number,
        start_date: startDate,
        end_date: endDate,
        guest_count: parseInt(guestCount, 10) || 1,
        accepts_extra_family: acceptsExtraFamily,
        notes: notes.trim() || null
      });

      onBooked();
      onClose();
    } catch (err) {
      setError(err.message || 'Erreur lors de la réservation');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 sm:p-7 shadow-2xl relative text-slate-900 dark:text-slate-100">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-5">
          <div className="flex items-center space-x-3">
            <div className="p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
              <CalendarIcon className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">Réserver / Déclarer un Séjour</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Sélection des chambres SCI Familiale</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs flex items-center space-x-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Exact 7 Rooms Selection Checkboxes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wider flex items-center justify-between">
              <span>Choix des Chambres à réserver (7 chambres SCI) *</span>
              <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-extrabold">{selectedRooms.length} chambre(s) sélectionnée(s)</span>
            </label>

            <div className="space-y-3 max-h-52 overflow-y-auto pr-1">
              
              {/* Le Presbytère Group */}
              <div className="p-3 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 space-y-2">
                <span className="text-[10px] font-black uppercase text-indigo-800 dark:text-indigo-300 tracking-wider block">
                  🏰 Le Presbytère (5 Chambres)
                </span>
                <div className="space-y-1.5">
                  {EXACT_SCI_ROOMS.filter(r => r.property === 'Le Presbytère').map((room) => {
                    const isChecked = selectedRooms.includes(room.name);
                    return (
                      <label
                        key={room.id}
                        className={`flex items-center space-x-2.5 p-2 rounded-xl border text-xs cursor-pointer transition ${
                          isChecked
                            ? 'bg-indigo-600 text-white font-bold border-indigo-600 shadow-sm'
                            : 'bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleRoom(room.name)}
                          className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700 cursor-pointer"
                        />
                        <span className="flex-1">{room.name}</span>
                        {room.defaultUser === userName && (
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/20 text-white uppercase font-extrabold">Par défaut</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Villa Rosings Group */}
              <div className="p-3 rounded-2xl bg-amber-50/50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 space-y-2">
                <span className="text-[10px] font-black uppercase text-amber-800 dark:text-amber-300 tracking-wider block">
                  🏡 Villa Rosings (2 Chambres)
                </span>
                <div className="space-y-1.5">
                  {EXACT_SCI_ROOMS.filter(r => r.property === 'Villa Rosings').map((room) => {
                    const isChecked = selectedRooms.includes(room.name);
                    return (
                      <label
                        key={room.id}
                        className={`flex items-center space-x-2.5 p-2 rounded-xl border text-xs cursor-pointer transition ${
                          isChecked
                            ? 'bg-amber-500 text-white font-bold border-amber-500 shadow-sm'
                            : 'bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleRoom(room.name)}
                          className="h-4 w-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300 dark:border-slate-700 cursor-pointer"
                        />
                        <span className="flex-1">{room.name}</span>
                        {room.defaultUser === userName && (
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/20 text-white uppercase font-extrabold">Par défaut</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>

          {/* Date Range Selectors */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
                Date d'arrivée *
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
                Date de départ *
              </label>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>
          </div>

          {/* Guest Count & Applicant Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
                Nombre d'occupants *
              </label>
              <div className="relative">
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={guestCount}
                  onChange={(e) => setGuestCount(parseInt(e.target.value, 10) || 1)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 pl-9 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
                <Users className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
                Membre Associé
              </label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>
          </div>

          {/* Checkbox: accepts_extra_family */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center space-x-3">
            <input
              type="checkbox"
              id="accepts_extra_family"
              checked={acceptsExtraFamily}
              onChange={(e) => setAcceptsExtraFamily(e.target.checked)}
              className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700 cursor-pointer"
            />
            <label htmlFor="accepts_extra_family" className="text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer leading-snug">
              J'accepte d'autres membres de la famille en co-habitation pendant mon séjour
            </label>
          </div>

          {/* Guest Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
              Précision
            </label>
            <textarea
              rows={2}
              placeholder="ex: Arrivée tardive vendredi soir..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            ></textarea>
          </div>

          {/* Submit */}
          <div className="pt-3 flex justify-end space-x-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-md transition disabled:opacity-50"
            >
              {submitting ? 'Enregistrement...' : 'Enregistrer le séjour'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
