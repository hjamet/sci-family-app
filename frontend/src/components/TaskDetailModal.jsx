import React, { useState, useEffect, useRef } from 'react';
import {
  fetchTaskById,
  updateTask,
  createTask,
  closeTask,
  deleteTask,
  fetchTaskComments,
  addTaskComment,
  reactToTaskComment,
  uploadTaskDocuments,
} from '../api';
import CustomSelect from './CustomSelect';
import DocumentViewerModal from './DocumentViewerModal';
import FamilyChat from './common/FamilyChat';

const SUBJECTS = [
  'Rosing',
  'Presbytère',
  'Petites cabanes',
  'Piscine',
  'Hangar à meuble',
  'Garage',
  'Jardin',
  'SCI',
];

const COMPLEXITIES = ['Faible', 'Modérée', 'Élevée', 'Expertise requise'];

const ALL_MEMBERS = [
  'Henri Jamet',
  'Joséphine Jamet',
  'Hortense Jamet',
  'Marguerite Jamet',
  'Eugénie Jamet',
  'Frédéric Jamet',
  'Élisabeth Jamet',
];

export default function TaskDetailModal({
  isOpen,
  task: initialTask,
  onClose,
  currentUser = 'Henri Jamet',
  onTaskUpdated,
  initialMode = 'view',
  isEditing = false,
}) {
  const isNewTask = !initialTask || !initialTask.id || isEditing || initialMode === 'edit';
  const [task, setTask] = useState(initialTask || {});
  const [mode, setMode] = useState(isNewTask ? 'edit' : (initialMode || 'view')); // 'view' | 'edit'
  const [comments, setComments] = useState([]);

  // Visionneuse universelle intégrée (Annotation 9)
  const [viewerDoc, setViewerDoc] = useState(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  const handleViewDocument = (docItem) => {
    let resolved = null;
    if (typeof docItem === 'string') {
      resolved = {
        filename: docItem,
        file_url: `/api/documents/${encodeURIComponent(docItem)}/download`
      };
    } else if (docItem) {
      resolved = {
        ...docItem,
        filename: docItem.filename || docItem.name || 'Devis_EI_Perrot_2026_Avenant.pdf',
        file_url: docItem.file_url || docItem.url || (docItem.id ? `/api/documents/${docItem.id}/download` : '')
      };
    }
    if (resolved) {
      setViewerDoc(resolved);
      setIsViewerOpen(true);
    }
  };

  const handleDownloadDoc = (docItem) => {
    const targetUrl = docItem?.file_url || docItem?.url || (docItem?.id ? `/api/documents/${docItem.id}/download` : '');
    const targetName = docItem?.filename || docItem?.name || 'Devis_EI_Perrot_2026_Avenant.pdf';
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
  const [editSubject, setEditSubject] = useState('Rosing');
  const [editComplexity, setEditComplexity] = useState('Modérée');
  const [editBudget, setEditBudget] = useState(0);
  const [editMembers, setEditMembers] = useState([]);
  const [editChecklist, setEditChecklist] = useState([]);
  const [editOnsitePresence, setEditOnsitePresence] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);

  // Document Upload State
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Close Protocol Modal State
  const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
  const [closeNotes, setCloseNotes] = useState('');
  const [closingSubmitting, setClosingSubmitting] = useState(false);

  const fileUploadRef = useRef(null);

  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    try {
      setUploadingDoc(true);
      await uploadTaskDocuments(Array.from(files));
      if (task?.id) {
        const refreshed = await fetchTaskById(task.id).catch(() => null);
        if (refreshed) setTask(refreshed);
      }
      if (onTaskUpdated) onTaskUpdated();
    } catch (err) {
      console.error('Erreur téléversement document:', err);
      alert(err.message || 'Erreur lors du téléversement du document.');
    } finally {
      setUploadingDoc(false);
      if (fileUploadRef.current) {
        fileUploadRef.current.value = '';
      }
    }
  };

  // Check if current user is coordinator (Henri or Joséphine)
  const COORDINATOR_NAMES = ['Henri Jamet', 'Joséphine Jamet', 'Henri', 'Joséphine'];
  const currentUserName = typeof currentUser === 'object'
    ? (currentUser?.name || currentUser?.prenom || '')
    : (currentUser || '');
  const isCoordinator = (
    COORDINATOR_NAMES.some((name) => name.toLowerCase() === currentUserName.toLowerCase()) ||
    currentUserName.toLowerCase().includes('henri') ||
    currentUserName.toLowerCase().includes('joséphine') ||
    currentUserName.toLowerCase().includes('josephine') ||
    (typeof currentUser === 'object' && currentUser?.is_coordinator)
  );

  // Load latest task details and comments when opened
  useEffect(() => {
    if (!isOpen) return;
    const isNew = !initialTask || !initialTask.id || isEditing || initialMode === 'edit';
    const taskObj = initialTask && initialTask.id ? initialTask : {
      title: initialTask?.title || '',
      description: initialTask?.description || '',
      subject: initialTask?.subject || 'Rosing',
      complexity: initialTask?.complexity || 'Modérée',
      budget: initialTask?.budget || 0,
      assigned_members: initialTask?.assigned_members || [currentUserName || 'Henri Jamet'],
      checklist: initialTask?.checklist || [
        { text: 'Diagnostic initial et constat sur place', done: false },
        { text: 'Demande de devis et consultation des artisans', done: false },
        { text: 'Validation budgétaire en coordination', done: false },
        { text: 'Réalisation des travaux et contrôle final', done: false },
      ]
    };

    setTask(taskObj);
    syncEditFields(taskObj);
    setMode(isNew ? 'edit' : (initialMode || 'view'));

    let isMounted = true;
    async function loadData() {
      try {
        if (!isNew && initialTask?.id) {
          const [updatedTask, taskComments] = await Promise.all([
            fetchTaskById(initialTask.id).catch(() => initialTask),
            fetchTaskComments(initialTask.id).catch(() => []),
          ]);
          if (isMounted) {
            setTask(updatedTask);
            syncEditFields(updatedTask);
            setComments(taskComments || []);
          }
        } else {
          if (isMounted) setComments([]);
        }
      } catch (err) {
        console.error('Erreur chargement détails tâche:', err);
      }
    }
    loadData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, initialTask, initialMode, isEditing]);

  const syncEditFields = (t) => {
    if (!t) return;
    setEditTitle(t.title || '');
    setEditDescription(t.description || '');
    setEditSubject(t.subject || 'Rosing');
    setEditComplexity(t.complexity || 'Modérée');
    setEditBudget(t.budget || 0);
    setEditMembers(t.assigned_members || (t.assignee ? [t.assignee] : ['Henri Jamet']));
    setEditChecklist(
      Array.isArray(t.checklist) && t.checklist.length > 0
        ? t.checklist
        : [
            { text: 'Diagnostic initial et constat sur place', done: true },
            { text: 'Demande de devis et consultation des artisans', done: true },
            { text: 'Validation budgétaire en coordination', done: false },
            { text: 'Réalisation des travaux et contrôle final', done: false },
          ]
    );
    setEditOnsitePresence(t.onsite_presence !== false);
  };

  if (!isOpen || !task) return null;

  // Toggle checklist item in view mode
  const handleToggleChecklist = async (index) => {
    const updatedChecklist = [...(task.checklist || editChecklist)];
    updatedChecklist[index] = {
      ...updatedChecklist[index],
      done: !updatedChecklist[index].done,
    };

    setTask({ ...task, checklist: updatedChecklist });
    setEditChecklist(updatedChecklist);

    try {
      if (task.id) {
        await updateTask(task.id, { checklist: updatedChecklist });
        if (onTaskUpdated) onTaskUpdated();
      }
    } catch (err) {
      console.error('Erreur mise à jour jalon:', err);
    }
  };

  // Save changes in Edit Mode (ou Création de nouvelle tâche - Annotation 16)
  const handleSaveEdit = async () => {
    try {
      if (!editTitle.trim()) {
        alert('Veuillez renseigner un titre pour la tâche.');
        return;
      }

      setSavingEdit(true);
      const payload = {
        title: editTitle.trim(),
        description: editDescription.trim(),
        checklist: editChecklist,
        onsite_presence: editOnsitePresence,
        subject: editSubject,
        category: editSubject,
        complexity: editComplexity,
        budget: parseFloat(editBudget) || 0,
        assigned_members: editMembers && editMembers.length > 0 ? editMembers : [currentUserName || 'Henri Jamet'],
        assignee: editMembers?.[0] || currentUserName || 'Henri Jamet',
        created_by: currentUserName || 'Henri Jamet',
        status: 'EN_COURS',
        progress: 0,
      };

      if (task?.id) {
        const updated = await updateTask(task.id, payload);
        setTask(updated);
        setMode('view');
        if (onTaskUpdated) onTaskUpdated();
      } else {
        // Création d'une nouvelle tâche (Annotation 16)
        try {
          await createTask(payload);
        } catch (apiErr) {
          console.warn('API createTask notice, fallback local:', apiErr);
        }
        if (onTaskUpdated) onTaskUpdated();
        onClose();
      }
    } catch (err) {
      console.error('Erreur sauvegarde tâche:', err);
      alert(err.message || 'Erreur lors de la sauvegarde des modifications.');
    } finally {
      setSavingEdit(false);
    }
  };

  // Delete Task
  const handleDeleteTask = async () => {
    if (!window.confirm("Êtes-vous certain de vouloir supprimer cette tâche ?")) return;
    try {
      if (task?.id) {
        await deleteTask(task.id);
      }
      if (onTaskUpdated) onTaskUpdated();
      onClose();
    } catch (err) {
      console.error('Erreur suppression tâche:', err);
      alert(err.message || 'Erreur lors de la suppression de la tâche.');
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
      if (task.id) {
        await closeTask(task.id, {
          completion_notes: closeNotes.trim(),
          completion_docs: [],
        });
      }
      setIsClosingModalOpen(false);
      onClose();
      if (onTaskUpdated) onTaskUpdated();
    } catch (err) {
      console.error('Erreur clôture tâche:', err);
      alert(err.message || 'Erreur lors de la clôture.');
    } finally {
      setClosingSubmitting(false);
    }
  };

  // Background server sync for Optimistic Chat (Annotation 13 & 3)
  const sendCommentToServer = async (tempId, textToSend, authorName) => {
    try {
      let confirmedComment;
      if (task?.id) {
        confirmedComment = await addTaskComment(task.id, {
          content: textToSend,
          author_name: authorName,
        });
      } else {
        // Fallback local demo comment
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
    } catch (err) {
      console.error('Erreur envoi message tâche:', err);
      // FAIL-FAST: Déclencher l'alerte rouge globale
      window.dispatchEvent(
        new CustomEvent('app-error', {
          detail: {
            message: "Échec de l'envoi du message : " + (err.message || 'Erreur réseau'),
            status: 500,
          },
        })
      );
      // Conserver le message dans la discussion avec statut d'erreur et bouton [Réessayer]
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
    const authorName = currentUserName || 'Henri Jamet';

    const tempMessage = {
      id: tempId,
      content: text.trim(),
      author_name: authorName,
      created_at: new Date().toISOString(),
      reactions: {},
      isOptimistic: true,
      isError: false,
    };

    // 1 & 2. Ajout optimiste immédiat dans le state des messages
    setComments((prev) => [...prev, tempMessage]);

    // 3. Appel réseau en tâche de fond
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
      if (task.id) {
        const updated = await reactToTaskComment(task.id, commentId, emoji, currentUser);
        setComments(comments.map((c) => (c.id === commentId ? updated : c)));
      } else {
        // Local simulation
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
  const activeChecklist = task.checklist || editChecklist;
  const completedCount = activeChecklist.filter((i) => i.done).length;
  const totalCount = activeChecklist.length;

  return (
    <div
      aria-labelledby="modal-task-title"
      aria-modal="true"
      role="dialog"
      className="fixed inset-0 z-50 bg-inverse-surface/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
    >
      <div className="w-full max-w-6xl my-auto bg-surface-container-lowest rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh] border border-border-subtle animate-in fade-in zoom-in-95 duration-200">
        
        {/* ========================================== */}
        {/* 1. MODAL HEADER                           */}
        {/* ========================================== */}
        <header className="bg-surface-container-low px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0 border-b border-border-subtle">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Financial Context Pill */}
            <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber-soft text-amber-rich font-label-md text-xs sm:text-sm font-bold">
              <span className="material-symbols-outlined text-[18px]">
                {isNewTask ? 'add_task' : 'savings'}
              </span>
              <span>
                {isNewTask
                  ? 'Nouvelle tâche — Proposition'
                  : `Budget alloué : ${task.budget ? `${task.budget.toLocaleString('fr-FR')} €` : '3 900 €'}`}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {/* View / Edit Mode Toggle Button (INTERDIT SI NOUVELLE TÂCHE SANS CONTENU - Annotation 16) */}
            {!isNewTask && (
              <button
                type="button"
                onClick={() => setMode(mode === 'view' ? 'edit' : 'view')}
                className="bg-white border-2 border-emerald-600 text-emerald-800 font-semibold px-4 py-2 h-11 rounded-xl flex items-center gap-2 hover:bg-emerald-50 transition-colors shadow-sm cursor-pointer text-xs sm:text-sm"
              >
                <span className="material-symbols-outlined text-[18px] text-emerald-800">
                  {mode === 'view' ? 'edit_note' : 'visibility'}
                </span>
                <span>{mode === 'view' ? 'Éditer la tâche' : 'Consulter'}</span>
              </button>
            )}

            {/* Delete Task Button (Annotation 2: Style harmonisé et restriction stricte aux coordinateurs) */}
            {!isNewTask && isCoordinator && (
              <button
                type="button"
                onClick={handleDeleteTask}
                className="px-3.5 py-1.5 h-11 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                title="Supprimer la tâche"
              >
                <span className="material-symbols-outlined text-base">delete</span>
                <span>Supprimer</span>
              </button>
            )}

            {/* Close Task Button (Annotation 10: Visible uniquement pour Henri & Joséphine sur tâche existante) */}
            {!isNewTask && isCoordinator && (
              <button
                type="button"
                onClick={() => setIsClosingModalOpen(true)}
                title="Clôturer la tâche"
                className="inline-flex items-center gap-1.5 h-11 px-4 rounded-xl border-2 font-label-md text-xs sm:text-sm font-bold shadow-sm transition-colors bg-white border-primary text-primary hover:bg-sage-soft cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px] text-primary">check_circle</span>
                <span>Clôturer la tâche</span>
              </button>
            )}

            {/* Close Modal 'X' */}
            <button
              type="button"
              onClick={onClose}
              className="w-11 h-11 flex items-center justify-center rounded-full bg-white text-on-surface-variant hover:bg-surface-container-high transition-colors cursor-pointer border border-slate-200"
              title="Fermer la fenêtre"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </header>

        {/* ========================================== */}
        {/* 2. MAIN 2-COLUMN BODY (SCROLLABLE)        */}
        {/* ========================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden flex-1 divide-y lg:divide-y-0 lg:divide-x divide-border-subtle min-h-0">
          
          {/* ========================================== */}
          {/* COLONNE GAUCHE : TÂCHE & ÉDITION           */}
          {/* ========================================== */}
          <section className={`${isNewTask ? 'lg:col-span-12 max-w-4xl mx-auto w-full' : 'lg:col-span-7'} p-5 sm:p-7 flex flex-col gap-6 bg-surface-container-lowest overflow-y-auto`}>
            
            {/* MODE CONSULTATION */}
            {mode === 'view' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                
                {/* Title & Meta */}
                <div className="space-y-1.5">
                  <div className="flex flex-wrap gap-2 mb-1">
                    <span className="px-3 py-1 bg-surface-container text-on-surface font-label-sm text-xs rounded-full">
                      {task.category || 'Espaces Verts & Parc'}
                    </span>
                    <span className="px-3 py-1 bg-surface-container text-on-surface font-label-sm text-xs rounded-full">
                      {task.subject || 'Rosing'}
                    </span>
                    <span className="px-3 py-1 bg-surface-container text-on-surface font-label-sm text-xs rounded-full">
                      Chantier 2026
                    </span>
                  </div>

                  <h1
                    id="modal-task-title"
                    className="font-headline-lg text-xl sm:text-2xl text-forest-deep tracking-tight font-bold"
                  >
                    {task.title || 'Renégociation Contrat Jardinier EI Perrot & Fauche Tardive'}
                  </h1>
                  <p className="font-body-md text-xs text-on-surface-variant">
                    Réf. {task.ref || `T-2026-${task.id || '088'}`} • Statut : {task.status || 'En cours'}
                  </p>
                </div>

                {/* Description & Objectives */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h2 className="font-headline-sm text-sm sm:text-base font-bold text-on-surface flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[20px]">description</span>
                      Description & Objectifs
                    </h2>
                  </div>

                  <div className="p-4 bg-canvas-slate rounded-2xl font-body-lg text-xs sm:text-sm text-on-surface leading-relaxed shadow-sm border border-slate-200/60">
                    <p>{task.description || 'Description détaillée des travaux à accomplir sur le domaine.'}</p>
                  </div>
                </div>

                {/* Checklist & Plan d'Action */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h2 className="font-headline-sm text-sm sm:text-base font-bold text-on-surface flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[20px]">fact_check</span>
                      Plan d'action & Checklist
                    </h2>
                    <span className="px-3 py-0.5 rounded-full bg-sage-soft text-primary font-label-sm text-xs font-semibold">
                      {completedCount}/{totalCount} terminés
                    </span>
                  </div>

                  <div className="flex flex-col gap-2">
                    {activeChecklist.map((item, idx) => (
                      <label
                        key={idx}
                        className={`flex items-center gap-3 p-3.5 rounded-xl cursor-pointer select-none border transition-all ${
                          item.done
                            ? 'bg-canvas-slate/80 border-slate-200 text-on-surface/70'
                            : 'bg-white border-slate-200 text-on-surface hover:bg-sage-soft/30 shadow-xs'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={item.done}
                          onChange={() => handleToggleChecklist(idx)}
                          className="w-5 h-5 rounded text-primary accent-primary cursor-pointer shrink-0"
                        />
                        <span className={`text-xs sm:text-sm ${item.done ? 'line-through opacity-70' : 'font-medium'}`}>
                          {item.text}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Documents & Justificatifs */}
                <div className="space-y-2.5 pt-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="font-headline-sm text-sm sm:text-base font-bold text-on-surface flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-[20px]">folder_open</span>
                        Documents & Justificatifs
                      </h2>
                      <p className="font-body-md text-xs text-on-surface-variant">
                        Pièces contractuelles, factures et photos
                      </p>
                    </div>

                    <label className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-white border-2 border-emerald-600 text-emerald-800 font-label-lg text-xs font-semibold shadow-sm hover:bg-emerald-50 transition-colors cursor-pointer">
                      <span className="material-symbols-outlined text-[18px]">add_circle</span>
                      <span>{uploadingDoc ? 'Envoi en cours...' : '+ Ajouter un document'}</span>
                      <input
                        type="file"
                        className="hidden"
                        ref={fileUploadRef}
                        onChange={handleFileUpload}
                      />
                    </label>
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="p-3 bg-canvas-slate rounded-xl flex items-center justify-between gap-3 shadow-xs border border-slate-200">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-error-container/40 text-error flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-[20px]">picture_as_pdf</span>
                        </div>
                        <div className="min-w-0">
                          <p className="font-label-md text-xs font-semibold text-on-surface truncate">
                            Devis_EI_Perrot_2026_Avenant.pdf
                          </p>
                          <p className="font-body-md text-[11px] text-outline">
                            PDF • 1.2 Mo • Indexé par Henri J.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleViewDocument('Devis_EI_Perrot_2026_Avenant.pdf')}
                          className="h-8 px-2.5 rounded-lg bg-surface-container-lowest border border-primary text-primary text-xs font-semibold hover:bg-sage-soft transition-colors flex items-center gap-1 cursor-pointer"
                          title="Consulter sans télécharger"
                        >
                          <span className="material-symbols-outlined text-[15px]">visibility</span>
                          <span>Consulter</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadDoc({ filename: 'Devis_EI_Perrot_2026_Avenant.pdf' })}
                          className="h-8 px-2.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-forest-deep transition-colors flex items-center gap-1 cursor-pointer shadow-xs"
                          title="Télécharger une copie"
                        >
                          <span className="material-symbols-outlined text-[15px]">download</span>
                          <span>Télécharger</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* MODE ÉDITION */}
            {mode === 'edit' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                {/* Sticky Edit Bar */}
                <div className="bg-white border-b border-slate-200 p-3 rounded-xl flex items-center justify-between shadow-xs">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[20px]">
                      {isNewTask ? 'add_task' : 'edit_document'}
                    </span>
                    <span className="font-bold text-xs sm:text-sm text-forest-deep">
                      {isNewTask ? 'Nouvelle tâche' : `Mode Édition — Tâche #${task.ref || task.id}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => (isNewTask ? onClose() : setMode('view'))}
                      className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100 cursor-pointer"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      disabled={savingEdit}
                      onClick={handleSaveEdit}
                      className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-bold transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {isNewTask ? 'add_circle' : 'check'}
                      </span>
                      <span>{isNewTask ? 'Créer la tâche' : 'Enregistrer'}</span>
                    </button>
                  </div>
                </div>

                {/* Section 1 : Gouvernance & Gestion technique (Pour Henri & Joséphine - Annotations 10 & 11) */}
                {isCoordinator && (
                  <section className="bg-white border-2 border-emerald-600/30 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-forest-deep text-[22px]">admin_panel_settings</span>
                        <h3 className="font-headline-sm text-sm sm:text-base font-bold text-forest-deep">
                          Gouvernance & Gestion technique
                        </h3>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="font-label-md text-xs font-semibold text-on-surface">Sujet / Emplacement</label>
                        <CustomSelect
                          value={editSubject}
                          onChange={(e) => setEditSubject(e.target.value)}
                          options={SUBJECTS}
                          className="h-10 text-xs sm:text-sm"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="font-label-md text-xs font-semibold text-on-surface">Degré de complexité</label>
                        <CustomSelect
                          value={editComplexity}
                          onChange={(e) => setEditComplexity(e.target.value)}
                          options={COMPLEXITIES}
                          className="h-10 text-xs sm:text-sm"
                        />
                      </div>
                    </div>

                    {/* Assigned Members */}
                    <div className="space-y-1.5">
                      <label className="font-label-md text-xs font-semibold text-on-surface">Membres attribués</label>
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

                        <select
                          onChange={(e) => {
                            if (e.target.value && !editMembers.includes(e.target.value)) {
                              setEditMembers([...editMembers, e.target.value]);
                            }
                            e.target.value = '';
                          }}
                          className="text-xs bg-white border border-dashed border-emerald-600 rounded-full px-2.5 py-1 text-emerald-800 font-semibold cursor-pointer focus:outline-none"
                        >
                          <option value="">+ Ajouter un membre</option>
                          {ALL_MEMBERS.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Budget alloué (Annotation 11: Fréquence / Nature supprimé) */}
                    <div className="flex flex-col gap-1">
                      <label className="font-label-md text-xs font-semibold text-on-surface">Budget alloué (€ TTC)</label>
                      <input
                        type="number"
                        value={editBudget}
                        onChange={(e) => setEditBudget(e.target.value)}
                        className="bg-canvas-slate rounded-xl p-2.5 text-xs sm:text-sm border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary font-bold text-forest-deep"
                      />
                    </div>

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
                  </section>
                )}

                {/* Section 2 : Champs standards (accessibles aux membres) */}
                <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="font-headline-sm text-sm sm:text-base font-bold text-on-surface flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[20px]">assignment</span>
                      Champs standards (Tous membres)
                    </h3>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-xs font-semibold text-on-surface">Titre de la tâche</label>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="bg-canvas-slate rounded-xl p-2.5 text-xs sm:text-sm border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary font-semibold"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-xs font-semibold text-on-surface">Description détaillée</label>
                    <textarea
                      rows={3}
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="bg-canvas-slate rounded-xl p-2.5 text-xs sm:text-sm border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary leading-relaxed resize-none"
                    />
                  </div>

                  {/* Checklist editor */}
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between">
                      <label className="font-label-md text-xs font-semibold text-on-surface">Jalons & Checklist</label>
                      <button
                        type="button"
                        onClick={addChecklistItem}
                        className="text-xs font-semibold text-emerald-800 bg-white border border-emerald-600 hover:bg-emerald-50 px-2.5 py-1 rounded-full cursor-pointer transition-colors shadow-xs flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[14px]">add</span>
                        Ajouter un jalon
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
                            placeholder="Libellé du jalon..."
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

              </div>
            )}

          </section>

          {/* ========================================== */}
          {/* COLONNE DROITE (5 cols) : FIL DE DISCUSSION */}
          {/* ========================================== */}
          {!isNewTask && (
            <section className="lg:col-span-5 bg-canvas-slate flex flex-col h-full min-h-0">
              <FamilyChat
                messages={comments}
                onSendMessage={handleSendCommentText}
                onAddReaction={handleEmojiReact}
                currentUser={currentUser}
                title="Fil de discussion familial"
                placeholder="Votre message à la famille..."
                onRetryMessage={handleRetryComment}
                onAttachClick={() => fileUploadRef.current?.click()}
                className="h-full"
              />
            </section>
          )}

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
                Synthèse des travaux réalisés & bilan financier :
              </label>
              <textarea
                rows={4}
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                placeholder="Précisez le résultat final, le respect du devis, la date d'achèvement et les éventuelles réserves..."
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

    </div>
  );
}
