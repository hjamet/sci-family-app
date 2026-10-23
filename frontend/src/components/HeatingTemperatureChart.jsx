import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fetchHeatingTelemetryHistory, parseApiError } from '../api';

const RANGES = [
  { key: '24h', days: 1, label: '24 h' },
  { key: '7d', days: 7, label: '7 j' },
  { key: '30d', days: 30, label: '30 j' },
];

const SVG_WIDTH = 760;
const SVG_HEIGHT = 260;
const PAD = { left: 44, right: 16, top: 16, bottom: 34 };
const PLOT_W = SVG_WIDTH - PAD.left - PAD.right;
const PLOT_H = SVG_HEIGHT - PAD.top - PAD.bottom;
const BURNER_STRIP_H = 6;

const fmtTemp = (v) => (v != null ? `${v.toFixed(1)}°C` : '--');
const fmtTime = (ms, withDay) => new Date(ms).toLocaleString('fr-FR', withDay
  ? { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }
  : { hour: '2-digit', minute: '2-digit' });

// Spline cubique monotone (Fritsch–Carlson) : lisse sans dépasser les mesures réelles.
function monotonePath(pts) {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;
  const n = pts.length;
  const dx = [], slope = [];
  for (let i = 0; i < n - 1; i += 1) {
    dx.push(pts[i + 1].x - pts[i].x);
    slope.push(dx[i] === 0 ? 0 : (pts[i + 1].y - pts[i].y) / dx[i]);
  }
  const tangent = [slope[0]];
  for (let i = 1; i < n - 1; i += 1) {
    tangent.push(slope[i - 1] * slope[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / slope[i - 1] + (dx[i] + 2 * dx[i - 1]) / slope[i]));
  }
  tangent.push(slope[n - 2]);
  let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i += 1) {
    const h = dx[i] / 3;
    d += ` C ${(pts[i].x + h).toFixed(1)},${(pts[i].y + h * tangent[i]).toFixed(1)} ${(pts[i + 1].x - h).toFixed(1)},${(pts[i + 1].y - h * tangent[i + 1]).toFixed(1)} ${pts[i + 1].x.toFixed(1)},${pts[i + 1].y.toFixed(1)}`;
  }
  return d;
}

// Découpe une série en segments continus (une mesure absente interrompt la courbe au lieu de l'inventer).
function seriesPaths(points, key, xOf, yOf) {
  const segments = [];
  let current = [];
  points.forEach((p) => {
    if (p[key] == null) {
      if (current.length) segments.push(current);
      current = [];
      return;
    }
    current.push({ x: xOf(p.t), y: yOf(p[key]) });
  });
  if (current.length) segments.push(current);
  return segments.map(monotonePath);
}

// Plages [début, fin[ où `flag` est vrai, chaque point valant jusqu'au relevé suivant.
function activeRanges(points, flag) {
  const ranges = [];
  points.forEach((p, i) => {
    if (!p[flag]) return;
    const end = i + 1 < points.length ? points[i + 1].t : p.t;
    const last = ranges[ranges.length - 1];
    if (last && last.end === p.t) last.end = end;
    else ranges.push({ start: p.t, end });
  });
  return ranges;
}

function niceStep(span) {
  return [1, 2, 5, 10].find((s) => span / s <= 6) || 10;
}

