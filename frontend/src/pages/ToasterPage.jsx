import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  ToasterMarkdown,
  ToasterActivityAccordion,
  ToasterComponentRenderer,
  ToasterActionFormModal,
  getMaxRoomsForBuilding,
  getRoomsListForBuilding,
  TASK_SUBJECTS,
  TASK_COMPLEXITIES,
  TASK_PRIORITIES,
  VOTE_PRIORITIES,
  STATUTORY_ASSOCIATES_LIST,
} from '../components/ToasterSharedComponents';
import { uploadUniversalDocument, compressImageIfApplicable } from '../utils/fileUpload';
import TaskDetailModal from '../components/TaskDetailModal';
import VoteRoofModal from '../components/VoteRoofModal';

const STATUTORY_MEMBERS_FALLBACK = [
  { id: 1, prenom: 'Henri', nom: 'Henri Jamet', displayLabel: 'Henri Jamet' },
  { id: 7, prenom: 'Élisabeth', nom: 'Élisabeth Jamet', displayLabel: 'Élisabeth Jamet' },
  { id: 6, prenom: 'Frédéric', nom: 'Frédéric Jamet', displayLabel: 'Frédéric Jamet' },
  { id: 2, prenom: 'Marguerite', nom: 'Marguerite Jamet', displayLabel: 'Marguerite Jamet' },
  { id: 3, prenom: 'Hortense', nom: 'Hortense Jamet', displayLabel: 'Hortense Jamet' },
  { id: 4, prenom: 'Joséphine', nom: 'Joséphine Jamet', displayLabel: 'Joséphine Jamet' },
  { id: 5, prenom: 'Eugénie', nom: 'Eugénie Jamet', displayLabel: 'Eugénie Jamet' },
];

const MONTHS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];
const DAYS_FULL_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const DAYS_SHORT_FR = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
const CAL_HEADERS_FR = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function sanitizeFamilyLabel(raw) {
  if (!raw) return '';
  return String(raw)
    .replace(/Maman\s*\(\s*[ÉE]lisabeth\s*\)\s*Jamet/gi, 'Élisabeth Jamet')
    .replace(/\bMaman\s+Jamet\b/gi, 'Élisabeth Jamet')
    .replace(/\bMaman\b/gi, 'Élisabeth')
    .replace(/\bPapa\b/gi, 'Frédéric')
    .trim();
}

function formatAssociateLabel(member) {
  if (!member) return 'Associé';
  if (member.displayLabel) return sanitizeFamilyLabel(member.displayLabel);
  const prenom = sanitizeFamilyLabel((member.prenom || member.first_name || '').trim());
  const nom = sanitizeFamilyLabel((member.nom || member.name || member.last_name || '').trim());
  if (nom && prenom && nom.toLowerCase().includes(prenom.toLowerCase())) {
    return nom;
  }
  const full = `${prenom} ${nom}`.trim();
  if (full.toLowerCase().includes('élisabeth') || full.toLowerCase().includes('elisabeth')) {
    return 'Élisabeth Jamet';
  }
  return full || 'Associé';
}

function formatAssociatePrenom(member) {
  const full = formatAssociateLabel(member);
  return full.split(' ')[0] || 'Associé';
}

function formatFrDateShort(ymd) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(String(ymd))) return String(ymd || '—');
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (isNaN(dt.getTime())) return String(ymd);
  return `${DAYS_SHORT_FR[dt.getDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

function StayDateTimePickerPopover({
  label,
  dateValue,
  timeValue,
  minDate = null,
  timePresets = ['10:00', '14:00', '15:00', '18:00', '20:00'],
  onChangeDate,
  onChangeTime,
  onClose,
}) {
  const initialParts = /^\d{4}-\d{2}-\d{2}$/.test(String(dateValue || ''))
    ? String(dateValue).split('-').map(Number)
    : null;
  const now = new Date();
  const [year, setYear] = useState(initialParts ? initialParts[0] : now.getFullYear());
  const [month, setMonth] = useState(initialParts ? initialParts[1] - 1 : now.getMonth());

  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, iso, weekday: new Date(year, month, d).getDay() });
  }

  const prevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else setMonth((m) => m + 1);
  };

  return (
    <div className="mt-2 p-3.5 rounded-2xl bg-white border-2 border-emerald-300 shadow-lg w-full max-w-sm space-y-3 z-30">
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
        <span className="text-xs font-bold text-forest-deep">{label}</span>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-700 text-white text-[11px] font-bold cursor-pointer"
        >
          <span>OK</span>
        </button>
      </div>

      {/* Mini-calendrier français */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={prevMonth}
            className="w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-600 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">chevron_left</span>
          </button>
          <span className="text-xs font-bold text-forest-deep capitalize">
            {MONTHS_FR[month]} {year}
          </span>
          <button
            type="button"
            onClick={nextMonth}
            className="w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-600 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">chevron_right</span>
          </button>
        </div>

        <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-bold text-slate-400">
          {CAL_HEADERS_FR.map((h, i) => (
            <div key={i}>{h}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((cell, idx) => {
            if (!cell) return <div key={`e-${idx}`} className="h-7" />;
            const isSelected = cell.iso === dateValue;
            const isDisabled = Boolean(minDate && cell.iso < minDate);
            const isWeekend = cell.weekday === 0 || cell.weekday === 6;
            return (
              <button
                key={cell.iso}
                type="button"
                disabled={isDisabled}
                onClick={() => onChangeDate(cell.iso)}
                className={`h-7 rounded-lg text-[11px] font-semibold transition-colors ${
                  isDisabled
                    ? 'text-slate-300 cursor-not-allowed'
                    : isSelected
                    ? 'bg-emerald-700 text-white font-bold shadow-2xs cursor-pointer'
                    : isWeekend
                    ? 'bg-emerald-50/70 text-emerald-950 hover:bg-emerald-600 hover:text-white cursor-pointer'
                    : 'text-slate-700 hover:bg-emerald-100 hover:text-emerald-950 cursor-pointer'
                }`}
              >
                {cell.day}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sélecteur d'heure + raccourcis */}
      <div className="pt-2 border-t border-slate-100 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
            <span className="material-symbols-outlined text-[15px] text-primary">schedule</span>
            Heure :
          </span>
          <input
            type="time"
            value={timeValue || '15:00'}
            onChange={(e) => onChangeTime(e.target.value)}
            className="h-8 px-2.5 rounded-xl border border-emerald-300 bg-emerald-50/40 text-xs font-bold text-forest-deep focus:outline-none focus:border-emerald-600"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {timePresets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onChangeTime(preset)}
              className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold border cursor-pointer transition-colors ${
                timeValue === preset
                  ? 'bg-emerald-700 text-white border-emerald-700'
                  : 'bg-slate-50 hover:bg-emerald-50 text-slate-700 border-slate-200'
              }`}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  try {
    const token = localStorage.getItem('sci_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
  } catch (_) {}
  return headers;
}

function formatFrenchDateOption(startDate, endDate = null) {
  const d1 = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  if (!endDate || d1.getTime() === endDate.getTime()) {
    return `${DAYS_FULL_FR[d1.getDay()]} ${d1.getDate()} ${MONTHS_FR[d1.getMonth()]} ${d1.getFullYear()}`;
  }
  const d2 = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  const first = d1 <= d2 ? d1 : d2;
  const second = d1 <= d2 ? d2 : d1;
  if (first.getMonth() === second.getMonth() && first.getFullYear() === second.getFullYear()) {
    return `${DAYS_SHORT_FR[first.getDay()]} ${first.getDate()} – ${DAYS_SHORT_FR[second.getDay()]} ${second.getDate()} ${MONTHS_FR[second.getMonth()]} ${second.getFullYear()}`;
  }
  return `${DAYS_SHORT_FR[first.getDay()]} ${first.getDate()} ${MONTHS_FR[first.getMonth()]} – ${DAYS_SHORT_FR[second.getDay()]} ${second.getDate()} ${MONTHS_FR[second.getMonth()]} ${second.getFullYear()}`;
}

