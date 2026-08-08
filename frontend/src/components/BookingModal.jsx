import React, { useState, useEffect } from 'react';
import { X, Calendar as CalendarIcon, Info, Users, CheckSquare, AlertCircle, Building2 } from 'lucide-react';
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

export default function BookingModal({ isOpen, onClose, initialWeek, initialYear, properties, currentUser, onBooked }) {
  const [selectedHouses, setSelectedHouses] = useState(['Villa Rosing']);
  const [startDate, setStartDate] = useState('2026-08-10');
  const [endDate, setEndDate] = useState('2026-08-16');
  const [guestCount, setGuestCount] = useState(2);
  const [acceptsExtraFamily, setAcceptsExtraFamily] = useState(true);
  const [userName, setUserName] = useState(currentUser || 'Henri');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (currentUser) setUserName(currentUser);
  }, [currentUser]);

  if (!isOpen) return null;

  const toggleHouse = (houseName) => {
    if (selectedHouses.includes(houseName)) {
      if (selectedHouses.length === 1) return; // keep at least 1 checked
      setSelectedHouses(selectedHouses.filter(h => h !== houseName));
    } else {
      setSelectedHouses([...selectedHouses, houseName]);
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
    if (selectedHouses.length === 0) {
      setError('Veuillez sélectionner au moins une maison (Villa Rosing ou Le Presbytère).');
      return;
    }
    setSubmitting(true);
    setError('');

    try {
      const { year, week_number } = getISOWeekAndYear(startDate);

      const propertyName = selectedHouses.length === 2
        ? "Villa Rosing & Le Presbytère"
        : selectedHouses[0];

      const propId = selectedHouses.includes("Villa Rosing") ? 1 : 2;

      await createReservation({
        property_id: propId,
        property_name: propertyName,
        properties: selectedHouses,
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

  const { year: calculatedYear, week_number: calculatedWeek } = getISOWeekAndYear(startDate);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6 sm:p-7 shadow-2xl relative text-slate-900 dark:text-slate-100">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-5">
          <div className="flex items-center space-x-3">
            <div className="p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
              <CalendarIcon className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">Réserver / Déclarer un Séjour</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Gestion des résidences familiales SCI</p>
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
          
          {/* Property Checkboxes (Requirement 4) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wider">
              Choix de la / des Propriété(s) *
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className={`flex items-center space-x-3 p-3 rounded-xl border cursor-pointer transition ${
                selectedHouses.includes('Villa Rosing')
                  ? 'bg-indigo-50/80 dark:bg-indigo-950/60 border-indigo-500 text-indigo-950 dark:text-indigo-200 font-bold'
                  : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
              }`}>
                <input
                  type="checkbox"
                  checked={selectedHouses.includes('Villa Rosing')}
                  onChange={() => toggleHouse('Villa Rosing')}
                  className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700 cursor-pointer"
                />
                <div className="text-xs">
                  <span className="block font-bold">Villa Rosing</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">8 rue Ancienne Mairie</span>
                </div>
              </label>

              <label className={`flex items-center space-x-3 p-3 rounded-xl border cursor-pointer transition ${
                selectedHouses.includes('Le Presbytère')
                  ? 'bg-indigo-50/80 dark:bg-indigo-950/60 border-indigo-500 text-indigo-950 dark:text-indigo-200 font-bold'
                  : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
              }`}>
                <input
                  type="checkbox"
                  checked={selectedHouses.includes('Le Presbytère')}
                  onChange={() => toggleHouse('Le Presbytère')}
                  className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700 cursor-pointer"
                />
                <div className="text-xs">
                  <span className="block font-bold">Le Presbytère</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">4 rue Ancienne Mairie</span>
                </div>
              </label>
            </div>
          </div>

          {/* Date Range Selectors (Requirement 4: start_date & end_date) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
                Date d'arrivée (`start_date`) *
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
                Date de départ (`end_date`) *
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

          {/* Guest Count (`guest_count`) & Applicant Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
                Nombre de personnes (`guest_count`) *
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
                Membre / Associé
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

          {/* Checkbox: accepts_extra_family (Requirement 4) */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center space-x-3">
            <input
              type="checkbox"
              id="accepts_extra_family"
              checked={acceptsExtraFamily}
              onChange={(e) => setAcceptsExtraFamily(e.target.checked)}
              className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700 cursor-pointer"
            />
            <label htmlFor="accepts_extra_family" className="text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer leading-snug">
              J'accepte d'autres membres de la famille en plus (`accepts_extra_family`)
            </label>
          </div>

          {/* Calculated ISO Week Info Card */}
          <div className="bg-indigo-50 dark:bg-indigo-950/40 rounded-xl p-3 border border-indigo-200 dark:border-indigo-800/60 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2 text-indigo-900 dark:text-indigo-300">
              <Info className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span>Semaine ISO enregistrée :</span>
            </div>
            <span className="font-extrabold text-indigo-700 dark:text-indigo-300">
              Semaine {calculatedWeek} ({calculatedYear})
            </span>
          </div>

          {/* Guest Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
              Notes & Précisions (Optionnel)
            </label>
            <textarea
              rows={2}
              placeholder="ex: Arrivée le vendredi soir, besoin des draps du grand lit..."
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
