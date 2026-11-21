import React, { useState, useEffect, useMemo, useRef } from 'react';
import { FuelInteractiveGraph } from '../pages/VademecumPage';
import WhatsAppPollView from './common/WhatsAppPollView';
import DocumentViewerModal from './DocumentViewerModal';
import { addTaskComment, addProjectComment, fetchTaskComments, fetchProjectComments } from '../api';
import {
  URGENCY_LEVELS,
  DIFFICULTY_LEVELS,
  getUrgencyMeta,
  getDifficultyMeta,
  isTaskOnsite,
  isTaskInOnsitePool,
} from '../utils/taskTaxonomy';

// ============================================================================
// 1. RENDU MARKDOWN PROPRE & LÉGER (Annotation 6)
// ============================================================================
function renderInlineMarkdown(text) {
  if (!text) return null;
  const tokenRegex = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\[[^\]]+\]\([^)]+\))/g;
  const parts = String(text).split(tokenRegex);
  return parts.map((part, i) => {
    if (!part) return null;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={i} className="font-semibold text-slate-900 dark:text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={i} className="italic">{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-800 text-forest-deep dark:text-emerald-300 font-mono text-[12.5px]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const [, label, href] = linkMatch;
      return (
        <a
          key={i}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary dark:text-emerald-400 font-semibold underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
        >
          {label}
        </a>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

export function ToasterMarkdown({ content, isUser = false }) {
  if (!content) return null;
  if (isUser) {
    return <div className="whitespace-pre-wrap">{content}</div>;
  }

  const lines = String(content).replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let paragraphLines = [];
  let listItems = [];

  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      blocks.push({ type: 'p', text: paragraphLines.join(' ') });
      paragraphLines = [];
    }
  };
  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push({ type: 'ul', items: [...listItems] });
      listItems = [];
    }
  };

  lines.forEach((rawLine) => {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      return;
    }
    if (/^#{1,3}\s+/.test(trimmed)) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'h', text: trimmed.replace(/^#{1,3}\s+/, '') });
      return;
    }
    if (/^([-*•]|\d+\.)\s+/.test(trimmed)) {
      flushParagraph();
      listItems.push(trimmed.replace(/^([-*•]|\d+\.)\s+/, ''));
      return;
    }
    if (trimmed.startsWith('> ')) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'quote', text: trimmed.slice(2) });
      return;
    }
    flushList();
    paragraphLines.push(trimmed);
  });
  flushParagraph();
  flushList();

  return (
    <div className="space-y-2.5 text-[14px] leading-relaxed text-slate-800 dark:text-slate-100">
      {blocks.map((b, idx) => {
        if (b.type === 'h') {
          return (
            <h4 key={idx} className="font-bold text-forest-deep dark:text-emerald-200 text-sm pt-1">
              {renderInlineMarkdown(b.text)}
            </h4>
          );
        }
        if (b.type === 'quote') {
          return (
            <blockquote
              key={idx}
              className="pl-3 border-l-2 border-primary/50 text-slate-600 dark:text-slate-300 italic text-xs"
            >
              {renderInlineMarkdown(b.text)}
            </blockquote>
          );
        }
        if (b.type === 'ul') {
          return (
            <ul key={idx} className="space-y-1 pl-4 list-disc marker:text-primary">
              {b.items.map((it, i) => (
                <li key={i}>{renderInlineMarkdown(it)}</li>
              ))}
            </ul>
          );
        }
        return <p key={idx}>{renderInlineMarkdown(b.text)}</p>;
      })}
    </div>
  );
}