function MiniFrenchDatePicker({ onPickDateLabel, onClose }) {
  const now = new Date();
  const [year, setYear] = useState(now.getMonth() >= 10 ? now.getFullYear() + 1 : now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() >= 10 ? 3 : now.getMonth()); // 0-indexed (3 = avril)
  const [rangeMode, setRangeMode] = useState(true);
  const [rangeStart, setRangeStart] = useState(null);

  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(new Date(year, month, d));

  const prevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };
  const nextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  const handleDayClick = (dt) => {
    if (!rangeMode) {
      onPickDateLabel(formatFrenchDateOption(dt));
      onClose();
      return;
    }
    if (!rangeStart) {
      setRangeStart(dt);
    } else {
      onPickDateLabel(formatFrenchDateOption(rangeStart, dt));
      setRangeStart(null);
      onClose();
    }
  };

  return (
    <div className="mt-1.5 p-3 rounded-2xl bg-white border border-purple-200 shadow-lg w-64 space-y-2 z-30">
      <div className="flex items-center justify-between gap-1">
        <button type="button" onClick={prevMonth} className="w-6 h-6 rounded-full hover:bg-slate-100 flex items-center justify-center cursor-pointer">
          <span className="material-symbols-outlined text-[16px]">chevron_left</span>
        </button>
        <span className="text-xs font-bold text-forest-deep capitalize">
          {MONTHS_FR[month]} {year}
        </span>
        <button type="button" onClick={nextMonth} className="w-6 h-6 rounded-full hover:bg-slate-100 flex items-center justify-center cursor-pointer">
          <span className="material-symbols-outlined text-[16px]">chevron_right</span>
        </button>
      </div>

      <div className="flex items-center justify-between gap-1 text-[10.5px]">
        <div className="inline-flex rounded-full bg-slate-100 p-0.5">
          <button
            type="button"
            onClick={() => { setRangeMode(false); setRangeStart(null); }}
            className={`px-2 py-0.5 rounded-full font-semibold cursor-pointer ${!rangeMode ? 'bg-white text-purple-800 shadow-2xs' : 'text-slate-600'}`}
          >
            1 jour
          </button>
          <button
            type="button"
            onClick={() => { setRangeMode(true); setRangeStart(null); }}
            className={`px-2 py-0.5 rounded-full font-semibold cursor-pointer ${rangeMode ? 'bg-white text-purple-800 shadow-2xs' : 'text-slate-600'}`}
          >
            Week-end / Plage
          </button>
        </div>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 cursor-pointer">
          <span className="material-symbols-outlined text-[15px]">close</span>
        </button>
      </div>

      {rangeMode && (
        <p className="text-[10px] text-purple-700 font-medium">
          {rangeStart
            ? `Début : ${rangeStart.getDate()} ${MONTHS_FR[rangeStart.getMonth()]} — cliquez la date de fin`
            : 'Cliquez le jour de début, puis le jour de fin'}
        </p>
      )}

      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-bold text-slate-400">
        {CAL_HEADERS_FR.map((h, i) => (
          <div key={i}>{h}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((dt, idx) => {
          if (!dt) return <div key={`e-${idx}`} className="h-7" />;
          const isStart = rangeStart && dt.getTime() === rangeStart.getTime();
          const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
          return (
            <button
              key={dt.toISOString()}
              type="button"
              onClick={() => handleDayClick(dt)}
              className={`h-7 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                isStart
                  ? 'bg-purple-700 text-white font-bold'
                  : isWeekend
                  ? 'bg-purple-50 text-purple-900 hover:bg-purple-600 hover:text-white'
                  : 'text-slate-700 hover:bg-emerald-50 hover:text-emerald-900'
              }`}
            >
              {dt.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const ACTION_TYPE_META = {
  stay: { icon: 'calendar_month', badge: 'Séjour & Réservation', color: 'bg-amber-100 text-amber-900 border-amber-300' },
  heating: { icon: 'thermostat', badge: 'Chauffage & Piscine', color: 'bg-teal-100 text-teal-900 border-teal-300' },
  expense: { icon: 'receipt_long', badge: 'Facture & Dépense', color: 'bg-rose-100 text-rose-900 border-rose-300' },
  invoice: { icon: 'receipt_long', badge: 'Facture & Dépense', color: 'bg-rose-100 text-rose-900 border-rose-300' },
  document: { icon: 'upload_file', badge: 'Document & Archive', color: 'bg-indigo-100 text-indigo-900 border-indigo-300' },
  task: { icon: 'task_alt', badge: 'Tâche & Chantier', color: 'bg-sky-100 text-sky-900 border-sky-300' },
  comment: { icon: 'forum', badge: 'Message & Fil', color: 'bg-teal-100 text-teal-900 border-teal-300' },
  vote: { icon: 'how_to_vote', badge: 'Scrutin & Vote', color: 'bg-purple-100 text-purple-900 border-purple-300' },
  poll: { icon: 'how_to_vote', badge: 'Scrutin & Vote', color: 'bg-purple-100 text-purple-900 border-purple-300' },
  vademecum: { icon: 'menu_book', badge: 'Vademecum', color: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  treasury: { icon: 'account_balance', badge: 'Trésorerie & CCA', color: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
};

const DOCUMENT_ARCHIVE_CATEGORIES = [
  'Travaux & Chantiers',
  'Factures',
  'Contrats & Assurances',
  'Statuts & Actes',
  'Notices & Plans',
  'Impôts & Taxes',
  'Autre',
];

const PENDING_ACTIONS_PROMPT =
  "Liste tout ce que j'ai à faire actuellement : mes tâches à valider ou qui me sont attribuées, mes votes à valider ou sur lesquels je dois voter, les messages qui me concernent dans les messageries (mentions ou nouveaux messages sur des tâches ou votes attribués), et mes frais ou cotisations à payer.";

const EXAMPLE_QUESTIONS = [
  {
    id: 'wifi',
    icon: 'wifi',
    title: 'Codes Wi-Fi & infos pratiques',
    subtitle: 'Vademecum du Presbytère et de Rosings',
    prompt: 'Quels sont les codes Wi-Fi du Presbytère et de Rosings ?',
  },
  {
    id: 'fioul-piscine',
    icon: 'local_gas_station',
    title: 'Fioul & état de la piscine',
    subtitle: 'Niveau de la cuve et télémétrie Klereo',
    prompt: "Quel est le niveau de la cuve à fioul et l'état actuel de la piscine ?",
  },
  {
    id: 'sejour',
    icon: 'calendar_add_on',
    title: 'Réserver un séjour',
    subtitle: 'Préparer dates, chambres et chauffage',
    prompt: 'Je voudrais réserver le Presbytère pour le week-end prochain',
  },
  {
    id: 'equite-treso',
    icon: 'leaderboard',
    title: 'Équité & trésorerie SCI',
    subtitle: 'Classement participatif et compte Swan',
    prompt: "Montre-moi le classement d'équité participative et l'état de la trésorerie SCI",
  },
];

export default function ToasterPage({ currentUser }) {
  const [selectedMemberId, setSelectedMemberId] = useState(() => {
    if (currentUser && typeof currentUser === 'object' && currentUser.id) {
      return Number(currentUser.id);
    }
    return 1;
  });

  const [portalState, setPortalState] = useState(null);
  const [loadingState, setLoadingState] = useState(true);
  const [errorBanner, setErrorBanner] = useState(null);
  const [lastFailedPrompt, setLastFailedPrompt] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // Fil de conversation & streaming SSE
  const [messages, setMessages] = useState([]);
  const [isWelcomeExiting, setIsWelcomeExiting] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const chatInputRef = useRef(null);

  // Lecture audio TTS à la demande (gemini-3.8-flash-lite-tts, auto sur message vocal uniquement)
  const [ttsState, setTtsState] = useState({ msgId: null, status: 'idle' }); // 'idle' | 'loading' | 'playing' | 'paused'
  const ttsAudioRef = useRef(null);
  const ttsCacheRef = useRef({});
  const ttsActiveMsgRef = useRef(null);

  // Modale de formulaire ouverte depuis un composant partagé
  const [actionModalState, setActionModalState] = useState(null);
  // Modales réelles de consultation / arbitrage (Annotations 2, 8, 9)
  const [inspectingTask, setInspectingTask] = useState(null);
  const [inspectingPoll, setInspectingPoll] = useState(null);

  // Pièce jointe multimodale (Photo / PDF / Document)
  const [attachment, setAttachment] = useState(null);
  const [isDraggingOverChat, setIsDraggingOverChat] = useState(false);
  const fileInputRef = useRef(null);
  const latestAttachedFileRef = useRef(null);

  // Dictée vocale fluide :
  // - bouton Micro pendant l'enregistrement -> arrête et transcrit dans la zone de saisie (sans envoyer)
  // - bouton Envoyer pendant l'enregistrement -> arrête la transcription et envoie dès qu'elle est finalisée
  // - 15s de silence total -> arrête et transcrit dans la zone de saisie
  const [isListening, setIsListening] = useState(false);
  const [isFinalizingVoice, setIsFinalizingVoice] = useState(false);
  const [liveVoicePreview, setLiveVoicePreview] = useState('');
  const recognitionRef = useRef(null);
  const inputTextRef = useRef('');
  const voiceCommittedRef = useRef('');
  const voiceSessionTranscriptRef = useRef('');
  const voiceWantListeningRef = useRef(false);
  const voiceAbortedRef = useRef(false);
  const voiceSentRef = useRef(false);
  const voiceStopActionRef = useRef(null); // null | 'transcribe' | 'send'
  const voiceSilenceTimerRef = useRef(null);
  const voiceRestartTimerRef = useRef(null);
  const voiceFinalizingTimerRef = useRef(null);
  const sendVoiceTriggerRef = useRef(null);

  // Édition inline d'un champ déduit 🟢 / saisie libre 🔴 / popovers calendrier & heure / saisies invités
  const [editingField, setEditingField] = useState(null);
  const [customMissingInputs, setCustomMissingInputs] = useState({});
  const [openDatePickerTarget, setOpenDatePickerTarget] = useState(null); // { msgId, optIdx }
  const [openStayPicker, setOpenStayPicker] = useState(null); // { msgId, which: 'start' | 'end' }
  const [stayExternalInputs, setStayExternalInputs] = useState({});

  const chatScrollRef = useRef(null);
  const prevMsgCountRef = useRef(0);
  const wasSendingRef = useRef(false);
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  }, []);

  const speechSupported = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }, []);

  // Annotation 1 (Batch 1) : Redimensionnement automatique du textarea jusqu'à 7 lignes max
  useEffect(() => {
    const el = chatInputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const computed = typeof window !== 'undefined' ? window.getComputedStyle(el) : null;
    const lineHeight = parseFloat(computed?.lineHeight || '22') || 22;
    const padTop = parseFloat(computed?.paddingTop || '10') || 10;
    const padBottom = parseFloat(computed?.paddingBottom || '10') || 10;
    const maxHeight = Math.round(lineHeight * 7 + padTop + padBottom);
    const nextHeight = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${Math.max(40, nextHeight)}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [inputText, isListening]);

  // Contrôleur TTS intelligent (cache local par message -> zéro appel redondant en pause/reprise/relecture)
  const stopTtsPlayback = useCallback(() => {
    const audio = ttsAudioRef.current;
    if (audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch (_) {}
    }
    ttsActiveMsgRef.current = null;
    setTtsState({ msgId: null, status: 'idle' });
  }, []);

  useEffect(() => {
    return () => {
      stopTtsPlayback();
      Object.values(ttsCacheRef.current || {}).forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch (_) {}
      });
      ttsCacheRef.current = {};
    };
  }, [stopTtsPlayback]);

  const playTtsForMessage = useCallback(
    async (msgId, rawText, { forceRestart = false } = {}) => {
      const text = String(rawText || '').trim();
      if (!msgId || !text) return;

      // Pause / Reprise instantanée sans rappel API si c'est le message actif
      if (!forceRestart && ttsActiveMsgRef.current === msgId && ttsAudioRef.current) {
        const audio = ttsAudioRef.current;
        if (!audio.paused && !audio.ended) {
          audio.pause();
          setTtsState({ msgId, status: 'paused' });
          return;
        }
        if (audio.paused && !audio.ended && audio.currentTime > 0) {
          try {
            await audio.play();
            setTtsState({ msgId, status: 'playing' });
            return;
          } catch (_) {}
        }
      }

      // Arrêter une éventuelle autre lecture en cours
      if (ttsAudioRef.current) {
        try {
          ttsAudioRef.current.pause();
        } catch (_) {}
      }
      ttsActiveMsgRef.current = msgId;

      let objectUrl = ttsCacheRef.current[msgId] || null;
      if (!objectUrl) {
        setTtsState({ msgId, status: 'loading' });
        try {
          const res = await fetch('/api/toaster/tts', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ text, voice_name: 'Charon' }),
          });
          if (!res.ok) {
            let detail = `Erreur TTS HTTP ${res.status}`;
            try {
              const errJson = await res.json();
              detail = errJson.detail || detail;
            } catch (_) {}
            throw new Error(detail);
          }
          const blob = await res.blob();
          objectUrl = URL.createObjectURL(blob);
          ttsCacheRef.current[msgId] = objectUrl;
        } catch (err) {
          console.error('Erreur TTS gemini-3.8-flash-lite-tts:', err);
          if (ttsActiveMsgRef.current === msgId) {
            ttsActiveMsgRef.current = null;
            setTtsState({ msgId: null, status: 'idle' });
          }
          showToast(`Lecture vocale indisponible : ${err.message}`);
          return;
        }
      }

      // Si l'utilisateur a annulé / changé de message pendant le chargement
      if (ttsActiveMsgRef.current !== msgId) return;

      const audio = new Audio(objectUrl);
      ttsAudioRef.current = audio;
      audio.onended = () => {
        if (ttsActiveMsgRef.current === msgId) {
          ttsActiveMsgRef.current = null;
          setTtsState({ msgId: null, status: 'idle' });
        }
      };
      audio.onerror = () => {
        if (ttsActiveMsgRef.current === msgId) {
          ttsActiveMsgRef.current = null;
          setTtsState({ msgId: null, status: 'idle' });
        }
      };

      try {
        await audio.play();
        setTtsState({ msgId, status: 'playing' });
      } catch (playErr) {
        console.warn('Lecture audio bloquée par le navigateur:', playErr);
        setTtsState({ msgId, status: 'paused' });
      }
    },
    [showToast]
  );

  const loadPortalState = useCallback(
    async (memberId = selectedMemberId) => {
      setLoadingState(true);
      try {
        const res = await fetch(`/api/toaster/state?member_id=${encodeURIComponent(memberId)}`, {
          method: 'GET',
          headers: getAuthHeaders(),
        });
        if (!res.ok) {
          let detail = `Erreur HTTP ${res.status}`;
          try {
            const errJson = await res.json();
            detail = errJson.detail || errJson.error || errJson.message || detail;
          } catch (_) {}
          throw new Error(detail);
        }
        const data = await res.json();
        setPortalState(data);
        if (data?.active_member?.id && Number(data.active_member.id) !== Number(memberId)) {
          setSelectedMemberId(Number(data.active_member.id));
        }
      } catch (err) {
        console.error('Erreur chargement état Grille-Pain:', err);
        setErrorBanner(`Impossible de charger les données du portail : ${err.message}`);
      } finally {
        setLoadingState(false);
      }
    },
    [selectedMemberId]
  );

  // Synchroniser automatiquement avec l'utilisateur connecté
  useEffect(() => {
    if (!currentUser) return;
    if (typeof currentUser === 'object' && currentUser.id) {
      setSelectedMemberId(Number(currentUser.id));
    } else if (typeof currentUser === 'string' && portalState?.members?.length) {
      const target = currentUser.toLowerCase();
      const found = portalState.members.find(
        (m) =>
          (m.prenom && target.includes(m.prenom.toLowerCase())) ||
          (m.name && target.includes(m.name.toLowerCase()))
      );
      if (found) setSelectedMemberId(Number(found.id));
    }
  }, [currentUser, portalState?.members]);

  useEffect(() => {
    loadPortalState(selectedMemberId);
  }, [selectedMemberId, loadPortalState]);

  // Annotation 4 : ne scroller la zone de discussion QUE lors d'un nouveau message ou démarrage d'envoi,
  // JAMAIS lorsqu'un utilisateur remplit/modifie un composant ou une carte d'action !
  useEffect(() => {
    const countIncreased = messages.length > prevMsgCountRef.current;
    const startedSending = isSending && !wasSendingRef.current;
    prevMsgCountRef.current = messages.length;
    wasSendingRef.current = isSending;

    if (countIncreased || startedSending) {
      const container = chatScrollRef.current;
      if (container) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      }
    }
  }, [messages.length, isSending]);

  const membersOptions = useMemo(() => {
    const rawMembers = portalState?.members;
    if (Array.isArray(rawMembers) && rawMembers.length > 0) {
      return rawMembers.map((m) => ({
        ...m,
        prenom: sanitizeFamilyLabel(m.prenom),
        name: sanitizeFamilyLabel(m.name || m.nom),
        displayLabel: formatAssociateLabel(m),
      }));
    }
    return STATUTORY_MEMBERS_FALLBACK;
  }, [portalState]);

  const activeMemberObj = useMemo(() => {
    return (
      portalState?.active_member ||
      membersOptions.find((m) => Number(m.id) === Number(selectedMemberId)) ||
      membersOptions[0]
    );
  }, [membersOptions, selectedMemberId, portalState]);

  const isCoordinator = useMemo(() => {
    const labelLower = formatAssociateLabel(activeMemberObj).toLowerCase();
    return Boolean(
      activeMemberObj?.is_coordinator === true ||
        activeMemberObj?.is_coordinator === 1 ||
        labelLower.includes('henri') ||
        labelLower.includes('joséphine') ||
        labelLower.includes('josephine')
    );
  }, [activeMemberObj]);

  const associateChoices = useMemo(() => {
    const names = membersOptions.map((m) => m.displayLabel || m.name).filter(Boolean);
    return names.length >= 5 ? names : STATUTORY_ASSOCIATES_LIST;
  }, [membersOptions]);

  const attachLocalFile = useCallback(async (rawFile) => {
    if (!rawFile) return;
    setErrorBanner(null);
    const detectedMime =
      rawFile.type ||
      (rawFile.name.toLowerCase().endsWith('.pdf')
        ? 'application/pdf'
        : rawFile.name.toLowerCase().endsWith('.png')
        ? 'image/png'
        : 'image/jpeg');

    try {
      // Préparer un aperçu léger pour l'analyse multimodale (tout en conservant rawFile pour upload Drive/PostgreSQL)
      let fileForPreview = rawFile;
      const isImg = detectedMime.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(rawFile.name || '');
      if (isImg && rawFile.size > 1.2 * 1024 * 1024) {
        fileForPreview = await compressImageIfApplicable(rawFile);
      }

      const maxInlineBytes = 2.9 * 1024 * 1024;
      let base64Clean = null;
      if (fileForPreview.size <= maxInlineBytes) {
        base64Clean = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const resultStr = String(reader.result || '');
            resolve(resultStr.includes(',') ? resultStr.split(',')[1] : resultStr);
          };
          reader.onerror = () => reject(new Error('Impossible de lire le fichier sélectionné.'));
          reader.readAsDataURL(fileForPreview);
        });
      }

      const attObj = {
        file: rawFile,
        name: rawFile.name,
        mime: detectedMime,
        base64: base64Clean,
        size: rawFile.size,
      };
      latestAttachedFileRef.current = attObj;
      setAttachment(attObj);
    } catch (err) {
      setErrorBanner(err.message || 'Impossible de lire le fichier sélectionné.');
    }
  }, []);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      attachLocalFile(file);
    }
    e.target.value = '';
  };

  const normalizeActionCard = useCallback(
    (rawCard, turnAttachedFile = null) => {
      if (!rawCard || typeof rawCard !== 'object') return null;
      const deduced = Array.isArray(rawCard.deduced_fields)
        ? rawCard.deduced_fields.map((f) => ({
            key: f.key || f.name || f.label,
            label: f.label || f.key || 'Champ',
            value: f.value !== undefined && f.value !== null ? String(f.value) : '',
            raw_value: f.raw_value !== undefined ? f.raw_value : f.value,
          }))
        : [];

      const missing = Array.isArray(rawCard.missing_fields)
        ? rawCard.missing_fields.map((f) => ({
            key: f.key || f.name || f.label,
            label: f.label || f.key || 'Précision requise',
            question: f.question || f.label || `Veuillez préciser : ${f.key}`,
            options: Array.isArray(f.options)
              ? f.options.map((opt) =>
                  typeof opt === 'object' && opt !== null
                    ? { label: String(opt.label ?? opt.value ?? ''), value: opt.value !== undefined ? opt.value : opt.label }
                    : { label: String(opt), value: opt }
                )
              : [],
          }))
        : [];

      const basePayload = rawCard.payload && typeof rawCard.payload === 'object' ? { ...rawCard.payload } : {};
      deduced.forEach((d) => {
        if (d.key && basePayload[d.key] === undefined) {
          basePayload[d.key] = d.raw_value !== undefined ? d.raw_value : d.value;
        }
      });

      if (rawCard.action_type === 'vote' || rawCard.action_type === 'poll') {
        if (!Array.isArray(basePayload.options)) {
          const rawOpts = basePayload.options;
          basePayload.options =
            typeof rawOpts === 'string' && rawOpts.trim()
              ? rawOpts.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)
              : ['Approuver le projet', 'Rejeter le projet'];
        }
        if (!basePayload.category) basePayload.category = 'Presbytère';
        if (!basePayload.priority) basePayload.priority = 'Normale';
        if (basePayload.estimated_cost === undefined) basePayload.estimated_cost = 0;
        if (basePayload.allow_multiple_choices === undefined) {
          basePayload.allow_multiple_choices = basePayload.options.length > 3;
        }
      }

      if (rawCard.action_type === 'stay') {
        if (!Array.isArray(basePayload.selected_rooms)) {
          const sr = basePayload.selected_rooms;
          basePayload.selected_rooms =
            typeof sr === 'string' && sr.trim()
              ? sr.split(',').map((s) => s.trim()).filter(Boolean)
              : [];
        }
        if (!Array.isArray(basePayload.selected_members)) {
          const sm = basePayload.selected_members;
          basePayload.selected_members =
            typeof sm === 'string' && sm.trim()
              ? sm.split(',').map((s) => sanitizeFamilyLabel(s.trim())).filter(Boolean)
              : [formatAssociateLabel(activeMemberObj)];
        }
        if (!Array.isArray(basePayload.external_guests)) {
          const eg = basePayload.external_guests;
          basePayload.external_guests =
            typeof eg === 'string' && eg.trim()
              ? eg.split(',').map((s) => s.trim()).filter(Boolean)
              : [];
        }
        if (!basePayload.arrival_time) basePayload.arrival_time = '15:00';
        if (!basePayload.departure_time) basePayload.departure_time = '11:00';
        if (basePayload.activate_heating === undefined) basePayload.activate_heating = false;
        if (basePayload.activate_dhw === undefined) {
          basePayload.activate_dhw = Boolean(
            basePayload.activate_heating || String(basePayload.building || '').toLowerCase().includes('presbyt')
          );
        } else if (basePayload.activate_heating) {
          basePayload.activate_dhw = true;
        }
        if (basePayload.activate_pool === undefined) basePayload.activate_pool = false;
      }

      if (rawCard.action_type === 'task') {
        basePayload.checklist = [];
      }

      if (rawCard.action_type === 'document') {
        if (!basePayload.operation) basePayload.operation = 'archive';
        if (!basePayload.organisme) basePayload.organisme = 'SCI';
        if (!basePayload.category) basePayload.category = 'Travaux & Chantiers';
      }

      const candidateFile =
        turnAttachedFile ||
        (basePayload.attach_uploaded_file || rawCard.action_type === 'document'
          ? latestAttachedFileRef.current
          : null);
      const supportsFileAttachment =
        rawCard.action_type === 'document' ||
        rawCard.action_type === 'expense' ||
        (rawCard.action_type === 'task' && basePayload.operation === 'create') ||
        (rawCard.action_type === 'vote' && basePayload.operation === 'create');
      const localFileObj =
        candidateFile?.file &&
        supportsFileAttachment &&
        (turnAttachedFile?.file ||
          rawCard.action_type === 'document' ||
          rawCard.action_type === 'expense' ||
          basePayload.attach_uploaded_file)
          ? candidateFile
          : null;
      if (localFileObj) {
        if (basePayload.attach_uploaded_file === undefined) {
          basePayload.attach_uploaded_file = true;
        }
        if (!basePayload.document_filename) {
          basePayload.document_filename = localFileObj.name;
        }
      }

      return {
        action_type: rawCard.action_type || 'action',
        title: sanitizeFamilyLabel(rawCard.title || 'Proposition d’action'),
        deduced_fields: deduced,
        missing_fields: missing,
        ready_to_execute: missing.length === 0 ? true : Boolean(rawCard.ready_to_execute && missing.length === 0),
        payload: basePayload,
        localFileObj,
        executed: false,
        executing: false,
        executionResult: null,
        executionError: null,
      };
    },
    [activeMemberObj]
  );

  const sendMessagePayload = useCallback(
    async ({ textOverride = null, clearComposerText = true, fromVoice = false } = {}) => {
      const rawText = textOverride !== null ? String(textOverride) : inputText;
      const trimmed = rawText.trim();
      const currentAttachment = textOverride !== null ? null : attachment;

      if ((!trimmed && !currentAttachment) || isSending) return;

      // Animation élégante de sortie du portrait Mr. Collins au tout premier message envoyé
      if (messagesRef.current.length === 0) {
        setIsWelcomeExiting(true);
        setTimeout(() => setIsWelcomeExiting(false), 320);
      }

      const nowTs = Date.now();
      const userMsg = {
        id: `user-${nowTs}`,
        role: 'user',
        content: trimmed || (currentAttachment ? `[Pièce jointe : ${currentAttachment.name}]` : ''),
        attachment: currentAttachment
          ? { name: currentAttachment.name, mime: currentAttachment.mime, size: currentAttachment.size }
          : null,
        timestamp: new Date().toISOString(),
      };

      const assistantId = `assistant-${nowTs + 1}`;
      const assistantPlaceholder = {
        id: assistantId,
        role: 'assistant',
        content: '',
        thoughts: '',
        toolSteps: [],
        uiComponents: [],
        action_card: null,
        isStreaming: true,
        timestamp: new Date().toISOString(),
      };

      // Fix Ann. 5/6 : ne jamais inclure dans l'historique un tour assistant vide issu d'une erreur précédente
      const historyForApi = [...messagesRef.current, userMsg]
        .filter((m) => m.role === 'user' || (m.content && m.content.trim().length > 0))
        .map((m) => ({
          role: m.role === 'assistant' || m.role === 'model' ? 'assistant' : 'user',
          content: m.content,
        }));

      setMessages((prev) => [...prev, userMsg, assistantPlaceholder]);
      if (clearComposerText) {
        setInputText('');
        setAttachment(null);
      }
      setIsSending(true);
      setErrorBanner(null);
      setLastFailedPrompt(null);

      const updateAssistant = (updater) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? updater(m) : m))
        );
      };

      const body = {
        member_id: Number(selectedMemberId),
        messages: historyForApi,
        attachment_base64: currentAttachment ? currentAttachment.base64 : null,
        attachment_mime: currentAttachment ? currentAttachment.mime : null,
        attachment_name: currentAttachment ? currentAttachment.name : null,
      };

      let receivedDone = false;
      let streamedCardIdx = 0;

      const processSseFrame = (frame) => {
        const lines = frame.split('\n');
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine.startsWith('data:')) continue;
          const jsonPayload = trimmedLine.slice(5).trim();
          if (!jsonPayload) continue;

          let ev;
          try {
            ev = JSON.parse(jsonPayload);
          } catch (_) {
            continue;
          }

          if (ev.type === 'error') {
            throw new Error(ev.detail || 'Erreur lors du traitement de la demande.');
          }

          if (ev.type === 'thought_delta' && ev.delta) {
            updateAssistant((m) => ({
              ...m,
              thoughts: `${m.thoughts || ''}${ev.delta}`,
            }));
          } else if (ev.type === 'tool_step' && ev.step) {
            updateAssistant((m) => {
              const prevSteps = Array.isArray(m.toolSteps) ? [...m.toolSteps] : [];
              const existingIdx = prevSteps.findIndex((s) => s.id === ev.step.id);
              if (existingIdx >= 0) prevSteps[existingIdx] = ev.step;
              else prevSteps.push(ev.step);
              return { ...m, toolSteps: prevSteps };
            });
          } else if (ev.type === 'ui_component' && ev.component) {
            updateAssistant((m) => ({
              ...m,
              uiComponents: [...(m.uiComponents || []), ev.component],
            }));
          } else if (ev.type === 'text_delta' && ev.delta) {
            updateAssistant((m) => ({
              ...m,
              content: sanitizeFamilyLabel(`${m.content || ''}${ev.delta}`),
            }));
          } else if (ev.type === 'action_card' && ev.action_card) {
            const cardObj = normalizeActionCard(ev.action_card, currentAttachment);
            const cardIdx = streamedCardIdx;
            streamedCardIdx += 1;
            if (cardIdx === 0) {
              updateAssistant((m) => ({
                ...m,
                action_card: cardObj,
              }));
            } else {
              const companionId = `${assistantId}-card-${cardIdx}`;
              setMessages((prev) => {
                if (prev.some((m) => m.id === companionId)) {
                  return prev.map((m) => (m.id === companionId ? { ...m, action_card: cardObj } : m));
                }
                return [
                  ...prev,
                  {
                    id: companionId,
                    role: 'assistant',
                    content: '',
                    thoughts: '',
                    toolSteps: [],
                    uiComponents: [],
                    action_card: cardObj,
                    isCompanionCard: true,
                    isStreaming: false,
                    timestamp: new Date().toISOString(),
                  },
                ];
              });
            }
          } else if (ev.type === 'done') {
            receivedDone = true;
            const finalReply = sanitizeFamilyLabel(ev.reply || ev.message || ev.content || '');
            const rawCardsList =
              Array.isArray(ev.action_cards) && ev.action_cards.length > 0
                ? ev.action_cards
                : ev.action_card
                ? [ev.action_card]
                : [];
            const normalizedCards = rawCardsList
              .map((rc) => normalizeActionCard(rc, currentAttachment))
              .filter(Boolean);
            const finalCard = normalizedCards[0] || null;
            updateAssistant((m) => ({
              ...m,
              content: finalReply || m.content,
              thoughts: ev.thoughts !== undefined ? ev.thoughts : m.thoughts,
              toolSteps: Array.isArray(ev.tool_steps) && ev.tool_steps.length > 0 ? ev.tool_steps : m.toolSteps,
              uiComponents: Array.isArray(ev.ui_components) ? ev.ui_components : m.uiComponents,
              action_card: finalCard || m.action_card,
              isStreaming: false,
            }));
            if (normalizedCards.length > 1) {
              setMessages((prev) => {
                const next = [...prev];
                for (let idx = 1; idx < normalizedCards.length; idx += 1) {
                  const companionId = `${assistantId}-card-${idx}`;
                  const existingPos = next.findIndex((m) => m.id === companionId);
                  if (existingPos >= 0) {
                    next[existingPos] = { ...next[existingPos], action_card: normalizedCards[idx] };
                  } else {
                    next.push({
                      id: companionId,
                      role: 'assistant',
                      content: '',
                      thoughts: '',
                      toolSteps: [],
                      uiComponents: [],
                      action_card: normalizedCards[idx],
                      isCompanionCard: true,
                      isStreaming: false,
                      timestamp: new Date().toISOString(),
                    });
                  }
                }
                return next;
              });
            }
            if (ev.state) {
              setPortalState(ev.state);
            }
            // TTS automatique UNIQUEMENT lorsque le message a été envoyé via l'input vocal (Annotation 2)
            if (fromVoice && finalReply && finalReply.trim()) {
              playTtsForMessage(assistantId, finalReply, { forceRestart: true });
            }
          }
        }
      };

      try {
        const res = await fetch('/api/toaster/chat/stream', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          let detail = `Erreur HTTP ${res.status}`;
          try {
            const errJson = await res.json();
            detail = errJson.detail || errJson.error || errJson.message || detail;
          } catch (_) {}
          throw new Error(detail);
        }

        if (!res.body) {
          throw new Error('Flux de réponse indisponible.');
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let sseBuffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          sseBuffer += decoder.decode(value, { stream: true });
          const frames = sseBuffer.split('\n\n');
          sseBuffer = frames.pop() || '';
          for (const frame of frames) {
            processSseFrame(frame);
          }
        }

        // Flush final du tampon SSE (Fix Ann. 5/6)
        sseBuffer += decoder.decode();
        if (sseBuffer.trim()) {
          for (const frame of sseBuffer.split('\n\n')) {
            if (frame.trim()) processSseFrame(frame);
          }
        }

        if (!receivedDone) {
          throw new Error(
            "La connexion avec l'assistant a été interrompue avant la fin de la réponse (timeout). Cliquez sur Réessayer."
          );
        }
      } catch (err) {
        console.error('Erreur /api/toaster/chat/stream:', err);
        setErrorBanner(`Erreur lors de l'appel à l'assistant : ${err.message}`);
        setLastFailedPrompt(trimmed);
        // Fail-Fast : retirer la bulle assistant incomplète (et éviter toute fuite dans le tour suivant)
        setMessages((prev) =>
          prev.filter((m) => !(m.id === assistantId && !m.content && !m.action_card))
        );
        updateAssistant((m) => (m.isStreaming ? { ...m, isStreaming: false } : m));
      } finally {
        setIsSending(false);
      }
    },
    [inputText, attachment, isSending, selectedMemberId, normalizeActionCard, playTtsForMessage]
  );

  useEffect(() => {
    sendVoiceTriggerRef.current = sendMessagePayload;
  }, [sendMessagePayload]);

  useEffect(() => {
    inputTextRef.current = inputText;
  }, [inputText]);

  const VOICE_SILENCE_TIMEOUT_MS = 15000;
  const VOICE_FINALIZE_TIMEOUT_MS = 1500;

  const clearVoiceTimers = useCallback(() => {
    if (voiceSilenceTimerRef.current) {
      clearTimeout(voiceSilenceTimerRef.current);
      voiceSilenceTimerRef.current = null;
    }
    if (voiceRestartTimerRef.current) {
      clearTimeout(voiceRestartTimerRef.current);
      voiceRestartTimerRef.current = null;
    }
    if (voiceFinalizingTimerRef.current) {
      clearTimeout(voiceFinalizingTimerRef.current);
      voiceFinalizingTimerRef.current = null;
    }
  }, []);

  const getCombinedVoiceTranscript = useCallback(() => {
    return [voiceCommittedRef.current, voiceSessionTranscriptRef.current]
      .map((s) => (s || '').trim())
      .filter(Boolean)
      .join(' ')
      .trim();
  }, []);

  const completeVoiceSession = useCallback(
    (explicitAction = null) => {
      const action = explicitAction || voiceStopActionRef.current || 'transcribe';
      clearVoiceTimers();
      voiceWantListeningRef.current = false;
      voiceAbortedRef.current = false;
      voiceStopActionRef.current = null;

      const finalSpoken = getCombinedVoiceTranscript();
      const typedDraft = (inputTextRef.current || '').trim();
      const combinedMessage = [typedDraft, finalSpoken].filter(Boolean).join(' ').trim();

      voiceCommittedRef.current = '';
      voiceSessionTranscriptRef.current = '';
      setLiveVoicePreview('');
      setIsListening(false);
      setIsFinalizingVoice(false);

      if (recognitionRef.current) {
        const rec = recognitionRef.current;
        recognitionRef.current = null;
        try {
          rec.onend = null;
          rec.onerror = null;
          rec.onresult = null;
          rec.abort();
        } catch (_) {}
      }

      if (action === 'send') {
        if (!voiceSentRef.current && (combinedMessage || attachment) && sendVoiceTriggerRef.current) {
          voiceSentRef.current = true;
          sendVoiceTriggerRef.current({
            textOverride: combinedMessage,
            clearComposerText: true,
            fromVoice: true,
          });
        }
      } else {
        inputTextRef.current = combinedMessage;
        setInputText(combinedMessage);
        requestAnimationFrame(() => {
          chatInputRef.current?.focus();
        });
      }
    },
    [attachment, clearVoiceTimers, getCombinedVoiceTranscript]
  );

  const requestStopVoice = useCallback(
    (action) => {
      if (voiceSilenceTimerRef.current) {
        clearTimeout(voiceSilenceTimerRef.current);
        voiceSilenceTimerRef.current = null;
      }
      if (voiceRestartTimerRef.current) {
        clearTimeout(voiceRestartTimerRef.current);
        voiceRestartTimerRef.current = null;
      }

      voiceWantListeningRef.current = false;
      voiceStopActionRef.current = action;

      // Si une session SpeechRecognition est active, on appelle stop() SANS couper onresult/onend
      // pour laisser le navigateur finaliser les derniers mots avant de transcrire ou d'envoyer.
      const activeRec = recognitionRef.current;
      if (activeRec) {
        const alreadyStopping = Boolean(voiceFinalizingTimerRef.current);
        setIsFinalizingVoice(true);
        if (!alreadyStopping) {
          voiceFinalizingTimerRef.current = setTimeout(() => {
            completeVoiceSession(voiceStopActionRef.current || action);
          }, VOICE_FINALIZE_TIMEOUT_MS);
          try {
            activeRec.stop();
          } catch (_) {
            completeVoiceSession(action);
          }
        }
        return;
      }

      completeVoiceSession(action);
    },
    [completeVoiceSession]
  );

  const resetVoiceSilenceTimer = useCallback(() => {
    if (voiceSilenceTimerRef.current) {
      clearTimeout(voiceSilenceTimerRef.current);
    }
    voiceSilenceTimerRef.current = setTimeout(() => {
      if (voiceWantListeningRef.current) {
        requestStopVoice('transcribe');
      }
    }, VOICE_SILENCE_TIMEOUT_MS);
  }, [requestStopVoice]);

  const startRecognitionSession = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition || !voiceWantListeningRef.current) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    voiceSessionTranscriptRef.current = '';

    recognition.onstart = () => {
      setIsListening(true);
      setErrorBanner(null);
    };

    recognition.onspeechstart = () => {
      if (voiceWantListeningRef.current) {
        resetVoiceSilenceTimer();
      }
    };

    recognition.onresult = (event) => {
      const pieces = [];
      for (let i = 0; i < event.results.length; i += 1) {
        const seg = event.results[i]?.[0]?.transcript || '';
        if (seg) pieces.push(seg.trim());
      }
      const nextSession = pieces.join(' ').trim();
      if (nextSession !== voiceSessionTranscriptRef.current) {
        voiceSessionTranscriptRef.current = nextSession;
        const preview = [voiceCommittedRef.current, nextSession].filter(Boolean).join(' ').trim();
        setLiveVoicePreview(preview);
        if (voiceWantListeningRef.current) {
          resetVoiceSilenceTimer();
        }
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed' || event.error === 'audio-capture') {
        console.warn('Erreur dictée vocale fatale:', event.error);
        if (recognitionRef.current === recognition) {
          recognitionRef.current = null;
        }
        voiceWantListeningRef.current = false;
        voiceAbortedRef.current = true;
        voiceStopActionRef.current = null;
        clearVoiceTimers();
        setIsListening(false);
        setIsFinalizingVoice(false);
        setLiveVoicePreview('');
        setErrorBanner("Impossible d'accéder au microphone pour la dictée vocale.");
        return;
      }
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        console.warn('Erreur dictée vocale:', event.error);
      }
    };

    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }

      if (voiceSessionTranscriptRef.current.trim()) {
        voiceCommittedRef.current = [voiceCommittedRef.current, voiceSessionTranscriptRef.current.trim()]
          .filter(Boolean)
          .join(' ')
          .trim();
        voiceSessionTranscriptRef.current = '';
      }

      if (voiceAbortedRef.current) {
        clearVoiceTimers();
        setIsListening(false);
        setIsFinalizingVoice(false);
        setLiveVoicePreview('');
        return;
      }

      // Redémarrage transparent si le navigateur coupe automatiquement (ex. Chrome/Android après courte pause)
      if (voiceWantListeningRef.current) {
        voiceRestartTimerRef.current = setTimeout(() => {
          if (voiceWantListeningRef.current && !voiceAbortedRef.current) {
            try {
              startRecognitionSession();
            } catch (restartErr) {
              console.warn('Échec reprise dictée continue:', restartErr);
              completeVoiceSession('transcribe');
            }
          }
        }, 80);
        return;
      }

      completeVoiceSession(voiceStopActionRef.current || 'transcribe');
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (startErr) {
      console.warn('Échec démarrage dictée vocale:', startErr);
      recognitionRef.current = null;
      completeVoiceSession('transcribe');
    }
  }, [clearVoiceTimers, completeVoiceSession, resetVoiceSilenceTimer]);

  useEffect(() => {
    return () => {
      voiceWantListeningRef.current = false;
      voiceAbortedRef.current = true;
      voiceStopActionRef.current = null;
      clearVoiceTimers();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (_) {}
      }
    };
  }, [clearVoiceTimers]);

  const handleSendMessage = (e) => {
    if (e) e.preventDefault();
    if (isListening || isFinalizingVoice || voiceWantListeningRef.current) {
      requestStopVoice('send');
      return;
    }
    sendMessagePayload({ textOverride: null, clearComposerText: true });
  };

  const handleToggleSpeech = () => {
    if (!speechSupported) {
      setErrorBanner('La reconnaissance vocale n’est pas supportée par ce navigateur.');
      return;
    }
    if (isListening || isFinalizingVoice || voiceWantListeningRef.current) {
      // Appuyer sur Micro arrête la dictée et transcrit dans la zone de saisie (sans envoyer)
      if (!isFinalizingVoice) {
        requestStopVoice('transcribe');
      }
      return;
    }

    voiceCommittedRef.current = '';
    voiceSessionTranscriptRef.current = '';
    voiceAbortedRef.current = false;
    voiceSentRef.current = false;
    voiceStopActionRef.current = null;
    voiceWantListeningRef.current = true;
    setLiveVoicePreview('');
    setIsFinalizingVoice(false);
    setIsListening(true);
    resetVoiceSilenceTimer();
    startRecognitionSession();
  };

  const handleCancelSpeech = () => {
    clearVoiceTimers();
    voiceWantListeningRef.current = false;
    voiceAbortedRef.current = true;
    voiceStopActionRef.current = null;
    voiceCommittedRef.current = '';
    voiceSessionTranscriptRef.current = '';
    setLiveVoicePreview('');
    if (recognitionRef.current) {
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      try {
        rec.onend = null;
        rec.abort();
      } catch (_) {}
    }
    setIsFinalizingVoice(false);
    setIsListening(false);
  };

  const executeDirectPortalAction = useCallback(
    async (actionType, payload) => {
      setErrorBanner(null);
      const res = await fetch('/api/toaster/execute', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          member_id: Number(selectedMemberId),
          action_type: actionType,
          payload,
        }),
      });
      if (!res.ok) {
        let detail = `Erreur HTTP ${res.status}`;
        try {
          const errJson = await res.json();
          detail = errJson.detail || errJson.error || errJson.message || detail;
        } catch (_) {}
        setErrorBanner(detail);
        throw new Error(detail);
      }
      const resData = await res.json();
      showToast(resData.message || 'Action enregistrée sur le portail.');
      await loadPortalState(selectedMemberId);
      return resData;
    },
    [selectedMemberId, loadPortalState, showToast]
  );

  const handleDirectVote = useCallback(
    async (pollOrId, choicePayload) => {
      const projId = typeof pollOrId === 'object' && pollOrId !== null ? pollOrId.id : pollOrId;
      await executeDirectPortalAction('vote', {
        operation: 'vote',
        project_id: projId,
        vote: choicePayload,
      });
    },
    [executeDirectPortalAction]
  );

  // Synchroniser les widgets du fil après consultation/arbitrage dans TaskDetailModal ou VoteRoofModal
  const handleModalTaskUpdated = useCallback(
    (updatedTask) => {
      if (updatedTask && updatedTask.id) {
        setMessages((prev) =>
          prev.map((m) => {
            if (!Array.isArray(m.uiComponents) || m.uiComponents.length === 0) return m;
            return {
              ...m,
              uiComponents: m.uiComponents.map((comp) => {
                if (comp.component_id !== 'tasks_overview_card' || !Array.isArray(comp.tasks)) return comp;
                return {
                  ...comp,
                  tasks: comp.tasks.map((t) =>
                    Number(t.id) === Number(updatedTask.id) ? { ...t, ...updatedTask } : t
                  ),
                };
              }),
            };
          })
        );
        setInspectingTask((prev) => (prev && Number(prev.id) === Number(updatedTask.id) ? { ...prev, ...updatedTask } : prev));
      }
      loadPortalState(selectedMemberId);
    },
    [loadPortalState, selectedMemberId]
  );

  const handleModalTaskDeleted = useCallback(
    (deletedId) => {
      if (deletedId) {
        setMessages((prev) =>
          prev.map((m) => {
            if (!Array.isArray(m.uiComponents) || m.uiComponents.length === 0) return m;
            return {
              ...m,
              uiComponents: m.uiComponents.map((comp) => {
                if (comp.component_id !== 'tasks_overview_card' || !Array.isArray(comp.tasks)) return comp;
                return {
                  ...comp,
                  tasks: comp.tasks.filter((t) => Number(t.id) !== Number(deletedId)),
                };
              }),
            };
          })
        );
      }
      setInspectingTask(null);
      loadPortalState(selectedMemberId);
    },
    [loadPortalState, selectedMemberId]
  );

  const handleModalPollUpdated = useCallback(
    (updatedPoll) => {
      if (updatedPoll && updatedPoll.id) {
        setMessages((prev) =>
          prev.map((m) => {
            if (!Array.isArray(m.uiComponents) || m.uiComponents.length === 0) return m;
            return {
              ...m,
              uiComponents: m.uiComponents.map((comp) => {
                if (comp.component_id !== 'poll_status_card' || !Array.isArray(comp.polls)) return comp;
                return {
                  ...comp,
                  polls: comp.polls.map((p) =>
                    Number(p.id) === Number(updatedPoll.id) ? { ...p, ...updatedPoll } : p
                  ),
                };
              }),
            };
          })
        );
        setInspectingPoll((prev) => (prev && Number(prev.id) === Number(updatedPoll.id) ? { ...prev, ...updatedPoll } : prev));
      }
      loadPortalState(selectedMemberId);
    },
    [loadPortalState, selectedMemberId]
  );

  const handleModalPollDeleted = useCallback(
    (deletedId) => {
      if (deletedId) {
        setMessages((prev) =>
          prev.map((m) => {
            if (!Array.isArray(m.uiComponents) || m.uiComponents.length === 0) return m;
            return {
              ...m,
              uiComponents: m.uiComponents.map((comp) => {
                if (comp.component_id !== 'poll_status_card' || !Array.isArray(comp.polls)) return comp;
                return {
                  ...comp,
                  polls: comp.polls.filter((p) => Number(p.id) !== Number(deletedId)),
                };
              }),
            };
          })
        );
      }
      setInspectingPoll(null);
      loadPortalState(selectedMemberId);
    },
    [loadPortalState, selectedMemberId]
  );

  // Helper générique pour muter une carte d'action
  const updateCardInMessage = (msgId, cardUpdater) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId && m.action_card ? { ...m, action_card: cardUpdater(m.action_card) } : m))
    );
  };

  // Helpers dédiés Ann. 4, 5, 6 (Dates+heures, Participants internes/externes, ECS vs Chauffage vs Piscine)
  const handleUpdateStayDateTime = (msgId, which, { date, time }) => {
    updateCardInMessage(msgId, (card) => {
      const p = { ...(card.payload || {}) };
      if (which === 'start') {
        if (date) {
          p.start_date = date;
          if (p.end_date && date > p.end_date) p.end_date = date;
        }
        if (time) p.arrival_time = time;
      } else {
        if (date) p.end_date = date;
        if (time) p.departure_time = time;
      }
      const remainingMissing = card.missing_fields.filter(
        (f) => !(which === 'start' && f.key === 'start_date')
      );
      return {
        ...card,
        missing_fields: remainingMissing,
        ready_to_execute: remainingMissing.length === 0,
        payload: p,
      };
    });
  };

  const handleToggleStayMember = (msgId, memberName) => {
    updateCardInMessage(msgId, (card) => {
      const prev = Array.isArray(card.payload?.selected_members) ? card.payload.selected_members : [];
      const next = prev.includes(memberName)
        ? prev.filter((m) => m !== memberName)
        : [...prev, memberName];
      const extCount = Array.isArray(card.payload?.external_guests) ? card.payload.external_guests.length : 0;
      const nextTotal = Math.max(1, next.length + extCount);
      return {
        ...card,
        payload: { ...(card.payload || {}), selected_members: next, guest_count: nextTotal },
      };
    });
  };

  const handleAddStayExternalGuest = (msgId) => {
    const raw = String(stayExternalInputs[msgId] || '').trim();
    if (!raw) return;
    updateCardInMessage(msgId, (card) => {
      const prevExt = Array.isArray(card.payload?.external_guests) ? card.payload.external_guests : [];
      const nextExt = prevExt.includes(raw) ? prevExt : [...prevExt, raw];
      const memCount = Array.isArray(card.payload?.selected_members) ? card.payload.selected_members.length : 0;
      const nextTotal = Math.max(1, memCount + nextExt.length);
      return {
        ...card,
        payload: { ...(card.payload || {}), external_guests: nextExt, guest_count: nextTotal },
      };
    });
    setStayExternalInputs((prev) => ({ ...prev, [msgId]: '' }));
  };

  const handleRemoveStayExternalGuest = (msgId, idxToRemove) => {
    updateCardInMessage(msgId, (card) => {
      const prevExt = Array.isArray(card.payload?.external_guests) ? card.payload.external_guests : [];
      const nextExt = prevExt.filter((_, i) => i !== idxToRemove);
      const memCount = Array.isArray(card.payload?.selected_members) ? card.payload.selected_members.length : 0;
      const nextTotal = Math.max(1, memCount + nextExt.length);
      return {
        ...card,
        payload: { ...(card.payload || {}), external_guests: nextExt, guest_count: nextTotal },
      };
    });
  };

  const handleToggleStayEnergy = (msgId, field, checked) => {
    updateCardInMessage(msgId, (card) => {
      const p = { ...(card.payload || {}), [field]: checked };
      if (field === 'activate_heating' && checked) {
        p.activate_dhw = true;
      }
      return { ...card, payload: p };
    });
  };

  const handleResolveMissingField = (msgId, missingField, chosenOption) => {
    updateCardInMessage(msgId, (card) => {
      const remainingMissing = card.missing_fields.filter((f) => f.key !== missingField.key);
      const displayValue =
        chosenOption.label !== undefined && chosenOption.label !== ''
          ? String(chosenOption.label)
          : String(chosenOption.value);
      const rawValue = chosenOption.value !== undefined ? chosenOption.value : chosenOption.label;

      const existingDeducedIdx = card.deduced_fields.findIndex((d) => d.key === missingField.key);
      const updatedDeduced =
        existingDeducedIdx >= 0
          ? card.deduced_fields.map((d, idx) =>
              idx === existingDeducedIdx ? { ...d, value: displayValue, raw_value: rawValue } : d
            )
          : [
              ...card.deduced_fields,
              {
                key: missingField.key,
                label: missingField.label || missingField.question,
                value: displayValue,
                raw_value: rawValue,
              },
            ];

      const updatedPayload = {
        ...(card.payload || {}),
        [missingField.key]: rawValue,
      };
      if (card.action_type === 'stay' && missingField.key === 'building') {
        const newMax = getMaxRoomsForBuilding(rawValue);
        updatedPayload.max_chambers = newMax;
        if (Number(updatedPayload.chambers_used || 1) > newMax) {
          updatedPayload.chambers_used = newMax;
        }
      }

      return {
        ...card,
        deduced_fields: updatedDeduced,
        missing_fields: remainingMissing,
        ready_to_execute: remainingMissing.length === 0,
        payload: updatedPayload,
      };
    });
  };

  const handleSaveEditedDeducedField = (msgId, fieldKey, newValue) => {
    const trimmed = String(newValue ?? '').trim();
    if (!trimmed) {
      setEditingField(null);
      return;
    }
    updateCardInMessage(msgId, (card) => {
      let valToStore = trimmed;
      if (fieldKey === 'chambers_used' || fieldKey === 'guest_count' || fieldKey === 'charge_points') {
        valToStore = Number(trimmed) || 1;
      }
      if (card.action_type === 'stay' && fieldKey === 'chambers_used') {
        const maxR = getMaxRoomsForBuilding(card.payload?.building);
        valToStore = Math.max(1, Math.min(maxR, Number(valToStore) || 1));
      }
      const updatedDeduced = card.deduced_fields.map((d) =>
        d.key === fieldKey ? { ...d, value: String(valToStore), raw_value: valToStore } : d
      );
      const updatedPayload = { ...(card.payload || {}), [fieldKey]: valToStore };
      if (card.action_type === 'stay' && fieldKey === 'building') {
        const maxR = getMaxRoomsForBuilding(valToStore);
        updatedPayload.max_chambers = maxR;
      }
      return {
        ...card,
        deduced_fields: updatedDeduced,
        payload: updatedPayload,
      };
    });
    setEditingField(null);
  };

  // Helpers dédiés Ann. 1 & 2 (Options de scrutin ligne par ligne + texte description)
  const handleUpdatePollOption = (msgId, optIdx, newVal) => {
    updateCardInMessage(msgId, (card) => {
      const opts = Array.isArray(card.payload?.options) ? [...card.payload.options] : [];
      opts[optIdx] = newVal;
      return { ...card, payload: { ...(card.payload || {}), options: opts } };
    });
  };

  const handleDeletePollOption = (msgId, optIdx) => {
    updateCardInMessage(msgId, (card) => {
      const opts = (Array.isArray(card.payload?.options) ? card.payload.options : []).filter((_, i) => i !== optIdx);
      return { ...card, payload: { ...(card.payload || {}), options: opts } };
    });
  };

  const handleAddPollOption = (msgId, initialText = '') => {
    updateCardInMessage(msgId, (card) => {
      const opts = Array.isArray(card.payload?.options) ? [...card.payload.options] : [];
      opts.push(initialText);
      return { ...card, payload: { ...(card.payload || {}), options: opts } };
    });
  };

  // Helpers dédiés Ann. 4 (Chambres séjour : stepper borné + sélection optionnelle par nom)
  const handleSetStayChambers = (msgId, nextCount) => {
    updateCardInMessage(msgId, (card) => {
      const maxR = getMaxRoomsForBuilding(card.payload?.building);
      const safeCount = Math.max(1, Math.min(maxR, Number(nextCount) || 1));
      const remainingMissing = card.missing_fields.filter((f) => f.key !== 'chambers_used');
      const hasDeduced = card.deduced_fields.some((d) => d.key === 'chambers_used');
      const updatedDeduced = hasDeduced
        ? card.deduced_fields.map((d) =>
            d.key === 'chambers_used' ? { ...d, value: String(safeCount), raw_value: safeCount } : d
          )
        : [...card.deduced_fields, { key: 'chambers_used', label: 'Chambres occupées', value: String(safeCount), raw_value: safeCount }];
      return {
        ...card,
        deduced_fields: updatedDeduced,
        missing_fields: remainingMissing,
        payload: { ...(card.payload || {}), chambers_used: safeCount, max_chambers: maxR },
      };
    });
  };

  const handleToggleStayRoom = (msgId, roomName) => {
    updateCardInMessage(msgId, (card) => {
      const maxR = getMaxRoomsForBuilding(card.payload?.building);
      const prevRooms = Array.isArray(card.payload?.selected_rooms) ? card.payload.selected_rooms : [];
      const nextRooms = prevRooms.includes(roomName)
        ? prevRooms.filter((r) => r !== roomName)
        : prevRooms.length < maxR
        ? [...prevRooms, roomName]
        : prevRooms;
      const nextCount = nextRooms.length > 0 ? nextRooms.length : Math.min(maxR, Number(card.payload?.chambers_used || 1));
      const remainingMissing = card.missing_fields.filter((f) => f.key !== 'chambers_used');
      const hasDeduced = card.deduced_fields.some((d) => d.key === 'chambers_used');
      const updatedDeduced = hasDeduced
        ? card.deduced_fields.map((d) =>
            d.key === 'chambers_used' ? { ...d, value: String(nextCount), raw_value: nextCount } : d
          )
        : [...card.deduced_fields, { key: 'chambers_used', label: 'Chambres occupées', value: String(nextCount), raw_value: nextCount }];
      return {
        ...card,
        deduced_fields: updatedDeduced,
        missing_fields: remainingMissing,
        payload: {
          ...(card.payload || {}),
          selected_rooms: nextRooms,
          chambers_used: nextCount,
          max_chambers: maxR,
        },
      };
    });
  };

  const handleExecuteActionCard = async (msgId) => {
    const targetMsg = messages.find((m) => m.id === msgId);
    if (!targetMsg || !targetMsg.action_card) return;
    const card = targetMsg.action_card;

    updateCardInMessage(msgId, (c) => ({ ...c, executing: true, executionError: null }));
    setErrorBanner(null);

    try {
      const finalPayload = { ...(card.payload || {}) };
      card.deduced_fields.forEach((d) => {
        if (d.key && finalPayload[d.key] === undefined) {
          finalPayload[d.key] = d.raw_value !== undefined ? d.raw_value : d.value;
        }
      });
      if (card.action_type === 'vote' && Array.isArray(finalPayload.options)) {
        finalPayload.options = finalPayload.options.map((o) => String(o || '').trim()).filter(Boolean);
      }

      const localFile = card.localFileObj?.file || null;
      const uploaderName = formatAssociateLabel(activeMemberObj);

      // Cas 1 (Annotation 3) : Archivage / rattachement direct d'un document fourni dans le chat
      if (card.action_type === 'document' && localFile && !finalPayload.existing_document_id) {
        const op = finalPayload.operation || 'archive';
        const targetTaskId = op === 'link_task' && finalPayload.task_id ? Number(finalPayload.task_id) : null;
        const targetProjectId = op === 'link_vote' && finalPayload.project_id ? Number(finalPayload.project_id) : null;
        const cat = finalPayload.category || 'Travaux & Chantiers';

        const uploadedDoc = await uploadUniversalDocument(localFile, {
          organisme: finalPayload.organisme || 'SCI',
          title: finalPayload.title || localFile.name.replace(/\.[^.]+$/, ''),
          category: cat,
          tags: [cat],
          task_id: targetTaskId,
          project_id: targetProjectId,
          uploaded_by: uploaderName,
        });

        const docLabel = uploadedDoc?.file_name || uploadedDoc?.title || localFile.name;
        const destLabel = targetTaskId
          ? ` et rattaché à la tâche #${targetTaskId}`
          : targetProjectId
          ? ` et rattaché au scrutin #${targetProjectId}`
          : ' dans la bibliothèque SCI';
        const confirmText = sanitizeFamilyLabel(`Document « ${docLabel} » téléversé sur Google Drive${destLabel}.`);

        updateCardInMessage(msgId, (c) => ({
          ...c,
          executing: false,
          executed: true,
          executionResult: { message: confirmText },
        }));
        showToast(confirmText);
        await loadPortalState(selectedMemberId);
        return;
      }

      // Cas 2 : Facture / dépense avec pièce jointe réelle -> archiver d'abord le justificatif dans AdminDocument
      if (card.action_type === 'expense' && localFile && finalPayload.attach_uploaded_file !== false) {
        const uploadedInvoice = await uploadUniversalDocument(localFile, {
          organisme: finalPayload.supplier || 'Artisan',
          title: finalPayload.title || localFile.name.replace(/\.[^.]+$/, ''),
          category: 'Factures',
          tags: ['Factures'],
          uploaded_by: uploaderName,
        });
        if (uploadedInvoice?.id) {
          finalPayload.uploaded_document_id = uploadedInvoice.id;
          finalPayload.document_filename = uploadedInvoice.file_name || uploadedInvoice.title || localFile.name;
        }
      }

      const res = await fetch('/api/toaster/execute', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          member_id: Number(selectedMemberId),
          action_type: card.action_type,
          payload: finalPayload,
        }),
      });

      if (!res.ok) {
        let detail = `Erreur HTTP ${res.status}`;
        try {
          const errJson = await res.json();
          detail = errJson.detail || errJson.error || errJson.message || detail;
        } catch (_) {}
        throw new Error(detail);
      }

      const resData = await res.json();
      let confirmText = sanitizeFamilyLabel(
        resData.message || resData.confirmation || resData.reply || 'Action confirmée et appliquée.'
      );

      // Cas 3 : Pièce jointe à téléverser et lier automatiquement à une NOUVELLE tâche ou un NOUVEAU scrutin
      if (
        localFile &&
        finalPayload.attach_uploaded_file !== false &&
        card.action_type === 'task' &&
        finalPayload.operation === 'create' &&
        resData.created_task_id
      ) {
        const cat = finalPayload.document_category || 'Travaux & Chantiers';
        const uploadedDoc = await uploadUniversalDocument(localFile, {
          organisme: finalPayload.document_organisme || 'SCI',
          title: finalPayload.document_title || finalPayload.title || localFile.name.replace(/\.[^.]+$/, ''),
          category: cat,
          tags: [cat],
          task_id: Number(resData.created_task_id),
          uploaded_by: uploaderName,
        });
        confirmText = `${confirmText} Pièce jointe « ${uploadedDoc?.file_name || localFile.name} » archivée et liée à la tâche.`;
      } else if (
        localFile &&
        finalPayload.attach_uploaded_file !== false &&
        card.action_type === 'vote' &&
        finalPayload.operation === 'create' &&
        resData.created_project_id
      ) {
        const cat = finalPayload.document_category || 'Travaux & Chantiers';
        const uploadedDoc = await uploadUniversalDocument(localFile, {
          organisme: finalPayload.document_organisme || 'SCI',
          title: finalPayload.document_title || finalPayload.title || localFile.name.replace(/\.[^.]+$/, ''),
          category: cat,
          tags: [cat],
          project_id: Number(resData.created_project_id),
          uploaded_by: uploaderName,
        });
        confirmText = `${confirmText} Pièce jointe « ${uploadedDoc?.file_name || localFile.name} » archivée et liée au scrutin.`;
      }

      updateCardInMessage(msgId, (c) => ({
        ...c,
        executing: false,
        executed: true,
        executionResult: { message: confirmText },
      }));

      showToast(confirmText);
      await loadPortalState(selectedMemberId);
    } catch (err) {
      console.error('Erreur /api/toaster/execute:', err);
      updateCardInMessage(msgId, (c) => ({
        ...c,
        executing: false,
        executionError: err.message,
      }));
      setErrorBanner(`Échec de l'exécution de l'action : ${err.message}`);
    }
  };

  const pendingActions = portalState?.pending_actions || null;
  const pendingTotalCount = Number(pendingActions?.total_count || 0);
  const hasPendingActions = Boolean(pendingActions?.has_pending || pendingTotalCount > 0);
  const pendingSummaryPills = useMemo(() => {
    if (!pendingActions || !pendingActions.counts) return [];
    const pills = [];
    const c = pendingActions.counts;
    if (c.tasks > 0) pills.push(`${c.tasks} tâche${c.tasks > 1 ? 's' : ''}`);
    if (c.votes > 0) pills.push(`${c.votes} vote${c.votes > 1 ? 's' : ''}`);
    if (c.messages > 0) pills.push(`${c.messages} message${c.messages > 1 ? 's' : ''}`);
    if (c.fees > 0) {
      const eur = Number(pendingActions.total_fees_due_eur || 0);
      pills.push(eur > 0 ? `${eur.toFixed(0)} € à régler` : `${c.fees} frais à régler`);
    }
    return pills;
  }, [pendingActions]);

  const handleChatDragOver = (e) => {
    e.preventDefault();
    if (!isDraggingOverChat) setIsDraggingOverChat(true);
  };

  const handleChatDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDraggingOverChat(false);
    }
  };

  const handleChatDrop = (e) => {
    e.preventDefault();
    setIsDraggingOverChat(false);
    const droppedFile = e.dataTransfer?.files?.[0];
    if (droppedFile) {
      attachLocalFile(droppedFile);
    }
  };

  return (
    <div className="relative flex flex-col w-full max-w-5xl mx-auto flex-1 min-h-0 h-full overflow-hidden">
      {/* Notification Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-forest-deep text-white px-5 py-3 rounded-full shadow-xl flex items-center gap-3 border border-emerald-500/30 animate-in fade-in duration-200">
          <span className="material-symbols-outlined text-emerald-300 text-[20px]">check_circle</span>
          <span className="text-xs font-semibold">{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-white/70 hover:text-white ml-1 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      )}

      {/* Bouton compact Nouvelle discussion uniquement en cours de conversation */}
      {messages.length > 0 && !isWelcomeExiting && (
        <div className="shrink-0 flex items-center justify-end px-1 pb-2">
          <button
            type="button"
            onClick={() => {
              stopTtsPlayback();
              setMessages([]);
              setIsWelcomeExiting(false);
              setAttachment(null);
              setErrorBanner(null);
              setLastFailedPrompt(null);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white hover:bg-sage-soft text-slate-600 hover:text-forest-deep border border-border-subtle text-xs font-semibold transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">add_comment</span>
            <span>Nouvelle discussion</span>
          </button>
        </div>
      )}

      {/* Bannière d'erreur Fail-Fast avec bouton Réessayer */}
      {errorBanner && (
        <div
          id="toaster-error-banner"
          role="alert"
          className="shrink-0 mb-2 px-4 py-2.5 rounded-2xl bg-rose-50 border border-rose-300 text-rose-950 text-xs font-semibold flex items-center justify-between gap-3 flex-wrap"
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-rose-600 text-[20px]">error</span>
            <span>{errorBanner}</span>
          </div>
          <div className="flex items-center gap-2">
            {lastFailedPrompt && !isSending && (
              <button
                type="button"
                onClick={() => sendMessagePayload({ textOverride: lastFailedPrompt, clearComposerText: false })}
                className="px-3 py-1 rounded-full bg-rose-700 hover:bg-rose-800 text-white text-[11px] font-bold cursor-pointer"
              >
                Réessayer
              </button>
            )}
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              className="text-rose-700 hover:text-rose-950 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>
      )}

      {/* ZONE DE CONVERSATION À HAUTEUR FIXE (seul l'historique défile, l'input reste toujours ancré en bas) */}
      <div
        onDragOver={handleChatDragOver}
        onDragLeave={handleChatDragLeave}
        onDrop={handleChatDrop}
        className={`relative flex-1 min-h-0 bg-surface-container-lowest rounded-3xl border shadow-sm flex flex-col overflow-hidden transition-colors ${
          isDraggingOverChat ? 'border-primary ring-4 ring-primary/15 bg-emerald-50/30' : 'border-border-subtle'
        }`}
      >
        {isDraggingOverChat && (
          <div className="pointer-events-none absolute inset-0 z-30 bg-emerald-50/85 backdrop-blur-[1px] flex flex-col items-center justify-center gap-2 border-2 border-dashed border-primary rounded-3xl">
            <span className="material-symbols-outlined text-primary text-[36px]">upload_file</span>
            <span className="text-sm font-bold text-forest-deep">
              Déposez votre photo ou document PDF ici
            </span>
          </div>
        )}

        <div ref={chatScrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-5">
          {messages.length === 0 || isWelcomeExiting ? (
            <div
              id="mr-collins-welcome"
              className={`min-h-full flex flex-col items-center justify-center text-center max-w-4xl mx-auto px-2 py-3 transition-all duration-300 ease-out ${
                isWelcomeExiting
                  ? 'opacity-0 scale-90 -translate-y-4 blur-[3px] pointer-events-none'
                  : 'opacity-100 scale-100 translate-y-0'
              }`}
            >
              <h2 className="font-headline-sm text-base sm:text-lg font-bold text-forest-deep">
                Bonjour {formatAssociatePrenom(activeMemberObj)}, comment puis-je vous aider aujourd'hui ?
              </h2>
              <p className="text-xs sm:text-sm text-on-surface-variant mt-1 leading-relaxed max-w-xl">
                Consultez le Vademecum, la trésorerie, le classement participatif, la piscine, la cuve à fioul ou préparez en un clic une réservation, une tâche ou un scrutin familial. Tout est possible. Dingue, non ?!
              </p>

              {/* Annotation 3 (Batch 2) : Portrait centré de Mr. Collins à bords floutés entouré des 4 questions d'exemple */}
              <div
                id="toaster-example-questions"
                className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-4 w-full max-w-3xl mt-4"
              >
                {/* 2 exemples à gauche */}
                <div className="flex flex-col gap-2.5 order-2 md:order-1">
                  {EXAMPLE_QUESTIONS.slice(0, 2).map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      disabled={isSending}
                      onClick={() =>
                        sendMessagePayload({
                          textOverride: q.prompt,
                          clearComposerText: false,
                        })
                      }
                      className="group flex items-start gap-3 px-3.5 py-2.5 rounded-2xl bg-white hover:bg-sage-soft/55 border border-border-subtle hover:border-primary/40 shadow-2xs transition-all cursor-pointer disabled:opacity-45 text-left"
                    >
                      <span className="w-8 h-8 rounded-xl bg-sage-soft/80 group-hover:bg-primary/15 text-primary flex items-center justify-center shrink-0 mt-0.5 transition-colors">
                        <span className="material-symbols-outlined text-[18px]">{q.icon}</span>
                      </span>
                      <div className="min-w-0 flex-1 text-left">
                        <span className="block text-xs font-bold text-forest-deep group-hover:text-primary transition-colors truncate">
                          {q.title}
                        </span>
                        <span className="block text-[11px] text-on-surface-variant truncate mt-0.5">
                          {q.subtitle}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Portrait central Mr. Collins à bords doucement floutés */}
                <div className="relative flex flex-col items-center justify-center order-1 md:order-2 my-1">
                  <div
                    className="pointer-events-none absolute inset-1 rounded-full bg-emerald-200/35 blur-2xl"
                    aria-hidden="true"
                  />
                  <div className="relative w-36 h-32 sm:w-44 sm:h-40 flex items-center justify-center select-none">
                    <img
                      src="/images/mr-collins.jpg"
                      alt="Mr. Collins — Domaine d'Hellenvilliers"
                      className="w-full h-full object-cover object-center mr-collins-portrait-mask"
                    />
                  </div>
                  <span className="text-[11px] font-headline-sm font-bold tracking-wide text-forest-deep/75 -mt-1">
                    Mr. Collins
                  </span>
                </div>

                {/* 2 exemples à droite */}
                <div className="flex flex-col gap-2.5 order-3">
                  {EXAMPLE_QUESTIONS.slice(2, 4).map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      disabled={isSending}
                      onClick={() =>
                        sendMessagePayload({
                          textOverride: q.prompt,
                          clearComposerText: false,
                        })
                      }
                      className="group flex items-start gap-3 px-3.5 py-2.5 rounded-2xl bg-white hover:bg-sage-soft/55 border border-border-subtle hover:border-primary/40 shadow-2xs transition-all cursor-pointer disabled:opacity-45 text-left"
                    >
                      <span className="w-8 h-8 rounded-xl bg-sage-soft/80 group-hover:bg-primary/15 text-primary flex items-center justify-center shrink-0 mt-0.5 transition-colors">
                        <span className="material-symbols-outlined text-[18px]">{q.icon}</span>
                      </span>
                      <div className="min-w-0 flex-1 text-left">
                        <span className="block text-xs font-bold text-forest-deep group-hover:text-primary transition-colors truncate">
                          {q.title}
                        </span>
                        <span className="block text-[11px] text-on-surface-variant truncate mt-0.5">
                          {q.subtitle}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Gros bouton central rouge pulsant dès qu'il y a >= 1 action à faire */}
              <div className="mt-4 w-full flex justify-center">
                <button
                  id="btn-toaster-pending-actions"
                  type="button"
                  disabled={isSending}
                  onClick={() =>
                    sendMessagePayload({
                      textOverride: PENDING_ACTIONS_PROMPT,
                      clearComposerText: false,
                    })
                  }
                  className={`group relative inline-flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 px-6 py-3 rounded-2xl text-sm font-bold transition-all cursor-pointer disabled:opacity-50 max-w-xl w-full sm:w-auto ${
                    hasPendingActions
                      ? 'bg-rose-600 hover:bg-rose-700 text-white border border-rose-400/70 animate-pulse-urgent'
                      : loadingState && !portalState
                      ? 'bg-slate-100 text-slate-600 border border-slate-200'
                      : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-950 border border-emerald-200 shadow-xs'
                  }`}
                >
                  <span className="inline-flex items-center gap-2.5">
                    {hasPendingActions ? (
                      <span className="relative flex h-3 w-3 shrink-0" aria-hidden="true">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-80" />
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
                      </span>
                    ) : (
                      <span className="material-symbols-outlined text-[20px] text-emerald-700">
                        {loadingState && !portalState ? 'progress_activity' : 'task_alt'}
                      </span>
                    )}
                    <span className="text-sm sm:text-[15px]">
                      {hasPendingActions
                        ? 'Voir tout ce que j’ai à faire'
                        : loadingState && !portalState
                        ? 'Vérification de vos actions en cours…'
                        : 'Tout est à jour — Voir mon récapitulatif'}
                    </span>
                  </span>

                  {hasPendingActions && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/20 border border-white/30 text-xs font-extrabold tracking-tight">
                      <span>{pendingTotalCount}</span>
                      {pendingSummaryPills.length > 0 && (
                        <span className="font-semibold opacity-95">
                          · {pendingSummaryPills.join(' · ')}
                        </span>
                      )}
                    </span>
                  )}
                </button>
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.role === 'user';
              const card = msg.action_card;
              const typeMeta = card
                ? ACTION_TYPE_META[card.action_type] || {
                    icon: 'bolt',
                    badge: card.action_type,
                    color: 'bg-slate-100 text-slate-800 border-slate-300',
                  }
                : null;
              const showBubble = Boolean(msg.content || msg.attachment);
              const showTtsControl = !isUser && !msg.isStreaming && Boolean(String(msg.content || '').trim());
              const isThisTtsLoading = ttsState.msgId === msg.id && ttsState.status === 'loading';
              const isThisTtsPlaying = ttsState.msgId === msg.id && ttsState.status === 'playing';
              const isThisTtsPaused = ttsState.msgId === msg.id && ttsState.status === 'paused';

              // Séjours (Annotations 4, 5, 6)
              const isStayCard = card?.action_type === 'stay' && card?.payload?.operation !== 'cancel';
              const stayMaxRooms = isStayCard ? getMaxRoomsForBuilding(card.payload?.building) : 5;
              const stayCurrentRooms = isStayCard ? Number(card.payload?.chambers_used || 1) : 1;
              const stayRoomOverflow = isStayCard && stayCurrentRooms > stayMaxRooms;
              const stayAvailableRooms = isStayCard ? getRoomsListForBuilding(card.payload?.building) : [];
              const staySelectedRooms = isStayCard && Array.isArray(card.payload?.selected_rooms) ? card.payload.selected_rooms : [];
              const staySelectedMembers = isStayCard && Array.isArray(card.payload?.selected_members) ? card.payload.selected_members : [];
              const stayExternalGuests = isStayCard && Array.isArray(card.payload?.external_guests) ? card.payload.external_guests : [];
              const stayTotalOccupants = isStayCard
                ? Math.max(1, staySelectedMembers.length + stayExternalGuests.length, Number(card.payload?.guest_count || 1))
                : 1;
              const stayStartPickerOpen = Boolean(
                openStayPicker && openStayPicker.msgId === msg.id && openStayPicker.which === 'start'
              );
              const stayEndPickerOpen = Boolean(
                openStayPicker && openStayPicker.msgId === msg.id && openStayPicker.which === 'end'
              );

              // Création de tâche — Titre + Description uniquement (tout le reste géré par les coordinateurs)
              const isTaskCreateCard = card?.action_type === 'task' && card?.payload?.operation === 'create';
              const taskCreateMissingTitle = isTaskCreateCard && !String(card.payload?.title || '').trim();

              // Modification de tâche existante (Batch 1, Annotation 3)
              const isTaskUpdateCard = card?.action_type === 'task' && card?.payload?.operation === 'update';
              const taskUpdateMissingId = isTaskUpdateCard && !card.payload?.task_id;
              const taskUpdateMissingTitle = isTaskUpdateCard && !String(card.payload?.title || '').trim();

              // Publication d'un commentaire sur une tâche ou un scrutin (Batch 1, Annotation 3)
              const isCommentCard = card?.action_type === 'comment';
              const commentMissingTarget = isCommentCard && !card.payload?.target_id;
              const commentMissingContent = isCommentCard && !String(card.payload?.content || '').trim();

              // Création / Ouverture de scrutin — miroir strict VoteRoofModal
              const isPollSetupCard =
                card?.action_type === 'vote' &&
                (card?.payload?.operation === 'create' || card?.payload?.operation === 'open');
              const pollOptions = isPollSetupCard && Array.isArray(card.payload?.options) ? card.payload.options : [];
              const pollValidOptionsCount = pollOptions.filter((o) => String(o || '').trim()).length;
              const pollEmptyOptions = isPollSetupCard && pollValidOptionsCount < 2;
              const pollMissingTitle = isPollSetupCard && !String(card.payload?.title || '').trim();

              // Archivage / Liaison de document (Annotation 3)
              const isDocumentCard = card?.action_type === 'document';
              const docOperation = isDocumentCard ? card.payload?.operation || 'archive' : 'archive';
              const docNeedsUpload = isDocumentCard && !card.payload?.existing_document_id;
              const docMissingFile = isDocumentCard && docNeedsUpload && !card.localFileObj?.file;
              const docMissingTitle = isDocumentCard && docNeedsUpload && !String(card.payload?.title || '').trim();
              const docMissingTask = isDocumentCard && docOperation === 'link_task' && !card.payload?.task_id;
              const docMissingVote = isDocumentCard && docOperation === 'link_vote' && !card.payload?.project_id;

              const isVademecumCard = card?.action_type === 'vademecum';

              // Exclure des puces vertes génériques les champs qui disposent d'un éditeur structuré dédié
              const STAY_DEDICATED_KEYS = new Set([
                'start_date',
                'end_date',
                'arrival_time',
                'departure_time',
                'guest_count',
                'selected_members',
                'external_guests',
                'chambers_used',
                'activate_dhw',
                'activate_heating',
                'activate_pool',
                'target_temperature',
              ]);
              const chipFields = card
                ? isTaskCreateCard || isTaskUpdateCard || isCommentCard || isPollSetupCard || isDocumentCard
                  ? []
                  : card.deduced_fields.filter((f) => {
                      if (isStayCard && STAY_DEDICATED_KEYS.has(f.key)) return false;
                      if (isVademecumCard && f.key === 'content') return false;
                      return true;
                    })
                : [];

              const confirmDisabled =
                !card ||
                card.missing_fields.length > 0 ||
                card.executing ||
                stayRoomOverflow ||
                taskCreateMissingTitle ||
                taskUpdateMissingId ||
                taskUpdateMissingTitle ||
                commentMissingTarget ||
                commentMissingContent ||
                pollEmptyOptions ||
                pollMissingTitle ||
                docMissingFile ||
                docMissingTitle ||
                docMissingTask ||
                docMissingVote;

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col animate-in fade-in duration-200 ${isUser ? 'items-end' : 'items-start'}`}
                >
                  {!isUser && !msg.isCompanionCard && (
                    <ToasterActivityAccordion
                      thoughts={msg.thoughts}
                      toolSteps={msg.toolSteps}
                      isStreaming={Boolean(msg.isStreaming)}
                    />
                  )}

                  {showBubble && (
                    <div
                      className={`relative max-w-2xl rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-2xs ${
                        isUser
                          ? 'bg-primary text-white rounded-br-xs'
                          : `bg-canvas-slate text-on-surface border border-border-subtle rounded-bl-xs ${
                              showTtsControl ? 'pb-9' : ''
                            }`
                      }`}
                    >
                      {msg.attachment && (
                        <div className="mb-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 border border-white/25 text-xs font-semibold">
                          <span className="material-symbols-outlined text-[15px]">attach_file</span>
                          <span>{msg.attachment.name}</span>
                        </div>
                      )}
                      <ToasterMarkdown content={msg.content} isUser={isUser} />

                      {/* Bouton rond élégant de lecture vocale TTS en bas à droite (gemini-3.8-flash-lite-tts) */}
                      {showTtsControl && (
                        <div className="absolute bottom-2 right-2.5 inline-flex items-center gap-1">
                          {(isThisTtsPlaying || isThisTtsPaused) && (
                            <button
                              type="button"
                              onClick={stopTtsPlayback}
                              title="Arrêter la lecture"
                              aria-label="Arrêter la lecture"
                              className="w-7 h-7 rounded-full bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200/90 inline-flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[15px] leading-none">stop</span>
                            </button>
                          )}
                          <button
                            type="button"
                            data-testid="btn-message-tts"
                            disabled={isThisTtsLoading}
                            onClick={() => playTtsForMessage(msg.id, msg.content)}
                            title={
                              isThisTtsLoading
                                ? 'Génération audio en cours…'
                                : isThisTtsPlaying
                                ? 'Mettre la lecture en pause'
                                : isThisTtsPaused
                                ? 'Reprendre la lecture'
                                : 'Écouter la réponse de Mr. Collins'
                            }
                            aria-label={
                              isThisTtsPlaying
                                ? 'Mettre la lecture en pause'
                                : isThisTtsPaused
                                ? 'Reprendre la lecture'
                                : 'Écouter la réponse'
                            }
                            className={`w-7 h-7 rounded-full border inline-flex items-center justify-center transition-all shadow-2xs cursor-pointer disabled:cursor-wait ${
                              isThisTtsPlaying
                                ? 'bg-primary text-white border-primary ring-2 ring-emerald-500/20'
                                : isThisTtsPaused
                                ? 'bg-emerald-50 text-primary border-emerald-300 hover:bg-emerald-100'
                                : 'bg-white/90 hover:bg-emerald-50 text-slate-500 hover:text-primary border-slate-200/90 hover:border-emerald-300'
                            }`}
                          >
                            <span
                              className={`material-symbols-outlined text-[16px] leading-none ${
                                isThisTtsLoading ? 'animate-spin' : ''
                              }`}
                            >
                              {isThisTtsLoading
                                ? 'progress_activity'
                                : isThisTtsPlaying
                                ? 'pause'
                                : isThisTtsPaused
                                ? 'play_arrow'
                                : 'volume_up'}
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {!isUser && msg.uiComponents && msg.uiComponents.length > 0 && (
                    <ToasterComponentRenderer
                      components={msg.uiComponents}
                      activeMemberName={formatAssociateLabel(activeMemberObj)}
                      activeMemberId={activeMemberObj?.id}
                      isCoordinator={isCoordinator}
                      onOpenSandboxModal={(mType, prefill = {}) =>
                        setActionModalState({ type: mType, prefill })
                      }
                      onCastSandboxVote={handleDirectVote}
                      onInspectTask={(taskObj) => setInspectingTask(taskObj)}
                      onInspectPoll={(pollObj) => setInspectingPoll(pollObj)}
                      onCommentPosted={() => loadPortalState(selectedMemberId)}
                    />
                  )}

                  {/* Carte d'Action Hybride */}
                  {card && (
                    <div
                      data-testid="toaster-action-card"
                      className="mt-3 w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border-2 border-primary/30 shadow-md overflow-visible animate-in fade-in duration-200"
                    >
                      <div className="px-4 py-3 bg-sage-soft/50 border-b border-border-subtle rounded-t-2xl flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-primary text-[20px]">
                            {typeMeta?.icon || 'bolt'}
                          </span>
                          <h3 className="font-headline-sm text-sm sm:text-base font-bold text-forest-deep">
                            {card.title}
                          </h3>
                        </div>
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${typeMeta?.color}`}>
                          {typeMeta?.badge}
                        </span>
                      </div>

                      <div className="p-4 space-y-4">
                        {/* Puces éditables des champs déduits (avec <select> natif pour assigned_to & building) */}
                        {chipFields.length > 0 && (
                          <div className="space-y-2">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 block">
                              🟢 Paramètres (cliquez pour modifier)
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {chipFields.map((field) => {
                                const isEditingThis =
                                  editingField &&
                                  editingField.msgId === msg.id &&
                                  editingField.fieldKey === field.key;

                                if (isEditingThis) {
                                  const isSelectAssignee = field.key === 'assigned_to';
                                  const isSelectBuilding = field.key === 'building' && card.action_type === 'stay';
                                  return (
                                    <div
                                      key={field.key}
                                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border-2 border-emerald-500 text-xs"
                                    >
                                      <span className="font-bold text-emerald-900">🟢 {field.label} :</span>
                                      {isSelectAssignee ? (
                                        <select
                                          autoFocus
                                          value={editingField.tempValue}
                                          onChange={(e) =>
                                            handleSaveEditedDeducedField(msg.id, field.key, e.target.value)
                                          }
                                          className="px-2 py-0.5 bg-white border border-emerald-300 rounded-full text-xs font-semibold text-slate-900 focus:outline-none"
                                        >
                                          {associateChoices
                                            .filter((n) => !n.toLowerCase().includes('frédéric'))
                                            .map((name) => (
                                              <option key={name} value={name}>
                                                {name}
                                              </option>
                                            ))}
                                        </select>
                                      ) : isSelectBuilding ? (
                                        <select
                                          autoFocus
                                          value={editingField.tempValue}
                                          onChange={(e) =>
                                            handleSaveEditedDeducedField(msg.id, field.key, e.target.value)
                                          }
                                          className="px-2 py-0.5 bg-white border border-emerald-300 rounded-full text-xs font-semibold text-slate-900 focus:outline-none"
                                        >
                                          <option value="Presbytère">Presbytère (5 ch.)</option>
                                          <option value="Rosings">Rosings (2 ch.)</option>
                                          <option value="Presbytère & Rosings">Presbytère &amp; Rosings (7 ch.)</option>
                                        </select>
                                      ) : (
                                        <input
                                          type="text"
                                          autoFocus
                                          value={editingField.tempValue}
                                          onChange={(e) =>
                                            setEditingField((prev) => ({ ...prev, tempValue: e.target.value }))
                                          }
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              e.preventDefault();
                                              handleSaveEditedDeducedField(msg.id, field.key, editingField.tempValue);
                                            } else if (e.key === 'Escape') {
                                              setEditingField(null);
                                            }
                                          }}
                                          className="px-2 py-0.5 bg-white border border-emerald-300 rounded-full text-xs font-semibold text-slate-900 focus:outline-none w-36"
                                        />
                                      )}
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleSaveEditedDeducedField(msg.id, field.key, editingField.tempValue)
                                        }
                                        className="px-2 py-0.5 rounded-full bg-emerald-700 text-white font-bold text-[11px] cursor-pointer"
                                      >
                                        OK
                                      </button>
                                    </div>
                                  );
                                }

                                return (
                                  <button
                                    key={field.key}
                                    type="button"
                                    disabled={card.executed}
                                    onClick={() =>
                                      setEditingField({
                                        msgId: msg.id,
                                        fieldKey: field.key,
                                        tempValue: String(field.value ?? ''),
                                      })
                                    }
                                    title="Cliquer pour modifier cette valeur"
                                    className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 hover:bg-emerald-100/90 text-emerald-950 border border-emerald-300 text-xs font-semibold transition-all cursor-pointer shadow-2xs"
                                  >
                                    <span>🟢</span>
                                    <span className="font-bold">{field.label} :</span>
                                    <span className="underline decoration-dotted underline-offset-2">{String(field.value)}</span>
                                    {!card.executed && (
                                      <span className="material-symbols-outlined text-[13px] text-emerald-700 opacity-60 group-hover:opacity-100">
                                        edit
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* SÉJOURS — Ann. 4 (Calendrier + Heure), Ann. 5 (Participants internes/externes), Chambres, Ann. 6 (ECS vs Chauffage vs Piscine) */}
                        {isStayCard && (
                          <div className="space-y-3">
                            {/* Bloc 1 : Dates & Heures avec Popover Calendrier + Heure (Ann. 4) */}
                            <div className="p-3.5 rounded-2xl bg-emerald-50/45 border border-emerald-200 space-y-2.5">
                              <span className="text-xs font-bold text-forest-deep flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[17px] text-primary">calendar_clock</span>
                                <span>Dates &amp; heures du séjour (cliquez pour ouvrir le calendrier et l’heure)</span>
                              </span>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  disabled={card.executed}
                                  onClick={() =>
                                    setOpenStayPicker(
                                      stayStartPickerOpen ? null : { msgId: msg.id, which: 'start' }
                                    )
                                  }
                                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-left transition-all cursor-pointer ${
                                    stayStartPickerOpen
                                      ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                                      : 'bg-white hover:bg-emerald-50 text-emerald-950 border-emerald-300'
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <span
                                      className={`block text-[10px] font-bold uppercase tracking-wider ${
                                        stayStartPickerOpen ? 'text-emerald-100' : 'text-emerald-700'
                                      }`}
                                    >
                                      Arrivée
                                    </span>
                                    <span className="text-xs font-bold block truncate">
                                      {formatFrDateShort(card.payload?.start_date)} à {card.payload?.arrival_time || '15:00'}
                                    </span>
                                  </div>
                                  <span className="material-symbols-outlined text-[17px] shrink-0">edit_calendar</span>
                                </button>

                                <button
                                  type="button"
                                  disabled={card.executed}
                                  onClick={() =>
                                    setOpenStayPicker(
                                      stayEndPickerOpen ? null : { msgId: msg.id, which: 'end' }
                                    )
                                  }
                                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-left transition-all cursor-pointer ${
                                    stayEndPickerOpen
                                      ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                                      : 'bg-white hover:bg-emerald-50 text-emerald-950 border-emerald-300'
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <span
                                      className={`block text-[10px] font-bold uppercase tracking-wider ${
                                        stayEndPickerOpen ? 'text-emerald-100' : 'text-emerald-700'
                                      }`}
                                    >
                                      Départ
                                    </span>
                                    <span className="text-xs font-bold block truncate">
                                      {formatFrDateShort(card.payload?.end_date)} à {card.payload?.departure_time || '11:00'}
                                    </span>
                                  </div>
                                  <span className="material-symbols-outlined text-[17px] shrink-0">edit_calendar</span>
                                </button>
                              </div>

                              {stayStartPickerOpen && !card.executed && (
                                <StayDateTimePickerPopover
                                  label="Date et heure d’arrivée au domaine"
                                  dateValue={card.payload?.start_date}
                                  timeValue={card.payload?.arrival_time || '15:00'}
                                  timePresets={['10:00', '14:00', '15:00', '18:00', '20:00']}
                                  onChangeDate={(d) => handleUpdateStayDateTime(msg.id, 'start', { date: d })}
                                  onChangeTime={(t) => handleUpdateStayDateTime(msg.id, 'start', { time: t })}
                                  onClose={() => setOpenStayPicker(null)}
                                />
                              )}

                              {stayEndPickerOpen && !card.executed && (
                                <StayDateTimePickerPopover
                                  label="Date et heure de départ du domaine"
                                  dateValue={card.payload?.end_date}
                                  timeValue={card.payload?.departure_time || '11:00'}
                                  minDate={card.payload?.start_date}
                                  timePresets={['10:00', '11:00', '14:00', '17:00', '18:00']}
                                  onChangeDate={(d) => handleUpdateStayDateTime(msg.id, 'end', { date: d })}
                                  onChangeTime={(t) => handleUpdateStayDateTime(msg.id, 'end', { time: t })}
                                  onClose={() => setOpenStayPicker(null)}
                                />
                              )}
                            </div>

                            {/* Bloc 2 : Composition du groupe — Internes SCI + Invités extérieurs (Ann. 5) */}
                            <div className="p-3.5 rounded-2xl bg-slate-50/90 border border-slate-200 space-y-2.5">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="text-xs font-bold text-forest-deep flex items-center gap-1.5">
                                  <span className="material-symbols-outlined text-[17px] text-primary">group</span>
                                  <span>Participants internes SCI &amp; invités extérieurs</span>
                                </span>
                                <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-900 border border-emerald-200 text-[11px] font-bold">
                                  {stayTotalOccupants} occupant{stayTotalOccupants > 1 ? 's' : ''}
                                </span>
                              </div>

                              <div className="space-y-1.5">
                                <span className="text-[11px] font-bold text-slate-600 block">
                                  Associés de la SCI présents ({staySelectedMembers.length}) :
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                  {associateChoices.map((assocName) => {
                                    const selected = staySelectedMembers.includes(assocName);
                                    return (
                                      <button
                                        key={assocName}
                                        type="button"
                                        disabled={card.executed}
                                        onClick={() => handleToggleStayMember(msg.id, assocName)}
                                        className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-all cursor-pointer ${
                                          selected
                                            ? 'bg-emerald-700 text-white border-emerald-700 shadow-2xs'
                                            : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-400'
                                        }`}
                                      >
                                        {selected ? '✓ ' : ''}{assocName.split(' ')[0]}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="space-y-1.5 pt-1">
                                <span className="text-[11px] font-bold text-slate-600 block">
                                  Invités extérieurs à la SCI ({stayExternalGuests.length}) :
                                </span>
                                {!card.executed && (
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="text"
                                      value={stayExternalInputs[msg.id] || ''}
                                      onChange={(e) =>
                                        setStayExternalInputs((prev) => ({ ...prev, [msg.id]: e.target.value }))
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          handleAddStayExternalGuest(msg.id);
                                        }
                                      }}
                                      placeholder="Prénom ou nom d’un invité extérieur…"
                                      className="flex-1 h-8 px-3 rounded-xl bg-white border border-slate-200 text-xs focus:outline-none focus:border-primary"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleAddStayExternalGuest(msg.id)}
                                      className="h-8 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-xs font-bold cursor-pointer shrink-0"
                                    >
                                      + Ajouter
                                    </button>
                                  </div>
                                )}
                                {stayExternalGuests.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                                    {stayExternalGuests.map((guest, gIdx) => (
                                      <span
                                        key={`${guest}-${gIdx}`}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-slate-200 text-[11px] font-semibold text-slate-800"
                                      >
                                        <span className="material-symbols-outlined text-[13px] text-primary">person</span>
                                        <span>{guest}</span>
                                        {!card.executed && (
                                          <button
                                            type="button"
                                            onClick={() => handleRemoveStayExternalGuest(msg.id, gIdx)}
                                            className="text-slate-400 hover:text-rose-600 ml-0.5 cursor-pointer"
                                            title={`Retirer ${guest}`}
                                          >
                                            ×
                                          </button>
                                        )}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Bloc 3 : Chambres bornées + sélection optionnelle par nom */}
                            <div className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-200 space-y-3">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div>
                                  <span className="text-xs font-bold text-amber-950 block">
                                    🛏️ Chambres occupées ({card.payload?.building || 'Presbytère'} — max {stayMaxRooms})
                                  </span>
                                  <span className="text-[11px] text-amber-900/80">
                                    Presbytère : 5 ch. • Rosings : 2 ch. • Tout le domaine : 7 ch.
                                  </span>
                                </div>
                                <div className="inline-flex items-center gap-1.5 bg-white px-2 py-1 rounded-full border border-amber-300">
                                  <button
                                    type="button"
                                    disabled={card.executed || stayCurrentRooms <= 1}
                                    onClick={() => handleSetStayChambers(msg.id, stayCurrentRooms - 1)}
                                    className="w-6 h-6 rounded-full bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold text-sm flex items-center justify-center cursor-pointer disabled:opacity-40"
                                  >
                                    −
                                  </button>
                                  <span className={`min-w-[44px] text-center text-xs font-black ${stayRoomOverflow ? 'text-rose-700' : 'text-forest-deep'}`}>
                                    {stayCurrentRooms} / {stayMaxRooms}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={card.executed || stayCurrentRooms >= stayMaxRooms}
                                    onClick={() => handleSetStayChambers(msg.id, stayCurrentRooms + 1)}
                                    className="w-6 h-6 rounded-full bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold text-sm flex items-center justify-center cursor-pointer disabled:opacity-40"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>

                              {stayRoomOverflow && (
                                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs flex items-center justify-between gap-2 flex-wrap">
                                  <span className="font-semibold">
                                    ⚠️ {stayCurrentRooms} chambres demandées, mais {card.payload?.building || 'Presbytère'} ne compte que {stayMaxRooms} chambres maximum.
                                  </span>
                                  {!card.executed && (
                                    <button
                                      type="button"
                                      onClick={() => handleSetStayChambers(msg.id, stayMaxRooms)}
                                      className="px-2.5 py-1 rounded-full bg-rose-700 text-white text-[11px] font-bold cursor-pointer"
                                    >
                                      Ajuster à {stayMaxRooms} ch.
                                    </button>
                                  )}
                                </div>
                              )}

                              <div className="space-y-1.5">
                                <span className="text-[11px] font-bold text-slate-700 block">
                                  Choisir des chambres précises (optionnel) :
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                  {stayAvailableRooms.map((room) => {
                                    const selected = staySelectedRooms.includes(room.name);
                                    return (
                                      <button
                                        key={room.name}
                                        type="button"
                                        disabled={card.executed}
                                        onClick={() => handleToggleStayRoom(msg.id, room.name)}
                                        className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-all cursor-pointer ${
                                          selected
                                            ? 'bg-emerald-700 text-white border-emerald-700 shadow-2xs'
                                            : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-400'
                                        }`}
                                      >
                                        {selected ? '✓ ' : ''}{room.shortLabel}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>

                            {/* Bloc 4 : Énergie & Confort Thermique — Eau Chaude vs Chauffage vs Piscine (Ann. 6) */}
                            <div className="p-3.5 rounded-2xl bg-teal-50/50 border border-teal-200 space-y-2.5">
                              <span className="text-xs font-bold text-forest-deep flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[17px] text-teal-700">thermostat</span>
                                <span>Énergie &amp; confort thermique (Eau chaude vs Chauffage)</span>
                              </span>

                              <div className="grid grid-cols-1 gap-2 text-xs">
                                <label
                                  className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-colors ${
                                    card.executed || card.payload?.activate_heating
                                      ? 'cursor-default'
                                      : 'cursor-pointer'
                                  } ${
                                    card.payload?.activate_heating || card.payload?.activate_dhw
                                      ? 'bg-white border-teal-300'
                                      : 'bg-white/60 border-slate-200'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    disabled={card.executed || Boolean(card.payload?.activate_heating)}
                                    checked={Boolean(card.payload?.activate_heating || card.payload?.activate_dhw)}
                                    onChange={(e) => handleToggleStayEnergy(msg.id, 'activate_dhw', e.target.checked)}
                                    className="mt-0.5 w-4 h-4 rounded accent-primary"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                      <span className="font-bold text-slate-900">
                                        🚿 Eau Chaude Sanitaire — Presbytère (52 °C)
                                      </span>
                                      <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
                                        {card.payload?.activate_heating
                                          ? 'Inclus avec chauffage'
                                          : card.payload?.activate_dhw
                                          ? 'Activée (52 °C)'
                                          : 'Éteinte'}
                                      </span>
                                    </div>
                                    <span className="text-[11px] text-slate-500 block mt-0.5">
                                      Chauffe uniquement le ballon d’eau chaude (douches/cuisine) sans allumer les radiateurs.
                                    </span>
                                  </div>
                                </label>

                                <label
                                  className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-colors ${
                                    card.executed ? 'cursor-default' : 'cursor-pointer'
                                  } ${
                                    card.payload?.activate_heating
                                      ? 'bg-white border-amber-300'
                                      : 'bg-white/60 border-slate-200'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    disabled={card.executed}
                                    checked={Boolean(card.payload?.activate_heating)}
                                    onChange={(e) => handleToggleStayEnergy(msg.id, 'activate_heating', e.target.checked)}
                                    className="mt-0.5 w-4 h-4 rounded accent-primary"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                      <span className="font-bold text-slate-900">
                                        🔥 Chauffage Radiateurs — Presbytère (20 °C jour / 6 °C nuit)
                                      </span>
                                      <span
                                        className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full border ${
                                          card.payload?.activate_heating
                                            ? 'bg-amber-50 text-amber-900 border-amber-300'
                                            : 'bg-slate-100 text-slate-600 border-slate-200'
                                        }`}
                                      >
                                        {card.payload?.activate_heating ? 'Chauffage + ECS actifs' : 'Hors-gel / Veille'}
                                      </span>
                                    </div>
                                    <span className="text-[11px] text-slate-500 block mt-0.5">
                                      Anticipation automatique ViCare avant l’heure d’arrivée (inclut l’eau chaude 52 °C).
                                    </span>
                                  </div>
                                </label>

                                <label
                                  className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-colors ${
                                    card.executed ? 'cursor-default' : 'cursor-pointer'
                                  } ${
                                    card.payload?.activate_pool
                                      ? 'bg-white border-sky-300'
                                      : 'bg-white/60 border-slate-200'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    disabled={card.executed}
                                    checked={Boolean(card.payload?.activate_pool)}
                                    onChange={(e) => handleToggleStayEnergy(msg.id, 'activate_pool', e.target.checked)}
                                    className="mt-0.5 w-4 h-4 rounded accent-primary"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                      <span className="font-bold text-slate-900">
                                        🏊 Préchauffage Piscine — Rosings (27 °C)
                                      </span>
                                      <span
                                        className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full border ${
                                          card.payload?.activate_pool
                                            ? 'bg-sky-50 text-sky-900 border-sky-300'
                                            : 'bg-slate-100 text-slate-600 border-slate-200'
                                        }`}
                                      >
                                        {card.payload?.activate_pool ? 'Programmé (27 °C)' : 'Éteinte'}
                                      </span>
                                    </div>
                                  </div>
                                </label>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* TÂCHES (CRÉATION) — Annotations 5 & 6 : Titre + Description uniquement (tout le reste est géré par les coordinateurs) */}
                        {isTaskCreateCard && (
                          <div className="space-y-3 text-xs">
                            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-[11.5px] flex items-start gap-2">
                              <span className="material-symbols-outlined text-[16px] text-amber-700 shrink-0 mt-0.5">info</span>
                              <span>
                                Statut initial automatique : <strong>Proposition à arbitrer</strong>. Décrivez simplement la tâche (titre et description) : l’emplacement, la charge, la priorité, le devis et l’attribution sont estimés et gérés ensuite par les coordinateurs.
                              </span>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[11px] font-bold uppercase tracking-wider text-sky-900 block">
                                Titre de la tâche *
                              </label>
                              <input
                                type="text"
                                disabled={card.executed}
                                value={card.payload?.title || ''}
                                onChange={(e) =>
                                  updateCardInMessage(msg.id, (c) => ({
                                    ...c,
                                    payload: { ...(c.payload || {}), title: e.target.value },
                                  }))
                                }
                                placeholder="Ex : Vérifier le goutte-à-goutte du jardin"
                                className="w-full h-9 px-3 rounded-xl bg-white border border-slate-200 focus:border-primary text-xs font-semibold text-slate-900 focus:outline-none"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[11px] font-bold text-slate-600 block">
                                Description
                              </label>
                              <textarea
                                rows={4}
                                disabled={card.executed}
                                value={card.payload?.description || ''}
                                onChange={(e) =>
                                  updateCardInMessage(msg.id, (c) => ({
                                    ...c,
                                    payload: { ...(c.payload || {}), description: e.target.value },
                                  }))
                                }
                                placeholder="Décrivez le besoin ou le problème constaté..."
                                className="w-full p-2.5 rounded-xl bg-sky-50/35 border border-sky-200 text-xs text-slate-800 focus:outline-none focus:border-primary"
                              />
                            </div>

                            {card.localFileObj?.file && (
                              <label className="flex items-center justify-between gap-2.5 p-2.5 rounded-xl bg-indigo-50/60 border border-indigo-200 cursor-pointer">
                                <div className="flex items-center gap-2 min-w-0">
                                  <input
                                    type="checkbox"
                                    disabled={card.executed}
                                    checked={card.payload?.attach_uploaded_file !== false}
                                    onChange={(e) =>
                                      updateCardInMessage(msg.id, (c) => ({
                                        ...c,
                                        payload: { ...(c.payload || {}), attach_uploaded_file: e.target.checked },
                                      }))
                                    }
                                    className="w-4 h-4 rounded accent-indigo-700 shrink-0"
                                  />
                                  <span className="material-symbols-outlined text-[16px] text-indigo-700 shrink-0">
                                    attach_file
                                  </span>
                                  <span className="text-xs font-semibold text-indigo-950 truncate">
                                    Archiver et joindre « {card.localFileObj.name} » à cette nouvelle tâche
                                  </span>
                                </div>
                                <span className="text-[10.5px] font-bold text-indigo-700 shrink-0">
                                  {Math.max(1, Math.round((card.localFileObj.size || 0) / 1024))} Ko
                                </span>
                              </label>
                            )}
                          </div>
                        )}

                        {/* TÂCHES (MODIFICATION EXISTANTE) — Annotation 3 : modifiable avec validation utilisateur */}
                        {isTaskUpdateCard && (
                          <div className="space-y-3 text-xs">
                            <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-200 text-sky-950 text-[11.5px] flex items-center justify-between gap-2 flex-wrap">
                              <span className="inline-flex items-center gap-1.5 font-semibold">
                                <span className="material-symbols-outlined text-[16px] text-sky-700">edit</span>
                                <span>
                                  {card.payload?.task_id
                                    ? `Modification de la tâche #${card.payload.task_id}`
                                    : 'Sélectionnez la tâche à modifier'}
                                </span>
                              </span>
                            </div>

                            {!card.payload?.task_id && (
                              <div className="space-y-1">
                                <label className="text-[11px] font-bold text-sky-900 block">Tâche cible *</label>
                                <select
                                  disabled={card.executed}
                                  value={card.payload?.task_id || ''}
                                  onChange={(e) => {
                                    const tid = e.target.value ? Number(e.target.value) : null;
                                    const found = (portalState?.tasks || []).find((t) => Number(t.id) === tid);
                                    updateCardInMessage(msg.id, (c) => ({
                                      ...c,
                                      payload: {
                                        ...(c.payload || {}),
                                        task_id: tid,
                                        title: c.payload?.title || found?.title || '',
                                        description: c.payload?.description || found?.description || '',
                                      },
                                    }));
                                  }}
                                  className="w-full h-9 px-2.5 rounded-xl bg-white border border-sky-200 text-xs font-medium text-slate-900"
                                >
                                  <option value="">— Choisir une tâche —</option>
                                  {(portalState?.tasks || []).map((t) => (
                                    <option key={t.id} value={t.id}>
                                      #{t.id} — {t.title}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}

                            <div className="space-y-1">
                              <label className="text-[11px] font-bold uppercase tracking-wider text-sky-900 block">
                                Nouveau titre *
                              </label>
                              <input
                                type="text"
                                disabled={card.executed}
                                value={card.payload?.title || ''}
                                onChange={(e) =>
                                  updateCardInMessage(msg.id, (c) => ({
                                    ...c,
                                    payload: { ...(c.payload || {}), title: e.target.value },
                                  }))
                                }
                                className="w-full h-9 px-3 rounded-xl bg-white border border-slate-200 focus:border-primary text-xs font-semibold text-slate-900 focus:outline-none"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[11px] font-bold text-slate-600 block">Description</label>
                              <textarea
                                rows={4}
                                disabled={card.executed}
                                value={card.payload?.description || ''}
                                onChange={(e) =>
                                  updateCardInMessage(msg.id, (c) => ({
                                    ...c,
                                    payload: { ...(c.payload || {}), description: e.target.value },
                                  }))
                                }
                                className="w-full p-2.5 rounded-xl bg-sky-50/35 border border-sky-200 text-xs text-slate-800 focus:outline-none focus:border-primary"
                              />
                            </div>

                            {isCoordinator && (
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                                <div className="space-y-1">
                                  <label className="text-[11px] font-bold text-slate-600 block">Emplacement</label>
                                  <select
                                    disabled={card.executed}
                                    value={card.payload?.subject || 'Presbytère'}
                                    onChange={(e) =>
                                      updateCardInMessage(msg.id, (c) => ({
                                        ...c,
                                        payload: { ...(c.payload || {}), subject: e.target.value },
                                      }))
                                    }
                                    className="w-full h-9 px-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900"
                                  >
                                    {TASK_SUBJECTS.map((s) => (
                                      <option key={s} value={s}>{s}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[11px] font-bold text-slate-600 block">Difficulté (points)</label>
                                  <select
                                    disabled={card.executed}
                                    value={card.payload?.difficulty || card.payload?.complexity || 'Moyenne'}
                                    onChange={(e) =>
                                      updateCardInMessage(msg.id, (c) => ({
                                        ...c,
                                        payload: { ...(c.payload || {}), difficulty: e.target.value, complexity: e.target.value },
                                      }))
                                    }
                                    className="w-full h-9 px-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900"
                                  >
                                    {TASK_COMPLEXITIES.map((cx) => (
                                      <option key={cx} value={cx}>{cx}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[11px] font-bold text-slate-600 block">Urgence</label>
                                  <select
                                    disabled={card.executed}
                                    value={card.payload?.urgency || card.payload?.priority || 'Normale'}
                                    onChange={(e) =>
                                      updateCardInMessage(msg.id, (c) => ({
                                        ...c,
                                        payload: { ...(c.payload || {}), urgency: e.target.value, priority: e.target.value },
                                      }))
                                    }
                                    className="w-full h-9 px-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900"
                                  >
                                    {TASK_PRIORITIES.map((pr) => (
                                      <option key={pr} value={pr}>{pr}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* PUBLICATION D'UN MESSAGE / COMMENTAIRE — Annotation 3 */}
                        {isCommentCard && (
                          <div className="space-y-3 text-xs">
                            <div className="space-y-1">
                              <label className="text-[11px] font-bold text-teal-900 block">
                                Fil cible ({card.payload?.target_type === 'vote' ? 'Scrutin' : 'Tâche'}) *
                              </label>
                              <select
                                disabled={card.executed}
                                value={card.payload?.target_id || ''}
                                onChange={(e) =>
                                  updateCardInMessage(msg.id, (c) => ({
                                    ...c,
                                    payload: {
                                      ...(c.payload || {}),
                                      target_id: e.target.value ? Number(e.target.value) : null,
                                    },
                                  }))
                                }
                                className="w-full h-9 px-2.5 rounded-xl bg-white border border-teal-200 text-xs font-medium text-slate-900"
                              >
                                <option value="">— Sélectionner —</option>
                                {(card.payload?.target_type === 'vote'
                                  ? portalState?.open_votes || []
                                  : portalState?.tasks || []
                                ).map((item) => (
                                  <option key={item.id} value={item.id}>
                                    #{item.id} — {item.title}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[11px] font-bold uppercase tracking-wider text-teal-900 block">
                                Message à publier * (mentions @Prénom supportées)
                              </label>
                              <textarea
                                rows={3}
                                disabled={card.executed}
                                value={card.payload?.content || ''}
                                onChange={(e) =>
                                  updateCardInMessage(msg.id, (c) => ({
                                    ...c,
                                    payload: { ...(c.payload || {}), content: e.target.value },
                                  }))
                                }
                                placeholder="Saisissez le message à publier dans le fil de discussion..."
                                className="w-full p-2.5 rounded-xl bg-teal-50/35 border border-teal-200 text-xs text-slate-800 focus:outline-none focus:border-teal-500"
                              />
                            </div>
                          </div>
                        )}

                        {/* SCRUTINS (CRÉATION / OUVERTURE) — Ann. 8 : Miroir strict VoteRoofModal */}
                        {isPollSetupCard && (
                          <div className="space-y-3.5 text-xs">
                            {card.payload?.operation === 'create' && (
                              <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-950 text-[11.5px] flex items-start gap-2">
                                <span className="material-symbols-outlined text-[16px] text-purple-700 shrink-0 mt-0.5">info</span>
                                <span>
                                  Statut initial automatique : <strong>Proposition à arbitrer</strong> avant ouverture du scrutin par un coordinateur.
                                </span>
                              </div>
                            )}

                            <div className="space-y-1">
                              <label className="text-[11px] font-bold uppercase tracking-wider text-purple-900 block">
                                Titre du scrutin *
                              </label>
                              <input
                                type="text"
                                disabled={card.executed}
                                value={card.payload?.title || ''}
                                onChange={(e) =>
                                  updateCardInMessage(msg.id, (c) => ({
                                    ...c,
                                    payload: { ...(c.payload || {}), title: e.target.value },
                                  }))
                                }
                                placeholder="Ex : Couleur des volets du Presbytère"
                                className="w-full h-9 px-3 rounded-xl bg-white border border-purple-200 focus:border-purple-500 text-xs font-semibold text-slate-900 focus:outline-none"
                              />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <div className="space-y-1">
                                <label className="text-[11px] font-bold text-slate-600 block">Lieu / Catégorie</label>
                                <select
                                  disabled={card.executed}
                                  value={card.payload?.category || 'Presbytère'}
                                  onChange={(e) =>
                                    updateCardInMessage(msg.id, (c) => ({
                                      ...c,
                                      payload: { ...(c.payload || {}), category: e.target.value },
                                    }))
                                  }
                                  className="w-full h-9 px-2.5 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-900"
                                >
                                  {TASK_SUBJECTS.map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[11px] font-bold text-slate-600 block">Priorité</label>
                                <select
                                  disabled={card.executed}
                                  value={card.payload?.priority || 'Normale'}
                                  onChange={(e) =>
                                    updateCardInMessage(msg.id, (c) => ({
                                      ...c,
                                      payload: { ...(c.payload || {}), priority: e.target.value },
                                    }))
                                  }
                                  className="w-full h-9 px-2.5 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-900"
                                >
                                  {VOTE_PRIORITIES.map((pr) => (
                                    <option key={pr} value={pr}>{pr}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[11px] font-bold text-slate-600 block">Budget estimé (€)</label>
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  disabled={card.executed}
                                  value={card.payload?.estimated_cost || ''}
                                  onChange={(e) =>
                                    updateCardInMessage(msg.id, (c) => ({
                                      ...c,
                                      payload: {
                                        ...(c.payload || {}),
                                        estimated_cost: e.target.value ? Number(e.target.value) : 0,
                                      },
                                    }))
                                  }
                                  placeholder="0 €"
                                  className="w-full h-9 px-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-900"
                                />
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-[11px] font-bold uppercase tracking-wider text-purple-900 block">
                                📝 Texte / description du scrutin
                              </label>
                              <textarea
                                rows={2}
                                disabled={card.executed}
                                value={card.payload?.description || ''}
                                onChange={(e) =>
                                  updateCardInMessage(msg.id, (c) => ({
                                    ...c,
                                    payload: { ...(c.payload || {}), description: e.target.value },
                                  }))
                                }
                                placeholder="Expliquez brièvement l'objet du scrutin aux associés..."
                                className="w-full p-2.5 rounded-xl bg-purple-50/40 border border-purple-200 text-xs text-slate-800 focus:outline-none focus:border-purple-500"
                              />
                            </div>

                            <label className="inline-flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                              <input
                                type="checkbox"
                                disabled={card.executed}
                                checked={Boolean(card.payload?.allow_multiple_choices)}
                                onChange={(e) =>
                                  updateCardInMessage(msg.id, (c) => ({
                                    ...c,
                                    payload: { ...(c.payload || {}), allow_multiple_choices: e.target.checked },
                                  }))
                                }
                                className="accent-purple-700"
                              />
                              <span>Autoriser plusieurs réponses par associé</span>
                            </label>

                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-purple-900">
                                  🗳️ Options proposées ({pollOptions.length} — min. 2)
                                </span>
                                {!card.executed && (
                                  <button
                                    type="button"
                                    onClick={() => handleAddPollOption(msg.id, '')}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 text-[11px] font-bold cursor-pointer"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">add</span>
                                    <span>Ajouter une option</span>
                                  </button>
                                )}
                              </div>

                              <div className="space-y-2">
                                {pollOptions.map((optText, optIdx) => {
                                  const pickerOpen =
                                    openDatePickerTarget &&
                                    openDatePickerTarget.msgId === msg.id &&
                                    openDatePickerTarget.optIdx === optIdx;
                                  return (
                                    <div key={optIdx} className="space-y-1">
                                      <div className="flex items-center gap-1.5">
                                        <span className="w-5 text-[11px] font-mono font-bold text-slate-400 text-right shrink-0">
                                          {optIdx + 1}.
                                        </span>
                                        <input
                                          type="text"
                                          disabled={card.executed}
                                          value={optText}
                                          onChange={(e) => handleUpdatePollOption(msg.id, optIdx, e.target.value)}
                                          placeholder="Ex : Sam. 10 – Dim. 11 avril 2027"
                                          className="flex-1 h-9 px-3 rounded-xl bg-white border border-slate-200 focus:border-purple-500 text-xs font-medium text-slate-900 focus:outline-none"
                                        />
                                        {!card.executed && (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setOpenDatePickerTarget(
                                                  pickerOpen ? null : { msgId: msg.id, optIdx }
                                                )
                                              }
                                              title="Choisir une date ou un week-end dans le calendrier"
                                              className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                                                pickerOpen
                                                  ? 'bg-purple-700 text-white border-purple-700'
                                                  : 'bg-purple-50 hover:bg-purple-100 text-purple-800 border-purple-200'
                                              }`}
                                            >
                                              <span className="material-symbols-outlined text-[17px]">calendar_month</span>
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleDeletePollOption(msg.id, optIdx)}
                                              title="Supprimer cette option"
                                              className="w-9 h-9 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 flex items-center justify-center shrink-0 cursor-pointer"
                                            >
                                              <span className="material-symbols-outlined text-[17px]">delete</span>
                                            </button>
                                          </>
                                        )}
                                      </div>
                                      {pickerOpen && !card.executed && (
                                        <div className="pl-6">
                                          <MiniFrenchDatePicker
                                            onPickDateLabel={(formatted) =>
                                              handleUpdatePollOption(msg.id, optIdx, formatted)
                                            }
                                            onClose={() => setOpenDatePickerTarget(null)}
                                          />
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {card.localFileObj?.file && card.payload?.operation === 'create' && (
                              <label className="flex items-center justify-between gap-2.5 p-2.5 rounded-xl bg-indigo-50/60 border border-indigo-200 cursor-pointer">
                                <div className="flex items-center gap-2 min-w-0">
                                  <input
                                    type="checkbox"
                                    disabled={card.executed}
                                    checked={card.payload?.attach_uploaded_file !== false}
                                    onChange={(e) =>
                                      updateCardInMessage(msg.id, (c) => ({
                                        ...c,
                                        payload: { ...(c.payload || {}), attach_uploaded_file: e.target.checked },
                                      }))
                                    }
                                    className="w-4 h-4 rounded accent-indigo-700 shrink-0"
                                  />
                                  <span className="material-symbols-outlined text-[16px] text-indigo-700 shrink-0">
                                    attach_file
                                  </span>
                                  <span className="text-xs font-semibold text-indigo-950 truncate">
                                    Archiver et joindre « {card.localFileObj.name} » à ce nouveau scrutin
                                  </span>
                                </div>
                                <span className="text-[10.5px] font-bold text-indigo-700 shrink-0">
                                  {Math.max(1, Math.round((card.localFileObj.size || 0) / 1024))} Ko
                                </span>
                              </label>
                            )}
                          </div>
                        )}

                        {/* DOCUMENTS (ARCHIVAGE / LIAISON TÂCHE OU VOTE) — Annotation 3 */}
                        {isDocumentCard && (
                          <div className="space-y-3 text-xs">
                            {card.payload?.existing_document_id ? (
                              <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-950 flex items-center gap-2 font-semibold">
                                <span className="material-symbols-outlined text-[18px] text-indigo-700 shrink-0">
                                  folder_open
                                </span>
                                <span>
                                  Document existant en bibliothèque (#{card.payload.existing_document_id}) : «{' '}
                                  {card.payload.title || card.payload.document_filename || 'Document'} »
                                </span>
                              </div>
                            ) : card.localFileObj?.file ? (
                              <div className="p-2.5 rounded-xl bg-indigo-50/70 border border-indigo-200 text-indigo-950 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="material-symbols-outlined text-[18px] text-indigo-700 shrink-0">
                                    upload_file
                                  </span>
                                  <span className="font-semibold truncate">{card.localFileObj.name}</span>
                                </div>
                                <span className="text-[11px] font-bold text-indigo-700 shrink-0">
                                  {Math.max(1, Math.round((card.localFileObj.size || 0) / 1024))} Ko · Google Drive
                                </span>
                              </div>
                            ) : (
                              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-center justify-between gap-2 flex-wrap">
                                <span className="font-semibold">
                                  Aucun fichier local sélectionné pour cet archivage.
                                </span>
                                {!card.executed && (
                                  <label className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-rose-700 hover:bg-rose-800 text-white text-[11px] font-bold cursor-pointer">
                                    <span className="material-symbols-outlined text-[14px]">add</span>
                                    <span>Choisir un fichier</span>
                                    <input
                                      type="file"
                                      accept="image/*,.pdf,application/pdf,.doc,.docx,.txt,.csv,.xlsx"
                                      className="sr-only"
                                      onChange={(e) => {
                                        const picked = e.target.files?.[0];
                                        if (picked) {
                                          updateCardInMessage(msg.id, (c) => ({
                                            ...c,
                                            localFileObj: {
                                              file: picked,
                                              name: picked.name,
                                              mime: picked.type || 'application/octet-stream',
                                              size: picked.size,
                                            },
                                            payload: {
                                              ...(c.payload || {}),
                                              document_filename: picked.name,
                                              title: c.payload?.title || picked.name.replace(/\.[^.]+$/, ''),
                                            },
                                          }));
                                        }
                                        e.target.value = '';
                                      }}
                                    />
                                  </label>
                                )}
                              </div>
                            )}

                            {docNeedsUpload && (
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div className="space-y-1">
                                  <label className="text-[11px] font-bold text-slate-600 block">
                                    Organisme / Source
                                  </label>
                                  <input
                                    type="text"
                                    disabled={card.executed}
                                    value={card.payload?.organisme || ''}
                                    onChange={(e) =>
                                      updateCardInMessage(msg.id, (c) => ({
                                        ...c,
                                        payload: { ...(c.payload || {}), organisme: e.target.value },
                                      }))
                                    }
                                    placeholder="Ex : EDF, Plombier, SCI..."
                                    className="w-full h-9 px-3 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:border-primary"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[11px] font-bold uppercase tracking-wider text-indigo-900 block">
                                    Titre du document *
                                  </label>
                                  <input
                                    type="text"
                                    disabled={card.executed}
                                    value={card.payload?.title || ''}
                                    onChange={(e) =>
                                      updateCardInMessage(msg.id, (c) => ({
                                        ...c,
                                        payload: { ...(c.payload || {}), title: e.target.value },
                                      }))
                                    }
                                    placeholder="Ex : Devis réfection gouttière"
                                    className="w-full h-9 px-3 rounded-xl bg-white border border-indigo-200 text-xs font-semibold text-slate-900 focus:outline-none focus:border-indigo-500"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[11px] font-bold text-slate-600 block">Catégorie</label>
                                  <select
                                    disabled={card.executed}
                                    value={card.payload?.category || 'Travaux & Chantiers'}
                                    onChange={(e) =>
                                      updateCardInMessage(msg.id, (c) => ({
                                        ...c,
                                        payload: { ...(c.payload || {}), category: e.target.value },
                                      }))
                                    }
                                    className="w-full h-9 px-2.5 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-900"
                                  >
                                    {DOCUMENT_ARCHIVE_CATEGORIES.map((cat) => (
                                      <option key={cat} value={cat}>
                                        {cat}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            )}

                            <div className="space-y-2">
                              <label className="text-[11px] font-bold text-slate-600 block">Destination sur le portail</label>
                              <div className="flex flex-wrap gap-1.5">
                                {[
                                  { value: 'archive', label: 'Bibliothèque SCI uniquement', icon: 'folder' },
                                  { value: 'link_task', label: 'Lier à une tâche existante', icon: 'checklist' },
                                  { value: 'link_vote', label: 'Lier à un scrutin existant', icon: 'how_to_vote' },
                                ].map((opt) => {
                                  const active = docOperation === opt.value;
                                  return (
                                    <button
                                      key={opt.value}
                                      type="button"
                                      disabled={card.executed}
                                      onClick={() =>
                                        updateCardInMessage(msg.id, (c) => ({
                                          ...c,
                                          payload: {
                                            ...(c.payload || {}),
                                            operation: opt.value,
                                            task_id: opt.value === 'link_task' ? c.payload?.task_id || null : null,
                                            project_id: opt.value === 'link_vote' ? c.payload?.project_id || null : null,
                                          },
                                        }))
                                      }
                                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all cursor-pointer ${
                                        active
                                          ? 'bg-indigo-700 text-white border-indigo-700 shadow-2xs'
                                          : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                                      }`}
                                    >
                                      <span className="material-symbols-outlined text-[15px]">{opt.icon}</span>
                                      <span>{opt.label}</span>
                                    </button>
                                  );
                                })}
                              </div>

                              {docOperation === 'link_task' && (
                                <div className="space-y-1 pt-1">
                                  <label className="text-[11px] font-bold text-indigo-900 block">
                                    Tâche cible *
                                  </label>
                                  <select
                                    disabled={card.executed}
                                    value={card.payload?.task_id || ''}
                                    onChange={(e) =>
                                      updateCardInMessage(msg.id, (c) => ({
                                        ...c,
                                        payload: {
                                          ...(c.payload || {}),
                                          task_id: e.target.value ? Number(e.target.value) : null,
                                        },
                                      }))
                                    }
                                    className="w-full h-9 px-2.5 rounded-xl bg-white border border-indigo-200 text-xs font-medium text-slate-900"
                                  >
                                    <option value="">— Sélectionner une tâche —</option>
                                    {(portalState?.tasks || []).map((t) => (
                                      <option key={t.id} value={t.id}>
                                        #{t.id} — {t.title} ({t.status})
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}

                              {docOperation === 'link_vote' && (
                                <div className="space-y-1 pt-1">
                                  <label className="text-[11px] font-bold text-indigo-900 block">
                                    Scrutin cible *
                                  </label>
                                  <select
                                    disabled={card.executed}
                                    value={card.payload?.project_id || ''}
                                    onChange={(e) =>
                                      updateCardInMessage(msg.id, (c) => ({
                                        ...c,
                                        payload: {
                                          ...(c.payload || {}),
                                          project_id: e.target.value ? Number(e.target.value) : null,
                                        },
                                      }))
                                    }
                                    className="w-full h-9 px-2.5 rounded-xl bg-white border border-indigo-200 text-xs font-medium text-slate-900"
                                  >
                                    <option value="">— Sélectionner un scrutin —</option>
                                    {(portalState?.open_votes || []).map((v) => (
                                      <option key={v.id} value={v.id}>
                                        #{v.id} — {v.title} ({v.status})
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Justificatif réel attaché à une carte Dépense / Facture */}
                        {card.action_type === 'expense' && card.localFileObj?.file && (
                          <label className="flex items-center justify-between gap-2.5 p-2.5 rounded-xl bg-amber-50/70 border border-amber-200 cursor-pointer text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                disabled={card.executed}
                                checked={card.payload?.attach_uploaded_file !== false}
                                onChange={(e) =>
                                  updateCardInMessage(msg.id, (c) => ({
                                    ...c,
                                    payload: { ...(c.payload || {}), attach_uploaded_file: e.target.checked },
                                  }))
                                }
                                className="w-4 h-4 rounded accent-amber-700 shrink-0"
                              />
                              <span className="material-symbols-outlined text-[16px] text-amber-700 shrink-0">
                                receipt_long
                              </span>
                              <span className="font-semibold text-amber-950 truncate">
                                Archiver le justificatif « {card.localFileObj.name} » sur Google Drive
                              </span>
                            </div>
                            <span className="text-[10.5px] font-bold text-amber-800 shrink-0">
                              {Math.max(1, Math.round((card.localFileObj.size || 0) / 1024))} Ko
                            </span>
                          </label>
                        )}

                        {/* Ann. 10 : Contenu éditable pour les fiches Vademecum */}
                        {isVademecumCard && (
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-emerald-900 block">
                              📖 Contenu pratique de la fiche Vademecum
                            </label>
                            <textarea
                              rows={3}
                              disabled={card.executed}
                              value={card.payload?.content || ''}
                              onChange={(e) =>
                                updateCardInMessage(msg.id, (c) => ({
                                  ...c,
                                  payload: { ...(c.payload || {}), content: e.target.value },
                                }))
                              }
                              className="w-full p-2.5 rounded-xl bg-emerald-50/40 border border-emerald-200 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                        )}

                        {/* Champs 🔴 manquants */}
                        {card.missing_fields.length > 0 && (
                          <div className="space-y-2.5 p-3.5 rounded-2xl bg-rose-50/90 border-2 border-rose-300">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-900 block">
                              🔴 Précisions requises avant validation ({card.missing_fields.length})
                            </span>

                            <div className="space-y-3">
                              {card.missing_fields.map((mField) => {
                                const customKey = `${msg.id}_${mField.key}`;
                                const customVal = customMissingInputs[customKey] || '';

                                return (
                                  <div
                                    key={mField.key}
                                    className="p-3 rounded-xl bg-white border border-rose-200 shadow-2xs space-y-2"
                                  >
                                    <div className="text-xs font-bold text-rose-950 flex items-start gap-1.5">
                                      <span>🔴</span>
                                      <span>{mField.question || mField.label}</span>
                                    </div>

                                    {mField.options && mField.options.length > 0 && (
                                      <div className="flex flex-wrap gap-2 pt-0.5">
                                        {mField.options.map((opt, idx) => (
                                          <button
                                            key={`${mField.key}-opt-${idx}`}
                                            type="button"
                                            onClick={() => handleResolveMissingField(msg.id, mField, opt)}
                                            className="px-3 py-1.5 rounded-full bg-rose-100 hover:bg-emerald-600 text-rose-950 hover:text-white border border-rose-300 hover:border-emerald-700 text-xs font-bold transition-all cursor-pointer shadow-2xs"
                                          >
                                            {opt.label}
                                          </button>
                                        ))}
                                      </div>
                                    )}

                                    <div className="flex items-center gap-1.5 pt-1">
                                      <input
                                        type="text"
                                        placeholder="Ou saisir une valeur personnalisée..."
                                        value={customVal}
                                        onChange={(e) =>
                                          setCustomMissingInputs((prev) => ({
                                            ...prev,
                                            [customKey]: e.target.value,
                                          }))
                                        }
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' && customVal.trim()) {
                                            e.preventDefault();
                                            handleResolveMissingField(msg.id, mField, {
                                              label: customVal.trim(),
                                              value: customVal.trim(),
                                            });
                                          }
                                        }}
                                        className="flex-1 h-8 px-3 rounded-full bg-canvas-slate border border-border-subtle text-xs text-on-surface focus:outline-none focus:border-primary"
                                      />
                                      {customVal.trim() && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleResolveMissingField(msg.id, mField, {
                                              label: customVal.trim(),
                                              value: customVal.trim(),
                                            })
                                          }
                                          className="px-3 h-8 rounded-full bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                                        >
                                          Valider
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {card.executionError && (
                          <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs font-semibold">
                            ⚠️ {card.executionError}
                          </div>
                        )}

                        {card.executed && card.executionResult ? (
                          <div className="p-3.5 rounded-2xl bg-emerald-50 border-2 border-emerald-400 text-emerald-950">
                            <div className="flex items-center gap-2 font-bold text-xs sm:text-sm text-emerald-900">
                              <span className="material-symbols-outlined text-emerald-600 text-[20px]">verified</span>
                              <span>{card.executionResult.message}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="pt-2 border-t border-border-subtle flex items-center justify-between gap-3 flex-wrap">
                            <span className="text-xs text-on-surface-variant">
                              {stayRoomOverflow
                                ? `Ajustez le nombre de chambres (max ${stayMaxRooms}) pour confirmer.`
                                : taskCreateMissingTitle
                                ? 'Saisissez un titre pour proposer cette tâche.'
                                : taskUpdateMissingId
                                ? 'Sélectionnez la tâche existante à modifier.'
                                : taskUpdateMissingTitle
                                ? 'Saisissez un titre non vide pour cette tâche.'
                                : commentMissingTarget
                                ? 'Sélectionnez la tâche ou le scrutin cible.'
                                : commentMissingContent
                                ? 'Saisissez le message à publier dans le fil.'
                                : pollMissingTitle
                                ? 'Saisissez un titre pour ce scrutin.'
                                : pollEmptyOptions
                                ? 'Indiquez au moins 2 options de vote non vides.'
                                : docMissingFile
                                ? 'Sélectionnez le fichier à téléverser ci-dessus.'
                                : docMissingTitle
                                ? 'Saisissez un titre pour archiver ce document.'
                                : docMissingTask
                                ? 'Sélectionnez la tâche à laquelle rattacher ce document.'
                                : docMissingVote
                                ? 'Sélectionnez le scrutin auquel rattacher ce document.'
                                : card.missing_fields.length > 0
                                ? `Répondez aux ${card.missing_fields.length} précision(s) requise(s) ci-dessus.`
                                : 'Vérifiez les paramètres puis confirmez pour appliquer sur le portail.'}
                            </span>

                            <button
                              type="button"
                              disabled={confirmDisabled}
                              onClick={() => handleExecuteActionCard(msg.id)}
                              className={`px-5 py-2.5 rounded-full text-xs sm:text-sm font-bold flex items-center gap-2 transition-all shadow-sm ${
                                confirmDisabled
                                  ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                                  : 'bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer'
                              }`}
                            >
                              <span className="material-symbols-outlined text-[18px]">
                                {card.executing ? 'progress_activity' : 'check_circle'}
                              </span>
                              <span>
                                {card.executing ? 'Application en cours...' : 'Confirmer et appliquer'}
                              </span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* BARRE DE SAISIE MODERNE & VOIX (Annotation 4 : shrink-0 ancrée en bas ; Annotation 1 : textarea auto-extensible jusqu'à 7 lignes) */}
        <form
          onSubmit={handleSendMessage}
          className="shrink-0 p-2.5 sm:p-3.5 bg-white/95 dark:bg-slate-950/90 backdrop-blur-md border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2"
        >
          {attachment && (
            <div className="inline-flex items-center justify-between gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50/90 border border-emerald-200 text-emerald-950 text-xs font-semibold self-start animate-in fade-in duration-150">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[15px] text-emerald-700">description</span>
                <span className="max-w-[240px] truncate">{attachment.name}</span>
                <span className="text-[10px] text-emerald-700">
                  ({Math.max(1, Math.round(attachment.size / 1024))} Ko)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAttachment(null)}
                className="w-5 h-5 rounded-full hover:bg-emerald-200/60 flex items-center justify-center text-emerald-800 hover:text-rose-600 cursor-pointer ml-1"
                title="Retirer la pièce jointe"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            </div>
          )}

          <div
            className={`flex items-end gap-2 p-1.5 rounded-[26px] border transition-all duration-300 ${
              isListening
                ? 'bg-emerald-50/60 border-emerald-400/80 shadow-[0_0_0_4px_rgba(16,185,129,0.10)]'
                : 'bg-slate-50/90 hover:bg-slate-50 focus-within:bg-white border-slate-200/90 focus-within:border-primary/45 focus-within:shadow-[0_6px_24px_-6px_rgba(6,78,59,0.14)]'
            }`}
          >
            {/* Annotation 3 : <label htmlFor> natif + input sr-only (jamais display:none) pour ouvrir fiablement le sélecteur de fichiers */}
            <input
              id="toaster-file-input"
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,application/pdf,.doc,.docx,.txt,.csv,.xlsx"
              onChange={handleFileSelect}
              className="sr-only"
            />
            <label
              id="btn-toaster-attach"
              htmlFor="toaster-file-input"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className="w-10 h-10 rounded-full bg-white hover:bg-emerald-50 text-slate-600 hover:text-primary border border-slate-200/80 hover:border-emerald-300 inline-flex items-center justify-center shrink-0 transition-all duration-200 cursor-pointer shadow-2xs active:scale-95 select-none"
              title="Joindre une photo ou un document (PDF, image, etc.)"
              aria-label="Joindre une photo ou un document"
            >
              <span className="material-symbols-outlined text-[21px] leading-none pointer-events-none">add</span>
            </label>

            {isListening ? (
              <div className="flex-1 flex items-center justify-between px-3 py-2 min-w-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex items-center gap-1 h-5 shrink-0" aria-hidden="true">
                    <span className="w-1 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="w-1 h-4 rounded-full bg-emerald-600 animate-bounce [animation-duration:650ms]" />
                    <span className="w-1 h-3 rounded-full bg-emerald-500 animate-bounce [animation-duration:800ms] [animation-delay:120ms]" />
                    <span className="w-1 h-4.5 rounded-full bg-emerald-600 animate-bounce [animation-duration:700ms] [animation-delay:220ms]" />
                    <span className="w-1 h-2.5 rounded-full bg-emerald-500 animate-pulse [animation-delay:300ms]" />
                  </div>
                  <span className="text-xs sm:text-sm font-medium text-emerald-900 truncate">
                    {isFinalizingVoice
                      ? liveVoicePreview || 'Finalisation de la transcription…'
                      : liveVoicePreview || 'Écoute en cours… Micro pour transcrire, Envoyer pour expédier'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCancelSpeech}
                  className="w-7 h-7 rounded-full hover:bg-rose-100 text-slate-400 hover:text-rose-600 inline-flex items-center justify-center transition-colors cursor-pointer shrink-0"
                  title="Annuler l'enregistrement vocal"
                >
                  <span className="material-symbols-outlined text-[17px]">close</span>
                </button>
              </div>
            ) : (
              <textarea
                id="toaster-chat-input"
                ref={chatInputRef}
                rows={1}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                onPaste={(e) => {
                  const pastedFile = e.clipboardData?.files?.[0];
                  if (pastedFile) {
                    e.preventDefault();
                    attachLocalFile(pastedFile);
                  }
                }}
                placeholder="Écrivez à Mr. Collins, collez un document ou décrivez une action au domaine…"
                className="flex-1 min-h-[40px] max-h-[176px] py-2.5 px-2.5 bg-transparent text-sm leading-[22px] text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none min-w-0 resize-none"
              />
            )}

            {speechSupported && (
              <button
                id="btn-toaster-voice"
                type="button"
                onClick={handleToggleSpeech}
                disabled={isSending || isFinalizingVoice}
                className={`relative w-10 h-10 rounded-full inline-flex items-center justify-center shrink-0 transition-all duration-300 cursor-pointer disabled:opacity-40 ${
                  isListening
                    ? 'bg-emerald-600 text-white shadow-md scale-105 ring-4 ring-emerald-500/20'
                    : 'bg-white hover:bg-emerald-50 text-slate-600 hover:text-primary border border-slate-200/80 hover:border-emerald-300 shadow-2xs active:scale-95'
                }`}
                title={
                  isListening
                    ? 'Arrêter la dictée et transcrire dans la zone de saisie (sans envoyer)'
                    : 'Dicter un message vocal'
                }
                aria-label={isListening ? 'Arrêter et transcrire le message vocal' : 'Dicter un message vocal'}
              >
                {isListening && (
                  <span
                    className="absolute inset-0 rounded-full bg-emerald-400/40 animate-ping pointer-events-none"
                    style={{ animationDuration: '1.6s' }}
                  />
                )}
                <span className="material-symbols-outlined text-[20px] relative z-10 leading-none">
                  {isListening ? 'stop' : 'mic'}
                </span>
              </button>
            )}

            <button
              id="btn-toaster-send"
              type="submit"
              disabled={isSending || (!isListening && !isFinalizingVoice && !inputText.trim() && !attachment)}
              className="w-10 h-10 rounded-full bg-primary hover:bg-forest-deep text-white inline-flex items-center justify-center shrink-0 transition-all duration-200 cursor-pointer shadow-xs disabled:opacity-35 disabled:cursor-not-allowed active:scale-95"
              title={
                isListening || isFinalizingVoice
                  ? "Arrêter la transcription et envoyer dès qu'elle est terminée"
                  : 'Envoyer'
              }
              aria-label={
                isListening || isFinalizingVoice
                  ? 'Arrêter la transcription et envoyer'
                  : 'Envoyer'
              }
            >
              <span
                className={`material-symbols-outlined text-[20px] leading-none ${
                  isSending || isFinalizingVoice ? 'animate-spin' : ''
                }`}
              >
                {isSending || isFinalizingVoice ? 'progress_activity' : 'arrow_upward'}
              </span>
            </button>
          </div>
        </form>
      </div>

      <ToasterActionFormModal
        modalState={actionModalState}
        onClose={() => setActionModalState(null)}
        onSubmitSandboxAction={executeDirectPortalAction}
        members={membersOptions}
        activeMemberName={formatAssociateLabel(activeMemberObj)}
      />

      {inspectingTask && (
        <TaskDetailModal
          isOpen={Boolean(inspectingTask)}
          task={inspectingTask}
          onClose={() => setInspectingTask(null)}
          currentUser={{
            ...(typeof currentUser === 'object' && currentUser ? currentUser : {}),
            ...(activeMemberObj || {}),
            name: formatAssociateLabel(activeMemberObj),
            is_coordinator: isCoordinator,
          }}
          onTaskUpdated={handleModalTaskUpdated}
          onTaskDeleted={handleModalTaskDeleted}
        />
      )}

      {inspectingPoll && (
        <VoteRoofModal
          isOpen={Boolean(inspectingPoll)}
          project={inspectingPoll}
          onClose={() => setInspectingPoll(null)}
          currentUser={{
            ...(typeof currentUser === 'object' && currentUser ? currentUser : {}),
            ...(activeMemberObj || {}),
            name: formatAssociateLabel(activeMemberObj),
            is_coordinator: isCoordinator,
          }}
          onVoteSubmit={handleModalPollUpdated}
          onVoteDeleted={handleModalPollDeleted}
        />
      )}
    </div>
  );
}
