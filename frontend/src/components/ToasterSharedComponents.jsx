import React, { useState, useEffect, useMemo } from 'react';
import { FuelInteractiveGraph } from '../pages/VademecumPage';
import WhatsAppPollView from './common/WhatsAppPollView';
import DocumentViewerModal from './DocumentViewerModal';

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
  return (
    <div className="mt-2.5 w-full max-w-2xl rounded-2xl bg-white border border-border-subtle p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-full bg-sky-50 text-sky-700 flex items-center justify-center">
            <span className="material-symbols-outlined text-[18px]">pool</span>
          </span>
          <div>
            <h4 className="text-sm font-bold text-forest-deep">Piscine Klereo Connect (En direct)</h4>
            <p className="text-[11px] text-slate-500">{p.filtration_state || `Filtration : ${p.filtration_mode || 'auto'}`}</p>
          </div>
        </div>
        <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold">
          En ligne
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
        <div className="p-2.5 rounded-xl bg-sky-50/60 border border-sky-100">
          <span className="text-[10px] text-sky-700 font-bold uppercase block">Eau</span>
          <span className="text-base font-bold text-slate-900">{p.water_temperature != null ? `${Number(p.water_temperature).toFixed(1)} °C` : '—'}</span>
        </div>
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70">
          <span className="text-[10px] text-slate-500 font-bold uppercase block">Air ext.</span>
          <span className="text-base font-bold text-slate-900">{p.air_temperature != null ? `${Number(p.air_temperature).toFixed(1)} °C` : '—'}</span>
        </div>
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70">
          <span className="text-[10px] text-slate-500 font-bold uppercase block">pH</span>
          <span className="text-base font-bold text-slate-900">{p.ph_value != null ? Number(p.ph_value).toFixed(2) : '—'}</span>
        </div>
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70">
          <span className="text-[10px] text-slate-500 font-bold uppercase block">Redox</span>
          <span className="text-base font-bold text-slate-900">{p.redox_value != null ? `${Math.round(p.redox_value)} mV` : '—'}</span>
        </div>
      </div>
    </div>
  );
}

function SharedPollsWidget({ data, activeMemberName, onCastSandboxVote, onOpenSandboxModal }) {
  const polls = Array.isArray(data?.polls) ? data.polls : [];
  return (
    <div className="mt-2.5 w-full max-w-2xl space-y-3">
      {polls.map((poll) => (
        <div key={poll.id} className="rounded-2xl bg-white border border-border-subtle p-4 shadow-sm space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-50 text-purple-800 border border-purple-200">
                Scrutin #{poll.id} • {poll.status === 'PROPOSED' ? 'Prêt à ouvrir' : 'Vote ouvert'}
              </span>
              <h4 className="text-sm font-bold text-forest-deep mt-1.5">{poll.title}</h4>
              {poll.description && (
                <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{poll.description}</p>
              )}
            </div>
          </div>
          <WhatsAppPollView
            project={poll}
            currentUser={activeMemberName}
            compact={true}
            onCastVote={(choice) => onCastSandboxVote?.(poll, choice)}
          />
        </div>
      ))}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => onOpenSandboxModal?.('poll', {})}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white hover:bg-purple-50 text-purple-900 border border-purple-200 text-xs font-semibold shadow-2xs cursor-pointer"
        >
          <span className="material-symbols-outlined text-[15px]">add</span>
          <span>Créer un nouveau vote (Bac à sable)</span>
        </button>
      </div>
    </div>
  );
}

