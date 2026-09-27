import React, { useState, useEffect } from 'react';
import StayBalanceWidget from '../components/common/StayBalanceWidget';
import HouseUsageChart from '../components/HouseUsageChart';
import WorkloadDashboard from '../components/WorkloadDashboard';
import { fetchReservations, fetchStayBalance } from '../api';

export default function StatistiquesPage({ currentUser }) {
  const [year, setYear] = useState(2026);
  const [reservations, setReservations] = useState([]);
  const [podium, setPodium] = useState([]);
  const [totalDays, setTotalDays] = useState(0);
  const [totalStays, setTotalStays] = useState(0);
  const [activeMembersCount, setActiveMembersCount] = useState(0);
  const [occupancyRate, setOccupancyRate] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        setLoading(true);
        const [resData, balData] = await Promise.allSettled([
          fetchReservations({ year }),
          fetchStayBalance(year),
        ]);

        if (!isMounted) return;

        if (resData.status === 'fulfilled' && Array.isArray(resData.value)) {
          setReservations(resData.value);
        }

        if (balData.status === 'fulfilled' && balData.value?.members) {
          const members = [...balData.value.members];
          // Sort members descending by days
          members.sort((a, b) => (b.days || 0) - (a.days || 0));

          const computedTotalDays = members.reduce((acc, m) => acc + (m.days || 0), 0);
          const computedTotalStays = members.reduce((acc, m) => acc + (m.stays_count || m.stays || 0), 0);
          setTotalDays(computedTotalDays);
          setTotalStays(computedTotalStays);

          const activeCount = members.filter(m => (m.days || 0) > 0 || (m.stays_count || m.stays || 0) > 0).length;
          setActiveMembersCount(activeCount);

          // Taux d'occupation dynamique basé sur les jours réels réservés
          const occ = Math.min(100, Math.round((computedTotalDays / 365) * 100));
          setOccupancyRate(occ);

          const medals = ['🥇', '🥈', '🥉'];
          const colors = [
            'from-amber-400 to-amber-600',
            'from-slate-300 to-slate-500',
            'from-amber-700 to-amber-900'
          ];
          const rings = [
            'ring-amber-400/40',
            'ring-slate-300/40',
            'ring-amber-700/40'
          ];

          const top3 = members
            .filter(m => (m.days || 0) > 0)
            .slice(0, 3)
            .map((m, idx) => ({
              rank: idx + 1,
              medal: medals[idx],
              name: m.name,
              days: m.days || 0,
              stays: m.stays_count || m.stays || 0,
              max_days: m.max_days || 35,
              color: colors[idx],
              ring: rings[idx],
            }));

          setPodium(top3);
        }
      } catch (err) {
        console.warn('StatistiquesPage data loading warning:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();
    return () => { isMounted = false; };
  }, [year]);

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-200">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border-subtle pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-[24px]">bar_chart</span>
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold font-headline-md text-forest-deep">
              Statistiques & Équilibre du Domaine
            </h1>
          </div>
          <p className="font-body-md text-xs sm:text-sm text-on-surface-variant mt-1.5 max-w-2xl">
            Suivi des présences, podium annuel d'occupation des chambres et équilibre contributif des charges selon les statuts de la SCI.
          </p>
        </div>

        {/* Year Toggle */}
        <div className="flex items-center gap-2 self-start md:self-auto bg-surface-container-lowest p-1.5 rounded-2xl border border-border-subtle shadow-xs">
          <span className="text-xs font-bold text-on-surface-variant px-2.5">Exercice :</span>
          {[2025, 2026, 2027].map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setYear(y)}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                year === y
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-on-surface-variant hover:text-primary hover:bg-canvas-slate'
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-surface-container-lowest border border-border-subtle shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-200">
            <span className="material-symbols-outlined text-[22px]">hotel</span>
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant block">Nuitées Réservées</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-black text-forest-deep">{totalDays}</span>
              <span className="text-xs text-on-surface-variant font-medium">jours cumulés</span>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-surface-container-lowest border border-border-subtle shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 border border-teal-200">
            <span className="material-symbols-outlined text-[22px]">luggage</span>
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant block">Séjours Confirmés</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-black text-forest-deep">{totalStays}</span>
              <span className="text-xs text-on-surface-variant font-medium">séjours ({year})</span>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-surface-container-lowest border border-border-subtle shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 border border-blue-200">
            <span className="material-symbols-outlined text-[22px]">pie_chart</span>
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant block">Taux d'Occupation</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-black text-forest-deep">{occupancyRate}%</span>
              <span className="text-xs text-on-surface-variant font-medium">exercice {year}</span>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-surface-container-lowest border border-border-subtle shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center shrink-0 border border-purple-200">
            <span className="material-symbols-outlined text-[22px]">groups</span>
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant block">Associés Actifs</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-black text-forest-deep">{activeMembersCount} / 7</span>
              <span className="text-xs text-on-surface-variant font-medium">
                {activeMembersCount > 0 ? `${Math.round((activeMembersCount / 7) * 100)}% mobilisés` : 'aucun séjour'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Podium Top 3 des Séjours */}
      <section className="bg-surface-container-lowest rounded-2xl p-space-md sm:p-space-lg shadow-sm border border-border-subtle space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border-subtle pb-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold font-headline-md text-forest-deep flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">emoji_events</span>
              Podium des Présences & Séjours ({year})
            </h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Classement des associés par nombre de nuitées réservées sur l'exercice en cours.
            </p>
          </div>
          <span className="text-[11px] font-semibold text-primary bg-sage-soft px-3 py-1 rounded-full self-start sm:self-auto">
            Règle de rotation estivale respectée
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          {podium.length === 0 ? (
            <div className="col-span-full py-8 text-center text-xs text-on-surface-variant bg-surface-container-lowest rounded-2xl border border-dashed border-border-subtle">
              Aucun séjour comptabilisé pour l'exercice {year}.
            </div>
          ) : (
            podium.map((item, index) => {
              const isFirst = index === 0;
              return (
                <div
                  key={item.name}
                  className={`relative rounded-2xl p-5 border transition-all ${
                    isFirst
                      ? 'bg-gradient-to-b from-amber-50/70 to-surface-container-lowest border-amber-300 ring-2 ring-amber-400/20 shadow-md md:-translate-y-1'
                      : 'bg-surface-container-lowest border-border-subtle hover:border-primary/40 shadow-xs'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl">{item.medal}</span>
                      <div>
                        <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block">
                          Place #{item.rank}
                        </span>
                        <h3 className="font-bold text-sm sm:text-base text-forest-deep leading-tight">
                          {item.name}
                        </h3>
                      </div>
                    </div>
                  </div>

                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-on-surface-variant font-medium">Nuitées consommées :</span>
                    <span className="font-extrabold text-forest-deep">{item.days} jours / {item.max_days}j max</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-on-surface-variant font-medium">Nombre de séjours :</span>
                    <span className="font-bold text-forest-deep">{item.stays} séjour{item.stays > 1 ? 's' : ''}</span>
                  </div>

                  {/* Quota Bar */}
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-1">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${item.color}`}
                      style={{ width: `${Math.min(100, Math.round((item.days / item.max_days) * 100))}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        </div>
      </section>

      {/* Détail Complet de l'Équilibre des Séjours */}
      <StayBalanceWidget year={year} />

      {/* Projection d'Occupation sur 12 Mois */}
      <HouseUsageChart reservations={reservations} />

      {/* Jauge de Répartition des Charges & Responsabilités */}
      <WorkloadDashboard currentUser={currentUser} />
    </div>
  );
}
