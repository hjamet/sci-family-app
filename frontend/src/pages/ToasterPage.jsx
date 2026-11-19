import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  ToasterMarkdown,
  ToasterActivityAccordion,
  ToasterComponentRenderer,
  ToasterActionFormModal,
  getMaxRoomsForBuilding,
  getRoomsListForBuilding,
} from '../components/ToasterSharedComponents';

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

function formatCurrency(val) {
  if (val === null || val === undefined || isNaN(Number(val))) return '— €';
  const num = Number(val);
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
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
  task: { icon: 'task_alt', badge: 'Tâche & Chantier', color: 'bg-sky-100 text-sky-900 border-sky-300' },
  vote: { icon: 'how_to_vote', badge: 'Scrutin & Vote', color: 'bg-purple-100 text-purple-900 border-purple-300' },
  poll: { icon: 'how_to_vote', badge: 'Scrutin & Vote', color: 'bg-purple-100 text-purple-900 border-purple-300' },
  vademecum: { icon: 'menu_book', badge: 'Vademecum', color: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  treasury: { icon: 'account_balance', badge: 'Trésorerie & CCA', color: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
};

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
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Modale de formulaire ouverte depuis un composant partagé
  const [actionModalState, setActionModalState] = useState(null);

  // Pièce jointe multimodale (Photo / PDF)
  const [attachment, setAttachment] = useState(null);
  const fileInputRef = useRef(null);

  // Dictée vocale fluide
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const voiceTranscriptRef = useRef('');
  const voiceAbortedRef = useRef(false);
  const sendVoiceTriggerRef = useRef(null);

  // Édition inline d'un champ déduit 🟢 / saisie libre 🔴 / calendrier options vote
  const [editingField, setEditingField] = useState(null);
  const [customMissingInputs, setCustomMissingInputs] = useState({});
  const [openDatePickerTarget, setOpenDatePickerTarget] = useState(null); // { msgId, optIdx }

  const chatEndRef = useRef(null);
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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

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

  const activeCcaBalance = useMemo(() => {
    if (!portalState) return null;
    const candidates = [
      portalState.active_member?.cca_balance,
      portalState.treasury?.balance,
      portalState.member_summary?.treasury?.balance,
    ];
    for (const c of candidates) {
      if (c !== undefined && c !== null && !isNaN(Number(c))) {
        return Number(c);
      }
    }
    return 0;
  }, [portalState]);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const resultStr = String(reader.result || '');
      const base64Clean = resultStr.includes(',') ? resultStr.split(',')[1] : resultStr;
      setAttachment({
        name: file.name,
        mime: file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
        base64: base64Clean,
        size: file.size,
      });
    };
    reader.onerror = () => {
      setErrorBanner('Impossible de lire le fichier sélectionné.');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const normalizeActionCard = useCallback((rawCard) => {
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
            : ['POUR', 'CONTRE', 'ABSTENTION'];
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
    }

    return {
      action_type: rawCard.action_type || 'action',
      title: sanitizeFamilyLabel(rawCard.title || 'Proposition d’action'),
      deduced_fields: deduced,
      missing_fields: missing,
      ready_to_execute: missing.length === 0 ? true : Boolean(rawCard.ready_to_execute && missing.length === 0),
      payload: basePayload,
      executed: false,
      executing: false,
      executionResult: null,
      executionError: null,
    };
  }, []);

  const sendMessagePayload = useCallback(
    async ({ textOverride = null, clearComposerText = true } = {}) => {
      const rawText = textOverride !== null ? String(textOverride) : inputText;
      const trimmed = rawText.trim();
      const currentAttachment = textOverride !== null ? null : attachment;

      if ((!trimmed && !currentAttachment) || isSending) return;

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
            const cardObj = normalizeActionCard(ev.action_card);
            updateAssistant((m) => ({
              ...m,
              action_card: cardObj,
            }));
          } else if (ev.type === 'done') {
            receivedDone = true;
            const finalReply = sanitizeFamilyLabel(ev.reply || ev.message || ev.content || '');
            const finalCard = ev.action_card ? normalizeActionCard(ev.action_card) : null;
            updateAssistant((m) => ({
              ...m,
              content: finalReply || m.content,
              thoughts: ev.thoughts !== undefined ? ev.thoughts : m.thoughts,
              toolSteps: Array.isArray(ev.tool_steps) && ev.tool_steps.length > 0 ? ev.tool_steps : m.toolSteps,
              uiComponents: Array.isArray(ev.ui_components) ? ev.ui_components : m.uiComponents,
              action_card: finalCard || m.action_card,
              isStreaming: false,
            }));
            if (ev.state) {
              setPortalState(ev.state);
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
    [inputText, attachment, isSending, selectedMemberId, normalizeActionCard]
  );

  useEffect(() => {
    sendVoiceTriggerRef.current = sendMessagePayload;
  }, [sendMessagePayload]);

  const handleSendMessage = (e) => {
    if (e) e.preventDefault();
    sendMessagePayload({ textOverride: null, clearComposerText: true });
  };

  const handleToggleSpeech = () => {
    if (!speechSupported) {
      setErrorBanner('La reconnaissance vocale n’est pas supportée par ce navigateur.');
      return;
    }
    if (isListening && recognitionRef.current) {
      voiceAbortedRef.current = false;
      recognitionRef.current.stop();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    voiceTranscriptRef.current = '';
    voiceAbortedRef.current = false;

    recognition.onstart = () => {
      setIsListening(true);
      setErrorBanner(null);
    };

    recognition.onresult = (event) => {
      const pieces = [];
      for (let i = 0; i < event.results.length; i += 1) {
        const seg = event.results[i]?.[0]?.transcript || '';
        if (seg) pieces.push(seg.trim());
      }
      voiceTranscriptRef.current = pieces.join(' ').trim();
    };

    recognition.onerror = (event) => {
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        console.warn('Erreur dictée vocale:', event.error);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      const finalSpoken = voiceTranscriptRef.current.trim();
      voiceTranscriptRef.current = '';
      if (!voiceAbortedRef.current && finalSpoken && sendVoiceTriggerRef.current) {
        sendVoiceTriggerRef.current({ textOverride: finalSpoken, clearComposerText: false });
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const handleCancelSpeech = () => {
    voiceAbortedRef.current = true;
    voiceTranscriptRef.current = '';
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (_) {}
    }
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

  const handleDirectTaskComplete = useCallback(
    async (task) => {
      await executeDirectPortalAction('task', {
        operation: 'complete',
        task_id: task.id,
        title: task.title,
      });
    },
    [executeDirectPortalAction]
  );

  // Helper générique pour muter une carte d'action
  const updateCardInMessage = (msgId, cardUpdater) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId && m.action_card ? { ...m, action_card: cardUpdater(m.action_card) } : m))
    );
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
      const confirmText = sanitizeFamilyLabel(
        resData.message || resData.confirmation || resData.reply || 'Action confirmée et appliquée.'
      );

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

  return (
    <div className="relative flex flex-col w-full max-w-5xl mx-auto pb-10 min-h-[calc(100vh-120px)]">
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

      {/* En-tête épuré de l'interface finale (zéro bannière bac à sable) */}
      <header className="flex flex-wrap items-center justify-between gap-3 px-1 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-full bg-sage-soft text-primary flex items-center justify-center shadow-2xs">
            <span className="material-symbols-outlined text-[21px]">smart_toy</span>
          </span>
          <div>
            <h1 className="font-headline-sm text-base sm:text-lg font-bold text-forest-deep leading-tight">
              Assistant Grille-Pain
            </h1>
            <p className="text-[11px] text-on-surface-variant">
              Connecté en tant que <span className="font-semibold text-forest-deep">{formatAssociateLabel(activeMemberObj)}</span>
              {!loadingState && activeCcaBalance !== null && (
                <span className="ml-2 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono font-bold text-[10.5px]">
                  CCA {formatCurrency(activeCcaBalance)}
                </span>
              )}
            </p>
          </div>
        </div>

        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setMessages([]);
              setAttachment(null);
              setErrorBanner(null);
              setLastFailedPrompt(null);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white hover:bg-sage-soft text-slate-600 hover:text-forest-deep border border-border-subtle text-xs font-semibold transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">add_comment</span>
            <span>Nouvelle discussion</span>
          </button>
        )}
      </header>

      {/* Bannière d'erreur Fail-Fast avec bouton Réessayer */}
      {errorBanner && (
        <div
          id="toaster-error-banner"
          role="alert"
          className="mb-3 px-4 py-3 rounded-2xl bg-rose-50 border border-rose-300 text-rose-950 text-xs font-semibold flex items-center justify-between gap-3 flex-wrap"
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

      {/* ZONE DE CONVERSATION, COMPOSANTS PARTAGÉS & CARTES D'ACTION */}
      <div className="flex-1 bg-surface-container-lowest rounded-3xl border border-border-subtle shadow-sm flex flex-col overflow-hidden min-h-[540px]">
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {messages.length === 0 ? (
            <div className="h-full min-h-[360px] flex flex-col items-center justify-center text-center max-w-xl mx-auto px-4 py-8">
              <div className="w-14 h-14 rounded-full bg-sage-soft text-primary flex items-center justify-center mb-3.5 shadow-2xs">
                <span className="material-symbols-outlined text-[28px]">chat_bubble</span>
              </div>
              <h2 className="font-headline-sm text-base sm:text-lg font-bold text-forest-deep">
                Bonjour {formatAssociatePrenom(activeMemberObj)}, comment puis-je vous aider aujourd'hui ?
              </h2>
              <p className="text-xs sm:text-sm text-on-surface-variant mt-1.5 leading-relaxed">
                Consultez le Vademecum, la trésorerie, le classement participatif, la piscine, la cuve à fioul ou préparez en un clic une réservation, une tâche ou un scrutin familial.
              </p>
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

              // Contrôle capacité chambres en direct sur les cartes stay (Ann. 4)
              const isStayCard = card?.action_type === 'stay' && card?.payload?.operation !== 'cancel';
              const stayMaxRooms = isStayCard ? getMaxRoomsForBuilding(card.payload?.building) : 5;
              const stayCurrentRooms = isStayCard ? Number(card.payload?.chambers_used || 1) : 1;
              const stayRoomOverflow = isStayCard && stayCurrentRooms > stayMaxRooms;
              const stayAvailableRooms = isStayCard ? getRoomsListForBuilding(card.payload?.building) : [];
              const staySelectedRooms = isStayCard && Array.isArray(card.payload?.selected_rooms) ? card.payload.selected_rooms : [];

              // Mode éditeur dédié pour création/ouverture de scrutin (Ann. 1 & 2)
              const isPollSetupCard =
                card?.action_type === 'vote' &&
                (card?.payload?.operation === 'create' || card?.payload?.operation === 'open');
              const pollOptions = isPollSetupCard && Array.isArray(card.payload?.options) ? card.payload.options : [];
              const pollEmptyOptions = isPollSetupCard && pollOptions.filter((o) => String(o || '').trim()).length === 0;

              const isVademecumCard = card?.action_type === 'vademecum';

              // Exclure des petites puces vertes les champs qui disposent de leur propre bloc dédié
              const chipFields = card
                ? card.deduced_fields.filter((f) => {
                    if (isPollSetupCard && (f.key === 'options' || f.key === 'description')) return false;
                    if (isStayCard && f.key === 'chambers_used') return false;
                    if (isVademecumCard && f.key === 'content') return false;
                    return true;
                  })
                : [];

              const confirmDisabled =
                !card ||
                card.missing_fields.length > 0 ||
                card.executing ||
                stayRoomOverflow ||
                pollEmptyOptions;

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  {!isUser && (
                    <ToasterActivityAccordion
                      thoughts={msg.thoughts}
                      toolSteps={msg.toolSteps}
                      isStreaming={Boolean(msg.isStreaming)}
                    />
                  )}

                  {showBubble && (
                    <div
                      className={`max-w-2xl rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-2xs ${
                        isUser
                          ? 'bg-primary text-white rounded-br-xs'
                          : 'bg-canvas-slate text-on-surface border border-border-subtle rounded-bl-xs'
                      }`}
                    >
                      {msg.attachment && (
                        <div className="mb-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 border border-white/25 text-xs font-semibold">
                          <span className="material-symbols-outlined text-[15px]">attach_file</span>
                          <span>{msg.attachment.name}</span>
                        </div>
                      )}
                      <ToasterMarkdown content={msg.content} isUser={isUser} />
                    </div>
                  )}

                  {!isUser && msg.uiComponents && msg.uiComponents.length > 0 && (
                    <ToasterComponentRenderer
                      components={msg.uiComponents}
                      activeMemberName={formatAssociateLabel(activeMemberObj)}
                      onOpenSandboxModal={(mType, prefill = {}) =>
                        setActionModalState({ type: mType, prefill })
                      }
                      onCastSandboxVote={handleDirectVote}
                      onCompleteSandboxTask={handleDirectTaskComplete}
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
                        {/* Puces éditables des champs déduits */}
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
                                  return (
                                    <div
                                      key={field.key}
                                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border-2 border-emerald-500 text-xs"
                                    >
                                      <span className="font-bold text-emerald-900">🟢 {field.label} :</span>
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

                        {/* Ann. 4 : Contrôle chambres borné + sélection optionnelle par nom pour les séjours */}
                        {isStayCard && (
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
                        )}

                        {/* Ann. 1 & 2 : Description du scrutin + Liste d'options ligne par ligne + Calendrier */}
                        {isPollSetupCard && (
                          <div className="space-y-3.5">
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

                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-purple-900">
                                  🗳️ Options proposées ({pollOptions.length})
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
                          </div>
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

          <div ref={chatEndRef} />
        </div>

        {/* BARRE DE SAISIE MODERNE & VOIX */}
        <form
          onSubmit={handleSendMessage}
          className="p-3 sm:p-4 bg-white/95 dark:bg-slate-950/90 backdrop-blur-md border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2"
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
            className={`flex items-center gap-2 p-1.5 rounded-full border transition-all duration-300 ${
              isListening
                ? 'bg-emerald-50/60 border-emerald-400/80 shadow-[0_0_0_4px_rgba(16,185,129,0.10)]'
                : 'bg-slate-50/90 hover:bg-slate-50 focus-within:bg-white border-slate-200/90 focus-within:border-primary/45 focus-within:shadow-[0_6px_24px_-6px_rgba(6,78,59,0.14)]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,application/pdf"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              id="btn-toaster-attach"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-10 h-10 rounded-full bg-white hover:bg-emerald-50 text-slate-600 hover:text-primary border border-slate-200/80 hover:border-emerald-300 inline-flex items-center justify-center shrink-0 transition-all duration-200 cursor-pointer shadow-2xs active:scale-95"
              title="Joindre une photo ou un PDF"
              aria-label="Joindre une photo ou un PDF"
            >
              <span className="material-symbols-outlined text-[21px] leading-none">add</span>
            </button>

            {isListening ? (
              <div className="flex-1 flex items-center justify-between px-3 py-1.5 min-w-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex items-center gap-1 h-5 shrink-0" aria-hidden="true">
                    <span className="w-1 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="w-1 h-4 rounded-full bg-emerald-600 animate-bounce [animation-duration:650ms]" />
                    <span className="w-1 h-3 rounded-full bg-emerald-500 animate-bounce [animation-duration:800ms] [animation-delay:120ms]" />
                    <span className="w-1 h-4.5 rounded-full bg-emerald-600 animate-bounce [animation-duration:700ms] [animation-delay:220ms]" />
                    <span className="w-1 h-2.5 rounded-full bg-emerald-500 animate-pulse [animation-delay:300ms]" />
                  </div>
                  <span className="text-xs sm:text-sm font-medium text-emerald-900 truncate">
                    Écoute en cours… parlez librement, envoi direct dès la fin
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
              <input
                id="toaster-chat-input"
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Posez une question ou décrivez une action au domaine…"
                className="flex-1 h-10 px-2.5 bg-transparent text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none min-w-0"
              />
            )}

            {speechSupported && (
              <button
                id="btn-toaster-voice"
                type="button"
                onClick={handleToggleSpeech}
                disabled={isSending}
                className={`relative w-10 h-10 rounded-full inline-flex items-center justify-center shrink-0 transition-all duration-300 cursor-pointer disabled:opacity-40 ${
                  isListening
                    ? 'bg-emerald-600 text-white shadow-md scale-105 ring-4 ring-emerald-500/20'
                    : 'bg-white hover:bg-emerald-50 text-slate-600 hover:text-primary border border-slate-200/80 hover:border-emerald-300 shadow-2xs active:scale-95'
                }`}
                title={
                  isListening
                    ? 'Terminer et envoyer directement le message vocal'
                    : "Parler à l'assistant (envoi direct à la fin)"
                }
                aria-label={isListening ? 'Terminer et envoyer le message vocal' : 'Message vocal'}
              >
                {isListening && (
                  <span
                    className="absolute inset-0 rounded-full bg-emerald-400/40 animate-ping pointer-events-none"
                    style={{ animationDuration: '1.6s' }}
                  />
                )}
                <span className="material-symbols-outlined text-[20px] relative z-10 leading-none">
                  {isListening ? 'graphic_eq' : 'mic'}
                </span>
              </button>
            )}

            <button
              id="btn-toaster-send"
              type="submit"
              disabled={isSending || isListening || (!inputText.trim() && !attachment)}
              className="w-10 h-10 rounded-full bg-primary hover:bg-forest-deep text-white inline-flex items-center justify-center shrink-0 transition-all duration-200 cursor-pointer shadow-xs disabled:opacity-35 disabled:cursor-not-allowed active:scale-95"
              title="Envoyer"
              aria-label="Envoyer"
            >
              <span className={`material-symbols-outlined text-[20px] leading-none ${isSending ? 'animate-spin' : ''}`}>
                {isSending ? 'progress_activity' : 'arrow_upward'}
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
      />
    </div>
  );
}
