import React, { useState, useEffect, useMemo } from 'react';
import StayBalanceWidget from '../components/common/StayBalanceWidget';
import HouseUsageChart from '../components/HouseUsageChart';
import WorkloadDashboard from '../components/WorkloadDashboard';
import VersionHistoryTable from '../components/VersionHistoryTable';
import ErrorBoundary from '../components/common/ErrorBoundary';
import { fetchReservations } from '../api';

const SCI_MEMBERS = [
  { name: 'Henri Jamet', prenom: 'Henri', max_days: 35, color: '#004532', bg: 'bg-emerald-50 text-emerald-900 border-emerald-300' },
  { name: 'Frédéric Jamet', prenom: 'Frédéric', max_days: 60, color: '#0f4c81', bg: 'bg-teal-50 text-teal-900 border-teal-300' },
  { name: 'Élisabeth Jamet', prenom: 'Élisabeth', max_days: 60, color: '#065f46', bg: 'bg-emerald-50 text-emerald-950 border-emerald-300' },
  { name: 'Joséphine Jamet', prenom: 'Joséphine', max_days: 35, color: '#15803d', bg: 'bg-green-50 text-green-900 border-green-300' },
  { name: 'Hortense Jamet', prenom: 'Hortense', max_days: 35, color: '#65a30d', bg: 'bg-lime-50 text-lime-900 border-lime-300' },
  { name: 'Marguerite Jamet', prenom: 'Marguerite', max_days: 35, color: '#059669', bg: 'bg-emerald-50 text-emerald-900 border-emerald-300' },
  { name: 'Eugénie Jamet', prenom: 'Eugénie', max_days: 35, color: '#b45309', bg: 'bg-amber-50 text-amber-900 border-amber-300' },
];

const PERIOD_OPTIONS = [
  { id: 'all', label: 'Tout' },
  { id: '1_year', label: 'Dernière année' },
  { id: '3_months', label: 'Derniers 3 mois' },
];

