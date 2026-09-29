import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MarkdownContent } from './common/RichTextEditor';
import DocumentViewerModal from './DocumentViewerModal';
import UploadDocumentModal from './UploadDocumentModal';
import SelectExistingDocumentModal from './SelectExistingDocumentModal';
import ExternalLinksSection from './common/ExternalLinksSection';
import FamilyChat from './common/FamilyChat';
import WhatsAppPollView, { STATUTORY_ASSOCIATES, parseVotesArray, hasVotedForOption } from './common/WhatsAppPollView';
import { castProjectVote, createProject, updateProject, deleteProject, attachDocumentsToProject } from '../api';

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

// Extraction sécurisée du nom de votant
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

// Extraction sécurisée du choix de vote
export const safeExtractVoteChoice = (v) => {
  if (!v) return '';
  const raw = v.vote ?? v.choice ?? v.value ?? (typeof v === 'string' ? v : '');
  return String(raw || '').trim();
};

// Résolution universelle du titre et de l'URL d'un document (Annotation 6 : Zéro chemin bizarre)
export const resolveDocumentInfo = (doc, project = null) => {
  if (!doc) return { title: 'Document justificatif.pdf', filename: 'Document justificatif.pdf', url: '', file_type: 'application/pdf', isPdf: true, isImage: false };

  let rawUrl = '';
  let rawTitle = '';
  let fileType = '';

  if (typeof doc === 'string') {
    rawUrl = doc;
    const parts = doc.split('/');
    rawTitle = decodeURIComponent(parts[parts.length - 1] || doc);
  } else if (typeof doc === 'object' && doc !== null) {
    rawUrl = doc.url || doc.file_url || (doc.id ? `/api/documents/${doc.id}/download` : '');
    rawTitle = doc.title || doc.name || doc.filename || doc.file_name || doc.original_filename || '';
    fileType = doc.file_type || doc.mime_type || '';
  }

  let cleanTitle = rawTitle;
  if (cleanTitle.includes('/')) {
    cleanTitle = cleanTitle.split('/').pop();
  }

  // Nettoyage si le titre est "download" ou juste un ID numérique d'API
  if (cleanTitle.toLowerCase() === 'download' || /^\d+$/.test(cleanTitle)) {
    if (doc?.title && doc.title.toLowerCase() !== 'download') {
      cleanTitle = doc.title;
    } else {
      cleanTitle = project?.title ? `Document - ${project.title}.pdf` : 'Document justificatif.pdf';
    }
  }

  // Suppression du préfixe UUID (32 caractères hexadécimaux + underscore)
  const uuidMatch = cleanTitle.match(/^[0-9a-fA-F]{32}_(.*)$/);
  if (uuidMatch && uuidMatch[1]) {
    cleanTitle = uuidMatch[1];
  }

  if (!cleanTitle || cleanTitle.trim() === '') {
    cleanTitle = 'Document justificatif.pdf';
  }

  const ext = (cleanTitle.split('.').pop() || '').toLowerCase();
  const isPdf = ext === 'pdf' || fileType.includes('pdf') || (!fileType && !cleanTitle.includes('.'));
  const isImg = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext) || fileType.startsWith('image/');

  return {
    title: cleanTitle,
    filename: cleanTitle,
    url: rawUrl,
    isPdf,
    isImage: isImg,
    file_type: isPdf ? 'application/pdf' : (isImg ? `image/${ext}` : 'application/octet-stream')
  };
};