// ============================================================================
// 2. ACCORDÉON PLIABLE AUTOMATIQUE : RÉFLEXION & OUTILS (Annotation 5)
// ============================================================================
export function ToasterActivityAccordion({ thoughts = '', toolSteps = [], isStreaming = false }) {
  const hasThoughts = Boolean(thoughts && thoughts.trim());
  const hasTools = Array.isArray(toolSteps) && toolSteps.length > 0;

  const [isThoughtsOpen, setIsThoughtsOpen] = useState(Boolean(isStreaming));
  const [isToolsOpen, setIsToolsOpen] = useState(Boolean(isStreaming));

  // Ouverture automatique pendant le travail, repli automatique doux dès la fin !
  useEffect(() => {
    if (isStreaming) {
      if (hasThoughts) setIsThoughtsOpen(true);
      if (hasTools) setIsToolsOpen(true);
    } else {
      const timer = setTimeout(() => {
        setIsThoughtsOpen(false);
        setIsToolsOpen(false);
      }, 280);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, hasThoughts, hasTools]);

  if (!hasThoughts && !hasTools && !isStreaming) return null;

  return (
    <div className="mb-2 flex flex-col gap-1.5 w-full max-w-2xl">
      {/* Bloc Réflexion pliable */}
      {(hasThoughts || (isStreaming && !hasTools)) && (
        <div className="rounded-2xl bg-slate-50/90 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 overflow-hidden transition-all duration-300">
          <button
            type="button"
            onClick={() => setIsThoughtsOpen((o) => !o)}
            className="w-full px-3.5 py-2 flex items-center justify-between gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
          >
            <span className="inline-flex items-center gap-2">
              {isStreaming ? (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600" />
                </span>
              ) : (
                <span className="material-symbols-outlined text-[15px] text-emerald-700 dark:text-emerald-400">
                  psychology
                </span>
              )}
              <span>{isStreaming ? 'Réflexion en cours…' : 'Raisonnement'}</span>
            </span>
            <span
              className={`material-symbols-outlined text-[16px] text-slate-400 transition-transform duration-200 ${
                isThoughtsOpen ? 'rotate-180' : ''
              }`}
            >
              expand_more
            </span>
          </button>

          {isThoughtsOpen && hasThoughts && (
            <div className="px-3.5 pb-3 pt-1 border-t border-slate-200/60 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 max-h-48 overflow-y-auto leading-relaxed">
              <ToasterMarkdown content={thoughts} />
            </div>
          )}
        </div>
      )}

      {/* Bloc Appels d'outils pliable */}
      {hasTools && (
        <div className="rounded-2xl bg-slate-50/90 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 overflow-hidden transition-all duration-300">
          <button
            type="button"
            onClick={() => setIsToolsOpen((o) => !o)}
            className="w-full px-3.5 py-2 flex items-center justify-between gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
          >
            <span className="inline-flex items-center gap-2">
              <span className="material-symbols-outlined text-[15px] text-primary">
                {isStreaming ? 'sync' : 'check_circle'}
              </span>
              <span>
                {isStreaming
                  ? `Consultation des outils (${toolSteps.length})…`
                  : `${toolSteps.length} ${toolSteps.length > 1 ? 'outils consultés' : 'outil consulté'}`}
              </span>
            </span>
            <span
              className={`material-symbols-outlined text-[16px] text-slate-400 transition-transform duration-200 ${
                isToolsOpen ? 'rotate-180' : ''
              }`}
            >
              expand_more
            </span>
          </button>

          {isToolsOpen && (
            <div className="px-3 pb-2.5 pt-1 border-t border-slate-200/60 dark:border-slate-800 space-y-1">
              {toolSteps.map((step, idx) => {
                const running = step.status === 'running';
                return (
                  <div
                    key={step.id || idx}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="material-symbols-outlined text-[15px] text-primary shrink-0">
                        {step.icon || 'build'}
                      </span>
                      <span className="text-slate-700 dark:text-slate-200 truncate font-medium">
                        {step.label || step.name}
                      </span>
                    </div>
                    {running ? (
                      <span className="material-symbols-outlined text-[14px] text-amber-600 animate-spin shrink-0">
                        progress_activity
                      </span>
                    ) : (
                      <span className="material-symbols-outlined text-[15px] text-emerald-600 shrink-0">
                        check
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 3. COMPOSANTS DU SITE PARTAGÉS DANS LE CHAT (Annotation 9 & Commentaire 3)
// ============================================================================
const MONTH_NAMES_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
const DAY_SHORT_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function getMemberBadgeClass(userName = '') {
  const n = userName.toLowerCase();
  if (n.includes('henri')) return 'bg-teal-700 text-white';
  if (n.includes('frédéric') || n.includes('frederic') || n.includes('élisabeth') || n.includes('elisabeth')) return 'bg-emerald-800 text-white';
  if (n.includes('joséphine') || n.includes('josephine')) return 'bg-sky-700 text-white';
  if (n.includes('hortense')) return 'bg-amber-600 text-white';
  if (n.includes('marguerite')) return 'bg-rose-600 text-white';
  if (n.includes('eugénie') || n.includes('eugenie')) return 'bg-purple-600 text-white';
  return 'bg-slate-700 text-white';
}

function SharedStaysCalendar({ data, onOpenSandboxModal }) {
  const [month, setMonth] = useState(() => Number(data?.month) || new Date().getMonth() + 1);
  const [year, setYear] = useState(() => Number(data?.year) || 2026);
  const [buildingFilter, setBuildingFilter] = useState(() => data?.building || 'all');
  const [selectedStay, setSelectedStay] = useState(null);

  const stays = useMemo(() => {
    const raw = Array.isArray(data?.stays) ? data.stays : [];
    if (buildingFilter === 'all') return raw;
    return raw.filter((s) => (s.property_name || '').toLowerCase().includes(buildingFilter.toLowerCase()));
  }, [data?.stays, buildingFilter]);

  const gridCells = useMemo(() => {
    const first = new Date(year, month - 1, 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    let offset = first.getDay() - 1;
    if (offset < 0) offset = 6;
    const cells = [];
    for (let i = 0; i < offset; i += 1) cells.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) {
      const iso = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const active = stays.filter((s) => s.start_date <= iso && s.end_date >= iso);
      cells.push({ day: d, iso, stays: active });
    }
    return cells;
  }, [month, year, stays]);

  const prevMonth = () => {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else setMonth((m) => m + 1);
  };

  return (
    <div className="mt-2.5 w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-border-subtle shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-canvas-slate border-b border-border-subtle flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={prevMonth}
            className="w-8 h-8 rounded-full hover:bg-slate-200/70 flex items-center justify-center text-slate-700 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
          </button>
          <span className="text-sm font-bold text-forest-deep min-w-[130px] text-center">
            {MONTH_NAMES_FR[month - 1]} {year}
          </span>
          <button
            type="button"
            onClick={nextMonth}
            className="w-8 h-8 rounded-full hover:bg-slate-200/70 flex items-center justify-center text-slate-700 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex p-0.5 rounded-full bg-slate-100 border border-slate-200 text-[11px] font-semibold">
            {['all', 'Presbytère', 'Rosings'].map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBuildingFilter(b)}
                className={`px-2.5 py-1 rounded-full cursor-pointer transition-all ${
                  buildingFilter === b ? 'bg-white text-forest-deep shadow-2xs font-bold' : 'text-slate-600'
                }`}
              >
                {b === 'all' ? 'Domaine' : b}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onOpenSandboxModal?.('stay', {})}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary hover:bg-forest-deep text-white text-xs font-bold shadow-2xs transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[15px]">add</span>
            <span>Réserver</span>
          </button>
        </div>
      </div>

      <div className="p-3">
        <div className="grid grid-cols-7 gap-1 mb-1 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {DAY_SHORT_FR.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {gridCells.map((cell, idx) => {
            if (!cell) return <div key={`empty-${idx}`} className="h-14 rounded-xl bg-slate-50/40" />;
            const isToday = cell.iso === new Date().toISOString().slice(0, 10);
            return (
              <div
                key={cell.iso}
                onClick={() => {
                  if (cell.stays.length > 0) setSelectedStay(cell.stays[0]);
                  else onOpenSandboxModal?.('stay', { start_date: cell.iso, end_date: cell.iso });
                }}
                className={`h-14 sm:h-16 p-1 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                  isToday
                    ? 'border-primary bg-emerald-50/40'
                    : cell.stays.length > 0
                    ? 'border-emerald-200 bg-emerald-50/20 hover:border-primary'
                    : 'border-slate-100 hover:border-slate-300 bg-white'
                }`}
              >
                <span className={`text-[11px] font-semibold ${isToday ? 'text-primary font-bold' : 'text-slate-600'}`}>
                  {cell.day}
                </span>
                <div className="space-y-0.5 overflow-hidden">
                  {cell.stays.slice(0, 2).map((s) => {
                    const firstName = String(s.user_name || '').split(' ')[0];
                    return (
                      <div
                        key={s.id}
                        className={`px-1.5 py-0.2 rounded text-[9.5px] font-semibold truncate ${getMemberBadgeClass(s.user_name)}`}
                        title={`${s.user_name} • ${s.property_name} (${s.start_date} → ${s.end_date})`}
                      >
                        {firstName}
                      </div>
                    );
                  })}
                  {cell.stays.length > 2 && (
                    <div className="text-[9px] text-slate-500 font-bold pl-1">+{cell.stays.length - 2}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {selectedStay && (
          <div className="mt-3 p-3 rounded-xl bg-canvas-slate border border-border-subtle flex items-center justify-between gap-2 text-xs">
            <div>
              <div className="font-bold text-forest-deep">
                {selectedStay.user_name} • {selectedStay.property_name}
              </div>
              <div className="text-slate-600 mt-0.5">
                Du {selectedStay.start_date} ({selectedStay.arrival_time}) au {selectedStay.end_date} ({selectedStay.departure_time}) • {selectedStay.guest_count} pers. ({selectedStay.chambers_used} ch.)
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedStay(null)}
              className="text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SharedFuelGraph({ data }) {
  const [fuelHistory, setFuelHistory] = useState(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/heating/fuel-history')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (alive && res) setFuelHistory(res);
      });
    return () => {
      alive = false;
    };
  }, []);

  const hs = data?.heating_status || {};

  return (
    <div className="mt-2.5 w-full max-w-2xl">
      {hs.is_cached_last_known && (
        <div className="mb-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] text-amber-600 shrink-0">wifi_off</span>
          <span>
            Passerelle Vitoconnect du Presbytère hors ligne depuis le 13/11 à 08h12 (dernier relevé : {hs.room_temperature ?? '—'} °C int. / ~{hs.fuel_liters_remaining ?? '—'} L).
          </span>
        </div>
      )}
      <FuelInteractiveGraph
        fuelHistory={fuelHistory}
        heatingStatus={hs}
        initialTab={data?.initial_tab || 'annual'}
        hideDeliveryButton={true}
      />
    </div>
  );
}

function SharedPoolWidget({ data }) {
  const p = data?.pool || {};
  const hasLiveError = Boolean(p.live_error);
  const wifiDown = p.wifi_box_ok === false || hasLiveError;
  const radioDown =
    !wifiDown &&
    (p.radio_error === true ||
      p.radio_link_ok === false ||
      String(p.klereo_alert_code || '').toLowerCase() === 'radiopb');

  const statusBadge = wifiDown
    ? { label: 'Boîtier Wi-Fi hors ligne', cls: 'bg-rose-50 text-rose-800 border-rose-200', icon: 'wifi_off' }
    : radioDown
    ? { label: 'Liaison radio piscine coupée', cls: 'bg-amber-50 text-amber-900 border-amber-300', icon: 'signal_wifi_off' }
    : { label: 'En ligne', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200', icon: 'check_circle' };

  const alertMessages = [];
  if (p.live_error) alertMessages.push(p.live_error);
  if (p.radio_alert) alertMessages.push(p.radio_alert);
  if (Array.isArray(p.alerts)) {
    p.alerts.forEach((a) => {
      if (a && !alertMessages.includes(a)) alertMessages.push(a);
    });
  }

  const probeFallback = radioDown ? 'Radio coupée' : wifiDown ? 'Hors ligne' : '—';

  return (
    <div className="mt-2.5 w-full max-w-2xl rounded-2xl bg-white border border-border-subtle p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-full bg-sky-50 text-sky-700 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[19px]">pool</span>
          </span>
          <div>
            <h4 className="text-sm font-bold text-forest-deep">Piscine Klereo Connect (Rosings)</h4>
            <p className="text-[11px] text-slate-500">
              {p.filtration_state || `Filtration : ${p.filtration_mode || 'auto'}`}
              {p.last_sync_label ? ` • Synchro : ${p.last_sync_label}` : ''}
            </p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-bold ${statusBadge.cls}`}>
          <span className="material-symbols-outlined text-[14px]">{statusBadge.icon}</span>
          <span>{statusBadge.label}</span>
        </span>
      </div>

      {alertMessages.length > 0 && (
        <div className={`p-3 rounded-xl border text-xs space-y-1 ${wifiDown ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-amber-50 border-amber-300 text-amber-950'}`}>
          {alertMessages.map((msg, i) => (
            <div key={i} className="flex items-start gap-1.5 font-medium">
              <span className="material-symbols-outlined text-[15px] shrink-0 mt-0.5">warning</span>
              <span>{msg}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        <div className="p-2.5 rounded-xl bg-canvas-slate border border-border-subtle flex items-center justify-between gap-2">
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-500 block">Filtration</span>
            <span className="font-bold text-slate-800">{p.filtration_state || p.filtration_mode || 'Auto'}</span>
            {p.filtration_cycle && <span className="block text-[10.5px] text-slate-500">{p.filtration_cycle}</span>}
          </div>
          <span className="material-symbols-outlined text-sky-600 text-[20px]">water_pump</span>
        </div>
        <div className="p-2.5 rounded-xl bg-canvas-slate border border-border-subtle flex items-center justify-between gap-2">
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-500 block">Pompe à chaleur</span>
            <span className="font-bold text-slate-800">
              {p.pac_status_label || (p.mode === 'confort' ? 'Chauffage confort' : 'Hors-gel / Éco')}
            </span>
            <span className="block text-[10.5px] text-slate-500">
              {p.pac_status_subtext || `Consigne : ${p.target_temperature ?? 0.5} °C`}
            </span>
          </div>
          <span className="material-symbols-outlined text-amber-600 text-[20px]">heat_pump</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
        <div className="p-2.5 rounded-xl bg-sky-50/60 border border-sky-100">
          <span className="text-[10px] text-sky-700 font-bold uppercase block">Eau</span>
          <span className="text-base font-bold text-slate-900">
            {p.water_temperature != null ? `${Number(p.water_temperature).toFixed(1)} °C` : '—'}
          </span>
          {p.water_temperature == null && <span className="block text-[10px] text-amber-700">{probeFallback}</span>}
        </div>
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70">
          <span className="text-[10px] text-slate-500 font-bold uppercase block">Air ext.</span>
          <span className="text-base font-bold text-slate-900">
            {p.air_temperature != null ? `${Number(p.air_temperature).toFixed(1)} °C` : '—'}
          </span>
          {p.air_temperature == null && <span className="block text-[10px] text-amber-700">{probeFallback}</span>}
        </div>
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70">
          <span className="text-[10px] text-slate-500 font-bold uppercase block">pH</span>
          <span className="text-base font-bold text-slate-900">
            {p.ph_value != null ? Number(p.ph_value).toFixed(2) : '—'}
          </span>
          {p.ph_value == null && <span className="block text-[10px] text-amber-700">{probeFallback}</span>}
        </div>
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70">
          <span className="text-[10px] text-slate-500 font-bold uppercase block">Redox</span>
          <span className="text-base font-bold text-slate-900">
            {p.redox_value != null ? `${Math.round(p.redox_value)} mV` : '—'}
          </span>
          {p.redox_value == null && <span className="block text-[10px] text-amber-700">{probeFallback}</span>}
        </div>
      </div>
    </div>
  );
}

function SharedLeaderboardWidget({ data }) {
  const members = Array.isArray(data?.members) ? data.members : [];
  const maxTasks = Math.max(1, ...members.map((m) => Number(m.score_taches || 0)));
  const maxUsage = Math.max(1, ...members.map((m) => Number(m.score_usage || 0)));
  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="mt-2.5 w-full max-w-2xl rounded-2xl bg-white border border-border-subtle p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-border-subtle flex-wrap">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center">
            <span className="material-symbols-outlined text-[18px]">leaderboard</span>
          </span>
          <div>
            <h4 className="text-sm font-bold text-forest-deep">Classement &amp; Équité Participative</h4>
            <p className="text-[11px] text-slate-500">
              {data?.period_label || 'Toute la période'} • Tâches réalisées + créations validées vs jours de séjour
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {members.map((m, idx) => {
          const taskPct = Math.min(100, Math.round((Number(m.score_taches || 0) / maxTasks) * 100));
          const usagePct = Math.min(100, Math.round((Number(m.score_usage || 0) / maxUsage) * 100));
          return (
            <div
              key={m.member_id || m.prenom || idx}
              className="p-2.5 rounded-xl bg-canvas-slate border border-border-subtle space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-6 text-center text-sm font-black text-slate-600 shrink-0">
                    {idx < 3 ? medals[idx] : `#${m.rank || idx + 1}`}
                  </span>
                  <span className="text-xs font-bold text-forest-deep truncate">{m.name || m.prenom}</span>
                  {m.is_exempt && (
                    <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold">
                      Exempté corvées
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 text-xs">
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono font-bold">
                    Ratio {Number(m.ratio || 0).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div className="space-y-0.5">
                  <div className="flex justify-between text-slate-600">
                    <span>Tâches ({m.completed_tasks_count ?? 0} finies + {m.created_bonus_count ?? 0} créées)</span>
                    <span className="font-bold text-emerald-800">{m.score_taches ?? 0}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-600" style={{ width: `${taskPct}%` }} />
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="flex justify-between text-slate-600">
                    <span>Occupation ({m.stays_count ?? 0} séjour{(m.stays_count ?? 0) > 1 ? 's' : ''})</span>
                    <span className="font-bold text-indigo-800">{m.score_usage ?? 0} j</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                    <div className="h-full rounded-full bg-indigo-500" style={{ width: `${usagePct}%` }} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SharedCustomChartWidget({ data }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const title = data?.title || 'Graphique personnalisé';
  const subtitle = data?.subtitle || '';
  const chartType = String(data?.chart_type || 'bar').toLowerCase();
  const unit = data?.unit ? ` ${data.unit}` : '';
  const labels = Array.isArray(data?.labels) ? data.labels : [];
  const series = Array.isArray(data?.series) ? data.series : [];

  const fmtVal = (v) =>
    `${Number(v || 0).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}${unit}`;

  if (labels.length === 0 || series.length === 0) return null;

  const allValues = series.flatMap((s) => (s.values || []).map((v) => Number(v || 0)));
  const maxVal = Math.max(1, ...allValues);
  const minVal = Math.min(0, ...allValues);
  const span = Math.max(1, maxVal - minVal);

  const renderChartBody = () => {
    if (chartType === 'horizontal_bar') {
      const s0 = series[0];
      return (
        <div className="space-y-2.5 pt-1">
          {labels.map((lbl, idx) => {
            const val = Number(s0.values?.[idx] || 0);
            const pct = Math.max(2, Math.min(100, Math.round((Math.abs(val) / maxVal) * 100)));
            return (
              <div key={idx} className="space-y-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-700 truncate">{lbl}</span>
                  <span className="font-mono font-bold text-forest-deep shrink-0">{fmtVal(val)}</span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${pct}%`, backgroundColor: s0.color || '#059669' }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    if (chartType === 'pie' || chartType === 'donut') {
      const s0 = series[0];
      const palette = ['#059669', '#0284c7', '#d97706', '#7c3aed', '#e11d48', '#0d9488', '#4f46e5'];
      const vals = labels.map((_, i) => Math.max(0, Number(s0.values?.[i] || 0)));
      const total = vals.reduce((acc, v) => acc + v, 0) || 1;
      let startAngle = -Math.PI / 2;
      const cx = 90;
      const cy = 90;
      const r = 74;
      const innerR = chartType === 'donut' ? 42 : 0;

      const slices = vals.map((v, i) => {
        const angle = (v / total) * Math.PI * 2;
        const endAngle = startAngle + angle;
        const largeArc = angle > Math.PI ? 1 : 0;
        const x1 = cx + r * Math.cos(startAngle);
        const y1 = cy + r * Math.sin(startAngle);
        const x2 = cx + r * Math.cos(endAngle);
        const y2 = cy + r * Math.sin(endAngle);
        let d;
        if (innerR > 0) {
          const ix1 = cx + innerR * Math.cos(endAngle);
          const iy1 = cy + innerR * Math.sin(endAngle);
          const ix2 = cx + innerR * Math.cos(startAngle);
          const iy2 = cy + innerR * Math.sin(startAngle);
          d = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2} Z`;
        } else {
          d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
        }
        startAngle = endAngle;
        return { d, color: palette[i % palette.length], label: labels[i], value: v, pct: Math.round((v / total) * 100) };
      });

      return (
        <div className="flex flex-col sm:flex-row items-center gap-4 pt-1">
          <svg viewBox="0 0 180 180" className="w-40 h-40 shrink-0">
            {slices.map((sl, i) => (
              <path
                key={i}
                d={sl.d}
                fill={sl.color}
                stroke="#ffffff"
                strokeWidth="2"
                opacity={hoveredIdx === null || hoveredIdx === i ? 1 : 0.45}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                className="transition-opacity cursor-pointer"
              />
            ))}
            {chartType === 'donut' && (
              <text x={cx} y={cy + 4} textAnchor="middle" className="fill-slate-800 font-bold text-[12px]">
                {fmtVal(total)}
              </text>
            )}
          </svg>
          <div className="flex-1 w-full space-y-1.5 text-xs">
            {slices.map((sl, i) => (
              <div
                key={i}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                className="flex items-center justify-between gap-2 px-2 py-1 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: sl.color }} />
                  <span className="text-slate-700 font-medium truncate">{sl.label}</span>
                </div>
                <span className="font-mono font-bold text-slate-900 shrink-0">
                  {fmtVal(sl.value)} ({sl.pct}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // SVG vertical bar or line/area chart
    const W = 560;
    const H = 220;
    const padL = 48;
    const padR = 16;
    const padT = 18;
    const padB = 38;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const yFor = (v) => padT + plotH - ((Number(v || 0) - minVal) / span) * plotH;
    const zeroY = yFor(0);
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => minVal + t * span);

    if (chartType === 'line' || chartType === 'area') {
      const stepX = labels.length > 1 ? plotW / (labels.length - 1) : plotW / 2;
      return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible">
          {ticks.map((tk, i) => {
            const y = yFor(tk);
            return (
              <g key={i}>
                <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="3 3" />
                <text x={padL - 6} y={y + 3} textAnchor="end" className="fill-slate-400 text-[9.5px] font-mono">
                  {Math.round(tk)}
                </text>
              </g>
            );
          })}
          {series.map((s, sIdx) => {
            const pts = labels.map((_, i) => ({
              x: labels.length > 1 ? padL + i * stepX : padL + plotW / 2,
              y: yFor(s.values?.[i] ?? 0),
              v: Number(s.values?.[i] ?? 0),
            }));
            const poly = pts.map((pt) => `${pt.x},${pt.y}`).join(' ');
            const areaD = `M ${pts[0].x} ${zeroY} ${pts.map((pt) => `L ${pt.x} ${pt.y}`).join(' ')} L ${pts[pts.length - 1].x} ${zeroY} Z`;
            return (
              <g key={sIdx}>
                {chartType === 'area' && <path d={areaD} fill={s.color} opacity="0.14" />}
                <polyline fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" points={poly} />
                {pts.map((pt, i) => (
                  <g key={i} onMouseEnter={() => setHoveredIdx(i)} onMouseLeave={() => setHoveredIdx(null)}>
                    <circle cx={pt.x} cy={pt.y} r={hoveredIdx === i ? 5 : 3.5} fill="#fff" stroke={s.color} strokeWidth="2.2" />
                    {hoveredIdx === i && (
                      <text x={pt.x} y={pt.y - 9} textAnchor="middle" className="fill-slate-900 text-[10px] font-bold">
                        {fmtVal(pt.v)}
                      </text>
                    )}
                  </g>
                ))}
              </g>
            );
          })}
          {labels.map((lb, i) => {
            const x = labels.length > 1 ? padL + i * stepX : padL + plotW / 2;
            const showLabel = labels.length <= 8 || i % Math.ceil(labels.length / 7) === 0 || i === labels.length - 1;
            return showLabel ? (
              <text key={i} x={x} y={H - 12} textAnchor="middle" className="fill-slate-500 text-[9.5px]">
                {String(lb).slice(0, 12)}
              </text>
            ) : null;
          })}
        </svg>
      );
    }

    // Grouped vertical bars
    const groupW = plotW / labels.length;
    const barW = Math.max(8, Math.min(34, (groupW - 10) / series.length));

    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible">
        {ticks.map((tk, i) => {
          const y = yFor(tk);
          return (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="3 3" />
              <text x={padL - 6} y={y + 3} textAnchor="end" className="fill-slate-400 text-[9.5px] font-mono">
                {Math.round(tk)}
              </text>
            </g>
          );
        })}
        {labels.map((lb, i) => {
          const groupCenter = padL + i * groupW + groupW / 2;
          const totalGroupBarsW = series.length * barW + (series.length - 1) * 3;
          const startX = groupCenter - totalGroupBarsW / 2;
          return (
            <g key={i} onMouseEnter={() => setHoveredIdx(i)} onMouseLeave={() => setHoveredIdx(null)}>
              {series.map((s, sIdx) => {
                const v = Number(s.values?.[i] ?? 0);
                const yTop = v >= 0 ? yFor(v) : zeroY;
                const hBar = Math.max(2, Math.abs(yFor(v) - zeroY));
                const bx = startX + sIdx * (barW + 3);
                return (
                  <g key={sIdx}>
                    <rect
                      x={bx}
                      y={yTop}
                      width={barW}
                      height={hBar}
                      rx="4"
                      fill={s.color || '#059669'}
                      opacity={hoveredIdx === null || hoveredIdx === i ? 0.92 : 0.45}
                    />
                    {(hoveredIdx === i || (labels.length <= 7 && series.length === 1)) && (
                      <text x={bx + barW / 2} y={yTop - 5} textAnchor="middle" className="fill-slate-800 text-[9.5px] font-bold">
                        {fmtVal(v)}
                      </text>
                    )}
                  </g>
                );
              })}
              <text x={groupCenter} y={H - 12} textAnchor="middle" className="fill-slate-500 text-[9.5px]">
                {String(lb).slice(0, 12)}
              </text>
            </g>
          );
        })}
      </svg>
    );
  };

  return (
    <div className="mt-2.5 w-full max-w-2xl rounded-2xl bg-white border border-border-subtle p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-2 pb-2 border-b border-border-subtle flex-wrap">
        <div>
          <h4 className="text-sm font-bold text-forest-deep">{title}</h4>
          {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {series.length > 1 && chartType !== 'pie' && chartType !== 'donut' && (
          <div className="flex flex-wrap gap-2">
            {series.map((s, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                <span>{s.name}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      {renderChartBody()}
    </div>
  );
}

function SharedVademecumWidget({ data, onOpenSandboxModal }) {
  const items = Array.isArray(data?.items) ? data.items : [];
  const [copiedId, setCopiedId] = useState(null);

  const handleCopy = (item) => {
    if (!item?.code_to_copy) return;
    navigator.clipboard?.writeText(item.code_to_copy);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const importanceStyles = {
    CRITIQUE: 'bg-rose-50 text-rose-800 border-rose-200',
    IMPORTANT: 'bg-amber-50 text-amber-900 border-amber-200',
    INFO: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  };

  return (
    <div className="mt-2.5 w-full max-w-2xl rounded-2xl bg-white border border-border-subtle p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-full bg-emerald-50 text-primary flex items-center justify-center">
            <span className="material-symbols-outlined text-[18px]">menu_book</span>
          </span>
          <div>
            <h4 className="text-sm font-bold text-forest-deep">
              Vademecum du Domaine ({items.length} fiche{items.length > 1 ? 's' : ''})
            </h4>
            {data?.query && <p className="text-[11px] text-slate-500">Filtre : « {data.query} »</p>}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onOpenSandboxModal?.('vademecum', {})}
          className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary hover:bg-forest-deep text-white text-xs font-bold cursor-pointer"
        >
          <span className="material-symbols-outlined text-[14px]">add</span>
          <span>Nouvelle fiche</span>
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-slate-500 py-3 text-center">Aucune fiche Vademecum correspondante.</p>
      ) : (
        <div className="space-y-2.5">
          {items.map((item) => (
            <div key={item.id} className="p-3 rounded-xl bg-canvas-slate border border-border-subtle space-y-2">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-2 py-0.5 rounded-full bg-white border border-slate-200 text-[10px] font-bold text-slate-700">
                      {item.property_name || 'Presbytère'}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-sage-soft text-[10px] font-bold text-forest-deep">
                      {item.category}
                    </span>
                    {item.importance && (
                      <span
                        className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${
                          importanceStyles[item.importance] || importanceStyles.INFO
                        }`}
                      >
                        {item.importance}
                      </span>
                    )}
                  </div>
                  <h5 className="text-xs sm:text-sm font-bold text-forest-deep pt-0.5">{item.title}</h5>
                </div>
              </div>

              <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">{item.content}</p>

              {item.code_to_copy && (
                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white border border-emerald-200">
                  <code className="text-xs font-mono font-bold text-emerald-950 break-all">{item.code_to_copy}</code>
                  <button
                    type="button"
                    onClick={() => handleCopy(item)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-[11px] font-bold cursor-pointer shrink-0"
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      {copiedId === item.id ? 'check' : 'content_copy'}
                    </span>
                    <span>{copiedId === item.id ? 'Copié !' : 'Copier'}</span>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SharedPollsWidget({
  data,
  activeMemberName,
  isCoordinator = false,
  onCastSandboxVote,
  onOpenSandboxModal,
  onInspectPoll,
}) {
  const polls = Array.isArray(data?.polls) ? data.polls : [];
  return (
    <div className="mt-2.5 w-full max-w-2xl space-y-3">
      {polls.map((poll) => {
        const statusUpper = String(poll.status || '').toUpperCase();
        const isProposed = statusUpper === 'PROPOSED';
        const isClosed = statusUpper === 'ARCHIVED' || statusUpper === 'CLOSED';
        return (
          <div
            key={poll.id}
            className="rounded-2xl bg-white border border-border-subtle hover:border-purple-300 p-4 shadow-sm space-y-3 transition-colors"
          >
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => onInspectPoll?.(poll)}
                className="text-left flex-1 min-w-0 cursor-pointer group"
              >
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                      isProposed
                        ? 'bg-amber-50 text-amber-900 border-amber-200'
                        : isClosed
                        ? 'bg-slate-100 text-slate-600 border-slate-200'
                        : 'bg-purple-50 text-purple-800 border-purple-200'
                    }`}
                  >
                    Scrutin #{poll.id} •{' '}
                    {isProposed ? 'Proposition à arbitrer' : isClosed ? 'Clôturé' : 'Vote ouvert'}
                  </span>
                  {poll.category && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {poll.category}
                    </span>
                  )}
                </div>
                <h4 className="text-sm font-bold text-forest-deep group-hover:text-purple-800 mt-1.5 transition-colors">
                  {poll.title}
                </h4>
                {poll.description && (
                  <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{poll.description}</p>
                )}
              </button>
              <button
                type="button"
                onClick={() => onInspectPoll?.(poll)}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full border text-[11px] font-bold transition-colors cursor-pointer shrink-0 ${
                  isProposed && isCoordinator
                    ? 'bg-amber-50 hover:bg-amber-600 text-amber-900 hover:text-white border-amber-300'
                    : 'bg-purple-50 hover:bg-purple-700 text-purple-900 hover:text-white border-purple-200'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">
                  {isProposed && isCoordinator ? 'gavel' : 'open_in_new'}
                </span>
                <span>{isProposed && isCoordinator ? 'Examiner & Ouvrir' : 'Consulter'}</span>
              </button>
            </div>
            {isProposed ? (
              <div className="px-3 py-2 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-950 flex items-center justify-between gap-2">
                <span>
                  Ce scrutin est en attente de validation par un coordinateur avant l’ouverture du vote familial.
                </span>
              </div>
            ) : (
              <WhatsAppPollView
                project={poll}
                currentUser={activeMemberName}
                compact={true}
                onCastVote={(choice) => onCastSandboxVote?.(poll, choice)}
              />
            )}
          </div>
        );
      })}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => onOpenSandboxModal?.('poll', {})}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white hover:bg-purple-50 text-purple-900 border border-purple-200 text-xs font-semibold shadow-2xs cursor-pointer"
        >
          <span className="material-symbols-outlined text-[15px]">add</span>
          <span>Proposer un scrutin</span>
        </button>
      </div>
    </div>
  );
}

function getTaskStatusBadge(statusRaw) {
  const s = String(statusRaw || '').toUpperCase();
  if (s === 'PROPOSED') {
    return {
      label: 'Proposition à arbitrer',
      cls: 'bg-amber-100 text-amber-950 border-amber-300',
      actionLabel: 'Consulter & Arbitrer',
      actionCls: 'bg-amber-600 hover:bg-amber-700 text-white border-amber-700',
      actionIcon: 'gavel',
      isDone: false,
    };
  }
  if (s === 'PENDING_VALIDATION') {
    return {
      label: 'Réalisation à valider',
      cls: 'bg-emerald-100 text-emerald-950 border-emerald-300',
      actionLabel: 'Examiner & Valider',
      actionCls: 'bg-emerald-700 hover:bg-emerald-800 text-white border-emerald-800',
      actionIcon: 'verified',
      isDone: false,
    };
  }
  if (s === 'DONE' || s.includes('TERMIN')) {
    return {
      label: 'Terminée',
      cls: 'bg-slate-100 text-slate-600 border-slate-200',
      actionLabel: 'Consulter',
      actionCls: 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200',
      actionIcon: 'visibility',
      isDone: true,
    };
  }
  return {
    label: s === 'IN_PROGRESS' || s === 'EN_COURS' ? 'En cours' : 'À faire',
    cls: 'bg-sky-50 text-sky-900 border-sky-200',
    actionLabel: 'Consulter',
    actionCls: 'bg-white hover:bg-emerald-50 text-forest-deep border-border-subtle hover:border-primary/40',
    actionIcon: 'open_in_new',
    isDone: false,
  };
}

function SharedTasksWidget({ data, isCoordinator = false, onInspectTask, onOpenSandboxModal }) {
  const tasks = Array.isArray(data?.tasks) ? data.tasks : [];

  return (
    <div className="mt-2.5 w-full max-w-2xl rounded-2xl bg-white border border-border-subtle p-4 shadow-sm space-y-2.5">
      <div className="flex items-center justify-between pb-2 border-b border-border-subtle gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-[18px]">task_alt</span>
          <h4 className="text-sm font-bold text-forest-deep">
            Tâches du domaine ({tasks.length})
          </h4>
        </div>
        <button
          type="button"
          onClick={() => onOpenSandboxModal?.('task', {})}
          className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary hover:bg-forest-deep text-white text-xs font-bold cursor-pointer"
        >
          <span className="material-symbols-outlined text-[14px]">add</span>
          <span>Nouvelle tâche</span>
        </button>
      </div>

      {tasks.length === 0 ? (
        <p className="text-xs text-slate-500 py-3 text-center">Aucune tâche correspondante.</p>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => {
            const meta = getTaskStatusBadge(t.status);
            const assignedList = Array.isArray(t.assigned_members) ? t.assigned_members.filter(Boolean) : [];
            const needsReview =
              String(t.status || '').toUpperCase() === 'PROPOSED' ||
              String(t.status || '').toUpperCase() === 'PENDING_VALIDATION';
            const ctaLabel = needsReview && !isCoordinator ? 'Consulter' : meta.actionLabel;
            const ctaCls =
              needsReview && !isCoordinator
                ? 'bg-white hover:bg-emerald-50 text-forest-deep border-border-subtle'
                : meta.actionCls;
            const ctaIcon = needsReview && !isCoordinator ? 'open_in_new' : meta.actionIcon;

            return (
              <div
                key={t.id}
                role="button"
                tabIndex={0}
                onClick={() => onInspectTask?.(t)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onInspectTask?.(t);
                  }
                }}
                className={`group p-3 rounded-xl border transition-all cursor-pointer space-y-2 ${
                  needsReview
                    ? 'bg-amber-50/45 border-amber-200 hover:border-amber-400 hover:shadow-xs'
                    : 'bg-canvas-slate border-border-subtle hover:border-primary/50 hover:bg-emerald-50/25 hover:shadow-xs'
                }`}
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="text-left flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-mono font-bold text-slate-500">#{t.id}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${meta.cls}`}
                      >
                        {meta.label}
                      </span>
                      {(() => {
                        const uMeta = getUrgencyMeta(t.urgency || t.priority);
                        const dMeta = getDifficultyMeta(t.difficulty || t.complexity, t.charge_points);
                        const onsiteFlag = isTaskOnsite(t);
                        const inPoolFlag = isTaskInOnsitePool(t);
                        return (
                          <>
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${uMeta.badgeClass}`}>
                              {uMeta.badgeLabel}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${dMeta.badgeClass}`}>
                              {dMeta.badgeLabel}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                              onsiteFlag ? 'bg-teal-50 text-teal-900 border-teal-200' : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                            }`}>
                              {onsiteFlag ? 'Sur place' : 'À distance'}
                            </span>
                            {inPoolFlag && (
                              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                                Vivier
                              </span>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    <div
                      className={`text-xs sm:text-[13px] font-bold mt-1 group-hover:text-primary transition-colors ${
                        meta.isDone ? 'line-through text-slate-400' : 'text-slate-900'
                      }`}
                    >
                      {t.title}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span>{t.subject || 'Presbytère'}</span>
                      <span>•</span>
                      <span>
                        {assignedList.length > 0 ? assignedList.join(', ') : (isTaskInOnsitePool(t) ? 'Vivier sur place (libre)' : 'Non assignée')}
                      </span>
                      {t.deadline && (
                        <>
                          <span>•</span>
                          <span>Éch. {String(t.deadline).slice(0, 10)}</span>
                        </>
                      )}
                    </div>
                    {t.description && (
                      <p className="text-[11.5px] text-slate-600 mt-1 line-clamp-2 leading-snug">
                        {t.description}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onInspectTask?.(t);
                    }}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full border text-[11px] font-bold transition-colors cursor-pointer shrink-0 ${ctaCls}`}
                  >
                    <span className="material-symbols-outlined text-[14px]">{ctaIcon}</span>
                    <span>{ctaLabel}</span>
                  </button>
                </div>

                {Array.isArray(t.documents) && t.documents.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {t.documents.slice(0, 4).map((d) => (
                      <a
                        key={d.id}
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-slate-200 text-[10.5px] font-medium text-primary hover:border-primary"
                      >
                        <span className="material-symbols-outlined text-[13px]">picture_as_pdf</span>
                        <span className="truncate max-w-[160px]">{d.title}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SharedTreasuryWidget({ data }) {
  const bank = data?.swan_bank_account || {};
  const associates = Array.isArray(data?.associates) ? data.associates : [];
  const [copied, setCopied] = useState(false);

  const copyIban = () => {
    if (!bank.iban) return;
    navigator.clipboard?.writeText(bank.iban);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-2.5 w-full max-w-2xl rounded-2xl bg-white border border-border-subtle p-4 shadow-sm space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-border-subtle">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
            Compte Bancaire {bank.bank_name || 'Swan'}
          </span>
          <span className="text-xl font-black text-forest-deep tabular-nums">
            {Number(bank.balance_eur || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
          </span>
        </div>
        {bank.iban && (
          <button
            type="button"
            onClick={copyIban}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-canvas-slate hover:bg-emerald-50 border border-border-subtle text-xs font-mono font-semibold text-slate-700 cursor-pointer"
          >
            <span>{bank.iban}</span>
            <span className="material-symbols-outlined text-[14px] text-primary">
              {copied ? 'check' : 'content_copy'}
            </span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        {associates.map((a) => {
          const bal = Number(a.cca_balance || 0);
          return (
            <div key={a.id} className="p-2 rounded-xl bg-canvas-slate border border-border-subtle">
              <div className="font-bold text-slate-800 truncate">{a.prenom || a.name}</div>
              <div className={`font-mono font-bold mt-0.5 ${bal > 0 ? 'text-emerald-700' : bal < 0 ? 'text-rose-700' : 'text-slate-600'}`}>
                {bal > 0 ? `+${bal.toFixed(2)}` : bal.toFixed(2)} €
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SharedDocumentsWidget({ data, onViewDocument }) {
  const docs = Array.isArray(data?.documents) ? data.documents : [];
  if (docs.length === 0) return null;
  return (
    <div className="mt-2.5 w-full max-w-2xl grid grid-cols-1 sm:grid-cols-2 gap-2">
      {docs.map((doc) => (
        <div
          key={doc.id}
          className="p-3 rounded-2xl bg-white border border-border-subtle shadow-2xs flex items-center justify-between gap-2"
        >
          <div className="min-w-0">
            <div className="text-xs font-bold text-forest-deep truncate" title={doc.title}>
              {doc.title}
            </div>
            <div className="text-[11px] text-slate-500 truncate">
              Doc #{doc.id} • {doc.category || 'Archive SCI'}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onViewDocument?.(doc)}
              className="w-8 h-8 rounded-full bg-emerald-50 hover:bg-emerald-100 text-primary flex items-center justify-center cursor-pointer"
              title="Consulter le document"
            >
              <span className="material-symbols-outlined text-[16px]">visibility</span>
            </button>
            <a
              href={doc.download_url}
              download={doc.file_name || `${doc.title}.pdf`}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center"
              title="Télécharger"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}

function SharedActionButtons({ data, onOpenSandboxModal }) {
  const buttons = Array.isArray(data?.buttons) ? data.buttons : [];
  const iconMap = {
    stay: 'calendar_add_on',
    task: 'add_task',
    poll: 'how_to_vote',
    document: 'upload_file',
    vademecum: 'menu_book',
  };

  return (
    <div className="mt-2.5 flex flex-wrap gap-2">
      {buttons.map((btn, idx) => {
        const mType = String(btn.modal_type || 'stay').toLowerCase();
        return (
          <button
            key={idx}
            type="button"
            onClick={() => onOpenSandboxModal?.(mType, btn.prefill || {})}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-primary hover:bg-forest-deep text-white text-xs font-bold shadow-sm hover:shadow-md transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[17px]">
              {iconMap[mType] || 'open_in_new'}
            </span>
            <span>{btn.label || 'Ouvrir le formulaire'}</span>
          </button>
        );
      })}
    </div>
  );
}

function renderMentionHighlightedText(text) {
  if (!text) return null;
  const parts = String(text).split(/(@[A-Za-zÀ-ÿ_-]+)/g);
  return parts.map((p, idx) =>
    p.startsWith('@') && p.length > 1 ? (
      <span key={idx} className="font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100/70 px-1 rounded">
        {p}
      </span>
    ) : (
      <React.Fragment key={idx}>{p}</React.Fragment>
    )
  );
}

function formatThreadTimestamp(isoStr) {
  if (!isoStr) return '';
  const dt = new Date(isoStr);
  if (isNaN(dt.getTime())) return String(isoStr).slice(0, 16);
  return dt.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function SharedDiscussionThreadWidget({
  data,
  activeMemberName = 'Henri Jamet',
  activeMemberId = null,
  onCommentPosted,
}) {
  const targetType = data?.target_type === 'vote' ? 'vote' : 'task';
  const targetId = data?.target_id;
  const [comments, setComments] = useState(() => (Array.isArray(data?.comments) ? data.comments : []));
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errMsg, setErrMsg] = useState(null);
  const [showMentions, setShowMentions] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    if (Array.isArray(data?.comments)) {
      setComments(data.comments);
    }
  }, [data?.target_id, data?.target_type]);

  const activeFirst = String(activeMemberName || '').trim().split(' ')[0].toLowerCase();
  const mentionTargets = useMemo(
    () =>
      ['tous', 'Henri', 'Marguerite', 'Hortense', 'Joséphine', 'Eugénie', 'Élisabeth', 'Frédéric'].filter(
        (m) => m.toLowerCase() !== activeFirst
      ),
    [activeFirst]
  );

  const handleRefresh = async () => {
    if (!targetId || refreshing) return;
    setRefreshing(true);
    setErrMsg(null);
    try {
      const fresh =
        targetType === 'vote' ? await fetchProjectComments(targetId) : await fetchTaskComments(targetId);
      if (Array.isArray(fresh)) {
        setComments(fresh);
      }
    } catch (err) {
      setErrMsg(err?.message || 'Impossible d’actualiser le fil.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleSendReply = async (e) => {
    if (e) e.preventDefault();
    const trimmed = replyText.trim();
    if (!trimmed || !targetId || sending) return;
    setSending(true);
    setErrMsg(null);
    try {
      let created;
      if (targetType === 'vote') {
        created = await addProjectComment(targetId, {
          author_name: activeMemberName || 'Henri Jamet',
          content: trimmed,
        });
      } else {
        created = await addTaskComment(targetId, {
          author_id: activeMemberId || undefined,
          author_name: activeMemberName || 'Henri Jamet',
          author_role: 'Membre Associé',
          content: trimmed,
        });
      }
      const nextComment = created && typeof created === 'object'
        ? {
            id: created.id || `tmp-${Date.now()}`,
            author_name: created.author_name || activeMemberName || 'Henri Jamet',
            author_role: created.author_role || 'Associé',
            content: created.content || trimmed,
            created_at: created.created_at || new Date().toISOString(),
          }
        : {
            id: `tmp-${Date.now()}`,
            author_name: activeMemberName || 'Henri Jamet',
            author_role: 'Associé',
            content: trimmed,
            created_at: new Date().toISOString(),
          };
      setComments((prev) => [...prev, nextComment]);
      setReplyText('');
      setShowMentions(false);
      setTimeout(() => {
        if (listRef.current) {
          listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
        }
      }, 40);
      onCommentPosted?.();
    } catch (err) {
      setErrMsg(err?.message || "Erreur lors de l'envoi du message.");
    } finally {
      setSending(false);
    }
  };

  const isVote = targetType === 'vote';

  return (
    <div
      data-testid="toaster-discussion-thread"
      className="mt-2.5 w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-border-subtle shadow-sm overflow-hidden"
    >
      {/* En-tête du fil */}
      <div className="px-4 py-3 bg-sage-soft/55 border-b border-border-subtle flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
              isVote ? 'bg-purple-100 text-purple-800' : 'bg-sky-100 text-sky-800'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {isVote ? 'how_to_vote' : 'forum'}
            </span>
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  isVote
                    ? 'bg-purple-50 text-purple-900 border-purple-200'
                    : 'bg-sky-50 text-sky-900 border-sky-200'
                }`}
              >
                {isVote ? `Scrutin #${targetId}` : `Tâche #${targetId}`}
              </span>
              <span className="text-[11px] font-semibold text-slate-500">
                {comments.length} message{comments.length > 1 ? 's' : ''}
              </span>
            </div>
            <h4 className="text-xs sm:text-sm font-bold text-forest-deep truncate mt-0.5">
              {data?.target_title || (isVote ? `Discussion scrutin #${targetId}` : `Discussion tâche #${targetId}`)}
            </h4>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          title="Actualiser le fil"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white hover:bg-emerald-50 border border-border-subtle text-[11px] font-semibold text-slate-600 hover:text-primary cursor-pointer shrink-0"
        >
          <span className={`material-symbols-outlined text-[14px] ${refreshing ? 'animate-spin' : ''}`}>
            refresh
          </span>
          <span>Actualiser</span>
        </button>
      </div>

      {/* Historique des messages */}
      <div ref={listRef} className="max-h-72 overflow-y-auto p-3.5 space-y-2.5 bg-slate-50/60">
        {comments.length === 0 ? (
          <div className="py-5 text-center text-xs text-slate-500">
            Aucun message dans ce fil pour l’instant. Répondez directement ci-dessous pour démarrer l’échange.
          </div>
        ) : (
          comments.map((c) => {
            const author = String(c.author_name || 'Associé');
            const isSelf = activeFirst && author.toLowerCase().includes(activeFirst);
            const initials = author
              .split(/\s+/)
              .map((w) => w[0])
              .join('')
              .slice(0, 2)
              .toUpperCase();
            return (
              <div key={c.id} className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}>
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-2xs border ${
                    isSelf
                      ? 'bg-emerald-50/90 border-emerald-200 text-slate-900 rounded-br-xs'
                      : 'bg-white border-slate-200 text-slate-800 rounded-bl-xs'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[9.5px] font-bold flex items-center justify-center shrink-0">
                        {initials}
                      </span>
                      <span className="font-bold text-[11px] text-forest-deep">{author}</span>
                    </div>
                    {c.created_at && (
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {formatThreadTimestamp(c.created_at)}
                      </span>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap break-words">
                    {renderMentionHighlightedText(c.content)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Zone de réponse directe inline */}
      <form onSubmit={handleSendReply} className="p-3 bg-white border-t border-border-subtle space-y-2">
        {errMsg && (
          <div className="px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-semibold">
            {errMsg}
          </div>
        )}

        {showMentions && (
          <div className="flex flex-wrap gap-1">
            {mentionTargets.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setReplyText((prev) => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}@${m} `);
                  setShowMentions(false);
                }}
                className="px-2 py-0.5 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-[11px] font-semibold cursor-pointer"
              >
                @{m}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => setShowMentions((v) => !v)}
            title="Mentionner un associé (@)"
            className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs font-bold shrink-0 cursor-pointer transition-colors ${
              showMentions
                ? 'bg-emerald-700 text-white border-emerald-700'
                : 'bg-slate-50 hover:bg-emerald-50 text-slate-600 border-slate-200'
            }`}
          >
            @
          </button>
          <textarea
            rows={1}
            disabled={sending}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendReply();
              }
            }}
            placeholder={`Répondre directement dans ce fil en tant que ${activeMemberName.split(' ')[0]}…`}
            className="flex-1 min-h-[34px] max-h-28 px-3 py-1.5 rounded-xl bg-slate-50 focus:bg-white border border-slate-200 focus:border-primary text-xs text-slate-900 focus:outline-none resize-none"
          />
          <button
            type="submit"
            disabled={sending || !replyText.trim()}
            className="inline-flex items-center gap-1 px-3.5 h-8 rounded-full bg-primary hover:bg-forest-deep text-white text-xs font-bold shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <span className={`material-symbols-outlined text-[15px] ${sending ? 'animate-spin' : ''}`}>
              {sending ? 'progress_activity' : 'send'}
            </span>
            <span>Répondre</span>
          </button>
        </div>
      </form>
    </div>
  );
}

export function ToasterComponentRenderer({
  components = [],
  activeMemberName = 'Henri Jamet',
  activeMemberId = null,
  isCoordinator = false,
  onOpenSandboxModal,
  onCastSandboxVote,
  onInspectTask,
  onInspectPoll,
  onCommentPosted,
}) {
  const [viewerDoc, setViewerDoc] = useState(null);

  if (!Array.isArray(components) || components.length === 0) return null;

  return (
    <>
      <div className="w-full space-y-2.5">
        {components.map((comp, idx) => {
          const cid = comp.component_id;
          if (cid === 'stays_calendar') {
            return <SharedStaysCalendar key={idx} data={comp} onOpenSandboxModal={onOpenSandboxModal} />;
          }
          if (cid === 'fuel_and_heating_graph') {
            return <SharedFuelGraph key={idx} data={comp} />;
          }
          if (cid === 'pool_status_widget') {
            return <SharedPoolWidget key={idx} data={comp} />;
          }
          if (cid === 'leaderboard_card') {
            return <SharedLeaderboardWidget key={idx} data={comp} />;
          }
          if (cid === 'custom_chart_card') {
            return <SharedCustomChartWidget key={idx} data={comp} />;
          }
          if (cid === 'vademecum_card') {
            return <SharedVademecumWidget key={idx} data={comp} onOpenSandboxModal={onOpenSandboxModal} />;
          }
          if (cid === 'poll_status_card') {
            return (
              <SharedPollsWidget
                key={idx}
                data={comp}
                activeMemberName={activeMemberName}
                isCoordinator={isCoordinator}
                onCastSandboxVote={onCastSandboxVote}
                onOpenSandboxModal={onOpenSandboxModal}
                onInspectPoll={onInspectPoll}
              />
            );
          }
          if (cid === 'tasks_overview_card') {
            return (
              <SharedTasksWidget
                key={idx}
                data={comp}
                isCoordinator={isCoordinator}
                onInspectTask={onInspectTask}
                onOpenSandboxModal={onOpenSandboxModal}
              />
            );
          }
          if (cid === 'treasury_overview_card') {
            return <SharedTreasuryWidget key={idx} data={comp} />;
          }
          if (cid === 'document_viewer_card') {
            return (
              <SharedDocumentsWidget
                key={idx}
                data={comp}
                onViewDocument={(doc) =>
                  setViewerDoc({
                    ...doc,
                    filename: doc.file_name || doc.title || 'Document.pdf',
                    file_url: doc.download_url,
                    url: doc.download_url,
                    file_type: doc.file_type || 'application/pdf',
                  })
                }
              />
            );
          }
          if (cid === 'discussion_thread_card') {
            return (
              <SharedDiscussionThreadWidget
                key={idx}
                data={comp}
                activeMemberName={activeMemberName}
                activeMemberId={activeMemberId}
                onCommentPosted={onCommentPosted}
              />
            );
          }
          if (cid === 'action_modal_buttons') {
            return <SharedActionButtons key={idx} data={comp} onOpenSandboxModal={onOpenSandboxModal} />;
          }
          return null;
        })}
      </div>

      <DocumentViewerModal
        isOpen={Boolean(viewerDoc)}
        onClose={() => setViewerDoc(null)}
        document={viewerDoc}
      />
    </>
  );
}

// ============================================================================
// 4. CONSTANTES CANONIQUES & MODALE INTERACTIVE DE FORMULAIRE
// ============================================================================
export const TASK_SUBJECTS = [
  'Presbytère',
  'Rosings',
  'Piscine',
  'Jardin & Espaces Verts',
  'Petites cabanes',
  'Hangar à meuble',
  'SCI & Administratif',
];

export const TASK_COMPLEXITIES = DIFFICULTY_LEVELS;

export const TASK_PRIORITIES = URGENCY_LEVELS;

export const VOTE_PRIORITIES = ['Basse', 'Normale', 'Haute', 'Urgente'];

export const STATUTORY_ASSOCIATES_LIST = [
  'Henri Jamet',
  'Élisabeth Jamet',
  'Frédéric Jamet',
  'Marguerite Jamet',
  'Hortense Jamet',
  'Joséphine Jamet',
  'Eugénie Jamet',
];

export const DOMAIN_ROOMS_CATALOG = {
  Presbytère: [
    { name: 'Suite', shortLabel: 'Suite (Frédéric & Élisabeth)' },
    { name: 'Deuxième Chambre du Couloir', shortLabel: '2ᵉ Couloir (Henri)' },
    { name: 'Première Chambre du Couloir', shortLabel: '1ʳᵉ Couloir (Anc. Hortense)' },
    { name: 'La Mezzanine', shortLabel: 'Mezzanine (Joséphine)' },
    { name: 'Chambre du bas', shortLabel: 'Chambre du bas (Eugénie)' },
  ],
  Rosings: [
    { name: 'Chambre Haut Droite', shortLabel: 'Haut Droite (Marguerite)' },
    { name: 'Chambre Haut Gauche', shortLabel: 'Haut Gauche (Hortense)' },
  ],
};

export function getMaxRoomsForBuilding(building) {
  const low = String(building || '').toLowerCase();
  if ((low.includes('presbyt') && low.includes('rosing')) || low.includes('domaine') || low.includes('deux')) return 7;
  if (low.includes('rosing')) return 2;
  return 5;
}

export function getRoomsListForBuilding(building) {
  const low = String(building || '').toLowerCase();
  if ((low.includes('presbyt') && low.includes('rosing')) || low.includes('domaine') || low.includes('deux')) {
    return [...DOMAIN_ROOMS_CATALOG.Presbytère, ...DOMAIN_ROOMS_CATALOG.Rosings];
  }
  if (low.includes('rosing')) return DOMAIN_ROOMS_CATALOG.Rosings;
  return DOMAIN_ROOMS_CATALOG.Presbytère;
}

const VADEMECUM_CATS = [
  'Arrivée & Clés',
  'Chauffage & Eau Chaude',
  'Piscine',
  'Ordures Ménagères',
  'Wifi & Multimédia',
  'Artisans & Dépannage',
  'Bâtiments & Réseaux Techniques',
  'Sécurité & Urgences',
];

export function ToasterSandboxFormModal({
  modalState,
  onClose,
  onSubmitSandboxAction,
  members = [],
  activeMemberName = 'Henri Jamet',
}) {
  const isOpen = Boolean(modalState?.type);
  const type = modalState?.type || 'stay';
  const prefill = modalState?.prefill || {};

  // Séjour (miroir BookingModal.jsx : dates + heures + participants internes/externes + ECS/Chauffage/Piscine)
  const [building, setBuilding] = useState('Presbytère');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10));
  const [arrivalTime, setArrivalTime] = useState('15:00');
  const [departureTime, setDepartureTime] = useState('11:00');
  const [selectedMembers, setSelectedMembers] = useState([activeMemberName]);
  const [externalGuests, setExternalGuests] = useState([]);
  const [externalGuestInput, setExternalGuestInput] = useState('');
  const [chambersUsed, setChambersUsed] = useState(1);
  const [selectedRooms, setSelectedRooms] = useState([]);
  const [activateDhw, setActivateDhw] = useState(true);
  const [activateHeating, setActivateHeating] = useState(true);
  const [activatePool, setActivatePool] = useState(false);

  // Tâche (création ultra-simple : titre + description uniquement ; charge/priorité/devis/attribution gérés par le coordinateur)
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');

  // Scrutin / Vote (miroir VoteRoofModal.jsx : catégorie, priorité, budget, choix multiples, options, statut PROPOSED)
  const [pollTitle, setPollTitle] = useState('');
  const [pollCategory, setPollCategory] = useState('Presbytère');
  const [pollPriority, setPollPriority] = useState('Normale');
  const [pollBudget, setPollBudget] = useState('');
  const [pollDesc, setPollDesc] = useState('');
  const [pollOptionsText, setPollOptionsText] = useState('Approuver le projet\nRejeter le projet');
  const [pollMulti, setPollMulti] = useState(false);

  // Facture / Dépense
  const [invSupplier, setInvSupplier] = useState('');
  const [invTitle, setInvTitle] = useState('');
  const [invAmount, setInvAmount] = useState('');
  const [invAdvanced, setInvAdvanced] = useState(true);

  // Vademecum
  const [vadBuilding, setVadBuilding] = useState('Presbytère');
  const [vadCategory, setVadCategory] = useState('Arrivée & Clés');
  const [vadTitle, setVadTitle] = useState('');
  const [vadContent, setVadContent] = useState('');
  const [vadCode, setVadCode] = useState('');
  const [vadImportance, setVadImportance] = useState('INFO');

  const [submitting, setSubmitting] = useState(false);

  const maxRooms = getMaxRoomsForBuilding(building);
  const availableRooms = getRoomsListForBuilding(building);
  const associateChoices = useMemo(() => {
    const names = (Array.isArray(members) ? members : [])
      .map((m) => m.displayLabel || m.name || m.nom)
      .filter(Boolean);
    return names.length >= 5 ? names : STATUTORY_ASSOCIATES_LIST;
  }, [members]);

  useEffect(() => {
    if (!isOpen) return;
    if (prefill.building) {
      setBuilding(prefill.building);
      setVadBuilding(prefill.building);
    }
    if (prefill.start_date) setStartDate(prefill.start_date);
    if (prefill.end_date) setEndDate(prefill.end_date);
    if (prefill.arrival_time) setArrivalTime(prefill.arrival_time);
    if (prefill.departure_time) setDepartureTime(prefill.departure_time);
    setSelectedMembers(
      Array.isArray(prefill.selected_members) && prefill.selected_members.length > 0
        ? prefill.selected_members
        : [activeMemberName]
    );
    setExternalGuests(Array.isArray(prefill.external_guests) ? prefill.external_guests : []);
    if (prefill.title) {
      setTaskTitle(prefill.title);
      setPollTitle(prefill.title);
      setInvTitle(prefill.title);
      setVadTitle(prefill.title);
    }
    if (prefill.description) {
      setTaskDesc(prefill.description);
      setPollDesc(prefill.description);
    }
    if (prefill.content) setVadContent(prefill.content);
    if (prefill.category) {
      setVadCategory(prefill.category);
      if (TASK_SUBJECTS.includes(prefill.category)) setPollCategory(prefill.category);
    }
    if (prefill.code_to_copy) setVadCode(prefill.code_to_copy);
  }, [isOpen, prefill, activeMemberName]);

  useEffect(() => {
    setChambersUsed((prev) => Math.max(1, Math.min(maxRooms, Number(prev) || 1)));
    setSelectedRooms((prev) => prev.filter((rn) => availableRooms.some((ar) => ar.name === rn)));
  }, [building, maxRooms]);

  if (!isOpen) return null;

  const titles = {
    stay: { icon: 'calendar_month', label: 'Nouvelle réservation de séjour' },
    task: { icon: 'add_task', label: 'Proposer une nouvelle tâche' },
    poll: { icon: 'how_to_vote', label: 'Proposer un scrutin / sondage' },
    document: { icon: 'receipt_long', label: 'Enregistrer une facture / dépense' },
    vademecum: { icon: 'menu_book', label: 'Ajouter une fiche au Vademecum' },
  };
  const header = titles[type] || titles.stay;

  const toggleRoomChip = (roomName) => {
    setSelectedRooms((prev) => {
      const next = prev.includes(roomName) ? prev.filter((r) => r !== roomName) : [...prev, roomName];
      if (next.length > 0) {
        setChambersUsed(Math.min(maxRooms, next.length));
      }
      return next;
    });
  };

  const toggleMemberChip = (memberName) => {
    setSelectedMembers((prev) =>
      prev.includes(memberName) ? prev.filter((m) => m !== memberName) : [...prev, memberName]
    );
  };

  const addExternalGuest = () => {
    const clean = externalGuestInput.trim();
    if (!clean) return;
    setExternalGuests((prev) => (prev.includes(clean) ? prev : [...prev, clean]));
    setExternalGuestInput('');
  };

  const totalOccupants = Math.max(1, selectedMembers.length + externalGuests.length);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (type === 'stay') {
        const effDhw = activateHeating ? true : activateDhw;
        await onSubmitSandboxAction('stay', {
          operation: 'create',
          building,
          start_date: startDate,
          end_date: endDate,
          arrival_time: arrivalTime || '15:00',
          departure_time: departureTime || '11:00',
          selected_members: selectedMembers,
          external_guests: externalGuests,
          guest_count: totalOccupants,
          chambers_used: Math.max(1, Math.min(maxRooms, Number(chambersUsed) || 1)),
          selected_rooms: selectedRooms,
          activate_dhw: effDhw,
          activate_heating: activateHeating,
          activate_pool: activatePool,
        });
      } else if (type === 'task') {
        await onSubmitSandboxAction('task', {
          operation: 'create',
          title: taskTitle.trim(),
          description: taskDesc.trim() || taskTitle.trim(),
          checklist: [],
        });
      } else if (type === 'poll') {
        const opts = pollOptionsText
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean);
        await onSubmitSandboxAction('vote', {
          operation: 'create',
          title: pollTitle.trim(),
          category: pollCategory,
          priority: pollPriority,
          estimated_cost: pollBudget ? parseFloat(pollBudget) : 0,
          description: pollDesc.trim() || pollTitle.trim(),
          options: opts.length >= 2 ? opts : ['Approuver le projet', 'Rejeter le projet'],
          allow_multiple_choices: pollMulti,
        });
      } else if (type === 'document') {
        await onSubmitSandboxAction('expense', {
          supplier: invSupplier.trim() || 'Artisan',
          title: invTitle.trim(),
          amount: parseFloat(invAmount) || 50,
          building,
          advanced_by_member: invAdvanced,
        });
      } else if (type === 'vademecum') {
        await onSubmitSandboxAction('vademecum', {
          operation: 'create',
          building: vadBuilding,
          category: vadCategory,
          title: vadTitle.trim(),
          content: vadContent.trim(),
          code_to_copy: vadCode.trim(),
          importance: vadImportance,
        });
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-border-subtle shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 bg-canvas-slate border-b border-border-subtle flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">{header.icon}</span>
            <h3 className="text-sm font-bold text-forest-deep">{header.label}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-200/70 flex items-center justify-center text-slate-500 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3.5 text-xs overflow-y-auto">
          {type === 'stay' && (
            <>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Bâtiment</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { val: 'Presbytère', lbl: 'Presbytère (5)' },
                    { val: 'Rosings', lbl: 'Rosings (2)' },
                    { val: 'Presbytère & Rosings', lbl: 'Tout (7)' },
                  ].map((b) => (
                    <button
                      key={b.val}
                      type="button"
                      onClick={() => setBuilding(b.val)}
                      className={`py-2 px-1.5 rounded-xl font-bold border cursor-pointer text-[11px] ${
                        building === b.val ? 'bg-primary text-white border-primary' : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {b.lbl}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                  <label className="font-bold text-slate-700 block">Arrivée (date &amp; heure)</label>
                  <div className="grid grid-cols-5 gap-1.5">
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        if (endDate && e.target.value > endDate) setEndDate(e.target.value);
                      }}
                      className="col-span-3 h-9 px-2 rounded-lg border border-slate-200 bg-white"
                      required
                    />
                    <input
                      type="time"
                      value={arrivalTime}
                      onChange={(e) => setArrivalTime(e.target.value)}
                      className="col-span-2 h-9 px-2 rounded-lg border border-slate-200 bg-white"
                      required
                    />
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                  <label className="font-bold text-slate-700 block">Départ (date &amp; heure)</label>
                  <div className="grid grid-cols-5 gap-1.5">
                    <input
                      type="date"
                      value={endDate}
                      min={startDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="col-span-3 h-9 px-2 rounded-lg border border-slate-200 bg-white"
                      required
                    />
                    <input
                      type="time"
                      value={departureTime}
                      onChange={(e) => setDepartureTime(e.target.value)}
                      className="col-span-2 h-9 px-2 rounded-lg border border-slate-200 bg-white"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700">Participants ({totalOccupants} pers.)</span>
                  <span className="text-[11px] text-slate-500">
                    {selectedMembers.length} associé(s) • {externalGuests.length} invité(s) ext.
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {associateChoices.map((name) => {
                    const checked = selectedMembers.includes(name);
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => toggleMemberChip(name)}
                        className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold cursor-pointer ${
                          checked
                            ? 'bg-emerald-700 text-white border-emerald-700'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-400'
                        }`}
                      >
                        {checked ? '✓ ' : ''}{name.split(' ')[0]}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={externalGuestInput}
                    onChange={(e) => setExternalGuestInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addExternalGuest();
                      }
                    }}
                    placeholder="Ajouter un invité extérieur (ex : Paul)..."
                    className="flex-1 h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs"
                  />
                  <button
                    type="button"
                    onClick={addExternalGuest}
                    className="px-3 h-8 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 font-bold cursor-pointer"
                  >
                    + Invité
                  </button>
                </div>
                {externalGuests.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {externalGuests.map((g, i) => (
                      <span
                        key={`${g}-${i}`}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white border border-slate-200 text-[11px] font-medium"
                      >
                        <span>{g}</span>
                        <button
                          type="button"
                          onClick={() => setExternalGuests((prev) => prev.filter((_, idx) => idx !== i))}
                          className="text-slate-400 hover:text-rose-600 cursor-pointer"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Chambres (max {maxRooms})</label>
                  <input
                    type="number"
                    min="1"
                    max={maxRooms}
                    value={chambersUsed}
                    onChange={(e) => setChambersUsed(Math.max(1, Math.min(maxRooms, Number(e.target.value) || 1)))}
                    className="w-full h-9 px-3 rounded-xl border border-slate-200"
                  />
                </div>
                <div className="flex items-end">
                  <span className="text-[11px] text-slate-500 pb-2">
                    Presbytère : 5 ch. • Rosings : 2 ch.
                  </span>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1.5">Chambres précises (optionnel)</label>
                <div className="flex flex-wrap gap-1.5">
                  {availableRooms.map((r) => {
                    const active = selectedRooms.includes(r.name);
                    return (
                      <button
                        key={r.name}
                        type="button"
                        onClick={() => toggleRoomChip(r.name)}
                        className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold cursor-pointer transition-colors ${
                          active
                            ? 'bg-emerald-700 text-white border-emerald-700'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-emerald-400'
                        }`}
                      >
                        {active ? '✓ ' : ''}{r.shortLabel}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200 space-y-2">
                <span className="font-bold text-amber-950 block">Énergie &amp; Confort Thermique</span>
                <label className="flex items-start gap-2 cursor-pointer text-slate-800">
                  <input
                    type="checkbox"
                    checked={activateHeating ? true : activateDhw}
                    disabled={activateHeating}
                    onChange={(e) => setActivateDhw(e.target.checked)}
                    className="mt-0.5 rounded accent-primary"
                  />
                  <span>
                    <strong className="font-semibold">Eau Chaude Sanitaire — Presbytère (52 °C)</strong>
                    {activateHeating && (
                      <span className="block text-[10.5px] text-amber-800">
                        Inclus automatiquement lorsque le chauffage est activé.
                      </span>
                    )}
                  </span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer text-slate-800">
                  <input
                    type="checkbox"
                    checked={activateHeating}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setActivateHeating(next);
                      if (next) setActivateDhw(true);
                    }}
                    className="mt-0.5 rounded accent-primary"
                  />
                  <span>
                    <strong className="font-semibold">Chauffage Radiateurs — Presbytère (20 °C)</strong>
                    <span className="block text-[10.5px] text-slate-500">
                      Anticipation automatique selon l’heure d’arrivée.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer text-slate-800">
                  <input
                    type="checkbox"
                    checked={activatePool}
                    onChange={(e) => setActivatePool(e.target.checked)}
                    className="mt-0.5 rounded accent-primary"
                  />
                  <span>
                    <strong className="font-semibold">Préchauffage Piscine — Rosings (27 °C)</strong>
                  </span>
                </label>
              </div>
            </>
          )}

          {type === 'task' && (
            <>
              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-[11px] flex items-start gap-1.5">
                <span className="material-symbols-outlined text-[15px] text-amber-700 shrink-0 mt-0.5">info</span>
                <span>
                  Cette tâche sera enregistrée comme <strong>proposition à arbitrer</strong>. Décrivez simplement la tâche : la charge, la priorité, le devis, l’emplacement et l’attribution sont gérés par les coordinateurs lors de la validation.
                </span>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Titre de la tâche *</label>
                <input
                  type="text"
                  required
                  placeholder="Titre clair de la tâche..."
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-slate-200"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Description</label>
                <textarea
                  rows={4}
                  value={taskDesc}
                  onChange={(e) => setTaskDesc(e.target.value)}
                  placeholder="Décrivez le besoin, le problème constaté ou les détails utiles..."
                  className="w-full p-2.5 rounded-xl border border-slate-200"
                />
              </div>
            </>
          )}

          {type === 'poll' && (
            <>
              <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-950 text-[11px] flex items-start gap-1.5">
                <span className="material-symbols-outlined text-[15px] text-purple-700 shrink-0 mt-0.5">info</span>
                <span>
                  Le scrutin est créé en <strong>proposition à valider</strong> avant son ouverture au vote familial par les coordinateurs.
                </span>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Titre du scrutin *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex : Couleur des volets du Presbytère"
                  value={pollTitle}
                  onChange={(e) => setPollTitle(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-slate-200"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Lieu / Catégorie</label>
                  <select
                    value={pollCategory}
                    onChange={(e) => setPollCategory(e.target.value)}
                    className="w-full h-9 px-2 rounded-xl border border-slate-200 bg-white"
                  >
                    {TASK_SUBJECTS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Priorité</label>
                  <select
                    value={pollPriority}
                    onChange={(e) => setPollPriority(e.target.value)}
                    className="w-full h-9 px-2 rounded-xl border border-slate-200 bg-white"
                  >
                    {VOTE_PRIORITIES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Budget (€)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    value={pollBudget}
                    onChange={(e) => setPollBudget(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-xl border border-slate-200"
                  />
                </div>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Texte explicatif du scrutin</label>
                <textarea
                  rows={2}
                  placeholder="Contexte et question posée aux associés..."
                  value={pollDesc}
                  onChange={(e) => setPollDesc(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Options (une par ligne, min. 2)</label>
                <textarea
                  rows={3}
                  value={pollOptionsText}
                  onChange={(e) => setPollOptionsText(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={pollMulti}
                  onChange={(e) => setPollMulti(e.target.checked)}
                  className="accent-primary"
                />
                <span>Autoriser plusieurs réponses par associé</span>
              </label>
            </>
          )}

          {type === 'document' && (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Fournisseur *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex : Éts Josse"
                    value={invSupplier}
                    onChange={(e) => setInvSupplier(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Montant TTC (€) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="120.00"
                    value={invAmount}
                    onChange={(e) => setInvAmount(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200"
                  />
                </div>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Objet *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex : Livraison fioul Presbytère"
                  value={invTitle}
                  onChange={(e) => setInvTitle(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={invAdvanced}
                  onChange={(e) => setInvAdvanced(e.target.checked)}
                />
                <span>Avancée personnellement (crédit CCA)</span>
              </label>
            </>
          )}

          {type === 'vademecum' && (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Bâtiment</label>
                  <select
                    value={vadBuilding}
                    onChange={(e) => setVadBuilding(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white"
                  >
                    <option>Presbytère</option>
                    <option>Rosings</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Catégorie</label>
                  <select
                    value={vadCategory}
                    onChange={(e) => setVadCategory(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white"
                  >
                    {VADEMECUM_CATS.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Titre de la fiche *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex : Wi-Fi Domaine (Fibre Presbytère)"
                  value={vadTitle}
                  onChange={(e) => setVadTitle(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Instructions pratiques *</label>
                <textarea
                  rows={3}
                  required
                  value={vadContent}
                  onChange={(e) => setVadContent(e.target.value)}
                  placeholder="Détails clairs et utiles pour la famille..."
                  className="w-full p-2.5 rounded-xl border border-slate-200"
                />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Code à copier (optionnel)</label>
                  <input
                    type="text"
                    placeholder="Mot de passe, digicode..."
                    value={vadCode}
                    onChange={(e) => setVadCode(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Importance</label>
                  <select
                    value={vadImportance}
                    onChange={(e) => setVadImportance(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white"
                  >
                    <option value="INFO">INFO</option>
                    <option value="IMPORTANT">IMPORTANT</option>
                    <option value="CRITIQUE">CRITIQUE</option>
                  </select>
                </div>
              </div>
            </>
          )}

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-full bg-primary hover:bg-forest-deep text-white font-bold shadow-xs cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'Enregistrement...' : 'Confirmer et enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export const ToasterActionFormModal = ToasterSandboxFormModal;
