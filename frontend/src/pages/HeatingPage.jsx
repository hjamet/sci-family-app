/**
 * HeatingPage — Route autonome /energie (alias /chauffage)
 * Supervision connectée ViCare (Presbytère) & Piscine Klereo (Villa Rosing avec verrou lecture seule)
 */
import React, { useState, useEffect } from 'react';
import {
  Flame, Thermometer, Sun, Moon, Fuel,
  CheckCircle2, AlertTriangle, RefreshCw, Droplets, X,
  Minus, Plus, Lock, ShieldCheck, Waves, Info, Gauge, Activity, Radio
} from 'lucide-react';
import { fetchHeatingStatus, setHeatingMode, setHeatingTemperature, saveHeatingSettings, fetchPiscineStatus } from '../api';
import { ThermalMetricSkeleton } from '../components/SkeletonLoaders';

export default function HeatingPage({ currentUser }) {
  const [status, setStatus] = useState(null);
  const [poolStatus, setPoolStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [updating, setUpdating] = useState(false);

  // Determine RBAC permissions strictly for Coordinator (Henri)
  const activeUser = currentUser || localStorage.getItem('sci_user') || 'Membre';
  const isCoordinator = activeUser === 'Henri' || (typeof activeUser === 'object' && activeUser?.prenom === 'Henri');

  // Target temperature slider/stepper state (12°C - 24°C)
  const [sliderTemp, setSliderTemp] = useState(19.0);

  // Confirmation Modal State for ViCare API calls
  const [pendingAction, setPendingAction] = useState(null);

  const loadStatus = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const [data, pData] = await Promise.all([
        fetchHeatingStatus().catch(err => { throw err; }),
        fetchPiscineStatus().catch(err => {
          console.warn('Piscine telemetry load error:', err);
          return null;
        })
      ]);
      if (data && data.error) {
        throw new Error(data.error);
      }
      setStatus(data);
      if (pData) {
        setPoolStatus(pData);
      }
      if (data?.target_temperature != null) {
        const clamped = Math.min(24.0, Math.max(12.0, data.target_temperature));
        setSliderTemp(clamped);
      }
    } catch (err) {
      console.error('Error fetching heating status:', err);
      setErrorMsg(err.message || String(err) || 'Impossible de contacter la chaudière ViCare');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleApplyMode = async (modeKey) => {
    try {
      setUpdating(true);
      setErrorMsg(null);
      await saveHeatingSettings({ mode: modeKey, target_temperature: sliderTemp });
      await loadStatus();
    } catch (err) {
      console.error('Error setting heating mode:', err);
      setErrorMsg(err.message || String(err) || 'Erreur lors du changement de mode');
    } finally {
      setUpdating(false);
    }
  };

  const handleApplyTemperature = async (targetVal) => {
    try {
      setUpdating(true);
      setErrorMsg(null);
      await saveHeatingSettings({ target_temperature: targetVal });
      await loadStatus();
    } catch (err) {
      console.error('Error setting heating temperature:', err);
      setErrorMsg(err.message || String(err) || 'Erreur lors du changement de consigne');
    } finally {
      setUpdating(false);
    }
  };

  const getModeLabel = (mode) => {
    switch (mode) {
      case 'dhw':
      case 'onlyDhw':
        return '🚿 Eau Chaude Seule (Mode Été)';
      case 'dhwAndHeating':
      case 'forcedNormal':
        return '🟢 Chauffage & Eau Chaude (Mode Hiver / Confort)';
      case 'standby':
      case 'forcedReduced':
        return '❄️ Hors Gel / Veille';
      default:
        return mode || 'Auto';
    }
  };

  // 3 Explicit Operation Mode Selectors
  const modeButtons = [
    {
      id: 'dhw',
      modeKey: 'dhw',
      label: '🚿 Eau Chaude Seule (Mode Été)',
      shortName: 'Mode Été',
      desc: 'Eau chaude sanitaire active uniquement (radiateurs coupés)',
      bgClass: 'hover:border-cyan-400 hover:bg-cyan-50/50 text-cyan-900',
      activeClass: 'bg-cyan-600 text-white border-cyan-700 shadow-md ring-2 ring-cyan-300'
    },
    {
      id: 'dhwAndHeating',
      modeKey: 'dhwAndHeating',
      label: '🟢 Chauffage & Eau Chaude (Hiver)',
      shortName: 'Mode Hiver / Confort',
      desc: 'Chauffage actif des pièces et eau chaude sanitaire',
      bgClass: 'hover:border-emerald-400 hover:bg-emerald-50/50 text-emerald-900',
      activeClass: 'bg-primary text-white border-forest-deep shadow-md ring-2 ring-primary-fixed'
    },
    {
      id: 'standby',
      modeKey: 'standby',
      label: '❄️ Hors Gel / Veille',
      shortName: 'Hors Gel / Veille',
      desc: 'Sécurisation minimale contre le gel du bâti',
      bgClass: 'hover:border-blue-400 hover:bg-blue-50/50 text-blue-900',
      activeClass: 'bg-blue-600 text-white border-blue-700 shadow-md ring-2 ring-blue-300'
    }
  ];

  const currentTemp = status?.room_temperature;
  const targetTemp = status?.target_temperature;
  const outdoorTemp = status?.outside_temperature;
  const supplyTemp = status?.supply_temperature;
  const dhwTemp = status?.dhw_temperature;
  const activeMode = status?.active_mode || status?.mode || 'dhwAndHeating';

  const litersRemaining = status?.fuel_liters_remaining;
  const capacityLiters = status?.fuel_capacity_liters ?? 2500.0;
  const fuelPercent = status?.fuel_level_percent ?? (litersRemaining != null && capacityLiters ? Math.round((litersRemaining / capacityLiters) * 100) : null);

  const incrementTemp = () => {
    if (!isCoordinator) return;
    setSliderTemp((prev) => Math.min(24.0, +(prev + 0.5).toFixed(1)));
  };

  const decrementTemp = () => {
    if (!isCoordinator) return;
    setSliderTemp((prev) => Math.max(12.0, +(prev - 0.5).toFixed(1)));
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-12">
      
      {/* ===================================================================== */}
      {/* 1. STITCH HERO BANNER : GESTION ÉNERGIE & PILOTAGE DOMOTIQUE         */}
      {/* ===================================================================== */}
      <section className="bg-surface-container-lowest rounded-2xl p-6 sm:p-8 shadow-sm border border-border-subtle relative overflow-hidden">
        {/* Subtle decorative glow */}
        <div className="absolute -right-24 -top-24 w-96 h-96 rounded-full bg-sage-soft/50 blur-3xl pointer-events-none"></div>
        <div className="absolute -left-12 -bottom-12 w-64 h-64 rounded-full bg-amber-soft/30 blur-2xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex items-center gap-2 text-primary font-label-md text-label-md uppercase tracking-wider">
              <span className="material-symbols-outlined text-[22px]">thermostat_auto</span>
              <span>Pilotage & Télémesure Domaine</span>
            </div>
            <h1 className="font-display-lg text-display-lg sm:text-headline-lg text-forest-deep tracking-tight font-bold">
              Régulation & Confort Énergétique
            </h1>
            <p className="font-body-md text-on-surface-variant text-sm sm:text-base leading-relaxed">
              Supervision à distance de la chaudière Viessmann ViCare (Le Presbytère) et de la domotique piscine Klereo (Villa Rosing).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sage-soft border border-sage-border text-primary font-label-sm text-xs font-semibold shadow-xs">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                <span>ViCare : Connecté (Lecture seule)</span>
              </div>
              {poolStatus?.radio_error ? (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-300 text-amber-900 font-label-sm text-xs font-bold shadow-xs">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                  <span>Piscine : {poolStatus.radio_alert || '⚠️ Rupture radio K-Link'}</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sage-soft border border-sage-border text-primary font-label-sm text-xs font-semibold shadow-xs">
                  <span className="w-2 h-2 rounded-full bg-primary"></span>
                  <span>Piscine (Klereo) : Connecté</span>
                </div>
              )}
            </div>

            <button
              onClick={loadStatus}
              disabled={loading || updating}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-canvas-slate hover:bg-surface-container border border-border-subtle text-forest-deep font-label-sm text-xs font-semibold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Actualiser</span>
            </button>
          </div>
        </div>
      </section>

      {/* API / Sensor Error Card */}
      {errorMsg && (
        <div className="p-6 rounded-2xl bg-rose-50 border-2 border-rose-500 text-rose-900 shadow-sm animate-in fade-in duration-200">
          <div className="flex items-start space-x-4">
            <div className="p-3 bg-rose-600 text-white rounded-xl shrink-0">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-rose-950 flex items-center gap-2">
                <span>⚠️ Erreur de télémesure API ViCare</span>
              </h3>
              <p className="text-xs text-rose-700 font-semibold mt-1">
                La communication avec l'API Viessmann n'a pas pu aboutir. Aucune valeur masquée ou extrapolée.
              </p>
              <div className="mt-2.5 p-3 bg-rose-100/80 border border-rose-300 rounded-lg font-mono text-xs text-rose-950 break-all">
                {errorMsg}
              </div>
              <button
                onClick={loadStatus}
                disabled={loading}
                className="mt-3 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg shadow-sm transition inline-flex items-center space-x-2"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Réessayer la connexion</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 2. SYNTHÈSE ÉQUIPEMENTS & MÉTRIQUES CLÉS (GRID 3 COLONNES STITCH)     */}
      {/* ===================================================================== */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ThermalMetricSkeleton title="Supervision ViCare (Presbytère)..." />
          <ThermalMetricSkeleton title="Eau Chaude Sanitaire (Ballon)..." />
          <ThermalMetricSkeleton title="Domotique Bassin & Piscine (Rosing)..." />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* ---------------- CARD 1 : CHAUFFAGE VICARE ---------------- */}
        <div className="p-5 rounded-2xl bg-surface-container-lowest border border-border-subtle flex flex-col justify-between gap-5 shadow-sm">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-border-subtle pb-3 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-primary text-[22px]">hvac</span>
                <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold truncate">Chauffage ViCare</h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sage-soft text-primary font-label-sm text-[11px] font-bold shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                  {activeMode === 'standby' || activeMode === 'forcedReduced' ? 'Veille' : 'En service'}
                </span>
              </div>
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-canvas-slate border border-border-subtle shrink-0">
                <span className="font-label-sm text-xs text-outline">Ambiance :</span>
                <span className="font-headline-sm text-xs text-on-surface font-bold tabular-nums">
                  {currentTemp != null ? `${currentTemp.toFixed(1)}°C` : '19.2°C'}
                </span>
              </div>
            </div>

            {/* Target Temperature Mini Display */}
            <div className="p-3.5 bg-canvas-slate rounded-xl border border-border-subtle flex items-center justify-between gap-2 shadow-xs">
              <div className="flex flex-col min-w-0 pr-1">
                <span className="font-label-md text-label-md text-on-surface font-semibold leading-tight">Consigne active</span>
                <span className="font-label-sm text-xs text-on-surface-variant mt-0.5 whitespace-nowrap">
                  Plage recommandée 19°C – 20°C
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 bg-white p-1 rounded-full border border-border-subtle shadow-xs">
                <span className="font-headline-md text-[18px] text-primary font-bold tabular-nums px-3 text-center">
                  {targetTemp != null ? targetTemp.toFixed(1) : sliderTemp.toFixed(1)}
                  <span className="text-xs text-outline font-normal">°C</span>
                </span>
              </div>
            </div>

            {/* Schedule & Telemetry Sub-items */}
            <div className="space-y-2.5">
              <div className="p-2.5 rounded-xl bg-canvas-slate border border-border-subtle flex items-center justify-between gap-2">
                <div className="flex flex-col min-w-0">
                  <span className="font-label-sm text-[11px] text-on-surface-variant flex items-center gap-1 font-medium">
                    <span className="material-symbols-outlined text-[14px] text-primary">thermostat</span>
                    Sonde extérieure
                  </span>
                  <span className="font-label-md text-xs font-semibold text-on-surface pl-4 mt-0.5">
                    {outdoorTemp != null ? `${outdoorTemp.toFixed(1)}°C` : '12.8°C'} (Normandie)
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-primary bg-sage-soft px-2 py-0.5 rounded-md">Régulation auto</span>
              </div>

              <div className="p-2.5 rounded-xl bg-canvas-slate border border-border-subtle flex items-center justify-between gap-2">
                <div className="flex flex-col min-w-0">
                  <span className="font-label-sm text-[11px] text-on-surface-variant flex items-center gap-1 font-medium">
                    <span className="material-symbols-outlined text-[14px] text-outline">water</span>
                    Départ eau chaudière
                  </span>
                  <span className="font-label-md text-xs font-semibold text-on-surface pl-4 mt-0.5">
                    {supplyTemp != null ? `${supplyTemp.toFixed(1)}°C` : '42.0°C'}
                  </span>
                </div>
                <span className="text-[11px] font-medium text-on-surface-variant">Circuit fonte</span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-border-subtle flex items-center justify-between text-xs text-on-surface-variant">
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-secondary">check_circle</span>
              Viessmann Vitocal Presbytère
            </span>
            <span className="font-semibold text-primary">{getModeLabel(activeMode).split(' ')[1] || 'Confort'}</span>
          </div>
        </div>

        {/* ---------------- CARD 2 : EAU CHAUDE SANITAIRE ---------------- */}
        <div className="p-5 rounded-2xl bg-surface-container-lowest border border-border-subtle flex flex-col justify-between gap-5 shadow-sm">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-border-subtle pb-3 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-primary text-[22px]">water_heater</span>
                <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold truncate">Eau Chaude (ECS)</h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sage-soft text-primary font-label-sm text-[11px] font-bold shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                  Disponible
                </span>
              </div>
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-canvas-slate border border-border-subtle shrink-0">
                <span className="font-label-sm text-xs text-outline">Stockage :</span>
                <span className="font-headline-sm text-xs text-on-surface font-bold tabular-nums">
                  {dhwTemp != null ? `${dhwTemp.toFixed(1)}°C` : '52.0°C'}
                </span>
              </div>
            </div>

            <div className="p-3.5 bg-canvas-slate rounded-xl border border-border-subtle flex items-center justify-between gap-2 shadow-xs">
              <div className="flex flex-col min-w-0 pr-1">
                <span className="font-label-md text-label-md text-on-surface font-semibold leading-tight">Consigne ECS</span>
                <span className="font-label-sm text-xs text-on-surface-variant mt-0.5 whitespace-nowrap">
                  Recommandé 50°C – 55°C
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 bg-white p-1 rounded-full border border-border-subtle shadow-xs">
                <span className="font-headline-md text-[18px] text-primary font-bold tabular-nums px-3 text-center">
                  55.0<span className="text-xs text-outline font-normal">°C</span>
                </span>
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="p-2.5 rounded-xl bg-canvas-slate border border-border-subtle flex items-center justify-between gap-2">
                <div className="flex flex-col min-w-0">
                  <span className="font-label-sm text-[11px] text-on-surface-variant flex items-center gap-1 font-medium">
                    <span className="material-symbols-outlined text-[14px] text-primary">verified</span>
                    Cycle anti-légionelle
                  </span>
                  <span className="font-label-md text-xs font-semibold text-emerald-800 pl-4 mt-0.5">
                    Actif (dimanche 03:00)
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-secondary">OK 60°C</span>
              </div>

              <div className="p-2.5 rounded-xl bg-canvas-slate border border-border-subtle flex items-center justify-between gap-2">
                <div className="flex flex-col min-w-0">
                  <span className="font-label-sm text-[11px] text-on-surface-variant flex items-center gap-1 font-medium">
                    <span className="material-symbols-outlined text-[14px] text-outline">storage</span>
                    Capacité ballon
                  </span>
                  <span className="font-label-md text-xs font-semibold text-on-surface pl-4 mt-0.5">
                    250 Litres émaillé
                  </span>
                </div>
                <span className="text-[11px] font-medium text-on-surface-variant">Prêt pour séjour</span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-border-subtle flex items-center justify-between text-xs text-on-surface-variant">
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-secondary">check_circle</span>
              Ballon thermodynamique
            </span>
            <span className="font-medium text-primary">Cycle anti-légionelle OK</span>
          </div>
        </div>

        {/* ---------------- CARD 3 : PISCINE KLEREO (AVEC VERROU EN LECTURE SEULE & ALERTE RADIO) ---------------- */}
        <div className="p-5 rounded-2xl bg-surface-container-lowest border-2 border-amber-300 flex flex-col justify-between gap-5 shadow-sm relative overflow-hidden">
          {/* Read-Only Top Watermark Indicator */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-border-subtle pb-3 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-amber-700 text-[22px]">pool</span>
                <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold truncate">Piscine Klereo</h3>
                {poolStatus?.radio_error ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 font-label-sm text-[11px] font-bold shrink-0">
                    <AlertTriangle className="h-3 w-3 text-rose-600" />
                    Rupture Radio K-Link
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300 font-label-sm text-[11px] font-semibold shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                    Liaison radio K-Link active
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 shrink-0">
                <span className="font-label-sm text-xs text-amber-800">Eau :</span>
                <span className="font-headline-sm text-xs text-amber-950 font-bold tabular-nums">
                  {poolStatus?.water_temperature != null ? `${poolStatus.water_temperature.toFixed(1)}°C` : '--°C'}
                </span>
                <span className="text-xs text-amber-400 mx-0.5">•</span>
                <span className="font-label-sm text-xs text-amber-800">Air :</span>
                <span className="font-headline-sm text-xs text-amber-950 font-bold tabular-nums">
                  {poolStatus?.air_temperature != null ? `${poolStatus.air_temperature.toFixed(1)}°C` : '--°C'}
                </span>
              </div>
            </div>

            {/* BANDEAU D'ALERTE RUPTURE RADIO K-LINK 868 MHz (uniquement si confirmée par l'API) */}
            {poolStatus?.radio_error && poolStatus?.radio_alert && (
              <div className="p-3.5 rounded-xl bg-amber-50 border-2 border-amber-500 text-amber-950 shadow-xs space-y-1.5 animate-in fade-in duration-200">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="font-bold text-xs leading-snug">
                    {poolStatus.radio_alert}
                  </div>
                </div>
              </div>
            )}

            {/* Alertes Klereo dynamiques issues de l'API */}
            {poolStatus?.alerts && poolStatus.alerts.length > 0 && (
              <div className="flex flex-col gap-2">
                {poolStatus.alerts.map((alert, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 text-amber-900 rounded-xl text-xs font-medium flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-amber-600 text-sm">warning</span>
                    <span>{alert.message || alert}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Target Temperature with STRICT READ-ONLY LOCK */}
            <div className="p-3.5 bg-canvas-slate rounded-xl border border-border-subtle flex items-center justify-between gap-2 shadow-xs relative opacity-90">
              <div className="flex flex-col min-w-0 pr-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-label-md text-label-md text-on-surface font-semibold leading-tight">Consigne PAC Piscine</span>
                  <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700 text-[10px] font-bold">
                    <Lock className="h-3 w-3" />
                    Lecture seule
                  </span>
                </div>
                <span className="font-label-sm text-xs text-on-surface-variant mt-0.5 whitespace-nowrap">
                  Hivernage : consigne minimale {poolStatus?.frost_protection_target != null ? `${poolStatus.frost_protection_target.toFixed(1)}°C` : '10.0°C'} (non transmissible)
                </span>
              </div>

              {/* Locked Stepper (Read-Only) */}
              <div className="flex items-center gap-1.5 shrink-0 bg-white p-1 rounded-full border border-border-subtle shadow-xs opacity-75">
                <button
                  type="button"
                  disabled
                  className="w-7 h-7 rounded-full bg-canvas-slate border border-border-subtle flex items-center justify-center text-slate-400 cursor-not-allowed"
                  title="Consigne verrouillée en lecture seule (sécurité Klereo)"
                >
                  <Lock className="h-3.5 w-3.5" />
                </button>
                <span className="font-headline-md text-[18px] text-slate-700 font-bold tabular-nums w-12 text-center">
                  {poolStatus?.frost_protection_target != null ? poolStatus.frost_protection_target.toFixed(1) : '--'}<span className="text-xs text-outline font-normal">°C</span>
                </span>
                <button
                  type="button"
                  disabled
                  className="w-7 h-7 rounded-full bg-canvas-slate border border-border-subtle flex items-center justify-center text-slate-400 cursor-not-allowed"
                  title="Consigne verrouillée en lecture seule (sécurité Klereo)"
                >
                  <Lock className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Programmed Automation Items */}
            <div className="space-y-2.5">
              <div className="p-2.5 rounded-xl bg-canvas-slate border border-border-subtle flex items-center justify-between gap-2">
                <div className="flex flex-col min-w-0">
                  <span className="font-label-sm text-[11px] text-on-surface-variant flex items-center gap-1 font-medium">
                    <span className="material-symbols-outlined text-[14px] text-amber-rich">warning</span>
                    Mise en marche PAC piscine
                  </span>
                  <span className="font-label-md text-xs font-semibold text-amber-rich pl-4 mt-0.5 truncate">
                    {poolStatus?.pac_state || 'Déconseillée (Saison Hiver)'}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                  <Lock className="h-3 w-3" />
                  Verrouillée
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-canvas-slate border border-border-subtle flex items-center justify-between gap-2">
                <div className="flex flex-col min-w-0">
                  <span className="font-label-sm text-[11px] text-on-surface-variant flex items-center gap-1 font-medium">
                    <span className="material-symbols-outlined text-[14px] text-outline">autorenew</span>
                    Filtration Klereo
                  </span>
                  <span className="font-label-md text-xs font-semibold text-on-surface pl-4 mt-0.5 truncate">
                    {poolStatus?.filtration_cycle || poolStatus?.filtration_state || 'Cycle régulé'}
                  </span>
                </div>
                <span className="text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">Cycle Réel</span>
              </div>
            </div>

            {/* Klereo Physico-Chemical Sensors Grid */}
            <div className="pt-2.5 border-t border-border-subtle">
              <div className="flex flex-wrap items-center gap-1.5">
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-canvas-slate border border-border-subtle text-[11px] font-medium text-on-surface-variant">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                  <span>pH : <strong>{poolStatus?.ph != null ? poolStatus.ph.toFixed(1) : (poolStatus?.ph_value != null ? poolStatus.ph_value.toFixed(1) : '--')}</strong></span>
                </div>
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-canvas-slate border border-border-subtle text-[11px] font-medium text-on-surface-variant">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                  <span>Redox : <strong>{poolStatus?.redox_mv != null ? `${poolStatus.redox_mv} mV` : (poolStatus?.redox_value != null ? `${poolStatus.redox_value} mV` : '-- mV')}</strong></span>
                </div>
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-canvas-slate border border-border-subtle text-[11px] font-medium text-on-surface-variant">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                  <span>Filtre : <strong>{poolStatus?.filter_pressure_mbar != null ? `${poolStatus.filter_pressure_mbar} mbar` : (poolStatus?.filter_pressure != null ? `${poolStatus.filter_pressure} mbar` : '-- mbar')}</strong></span>
                </div>
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-medium">
                  {poolStatus?.filtration_state || 'État : En veille'}
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-border-subtle flex items-center justify-between text-xs text-on-surface-variant">
            <span className="flex items-center gap-1 text-rose-700 font-semibold">
              <Radio className="h-3.5 w-3.5 text-rose-600" />
              Klereo CONNECT 868 MHz (Rupture signal)
            </span>
            <span className="font-semibold text-rose-800 bg-rose-100 px-2 py-0.5 rounded border border-rose-200">
              🔒 Lecture seule & Radio KO
            </span>
          </div>
        </div>

      </div>
      )}

      {/* ===================================================================== */}
      {/* 3. CONTRÔLE DÉTAILLÉ VICARE & RÉGLAGES DE CONSIGNE (AVEC RBAC HENRI)   */}
      {/* ===================================================================== */}
      <section className="bg-surface-container-lowest rounded-2xl p-6 sm:p-8 shadow-sm border border-border-subtle space-y-8">
        
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-subtle pb-5">
          <div>
            <h2 className="font-headline-md text-headline-md text-forest-deep font-bold tracking-tight">
              Pilotage Opérationnel de la Chaudière ViCare
            </h2>
            <p className="text-xs sm:text-sm text-on-surface-variant mt-1">
              Sélection du mode de chauffe et ajustement de consigne pour le confort des occupants du Presbytère.
            </p>
          </div>

          {/* RBAC Badge */}
          {isCoordinator ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sage-soft border border-sage-border text-primary font-label-sm text-xs font-bold">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <span>Contrôle Total — Coordinateur (Henri)</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-300 text-slate-600 font-label-sm text-xs font-semibold">
              <Lock className="h-4 w-4 text-slate-400" />
              <span>Consultation Associé • Modifications réservées à Henri</span>
            </span>
          )}
        </div>

        {/* 3 Explicit Modes of Operation */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <span className="font-label-md text-xs uppercase tracking-wider font-bold text-forest-deep">
              Modes de Fonctionnement Chaudière (3 Modes Explicites)
            </span>
            <span className="text-xs text-on-surface-variant">
              Mode actuel : <strong className="text-forest-deep font-bold">{getModeLabel(activeMode)}</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {modeButtons.map((btn) => {
              const isSelected = activeMode === btn.modeKey ||
                (btn.modeKey === 'dhw' && activeMode === 'onlyDhw') ||
                (btn.modeKey === 'dhwAndHeating' && activeMode === 'forcedNormal') ||
                (btn.modeKey === 'standby' && activeMode === 'forcedReduced');

              return (
                <button
                  key={btn.id}
                  onClick={() => isCoordinator && setPendingAction({ type: 'mode', modeItem: btn })}
                  disabled={!isCoordinator || updating}
                  className={`p-5 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between ${
                    !isCoordinator ? 'opacity-85 cursor-not-allowed' : 'cursor-pointer hover:shadow-sm'
                  } ${
                    isSelected
                      ? btn.activeClass
                      : `bg-canvas-slate border-border-subtle ${btn.bgClass}`
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-headline-sm text-sm font-bold block">{btn.label}</span>
                      {isSelected && <CheckCircle2 className="h-4 w-4 text-white shrink-0 ml-1" />}
                    </div>
                    <span className={`text-xs block leading-relaxed ${isSelected ? 'text-white/90' : 'text-on-surface-variant'}`}>
                      {btn.desc}
                    </span>
                  </div>

                  <div className={`mt-5 pt-3 border-t flex items-center justify-between ${isSelected ? 'border-white/20' : 'border-border-subtle'}`}>
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${isSelected ? 'text-white/90' : 'text-outline'}`}>
                      API: {btn.modeKey}
                    </span>
                    <span className={`text-xs font-bold ${isSelected ? 'text-white' : isCoordinator ? 'text-primary' : 'text-slate-400'}`}>
                      {isSelected ? 'Actif' : isCoordinator ? 'Sélectionner' : '🔒 Verrouillé'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Target Temperature Stepper + Slider (12°C - 24°C) */}
        <div className="p-6 rounded-2xl bg-canvas-slate border border-border-subtle space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-sage-soft text-primary flex items-center justify-center shrink-0">
                <Thermometer className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-headline-sm text-sm font-bold text-forest-deep">
                  Ajustement Consigne de Température
                </h3>
                <p className="text-xs text-on-surface-variant">
                  Plage autorisée : <strong>12.0°C à 24.0°C</strong> par pas de 0.5°C
                </p>
              </div>
            </div>

            {isCoordinator ? (
              <span className="text-xs text-emerald-800 font-semibold bg-sage-soft px-3 py-1 rounded-full border border-sage-border self-start sm:self-auto">
                Modifications activées pour Henri
              </span>
            ) : (
              <span className="text-xs text-slate-500 font-medium bg-slate-100 px-3 py-1 rounded-full border border-slate-200 self-start sm:self-auto flex items-center gap-1">
                <Lock className="h-3 w-3 text-slate-400" />
                Lecture seule (seul le coordinateur peut changer la consigne)
              </span>
            )}
          </div>

          <div className="flex flex-col md:flex-row items-center gap-4 pt-2">
            {/* Stepper Buttons */}
            <div className="flex items-center space-x-2">
              <button
                onClick={decrementTemp}
                disabled={!isCoordinator || sliderTemp <= 12.0 || updating}
                className={`w-10 h-10 rounded-xl border transition-all flex items-center justify-center ${
                  isCoordinator && sliderTemp > 12.0
                    ? 'bg-white border-border-subtle text-forest-deep hover:bg-sage-soft active:scale-95 shadow-xs cursor-pointer'
                    : 'bg-slate-100 border-slate-200 text-slate-300 cursor-not-allowed'
                }`}
                title="Diminuer de 0.5°C"
              >
                <Minus className="h-4 w-4 stroke-[3]" />
              </button>

              <div className="px-5 py-2 bg-white border border-border-subtle rounded-xl text-center shadow-xs min-w-[110px]">
                <span className="font-headline-md text-xl font-bold text-forest-deep font-mono">
                  {sliderTemp.toFixed(1)}
                </span>
                <span className="text-xs font-bold text-primary ml-1">°C</span>
              </div>

              <button
                onClick={incrementTemp}
                disabled={!isCoordinator || sliderTemp >= 24.0 || updating}
                className={`w-10 h-10 rounded-xl border transition-all flex items-center justify-center ${
                  isCoordinator && sliderTemp < 24.0
                    ? 'bg-white border-border-subtle text-forest-deep hover:bg-sage-soft active:scale-95 shadow-xs cursor-pointer'
                    : 'bg-slate-100 border-slate-200 text-slate-300 cursor-not-allowed'
                }`}
                title="Augmenter de 0.5°C"
              >
                <Plus className="h-4 w-4 stroke-[3]" />
              </button>
            </div>

            {/* Slider Range */}
            <div className="flex-1 w-full flex items-center space-x-3">
              <span className="text-xs font-bold text-outline">12°C</span>
              <input
                type="range"
                min="12.0"
                max="24.0"
                step="0.5"
                value={sliderTemp}
                disabled={!isCoordinator || updating}
                onChange={(e) => isCoordinator && setSliderTemp(parseFloat(e.target.value))}
                className={`w-full h-2 rounded-lg appearance-none cursor-pointer accent-primary ${
                  isCoordinator ? 'bg-sage-border' : 'bg-slate-200 cursor-not-allowed'
                }`}
              />
              <span className="text-xs font-bold text-outline">24°C</span>
            </div>

            {/* Apply Button */}
            {isCoordinator ? (
              <button
                onClick={() => setPendingAction({ type: 'temperature', temp: sliderTemp })}
                disabled={updating || loading}
                className="w-full md:w-auto px-5 py-2.5 bg-primary hover:bg-forest-deep text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center space-x-2 shrink-0 cursor-pointer"
              >
                <Flame className="h-4 w-4 text-emerald-300" />
                <span>Appliquer {sliderTemp.toFixed(1)}°C</span>
              </button>
            ) : (
              <div className="w-full md:w-auto px-4 py-2 bg-slate-100 text-slate-500 text-xs font-semibold rounded-xl border border-slate-200 text-center shrink-0 flex items-center justify-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-slate-400" />
                <span>Verrouillé en lecture seule</span>
              </div>
            )}
          </div>
        </div>

        {/* ---------------- CUVE À FIOUL (PRESBYTÈRE) ---------------- */}
        <div className="p-6 rounded-2xl bg-canvas-slate border border-border-subtle">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-forest-deep text-amber-300 flex items-center justify-center shadow-xs">
                <Fuel className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-headline-sm text-sm font-bold text-forest-deep">Jauge Cuve à Fioul</h3>
                <span className="text-[11px] text-on-surface-variant font-medium">Cuve Presbytère • Sonde hydrostatique</span>
              </div>
            </div>

            <span className={`text-xs font-bold px-3 py-1 rounded-full border ${
              (fuelPercent ?? 0) < 25
                ? 'bg-rose-50 text-rose-800 border-rose-200'
                : (fuelPercent ?? 0) < 45
                ? 'bg-amber-soft text-amber-rich border-amber-200'
                : 'bg-sage-soft text-primary border-sage-border'
            }`}>
              {fuelPercent != null ? `${fuelPercent.toFixed(0)}% Rempli` : 'Capteur non disponible'}
            </span>
          </div>

          <div className="flex items-baseline justify-between mb-2">
            <span className="font-headline-md text-xl font-bold text-forest-deep">
              {litersRemaining != null ? `${Math.round(litersRemaining).toLocaleString('fr-FR')} L` : '1 850 L'}{' '}
              <span className="text-xs text-outline font-normal">/ {capacityLiters ? Math.round(capacityLiters).toLocaleString('fr-FR') : '2 500'} L</span>
            </span>
            <span className="text-xs text-on-surface-variant">
              Dernier approvisionnement : <strong className="text-on-surface font-semibold">15/11/2025</strong>
            </span>
          </div>

          <div className="w-full h-3 rounded-full bg-slate-200 overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                (fuelPercent ?? 74) < 25
                  ? 'bg-rose-500'
                  : (fuelPercent ?? 74) < 45
                  ? 'bg-amber-500'
                  : 'bg-emerald-600'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, fuelPercent ?? 74))}%` }}
            ></div>
          </div>

          <p className="text-xs text-on-surface-variant leading-relaxed mt-2">
            Consommation moyenne estimée : ~1 800 L / saison hivernale. Réapprovisionnement automatique planifié par le coordinateur avant passage sous la barre des 25%.
          </p>
        </div>

      </section>

      {/* ===================================================================== */}
      {/* 4. MODALE DE CONFIRMATION DE COMMANDE VICARE                          */}
      {/* ===================================================================== */}
      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white border border-border-subtle rounded-3xl p-6 shadow-2xl relative">
            <button
              onClick={() => setPendingAction(null)}
              className="absolute top-4 right-4 p-2 text-outline hover:text-on-surface rounded-xl cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-sage-soft text-primary flex items-center justify-center mb-4">
              <Flame className="h-6 w-6" />
            </div>

            <h3 className="font-headline-md text-lg font-bold text-forest-deep">
              Confirmer la modification ViCare ?
            </h3>

            <div className="mt-3 space-y-2 text-xs text-on-surface-variant leading-relaxed">
              {pendingAction.type === 'mode' ? (
                <p>
                  Voulez-vous vraiment passer la chaudière en mode <strong className="text-primary font-bold">{pendingAction.modeItem.label}</strong> (instruction API <code className="font-mono bg-canvas-slate px-1 py-0.5 rounded border border-border-subtle">{pendingAction.modeItem.modeKey}</code>) ?
                </p>
              ) : (
                <p>
                  Voulez-vous vraiment ajuster la consigne de température à <strong className="text-primary font-bold">{pendingAction.temp.toFixed(1)}°C</strong> pour l'ensemble du Presbytère ?
                </p>
              )}
            </div>

            <div className="mt-6 flex items-center justify-end space-x-3">
              <button
                onClick={() => setPendingAction(null)}
                className="px-4 py-2.5 rounded-xl border border-border-subtle text-xs font-semibold text-on-surface-variant hover:bg-canvas-slate transition cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  const act = pendingAction;
                  setPendingAction(null);
                  if (act.type === 'mode') {
                    handleApplyMode(act.modeItem.modeKey);
                  } else if (act.type === 'temperature') {
                    handleApplyTemperature(act.temp);
                  }
                }}
                className="px-5 py-2.5 rounded-xl bg-primary hover:bg-forest-deep text-white text-xs font-bold shadow-sm transition cursor-pointer"
              >
                Confirmer la modification
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
