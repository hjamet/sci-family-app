import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { BookOpen, Search, Plus, Trash2 } from 'lucide-react';
import {
  fetchVademecum,
  createVademecumItem,
  deleteVademecumItem,
  fetchHeatingStatus,
  fetchPiscineStatus,
  fetchTasks,
  fetchReservations,
  setHeatingTemperature,
  setHeatingMode as apiSetHeatingMode,
  setDhwMode,
  setDhwTemperature,
  setPoolPumpMode,
  setPoolHeatingMode,
  setPoolTemperature,
  saveHeatingSettings,
  savePoolSettings,
  validateTask,
  invalidateTask,
  getCachedData,
  parseApiError,
} from '../api';
import ThermalMasterSwitch from '../components/common/ThermalMasterSwitch';
import CategoryManageModal, { COLOR_OPTIONS, EMOJI_PRESETS } from '../components/common/CategoryManageModal';
import TaskDetailModal from '../components/TaskDetailModal';
import SelectExistingDocumentModal from '../components/SelectExistingDocumentModal';
import TaskCard from '../components/common/TaskCard';
import BookingModal from '../components/BookingModal';
import { ThermalMetricSkeleton, StayCardSkeleton } from '../components/SkeletonLoaders';
import CustomSelect from '../components/CustomSelect';
import { extractParticipants } from './CalendarPage';
import { isTaskAssignedToUser, isTaskOpen, isTaskPendingValidation, resolveUserMeta } from '../utils/taskAssignment';

const formatTelemetryAge = (ageSeconds) => {
  if (ageSeconds == null || isNaN(ageSeconds) || ageSeconds < 0) return null;
  if (ageSeconds < 120) return 'En direct (< 2 min)';
  const mins = Math.floor(ageSeconds / 60);
  if (mins < 60) return `Il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `Il y a ${hours}h${remMins > 0 ? String(remMins).padStart(2, '0') : ''}`;
};

function resolveCurrentUserFullName(user) {
  if (typeof user === 'string' && user.trim()) return user.trim();
  if (user && typeof user === 'object') {
    if (user.fullName) return user.fullName;
    if (user.prenom) return `${user.prenom} Jamet`;
    if (user.name) return user.name;
  }
  try {
    const stored = localStorage.getItem('sci_user');
    if (stored) return stored.includes('Jamet') ? stored : `${stored} Jamet`;
  } catch (_) {}
  return 'Henri Jamet';
}

function formatDateReadable(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const days = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
    const months = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
  } catch (_) {
    return dateStr;
  }
}

function formatPreheatingSchedule(stay) {
  if (!stay || !stay.start_date) return '';
  const dateFormatted = formatDateReadable(stay.start_date);
  const arrivalTime = stay.arrival_time || '15:00';
  const [arrHourStr, arrMinStr] = arrivalTime.split(':');
  const arrHour = parseInt(arrHourStr, 10);
  const preheatHour = isNaN(arrHour) ? 10 : Math.max(0, arrHour - 5);
  const preheatTime = `${String(preheatHour).padStart(2, '0')}:${arrMinStr || '00'}`;
  return `${dateFormatted} dès ${preheatTime} (5h avant arrivée)`;
}

function formatShutdownSchedule(stay) {
  if (!stay || !stay.end_date) return '';
  const dateFormatted = formatDateReadable(stay.end_date);
  const depTime = stay.departure_time || '11:00';
  return `${dateFormatted} à ${depTime} (au départ des lieux)`;
}

function formatStayCountdown(startDateStr, arrivalTimeStr = '15:00') {
  if (!startDateStr) return null;
  try {
    const parts = startDateStr.split('-').map(Number);
    if (parts.length < 3 || parts.some(isNaN)) return null;
    const [year, month, day] = parts;
    let hour = 15;
    let min = 0;
    if (arrivalTimeStr) {
      const tParts = String(arrivalTimeStr).split(':').map(Number);
      if (!isNaN(tParts[0])) hour = tParts[0];
      if (!isNaN(tParts[1])) min = tParts[1];
    }
    const targetDate = new Date(year, month - 1, day, hour, min, 0);
    const now = new Date();
    const diffMs = targetDate.getTime() - now.getTime();

    if (diffMs <= 0) {
      return 'Séjour en cours';
    }

    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    // Si moins de 7 jours : afficher le nombre d'heures (Dans X heures)
    if (diffDays < 7) {
      if (diffHours <= 1) return 'Dans 1 heure';
      return `Dans ${diffHours} heures`;
    }

    // Sinon afficher `Dans X mois et Y jours` (en n'affichant le mois que si > 0)
    let months = (targetDate.getFullYear() - now.getFullYear()) * 12 + (targetDate.getMonth() - now.getMonth());
    let days = targetDate.getDate() - now.getDate();

    if (days < 0) {
      months -= 1;
      const prevMonthLastDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), 0).getDate();
      days += prevMonthLastDay;
    }

    if (months > 0) {
      if (days > 0) {
        return `Dans ${months} mois et ${days} ${days > 1 ? 'jours' : 'jour'}`;
      }
      return `Dans ${months} mois`;
    }

    return `Dans ${diffDays} ${diffDays > 1 ? 'jours' : 'jour'}`;
  } catch (_) {
    return null;
  }
}

function formatThermalTimeSlot(dateStr, timeStr, offsetHours = 0) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const daysShort = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const dayName = daysShort[d.getDay()];

  let hour = 15;
  if (timeStr) {
    const h = parseInt(String(timeStr).split(':')[0], 10);
    if (!isNaN(h)) hour = h;
  }
  const targetHour = Math.max(0, Math.min(23, hour + offsetHours));
  return `${dayName} ${targetHour}h`;
}

function formatPureRoomName(raw) {
  if (!raw) return '';
  const idMap = {
    rosing_haut_droite: 'Chambre Haut Droite',
    rosing_haut_gauche: 'Chambre Haut Gauche',
    presb_bas: 'Chambre du bas',
    presb_mezzanine: 'La Mezzanine',
    presb_couloir_1: 'Première Chambre du Couloir',
    presb_couloir_2: 'Deuxième Chambre du Couloir',
    presb_parentale: 'Suite Parentale',
  };
  let name = idMap[raw] || raw;
  return name.replace(/\s*\([^)]*(couchage|personne)[^)]*\)/gi, '').trim();
}

export const VADEMECUM_CATEGORY_ICONS = {
  'Arrivée & Clés': '🔑',
  'Chauffage & Eau Chaude': '♨️',
  'Piscine': '🏊‍♂️',
  'Ordures Ménagères': '🗑️',
  'Wifi & Multimédia': '📶',
  'Artisans & Dépannage': '🔧',
  'Bâtiments & Réseaux Techniques': '🏛️',
  'Sécurité & Urgences': '🚨',
  'Général': '📋',
};

export const CANONICAL_VADEMECUM_CATEGORIES = [
  { id: 'cat-1', name: 'Arrivée & Clés', emoji: '🔑', color: 'amber' },
  { id: 'cat-2', name: 'Chauffage & Eau Chaude', emoji: '♨️', color: 'rose' },
  { id: 'cat-3', name: 'Piscine', emoji: '🏊‍♂️', color: 'sky' },
  { id: 'cat-4', name: 'Ordures Ménagères', emoji: '🗑️', color: 'teal' },
  { id: 'cat-5', name: 'Wifi & Multimédia', emoji: '📶', color: 'purple' },
  { id: 'cat-6', name: 'Artisans & Dépannage', emoji: '🔧', color: 'slate' },
  { id: 'cat-7', name: 'Bâtiments & Réseaux Techniques', emoji: '🏛️', color: 'emerald' },
];

// =========================================================================
// COMPOSANT ANNOTATION 3 : Graphe Annuel & Quotidien du Fioul (Josse / Bompais)
// =========================================================================
// =========================================================================
// COMPOSANT ANNOTATION 3 : Graphe Annuel & Quotidien du Fioul & Enregistrement
// =========================================================================
function FuelDeliveryModal({ isOpen, onClose, onSuccess }) {
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [liters, setLiters] = useState('');
  const [amount, setAmount] = useState('');
  const [existingDocs, setExistingDocs] = useState([]);
  const [files, setFiles] = useState([]);
  const [isSelectExistingDocOpen, setIsSelectExistingDocOpen] = useState(false);
  const fileInputRef = useRef(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const parsedLiters = parseFloat(liters);
    const parsedAmount = parseFloat(amount);

    if (isNaN(parsedLiters) || parsedLiters <= 0) {
      setError('Veuillez renseigner un volume de fioul valide (> 0 L).');
      return;
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Veuillez renseigner un montant TTC valide (> 0 €).');
      return;
    }

    try {
      setIsSubmitting(true);
      const formData = new FormData();
      formData.append('date', date);
      formData.append('liters_delivered', String(parsedLiters));
      formData.append('amount_ttc', String(parsedAmount));

      if (existingDocs.length > 0) {
        formData.append('existing_document_ids', JSON.stringify(existingDocs.map((d) => d.id)));
      }
      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          formData.append('files', files[i]);
        }
      }

      const res = await fetch('/api/heating/fuel-deliveries', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        let errMessage = "Erreur lors de l'enregistrement de la livraison";
        try {
          const errJson = await res.json();
          if (errJson.detail) errMessage = errJson.detail;
        } catch (_) {
          const txt = await res.text();
          if (txt) errMessage = txt;
        }
        throw new Error(errMessage);
      }

      if (onSuccess) {
        await onSuccess();
      }
      onClose();
    } catch (err) {
      console.error('Erreur enregistrement livraison:', err);
      setError(err.message || "Une erreur est survenue lors de l'enregistrement.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-surface-container-lowest border border-border-subtle rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative text-on-surface">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-border-subtle">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-700 text-[24px]">local_shipping</span>
              <h3 className="text-lg font-bold text-primary">Enregistrer une livraison de fioul</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs font-semibold flex items-center gap-2">
              <span className="material-symbols-outlined text-rose-600 text-[18px] shrink-0">error</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-on-surface mb-1">Date *</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full h-10 px-3 bg-canvas-slate border border-border-subtle rounded-xl text-xs text-on-surface focus:outline-none focus:border-primary"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-on-surface mb-1">Litres (L) *</label>
                <input
                  type="number"
                  placeholder="ex: 2000"
                  min="1"
                  step="1"
                  value={liters}
                  onChange={(e) => setLiters(e.target.value)}
                  className="w-full h-10 px-3 bg-canvas-slate border border-border-subtle rounded-xl text-xs text-on-surface focus:outline-none focus:border-primary"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-on-surface mb-1">Prix TTC (€) *</label>
                <input
                  type="number"
                  placeholder="ex: 2200.50"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full h-10 px-3 bg-canvas-slate border border-border-subtle rounded-xl text-xs text-on-surface focus:outline-none focus:border-primary"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-on-surface mb-2">
                Documents justificatifs (Facture PDF, Bon de livraison)
              </label>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setIsSelectExistingDocOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-container-low hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 border border-border-subtle text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">search</span>
                  <span>Associer un document existant</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-800 dark:text-emerald-300 border border-emerald-200/80 text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  <span>Ajouter un document</span>
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  multiple
                  accept=".pdf,image/*"
                  onChange={(e) => {
                    const newFiles = Array.from(e.target.files || []);
                    setFiles((prev) => [...prev, ...newFiles]);
                    e.target.value = '';
                  }}
                />
              </div>

              {/* Puces des documents sélectionnés */}
              {(existingDocs.length > 0 || files.length > 0) && (
                <div className="flex flex-wrap gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 max-h-36 overflow-y-auto">
                  {existingDocs.map((doc) => (
                    <div
                      key={`exist-${doc.id}`}
                      className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-emerald-300/80 text-xs text-forest-deep dark:text-emerald-300 font-medium shadow-2xs"
                    >
                      <span className="material-symbols-outlined text-[15px] text-emerald-600">description</span>
                      <span className="truncate max-w-[180px]" title={doc.title || doc.name || doc.filename || `Doc #${doc.id}`}>
                        {doc.title || doc.name || doc.filename || `Doc #${doc.id}`}
                      </span>
                      <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1 py-0.2 rounded">
                        Existant
                      </span>
                      <button
                        type="button"
                        onClick={() => setExistingDocs((prev) => prev.filter((d) => d.id !== doc.id))}
                        className="p-0.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                        title="Retirer ce document"
                      >
                        <span className="material-symbols-outlined text-[14px]">close</span>
                      </button>
                    </div>
                  ))}

                  {files.map((file, idx) => (
                    <div
                      key={`file-${idx}-${file.name}`}
                      className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 font-medium shadow-2xs"
                    >
                      <span className="material-symbols-outlined text-[15px] text-slate-500">upload_file</span>
                      <span className="truncate max-w-[180px]" title={file.name}>
                        {file.name}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        ({Math.round(file.size / 1024)} ko)
                      </span>
                      <button
                        type="button"
                        onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-0.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                        title="Retirer ce fichier"
                      >
                        <span className="material-symbols-outlined text-[14px]">close</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border-subtle">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-full text-xs font-semibold text-on-surface hover:bg-canvas-slate cursor-pointer disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 rounded-full bg-primary hover:bg-forest-deep text-white text-xs font-bold shadow-sm transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                    <span>Enregistrement...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[16px]">save</span>
                    <span>Enregistrer la livraison</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Modale de sélection de document existant */}
      <SelectExistingDocumentModal
        isOpen={isSelectExistingDocOpen}
        onClose={() => setIsSelectExistingDocOpen(false)}
        alreadyAttachedDocIds={existingDocs.map((d) => d.id)}
        onAttachSuccess={(selected) => {
          setExistingDocs((prev) => {
            const existingIds = new Set(prev.map((d) => d.id));
            const fresh = (selected || []).filter((s) => !existingIds.has(s.id));
            return [...prev, ...fresh];
          });
        }}
      />
    </>
  );
}

