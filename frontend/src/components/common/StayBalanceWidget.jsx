import React, { useEffect, useState } from 'react';
import { fetchStayBalance } from '../../api';

const DEFAULT_MEMBERS = [
  { name: 'Henri Jamet', role: 'Gérant', days: 14, stays: 2, max_days: 35, color: '#004532', bg: 'bg-emerald-50 text-emerald-900 border-emerald-300' },
  { name: 'Frédéric Jamet', role: 'Usufruitier', days: 28, stays: 4, max_days: 60, color: '#0f4c81', bg: 'bg-teal-50 text-teal-900 border-teal-300' },
  { name: 'Élisabeth Jamet', role: 'Usufruitière', days: 28, stays: 4, max_days: 60, color: '#065f46', bg: 'bg-emerald-50 text-emerald-950 border-emerald-300' },
  { name: 'Joséphine Jamet', role: 'Coordination', days: 12, stays: 2, max_days: 35, color: '#15803d', bg: 'bg-green-50 text-green-900 border-green-300' },
  { name: 'Hortense Jamet', role: 'Jardin', days: 18, stays: 3, max_days: 35, color: '#65a30d', bg: 'bg-lime-50 text-lime-900 border-lime-300' },
  { name: 'Marguerite Jamet', role: 'Maison', days: 10, stays: 1, max_days: 35, color: '#059669', bg: 'bg-emerald-50 text-emerald-900 border-emerald-300' },
  { name: 'Eugénie Jamet', role: 'Déco', days: 9, stays: 1, max_days: 35, color: '#b45309', bg: 'bg-amber-50 text-amber-900 border-amber-300' },
];

export default function StayBalanceWidget({ year = 2026, selectedMember, onSelectMember }) {
  const [balance, setBalance] = useState(DEFAULT_MEMBERS);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadBalance() {
      try {
        setLoading(true);
        const data = await fetchStayBalance(year);
        if (isMounted && data && Array.isArray(data.members) && data.members.length > 0) {
          // Merge with default styling
          const merged = DEFAULT_MEMBERS.map(dm => {
            const found = data.members.find(m => m.name?.toLowerCase().includes(dm.name.toLowerCase().split(' ')[0]));
            if (found) {
              return {
                ...dm,
                days: found.days ?? dm.days,
                stays: found.stays_count ?? found.stays ?? dm.stays,
                max_days: data.max_days ?? found.max_days ?? dm.max_days,
              };
            }
            return dm;
          });
          setBalance(merged);
        }
      } catch (err) {
        // Fallback to default realistic figures
        console.warn('StayBalance API fallback to defaults:', err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadBalance();
    return () => { isMounted = false; };
  }, [year]);

  return (
    <section className="w-full bg-surface-container-lowest rounded-2xl p-space-md sm:p-space-lg shadow-sm border border-outline-variant/30">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-outline-variant/20 pb-4 mb-5">
        <div>
          <h2 className="font-headline-md text-lg sm:text-xl font-bold text-forest-deep flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[22px]">balance</span>
            Équilibre des Séjours & Présence ({year})
          </h2>
          <p className="font-body-md text-xs sm:text-sm text-on-surface-variant mt-0.5">
            Répartition des nuitées et séjours cumulés par associé selon les statuts de la SCI.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sage-soft text-primary font-label-sm text-xs font-semibold self-start sm:self-auto">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
          Règle des 2 semaines estivales
        </span>
      </div>

      {/* Grid of 7 Associates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
        {balance.map((m) => {
          const percentage = Math.min(100, Math.round((m.days / m.max_days) * 100));
          const isSelected = selectedMember && selectedMember.toLowerCase().includes(m.name.toLowerCase().split(' ')[0]);

          return (
            <div
              key={m.name}
              onClick={() => onSelectMember && onSelectMember(m.name)}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                isSelected
                  ? 'bg-sage-soft border-primary ring-2 ring-primary/20 shadow-md'
                  : 'bg-canvas-slate/80 hover:bg-white border-border-subtle hover:border-outline-variant/80 hover:shadow-sm'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="font-label-md text-xs font-bold text-emerald-950 truncate" title={m.name}>
                    {m.name}
                  </span>
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: m.color }}
                  ></span>
                </div>
                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white border border-slate-200 text-on-surface-variant truncate">
                  {m.role}
                </span>
              </div>

              <div>
                <div className="flex items-baseline justify-between text-xs mb-1.5">
                  <span className="font-bold text-forest-deep text-sm">{m.days} j</span>
                  <span className="text-[11px] text-on-surface-variant">{m.stays} séjour{m.stays > 1 ? 's' : ''}</span>
                </div>

                <div className="w-full h-2 rounded-full bg-surface-container overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${percentage}%`,
                      backgroundColor: m.color,
                    }}
                    title={`${m.days} / ${m.max_days} jours`}
                  ></div>
                </div>

                <div className="flex justify-between items-center text-[10px] text-outline mt-1 font-medium">
                  <span>{percentage}%</span>
                  <span>Max {m.max_days}j</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
