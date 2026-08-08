import React from 'react';
import { Scale, Users, Calendar, Info } from 'lucide-react';

const MEMBERS = [
  { prenom: 'Henri', role: 'Coordinateur', color: 'bg-cyan-500' },
  { prenom: 'Hortense', role: 'Associé', color: 'bg-rose-500' },
  { prenom: 'Marguerite', role: 'Associé', color: 'bg-purple-500' },
  { prenom: 'Eugénie', role: 'Associé', color: 'bg-amber-500' },
  { prenom: 'Joséphine', role: 'Associé', color: 'bg-emerald-500' },
  { prenom: 'Élisabeth', role: 'Associé', color: 'bg-teal-500' },
  { prenom: 'Frédéric', role: 'Associé', color: 'bg-blue-500' },
];

export default function StayBalanceWidget({ reservations = [] }) {
  // Calculate total days booked per member in 2026
  const memberDays = {};
  MEMBERS.forEach(m => {
    memberDays[m.prenom] = 0;
  });

  reservations.forEach(r => {
    if (r.status === 'Confirmée' || r.status === 'Demande en attente') {
      const d1 = new Date(r.start_date);
      const d2 = new Date(r.end_date);
      if (!isNaN(d1) && !isNaN(d2)) {
        const diffTime = Math.abs(d2 - d1);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        const name = r.user_name;
        if (memberDays[name] !== undefined) {
          memberDays[name] += diffDays;
        } else {
          memberDays[name] = diffDays;
        }
      }
    }
  });

  const maxDays = Math.max(...Object.values(memberDays), 14);

  return (
    <section className="mb-10">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
        
        {/* Widget Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center space-x-2">
              <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                <Scale className="h-5 w-5" />
              </div>
              <h3 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                Équilibrage des Séjours (Compteur Annuel)
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Visualisation du nombre total de jours réservés par associé pour maintenir une occupation équitable de la maison d'Hellenvilliers.
            </p>
          </div>

          <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 self-start sm:self-auto">
            <Users className="h-4 w-4 text-indigo-500" />
            <span>7 Associés Égaux</span>
          </div>
        </div>

        {/* Member Days Grid Bars */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-4">
          {MEMBERS.map(m => {
            const days = memberDays[m.prenom] || 0;
            const pct = Math.min(Math.round((days / maxDays) * 100), 100);

            return (
              <div
                key={m.prenom}
                className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-extrabold text-slate-900 dark:text-white">{m.prenom}</span>
                    <span className={`w-2.5 h-2.5 rounded-full ${m.color}`}></span>
                  </div>
                  <div className="text-2xl font-black text-slate-900 dark:text-white">
                    {days} <span className="text-xs font-semibold text-slate-400">jours</span>
                  </div>
                </div>

                <div className="mt-3 space-y-1">
                  <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div
                      className={`h-full ${m.color} transition-all duration-500`}
                      style={{ width: `${Math.max(pct, 5)}%` }}
                    ></div>
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium block text-right">
                    {days === 0 ? 'Aucun séjour' : `${days}j planifiés`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