function VoteRoofModalInner({
  isOpen,
  onClose,
  currentUser = 'Henri Jamet',
  onVoteSubmit,
  project,
  initialEditing = false,
}) {
  const currentUserName = resolveUserName(currentUser);
  const currentUserLower = currentUserName.toLowerCase();

  const isNewProject = Boolean(project?.isNew || !project?.id);

  // État local réactif du projet pour mise à jour instantanée sans F5
  const [localProject, setLocalProject] = useState(project || {});

  // Mode Édition du vote (initialisé à true si nouveau projet ou initialEditing)
  const [isEditing, setIsEditing] = useState(() => Boolean(initialEditing || project?.isNew || !project?.id));

  // Refs de verrouillage optimiste pour éliminer tout rollback transitoire (Annotation 3)
  const isSubmittingVoteRef = useRef(false);
  const optimisticVoteRef = useRef(null);

  useEffect(() => {
    if (project) {
      if (isSubmittingVoteRef.current && optimisticVoteRef.current) {
        const { assocId, votePayload, formattedDate } = optimisticVoteRef.current;
        const votes = Array.isArray(project.votes) ? [...project.votes] : [];
        const hasVoted = votes.some(v => safeExtractVoterName(v).toLowerCase() === assocId.toLowerCase());
        if (!hasVoted) {
          votes.push({
            user_name: currentUserName,
            user_id: assocId,
            vote: votePayload,
            choice: votePayload,
            date: formattedDate,
            created_at: new Date().toISOString()
          });
        }
        setLocalProject({ ...project, votes });
      } else {
        setLocalProject(project);
      }
      if (project.isNew || !project.id || initialEditing) {
        setIsEditing(true);
      }
    }
  }, [project, initialEditing, currentUserName]);

  // Propriétés du projet
  const activeProject = localProject || {};
  const projectTitle = activeProject.title || (isNewProject ? '' : 'Consultation & Scrutin des Associés');
  const projectDescription = activeProject.description || (isNewProject ? '' : "Aucune description détaillée n'a été renseignée pour ce projet.");
  const projectRef = activeProject.ref || (activeProject.id ? `VOTE-2026-${String(activeProject.id).padStart(2, '0')}` : 'NOUVEAU VOTE');
  const projectReporter = activeProject.submitted_by || activeProject.reporter?.name || (typeof activeProject.reporter === 'string' ? activeProject.reporter : currentUserName);
  const projectSubject = activeProject.category || activeProject.subject || 'Presbytère';

  // Badge de statut harmonisé et sobre
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

  // Ref vers la section de vote pour défilement fluide
  const voteSectionRef = useRef(null);

  // Droits de gouvernance (Coordinateur ou Porteur)
  const isCoordinator = Boolean(
    currentUser?.is_coordinator === true ||
    currentUser?.is_coordinator === 'true' ||
    currentUser?.is_coordinator === 1 ||
    currentUserLower.includes('henri') ||
    currentUserLower.includes('josephine') ||
    currentUserLower.includes('joséphine')
  );
  const isOwner = Boolean(
    (activeProject?.submitted_by &&
      currentUserLower.includes(String(activeProject.submitted_by).toLowerCase().split(' ')[0])) ||
    (activeProject?.created_by &&
      (String(activeProject.created_by).toLowerCase() === currentUserLower ||
       currentUserLower.includes(String(activeProject.created_by).toLowerCase())))
  );
  const canManageVote = isCoordinator || isOwner || currentUserLower === 'henri jamet';

  const [editTitle, setEditTitle] = useState(projectTitle);
  const [editDescription, setEditDescription] = useState(projectDescription);
  const [editCategory, setEditCategory] = useState(projectSubject);
  const [editOptions, setEditOptions] = useState(() => {
    if (Array.isArray(activeProject.options) && activeProject.options.length > 0) return activeProject.options;
    if (typeof activeProject.options === 'string' && activeProject.options.trim()) {
      try {
        const p = JSON.parse(activeProject.options);
        if (Array.isArray(p)) return p;
      } catch (_) {
        return activeProject.options.split(',').map(s => s.trim()).filter(Boolean);
      }
    }
    return ['Approuver le projet', 'Rejeter le projet'];
  });
  // Annotation 11 : Toggle choix multiples
  const [editAllowMultipleChoices, setEditAllowMultipleChoices] = useState(Boolean(activeProject.allow_multiple_choices));
  const [newOptionInput, setNewOptionInput] = useState('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Annotation 4 & 6 : Gestion des documents en mode édition / création
  const [editDocuments, setEditDocuments] = useState([]);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isSelectExistingDocModalOpen, setIsSelectExistingDocModalOpen] = useState(false);

  // Liens web et sources externes en mode édition
  const [editExternalLinks, setEditExternalLinks] = useState(() => activeProject?.external_links || []);

  // Synchronisation lors de l'ouverture du mode édition
  useEffect(() => {
    setEditTitle(activeProject.title || '');
    setEditDescription(activeProject.description || '');
    setEditCategory(activeProject.category || activeProject.subject || 'Presbytère');
    setEditExternalLinks(activeProject?.external_links || []);
    const opts = (() => {
      if (Array.isArray(activeProject.options) && activeProject.options.length > 0) return activeProject.options;
      if (typeof activeProject.options === 'string' && activeProject.options.trim()) {
        try {
          const p = JSON.parse(activeProject.options);
          if (Array.isArray(p)) return p;
        } catch (_) {
          return activeProject.options.split(',').map(s => s.trim()).filter(Boolean);
        }
      }
      return ['Approuver le projet', 'Rejeter le projet'];
    })();
    setEditOptions(opts);
    setEditAllowMultipleChoices(Boolean(activeProject.allow_multiple_choices));

    // Initialisation de la liste des documents éditables
    const list = [];
    const seen = new Set();
    const addDoc = (d) => {
      if (!d) return;
      const key = typeof d === 'string' ? d : (d.url || d.file_url || d.filename || d.title || JSON.stringify(d));
      if (seen.has(key)) return;
      seen.add(key);
      list.push(d);
    };
    if (Array.isArray(activeProject.documents)) activeProject.documents.forEach(addDoc);
    if (Array.isArray(activeProject.files)) activeProject.files.forEach(addDoc);
    if (Array.isArray(activeProject.document_urls)) activeProject.document_urls.forEach(addDoc);
    if (activeProject.devis_url) addDoc({ url: activeProject.devis_url, title: `Devis Prestataire - ${activeProject.title || 'Projet'}.pdf` });
    setEditDocuments(list);
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

  // Synchronisation dynamique si activeProject change avec protection optimiste
  useEffect(() => {
    const votesArr = Array.isArray(activeProject?.votes) ? activeProject.votes : [];
    setAssociatesVotes(DEFAULT_ASSOCIATES.map(assoc => {
      const assocNameLower = String(assoc.name || '').toLowerCase();
      const assocIdLower = String(assoc.id || '').toLowerCase();

      // Si nous sommes en cours de vote optimiste pour cet associé, préserver son choix
      if (isSubmittingVoteRef.current && optimisticVoteRef.current && optimisticVoteRef.current.assocId === assoc.id) {
        return {
          ...assoc,
          vote: optimisticVoteRef.current.votePayload,
          date: optimisticVoteRef.current.formattedDate
        };
      }

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

  // Toast de notification
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

  // Visionneuse universelle intégrée (Annotation 6)
  const [viewerDoc, setViewerDoc] = useState(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  if (!isOpen) return null;

  // Documents justificatifs rattachés dédupliqués
  const documentsList = useMemo(() => {
    const list = [];
    const seen = new Set();

    const addDoc = (d) => {
      if (!d) return;
      const key = typeof d === 'string' ? d : (d.url || d.file_url || d.filename || d.title || JSON.stringify(d));
      if (seen.has(key)) return;
      seen.add(key);
      list.push(d);
    };

    if (Array.isArray(activeProject.documents)) activeProject.documents.forEach(addDoc);
    if (Array.isArray(activeProject.files)) activeProject.files.forEach(addDoc);
    if (Array.isArray(activeProject.document_urls)) activeProject.document_urls.forEach(addDoc);
    if (activeProject.devis_url) addDoc({ url: activeProject.devis_url, title: `Devis Prestataire - ${projectTitle}.pdf` });

    return list;
  }, [activeProject.documents, activeProject.files, activeProject.document_urls, activeProject.devis_url, projectTitle]);

  // Annotation 4 : Détacher un document de la liste en mode édition / création
  const handleDetachDocument = (indexToRemove) => {
    setEditDocuments(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // Annotation 4 : Succès du téléversement d'un document justificatif
  const handleUploadSuccess = (newDoc) => {
    if (!newDoc) return;
    setEditDocuments(prev => [...prev, newDoc]);
    setIsUploadModalOpen(false);
    setToastMessage('Document rattaché avec succès !');
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Annotation 6 : Association de documents existants de la bibliothèque SCI
  const handleAttachExistingDocs = (attachedDocs) => {
    if (!Array.isArray(attachedDocs) || attachedDocs.length === 0) return;
    const newItems = attachedDocs.map((doc) => ({
      id: doc.id,
      title: doc.title || doc.name || doc.filename,
      filename: doc.filename || doc.file_name || doc.title,
      file_url: doc.file_url || doc.url || `/api/documents/${doc.id}/download`,
      url: doc.file_url || doc.url || `/api/documents/${doc.id}/download`,
      file_type: doc.file_type || doc.mime_type || ((doc.filename || '').toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream')
    }));

    setEditDocuments(prev => [...prev, ...newItems]);
    const currentDocs = Array.isArray(localProject.documents) ? localProject.documents : [];
    const mergedDocs = [...currentDocs, ...newItems];
    const updatedLocal = { ...localProject, documents: mergedDocs };
    setLocalProject(updatedLocal);
    if (typeof onVoteSubmit === 'function') {
      onVoteSubmit(updatedLocal);
    }
    setToastMessage(`${newItems.length} document(s) associé(s) avec succès !`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Enregistrement direct du vote (Annotation 3 & 11 : support choix unique et multiple, zéro lag)
  const handleCastVote = async (voteChoice) => {
    if (!voteChoice && voteChoice !== '') return;
    const now = new Date();
    const formattedDate = `${now.getDate()} mai 2026, ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const assocId = currentAssociate?.id || 'henri';
    const assocName = currentAssociate?.name || currentUserName || 'Henri Jamet';

    const votePayload = Array.isArray(voteChoice) ? JSON.stringify(voteChoice) : String(voteChoice);

    // Verrouillage optimiste anti-rollback transitoire
    isSubmittingVoteRef.current = true;
    optimisticVoteRef.current = { assocId, votePayload, formattedDate };

    // 1. Mise à jour optimiste immédiate dans associatesVotes
    const updatedAssociatesVotes = (associatesVotes || []).map(a => {
      if (a && a.id === assocId) {
        return {
          ...a,
          vote: votePayload,
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
      vote: votePayload,
      choice: votePayload,
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

    // Propagation synchrone immédiate au parent AVANT le await (Annotation 3)
    if (typeof onVoteSubmit === 'function') {
      try {
        onVoteSubmit(optimisticProject);
      } catch (err) {
        console.warn('onVoteSubmit callback error:', err);
      }
    }

    const voteLabels = {
      POUR: 'Approuvé',
      CONTRE: 'Refusé',
      ABSTENTION: 'Abstention',
      BLANC: 'Vote blanc',
      REPORT_AG: 'Report en AG demandé'
    };

    if (Array.isArray(voteChoice)) {
      setToastMessage(voteChoice.length > 0 ? `${voteChoice.length} option${voteChoice.length > 1 ? 's' : ''} sélectionnée${voteChoice.length > 1 ? 's' : ''} pour ${assocName} !` : `Sélection réinitialisée pour ${assocName}`);
    } else {
      setToastMessage(`Vote « ${voteLabels[voteChoice] || voteChoice} » enregistré pour ${assocName} !`);
    }
    setTimeout(() => setToastMessage(null), 3500);

    // 3. Appel API et synchronisation
    let serverUpdatedProject = optimisticProject;
    if (activeProject?.id) {
      try {
        const res = await castProjectVote(activeProject.id, {
          vote: votePayload,
          choice: votePayload,
          user_name: assocName,
          user_id: assocId
        });
        if (res && typeof res === 'object') {
          serverUpdatedProject = res;
          setLocalProject(res);
          // Propagation au parent avec le résultat serveur
          if (typeof onVoteSubmit === 'function') {
            onVoteSubmit(res);
          }
        }
      } catch (err) {
        console.warn('API castProjectVote fallback local:', err.message);
      } finally {
        setTimeout(() => {
          isSubmittingVoteRef.current = false;
        }, 800);
      }
    } else {
      setTimeout(() => {
        isSubmittingVoteRef.current = false;
      }, 500);
    }
  };

  // Suppression du vote
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

  // Sauvegarde des modifications ou création du vote (Annotation 9 & 11)
  const handleSaveEdit = async () => {
    if (!editTitle.trim()) {
      alert('Veuillez renseigner un titre pour le scrutin.');
      return;
    }
    setIsSubmittingEdit(true);
    try {
      if (isNewProject) {
        const newPayload = {
          title: editTitle.trim(),
          description: editDescription.trim(),
          category: editCategory.trim() || 'Presbytère',
          status: 'EN_VOTE',
          property_id: 1,
          submitted_by: currentUserName,
          options: editOptions.filter(Boolean).length > 0 ? editOptions.filter(Boolean) : ['Approuver le projet', 'Rejeter le projet'],
          allow_multiple_choices: editAllowMultipleChoices,
          document_urls: editDocuments,
          external_links: editExternalLinks
        };
        const created = await createProject(newPayload);
        setLocalProject(created);
        setIsEditing(false);
        setToastMessage('Scrutin lancé avec succès !');
        setTimeout(() => setToastMessage(null), 3000);
        if (typeof onVoteSubmit === 'function') {
          onVoteSubmit(created);
        }
      } else {
        const payload = {
          title: editTitle.trim(),
          description: editDescription.trim(),
          category: editCategory.trim(),
          options: editOptions.filter(Boolean),
          allow_multiple_choices: editAllowMultipleChoices,
          document_urls: editDocuments,
          external_links: editExternalLinks
        };
        const updated = await updateProject(activeProject.id, payload);
        setLocalProject(updated);
        setIsEditing(false);
        setToastMessage('Scrutin mis à jour avec succès !');
        setTimeout(() => setToastMessage(null), 3000);
        if (typeof onVoteSubmit === 'function') {
          onVoteSubmit(updated);
        }
      }
    } catch (err) {
      alert(`Erreur lors de l'enregistrement du scrutin : ${err.message}`);
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

  // Consultation universelle dans DocumentViewerModal (Annotation 6)
  const handleViewDocument = (doc) => {
    const info = resolveDocumentInfo(doc, activeProject);
    setViewerDoc({
      title: info.title,
      filename: info.filename,
      file_url: info.url,
      url: info.url,
      file_type: info.file_type
    });
    setIsViewerOpen(true);
  };

  // Téléchargement authentique d'un document (Annotation 6)
  const handleDownloadDocument = (doc) => {
    const info = resolveDocumentInfo(doc, activeProject);
    const targetUrl = info.url;
    const targetName = info.filename;
    if (targetUrl) {
      const a = document.createElement('a');
      a.href = targetUrl;
      a.download = targetName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      alert("Le fichier lié n'a pas pu être localisé.");
    }
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

        {/* 1. EN-TÊTE ÉPURÉ DE LA MODALE AVEC ACTIONS ÉDITER ET SUPPRIMER */}
        <header className="w-full bg-canvas-slate px-4 py-3 sm:px-space-lg sm:py-space-md flex items-center justify-between gap-space-sm border-b border-border-subtle shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-forest-deep text-xl">how_to_vote</span>
            <span className="font-semibold text-xs sm:text-sm text-slate-800">
              {isNewProject ? 'Proposer une initiative au vote' : 'Scrutin & Délibération des Associés'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Boutons Éditer et Supprimer pour coordinateurs / porteur (scrutin existant uniquement) */}
            {!isNewProject && canManageVote && !isEditing && (
              <div className="flex items-center gap-1.5 mr-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  title="Modifier le titre, la description ou les options de ce vote"
                >
                  <span className="material-symbols-outlined text-[15px]">edit</span>
                  <span>Modifier</span>
                </button>
                <button
                  type="button"
                  onClick={handleDeleteVote}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  title="Supprimer définitivement ce scrutin"
                >
                  <span className="material-symbols-outlined text-[15px]">delete</span>
                  <span>Supprimer</span>
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
          
          {/* COLONNE GAUCHE (7 cols) */}
          <section className="lg:col-span-7 p-4 sm:p-space-lg flex flex-col gap-5 bg-surface-container-lowest overflow-y-auto">
            
            {/* ANNOTATION 9 & 10 : EN MODE CRÉATION OU MODIFICATION, FORMULAIRE DÉDIÉ */}
            {isEditing ? (
              <div className="flex flex-col gap-4 bg-slate-50 dark:bg-slate-900/60 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-emerald-700 text-xl">
                      {isNewProject ? 'add_circle' : 'edit_note'}
                    </span>
                    <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                      {isNewProject ? 'Proposer une nouvelle initiative au vote' : 'Modifier les paramètres du scrutin'}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (isNewProject) {
                        onClose();
                      } else {
                        setIsEditing(false);
                      }
                    }}
                    className="text-xs text-slate-500 hover:text-slate-700 font-semibold cursor-pointer"
                  >
                    Annuler
                  </button>
                </div>

                {/* ANNOTATION 6 : Bandeau d'alerte ambre si des bulletins ont déjà été exprimés */}
                {!isNewProject && Array.isArray(activeProject.votes) && activeProject.votes.length > 0 && (
                  <div className="flex items-start gap-3 p-3.5 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs">
                    <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-lg shrink-0 mt-0.5">warning</span>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-bold">Attention : {activeProject.votes.length} bulletin(s) ont déjà été exprimé(s)</span>
                      <span className="text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
                        Toute modification (titre, description, options de vote ou documents associés) réinitialisera l'ensemble des votes déjà enregistrés.
                      </span>
                    </div>
                  </div>
                )}

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

                {/* Description avec arrondi sobre rounded-lg (Annotation 9) */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Description &amp; Enjeux
                  </label>
                  <textarea
                    rows={4}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Précisez le contexte, les devis et les arbitrages soumis au vote..."
                    className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-emerald-500 font-normal leading-relaxed"
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

                {/* ANNOTATION 11 : Toggle choix unique vs choix multiples (comme WhatsApp) */}
                <div className="flex items-center justify-between p-3.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Autoriser plusieurs réponses
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={editAllowMultipleChoices}
                    onClick={() => setEditAllowMultipleChoices(!editAllowMultipleChoices)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      editAllowMultipleChoices ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        editAllowMultipleChoices ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Options de vote personnalisées */}
                <div className="flex flex-col gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Options du vote (au moins 2 options)
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
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer transition-colors"
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

                {/* ANNOTATION 4 & 6 : Gestion des pièces jointes en mode édition / création */}
                <div className="flex flex-col gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm text-forest-deep">attach_file</span>
                      <span>Documents justificatifs &amp; Devis ({editDocuments.length})</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsSelectExistingDocModalOpen(true)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                        title="Associer un document déjà présent dans la base documentaire"
                      >
                        <span className="material-symbols-outlined text-sm">search</span>
                        <span>Associer un document existant</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsUploadModalOpen(true)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 text-xs font-semibold hover:bg-emerald-100 transition-colors cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-sm">add</span>
                        <span>Ajouter un document</span>
                      </button>
                    </div>
                  </div>

                  {editDocuments.length === 0 ? (
                    <div className="p-3 bg-white dark:bg-slate-800 rounded-xl text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-300 dark:border-slate-700">
                      Aucun document rattaché. Cliquez sur « Ajouter un document » pour téléverser un devis ou une pièce justificative.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {editDocuments.map((doc, idx) => {
                        const docInfo = resolveDocumentInfo(doc, activeProject);
                        return (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="material-symbols-outlined text-rose-600 text-base shrink-0">
                                {docInfo.isImage ? 'image' : 'picture_as_pdf'}
                              </span>
                              <span className="font-medium text-slate-800 dark:text-slate-200 truncate" title={docInfo.title}>
                                {docInfo.title}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                              <button
                                type="button"
                                onClick={() => handleViewDocument(doc)}
                                className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200 text-[11px] font-semibold transition-colors cursor-pointer"
                                title="Visualiser le document"
                              >
                                Visualiser
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDetachDocument(idx)}
                                className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 text-[11px] font-semibold transition-colors cursor-pointer"
                                title="Détacher ce document"
                              >
                                Détacher
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Annotation 2 : Liens web & sources externes */}
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                  <ExternalLinksSection
                    links={editExternalLinks}
                    onChange={setEditExternalLinks}
                    isEditing={true}
                  />
                </div>

                {/* Boutons d'action édition / création */}
                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      if (isNewProject) {
                        onClose();
                      } else {
                        setIsEditing(false);
                      }
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold cursor-pointer transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    disabled={isSubmittingEdit}
                    onClick={handleSaveEdit}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSubmittingEdit ? 'Enregistrement...' : (isNewProject ? 'Lancer le scrutin' : 'Enregistrer les modifications')}
                  </button>
                </div>
              </div>
            ) : (
              /* MODE CONSULTATION & VOTE (Annotation 10 : masqué en mode édition) */
              <>
                {/* Titre & Contexte du scrutin */}
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-xs font-medium">
                      Bâti &amp; Travaux
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-xs font-medium">
                      {projectSubject}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-label-sm text-xs font-semibold">
                      {projectBadgeStatus}
                    </span>
                  </div>

                  <h1 id="modal-roof-title" className="font-headline-lg text-xl sm:text-2xl text-on-surface tracking-tight font-bold text-slate-900 dark:text-slate-100 mt-1">
                    {projectTitle}
                  </h1>

                  <div className="flex flex-wrap items-center gap-2 text-on-surface-variant text-xs sm:text-sm">
                    <span className="font-semibold text-slate-600 dark:text-slate-400">Réf. {projectRef}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                      <span className="material-symbols-outlined text-[18px] text-primary">account_circle</span>
                      {/* Annotation 5 : Zéro mention (SCI) résiduelle */}
                      Soumis par <strong>{projectReporter}</strong>
                    </span>
                  </div>
                </div>

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

                {/* ANNOTATION 7 : BOUTON "👇 Voter 👇" DÉPLACÉ SOUS LA DESCRIPTION */}
                <button
                  type="button"
                  onClick={() => voteSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}
                  className="w-full py-2.5 px-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-xl flex items-center justify-center font-bold text-xs sm:text-sm hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-all cursor-pointer shadow-xs gap-2"
                >
                  <span>👇 Voter 👇</span>
                </button>

                {/* Documents & Justificatifs rattachés (Annotation 6 : Vrais noms & visionneuse universelle) */}
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h2 className="font-headline-sm text-sm sm:text-base font-bold text-on-surface flex items-center gap-2">
                      <span className="material-symbols-outlined text-forest-deep text-xl">folder_open</span>
                      Documents &amp; Justificatifs rattachés
                    </h2>
                    <div className="flex items-center gap-2">
                      {canManageVote && (
                        <button
                          type="button"
                          onClick={() => setIsSelectExistingDocModalOpen(true)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                          title="Associer un document déjà présent dans la base documentaire"
                        >
                          <span className="material-symbols-outlined text-sm">search</span>
                          <span>Associer un document existant</span>
                        </button>
                      )}
                      <span className="text-xs text-on-surface-variant font-medium">
                        {documentsList.length} pièce{documentsList.length > 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    {documentsList.length === 0 ? (
                      <div className="p-3.5 bg-canvas-slate dark:bg-slate-900/40 rounded-xl text-center text-xs text-on-surface-variant border border-dashed border-border-subtle">
                        Aucune pièce jointe ou devis téléversé pour ce projet.
                      </div>
                    ) : (
                      documentsList.map((doc, idx) => {
                        const docInfo = resolveDocumentInfo(doc, activeProject);
                        return (
                          <div key={idx} className="flex items-center justify-between p-3 bg-canvas-slate dark:bg-slate-900/50 hover:bg-surface-container transition-colors rounded-xl border border-border-subtle">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-lg bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-xl">
                                  {docInfo.isImage ? 'image' : 'picture_as_pdf'}
                                </span>
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="text-xs sm:text-sm font-semibold text-on-surface truncate" title={docInfo.title}>
                                  {docInfo.title}
                                </span>
                                {/* Annotation 6 : Le sous-titre "Pièce certifiée" est supprimé */}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                              <button 
                                onClick={() => handleViewDocument(doc)}
                                className="px-2.5 py-1.5 rounded-lg bg-surface-container-lowest text-primary hover:bg-sage-soft text-xs font-semibold flex items-center gap-1 shadow-xs border border-primary transition-all cursor-pointer" 
                                type="button"
                                title="Consulter sans télécharger"
                              >
                                <span className="material-symbols-outlined text-[15px]">visibility</span>
                                <span>Consulter</span>
                              </button>
                              <button 
                                onClick={() => handleDownloadDocument(doc)}
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

                {/* Annotation 2 : Liens web & sources externes */}
                <ExternalLinksSection
                  links={activeProject.external_links}
                  isEditing={false}
                />

                {/* ANNOTATIONS 4 & 5 : TITRE ÉPURÉ "Voter" & SONDAGE STYLE WHATSAPP */}
                <div ref={voteSectionRef} id="section-sondage-whatsapp" className="flex flex-col gap-2.5 scroll-mt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-forest-deep text-xl">poll</span>
                      <h2 className="font-headline-sm text-sm sm:text-base font-bold text-on-surface">
                        Voter
                      </h2>
                    </div>
                  </div>

                  {/* Rendu dynamique du sondage WhatsApp (Annotations 2, 3 & 11) */}
                  <WhatsAppPollView
                    project={activeProject}
                    associatesVotes={associatesVotes}
                    currentUser={currentUserName}
                    onCastVote={handleCastVote}
                    isVotingDisabled={false}
                    compact={false}
                    readOnly={false}
                  />
                </div>

                {/* ANNOTATION 1 : L'ancien bloc div#section-vote redondant est définitivement supprimé */}
              </>
            )}

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

      {/* Visionneuse universelle intégrée pour les justificatifs du vote (Annotation 6) */}
      <DocumentViewerModal
        isOpen={isViewerOpen}
        onClose={() => {
          setIsViewerOpen(false);
          setViewerDoc(null);
        }}
        document={viewerDoc}
        onDownload={handleDownloadDocument}
      />

      {/* Annotation 4 : Modale de téléversement de documents justificatifs rattachée au projet */}
      <UploadDocumentModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUploadSuccess={handleUploadSuccess}
        targetProjectId={activeProject?.id || null}
      />

      {/* Annotation 6 : Modale de sélection de documents déjà existants dans la SCI */}
      <SelectExistingDocumentModal
        isOpen={isSelectExistingDocModalOpen}
        onClose={() => setIsSelectExistingDocModalOpen(false)}
        targetProjectId={activeProject?.id || null}
        alreadyAttachedDocIds={editDocuments}
        onAttachSuccess={handleAttachExistingDocs}
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
