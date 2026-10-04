import React, { useState, useEffect, useRef } from 'react';
import {
  fetchTaskById,
  updateTask,
  createTask,
  createProject,
  closeTask,
  deleteTask,
  validateTask,
  invalidateTask,
  acceptTask,
  rejectTask,
  requestTaskValidation,
  fetchTaskComments,
  addTaskComment,
  reactToTaskComment,
  uploadTaskDocuments,
  deleteDocument,
  invalidateCache,
  invalidateApiCache,
  fetchTaskRecommendations,
  validateMemberExpense,
  rejectMemberExpense,
} from '../api';
import {
  isTaskPendingValidation,
  isTaskProposed,
  getTaskColorCategory,
  getTaskStatusMeta,
  isTaskAssignedToUser,
  isTaskOpen,
  resolveUserMeta,
  resolveMemberDisplayName,
} from '../utils/taskAssignment';
import CustomSelect from './CustomSelect';
import DocumentViewerModal from './DocumentViewerModal';
import UploadDocumentModal from './UploadDocumentModal';
import SelectExistingDocumentModal from './SelectExistingDocumentModal';
import FamilyChat from './common/FamilyChat';
import ExternalLinksSection from './common/ExternalLinksSection';
import { MarkdownContent } from './common/RichTextEditor';
import KeyValueAttachmentList, { parseKeyValues } from './common/KeyValueAttachmentList';

const SUBJECTS = [
  'Presbytère',
  'Rosings',
  'Piscine',
  'Jardin & Espaces Verts',
  'Petites cabanes',
  'Hangar à meuble',
  'SCI & Administratif',
];

export const CHARGES = ['Négligeable', 'Faible', 'Modérée', 'Élevée', 'Très élevée'];
export const COMPLEXITIES = CHARGES;

const ALL_MEMBERS = [
  'Henri Jamet',
  'Joséphine Jamet',
  'Hortense Jamet',
  'Marguerite Jamet',
  'Eugénie Jamet',
  'Frédéric Jamet',
  'Élisabeth Jamet',
];

function parseChecklistItems(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {}
  }
  return [];
}

function parseTaskDocuments(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (typeof parsed === 'object' && parsed !== null) return [parsed];
    } catch (_) {
      return raw.split(',').map((s) => s.trim()).filter(Boolean).map((name) => ({ filename: name, name }));
    }
  }
  return [];
}

function normalizeDocItem(docItem, idx = 0) {
  if (!docItem) return null;
  if (typeof docItem === 'string') {
    const isUploadOrHttp = docItem.startsWith('/uploads/') || docItem.startsWith('http') || docItem.startsWith('/api/');
    const url = isUploadOrHttp ? docItem : `/api/documents/${encodeURIComponent(docItem)}/download`;
    const cleanBasename = docItem.split('/').pop().replace(/^[a-f0-9]{32}_/, '') || docItem;
    const isImg = Boolean(cleanBasename.match(/\.(png|jpe?g|webp|gif|svg)$/i));
    const isText = Boolean(cleanBasename.match(/\.(txt|log|md|json)$/i));
    const properFilename = isImg || isText ? cleanBasename : (cleanBasename.includes('.') ? cleanBasename : `${cleanBasename}.pdf`);
    return {
      id: docItem,
      name: cleanBasename,
      filename: properFilename,
      file_url: url,
      url: url,
      type: isImg ? 'Image' : (isText ? 'Text' : 'PDF'),
      file_type: isText ? 'text/plain' : undefined,
      size: '',
    };
  }
  const url = docItem.file_url || docItem.url || (docItem.id ? `/api/documents/${docItem.id}/download` : (docItem.filename?.startsWith('/uploads/') ? docItem.filename : ''));
  const rawName = docItem.name || docItem.filename || docItem.title || (url ? url.split('/').pop() : `Document_${idx + 1}`);
  const cleanName = String(rawName).replace(/^[a-f0-9]{32}_/, '');
  const isImg = Boolean(cleanName.match(/\.(png|jpe?g|webp|gif|svg)$/i)) || (docItem.type === 'Image') || (docItem.file_type && docItem.file_type.startsWith('image/'));
  const isText = Boolean(cleanName.match(/\.(txt|log|md|json)$/i)) || (docItem.type === 'Text') || (docItem.file_type === 'text/plain');
  const properFilename = isImg || isText ? cleanName : (cleanName.includes('.') ? cleanName : `${cleanName}.pdf`);
  return {
    ...docItem,
    id: docItem.id || url || `doc-${idx}`,
    name: cleanName,
    filename: properFilename,
    file_url: url,
    url: url,
    type: isImg ? 'Image' : (isText ? 'Text' : 'PDF'),
    file_type: isText ? 'text/plain' : docItem.file_type,
    size: docItem.size || '',
  };
}

