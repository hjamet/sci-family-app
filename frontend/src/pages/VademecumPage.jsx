import React, { useState, useEffect } from 'react';
import { BookOpen, Search, Plus, Trash2 } from 'lucide-react';
import {
  fetchVademecum,
  createVademecumItem,
  deleteVademecumItem,
  fetchHeatingStatus,
  fetchPiscineStatus,
  fetchTasks
} from '../api';
import SejourCutoffMapModal from '../components/sejour/SejourCutoffMapModal';
import SejourDepartureChecklistModal from '../components/sejour/SejourDepartureChecklistModal';
import SejourTaskModal from '../components/sejour/SejourTaskModal';
import SejourEditModal from '../components/sejour/SejourEditModal';

export default function VademecumPage({ properties, currentUser }) {
  // Stay Banner State
  const [stayData, setStayData] = useState({
    weekLabel: 'Semaine 42 - Du 17 au 20 Octobre (Automne 2026)',
    status: 'Mission technique sur place',
    weather: '14°C • Éclaircies (Mesnil-sur-Iton)',
    arrivalDate: 'Vendredi 19 Oct. • 18h00',
    departureDate: 'Dimanche 25 Oct. • 18h00',
  });

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

  // Live Telemetry State
  const [heatingStatus, setHeatingStatus] = useState(null);
  const [piscineStatus, setPiscineStatus] = useState(null);
  const [telemetryLoading, setTelemetryLoading] = useState(true);

  // Thermal Triptych State (Régulation & Confort Énergétique)
  const [heatingTarget, setHeatingTarget] = useState(19.5);
  const [dhwTarget, setDhwTarget] = useState(55.0);
  const [poolTarget, setPoolTarget] = useState(14.0);

  // Horaires prévues de mise en marche & arrêt (Parité Stitch)
  const [heatSchedule, setHeatSchedule] = useState({
    start: 'Ven. 19 oct. — 14:00',
    end: 'Dim. 25 oct. — 18:30',
  });
  const [dhwSchedule, setDhwSchedule] = useState({
    start: 'Ven. 19 oct. — 12:00',
    end: 'Dim. 25 oct. — 19:00',
  });
  const [poolSchedule, setPoolSchedule] = useState({
    pac: 'Déconseillée (Hiver)',
    filtration: '2h/jour (Hors-gel auto)',
  });

  const [scheduleModal, setScheduleModal] = useState({
    isOpen: false,
    system: null,
    field: null,
    label: '',
    value: '',
  });

  const handleOpenScheduleModal = (system, field, label, currentValue) => {
    setScheduleModal({
      isOpen: true,
      system,
      field,
      label,
      value: currentValue,
    });
  };

  const handleSaveSchedule = (e) => {
    e.preventDefault();
    const { system, field, value } = scheduleModal;
    if (system === 'heat') {
      setHeatSchedule(prev => ({ ...prev, [field]: value }));
    } else if (system === 'dhw') {
      setDhwSchedule(prev => ({ ...prev, [field]: value }));
    } else if (system === 'pool') {
      setPoolSchedule(prev => ({ ...prev, [field]: value }));
    }
    showToast(`Horaire mis à jour : ${value}`);
    setScheduleModal(prev => ({ ...prev, isOpen: false }));
  };

  // Real Tasks loaded from Database
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    let isMounted = true;
    async function loadInitialData() {
      try {
        setTelemetryLoading(true);
        const [heatRes, poolRes, taskRes] = await Promise.all([
          fetchHeatingStatus().catch(err => {
            console.warn('ViCare telemetry fallback:', err.message);
            return null;
          }),
          fetchPiscineStatus().catch(err => {
            console.warn('Piscine telemetry fallback:', err.message);
            return null;
          }),
          fetchTasks().catch(err => {
            console.warn('Tasks load fallback:', err.message);
            return [];
          }),
        ]);
        if (isMounted) {
          if (heatRes) {
            setHeatingStatus(heatRes);
            if (heatRes.target_temperature != null) setHeatingTarget(heatRes.target_temperature);
            if (heatRes.dhw_temperature != null) setDhwTarget(heatRes.dhw_temperature);
          }
          if (poolRes) {
            setPiscineStatus(poolRes);
            if (poolRes.target_temperature != null) setPoolTarget(poolRes.target_temperature);
          }
          if (Array.isArray(taskRes)) {
            setTasks(taskRes);
          }
        }
      } finally {
        if (isMounted) setTelemetryLoading(false);
      }
    }
    loadInitialData();
    loadVademecumDb();
    return () => { isMounted = false; };
  }, []);

  const handleHeatingChange = (delta) => {
    const nextVal = Math.round((heatingTarget + delta) * 10) / 10;
    if (delta > 0 && heatingTarget >= 20.0) {
      showToast('Consigne maximale autorisée par la charte des associés : 20.0°C.');
      return;
    }
    if (nextVal < 15.0) return;
    setHeatingTarget(nextVal);
    showToast(`Consigne chauffage ajustée à ${nextVal.toFixed(1)}°C (Mode lecture seule actif)`);
  };

  const handleDhwChange = (delta) => {
    const nextVal = Math.round((dhwTarget + delta) * 10) / 10;
    if (nextVal < 45.0 || nextVal > 65.0) return;
    setDhwTarget(nextVal);
    showToast(`Consigne eau chaude sanitaire ajustée à ${nextVal.toFixed(1)}°C (Mode lecture seule actif)`);
  };

  const handlePoolChange = (delta) => {
    const nextVal = Math.round((poolTarget + delta) * 10) / 10;
    if (nextVal < 10.0 || nextVal > 30.0) return;
    setPoolTarget(nextVal);
    showToast(`Consigne piscine ajustée à ${nextVal.toFixed(1)}°C (Garde-fou lecture seule actif)`);
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

  const filteredDbItems = vademecumItems.filter((item) => {
    const q = searchQuery.toLowerCase();
    return (
      item.title?.toLowerCase().includes(q) ||
      item.content?.toLowerCase().includes(q) ||
      item.category?.toLowerCase().includes(q) ||
      (item.code_to_copy && item.code_to_copy.toLowerCase().includes(q))
    );
  });

  return (
    <div className="relative w-full max-w-[1360px] mx-auto pb-16 selection:bg-emerald-100 selection:text-emerald-900">
      
      {/* Subtle decorative ambient background glows contained within viewport bounds */}
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-primary-container/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute top-1/3 -left-40 w-[420px] h-[420px] bg-secondary-container/15 rounded-full blur-3xl pointer-events-none"></div>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-forest-deep text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200 border border-emerald-500/30">
          <span className="material-symbols-outlined text-secondary text-[22px]">check_circle</span>
          <span className="text-xs font-semibold">{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="text-white/70 hover:text-white ml-2"
            type="button"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 1. EN-TÊTE HARMONISÉ HERO                                             */}
      {/* ===================================================================== */}
      <section className="relative overflow-hidden rounded-2xl bg-emerald-50/70 border border-emerald-200/60 dark:bg-emerald-950/20 dark:border-emerald-800/40 p-6 sm:p-8 shadow-sm mb-8">
        {/* Subtle decorative glow */}
        <div className="absolute -right-24 -top-24 w-96 h-96 rounded-full bg-emerald-200/40 dark:bg-emerald-900/15 blur-3xl pointer-events-none"></div>
        <div className="absolute -left-12 -bottom-12 w-64 h-64 rounded-full bg-teal-200/30 dark:bg-teal-900/10 blur-2xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100/90 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200 font-label-sm text-xs font-semibold uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-emerald-600 dark:bg-emerald-400 animate-pulse"></span>
              VADÉMÉCUM & VIE DU DOMAINE
            </span>
            <h1 className="font-display-lg text-2xl sm:text-3xl lg:text-display-lg text-forest-deep dark:text-emerald-50 tracking-tight font-bold mt-2">
              Séjour & Intendance
            </h1>
            <p className="font-body-md text-sm sm:text-base text-on-surface-variant dark:text-emerald-200/80 leading-relaxed">
              Consignes d'arrivée et départ, équipements et confort thermique du domaine.
            </p>
          </div>

          {/* Boutons d'Action Rapide */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0 pt-2 md:pt-0">
            <button
              onClick={() => setIsEditStayOpen(true)}
              className="group flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-white dark:bg-slate-900 border-2 border-outline-variant text-on-surface hover:bg-canvas-slate hover:border-outline font-label-lg text-sm sm:text-base transition-all duration-200 shadow-sm cursor-pointer whitespace-nowrap"
              type="button"
            >
              <span className="material-symbols-outlined text-[22px] text-on-surface-variant group-hover:scale-110 transition-transform">edit_calendar</span>
              <span>Modifier le séjour</span>
            </button>

            <button
              onClick={() => window.print()}
              className="group flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-white dark:bg-slate-900 border-2 border-primary text-primary hover:bg-sage-soft font-label-lg text-sm sm:text-base font-bold shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer whitespace-nowrap"
              type="button"
            >
              <span className="material-symbols-outlined text-[22px] group-hover:scale-110 transition-transform">print</span>
              <span>Télécharger le livret (PDF)</span>
            </button>
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 2. DÉTAIL DU PROCHAIN SÉJOUR AU DOMAINE                                */}
      {/* ===================================================================== */}
      <section className="relative bg-surface-container-lowest rounded-2xl p-6 sm:p-8 shadow-sm border border-border-subtle mb-10 overflow-hidden">
        <div className="relative z-10 flex flex-col xl:flex-row items-start justify-between gap-6">
          
          {/* Left: Stay Identifiers & Status */}
          <div className="flex flex-col gap-4 max-w-2xl">
            <div className="flex flex-wrap items-center gap-3">
              <span className="px-3 py-1 rounded-full bg-surface-container font-label-sm text-label-sm text-on-surface-variant font-medium">
                {stayData.weekLabel}
              </span>
              <span className="px-3 py-1 rounded-full bg-amber-soft font-label-sm text-label-sm text-amber-rich flex items-center gap-1 font-semibold">
                <span className="material-symbols-outlined text-[16px]">engineering</span>
                {stayData.status}
              </span>
            </div>

            <div>
              <h2 className="font-display-md text-xl sm:text-2xl text-forest-deep tracking-tight font-bold">
                Mon Prochain Séjour au Domaine
              </h2>
            </div>

            {/* Schedule badges */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="flex items-center gap-3.5 p-3.5 rounded-xl bg-canvas-slate shadow-sm border border-border-subtle">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-primary text-[22px]">flight_land</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-label-sm text-label-sm text-on-surface-variant">Arrivée programmée</span>
                  <span className="font-headline-sm text-headline-sm text-on-surface font-bold">
                    {stayData.arrivalDate}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3.5 p-3.5 rounded-xl bg-canvas-slate shadow-sm border border-border-subtle">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-primary text-[22px]">flight_takeoff</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-label-sm text-label-sm text-on-surface-variant">Départ & Hors-gel</span>
                  <span className="font-headline-sm text-headline-sm text-on-surface font-bold">
                    {stayData.departureDate}
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
                  <span className="font-bold text-primary">Henri Jamet</span>
                  <span className="text-[11px] text-on-surface-variant">(Gérant)</span>
                </div>
              </div>

              <div className="inline-flex items-center gap-2 p-1.5 px-3 rounded-xl bg-canvas-slate border border-border-subtle text-on-surface shadow-sm">
                <div className="w-6 h-6 rounded-full bg-secondary-container/15 text-secondary flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[16px]">family_restroom</span>
                </div>
                <div className="flex items-center gap-1.5 font-label-sm text-label-sm">
                  <span className="font-semibold text-on-surface">Sophie Dergul</span>
                </div>
              </div>
            </div>

            {/* Rooms allocated */}
            <div className="flex flex-col gap-2 pt-1 font-label-sm text-label-sm text-on-surface-variant">
              <div className="flex flex-wrap items-center gap-2">
                <span className="material-symbols-outlined text-outline text-[18px]">bed</span>
                <span className="font-semibold text-on-surface">Villa Rosing :</span>
                <span className="px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface font-medium">Haut droite (2 couchages)</span>
                <span className="px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface font-medium">Haut gauche (2 couchages)</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="material-symbols-outlined text-outline text-[18px]">holiday_village</span>
                <span className="font-semibold text-on-surface">Hellenvilliers :</span>
                <span className="px-2.5 py-0.5 rounded-full bg-surface-container-low border border-border-subtle text-on-surface font-medium">Suite parentale</span>
                <span className="px-2.5 py-0.5 rounded-full bg-surface-container-low border border-border-subtle text-on-surface font-medium">Mezzanine</span>
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
              <span>Gérer les dates</span>
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

      {/* ===================================================================== */}
      {/* 2. RÉGULATION & CONFORT ÉNERGÉTIQUE (TRIPTYQUE THERMIQUE DOMAINE)     */}
      {/* ===================================================================== */}
      <section className="bg-surface-container-lowest rounded-lg p-6 sm:p-8 lg:p-10 shadow-sm border border-border-subtle mb-10 flex flex-col gap-6">
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
              <p className="font-label-sm text-xs text-on-surface-variant mt-0.5">
                Pilotage à distance des équipements thermiques et domotiques du domaine
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Volet 1 : Chauffage */}
          <div className="p-5 rounded-2xl bg-canvas-slate border border-border-subtle flex flex-col justify-between gap-5 shadow-sm">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-border-subtle pb-3 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="material-symbols-outlined text-primary text-[22px]">hvac</span>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold truncate">Chauffage</h3>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sage-soft text-primary font-label-sm text-[11px] font-bold shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                    En marche
                  </span>
                </div>
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-border-subtle shrink-0">
                  <span className="font-label-sm text-xs text-outline">Actuelle :</span>
                  <span className="font-headline-sm text-xs text-on-surface font-bold tabular-nums">
                    {heatingStatus?.room_temperature != null ? `${heatingStatus.room_temperature.toFixed(1)}°C` : '15.2°C'}
                  </span>
                </div>
              </div>

              <div className="p-3.5 bg-white rounded-xl border border-border-subtle flex items-center justify-between gap-2 shadow-sm">
                <div className="flex flex-col min-w-0 pr-1">
                  <span className="font-label-md text-label-md text-on-surface font-semibold leading-tight">Température cible</span>
                  <span className="font-label-sm text-xs text-on-surface-variant mt-0.5 whitespace-nowrap">Recommandé 19°C – 20°C</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 bg-canvas-slate p-1 rounded-full border border-border-subtle">
                  <button
                    aria-label="Diminuer température chauffage"
                    className="w-8 h-8 rounded-full bg-white border border-outline-variant hover:bg-surface-container flex items-center justify-center text-on-surface active:scale-95 transition-transform shadow-sm cursor-pointer"
                    id="btn-temp-minus"
                    type="button"
                    onClick={() => handleHeatingChange(-0.5)}
                  >
                    <span className="material-symbols-outlined text-[16px]">remove</span>
                  </button>
                  <span className="font-headline-md text-[18px] text-primary font-bold tabular-nums w-12 text-center" id="temp-value">
                    {heatingTarget.toFixed(1)}<span className="text-xs text-outline font-normal">°C</span>
                  </span>
                  <button
                    aria-label="Augmenter température chauffage"
                    className="w-8 h-8 rounded-full bg-primary text-white hover:bg-forest-deep flex items-center justify-center font-bold active:scale-95 transition-transform shadow-sm cursor-pointer"
                    id="btn-temp-plus"
                    type="button"
                    onClick={() => handleHeatingChange(0.5)}
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                  </button>
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="p-2.5 rounded-xl bg-white border border-border-subtle flex items-center justify-between gap-2 shadow-sm">
                  <div className="flex flex-col min-w-0">
                    <span className="font-label-sm text-[11px] text-on-surface-variant flex items-center gap-1 font-medium">
                      <span className="material-symbols-outlined text-[14px] text-primary">play_arrow</span>
                      Mise en marche prévue
                    </span>
                    <span className="font-label-md text-xs font-semibold text-on-surface pl-4 mt-0.5 truncate">
                      {heatSchedule.start}
                    </span>
                  </div>
                  <button
                    onClick={() => handleOpenScheduleModal('heat', 'start', 'Chauffage — Mise en marche prévue', heatSchedule.start)}
                    className="h-8 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-primary font-label-sm text-xs font-semibold shrink-0 transition-colors cursor-pointer"
                    type="button"
                  >
                    Modifier
                  </button>
                </div>

                <div className="p-2.5 rounded-xl bg-white border border-border-subtle flex items-center justify-between gap-2 shadow-sm">
                  <div className="flex flex-col min-w-0">
                    <span className="font-label-sm text-[11px] text-on-surface-variant flex items-center gap-1 font-medium">
                      <span className="material-symbols-outlined text-[14px] text-outline">stop</span>
                      Arrêt prévu
                    </span>
                    <span className="font-label-md text-xs font-semibold text-on-surface pl-4 mt-0.5 truncate">
                      {heatSchedule.end}
                    </span>
                  </div>
                  <button
                    onClick={() => handleOpenScheduleModal('heat', 'end', 'Chauffage — Arrêt prévu', heatSchedule.end)}
                    className="h-8 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-primary font-label-sm text-xs font-semibold shrink-0 transition-colors cursor-pointer"
                    type="button"
                  >
                    Modifier
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Volet 2 : Eau Chaude */}
          <div className="p-5 rounded-2xl bg-canvas-slate border border-border-subtle flex flex-col justify-between gap-5 shadow-sm">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-border-subtle pb-3 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="material-symbols-outlined text-primary text-[22px]">water_heater</span>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold truncate">Eau Chaude</h3>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sage-soft text-primary font-label-sm text-[11px] font-bold shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                    En marche
                  </span>
                </div>
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-border-subtle shrink-0">
                  <span className="font-label-sm text-xs text-outline">Actuelle (250L) :</span>
                  <span className="font-headline-sm text-xs text-on-surface font-bold tabular-nums">
                    {heatingStatus?.dhw_temperature != null ? `${heatingStatus.dhw_temperature.toFixed(1)}°C` : '48.0°C'}
                  </span>
                </div>
              </div>

              <div className="p-3.5 bg-white rounded-xl border border-border-subtle flex items-center justify-between gap-2 shadow-sm">
                <div className="flex flex-col min-w-0 pr-1">
                  <span className="font-label-md text-label-md text-on-surface font-semibold leading-tight">Température cible</span>
                  <span className="font-label-sm text-xs text-on-surface-variant mt-0.5 whitespace-nowrap">Recommandé 50°C – 55°C</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 bg-canvas-slate p-1 rounded-full border border-border-subtle">
                  <button
                    aria-label="Diminuer température eau chaude"
                    className="w-8 h-8 rounded-full bg-white border border-outline-variant hover:bg-surface-container flex items-center justify-center text-on-surface active:scale-95 transition-transform shadow-sm cursor-pointer"
                    id="btn-dhw-minus"
                    type="button"
                    onClick={() => handleDhwChange(-0.5)}
                  >
                    <span className="material-symbols-outlined text-[16px]">remove</span>
                  </button>
                  <span className="font-headline-md text-[18px] text-primary font-bold tabular-nums w-12 text-center" id="dhw-temp-value">
                    {dhwTarget.toFixed(1)}<span className="text-xs text-outline font-normal">°C</span>
                  </span>
                  <button
                    aria-label="Augmenter température eau chaude"
                    className="w-8 h-8 rounded-full bg-primary text-white hover:bg-forest-deep flex items-center justify-center font-bold active:scale-95 transition-transform shadow-sm cursor-pointer"
                    id="btn-dhw-plus"
                    type="button"
                    onClick={() => handleDhwChange(0.5)}
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                  </button>
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="p-2.5 rounded-xl bg-white border border-border-subtle flex items-center justify-between gap-2 shadow-sm">
                  <div className="flex flex-col min-w-0">
                    <span className="font-label-sm text-[11px] text-on-surface-variant flex items-center gap-1 font-medium">
                      <span className="material-symbols-outlined text-[14px] text-primary">play_arrow</span>
                      Mise en marche prévue
                    </span>
                    <span className="font-label-md text-xs font-semibold text-on-surface pl-4 mt-0.5 truncate">
                      {dhwSchedule.start}
                    </span>
                  </div>
                  <button
                    onClick={() => handleOpenScheduleModal('dhw', 'start', 'Eau Chaude — Mise en marche prévue', dhwSchedule.start)}
                    className="h-8 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-primary font-label-sm text-xs font-semibold shrink-0 transition-colors cursor-pointer"
                    type="button"
                  >
                    Modifier
                  </button>
                </div>

                <div className="p-2.5 rounded-xl bg-white border border-border-subtle flex items-center justify-between gap-2 shadow-sm">
                  <div className="flex flex-col min-w-0">
                    <span className="font-label-sm text-[11px] text-on-surface-variant flex items-center gap-1 font-medium">
                      <span className="material-symbols-outlined text-[14px] text-outline">stop</span>
                      Arrêt prévu
                    </span>
                    <span className="font-label-md text-xs font-semibold text-on-surface pl-4 mt-0.5 truncate">
                      {dhwSchedule.end}
                    </span>
                  </div>
                  <button
                    onClick={() => handleOpenScheduleModal('dhw', 'end', 'Eau Chaude — Arrêt prévu', dhwSchedule.end)}
                    className="h-8 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-primary font-label-sm text-xs font-semibold shrink-0 transition-colors cursor-pointer"
                    type="button"
                  >
                    Modifier
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Volet 3 : Piscine */}
          <div className="p-5 rounded-2xl bg-canvas-slate border border-border-subtle flex flex-col justify-between gap-5 shadow-sm">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-border-subtle pb-3 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="material-symbols-outlined text-primary text-[22px]">pool</span>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold truncate">Piscine</h3>
                </div>
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-border-subtle shrink-0">
                  <span className="font-label-sm text-xs text-outline">Eau :</span>
                  <span className="font-headline-sm text-xs text-on-surface font-bold tabular-nums">
                    {piscineStatus?.water_temperature != null ? `${piscineStatus.water_temperature.toFixed(1)}°C` : '13.5°C'}
                  </span>
                  <span className="text-xs text-outline mx-0.5">•</span>
                  <span className="font-label-sm text-xs text-outline">Air :</span>
                  <span className="font-headline-sm text-xs text-on-surface font-bold tabular-nums">
                    {piscineStatus?.outside_temperature != null ? `${piscineStatus.outside_temperature.toFixed(1)}°C` : '14.2°C'}
                  </span>
                </div>
              </div>

              <div className="p-3.5 bg-white rounded-xl border border-border-subtle flex items-center justify-between gap-2 shadow-sm">
                <div className="flex flex-col min-w-0 pr-1">
                  <span className="font-label-md text-label-md text-on-surface font-semibold leading-tight">Température cible</span>
                  <span className="font-label-sm text-xs text-on-surface-variant mt-0.5 whitespace-nowrap">Recommandé 26°C – 28°C été</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 bg-canvas-slate p-1 rounded-full border border-border-subtle">
                  <button
                    aria-label="Diminuer température piscine"
                    className="w-8 h-8 rounded-full bg-white border border-outline-variant hover:bg-surface-container flex items-center justify-center text-on-surface active:scale-95 transition-transform shadow-sm cursor-pointer"
                    id="btn-pool-minus"
                    type="button"
                    onClick={() => handlePoolChange(-0.5)}
                  >
                    <span className="material-symbols-outlined text-[16px]">remove</span>
                  </button>
                  <span className="font-headline-md text-[18px] text-primary font-bold tabular-nums w-12 text-center" id="pool-temp-value">
                    {poolTarget.toFixed(1)}<span className="text-xs text-outline font-normal">°C</span>
                  </span>
                  <button
                    aria-label="Augmenter température piscine"
                    className="w-8 h-8 rounded-full bg-primary text-white hover:bg-forest-deep flex items-center justify-center font-bold active:scale-95 transition-transform shadow-sm cursor-pointer"
                    id="btn-pool-plus"
                    type="button"
                    onClick={() => handlePoolChange(0.5)}
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                  </button>
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="p-2.5 rounded-xl bg-white border border-border-subtle flex items-center justify-between gap-2 shadow-sm">
                  <div className="flex flex-col min-w-0">
                    <span className="font-label-sm text-[11px] text-on-surface-variant flex items-center gap-1 font-medium">
                      <span className="material-symbols-outlined text-[14px] text-amber-rich">warning</span>
                      Mise en marche PAC
                    </span>
                    <span className="font-label-md text-xs font-semibold text-amber-rich pl-4 mt-0.5 truncate">
                      {poolSchedule.pac}
                    </span>
                  </div>
                  <button
                    onClick={() => handleOpenScheduleModal('pool', 'pac', 'Piscine — Mise en marche PAC', poolSchedule.pac)}
                    className="h-8 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-primary font-label-sm text-xs font-semibold shrink-0 transition-colors cursor-pointer"
                    type="button"
                  >
                    Modifier
                  </button>
                </div>

                <div className="p-2.5 rounded-xl bg-white border border-border-subtle flex items-center justify-between gap-2 shadow-sm">
                  <div className="flex flex-col min-w-0">
                    <span className="font-label-sm text-[11px] text-on-surface-variant flex items-center gap-1 font-medium">
                      <span className="material-symbols-outlined text-[14px] text-primary">autorenew</span>
                      Filtration programmée
                    </span>
                    <span className="font-label-md text-xs font-semibold text-on-surface pl-4 mt-0.5 truncate">
                      {poolSchedule.filtration}
                    </span>
                  </div>
                  <button
                    onClick={() => handleOpenScheduleModal('pool', 'filtration', 'Piscine — Filtration programmée', poolSchedule.filtration)}
                    className="h-8 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-primary font-label-sm text-xs font-semibold shrink-0 transition-colors cursor-pointer"
                    type="button"
                  >
                    Modifier
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-2.5 border-t border-border-subtle flex flex-wrap items-center gap-1.5">
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-border-subtle text-[11px] font-medium text-on-surface-variant">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                <span>pH : <strong>{piscineStatus?.ph != null ? piscineStatus.ph.toFixed(1) : '7.3'}</strong></span>
              </div>
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-border-subtle text-[11px] font-medium text-on-surface-variant">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                <span>Redox : <strong>{piscineStatus?.redox_mv != null ? `${piscineStatus.redox_mv} mV` : '680 mV'}</strong></span>
              </div>
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-border-subtle text-[11px] font-medium text-on-surface-variant">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                <span>Filtre : <strong>{piscineStatus?.filter_pressure_mbar != null ? `${piscineStatus.filter_pressure_mbar} mbar` : '850 mbar'}</strong></span>
              </div>
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sage-soft text-primary text-[11px] font-semibold">
                <span className="material-symbols-outlined text-[12px]">sync</span>Pompe ON
              </div>
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-container text-outline text-[11px] font-medium">
                PAC OFF
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 3. MISSIONS & TÂCHES SOUS VOTRE RESPONSABILITÉ                        */}
      {/* ===================================================================== */}
      <section className="bg-surface-container-lowest rounded-lg p-6 sm:p-8 lg:p-10 shadow-sm border border-outline-variant/30 mb-10 flex flex-col gap-6">
        
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-outline-variant/20 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-on-surface-variant font-medium">Henri Jamet</span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sage-soft text-primary font-label-sm text-xs font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                {tasks.filter(t => t.status === 'active').length} Tâches actives sur place
              </span>
            </div>
            <h2 className="font-headline-md text-headline-md text-forest-deep font-bold tracking-tight mt-1">
              Missions & Tâches sous votre responsabilité
            </h2>
          </div>
        </div>

        {/* Tasks Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {tasks.length === 0 ? (
            <div className="col-span-full py-8 px-4 rounded-xl bg-canvas-slate border border-dashed border-outline-variant/40 flex flex-col items-center justify-center text-center">
              <span className="material-symbols-outlined text-[32px] text-on-surface-variant/60 mb-2">assignment_turned_in</span>
              <p className="text-sm font-semibold text-forest-deep">Aucune mission sur place pour ce séjour</p>
              <p className="text-xs text-on-surface-variant mt-1">Toutes les vérifications et consignes sont à jour dans le vadémécum.</p>
            </div>
          ) : (
            tasks.map((task, idx) => {
              const isCompleted = task.status === 'completed';
              const isHigh = task.priorityType === 'high' || task.priority === 'Critique' || task.priority === 'Haute';
              const assigneeName = task.assignee || (Array.isArray(task.assigned_members) && task.assigned_members[0]) || 'Henri Jamet';
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

      {/* ===================================================================== */}
      {/* 4. VADÉMÉCUM ESSENTIEL DU DOMAINE (Accès direct en séjour)            */}
      {/* ===================================================================== */}
      <section className="bg-surface-container-lowest rounded-lg p-6 sm:p-8 lg:p-10 shadow-sm border border-border-subtle mb-6">
        
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 text-primary font-label-md text-label-md uppercase tracking-wider mb-1 font-bold">
              <span className="material-symbols-outlined text-[20px]">menu_book</span>
              <span>Intendance & Sécurité Immédiate</span>
            </div>
            <h2 className="font-headline-lg text-headline-lg text-primary tracking-tight font-bold">
              Vadémécum & Repères Pratiques du Séjour
            </h2>
          </div>

          <button
            onClick={() => setShowFullVademecum(!showFullVademecum)}
            className="h-12 px-5 rounded-full bg-surface-container-lowest border-2 border-primary text-primary hover:bg-sage-soft font-label-md text-label-md flex items-center gap-2 self-start sm:self-auto shrink-0 shadow-sm transition-all font-semibold"
            type="button"
          >
            <span className="material-symbols-outlined text-[20px]">
              {showFullVademecum ? 'unfold_less' : 'library_books'}
            </span>
            <span>
              {showFullVademecum ? 'Masquer la base complète' : 'Consulter le vadémécum complet (10 fiches)'}
            </span>
          </button>
        </div>

        {/* 4 Practical Interactive Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          
          {/* Card 1: Wi-Fi */}
          <div className="p-6 rounded-2xl bg-canvas-slate flex flex-col justify-between gap-4 shadow-sm border border-transparent hover:border-sage-border transition-all">
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
                <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  Hellenvilliers_Rosing_5G
                </span>
                <p className="font-body-md text-body-md text-on-surface-variant text-xs mt-1">
                  Couverture Salon, Cuisine, Bureaux & Terrasse Sud.
                </p>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={handleCopyWifi}
                className="w-full h-11 px-3 rounded-full bg-surface-container-lowest border-2 border-outline-variant text-on-surface hover:bg-white hover:border-primary font-label-sm text-label-sm flex items-center justify-center gap-1.5 transition-all font-semibold"
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
          <div className="p-6 rounded-2xl bg-canvas-slate flex flex-col justify-between gap-4 shadow-sm border border-transparent hover:border-sage-border transition-all">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-full bg-surface-container-high text-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-[22px]">valve</span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-surface-container-lowest font-label-sm text-label-sm text-primary font-semibold">
                  Cellier & Linky
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-label-sm text-label-sm text-outline">Vannes & Coupures Générales</span>
                <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  Arrêt Eau & Électricité
                </span>
                <p className="font-body-md text-body-md text-on-surface-variant text-xs mt-1">
                  Robinet d'arrêt général d'eau situé dans le cellier sous l'escalier. Disjoncteur principal au vestibule d'entrée.
                </p>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setIsCutoffModalOpen(true)}
                className="w-full h-11 px-3 rounded-full bg-surface-container-lowest border-2 border-outline-variant text-on-surface hover:bg-white hover:border-primary font-label-sm text-label-sm flex items-center justify-center gap-1.5 transition-all font-semibold"
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">map</span>
                <span>Voir plan des coupures</span>
              </button>
            </div>
          </div>

          {/* Card 3: Departure & Frost-free protocol */}
          <div className="p-6 rounded-2xl bg-canvas-slate flex flex-col justify-between gap-4 shadow-sm border border-transparent hover:border-sage-border transition-all">
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
                <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  Fermeture & Poubelles
                </span>
                <p className="font-body-md text-body-md text-on-surface-variant text-xs mt-1">
                  Baisser à 12°C, fermer radiateurs des chambres, vider frigo, bacs au point de collecte Mesnil-sur-Iton le lundi matin.
                </p>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setIsChecklistModalOpen(true)}
                className="w-full h-11 px-3 rounded-full bg-surface-container-lowest border-2 border-outline-variant text-on-surface hover:bg-white hover:border-primary font-label-sm text-label-sm flex items-center justify-center gap-1.5 transition-all font-semibold"
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">verified</span>
                <span>Pointer la check-list départ</span>
              </button>
            </div>
          </div>

          {/* Card 4: Emergency Contacts & Plumber on-call */}
          <div className="p-6 rounded-2xl bg-canvas-slate flex flex-col justify-between gap-4 shadow-sm border border-transparent hover:border-sage-border transition-all">
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
                <span className="font-label-sm text-label-sm text-outline">Assistance & Numéros Clés</span>
                <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  Éts Josse & Urgences
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
                className="w-full h-11 px-3 rounded-full bg-surface-container-lowest border-2 border-outline-variant text-on-surface hover:bg-white hover:border-primary font-label-sm text-label-sm flex items-center justify-center gap-1.5 transition-all font-semibold"
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
                className="px-4 py-2 bg-primary hover:bg-forest-deep text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center justify-center gap-1.5 shrink-0"
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
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
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
                  placeholder="Rechercher (ex: Wifi, clé, eau)..."
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
                          className="px-2.5 py-1 bg-white hover:bg-sage-soft text-primary border border-border-subtle rounded-lg text-[11px] font-bold flex items-center gap-1 transition shrink-0"
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
                        className="text-outline hover:text-error text-xs flex items-center gap-1 transition font-medium"
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

      {/* Modal 4: Edit Stay */}
      <SejourEditModal
        stayData={stayData}
        isOpen={isEditStayOpen}
        onClose={() => setIsEditStayOpen(false)}
        onSave={(updated) => {
          setStayData((prev) => ({ ...prev, ...updated }));
          showToast('Paramètres du séjour mis à jour !');
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
                  className="px-5 py-2.5 rounded-full text-xs font-semibold text-on-surface hover:bg-canvas-slate"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submittingItem}
                  className="px-6 py-2.5 rounded-full bg-primary hover:bg-forest-deep text-white text-xs font-bold shadow-sm transition disabled:opacity-50"
                >
                  {submittingItem ? 'Enregistrement...' : 'Enregistrer la fiche'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* Modal 6: Schedule Edit Modal (Parité Stitch Horaires Prévues) */}
      {scheduleModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-border-subtle flex flex-col gap-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[22px]">schedule</span>
                <h3 className="font-headline-sm text-sm font-bold text-forest-deep">
                  Modifier la programmation horaire
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setScheduleModal(prev => ({ ...prev, isOpen: false }))}
                className="w-8 h-8 rounded-full hover:bg-canvas-slate flex items-center justify-center text-on-surface-variant cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <form onSubmit={handleSaveSchedule} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-on-surface mb-1">
                  {scheduleModal.label}
                </label>
                <input
                  type="text"
                  value={scheduleModal.value}
                  onChange={(e) => setScheduleModal(prev => ({ ...prev, value: e.target.value }))}
                  required
                  placeholder="ex: Ven. 19 oct. — 14:00"
                  className="w-full px-3.5 py-2.5 bg-canvas-slate border border-border-subtle rounded-xl text-xs font-medium text-on-surface focus:outline-none focus:border-primary"
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-subtle">
                <button
                  type="button"
                  onClick={() => setScheduleModal(prev => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 rounded-full text-xs font-semibold text-on-surface-variant hover:bg-canvas-slate cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-full bg-primary hover:bg-forest-deep text-white text-xs font-bold shadow-sm transition cursor-pointer"
                >
                  Enregistrer l'horaire
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
