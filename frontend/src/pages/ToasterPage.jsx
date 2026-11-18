import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  ToasterMarkdown,
  ToasterActivityAccordion,
  ToasterComponentRenderer,
  ToasterSandboxFormModal,
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

const ACTION_TYPE_META = {
  stay: { icon: 'calendar_month', badge: 'Séjour & Réservation', color: 'bg-amber-100 text-amber-900 border-amber-300' },
  heating: { icon: 'thermostat', badge: 'Chauffage & Piscine', color: 'bg-teal-100 text-teal-900 border-teal-300' },
  expense: { icon: 'receipt_long', badge: 'Facture & Dépense', color: 'bg-rose-100 text-rose-900 border-rose-300' },
  invoice: { icon: 'receipt_long', badge: 'Facture & Dépense', color: 'bg-rose-100 text-rose-900 border-rose-300' },
  task: { icon: 'task_alt', badge: 'Tâche & Chantier', color: 'bg-sky-100 text-sky-900 border-sky-300' },
  vote: { icon: 'how_to_vote', badge: 'Scrutin & Vote', color: 'bg-purple-100 text-purple-900 border-purple-300' },
  poll: { icon: 'how_to_vote', badge: 'Scrutin & Vote', color: 'bg-purple-100 text-purple-900 border-purple-300' },
  treasury: { icon: 'account_balance', badge: 'Trésorerie & CCA', color: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
};

const AUDIT_CATEGORY_META = {
  VICARE: { icon: 'local_fire_department', label: 'Commande ViCare interceptée', badgeClass: 'bg-amber-100 text-amber-900 border-amber-300' },
  KLEREO: { icon: 'pool', label: 'Commande Piscine Klereo interceptée', badgeClass: 'bg-sky-100 text-sky-900 border-sky-300' },
  EMAIL: { icon: 'mail', label: 'E-mail intercepté (non envoyé)', badgeClass: 'bg-purple-100 text-purple-900 border-purple-300' },
  DB_MUTATION: { icon: 'database', label: 'Écriture SQLite Bac à Sable', badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
};

export default function ToasterPage({ currentUser }) {
  const [selectedMemberId, setSelectedMemberId] = useState(() => {
    if (currentUser && typeof currentUser === 'object' && currentUser.id) {
      return Number(currentUser.id);
    }
    return 1;
  });

  const [sandboxState, setSandboxState] = useState(null);
  const [loadingState, setLoadingState] = useState(true);
  const [resetingSandbox, setResetingSandbox] = useState(false);
  const [errorBanner, setErrorBanner] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [isAuditDrawerOpen, setIsAuditDrawerOpen] = useState(false);

  // Fil de conversation & streaming SSE
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Modale de formulaire interactif bac à sable ouverte depuis un composant partagé
  const [sandboxModalState, setSandboxModalState] = useState(null);

  // Pièce jointe multimodale (Photo / PDF)
  const [attachment, setAttachment] = useState(null);
  const fileInputRef = useRef(null);

  // Dictée vocale fluide avec envoi automatique sans insérer dans l'input
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const voiceTranscriptRef = useRef('');
  const voiceAbortedRef = useRef(false);
  const sendVoiceTriggerRef = useRef(null);

  // Édition inline d'un champ déduit 🟢 / saisie libre 🔴
  const [editingField, setEditingField] = useState(null);
  const [customMissingInputs, setCustomMissingInputs] = useState({});

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

  const loadSandboxState = useCallback(
    async (memberId = selectedMemberId) => {
      setLoadingState(true);
      setErrorBanner(null);
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
        setSandboxState(data);
      } catch (err) {
        console.error('Erreur chargement état bac à sable:', err);
        setErrorBanner(`Impossible de charger l'état du bac à sable : ${err.message}`);
      } finally {
        setLoadingState(false);
      }
    },
    [selectedMemberId]
  );

  useEffect(() => {
    loadSandboxState(selectedMemberId);
  }, [selectedMemberId, loadSandboxState]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const membersOptions = useMemo(() => {
    const rawMembers = sandboxState?.members;
    if (Array.isArray(rawMembers) && rawMembers.length > 0) {
      return rawMembers.map((m) => ({
        ...m,
        prenom: sanitizeFamilyLabel(m.prenom),
        name: sanitizeFamilyLabel(m.name || m.nom),
        displayLabel: formatAssociateLabel(m),
      }));
    }
    return STATUTORY_MEMBERS_FALLBACK;
  }, [sandboxState]);

  const activeMemberObj = useMemo(() => {
    return (
      membersOptions.find((m) => Number(m.id) === Number(selectedMemberId)) ||
      sandboxState?.active_member ||
      sandboxState?.member ||
      membersOptions[0]
    );
  }, [membersOptions, selectedMemberId, sandboxState]);

  const activeCcaBalance = useMemo(() => {
    if (!sandboxState) return null;
    const candidates = [
      sandboxState.active_member?.cca_balance,
      sandboxState.active_member?.balance,
      sandboxState.active_member?.solde_cca,
      sandboxState.member_summary?.cca_balance,
      sandboxState.member_summary?.balance,
      sandboxState.treasury?.balance,
      sandboxState.cca_balance,
      activeMemberObj?.cca_balance,
      activeMemberObj?.balance,
    ];
    for (const c of candidates) {
      if (c !== undefined && c !== null && !isNaN(Number(c))) {
        return Number(c);
      }
    }
    return 0;
  }, [sandboxState, activeMemberObj]);

  const auditLogs = useMemo(() => {
    const logs = sandboxState?.sandbox_audit_logs || sandboxState?.audit_logs || [];
    return Array.isArray(logs) ? logs : [];
  }, [sandboxState]);

  const handleResetSandbox = async () => {
    setResetingSandbox(true);
    setErrorBanner(null);
    try {
      const res = await fetch('/api/toaster/reset', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ member_id: selectedMemberId }),
      });
      if (!res.ok) {
        let detail = `Erreur HTTP ${res.status}`;
        try {
          const errJson = await res.json();
          detail = errJson.detail || errJson.error || errJson.message || detail;
        } catch (_) {}
        throw new Error(detail);
      }
      setMessages([]);
      setAttachment(null);
      await loadSandboxState(selectedMemberId);
      showToast('Bac à sable réinitialisé depuis la base de production PostgreSQL.');
    } catch (err) {
      console.error('Erreur réinitialisation bac à sable:', err);
      setErrorBanner(`Échec de la réinitialisation du bac à sable : ${err.message}`);
    } finally {
      setResetingSandbox(false);
    }
  };

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

  // Envoi unifié (clavier ou fin d'enregistrement vocal direct) avec flux SSE /api/toaster/chat/stream
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

      const historyForApi = [...messagesRef.current, userMsg].map((m) => ({
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
                throw new Error(ev.detail || "Erreur lors du traitement de la demande.");
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
                  if (existingIdx >= 0) {
                    prevSteps[existingIdx] = ev.step;
                  } else {
                    prevSteps.push(ev.step);
                  }
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
                const finalReply = sanitizeFamilyLabel(
                  ev.reply || ev.message || ev.content || ''
                );
                const finalCard = ev.action_card ? normalizeActionCard(ev.action_card) : null;
                updateAssistant((m) => ({
                  ...m,
                  content: finalReply || m.content,
                  thoughts: ev.thoughts !== undefined ? ev.thoughts : m.thoughts,
                  toolSteps: Array.isArray(ev.tool_steps) && ev.tool_steps.length > 0 ? ev.tool_steps : m.toolSteps,
                  uiComponents:
                    Array.isArray(ev.ui_components) && ev.ui_components.length > 0
                      ? ev.ui_components
                      : m.uiComponents,
                  action_card: finalCard || m.action_card,
                  isStreaming: false,
                }));
                if (ev.state) {
                  setSandboxState(ev.state);
                }
              }
            }
          }
        }

        // Sécurité de clôture du statut streaming
        updateAssistant((m) => (m.isStreaming ? { ...m, isStreaming: false } : m));
      } catch (err) {
        console.error('Erreur /api/toaster/chat/stream:', err);
        setErrorBanner(`Erreur lors de l'appel à l'assistant : ${err.message}`);
        setMessages((prev) =>
          prev.filter((m) => !(m.id === assistantId && !m.content && !m.action_card))
        );
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

  // Dictée vocale moderne : écoute fluide et envoi direct à la fin sans insérer le transcript dans l'input
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

  // Actions bac à sable directes depuis les composants interactifs partagés (vote, tâche, modales)
  const executeDirectSandboxAction = useCallback(
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
      showToast(resData.message || 'Action enregistrée dans le bac à sable.');
      await loadSandboxState(selectedMemberId);
      return resData;
    },
    [selectedMemberId, loadSandboxState, showToast]
  );

  const handleDirectSandboxVote = useCallback(
    async (voteId, choicePayload) => {
      const choiceStr = Array.isArray(choicePayload) ? choicePayload.join(', ') : String(choicePayload || 'POUR');
      await executeDirectSandboxAction('vote', {
        operation: 'cast',
        vote_id: voteId,
        choice: choiceStr,
      });
    },
    [executeDirectSandboxAction]
  );

  const handleDirectSandboxTaskComplete = useCallback(
    async (task) => {
      await executeDirectSandboxAction('task', {
        operation: 'complete',
        task_id: task.id,
        title: task.title,
      });
    },
    [executeDirectSandboxAction]
  );

  // Clic sur une option d'un champ ROUGE (🔴) -> bascule immédiate en VERT (🟢)
  const handleResolveMissingField = (msgId, missingField, chosenOption) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId || !m.action_card) return m;
        const card = m.action_card;
        const remainingMissing = card.missing_fields.filter((f) => f.key !== missingField.key);
        const displayValue =
          chosenOption.label !== undefined && chosenOption.label !== ''
            ? String(chosenOption.label)
            : String(chosenOption.value);
        const rawValue = chosenOption.value !== undefined ? chosenOption.value : chosenOption.label;

        const existingDeducedIdx = card.deduced_fields.findIndex((d) => d.key === missingField.key);
        let updatedDeduced;
        if (existingDeducedIdx >= 0) {
          updatedDeduced = card.deduced_fields.map((d, idx) =>
            idx === existingDeducedIdx ? { ...d, value: displayValue, raw_value: rawValue } : d
          );
        } else {
          updatedDeduced = [
            ...card.deduced_fields,
            {
              key: missingField.key,
              label: missingField.label || missingField.question,
              value: displayValue,
              raw_value: rawValue,
            },
          ];
        }

        const updatedPayload = {
          ...(card.payload || {}),
          [missingField.key]: rawValue,
        };

        return {
          ...m,
          action_card: {
            ...card,
            deduced_fields: updatedDeduced,
            missing_fields: remainingMissing,
            ready_to_execute: remainingMissing.length === 0,
            payload: updatedPayload,
          },
        };
      })
    );
  };

  // Modification inline d'un champ VERT (🟢)
  const handleSaveEditedDeducedField = (msgId, fieldKey, newValue) => {
    const trimmed = String(newValue ?? '').trim();
    if (!trimmed) {
      setEditingField(null);
      return;
    }
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId || !m.action_card) return m;
        const card = m.action_card;
        const updatedDeduced = card.deduced_fields.map((d) =>
          d.key === fieldKey ? { ...d, value: trimmed, raw_value: trimmed } : d
        );
        const updatedPayload = {
          ...(card.payload || {}),
          [fieldKey]: trimmed,
        };
        return {
          ...m,
          action_card: {
            ...card,
            deduced_fields: updatedDeduced,
            payload: updatedPayload,
          },
        };
      })
    );
    setEditingField(null);
  };

  // Exécution d'une Carte d'Action Hybride via POST /api/toaster/execute
  const handleExecuteActionCard = async (msgId) => {
    const targetMsg = messages.find((m) => m.id === msgId);
    if (!targetMsg || !targetMsg.action_card) return;
    const card = targetMsg.action_card;

    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId
          ? { ...m, action_card: { ...m.action_card, executing: true, executionError: null } }
          : m
      )
    );
    setErrorBanner(null);

    try {
      const finalPayload = { ...(card.payload || {}) };
      card.deduced_fields.forEach((d) => {
        if (d.key && finalPayload[d.key] === undefined) {
          finalPayload[d.key] = d.raw_value !== undefined ? d.raw_value : d.value;
        }
      });

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
        resData.message ||
          resData.confirmation ||
          resData.reply ||
          'Action confirmée et exécutée dans le bac à sable.'
      );
      const newLogs = resData.intercepted_logs || resData.new_audit_logs || resData.sandbox_audit_logs || [];

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                action_card: {
                  ...m.action_card,
                  executing: false,
                  executed: true,
                  executionResult: {
                    message: confirmText,
                    logs: Array.isArray(newLogs) ? newLogs : [],
                  },
                },
              }
            : m
        )
      );

      showToast(confirmText);
      await loadSandboxState(selectedMemberId);
    } catch (err) {
      console.error('Erreur /api/toaster/execute:', err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                action_card: {
                  ...m.action_card,
                  executing: false,
                  executionError: err.message,
                },
              }
            : m
        )
      );
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

      {/* ===================================================================== */}
      {/* 1. BANDEAU SUPÉRIEUR BAC À SABLE                                      */}
      {/* ===================================================================== */}
      <section className="rounded-3xl bg-surface-container-lowest border border-emerald-600/25 shadow-2xs p-4 sm:p-5 mb-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-900 border border-emerald-200 text-xs font-semibold">
              <span>🛡️ Mode Bac à Sable Isolé (Zéro impact Prod / ViCare / E-mails)</span>
            </div>
            <div className="flex items-center gap-2.5 pt-1">
              <span className="material-symbols-outlined text-primary text-[25px]">smart_toy</span>
              <h1 className="font-headline-md text-lg sm:text-xl font-bold text-forest-deep">
                Assistant Familial « Grille-Pain » • SCI Hellenvilliers
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 bg-canvas-slate px-3.5 py-2 rounded-full border border-border-subtle">
              <span className="material-symbols-outlined text-primary text-[18px]">person</span>
              <label htmlFor="toaster-member-select" className="text-xs font-semibold text-on-surface-variant whitespace-nowrap">
                Incarner :
              </label>
              <select
                id="toaster-member-select"
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(Number(e.target.value))}
                className="bg-white dark:bg-slate-900 border border-border-subtle rounded-full px-3 py-1 text-xs font-bold text-forest-deep focus:outline-none focus:border-primary cursor-pointer"
              >
                {membersOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayLabel || formatAssociateLabel(m)}
                  </option>
                ))}
              </select>

              <span
                id="toaster-member-cca-badge"
                className={`ml-0.5 px-2.5 py-0.5 rounded-full text-xs font-bold tabular-nums border ${
                  activeCcaBalance > 0
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : activeCcaBalance < 0
                    ? 'bg-rose-50 text-rose-800 border-rose-200'
                    : 'bg-white text-slate-700 border-slate-200'
                }`}
                title="Solde du Compte Courant d'Associé (CCA) dans le bac à sable"
              >
                CCA : {loadingState ? '...' : formatCurrency(activeCcaBalance)}
              </span>
            </div>

            <button
              id="btn-toggle-sandbox-audit"
              type="button"
              onClick={() => setIsAuditDrawerOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 text-xs font-bold transition-all cursor-pointer shadow-2xs"
            >
              <span className="material-symbols-outlined text-[17px] text-amber-700">security</span>
              <span>Actions matérielles &amp; e-mails interceptés</span>
              <span className="px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-950 text-[11px] font-extrabold">
                {auditLogs.length}
              </span>
            </button>

            <button
              id="btn-reset-sandbox"
              type="button"
              onClick={handleResetSandbox}
              disabled={resetingSandbox}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-800 border border-border-subtle hover:border-rose-300 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
            >
              <span className={`material-symbols-outlined text-[17px] ${resetingSandbox ? 'animate-spin' : ''}`}>
                restart_alt
              </span>
              <span>{resetingSandbox ? 'Réinitialisation...' : 'Réinitialiser le bac à sable'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* Bannière d'erreur Fail-Fast */}
      {errorBanner && (
        <div
          id="toaster-error-banner"
          role="alert"
          className="mb-4 px-4 py-3 rounded-2xl bg-rose-50 border border-rose-300 text-rose-950 text-xs font-semibold flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-rose-600 text-[20px]">error</span>
            <span>{errorBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="text-rose-700 hover:text-rose-950 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 2. ZONE DE CONVERSATION, COMPOSANTS PARTAGÉS & CARTES D'ACTION        */}
      {/* ===================================================================== */}
      <div className="flex-1 bg-surface-container-lowest rounded-3xl border border-border-subtle shadow-sm flex flex-col overflow-hidden min-h-[500px]">
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {messages.length === 0 ? (
            <div className="h-full min-h-[340px] flex flex-col items-center justify-center text-center max-w-xl mx-auto px-4 py-8">
              <div className="w-14 h-14 rounded-full bg-sage-soft text-primary flex items-center justify-center mb-3.5 shadow-2xs">
                <span className="material-symbols-outlined text-[28px]">chat_bubble</span>
              </div>
              <h2 className="font-headline-sm text-base sm:text-lg font-bold text-forest-deep">
                Bonjour {formatAssociatePrenom(activeMemberObj)}, que souhaitez-vous consulter ou préparer au Domaine ?
              </h2>
              <p className="text-xs sm:text-sm text-on-surface-variant mt-1.5 leading-relaxed">
                Posez une question en langage naturel, dictez à la voix ou joignez un justificatif. L’assistant peut afficher directement le calendrier, la jauge fioul, les sondages ou préparer une carte de validation sécurisée.
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

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  {/* Accordéon pliable automatique : Raisonnement & Appels d'outils (zéro nom de modèle) */}
                  {!isUser && (
                    <ToasterActivityAccordion
                      thoughts={msg.thoughts}
                      toolSteps={msg.toolSteps}
                      isStreaming={Boolean(msg.isStreaming)}
                    />
                  )}

                  {/* Bulle de texte avec rendu Markdown complet */}
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

                  {/* Composants interactifs du site partagés directement dans la conversation */}
                  {!isUser && msg.uiComponents && msg.uiComponents.length > 0 && (
                    <ToasterComponentRenderer
                      components={msg.uiComponents}
                      activeMemberName={formatAssociateLabel(activeMemberObj)}
                      onOpenSandboxModal={(mType, prefill = {}) =>
                        setSandboxModalState({ type: mType, prefill })
                      }
                      onCastSandboxVote={handleDirectSandboxVote}
                      onCompleteSandboxTask={handleDirectSandboxTaskComplete}
                    />
                  )}

                  {/* Carte d'Action Hybride 🟢 Vert / 🔴 Rouge */}
                  {card && (
                    <div
                      data-testid="toaster-action-card"
                      className="mt-3 w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border-2 border-primary/30 shadow-md overflow-hidden animate-in fade-in duration-200"
                    >
                      <div className="px-4 py-3 bg-sage-soft/50 border-b border-border-subtle flex items-center justify-between gap-2 flex-wrap">
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
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                              🟢 Champs déduits (cliquez sur une puce pour modifier)
                            </span>
                          </div>
                          {card.deduced_fields.length === 0 ? (
                            <p className="text-xs text-slate-400 italic">Aucun paramètre déduit pour le moment.</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {card.deduced_fields.map((field) => {
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
                          )}
                        </div>

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
                          <div className="p-3.5 rounded-2xl bg-emerald-50 border-2 border-emerald-400 text-emerald-950 space-y-2">
                            <div className="flex items-center gap-2 font-bold text-xs sm:text-sm text-emerald-900">
                              <span className="material-symbols-outlined text-emerald-600 text-[20px]">verified</span>
                              <span>{card.executionResult.message}</span>
                            </div>
                            {card.executionResult.logs && card.executionResult.logs.length > 0 && (
                              <div className="pt-2 border-t border-emerald-200 space-y-1.5">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 block">
                                  Traces interceptées dans le journal d’audit :
                                </span>
                                {card.executionResult.logs.map((log, lIdx) => (
                                  <div
                                    key={log.id || lIdx}
                                    className="text-xs bg-white/90 px-3 py-1.5 rounded-xl border border-emerald-200 flex items-center justify-between gap-2"
                                  >
                                    <span className="font-semibold text-slate-800">
                                      [{log.category}] {log.title}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setIsAuditDrawerOpen(true)}
                                      className="text-[11px] font-bold text-primary underline cursor-pointer shrink-0"
                                    >
                                      Voir l’audit
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="pt-2 border-t border-border-subtle flex items-center justify-between gap-3 flex-wrap">
                            <span className="text-xs text-on-surface-variant">
                              {card.missing_fields.length > 0
                                ? `Veuillez répondre aux ${card.missing_fields.length} question(s) en 🔴 Rouge pour déverrouiller l'exécution.`
                                : 'Tous les paramètres sont au 🟢 Vert : prêt à être exécuté en bac à sable.'}
                            </span>

                            <button
                              type="button"
                              disabled={card.missing_fields.length > 0 || card.executing}
                              onClick={() => handleExecuteActionCard(msg.id)}
                              className={`px-5 py-2.5 rounded-full text-xs sm:text-sm font-bold flex items-center gap-2 transition-all shadow-sm ${
                                card.missing_fields.length > 0 || card.executing
                                  ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                                  : 'bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer'
                              }`}
                            >
                              <span className="material-symbols-outlined text-[18px]">
                                {card.executing ? 'progress_activity' : 'check_circle'}
                              </span>
                              <span>
                                {card.executing
                                  ? 'Exécution en cours...'
                                  : "Confirmer et exécuter l'action"}
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

        {/* =================================================================== */}
        {/* 3. BARRE DE SAISIE MODERNE ULTRA-LÉGÈRE, ARRONDI FLUIDE & VOIX      */}
        {/* =================================================================== */}
        <form
          onSubmit={handleSendMessage}
          className="p-3 sm:p-4 bg-white/95 dark:bg-slate-950/90 backdrop-blur-md border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2"
        >
          {/* Puce légère de pièce jointe sélectionnée */}
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

          {/* Pilule arrondie minimaliste */}
          <div
            className={`flex items-center gap-2 p-1.5 rounded-full border transition-all duration-300 ${
              isListening
                ? 'bg-emerald-50/60 border-emerald-400/80 shadow-[0_0_0_4px_rgba(16,185,129,0.10)]'
                : 'bg-slate-50/90 hover:bg-slate-50 focus-within:bg-white border-slate-200/90 focus-within:border-primary/45 focus-within:shadow-[0_6px_24px_-6px_rgba(6,78,59,0.14)]'
            }`}
          >
            {/* Bouton "+" minimaliste & circulaire (Annotation 3) */}
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

            {/* Zone centrale : champ épuré ou onde d'écoute vocale fluide */}
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

            {/* Bouton Voix rond avec animation fluide d'ondes concentriques (Annotation 2) */}
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
                    ? "Terminer et envoyer directement le message vocal"
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

            {/* Bouton d'envoi rond minimaliste */}
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

      {/* Modale de formulaire bac à sable ouverte depuis un composant partagé */}
      <ToasterSandboxFormModal
        modalState={sandboxModalState}
        onClose={() => setSandboxModalState(null)}
        onSubmitSandboxAction={executeDirectSandboxAction}
        members={membersOptions}
      />

      {/* ===================================================================== */}
      {/* 4. TIROIR LATÉRAL : ACTIONS MATÉRIELLES & E-MAILS INTERCEPTÉS         */}
      {/* ===================================================================== */}
      {isAuditDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex justify-end animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 h-full shadow-2xl border-l border-border-subtle flex flex-col">
            <div className="p-4 sm:p-5 border-b border-border-subtle flex items-center justify-between gap-3 bg-amber-50/60">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-700 text-[22px]">security</span>
                <div>
                  <h2 className="font-headline-sm text-sm sm:text-base font-bold text-slate-900">
                    Actions matérielles &amp; e-mails interceptés
                  </h2>
                  <p className="text-[11px] text-slate-600">
                    Coupe-circuit actif : aucune requête réseau n’est envoyée à ViCare, Klereo ou SMTP.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAuditDrawerOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-200/70 flex items-center justify-center text-slate-600 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {auditLogs.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500 space-y-2">
                  <span className="material-symbols-outlined text-[32px] text-slate-400 block">
                    verified_user
                  </span>
                  <p className="font-semibold text-slate-700">Aucune action interceptée pour le moment.</p>
                  <p>
                    Exécutez une carte d’action dans le chat pour observer ici les appels ViCare, Klereo, e-mails et mutations SQLite interceptés par le bac à sable.
                  </p>
                </div>
              ) : (
                auditLogs.map((log, idx) => {
                  const meta = AUDIT_CATEGORY_META[log.category] || {
                    icon: 'info',
                    label: log.category || 'Trace',
                    badgeClass: 'bg-slate-100 text-slate-800 border-slate-300',
                  };
                  let parsedPayload = log.payload_json || log.payload || log.details;
                  if (typeof parsedPayload === 'string') {
                    try {
                      parsedPayload = JSON.parse(parsedPayload);
                    } catch (_) {}
                  }

                  return (
                    <div
                      key={log.id || idx}
                      className="p-3.5 rounded-2xl bg-canvas-slate border border-border-subtle space-y-2 shadow-2xs"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${meta.badgeClass}`}>
                          <span className="material-symbols-outlined text-[14px]">{meta.icon}</span>
                          <span>{meta.label}</span>
                        </span>
                        {log.created_at && (
                          <span className="text-[11px] text-slate-500 font-mono">
                            {new Date(log.created_at).toLocaleTimeString('fr-FR', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </span>
                        )}
                      </div>

                      <div className="text-xs font-bold text-slate-900">{sanitizeFamilyLabel(log.title)}</div>

                      {parsedPayload && (
                        <pre className="text-[11px] font-mono bg-white p-2.5 rounded-xl border border-slate-200 overflow-x-auto text-slate-700 whitespace-pre-wrap">
                          {typeof parsedPayload === 'object'
                            ? JSON.stringify(parsedPayload, null, 2)
                            : String(parsedPayload)}
                        </pre>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