export default function HeatingTemperatureChart() {
  const [rangeKey, setRangeKey] = useState('7d');
  const [points, setPoints] = useState(null);
  const [error, setError] = useState(null);
  const [hoverIdx, setHoverIdx] = useState(null);
  const svgRef = useRef(null);
  const days = RANGES.find((r) => r.key === rangeKey).days;

  useEffect(() => {
    let alive = true;
    setPoints(null);
    setError(null);
    fetchHeatingTelemetryHistory(days)
      .then((res) => {
        if (!alive) return;
        setPoints(res.points.map((p) => ({ ...p, t: new Date(p.recorded_at).getTime() })));
      })
      .catch((err) => alive && setError(parseApiError(err)));
    return () => { alive = false; };
  }, [days]);

  const geometry = useMemo(() => {
    if (!points || points.length === 0) return null;
    const tMin = points[0].t;
    const tMax = points[points.length - 1].t;
    const temps = points.flatMap((p) => [p.room_temperature, p.outside_temperature]).filter((v) => v != null);
    if (temps.length === 0) return null;
    const rawMin = Math.min(...temps);
    const rawMax = Math.max(...temps);
    const step = niceStep(rawMax - rawMin + 2);
    const yMin = Math.floor((rawMin - 1) / step) * step;
    const yMax = Math.ceil((rawMax + 1) / step) * step;
    const xOf = (t) => PAD.left + (tMax === tMin ? PLOT_W / 2 : ((t - tMin) / (tMax - tMin)) * PLOT_W);
    const yOf = (v) => PAD.top + PLOT_H * (1 - (v - yMin) / (yMax - yMin));
    const yTicks = [];
    for (let v = yMin; v <= yMax; v += step) yTicks.push(v);
    const multiDay = new Date(tMin).toDateString() !== new Date(tMax).toDateString();
    const xTicks = Array.from({ length: 5 }, (_, i) => tMin + ((tMax - tMin) * i) / 4);
    const ignitions = points.filter((p, i) => p.is_heating_active && (i === 0 ? false : !points[i - 1].is_heating_active));
    return {
      xOf, yOf, yTicks, xTicks, multiDay, ignitions,
      roomPaths: seriesPaths(points, 'room_temperature', xOf, yOf),
      outsidePaths: seriesPaths(points, 'outside_temperature', xOf, yOf),
      heatingRanges: activeRanges(points, 'is_heating_active'),
      burnerRanges: activeRanges(points, 'burner_active'),
    };
  }, [points]);

  const handleMove = (e) => {
    if (!geometry || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * SVG_WIDTH;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(geometry.xOf(p.t) - x) < Math.abs(geometry.xOf(points[best].t) - x)) best = i;
    });
    setHoverIdx(best);
  };

  const hovered = hoverIdx != null && points ? points[hoverIdx] : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <svg width="20" height="6" aria-hidden="true"><line x1="0" y1="3" x2="20" y2="3" className="stroke-amber-600" strokeWidth="2" strokeLinecap="round" /></svg>
            Température maison
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="20" height="6" aria-hidden="true"><line x1="0" y1="3" x2="20" y2="3" className="stroke-blue-600 dark:stroke-blue-500" strokeWidth="2" strokeLinecap="round" strokeDasharray="5,3" /></svg>
            Température extérieure
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 h-3 rounded-sm bg-rose-500/15 border border-rose-300/60" aria-hidden="true" />
            Chauffage en marche
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 h-1.5 rounded-sm bg-rose-500/70" aria-hidden="true" />
            Brûleur allumé
          </span>
        </div>
        <div className="inline-flex p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => { setRangeKey(r.key); setHoverIdx(null); }}
              className={`px-2.5 py-1 rounded-md cursor-pointer transition-all ${rangeKey === r.key ? 'bg-white dark:bg-slate-900 text-forest-deep dark:text-emerald-300 shadow-xs' : 'text-slate-600 dark:text-slate-400'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative w-full min-h-[200px] bg-slate-50/70 dark:bg-slate-900/60 rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-rose-700 p-4 text-center">
            Historique des températures indisponible : {error}
          </div>
        )}
        {!error && points === null && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-on-surface-variant">
            <span className="material-symbols-outlined animate-spin text-[18px] text-amber-600">progress_activity</span>
            Chargement de l'historique des températures...
          </div>
        )}
        {!error && points !== null && !geometry && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500 italic">
            Aucun relevé de température enregistré sur cette période.
          </div>
        )}
        {geometry && (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
            className="w-full h-auto block"
            role="img"
            aria-label="Courbes lissées de la température de la maison et de la température extérieure, avec les plages de chauffage et de brûleur actifs"
            onMouseMove={handleMove}
            onMouseLeave={() => setHoverIdx(null)}
          >
            {geometry.heatingRanges.map((r) => (
              <rect key={`h${r.start}`} x={geometry.xOf(r.start)} y={PAD.top} width={Math.max(2, geometry.xOf(r.end) - geometry.xOf(r.start))} height={PLOT_H} className="fill-rose-500/10" />
            ))}
            {geometry.burnerRanges.map((r) => (
              <rect key={`b${r.start}`} x={geometry.xOf(r.start)} y={PAD.top + PLOT_H - BURNER_STRIP_H} width={Math.max(2, geometry.xOf(r.end) - geometry.xOf(r.start))} height={BURNER_STRIP_H} rx="2" className="fill-rose-500/70" />
            ))}

            {geometry.yTicks.map((v) => (
              <g key={v}>
                <line x1={PAD.left} x2={SVG_WIDTH - PAD.right} y1={geometry.yOf(v)} y2={geometry.yOf(v)} className="stroke-slate-200 dark:stroke-slate-700" strokeWidth="1" />
                <text x={PAD.left - 6} y={geometry.yOf(v) + 3} textAnchor="end" fontSize="10" className="fill-slate-500">{v}°</text>
              </g>
            ))}
            {geometry.xTicks.map((t, i) => (
              <text key={t} x={geometry.xOf(t)} y={SVG_HEIGHT - 12} textAnchor={i === 0 ? 'start' : i === 4 ? 'end' : 'middle'} fontSize="10" className="fill-slate-500">
                {fmtTime(t, geometry.multiDay)}
              </text>
            ))}

            {geometry.ignitions.map((p) => (
              <g key={`i${p.t}`}>
                <line x1={geometry.xOf(p.t)} x2={geometry.xOf(p.t)} y1={PAD.top} y2={PAD.top + PLOT_H} className="stroke-rose-600" strokeWidth="1.5" strokeDasharray="3,3" />
                <text x={geometry.xOf(p.t) + 4} y={PAD.top + 11} fontSize="10" fontWeight="600" className="fill-rose-700 dark:fill-rose-300">🔥 Allumage chauffage</text>
              </g>
            ))}

            {geometry.outsidePaths.map((d) => (
              <path key={`o${d}`} d={d} fill="none" className="stroke-blue-600 dark:stroke-blue-500" strokeWidth="2" strokeDasharray="5,3" strokeLinecap="round" />
            ))}
            {geometry.roomPaths.map((d) => (
              <path key={`r${d}`} d={d} fill="none" className="stroke-amber-600" strokeWidth="2.5" strokeLinecap="round" />
            ))}

            {hovered && (
              <g>
                <line x1={geometry.xOf(hovered.t)} x2={geometry.xOf(hovered.t)} y1={PAD.top} y2={PAD.top + PLOT_H} className="stroke-slate-400" strokeWidth="1" />
                {hovered.room_temperature != null && (
                  <circle cx={geometry.xOf(hovered.t)} cy={geometry.yOf(hovered.room_temperature)} r="4.5" className="fill-amber-600 stroke-white dark:stroke-slate-900" strokeWidth="2" />
                )}
                {hovered.outside_temperature != null && (
                  <circle cx={geometry.xOf(hovered.t)} cy={geometry.yOf(hovered.outside_temperature)} r="4.5" className="fill-blue-600 dark:fill-blue-500 stroke-white dark:stroke-slate-900" strokeWidth="2" />
                )}
              </g>
            )}
          </svg>
        )}

        {geometry && hovered && (
          <div
            className="absolute top-2 pointer-events-none px-2.5 py-2 rounded-lg bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 shadow-sm text-[11px] leading-snug text-slate-700 dark:text-slate-200 min-w-[170px]"
            style={geometry.xOf(hovered.t) > SVG_WIDTH / 2
              ? { right: `${((SVG_WIDTH - geometry.xOf(hovered.t)) / SVG_WIDTH) * 100 + 2}%` }
              : { left: `${(geometry.xOf(hovered.t) / SVG_WIDTH) * 100 + 2}%` }}
          >
            <div className="font-bold text-slate-900 dark:text-slate-100 mb-1">{fmtTime(hovered.t, true)}</div>
            <div>Maison : <strong>{fmtTemp(hovered.room_temperature)}</strong></div>
            <div>Extérieur : <strong>{fmtTemp(hovered.outside_temperature)}</strong></div>
            <div>Chaudière : <strong>{fmtTemp(hovered.boiler_temperature)}</strong></div>
            <div>Consigne : <strong>{fmtTemp(hovered.target_temperature)}</strong></div>
            <div>Chauffage : <strong>{hovered.is_heating_active ? 'en marche' : 'arrêté'}</strong> • Brûleur : <strong>{hovered.burner_active ? 'allumé' : 'éteint'}</strong></div>
          </div>
        )}
      </div>

      {points && points.length > 0 && (
        <details className="text-[11px] text-slate-600 dark:text-slate-400">
          <summary className="cursor-pointer select-none">Voir les {points.length} relevés en tableau</summary>
          <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full text-left tabular-nums">
              <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0">
                <tr>
                  <th className="px-2 py-1">Heure</th><th className="px-2 py-1">Maison</th><th className="px-2 py-1">Extérieur</th>
                  <th className="px-2 py-1">Chaudière</th><th className="px-2 py-1">Chauffage</th><th className="px-2 py-1">Brûleur</th>
                </tr>
              </thead>
              <tbody>
                {points.map((p) => (
                  <tr key={p.t} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-2 py-1">{fmtTime(p.t, true)}</td>
                    <td className="px-2 py-1">{fmtTemp(p.room_temperature)}</td>
                    <td className="px-2 py-1">{fmtTemp(p.outside_temperature)}</td>
                    <td className="px-2 py-1">{fmtTemp(p.boiler_temperature)}</td>
                    <td className="px-2 py-1">{p.is_heating_active ? 'marche' : 'arrêt'}</td>
                    <td className="px-2 py-1">{p.burner_active ? 'allumé' : 'éteint'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
