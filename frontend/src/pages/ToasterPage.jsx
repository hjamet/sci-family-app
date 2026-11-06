import React, { useState, useEffect, useRef, useMemo } from 'react';

const STATUTORY_MEMBERS_FALLBACK = [
  { id: 6, prenom: 'Maman', nom: 'Maman (Élisabeth) Jamet', displayLabel: 'Maman (Élisabeth) Jamet' },
  { id: 1, prenom: 'Henri', nom: 'Henri Jamet', displayLabel: 'Henri Jamet' },
  { id: 7, prenom: 'Frédéric', nom: 'Frédéric Jamet', displayLabel: 'Frédéric Jamet' },
  { id: 3, prenom: 'Marguerite', nom: 'Marguerite Jamet', displayLabel: 'Marguerite Jamet' },
  { id: 2, prenom: 'Hortense', nom: 'Hortense Jamet', displayLabel: 'Hortense Jamet' },
  { id: 5, prenom: 'Joséphine', nom: 'Joséphine Jamet', displayLabel: 'Joséphine Jamet' },
  { id: 4, prenom: 'Eugénie', nom: 'Eugénie Ducrocq', displayLabel: 'Eugénie Ducrocq' },
];

function formatAssociateLabel(member) {
  if (!member) return 'Associé';
  if (member.displayLabel) return member.displayLabel;
  const prenom = (member.prenom || member.first_name || '').trim();
  const nom = (member.nom || member.name || member.last_name || '').trim();
  if (nom && prenom && nom.toLowerCase().includes(prenom.toLowerCase())) {
    return nom;
  }
  const full = `${prenom} ${nom}`.trim();
  if (full.toLowerCase().includes('élisabeth') || full.toLowerCase().includes('elisabeth') || full.toLowerCase().includes('maman')) {
    return 'Maman (Élisabeth) Jamet';
  }
  return full || 'Associé';
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
  // Identité incarnée dans le bac à sable
  const [selectedMemberId, setSelectedMemberId] = useState(() => {
    if (currentUser && typeof currentUser === 'object' && currentUser.id) {
      return Number(currentUser.id);
    }
    return 6; // Par défaut : Maman (Élisabeth) Jamet pour tester l'ergonomie immédiatement
  });

  // État du bac à sable
  const [sandboxState, setSandboxState] = useState(null);
  const [loadingState, setLoadingState] = useState(true);
  const [resetingSandbox, setResetingSandbox] = useState(false);
  const [errorBanner, setErrorBanner] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // Tiroir latéral d'audit des actions matérielles & e-mails interceptés
  const [isAuditDrawerOpen, setIsAuditDrawerOpen] = useState(false);

  // Fil de conversation
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Pièce jointe multimodale (Photo / PDF)
  const [attachment, setAttachment] = useState(null); // { name, mime, base64, size }
  const fileInputRef = useRef(null);

  // Dictée vocale Web Speech API
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  // Édition inline d'un champ déduit 🟢 : { msgId, fieldKey, tempValue }
  const [editingField, setEditingField] = useState(null);
  // Saisie libre optionnelle sur un champ manquant 🔴 : { [msgId_fieldKey]: string }
  const [customMissingInputs, setCustomMissingInputs] = useState({});

  const chatEndRef = useRef(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Support de la reconnaissance vocale navigateur
  const speechSupported = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }, []);

  // Chargement de l'état du bac à sable pour l'associé sélectionné
  const loadSandboxState = async (memberId = selectedMemberId) => {
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
  };

  useEffect(() => {
    loadSandboxState(selectedMemberId);
  }, [selectedMemberId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  // Liste des membres disponibles dans le sélecteur
  const membersOptions = useMemo(() => {
    const rawMembers = sandboxState?.members;
    if (Array.isArray(rawMembers) && rawMembers.length > 0) {
      return rawMembers.map((m) => ({
        ...m,
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

  // Solde CCA actuel du membre dans le bac à sable
  const activeCcaBalance = useMemo(() => {
    if (!sandboxState) return null;
    const candidates = [
      sandboxState.active_member?.cca_balance,
      sandboxState.active_member?.balance,
      sandboxState.active_member?.solde_cca,
      sandboxState.member_summary?.cca_balance,
      sandboxState.member_summary?.balance,
      sandboxState.member_summary?.solde_cca,
      sandboxState.member?.cca_balance,
      sandboxState.member?.balance,
      sandboxState.treasury?.cca_balance,
      sandboxState.treasury?.balance,
      sandboxState.cca_balance,
      activeMemberObj?.cca_balance,
      activeMemberObj?.balance,
      activeMemberObj?.solde_cca,
    ];
    for (const c of candidates) {
      if (c !== undefined && c !== null && !isNaN(Number(c))) {
        return Number(c);
      }
    }
    return 0;
  }, [sandboxState, activeMemberObj]);

  // Journal d'audit du bac à sable
  const auditLogs = useMemo(() => {
    const logs = sandboxState?.sandbox_audit_logs || sandboxState?.audit_logs || [];
    return Array.isArray(logs) ? logs : [];
  }, [sandboxState]);

  // Réinitialisation complète du bac à sable
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

  // Sélection et conversion en base64 d'une photo ou d'un PDF
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

  // Dictée vocale
  const handleToggleSpeech = () => {
    if (!speechSupported) {
      setErrorBanner('La reconnaissance vocale n’est pas supportée par ce navigateur.');
      return;
    }
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = (event) => {
      console.warn('Erreur dictée vocale:', event.error);
      setIsListening(false);
    };
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      if (transcript) {
        setInputText((prev) => (prev ? `${prev.trim()} ${transcript}` : transcript));
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  // Normalisation d'une action_card reçue du backend
  const normalizeActionCard = (rawCard) => {
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
      title: rawCard.title || 'Proposition d’action',
      deduced_fields: deduced,
      missing_fields: missing,
      ready_to_execute: missing.length === 0 ? true : Boolean(rawCard.ready_to_execute && missing.length === 0),
      payload: basePayload,
      executed: false,
      executing: false,
      executionResult: null,
      executionError: null,
    };
  };

  // Envoi d'un message à POST /api/toaster/chat
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    const trimmed = inputText.trim();
    if ((!trimmed && !attachment) || isSending) return;

    const userMsg = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed || (attachment ? `[Pièce jointe : ${attachment.name}]` : ''),
      attachment: attachment ? { name: attachment.name, mime: attachment.mime, size: attachment.size } : null,
      timestamp: new Date().toISOString(),
    };

    const currentAttachment = attachment;
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInputText('');
    setAttachment(null);
    setIsSending(true);
    setErrorBanner(null);

    try {
      const apiMessages = nextMessages.map((m) => ({
        role: m.role === 'assistant' || m.role === 'model' ? 'assistant' : 'user',
        content: m.content,
      }));

      const body = {
        member_id: Number(selectedMemberId),
        messages: apiMessages,
        attachment_base64: currentAttachment ? currentAttachment.base64 : null,
        attachment_mime: currentAttachment ? currentAttachment.mime : null,
        attachment_name: currentAttachment ? currentAttachment.name : null,
      };

      const res = await fetch('/api/toaster/chat', {
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

      const data = await res.json();
      const replyText =
        data.reply ||
        data.message ||
        data.text ||
        data.content ||
        data.assistant_message ||
        (data.action_card ? 'Voici la proposition préparée pour votre demande :' : 'Réponse reçue.');

      const normalizedCard = normalizeActionCard(data.action_card || data.card);

      const assistantMsg = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: replyText,
        action_card: normalizedCard,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMsg]);

      if (data.sandbox_audit_logs || data.audit_logs) {
        setSandboxState((prev) =>
          prev
            ? {
                ...prev,
                sandbox_audit_logs: data.sandbox_audit_logs || data.audit_logs,
              }
            : prev
        );
      }
      if (data.state) {
        setSandboxState(data.state);
      }
    } catch (err) {
      console.error('Erreur /api/toaster/chat:', err);
      setErrorBanner(`Erreur lors de l'appel à l'agent Grille-Pain : ${err.message}`);
    } finally {
      setIsSending(false);
    }
  };

  // Clic sur une option d'un champ ROUGE (🔴) -> bascule immédiate en VERT (🟢) !
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
      const confirmText =
        resData.message ||
        resData.confirmation ||
        resData.reply ||
        'Action confirmée et exécutée dans le bac à sable.';
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
    <div className="relative flex flex-col w-full max-w-5xl mx-auto pb-12 min-h-[calc(100vh-120px)]">
      {/* Notification Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-forest-deep text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 border border-emerald-500/30 animate-in fade-in duration-200">
          <span className="material-symbols-outlined text-emerald-300 text-[20px]">check_circle</span>
          <span className="text-xs font-semibold">{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-white/70 hover:text-white ml-2 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 1. BANDEAU SUPÉRIEUR BAC À SABLE                                      */}
      {/* ===================================================================== */}
      <section className="rounded-2xl bg-surface-container-lowest border-2 border-emerald-600/30 shadow-sm p-4 sm:p-5 mb-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Badge de sécurité Bac à Sable & Titre */}
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100/90 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 border border-emerald-300 text-xs font-bold">
              <span>🛡️ Mode Bac à Sable Isolé (Zéro impact Prod / ViCare / E-mails)</span>
            </div>
            <div className="flex items-center gap-2.5 pt-1">
              <span className="material-symbols-outlined text-primary text-[26px]">smart_toy</span>
              <h1 className="font-headline-md text-lg sm:text-xl font-bold text-forest-deep">
                Assistant Familial « Grille-Pain » • SCI Hellenvilliers
              </h1>
            </div>
          </div>

          {/* Sélecteur d'identité + Solde CCA + Actions Bac à Sable */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Sélecteur d'associé incarné */}
            <div className="flex items-center gap-2 bg-canvas-slate px-3 py-2 rounded-xl border border-border-subtle">
              <span className="material-symbols-outlined text-primary text-[18px]">person</span>
              <label htmlFor="toaster-member-select" className="text-xs font-semibold text-on-surface-variant whitespace-nowrap">
                Incarner :
              </label>
              <select
                id="toaster-member-select"
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(Number(e.target.value))}
                className="bg-white dark:bg-slate-900 border border-border-subtle rounded-lg px-2.5 py-1 text-xs font-bold text-forest-deep focus:outline-none focus:border-primary cursor-pointer"
              >
                {membersOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayLabel || formatAssociateLabel(m)}
                  </option>
                ))}
              </select>

              {/* Solde CCA dans le bac à sable */}
              <span
                id="toaster-member-cca-badge"
                className={`ml-1 px-2.5 py-1 rounded-lg text-xs font-bold tabular-nums border ${
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

            {/* Bouton Tiroir d'Audit des actions matérielles & e-mails interceptés */}
            <button
              id="btn-toggle-sandbox-audit"
              type="button"
              onClick={() => setIsAuditDrawerOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 text-xs font-bold transition-all cursor-pointer shadow-2xs"
            >
              <span className="material-symbols-outlined text-[18px] text-amber-700">security</span>
              <span>Actions matérielles &amp; e-mails interceptés</span>
              <span className="px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-950 text-[11px] font-extrabold">
                {auditLogs.length}
              </span>
            </button>

            {/* Bouton Réinitialiser le bac à sable */}
            <button
              id="btn-reset-sandbox"
              type="button"
              onClick={handleResetSandbox}
              disabled={resetingSandbox}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-800 border border-border-subtle hover:border-rose-300 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
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
          className="mb-4 p-3.5 rounded-xl bg-rose-50 border-2 border-rose-300 text-rose-950 text-xs font-semibold flex items-center justify-between gap-3"
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
      {/* 2. ZONE DE CONVERSATION & CARTES D'ACTION HYBRIDES (🟢 / 🔴)          */}
      {/* ===================================================================== */}
      <div className="flex-1 bg-surface-container-lowest rounded-2xl border border-border-subtle shadow-sm flex flex-col overflow-hidden min-h-[480px]">
        {/* Fil de messages */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {messages.length === 0 ? (
            <div className="h-full min-h-[340px] flex flex-col items-center justify-center text-center max-w-xl mx-auto px-4 py-8">
              <div className="w-14 h-14 rounded-2xl bg-sage-soft text-primary flex items-center justify-center mb-3 shadow-xs">
                <span className="material-symbols-outlined text-[30px]">chat_bubble</span>
              </div>
              <h2 className="font-headline-sm text-base sm:text-lg font-bold text-forest-deep">
                Bonjour {formatAssociateLabel(activeMemberObj)}, que souhaitez-vous faire au Domaine ?
              </h2>
              <p className="text-xs sm:text-sm text-on-surface-variant mt-1.5 leading-relaxed">
                Écrivez une phrase naturelle ou joignez la photo/PDF d’une facture. L’assistant prépare une carte de confirmation avec les champs déduits en{' '}
                <strong className="text-emerald-700">🟢 Vert</strong> et les précisions éventuelles en{' '}
                <strong className="text-rose-700">🔴 Rouge</strong> avant toute exécution dans le bac à sable.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.role === 'user';
              const card = msg.action_card;
              const typeMeta = card ? ACTION_TYPE_META[card.action_type] || { icon: 'bolt', badge: card.action_type, color: 'bg-slate-100 text-slate-800 border-slate-300' } : null;

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  {/* Bulle de texte */}
                  <div
                    className={`max-w-2xl rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-2xs ${
                      isUser
                        ? 'bg-primary text-white rounded-br-xs'
                        : 'bg-canvas-slate text-on-surface border border-border-subtle rounded-bl-xs'
                    }`}
                  >
                    {msg.attachment && (
                      <div className="mb-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/15 border border-white/25 text-xs font-semibold">
                        <span className="material-symbols-outlined text-[16px]">attach_file</span>
                        <span>{msg.attachment.name}</span>
                      </div>
                    )}
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>

                  {/* Carte d'Action Hybride 🟢 Vert / 🔴 Rouge */}
                  {card && (
                    <div
                      data-testid="toaster-action-card"
                      className="mt-3 w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border-2 border-primary/30 shadow-md overflow-hidden animate-in fade-in duration-200"
                    >
                      {/* En-tête de la Carte */}
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
                        {/* 1. Champs déduits par l'IA en VERT (🟢) — cliquables pour édition inline */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                              🟢 Champs déduits par l’IA (cliquez sur une puce pour modifier)
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
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-50 border-2 border-emerald-500 text-xs"
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
                                        className="px-2 py-0.5 bg-white border border-emerald-300 rounded text-xs font-semibold text-slate-900 focus:outline-none w-36"
                                      />
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleSaveEditedDeducedField(msg.id, field.key, editingField.tempValue)
                                        }
                                        className="px-1.5 py-0.5 rounded bg-emerald-700 text-white font-bold text-[11px] cursor-pointer"
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
                                    className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100/90 text-emerald-950 border border-emerald-300 text-xs font-semibold transition-all cursor-pointer shadow-2xs"
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

                        {/* 2. Champs manquants ou ambigus en ROUGE (🔴) avec boutons de choix cliquables */}
                        {card.missing_fields.length > 0 && (
                          <div className="space-y-2.5 p-3.5 rounded-xl bg-rose-50/90 border-2 border-rose-300">
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

                                    {/* Boutons d'options cliquables qui passent immédiatement le champ en 🟢 Vert */}
                                    {mField.options && mField.options.length > 0 && (
                                      <div className="flex flex-wrap gap-2 pt-0.5">
                                        {mField.options.map((opt, idx) => (
                                          <button
                                            key={`${mField.key}-opt-${idx}`}
                                            type="button"
                                            onClick={() => handleResolveMissingField(msg.id, mField, opt)}
                                            className="px-3 py-1.5 rounded-lg bg-rose-100 hover:bg-emerald-600 text-rose-950 hover:text-white border border-rose-300 hover:border-emerald-700 text-xs font-bold transition-all cursor-pointer shadow-2xs"
                                          >
                                            {opt.label}
                                          </button>
                                        ))}
                                      </div>
                                    )}

                                    {/* Saisie libre alternative si l'utilisateur veut préciser une autre valeur */}
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
                                        className="flex-1 h-8 px-2.5 rounded-lg bg-canvas-slate border border-border-subtle text-xs text-on-surface focus:outline-none focus:border-primary"
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
                                          className="px-2.5 h-8 rounded-lg bg-emerald-700 text-white text-xs font-bold cursor-pointer"
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

                        {/* Erreur d'exécution éventuelle */}
                        {card.executionError && (
                          <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs font-semibold">
                            ⚠️ {card.executionError}
                          </div>
                        )}

                        {/* Résultat après exécution dans le bac à sable */}
                        {card.executed && card.executionResult ? (
                          <div className="p-3.5 rounded-xl bg-emerald-50 border-2 border-emerald-400 text-emerald-950 space-y-2">
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
                                    className="text-xs bg-white/90 px-2.5 py-1.5 rounded-lg border border-emerald-200 flex items-center justify-between gap-2"
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
                          /* Bouton principal Confirmer et exécuter l'action */
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
                              className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all shadow-sm ${
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

          {isSending && (
            <div className="flex items-center gap-2.5 text-xs font-semibold text-on-surface-variant px-3 py-2">
              <span className="material-symbols-outlined animate-spin text-primary text-[18px]">
                progress_activity
              </span>
              <span>Gemini 4 Argon analyse votre demande et le contexte du domaine...</span>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* =================================================================== */}
        {/* 3. BARRE DE SAISIE MULTIMODALE ÉPURÉE (Bas de page)                 */}
        {/* =================================================================== */}
        <form
          onSubmit={handleSendMessage}
          className="p-3 sm:p-4 bg-canvas-slate border-t border-border-subtle flex flex-col gap-2"
        >
          {/* Aperçu de la pièce jointe sélectionnée */}
          {attachment && (
            <div className="inline-flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-950 text-xs font-semibold self-start">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-emerald-700">description</span>
                <span>{attachment.name}</span>
                <span className="text-[10px] text-emerald-700">
                  ({Math.max(1, Math.round(attachment.size / 1024))} Ko)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAttachment(null)}
                className="text-emerald-800 hover:text-rose-600 cursor-pointer ml-2"
                title="Retirer la pièce jointe"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            {/* Bouton + Photo / PDF */}
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
              className="h-11 px-3.5 rounded-xl bg-white hover:bg-surface-container text-forest-deep border border-border-subtle text-xs font-bold inline-flex items-center gap-1.5 shrink-0 transition-all cursor-pointer shadow-2xs"
              title="Joindre une photo ou un PDF de facture pour lecture automatique OCR"
            >
              <span className="material-symbols-outlined text-[18px] text-primary">add_photo_alternate</span>
              <span className="hidden sm:inline">+ Photo / PDF</span>
            </button>

            {/* Bouton Dictée Vocale */}
            {speechSupported && (
              <button
                id="btn-toaster-voice"
                type="button"
                onClick={handleToggleSpeech}
                className={`h-11 px-3 rounded-xl border text-xs font-bold inline-flex items-center gap-1 shrink-0 transition-all cursor-pointer shadow-2xs ${
                  isListening
                    ? 'bg-rose-600 text-white border-rose-700 animate-pulse'
                    : 'bg-white hover:bg-surface-container text-slate-700 border-border-subtle'
                }`}
                title={isListening ? 'Arrêter la dictée vocale' : 'Dicter votre message à la voix'}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {isListening ? 'mic_off' : 'mic'}
                </span>
                <span className="hidden md:inline">{isListening ? 'Écoute...' : 'Voix'}</span>
              </button>
            )}

            {/* Champ texte */}
            <input
              id="toaster-chat-input"
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ex : Je viens au Presbytère le week-end prochain avec Frédéric..."
              className="flex-1 h-11 px-4 rounded-xl bg-white dark:bg-slate-900 border border-border-subtle text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
            />

            {/* Bouton Envoyer */}
            <button
              id="btn-toaster-send"
              type="submit"
              disabled={isSending || (!inputText.trim() && !attachment)}
              className="h-11 px-5 rounded-xl bg-primary hover:bg-forest-deep text-white text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 shrink-0 transition-all cursor-pointer shadow-sm disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">send</span>
              <span>Envoyer</span>
            </button>
          </div>
        </form>
      </div>

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
                    label: log.category || ' Trace',
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
                      className="p-3.5 rounded-xl bg-canvas-slate border border-border-subtle space-y-2 shadow-2xs"
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

                      <div className="text-xs font-bold text-slate-900">{log.title}</div>

                      {parsedPayload && (
                        <pre className="text-[11px] font-mono bg-white p-2.5 rounded-lg border border-slate-200 overflow-x-auto text-slate-700 whitespace-pre-wrap">
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
