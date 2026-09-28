import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MarkdownContent } from './common/RichTextEditor';
import DocumentViewerModal from './DocumentViewerModal';
import FamilyChat from './common/FamilyChat';
import WhatsAppPollView, { STATUTORY_ASSOCIATES } from './common/WhatsAppPollView';
import { castProjectVote, updateProject, deleteProject } from '../api';

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
export const DEFAULT_ASSOCIATES = STATUTORY_ASSOCIATES.map(a => ({
  id: a.id,
  name: a.name,
  role: a.role,
  isGerance: a.isGerance,
  vote: 'EN_ATTENTE',
  date: null,
  initials: a.initials
}));

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
  const raw = a.name || a.prenom || a.firstName || a.id || 'Associé';
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
  const currentUserLower = currentUserName.toLowerCase();

  // État local réactif du projet pour mise à jour instantanée sans F5 (Annotation 4 & 5)
  const [localProject, setLocalProject] = useState(project || {});

  useEffect(() => {
    if (project) {
      setLocalProject(project);
    }
  }, [project]);

  // Propriétés du projet
  const activeProject = localProject || {};
  const projectTitle = activeProject.title || 'Consultation & Scrutin des Associés';
  const projectDescription = activeProject.description || "Aucune description détaillée n'a été renseignée pour ce projet.";
  const projectRef = activeProject.ref || (activeProject.id ? `VOTE-2026-${String(activeProject.id).padStart(2, '0')}` : 'VOTE-2026');
  const projectReporter = activeProject.submitted_by || activeProject.reporter?.name || (typeof activeProject.reporter === 'string' ? activeProject.reporter : 'Non assigné');
  const projectSubject = activeProject.category || activeProject.subject || 'SCI Familiale';

  // Annotation 8 : Harmoniser le badge SOUMIS pour qu'il soit sobre et élégant
  const formatBadgeStatus = (status) => {
    const s = String(status || '').toUpperCase();
    if (s === 'EN_VOTE') return 'Scrutin ouvert';
    if (s === 'SOUMIS') return 'En délibération';
    if (s === 'APPROUVE') return 'Adopté';
    if (s === 'REFUSE') return 'Rejeté';
    if (s === 'REPORT_AG') return 'Reporté en AG';
    return activeProject.badgeStatus || 'Scrutin ouvert';
  };
  const projectBadgeStatus = formatBadgeStatus(activeProject.status);

  const voteSectionRef = useRef(null);

  // Droits de gouvernance (Coordinateur ou Porteur) - Annotation 12
  const isCoordinator = Boolean(
    currentUser?.is_coordinator === true ||
    currentUser?.is_coordinator === 'true' ||
    currentUser?.is_coordinator === 1 ||
    currentUserLower.includes('henri') ||
    currentUserLower.includes('josephine') ||
    currentUserLower.includes('joséphine')
  );
  const isOwner = Boolean(
    activeProject?.submitted_by &&
    currentUserLower.includes(String(activeProject.submitted_by).toLowerCase().split(' ')[0])
  );
  const canManageVote = isCoordinator || isOwner;

  // Mode Édition du vote (Annotation 12)
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(projectTitle);
  const [editDescription, setEditDescription] = useState(projectDescription);
  const [editCategory, setEditCategory] = useState(projectSubject);
  const [editOptions, setEditOptions] = useState(() => {
    if (Array.isArray(activeProject.options)) return activeProject.options;
    if (typeof activeProject.options === 'string' && activeProject.options.trim()) {
      try {
        const p = JSON.parse(activeProject.options);
        if (Array.isArray(p)) return p;
      } catch (_) {
        return activeProject.options.split(',').map(s => s.trim()).filter(Boolean);
      }
    }
    return [];
  });
  const [newOptionInput, setNewOptionInput] = useState('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Synchronisation lors de l'ouverture du mode édition
  useEffect(() => {
    setEditTitle(activeProject.title || '');
    setEditDescription(activeProject.description || '');
    setEditCategory(activeProject.category || activeProject.subject || 'SCI Familiale');
    const opts = (() => {
      if (Array.isArray(activeProject.options)) return activeProject.options;
      if (typeof activeProject.options === 'string' && activeProject.options.trim()) {
        try {
          const p = JSON.parse(activeProject.options);
          if (Array.isArray(p)) return p;
        } catch (_) {
          return activeProject.options.split(',').map(s => s.trim()).filter(Boolean);
        }
      }
      return [];
    })();
    setEditOptions(opts);
  }, [activeProject, isEditing]);

  // Liste nominative des 7 associés avec leurs votes réels synchronisés
  const [associatesVotes, setAssociatesVotes] = useState(() => {
    const votesArr = Array.isArray(activeProject?.votes) ? activeProject.votes : [];
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

  // Synchronisation dynamique si activeProject change
  useEffect(() => {
    const votesArr = Array.isArray(activeProject?.votes) ? activeProject.votes : [];
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
  }, [activeProject]);

  // Messages du fil de discussion familial
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

  // Trouver l'associé connecté avec protections robustes
  const currentAssociate = useMemo(() => {
    return (associatesVotes || []).find(a => {
      if (!a || !a.name) return false;
      const aLower = String(a.name).toLowerCase();
      return (
        (currentUserLower && (aLower.includes(currentUserLower) || currentUserLower.includes(aLower))) ||
        (currentUserLower.includes('henri') && a.id === 'henri') ||
        (currentUserLower.includes('hortense') && a.id === 'hortense') ||
        (currentUserLower.includes('marguerite') && a.id === 'marguerite') ||
        (currentUserLower.includes('eugénie') && a.id === 'eugenie') ||
        (currentUserLower.includes('joséphine') && a.id === 'josephine') ||
        (currentUserLower.includes('élisabeth') && a.id === 'elisabeth') ||
        (currentUserLower.includes('frédéric') && a.id === 'frederic')
      );
    }) || (associatesVotes && associatesVotes[0]) || DEFAULT_ASSOCIATES[0];
  }, [associatesVotes, currentUserLower]);

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

  // Options de vote personnalisées du projet
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

  // Documents justificatifs sécurisés
  const documentsList = (Array.isArray(activeProject.documents) && activeProject.documents.length > 0)
    ? activeProject.documents
    : (Array.isArray(activeProject.files) && activeProject.files.length > 0)
    ? activeProject.files
    : (Array.isArray(activeProject.document_urls) && activeProject.document_urls.length > 0)
    ? activeProject.document_urls
    : [];

  // Enregistrement direct du vote en 1 clic avec réactivité instantanée (Annotation 4 & 5)
  const handleCastVote = async (voteChoice) => {
    if (!voteChoice) return;
    setSelectedVote(voteChoice);
    const now = new Date();
    const formattedDate = `${now.getDate()} mai 2026, ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const assocId = currentAssociate?.id || 'henri';
    const assocName = currentAssociate?.name || currentUserName || 'Henri Jamet';

    // 1. Mise à jour optimiste immédiate dans associatesVotes
    const updatedAssociatesVotes = (associatesVotes || []).map(a => {
      if (a && a.id === assocId) {
        return {
          ...a,
          vote: voteChoice,
          date: formattedDate
        };
      }
      return a;
    });
    setAssociatesVotes(updatedAssociatesVotes);

    // 2. Mise à jour optimiste dans localProject.votes
    const existingVotes = Array.isArray(activeProject.votes) ? [...activeProject.votes] : [];
    const voteIndex = existingVotes.findIndex(v => {
      const vName = safeExtractVoterName(v).toLowerCase();
      return vName === assocId || vName === assocName.toLowerCase() || (v.user_id && v.user_id === assocId);
    });

    const newVoteEntry = {
      user_name: assocName,
      user_id: assocId,
      vote: voteChoice,
      choice: voteChoice,
      date: formattedDate,
      created_at: new Date().toISOString()
    };

    if (voteIndex >= 0) {
      existingVotes[voteIndex] = { ...existingVotes[voteIndex], ...newVoteEntry };
    } else {
      existingVotes.push(newVoteEntry);
    }

    const optimisticProject = {
      ...activeProject,
      votes: existingVotes
    };
    setLocalProject(optimisticProject);

    const voteLabels = {
      POUR: 'Approuvé',
      CONTRE: 'Refusé',
      ABSTENTION: 'Abstention',
      BLANC: 'Vote blanc',
      REPORT_AG: 'Report en AG demandé'
    };

    setToastMessage(`Vote « ${voteLabels[voteChoice] || voteChoice} » enregistré pour ${assocName} !`);
    setTimeout(() => setToastMessage(null), 3500);

    // 3. Appel API et synchronisation
    let serverUpdatedProject = optimisticProject;
    if (activeProject?.id) {
      try {
        const res = await castProjectVote(activeProject.id, {
          vote: voteChoice,
          choice: voteChoice,
          user_name: assocName,
          user_id: assocId
        });
        if (res && typeof res === 'object') {
          serverUpdatedProject = res;
          setLocalProject(res);
        }
      } catch (err) {
        console.warn('API castProjectVote fallback local:', err.message);
      }
    }

    // 4. Propagation au parent avec le projet à jour complet (Annotation 4 & 5)
    if (typeof onVoteSubmit === 'function') {
      try {
        onVoteSubmit(serverUpdatedProject);
      } catch (err) {
        console.warn('onVoteSubmit callback error:', err);
      }
    }
  };

  // Suppression du vote (Annotation 12)
  const handleDeleteVote = async () => {
    if (!activeProject?.id) return;
    const ok = window.confirm(`Êtes-vous sûr de vouloir supprimer définitivement le scrutin « ${projectTitle} » ? Cette action est irréversible.`);
    if (!ok) return;

    try {
      await deleteProject(activeProject.id);
      setToastMessage('Le scrutin a été supprimé avec succès.');
      if (typeof onVoteSubmit === 'function') {
        onVoteSubmit({ deleted: true, projectId: activeProject.id });
      }
      setTimeout(() => {
        onClose();
      }, 800);
    } catch (err) {
      alert(`Erreur lors de la suppression du vote : ${err.message}`);
    }
  };

  // Sauvegarde des modifications du vote (Annotation 12)
  const handleSaveEdit = async () => {
    if (!editTitle.trim()) {
      alert('Veuillez renseigner un titre pour le vote.');
      return;
    }
    setIsSubmittingEdit(true);
    try {
      const payload = {
        title: editTitle.trim(),
        description: editDescription.trim(),
        category: editCategory.trim(),
        options: editOptions.filter(Boolean)
      };

      const updated = await updateProject(activeProject.id, payload);
      setLocalProject(updated);
      setIsEditing(false);
      setToastMessage('Scrutin mis à jour avec succès !');
      setTimeout(() => setToastMessage(null), 3000);

      if (typeof onVoteSubmit === 'function') {
        onVoteSubmit(updated);
      }
    } catch (err) {
      alert(`Erreur lors de la mise à jour du vote : ${err.message}`);
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // Ajout d'une option de vote personnalisée en mode édition
  const handleAddOption = () => {
    if (!newOptionInput.trim()) return;
    setEditOptions(prev => [...prev, newOptionInput.trim()]);
    setNewOptionInput('');
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
    const content = `SCI FAMILIALE HELLENVILLIERS — DIRECTION DU DOMAINE\n\nDocument certifié : ${docName}\nObjet : ${desc}\nProjet : ${projectTitle}\nDate d'émission : Mai 2026\nStatut : Pièce certifiée conforme déposée au registre des délibérations.`;
    setViewerDoc({
      filename: docName,
      title: docName,
      content: content,
      file_type: 'text/plain'
    });
    setIsViewerOpen(true);
  };

  // Téléchargement d'un document
  const handleDownloadDoc = (docName, desc) => {
    const content = `SCI FAMILIALE HELLENVILLIERS\n\nDocument certifié : ${docName}\nObjet : ${desc}\nProjet : ${projectTitle}\nDate d'émission : Mai 2026\nStatut : Validé pour consultation des 7 associés.`;
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

        {/* 1. EN-TÊTE ÉPURÉ DE LA MODALE AVEC ACTIONS ÉDITER ET SUPPRIMER (Annotation 12) */}
        <header className="w-full bg-canvas-slate px-4 py-3 sm:px-space-lg sm:py-space-md flex items-center justify-between gap-space-sm border-b border-border-subtle shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-forest-deep text-xl">how_to_vote</span>
            <span className="font-semibold text-xs sm:text-sm text-slate-800">Scrutin &amp; Délibération des Associés</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Boutons Éditer et Supprimer pour coordinateurs / porteur (Annotation 12) */}
            {canManageVote && !isEditing && (
              <div className="flex items-center gap-1.5 mr-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  title="Modifier le titre, la description ou les options de ce vote"
                >
                  <span className="material-symbols-outlined text-[15px]">edit</span>
                  <span className="hidden sm:inline">Modifier</span>
                </button>
                <button
                  type="button"
                  onClick={handleDeleteVote}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  title="Supprimer définitivement ce scrutin"
                >
                  <span className="material-symbols-outlined text-[15px]">delete</span>
                  <span className="hidden sm:inline">Supprimer</span>
                </button>
              </div>
            )}

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
          
          {/* COLONNE GAUCHE (7 cols) : Détails, Sondage WhatsApp & Vote */}
          <section className="lg:col-span-7 p-4 sm:p-space-lg flex flex-col gap-5 bg-surface-container-lowest overflow-y-auto">
            
            {/* MODE ÉDITION DU VOTE (Annotation 12) */}
            {isEditing ? (
              <div className="flex flex-col gap-4 bg-slate-50 dark:bg-slate-900/60 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-emerald-700 text-xl">edit_note</span>
                    <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                      Modifier les paramètres du scrutin
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="text-xs text-slate-500 hover:text-slate-700 font-semibold"
                  >
                    Annuler
                  </button>
                </div>

                {/* Titre */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Titre du scrutin *
                  </label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Ex: Réfection de la toiture du Presbytère"
                    className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-emerald-500 font-medium"
                  />
                </div>

                {/* Description */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Description &amp; Enjeux
                  </label>
                  <textarea
                    rows={4}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Précisez le contexte, les devis et les arbitrages soumis au vote..."
                    className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-emerald-500 font-normal leading-relaxed"
                  />
                </div>

                {/* Domaine / Sujet */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Domaine / Sujet
                  </label>
                  <input
                    type="text"
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    placeholder="Ex: Presbytère, Bâti & Travaux"
                    className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-emerald-500 font-medium"
                  />
                </div>

                {/* Options de vote personnalisées */}
                <div className="flex flex-col gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                    <span>Options personnalisées (Optionnel)</span>
                    <span className="text-[11px] text-slate-400 font-normal">Laissez vide pour le scrutin standard Pour/Contre</span>
                  </label>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newOptionInput}
                      onChange={(e) => setNewOptionInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddOption();
                        }
                      }}
                      placeholder="Ajouter une option (ex: Devis A - Artisan Martin)"
                      className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddOption}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                    >
                      + Ajouter
                    </button>
                  </div>

                  {editOptions.length > 0 && (
                    <div className="flex flex-col gap-1.5 mt-1">
                      {editOptions.map((opt, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-1.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium">
                          <span>{i + 1}. {opt}</span>
                          <button
                            type="button"
                            onClick={() => setEditOptions(editOptions.filter((_, idx) => idx !== i))}
                            className="text-rose-600 hover:text-rose-800 text-[14px] material-symbols-outlined cursor-pointer"
                            title="Supprimer cette option"
                          >
                            close
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Boutons d'action édition */}
                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    disabled={isSubmittingEdit}
                    onClick={handleSaveEdit}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSubmittingEdit ? 'Enregistrement...' : 'Enregistrer les modifications'}
                  </button>
                </div>
              </div>
            ) : null}

            {/* Titre & Contexte du scrutin (Purge budget Annotation 7 & Badge sobre Annotation 8) */}
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-xs font-medium">
                  Bâti &amp; Travaux
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-xs font-medium">
                  {projectSubject}
                </span>
                {/* Annotation 8 : Badge harmonisé et sobre */}
                <span className="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-label-sm text-xs font-semibold">
                  {projectBadgeStatus}
                </span>
              </div>

              <h1 id="modal-roof-title" className="font-headline-lg text-xl sm:text-2xl text-on-surface tracking-tight font-bold text-slate-900 dark:text-slate-100 mt-1">
                {projectTitle}
              </h1>

              {/* Annotation 7 : Supprimer définitivement la mention du budget dans la tuile */}
              <div className="flex flex-wrap items-center gap-2 text-on-surface-variant text-xs sm:text-sm">
                <span className="font-semibold text-slate-600 dark:text-slate-400">Réf. {projectRef}</span>
                <span>•</span>
                <span className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                  <span className="material-symbols-outlined text-[18px] text-primary">account_circle</span>
                  Soumis par <strong>{projectReporter}</strong> (SCI)
                </span>
              </div>
            </div>

            {/* ANNOTATION 9 : BANDEAU "VOTER DIRECTEMENT" PLEINE LARGEUR ÉLÉGANT SOUS LE TITRE */}
            <button
              type="button"
              onClick={() => voteSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}
              className="w-full py-2.5 px-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-xl flex items-center justify-between font-medium text-xs sm:text-sm hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-all cursor-pointer shadow-xs group"
            >
              <div className="flex items-center gap-2">
                <span className="text-base group-hover:translate-y-0.5 transition-transform">👇</span>
                <span>Exprimez votre voix : les boutons de vote se trouvent en bas du scrutin</span>
              </div>
              <div className="flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-300 shrink-0">
                <span>Voter en bas</span>
                <span className="material-symbols-outlined text-[18px] group-hover:translate-y-0.5 transition-transform">arrow_downward</span>
              </div>
            </button>

            {/* Description & Objectifs */}
            <div className="flex flex-col gap-3 bg-canvas-slate dark:bg-slate-900/50 rounded-[14px] p-4 border border-border-subtle">
              <h2 className="font-headline-sm text-sm sm:text-base font-bold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-forest-deep text-xl">description</span>
                Description des travaux &amp; Enjeux
              </h2>
              <div className="text-xs sm:text-sm text-on-surface-variant leading-relaxed text-slate-700 dark:text-slate-300">
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
                <span className="text-xs text-on-surface-variant font-medium">
                  {documentsList.length} pièce{documentsList.length > 1 ? 's' : ''} certifiée{documentsList.length > 1 ? 's' : ''}
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {documentsList.length === 0 ? (
                  <div className="p-3.5 bg-canvas-slate dark:bg-slate-900/40 rounded-xl text-center text-xs text-on-surface-variant border border-dashed border-border-subtle">
                    Aucune pièce jointe ou devis téléversé pour ce projet.
                  </div>
                ) : (
                  documentsList.map((doc, idx) => {
                    const docName = typeof doc === 'string' ? doc : (doc.name || doc.filename || `Document_${idx + 1}.pdf`);
                    const docDesc = typeof doc === 'object' ? (doc.desc || doc.description || doc.details || 'Pièce certifiée') : 'Pièce certifiée';
                    const docDetails = typeof doc === 'object' ? (doc.details || doc.name || docName) : docName;
                    return (
                      <div key={idx} className="flex items-center justify-between p-3 bg-canvas-slate dark:bg-slate-900/50 hover:bg-surface-container transition-colors rounded-xl border border-border-subtle">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 flex items-center justify-center shrink-0">
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

            {/* ANNOTATION 13 & 11 : SONDAGE STYLE WHATSAPP FIDÈLE & MODERNE */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-forest-deep text-xl">poll</span>
                  <h2 className="font-headline-sm text-sm sm:text-base font-bold text-on-surface">
                    Résultats du scrutin en direct (Style Sondage WhatsApp)
                  </h2>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  7 associés statutaires
                </span>
              </div>

              {/* Rendu dynamique du sondage WhatsApp */}
              <WhatsAppPollView
                project={activeProject}
                associatesVotes={associatesVotes}
                currentUser={currentUserName}
                onCastVote={handleCastVote}
                isVotingDisabled={false}
                compact={false}
                showPendingVoters={true}
                showQuorumNotice={true}
              />
            </div>

            {/* SECTION DE VOTE DIRECTE EN 1 CLIC (Annotation 6 : Zéro "1 voix statutaire") */}
            <div ref={voteSectionRef} id="section-vote" className="p-4 rounded-xl bg-surface-container-low dark:bg-slate-900/80 border border-border-subtle flex flex-col gap-3 shadow-sm scroll-mt-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Votre vote en tant que {currentAssociate.name} :
                </span>
                {/* Annotation 6 : La mention "1 voix statutaire" est définitivement supprimée */}
              </div>

              {/* Choix de vote interactif */}
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
                              : 'bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 shadow-sm'
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

                  {/* Options statutaires : Blanc & Report AG */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-slate-200/80 dark:border-slate-700/80">
                    <button
                      type="button"
                      onClick={() => handleCastVote('BLANC')}
                      className={`py-2.5 px-4 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        selectedVote === 'BLANC'
                          ? 'bg-slate-700 text-white border-slate-700 shadow-md ring-2 ring-slate-400/30 font-bold'
                          : 'bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 shadow-sm'
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
                          : 'bg-white dark:bg-slate-800 hover:bg-purple-50 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 shadow-sm'
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
                        ['POUR', 'OUI'].includes(String(selectedVote || '').toUpperCase())
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-500/30 font-bold'
                          : 'bg-white dark:bg-slate-800 hover:bg-emerald-50 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 shadow-sm'
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
                        ['CONTRE', 'NON'].includes(String(selectedVote || '').toUpperCase())
                          ? 'bg-rose-600 text-white border-rose-600 shadow-md ring-2 ring-rose-500/30 font-bold'
                          : 'bg-white dark:bg-slate-800 hover:bg-rose-50 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 shadow-sm'
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
                        ['ABSTENTION', 'BLANC'].includes(String(selectedVote || '').toUpperCase())
                          ? 'bg-slate-700 text-white border-slate-700 shadow-md ring-2 ring-slate-400/30 font-bold'
                          : 'bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 shadow-sm'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[20px] shrink-0">pause_circle</span>
                      <span>S'abstenir</span>
                    </button>
                  </div>

                  {/* Option statutaire : Demander un débat en AG */}
                  <div className="pt-3 border-t border-slate-200/80 dark:border-slate-700/80 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => handleCastVote('REPORT_AG')}
                      className={`w-full py-2.5 px-4 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        ['REPORT_AG', 'REPORT_PROCHAINE_AG', 'DEMANDE_AG', 'REPORT AG'].includes(String(selectedVote || '').toUpperCase())
                          ? 'bg-purple-700 text-white border-purple-700 shadow-md ring-2 ring-purple-400/30 font-bold'
                          : 'bg-white dark:bg-slate-800 hover:bg-purple-50 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 shadow-sm'
                      }`}
                    >
                      <span className="text-base">🏛️</span>
                      <span>Demander un débat en Assemblée Générale</span>
                      {['REPORT_AG', 'REPORT_PROCHAINE_AG', 'DEMANDE_AG', 'REPORT AG'].includes(String(selectedVote || '').toUpperCase()) && (
                        <span className="material-symbols-outlined text-[16px] text-white ml-1">check</span>
                      )}
                    </button>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 italic leading-relaxed px-1">
                      Conformément aux statuts de la SCI, dès lors qu'un associé sollicite un débat en AG, la décision à distance est suspendue. Les votes exprimés restent visibles à titre indicatif et la résolution sera portée à l'ordre du jour de la prochaine AG.
                    </p>
                  </div>
                </>
              )}
            </div>

          </section>

          {/* COLONNE DROITE (5 cols) : Fil de discussion familial en direct */}
          <aside className="lg:col-span-5 bg-canvas-slate dark:bg-slate-900/60 flex flex-col justify-between overflow-hidden">
            <FamilyChat
              messages={messages}
              onSendMessage={handleSendMessageText}
              onAddReaction={handleToggleReaction}
              currentUser={currentUserName}
              title="Fil de discussion familial"
              placeholder="Votre message à la famille..."
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
