import React, { useState, useEffect } from 'react';
import {
  Flame, Thermometer, Sun, Moon, Sparkles, Fuel,
  CheckCircle2, AlertTriangle, RefreshCw, Layers, Droplets, HelpCircle, X,
  Minus, Plus, Lock, ShieldCheck, Clock
} from 'lucide-react';
import { fetchHeatingStatus, setHeatingMode, setHeatingTemperature } from '../api';

export default function HeatingPage({ currentUser }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [updating, setUpdating] = useState(false);

  // Determine RBAC permissions strictly for Coordinator (Henri)
  const activeUser = currentUser || localStorage.getItem('sci_user') || 'Membre';
  const isCoordinator = activeUser === 'Henri';

  // Target temperature slider/stepper state (12°C - 24°C)
  const [sliderTemp, setSliderTemp] = useState(19.0);

  // Confirmation Modal State for ViCare API calls
  const [pendingAction, setPendingAction] = useState(null);

  const loadStatus = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const data = await fetchHeatingStatus();
      if (data && data.error) {
        throw new Error(data.error);
      }
      setStatus(data);
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
      await setHeatingMode(modeKey);
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
      await setHeatingTemperature(targetVal);
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
        return '🟢 Chauffage & Eau Chaude (Mode Hiver/Confort)';
      case 'standby':
      case 'forcedReduced':
        return '❄️ Hors Gel / Veille';
      default:
        return mode || 'Auto';
    }
  };

  // 3 Explicit Operation Mode Buttons
  const modeButtons = [
    {
      id: 'dhw',
      modeKey: 'dhw',
      label: '🚿 Eau Chaude Seule (Mode Été)',
      shortName: 'Mode Été',
      desc: 'Eau chaude sanitaire uniquement (radiateurs éteints)',
      bgClass: 'hover:border-cyan-400 hover:bg-cyan-50/50 text-cyan-900 dark:hover:bg-cyan-950/30 dark:text-cyan-200',
      activeClass: 'bg-cyan-600 text-white border-cyan-700 shadow-md ring-2 ring-cyan-300'
    },
    {
      id: 'dhwAndHeating',
      modeKey: 'dhwAndHeating',
      label: '🟢 Chauffage & Eau Chaude (Mode Hiver/Confort)',
      shortName: 'Mode Hiver / Confort',
      desc: 'Chauffage actif des radiateurs et eau chaude sanitaire',
      bgClass: 'hover:border-emerald-400 hover:bg-emerald-50/50 text-emerald-900 dark:hover:bg-emerald-950/30 dark:text-emerald-200',
      activeClass: 'bg-emerald-600 text-white border-emerald-700 shadow-md ring-2 ring-emerald-300'
    },
    {
      id: 'standby',
      modeKey: 'standby',
      label: '❄️ Hors Gel / Veille',
      shortName: 'Hors Gel / Veille',
      desc: 'Maintien hors gel minimal pour protection du bâtiment',
      bgClass: 'hover:border-blue-400 hover:bg-blue-50/50 text-blue-900 dark:hover:bg-blue-950/30 dark:text-blue-200',
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
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-amber-600 via-orange-600 to-rose-700 p-6 sm:p-8 text-white shadow-md">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 rounded-full bg-white/10 blur-3xl pointer-events-none"></div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center space-x-2 text-xs font-bold text-amber-100 uppercase tracking-widest mb-1">
              <Flame className="h-4 w-4 text-amber-200" />
              <span>Pilotage & Télémesure Domaine</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight">
              Chauffage ViCare
            </h1>
            <p className="text-sm text-amber-100/90 mt-1 max-w-xl">
              Contrôle à distance de la chaudière Viessmann du Presbytère, métriques et niveau de cuve à fioul.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={loadStatus}
              disabled={loading || updating}
              className="flex items-center space-x-2 px-4 py-2.5 rounded-2xl bg-white/20 hover:bg-white/30 backdrop-blur-md text-white font-bold text-xs border border-white/20 transition shadow-sm"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Actualiser</span>
            </button>
          </div>
        </div>
      </div>

      {/* Prominent Red Alert Card on API/Sensor Failure */}
      {errorMsg ? (
        <div className="p-6 rounded-3xl bg-rose-50 dark:bg-rose-950/40 border-2 border-rose-500 dark:border-rose-600 text-rose-900 dark:text-rose-200 shadow-md animate-in fade-in duration-200">
          <div className="flex items-start space-x-4">
            <div className="p-3 bg-rose-600 text-white rounded-2xl shrink-0">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-black text-rose-950 dark:text-white flex items-center gap-2">
                <span>⚠️ Erreur de lecture capteur / API</span>
              </h3>
              <p className="text-xs text-rose-700 dark:text-rose-300 font-bold mt-1">
                Échec de connexion ou de lecture de la télémesure ViCare. Aucun chiffre fictif masqué.
              </p>
              <div className="mt-3 p-3 bg-rose-100/90 dark:bg-rose-900/60 border border-rose-300 dark:border-rose-700 rounded-xl font-mono text-xs text-rose-950 dark:text-rose-100 break-all">
                <strong>Raw error trace :</strong> {errorMsg}
              </div>
              <div className="mt-4 flex items-center space-x-3">
                <button
                  onClick={loadStatus}
                  disabled={loading}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl shadow transition flex items-center space-x-2"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  <span>Enquêter / Réessayer</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : loading ? (
        <div className="py-12 text-center text-slate-500 font-semibold text-xs flex items-center justify-center space-x-2 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800">
          <RefreshCw className="h-5 w-5 animate-spin text-amber-500" />
          <span>Chargement des métriques ViCare en direct...</span>
        </div>
      ) : (
        /* Telemetry Grid & Presets */
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm rounded-3xl p-6 sm:p-7">
          <h2 className="text-lg font-black text-slate-900 dark:text-white mb-4">
            Télémesure en Direct
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-8">
            
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Ambiance
              </span>
              <div className="flex items-baseline space-x-1">
                <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                  {currentTemp != null ? currentTemp.toFixed(1) : 'N/A'}
                </span>
                <span className="text-sm font-bold text-slate-500">°C</span>
              </div>
              <span className="text-[10px] text-slate-400 mt-2 block">Capteur Intérieur</span>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/50 flex flex-col justify-between">
              <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider block mb-1">
                Consigne
              </span>
              <div className="flex items-baseline space-x-1">
                <span className="text-2xl sm:text-3xl font-black text-amber-900 dark:text-amber-200">
                  {targetTemp != null ? targetTemp.toFixed(1) : 'N/A'}
                </span>
                <span className="text-sm font-bold text-amber-700 dark:text-amber-400">°C</span>
              </div>
              <span className="text-[10px] text-amber-700/80 dark:text-amber-400/80 mt-2 block">Cible Actuelle</span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Extérieur
              </span>
              <div className="flex items-baseline space-x-1">
                <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                  {outdoorTemp != null ? outdoorTemp.toFixed(1) : 'N/A'}
                </span>
                <span className="text-sm font-bold text-slate-500">°C</span>
              </div>
              <span className="text-[10px] text-slate-400 mt-2 block">Sonde Externe</span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Chaudière
              </span>
              <div className="flex items-baseline space-x-1">
                <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                  {supplyTemp != null ? supplyTemp.toFixed(1) : 'N/A'}
                </span>
                <span className="text-sm font-bold text-slate-500">°C</span>
              </div>
              <span className="text-[10px] text-slate-400 mt-2 block">Départ Eau</span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 col-span-2 sm:col-span-1 flex flex-col justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1 flex items-center justify-between">
                <span>ECS Ballons</span>
                <Droplets className="h-3.5 w-3.5 text-cyan-600" />
              </span>
              <div className="flex items-baseline space-x-1">
                <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                  {dhwTemp != null ? dhwTemp.toFixed(1) : 'N/A'}
                </span>
                <span className="text-sm font-bold text-slate-500">°C</span>
              </div>
              <span className="text-[10px] text-slate-400 mt-2 block">Stockage ECS</span>
            </div>

          </div>

          {/* 3 Explicit Operation Mode Selectors */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Modes de Fonctionnement Chaudière (3 Modes Explicites)
              </span>
              <span className="text-xs font-semibold text-slate-500">
                Actuel : <strong className="text-slate-900 dark:text-white font-extrabold">{getModeLabel(activeMode)}</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {modeButtons.map((btn) => {
                const isSelected = activeMode === btn.modeKey || (btn.modeKey === 'dhw' && activeMode === 'onlyDhw') || (btn.modeKey === 'dhwAndHeating' && activeMode === 'forcedNormal') || (btn.modeKey === 'standby' && activeMode === 'forcedReduced');
                return (
                  <button
                    key={btn.id}
                    onClick={() => isCoordinator && setPendingAction({ type: 'mode', modeItem: btn })}
                    disabled={!isCoordinator || updating}
                    className={`p-4 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between ${
                      !isCoordinator ? 'opacity-75 cursor-not-allowed' : ''
                    } ${
                      isSelected
                        ? btn.activeClass
                        : `bg-slate-50/80 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 ${btn.bgClass}`
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-black block">{btn.label}</span>
                        {isSelected && <CheckCircle2 className="h-4 w-4 text-white shrink-0 ml-1" />}
                      </div>
                      <span className={`text-[11px] block leading-relaxed ${isSelected ? 'text-white/90' : 'text-slate-500 dark:text-slate-400'}`}>
                        {btn.desc}
                      </span>
                    </div>
                    <div className="mt-4 pt-2 border-t border-slate-200/40 dark:border-slate-800/40 flex items-center justify-between">
                      <span className={`text-[10px] font-extrabold uppercase tracking-wider ${isSelected ? 'text-white/90' : 'text-slate-400'}`}>
                        API: {btn.modeKey}
                      </span>
                      <span className={`text-xs font-black ${isSelected ? 'text-white' : 'text-amber-700 dark:text-amber-400'}`}>
                        {isSelected ? 'Actif' : isCoordinator ? 'Sélectionner' : '🔒 Verrouillé'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Target Temperature Slider / Stepper (12°C - 24°C) - Strictly Restricted to Coordinator (Henri) */}
          <div className="mb-8 p-5 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-xl bg-amber-500 text-white shadow-sm">
                  <Thermometer className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    Ajustement Consigne de Température
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Plage autorisée : <strong>12.0°C à 24.0°C</strong> par pas de 0.5°C
                  </p>
                </div>
              </div>

              {isCoordinator ? (
                <span className="px-3 py-1 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800 flex items-center gap-1.5 self-start sm:self-auto">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Accès Autorisé — Coordinateur (Henri)</span>
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full text-[11px] font-extrabold bg-slate-100 text-slate-500 border border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 flex items-center gap-1.5 self-start sm:self-auto">
                  <Lock className="h-3.5 w-3.5 text-slate-400" />
                  <span>🔒 Réservé au Coordinateur (Henri)</span>
                </span>
              )}
            </div>

            {/* Stepper + Slider UI */}
            <div className="flex flex-col md:flex-row items-center gap-4">
              <div className="flex items-center space-x-2">
                <button
                  onClick={decrementTemp}
                  disabled={!isCoordinator || sliderTemp <= 12.0 || updating}
                  className={`p-2.5 rounded-xl border transition flex items-center justify-center ${
                    isCoordinator && sliderTemp > 12.0
                      ? 'bg-white dark:bg-slate-800 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 hover:bg-amber-100 shadow-sm active:scale-95'
                      : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-300 dark:text-slate-600 cursor-not-allowed'
                  }`}
                  title="Diminuer de 0.5°C"
                >
                  <Minus className="h-4 w-4 stroke-[3]" />
                </button>

                <div className="px-4 py-2 bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded-xl text-center shadow-inner min-w-[100px]">
                  <span className="text-xl font-black text-amber-950 dark:text-amber-200 font-mono">
                    {sliderTemp.toFixed(1)}
                  </span>
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-400 ml-1">°C</span>
                </div>

                <button
                  onClick={incrementTemp}
                  disabled={!isCoordinator || sliderTemp >= 24.0 || updating}
                  className={`p-2.5 rounded-xl border transition flex items-center justify-center ${
                    isCoordinator && sliderTemp < 24.0
                      ? 'bg-white dark:bg-slate-800 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 hover:bg-amber-100 shadow-sm active:scale-95'
                      : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-300 dark:text-slate-600 cursor-not-allowed'
                  }`}
                  title="Augmenter de 0.5°C"
                >
                  <Plus className="h-4 w-4 stroke-[3]" />
                </button>
              </div>

              <div className="flex-1 w-full flex items-center space-x-3">
                <span className="text-xs font-bold text-slate-400">12°C</span>
                <input
                  type="range"
                  min="12.0"
                  max="24.0"
                  step="0.5"
                  value={sliderTemp}
                  disabled={!isCoordinator || updating}
                  onChange={(e) => isCoordinator && setSliderTemp(parseFloat(e.target.value))}
                  className={`w-full h-2.5 rounded-lg appearance-none cursor-pointer accent-amber-500 ${
                    isCoordinator ? 'bg-amber-200 dark:bg-amber-900/60' : 'bg-slate-200 dark:bg-slate-800 cursor-not-allowed'
                  }`}
                />
                <span className="text-xs font-bold text-slate-400">24°C</span>
              </div>

              {isCoordinator ? (
                <button
                  onClick={() => setPendingAction({ type: 'temperature', temp: sliderTemp })}
                  disabled={updating || loading}
                  className="w-full md:w-auto px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs rounded-xl shadow-md transition flex items-center justify-center space-x-2 shrink-0"
                >
                  <Flame className="h-4 w-4" />
                  <span>Appliquer {sliderTemp.toFixed(1)}°C</span>
                </button>
              ) : (
                <div className="w-full md:w-auto px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[11px] font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-center shrink-0">
                  🔒 Réservé au Coordinateur (Henri)
                </div>
              )}
            </div>

            {!isCoordinator && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-3 font-medium flex items-center space-x-1.5">
                <Lock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span>Seul le Coordinateur (Henri) est habilité à envoyer la consigne de température à la chaudière ViCare.</span>
              </p>
            )}
          </div>

          {/* Fuel Tank Gauge Section (Full width w-full) */}
          <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
            <div className="w-full p-5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <div className="p-2 rounded-xl bg-slate-900 text-amber-400">
                      <Fuel className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-900 dark:text-white">Jauge Cuve à Fioul</h3>
                      <span className="text-[10px] text-slate-500 font-semibold block">Cuve Presbytère</span>
                    </div>
                  </div>
                  <span className="text-xs font-black px-3 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
                    {fuelPercent != null ? `${fuelPercent.toFixed(0)}% Rempli` : 'Capteur non disponible'}
                  </span>
                </div>

                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-xl font-black text-slate-900 dark:text-white">
                    {litersRemaining != null ? `${Math.round(litersRemaining).toLocaleString('fr-FR')} L` : 'N/A'}{' '}
                    <span className="text-xs text-slate-400 font-normal">/ {capacityLiters ? Math.round(capacityLiters).toLocaleString('fr-FR') : '2 500'} L</span>
                  </span>
                  <span className="text-xs text-slate-500 font-medium">
                    Dernier plein : <strong className="text-slate-800 dark:text-slate-200">15/11/2025</strong>
                  </span>
                </div>

                <div className="w-full h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden mb-2">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      (fuelPercent ?? 0) < 25
                        ? 'bg-rose-500'
                        : (fuelPercent ?? 0) < 45
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, fuelPercent ?? 0))}%` }}
                  ></div>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed mt-2">
                Consommation moyenne estimée : ~1 800 L / saison hivernale. Réapprovisionnement automatique planifié avant passage sous 25%.
              </p>
            </div>
          </div>

        </div>
      )}

      {/* CONFIRMATION POP-UP MODAL */}
      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl relative">
            <button
              onClick={() => setPendingAction(null)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/70 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-4">
              <Flame className="h-6 w-6" />
            </div>

            <h3 className="text-lg font-black text-slate-900 dark:text-white">
              Confirmer la modification du chauffage ?
            </h3>

            <div className="mt-3 space-y-3 text-xs text-slate-600 dark:text-slate-300">
              {pendingAction.type === 'mode' ? (
                <p className="leading-relaxed">
                  Voulez-vous vraiment passer la chaudière en <strong className="text-amber-600 dark:text-amber-400 font-extrabold">{pendingAction.modeItem.label}</strong> (mode API <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">{pendingAction.modeItem.modeKey}</code>) ?
                </p>
              ) : (
                <p className="leading-relaxed">
                  Voulez-vous vraiment ajuster la consigne de température à <strong className="text-amber-600 dark:text-amber-400 font-black">{pendingAction.temp.toFixed(1)}°C</strong> ?
                </p>
              )}
            </div>

            <div className="mt-6 flex items-center justify-end space-x-3">
              <button
                onClick={() => setPendingAction(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
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
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white text-xs font-extrabold shadow-md transition"
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
