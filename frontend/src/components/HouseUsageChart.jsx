import React, { useState } from 'react';
import { BarChart2, TrendingUp } from 'lucide-react';

const MONTH_LABELS = [
  'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin',
  'Jui', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'
];

const FULL_MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

export default function HouseUsageChart({ reservations = [] }) {
  const [activeMonthIndex, setActiveMonthIndex] = useState(null);

  // Compute 12 months occupancy strictly from real reservations
  const monthData = Array.from({ length: 12 }, (_, monthIndex) => {
    const monthRes = (reservations || []).filter((r) => {
      if (!r.start_date) return false;
      const start = new Date(r.start_date);
      const end = r.end_date ? new Date(r.end_date) : start;
      const startMonth = start.getMonth();
      const endMonth = end.getMonth();
      return monthIndex >= startMonth && monthIndex <= endMonth;
    });

    let totalRoomsUsed = 0;
    monthRes.forEach((r) => {
      const rooms = Number(r.rooms_count) || (r.property_id === 2 ? 5 : 2);
      totalRoomsUsed = Math.max(totalRoomsUsed, rooms);
    });

    const occupiedRooms = Math.min(7, totalRoomsUsed);
    const occupancyRate = Math.round((occupiedRooms / 7) * 100);
    const note = monthRes.length > 0
      ? `${monthRes.length} séjour${monthRes.length > 1 ? 's' : ''} (${occupiedRooms} ch. occupée${occupiedRooms > 1 ? 's' : ''})`
      : 'Aucun séjour programmé';

    return {
      monthIndex,
      occupiedRooms,
      occupancyRate,
      note,
    };
  });

  const totalOccupiedAcrossYear = monthData.reduce((acc, m) => acc + m.occupiedRooms, 0);
  const avgOccupancy = Math.round(totalOccupiedAcrossYear / 12);
  const avgPct = Math.round((avgOccupancy / 7) * 100);

  // SVG Chart dimensions
  const svgWidth = 720;
  const svgHeight = 260;
  const paddingLeft = 45;
  const paddingRight = 20;
  const paddingTop = 30;
  const paddingBottom = 40;
  const chartWidth = svgWidth - paddingLeft - paddingRight;
  const chartHeight = svgHeight - paddingTop - paddingBottom;

  const maxRooms = 7;
  const barGap = 16;
  const barWidth = (chartWidth - barGap * 12) / 12;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl p-6 sm:p-7 shadow-sm text-slate-900 dark:text-slate-100">
      
      {/* Chart Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center space-x-2 text-xs font-extrabold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-1">
            <BarChart2 className="h-4 w-4" />
            <span>Taux d'Occupation Prévisionnel</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            Occupation du Domaine sur 12 Mois
          </h2>
        </div>

        {/* Stats Summary Badge */}
        <div className="flex items-center space-x-3 bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 rounded-2xl px-4 py-2.5">
          <div className="p-2 rounded-xl bg-indigo-600 text-white">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div>
            <span className="text-[10px] font-extrabold text-indigo-700 dark:text-indigo-300 uppercase block">Moyenne Annuelle</span>
            <span className="text-sm font-black text-indigo-900 dark:text-indigo-100">
              {avgOccupancy} / 7 chambres <span className="text-xs font-bold text-indigo-600">({avgPct}%)</span>
            </span>
          </div>
        </div>
      </div>

      {/* Responsive SVG Container */}
      <div className="relative w-full overflow-x-auto">
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-auto max-h-[300px] overflow-visible">
          
          {/* Horizontal Gridlines & Y-Axis Labels (0 to 7) */}
          {[0, 2, 4, 6, 7].map((roomVal) => {
            const y = paddingTop + chartHeight - (roomVal / maxRooms) * chartHeight;
            return (
              <g key={roomVal}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={svgWidth - paddingRight}
                  y2={y}
                  stroke="currentColor"
                  className="text-slate-200 dark:text-slate-800"
                  strokeDasharray={roomVal === 0 ? "none" : "3 3"}
                  strokeWidth={roomVal === 0 ? "1.5" : "1"}
                />
                <text
                  x={paddingLeft - 10}
                  y={y + 4}
                  textAnchor="end"
                  className="text-[10px] font-bold fill-slate-400 dark:fill-slate-500"
                >
                  {roomVal} {roomVal === 7 ? 'ch.' : ''}
                </text>
              </g>
            );
          })}

          {/* Bars for Each Month */}
          {monthData.map((item, idx) => {
            const x = paddingLeft + idx * (barWidth + barGap) + barGap / 2;
            const barH = (item.occupiedRooms / maxRooms) * chartHeight;
            const y = paddingTop + chartHeight - barH;
            const isActive = activeMonthIndex === idx;
            const isPeak = item.occupiedRooms >= 6;

            return (
              <g
                key={idx}
                className="cursor-pointer group"
                onMouseEnter={() => setActiveMonthIndex(idx)}
                onMouseLeave={() => setActiveMonthIndex(null)}
              >
                {/* Bar Shadow / Glow on Hover */}
                {isActive && (
                  <rect
                    x={x - 3}
                    y={y - 3}
                    width={barWidth + 6}
                    height={barH + 6}
                    rx={10}
                    className="fill-indigo-500/20"
                  />
                )}

                {/* SVG Bar */}
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barH}
                  rx={8}
                  className={`transition-all duration-200 ${
                    isPeak
                      ? 'fill-gradient-to-t fill-emerald-500 hover:fill-emerald-400'
                      : isActive
                      ? 'fill-indigo-600'
                      : 'fill-indigo-500/80 hover:fill-indigo-600'
                  }`}
                />

                {/* Occupancy count label on top of bar */}
                <text
                  x={x + barWidth / 2}
                  y={y - 8}
                  textAnchor="middle"
                  className={`text-[10px] font-extrabold ${
                    isActive ? 'fill-indigo-600 dark:fill-indigo-400 font-black' : 'fill-slate-500 dark:fill-slate-400'
                  }`}
                >
                  {item.occupiedRooms}
                </text>

                {/* X-Axis Month Label */}
                <text
                  x={x + barWidth / 2}
                  y={svgHeight - 12}
                  textAnchor="middle"
                  className={`text-[11px] font-extrabold ${
                    isActive
                      ? 'fill-indigo-700 dark:fill-indigo-300'
                      : 'fill-slate-600 dark:fill-slate-400'
                  }`}
                >
                  {MONTH_LABELS[idx]}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Active Hover Detail Info Card */}
      <div className="mt-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-xs">
        {activeMonthIndex !== null ? (
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
              {MONTH_LABELS[activeMonthIndex]}
            </div>
            <div>
              <span className="font-extrabold text-slate-900 dark:text-white text-sm">
                {FULL_MONTH_NAMES[activeMonthIndex]} : {monthData[activeMonthIndex].occupiedRooms} / 7 chambres occupées
              </span>
              <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                {monthData[activeMonthIndex].note} • Taux d'occupation : <strong className="text-indigo-600 dark:text-indigo-400">{monthData[activeMonthIndex].occupancyRate}%</strong>
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center space-x-2 text-slate-500 dark:text-slate-400">
            <Info className="h-4 w-4 text-indigo-500 shrink-0" />
            <span>Survolez une barre mensuelle pour consulter les détails d'occupation des 7 chambres du domaine.</span>
          </div>
        )}
      </div>

    </div>
  );
}
