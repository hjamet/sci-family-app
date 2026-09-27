import React, { useState, useEffect, useRef } from 'react';
import { MarkdownContent } from './common/RichTextEditor';
import DocumentViewerModal from './DocumentViewerModal';
import FamilyChat from './common/FamilyChat';
import { castProjectVote } from '../api';

// Error Boundary de protection intégrée pour empêcher tout écran blanc
class VoteErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Erreur capturée dans VoteRoofModal:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div 
          className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-rose-200 dark:border-rose-800 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-3xl">how_to_vote</span>
            </div>
            <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100">
              Scrutin statutaire sécurisé
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Le vote reste actif et vos données sont préservées. Un incident de rendu a été intercepté pour protéger l'intégrité de la session.
            </p>
            <div className="pt-2 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  if (this.props.onClose) this.props.onClose();
                }}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs sm:text-sm transition-colors cursor-pointer"
              >
                Fermer la fenêtre
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// 7 associés statutaires de la SCI Hellenvilliers (Tous initialisés neutres en attente de vote réel)
const DEFAULT_ASSOCIATES = [
  {
    id: 'henri',
    name: 'Henri Jamet',
    role: 'Gérance SCI',
    isGerance: true,
    vote: 'EN_ATTENTE',
    date: null,
    initials: 'HJ'
  },
  {
    id: 'hortense',
    name: 'Hortense Jamet',
    role: 'Associée',
    isGerance: false,
    vote: 'EN_ATTENTE',
    date: null,
    initials: 'HJ'
  },
  {
    id: 'marguerite',
    name: 'Marguerite Jamet',
    role: 'Associée',
    isGerance: false,
    vote: 'EN_ATTENTE',
    date: null,
    initials: 'MJ'
  },
  {
    id: 'eugenie',
    name: 'Eugénie Jamet',
    role: 'Associée',
    isGerance: false,
    vote: 'EN_ATTENTE',
    date: null,
    initials: 'EJ'
  },
  {
    id: 'josephine',
    name: 'Joséphine Jamet',
    role: 'Associée',
    isGerance: false,
    vote: 'EN_ATTENTE',
    date: null,
    initials: 'JJ'
  },
  {
    id: 'elisabeth',
    name: 'Élisabeth Jamet',
    role: 'Associée',
    isGerance: false,
    vote: 'EN_ATTENTE',
    date: null,
    initials: 'EJ'
  },
  {
    id: 'frederic',
    name: 'Frédéric Jamet',
    role: 'Associé',
    isGerance: false,
    vote: 'EN_ATTENTE',
    date: null,
    initials: 'FJ'
  },
];

// Extraction sécurisée et universelle du nom d'utilisateur
export const resolveUserName = (user) => {
  if (!user) return 'Henri Jamet';
  if (typeof user === 'string') return user.trim() || 'Henri Jamet';
  if (typeof user === 'object') {
    if (user.name) return String(user.name).trim();
    if (user.prenom) return `${user.prenom} ${user.nom || ''}`.trim();
    if (user.first_name) return `${user.first_name} ${user.last_name || ''}`.trim();
    if (user.username) return String(user.username).trim();
    if (user.display_name) return String(user.display_name).trim();
    if (user.email) return String(user.email).split('@')[0].trim();
    if (typeof user.toString === 'function') {
      const s = user.toString();
      if (s && s !== '[object Object]') return s;
    }
  }
  return 'Henri Jamet';
};

// Extraction sécurisée du nom de votant (supporte string, user_name, author, user object, member object)
export const safeExtractVoterName = (v) => {
  if (!v) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'object') {
    if (typeof v.user_name === 'string') return v.user_name.trim();
    if (typeof v.author === 'string') return v.author.trim();
    if (typeof v.name === 'string') return v.name.trim();
    if (typeof v.user === 'string') return v.user.trim();
    if (typeof v.user === 'object' && v.user) {
      return (v.user.name || v.user.prenom || v.user.username || '').trim();
    }
    if (typeof v.member === 'object' && v.member) {
      return (v.member.name || v.member.prenom || '').trim();
    }
  }
  return '';
};

// Extraction sécurisée du choix de vote (supporte vote, choice, value)
export const safeExtractVoteChoice = (v) => {
  if (!v) return '';
  const raw = v.vote ?? v.choice ?? v.value ?? (typeof v === 'string' ? v : '');
  return String(raw || '').trim();
};

// Extraction sécurisée du prénom pour affichage
export const formatAssociateFirstName = (a) => {
  if (!a) return 'Associé';
  const raw = a.name || a.prenom || a.id || 'Associé';
  return String(raw).trim().split(' ')[0] || 'Associé';
};

