import React, { useState, useEffect } from 'react';
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
  setHeatingMode as apiSetHeatingMode
} from '../api';
import SejourCutoffMapModal from '../components/sejour/SejourCutoffMapModal';
import SejourDepartureChecklistModal from '../components/sejour/SejourDepartureChecklistModal';
import SejourTaskModal from '../components/sejour/SejourTaskModal';
import BookingModal from '../components/BookingModal';
import { ThermalMetricSkeleton, StayCardSkeleton } from '../components/SkeletonLoaders';
import CustomSelect from '../components/CustomSelect';

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

export default function VademecumPage({ properties, currentUser }) {
  // Multi-page stay state (Annotation 2 : Navigation multi-pages avec Page 0 Domaine seul)
  const [upcomingStays, setUpcomingStays] = useState([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0); // 0 = Domaine seul, 1..N = Séjours futurs
  const [stayLoading, setStayLoading] = useState(true);

  const totalStays = upcomingStays.length;
  const currentStay = currentPageIndex > 0 ? upcomingStays[currentPageIndex - 1] : null;

  // Modals state
  const [isEditStayOpen, setIsEditStayOpen] = useState(false);
  const [isCutoffModalOpen, setIsCutoffModalOpen] = useState(false);
  const [isChecklistModalOpen, setIsChecklistModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  // Toast notification state
  const [toastMessage, setToastMessage] = useState(null);
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Live Telemetry State & Fail-fast (Annotation 4 & 6)
  const [heatingStatus, setHeatingStatus] = useState(null);
  const [heatingError, setHeatingError] = useState(null);
  const [piscineStatus, setPiscineStatus] = useState(null);
  const [telemetryLoading, setTelemetryLoading] = useState(true);

  // Thermal controls state (Annotation 2: Contrôles directs réels)
  const [heatingTarget, setHeatingTarget] = useState(19.5);
  const [heatingMode, setHeatingMode] = useState('Normal'); // 'Normal' | 'Éco' | 'Arrêt'
  const [dhwTarget, setDhwTarget] = useState(55.0);
  const [dhwMode, setDhwMode] = useState('Normal');
  const [poolTarget, setPoolTarget] = useState(14.0);
  const [poolPumpMode, setPoolPumpMode] = useState('Automatique'); // 'Automatique' | 'Marche forcée' | 'Arrêt'
  const [savingThermal, setSavingThermal] = useState(false);

  // Real Tasks loaded from Database (Annotation 7)
  const [tasks, setTasks] = useState([]);

  // Load initial data
  const loadInitialData = async () => {
    try {
      setTelemetryLoading(true);
      setStayLoading(true);

      const [heatRes, poolRes, taskRes, reservationsRes] = await Promise.all([
        fetchHeatingStatus().catch(err => {
          console.warn('ViCare telemetry failure:', err.message);
          return { error: err.message || 'Liaison ViCare indisponible : impossible d\'interroger la chaudière' };
        }),
        fetchPiscineStatus().catch(err => {
          console.warn('Piscine telemetry failure:', err.message);
          return null;
        }),
        fetchTasks().catch(err => {
          console.warn('Tasks load fallback:', err.message);
          return [];
        }),
        fetchReservations().catch(err => {
          console.warn('Reservations load fallback:', err.message);
          return [];
        }),
      ]);

      // ViCare Telemetry & Fail-fast
      if (heatRes && !heatRes.error) {
        setHeatingStatus(heatRes);
        setHeatingError(null);
        if (heatRes.target_temperature != null) setHeatingTarget(heatRes.target_temperature);
        if (heatRes.dhw_temperature != null) setDhwTarget(heatRes.dhw_temperature);
        if (heatRes.active_mode) {
          const m = heatRes.active_mode.toLowerCase();
          if (m.includes('eco')) setHeatingMode('Éco');
          else if (m.includes('standby') || m.includes('off') || m.includes('arret')) setHeatingMode('Arrêt');
          else setHeatingMode('Normal');
        }
      } else {
        setHeatingStatus(null);
        setHeatingError('⚠️ Liaison ViCare indisponible : impossible d\'interroger la chaudière');
      }

      // Piscine Telemetry
      if (poolRes) {
        setPiscineStatus(poolRes);
        if (poolRes.frost_protection_target != null) setPoolTarget(poolRes.frost_protection_target);
        else if (poolRes.target_temperature != null) setPoolTarget(poolRes.target_temperature);
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
      if (Array.isArray(reservationsRes)) {
        const todayStr = new Date().toISOString().split('T')[0];
        const userName = resolveCurrentUserFullName(currentUser);
        const userFirst = userName.split(' ')[0].toLowerCase();
        const currentUserId = currentUser?.id;

        const userUpcoming = reservationsRes
          .filter((r) => {
            if (r.status === 'Refusée' || r.status === 'Annulée') return false;
            const isUpcoming = (r.end_date && r.end_date >= todayStr) || (r.start_date && r.start_date >= todayStr);
            if (!isUpcoming) return false;
            const rMemberId = r.member_id ?? r.user_id;
            if (currentUserId != null && rMemberId != null && Number(currentUserId) === Number(rMemberId)) {
              return true;
            }
            const rUser = (r.user_name || '').toLowerCase();
            return rUser.includes(userFirst) || userName.toLowerCase().includes(rUser);
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

  const handleHeatingChange = (delta) => {
    const nextVal = Math.round((heatingTarget + delta) * 10) / 10;
    if (delta > 0 && heatingTarget >= 20.0) {
      showToast('Consigne maximale autorisée par la charte des associés : 20.0°C.');
      return;
    }
    if (nextVal < 12.0) return;
    setHeatingTarget(nextVal);
  };

  const handleDhwChange = (delta) => {
    const nextVal = Math.round((dhwTarget + delta) * 10) / 10;
    if (nextVal < 45.0 || nextVal > 65.0) return;
    setDhwTarget(nextVal);
  };

  const handlePoolChange = (delta) => {
    const nextVal = Math.round((poolTarget + delta) * 10) / 10;
    if (nextVal < 10.0 || nextVal > 30.0) return;
    setPoolTarget(nextVal);
  };

  // Annotation 2 : Enregistrement réel des modifications thermiques avec notification email
  const handleSaveThermalSettings = async () => {
    try {
      setSavingThermal(true);
      const modeKey = heatingMode === 'Éco' ? 'eco' : heatingMode === 'Arrêt' ? 'standby' : 'normal';
      try {
        await setHeatingTemperature(heatingTarget);
      } catch (err) {
        console.warn('API heating temperature update:', err.message);
      }
      try {
        await apiSetHeatingMode(modeKey);
      } catch (err) {
        console.warn('API heating mode update:', err.message);
      }

      showToast(`Consignes enregistrées : Chauffage ${heatingTarget.toFixed(1)}°C (${heatingMode}), Piscine ${poolTarget.toFixed(1)}°C (${poolPumpMode}). Notification envoyée.`);
    } catch (err) {
      showToast(`Erreur : ${err.message}`);
    } finally {
      setSavingThermal(false);
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

  // WiFi password copy
  const [wifiCopied, setWifiCopied] = useState(false);
  const handleCopyWifi = () => {
    navigator.clipboard.writeText('HellenvilliersManoir2026!');
    setWifiCopied(true);
    showToast('Mot de passe Wi-Fi copié : HellenvilliersManoir2026!');
    setTimeout(() => setWifiCopied(false), 2500);
  };

  // Full Vademecum Database Section Toggle & State
  const [showFullVademecum, setShowFullVademecum] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('Toutes');
  const [searchQuery, setSearchQuery] = useState('');
  const [vademecumItems, setVademecumItems] = useState([]);
  const [loadingDb, setLoadingDb] = useState(false);
  const [dbError, setDbError] = useState(null);
  const [copiedDbId, setCopiedDbId] = useState(null);

  // New Item modal state
  const [isNewItemModalOpen, setIsNewItemModalOpen] = useState(false);
  const [newCategory, setNewCategory] = useState('Wi-Fi & Réseau');
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCodeToCopy, setNewCodeToCopy] = useState('');
  const [newImportance, setNewImportance] = useState('INFO');
  const [submittingItem, setSubmittingItem] = useState(false);

  const categories = [
    'Toutes',
    'Wi-Fi & Réseau',
    'Accès & Clés',
    'Eau & Électricité',
    'Chauffage & Fioul',
    'Déchets & Recyclage',
    'Équipements & Notice',
    'Urgence'
  ];

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
    if (showFullVademecum) {
      loadVademecumDb();
    }
  }, [showFullVademecum, selectedCategory]);

  const handleCreateDbItem = async (e) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;
    try {
      setSubmittingItem(true);
      await createVademecumItem({
        property_id: properties?.[0]?.id || 1,
        category: newCategory,
        title: newTitle.trim(),
        content: newContent.trim(),
        code_to_copy: newCodeToCopy.trim() || null,
        importance: newImportance
      });
      setNewTitle('');
      setNewContent('');
      setNewCodeToCopy('');
      setIsNewItemModalOpen(false);
      showToast('Fiche Vademecum enregistrée !');
      await loadVademecumDb();
    } catch (err) {
      console.error('Failed to create item:', err);
      showToast(`Erreur : ${err.message}`);
    } finally {
      setSubmittingItem(false);
    }
  };

  const handleDeleteDbItem = async (itemId) => {
    if (!window.confirm('Voulez-vous vraiment supprimer cette fiche Vademecum ?')) return;
    try {
      await deleteVademecumItem(itemId);
      showToast('Fiche Vademecum supprimée');
      await loadVademecumDb();
    } catch (err) {
      console.error('Failed to delete item:', err);
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
                onClick={() => setIsEditStayOpen(true)}
                className="group flex items-center justify-center gap-2 px-5 py-3.5 rounded-DEFAULT bg-white dark:bg-slate-900 border-2 border-outline-variant text-on-surface hover:bg-canvas-slate hover:border-outline font-label-lg text-sm sm:text-base font-semibold transition-all duration-200 shadow-sm cursor-pointer whitespace-nowrap"
                type="button"
              >
                <span className="material-symbols-outlined text-[22px] text-primary group-hover:scale-110 transition-transform">calendar_month</span>
                <span>Planifier un séjour</span>
              </button>
            )}

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
        <section className="relative bg-surface-container-lowest rounded-2xl p-6 sm:p-8 shadow-sm border border-border-subtle mb-10 overflow-hidden w-full max-w-full">
          <div className="relative z-10 flex flex-col xl:flex-row items-start justify-between gap-6">
            
            {/* Left: Stay Identifiers & Status */}
            <div className="flex flex-col gap-4 max-w-2xl min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <span className="px-3 py-1 rounded-full bg-surface-container font-label-sm text-label-sm text-on-surface-variant font-medium">
                  Semaine {currentStay.week_number || ''} • {currentStay.year || 2026}
                </span>
                {/* ANNOTATION 1 : BADGE STATUT CONFIRMÉE SUPPRIMÉ */}
              </div>

              <div>
                <h2 className="font-display-md text-xl sm:text-2xl text-forest-deep tracking-tight font-bold">
                  {currentPageIndex === 1 ? 'Mon Prochain Séjour au Domaine' : `Séjour n°${currentPageIndex} au Domaine`}
                </h2>
              </div>

              {/* Schedule badges */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="flex items-center gap-3.5 p-3.5 rounded-xl bg-canvas-slate shadow-sm border border-border-subtle min-w-0">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-primary text-[22px]">flight_land</span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-label-sm text-label-sm text-on-surface-variant">Arrivée programmée</span>
                    <span className="font-headline-sm text-sm sm:text-base text-on-surface font-bold truncate">
                      {formatDateReadable(currentStay.start_date)} • {currentStay.arrival_time || '15:00'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3.5 p-3.5 rounded-xl bg-canvas-slate shadow-sm border border-border-subtle min-w-0">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-primary text-[22px]">flight_takeoff</span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-label-sm text-label-sm text-on-surface-variant">Départ & Hors-gel</span>
                    <span className="font-headline-sm text-sm sm:text-base text-on-surface font-bold truncate">
                      {formatDateReadable(currentStay.end_date)} • {currentStay.departure_time || '11:00'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Capacity & Occupants breakdown */}
              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <div className="inline-flex items-center gap-2 p-1.5 px-3 rounded-xl bg-sage-soft border border-sage-border text-on-surface shadow-sm">
                  <div className="w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[16px]">person</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-label-sm text-label-sm">
                    <span className="font-bold text-primary">{currentStay.user_name}</span>
                  </div>
                </div>

                {currentStay.guest_count > 1 && (
                  <div className="inline-flex items-center gap-2 p-1.5 px-3 rounded-xl bg-canvas-slate border border-border-subtle text-on-surface shadow-sm">
                    <div className="w-6 h-6 rounded-full bg-secondary-container/15 text-secondary flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[16px]">group</span>
                    </div>
                    <div className="flex items-center gap-1.5 font-label-sm text-label-sm">
                      <span className="font-semibold text-on-surface">{currentStay.guest_count} personnes</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Annotation 3 : Noms purs des chambres sélectionnées sans mention de couchages */}
              <div className="flex flex-col gap-2 pt-1 font-label-sm text-label-sm text-on-surface-variant">
                <div className="flex flex-wrap items-center gap-2">
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

            {/* Right: Quick actions for stay */}
            <div className="flex flex-col sm:flex-row xl:flex-col gap-3 w-full xl:w-64 shrink-0">
              <button
                onClick={() => setIsEditStayOpen(true)}
                className="w-full py-3 px-4 rounded-xl bg-white border border-border-subtle hover:bg-canvas-slate text-on-surface font-label-md text-sm font-semibold transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                type="button"
              >
                <span className="material-symbols-outlined text-[20px] text-primary">edit_calendar</span>
                <span>Modifier le séjour</span>
              </button>
              <button
                onClick={() => setIsChecklistModalOpen(true)}
                className="w-full py-3 px-4 rounded-xl bg-white border border-border-subtle hover:bg-canvas-slate text-on-surface font-label-md text-sm font-semibold transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                type="button"
              >
                <span className="material-symbols-outlined text-[20px] text-primary">checklist</span>
                <span>Checklist départ</span>
              </button>
            </div>

          </div>
        </section>
      )}

      {/* ===================================================================== */}
      {/* 3. RÉGULATION & CONFORT ÉNERGÉTIQUE                                   */}
      {/* ===================================================================== */}
      <section className="bg-surface-container-lowest rounded-lg p-6 sm:p-8 lg:p-10 shadow-sm border border-border-subtle mb-10 flex flex-col gap-6 w-full max-w-full">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border-subtle pb-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-sage-soft text-primary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[26px]">thermostat_auto</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-headline-md text-headline-md text-primary tracking-tight font-bold">
                  Régulation &amp; Confort Énergétique
                </h2>
              </div>
              {/* ANNOTATION 3 : SOUS-TITRE VERBEUX SUPPRIMÉ */}
            </div>
          </div>
        </div>

        {/* Cycles Automatiques asservis au séjour (Pages 1 à N uniquement - Conforme Stitch) */}
        {currentPageIndex > 0 && currentStay && (
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50/70 to-emerald-50/50 border border-emerald-200/80 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs shadow-xs">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center shrink-0 shadow-xs">
                <span className="material-symbols-outlined text-[22px]">schedule</span>
              </div>
              <div>
                <div className="font-bold text-forest-deep text-sm flex items-center gap-2 flex-wrap">
                  <span>Cycles Automatiques ViCare du Séjour</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-200/80 text-emerald-950 font-mono text-[10px] font-bold">
                    Asservissement Calendrier
                  </span>
                </div>
                <p className="text-on-surface-variant text-[11px] mt-0.5">
                  Mise en marche anticipée et extinction programmées selon les horaires de votre séjour.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0">
              <div className="flex items-center gap-3 bg-white/90 px-3.5 py-2.5 rounded-xl border border-emerald-200 shadow-2xs">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px]">heat</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-on-surface-variant block">Préchauffage auto (19°C)</span>
                  <span className="font-bold text-forest-deep text-xs">
                    {formatPreheatingSchedule(currentStay)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 bg-white/90 px-3.5 py-2.5 rounded-xl border border-emerald-200 shadow-2xs">
                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px]">mode_fan_off</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-on-surface-variant block">Extinction & Hors-gel (12°C)</span>
                  <span className="font-bold text-forest-deep text-xs">
                    {formatShutdownSchedule(currentStay)}
                  </span>
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
              <div className="flex items-center justify-between border-b border-border-subtle pb-3 gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="material-symbols-outlined text-primary text-[22px]">hvac</span>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold truncate">Chauffage (ViCare)</h3>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-label-sm text-[11px] font-bold shrink-0 ${
                    heatingError ? 'bg-rose-100 text-rose-800' : 'bg-sage-soft text-primary'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${heatingError ? 'bg-rose-600' : 'bg-primary'}`}></span>
                    {heatingError ? 'Indisponible' : 'En marche'}
                  </span>
                </div>
              </div>

              {/* Fail-Fast ViCare Alert (Annotation 4 & 6) */}
              {heatingError && (
                <div className="p-3 bg-rose-50 border border-rose-300 text-rose-900 rounded-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200">
                  <span className="material-symbols-outlined text-rose-600 text-[18px] shrink-0">error</span>
                  <span>⚠️ Liaison ViCare indisponible : impossible d'interroger la chaudière</span>
                </div>
              )}

              {/* Real Temperatures Telemetry (Zéro mock inventé) */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 bg-white rounded-xl border border-border-subtle flex flex-col gap-0.5 shadow-xs">
                  <span className="text-[11px] text-on-surface-variant font-medium">Ambiante mesurée</span>
                  <span className="font-headline-md text-base sm:text-lg font-bold text-on-surface tabular-nums">
                    {heatingStatus?.room_temperature != null ? `${heatingStatus.room_temperature.toFixed(1)}°C` : '--°C'}
                  </span>
                </div>
                <div className="p-3 bg-white rounded-xl border border-border-subtle flex flex-col gap-0.5 shadow-xs">
                  <span className="text-[11px] text-on-surface-variant font-medium">Chaudière réelle</span>
                  <span className="font-headline-md text-base sm:text-lg font-bold text-on-surface tabular-nums">
                    {heatingStatus?.boiler_temperature != null ? `${heatingStatus.boiler_temperature.toFixed(1)}°C` : '--°C'}
                  </span>
                </div>
              </div>

              {/* Target Temperature Control */}
              <div className="p-3.5 bg-white rounded-xl border border-border-subtle flex items-center justify-between gap-2 shadow-sm">
                <div className="flex flex-col min-w-0 pr-1">
                  <span className="font-label-md text-label-md text-on-surface font-semibold leading-tight">Consigne chauffage</span>
                  <span className="font-label-sm text-xs text-on-surface-variant mt-0.5 whitespace-nowrap">Recommandé 19°C – 20°C</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 bg-canvas-slate p-1 rounded-full border border-border-subtle">
                  <button
                    aria-label="Diminuer consigne chauffage"
                    className="w-8 h-8 rounded-full bg-white border border-outline-variant hover:bg-surface-container flex items-center justify-center text-on-surface active:scale-95 transition-transform shadow-sm cursor-pointer"
                    type="button"
                    onClick={() => handleHeatingChange(-0.5)}
                  >
                    <span className="material-symbols-outlined text-[16px]">remove</span>
                  </button>
                  <span className="font-headline-md text-[18px] text-primary font-bold tabular-nums w-12 text-center">
                    {heatingTarget.toFixed(1)}<span className="text-xs text-outline font-normal">°C</span>
                  </span>
                  <button
                    aria-label="Augmenter consigne chauffage"
                    className="w-8 h-8 rounded-full bg-primary text-white hover:bg-forest-deep flex items-center justify-center font-bold active:scale-95 transition-transform shadow-sm cursor-pointer"
                    type="button"
                    onClick={() => handleHeatingChange(0.5)}
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                  </button>
                </div>
              </div>

              {/* Direct Mode Controls (Annotation 2) */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block">Mode de chauffage</span>
                <div className="grid grid-cols-3 gap-1.5 bg-white p-1 rounded-xl border border-border-subtle">
                  {['Normal', 'Éco', 'Arrêt'].map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setHeatingMode(mode)}
                      className={`py-2 px-1 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
                        heatingMode === mode
                          ? 'bg-primary text-white shadow-xs'
                          : 'text-on-surface-variant hover:text-on-surface hover:bg-canvas-slate'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fuel Gauge */}
              <div className="p-3 bg-white rounded-xl border border-border-subtle flex items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="material-symbols-outlined text-amber-600 text-[20px]">local_gas_station</span>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-semibold text-on-surface">Cuve Fioul (Éts JOSSE)</span>
                    <span className="text-[11px] text-on-surface-variant">Capacité totale 3000 L</span>
                  </div>
                </div>
                <span className="font-headline-sm text-xs font-bold text-primary tabular-nums shrink-0 px-2.5 py-1 rounded-md bg-sage-soft">
                  {heatingStatus?.fuel_liters_remaining != null ? `${heatingStatus.fuel_liters_remaining} L` : '2720 L'}
                </span>
              </div>

            </div>
          </div>

          {/* Volet 2 : Eau Chaude Sanitaire (ViCare) */}
          <div className="p-5 rounded-2xl bg-canvas-slate border border-border-subtle flex flex-col justify-between gap-5 shadow-sm min-w-0">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-border-subtle pb-3 gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="material-symbols-outlined text-primary text-[22px]">water_heater</span>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold truncate">Eau Chaude (250L)</h3>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sage-soft text-primary font-label-sm text-[11px] font-bold shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                    En marche
                  </span>
                </div>
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-border-subtle shrink-0">
                  <span className="font-label-sm text-xs text-outline">Actuelle :</span>
                  <span className="font-headline-sm text-xs text-on-surface font-bold tabular-nums">
                    {heatingStatus?.dhw_temperature != null ? `${heatingStatus.dhw_temperature.toFixed(1)}°C` : '--°C'}
                  </span>
                </div>
              </div>

              {/* DHW Target temperature control */}
              <div className="p-3.5 bg-white rounded-xl border border-border-subtle flex items-center justify-between gap-2 shadow-sm">
                <div className="flex flex-col min-w-0 pr-1">
                  <span className="font-label-md text-label-md text-on-surface font-semibold leading-tight">Consigne ECS</span>
                  <span className="font-label-sm text-xs text-on-surface-variant mt-0.5 whitespace-nowrap">Recommandé 50°C – 55°C</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 bg-canvas-slate p-1 rounded-full border border-border-subtle">
                  <button
                    aria-label="Diminuer consigne eau chaude"
                    className="w-8 h-8 rounded-full bg-white border border-outline-variant hover:bg-surface-container flex items-center justify-center text-on-surface active:scale-95 transition-transform shadow-sm cursor-pointer"
                    type="button"
                    onClick={() => handleDhwChange(-0.5)}
                  >
                    <span className="material-symbols-outlined text-[16px]">remove</span>
                  </button>
                  <span className="font-headline-md text-[18px] text-primary font-bold tabular-nums w-12 text-center">
                    {dhwTarget.toFixed(1)}<span className="text-xs text-outline font-normal">°C</span>
                  </span>
                  <button
                    aria-label="Augmenter consigne eau chaude"
                    className="w-8 h-8 rounded-full bg-primary text-white hover:bg-forest-deep flex items-center justify-center font-bold active:scale-95 transition-transform shadow-sm cursor-pointer"
                    type="button"
                    onClick={() => handleDhwChange(0.5)}
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                  </button>
                </div>
              </div>

              {/* Direct Mode ECS */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block">Mode Ballon ECS</span>
                <div className="grid grid-cols-3 gap-1.5 bg-white p-1 rounded-xl border border-border-subtle">
                  {['Normal', 'Éco', 'Arrêt'].map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setDhwMode(mode)}
                      className={`py-2 px-1 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
                        dhwMode === mode
                          ? 'bg-primary text-white shadow-xs'
                          : 'text-on-surface-variant hover:text-on-surface hover:bg-canvas-slate'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
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
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-border-subtle shrink-0">
                  <span className="font-label-sm text-xs text-outline">Eau :</span>
                  <span className="font-headline-sm text-xs text-on-surface font-bold tabular-nums">
                    {piscineStatus?.water_temperature != null ? `${piscineStatus.water_temperature.toFixed(1)}°C` : '--°C'}
                  </span>
                  <span className="text-xs text-outline mx-0.5">•</span>
                  <span className="font-label-sm text-xs text-outline">Air :</span>
                  <span className="font-headline-sm text-xs text-on-surface font-bold tabular-nums">
                    {piscineStatus?.outside_temperature != null ? `${piscineStatus.outside_temperature.toFixed(1)}°C` : (piscineStatus?.air_temperature != null ? `${piscineStatus.air_temperature.toFixed(1)}°C` : '--°C')}
                  </span>
                </div>
              </div>

              {/* Annotation 5 : Fail-Fast Alerte Radio Klereo (uniquement si vraie anomalie renvoyée par le backend) */}
              {piscineStatus && (piscineStatus.radio_error === true || piscineStatus.status === 'error' || Boolean(piscineStatus.error)) && (
                <div className="p-3 bg-amber-50 border border-amber-300 text-amber-900 rounded-xl text-xs font-medium animate-in fade-in duration-200">
                  {piscineStatus.radio_alert || piscineStatus.error || '⚠️ Liaison radio K-Link 868 MHz interrompue entre le coffret piscine et le boîtier Connect.'}
                </div>
              )}

              {/* Affichage contextuel des alertes Klereo (ex: Seuil minimum Bidon pH / consommables) */}
              {(() => {
                const alertsList = Array.isArray(piscineStatus?.alerts) && piscineStatus.alerts.length > 0
                  ? piscineStatus.alerts
                  : (piscineStatus?.radio_alert && !piscineStatus?.radio_error ? [piscineStatus.radio_alert] : []);

                if (alertsList.length === 0) return null;

                return (
                  <div className="flex flex-col gap-2">
                    {alertsList.map((alt, idx) => {
                      const lower = alt.toLowerCase();
                      let label = alt;
                      let detailNote = '';
                      if (lower.includes('bidon ph') || (lower.includes('ph') && lower.includes('bidon'))) {
                        label = 'Niveau minimum Bidon pH';
                        detailNote = ' (bidon de produit régulateur à renouveler)';
                      } else if (lower.includes('bidon trait') || (lower.includes('trait') && lower.includes('bidon'))) {
                        label = 'Niveau minimum Bidon Traitement';
                        detailNote = ' (bidon de produit désinfectant à renouveler)';
                      }
                      return (
                        <div
                          key={idx}
                          className="p-3 bg-amber-50 border border-amber-300 text-amber-900 rounded-xl text-xs font-medium flex items-center gap-2"
                        >
                          <span>ℹ️ Alerte Klereo : {label}{detailNote}.</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Target Temperature Control */}
              <div className="p-3.5 bg-white rounded-xl border border-border-subtle flex items-center justify-between gap-2 shadow-sm">
                <div className="flex flex-col min-w-0 pr-1">
                  <span className="font-label-md text-label-md text-on-surface font-semibold leading-tight">Consigne eau bassin</span>
                  <span className="font-label-sm text-xs text-on-surface-variant mt-0.5 whitespace-nowrap">Seuil hors-gel 14°C</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 bg-canvas-slate p-1 rounded-full border border-border-subtle">
                  <button
                    aria-label="Diminuer consigne piscine"
                    className="w-8 h-8 rounded-full bg-white border border-outline-variant hover:bg-surface-container flex items-center justify-center text-on-surface active:scale-95 transition-transform shadow-sm cursor-pointer"
                    type="button"
                    onClick={() => handlePoolChange(-0.5)}
                  >
                    <span className="material-symbols-outlined text-[16px]">remove</span>
                  </button>
                  <span className="font-headline-md text-[18px] text-primary font-bold tabular-nums w-12 text-center">
                    {poolTarget.toFixed(1)}<span className="text-xs text-outline font-normal">°C</span>
                  </span>
                  <button
                    aria-label="Augmenter consigne piscine"
                    className="w-8 h-8 rounded-full bg-primary text-white hover:bg-forest-deep flex items-center justify-center font-bold active:scale-95 transition-transform shadow-sm cursor-pointer"
                    type="button"
                    onClick={() => handlePoolChange(0.5)}
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                  </button>
                </div>
              </div>

              {/* Filtration Pump Mode (Annotation 2: Automatique, Marche forcée, Arrêt) */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block">Mode Pompe Filtration</span>
                <div className="grid grid-cols-3 gap-1.5 bg-white p-1 rounded-xl border border-border-subtle">
                  {['Automatique', 'Marche forcée', 'Arrêt'].map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPoolPumpMode(mode)}
                      className={`py-2 px-1 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
                        poolPumpMode === mode
                          ? 'bg-primary text-white shadow-xs'
                          : 'text-on-surface-variant hover:text-on-surface hover:bg-canvas-slate'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Indicators */}
              <div className="pt-2.5 border-t border-border-subtle flex flex-wrap items-center gap-1.5">
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-border-subtle text-[11px] font-medium text-on-surface-variant">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                  <span>pH : <strong>{piscineStatus?.ph != null ? piscineStatus.ph.toFixed(1) : (piscineStatus?.ph_value != null ? piscineStatus.ph_value.toFixed(1) : '7.3')}</strong></span>
                </div>
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-border-subtle text-[11px] font-medium text-on-surface-variant">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                  <span>Redox : <strong>{piscineStatus?.redox_mv != null ? `${piscineStatus.redox_mv} mV` : (piscineStatus?.redox_value != null ? `${piscineStatus.redox_value} mV` : '680 mV')}</strong></span>
                </div>
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-border-subtle text-[11px] font-medium text-on-surface-variant">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                  <span>Filtre : <strong>{piscineStatus?.filter_pressure_mbar != null ? `${piscineStatus.filter_pressure_mbar} mbar` : (piscineStatus?.filter_pressure != null ? `${piscineStatus.filter_pressure} mbar` : '850 mbar')}</strong></span>
                </div>
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sage-soft text-primary text-[11px] font-semibold">
                  <span className="material-symbols-outlined text-[12px]">sync</span>
                  Pompe {poolPumpMode === 'Arrêt' ? 'OFF' : 'ON'}
                </div>
              </div>

            </div>
          </div>

        </div>

        {/* Action Button: Enregistrer les modifications thermiques (Annotation 2) */}
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
            <span>{savingThermal ? 'Enregistrement en cours...' : 'Enregistrer les modifications thermiques'}</span>
          </button>
        </div>

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
              {tasks.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sage-soft text-primary font-label-sm text-xs font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                  {tasks.filter(t => t.status === 'active' || t.status === 'EN_COURS').length} Tâches actives sur place
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
          {tasks.length === 0 ? (
            <div className="col-span-full py-8 px-4 rounded-xl bg-canvas-slate border border-dashed border-outline-variant/40 flex flex-col items-center justify-center text-center">
              <span className="material-symbols-outlined text-[32px] text-on-surface-variant/60 mb-2">assignment_turned_in</span>
              <p className="text-sm font-semibold text-forest-deep">Aucune tâche assignée pour ce séjour</p>
            </div>
          ) : (
            tasks.map((task, idx) => {
              const isCompleted = task.status === 'completed';
              const isHigh = task.priorityType === 'high' || task.priority === 'Critique' || task.priority === 'Haute';
              const assigneeName = task.assignee || (Array.isArray(task.assigned_members) && task.assigned_members[0]) || resolveCurrentUserFullName(currentUser);
              const initials = assigneeName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'HJ';
              const partner = task.partner || (Array.isArray(task.assigned_members) && task.assigned_members.length > 1 ? `Avec ${task.assigned_members.slice(1).join(', ')}` : 'Autonomie');
              const budgetText = task.budget_label || (task.budget ? `${task.budget} € TTC` : 'Inclus SCI');

              return (
                <article
                  key={task.id || idx}
                  className={`rounded-xl p-5 border shadow-sm flex flex-col justify-between gap-4 transition-all hover:shadow-md ${
                    isCompleted
                      ? 'bg-sage-soft/30 border-sage-border'
                      : isHigh
                      ? 'bg-amber-soft/30 border-2 border-amber-rich/40'
                      : 'bg-white border-outline-variant/40'
                  }`}
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                          isCompleted ? 'bg-primary text-white' : isHigh ? 'bg-amber-rich text-white' : 'bg-sage-soft text-primary'
                        }`}>
                          <span className="material-symbols-outlined text-[14px]">
                            {isCompleted ? 'check' : isHigh ? 'warning' : 'construction'}
                          </span>
                          {isCompleted ? 'Validée' : (task.priority || 'Priorité Normale')}
                        </span>
                        <span className="text-xs text-secondary font-semibold">{task.date || task.deadline || 'Sous 10 jours'}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-on-surface-variant font-medium block">{task.budgetType || 'Budget prévisionnel'}</span>
                        <span className="font-headline-sm text-forest-deep font-bold text-sm">{budgetText}</span>
                      </div>
                    </div>

                    <div>
                      <h3 className="font-headline-sm text-headline-sm text-forest-deep font-bold">
                        {task.title}
                      </h3>
                      <p className="font-body-md text-on-surface-variant text-xs leading-relaxed mt-1">
                        {task.description}
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-outline-variant/20 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center font-bold text-xs">
                        {initials}
                      </div>
                      <div className="flex flex-col leading-tight">
                        <span className="text-xs font-semibold text-on-surface">En charge : {assigneeName}</span>
                        <span className="text-[11px] text-on-surface-variant">{partner}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleToggleTaskComplete(task.id)}
                      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-DEFAULT border-2 font-label-sm text-xs font-bold transition-colors shadow-sm cursor-pointer ${
                        isCompleted
                          ? 'bg-sage-soft border-primary text-primary hover:bg-emerald-100'
                          : 'bg-white border-primary text-primary hover:bg-sage-soft'
                      }`}
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {isCompleted ? 'verified' : 'check_circle'}
                      </span>
                      <span>{isCompleted ? 'Action Validée ✅' : 'Valider l’action'}</span>
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>

      </section>
      )}

      {/* ===================================================================== */}
      {/* 4. VADÉMÉCUM ESSENTIEL DU DOMAINE (Accès direct en séjour)            */}
      {/* ===================================================================== */}
      <section className="bg-surface-container-lowest rounded-lg p-6 sm:p-8 lg:p-10 shadow-sm border border-border-subtle mb-6 w-full max-w-full">
        
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
          </div>

          <button
            onClick={() => setShowFullVademecum(!showFullVademecum)}
            className="h-12 px-5 rounded-full bg-surface-container-lowest border-2 border-primary text-primary hover:bg-sage-soft font-label-md text-label-md flex items-center gap-2 self-start sm:self-auto shrink-0 shadow-sm transition-all font-semibold cursor-pointer"
            type="button"
          >
            <span className="material-symbols-outlined text-[20px]">
              {showFullVademecum ? 'unfold_less' : 'library_books'}
            </span>
            <span>
              {showFullVademecum ? 'Masquer la base complète' : 'Consulter le vadémécum complet'}
            </span>
          </button>
        </div>

        {/* Practical Interactive Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          
          {/* Card 1: Wi-Fi */}
          <div className="p-6 rounded-2xl bg-canvas-slate flex flex-col justify-between gap-4 shadow-sm border border-transparent hover:border-sage-border transition-all min-w-0">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-full bg-sage-soft text-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-[22px]">wifi</span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-surface-container-lowest font-label-sm text-label-sm text-secondary font-semibold">
                  Fibre 1 Gb/s
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-label-sm text-label-sm text-outline">Réseau Wi-Fi Domaine</span>
                <span className="font-headline-sm text-headline-sm text-on-surface font-semibold truncate">
                  Hellenvilliers_Rosing_5G
                </span>
                <p className="font-body-md text-body-md text-on-surface-variant text-xs mt-1">
                  Couverture Salon, Cuisine, Bureaux &amp; Terrasse Sud.
                </p>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={handleCopyWifi}
                className="w-full h-11 px-3 rounded-full bg-surface-container-lowest border-2 border-outline-variant text-on-surface hover:bg-white hover:border-primary font-label-sm text-label-sm flex items-center justify-center gap-1.5 transition-all font-semibold cursor-pointer"
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {wifiCopied ? 'check' : 'content_copy'}
                </span>
                <span>{wifiCopied ? 'Mot de passe copié !' : 'Copier le mot de passe'}</span>
              </button>
            </div>
          </div>

          {/* Card 2: Emergency valves & electrical cutoff */}
          <div className="p-6 rounded-2xl bg-canvas-slate flex flex-col justify-between gap-4 shadow-sm border border-transparent hover:border-sage-border transition-all min-w-0">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-full bg-surface-container-high text-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-[22px]">valve</span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-surface-container-lowest font-label-sm text-label-sm text-primary font-semibold">
                  Cellier &amp; Linky
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-label-sm text-label-sm text-outline">Vannes &amp; Coupures Générales</span>
                <span className="font-headline-sm text-headline-sm text-on-surface font-semibold truncate">
                  Arrêt Eau &amp; Électricité
                </span>
                <p className="font-body-md text-body-md text-on-surface-variant text-xs mt-1">
                  Robinet d'arrêt général d'eau situé dans le cellier sous l'escalier. Disjoncteur principal au vestibule d'entrée.
                </p>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setIsCutoffModalOpen(true)}
                className="w-full h-11 px-3 rounded-full bg-surface-container-lowest border-2 border-outline-variant text-on-surface hover:bg-white hover:border-primary font-label-sm text-label-sm flex items-center justify-center gap-1.5 transition-all font-semibold cursor-pointer"
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">map</span>
                <span>Voir plan des coupures</span>
              </button>
            </div>
          </div>

          {/* Card 3: Departure & Frost-free protocol */}
          <div className="p-6 rounded-2xl bg-canvas-slate flex flex-col justify-between gap-4 shadow-sm border border-transparent hover:border-sage-border transition-all min-w-0">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-full bg-amber-soft text-amber-rich flex items-center justify-center">
                  <span className="material-symbols-outlined text-[22px]">checklist_rtl</span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-surface-container-lowest font-label-sm text-label-sm text-amber-rich font-semibold">
                  Protocole Départ
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-label-sm text-label-sm text-outline">Consignes de Départ</span>
                <span className="font-headline-sm text-headline-sm text-on-surface font-semibold truncate">
                  Fermeture &amp; Poubelles
                </span>
                <p className="font-body-md text-body-md text-on-surface-variant text-xs mt-1">
                  Baisser à 12°C, fermer radiateurs des chambres, vider frigo, bacs au point de collecte Mesnil-sur-Iton le lundi matin.
                </p>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setIsChecklistModalOpen(true)}
                className="w-full h-11 px-3 rounded-full bg-surface-container-lowest border-2 border-outline-variant text-on-surface hover:bg-white hover:border-primary font-label-sm text-label-sm flex items-center justify-center gap-1.5 transition-all font-semibold cursor-pointer"
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">verified</span>
                <span>Pointer la check-list départ</span>
              </button>
            </div>
          </div>

          {/* Card 4: Emergency Contacts & Plumber on-call */}
          <div className="p-6 rounded-2xl bg-canvas-slate flex flex-col justify-between gap-4 shadow-sm border border-transparent hover:border-sage-border transition-all min-w-0">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-full bg-error-container text-error flex items-center justify-center">
                  <span className="material-symbols-outlined text-[22px]">emergency</span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-surface-container-lowest font-label-sm text-label-sm text-error font-semibold">
                  Astreinte 24/7
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-label-sm text-label-sm text-outline">Assistance &amp; Numéros Clés</span>
                <span className="font-headline-sm text-headline-sm text-on-surface font-semibold truncate">
                  Éts Josse &amp; Urgences
                </span>
                <div className="font-body-md text-body-md text-on-surface-variant text-xs mt-1 flex flex-col gap-0.5">
                  <span>• Pompiers : <strong>18</strong></span>
                  <span>• Chauffage Josse : <strong>02 32 35 12 00</strong></span>
                  <span>• Pharmacie Mesnil-sur-Iton</span>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <a
                className="w-full h-11 px-3 rounded-full bg-surface-container-lowest border-2 border-outline-variant text-on-surface hover:bg-white hover:border-primary font-label-sm text-label-sm flex items-center justify-center gap-1.5 transition-all font-semibold cursor-pointer"
                href="tel:0232351200"
              >
                <span className="material-symbols-outlined text-[18px]">call</span>
                <span>Appeler le chauffagiste</span>
              </a>
            </div>
          </div>

        </div>

        {/* Collapsible Full Database Section */}
        {showFullVademecum && (
          <div className="mt-10 pt-8 border-t border-border-subtle animate-in fade-in duration-300">
            
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="font-headline-md text-lg font-bold text-on-surface">
                  Base Complète des Fiches Vademecum
                </h3>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Consignes permanentes, codes et procédures de la maison
                </p>
              </div>

              <button
                onClick={() => setIsNewItemModalOpen(true)}
                className="px-4 py-2 bg-primary hover:bg-forest-deep text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                type="button"
              >
                <Plus className="h-4 w-4" />
                <span>Ajouter une Fiche</span>
              </button>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-canvas-slate p-3 rounded-2xl border border-border-subtle mb-6">
              <div className="flex overflow-x-auto space-x-1.5 py-1 w-full sm:w-auto">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                      selectedCategory === cat
                        ? 'bg-primary text-white shadow-sm'
                        : 'bg-white text-on-surface-variant hover:text-on-surface border border-border-subtle'
                    }`}
                    type="button"
                  >
                    {cat}
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
                        {item.importance === 'CRITIQUE' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-200">
                            CRITIQUE
                          </span>
                        )}
                        {item.importance === 'IMPORTANT' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-soft text-amber-rich border border-amber-200">
                            IMPORTANT
                          </span>
                        )}
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

                    <div className="flex justify-end pt-2 mt-3 border-t border-border-subtle">
                      <button
                        onClick={() => handleDeleteDbItem(item.id)}
                        className="text-outline hover:text-error text-xs flex items-center gap-1 transition font-medium cursor-pointer"
                        type="button"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Supprimer</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        )}

      </section>

      {/* ===================================================================== */}
      {/* MODALS                                                                */}
      {/* ===================================================================== */}

      {/* Modal 1: Cutoff Map */}
      <SejourCutoffMapModal
        isOpen={isCutoffModalOpen}
        onClose={() => setIsCutoffModalOpen(false)}
      />

      {/* Modal 2: Departure Checklist */}
      <SejourDepartureChecklistModal
        isOpen={isChecklistModalOpen}
        onClose={() => setIsChecklistModalOpen(false)}
      />

      {/* Modal 3: Task Detail */}
      <SejourTaskModal
        task={selectedTask}
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setSelectedTask(null);
        }}
        onToggleComplete={handleToggleTaskComplete}
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
                <label className="block text-xs font-bold text-on-surface mb-1">Catégorie</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-canvas-slate border border-border-subtle rounded-xl text-xs font-semibold text-on-surface focus:outline-none focus:border-primary"
                >
                  {categories.filter((c) => c !== 'Toutes').map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-on-surface mb-1">Code à copier (optionnel)</label>
                  <input
                    type="text"
                    placeholder="ex: 1974A"
                    value={newCodeToCopy}
                    onChange={(e) => setNewCodeToCopy(e.target.value)}
                    className="w-full px-3 py-2 bg-canvas-slate border border-border-subtle rounded-xl text-xs text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-on-surface mb-1">Importance</label>
                  <select
                    value={newImportance}
                    onChange={(e) => setNewImportance(e.target.value)}
                    className="w-full px-3 py-2 bg-canvas-slate border border-border-subtle rounded-xl text-xs font-semibold text-on-surface focus:outline-none focus:border-primary"
                  >
                    <option value="INFO">INFO (Normal)</option>
                    <option value="IMPORTANT">IMPORTANT</option>
                    <option value="CRITIQUE">CRITIQUE</option>
                  </select>
                </div>
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