export default function TaskDetailModal({
  isOpen,
  task: initialTask,
  onClose,
  currentUser = 'Henri Jamet',
  onTaskUpdated,
  onTaskDeleted,
  onProjectCreated,
  onTaskCreated,
  initialMode = 'view',
  isEditing = false,
  isBugReport = false,
  tempUploadedDocIds = [],
}) {
  const isVoteInitiative = !!(initialTask?.isVoteInitiative || initialTask?.isVote || initialTask?.is_project);
  const isBugReportEffective = Boolean(isBugReport || initialTask?.isBugReport);
  const isNewTask = !initialTask || !initialTask.id || isEditing || initialMode === 'edit';
  const [task, setTask] = useState(initialTask || {});
  const [mode, setMode] = useState(isNewTask ? 'edit' : (initialMode || 'view')); // 'view' | 'edit'
  const [isArbitratingExpense, setIsArbitratingExpense] = useState(false);
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);

  // Gestion Zero-Leak des documents temporaires et contrôle d'invalidation / suppression
  const isSavedRef = useRef(false);
  const isDeletedRef = useRef(false);
  const tempDocIdsRef = useRef(tempUploadedDocIds || initialTask?.tempUploadedDocIds || []);

  useEffect(() => {
    isSavedRef.current = false;
    isDeletedRef.current = false;
    tempDocIdsRef.current = Array.isArray(tempUploadedDocIds) && tempUploadedDocIds.length > 0
      ? tempUploadedDocIds
      : (initialTask?.tempUploadedDocIds || []);
  }, [isOpen, tempUploadedDocIds, initialTask]);

  const purgeTempDocuments = async () => {
    if (!isSavedRef.current && tempDocIdsRef.current && tempDocIdsRef.current.length > 0) {
      const idsToPurge = [...tempDocIdsRef.current];
      tempDocIdsRef.current = [];
      for (const docId of idsToPurge) {
        try {
          await deleteDocument(docId);
        } catch (purgeErr) {
          console.warn(`[Purge Zero-Leak] Erreur suppression document temporaire #${docId}:`, purgeErr);
        }
      }
    }
  };

  // Annotation 9: Détection des modifications non enregistrées pour confirmation explicite
  const hasUnsavedChanges = () => {
    if (mode !== 'edit') return false;
    const origTitle = (task?.title || '').trim();
    const origDesc = (task?.description || '').trim();
    const origSub = (task?.subject || (isVoteInitiative ? 'Presbytère' : 'Presbytère')).trim();
    const origComp = (task?.complexity || (isVoteInitiative ? 'Élevée' : 'Modérée')).trim();
    const origMembers = Array.isArray(task?.assigned_members)
      ? [...task.assigned_members].sort().join(',')
      : (task?.assignee || '');
    const currentMembers = Array.isArray(editMembers)
      ? [...editMembers].sort().join(',')
      : '';

    if (editTitle.trim() !== origTitle) return true;
    if (editDescription.trim() !== origDesc) return true;
    if (editSubject.trim() !== origSub) return true;
    if (!isVoteInitiative && editComplexity.trim() !== origComp) return true;
    if (!isVoteInitiative && currentMembers !== origMembers) return true;
    if (editChecklist.length !== parseChecklistItems(task?.checklist).length) return true;
    if (editDocuments.length !== parseTaskDocuments(task?.documents || task?.completion_docs).length) return true;
    if (editExternalLinks.length !== (Array.isArray(task?.external_links) ? task.external_links.length : 0)) return true;
    if (JSON.stringify(editKeyValues) !== JSON.stringify(parseKeyValues(task?.key_values))) return true;
    return false;
  };

  const handleSafeClose = async () => {
    if (hasUnsavedChanges()) {
      const confirmDiscard = window.confirm("Des modifications sont en cours et non enregistrées. Voulez-vous vraiment quitter sans enregistrer ?");
      if (!confirmDiscard) return;
    }
    await purgeTempDocuments();
    onClose();
  };

  // Fermeture par touche Échap avec purge Zero-Leak
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleSafeClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);
  
  // Initialisation des commentaires (avec message d'accueil si nouvelle création, ou task.comments si existant)
  const [comments, setComments] = useState(() => {
    if (initialTask?.comments && Array.isArray(initialTask.comments) && initialTask.comments.length > 0) {
      return initialTask.comments;
    }
    if (isNewTask) {
      return [
        {
          id: 'welcome-1',
          author_name: 'Coordination SCI',
          content: isVoteInitiative 
            ? "Fil de concertation ouvert pour cette initiative. Vous pouvez échanger avec les associés avant et pendant le vote."
            : "Fil de discussion ouvert pour la préparation et le suivi de cette mission.",
          created_at: new Date().toISOString(),
          reactions: {},
        }
      ];
    }
    return [];
  });

  // Visionneuse universelle intégrée (Annotation 9)
  const [viewerDoc, setViewerDoc] = useState(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  const handleViewDocument = (docItem) => {
    const norm = normalizeDocItem(docItem);
    if (norm) {
      setViewerDoc(norm);
      setIsViewerOpen(true);
    }
  };

  const handleDownloadDoc = (docItem) => {
    const norm = normalizeDocItem(docItem);
    const targetUrl = norm?.file_url || norm?.url;
    const targetName = norm?.filename || norm?.name || 'document.pdf';
    if (targetUrl) {
      const a = document.createElement('a');
      a.href = targetUrl;
      a.download = targetName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      const blob = new Blob([`SCI HELLENVILLIERS\n\nDocument : ${targetName}\nTâche : ${task?.title || 'Mission SCI'}\nStatut : Certifié conforme.\n`], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = targetName.replace('.pdf', '.txt');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  // Edit Mode Form State
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSubject, setEditSubject] = useState('Presbytère');
  const [editComplexity, setEditComplexity] = useState('Modérée');
  const [editMembers, setEditMembers] = useState([]);
  const [editChecklist, setEditChecklist] = useState([]);
  const [editVoteOptions, setEditVoteOptions] = useState([]);
  const [editDocuments, setEditDocuments] = useState([]);
  const [editExternalLinks, setEditExternalLinks] = useState([]);
  const [editKeyValues, setEditKeyValues] = useState([]);
  const [editOnsitePresence, setEditOnsitePresence] = useState(isBugReportEffective ? false : (initialTask?.onsite_presence !== undefined ? initialTask.onsite_presence !== false : true));
  const [editIsRecurring, setEditIsRecurring] = useState(false);
  const [editRecurrenceInterval, setEditRecurrenceInterval] = useState(1);
  const [editRecurrenceUnit, setEditRecurrenceUnit] = useState('semaines');
  const [editAutoAssignByWorkload, setEditAutoAssignByWorkload] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // Annotation 5 : Top 3 des membres recommandés calculés dynamiquement selon le domaine et l'équité
  const [recommendations, setRecommendations] = useState([
    { rank: 1, name: 'Joséphine Jamet', prenom: 'Joséphine', reason: `charge la plus basse dans ${editSubject || 'Rosings'}` },
    { rank: 2, name: 'Hortense Jamet', prenom: 'Hortense', reason: 'charge basse' },
    { rank: 3, name: 'Marguerite Jamet', prenom: 'Marguerite', reason: 'disponible pour ce domaine' },
  ]);
  const [loadingRecs, setLoadingRecs] = useState(false);

  // Annotation 3 : Tous les 7 associés triés selon le calcul d'équité de charge
  const sortedAssociatesByEquity = React.useMemo(() => {
    const recList = Array.isArray(recommendations) ? recommendations : [];
    const ordered = [];
    const seen = new Set();

    recList.forEach((rec, idx) => {
      const recName = rec.name || rec.member_name || rec.prenom || '';
      const match = ALL_MEMBERS.find((m) => m.toLowerCase().includes(recName.toLowerCase()) || recName.toLowerCase().includes(m.toLowerCase()));
      const finalName = match || recName;
      if (finalName && !seen.has(finalName)) {
        seen.add(finalName);
        ordered.push({
          name: finalName,
          rank: idx + 1,
          reason: rec.reason || (idx === 0 ? "Charge la plus équitable" : "Disponible"),
          score_usage: rec.score_usage,
          ratio: rec.ratio,
        });
      }
    });

    ALL_MEMBERS.forEach((m) => {
      if (!seen.has(m)) {
        seen.add(m);
        ordered.push({
          name: m,
          rank: ordered.length + 1,
          reason: "",
        });
      }
    });

    return ordered;
  }, [recommendations]);

  // Annotation 3 : Multi-sélection des membres pour l'arbitrage / approbation de mission
  const [selectedValidationMembers, setSelectedValidationMembers] = useState([]);

  useEffect(() => {
    if (!isOpen) return;
    const taskMembers = Array.isArray(task?.assigned_members) && task.assigned_members.length > 0
      ? task.assigned_members
      : (task?.assignee ? [task.assignee] : []);
    if (taskMembers.length > 0) {
      setSelectedValidationMembers(taskMembers);
    } else if (sortedAssociatesByEquity.length > 0) {
      setSelectedValidationMembers([sortedAssociatesByEquity[0].name]);
    }
  }, [isOpen, task?.id, task?.assigned_members, task?.assignee, sortedAssociatesByEquity]);

  const handleToggleValidationMember = (memberName) => {
    setSelectedValidationMembers((prev) => {
      if (prev.includes(memberName)) {
        return prev.filter((m) => m !== memberName);
      } else {
        return [...prev, memberName];
      }
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    const currentDomain = (mode === 'edit' ? editSubject : (task?.subject || task?.category)) || 'Rosings';
    const currentComplexity = (mode === 'edit' ? editComplexity : task?.complexity) || 'Modérée';

    async function loadRecommendations() {
      try {
        setLoadingRecs(true);
        const res = await fetchTaskRecommendations({
          subject: currentDomain,
          category: currentDomain,
          complexity: currentComplexity,
          taskId: task?.id,
          limit: 7
        });
        if (isMounted && res && Array.isArray(res.recommendations) && res.recommendations.length > 0) {
          setRecommendations(res.recommendations);
        }
      } catch (err) {
        console.warn('Erreur chargement recommandations d\'équité:', err);
      } finally {
        if (isMounted) setLoadingRecs(false);
      }
    }
    loadRecommendations();
    return () => {
      isMounted = false;
    };
  }, [isOpen, editSubject, editComplexity, task?.id, task?.subject, task?.category, task?.complexity, mode]);

  // Catégories strictement fixes : Lieux fixes en premier puis SCI (Annotation 12 & 15)
  const categoryOptions = React.useMemo(() => [
    { value: 'Presbytère', label: '🏡 Presbytère' },
    { value: 'Rosings', label: '🏠 Rosings' },
    { value: 'Piscine', label: '🏊 Piscine' },
    { value: 'Jardin & Espaces Verts', label: '🌳 Jardin & Espaces Verts' },
    { value: 'Petites cabanes', label: '🛖 Petites cabanes' },
    { value: 'Hangar à meuble', label: '📦 Hangar à meuble' },
    { value: 'SCI & Administratif', label: '🏛️ SCI & Administratif' },
  ], []);

  // Document Upload & Drag-and-drop State (Universal Upload Modal)
  const [isUploadDocModalOpen, setIsUploadDocModalOpen] = useState(false);
  const [isSelectExistingDocModalOpen, setIsSelectExistingDocModalOpen] = useState(false);
  const [droppedFileForUpload, setDroppedFileForUpload] = useState(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Close Protocol Modal State
  const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
  const [closeNotes, setCloseNotes] = useState('');
  const [closingSubmitting, setClosingSubmitting] = useState(false);

  const fileUploadRef = useRef(null);
  const fileUploadEditRef = useRef(null);
  const validationSectionRef = useRef(null);

  // Handler d'association de documents existants déjà uploadés (Annotation 6)
  const handleAttachExistingDocs = async (attachedDocs) => {
    if (!Array.isArray(attachedDocs) || attachedDocs.length === 0) return;
    const newItems = attachedDocs.map((doc, idx) => ({
      id: doc.id,
      name: doc.title || doc.name || doc.filename,
      title: doc.title || doc.name || doc.filename,
      filename: doc.filename || doc.file_name || doc.title,
      file_url: doc.file_url || doc.url || `/api/documents/${doc.id}/download`,
      url: doc.file_url || doc.url || `/api/documents/${doc.id}/download`,
      type: doc.type || ((doc.filename || doc.file_name || '').toLowerCase().endsWith('.pdf') ? 'PDF' : (doc.filename?.match(/\.(png|jpe?g|webp|gif|svg)$/i) ? 'Image' : 'Document')),
      size: doc.file_size ? `${Math.round(doc.file_size / 1024)} Ko` : (doc.size || ''),
      category: doc.category,
      uploaded_at: doc.created_at || new Date().toISOString()
    }));

    setEditDocuments((prev) => [...prev, ...newItems]);
    const currentTaskDocs = parseTaskDocuments(task?.documents || task?.completion_docs);
    const mergedTaskDocs = [...currentTaskDocs, ...newItems];
    setTask((prev) => ({ ...prev, documents: mergedTaskDocs }));
    if (onTaskUpdated) onTaskUpdated();

    // Notification automatique dans le fil de discussion de la tâche
    if (task?.id) {
      try {
        const docNames = newItems.map((d) => `[${d.title}](${d.file_url})`).join(', ');
        const currentSender = typeof currentUser === 'string'
          ? currentUser
          : (currentUser?.name || currentUser?.prenom || 'Henri Jamet');
        await addTaskComment(task.id, {
          content: `📎 Documents associés depuis la bibliothèque SCI : ${docNames}`,
          author_name: currentSender,
          author_role: 'Associé'
        });
        const updatedComments = await fetchTaskComments(task.id);
        if (Array.isArray(updatedComments)) {
          setComments(updatedComments);
        }
      } catch (chatErr) {
        console.warn('Erreur post chat association documents:', chatErr);
      }
    }
  };

  // Handler universel d'upload de document conforme à l'onglet administratif (Annotation 10 & 11)
  const handleUniversalUploadSuccess = async (newDoc) => {
    const docItem = {
      id: newDoc.id,
      name: newDoc.title || newDoc.name,
      title: newDoc.title || newDoc.name,
      filename: newDoc.filename || newDoc.file_name,
      file_url: newDoc.file_url || newDoc.url,
      url: newDoc.file_url || newDoc.url,
      type: newDoc.type || (newDoc.filename?.toLowerCase().endsWith('.pdf') ? 'PDF' : (newDoc.filename?.match(/\.(png|jpe?g|webp|gif|svg)$/i) ? 'Image' : 'Document')),
      size: newDoc.size || '',
      category: newDoc.category,
      uploaded_at: new Date().toISOString()
    };

    // Mettre à jour editDocuments
    setEditDocuments((prev) => [...prev, docItem]);

    // Mettre à jour l'objet task
    const currentTaskDocs = parseTaskDocuments(task?.documents || task?.completion_docs);
    const mergedTaskDocs = [...currentTaskDocs, docItem];
    setTask((prev) => ({ ...prev, documents: mergedTaskDocs }));

    if (onTaskUpdated) onTaskUpdated();

    // Poster automatiquement dans le fil de discussion de la tâche (Annotation 10)
    if (task?.id) {
      try {
        const linkMsg = `📎 [${newDoc.title || newDoc.name} - ${newDoc.filename || newDoc.name}](${newDoc.file_url || newDoc.url})`;
        const currentSender = typeof currentUser === 'string'
          ? currentUser
          : (currentUser?.name || currentUser?.prenom || 'Henri Jamet');
        await addTaskComment(task.id, {
          content: linkMsg,
          author_name: currentSender,
          author_role: 'Associé'
        });
        if (typeof loadComments === 'function') {
          loadComments();
        } else {
          // Recharger les commentaires si loadComments a un autre nom
          const updatedComments = await fetchTaskComments(task.id);
          if (Array.isArray(updatedComments)) {
            setComments(updatedComments);
          }
        }
      } catch (chatErr) {
        console.warn('Erreur post automatique dans le chat:', chatErr);
      }
    }
  };

  const handleUploadFiles = async (files) => {
    if (!files || files.length === 0) return;
    try {
      setUploadingDoc(true);
      const fileList = Array.from(files);
      const res = await uploadTaskDocuments(fileList);
      const uploadedUrls = res?.document_urls || [];

      const newDocItems = uploadedUrls.map((url) => {
        const cleanName = url.split('/').pop().replace(/^[a-f0-9]{32}_/, '');
        return {
          name: cleanName,
          filename: cleanName,
          file_url: url,
          url: url,
          type: url.toLowerCase().endsWith('.pdf') ? 'PDF' : (url.match(/\.(png|jpe?g|webp|gif|svg)$/i) ? 'Image' : 'Document'),
          uploaded_at: new Date().toISOString(),
        };
      });

      // Mettre à jour la liste des documents en édition
      const updatedEditDocs = [...editDocuments, ...newDocItems];
      setEditDocuments(updatedEditDocs);

      // Mettre à jour l'objet tâche
      const currentTaskDocs = parseTaskDocuments(task?.documents || task?.completion_docs);
      const mergedTaskDocs = [...currentTaskDocs, ...newDocItems];
      setTask((prev) => ({ ...prev, documents: mergedTaskDocs }));

      // Si la tâche existe déjà en base, persistance immédiate
      if (task?.id) {
        await updateTask(task.id, { documents: mergedTaskDocs });
        if (onTaskUpdated) onTaskUpdated();
      }
    } catch (err) {
      console.error('Erreur téléversement document:', err);
      alert(err.message || 'Erreur lors du téléversement du document.');
    } finally {
      setUploadingDoc(false);
      if (fileUploadRef.current) fileUploadRef.current.value = '';
      if (fileUploadEditRef.current) fileUploadEditRef.current.value = '';
    }
  };

  const handleRemoveDocument = async (indexToRemove) => {
    const currentDocs = mode === 'edit' ? editDocuments : parseTaskDocuments(task?.documents || task?.completion_docs);
    const updatedDocs = currentDocs.filter((_, idx) => idx !== indexToRemove);

    setEditDocuments(updatedDocs);
    setTask((prev) => ({ ...prev, documents: updatedDocs }));

    if (task?.id) {
      try {
        await updateTask(task.id, { documents: updatedDocs });
        if (onTaskUpdated) onTaskUpdated();
      } catch (err) {
        console.error('Erreur détachement document:', err);
        alert('Erreur lors de la suppression du document.');
      }
    }
  };

  const currentUserName = typeof currentUser === 'object'
    ? (currentUser?.name || currentUser?.prenom || '')
    : (currentUser || '');
  let resolvedUserName = currentUserName;
  if (!resolvedUserName) {
    try {
      resolvedUserName = localStorage.getItem('sci_user') || '';
    } catch (_) {}
  }
  const isCoordinator = Boolean(
    currentUser?.is_coordinator === true ||
    currentUser?.is_coordinator === 'true' ||
    currentUser?.is_coordinator === 1 ||
    resolvedUserName.toLowerCase().includes('henri') ||
    resolvedUserName.toLowerCase().includes('joséphine') ||
    resolvedUserName.toLowerCase().includes('josephine')
  );

  // Annotation 18 : Vérification si l'utilisateur connecté est l'auteur ayant proposé la tâche
  const taskCreator = String(task?.created_by || task?.submitted_by || task?.author || '').trim().toLowerCase();
  const currentUserNameClean = resolvedUserName.trim().toLowerCase();
  const currentUserFirstClean = (resolvedUserName.trim().split(' ')[0] || '').toLowerCase();
  const isAuthor = Boolean(
    taskCreator && (
      taskCreator === currentUserNameClean ||
      (currentUserFirstClean && (taskCreator.includes(currentUserFirstClean) || currentUserNameClean.includes(taskCreator))) ||
      (task?.created_by_id && currentUser?.id && Number(task.created_by_id) === Number(currentUser.id))
    )
  );
  const canDeleteTask = isCoordinator || isAuthor;

  const userMeta = resolveUserMeta(currentUser);
  const currentUserId = currentUser?.id ?? userMeta?.id;
  const isAssignedToCurrentUser = Boolean(
    (currentUserId != null && (
      Number(task?.assigned_to) === Number(currentUserId) ||
      Number(task?.assigned_to_id) === Number(currentUserId) ||
      Number(task?.assigned_member_id) === Number(currentUserId) ||
      Number(task?.assignee_id) === Number(currentUserId)
    )) ||
    isTaskAssignedToUser(task, currentUser)
  );
  const isPendingValidation = isTaskPendingValidation(task);
  const isProposed = isTaskProposed(task);
  const isOpenTask = isTaskOpen(task);

  const keyValuesList = parseKeyValues(task?.key_values);
  const expenseIdKv = keyValuesList.find((kv) =>
    ['expense_id', 'expenseid', 'id_expense', 'depense_id', 'id_depense'].includes((kv.key || '').toLowerCase())
  );
  const expenseAmountKv = keyValuesList.find((kv) =>
    ['montant', 'amount', 'expense_amount', 'montant avance', 'montant_avance', 'somme', 'total'].includes((kv.key || '').toLowerCase())
  );
  const expenseMemberKv = keyValuesList.find((kv) =>
    ['membre', 'member', 'demandeur', 'claimant', 'member_name', 'created_by', 'auteur'].includes((kv.key || '').toLowerCase())
  );
  const expenseDateKv = keyValuesList.find((kv) =>
    ['date', 'expense_date', 'date de facture', 'date_facture'].includes((kv.key || '').toLowerCase())
  );
  const expenseMotifKv = keyValuesList.find((kv) =>
    ['motif', 'title', 'libelle', 'libellé', 'description'].includes((kv.key || '').toLowerCase())
  );

  const expenseId = expenseIdKv ? parseInt(expenseIdKv.value, 10) : null;

  // Formatage monétaire français strict (ex: 45,50 €)
  const formatFrenchCurrency = (val) => {
    if (val === null || val === undefined || val === '') return '';
    if (typeof val === 'number') {
      return val.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
    }
    const str = String(val).trim();
    const cleanStr = str.replace(/[€\sEUR]/gi, '').replace(',', '.');
    const num = parseFloat(cleanStr);
    if (!isNaN(num)) {
      return num.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
    }
    return str;
  };

  const titleAmountMatch = task?.title ? task.title.match(/\((\d+[.,]?\d*)\s*€\)/) : null;
  const descAmountMatch = task?.description ? task.description.match(/Montant avancé\s*:\s*(\d+[.,]?\d*)/i) : null;
  const rawAmount = expenseAmountKv?.value ?? (titleAmountMatch ? titleAmountMatch[1] : null) ?? (descAmountMatch ? descAmountMatch[1] : null) ?? (task?.budget && task.budget > 0 ? task.budget : null);
  const expenseAmount = formatFrenchCurrency(rawAmount);

  // Formatage de date français strict (ex: 04/10/2026)
  const formatFrenchDate = (val) => {
    if (!val) return '';
    const str = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      const [year, month, day] = str.slice(0, 10).split('-');
      return `${day}/${month}/${year}`;
    }
    return str;
  };

  // Résolution stricte du nom du demandeur (zéro ID numérique brut comme '1')
  const titleMemberMatch = task?.title ? task.title.match(/Validation avance(?: de frais)?\s*:\s*([A-Za-zÀ-ÿ]+)/i) : null;
  const rawMember = expenseMemberKv?.value || (titleMemberMatch ? titleMemberMatch[1] : null) || task?.created_by;
  const expenseMemberName = resolveMemberDisplayName(rawMember) || 'Henri Jamet';

  const rawExpenseDate = expenseDateKv ? expenseDateKv.value : null;
  const expenseDate = formatFrenchDate(rawExpenseDate);
  const expenseMotif = expenseMotifKv ? expenseMotifKv.value : null;
  const isExpenseValidationTask = Boolean(
    (task?.title && task.title.toLowerCase().includes('validation avance')) ||
    (task?.category && task.category.toLowerCase().includes('trésorerie')) ||
    (task?.category && task.category.toLowerCase().includes('tresorerie')) ||
    expenseId
  );

  // Pièces jointes / Justificatifs de l'avance
  const allAttachedDocs = parseTaskDocuments(task?.documents || task?.completion_docs || task?.document_urls);
  const docUrlKv = keyValuesList.find((kv) =>
    ['document_url', 'file_url', 'justificatif_url', 'justificatif', 'url'].includes((kv.key || '').toLowerCase())
  );
  if (docUrlKv && !allAttachedDocs.some((d) => (d.file_url === docUrlKv.value || d.url === docUrlKv.value))) {
    allAttachedDocs.push({
      name: 'Facture / Justificatif',
      filename: 'Justificatif.pdf',
      file_url: docUrlKv.value,
      url: docUrlKv.value,
      type: 'PDF'
    });
  }
  const expenseDocs = allAttachedDocs;

  useEffect(() => {
    if (!isOpen) return;
    setIsMobileChatOpen(false);
    const isNew = !initialTask || !initialTask.id || isEditing || initialMode === 'edit';
    const taskObj = initialTask && initialTask.id ? initialTask : {
      title: initialTask?.title || '',
      description: initialTask?.description || '',
      subject: initialTask?.subject || 'Presbytère',
      complexity: initialTask?.complexity || (isVoteInitiative ? 'Élevée' : 'Modérée'),
      assigned_members: initialTask?.assigned_members || (isVoteInitiative ? [currentUserName || 'Henri Jamet'] : []),
      status: initialTask?.status || (isVoteInitiative ? 'EN_VOTE' : 'PROPOSED'),
      checklist: isNew ? [] : parseChecklistItems(initialTask?.checklist),
      options: initialTask?.options || (isVoteInitiative ? ['Approuver le projet', 'Rejeter le projet'] : []),
      documents: parseTaskDocuments(initialTask?.documents || initialTask?.completion_docs || initialTask?.document_urls),
      onsite_presence: isBugReportEffective ? false : (initialTask?.onsite_presence !== undefined ? initialTask.onsite_presence !== false : true),
      is_recurring: initialTask?.is_recurring || false,
      recurrence_interval: initialTask?.recurrence_interval || 1,
      recurrence_unit: initialTask?.recurrence_unit || 'semaines',
      auto_assign_by_workload: initialTask?.auto_assign_by_workload || false,
    };

    setTask(taskObj);
    syncEditFields(taskObj, isNew);
    setMode(isNew ? 'edit' : (initialMode || 'view'));

    if (initialTask?.comments && Array.isArray(initialTask.comments) && initialTask.comments.length > 0) {
      setComments(initialTask.comments);
    }

    let isMounted = true;
    async function loadData() {
      try {
        if (!isNew && initialTask?.id) {
          if (isDeletedRef.current) return;
          const [updatedTask, taskComments] = await Promise.all([
            fetchTaskById(initialTask.id).catch(() => null),
            fetchTaskComments(initialTask.id).catch(() => []),
          ]);
          if (isDeletedRef.current || !isMounted) return;
          if (updatedTask) {
            setTask(updatedTask);
            syncEditFields(updatedTask, false);
            if (Array.isArray(taskComments) && taskComments.length > 0) {
              setComments(taskComments);
            } else if (Array.isArray(updatedTask?.comments) && updatedTask.comments.length > 0) {
              setComments(updatedTask.comments);
            }
          }
        }
      } catch (err) {
        console.error('Erreur chargement détails tâche:', err);
      }
    }
    loadData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, initialTask, initialMode, isEditing, isVoteInitiative, isBugReportEffective]);

  const syncEditFields = (t, isNew = false) => {
    if (!t) return;
    setEditTitle(t.title || '');
    setEditDescription(t.description || '');
    setEditSubject(t.subject || 'Presbytère');
    setEditComplexity(t.complexity || (isVoteInitiative ? 'Élevée' : 'Modérée'));
    setEditMembers(isVoteInitiative ? [currentUserName || 'Henri Jamet'] : (Array.isArray(t.assigned_members) ? t.assigned_members : (t.assignee ? [t.assignee] : [])));
    setEditChecklist(isNew ? [] : parseChecklistItems(t.checklist));
    setEditDocuments(parseTaskDocuments(t.documents || t.completion_docs || t.document_urls));
    setEditExternalLinks(Array.isArray(t.external_links) ? t.external_links : []);
    setEditKeyValues(parseKeyValues(t.key_values || t.custom_fields));
    setEditOnsitePresence(isBugReportEffective ? false : (t.onsite_presence !== undefined ? t.onsite_presence !== false : true));
    setEditIsRecurring(Boolean(t.is_recurring));
    setEditRecurrenceInterval(t.recurrence_interval || 1);
    setEditRecurrenceUnit(t.recurrence_unit || 'semaines');
    setEditAutoAssignByWorkload(Boolean(t.auto_assign_by_workload));

    let parsedOptions = [];
    if (Array.isArray(t.options)) {
      parsedOptions = t.options;
    } else if (typeof t.options === 'string' && t.options.trim()) {
      try {
        const parsed = JSON.parse(t.options);
        if (Array.isArray(parsed)) parsedOptions = parsed;
      } catch (_) {
        parsedOptions = t.options.split(',').map((s) => s.trim()).filter(Boolean);
      }
    }
    if (parsedOptions.length === 0 && isVoteInitiative) {
      parsedOptions = ['Approuver le projet', 'Rejeter le projet'];
    }
    setEditVoteOptions(parsedOptions);
  };

  if (!isOpen || !task) return null;

  // Toggle checklist item in view mode
  const handleToggleChecklist = async (index) => {
    const baseList = parseChecklistItems(task.checklist || editChecklist);
    const updatedChecklist = [...baseList];
    const isDone = Boolean(updatedChecklist[index]?.done || updatedChecklist[index]?.completed || updatedChecklist[index]?.status === 'done');
    updatedChecklist[index] = {
      ...updatedChecklist[index],
      done: !isDone,
      completed: !isDone,
    };

    setTask({ ...task, checklist: updatedChecklist });
    setEditChecklist(updatedChecklist);

    try {
      if (task.id) {
        await updateTask(task.id, { checklist: updatedChecklist });
        if (onTaskUpdated) onTaskUpdated();
      }
    } catch (err) {
      console.error('Erreur mise à jour sous-tâche:', err);
    }
  };

  // Save changes in Edit Mode (ou Création de nouvelle tâche / vote unifié - Annotation 2 & 16)
  const handleSaveEdit = async () => {
    try {
      if (!editTitle.trim()) {
        alert(isVoteInitiative ? "Veuillez renseigner un titre pour l'initiative au vote." : "Veuillez renseigner un titre pour la tâche.");
        return;
      }

      setSavingEdit(true);
      const cleanOptions = editVoteOptions.map((o) => (typeof o === 'string' ? o.trim() : '')).filter(Boolean);
      const payload = {
        title: editTitle.trim(),
        description: editDescription.trim(),
        checklist: editChecklist,
        options: cleanOptions,
        documents: editDocuments,
        external_links: editExternalLinks,
        key_values: editKeyValues,
        custom_fields: editKeyValues,
        onsite_presence: editOnsitePresence,
        subject: editSubject,
        category: editSubject,
        complexity: isVoteInitiative ? 'Modérée' : editComplexity,
        assigned_members: isVoteInitiative
          ? [currentUserName || 'Henri Jamet']
          : (editMembers && editMembers.length > 0 ? editMembers : []),
        assignee: isVoteInitiative
          ? (currentUserName || 'Henri Jamet')
          : (editMembers && editMembers.length > 0 ? editMembers[0] : null),
        is_recurring: editIsRecurring,
        recurrence_interval: editRecurrenceInterval,
        recurrence_unit: editRecurrenceUnit,
        auto_assign_by_workload: editAutoAssignByWorkload,
        created_by: currentUserName || 'Henri Jamet',
        status: isVoteInitiative ? 'PROPOSED' : (task?.id ? (task?.status || 'PROPOSED') : 'PROPOSED'),
        progress: 0,
      };

      // Sauvegarde réussie : sécurisation Zero-Leak (les pièces jointes sont conservées)
      isSavedRef.current = true;
      tempDocIdsRef.current = [];

      if (task?.id) {
        const updated = await updateTask(task.id, payload);
        setTask(updated);
        setMode('view');
        if (onTaskUpdated) onTaskUpdated();
      } else {
        // Création unifiée (Tâche standard ou Initiative de vote - Annotation 2 & 4)
        try {
          if (isVoteInitiative) {
            const created = await createProject({
              title: editTitle.trim(),
              description: editDescription.trim(),
              category: editSubject,
              property_id: 1,
              submitted_by: currentUserName || 'Henri Jamet',
              status: 'PROPOSED',
              checklist: editChecklist,
              options: cleanOptions,
              document_urls: editDocuments.map((d) => d.file_url || d.url || d.filename),
              linked_documents: editDocuments.map((d) => d.name || d.filename).join(', '),
              external_links: editExternalLinks,
              key_values: editKeyValues,
              custom_fields: editKeyValues,
            });
            invalidateApiCache('projects');
            invalidateApiCache('/api/projects');
            invalidateApiCache('/api/projects/pending');
            if (typeof onProjectCreated === 'function') {
              onProjectCreated(created);
            } else if (typeof onTaskUpdated === 'function') {
              onTaskUpdated(created);
            }
          } else {
            const createdTaskObj = await createTask(payload);
            invalidateApiCache('tasks');
            invalidateApiCache('/api/tasks');
            if (typeof onTaskCreated === 'function') {
              onTaskCreated(createdTaskObj);
            } else if (typeof onTaskUpdated === 'function') {
              onTaskUpdated(createdTaskObj);
            }
          }
        } catch (apiErr) {
          console.warn('API create notice, fallback local:', apiErr);
          if (typeof onTaskUpdated === 'function') onTaskUpdated();
        }
        onClose();
      }
    } catch (err) {
      console.error('Erreur sauvegarde:', err);
      alert(err.message || 'Erreur lors de la sauvegarde des modifications.');
    } finally {
      setSavingEdit(false);
    }
  };

  // Delete Task (Annotation 18 & 19 : Réservé aux coordinateurs ou à la personne ayant proposé la tâche)
  const handleDeleteTask = async () => {
    if (!canDeleteTask) {
      alert("Seuls les coordinateurs ou la personne ayant proposé cette tâche peuvent la supprimer.");
      return;
    }
    if (!window.confirm("Êtes-vous certain de vouloir supprimer cette tâche ?")) return;

    const taskIdToDelete = task?.id;
    if (!taskIdToDelete) {
      onClose();
      return;
    }

    isDeletedRef.current = true;

    // Purge SWR immédiate
    invalidateCache('/api/tasks');
    invalidateCache('tasks');
    invalidateCache(`tasks/${taskIdToDelete}`);

    // Retrait immédiat du state React TasksPage via callback (Annotation 19)
    if (onTaskDeleted) {
      onTaskDeleted(taskIdToDelete);
    } else if (onTaskUpdated) {
      onTaskUpdated({ id: taskIdToDelete, deleted: true });
    }

    // Fermeture instantanée de la modal
    onClose();

    try {
      await deleteTask(taskIdToDelete);
    } catch (err) {
      console.error('Erreur suppression tâche backend:', err);
    }
  };

  // Close task protocol
  const handleConfirmCloseTask = async () => {
    if (!isCoordinator) {
      alert('Seul un gérant ou coordinateur (Henri Jamet, Joséphine Jamet) peut clôturer une tâche.');
      return;
    }
    if (!closeNotes.trim()) {
      alert('Le commentaire de synthèse est obligatoire pour clôturer la tâche.');
      return;
    }

    try {
      setClosingSubmitting(true);
      let updatedClosed = null;
      if (task.id) {
        updatedClosed = await closeTask(task.id, {
          completion_notes: closeNotes.trim(),
          completion_docs: [],
        });
      }
      setIsClosingModalOpen(false);
      onClose();
      if (onTaskUpdated) onTaskUpdated(updatedClosed || { ...task, status: 'DONE' });
    } catch (err) {
      console.error('Erreur clôture tâche:', err);
      alert(err.message || 'Erreur lors de la clôture.');
    } finally {
      setClosingSubmitting(false);
    }
  };

  // Validation de la mission par l'associé en charge (Annotation 12)
  const handleRequestValidation = async () => {
    try {
      if (task?.id) {
        await requestTaskValidation(task.id, {
          completion_notes: `Mission validée par l'associé en charge (${currentUserName || 'associé en charge'}). En attente d'arbitrage pour archivage.`
        });
        const refreshed = await fetchTaskById(task.id);
        const updatedTask = (refreshed && refreshed.id) ? refreshed : { ...task, status: 'PENDING_VALIDATION' };
        setTask(updatedTask);
        syncEditFields(updatedTask);
        if (onTaskUpdated) onTaskUpdated(updatedTask);
      } else {
        const updatedTask = { ...task, status: 'PENDING_VALIDATION' };
        setTask(updatedTask);
        if (onTaskUpdated) onTaskUpdated(updatedTask);
      }
    } catch (err) {
      console.error('Erreur validation mission:', err);
      alert(err.message || 'Erreur lors de la validation de la mission.');
    }
  };

  // Validation / Invalidation directes depuis la modale (Annotation 8 & 6)
  const handleValidateModalTask = async () => {
    try {
      let validated = null;
      if (task?.id) {
        validated = await validateTask(task.id);
      }
      const refreshed = (validated && validated.id) ? validated : { ...task, status: 'DONE' };
      setTask(refreshed);
      if (onTaskUpdated) onTaskUpdated(refreshed);
      onClose();
    } catch (err) {
      console.error('Erreur validation tâche:', err);
      alert(err.message || 'Erreur lors de la validation de la tâche.');
    }
  };

  const handleInvalidateModalTask = async () => {
    const reason = window.prompt("Motif d'invalidation (optionnel) :", "");
    if (reason === null) return;
    try {
      let invalidated = null;
      if (task?.id) {
        invalidated = await invalidateTask(task.id, reason);
      }
      const refreshed = (invalidated && invalidated.id) ? invalidated : { ...task, status: 'A_FAIRE' };
      setTask(refreshed);
      if (onTaskUpdated) onTaskUpdated(refreshed);
      onClose();
    } catch (err) {
      console.error('Erreur invalidation tâche:', err);
      alert(err.message || "Erreur lors de l'invalidation de la tâche.");
    }
  };

  // Arbitrage Proposition Coordinateur (Accepter / Refuser) - Annotation 4 & 17
  const handleAcceptModalTask = async () => {
    const isAutoAssign = Boolean(
      task?.auto_assign_by_workload ||
      editAutoAssignByWorkload ||
      task?.is_auto_assign ||
      task?.assignment_mode === 'auto'
    );

    let currentMembers = selectedValidationMembers && selectedValidationMembers.length > 0
      ? selectedValidationMembers
      : (Array.isArray(task?.assigned_members) && task.assigned_members.length > 0
          ? task.assigned_members
          : (task?.assignee ? [task.assignee] : (Array.isArray(editMembers) && editMembers.length > 0 ? editMembers : [])));

    if (!currentMembers || currentMembers.length === 0) {
      alert("Impossible d'approuver la tâche : aucun membre n'est sélectionné. Veuillez sélectionner au moins un responsable avant de valider la mission.");
      return;
    }

    try {
      let refreshed = null;
      invalidateApiCache('tasks');
      invalidateApiCache('/api/tasks');
      if (task?.id) invalidateApiCache(`tasks/${task.id}`);

      if (task?.id) {
        const accepted = await acceptTask(task.id, {
          assigned_members: currentMembers,
          auto_assign_by_workload: isAutoAssign,
          status: 'EN_COURS'
        });
        const fetched = (accepted && accepted.id)
          ? accepted
          : await fetchTaskById(task.id).catch(() => ({ ...task, status: 'EN_COURS', assigned_members: currentMembers }));
        const assignedResult = (fetched && fetched.assigned_members && fetched.assigned_members.length > 0)
          ? fetched.assigned_members
          : currentMembers;
        refreshed = {
          ...fetched,
          status: 'EN_COURS',
          assigned_members: assignedResult
        };
        setTask(refreshed);
        syncEditFields(refreshed);
      } else {
        refreshed = { ...task, status: 'EN_COURS', assigned_members: currentMembers };
        setTask(refreshed);
      }

      invalidateApiCache('tasks');
      invalidateApiCache('/api/tasks');
      if (task?.id) invalidateApiCache(`tasks/${task.id}`);

      if (onTaskUpdated) onTaskUpdated(refreshed);
      onClose();
    } catch (err) {
      console.error('Erreur acceptation tâche:', err);
      alert(err.message || "Erreur lors de l'acceptation de la tâche.");
    }
  };

  const handleRejectModalTask = async () => {
    const reason = window.prompt("Motif du refus de la proposition (optionnel) :", "");
    if (reason === null) return;
    try {
      let rejected = null;
      if (task?.id) {
        rejected = await rejectTask(task.id, reason);
      }
      const refreshed = (rejected && rejected.id) ? rejected : { ...task, status: 'REJECTED' };
      setTask(refreshed);
      if (onTaskUpdated) onTaskUpdated(refreshed);
      onClose();
    } catch (err) {
      console.error('Erreur refus tâche:', err);
      alert(err.message || "Erreur lors du refus de la tâche.");
    }
  };

  const handleValidateExpenseAction = async () => {
    if (!expenseId) {
      await handleValidateModalTask();
      return;
    }
    setIsArbitratingExpense(true);
    try {
      await validateMemberExpense(expenseId);
      const refreshed = { ...task, status: 'DONE' };
      setTask(refreshed);
      invalidateApiCache('tasks');
      invalidateApiCache('/api/tasks');
      invalidateApiCache('/api/finances/expenses');
      invalidateApiCache('/api/finances/treasury');
      if (onTaskUpdated) onTaskUpdated(refreshed);
      onClose();
    } catch (err) {
      console.error('Erreur validation avance:', err);
      alert(err.message || "Erreur lors de la validation de l'avance.");
    } finally {
      setIsArbitratingExpense(false);
    }
  };

  const handleRejectExpenseAction = async () => {
    if (!expenseId) {
      await handleInvalidateModalTask();
      return;
    }
    const reason = window.prompt("Motif de refus de l'avance :", "Justificatif non conforme");
    if (reason === null) return;
    setIsArbitratingExpense(true);
    try {
      await rejectMemberExpense(expenseId, reason);
      const refreshed = { ...task, status: 'REJECTED' };
      setTask(refreshed);
      invalidateApiCache('tasks');
      invalidateApiCache('/api/tasks');
      invalidateApiCache('/api/finances/expenses');
      if (onTaskUpdated) onTaskUpdated(refreshed);
      onClose();
    } catch (err) {
      console.error('Erreur refus avance:', err);
      alert(err.message || "Erreur lors du refus de l'avance.");
    } finally {
      setIsArbitratingExpense(false);
    }
  };

  const sendCommentToServer = async (tempId, textToSend, authorName) => {
    const targetTaskId = task?.id || initialTask?.id;
    try {
      let confirmedComment;
      if (targetTaskId) {
        confirmedComment = await addTaskComment(targetTaskId, {
          content: textToSend,
          author_name: authorName,
        });
      } else {
        // En mode création préalable, conservation locale fluide
        confirmedComment = {
          id: Date.now(),
          author_name: authorName,
          content: textToSend,
          reactions: {},
          created_at: new Date().toISOString(),
        };
      }

      setComments((prev) =>
        prev.map((c) =>
          c.id === tempId
            ? { ...confirmedComment, isOptimistic: false, isError: false }
            : c
        )
      );

      // Revalidation synchrone et persistance immédiate dans task.comments
      if (targetTaskId) {
        try {
          const freshComments = await fetchTaskComments(targetTaskId);
          if (Array.isArray(freshComments) && freshComments.length > 0) {
            setComments(freshComments);
            setTask((prev) => ({
              ...prev,
              comments: freshComments,
              comments_count: freshComments.length
            }));
          }
        } catch (fetchErr) {
          console.warn('Revalidation commentaires après post notice:', fetchErr);
        }

        if (typeof onTaskUpdated === 'function') {
          onTaskUpdated();
        }
      }
    } catch (err) {
      console.error('Erreur envoi message chat:', err);
      if (targetTaskId) {
        window.dispatchEvent(
          new CustomEvent('app-error', {
            detail: {
              message: "Échec de l'envoi du message : " + (err.message || 'Erreur réseau'),
              status: 500,
            },
          })
        );
      }
      setComments((prev) =>
        prev.map((c) =>
          c.id === tempId
            ? {
                ...c,
                isOptimistic: false,
                isError: true,
                errorMessage: err.message || 'Erreur de transmission',
              }
            : c
        )
      );
    }
  };

  // Add Comment (Optimistic UI - Instantané)
  const handleSendCommentText = (text) => {
    if (!text || !text.trim()) return;

    const tempId = `temp-${Date.now()}`;
    const authorName = currentUserName || (typeof currentUser === 'string' ? currentUser : currentUser?.name) || 'Henri Jamet';

    const tempMessage = {
      id: tempId,
      content: text.trim(),
      author_name: authorName,
      created_at: new Date().toISOString(),
      reactions: {},
      isOptimistic: true,
      isError: false,
    };

    setComments((prev) => [...prev, tempMessage]);
    sendCommentToServer(tempId, text.trim(), authorName);
  };

  // Retry sending failed comment
  const handleRetryComment = (comment) => {
    setComments((prev) =>
      prev.map((c) =>
        c.id === comment.id
          ? { ...c, isOptimistic: true, isError: false }
          : c
      )
    );
    sendCommentToServer(comment.id, comment.content, comment.author_name);
  };

  // Emoji Reactions
  const handleEmojiReact = async (commentId, emoji) => {
    try {
      const userName = typeof currentUser === 'object' && currentUser !== null
        ? (currentUser.name || currentUser.prenom || 'Henri')
        : (currentUser || 'Henri');

      if (task?.id) {
        const updated = await reactToTaskComment(task.id, commentId, emoji, userName);
        setComments(comments.map((c) => (c.id === commentId ? (updated || c) : c)));
      } else {
        setComments(
          comments.map((c) => {
            if (c.id === commentId) {
              const currentCount = c.reactions?.[emoji] || 0;
              return {
                ...c,
                reactions: { ...c.reactions, [emoji]: currentCount + 1 },
              };
            }
            return c;
          })
        );
      }
    } catch (err) {
      console.error('Erreur réaction:', err);
    }
  };

  // Checklist helper for edit mode
  const addChecklistItem = () => {
    setEditChecklist([...editChecklist, { text: '', done: false }]);
  };

  const removeChecklistItem = (index) => {
    setEditChecklist(editChecklist.filter((_, i) => i !== index));
  };

  const updateChecklistText = (index, text) => {
    const updated = [...editChecklist];
    updated[index] = { ...updated[index], text };
    setEditChecklist(updated);
  };

  // Checklist stats
  const activeChecklist = parseChecklistItems(task.checklist || editChecklist);
  const completedCount = activeChecklist.filter((i) => Boolean(i && (i.done || i.completed || i.status === 'done' || i.status === 'completed'))).length;
  const totalCount = activeChecklist.length;

  return (
    <div
      aria-labelledby="modal-task-title"
      aria-modal="true"
      role="dialog"
      onClick={(e) => {
        // Annotation 9 : Désactiver la fermeture au clic en dehors (backdrop click désactivé)
        e.stopPropagation();
      }}
      className="fixed inset-0 z-50 bg-inverse-surface/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-6xl my-auto bg-surface-container-lowest rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh] border border-border-subtle animate-in fade-in zoom-in-95 duration-200"
      >
        
        {/* ========================================== */}
        {/* 1. MODAL HEADER                           */}
        {/* ========================================== */}
        <header className="bg-surface-container-low px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0 border-b border-border-subtle">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Status & Context Pill */}
            <div className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full font-label-md text-xs sm:text-sm font-bold ${
              isVoteInitiative ? 'bg-sage-soft text-forest-deep' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            }`}>
              <span className="material-symbols-outlined text-[18px]">
                {isVoteInitiative ? 'how_to_vote' : (isNewTask ? 'add_task' : 'task_alt')}
              </span>
              <span>
                {isNewTask
                  ? (isVoteInitiative ? 'Initiative statutaire — Soumission au vote' : 'Nouvelle tâche — Création')
                  : (isVoteInitiative
                    ? `Scrutin statutaire — ${task.status || 'En délibération'}`
                    : `Mission SCI — ${getTaskStatusMeta(task).label}`)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-1 justify-end">
            {/* Boutons d'actions principales */}
            {!isNewTask && (
              <button
                type="button"
                onClick={() => setMode(mode === 'view' ? 'edit' : 'view')}
                className="bg-white border-2 border-emerald-600 text-emerald-800 font-semibold px-4 py-2 h-11 rounded-xl flex items-center gap-2 hover:bg-emerald-50 transition-colors shadow-sm cursor-pointer text-xs sm:text-sm"
              >
                <span className="material-symbols-outlined text-[18px] text-emerald-800">
                  {mode === 'view' ? 'edit_note' : 'visibility'}
                </span>
                <span>{mode === 'view' ? 'Éditer' : 'Consulter'}</span>
              </button>
            )}

            {/* CLARIFICATION RADICALE DU CYCLE DE VIE DES TÂCHES (ANNOTATION 8) */}
            {!isNewTask && (
              isProposed ? (
                <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-label-md text-xs sm:text-sm font-bold bg-amber-100 text-amber-900 border border-amber-300">
                  <span className="material-symbols-outlined text-[18px]">pending</span>
                  <span>Proposition en attente d'arbitrage</span>
                </span>
              ) : isPendingValidation ? (
                /* 3. Tâche À Valider (Vert) : Décision finale de clôture ou renvoi pour corrections */
                isCoordinator ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleValidateModalTask}
                      title="Confirmer la bonne réalisation des travaux et archiver la tâche"
                      className="inline-flex items-center gap-1.5 h-11 px-4 rounded-xl border-2 font-label-md text-xs sm:text-sm font-bold shadow-sm transition-colors bg-emerald-700 hover:bg-emerald-800 text-white border-emerald-700 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[18px]">check_circle</span>
                      <span>Confirmer la réalisation &amp; Clôturer</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleInvalidateModalTask}
                      title="Renvoyer la tâche en cours pour corrections requises"
                      className="inline-flex items-center gap-1.5 h-11 px-3.5 rounded-xl border-2 font-label-md text-xs sm:text-sm font-bold shadow-sm transition-colors bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[18px]">undo</span>
                      <span>Renvoyer en cours (corrections requises)</span>
                    </button>
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-label-md text-xs sm:text-sm font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <span className="material-symbols-outlined text-[18px]">hourglass_top</span>
                    <span>En attente d'arbitrage pour archivage</span>
                  </span>
                )
              ) : (
                /* 2. Tâche En Cours (Bleu) : Bouton 'Valider la mission' STRICTEMENT réservé à l'associé en charge (Annotation 12) - Masqué pour tâches d'avance */
                isOpenTask && isAssignedToCurrentUser && !isExpenseValidationTask && (
                  <button
                    type="button"
                    onClick={handleRequestValidation}
                    title="Valider la mission et soumettre à l'arbitrage des coordinateurs"
                    className="inline-flex items-center gap-1.5 h-11 px-4 rounded-xl border-2 font-label-md text-xs sm:text-sm font-bold shadow-sm transition-colors bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 cursor-pointer active:scale-95"
                  >
                    <span className="material-symbols-outlined text-[18px]">check_circle</span>
                    <span>Valider la mission</span>
                  </button>
                )
              )
            )}

            {/* Delete Task Button: Réservé aux coordinateurs ou à l'auteur ayant proposé la tâche (Annotation 18) */}
            {!isNewTask && canDeleteTask && (
              <button
                type="button"
                onClick={handleDeleteTask}
                className="ml-auto px-4 py-2 h-11 rounded-xl border-2 border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 text-xs sm:text-sm font-semibold flex items-center gap-2 transition-colors shadow-sm cursor-pointer"
                title="Supprimer la tâche"
              >
                <span className="material-symbols-outlined text-base">delete</span>
                <span>Supprimer</span>
              </button>
            )}

            {/* Close Modal 'X' */}
            <button
              type="button"
              onClick={handleSafeClose}
              className={`w-11 h-11 flex items-center justify-center rounded-full bg-white text-on-surface-variant hover:bg-surface-container-high transition-colors cursor-pointer border border-slate-200 ${(!isNewTask && canDeleteTask) ? '' : 'ml-auto'}`}
              title="Fermer la fenêtre"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </header>

        {/* ========================================== */}
        {/* 2. MAIN 2-COLUMN BODY (SCROLLABLE & UNIFIÉ) */}
        {/* ========================================== */}
        <div className="flex flex-col lg:grid lg:grid-cols-12 gap-0 overflow-y-auto lg:overflow-hidden flex-1 divide-y lg:divide-y-0 lg:divide-x divide-border-subtle min-h-0">
          
          {/* ========================================== */}
          {/* COLONNE GAUCHE (7 cols) : TÂCHE & ÉDITION  */}
          {/* ========================================== */}
          <section className="w-full lg:col-span-7 p-4 sm:p-7 flex flex-col gap-5 sm:gap-6 bg-surface-container-lowest shrink-0 lg:shrink lg:overflow-y-auto">
            
            {/* MODE CONSULTATION */}
            {mode === 'view' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                
                {/* Title & Meta */}
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="px-3 py-1 bg-surface-container text-on-surface font-label-sm text-xs rounded-full">
                      {task.category || (isVoteInitiative ? 'Projet & Scrutin SCI' : 'Espaces Verts & Parc')}
                    </span>
                    {!(
                      (task.category || (isVoteInitiative ? 'Projet & Scrutin SCI' : 'Espaces Verts & Parc')).trim().toLowerCase() ===
                      (task.subject || (isVoteInitiative ? 'Presbytère' : 'Rosings')).trim().toLowerCase()
                    ) && (
                      <span className="px-3 py-1 bg-surface-container text-on-surface font-label-sm text-xs rounded-full">
                        {task.subject || (isVoteInitiative ? 'Presbytère' : 'Rosings')}
                      </span>
                    )}
                    {task.is_recurring && (
                      <span className="px-3 py-1 bg-amber-50 text-amber-900 border border-amber-200 font-label-sm text-xs rounded-full flex items-center gap-1 font-semibold">
                        <span className="material-symbols-outlined text-[14px] text-amber-700">update</span>
                        Tous les {task.recurrence_interval || 1} {task.recurrence_unit || 'semaines'}
                      </span>
                    )}
                    {task.auto_assign_by_workload && (
                      <span className="px-3 py-1 bg-purple-50 text-purple-900 border border-purple-200 font-label-sm text-xs rounded-full flex items-center gap-1 font-semibold">
                        <span className="material-symbols-outlined text-[14px] text-purple-700">balance</span>
                        Auto-attribution équitable
                      </span>
                    )}
                    {task.onsite_presence && (
                      <span className="px-3 py-1 bg-sky-50 text-sky-900 border border-sky-200 font-label-sm text-xs rounded-full flex items-center gap-1 font-semibold">
                        <span className="material-symbols-outlined text-[14px] text-sky-700">holiday_village</span>
                        Sur place
                      </span>
                    )}
                  </div>

                  <h1
                    id="modal-task-title"
                    className="font-headline-lg text-xl sm:text-2xl text-forest-deep tracking-tight font-bold"
                  >
                    {task.title || (isVoteInitiative ? "Nouvelle initiative au vote" : "Nouvelle tâche")}
                  </h1>
                  <div className="flex flex-wrap items-center gap-3 pt-0.5">
                    <p className="font-body-md text-xs text-on-surface-variant">
                      Réf. {task.ref || `${isVoteInitiative ? 'VOTE' : 'T'}-2026-${task.id || '088'}`} • Statut : <span className="font-semibold text-on-surface">{isExpenseValidationTask && (task?.status === 'TODO' || task?.status === 'EN_COURS' || task?.status === 'A_FAIRE') ? 'En cours' : getTaskStatusMeta(task).label}</span>
                    </p>
                    {Array.isArray(task.assigned_members) && task.assigned_members.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-on-surface-variant font-medium">
                        <span>• Assigné(s) :</span>
                        {task.assigned_members.map((m) => (
                          <span key={m} className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-semibold">
                            {m}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Section Spécifique : Arbitrage d'Avance de Frais (Trésorerie SCI) */}
                {isExpenseValidationTask && !isNewTask && (
                  <div className="p-5 rounded-2xl border-2 border-emerald-400 bg-emerald-50/80 dark:bg-emerald-950/40 shadow-sm space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[24px] text-emerald-700 dark:text-emerald-400">
                          account_balance_wallet
                        </span>
                        <h3 className="font-headline-sm text-sm sm:text-base font-bold text-forest-deep dark:text-slate-100">
                          Arbitrage Avance de Frais — SCI Hellenvilliers
                        </h3>
                      </div>
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                        task?.status === 'TERMINEE' || task?.status === 'DONE'
                          ? 'bg-emerald-200 text-emerald-900 border border-emerald-400'
                          : task?.status === 'REJECTED'
                          ? 'bg-rose-200 text-rose-900 border border-rose-400'
                          : 'bg-amber-100 text-amber-900 border border-amber-300'
                      }`}>
                        {task?.status === 'TERMINEE' || task?.status === 'DONE' ? 'Avance Validée' : task?.status === 'REJECTED' ? 'Avance Refusée' : 'En attente d\'arbitrage'}
                      </span>
                    </div>

                    <div className="bg-white/95 dark:bg-slate-900/90 rounded-xl p-4 border border-emerald-200 dark:border-emerald-800/60 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
                        <div>
                          <span className="text-slate-500 font-medium">Demandeur : </span>
                          <span className="font-bold text-slate-900 dark:text-slate-100">{expenseMemberName}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 font-medium">Montant avancé : </span>
                          <span className="font-bold text-emerald-700 dark:text-emerald-400 text-base">{expenseAmount || 'Non précisé'}</span>
                        </div>
                        {expenseDate && (
                          <div>
                            <span className="text-slate-500 font-medium">Date de facture : </span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">{expenseDate}</span>
                          </div>
                        )}
                        {expenseMotif && (
                          <div>
                            <span className="text-slate-500 font-medium">Motif : </span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">{expenseMotif}</span>
                          </div>
                        )}
                      </div>

                      {expenseDocs && expenseDocs.length > 0 ? (
                        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                            Justificatif / Facture jointe
                          </span>
                          <div className="flex flex-wrap items-center gap-3">
                            {expenseDocs.map((docItem, idx) => {
                              const norm = normalizeDocItem(docItem, idx);
                              const isImg = norm?.type === 'Image' || (norm?.file_type && norm.file_type.startsWith('image/')) || (norm?.url && norm.url.match(/\.(png|jpe?g|webp|gif|svg)$/i));
                              return (
                                <div key={norm?.id || idx} className="flex items-center gap-2 flex-wrap">
                                  {isImg && norm?.url && (
                                    <img
                                      src={norm.url}
                                      alt={norm.name || 'Justificatif'}
                                      onClick={() => handleViewDocument(norm)}
                                      className="w-12 h-12 object-cover rounded-lg border border-emerald-300 cursor-pointer hover:opacity-90 transition-opacity shadow-xs"
                                      title="Cliquer pour afficher dans la visionneuse"
                                    />
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleViewDocument(norm)}
                                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors shadow-xs cursor-pointer"
                                  >
                                    <span className="material-symbols-outlined text-[18px]">visibility</span>
                                    <span>Voir le justificatif</span>
                                    <span className="text-[11px] font-normal opacity-85 truncate max-w-[140px]">
                                      ({norm?.filename || norm?.name || 'Facture'})
                                    </span>
                                  </button>
                                  <a
                                    href={norm?.file_url || norm?.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition-colors"
                                    title="Ouvrir dans un nouvel onglet"
                                  >
                                    <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                                  </a>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400 italic">
                          Aucun justificatif joint à cette avance
                        </div>
                      )}
                    </div>

                    {isCoordinator && task?.status !== 'TERMINEE' && task?.status !== 'DONE' && task?.status !== 'REJECTED' && (
                      <div className="flex items-center gap-3 pt-1 flex-wrap">
                        <button
                          type="button"
                          onClick={handleValidateExpenseAction}
                          disabled={isArbitratingExpense}
                          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs sm:text-sm shadow-md transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-[18px]">verified</span>
                          <span>Valider l'avance {expenseAmount ? `(${expenseAmount})` : ''}</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleRejectExpenseAction}
                          disabled={isArbitratingExpense}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-rose-50 text-rose-700 border-2 border-rose-300 font-bold text-xs sm:text-sm shadow-sm transition-all cursor-pointer disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-[18px]">close</span>
                          <span>Refuser l'avance</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Description & Objectives */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h2 className="font-headline-sm text-sm sm:text-base font-bold text-on-surface flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[20px]">description</span>
                      Description & Objectifs
                    </h2>
                  </div>

                  <div className="p-4 bg-canvas-slate rounded-2xl font-body-lg text-xs sm:text-sm text-on-surface leading-relaxed shadow-sm border border-slate-200/60">
                    <MarkdownContent content={task.description || (isVoteInitiative ? "Consultation des associés pour engagement de travaux." : "")} />
                  </div>
                </div>

                {/* Checklist & Plan d'Action */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h2 className="font-headline-sm text-sm sm:text-base font-bold text-on-surface flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[20px]">fact_check</span>
                      Plan d'action &amp; Checklist
                    </h2>
                    {totalCount > 0 && (
                      <span className="px-3 py-0.5 rounded-full bg-sage-soft text-primary font-label-sm text-xs font-semibold">
                        {completedCount}/{totalCount} terminés
                      </span>
                    )}
                  </div>

                  {activeChecklist.length === 0 ? (
                    <p className="text-xs text-on-surface-variant italic py-2">
                      Aucune sous-tâche ni étape définie pour cette mission.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {activeChecklist.map((item, idx) => {
                        const itemDone = Boolean(item && (item.done || item.completed || item.status === 'done' || item.status === 'completed'));
                        return (
                          <label
                            key={idx}
                            className={`flex items-center gap-3 p-3.5 rounded-xl cursor-pointer select-none border transition-all ${
                              itemDone
                                ? 'bg-canvas-slate/80 border-slate-200 text-on-surface/70'
                                : 'bg-white border-slate-200 text-on-surface hover:bg-sage-soft/30 shadow-xs'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={itemDone}
                              onChange={() => handleToggleChecklist(idx)}
                              className="w-5 h-5 rounded text-primary accent-primary cursor-pointer shrink-0"
                            />
                            <span className={`text-xs sm:text-sm ${itemDone ? 'line-through opacity-70' : 'font-medium'}`}>
                              {item.text || item.title || item.label || ''}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Documents & Justificatifs */}
                <div className="space-y-2.5 pt-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="font-headline-sm text-sm sm:text-base font-bold text-on-surface flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-[20px]">folder_open</span>
                        Documents &amp; Justificatifs
                      </h2>
                      <p className="font-body-md text-xs text-on-surface-variant">
                        Pièces contractuelles, factures et photos
                      </p>
                    </div>

                    {/* Mode consultation étanche : boutons d'ajout réservés au mode édition */}
                  </div>

                  <div className="flex flex-col gap-2">
                    {parseTaskDocuments(task?.documents || task?.completion_docs).length === 0 && (!task?.external_links || task.external_links.length === 0) && (!task?.key_values || parseKeyValues(task.key_values).length === 0) ? (
                      <p className="text-xs text-on-surface-variant italic py-2">
                        Aucun document, lien web ou information clé joint pour cette mission.
                      </p>
                    ) : (
                      <>
                        {parseTaskDocuments(task?.documents || task?.completion_docs).map((docItem, idx) => {
                          const norm = normalizeDocItem(docItem, idx);
                          return (
                            <div key={norm.id || idx} className="p-3 bg-canvas-slate rounded-xl flex items-center justify-between gap-3 shadow-xs border border-slate-200">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-error-container/40 text-error flex items-center justify-center shrink-0">
                                  <span className="material-symbols-outlined text-[20px]">
                                    {norm.type === 'Image' ? 'image' : (norm.type === 'Text' ? 'description' : 'picture_as_pdf')}
                                  </span>
                                </div>
                                <div className="min-w-0">
                                  <p className="font-label-md text-xs font-semibold text-on-surface truncate" title={norm.name}>
                                    {norm.name}
                                  </p>
                                  <p className="font-body-md text-[11px] text-outline">
                                    {norm.type || 'Document'} {norm.size ? `• ${norm.size}` : ''}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleViewDocument(norm)}
                                  className="h-8 px-2.5 rounded-lg bg-surface-container-lowest border border-primary text-primary text-xs font-semibold hover:bg-sage-soft transition-colors flex items-center gap-1 cursor-pointer"
                                  title="Consulter sans télécharger"
                                >
                                  <span className="material-symbols-outlined text-[15px]">visibility</span>
                                  <span>Consulter</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDownloadDoc(norm)}
                                  className="h-8 px-2.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-forest-deep transition-colors flex items-center gap-1 cursor-pointer shadow-xs"
                                  title="Télécharger une copie"
                                >
                                  <span className="material-symbols-outlined text-[15px]">download</span>
                                  <span>Télécharger</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}

                        {/* Annotation 14 : Liens web fusionnés au sein des documents */}
                        {Array.isArray(task?.external_links) && task.external_links.map((linkItem, lIdx) => {
                          const linkUrl = typeof linkItem === 'string' ? linkItem : (linkItem?.url || '');
                          const linkTitle = (typeof linkItem === 'object' && linkItem?.title) ? linkItem.title : (linkUrl || 'Ressource web');
                          return (
                            <div key={`link-${lIdx}`} className="p-3 bg-canvas-slate rounded-xl flex items-center justify-between gap-3 shadow-xs border border-slate-200">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 flex items-center justify-center shrink-0 border border-sky-200 dark:border-sky-800/60">
                                  <span className="material-symbols-outlined text-[20px]">language</span>
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="font-label-md text-xs font-semibold text-on-surface truncate" title={linkTitle}>
                                      {linkTitle}
                                    </p>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200 border border-sky-200 shrink-0">
                                      Lien web
                                    </span>
                                  </div>
                                  <a
                                    href={linkUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-body-md text-[11px] text-primary hover:underline truncate block"
                                    title={linkUrl}
                                  >
                                    {linkUrl}
                                  </a>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <a
                                  href={linkUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="h-8 px-2.5 rounded-lg bg-surface-container-lowest border border-sky-400 text-sky-800 text-xs font-semibold hover:bg-sky-50 transition-colors flex items-center gap-1 cursor-pointer"
                                  title="Ouvrir dans un nouvel onglet"
                                >
                                  <span className="material-symbols-outlined text-[15px]">open_in_new</span>
                                  <span>Ouvrir</span>
                                </a>
                              </div>
                            </div>
                          );
                        })}

                        {/* Annotation 5 : Clés-valeurs rattachées (contacts, entreprises, emails, téléphones...) */}
                        <KeyValueAttachmentList
                          items={task?.key_values}
                          isEditing={false}
                          title="Informations clés & Coordonnées"
                        />
                      </>
                    )}
                  </div>
                </div>

                {/* Section Validation & Arbitrage de la Mission (#section-task-validation - Annotation 12 & 19) - Masquée pour les tâches d'avance de trésorerie */}
                {!isExpenseValidationTask && !isNewTask && (
                  (isOpenTask && !isPendingValidation && !isProposed && isAssignedToCurrentUser) ||
                  (isPendingValidation && (isCoordinator || isAssignedToCurrentUser)) ||
                  (isProposed && (isCoordinator || isAuthor))
                ) && (
                  <div
                    ref={validationSectionRef}
                    id="section-task-validation"
                    className={`p-5 rounded-2xl border-2 shadow-sm space-y-4 scroll-mt-6 ${
                      isProposed
                        ? 'border-amber-300 bg-amber-50/70 dark:bg-amber-950/30'
                        : isPendingValidation
                        ? 'border-emerald-300 bg-emerald-50/70 dark:bg-emerald-950/30'
                        : 'border-emerald-300/80 bg-emerald-50/60 dark:bg-emerald-950/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`material-symbols-outlined text-[24px] ${
                          isProposed ? 'text-amber-700' : isPendingValidation ? 'text-emerald-700' : 'text-emerald-700'
                        }`}>
                          {isProposed ? 'pending_actions' : 'verified'}
                        </span>
                        <h3 className="font-headline-sm text-sm sm:text-base font-bold text-forest-deep dark:text-slate-100">
                          {isProposed
                            ? 'Arbitrage de la Proposition de Tâche'
                            : isPendingValidation
                            ? 'Arbitrage & Clôture de la Mission'
                            : 'Validation de la Mission'}
                        </h3>
                      </div>
                      {getTaskStatusMeta(task).status === 'PROPOSED' ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                          <span className="w-2 h-2 rounded-full bg-amber-600 animate-pulse"></span>
                          En attente de validation
                        </span>
                      ) : getTaskStatusMeta(task).status === 'PENDING_VALIDATION' ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
                          En attente d'archivage
                        </span>
                      ) : getTaskStatusMeta(task).status === 'DONE' ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
                          <span className="w-2 h-2 rounded-full bg-slate-500"></span>
                          Archivée
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-sky-100 text-sky-800 border border-sky-200">
                          <span className="w-2 h-2 rounded-full bg-sky-600"></span>
                          En cours
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-on-surface-variant leading-relaxed">
                      {isProposed
                        ? "Cette tâche a été proposée par un associé. Les coordinateurs peuvent l'examiner, la compléter (documents, sous-tâches, assignés) puis l'accepter ou la refuser."
                        : isPendingValidation
                        ? "Le membre en charge a déclaré la réalisation des travaux. Les coordinateurs statutaires peuvent confirmer l'archivage ou renvoyer en cours pour corrections."
                        : "Vous êtes l'associé en charge de cette mission. Une fois vos travaux achevés et vos justificatifs joints, validez la mission pour la soumettre à l'arbitrage des coordinateurs."}
                    </p>

                    {/* Bloc d'attribution équitable & multi-sélection des membres (Annotation 3) */}
                    {isProposed && isCoordinator && (
                      <div className="p-3.5 bg-white/90 dark:bg-slate-900/80 rounded-xl border border-emerald-300 dark:border-emerald-700/60 text-xs space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 font-bold text-forest-deep dark:text-emerald-300">
                          <span className="flex items-center gap-1.5">
                            <span>⚖️</span>
                            <span>Attribution de la mission — Membres associés (triés par équité de charge) :</span>
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 font-semibold border border-emerald-300">
                            {selectedValidationMembers.length} sélectionné{selectedValidationMembers.length > 1 ? 's' : ''} sur 7
                          </span>
                        </div>

                        <p className="text-[11px] text-on-surface-variant">
                          Cochez un ou plusieurs associés en charge de cette mission. Les associés sont classés par priorité d'équité selon l'occupation et les corvées accomplies.
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {sortedAssociatesByEquity.map((associate, idx) => {
                            const isSelected = selectedValidationMembers.includes(associate.name);
                            const isTop1 = idx === 0;

                            return (
                              <button
                                key={`assoc-${associate.name}`}
                                type="button"
                                onClick={() => handleToggleValidationMember(associate.name)}
                                className={`p-2.5 rounded-xl border text-left flex items-center justify-between gap-2.5 transition-all cursor-pointer select-none ${
                                  isSelected
                                    ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500 shadow-xs ring-1 ring-emerald-500/30'
                                    : 'bg-canvas-slate/60 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  {/* Checkbox stylée */}
                                  <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${
                                    isSelected
                                      ? 'bg-emerald-600 border-emerald-600 text-white'
                                      : 'border-slate-400 bg-white dark:bg-slate-800'
                                  }`}>
                                    {isSelected && (
                                      <span className="material-symbols-outlined text-[14px]">check</span>
                                    )}
                                  </div>

                                  <div className="min-w-0 flex flex-col">
                                    <div className="flex items-center gap-1.5">
                                      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 font-bold ${
                                        isTop1 ? 'bg-emerald-700 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                                      }`}>
                                        {idx + 1}
                                      </span>
                                      <span className="font-semibold text-on-surface dark:text-slate-100 truncate text-xs">
                                        {associate.name}
                                      </span>
                                    </div>
                                    {associate.reason && (
                                      <span className="text-[10px] text-on-surface-variant truncate pl-5">
                                        {associate.reason}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {isTop1 && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 shrink-0">
                                    Top 1
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>

                        {selectedValidationMembers.length === 0 ? (
                          <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">warning</span>
                            <span>Veuillez sélectionner au moins un membre associé pour pouvoir approuver cette tâche.</span>
                          </p>
                        ) : (
                          <p className="text-[11px] text-emerald-900/90 dark:text-emerald-300/90">
                            ℹ️ La tâche sera assignée à : <strong>{selectedValidationMembers.join(', ')}</strong>.
                          </p>
                        )}
                      </div>
                    )}

                    <div className="pt-2 flex flex-wrap items-center gap-3">
                      {/* Cas 1 : Tâche proposée (orange) - Arbitrage coordinateur */}
                      {isProposed && isCoordinator && (
                        <>
                          <button
                            type="button"
                            disabled={selectedValidationMembers.length === 0}
                            onClick={handleAcceptModalTask}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs sm:text-sm shadow-md transition-all cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[18px]">check</span>
                            <span>Approuver la tâche{selectedValidationMembers.length > 0 ? ` (${selectedValidationMembers.length})` : ''}</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleRejectModalTask}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-rose-50 text-rose-700 border-2 border-rose-300 font-bold text-xs sm:text-sm shadow-sm transition-all cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[18px]">close</span>
                            <span>Rejeter</span>
                          </button>
                        </>
                      )}

                      {isProposed && !isCoordinator && (
                        <div className="text-xs font-semibold text-amber-900 bg-amber-100/70 p-3 rounded-xl border border-amber-300 w-full flex items-center gap-2">
                          <span className="material-symbols-outlined text-amber-700 text-[18px]">pending</span>
                          <span>Proposition à l'étude par les coordinateurs.</span>
                        </div>
                      )}

                      {/* Cas 2 : Tâche en cours (bleu) - Callout & Bouton 'Valider la mission' STRICTEMENT réservé à l'associé en charge (Annotation 12) */}
                      {isOpenTask && !isPendingValidation && !isProposed && isAssignedToCurrentUser && (
                        <button
                          type="button"
                          onClick={handleRequestValidation}
                          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-md transition-all cursor-pointer active:scale-95"
                        >
                          <span className="material-symbols-outlined text-[18px]">check_circle</span>
                          <span>Valider la mission</span>
                        </button>
                      )}

                      {/* Cas 3 : Tâche à valider (vert) - Validation finale coordinateur */}
                      {isPendingValidation && isCoordinator && (
                        <>
                          <button
                            type="button"
                            onClick={handleValidateModalTask}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs sm:text-sm shadow-md transition-all cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[18px]">check_circle</span>
                            <span>Confirmer la réalisation &amp; Clôturer</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleInvalidateModalTask}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-amber-50 text-amber-900 border-2 border-amber-300 font-bold text-xs sm:text-sm shadow-sm transition-all cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[18px]">undo</span>
                            <span>Renvoyer en cours (corrections requises)</span>
                          </button>
                        </>
                      )}

                      {isPendingValidation && !isCoordinator && (
                        <div className="text-xs font-semibold text-emerald-900 bg-emerald-50 p-3 rounded-xl border border-emerald-200 w-full flex items-center gap-2">
                          <span className="material-symbols-outlined text-emerald-700 text-[18px]">hourglass_top</span>
                          <span>En attente d'arbitrage pour archivage par les coordinateurs.</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </div>
            )}

            {/* MODE ÉDITION */}
            {mode === 'edit' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                {/* Callout d'Henri pour Bug Report */}
                {isBugReportEffective && (
                  <div className="bg-amber-50/90 dark:bg-amber-950/40 border-2 border-amber-400 dark:border-amber-600 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3 animate-in fade-in duration-200">
                    <div className="flex items-center gap-2.5 text-amber-900 dark:text-amber-200">
                      <span className="material-symbols-outlined text-[24px] text-amber-700 dark:text-amber-400">
                        pest_control
                      </span>
                      <h4 className="font-headline-sm text-sm sm:text-base font-bold">
                        Message d'Henri Jamet — Traque aux bugs &amp; suggestions
                      </h4>
                    </div>
                    <div className="p-4 bg-white/90 dark:bg-slate-900/80 rounded-xl border border-amber-200 dark:border-amber-800/60 font-body-md text-xs sm:text-sm text-amber-950 dark:text-amber-100 leading-relaxed space-y-2">
                      <p>
                        Bien que j'ai fait tout mon possible pour rendre ce site aussi parfait que faire se peut, je crains qu'il n'y ait toujours d'ignobles bugs et de merveilleuses améliorations qui s'y cachent. Et j'ai besoin de vous pour les débusquer !!! Merci de préciser ci-dessous les comportements anormaux observés, les fonctionnalités rêvées, les optimisations à apporter etc.
                      </p>
                      <p className="font-bold">
                        Soyez franc.he.s, cruel.le.s, sans pitié.<br />
                        J'encaisserai.
                      </p>
                    </div>
                  </div>
                )}

                {/* Header d'édition (Sans boutons en haut - Annotation 2) */}
                <div className="bg-canvas-slate/60 border border-slate-200 p-3.5 rounded-xl flex items-center justify-between shadow-xs">
                  <div className="flex items-center gap-2.5">
                    <span className="material-symbols-outlined text-primary text-[22px]">
                      {isNewTask ? (isVoteInitiative ? 'how_to_vote' : 'add_task') : 'edit_document'}
                    </span>
                    <div>
                      <span className="font-bold text-xs sm:text-sm text-forest-deep block">
                        {isNewTask 
                          ? (isVoteInitiative ? 'Proposer une initiative au vote' : 'Nouvelle tâche — Saisie des informations') 
                          : `Mode Édition — Tâche #${task.ref || task.id}`}
                      </span>
                      <span className="text-[11px] text-on-surface-variant font-medium">
                        {isNewTask ? 'Remplissez le formulaire ci-dessous puis validez en bas de page' : 'Modifiez les champs nécessaires puis enregistrez en bas'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Section 1 : Gouvernance & Gestion technique (Pour Henri & Joséphine ou Initiative au vote) */}
                {(isCoordinator || isVoteInitiative || isNewTask) && (
                  <section className="bg-white border-2 border-emerald-600/30 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-forest-deep text-[22px]">admin_panel_settings</span>
                        <h3 className="font-headline-sm text-sm sm:text-base font-bold text-forest-deep">
                          {isVoteInitiative ? 'Paramètres du Scrutin' : 'Gouvernance & Gestion technique'}
                        </h3>
                      </div>
                    </div>

                    <div className={`grid gap-4 ${isVoteInitiative ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
                      <div className="flex flex-col gap-1">
                        <label className="font-label-md text-xs font-semibold text-on-surface">Sujet / Emplacement</label>
                        <CustomSelect
                          id="select-task-category"
                          value={editSubject}
                          onChange={(e) => setEditSubject(e.target.value)}
                          options={categoryOptions}
                          className="h-10 text-xs sm:text-sm"
                        />
                      </div>

                      {/* Annotation 3 : Charge de la tâche */}
                      {!isVoteInitiative && (
                        <div className="flex flex-col gap-1">
                          <label className="font-label-md text-xs font-semibold text-on-surface">Charge de la tâche</label>
                          <CustomSelect
                            value={editComplexity}
                            onChange={(e) => setEditComplexity(e.target.value)}
                            options={CHARGES}
                            className="h-10 text-xs sm:text-sm"
                          />
                        </div>
                      )}
                    </div>

                    {/* Annotation 8 & 17 : Membres attribués en mode tâche (gérés par les coordinateurs) */}
                    {!isVoteInitiative && isCoordinator && (
                      <div className="space-y-1.5">
                        <label className="font-label-md text-xs font-semibold text-on-surface">
                          Membres attribués
                        </label>
                        <div className="flex flex-wrap items-center gap-2 p-2.5 bg-canvas-slate rounded-xl border border-slate-300 min-h-[44px]">
                          {editMembers.map((m) => (
                            <span
                              key={m}
                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-slate-300 text-xs font-semibold text-on-surface shadow-xs"
                            >
                              <span className="w-2 h-2 rounded-full bg-primary"></span>
                              {m}
                              <button
                                type="button"
                                onClick={() => setEditMembers(editMembers.filter((item) => item !== m))}
                                className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-error ml-1 cursor-pointer"
                              >
                                ×
                              </button>
                            </span>
                          ))}

                          <div className="inline-block min-w-[170px]">
                            <CustomSelect
                              value=""
                              placeholder="+ Ajouter un membre"
                              placeholderClassName="text-emerald-800 font-semibold"
                              options={ALL_MEMBERS.filter((m) => !editMembers.includes(m))}
                              onChange={(e) => {
                                if (e.target.value && !editMembers.includes(e.target.value)) {
                                  setEditMembers([...editMembers, e.target.value]);
                                }
                              }}
                              className="min-h-0 h-[28px] py-0 px-2.5 text-xs bg-white border border-dashed border-emerald-600 rounded-full text-emerald-800 font-semibold hover:border-emerald-700 shadow-xs"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Presence on site required */}
                    <label className="flex items-center gap-3 p-3 bg-canvas-slate rounded-xl border border-slate-200 select-none cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editOnsitePresence}
                        onChange={(e) => setEditOnsitePresence(e.target.checked)}
                        className="w-4 h-4 rounded text-primary accent-primary cursor-pointer"
                      />
                      <div className="text-xs">
                        <strong className="text-forest-deep block">Présence requise sur place (sur le domaine)</strong>
                        <span className="text-on-surface-variant">Sera inscrite sur la feuille de route du prochain séjour</span>
                      </div>
                    </label>

                    {/* Annotation 1 : Récurrence de la tâche */}
                    {!isVoteInitiative && (
                      <div className="p-3.5 bg-canvas-slate rounded-xl border border-slate-200 space-y-3">
                        <label className="flex items-center gap-3 select-none cursor-pointer">
                          <input
                            type="checkbox"
                            id="toggle-task-recurring"
                            checked={editIsRecurring}
                            onChange={(e) => setEditIsRecurring(e.target.checked)}
                            className="w-4 h-4 rounded text-primary accent-primary cursor-pointer"
                          />
                          <div className="text-xs">
                            <strong className="text-forest-deep flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-[16px] text-primary">update</span>
                              Tâche récurrente (programmation périodique)
                            </strong>
                            <span className="text-on-surface-variant">Se reprogramme automatiquement selon l'intervalle configuré</span>
                          </div>
                        </label>

                        {editIsRecurring && (
                          <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center gap-3 animate-in fade-in duration-150">
                            <span className="text-xs font-medium text-on-surface">Répéter tous les</span>
                            <input
                              type="number"
                              id="input-recurrence-interval"
                              min={1}
                              max={365}
                              value={editRecurrenceInterval}
                              onChange={(e) => setEditRecurrenceInterval(Math.max(1, parseInt(e.target.value, 10) || 1))}
                              className="w-16 h-9 px-2.5 text-xs text-center font-bold bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                            <CustomSelect
                              id="select-recurrence-unit"
                              value={editRecurrenceUnit}
                              onChange={(e) => setEditRecurrenceUnit(e.target.value)}
                              options={[
                                { value: 'jours', label: 'Jour(s)' },
                                { value: 'semaines', label: 'Semaine(s)' },
                                { value: 'mois', label: 'Mois' },
                                { value: 'sejours', label: 'Séjour(s) sur le domaine' },
                              ]}
                              className="h-9 min-w-[150px] text-xs font-semibold"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Annotation 1 & 5 : Auto-attribution équitable */}
                    {!isVoteInitiative && (
                      <div className="space-y-3">
                        <label className="flex items-center gap-3 p-3.5 bg-canvas-slate rounded-xl border border-slate-200 select-none cursor-pointer">
                          <input
                            type="checkbox"
                            id="toggle-task-auto-assign"
                            checked={editAutoAssignByWorkload}
                            onChange={(e) => setEditAutoAssignByWorkload(e.target.checked)}
                            className="w-4 h-4 rounded text-primary accent-primary cursor-pointer"
                          />
                          <div className="text-xs">
                            <strong className="text-forest-deep flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-[16px] text-primary">balance</span>
                              Auto-attribution équitable (selon taux d'usage du domaine)
                            </strong>
                            <span className="text-on-surface-variant">Attribue la tâche à l'associé le plus disponible selon le ratio charge / présence sur le domaine</span>
                          </div>
                        </label>

                        {/* Annotation 5 : Top 3 des membres recommandés selon le domaine et l'équité */}
                        {editAutoAssignByWorkload && (
                          <div
                            id="block-top3-recommendations"
                            className="p-4 bg-emerald-50/70 dark:bg-emerald-950/20 border-2 border-emerald-300 dark:border-emerald-700/60 rounded-xl space-y-3 animate-in fade-in duration-200"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-forest-deep dark:text-emerald-200 flex items-center gap-1.5">
                                <span>🎯</span>
                                <span>Top 3 des membres recommandés pour cette mission :</span>
                              </span>
                              {loadingRecs && (
                                <span className="text-[11px] text-emerald-700 dark:text-emerald-300 animate-pulse font-medium">
                                  Calcul d'équité en cours...
                                </span>
                              )}
                            </div>

                            <div className="space-y-2">
                              {recommendations.slice(0, 3).map((rec, idx) => {
                                const rankNum = rec.rank || (idx + 1);
                                const isRank1 = rankNum === 1;
                                const isSelected = editMembers.includes(rec.name);
                                return (
                                  <div
                                    key={rec.name || idx}
                                    className={`flex items-center justify-between gap-2 p-2.5 rounded-lg border text-xs transition-all ${
                                      isRank1
                                        ? 'bg-white dark:bg-slate-900 border-emerald-400 dark:border-emerald-600 shadow-xs ring-1 ring-emerald-400/30'
                                        : 'bg-white/80 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                                        isRank1
                                          ? 'bg-emerald-700 text-white'
                                          : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                                      }`}>
                                        {rankNum}
                                      </span>
                                      <div className="min-w-0">
                                        <span className="font-bold text-on-surface">
                                          {rec.name}
                                        </span>
                                        {rec.reason && (
                                          <span className="text-on-surface-variant text-[11px] ml-1.5 font-medium">
                                            ({rec.reason})
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (isSelected) {
                                          setEditMembers(editMembers.filter((m) => m !== rec.name));
                                        } else {
                                          setEditMembers([...editMembers, rec.name]);
                                        }
                                      }}
                                      title={isSelected ? `Retirer ${rec.name}` : `Assigner ${rec.name}`}
                                      className={`shrink-0 px-2.5 py-0.5 text-[11px] font-semibold rounded-md border transition-colors cursor-pointer ${
                                        isSelected
                                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold'
                                          : 'bg-white hover:bg-emerald-50 text-emerald-800 border-emerald-300'
                                      }`}
                                    >
                                      {isSelected ? '✓ Assigné' : '+ Assigner'}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>

                            <p className="text-[11px] text-emerald-900/80 dark:text-emerald-300/80 leading-tight">
                              💡 En mode auto-attribution, la tâche sera automatiquement assignée au n°1 (<strong>{recommendations[0]?.name || 'Joséphine Jamet'}</strong>) lors de l'approbation de la mission.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                )}

                {/* Section 2 : Champs standards (accessibles aux membres) */}
                <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="font-headline-sm text-sm sm:text-base font-bold text-on-surface flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[20px]">assignment</span>
                      {isVoteInitiative ? "Détails de l'initiative soumise au vote" : "Champs standards"}
                    </h3>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-xs font-semibold text-on-surface">
                      {isVoteInitiative ? "Intitulé de l'initiative au vote" : "Titre de la tâche"}
                    </label>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder={isVoteInitiative ? "Ex: Rénovation Façade Est & Volets Presbytère" : "Titre de la tâche..."}
                      className="bg-white dark:bg-slate-800 rounded-lg px-3.5 py-2.5 text-xs sm:text-sm border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary font-medium"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-xs font-semibold text-on-surface">Description détaillée &amp; Justificatifs</label>
                    <textarea
                      rows={3}
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder={isVoteInitiative ? "Expliquez l'urgence, le contexte, l'impact sur la propriété et l'intérêt pour la SCI..." : "Description..."}
                      className="bg-white dark:bg-slate-800 rounded-lg px-3.5 py-2.5 text-xs sm:text-sm border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary leading-relaxed resize-y min-h-[120px]"
                    />
                  </div>

                  {/* Annotation 4 : Options de vote dynamiques et options statutaires obligatoires */}
                  {isVoteInitiative && (
                    <div className="space-y-3 pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="font-label-md text-xs font-semibold text-on-surface block">
                            Options de vote personnalisées
                          </label>
                          <span className="text-[11px] text-on-surface-variant font-medium">
                            Choix proposés aux associés pour ce scrutin
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setEditVoteOptions([...editVoteOptions, `Option ${editVoteOptions.length + 1}`])}
                          className="text-xs font-semibold text-emerald-800 bg-white border border-emerald-600 hover:bg-emerald-50 px-2.5 py-1 rounded-full cursor-pointer transition-colors shadow-xs flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-[14px]">add</span>
                          Ajouter une option
                        </button>
                      </div>

                      <div className="space-y-2">
                        {editVoteOptions.map((opt, idx) => (
                          <div key={idx} className="flex items-center gap-2 p-2 bg-canvas-slate rounded-xl border border-slate-200">
                            <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px] flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <input
                              type="text"
                              value={opt}
                              onChange={(e) => {
                                const updated = [...editVoteOptions];
                                updated[idx] = e.target.value;
                                setEditVoteOptions(updated);
                              }}
                              placeholder={`Libellé de l'option ${idx + 1}...`}
                              className="flex-1 bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-on-surface focus:outline-none focus:border-emerald-600 font-medium"
                            />
                            <button
                              type="button"
                              onClick={() => setEditVoteOptions(editVoteOptions.filter((_, i) => i !== idx))}
                              className="w-7 h-7 flex items-center justify-center text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                              title="Supprimer cette option"
                            >
                              <span className="material-symbols-outlined text-[16px]">delete</span>
                            </button>
                          </div>
                        ))}
                        {editVoteOptions.length === 0 && (
                          <p className="text-xs text-on-surface-variant italic py-1">
                            Aucune option personnalisée définie. Cliquez sur « Ajouter une option ».
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Annotation 3 : Sous-tâches & Checklists */}
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between">
                      <label className="font-label-md text-xs font-semibold text-on-surface">Sous-tâches &amp; Checklists</label>
                      <button
                        type="button"
                        onClick={addChecklistItem}
                        className="text-xs font-semibold text-emerald-800 bg-white border border-emerald-600 hover:bg-emerald-50 px-2.5 py-1 rounded-full cursor-pointer transition-colors shadow-xs flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[14px]">add</span>
                        Ajouter une sous-tâche
                      </button>
                    </div>

                    <div className="space-y-2">
                      {editChecklist.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2 p-2 bg-canvas-slate rounded-xl border border-slate-200">
                          <input
                            type="checkbox"
                            checked={item.done}
                            onChange={() => {
                              const updated = [...editChecklist];
                              updated[idx] = { ...updated[idx], done: !updated[idx].done };
                              setEditChecklist(updated);
                            }}
                            className="w-4 h-4 rounded text-primary accent-primary cursor-pointer shrink-0"
                          />
                          <input
                            type="text"
                            value={item.text}
                            onChange={(e) => updateChecklistText(idx, e.target.value)}
                            placeholder="Libellé de la sous-tâche..."
                            className="flex-1 bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-on-surface focus:outline-none focus:border-emerald-600"
                          />
                          <button
                            type="button"
                            onClick={() => removeChecklistItem(idx)}
                            className="w-7 h-7 flex items-center justify-center text-error hover:bg-error-container/30 rounded-lg cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[16px]">close</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                {/* Section 3 : Documents & Pièces jointes (Annotations 12, 13 & 14) */}
                <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="font-headline-sm text-sm sm:text-base font-bold text-on-surface flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-[20px]">folder_open</span>
                        <span>Documents &amp; Pièces jointes</span>
                      </h3>
                      <p className="font-body-md text-xs text-on-surface-variant">
                        Plans, factures, justificatifs, photos ou liens web (PDF, PNG, JPG, URL)
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDroppedFileForUpload(null);
                          setIsUploadDocModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">upload_file</span>
                        <span>Ajouter un nouveau document</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsSelectExistingDocModalOpen(true)}
                        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-white border border-slate-300 hover:border-emerald-600 hover:text-emerald-800 text-slate-700 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">library_books</span>
                        <span>Sélectionner un document existant</span>
                      </button>
                    </div>
                  </div>

                  {/* Zone de téléversement Drag & Drop unifiée avec UploadDocumentModal */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(false);
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        setDroppedFileForUpload(e.dataTransfer.files[0]);
                        setIsUploadDocModalOpen(true);
                      }
                    }}
                    onClick={() => {
                      setDroppedFileForUpload(null);
                      setIsUploadDocModalOpen(true);
                    }}
                    className={`border-2 border-dashed rounded-xl p-4 text-center transition-all bg-canvas-slate/50 cursor-pointer ${
                      dragOver ? 'border-primary bg-sage-soft/30' : 'border-slate-300 hover:border-primary/60'
                    }`}
                  >
                    <div className="flex flex-col items-center justify-center gap-1.5 py-1 select-none">
                      <span className="material-symbols-outlined text-[26px] text-primary">cloud_upload</span>
                      <p className="text-xs font-bold text-on-surface">
                        Glissez-déposez vos fichiers ici ou <span className="text-primary underline">parcourez</span>
                      </p>
                      <p className="text-[11px] text-outline">
                        Supports acceptés : PDF, PNG, JPG, WEBP (indexation administrative officielle)
                      </p>
                    </div>
                  </div>

                  {/* Liste des documents attachés, liens web et clés-valeurs fusionnés (Annotations 14 & 5) */}
                  {(editDocuments.length > 0 || editExternalLinks.length > 0 || editKeyValues.length > 0) && (
                    <div className="flex flex-col gap-2 pt-1">
                      {editDocuments.map((docItem, idx) => {
                        const norm = normalizeDocItem(docItem, idx);
                        return (
                          <div
                            key={norm.id || idx}
                            className="p-3 bg-canvas-slate rounded-xl flex items-center justify-between gap-3 shadow-xs border border-slate-200"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-xl bg-error-container/40 text-error flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-[20px]">
                                  {norm.type === 'Image' ? 'image' : (norm.type === 'Text' ? 'description' : 'picture_as_pdf')}
                                </span>
                              </div>
                              <div className="min-w-0">
                                <p className="font-label-md text-xs font-semibold text-on-surface truncate" title={norm.name}>
                                  {norm.name}
                                </p>
                                <p className="font-body-md text-[11px] text-outline">
                                  {norm.type || 'Document'} {norm.size ? `• ${norm.size}` : ''}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleViewDocument(norm)}
                                className="h-8 px-2.5 rounded-lg bg-surface-container-lowest border border-primary text-primary text-xs font-semibold hover:bg-sage-soft transition-colors flex items-center gap-1 cursor-pointer"
                                title="Consulter sans télécharger"
                              >
                                <span className="material-symbols-outlined text-[15px]">visibility</span>
                                <span className="hidden sm:inline">Consulter</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDownloadDoc(norm)}
                                className="h-8 px-2.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-forest-deep transition-colors flex items-center gap-1 cursor-pointer shadow-xs"
                                title="Télécharger une copie"
                              >
                                <span className="material-symbols-outlined text-[15px]">download</span>
                                <span className="hidden sm:inline">Télécharger</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveDocument(idx)}
                                className="h-8 w-8 rounded-lg bg-rose-50 border border-rose-300 text-rose-700 hover:bg-rose-100 transition-colors flex items-center justify-center cursor-pointer shadow-xs"
                                title="Détacher / Supprimer ce document"
                              >
                                <span className="material-symbols-outlined text-[16px]">delete</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {/* Liens web fusionnés (Annotation 14) */}
                      {editExternalLinks.map((linkItem, lIdx) => {
                        const linkUrl = typeof linkItem === 'string' ? linkItem : (linkItem?.url || '');
                        const linkTitle = (typeof linkItem === 'object' && linkItem?.title) ? linkItem.title : (linkUrl || 'Ressource web');
                        return (
                          <div
                            key={`edit-link-${lIdx}`}
                            className="p-3 bg-canvas-slate rounded-xl flex items-center justify-between gap-3 shadow-xs border border-slate-200"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 flex items-center justify-center shrink-0 border border-sky-200 dark:border-sky-800/60">
                                <span className="material-symbols-outlined text-[20px]">language</span>
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-label-md text-xs font-semibold text-on-surface truncate" title={linkTitle}>
                                    {linkTitle}
                                  </p>
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200 border border-sky-200 shrink-0">
                                    Lien web
                                  </span>
                                </div>
                                <a
                                  href={linkUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-body-md text-[11px] text-primary hover:underline truncate block"
                                  title={linkUrl}
                                >
                                  {linkUrl}
                                </a>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <a
                                href={linkUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="h-8 px-2.5 rounded-lg bg-surface-container-lowest border border-sky-400 text-sky-800 text-xs font-semibold hover:bg-sky-50 transition-colors flex items-center gap-1 cursor-pointer"
                                title="Ouvrir dans un nouvel onglet"
                              >
                                <span className="material-symbols-outlined text-[15px]">open_in_new</span>
                                <span className="hidden sm:inline">Ouvrir</span>
                              </a>
                              <button
                                type="button"
                                onClick={() => setEditExternalLinks(prev => prev.filter((_, idx) => idx !== lIdx))}
                                className="h-8 w-8 rounded-lg bg-rose-50 border border-rose-300 text-rose-700 hover:bg-rose-100 transition-colors flex items-center justify-center cursor-pointer shadow-xs"
                                title="Supprimer ce lien web"
                              >
                                <span className="material-symbols-outlined text-[16px]">delete</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {/* Clés-valeurs fusionnées (Annotation 5) */}
                      {editKeyValues.length > 0 && (
                        <KeyValueAttachmentList
                          items={editKeyValues}
                          onChange={setEditKeyValues}
                          isEditing={true}
                          hideForm={true}
                          hideList={false}
                          title="Informations clés & Coordonnées attachées"
                        />
                      )}
                    </div>
                  )}

                  {/* Formulaire d'ajout de ressource web directement dans la section Documents (Annotation 14) */}
                  <div className="pt-3 border-t border-slate-100">
                    <ExternalLinksSection
                      links={editExternalLinks}
                      onChange={setEditExternalLinks}
                      isEditing={true}
                      hideList={true}
                      title="Ajouter un lien web ou ressource en ligne"
                    />
                  </div>

                  {/* Formulaire d'ajout de clé-valeur (Annotation 5 : DRY Tâches & Votes) */}
                  <div className="pt-3 border-t border-slate-100">
                    <KeyValueAttachmentList
                      items={editKeyValues}
                      onChange={setEditKeyValues}
                      isEditing={true}
                      hideList={true}
                      title="Ajouter une information clé (Entreprise, téléphone, email...)"
                    />
                  </div>
                </section>

                {/* Footer formulaire fixé / sticky en bas (Annotation 6) */}
                <footer className="sticky bottom-0 z-20 pt-4 pb-4 px-5 sm:px-7 -mx-5 sm:-mx-7 -mb-5 sm:-mb-7 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-surface-container-lowest/95 backdrop-blur-sm shadow-md">
                  <p className="text-xs text-on-surface-variant font-medium">
                    {isNewTask ? "Veuillez vérifier l'ensemble des informations saisies avant de soumettre la tâche." : "Enregistrez pour valider les modifications apportées à la tâche."}
                  </p>
                  <div className="flex items-center gap-2.5 ml-auto">
                    <button
                      type="button"
                      onClick={() => (isNewTask ? handleSafeClose() : setMode('view'))}
                      className="px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs sm:text-sm font-semibold hover:bg-slate-100 transition-colors cursor-pointer shadow-xs"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      disabled={savingEdit}
                      onClick={handleSaveEdit}
                      className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {isNewTask ? (isVoteInitiative ? 'how_to_vote' : 'add_circle') : 'check_circle'}
                      </span>
                      <span>
                        {isNewTask ? (isVoteInitiative ? "Soumettre l'initiative au vote" : "Créer la tâche") : "Enregistrer"}
                      </span>
                    </button>
                  </div>
                </footer>

              </div>
            )}

          </section>

          {/* ========================================================= */}
          {/* COLONNE DROITE (5 cols) : FIL DE DISCUSSION UNIFIÉ (CHAT)  */}
          {/* Toujours présent, même lors de la rédaction d'initiative  */}
          {/* ========================================================= */}
          <section className="w-full lg:col-span-5 bg-canvas-slate flex flex-col shrink-0 lg:shrink lg:h-full min-h-0">
            {/* Header accordéon sur mobile uniquement */}
            <button
              type="button"
              onClick={() => setIsMobileChatOpen((prev) => !prev)}
              className="lg:hidden w-full px-4 py-3 bg-surface-container-high flex items-center justify-between border-t border-b border-border-subtle text-xs font-bold text-on-surface cursor-pointer select-none"
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-primary">forum</span>
                <span>Fil de discussion familial</span>
                {comments && comments.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-primary/10 text-primary font-bold">
                    {comments.length}
                  </span>
                )}
              </div>
              <span className="material-symbols-outlined text-[18px]">
                {isMobileChatOpen ? 'expand_less' : 'expand_more'}
              </span>
            </button>

            {/* Conteneur chat : replié par défaut sur mobile, toujours ouvert sur desktop */}
            <div className={`${isMobileChatOpen ? 'flex h-[420px]' : 'hidden'} lg:flex lg:h-full flex-col min-h-0`}>
              <FamilyChat
                messages={comments}
                onSendMessage={handleSendCommentText}
                onAddReaction={handleEmojiReact}
                currentUser={currentUser}
                title="Fil de discussion familial"
                placeholder="Votre message à la famille..."
                onRetryMessage={handleRetryComment}
                onAttachClick={() => {
                  setDroppedFileForUpload(null);
                  setIsUploadDocModalOpen(true);
                }}
                className="h-full"
              />
            </div>
          </section>

        </div>

      </div>

      {/* ========================================== */}
      {/* 3. CLOSING PROTOCOL MODAL (SYNTHÈSE REQUIS) */}
      {/* ========================================== */}
      {isClosingModalOpen && (
        <div
          aria-modal="true"
          role="dialog"
          className="fixed inset-0 z-60 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-lg w-full shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="w-10 h-10 rounded-xl bg-sage-soft text-primary flex items-center justify-center">
                <span className="material-symbols-outlined text-[24px]">task_alt</span>
              </div>
              <div>
                <h3 className="font-headline-sm text-base sm:text-lg font-bold text-forest-deep">
                  Protocole de clôture de tâche
                </h3>
                <p className="text-xs text-on-surface-variant">
                  Commentaire de synthèse obligatoire pour archivage
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-on-surface block">
                Synthèse des travaux réalisés :
              </label>
              <textarea
                rows={4}
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                placeholder="Précisez le résultat final, la date d'achèvement et les éventuelles réserves..."
                className="w-full bg-canvas-slate rounded-xl p-3 text-xs sm:text-sm border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsClosingModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100 cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={closingSubmitting || !closeNotes.trim() || !isCoordinator}
                onClick={handleConfirmCloseTask}
                className="px-5 py-2 rounded-xl bg-white border-2 border-emerald-600 text-emerald-800 hover:bg-emerald-50 text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[16px]">archive</span>
                Confirmer la clôture
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visionneuse universelle intégrée pour les pièces jointes de la tâche (Annotation 9) */}
      <DocumentViewerModal
        isOpen={isViewerOpen}
        onClose={() => {
          setIsViewerOpen(false);
          setViewerDoc(null);
        }}
        document={viewerDoc}
        onDownload={handleDownloadDoc}
      />

      {/* Modale universelle d'upload administratif pour tâches (Annotation 10 & 11) */}
      <UploadDocumentModal
        isOpen={isUploadDocModalOpen}
        onClose={() => {
          setIsUploadDocModalOpen(false);
          setDroppedFileForUpload(null);
        }}
        targetTaskId={task?.id}
        defaultCategory="Travaux & Chantiers"
        currentUser={currentUser}
        initialFile={droppedFileForUpload}
        onUploadSuccess={handleUniversalUploadSuccess}
      />

      {/* Modale de sélection de documents déjà existants dans la SCI (Annotation 6) */}
      <SelectExistingDocumentModal
        isOpen={isSelectExistingDocModalOpen}
        onClose={() => setIsSelectExistingDocModalOpen(false)}
        targetTaskId={task?.id}
        alreadyAttachedDocIds={parseTaskDocuments(task?.documents || task?.completion_docs)}
        onAttachSuccess={handleAttachExistingDocs}
      />

    </div>
  );
}