function StatistiquesPageInner({ currentUser, onOpenOnboardingModal }) {
  const [period, setPeriod] = useState('all');
  const [allReservations, setAllReservations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        setLoading(true);
        const resData = await fetchReservations();
        if (!isMounted) return;
        if (Array.isArray(resData)) {
          setAllReservations(resData);
        }
      } catch (err) {
        console.warn('StatistiquesPage data loading warning:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();
    return () => { isMounted = false; };
  }, []);

  // Filtrage des réservations selon la période sélectionnée
  const filteredReservations = useMemo(() => {
    if (!Array.isArray(allReservations) || allReservations.length === 0) return [];

    const now = new Date();
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    return allReservations.filter((r) => {
      const st = (r.status || '').toLowerCase();
      if (!['confirmée', 'confirmee', 'demande en attente'].includes(st)) {
        return false;
      }
      if (!r.start_date) return false;

      if (period === 'all') return true;

      const startDate = new Date(r.start_date);
      const endDate = r.end_date ? new Date(r.end_date) : startDate;

      if (period === '1_year') {
        return endDate >= oneYearAgo;
      }
      if (period === '3_months') {
        return endDate >= threeMonthsAgo;
      }
      return true;
    });
  }, [allReservations, period]);

  // Agrégation des statistiques et répartition par associé
  const { members, totalDays, totalStays, activeMembersCount, occupancyRate, podium } = useMemo(() => {
    const memberStats = {};
    SCI_MEMBERS.forEach(m => {
      memberStats[m.prenom.toLowerCase()] = {
        ...m,
        days: 0,
        stays: 0,
      };
    });

    filteredReservations.forEach((r) => {
      let days = 7;
      if (r.start_date && r.end_date) {
        const d1 = new Date(r.start_date);
        const d2 = new Date(r.end_date);
        if (!isNaN(d1) && !isNaN(d2)) {
          days = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1);
        }
      }

      const rawName = (r.user_name || '').toLowerCase().trim();
      let matchedKey = null;
      for (const m of SCI_MEMBERS) {
        const pLower = m.prenom.toLowerCase();
        if (rawName.includes(pLower) || m.name.toLowerCase().includes(rawName)) {
          matchedKey = pLower;
          break;
        }
        if ((rawName.includes('maman') || rawName.includes('elisabeth')) && pLower === 'élisabeth') {
          matchedKey = pLower;
          break;
        }
        if ((rawName.includes('papa') || rawName.includes('frederic')) && pLower === 'frédéric') {
          matchedKey = pLower;
          break;
        }
      }

      if (matchedKey && memberStats[matchedKey]) {
        memberStats[matchedKey].days += days;
        memberStats[matchedKey].stays += 1;
      }
    });

    const membersList = Object.values(memberStats);
    const computedTotalDays = membersList.reduce((acc, m) => acc + m.days, 0);
    const computedTotalStays = membersList.reduce((acc, m) => acc + m.stays, 0);
    const activeCount = membersList.filter(m => m.days > 0 || m.stays > 0).length;

    const denominatorDays = period === '3_months' ? 90 : 365;
    const occ = Math.min(100, Math.round((computedTotalDays / denominatorDays) * 100));

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

    const sortedByDays = [...membersList].sort((a, b) => b.days - a.days);
    const top3 = sortedByDays
      .filter(m => m.days > 0)
      .slice(0, 3)
      .map((m, idx) => ({
        rank: idx + 1,
        medal: medals[idx],
        name: m.name,
        days: m.days,
        stays: m.stays,
        max_days: m.max_days,
        color: colors[idx],
        ring: rings[idx],
      }));

    return {
      members: membersList,
      totalDays: computedTotalDays,
      totalStays: computedTotalStays,
      activeMembersCount: activeCount,
      occupancyRate: occ,
      podium: top3,
    };
  }, [filteredReservations, period]);

  const periodLabel = period === '3_months' ? '3 derniers mois' : period === '1_year' ? '12 derniers mois' : 'tout';

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
            Suivi des présences, podium d'occupation des chambres et équilibre contributif des charges selon les statuts de la SCI.
          </p>
        </div>

        {/* Modern Period Selector (Annotation 9) */}
        <div className="flex items-center gap-1.5 self-start md:self-auto bg-surface-container-lowest p-1.5 rounded-2xl border border-border-subtle shadow-xs">
          <span className="text-xs font-bold text-on-surface-variant px-2.5 whitespace-nowrap">Période&nbsp;:</span>
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setPeriod(opt.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                period === opt.id
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-on-surface-variant hover:text-primary hover:bg-canvas-slate'
              }`}
            >
              {opt.label}
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
              <span className="text-xs text-on-surface-variant font-medium">séjour{totalStays > 1 ? 's' : ''} ({periodLabel})</span>
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
              <span className="text-xs text-on-surface-variant font-medium">{periodLabel}</span>
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

      {/* Podium Top 3 des Séjours (Annotations 3, 5, 8) */}
      <section className="bg-surface-container-lowest rounded-2xl p-space-md sm:p-space-lg shadow-sm border border-border-subtle space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border-subtle pb-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold font-headline-md text-forest-deep flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">emoji_events</span>
              Podium des Présences & Séjours
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          {podium.length === 0 ? (
            <div className="col-span-full py-8 text-center text-xs text-on-surface-variant bg-surface-container-lowest rounded-2xl border border-dashed border-border-subtle">
              Aucun séjour comptabilisé pour la période sélectionnée.
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
      <ErrorBoundary
        title="Équilibre des Séjours temporairement indisponible"
        description="Le composant de solde des séjours a rencontré une anomalie lors du rendu. Le reste de la page reste accessible."
      >
        <StayBalanceWidget members={members} />
      </ErrorBoundary>

      {/* Projection d'Occupation sur 12 Mois */}
      <ErrorBoundary
        title="Projection d'occupation temporairement indisponible"
        description="Le graphique mensuel a rencontré une anomalie lors du calcul des nuitées."
      >
        <HouseUsageChart reservations={filteredReservations} />
      </ErrorBoundary>

      {/* Jauge de Répartition des Charges & Responsabilités */}
      <ErrorBoundary
        title="Jauge d'Implication & Charges indisponible"
        description="Le calcul du ratio d'implication des associés a rencontré une exception."
      >
        <WorkloadDashboard currentUser={currentUser} period={period} />
      </ErrorBoundary>

      {/* Historique des Versions & Notes de Mise à Jour (Patch Notes) */}
      <ErrorBoundary
        title="Historique des versions indisponible"
        description="Le tableau de l'historique des versions a rencontré une exception lors du rendu."
      >
        <VersionHistoryTable onOpenOnboardingModal={onOpenOnboardingModal} />
      </ErrorBoundary>
    </div>
  );
}

export default function StatistiquesPage(props) {
  return (
    <ErrorBoundary
      title="Page Statistiques indisponible"
      description="Une erreur inattendue est survenue sur la page Statistiques. L'affichage a été sécurisé contre l'écran blanc."
    >
      <StatistiquesPageInner {...props} />
    </ErrorBoundary>
  );
}