function FuelInteractiveGraph({ fuelHistory, heatingStatus, onRefreshFuel }) {
  const [activeTab, setActiveTab] = useState('annual'); // 'annual' | 'daily'
  const [isDeliveryModalOpen, setIsDeliveryModalOpen] = useState(false);

  // Tant que fuelHistory est null, conteneur fixe h-[250px] pour éviter tout saut de layout
  if (!fuelHistory) {
    return (
      <div className="mt-4 p-4 sm:p-5 bg-white dark:bg-slate-900 rounded-2xl border border-border-subtle shadow-xs flex flex-col gap-4">
        <div className="flex items-center gap-2 border-b border-border-subtle pb-3">
          <span className="material-symbols-outlined text-amber-600 text-[22px]">monitoring</span>
          <h4 className="font-headline-sm text-sm sm:text-base font-bold text-forest-deep dark:text-emerald-100">
            Télémétrie Fioul Cuve &amp; Brûleur Viessmann
          </h4>
        </div>
        <div className="w-full h-[250px] flex items-center justify-center bg-slate-50/70 dark:bg-slate-900/60 rounded-xl border border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center gap-2 text-xs text-on-surface-variant font-medium">
            <span className="material-symbols-outlined animate-spin text-[20px] text-amber-600">progress_activity</span>
            <span>Chargement de la télémétrie et historique fioul...</span>
          </div>
        </div>
      </div>
    );
  }

  const monthlyData = (fuelHistory?.monthly_history && fuelHistory.monthly_history.length > 0)
    ? fuelHistory.monthly_history
    : [];

  const dailyData = (fuelHistory?.daily_history && fuelHistory.daily_history.length > 0)
    ? fuelHistory.daily_history
    : [];

  const deliveries = (fuelHistory?.deliveries && fuelHistory.deliveries.length > 0)
    ? fuelHistory.deliveries
    : [];

  // Dimensions SVG adaptatives (Exigence #1 : stabilité géométrique h-[250px], overflow-hidden et paddingTop = 44)
  const svgWidth = 760;
  const svgHeight = 250;
  const paddingLeft = 60;
  const paddingRight = 40;
  const paddingTop = 44;
  const paddingBottom = 40;
  const plotWidth = svgWidth - paddingLeft - paddingRight;
  const plotHeight = svgHeight - paddingTop - paddingBottom;
  const maxLiters = 3000;

  const points = monthlyData.map((d, i) => {
    const rawLiters = Number(d.liters ?? d.stock_liters ?? 0);
    const clampedLiters = Math.min(maxLiters, Math.max(0, rawLiters));
    let x = paddingLeft + (monthlyData.length > 1 ? (i / (monthlyData.length - 1)) * plotWidth : plotWidth / 2);
    // Décaler légèrement en X (+4 px) le point after_delivery / delivery lorsqu'il partage la même date que pre_delivery
    if (i > 0 && monthlyData[i - 1].date === d.date && (monthlyData[i - 1].point_type === 'pre_delivery' || d.point_type === 'delivery' || d.point_type === 'after_delivery' || d.is_delivery)) {
      x = Math.min(svgWidth - paddingRight, x + 4);
    }
    const rawY = paddingTop + plotHeight * (1 - clampedLiters / maxLiters);
    const y = Math.min(svgHeight - paddingBottom, Math.max(paddingTop, rawY));
    return { ...d, liters: clampedLiters, rawLiters, x, y };
  });

  const firstTelemetryIdx = points.findIndex((p) => Boolean(p.is_telemetry));
  const historicalPoints = firstTelemetryIdx === -1
    ? points
    : points.slice(0, firstTelemetryIdx + 1);
  const telemetryPoints = firstTelemetryIdx === -1
    ? []
    : points.slice(firstTelemetryIdx);

  const pathD = points.length > 0
    ? points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`, '')
    : '';
  const areaD = points.length > 0
    ? `${pathD} L ${points[points.length - 1].x.toFixed(1)},${(paddingTop + plotHeight).toFixed(1)} L ${points[0].x.toFixed(1)},${(paddingTop + plotHeight).toFixed(1)} Z`
    : '';

  const maxDailyStarts = Math.max(...dailyData.map((d) => d.daily_starts || d.starts || 1), 20);

  const totalDelivered = deliveries.reduce((acc, d) => acc + Number(d.liters_delivered ?? d.liters ?? 0), 0);
  const remainingLiters = heatingStatus?.fuel_liters_remaining != null
    ? heatingStatus.fuel_liters_remaining
    : (fuelHistory?.calibration?.liters_remaining ?? (points.length > 0 ? points[points.length - 1].liters : 0));

  return (
    <div className="mt-4 p-4 sm:p-5 bg-white dark:bg-slate-900 rounded-2xl border border-border-subtle shadow-xs flex flex-col gap-4">
      {/* En-tête avec onglets */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-subtle pb-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-amber-600 text-[22px]">monitoring</span>
          <div>
            <h4 className="font-headline-sm text-sm sm:text-base font-bold text-forest-deep dark:text-emerald-100">
              Télémétrie Fioul Cuve &amp; Brûleur Viessmann
            </h4>
            <p className="text-[11px] text-on-surface-variant">
              Calcul temps réel asservi aux démarrages du brûleur ({heatingStatus?.burner_starts?.toLocaleString('fr-FR') || '—'} démarrages • {heatingStatus?.burner_hours?.toLocaleString('fr-FR') || '—'} h)
            </p>
          </div>
        </div>

        {/* Boutons d'onglets */}
        <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('annual')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              activeTab === 'annual'
                ? 'bg-white dark:bg-slate-900 text-forest-deep dark:text-emerald-300 font-bold shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Historique Annuel Cuve &amp; Livraisons
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('daily')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              activeTab === 'daily'
                ? 'bg-white dark:bg-slate-900 text-forest-deep dark:text-emerald-300 font-bold shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Suivi Quotidien Allumages Brûleur (0,293 L/all.)
          </button>
        </div>
      </div>

      {/* Contenu Onglet 1 : Historique Annuel Cuve & Livraisons */}
      {activeTab === 'annual' && (
        <div className="flex flex-col gap-3">
          {/* Légende bi-régime */}
          <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1.5 text-xs text-slate-600 dark:text-slate-400 px-1">
            <div className="inline-flex items-center gap-2">
              <svg width="24" height="6" className="shrink-0" aria-hidden="true">
                <line x1="0" y1="3" x2="24" y2="3" stroke="#d97706" strokeWidth="2.2" strokeDasharray="6,4" strokeLinecap="round" />
              </svg>
              <span>Livraisons &amp; jauge (avant télémétrie quotidienne)</span>
            </div>
            <div className="inline-flex items-center gap-2">
              <svg width="24" height="6" className="shrink-0" aria-hidden="true">
                <line x1="0" y1="3" x2="24" y2="3" stroke="#059669" strokeWidth="3" strokeLinecap="round" />
              </svg>
              <span className="font-medium text-emerald-800 dark:text-emerald-300">Télémétrie réelle brûleur (depuis le 17/10/2026)</span>
            </div>
          </div>

          <div className="relative w-full h-[250px] overflow-hidden rounded-xl bg-slate-50/70 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 p-2">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-full select-none"
              role="img"
              aria-label="Courbe annuelle du stock de fioul et livraisons"
            >
              <defs>
                <linearGradient id="fuelFillGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#d97706" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#d97706" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {/* Lignes de repère horizontales */}
              {[3000, 2000, 1000, 0].map((val) => {
                const y = Math.min(svgHeight - paddingBottom, Math.max(paddingTop, paddingTop + plotHeight * (1 - val / maxLiters)));
                const cm = Math.round((val / 3000) * 130);
                return (
                  <g key={val}>
                    <line
                      x1={paddingLeft}
                      y1={y}
                      x2={svgWidth - paddingRight}
                      y2={y}
                      stroke="#cbd5e1"
                      strokeDasharray={val > 0 ? "4 4" : "none"}
                      strokeWidth="1"
                    />
                    <text
                      x={paddingLeft - 8}
                      y={y + 3}
                      textAnchor="end"
                      fontSize="10"
                      fill="#64748b"
                      fontFamily="sans-serif"
                    >
                      {val} L ({cm} cm)
                    </text>
                  </g>
                );
              })}

              {/* Zone dégradée */}
              {areaD && <path d={areaD} fill="url(#fuelFillGradient)" />}

              {/* Courbes bi-régime : pointillés historiques + trait plein télémétrie */}
              {historicalPoints.length > 1 && (
                <polyline
                  fill="none"
                  stroke="#d97706"
                  strokeWidth="2.2"
                  strokeDasharray="6,4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.85"
                  points={historicalPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
                />
              )}
              {telemetryPoints.length > 1 && (
                <polyline
                  fill="none"
                  stroke="#059669"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={telemetryPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
                />
              )}

              {/* Points mensuels et badges */}
              {points.map((p, idx) => {
                const hasDelivery = Boolean(p.is_delivery || p.isDelivery || (p.delivery_liters && p.delivery_liters > 0) || p.point_type === 'delivery' || p.point_type === 'after_delivery');
                const hasCalibration = Boolean(p.is_calibration || p.isCalibration || p.point_type === 'calibration');
                const isTelemetry = Boolean(p.is_telemetry);
                const badgeY = Math.max(6, p.y - 28);
                const badgeX = Math.min(svgWidth - 140, Math.max(paddingLeft, p.x - 65));
                const shouldShowAxisLabel = p.axis_label !== "" && p.point_type !== 'pre_delivery';
                const axisLabel = p.axis_label ?? p.month ?? p.label;

                return (
                  <g key={idx}>
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={hasDelivery || hasCalibration ? "5.5" : "3.5"}
                      fill={hasDelivery ? "#059669" : (hasCalibration ? "#b45309" : (isTelemetry ? "#059669" : "#ffffff"))}
                      stroke={hasDelivery ? "#047857" : (hasCalibration ? "#92400e" : (isTelemetry ? "#059669" : "#d97706"))}
                      strokeWidth="2"
                    />
                    {/* Label sur l'axe X */}
                    {shouldShowAxisLabel && axisLabel && (
                      <text
                        x={p.x}
                        y={svgHeight - 12}
                        textAnchor="middle"
                        fontSize="9.5"
                        fill={isTelemetry ? "#065f46" : (hasDelivery || hasCalibration ? "#0f172a" : "#64748b")}
                        fontWeight={hasDelivery || hasCalibration || isTelemetry ? "bold" : "normal"}
                      >
                        {axisLabel}
                      </text>
                    )}

                    {/* Badge dynamique livraison */}
                    {hasDelivery && (
                      <g transform={`translate(${badgeX}, ${badgeY})`}>
                        <rect width="130" height="20" rx="4" fill="#065f46" />
                        <text x="65" y="13.5" fill="#ffffff" fontSize="9" fontWeight="bold" textAnchor="middle">
                          +{p.delivery_liters || p.liters_delivered || ''} L ({p.liters} L)
                        </text>
                      </g>
                    )}

                    {/* Badge dynamique calibration */}
                    {hasCalibration && !hasDelivery && (
                      <g transform={`translate(${badgeX}, ${badgeY})`}>
                        <rect width="140" height="20" rx="4" fill="#92400e" />
                        <text x="70" y="13.5" fill="#ffffff" fontSize="9" fontWeight="bold" textAnchor="middle">
                          {p.liters} L ({p.height_cm || Math.round((p.liters / 3000) * 130)} cm)
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Section Historique des livraisons de fioul */}
          <div className="mt-1 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div>
                <span className="text-xs font-bold text-forest-deep dark:text-emerald-200 block">
                  Historique des livraisons de fioul ({deliveries.length})
                </span>
                <span className="text-[11px] font-semibold text-slate-500">
                  Total livré : {totalDelivered.toLocaleString('fr-FR')} L • Restant : {Math.round(remainingLiters).toLocaleString('fr-FR')} L
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsDeliveryModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs hover:shadow-sm transition-all cursor-pointer shrink-0 self-start sm:self-auto"
              >
                <span className="material-symbols-outlined text-[16px]">local_shipping</span>
                <span>+ Enregistrer une livraison</span>
              </button>
            </div>

            {deliveries.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-2">Aucune livraison enregistrée pour le moment.</p>
            ) : (
              <div className="flex overflow-x-auto gap-3 pb-1.5 snap-x snap-mandatory text-xs">
                {[...deliveries]
                  .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
                  .map((del, idx) => {
                    const liters = Number(del.liters_delivered ?? del.liters ?? 0);
                    const amount = Number(del.amount_ttc ?? (typeof del.amount === 'number' ? del.amount : parseFloat(String(del.amount || '').replace(/[^\d.,]/g, '').replace(',', '.')) || 0));
                    const pricePerLiter = liters > 0 && amount > 0 ? (amount / liters).toFixed(3).replace('.', ',') : null;
                    const docUrl = del.document_url || (del.document_id ? `/api/documents/${del.document_id}/download` : null);

                    return (
                      <div
                        key={del.id || idx}
                        className="w-full sm:w-[calc(50%-0.375rem)] lg:w-[calc(33.333%-0.5rem)] shrink-0 snap-start p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col justify-between gap-2"
                      >
                      <div>
                        <div className="flex items-center justify-between font-bold text-forest-deep dark:text-emerald-200">
                          <span>{del.date}</span>
                          <span className="font-mono text-emerald-700 dark:text-emerald-400">+{liters.toLocaleString('fr-FR')} L</span>
                        </div>
                        {del.invoice && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            Facture n° {del.invoice}
                          </div>
                        )}
                      </div>
                      <div className="mt-1 pt-1 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-[11px] flex-wrap gap-1">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800 dark:text-slate-100">
                            {amount > 0 ? `${amount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : '—'}
                          </span>
                          {pricePerLiter && (
                            <span className="text-[10px] text-slate-500 dark:text-slate-400">
                              {pricePerLiter} €/L
                            </span>
                          )}
                        </div>
                        {docUrl && (
                          <a
                            href={docUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 border border-emerald-200/60 text-[10px] font-semibold transition-colors"
                          >
                            <span className="material-symbols-outlined text-[13px]">description</span>
                            <span>Facture PDF</span>
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Contenu Onglet 2 : Suivi Quotidien Allumages Brûleur */}
      {activeTab === 'daily' && (
        <div className="flex flex-col gap-4">
          <div className="w-full overflow-x-auto">
            <div className="min-w-[580px] p-2">
              {dailyData.length === 0 ? (
                <div className="h-44 flex items-center justify-center text-xs text-slate-500 italic border-b border-slate-200 dark:border-slate-700">
                  Aucun relevé quotidien de brûleur enregistré pour le moment.
                </div>
              ) : (
                <div className={`flex items-end ${dailyData.length > 1 ? 'justify-between' : 'justify-center'} gap-2 h-44 border-b border-slate-200 dark:border-slate-700 pb-2`}>
                  {dailyData.map((d, idx) => {
                    const starts = d.daily_starts != null ? d.daily_starts : (d.starts || 0);
                    const liters = d.daily_liters != null ? d.daily_liters : Number((starts * 0.293).toFixed(1));
                    const safeMaxDaily = Math.max(maxDailyStarts, 1);
                    const heightPercent = Math.min(100, Math.max(10, (starts / safeMaxDaily) * 100));

                    return (
                      <div key={idx} className={`${dailyData.length > 1 ? 'flex-1' : 'w-28'} flex flex-col items-center gap-1 group relative`}>
                        <div className="text-[10px] font-bold text-amber-900 dark:text-amber-200 opacity-90 group-hover:scale-110 transition-transform">
                          {liters} L
                        </div>
                        <div className="text-[9px] text-slate-400 font-medium">
                          {starts} allumage{starts > 1 ? 's' : ''}
                        </div>
                        <div className="w-full max-w-[36px] bg-slate-100 dark:bg-slate-800 rounded-t-lg h-32 flex items-end p-0.5">
                          <div
                            style={{ height: `${heightPercent}%` }}
                            className="w-full bg-gradient-to-t from-amber-600 to-amber-400 rounded-t-md transition-all duration-300 group-hover:from-amber-700 group-hover:to-amber-500 shadow-2xs"
                          />
                        </div>
                        <div className="text-[10px] font-semibold text-slate-600 dark:text-slate-300 mt-1">
                          {d.date}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Cartouches télémétrie Viessmann */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
            <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40">
              <span className="text-[10px] uppercase font-bold text-amber-800 dark:text-amber-300 block">
                Ratio Consommation / Allumage
              </span>
              <span className="text-base font-bold text-amber-950 dark:text-amber-100 font-mono mt-0.5 block">
                0,293 L / allumage
              </span>
              <span className="text-[10px] text-amber-700 dark:text-amber-400">
                Cycle moyen : 10 min 50 s
              </span>
            </div>

            <div className="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40">
              <span className="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-300 block">
                Débit Horaire Gicleur
              </span>
              <span className="text-base font-bold text-emerald-950 dark:text-emerald-100 font-mono mt-0.5 block">
                1,62 L / heure
              </span>
              <span className="text-[10px] text-emerald-700 dark:text-emerald-400">
                Danfoss 0,50 / 80° H LEV DA
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">
                Heures Brûleur Cumulées
              </span>
              <span className="text-base font-bold text-slate-900 dark:text-slate-100 font-mono mt-0.5 block">
                {heatingStatus?.burner_hours != null ? `${heatingStatus.burner_hours.toLocaleString('fr-FR')} h` : '—'}
              </span>
              <span className="text-[10px] text-slate-500">
                Compteur temps réel ViCare
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">
                Allumages Brûleur Viessmann
              </span>
              <span className="text-base font-bold text-slate-900 dark:text-slate-100 font-mono mt-0.5 block">
                {heatingStatus?.burner_starts != null ? `${heatingStatus.burner_starts.toLocaleString('fr-FR')} allumages` : '—'}
              </span>
              <span className="text-[10px] text-slate-500">
                {heatingStatus?.burner_starts != null ? `Total estimé : ${Math.round(heatingStatus.burner_starts * 0.293).toLocaleString('fr-FR')} L` : '—'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Modale d'enregistrement de livraison */}
      <FuelDeliveryModal
        isOpen={isDeliveryModalOpen}
        onClose={() => setIsDeliveryModalOpen(false)}
        onSuccess={onRefreshFuel}
      />
    </div>
  );
}

export default function VademecumPage({ properties, currentUser, reservations = [], onOpenBooking }) {
  const location = useLocation();

  // Multi-page stay state (Annotation 2 : Navigation multi-pages avec Page 0 Domaine seul)
  const [upcomingStays, setUpcomingStays] = useState([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0); // 0 = Domaine seul, 1..N = Séjours futurs
  const [stayLoading, setStayLoading] = useState(true);

  // Navigation automatique vers la section Vadémécum ou Chauffage si ancre présente
  useEffect(() => {
    const scrollToTarget = (targetId) => {
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };

    const hash = (location.hash || (typeof window !== 'undefined' ? window.location.hash : '')).replace('#', '');
    if (hash === 'vademecum' || hash === 'chauffage') {
      const t1 = setTimeout(() => scrollToTarget(hash), 100);
      const t2 = setTimeout(() => scrollToTarget(hash), 400);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [location.hash, stayLoading]);

  const totalStays = upcomingStays.length;
  const currentStay = currentPageIndex > 0 ? upcomingStays[currentPageIndex - 1] : null;

  // Modals state
  const [isEditStayOpen, setIsEditStayOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  // Toast notification state
  const [toastMessage, setToastMessage] = useState(null);
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Live Telemetry State & Fail-fast (Annotation 4 & 6)
  const [heatingStatus, setHeatingStatus] = useState(() => getCachedData('heating_status') || null);
  const [heatingError, setHeatingError] = useState(null);
  const [piscineStatus, setPiscineStatus] = useState(null);
  const [piscineError, setPiscineError] = useState(null);
  const [klereoRadioAlert, setKlereoRadioAlert] = useState(null);
  const [telemetryLoading, setTelemetryLoading] = useState(true);
  const [fuelHistory, setFuelHistory] = useState(null);

  // Thermal controls state (Refonte Switches XXL Marche/Arrêt & Double Consigne)
  const [isHeatingActive, setIsHeatingActive] = useState(false);
  const [heatingComfortTarget, setHeatingComfortTarget] = useState(20.0);
  const [heatingFrostTarget, setHeatingFrostTarget] = useState(5.0);

  const [isDhwActive, setIsDhwActive] = useState(false);
  const [dhwTarget, setDhwTarget] = useState(52.0);
  const [dhwFrostTarget, setDhwFrostTarget] = useState(10.0);

  const [poolTarget, setPoolTarget] = useState(27.0);
  const poolTempDebounceRef = useRef(null);
  const heatingTempDebounceRef = useRef(null);
  const toggleRecheckTimeoutsRef = useRef([]);
  const lastRefreshAtRef = useRef(Date.now());
  const [isPoolPumpActive, setIsPoolPumpActive] = useState(true);
  const [isPoolHeatingActive, setIsPoolHeatingActive] = useState(false);
  const [savingThermal, setSavingThermal] = useState(false);

  const isRadioDown = Boolean(
    klereoRadioAlert ||
    piscineStatus?.radio_error ||
    piscineStatus?.radio_link_ok === false ||
    piscineStatus?.klereo_alert_code === 'radioPB' ||
    (piscineStatus?.alerts && piscineStatus.alerts.some(a => (typeof a === 'string' ? a : a.message || '').toLowerCase().includes('injoignable'))) ||
    (piscineError && (piscineError.toLowerCase().includes('injoignable') || piscineError.toLowerCase().includes('radio')))
  );

  // Horaires programmés pour le séjour (Annotation 8 Stitch 2c313f81e4f5499abb218f5b1dc25c68)
  const [stayPreheatTime, setStayPreheatTime] = useState('10:00');
  const [stayShutdownTime, setStayShutdownTime] = useState('11:00');

  useEffect(() => {
    if (currentStay) {
      const arr = currentStay.arrival_time || '15:00';
      const arrH = parseInt(arr.split(':')[0], 10);
      const preH = isNaN(arrH) ? 10 : Math.max(0, arrH - 5);
      const minStr = arr.split(':')[1] || '00';
      setStayPreheatTime(`${String(preH).padStart(2, '0')}:${minStr}`);
      setStayShutdownTime(currentStay.departure_time || '11:00');
    }
  }, [currentStay]);

  // Real Tasks loaded from Database (Annotation 7)
  const [tasks, setTasks] = useState(() => getCachedData('tasks') || []);

  // Load initial data
  const loadInitialData = async () => {
    try {
      if (!heatingStatus && !piscineStatus) setTelemetryLoading(true);
      if (!upcomingStays || upcomingStays.length === 0) setStayLoading(true);

      const [heatResResult, poolResResult, taskResResult, reservationsResResult, fuelResResult] = await Promise.allSettled([
        fetchHeatingStatus(),
        fetchPiscineStatus({ forceRefresh: true, refresh: true }),
        fetchTasks(),
        fetchReservations(),
        fetch('/api/heating/fuel-history').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);

      const heatRes = heatResResult.status === 'fulfilled' ? heatResResult.value : { error: 'Liaison ViCare indisponible' };
      const poolRes = poolResResult.status === 'fulfilled' ? poolResResult.value : null;
      const taskRes = taskResResult.status === 'fulfilled' ? (taskResResult.value || []) : [];
      const reservationsRes = reservationsResResult.status === 'fulfilled' ? (reservationsResResult.value || []) : (reservations || []);
      const fuelRes = fuelResResult && fuelResResult.status === 'fulfilled' ? fuelResResult.value : null;
      if (fuelRes) {
        setFuelHistory(fuelRes);
      }

      // ViCare Telemetry & Fail-fast (Données réelles 100% dynamiques)
      if (heatRes && !heatRes.error) {
        setHeatingStatus(heatRes);
        setHeatingError(null);

        // DHW active state
        const dhwActive = heatRes.is_dhw_active != null
          ? Boolean(heatRes.is_dhw_active)
          : (heatRes.dhw_target_temperature != null && heatRes.dhw_target_temperature > 20.0);
        setIsDhwActive(dhwActive);

        if (heatRes.dhw_target_temperature != null && heatRes.dhw_target_temperature > 20.0) {
          setDhwTarget(heatRes.dhw_target_temperature);
        }

        if (heatRes.dhw_reduced_temperature != null && heatRes.dhw_reduced_temperature >= 5.0) {
          setDhwFrostTarget(heatRes.dhw_reduced_temperature);
        }

        // Heating active state (Matrice Unifiée)
        let heatingActive = false;
        if (heatRes.is_heating_active != null) {
          heatingActive = Boolean(heatRes.is_heating_active);
        } else if (heatRes.active_mode) {
          const m = (heatRes.active_mode || '').toLowerCase();
          heatingActive = m === 'dhwandheating' || m === 'forcednormal';
        }
        setIsHeatingActive(heatingActive);

        // Confort Target (en fonctionnement)
        const comfortVal = heatRes.comfort_temperature != null
          ? heatRes.comfort_temperature
          : heatRes.heating_comfort_temperature;
        if (comfortVal != null && comfortVal > 15.0) {
          setHeatingComfortTarget(comfortVal);
        } else if (heatRes.target_temperature != null && heatRes.target_temperature > 15.0) {
          setHeatingComfortTarget(heatRes.target_temperature);
        }

        // Frost Target (à l'arrêt)
        const reducedVal = heatRes.reduced_temperature != null
          ? heatRes.reduced_temperature
          : heatRes.heating_reduced_temperature;
        if (reducedVal != null && reducedVal >= 5.0) {
          setHeatingFrostTarget(Math.max(5.0, reducedVal));
        }
      } else {
        setHeatingStatus(null);
        setHeatingError('⚠️ Liaison ViCare indisponible : impossible d\'interroger la chaudière');
      }

      // Piscine Telemetry & Fail-Fast
      if (poolRes && !poolRes.error) {
        setPiscineStatus(poolRes);
        setPiscineError(null);
        if (poolRes.radio_error || poolRes.radio_link_ok === false || poolRes.radio_alert) {
          setKlereoRadioAlert(poolRes.radio_alert || "⚠️ Liaison radio K-Link injoignable : le coffret physique au local technique ne répond pas.");
        } else {
          setKlereoRadioAlert(null);
        }
        if (poolRes.pool_comfort_target != null && poolRes.pool_comfort_target >= 15.0) {
          setPoolTarget(poolRes.pool_comfort_target);
        } else if (poolRes.target_temperature != null && poolRes.target_temperature >= 15.0) {
          setPoolTarget(poolRes.target_temperature);
        }

        const pumpActive = poolRes.is_pump_active != null
          ? Boolean(poolRes.is_pump_active)
          : (poolRes.filtration_state
              ? !poolRes.filtration_state.toLowerCase().includes('arrêt') && !poolRes.filtration_state.toLowerCase().includes('arret') && !poolRes.filtration_state.toLowerCase().includes('off')
              : true);
        setIsPoolPumpActive(pumpActive);

        const pacActive = poolRes.is_heating_active != null
          ? Boolean(poolRes.is_heating_active)
          : (poolRes.pac_active != null
              ? Boolean(poolRes.pac_active)
              : (poolRes.pac_state
                  ? poolRes.pac_state.toLowerCase().includes('chauffe') || poolRes.pac_state.toLowerCase().includes('marche') || poolRes.pac_state.toLowerCase().includes('actif')
                  : false));
        setIsPoolHeatingActive(pacActive);
      } else {
        setPiscineStatus(null);
        const errMsg = poolResResult.status === 'rejected'
          ? (poolResResult.reason?.message || 'Liaison Klereo Connect indisponible')
          : (poolRes?.error || 'Liaison Klereo Connect indisponible');
        setPiscineError(`⚠️ Liaison Klereo Connect indisponible : ${errMsg}`);
        if (errMsg.toLowerCase().includes('injoignable') || errMsg.toLowerCase().includes('radio') || errMsg.toLowerCase().includes('k-link') || errMsg.toLowerCase().includes('coffret')) {
          setKlereoRadioAlert(`⚠️ Liaison radio K-Link injoignable : le coffret physique au local technique ne répond pas.`);
        }
      }

      // Tasks (Annotation 7 : Déduplication et purge des tâches inventées)
      if (Array.isArray(taskRes)) {
        const seen = new Set();
        const unique = [];
        for (const t of taskRes) {
          const k = (t.title || '').trim().toLowerCase();
          if (!seen.has(k)) {
            seen.add(k);
            unique.push(t);
          }
        }
        setTasks(unique);
      } else {
        setTasks([]);
      }

      // Reservations (Annotation 2 : Filtrer les séjours futurs réels de l'utilisateur connecté)
      const allReservations = Array.isArray(reservationsRes) && reservationsRes.length > 0
        ? reservationsRes
        : (Array.isArray(reservations) ? reservations : []);

      if (allReservations.length > 0 || Array.isArray(reservationsRes)) {
        const todayStr = new Date().toISOString().split('T')[0];
        const userName = resolveCurrentUserFullName(currentUser);
        const userFirst = userName.split(' ')[0].toLowerCase();
        const currentUserId = currentUser?.id;

        const userUpcoming = allReservations
          .filter((r) => {
            if (r.status === 'Refusée' || r.status === 'Annulée') return false;
            const isUpcoming = (r.end_date && r.end_date >= todayStr) || (r.start_date && r.start_date >= todayStr);
            if (!isUpcoming) return false;
            const rMemberId = r.member_id ?? r.user_id;
            if (currentUserId != null && rMemberId != null && Number(currentUserId) === Number(rMemberId)) {
              return true;
            }
            const rUser = (r.user_name || '').toLowerCase();
            if (rUser.includes(userFirst) || userName.toLowerCase().includes(rUser)) return true;
            const notes = (r.notes || '').toLowerCase();
            return notes.includes(userFirst) || notes.includes(userName.toLowerCase());
          })
          .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));

        setUpcomingStays(userUpcoming);
        setCurrentPageIndex(userUpcoming.length > 0 ? 1 : 0);
      } else {
        setUpcomingStays([]);
        setCurrentPageIndex(0);
      }
    } finally {
      setTelemetryLoading(false);
      setStayLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
    loadVademecumDb();
  }, [currentUser]);

  // Rafraîchissement automatique toutes les 5 minutes (300 000 ms) avec respect strict des rate-limits Viessmann/Klereo (onglet visible uniquement + refresh au retour si > 2 min)
  useEffect(() => {
    const fetchHeatingSettings = async () => {
      try {
        const res = await fetch('/api/heating/settings');
        if (res.ok) return await res.json();
      } catch (_) {}
      return null;
    };

    const fetchPoolStatus = async () => {
      try {
        return await fetchPiscineStatus({ forceRefresh: true, refresh: true });
      } catch (_) {
        return null;
      }
    };

    const performRefresh = async () => {
      try {
        const [heatResResult, settingsResResult, poolResResult] = await Promise.allSettled([
          fetchHeatingStatus({ forceRefresh: true }),
          fetchHeatingSettings(),
          fetchPoolStatus(),
        ]);
        lastRefreshAtRef.current = Date.now();

        if (heatResResult.status === 'fulfilled' && heatResResult.value && !heatResResult.value.error) {
          const freshHeat = heatResResult.value;
          setHeatingStatus(freshHeat);
          setHeatingError(null);

          const dhwActive = freshHeat.is_dhw_active != null
            ? Boolean(freshHeat.is_dhw_active)
            : (freshHeat.dhw_target_temperature != null && freshHeat.dhw_target_temperature > 20.0);
          setIsDhwActive(dhwActive);

          let heatingActive = false;
          if (freshHeat.is_heating_active != null) {
            heatingActive = Boolean(freshHeat.is_heating_active);
          } else if (freshHeat.active_mode) {
            const m = (freshHeat.active_mode || '').toLowerCase();
            heatingActive = m === 'dhwandheating' || m === 'forcednormal';
          }
          setIsHeatingActive(heatingActive);

          if (!heatingTempDebounceRef.current) {
            const settingsData = settingsResResult.status === 'fulfilled' ? settingsResResult.value : null;
            if (settingsData?.target_temperature && settingsData.target_temperature >= 15.0) {
              setHeatingComfortTarget(settingsData.target_temperature);
            } else {
              const comfortVal = freshHeat.comfort_temperature != null
                ? freshHeat.comfort_temperature
                : freshHeat.heating_comfort_temperature;
              if (comfortVal != null && comfortVal >= 15.0) {
                setHeatingComfortTarget(comfortVal);
              } else if (freshHeat.target_temperature != null && freshHeat.target_temperature >= 15.0) {
                setHeatingComfortTarget(freshHeat.target_temperature);
              }
            }
          }
        }

        if (poolResResult.status === 'fulfilled' && poolResResult.value && !poolResResult.value.error) {
          setPiscineStatus(poolResResult.value);
          setPiscineError(null);
        }
      } catch (err) {
        console.warn('Erreur lors du rafraîchissement automatique domotique:', err);
      }
    };

    const intervalId = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      performRefresh();
    }, 5 * 60 * 1000);

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        if (Date.now() - lastRefreshAtRef.current >= 2 * 60 * 1000) {
          performRefresh();
        }
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      clearInterval(intervalId);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      if (heatingTempDebounceRef.current) clearTimeout(heatingTempDebounceRef.current);
      if (poolTempDebounceRef.current) clearTimeout(poolTempDebounceRef.current);
      if (toggleRecheckTimeoutsRef.current) {
        toggleRecheckTimeoutsRef.current.forEach((t) => clearTimeout(t));
        toggleRecheckTimeoutsRef.current = [];
      }
    };
  }, []);

  const handleHeatingComfortChange = (delta) => {
    const nextVal = Math.round((heatingComfortTarget + delta) * 10) / 10;
    if (nextVal < 15.0 || nextVal > 24.0) {
      if (nextVal > 24.0) {
        showToast('Consigne maximale autorisée : 24.0°C.');
      }
      return;
    }
    setHeatingComfortTarget(nextVal);

    if (heatingTempDebounceRef.current) {
      clearTimeout(heatingTempDebounceRef.current);
    }

    heatingTempDebounceRef.current = setTimeout(async () => {
      try {
        const targetMode = isHeatingActive
          ? 'dhwAndHeating'
          : (isDhwActive ? 'dhw' : 'standby');
        const author = resolveCurrentUserFullName(currentUser);
        await saveHeatingSettings({
          target_temperature: nextVal,
          is_heating_active: isHeatingActive,
          frost_temperature: heatingFrostTarget,
          is_dhw_active: isDhwActive,
          dhw_target_temperature: isDhwActive ? dhwTarget : dhwFrostTarget,
          mode: targetMode,
          author_name: author,
        });
        setHeatingStatus((prev) => (prev ? { ...prev, target_temperature: nextVal, target_temp: nextVal } : prev));
      } catch (err) {
        showToast(`Erreur enregistrement consigne chauffage : ${parseApiError(err)}`);
      } finally {
        heatingTempDebounceRef.current = null;
      }
    }, 2500);
  };

  const handleDhwChange = async (delta) => {
    const nextVal = Math.round((dhwTarget + delta) * 10) / 10;
    if (delta > 0 && dhwTarget >= 60.0) {
      showToast('Consigne maximale autorisée pour le chauffe-eau : 60.0°C.');
      return;
    }
    if (nextVal < 40.0) return;
    setDhwTarget(nextVal);
    if (isDhwActive) {
      try {
        await setDhwTemperature(nextVal);
      } catch (_) {}
    }
  };

  const handleDhwFrostChange = (delta) => {
    const nextVal = Math.round((dhwFrostTarget + delta) * 10) / 10;
    if (nextVal < 10.0) {
      showToast('10.0°C est le plancher minimal de coupure Vitotronic & protection cuve ViCare.');
      return;
    }
    if (nextVal > 25.0) return;
    setDhwFrostTarget(nextVal);
  };

  const handlePoolChange = (delta) => {
    const nextVal = Math.round((poolTarget + delta) * 10) / 10;
    if (nextVal < 15.0 || nextVal > 32.0) return;
    setPoolTarget(nextVal);

    if (poolTempDebounceRef.current) {
      clearTimeout(poolTempDebounceRef.current);
    }

    poolTempDebounceRef.current = setTimeout(async () => {
      try {
        const res = await setPoolTemperature(nextVal, resolveCurrentUserFullName(currentUser));
        if (res) {
          setPiscineStatus((prev) => ({
            ...(prev || {}),
            ...res,
            pending_sync: res.pending_sync || (res.queued_for_retry ? { has_pending: true, target_temp: nextVal } : prev?.pending_sync),
          }));
          if (res?.pool_comfort_target != null) {
            setPoolTarget(res.pool_comfort_target);
          }
          if (res.queued_for_retry) {
            showToast("⏳ Consigne enregistrée en file d'attente (liaison radio piscine interrompue).");
          }
        }
        showToast(`Consigne piscine synchronisée sur Klereo : ${nextVal.toFixed(1)}°C 🎯`);
        setTimeout(async () => {
          try {
            const freshPool = await fetchPiscineStatus({ forceRefresh: true });
            if (freshPool && !freshPool.error) {
              setPiscineStatus(freshPool);
              if (freshPool.pool_comfort_target != null) {
                setPoolTarget(freshPool.pool_comfort_target);
              }
            }
          } catch (_) {}
        }, 5000);
      } catch (err) {
        const parsedErr = parseApiError(err, 'Erreur lors de la modification de la consigne piscine Klereo');
        showToast(`⚠️ Échec réglage piscine : ${parsedErr}`);
        const errLower = parsedErr.toLowerCase();
        if (errLower.includes('injoignable') || errLower.includes('radio') || errLower.includes('k-link') || errLower.includes('coffret')) {
          setKlereoRadioAlert(`⚠️ Échec réglage consigne Klereo (${nextVal.toFixed(1)}°C) : ${parsedErr}`);
        }
        if (piscineStatus?.pool_comfort_target != null) {
          setPoolTarget(piscineStatus.pool_comfort_target);
        } else if (piscineStatus?.target_temperature != null) {
          setPoolTarget(piscineStatus.target_temperature);
        }
      }
    }, 600);
  };

  // Bascule du switch Marche/Arrêt Chauffage avec boucle fermée et réconciliation télémétrique réelle
  const handleToggleHeating = async (targetActive) => {
    setIsHeatingActive(targetActive);
    setSavingThermal(true);
    try {
      const targetMode = targetActive
        ? 'dhwAndHeating'
        : (isDhwActive ? 'dhw' : 'standby');

      await saveHeatingSettings({
        is_heating_active: targetActive,
        target_temperature: heatingComfortTarget,
        frost_temperature: heatingFrostTarget,
        is_dhw_active: isDhwActive,
        dhw_target_temperature: isDhwActive ? dhwTarget : dhwFrostTarget,
        mode: targetMode,
        author_name: resolveCurrentUserFullName(currentUser),
        details: targetActive
          ? `Chauffage ViCare activé en Marche (Confort ${heatingComfortTarget.toFixed(1)}°C)`
          : `Chauffage ViCare mis à l'Arrêt (En veille, antigel auto)`
      });

      // Notification immédiate positive et explicite
      showToast(
        targetActive
          ? `Commande transmise à la chaudière : allumage Confort ${heatingComfortTarget.toFixed(1)}°C (synchronisation ~30-60s) 🔥`
          : `Commande transmise à la chaudière : arrêt (mise en veille, antigel auto) 🛑`
      );

      // Relectures en tâche de fond pour synchroniser la télémétrie ViCare (8s confirmation, 15s et 45s suivi allumage brûleur)
      const triggerHeatingRecheck = (delayMs, isInitialConfirm = false) => {
        const tid = setTimeout(async () => {
          try {
            const freshHeat = await fetchHeatingStatus({ forceRefresh: true, force: true, refresh: true });
            if (freshHeat && !freshHeat.error) {
              setHeatingStatus(freshHeat);
              setHeatingError(null);
              let realActive = false;
              if (freshHeat.is_heating_active != null) {
                realActive = Boolean(freshHeat.is_heating_active);
              } else if (freshHeat.active_mode) {
                const m = (freshHeat.active_mode || '').toLowerCase();
                realActive = m === 'dhwandheating' || m === 'forcednormal';
              }
              if (realActive === targetActive) {
                setIsHeatingActive(realActive);
                if (isInitialConfirm) {
                  showToast(
                    realActive
                      ? `Chauffage confirmé en marche : Mode Confort ${heatingComfortTarget.toFixed(1)}°C 🔥`
                      : `Chauffage confirmé à l'arrêt : En veille (antigel auto) 🛑`
                  );
                }
              }
            }
          } catch (_) {}
        }, delayMs);
        toggleRecheckTimeoutsRef.current.push(tid);
      };

      triggerHeatingRecheck(8000, true);
      triggerHeatingRecheck(15000, false);
      triggerHeatingRecheck(45000, false);
    } catch (err) {
      setIsHeatingActive(!targetActive);
      showToast(`Erreur liaison chaudière : ${parseApiError(err)}`);
    } finally {
      setSavingThermal(false);
    }
  };

  // Bascule du switch Marche/Arrêt Eau Chaude Sanitaire avec boucle fermée et réconciliation télémétrique réelle
  const handleToggleDhw = async (targetActive) => {
    setIsDhwActive(targetActive);
    setSavingThermal(true);
    try {
      const targetMode = isHeatingActive
        ? 'dhwAndHeating'
        : (targetActive ? 'dhw' : 'standby');

      await saveHeatingSettings({
        is_heating_active: isHeatingActive,
        target_temperature: heatingComfortTarget,
        frost_temperature: heatingFrostTarget,
        is_dhw_active: targetActive,
        dhw_target_temperature: targetActive ? dhwTarget : dhwFrostTarget,
        mode: targetMode,
        author_name: resolveCurrentUserFullName(currentUser),
        details: targetActive
          ? `Eau Chaude (250L) activée en Marche (Chauffe cible ${dhwTarget.toFixed(1)}°C)`
          : `Eau Chaude (250L) mise à l'Arrêt (Veille économique)`
      });

      // Notification immédiate positive et explicite
      showToast(
        targetActive
          ? `Commande eau chaude transmise : chauffe cible ${dhwTarget.toFixed(1)}°C (allumage en cours...) 🔥`
          : `Commande transmise : coupure eau chaude sanitaire 🛑`
      );

      // Relectures en tâche de fond pour synchroniser la télémétrie ViCare (8s confirmation, 15s et 45s suivi allumage brûleur)
      const triggerDhwRecheck = (delayMs, isInitialConfirm = false) => {
        const tid = setTimeout(async () => {
          try {
            const freshHeat = await fetchHeatingStatus({ forceRefresh: true, force: true, refresh: true });
            if (freshHeat && !freshHeat.error) {
              setHeatingStatus(freshHeat);
              setHeatingError(null);
              const realDhwActive = freshHeat.is_dhw_active != null
                ? Boolean(freshHeat.is_dhw_active)
                : (freshHeat.dhw_target_temperature != null && freshHeat.dhw_target_temperature > 20.0);
              if (realDhwActive === targetActive) {
                setIsDhwActive(realDhwActive);
                if (isInitialConfirm) {
                  showToast(
                    realDhwActive
                      ? `Eau Chaude confirmée en marche (Cible : ${dhwTarget.toFixed(1)}°C) 🔥`
                      : `Eau Chaude confirmée à l'arrêt 🛑`
                  );
                }
              }
            }
          } catch (_) {}
        }, delayMs);
        toggleRecheckTimeoutsRef.current.push(tid);
      };

      triggerDhwRecheck(8000, true);
      triggerDhwRecheck(15000, false);
      triggerDhwRecheck(45000, false);
    } catch (err) {
      setIsDhwActive(!targetActive);
      showToast(`Erreur liaison eau chaude : ${parseApiError(err)}`);
    } finally {
      setSavingThermal(false);
    }
  };

  // Bascule du switch Marche/Arrêt Pompe de filtration avec boucle fermée et réconciliation télémétrique réelle
  const handleTogglePoolPump = async (targetActive) => {
    setIsPoolPumpActive(targetActive);
    setSavingThermal(true);
    try {
      const res = await setPoolPumpMode(targetActive);
      if (res) {
        setPiscineStatus((prev) => ({
          ...(prev || {}),
          ...res,
          pending_sync: res.pending_sync || (res.queued_for_retry ? { has_pending: true, filtration_active: targetActive } : prev?.pending_sync),
        }));
        if (res.queued_for_retry) {
          showToast("⏳ Consigne enregistrée en file d'attente (liaison radio piscine interrompue).");
        }
      }
      showToast(
        targetActive
          ? 'Commande transmise à la filtration Klereo : pompe en marche 🌊'
          : 'Commande transmise à la filtration Klereo : arrêt de la pompe 🛑'
      );

      // Relecture asynchrone Klereo
      setTimeout(async () => {
        try {
          const freshPool = await fetchPiscineStatus({ forceRefresh: true, force: true, refresh: true });
          if (freshPool && !freshPool.error) {
            setPiscineStatus(freshPool);
            setPiscineError(null);
            const realPumpActive = freshPool.is_pump_active != null
              ? Boolean(freshPool.is_pump_active)
              : (freshPool.filtration_state
                  ? !freshPool.filtration_state.toLowerCase().includes('arrêt') && !freshPool.filtration_state.toLowerCase().includes('arret') && !freshPool.filtration_state.toLowerCase().includes('off')
                  : true);
            if (realPumpActive === targetActive) {
              setIsPoolPumpActive(realPumpActive);
              showToast(
                realPumpActive
                  ? 'Pompe de filtration confirmée en marche 🌊'
                  : 'Pompe de filtration confirmée à l\'arrêt 🛑'
              );
            }
          }
        } catch (_) {}
      }, 6000);
    } catch (err) {
      setIsPoolPumpActive(!targetActive);
      const parsedErr = parseApiError(err);
      if (parsedErr.toLowerCase().includes('injoignable') || parsedErr.toLowerCase().includes('radio') || parsedErr.toLowerCase().includes('k-link') || parsedErr.toLowerCase().includes('coffret')) {
        setKlereoRadioAlert(`⚠️ Liaison radio K-Link injoignable : le coffret physique au local technique ne répond pas. (${parsedErr})`);
      }
      showToast(`Avertissement piscine : ${parsedErr}`);
    } finally {
      setSavingThermal(false);
    }
  };

  // Bascule du switch Marche/Arrêt Chauffage Piscine (PAC) avec boucle fermée et réconciliation télémétrique réelle
  const handleTogglePoolHeating = async (targetActive) => {
    setIsPoolHeatingActive(targetActive);
    setSavingThermal(true);
    try {
      const res = await setPoolHeatingMode(targetActive, poolTarget);
      if (res) {
        setPiscineStatus((prev) => ({
          ...(prev || {}),
          ...res,
          pending_sync: res.pending_sync || (res.queued_for_retry ? { has_pending: true, target_temp: poolTarget, heating_active: targetActive } : prev?.pending_sync),
        }));
        if (res.queued_for_retry) {
          showToast("⏳ Consigne enregistrée en file d'attente (liaison radio piscine interrompue).");
        }
      }
      showToast(
        targetActive
          ? `Commande transmise à la PAC Klereo : chauffe vers ${poolTarget.toFixed(1)}°C (en cours) 🔥`
          : 'Commande transmise à la PAC Klereo : arrêt du chauffage piscine ❄️'
      );

      // Relecture asynchrone Klereo
      setTimeout(async () => {
        try {
          const freshPool = await fetchPiscineStatus({ forceRefresh: true, force: true, refresh: true });
          if (freshPool && !freshPool.error) {
            setPiscineStatus(freshPool);
            setPiscineError(null);
            const realHeatingActive = freshPool.is_heating_active != null
              ? Boolean(freshPool.is_heating_active)
              : (freshPool.pac_active != null
                  ? Boolean(freshPool.pac_active)
                  : (freshPool.pac_state
                      ? freshPool.pac_state.toLowerCase().includes('chauffe') || freshPool.pac_state.toLowerCase().includes('marche') || freshPool.pac_state.toLowerCase().includes('actif')
                      : false));
            if (realHeatingActive === targetActive) {
              setIsPoolHeatingActive(realHeatingActive);
              showToast(
                realHeatingActive
                  ? 'Chauffage PAC piscine confirmé en marche 🔥'
                  : 'Chauffage PAC piscine confirmé à l\'arrêt ❄️'
              );
            }
          }
        } catch (_) {}
      }, 6000);
    } catch (err) {
      setIsPoolHeatingActive(!targetActive);
      const parsedErr = parseApiError(err);
      if (parsedErr.toLowerCase().includes('injoignable') || parsedErr.toLowerCase().includes('radio') || parsedErr.toLowerCase().includes('k-link') || parsedErr.toLowerCase().includes('coffret')) {
        setKlereoRadioAlert(`⚠️ Liaison radio K-Link injoignable : le coffret physique au local technique ne répond pas. (${parsedErr})`);
      }
      showToast(`Avertissement piscine : ${parsedErr}`);
    } finally {
      setSavingThermal(false);
    }
  };

  // Enregistrement consolidé de tous les réglages thermiques (Annotation 2)
  const handleSaveThermalSettings = async () => {
    try {
      setSavingThermal(true);
      await saveHeatingSettings({
        is_heating_active: isHeatingActive,
        target_temperature: heatingComfortTarget,
        frost_temperature: heatingFrostTarget,
        is_dhw_active: isDhwActive,
        dhw_target_temperature: isDhwActive ? dhwTarget : dhwFrostTarget,
        mode: isHeatingActive ? 'dhwAndHeating' : 'dhw',
        author_name: resolveCurrentUserFullName(currentUser),
        details: `Réglages consolidés : Chauffage ${isHeatingActive ? `Marche (${heatingComfortTarget.toFixed(1)}°C)` : 'En veille (antigel auto)'}, ECS ${isDhwActive ? `Marche (${dhwTarget.toFixed(1)}°C)` : `Arrêt (Veille ${dhwFrostTarget.toFixed(1)}°C)`}`
      });

      try {
        await savePoolSettings({
          target_temperature: poolTarget,
          filtration_mode: isPoolPumpActive ? 'marche' : 'arret',
          mode: isPoolHeatingActive ? 'confort' : 'standby',
          author_name: resolveCurrentUserFullName(currentUser),
          details: `Réglages consolidés piscine : Pompe ${isPoolPumpActive ? 'Marche' : 'Arrêt'}, PAC ${isPoolHeatingActive ? 'Marche' : 'Arrêt'}, Cible ${poolTarget.toFixed(1)}°C`
        });
      } catch (poolErr) {
        const parsedErr = parseApiError(poolErr, 'Erreur lors de la synchronisation des réglages piscine Klereo');
        showToast(`⚠️ Synchronisation piscine : ${parsedErr}`);
        if (parsedErr.toLowerCase().includes('injoignable') || parsedErr.toLowerCase().includes('radio') || parsedErr.toLowerCase().includes('k-link') || parsedErr.toLowerCase().includes('coffret')) {
          setKlereoRadioAlert(`⚠️ Liaison radio K-Link injoignable : le coffret physique au local technique ne répond pas. (${parsedErr})`);
        }
      }

      // Recharger la télémétrie fraîche
      const [freshHeatRes, freshPoolRes] = await Promise.allSettled([
        fetchHeatingStatus({ forceRefresh: true, force: true }),
        fetchPiscineStatus({ forceRefresh: true, force: true }),
      ]);

      if (freshHeatRes.status === 'fulfilled' && freshHeatRes.value && !freshHeatRes.value.error) {
        const h = freshHeatRes.value;
        setHeatingStatus(h);
        setHeatingError(null);
        if (h.is_heating_active != null) {
          setIsHeatingActive(Boolean(h.is_heating_active));
        }
        if (h.is_dhw_active != null) {
          setIsDhwActive(Boolean(h.is_dhw_active));
        }
      }

      if (freshPoolRes.status === 'fulfilled' && freshPoolRes.value && !freshPoolRes.value.error) {
        const p = freshPoolRes.value;
        setPiscineStatus(p);
        setPiscineError(null);
        if (p.is_pump_active != null) {
          setIsPoolPumpActive(Boolean(p.is_pump_active));
        }
        if (p.is_heating_active != null || p.pac_active != null) {
          setIsPoolHeatingActive(Boolean(p.is_heating_active || p.pac_active));
        }
      }

      if (currentPageIndex > 0 && currentStay) {
        showToast(`Consignes du séjour enregistrées et synchronisées avec les équipements physiques.`);
      } else {
        showToast(`Consignes enregistrées et synchronisées avec les équipements physiques.`);
      }
    } catch (err) {
      showToast(`Erreur : ${parseApiError(err)}`);
    } finally {
      setSavingThermal(false);
    }
  };

  // Rafraîchissement direct de la télémétrie fioul et des livraisons
  const refreshFuelTelemetry = async () => {
    try {
      const [freshHeatRes, freshFuelRes] = await Promise.allSettled([
        fetchHeatingStatus({ forceRefresh: true, force: true }),
        fetch('/api/heating/fuel-history').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (freshHeatRes.status === 'fulfilled' && freshHeatRes.value && !freshHeatRes.value.error) {
        setHeatingStatus(freshHeatRes.value);
        setHeatingError(null);
      }
      if (freshFuelRes.status === 'fulfilled' && freshFuelRes.value) {
        setFuelHistory(freshFuelRes.value);
      }
    } catch (err) {
      console.error('Erreur rafraîchissement télémétrie fioul:', err);
    }
  };

  const handleToggleTaskComplete = (taskId) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === taskId) {
          const nextStatus = t.status === 'completed' ? 'active' : 'completed';
          showToast(
            nextStatus === 'completed'
              ? `Action validée : « ${t.title} » ✅`
              : `Tâche réactivée : « ${t.title} »`
          );
          return { ...t, status: nextStatus };
        }
        return t;
      })
    );
  };

  const handleOpenTaskDetail = (task) => {
    setSelectedTask(task);
    setIsTaskModalOpen(true);
  };

  const currentUserName = resolveCurrentUserFullName(currentUser);
  const currentUserFirst = currentUserName.trim().split(' ')[0].toLowerCase();
  const isCoordinator = Boolean(
    currentUser?.is_coordinator ||
    currentUserName.toLowerCase().includes('henri') ||
    currentUserName.toLowerCase().includes('joséphine') ||
    currentUserName.toLowerCase().includes('josephine')
  );

  const isTaskAssignedToMe = (t) => {
    if (!t) return false;
    const cName = currentUserName.toLowerCase();
    const cFirst = currentUserFirst;
    const cId = currentUser?.id;

    // 1. Direct ID check
    const taskMemberId = t.assigned_member_id ?? t.assignee_id ?? t.member_id ?? t.user_id;
    if (cId != null && taskMemberId != null && Number(taskMemberId) === Number(cId)) {
      return true;
    }

    // 2. Assignee string check
    const assigneeStr = (t.assignee || t.assignee_name || '').toLowerCase();
    if (assigneeStr && (assigneeStr.includes(cName) || (cFirst.length >= 3 && assigneeStr.includes(cFirst)))) {
      return true;
    }

    // 3. Assigned members array or JSON
    let members = [];
    if (Array.isArray(t.assigned_members)) {
      members = t.assigned_members;
    } else if (typeof t.assigned_members === 'string' && t.assigned_members.trim()) {
      try {
        const parsed = JSON.parse(t.assigned_members);
        if (Array.isArray(parsed)) members = parsed;
        else members = [t.assigned_members];
      } catch (_) {
        members = [t.assigned_members];
      }
    }

    for (const m of members) {
      if (typeof m === 'object' && m !== null) {
        if (cId != null && m.id != null && Number(m.id) === Number(cId)) return true;
        const mName = (m.name || m.prenom || '').toLowerCase();
        if (mName.includes(cName) || (cFirst.length >= 3 && mName.includes(cFirst))) return true;
      } else if (typeof m === 'string') {
        const mStr = m.toLowerCase();
        if (mStr.includes(cName) || (cFirst.length >= 3 && mStr.includes(cFirst))) return true;
      }
    }

    // 4. Mention in title or description
    const fullText = `${t.title || ''} ${t.description || ''}`.toLowerCase();
    if (cFirst.length >= 3 && (
      fullText.includes(`[référent: ${cFirst}`) ||
      fullText.includes(`[référente: ${cFirst}`) ||
      fullText.includes(`[référent : ${cFirst}`) ||
      fullText.includes(`[référente : ${cFirst}`)
    )) {
      return true;
    }

    // 5. Fallback created_by if no assignee
    if (!assigneeStr && members.length === 0 && !taskMemberId && t.created_by) {
      const creatorStr = String(t.created_by).toLowerCase();
      if (cFirst.length >= 3 && creatorStr.includes(cFirst)) return true;
    }

    return false;
  };

  const handleValidateTask = async (taskId) => {
    try {
      await validateTask(taskId);
      showToast('Tâche validée avec succès ✅');
      await loadInitialData();
    } catch (err) {
      console.error('Erreur validation tâche:', err);
      showToast(parseApiError(err, 'Erreur lors de la validation'));
    }
  };

  const handleInvalidateTask = async (taskId) => {
    const reason = window.prompt("Motif de l'invalidation / demande de révision (optionnel) :", "");
    if (reason === null) return;
    try {
      await invalidateTask(taskId, reason);
      showToast('Tâche retournée à corriger ↩️');
      await loadInitialData();
    } catch (err) {
      console.error('Erreur invalidation tâche:', err);
      showToast(parseApiError(err, "Erreur lors de l'invalidation"));
    }
  };

  // Tâches filtrées synchronisées rigoureusement avec /taches : Tâches ouvertes assignées + (si coordinateur) en attente de validation
  const displayedTasks = tasks.filter((t) => {
    if (!isTaskOpen(t)) return false;
    if (isCoordinator && isTaskPendingValidation(t)) return true;
    return isTaskAssignedToUser(t, currentUser);
  });

  // WiFi password copy
  const [wifiCopied, setWifiCopied] = useState(false);
  const handleCopyWifi = () => {
    navigator.clipboard.writeText('HellenvilliersManoir2026!');
    setWifiCopied(true);
    showToast('Mot de passe Wi-Fi copié : HellenvilliersManoir2026!');
    setTimeout(() => setWifiCopied(false), 2500);
  };

  // Full Vademecum Database Section: Toujours affiché en mode complet au chargement (Annotation 6)
  const [showFullVademecum] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('Toutes');
  const [searchQuery, setSearchQuery] = useState('');
  const [vademecumItems, setVademecumItems] = useState([]);
  const [loadingDb, setLoadingDb] = useState(false);
  const [dbError, setDbError] = useState(null);
  const [copiedDbId, setCopiedDbId] = useState(null);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [itemToDelete, setItemToDelete] = useState(null);

  // Fermeture des menus au clic extérieur
  useEffect(() => {
    if (!activeMenuId) return;
    const handleCloseMenu = () => setActiveMenuId(null);
    window.addEventListener('click', handleCloseMenu);
    return () => window.removeEventListener('click', handleCloseMenu);
  }, [activeMenuId]);

  // Dynamic Categories state : Catégories authentiques du père + personnalisées (Zéro fuite administrative)
  const [customCategories, setCustomCategories] = useState(() => {
    try {
      const saved = localStorage.getItem('vademecum_custom_categories');
      return saved ? JSON.parse(saved) : [];
    } catch (_) {
      return [];
    }
  });

  const [isNewCategoryOpen, setIsNewCategoryOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatEmoji, setNewCatEmoji] = useState('📁');
  const [newCatColor, setNewCatColor] = useState('slate');
  const [isCreatingCat, setIsCreatingCat] = useState(false);
  const [isEditCategoryModalOpen, setIsEditCategoryModalOpen] = useState(false);
  const [selectedEditingCat, setSelectedEditingCat] = useState(null);

  // New Item modal state
  const [isNewItemModalOpen, setIsNewItemModalOpen] = useState(false);
  const [newCategory, setNewCategory] = useState('Arrivée & Clés');
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [submittingItem, setSubmittingItem] = useState(false);

  // Dérivation dynamique des catégories du vadémécum : canoniques du père + custom + base
  const categoriesList = React.useMemo(() => {
    const list = [...CANONICAL_VADEMECUM_CATEGORIES];
    const seen = new Set(list.map((c) => c.name.toLowerCase()));

    // 1. Ajouter les catégories personnalisées de l'utilisateur
    if (Array.isArray(customCategories)) {
      for (const c of customCategories) {
        if (c && c.name && !seen.has(c.name.toLowerCase())) {
          seen.add(c.name.toLowerCase());
          list.push({
            id: c.id || c.name,
            name: c.name,
            emoji: c.emoji || '📁',
            color: c.color || 'slate',
          });
        }
      }
    }

    // 2. Ajouter toute catégorie présente dans les fiches en base
    if (Array.isArray(vademecumItems)) {
      for (const item of vademecumItems) {
        if (item && item.category && !seen.has(item.category.toLowerCase())) {
          seen.add(item.category.toLowerCase());
          list.push({
            id: item.category,
            name: item.category,
            emoji: VADEMECUM_CATEGORY_ICONS[item.category] || '📁',
            color: 'slate',
          });
        }
      }
    }

    return list;
  }, [vademecumItems, customCategories]);

  useEffect(() => {
    if (!newCategory && categoriesList.length > 0) {
      setNewCategory(categoriesList[0].name);
    }
  }, [categoriesList, newCategory]);

  const handleCreateCategorySubmit = (e) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setIsCreatingCat(true);
    try {
      const catObj = {
        id: `custom-${Date.now()}`,
        name: newCatName.trim(),
        emoji: newCatEmoji || '📁',
        color: newCatColor || 'slate'
      };
      const updated = [...customCategories.filter((c) => c.name.toLowerCase() !== catObj.name.toLowerCase()), catObj];
      setCustomCategories(updated);
      try {
        localStorage.setItem('vademecum_custom_categories', JSON.stringify(updated));
      } catch (_) {}
      setNewCategory(catObj.name);
      setNewCatName('');
      setIsNewCategoryOpen(false);
      showToast(`Catégorie « ${catObj.name} » créée`);
    } catch (err) {
      showToast(`Erreur : ${parseApiError(err)}`);
    } finally {
      setIsCreatingCat(false);
    }
  };

  const handleOpenEditCategory = () => {
    const current = categoriesList.find((c) => c.name === newCategory) || categoriesList[0];
    if (!current) {
      showToast('Veuillez d\'abord créer ou sélectionner une catégorie.');
      return;
    }
    setSelectedEditingCat(current);
    setIsEditCategoryModalOpen(true);
  };

  const handleCategoryUpdated = (updated) => {
    const updatedList = customCategories.map((c) => (c.name.toLowerCase() === updated.name.toLowerCase() ? updated : c));
    setCustomCategories(updatedList);
    try {
      localStorage.setItem('vademecum_custom_categories', JSON.stringify(updatedList));
    } catch (_) {}
    if (newCategory === selectedEditingCat?.name) {
      setNewCategory(updated.name);
    }
    if (selectedCategory === selectedEditingCat?.name) {
      setSelectedCategory(updated.name);
    }
    showToast(`Catégorie « ${updated.name} » mise à jour`);
    loadVademecumDb();
  };

  const handleCategoryDeleted = (deletedId, deletedCat) => {
    const remaining = customCategories.filter((c) => c.name.toLowerCase() !== deletedCat?.name?.toLowerCase());
    setCustomCategories(remaining);
    try {
      localStorage.setItem('vademecum_custom_categories', JSON.stringify(remaining));
    } catch (_) {}
    if (newCategory === deletedCat?.name) {
      setNewCategory(categoriesList.length > 0 ? categoriesList[0].name : 'Arrivée & Clés');
    }
    if (selectedCategory === deletedCat?.name) {
      setSelectedCategory('Toutes');
    }
    showToast(`Catégorie « ${deletedCat?.name} » supprimée`);
    loadVademecumDb();
  };

  const loadVademecumDb = async () => {
    try {
      setLoadingDb(true);
      setDbError(null);
      const params = {};
      if (selectedCategory !== 'Toutes') params.category = selectedCategory;
      const data = await fetchVademecum(params);
      if (data && data.error) throw new Error(data.error);
      setVademecumItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('Vademecum DB notice:', err.message);
      setDbError(err.message || 'Mode local actif');
      setVademecumItems([]);
    } finally {
      setLoadingDb(false);
    }
  };

  useEffect(() => {
    loadVademecumDb();
  }, [selectedCategory]);

  const handleCreateDbItem = async (e) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;
    try {
      setSubmittingItem(true);
      await createVademecumItem({
        property_id: properties?.[0]?.id || 1,
        category: newCategory || (categoriesList[0]?.name || 'Général'),
        title: newTitle.trim(),
        content: newContent.trim(),
      });
      setNewTitle('');
      setNewContent('');
      setIsNewItemModalOpen(false);
      showToast('Fiche Vademecum enregistrée !');
      await loadVademecumDb();
    } catch (err) {
      console.error('Failed to create item:', err);
      showToast(`Erreur : ${parseApiError(err)}`);
    } finally {
      setSubmittingItem(false);
    }
  };

  const handleDeleteDbItem = async (itemId) => {
    try {
      await deleteVademecumItem(itemId);
      showToast('Fiche pratique supprimée avec succès');
      await loadVademecumDb();
    } catch (err) {
      console.error('Failed to delete item:', err);
      showToast('Erreur lors de la suppression de la fiche', 'error');
    }
  };

  const handleCopyDbCode = (id, code) => {
    navigator.clipboard.writeText(code);
    setCopiedDbId(id);
    showToast(`Code copié : ${code}`);
    setTimeout(() => setCopiedDbId(null), 2000);
  };

  // Annotation 8 : Purge stricte des fiches non validées
  const filteredDbItems = vademecumItems.filter((item) => {
    const titleNorm = (item.title || '').toLowerCase();
    const contentNorm = (item.content || '').toLowerCase();
    if (
      titleNorm.includes('portail sud') ||
      titleNorm.includes('boîtier à clé') ||
      titleNorm.includes('boitier a cle')
    ) {
      return false;
    }

    const q = searchQuery.toLowerCase();
    return (
      item.title?.toLowerCase().includes(q) ||
      item.content?.toLowerCase().includes(q) ||
      item.category?.toLowerCase().includes(q) ||
      (item.code_to_copy && item.code_to_copy.toLowerCase().includes(q))
    );
  });

  return (
    // Annotation 1 : Débordement horizontal éliminé via w-full max-w-full overflow-x-hidden
    <div className="relative w-full max-w-full overflow-x-hidden mx-auto pb-16 selection:bg-emerald-100 selection:text-emerald-900">
      
      {/* Subtle decorative ambient background glows contained within viewport bounds */}
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-primary-container/10 rounded-full blur-3xl pointer-events-none overflow-hidden"></div>
      <div className="absolute top-1/3 -left-40 w-[420px] h-[420px] bg-secondary-container/15 rounded-full blur-3xl pointer-events-none overflow-hidden"></div>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-forest-deep text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200 border border-emerald-500/30">
          <span className="material-symbols-outlined text-secondary text-[22px]">check_circle</span>
          <span className="text-xs font-semibold">{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="text-white/70 hover:text-white ml-2 cursor-pointer"
            type="button"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 1. EN-TÊTE HARMONISÉ HERO                                             */}
      {/* ===================================================================== */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-50/80 via-teal-50/60 to-emerald-50/70 border border-emerald-200/60 dark:bg-emerald-950/20 dark:border-emerald-800/40 p-6 sm:p-8 shadow-sm mb-6 w-full max-w-full">
        {/* Subtle decorative glow */}
        <div className="absolute -right-24 -top-24 w-96 h-96 rounded-full bg-emerald-200/40 dark:bg-emerald-900/15 blur-3xl pointer-events-none"></div>
        <div className="absolute -left-12 -bottom-12 w-64 h-64 rounded-full bg-teal-200/30 dark:bg-teal-900/10 blur-2xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100/90 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200 font-label-sm text-xs font-semibold uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-emerald-600 dark:bg-emerald-400 animate-pulse"></span>
              VADÉMÉCUM &amp; CONFORT DU DOMAINE
            </span>
            <h1 className="font-display-lg text-2xl sm:text-3xl lg:text-display-lg text-forest-deep dark:text-emerald-50 tracking-tight font-bold mt-2">
              Séjour &amp; Intendance
            </h1>
            <p className="font-body-md text-sm sm:text-base text-on-surface-variant dark:text-emerald-200/80 leading-relaxed">
              Consignes d'arrivée et départ, équipements et confort thermique du domaine.
            </p>
          </div>

          {/* Boutons d'Action Rapide (Annotation 9: Ouvre BookingModal) */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0 pt-2 md:pt-0">
            {currentStay ? (
              <button
                onClick={() => setIsEditStayOpen(true)}
                className="group flex items-center justify-center gap-2 px-5 py-3.5 rounded-DEFAULT bg-white dark:bg-slate-900 border-2 border-outline-variant text-on-surface hover:bg-canvas-slate hover:border-outline font-label-lg text-sm sm:text-base font-semibold transition-all duration-200 shadow-sm cursor-pointer whitespace-nowrap"
                type="button"
              >
                <span className="material-symbols-outlined text-[22px] text-primary group-hover:scale-110 transition-transform">edit_calendar</span>
                <span>Modifier le séjour</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  if (typeof onOpenBooking === 'function') {
                    onOpenBooking();
                  } else {
                    setIsEditStayOpen(true);
                  }
                }}
                className="group flex items-center justify-center gap-2 px-5 py-3.5 rounded-DEFAULT bg-white dark:bg-slate-900 border-2 border-outline-variant text-on-surface hover:bg-canvas-slate hover:border-outline font-label-lg text-sm sm:text-base font-semibold transition-all duration-200 shadow-sm cursor-pointer whitespace-nowrap"
                type="button"
              >
                <span className="material-symbols-outlined text-[22px] text-primary group-hover:scale-110 transition-transform">calendar_month</span>
                <span>Planifier un séjour</span>
              </button>
            )}

            <button
              onClick={() => {
                const el = document.getElementById('vademecum');
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth' });
                } else {
                  window.location.hash = 'vademecum';
                }
              }}
              className="group flex items-center justify-center gap-2 px-5 py-3.5 rounded-DEFAULT bg-white dark:bg-slate-900 border-2 border-border-subtle text-forest-deep hover:bg-canvas-slate hover:border-primary font-label-lg text-sm sm:text-base font-semibold transition-all duration-200 shadow-sm cursor-pointer whitespace-nowrap"
              type="button"
            >
              <span className="material-symbols-outlined text-[22px] text-primary group-hover:scale-110 transition-transform">menu_book</span>
              <span>Vademecum</span>
            </button>

            <button
              onClick={() => window.print()}
              className="group flex items-center justify-center gap-2 px-5 py-3.5 rounded-DEFAULT bg-white dark:bg-slate-900 border-2 border-primary text-primary hover:bg-sage-soft font-label-lg text-sm sm:text-base font-bold shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer whitespace-nowrap"
              type="button"
            >
              <span className="material-symbols-outlined text-[22px] group-hover:scale-110 transition-transform">print</span>
              <span>Télécharger le livret (PDF)</span>
            </button>
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* BARRE DE NAVIGATION MULTI-PAGES SÉJOURS & VUE DOMAINE (Annotation 2)  */}
      {/* ===================================================================== */}
      <section className="bg-surface-container-lowest rounded-2xl p-4 sm:p-5 shadow-sm border border-border-subtle mb-8 flex items-center justify-between gap-3 sm:gap-4 w-full max-w-full">
        {/* Bouton Précédent / Flèche Gauche */}
        <button
          type="button"
          onClick={() => setCurrentPageIndex((prev) => Math.max(0, prev - 1))}
          disabled={currentPageIndex === 0}
          aria-label="Séjour précédent ou vue domaine"
          className={`flex items-center gap-2 px-4 py-3 rounded-xl font-label-md text-sm font-bold transition-all shadow-xs shrink-0 select-none ${
            currentPageIndex > 0
              ? 'bg-white hover:bg-canvas-slate text-forest-deep border-2 border-border-subtle hover:border-primary active:scale-95 cursor-pointer'
              : 'bg-canvas-slate text-on-surface-variant/40 border border-border-subtle cursor-not-allowed opacity-50'
          }`}
        >
          <span className="material-symbols-outlined text-[24px]">chevron_left</span>
          <span className="hidden sm:inline">
            {currentPageIndex === 1 ? 'Vue Domaine' : 'Séjour précédent'}
          </span>
        </button>

        {/* Titre & Indicateur de Page Central */}
        <div className="flex flex-col items-center text-center min-w-0 px-2">
          <div className="flex items-center gap-2 flex-wrap justify-center mb-1">
            {currentPageIndex === 0 ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container font-label-sm text-xs font-bold text-on-surface-variant">
                <span className="material-symbols-outlined text-[16px] text-primary">domain</span>
                PAGE 0 • VUE DOMAINE SEUL
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 font-label-sm text-xs font-bold">
                <span className="material-symbols-outlined text-[16px] text-emerald-700">calendar_today</span>
                PAGE {currentPageIndex}/{totalStays} • {currentPageIndex === 1 ? 'PROCHAIN SÉJOUR' : `SÉJOUR ${currentPageIndex}`}
              </span>
            )}
          </div>

          <h2 className="font-headline-md text-base sm:text-lg lg:text-xl font-bold text-forest-deep tracking-tight truncate max-w-full">
            {currentPageIndex === 0 ? (
              'Vue d’ensemble du Domaine'
            ) : (
              <>
                <span>{currentPageIndex === 1 ? 'Prochain séjour' : `Séjour n°${currentPageIndex}`}</span>
                {currentStay && (
                  <span className="font-medium text-on-surface-variant text-sm sm:text-base ml-2">
                    ({formatDateReadable(currentStay.start_date)} — {formatDateReadable(currentStay.end_date)})
                  </span>
                )}
              </>
            )}
          </h2>

          <p className="text-xs text-on-surface-variant mt-0.5 truncate max-w-full">
            {stayLoading
              ? 'Recherche et chargement de vos prochains séjours...'
              : currentPageIndex === 0
              ? (totalStays > 0
                  ? `${totalStays} séjour(s) planifié(s) • Naviguez avec les flèches pour consulter chaque séjour`
                  : 'Aucun séjour planifié • Supervision thermique et intendance permanente du domaine')
              : (currentStay?.user_name ? `Séjour de ${currentStay.user_name} • Semaine ${currentStay.week_number || ''}` : 'Séjour planifié')}
          </p>
        </div>

        {/* Bouton Suivant / Flèche Droite */}
        <button
          type="button"
          onClick={() => setCurrentPageIndex((prev) => Math.min(totalStays, prev + 1))}
          disabled={currentPageIndex >= totalStays || totalStays === 0 || stayLoading}
          aria-label="Séjour suivant"
          className={`flex items-center gap-2 px-4 py-3 rounded-xl font-label-md text-sm font-bold transition-all shadow-xs shrink-0 select-none ${
            currentPageIndex < totalStays && totalStays > 0 && !stayLoading
              ? 'bg-white hover:bg-canvas-slate text-forest-deep border-2 border-border-subtle hover:border-primary active:scale-95 cursor-pointer'
              : 'bg-canvas-slate text-on-surface-variant/40 border border-border-subtle cursor-not-allowed opacity-50'
          }`}
        >
          <span className="hidden sm:inline">
            {currentPageIndex === 0 ? 'Prochain séjour' : 'Séjour suivant'}
          </span>
          <span className="material-symbols-outlined text-[24px]">chevron_right</span>
        </button>
      </section>

      {/* ===================================================================== */}
      {/* 2. DÉTAIL DU SÉJOUR AU DOMAINE (Pages 1 à N uniquement ou Skeleton)    */}
      {/* ===================================================================== */}
      {stayLoading ? (
        <div className="mb-10">
          <StayCardSkeleton />
        </div>
      ) : currentPageIndex > 0 && currentStay && (
        (() => {
          const stayCountdown = formatStayCountdown(currentStay.start_date, currentStay.arrival_time);
          const { members: rawMembers = [], guests: rawGuests = [] } = extractParticipants(currentStay);

          let membersList = [...rawMembers];
          if (
            currentStay?.user_name &&
            !membersList.some(
              (m) =>
                m.toLowerCase().includes(currentStay.user_name.toLowerCase()) ||
                currentStay.user_name.toLowerCase().includes(m.toLowerCase())
            )
          ) {
            membersList.unshift(currentStay.user_name);
          }

          // Dépistage et suppression catégorique de tout badge aggloméré ('deux personnes', '2 personnes', etc.)
          const parseAggregatedCount = (str) => {
            if (!str || typeof str !== 'string') return 0;
            const lower = str.toLowerCase().trim();
            const wordMap = {
              un: 1, une: 1, deux: 2, trois: 3, quatre: 4,
              cinq: 5, six: 6, sept: 7, huit: 8
            };
            const mWord = lower.match(/^(un|une|deux|trois|quatre|cinq|six|sept|huit)\s*personnes?$/);
            if (mWord) return wordMap[mWord[1]] || 1;
            const mDigit = lower.match(/^(\d+)\s*personnes?$/);
            if (mDigit) return parseInt(mDigit[1], 10) || 1;
            return 0;
          };

          let individualGuests = [];
          let aggregatedExtraCount = 0;

          for (const g of rawGuests) {
            const cnt = parseAggregatedCount(g);
            if (cnt > 0) {
              aggregatedExtraCount += cnt;
            } else if (g && !g.toLowerCase().includes('personne')) {
              individualGuests.push(g);
            }
          }

          if (Array.isArray(currentStay?.guests)) {
            for (const g of currentStay.guests) {
              const cnt = parseAggregatedCount(g);
              if (cnt > 0) {
                aggregatedExtraCount += cnt;
              } else if (g && typeof g === 'string' && !g.toLowerCase().includes('personne') && !individualGuests.includes(g)) {
                individualGuests.push(g);
              }
            }
          }

          const totalDeclared = currentStay?.guest_count || (membersList.length + individualGuests.length + aggregatedExtraCount) || 1;
          const missingGuests = Math.max(
            aggregatedExtraCount,
            totalDeclared - membersList.length - individualGuests.length
          );

          if (missingGuests > 0) {
            const existingCount = individualGuests.length;
            for (let i = 1; i <= missingGuests; i++) {
              individualGuests.push(`Invité ${existingCount + i}`);
            }
          }

          return (
            <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-50/70 via-stone-50/50 to-amber-50/40 dark:from-emerald-950/30 dark:via-stone-900/30 dark:to-amber-950/20 border border-emerald-200/60 dark:border-emerald-800/40 p-6 sm:p-8 shadow-sm mb-10 w-full max-w-full">
              {/* Deux halos lumineux flous animés en pulsation lente */}
              <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full bg-emerald-200/40 dark:bg-emerald-800/20 blur-3xl animate-pulse pointer-events-none" style={{ animationDuration: '4s' }}></div>
              <div className="absolute -bottom-24 -right-24 w-80 h-80 rounded-full bg-amber-200/35 dark:bg-amber-800/15 blur-3xl animate-pulse pointer-events-none" style={{ animationDuration: '6s' }}></div>

              <div className="relative z-10 flex flex-col gap-6">
                {/* En-tête harmonisé avec Badges, Titre et Bouton d'action */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-emerald-200/40 dark:border-emerald-800/30 pb-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="px-3 py-1 rounded-full bg-white/80 dark:bg-slate-900/80 border border-border-subtle font-label-sm text-xs text-on-surface-variant font-medium shadow-2xs">
                        Semaine {currentStay.week_number || ''} • {currentStay.year || 2026}
                      </span>
                      {stayCountdown && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100/90 dark:bg-emerald-900/60 border border-emerald-300/70 dark:border-emerald-700/60 text-emerald-900 dark:text-emerald-100 font-label-sm text-xs font-bold shadow-2xs">
                          <span className="material-symbols-outlined text-[15px] text-emerald-700 dark:text-emerald-300">hourglass_top</span>
                          <span>{stayCountdown}</span>
                        </span>
                      )}
                    </div>
                    <h2 className="font-display-md text-xl sm:text-2xl text-forest-deep dark:text-emerald-50 tracking-tight font-bold">
                      {currentPageIndex === 1 ? 'Mon Prochain Séjour au Domaine' : `Séjour n°${currentPageIndex} au Domaine`}
                    </h2>
                  </div>

                  {/* Bouton d'action Modifier le séjour */}
                  <div className="shrink-0">
                    <button
                      onClick={() => setIsEditStayOpen(true)}
                      className="w-full sm:w-auto py-2.5 px-4 rounded-xl bg-white dark:bg-slate-900 border border-border-subtle hover:bg-canvas-slate hover:border-primary text-on-surface font-label-md text-xs sm:text-sm font-semibold transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[20px] text-primary">edit_calendar</span>
                      <span>Modifier le séjour</span>
                    </button>
                  </div>
                </div>

                {/* Grille équilibrée : Dates programmées (gauche) & Participants/Chambres (droite) */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
                  {/* Planning : 5 colonnes sur grand écran */}
                  <div className="lg:col-span-5 flex flex-col justify-center gap-3">
                    <div className="flex items-center gap-3.5 p-4 rounded-2xl bg-white/90 dark:bg-slate-900/80 shadow-xs border border-emerald-100 dark:border-emerald-900/40 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-primary text-[22px]">flight_land</span>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-label-sm text-xs text-on-surface-variant font-medium">Arrivée programmée</span>
                        <span className="font-headline-sm text-sm sm:text-base text-on-surface font-bold truncate">
                          {formatDateReadable(currentStay.start_date)} • {currentStay.arrival_time || '15:00'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3.5 p-4 rounded-2xl bg-white/90 dark:bg-slate-900/80 shadow-xs border border-emerald-100 dark:border-emerald-900/40 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-primary text-[22px]">flight_takeoff</span>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-label-sm text-xs text-on-surface-variant font-medium">Départ &amp; Hors-gel</span>
                        <span className="font-headline-sm text-sm sm:text-base text-on-surface font-bold truncate">
                          {formatDateReadable(currentStay.end_date)} • {currentStay.departure_time || '11:00'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Participants et Chambres : 7 colonnes sur grand écran */}
                  <div className="lg:col-span-7 p-4 sm:p-5 rounded-2xl bg-white/80 dark:bg-slate-900/70 border border-emerald-100 dark:border-emerald-900/40 flex flex-col justify-between gap-4 shadow-xs">
                    {/* Participants au séjour */}
                    <div className="space-y-2">
                      <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block">
                        Participants au séjour
                      </span>
                      <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        {/* Membres de la famille (Vert émeraude / sauge) */}
                        {membersList.map((member, mIdx) => (
                          <div
                            key={`mem-${mIdx}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200 shadow-2xs font-label-sm text-xs font-semibold"
                          >
                            <div className="w-5 h-5 rounded-full bg-emerald-700 text-white flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined text-[13px]">person</span>
                            </div>
                            <span>{member}</span>
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Famille</span>
                          </div>
                        ))}

                        {/* Invités extérieurs individuels nominatifs (Teinte ambre / ocre raffinée) */}
                        {individualGuests.map((guest, gIdx) => (
                          <div
                            key={`gst-${gIdx}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 text-amber-900 dark:text-amber-200 shadow-2xs font-label-sm text-xs font-semibold"
                          >
                            <div className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined text-[13px]">person_add</span>
                            </div>
                            <span>{guest}</span>
                            <span className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">Invité</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Chambres attribuées */}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2 font-label-sm text-xs text-on-surface-variant">
                      <span className="material-symbols-outlined text-outline text-[18px]">bed</span>
                      <span className="font-semibold text-on-surface">Chambres attribuées :</span>
                      {currentStay.selected_rooms && currentStay.selected_rooms.length > 0 ? (
                        currentStay.selected_rooms.map((room, idx) => (
                          <span
                            key={idx}
                            className="px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface font-medium text-xs"
                          >
                            {formatPureRoomName(room)}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-on-surface-variant italic">Chambres non spécifiées</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          );
        })()
      )}

      {/* ===================================================================== */}
      {/* 3. CHAUFFAGE ET PISCINE (Annotation 4)                                */}
      {/* ===================================================================== */}
      <section id="chauffage" className="scroll-mt-24 bg-surface-container-lowest rounded-lg p-6 sm:p-8 lg:p-10 shadow-sm border border-border-subtle mb-10 flex flex-col gap-6 w-full max-w-full">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border-subtle pb-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-sage-soft text-primary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[26px]">thermostat</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-headline-md text-headline-md text-primary tracking-tight font-bold">
                  Chauffage et Piscine
                </h2>
              </div>
            </div>
          </div>
        </div>

        {telemetryLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <ThermalMetricSkeleton title="Supervision Chauffage (ViCare)..." />
            <ThermalMetricSkeleton title="Supervision Eau Chaude (250L)..." />
            <ThermalMetricSkeleton title="Supervision Piscine (Klereo)..." />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Volet 1 : Chauffage (ViCare) */}
            <div className="p-5 rounded-2xl bg-canvas-slate border border-border-subtle flex flex-col justify-between gap-5 shadow-sm min-w-0">
              <div className="flex flex-col gap-4">
                {/* En-tête Chauffage */}
                <div className="flex items-center justify-between border-b border-border-subtle pb-3 gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="material-symbols-outlined text-primary text-[22px]">hvac</span>
                    <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold truncate">Chauffage (ViCare)</h3>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-label-sm text-[11px] font-bold shrink-0 ${
                    heatingStatus?.has_burner_error
                      ? 'bg-rose-100 text-rose-900 border border-rose-400 font-extrabold animate-pulse'
                      : isHeatingActive && heatingStatus?.burner_active
                        ? 'bg-rose-100 text-rose-800 border border-rose-300 animate-pulse'
                        : isHeatingActive
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      heatingStatus?.has_burner_error
                        ? 'bg-rose-600'
                        : isHeatingActive && heatingStatus?.burner_active
                          ? 'bg-rose-600 animate-ping'
                          : isHeatingActive
                            ? 'bg-amber-500'
                            : 'bg-slate-400'
                    }`}></span>
                    {heatingStatus?.has_burner_error
                      ? `En dérangement (Code ${heatingStatus.burner_error_code || 227})`
                      : isHeatingActive && heatingStatus?.burner_active
                        ? 'Chauffe en cours'
                        : isHeatingActive
                          ? 'Au repos (brûleur éteint)'
                          : 'En veille (antigel auto)'}
                  </span>
                </div>

                {/* Alerte Rouge Vif : Dérangement Brûleur Chaudière ViCare (Code 227) */}
                {heatingStatus?.has_burner_error && (
                  <div className="p-3.5 rounded-xl bg-rose-50 border-2 border-rose-500 text-rose-900 shadow-xs flex items-start gap-2.5 animate-in fade-in duration-200">
                    <span className="material-symbols-outlined text-rose-600 text-[20px] shrink-0 mt-0.5">error</span>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-black text-rose-950">
                        ⚠️ Dérangement Brûleur Chaudière — Code {heatingStatus.burner_error_code || 227} (Sécurité de combustion verrouillée)
                      </span>
                      <p className="text-[11px] text-rose-800 font-semibold leading-relaxed">
                        Un réarmement physique sur la chaudière est requis. Le brûleur fioul s'est mis en sécurité thermique et la chauffe est interrompue.
                      </p>
                    </div>
                  </div>
                )}

                {/* Gros Switch Marche / Arrêt géant (Annotation 2) */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block">
                    Interrupteur Principal Chauffage
                  </span>
                  <ThermalMasterSwitch
                    isActive={isHeatingActive}
                    onChange={handleToggleHeating}
                    disabled={Boolean(heatingError) || savingThermal}
                    offLabel="Arrêt"
                    onLabel="Marche"
                    offIcon="power_settings_new"
                    onIcon="local_fire_department"
                    ariaLabel="Interrupteur principal Chauffage ViCare"
                  />
                </div>

                {/* Consigne et Horaires prévus pour le séjour (Annotation 8 Stitch 2c313f81e4f5499abb218f5b1dc25c68) */}
                {currentPageIndex > 0 && currentStay && (
                  <div className="p-3 bg-emerald-50/90 dark:bg-emerald-950/30 rounded-xl border border-emerald-200/80 dark:border-emerald-800/50 flex flex-col gap-2.5 shadow-2xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-[18px]">schedule</span>
                        <span className="text-[11px] uppercase font-bold text-on-surface-variant">Programmation asservie au séjour</span>
                      </div>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                        Asservi
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200/60 flex flex-col gap-1">
                        <span className="text-[10px] text-on-surface-variant font-medium">Démarrage préchauffage :</span>
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-forest-deep dark:text-emerald-200">{formatDateReadable(currentStay.start_date)}</span>
                          <input
                            type="time"
                            value={stayPreheatTime}
                            onChange={(e) => setStayPreheatTime(e.target.value)}
                            className="px-1.5 py-0.5 text-xs font-bold rounded bg-canvas-slate border border-outline-variant/40 text-primary w-20 text-center cursor-pointer"
                            title="Modifier l'heure de préchauffage"
                          />
                        </div>
                      </div>
                      <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200/60 flex flex-col gap-1">
                        <span className="text-[10px] text-on-surface-variant font-medium">Arrêt & Hors-gel :</span>
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-forest-deep dark:text-emerald-200">{formatDateReadable(currentStay.end_date)}</span>
                          <input
                            type="time"
                            value={stayShutdownTime}
                            onChange={(e) => setStayShutdownTime(e.target.value)}
                            className="px-1.5 py-0.5 text-xs font-bold rounded bg-canvas-slate border border-outline-variant/40 text-primary w-20 text-center cursor-pointer"
                            title="Modifier l'heure de coupure"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Fail-Fast ViCare Alert (Annotation 4 & 6) */}
                {heatingError && (
                  <div className="p-3 bg-rose-50 border border-rose-300 text-rose-900 rounded-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200">
                    <span className="material-symbols-outlined text-rose-600 text-[18px] shrink-0">error</span>
                    <span>⚠️ Liaison ViCare indisponible : impossible d'interroger la chaudière</span>
                  </div>
                )}

                {/* Sondes réelles ViCare (Ambiante mesurée & Chaudière réelle) */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-border-subtle flex flex-col gap-0.5 shadow-2xs">
                    <span className="text-[11px] text-on-surface-variant font-medium">Ambiante mesurée</span>
                    <span className="font-headline-md text-base sm:text-lg font-bold text-on-surface tabular-nums">
                      {heatingStatus?.room_temperature != null ? `${heatingStatus.room_temperature.toFixed(1)}°C` : '--°C'}
                    </span>
                  </div>
                  <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-border-subtle flex flex-col gap-0.5 shadow-2xs">
                    <span className="text-[11px] text-on-surface-variant font-medium">Chaudière réelle</span>
                    <span className="font-headline-md text-base sm:text-lg font-bold text-on-surface tabular-nums">
                      {heatingStatus?.boiler_temperature != null ? `${heatingStatus.boiler_temperature.toFixed(1)}°C` : '--°C'}
                    </span>
                  </div>
                </div>

                {/* Deux réglages distincts de température (Annotation 2) */}
                <div className="flex flex-col gap-2.5">
                  <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block">
                    Réglages des Consignes
                  </span>

                  {/* 1. Température en fonctionnement (Confort présence) */}
                  <div className={`p-3.5 bg-white dark:bg-slate-900 rounded-xl border flex items-center justify-between gap-2 shadow-2xs transition-colors ${
                    isHeatingActive ? 'border-emerald-300 dark:border-emerald-800/80 ring-1 ring-emerald-400/30' : 'border-border-subtle'
                  }`}>
                    <div className="flex items-center gap-2.5 min-w-0 pr-1">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-[20px]">local_fire_department</span>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-on-surface leading-tight">En fonctionnement</span>
                          {!isHeatingActive && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                              En réserve
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-on-surface-variant">Confort présence ({isHeatingActive ? 'actif' : 'prévu'})</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 bg-canvas-slate p-1 rounded-full border border-border-subtle">
                      <button
                        aria-label="Diminuer consigne confort"
                        className="w-7 h-7 rounded-full bg-white dark:bg-slate-800 border border-outline-variant hover:bg-surface-container flex items-center justify-center text-on-surface active:scale-95 transition-transform shadow-2xs cursor-pointer"
                        type="button"
                        onClick={() => handleHeatingComfortChange(-0.5)}
                      >
                        <span className="material-symbols-outlined text-[15px]">remove</span>
                      </button>
                      <span className="font-headline-md text-sm sm:text-base text-primary font-bold tabular-nums w-12 text-center">
                        {heatingComfortTarget.toFixed(1)}<span className="text-xs text-outline font-normal">°C</span>
                      </span>
                      <button
                        aria-label="Augmenter consigne confort"
                        className="w-7 h-7 rounded-full bg-primary text-white hover:bg-forest-deep flex items-center justify-center font-bold active:scale-95 transition-transform shadow-2xs cursor-pointer"
                        type="button"
                        onClick={() => handleHeatingComfortChange(0.5)}
                      >
                        <span className="material-symbols-outlined text-[15px]">add</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Jauge Fioul Calibrée (Cuve Éts JOSSE & Télémétrie Dynamique) */}
                {(() => {
                  const fuelRemaining = heatingStatus?.fuel_liters_remaining != null ? heatingStatus.fuel_liters_remaining : (fuelHistory?.calibration?.liters_remaining ?? 1062.0);
                  const fuelCapacity = heatingStatus?.fuel_capacity_liters != null ? heatingStatus.fuel_capacity_liters : (fuelHistory?.calibration?.capacity_liters ?? 3000.0);
                  const fuelPercent = heatingStatus?.fuel_level_percent != null ? heatingStatus.fuel_level_percent : (fuelHistory?.calibration ? Number(((fuelRemaining / fuelCapacity) * 100).toFixed(1)) : 35.4);
                  const fuelHeight = heatingStatus?.fuel_height_cm != null ? heatingStatus.fuel_height_cm : (fuelHistory?.calibration?.height_cm ?? 46.0);
                  const tankHeight = heatingStatus?.fuel_tank_height_cm != null ? heatingStatus.fuel_tank_height_cm : (fuelHistory?.calibration?.tank_height_cm ?? 130.0);
                  const lastDelivery = (fuelHistory?.deliveries && fuelHistory.deliveries.length > 0)
                    ? fuelHistory.deliveries[fuelHistory.deliveries.length - 1]
                    : null;
                  const todayLiters = heatingStatus?.today_fuel_liters ?? (fuelHistory?.daily_history && fuelHistory.daily_history.length > 0 ? fuelHistory.daily_history[fuelHistory.daily_history.length - 1]?.liters : null);

                  return (
                    <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-border-subtle flex flex-col gap-2.5 shadow-2xs">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="material-symbols-outlined text-amber-600 text-[20px] shrink-0">local_gas_station</span>
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-semibold text-on-surface">Cuve Fioul (Éts JOSSE)</span>
                            <span className="text-[11px] text-on-surface-variant">Capacité {fuelCapacity.toLocaleString('fr-FR')} L ({tankHeight} cm)</span>
                          </div>
                        </div>
                        <span className="font-headline-sm text-xs font-bold text-amber-950 bg-amber-50 border border-amber-200/80 tabular-nums shrink-0 px-2.5 py-1 rounded-md">
                          {fuelRemaining.toLocaleString('fr-FR')} L / {fuelCapacity.toLocaleString('fr-FR')} L • {fuelPercent}% • {fuelHeight} cm
                        </span>
                      </div>

                      {/* Stylized progress bar */}
                      <div className="w-full bg-slate-100 dark:bg-slate-800/80 backdrop-blur-xs h-3 rounded-full overflow-hidden shadow-inner border border-slate-200/70 p-0.5">
                        <div
                          className="bg-gradient-to-r from-amber-600 via-amber-500 to-amber-400 h-full rounded-full overflow-hidden shadow-inner transition-all duration-500"
                          style={{ width: `${Math.min(100, Math.max(0, fuelPercent))}%` }}
                        />
                      </div>

                      {/* Level indicators */}
                      <div className="flex items-center justify-between text-[10px] font-semibold text-on-surface-variant/80 px-0.5">
                        <span>0 L (0 cm)</span>
                        <span className="text-amber-700 dark:text-amber-400 font-bold">{Math.round(fuelRemaining).toLocaleString('fr-FR')} L ({fuelHeight} cm)</span>
                        <span>{fuelCapacity.toLocaleString('fr-FR')} L ({tankHeight} cm)</span>
                      </div>

                      {/* Indicateurs calculés en temps réel */}
                      <div className="text-[10.5px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg border border-border-subtle flex flex-col gap-1 leading-tight">
                        <div className="flex items-center justify-between flex-wrap gap-1">
                          <span>Débit brûleur : <strong className="text-on-surface">0,293 L / démarrage • 1,62 L / h</strong></span>
                          {todayLiters != null && (
                            <span className="font-semibold text-amber-700 dark:text-amber-400">Aujourd'hui : {todayLiters} L</span>
                          )}
                        </div>
                        {lastDelivery && (
                          <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 pt-0.5 border-t border-slate-200/50 dark:border-slate-700/50">
                            <span>Dernière livraison enregistrée :</span>
                            <span className="font-medium text-slate-700 dark:text-slate-200">
                              {lastDelivery.date} (+{Number(lastDelivery.liters_delivered ?? lastDelivery.liters ?? 0).toLocaleString('fr-FR')} L)
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

              </div>
            </div>

            {/* Volet 2 : Eau Chaude Sanitaire (ViCare 250L) */}
            <div className="p-5 rounded-2xl bg-canvas-slate border border-border-subtle flex flex-col justify-between gap-5 shadow-sm min-w-0">
              <div className="flex flex-col gap-4">
                {/* En-tête ECS avec Badge d'état réel */}
                <div className="flex items-center justify-between border-b border-border-subtle pb-3 gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="material-symbols-outlined text-primary text-[22px]">water_heater</span>
                    <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold truncate">Eau Chaude (250L)</h3>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-label-sm text-[11px] font-bold shrink-0 ${
                    heatingStatus?.is_dhw_heating || (isDhwActive && heatingStatus?.burner_active)
                      ? 'bg-rose-100 text-rose-800 border border-rose-300 animate-pulse'
                      : isDhwActive
                        ? 'bg-amber-50 text-amber-800 border border-amber-200'
                        : 'bg-slate-100 text-slate-700 border border-slate-200'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      heatingStatus?.is_dhw_heating || (isDhwActive && heatingStatus?.burner_active)
                        ? 'bg-rose-600 animate-ping'
                        : isDhwActive
                          ? 'bg-amber-500'
                          : 'bg-slate-400'
                    }`}></span>
                    {heatingStatus?.is_dhw_heating || (isDhwActive && heatingStatus?.burner_active)
                      ? 'Chauffe en cours'
                      : (heatingStatus?.dhw_status_label || (
                          isDhwActive
                            ? 'Au repos (brûleur éteint)'
                            : `À l'arrêt (Veille ${dhwFrostTarget.toFixed(1)}°C)`
                        ))}
                  </span>
                </div>

                {/* Gros Switch Marche / Arrêt géant (Annotation 1) */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block">
                    Interrupteur Chauffe-Eau
                  </span>
                  <ThermalMasterSwitch
                    isActive={isDhwActive}
                    onChange={handleToggleDhw}
                    disabled={Boolean(heatingError) || savingThermal}
                    offLabel="Arrêt"
                    onLabel="Marche"
                    offIcon="power_settings_new"
                    onIcon="local_fire_department"
                    ariaLabel="Interrupteur principal Eau Chaude Sanitaire"
                  />
                </div>


                {/* Consigne et Horaires prévus pour le séjour (Annotation 8 Stitch 2c313f81e4f5499abb218f5b1dc25c68) */}
                {currentPageIndex > 0 && currentStay && (
                  <div className="p-3 bg-emerald-50/90 dark:bg-emerald-950/30 rounded-xl border border-emerald-200/80 dark:border-emerald-800/50 flex flex-col gap-2.5 shadow-2xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-[18px]">schedule</span>
                        <span className="text-[11px] uppercase font-bold text-on-surface-variant">Relance ECS asservie au séjour</span>
                      </div>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                        Asservi
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200/60 flex flex-col gap-1">
                        <span className="text-[10px] text-on-surface-variant font-medium">Relance ballon :</span>
                        <span className="font-bold text-forest-deep dark:text-emerald-200">Dès {stayPreheatTime} le {formatDateReadable(currentStay.start_date)}</span>
                      </div>
                      <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200/60 flex flex-col gap-1">
                        <span className="text-[10px] text-on-surface-variant font-medium">Bascule veille :</span>
                        <span className="font-bold text-forest-deep dark:text-emerald-200">À {stayShutdownTime} le {formatDateReadable(currentStay.end_date)}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Fail-Fast ViCare Alert (si erreur) */}
                {heatingError && (
                  <div className="p-3 bg-rose-50 border border-rose-300 text-rose-900 rounded-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200">
                    <span className="material-symbols-outlined text-rose-600 text-[18px] shrink-0">error</span>
                    <span>⚠️ Liaison ViCare indisponible : impossible d'interroger le chauffe-eau</span>
                  </div>
                )}

                {/* Sondes réelles ViCare : Température actuelle du ballon & Capacité (Annotation 5 & 8) */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-border-subtle flex flex-col gap-0.5 shadow-2xs">
                    <span className="text-[11px] text-on-surface-variant font-medium">Température ballon</span>
                    <span className="font-headline-md text-base sm:text-lg font-bold text-on-surface tabular-nums">
                      {heatingStatus?.dhw_temperature != null ? `${heatingStatus.dhw_temperature.toFixed(1)}°C` : '--°C'}
                    </span>
                  </div>
                  <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-border-subtle flex flex-col gap-0.5 shadow-2xs">
                    <span className="text-[11px] text-on-surface-variant font-medium">Capacité ballon</span>
                    <span className="font-headline-md text-base sm:text-lg font-bold text-on-surface tabular-nums">
                      250 L
                    </span>
                  </div>
                </div>

                {/* Deux réglages distincts de température identiques au Chauffage (Annotation 5) */}
                <div className="flex flex-col gap-2.5">
                  <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block">
                    Réglages des Consignes
                  </span>

                  {/* 1. Température en fonctionnement (Chauffe confort) */}
                  <div className={`p-3.5 bg-white dark:bg-slate-900 rounded-xl border flex items-center justify-between gap-2 shadow-2xs transition-colors ${
                    isDhwActive ? 'border-emerald-300 dark:border-emerald-800/80 ring-1 ring-emerald-400/30' : 'border-border-subtle'
                  }`}>
                    <div className="flex items-center gap-2.5 min-w-0 pr-1">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-[20px]">local_fire_department</span>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-on-surface leading-tight">En fonctionnement</span>
                          {!isDhwActive && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                              En réserve
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-on-surface-variant">
                          Chauffe confort ({isDhwActive ? (heatingStatus?.is_dhw_heating ? 'en chauffe' : 'au repos') : 'prévu'})
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 bg-canvas-slate p-1 rounded-full border border-border-subtle">
                      <button
                        aria-label="Diminuer consigne confort eau chaude"
                        className="w-7 h-7 rounded-full bg-white dark:bg-slate-800 border border-outline-variant hover:bg-surface-container flex items-center justify-center text-on-surface active:scale-95 transition-transform shadow-2xs cursor-pointer"
                        type="button"
                        onClick={() => handleDhwChange(-0.5)}
                      >
                        <span className="material-symbols-outlined text-[15px]">remove</span>
                      </button>
                      <span className="font-headline-md text-sm sm:text-base text-primary font-bold tabular-nums w-12 text-center">
                        {dhwTarget.toFixed(1)}<span className="text-xs text-outline font-normal">°C</span>
                      </span>
                      <button
                        aria-label="Augmenter consigne confort eau chaude"
                        className="w-7 h-7 rounded-full bg-primary text-white hover:bg-forest-deep flex items-center justify-center font-bold active:scale-95 transition-transform shadow-2xs cursor-pointer"
                        type="button"
                        onClick={() => handleDhwChange(0.5)}
                      >
                        <span className="material-symbols-outlined text-[15px]">add</span>
                      </button>
                    </div>
                  </div>
                </div>

              </div>
            </div>

          {/* Volet 3 : Piscine (Klereo) */}
          <div className="p-5 rounded-2xl bg-canvas-slate border border-border-subtle flex flex-col justify-between gap-5 shadow-sm min-w-0">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-border-subtle pb-3 gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="material-symbols-outlined text-primary text-[22px]">pool</span>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold truncate">Piscine (Klereo)</h3>
                </div>
                {/* Badge d'état harmonisé Piscine */}
                {isRadioDown ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-label-sm text-[11px] font-bold shrink-0 bg-amber-100 text-amber-900 border border-amber-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                    Coffret injoignable (K-Link)
                  </span>
                ) : isPoolHeatingActive && piscineStatus?.pac_active ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-label-sm text-[11px] font-bold shrink-0 bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-ping"></span>
                    Chauffe PAC active
                  </span>
                ) : isPoolHeatingActive && !piscineStatus?.pac_active ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-label-sm text-[11px] font-bold shrink-0 bg-amber-100 text-amber-900 border border-amber-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                    PAC en régulation ({poolTarget.toFixed(1)}°C • repos)
                  </span>
                ) : isPoolPumpActive && (piscineStatus?.is_pump_active !== false && (!piscineStatus?.filtration_state || (!piscineStatus.filtration_state.toLowerCase().includes('arrêt') && !piscineStatus.filtration_state.toLowerCase().includes('arret')))) ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-label-sm text-[11px] font-bold shrink-0 bg-emerald-50 text-emerald-800 border border-emerald-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                    Filtration active (PAC Arrêt)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-label-sm text-[11px] font-bold shrink-0 bg-slate-100 text-slate-700 border border-slate-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                    En veille (Chauffage Arrêt)
                  </span>
                )}
              </div>

              {/* Sondes réelles Klereo : Température Eau & Température Air */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-border-subtle flex flex-col gap-0.5 shadow-2xs">
                  <div className="flex items-center justify-between text-[11px] text-on-surface-variant font-medium">
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-sky-600">water</span>
                      <span>Température Eau</span>
                    </div>
                    {(isRadioDown || piscineStatus?.telemetry_stale || (piscineStatus?.water_temp_age_s != null && piscineStatus.water_temp_age_s > 3600)) && (
                      <span className="text-[10px] text-amber-700 dark:text-amber-400 font-bold flex items-center gap-0.5" title="Dernière mesure enregistrée">
                        <span className="material-symbols-outlined text-[12px]">wifi_off</span> Figée
                      </span>
                    )}
                  </div>
                  <span className="font-headline-md text-base sm:text-lg font-bold text-on-surface tabular-nums">
                    {piscineStatus?.water_temperature != null ? `${piscineStatus.water_temperature.toFixed(1)}°C` : '--°C'}
                  </span>
                  <div className="text-[10px] text-on-surface-variant">
                    {piscineStatus?.water_temp_age_s != null ? (
                      (piscineStatus?.telemetry_stale || piscineStatus.water_temp_age_s > 3600) ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 font-semibold">
                          ⚠️ Mesure figée ({formatTelemetryAge(piscineStatus.water_temp_age_s)})
                        </span>
                      ) : (
                        <span>Sonde skimmer • {formatTelemetryAge(piscineStatus.water_temp_age_s)}</span>
                      )
                    ) : (
                      <span>{isRadioDown ? "Dernière télémesure enregistrée" : "Sonde skimmer réelle"}</span>
                    )}
                  </div>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-border-subtle flex flex-col gap-0.5 shadow-2xs">
                  <div className="flex items-center justify-between text-[11px] text-on-surface-variant font-medium">
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-emerald-600">air</span>
                      <span>Température Air</span>
                    </div>
                    {(isRadioDown || piscineStatus?.telemetry_stale || (piscineStatus?.air_temp_age_s != null && piscineStatus.air_temp_age_s > 3600)) && (
                      <span className="text-[10px] text-amber-700 dark:text-amber-400 font-bold flex items-center gap-0.5" title="Dernière mesure enregistrée">
                        <span className="material-symbols-outlined text-[12px]">wifi_off</span> Figée
                      </span>
                    )}
                  </div>
                  <span className="font-headline-md text-base sm:text-lg font-bold text-on-surface tabular-nums">
                    {piscineStatus?.outside_temperature != null
                      ? `${piscineStatus.outside_temperature.toFixed(1)}°C`
                      : (piscineStatus?.air_temperature != null ? `${piscineStatus.air_temperature.toFixed(1)}°C` : '--°C')}
                  </span>
                  <div className="text-[10px] text-on-surface-variant">
                    {piscineStatus?.air_temp_age_s != null ? (
                      (piscineStatus?.telemetry_stale || piscineStatus.air_temp_age_s > 3600) ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 font-semibold">
                          ⚠️ Mesure figée ({formatTelemetryAge(piscineStatus.air_temp_age_s)})
                        </span>
                      ) : (
                        <span>Sonde extérieure • {formatTelemetryAge(piscineStatus.air_temp_age_s)}</span>
                      )
                    ) : (
                      <span>Sonde extérieure réelle</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Bandeau d'information télémétrie stale Klereo (radio K-Link 868 MHz) */}
              {(piscineStatus?.telemetry_stale && piscineStatus?.radio_link_ok !== false && piscineStatus?.klereo_alert_code !== 'radioPB') && (
                <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-600 text-amber-950 dark:text-amber-100 rounded-xl text-xs flex items-start gap-2.5 shadow-2xs animate-in fade-in duration-200">
                  <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[22px] shrink-0 mt-0.5">sensors_off</span>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="font-bold text-xs text-amber-900 dark:text-amber-200">
                      Télémesure radio 868 MHz en attente d'actualisation
                    </span>
                    <span className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed font-normal">
                      Le boîtier Klereo Connect (derrière le piano) est bien connecté au Wi-Fi, mais la dernière remontée radio 868 MHz du coffret piscine remonte à {formatTelemetryAge(piscineStatus.infos_time_s || piscineStatus.water_temp_age_s) || 'plus d\'une heure'}.
                    </span>
                  </div>
                </div>
              )}

              {/* Alerte Radio Klereo si coffret injoignable ou anomalie radio (Question 3) */}
              {(piscineStatus?.radio_link_ok === false || piscineStatus?.klereo_alert_code === 'radioPB' || klereoRadioAlert || piscineStatus?.radio_error || (piscineStatus?.radio_alert && !piscineStatus?.radio_link_ok) || (piscineError && (piscineError.toLowerCase().includes('injoignable') || piscineError.toLowerCase().includes('radio')))) && (
                <div className="p-3.5 bg-amber-50 dark:bg-amber-950/50 border-2 border-amber-500 dark:border-amber-500 text-amber-950 dark:text-amber-100 rounded-xl text-xs font-semibold flex items-start gap-2.5 shadow-sm animate-in fade-in duration-200">
                  <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[24px] shrink-0 mt-0.5">wifi_off</span>
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="font-bold text-sm text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                      ⚠️ Vérifiez la liaison radio entre le coffret piscine et le boîtier internet &quot;CONNECT&quot;
                    </span>
                    <span className="text-[11px] text-amber-700 dark:text-amber-300 font-medium">
                      ({piscineStatus?.last_sync_label || (piscineStatus?.infos_time_s ? 'Dernière synchronisation il y a ' + formatTelemetryAge(piscineStatus.infos_time_s) : 'Synchronisation en attente')})
                    </span>
                    <span className="text-[11px] text-amber-900/90 dark:text-amber-200 font-medium">
                      Dernières mesures : {`Air: ${piscineStatus?.air_temp ?? piscineStatus?.outside_temperature ?? piscineStatus?.air_temperature ?? '--'}°C, Eau: ${piscineStatus?.water_temp ?? piscineStatus?.water_temperature ?? '--'}°C, pH: ${piscineStatus?.ph ?? piscineStatus?.ph_value ?? '--'}, Redox: ${piscineStatus?.redox ?? piscineStatus?.redox_mv ?? piscineStatus?.redox_value ?? '--'}mV`}
                    </span>
                    <span className="text-[11px] text-amber-800 dark:text-amber-300 font-normal leading-relaxed mt-0.5">
                      {klereoRadioAlert || piscineStatus?.radio_alert || "La communication radio entre le modem internet et le coffret électrique du local technique est interrompue. Les commandes d'actionneurs et la télémesure en direct sont suspendues jusqu'au rétablissement de la liaison radio."}
                    </span>
                  </div>
                </div>
              )}

              {/* Bandeau consigne en file d'attente (pending_sync) */}
              {piscineStatus?.pending_sync?.has_pending && (
                <div className="p-3.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-300 dark:border-blue-600 text-blue-950 dark:text-blue-100 rounded-xl text-xs flex items-start gap-2.5 shadow-2xs animate-in fade-in duration-200">
                  <span className="material-symbols-outlined text-blue-600 dark:text-blue-400 text-[22px] shrink-0 mt-0.5">hourglass_top</span>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="font-bold text-xs text-blue-900 dark:text-blue-200">
                      ⏳ Consigne enregistrée en file d'attente — La liaison radio avec le coffret piscine étant momentanément interrompue, le site réessaie automatiquement toutes les 15 à 30 minutes et activera votre consigne dès la reconnexion.
                    </span>
                    {(piscineStatus?.pending_sync?.target_temp != null || piscineStatus?.pending_sync?.want_target_temp != null || piscineStatus?.pending_sync?.heating_active != null || piscineStatus?.pending_sync?.filtration_active != null) && (
                      <span className="text-[10px] text-blue-700 dark:text-blue-300 font-medium mt-0.5">
                        Détail : {piscineStatus?.pending_sync?.heating_active || piscineStatus?.pending_sync?.want_heating_active ? `Chauffage demandé (${piscineStatus?.pending_sync?.target_temp || piscineStatus?.pending_sync?.want_target_temp || poolTarget}°C)` : ''}
                        {(piscineStatus?.pending_sync?.heating_active || piscineStatus?.pending_sync?.want_heating_active) && (piscineStatus?.pending_sync?.filtration_active || piscineStatus?.pending_sync?.want_pump_active) ? ' • ' : ''}
                        {piscineStatus?.pending_sync?.filtration_active || piscineStatus?.pending_sync?.want_pump_active ? 'Filtration demandée en marche' : ''}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Fail-Fast Piscine Alert */}
              {piscineError && (
                <div className="p-3 bg-rose-50 border border-rose-300 text-rose-900 rounded-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200">
                  <span className="material-symbols-outlined text-rose-600 text-[18px] shrink-0">error</span>
                  <span>{piscineError}</span>
                </div>
              )}

              {/* Contrôles Piscine (Chauffage PAC Inopac 20 kW) */}
              <div className="space-y-3">
                {/* Switch Chauffage Piscine (PAC Inopac 20 kW) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block">
                      Chauffage Piscine (PAC Inopac 20 kW)
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isPoolHeatingActive && piscineStatus?.pac_active
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200 border border-rose-300'
                        : isPoolHeatingActive && !piscineStatus?.pac_active
                        ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border border-amber-300'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200'
                    }`}>
                      {isPoolHeatingActive && piscineStatus?.pac_active
                        ? 'État PAC : 🔥 En chauffe (compresseur actif)'
                        : isPoolHeatingActive && !piscineStatus?.pac_active
                        ? `État PAC : 🌡️ Marche (Thermostat ${poolTarget.toFixed(1)}°C • repos)`
                        : 'État PAC : ❄️ À l\'arrêt (Hors-gel 0.5°C)'}
                    </span>
                  </div>
                  <ThermalMasterSwitch
                    isActive={isPoolHeatingActive}
                    onChange={handleTogglePoolHeating}
                    disabled={Boolean(piscineError && !isRadioDown) || savingThermal}
                    offLabel="Arrêt"
                    onLabel="Marche"
                    offIcon="power_settings_new"
                    onIcon="local_fire_department"
                    ariaLabel="Interrupteur Chauffage Piscine PAC Inopac"
                  />
                  {isRadioDown && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-1 font-medium mt-1">
                      <span className="material-symbols-outlined text-[14px]">warning</span>
                      Coffret physique injoignable : commande transmise au Cloud Klereo en attente de reconnexion radio.
                    </p>
                  )}
                </div>
              </div>

              {/* Consigne et Horaires prévus pour le séjour (Annotation 8 Stitch) */}
              {currentPageIndex > 0 && currentStay && (
                <div className="p-3 bg-emerald-50/90 dark:bg-emerald-950/30 rounded-xl border border-emerald-200/80 dark:border-emerald-800/50 flex items-center justify-between gap-2 shadow-2xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="material-symbols-outlined text-primary text-[18px] shrink-0">schedule</span>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] uppercase font-bold text-on-surface-variant leading-none">Régulation séjour</span>
                      <span className="text-xs font-bold text-forest-deep dark:text-emerald-200 truncate mt-0.5">
                        Filtration auto asservie aux dates du séjour
                      </span>
                    </div>
                  </div>
                  {isPoolHeatingActive ? (
                    <span className="px-2 py-1 rounded-md bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800/50 text-primary font-bold text-xs shrink-0 tabular-nums">
                      {poolTarget.toFixed(1)}°C
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md bg-sky-100 text-sky-900 dark:bg-sky-950/80 dark:text-sky-200 font-bold text-[10px] shrink-0">
                      Hors-gel Klereo
                    </span>
                  )}
                </div>
              )}

              {/* Alertes Klereo dynamiques issues de l'API (Zero-Trust) */}
              {piscineStatus?.alerts && piscineStatus.alerts.length > 0 && (
                <div className="flex flex-col gap-2">
                  {piscineStatus.alerts.map((alert, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 text-amber-900 dark:text-amber-200 rounded-xl text-xs font-medium flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-amber-600 text-sm">warning</span>
                      <span>{alert.message || alert}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Réglages des consignes Piscine */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block">
                    Réglages des Consignes
                  </span>
                  {!isPoolHeatingActive && (
                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                      Chauffage coupé • PAC inactive
                    </span>
                  )}
                </div>

                {!isPoolHeatingActive && (
                  <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-border-subtle flex items-start gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                    <span className="material-symbols-outlined text-slate-500 text-[16px] shrink-0 mt-0.5">info</span>
                    <span>
                      <strong>Chauffage à l'arrêt :</strong> Le bassin n'est pas en chauffe (surveillance hors-gel 0.5°C). La consigne ci-dessous ({poolTarget.toFixed(1)}°C) est en réserve et ne sera active que si le chauffage est basculé sur <em>Marche</em>.
                    </span>
                  </div>
                )}

                {/* 1. Température en fonctionnement (Baignade) */}
                <div className={`p-3.5 bg-white dark:bg-slate-900 rounded-xl border flex items-center justify-between gap-2 shadow-2xs transition-colors ${
                  isPoolHeatingActive ? 'border-rose-300 dark:border-rose-800/80 ring-1 ring-rose-400/30' : 'border-border-subtle opacity-90'
                }`}>
                  <div className="flex items-center gap-2.5 min-w-0 pr-1">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      isPoolHeatingActive ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                    }`}>
                      <span className="material-symbols-outlined text-[20px]">pool</span>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-on-surface leading-tight">
                          {isPoolHeatingActive ? 'Consigne de baignade active' : 'Consigne en réserve (PAC Arrêt)'}
                        </span>
                        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                          isPoolHeatingActive ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}>
                          {isPoolHeatingActive ? 'En chauffe' : 'En réserve'}
                        </span>
                      </div>
                      <span className="text-[10px] text-on-surface-variant">
                        {isPoolHeatingActive ? `La PAC maintient l'eau vers ${poolTarget.toFixed(1)}°C` : `S'appliquera lors de la mise en marche`}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 bg-canvas-slate p-1 rounded-full border border-border-subtle">
                    <button
                      aria-label="Diminuer consigne piscine"
                      className="w-7 h-7 rounded-full bg-white dark:bg-slate-800 border border-outline-variant hover:bg-surface-container flex items-center justify-center text-on-surface active:scale-95 transition-transform shadow-2xs cursor-pointer"
                      type="button"
                      onClick={() => handlePoolChange(-0.5)}
                    >
                      <span className="material-symbols-outlined text-[15px]">remove</span>
                    </button>
                    <span className={`font-headline-md text-sm sm:text-base font-bold tabular-nums w-12 text-center ${
                      isPoolHeatingActive ? 'text-primary' : 'text-on-surface-variant'
                    }`}>
                      {poolTarget.toFixed(1)}<span className="text-xs text-outline font-normal">°C</span>
                    </span>
                    <button
                      aria-label="Augmenter consigne piscine"
                      className={`w-7 h-7 rounded-full flex items-center justify-center font-bold active:scale-95 transition-transform shadow-2xs cursor-pointer ${
                        isPoolHeatingActive ? 'bg-primary text-white hover:bg-forest-deep' : 'bg-slate-700 text-white hover:bg-slate-800'
                      }`}
                      type="button"
                      onClick={() => handlePoolChange(0.5)}
                    >
                      <span className="material-symbols-outlined text-[15px]">add</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Indicators */}
              <div className="pt-2.5 border-t border-border-subtle flex flex-wrap items-center gap-1.5">
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-border-subtle text-[11px] font-medium text-on-surface-variant">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                  <span>pH : <strong>{piscineStatus?.ph != null ? piscineStatus.ph.toFixed(1) : (piscineStatus?.ph_value != null ? piscineStatus.ph_value.toFixed(1) : '--')}</strong></span>
                </div>
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-border-subtle text-[11px] font-medium text-on-surface-variant">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                  <span>Redox : <strong>{piscineStatus?.redox_mv != null ? `${piscineStatus.redox_mv} mV` : (piscineStatus?.redox_value != null ? `${piscineStatus.redox_value} mV` : '-- mV')}</strong></span>
                </div>
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-border-subtle text-[11px] font-medium text-on-surface-variant">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                  <span>Filtre : <strong>{piscineStatus?.filter_pressure_mbar != null ? `${piscineStatus.filter_pressure_mbar} mbar` : (piscineStatus?.filter_pressure != null ? `${piscineStatus.filter_pressure} mbar` : '-- mbar')}</strong></span>
                </div>
                <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                  piscineStatus?.pump_relay_active
                    ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
                    : isPoolPumpActive
                    ? 'bg-sage-soft text-primary'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}>
                  <span className="material-symbols-outlined text-[12px]">sync</span>
                  Pompe {piscineStatus?.pump_relay_active ? 'ON (En cours)' : (isPoolPumpActive ? 'AUTO (Veille cycle)' : 'OFF')}
                </div>
                <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                  piscineStatus?.pac_active
                    ? 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200 animate-pulse'
                    : isPoolHeatingActive
                    ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}>
                  <span className="material-symbols-outlined text-[12px]">hvac</span>
                  PAC {piscineStatus?.pac_active ? 'ON (Chauffe)' : (isPoolHeatingActive ? 'AUTO (Veille)' : 'OFF')}
                </div>
              </div>

            </div>
          </div>

        </div>
        )}

        {/* Action Button: Enregistrer les consignes thermiques (Annotation 1 & 2) */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border-subtle">
          <div className="flex items-center gap-2 text-xs text-on-surface-variant">
            <span className="material-symbols-outlined text-primary text-[18px]">mail</span>
            <span>Toute modification de consigne ou commande manuelle est validée et notifiée par email à tous les associés.</span>
          </div>
          <button
            type="button"
            disabled={savingThermal}
            onClick={handleSaveThermalSettings}
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-primary hover:bg-forest-deep text-white font-bold text-sm shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-[20px]">save</span>
            <span>{savingThermal ? 'Enregistrement en cours...' : 'Enregistrer les consignes thermiques'}</span>
          </button>
        </div>

        {/* Graphe Annuel & Quotidien Fioul (Josse / Bompais — Annotation 3) */}
        <FuelInteractiveGraph fuelHistory={fuelHistory} heatingStatus={heatingStatus} onRefreshFuel={refreshFuelTelemetry} />


      </section>

      {/* ===================================================================== */}
      {/* 4. MISSIONS & TÂCHES SOUS VOTRE RESPONSABILITÉ (Pages 1 à N)          */}
      {/* ===================================================================== */}
      {currentPageIndex > 0 && (
        <section className="bg-surface-container-lowest rounded-lg p-6 sm:p-8 lg:p-10 shadow-sm border border-outline-variant/30 mb-10 flex flex-col gap-6 w-full max-w-full">
        
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-outline-variant/20 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-on-surface-variant font-medium">{resolveCurrentUserFullName(currentUser)}</span>
              {displayedTasks.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sage-soft text-primary font-label-sm text-xs font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                  {displayedTasks.filter(t => t.status === 'active' || t.status === 'EN_COURS' || isTaskPendingValidation(t)).length} Tâches actives sur place
                </span>
              )}
              {isCoordinator && displayedTasks.some(isTaskPendingValidation) && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200 border border-purple-300 font-label-sm text-xs font-bold">
                  <span className="material-symbols-outlined text-[14px]">verified</span>
                  {displayedTasks.filter(isTaskPendingValidation).length} à valider
                </span>
              )}
            </div>
            <h2 className="font-headline-md text-headline-md text-forest-deep font-bold tracking-tight mt-1">
              Missions &amp; Tâches sous votre responsabilité
            </h2>
          </div>
        </div>

        {/* Tasks Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {displayedTasks.length === 0 ? (
            <div className="col-span-full py-8 px-4 rounded-xl bg-canvas-slate border border-dashed border-outline-variant/40 flex flex-col items-center justify-center text-center">
              <span className="material-symbols-outlined text-[32px] text-on-surface-variant/60 mb-2">assignment_turned_in</span>
              <p className="text-sm font-semibold text-forest-deep">Aucune tâche assignée pour ce séjour</p>
            </div>
          ) : (
            displayedTasks.map((task, idx) => (
              <TaskCard
                key={task.id || idx}
                task={task}
                currentUser={currentUser}
                onOpen={handleOpenTaskDetail}
              />
            ))
          )}
        </div>

      </section>
      )}

      {/* ===================================================================== */}
      {/* 4. VADÉMÉCUM ESSENTIEL DU DOMAINE (Accès direct en séjour)            */}
      {/* ===================================================================== */}
      <section id="vademecum" className="scroll-mt-24 bg-surface-container-lowest rounded-lg p-6 sm:p-8 lg:p-10 shadow-sm border border-border-subtle mb-6 w-full max-w-full">
        
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 text-primary font-label-md text-label-md uppercase tracking-wider mb-1 font-bold">
              <span className="material-symbols-outlined text-[20px]">menu_book</span>
              <span>Intendance &amp; Sécurité Immédiate</span>
            </div>
            <h2 className="font-headline-lg text-headline-lg text-primary tracking-tight font-bold">
              Vadémécum &amp; Repères Pratiques du Séjour
            </h2>
            <p className="text-xs text-on-surface-variant mt-1">
              Consignes permanentes, codes et procédures de la maison
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsNewItemModalOpen(true)}
              className="h-10 px-4 bg-primary hover:bg-forest-deep text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
              type="button"
            >
              <Plus className="h-4 w-4" />
              <span>Ajouter une Fiche</span>
            </button>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-canvas-slate p-3 rounded-2xl border border-border-subtle mb-6">
          <div className="flex overflow-x-auto space-x-1.5 py-1 w-full sm:w-auto">
            <button
              onClick={() => setSelectedCategory('Toutes')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                selectedCategory === 'Toutes'
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-white text-on-surface-variant hover:text-on-surface border border-border-subtle'
              }`}
              type="button"
            >
              Toutes
            </button>
            {categoriesList.map((cat) => (
              <button
                key={cat.id || cat.name}
                onClick={() => setSelectedCategory(cat.name)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                  selectedCategory === cat.name
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-white text-on-surface-variant hover:text-on-surface border border-border-subtle'
                }`}
                type="button"
              >
                <span>{cat.emoji || '📁'}</span>
                <span>{cat.name}</span>
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <input
              type="text"
              placeholder="Rechercher (ex: Wifi, eau)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3.5 py-2 pl-9 bg-white border border-border-subtle rounded-xl text-xs text-on-surface focus:outline-none focus:border-primary"
            />
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-outline" />
          </div>
        </div>

        {/* Database Cards Grid */}
        {loadingDb ? (
          <div className="flex justify-center py-12 text-outline">
            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : filteredDbItems.length === 0 ? (
          <div className="bg-canvas-slate border border-border-subtle rounded-2xl p-8 text-center text-on-surface-variant">
            <BookOpen className="h-10 w-10 text-outline mx-auto mb-2" />
            <h4 className="text-sm font-bold text-on-surface">Aucune fiche enregistrée</h4>
            <p className="text-xs mt-1">Créez votre première fiche vademecum pour l'intendance du domaine.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDbItems.map((item) => (
              <div
                key={item.id}
                className="bg-white border border-border-subtle hover:border-sage-border rounded-2xl p-4 shadow-xs hover:shadow-sm transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded-md bg-canvas-slate border border-border-subtle text-[11px] font-bold text-on-surface-variant">
                      {item.category}
                    </span>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuId(activeMenuId === item.id ? null : item.id);
                        }}
                        className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
                        title="Options de la fiche"
                      >
                        <span className="material-symbols-outlined text-[18px]">more_vert</span>
                      </button>
                      {activeMenuId === item.id && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-0 top-8 z-20 w-44 bg-white rounded-xl shadow-lg border border-border-subtle p-1 animate-in fade-in zoom-in-95 duration-100"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setActiveMenuId(null);
                              setItemToDelete(item);
                            }}
                            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors text-left cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Supprimer la fiche</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <h4 className="text-sm font-bold text-on-surface mb-1">{item.title}</h4>
                  <p className="text-xs text-on-surface-variant leading-relaxed whitespace-pre-line mb-3">
                    {item.content}
                  </p>
                </div>

                {item.code_to_copy && (
                  <div className="bg-canvas-slate border border-border-subtle rounded-xl p-2.5 flex items-center justify-between gap-2 mt-2">
                    <span className="text-xs font-mono font-bold text-primary truncate">
                      {item.code_to_copy}
                    </span>
                    <button
                      onClick={() => handleCopyDbCode(item.id, item.code_to_copy)}
                      className="px-2.5 py-1 bg-white hover:bg-sage-soft text-primary border border-border-subtle rounded-lg text-[11px] font-bold flex items-center gap-1 transition shrink-0 cursor-pointer"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {copiedDbId === item.id ? 'check' : 'content_copy'}
                      </span>
                      <span>{copiedDbId === item.id ? 'Copié' : 'Copier'}</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

      </section>

      {/* Confirmation explicite de suppression d'une fiche vadémécum */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 text-on-surface">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center shrink-0">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">Confirmer la suppression</h3>
                <p className="text-xs text-slate-500">Cette action est définitive et irréversible.</p>
              </div>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
              Êtes-vous certain de vouloir supprimer définitivement la fiche pratique <strong className="text-slate-900">« {itemToDelete.title} »</strong> ({itemToDelete.category}) ?
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={async () => {
                  const id = itemToDelete.id;
                  setItemToDelete(null);
                  await handleDeleteDbItem(id);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors cursor-pointer shadow-sm"
              >
                Supprimer définitivement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODALS                                                                */}
      {/* ===================================================================== */}

      {/* Category Manage Modal (Annotation 3) */}
      <CategoryManageModal
        isOpen={isEditCategoryModalOpen}
        onClose={() => setIsEditCategoryModalOpen(false)}
        category={selectedEditingCat}
        onUpdated={handleCategoryUpdated}
        onDeleted={handleCategoryDeleted}
      />

      {/* Modal 3: Task Detail (Annotation 9 : Modale unifiée TaskDetailModal) */}
      <TaskDetailModal
        task={selectedTask}
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setSelectedTask(null);
        }}
        currentUser={currentUser}
        onTaskUpdated={loadInitialData}
      />

      {/* Modal 4: BookingModal (Annotation 9 : Véritable BookingModal prérempli au clic sur Modifier) */}
      <BookingModal
        isOpen={isEditStayOpen}
        onClose={() => setIsEditStayOpen(false)}
        initialReservation={currentStay}
        properties={properties}
        currentUser={currentUser}
        onBooked={async () => {
          setIsEditStayOpen(false);
          showToast('Séjour enregistré avec succès !');
          await loadInitialData();
        }}
      />

      {/* Modal 5: New Vademecum Item Modal */}
      {isNewItemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-container-lowest border border-border-subtle rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative text-on-surface">
            <h3 className="text-lg font-bold text-primary mb-4">Nouvelle Fiche Vademecum</h3>
            
            <form onSubmit={handleCreateDbItem} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-on-surface">Catégorie *</label>
                  <button
                    type="button"
                    onClick={() => setIsNewCategoryOpen(!isNewCategoryOpen)}
                    className="text-xs font-semibold text-primary hover:text-forest-deep flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {isNewCategoryOpen ? 'remove_circle' : 'add_circle'}
                    </span>
                    <span>{isNewCategoryOpen ? 'Masquer' : '+ Nouvelle catégorie'}</span>
                  </button>
                </div>

                {/* Sous-formulaire de création inline */}
                {isNewCategoryOpen && (
                  <div className="p-3.5 mb-3 bg-canvas-slate rounded-2xl border border-primary/30 space-y-3 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-forest-deep flex items-center gap-1">
                        <span className="material-symbols-outlined text-[16px] text-primary">palette</span>
                        Créer une catégorie
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Nom *</label>
                        <input
                          type="text"
                          placeholder="Ex: Wi-Fi & Réseau"
                          value={newCatName}
                          onChange={(e) => setNewCatName(e.target.value)}
                          className="w-full h-9 px-2.5 bg-white border border-border-subtle rounded-lg text-xs focus:outline-none focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Émoji</label>
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={newCatEmoji}
                            onChange={(e) => setNewCatEmoji(e.target.value)}
                            className="w-12 h-9 text-center bg-white border border-border-subtle rounded-lg text-sm focus:outline-none focus:border-primary"
                            maxLength={3}
                          />
                          <div className="flex items-center gap-0.5 overflow-x-auto py-0.5">
                            {EMOJI_PRESETS.slice(0, 6).map((em) => (
                              <button
                                key={em}
                                type="button"
                                onClick={() => setNewCatEmoji(em)}
                                className={`w-7 h-7 text-xs rounded hover:bg-white cursor-pointer ${newCatEmoji === em ? 'ring-2 ring-primary bg-white' : ''}`}
                              >
                                {em}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1.5">Couleur associée</label>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {COLOR_OPTIONS.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setNewCatColor(c.id)}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border cursor-pointer transition-all ${
                              newCatColor === c.id
                                ? 'ring-2 ring-primary ring-offset-1 font-bold shadow-xs'
                                : 'opacity-80 hover:opacity-100'
                            } ${c.badgeBg}`}
                          >
                            <span className={`w-2.5 h-2.5 rounded-full ${c.bg}`}></span>
                            <span>{c.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-border-subtle">
                      <button
                        type="button"
                        onClick={() => setIsNewCategoryOpen(false)}
                        className="px-3 py-1.5 rounded-lg text-xs text-slate-600 hover:bg-white"
                      >
                        Annuler
                      </button>
                      <button
                        type="button"
                        onClick={handleCreateCategorySubmit}
                        disabled={isCreatingCat || !newCatName.trim()}
                        className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-forest-deep disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                      >
                        {isCreatingCat ? 'Création...' : 'Valider la catégorie'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Sélecteur + Bouton Éditer */}
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <CustomSelect
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      options={categoriesList.map((cat) => ({
                        value: cat.name,
                        label: `${cat.emoji || '📁'} ${cat.name}`,
                      }))}
                      className="h-10 text-xs"
                    />
                  </div>
                  {categoriesList.length > 0 && (
                    <button
                      type="button"
                      onClick={handleOpenEditCategory}
                      title="Éditer la catégorie sélectionnée"
                      className="h-10 px-3 bg-white border border-border-subtle rounded-xl text-on-surface hover:text-primary hover:border-primary flex items-center justify-center gap-1 transition-all cursor-pointer text-xs font-semibold shrink-0 shadow-xs"
                    >
                      <span className="material-symbols-outlined text-[16px]">tune</span>
                      <span>Éditer</span>
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface mb-1">Titre de la fiche *</label>
                <input
                  type="text"
                  placeholder="ex: Emplacement échelle télescopique"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-canvas-slate border border-border-subtle rounded-xl text-xs text-on-surface focus:outline-none focus:border-primary"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface mb-1">Contenu / Explications *</label>
                <textarea
                  rows={4}
                  placeholder="Détails, emplacement, consignes..."
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="w-full px-3 py-2 bg-canvas-slate border border-border-subtle rounded-xl text-xs text-on-surface focus:outline-none focus:border-primary"
                  required
                ></textarea>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border-subtle">
                <button
                  type="button"
                  onClick={() => setIsNewItemModalOpen(false)}
                  className="px-5 py-2.5 rounded-full text-xs font-semibold text-on-surface hover:bg-canvas-slate cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submittingItem}
                  className="px-6 py-2.5 rounded-full bg-primary hover:bg-forest-deep text-white text-xs font-bold shadow-sm transition disabled:opacity-50 cursor-pointer"
                >
                  {submittingItem ? 'Enregistrement...' : 'Enregistrer la fiche'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}