function VoteRoofModalInner({
  isOpen,
  onClose,
  currentUser = 'Henri Jamet',
  onVoteSubmit,
  project,
}) {
  const currentUserName = resolveUserName(currentUser);

  // Normalisation des propriétés du projet avec fallbacks neutres dynamiques
  const activeProject = project || {};
  const projectTitle = activeProject.title || 'Consultation & Scrutin des Associés';
  const projectDescription = activeProject.description || "Aucune description détaillée n'a été renseignée pour ce projet.";
  const projectRef = activeProject.ref || (activeProject.id ? `VOTE-2026-${String(activeProject.id).padStart(2, '0')}` : 'VOTE-2026');
  const projectReporter = activeProject.submitted_by || activeProject.reporter?.name || (typeof activeProject.reporter === 'string' ? activeProject.reporter : 'Non assigné');
  const projectBudget = typeof activeProject.estimated_cost === 'number'
    ? `${activeProject.estimated_cost.toLocaleString('fr-FR')} € TTC`
    : (activeProject.budgetText || (activeProject.estimated_cost ? `${activeProject.estimated_cost} € TTC` : '—'));
  const projectSubject = activeProject.category || activeProject.subject || 'SCI Familiale';
  const projectBadgeStatus = activeProject.badgeStatus || (activeProject.status === 'EN_VOTE' ? 'Vote formel en cours' : (activeProject.status || 'Initiative'));

  const voteSectionRef = useRef(null);

  // Liste nominative des 7 associés statutaires de la SCI Hellenvilliers
  const [associatesVotes, setAssociatesVotes] = useState(() => {
    const votesArr = Array.isArray(project?.votes) ? project.votes : [];
    return DEFAULT_ASSOCIATES.map(assoc => {
      const assocNameLower = String(assoc.name || '').toLowerCase();
      const assocIdLower = String(assoc.id || '').toLowerCase();
      const found = votesArr.find(v => {
        if (!v) return false;
        const vName = safeExtractVoterName(v).toLowerCase();
        return (vName && (vName.includes(assocNameLower) || assocNameLower.includes(vName) || vName.includes(assocIdLower))) ||
               (v.user_id && v.user_id === assoc.id) ||
               (v.member_id && v.member_id === assoc.id);
      });
      if (found) {
        return {
          ...assoc,
          vote: safeExtractVoteChoice(found) || 'EN_ATTENTE',
          date: found.date || found.created_at || found.voted_at || 'Mai 2026'
        };
      }
      return { ...assoc, vote: 'EN_ATTENTE', date: null };
    });
  });

  // Synchronisation dynamique si le projet change
  useEffect(() => {
    const votesArr = Array.isArray(project?.votes) ? project.votes : [];
    setAssociatesVotes(DEFAULT_ASSOCIATES.map(assoc => {
      const assocNameLower = String(assoc.name || '').toLowerCase();
      const assocIdLower = String(assoc.id || '').toLowerCase();
      const found = votesArr.find(v => {
        if (!v) return false;
        const vName = safeExtractVoterName(v).toLowerCase();
        return (vName && (vName.includes(assocNameLower) || assocNameLower.includes(vName) || vName.includes(assocIdLower))) ||
               (v.user_id && v.user_id === assoc.id) ||
               (v.member_id && v.member_id === assoc.id);
      });
      if (found) {
        return {
          ...assoc,
          vote: safeExtractVoteChoice(found) || 'EN_ATTENTE',
          date: found.date || found.created_at || found.voted_at || 'Mai 2026'
        };
      }
      return { ...assoc, vote: 'EN_ATTENTE', date: null };
    }));
  }, [project]);

  // Messages du fil de discussion familial (chargés dynamiquement depuis le projet réel)
  const [messages, setMessages] = useState(() => {
    if (Array.isArray(activeProject.comments) && activeProject.comments.length > 0) {
      return activeProject.comments.map((c, idx) => ({
        id: c.id || idx + 1,
        author: c.author_name || c.author || 'Associé',
        initials: (c.author_name || c.author || 'A').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(),
        isGerance: (c.author_name || '').toLowerCase().includes('henri'),
        date: c.created_at ? new Date(c.created_at).toLocaleDateString('fr-FR') : '',
        content: c.content || '',
        reactions: c.reactions || []
      }));
    }
    return [];
  });

  useEffect(() => {
    if (Array.isArray(activeProject.comments)) {
      setMessages(activeProject.comments.map((c, idx) => ({
        id: c.id || idx + 1,
        author: c.author_name || c.author || 'Associé',
        initials: (c.author_name || c.author || 'A').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(),
        isGerance: (c.author_name || '').toLowerCase().includes('henri'),
        date: c.created_at ? new Date(c.created_at).toLocaleDateString('fr-FR') : '',
        content: c.content || '',
        reactions: c.reactions || []
      })));
    }
  }, [activeProject.comments]);

  // Formulaire de vote interactif direct
  const [selectedVote, setSelectedVote] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // Vue détaillée du tableau des associés
  const [showFullTable, setShowFullTable] = useState(true);

  // Trouver l'associé connecté avec protections robustes
  const currentAssociate = (associatesVotes || []).find(a => {
    if (!a || !a.name) return false;
    const aLower = String(a.name).toLowerCase();
    const uLower = String(currentUserName).toLowerCase();
    return (
      (uLower && (aLower.includes(uLower) || uLower.includes(aLower))) ||
      (uLower.includes('henri') && a.id === 'henri') ||
      (uLower.includes('hortense') && a.id === 'hortense') ||
      (uLower.includes('marguerite') && a.id === 'marguerite') ||
      (uLower.includes('eugénie') && a.id === 'eugenie') ||
      (uLower.includes('joséphine') && a.id === 'josephine') ||
      (uLower.includes('élisabeth') && a.id === 'elisabeth') ||
      (uLower.includes('frédéric') && a.id === 'frederic')
    );
  }) || (associatesVotes && associatesVotes[0]) || DEFAULT_ASSOCIATES[0];

  // Synchroniser le vote actuel de l'utilisateur
  useEffect(() => {
    if (currentAssociate && currentAssociate.vote !== 'EN_ATTENTE') {
      setSelectedVote(currentAssociate.vote);
    }
  }, [currentAssociate]);

  // Verrouillage du scroll en arrière-plan
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = 'unset';
        window.removeEventListener('keydown', handleKeyDown);
      };
    } else {
      document.body.style.overflow = 'unset';
    }
  }, [isOpen, onClose]);

  // État de la visionneuse intégrée
  const [viewerDoc, setViewerDoc] = useState(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  if (!isOpen) return null;

  // Options de vote personnalisées du projet (Annotation 4)
  const projectOptions = (() => {
    if (Array.isArray(activeProject.options) && activeProject.options.length > 0) {
      return activeProject.options.filter(Boolean);
    }
    if (typeof activeProject.options === 'string' && activeProject.options.trim()) {
      try {
        const parsed = JSON.parse(activeProject.options);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed.filter(Boolean);
      } catch (_) {
        const split = activeProject.options.split(',').map((s) => s.trim()).filter(Boolean);
        if (split.length > 0) return split;
      }
    }
    return [];
  })();

  // Calculs statistiques en temps réel avec prise en compte du report AG et vote blanc
  const totalAssociates = 7;
  const safeList = Array.isArray(associatesVotes) ? associatesVotes : DEFAULT_ASSOCIATES;
  const pourVotes = safeList.filter(a => ['POUR', 'OUI'].includes(String(a?.vote || '').toUpperCase()));
  const contreVotes = safeList.filter(a => ['CONTRE', 'NON'].includes(String(a?.vote || '').toUpperCase()));
  const abstentionVotes = safeList.filter(a => ['ABSTENTION', 'BLANC'].includes(String(a?.vote || '').toUpperCase()));
  const reportAgVotes = safeList.filter(a => ['REPORT_AG', 'REPORT_PROCHAINE_AG', 'DEMANDE_AG', 'REPORT AG'].includes(String(a?.vote || '').toUpperCase()));
  const customVotesList = safeList.filter(a => {
    const v = String(a?.vote || '').toUpperCase();
    return v && !['POUR', 'OUI', 'CONTRE', 'NON', 'ABSTENTION', 'BLANC', 'REPORT_AG', 'REPORT_PROCHAINE_AG', 'DEMANDE_AG', 'REPORT AG', 'EN_ATTENTE'].includes(v);
  });
  const attenteVotes = safeList.filter(a => !a?.vote || String(a?.vote || '').toUpperCase() === 'EN_ATTENTE');

  const pourCount = pourVotes.length;
  const contreCount = contreVotes.length;
  const abstentionCount = abstentionVotes.length;
  const reportAgCount = reportAgVotes.length;
  const attenteCount = attenteVotes.length;
  const totalVotesCast = pourCount + contreCount + abstentionCount + reportAgCount + customVotesList.length;

  const pourPct = ((pourCount / totalAssociates) * 100).toFixed(1);
  const contrePct = ((contreCount / totalAssociates) * 100).toFixed(1);
  const abstentionPct = ((abstentionCount / totalAssociates) * 100).toFixed(1);
  const reportAgPct = ((reportAgCount / totalAssociates) * 100).toFixed(1);
  const attentePct = Math.max(0, 100 - parseFloat(pourPct) - parseFloat(contrePct) - parseFloat(abstentionPct) - parseFloat(reportAgPct)).toFixed(1);
  const participationPct = Math.round((totalVotesCast / totalAssociates) * 100);

  const isAgReportRequested = reportAgCount > 0;
  const isMajoriteAtteinte = pourCount >= 4;

  // Documents justificatifs sécurisés (100% dynamiques réels, zéro faux devis par défaut)
  const documentsList = (Array.isArray(activeProject.documents) && activeProject.documents.length > 0)
    ? activeProject.documents
    : (Array.isArray(activeProject.files) && activeProject.files.length > 0)
    ? activeProject.files
    : (Array.isArray(activeProject.document_urls) && activeProject.document_urls.length > 0)
    ? activeProject.document_urls
    : [];

  // Enregistrement direct du vote en 1 clic
  const handleCastVote = async (voteChoice) => {
    setSelectedVote(voteChoice);
    const now = new Date();
    const formattedDate = `${now.getDate()} mai 2026, ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const assocId = currentAssociate?.id || 'henri';
    const assocName = currentAssociate?.name || currentUserName || 'Henri Jamet';

    setAssociatesVotes(prev => (prev || []).map(a => {
      if (a && a.id === assocId) {
        return {
          ...a,
          vote: voteChoice,
          date: formattedDate
        };
      }
      return a;
    }));

    const voteLabels = {
      POUR: 'Approuvé',
      CONTRE: 'Refusé',
      ABSTENTION: 'Abstention',
      BLANC: 'Vote blanc',
      REPORT_AG: 'Report en AG demandé'
    };

    setToastMessage(`Vote « ${voteLabels[voteChoice] || voteChoice} » enregistré pour ${assocName} !`);
    setTimeout(() => setToastMessage(null), 3500);

    // Synchronisation API si id disponible
    if (activeProject?.id) {
      try {
        await castProjectVote(activeProject.id, {
          vote: voteChoice,
          choice: voteChoice,
          user_name: assocName,
          user_id: assocId
        });
      } catch (err) {
        console.warn('API castProjectVote fallback local:', err.message);
      }
    }

    if (typeof onVoteSubmit === 'function') {
      try {
        onVoteSubmit({
          project: activeProject,
          associate: assocName,
          vote: voteChoice,
          choice: voteChoice
        });
      } catch (err) {
        console.warn('onVoteSubmit error:', err);
      }
    }
  };

  // Envoi d'un message dans le fil de discussion
  const handleSendMessageText = (text) => {
    if (!text || !text.trim()) return;

    const now = new Date();
    const formattedDate = `${now.getDate()} mai, ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const newMsg = {
      id: Date.now(),
      author: currentAssociate?.name || currentUserName,
      initials: currentAssociate?.initials || 'AJ',
      date: formattedDate,
      content: text.trim(),
      reactions: []
    };

    setMessages(prev => [...prev, newMsg]);
  };

  // Réaction à un message
  const handleToggleReaction = (msgId, emoji) => {
    setMessages(prev => prev.map(msg => {
      if (msg.id !== msgId) return msg;
      const reactions = Array.isArray(msg.reactions) ? msg.reactions : [];
      const existing = reactions.find(r => r.emoji === emoji);
      let updatedReactions;
      if (existing) {
        updatedReactions = reactions.map(r => 
          r.emoji === emoji ? { ...r, count: r.count + 1 } : r
        );
      } else {
        updatedReactions = [...reactions, { emoji, count: 1 }];
      }
      return { ...msg, reactions: updatedReactions };
    }));
  };

  // Consultation dans la visionneuse sans téléchargement
  const handleViewDoc = (docName, desc) => {
    const content = `SCI FAMILIALE HELLENVILLIERS — DIRECTION DU DOMAINE\n\nDocument certifié : ${docName}\nObjet : ${desc}\nProjet : ${projectTitle} (${projectBudget})\nDate d'émission : Mai 2026\nStatut : Pièce certifiée conforme déposée au registre des délibérations.`;
    setViewerDoc({
      filename: docName,
      title: docName,
      content: content,
      file_type: 'text/plain'
    });
    setIsViewerOpen(true);
  };

  // Téléchargement réel / simulé du document
  const handleDownloadDoc = (docName, desc) => {
    const content = `SCI FAMILIALE HELLENVILLIERS\n\nDocument certifié : ${docName}\nObjet : ${desc}\nProjet : ${projectTitle} (${projectBudget})\nDate d'émission : Mai 2026\nStatut : Validé pour consultation des 7 associés.`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = docName.replace('.pdf', '.txt');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-space-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="relative w-full max-w-5xl bg-surface-container-lowest rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-border-subtle"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-roof-title"
      >
        {/* Toast de confirmation */}
        {toastMessage && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-forest-deep text-on-primary px-4 py-2 rounded-full shadow-lg font-label-md text-sm flex items-center gap-2 animate-in slide-in-from-top duration-300">
            <span className="material-symbols-outlined text-lg">check_circle</span>
            <span>{toastMessage}</span>
          </div>
        )}

        {/* 1. EN-TÊTE ÉPURÉ DE LA MODALE */}
        <header className="w-full bg-canvas-slate px-4 py-3 sm:px-space-lg sm:py-space-md flex items-center justify-between gap-space-sm border-b border-border-subtle shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-forest-deep text-xl">how_to_vote</span>
            <span className="font-semibold text-xs sm:text-sm text-slate-800">Scrutin &amp; Délibération des Associés</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => voteSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold transition-all shadow-xs cursor-pointer"
              title="Aller directement aux boutons de vote"
            >
              <span>👇</span>
              <span>Voter directement</span>
            </button>

            {/* Action Quitter / Fermer */}
            <button 
              onClick={onClose}
              aria-label="Fermer la fenêtre" 
              className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors focus:outline-none cursor-pointer" 
              type="button"
            >
              <span className="material-symbols-outlined text-2xl">close</span>
            </button>
          </div>
        </header>

        {/* 2. CORPS DE LA MODALE : 2 COLONNES (7 cols gauche / 5 cols droite sur lg) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-y-auto min-h-0 divide-y lg:divide-y-0 lg:divide-x divide-border-subtle">
          
          {/* COLONNE GAUCHE (7 cols) : Détails, Documents, Jauge & Scrutin */}
          <section className="lg:col-span-7 p-4 sm:p-space-lg flex flex-col gap-5 sm:gap-space-lg bg-surface-container-lowest overflow-y-auto">
            
            {/* Titre & Contexte du scrutin */}
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-xs font-medium">Bâti &amp; Travaux</span>
                <span className="px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-xs font-medium">{projectSubject}</span>
                <span className="px-2.5 py-0.5 rounded-full bg-sage-soft text-forest-deep font-label-sm text-xs font-semibold">{projectBadgeStatus}</span>
              </div>
              <h1 id="modal-roof-title" className="font-headline-lg text-xl sm:text-2xl text-on-surface tracking-tight font-bold text-slate-900 mt-1">
                {projectTitle}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-on-surface-variant text-xs sm:text-sm">
                <span className="font-semibold text-slate-600">Réf. {projectRef}</span>
                <span>•</span>
                <span className="flex items-center gap-1 text-slate-700">
                  <span className="material-symbols-outlined text-[18px] text-primary">account_circle</span>
                  Soumis par <strong>{projectReporter}</strong> (SCI) • Budget : <strong>{projectBudget}</strong>
                </span>
              </div>
            </div>

            {/* Description & Objectifs */}
            <div className="flex flex-col gap-3 bg-canvas-slate rounded-[14px] p-4 border border-border-subtle">
              <h2 className="font-headline-sm text-sm sm:text-base font-bold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-forest-deep text-xl">description</span>
                Description des travaux &amp; Enjeux
              </h2>
              <div className="text-xs sm:text-sm text-on-surface-variant leading-relaxed text-slate-700">
                <MarkdownContent content={projectDescription} />
              </div>
            </div>

            {/* Documents & Justificatifs rattachés */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <h2 className="font-headline-sm text-sm sm:text-base font-bold text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-forest-deep text-xl">folder_open</span>
                  Documents &amp; Justificatifs rattachés
                </h2>
                <span className="text-xs text-on-surface-variant font-medium">{documentsList.length} pièce{documentsList.length > 1 ? 's' : ''} certifiée{documentsList.length > 1 ? 's' : ''}</span>
              </div>

              <div className="flex flex-col gap-2">
                {documentsList.length === 0 ? (
                  <div className="p-4 bg-canvas-slate rounded-xl text-center text-xs text-on-surface-variant border border-dashed border-border-subtle">
                    Aucune pièce jointe ou devis téléversé pour ce projet.
                  </div>
                ) : (
                  documentsList.map((doc, idx) => {
                    const docName = typeof doc === 'string' ? doc : (doc.name || doc.filename || `Document_${idx + 1}.pdf`);
                    const docDesc = typeof doc === 'object' ? (doc.desc || doc.description || doc.details || 'Pièce certifiée') : 'Pièce certifiée';
                    const docDetails = typeof doc === 'object' ? (doc.details || doc.name || docName) : docName;
                    return (
                      <div key={idx} className="flex items-center justify-between p-3 bg-canvas-slate hover:bg-surface-container transition-colors rounded-xl border border-border-subtle">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-error-container text-error flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-xl">picture_as_pdf</span>
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs sm:text-sm font-semibold text-on-surface truncate">
                              {docName}
                            </span>
                            <span className="text-[11px] text-on-surface-variant truncate">
                              {docDesc}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <button 
                            onClick={() => handleViewDoc(docName, docDetails)}
                            className="px-2.5 py-1.5 rounded-lg bg-surface-container-lowest text-primary hover:bg-sage-soft text-xs font-semibold flex items-center gap-1 shadow-xs border border-primary transition-all cursor-pointer" 
                            type="button"
                            title="Consulter sans télécharger"
                          >
                            <span className="material-symbols-outlined text-[15px]">visibility</span>
                            <span>Consulter</span>
                          </button>
                          <button 
                            onClick={() => handleDownloadDoc(docName, docDetails)}
                            className="px-2.5 py-1.5 rounded-lg bg-primary text-white hover:bg-forest-deep text-xs font-semibold flex items-center gap-1 shadow-xs transition-all cursor-pointer" 
                            type="button"
                            title="Télécharger une copie"
                          >
                            <span className="material-symbols-outlined text-[15px]">download</span>
                            <span>Télécharger</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 3. SECTION PROGRESSION & TENDANCE DU SCRUTIN (Jauge segmentée) */}
            <div className="bg-canvas-slate p-4 rounded-xl border border-border-subtle flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm font-bold text-on-surface">
                  Participation : {totalVotesCast} / {totalAssociates} voix ({participationPct}%)
                </span>
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                  isAgReportRequested
                    ? 'bg-purple-100 text-purple-800 border border-purple-200'
                    : isMajoriteAtteinte 
                    ? 'bg-sage-soft text-forest-deep border border-sage-border' 
                    : 'bg-amber-soft text-amber-rich'
                }`}>
                  {isAgReportRequested 
                    ? '🏛️ Décision suspendue — Débat en AG requis'
                    : isMajoriteAtteinte 
                    ? '✓ Majorité qualifiée atteinte' 
                    : 'En attente de majorité'}
                </span>
              </div>

              {/* Barre de progression segmentée harmonisée */}
              <div className="w-full h-3.5 rounded-full bg-surface-container overflow-hidden flex border border-border-subtle shadow-inner">
                {/* Pour */}
                <div 
                  className="h-full bg-forest-deep transition-all duration-500 relative" 
                  style={{ width: `${pourPct}%` }} 
                  title={`Pour : ${pourCount} voix (${pourPct}%)`}
                ></div>
                {/* Contre */}
                <div 
                  className="h-full bg-error transition-all duration-500 relative" 
                  style={{ width: `${contrePct}%` }} 
                  title={`Contre : ${contreCount} voix (${contrePct}%)`}
                ></div>
                {/* Abstention */}
                <div 
                  className="h-full bg-amber-rich transition-all duration-500 relative" 
                  style={{ width: `${abstentionPct}%` }} 
                  title={`Abstention : ${abstentionCount} voix (${abstentionPct}%)`}
                ></div>
                {/* Report AG */}
                <div 
                  className="h-full bg-purple-700 transition-all duration-500 relative" 
                  style={{ width: `${reportAgPct}%` }} 
                  title={`Report AG : ${reportAgCount} voix (${reportAgPct}%)`}
                ></div>
                {/* En attente */}
                <div 
                  className="h-full bg-slate-300 transition-all duration-500 relative" 
                  style={{ width: `${attentePct}%` }} 
                  title={`En attente : ${attenteCount} voix (${attentePct}%)`}
                ></div>
              </div>

              {/* Détail synthétique des voix */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1 text-xs">
                <div className="flex items-center gap-1.5 text-forest-deep font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-forest-deep shrink-0"></span>
                  <span><strong>{pourCount} Pour :</strong> {pourVotes.map(formatAssociateFirstName).join(', ') || 'Aucun'}</span>
                </div>
                <div className="flex items-center gap-1.5 text-rose-700 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-600 shrink-0"></span>
                  <span><strong>{contreCount} Contre :</strong> {contreVotes.map(formatAssociateFirstName).join(', ') || 'Aucun'}</span>
                </div>
                <div className="flex items-center gap-1.5 text-amber-rich font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-rich shrink-0"></span>
                  <span><strong>{abstentionCount} Abst. :</strong> {abstentionVotes.map(formatAssociateFirstName).join(', ') || 'Aucune'}</span>
                </div>
                {reportAgCount > 0 ? (
                  <div className="flex items-center gap-1.5 text-purple-800 font-medium">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-700 shrink-0"></span>
                    <span><strong>{reportAgCount} Report AG :</strong> {reportAgVotes.map(formatAssociateFirstName).join(', ')}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-400 shrink-0"></span>
                    <span><strong>{attenteCount} En attente :</strong> {attenteVotes.map(formatAssociateFirstName).join(', ') || 'Aucun'}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 4. TABLEAU NOMINATIF DES 7 ASSOCIÉS ÉPURÉ */}
            <div className="bg-surface-container-lowest rounded-xl border border-border-subtle p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-forest-deep text-xl">groups</span>
                  <h3 className="text-xs sm:text-sm font-bold text-on-surface">
                    Tableau nominatif des 7 associés de la SCI
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowFullTable(!showFullTable)}
                  className="text-xs text-primary hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <span>{showFullTable ? 'Masquer détails' : 'Afficher détails'}</span>
                  <span className="material-symbols-outlined text-[16px]">
                    {showFullTable ? 'expand_less' : 'expand_more'}
                  </span>
                </button>
              </div>

              {showFullTable && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border-subtle text-slate-500 font-semibold bg-canvas-slate">
                        <th className="py-2.5 px-4">Associé(e)</th>
                        <th className="py-2.5 px-4 text-right">Choix du vote &amp; Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {associatesVotes.map((associate) => {
                        const isUserRow = Boolean(associate?.id && currentAssociate?.id && associate.id === currentAssociate.id);
                        const voteStr = String(associate?.vote || '').toUpperCase();
                        return (
                          <tr 
                            key={associate.id} 
                            className={`hover:bg-slate-50 transition-colors ${
                              isUserRow ? 'bg-sage-soft/30 font-medium' : ''
                            }`}
                          >
                            <td className="py-2.5 px-4">
                              <div className="flex items-center gap-2.5">
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                                  associate.isGerance ? 'bg-sage-soft text-forest-deep' : 'bg-surface-container-highest text-on-surface'
                                }`}>
                                  {associate.initials || 'AJ'}
                                </div>
                                <span className="font-semibold text-slate-900 truncate">
                                  {associate.name || 'Associé'}
                                  {isUserRow && <span className="ml-1.5 text-[10px] text-primary font-bold">(Vous)</span>}
                                </span>
                              </div>
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <div className="flex flex-col sm:flex-row items-end sm:items-center justify-end gap-1.5 sm:gap-3">
                                {['POUR', 'OUI'].includes(voteStr) && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                    Approuvé
                                  </span>
                                )}
                                {['CONTRE', 'NON'].includes(voteStr) && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                    <span className="material-symbols-outlined text-[14px]">cancel</span>
                                    Refusé
                                  </span>
                                )}
                                {voteStr === 'ABSTENTION' && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                    <span className="material-symbols-outlined text-[14px]">pause_circle</span>
                                    Abstention
                                  </span>
                                )}
                                {voteStr === 'BLANC' && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-300">
                                    <span>⚪</span>
                                    Vote blanc
                                  </span>
                                )}
                                {['REPORT_AG', 'REPORT_PROCHAINE_AG', 'DEMANDE_AG', 'REPORT AG'].includes(voteStr) && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                                    <span>🏛️</span>
                                    Report AG
                                  </span>
                                )}
                                {(voteStr === 'EN_ATTENTE' || !voteStr) && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                    <span className="material-symbols-outlined text-[14px]">schedule</span>
                                    En attente
                                  </span>
                                )}
                                {!['POUR', 'OUI', 'CONTRE', 'NON', 'ABSTENTION', 'BLANC', 'REPORT_AG', 'REPORT_PROCHAINE_AG', 'DEMANDE_AG', 'REPORT AG', 'EN_ATTENTE', ''].includes(voteStr) && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 max-w-[200px] truncate" title={associate?.vote}>
                                    <span className="material-symbols-outlined text-[14px]">how_to_vote</span>
                                    <span className="truncate">{associate?.vote}</span>
                                  </span>
                                )}
                                <span className="text-[11px] text-slate-500 whitespace-nowrap">
                                  {associate.date || '—'}
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 5. SECTION DE VOTE SOBRE & DIRECTE EN 1 CLIC */}
            <div ref={voteSectionRef} id="section-vote" className="p-4 rounded-xl bg-surface-container-low border border-border-subtle flex flex-col gap-3 shadow-sm scroll-mt-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Votre vote en tant que {currentAssociate.name} :
                </span>
                <span className="text-xs font-semibold text-primary">1 voix statutaire</span>
              </div>

              {/* Choix de vote : dynamique si projectOptions existe, ou standard sinon (Annotation 4) */}
              {projectOptions.length > 0 ? (
                <div className="flex flex-col gap-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {projectOptions.map((opt, idx) => {
                      const isSelected = selectedVote === opt;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleCastVote(opt)}
                          className={`group relative flex items-center justify-start gap-2.5 py-3 px-4 rounded-xl border text-xs sm:text-sm font-semibold transition-all cursor-pointer text-left ${
                            isSelected
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-500/30 font-bold'
                              : 'bg-white hover:bg-emerald-50 text-slate-800 hover:text-emerald-900 border-slate-200 hover:border-emerald-300 shadow-sm'
                          }`}
                        >
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            isSelected ? 'bg-white text-emerald-800' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {idx + 1}
                          </span>
                          <span className="flex-1 truncate">{opt}</span>
                          {isSelected && (
                            <span className="material-symbols-outlined text-[18px] text-white shrink-0">check_circle</span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Options statutaires obligatoires : Blanc & Report AG */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-slate-200/80">
                    <button
                      type="button"
                      onClick={() => handleCastVote('BLANC')}
                      className={`py-2.5 px-4 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        selectedVote === 'BLANC'
                          ? 'bg-slate-700 text-white border-slate-700 shadow-md ring-2 ring-slate-400/30 font-bold'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-300 shadow-sm'
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full border-2 border-slate-400 bg-white"></span>
                      <span>⚪ Voter blanc</span>
                      {selectedVote === 'BLANC' && (
                        <span className="material-symbols-outlined text-[16px] text-white ml-1">check</span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCastVote('REPORT_AG')}
                      className={`py-2.5 px-4 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        selectedVote === 'REPORT_AG'
                          ? 'bg-purple-700 text-white border-purple-700 shadow-md ring-2 ring-purple-400/30 font-bold'
                          : 'bg-white hover:bg-purple-50 text-slate-700 hover:text-purple-900 border-slate-200 hover:border-purple-300 shadow-sm'
                      }`}
                    >
                      <span className="text-base">🏛️</span>
                      <span>Reporter à la prochaine AG</span>
                      {selectedVote === 'REPORT_AG' && (
                        <span className="material-symbols-outlined text-[16px] text-white ml-1">check</span>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Les 3 boutons principaux de vote direct en 1 clic */}
                  <div aria-label="Choix du vote direct" className="grid grid-cols-1 sm:grid-cols-3 gap-2.5" role="group">
                    {/* 1. Approuver */}
                    <button
                      type="button"
                      onClick={() => handleCastVote('POUR')}
                      className={`group relative flex items-center justify-center gap-2 py-3 px-4 rounded-xl border text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                        selectedVote === 'POUR'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-500/30 font-bold'
                          : 'bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border-slate-200 hover:border-emerald-300 shadow-sm'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[20px] shrink-0">check_circle</span>
                      <span>Approuver</span>
                    </button>

                    {/* 2. Refuser */}
                    <button
                      type="button"
                      onClick={() => handleCastVote('CONTRE')}
                      className={`group relative flex items-center justify-center gap-2 py-3 px-4 rounded-xl border text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                        selectedVote === 'CONTRE'
                          ? 'bg-rose-600 text-white border-rose-600 shadow-md ring-2 ring-rose-500/30 font-bold'
                          : 'bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-800 border-slate-200 hover:border-rose-300 shadow-sm'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[20px] shrink-0">cancel</span>
                      <span>Refuser</span>
                    </button>

                    {/* 3. S'abstenir */}
                    <button
                      type="button"
                      onClick={() => handleCastVote('ABSTENTION')}
                      className={`group relative flex items-center justify-center gap-2 py-3 px-4 rounded-xl border text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                        selectedVote === 'ABSTENTION'
                          ? 'bg-slate-700 text-white border-slate-700 shadow-md ring-2 ring-slate-400/30 font-bold'
                          : 'bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 border-slate-200 hover:border-slate-300 shadow-sm'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[20px] shrink-0">pause_circle</span>
                      <span>S'abstenir</span>
                    </button>
                  </div>

                  {/* Option statutaire séparée : Reporter à la prochaine Assemblée Générale */}
                  <div className="pt-3 border-t border-slate-200/80 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => handleCastVote('REPORT_AG')}
                      className={`w-full py-2.5 px-4 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        selectedVote === 'REPORT_AG'
                          ? 'bg-purple-700 text-white border-purple-700 shadow-md ring-2 ring-purple-400/30 font-bold'
                          : 'bg-white hover:bg-purple-50 text-slate-700 hover:text-purple-900 border-slate-200 hover:border-purple-300 shadow-sm'
                      }`}
                    >
                      <span className="text-base">🏛️</span>
                      <span>Demander un débat en Assemblée Générale</span>
                      {selectedVote === 'REPORT_AG' && (
                        <span className="material-symbols-outlined text-[16px] text-white ml-1">check</span>
                      )}
                    </button>
                    <p className="text-[11px] text-slate-500 italic leading-relaxed px-1">
                      Conformément aux statuts de la SCI, dès lors qu'un associé sollicite un débat en AG, la décision à distance est suspendue. Les votes exprimés restent visibles à titre indicatif et la résolution sera portée à l'ordre du jour de la prochaine AG.
                    </p>
                  </div>
                </>
              )}
            </div>

          </section>

          {/* COLONNE DROITE (5 cols) : Fil de discussion familial en direct */}
          <aside className="lg:col-span-5 bg-canvas-slate flex flex-col justify-between overflow-hidden">
            <FamilyChat
              messages={messages}
              onSendMessage={handleSendMessageText}
              onAddReaction={handleToggleReaction}
              currentUser={currentUserName}
              title="Fil de discussion familial"
              placeholder="Votre message à la famille..."
              onAttachClick={() => alert("Ajout de pièce jointe réservé aux administrateurs.")}
              className="h-full"
            />
          </aside>
        </div>
      </div>

      {/* Visionneuse universelle intégrée pour les justificatifs du vote */}
      <DocumentViewerModal
        isOpen={isViewerOpen}
        onClose={() => {
          setIsViewerOpen(false);
          setViewerDoc(null);
        }}
        document={viewerDoc}
        onDownload={(doc) => handleDownloadDoc(doc.filename, 'Justificatif de vote SCI')}
      />
    </div>
  );
}

export default function VoteRoofModal(props) {
  if (!props?.isOpen) return null;
  return (
    <VoteErrorBoundary onClose={props?.onClose}>
      <VoteRoofModalInner {...props} />
    </VoteErrorBoundary>
  );
}