function SharedTasksWidget({ data, onCompleteSandboxTask, onOpenSandboxModal }) {
  const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
  const [expandedId, setExpandedId] = useState(null);

  return (
    <div className="mt-2.5 w-full max-w-2xl rounded-2xl bg-white border border-border-subtle p-4 shadow-sm space-y-2.5">
      <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
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
            const isDone = String(t.status || '').toUpperCase().includes('TERMIN');
            const isExpanded = expandedId === t.id;
            return (
              <div
                key={t.id}
                className="p-3 rounded-xl bg-canvas-slate border border-border-subtle space-y-2 transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : t.id)}
                    className="text-left flex-1 min-w-0 cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-mono font-bold text-slate-500">#{t.id}</span>
                      <span className={`text-xs font-bold ${isDone ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                        {t.title}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {t.subject} • {t.charge_points} pts • {(t.assigned_members || []).join(', ') || 'Non assignée'}
                    </div>
                  </button>
                  {!isDone && (
                    <button
                      type="button"
                      onClick={() => onCompleteSandboxTask?.(t)}
                      className="px-2.5 py-1 rounded-full bg-emerald-50 hover:bg-emerald-600 text-emerald-800 hover:text-white border border-emerald-200 text-[11px] font-bold transition-colors cursor-pointer shrink-0"
                      title="Marquer comme terminée dans le bac à sable"
                    >
                      ✓ Valider
                    </button>
                  )}
                </div>

                {isExpanded && t.description && (
                  <div className="pt-2 border-t border-slate-200/70 text-xs text-slate-700 whitespace-pre-wrap">
                    {t.description}
                  </div>
                )}

                {Array.isArray(t.documents) && t.documents.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {t.documents.slice(0, 4).map((d) => (
                      <a
                        key={d.id}
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
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

export function ToasterComponentRenderer({
  components = [],
  activeMemberName = 'Henri Jamet',
  onOpenSandboxModal,
  onCastSandboxVote,
  onCompleteSandboxTask,
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
          if (cid === 'poll_status_card') {
            return (
              <SharedPollsWidget
                key={idx}
                data={comp}
                activeMemberName={activeMemberName}
                onCastSandboxVote={onCastSandboxVote}
                onOpenSandboxModal={onOpenSandboxModal}
              />
            );
          }
          if (cid === 'tasks_overview_card') {
            return (
              <SharedTasksWidget
                key={idx}
                data={comp}
                onCompleteSandboxTask={onCompleteSandboxTask}
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
                    file_type: 'application/pdf',
                  })
                }
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
// 4. MODALE INTERACTIVE BAC À SABLE (Réservation, Tâche, Vote, Document)
// ============================================================================
export function ToasterSandboxFormModal({ modalState, onClose, onSubmitSandboxAction, members = [] }) {
  const isOpen = Boolean(modalState?.type);
  const type = modalState?.type || 'stay';
  const prefill = modalState?.prefill || {};

  const [building, setBuilding] = useState('Presbytère');
  const [startDate, setStartDate] = useState('2026-11-20');
  const [endDate, setEndDate] = useState('2026-11-22');
  const [guestCount, setGuestCount] = useState(2);
  const [activateHeating, setActivateHeating] = useState(true);

  const [taskTitle, setTaskTitle] = useState('');
  const [taskSubject, setTaskSubject] = useState('Presbytère');
  const [taskAssignee, setTaskAssignee] = useState('Henri Jamet');
  const [taskPoints, setTaskPoints] = useState(3);
  const [taskDesc, setTaskDesc] = useState('');

  const [pollTitle, setPollTitle] = useState('');
  const [pollOptionsText, setPollOptionsText] = useState('Samedi 10 avril 2027\nSamedi 17 avril 2027\nSamedi 24 avril 2027');
  const [pollMulti, setPollMulti] = useState(true);

  const [invSupplier, setInvSupplier] = useState('');
  const [invTitle, setInvTitle] = useState('');
  const [invAmount, setInvAmount] = useState('');
  const [invAdvanced, setInvAdvanced] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (prefill.building) setBuilding(prefill.building);
    if (prefill.start_date) setStartDate(prefill.start_date);
    if (prefill.end_date) setEndDate(prefill.end_date);
    if (prefill.title) {
      setTaskTitle(prefill.title);
      setPollTitle(prefill.title);
      setInvTitle(prefill.title);
    }
  }, [isOpen, prefill]);

  if (!isOpen) return null;

  const titles = {
    stay: { icon: 'calendar_month', label: 'Nouvelle réservation de séjour (Bac à sable)' },
    task: { icon: 'add_task', label: 'Créer une tâche opérationnelle (Bac à sable)' },
    poll: { icon: 'how_to_vote', label: 'Créer un scrutin / sondage (Bac à sable)' },
    document: { icon: 'receipt_long', label: 'Enregistrer une facture / dépense (Bac à sable)' },
  };
  const header = titles[type] || titles.stay;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (type === 'stay') {
        await onSubmitSandboxAction('stay', {
          operation: 'create',
          building,
          start_date: startDate,
          end_date: endDate,
          guest_count: Number(guestCount) || 1,
          chambers_used: Math.max(1, Math.ceil((Number(guestCount) || 1) / 2)),
          activate_heating: activateHeating,
        });
      } else if (type === 'task') {
        await onSubmitSandboxAction('task', {
          operation: 'create',
          title: taskTitle.trim(),
          description: taskDesc.trim() || taskTitle.trim(),
          subject: taskSubject,
          assigned_to: taskAssignee,
          charge_points: Number(taskPoints) || 3,
        });
      } else if (type === 'poll') {
        const opts = pollOptionsText
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean);
        await onSubmitSandboxAction('vote', {
          operation: 'create',
          title: pollTitle.trim(),
          options: opts.length > 0 ? opts : ['POUR', 'CONTRE', 'ABSTENTION'],
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
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-border-subtle shadow-2xl overflow-hidden">
        <div className="px-5 py-4 bg-canvas-slate border-b border-border-subtle flex items-center justify-between">
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

        <form onSubmit={handleSubmit} className="p-5 space-y-3.5 text-xs">
          {type === 'stay' && (
            <>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Bâtiment</label>
                <div className="grid grid-cols-2 gap-2">
                  {['Presbytère', 'Rosings'].map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setBuilding(b)}
                      className={`py-2 rounded-xl font-bold border cursor-pointer ${
                        building === b ? 'bg-primary text-white border-primary' : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Arrivée</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Départ</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5 items-center">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Occupants</label>
                  <input
                    type="number"
                    min="1"
                    max="15"
                    value={guestCount}
                    onChange={(e) => setGuestCount(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200"
                  />
                </div>
                <label className="flex items-center gap-2 pt-5 cursor-pointer font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={activateHeating}
                    onChange={(e) => setActivateHeating(e.target.checked)}
                    className="rounded text-primary"
                  />
                  <span>Chauffage 20 °C</span>
                </label>
              </div>
            </>
          )}

          {type === 'task' && (
            <>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Titre de la tâche *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex : Vérifier les paniers skimmers"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200"
                />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Lieu</label>
                  <select
                    value={taskSubject}
                    onChange={(e) => setTaskSubject(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white"
                  >
                    <option>Presbytère</option>
                    <option>Rosings</option>
                    <option>Piscine</option>
                    <option>Jardin &amp; Espaces Verts</option>
                    <option>SCI &amp; Administratif</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Attribuer à</label>
                  <select
                    value={taskAssignee}
                    onChange={(e) => setTaskAssignee(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white"
                  >
                    {(members.length > 0
                      ? members
                      : [
                          { name: 'Henri Jamet' },
                          { name: 'Marguerite Jamet' },
                          { name: 'Hortense Jamet' },
                          { name: 'Joséphine Jamet' },
                          { name: 'Eugénie Jamet' },
                          { name: 'Élisabeth Jamet' },
                        ]
                    ).map((m, i) => (
                      <option key={i} value={m.name || m.nom}>
                        {m.name || m.nom}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Consignes concrètes</label>
                <textarea
                  rows={2}
                  value={taskDesc}
                  onChange={(e) => setTaskDesc(e.target.value)}
                  placeholder="Étapes simples et directes..."
                  className="w-full p-2.5 rounded-xl border border-slate-200"
                />
              </div>
            </>
          )}

          {type === 'poll' && (
            <>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Titre du scrutin *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex : Choix du week-end d'entretien d'automne"
                  value={pollTitle}
                  onChange={(e) => setPollTitle(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Options (une par ligne)</label>
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
                />
                <span>Autoriser plusieurs choix par associé</span>
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
              {submitting ? 'Exécution...' : 'Exécuter en bac à sable'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
