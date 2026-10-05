import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  FileText, Landmark, ShieldCheck, Download, Copy, Check, Calculator,
  Euro, PieChart, Info, ArrowUpRight, CheckCircle2, UserCheck, AlertCircle, FileCheck,
  ChevronDown, ChevronUp, Calendar, Users, Sparkles, BookOpen, X, Plus, Upload,
  Trash2, Paperclip, FileCode, Image as ImageIcon, File, Eye, AlertTriangle, RefreshCw,
  Pencil, Lock, User, Receipt, Wallet, FileSpreadsheet, ExternalLink
} from 'lucide-react';
import FinancialLedgerModal from '../components/FinancialLedgerModal';
import MemberTreasurySection from '../components/MemberTreasurySection';
import BankReauthBanner from '../components/BankReauthBanner';
import DriveReauthBanner from '../components/DriveReauthBanner';
import DocumentViewerModal from '../components/DocumentViewerModal';
import UploadDocumentModal from '../components/UploadDocumentModal';
import SelectExistingDocumentModal from '../components/SelectExistingDocumentModal';
import { BankMetricSkeleton } from '../components/SkeletonLoaders';
import CustomSelect from '../components/CustomSelect';
import TagMultiSelect, { getTagColorClass, parseDocumentTags } from '../components/TagMultiSelect';
import {
  fetchDocuments,
  fetchDocumentCategories,
  createDocumentCategory,
  updateDocumentCategory,
  deleteDocumentCategory,
  uploadDocument,
  createAccountingTransaction,
  updateDocument,
  deleteDocument,
  fetchBankStatus,
  fetchMemberExpenses
} from '../api';

// Palette de 8 couleurs sobres pour les catégories personnalisées (Annotation 5)
const COLOR_OPTIONS = [
  { id: 'slate', name: 'Ardoise', bg: 'bg-slate-500', text: 'text-slate-700', border: 'border-slate-500', badgeBg: 'bg-slate-100 text-slate-800 border-slate-200' },
  { id: 'emerald', name: 'Émeraude', bg: 'bg-emerald-500', text: 'text-emerald-700', border: 'border-emerald-500', badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { id: 'amber', name: 'Ambre', bg: 'bg-amber-500', text: 'text-amber-700', border: 'border-amber-500', badgeBg: 'bg-amber-100 text-amber-800 border-amber-200' },
  { id: 'purple', name: 'Pourpre', bg: 'bg-purple-500', text: 'text-purple-700', border: 'border-purple-500', badgeBg: 'bg-purple-100 text-purple-800 border-purple-200' },
  { id: 'rose', name: 'Bordeaux', bg: 'bg-rose-700', text: 'text-rose-700', border: 'border-rose-700', badgeBg: 'bg-rose-100 text-rose-800 border-rose-200' },
  { id: 'sky', name: 'Bleu ciel', bg: 'bg-sky-500', text: 'text-sky-700', border: 'border-sky-500', badgeBg: 'bg-sky-100 text-sky-800 border-sky-200' },
  { id: 'teal', name: 'Vert sauge', bg: 'bg-teal-600', text: 'text-teal-700', border: 'border-teal-600', badgeBg: 'bg-teal-100 text-teal-800 border-teal-200' },
  { id: 'wood', name: 'Chêne', bg: 'bg-yellow-800', text: 'text-yellow-800', border: 'border-yellow-800', badgeBg: 'bg-amber-100 text-amber-900 border-amber-200' }
];

const EMOJI_PRESETS = ['🏛️', '💶', '🔧', '⚖️', '🛡️', '📜', '📬', '🏠', '📝', '💡', '🌳', '📁'];

function renderMarkdownLine(line, idx) {
  const trimmed = line.trim();
  if (trimmed.startsWith('# ')) {
    return <h1 key={idx} className="text-xl font-black text-slate-900 border-b pb-2 mb-3 mt-1">{trimmed.substring(2)}</h1>;
  }
  if (trimmed.startsWith('## ')) {
    return <h2 key={idx} className="text-base font-extrabold text-emerald-800 border-b pb-1 mb-2 mt-4">{trimmed.substring(3)}</h2>;
  }
  if (trimmed.startsWith('### ')) {
    return <h3 key={idx} className="text-sm font-bold text-slate-900 mt-3">{trimmed.substring(4)}</h3>;
  }
  if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
    return (
      <div key={idx} className="flex items-start space-x-2 text-xs text-slate-700 ml-2 my-1">
        <span className="text-emerald-500 font-bold">•</span>
        <span>{trimmed.substring(2)}</span>
      </div>
    );
  }
  if (trimmed === '---') {
    return <hr key={idx} className="my-3 border-slate-200" />;
  }
  if (trimmed === '') {
    return <div key={idx} className="h-1"></div>;
  }
  return <p key={idx} className="text-xs text-slate-700 leading-relaxed font-normal">{line}</p>;
}

// Initial Invoices Models — Vide par défaut pour n'afficher aucun faux document / facture inventée
const INITIAL_INVOICES = [];

export default function AdminInfoPage({ currentUser }) {
  const activeUser = currentUser || localStorage.getItem('sci_user') || 'Henri Jamet';
  const isCoordinator = Boolean(currentUser?.is_coordinator);

  // KPI Financial Totals (Zéro valeur inventée - initialisé à null)
  const [financialTotals, setFinancialTotals] = useState({
    entrees: null,
    sorties: null,
    reserves: null
  });

  // Open Banking Status
  const [bankStatus, setBankStatus] = useState(null);
  const [isLoadingBank, setIsLoadingBank] = useState(true);

  const loadBankStatus = async () => {
    setIsLoadingBank(true);
    try {
      const data = await fetchBankStatus();
      setBankStatus(data);
      if (data && data.total_balance !== undefined && data.total_balance !== null && data.status === 'ok' && !data.needs_reauth) {
        setFinancialTotals((prev) => ({
          ...prev,
          reserves: data.total_balance
        }));
      }
    } catch (err) {
      console.warn('Bank status load notice:', err.message);
      setBankStatus((prev) => prev || {
        status: 'error',
        needs_reauth: true,
        message: 'Liaison bancaire indisponible : impossible d\'interroger le service bancaire.',
        raw_error: err.message || 'Impossible d\'interroger le service bancaire.',
        error_code: err.status || 'NET_ERROR',
        error_details: err.stack || err.message,
        last_sync_attempt: new Date().toISOString(),
      });
    } finally {
      setIsLoadingBank(false);
    }
  };

  // Détermine si des données bancaires réelles et actives sont disponibles (fallback défensif false)
  const hasRealBankData = Boolean(
    bankStatus &&
    bankStatus.status === 'ok' &&
    !bankStatus.needs_reauth &&
    bankStatus.total_balance !== undefined &&
    bankStatus.total_balance !== null
  );

  // Documents State (Zéro document fictif — branché sur /api/documents)
  const [documents, setDocuments] = useState([]);
  const [isDocsLoading, setIsDocsLoading] = useState(true);
  const [categoriesList, setCategoriesList] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortCriteria, setSortCriteria] = useState('recent');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'

  // Invoices State
  const [invoices, setInvoices] = useState(INITIAL_INVOICES);

  // Modals Visibility
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadModalMode, setUploadModalMode] = useState('document'); // 'document' | 'invoice'
  const [isOperationModalOpen, setIsOperationModalOpen] = useState(false);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [selectedRenamingDoc, setSelectedRenamingDoc] = useState(null);
  const [renameInputValue, setRenameInputValue] = useState('');
  const [renameDocTags, setRenameDocTags] = useState([]);

  // Upload Modal State (Annotation 5 : Organisme, Titre, Format Canonique, Catégories Custom)
  const [uploadOrganisme, setUploadOrganisme] = useState('');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCategory, setUploadCategory] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [isSubmittingUpload, setIsSubmittingUpload] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileDropInputRef = useRef(null);

  // Création catégorie personnalisée inline
  const [isNewCategoryOpen, setIsNewCategoryOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatEmoji, setNewCatEmoji] = useState('📁');
  const [newCatColor, setNewCatColor] = useState('slate');
  const [isCreatingCat, setIsCreatingCat] = useState(false);

  // Édition / suppression catégorie (Annotation 10)
  const [isEditCategoryModalOpen, setIsEditCategoryModalOpen] = useState(false);
  const [selectedEditingCat, setSelectedEditingCat] = useState(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatEmoji, setEditCatEmoji] = useState('📁');
  const [editCatColor, setEditCatColor] = useState('slate');
  const [isUpdatingCat, setIsUpdatingCat] = useState(false);
  const [isDeletingCat, setIsDeletingCat] = useState(false);

  const [operationType, setOperationType] = useState('out'); // Exclusivement Sorties déductibles (Annotation 5)
  const [operationAmount, setOperationAmount] = useState('');
  const [operationDate, setOperationDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [operationLabel, setOperationLabel] = useState('');
  const [operationFile, setOperationFile] = useState(null);
  const [operationDocument, setOperationDocument] = useState(null);
  const [operationFileName, setOperationFileName] = useState('');
  const [operationFileError, setOperationFileError] = useState('');
  const [operationLabelError, setOperationLabelError] = useState('');
  const [isSubmittingOperation, setIsSubmittingOperation] = useState(false);
  const [isOpUploadModalOpen, setIsOpUploadModalOpen] = useState(false);
  const [isOpSelectExistingModalOpen, setIsOpSelectExistingModalOpen] = useState(false);

  // État persistant d'erreur bancaire (Consigne Henri : aucune disparition automatique pour les erreurs)
  const [bankingError, setBankingError] = useState(null);

  // Toast State
  const [toast, setToast] = useState({
    visible: false,
    title: '',
    desc: '',
    icon: 'check_circle'
  });
  const toastTimerRef = useRef(null);

  const showToast = (title, desc, icon = 'check_circle') => {
    // ANNOTATION 13 : Suppression du toast d'erreur rouge doublon.
    // Toute erreur est exclusivement routée vers le bus d'événement global app-error (GlobalErrorAlert).
    if (icon === 'error' || icon === 'alert' || (title && title.toLowerCase().includes('erreur'))) {
      window.dispatchEvent(new CustomEvent('app-error', {
        detail: {
          message: desc ? `${title} : ${desc}` : title,
          status: 500,
          endpoint: '/api/documents/upload'
        }
      }));
      return;
    }

    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ visible: true, title, desc, icon });

    toastTimerRef.current = setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, 4000);
  };

  // Chargement réel des documents depuis /api/documents (Annotation 6)
  const loadDocuments = async () => {
    setIsDocsLoading(true);
    try {
      const data = await fetchDocuments();
      setDocuments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('Erreur chargement documents réels:', err.message);
      setDocuments([]);
    } finally {
      setIsDocsLoading(false);
    }
  };

  // Chargement des catégories depuis /api/documents/categories (Annotation 5)
  const loadCategories = async () => {
    try {
      const cats = await fetchDocumentCategories();
      if (Array.isArray(cats) && cats.length > 0) {
        setCategoriesList(cats);
        if (!uploadCategory) {
          setUploadCategory(cats[0].name);
        }
      }
    } catch (err) {
      console.warn('Erreur chargement catégories:', err.message);
    }
  };

  const loadInvoices = async () => {
    try {
      const expensesList = await fetchMemberExpenses();
      if (Array.isArray(expensesList)) {
        const formatted = expensesList.map((exp) => {
          const isSciToPay = exp.payer_type === 'sci' || exp.status === 'PENDING_SCI_PAYMENT';
          let statusType = 'pending';
          let statusLabel = isSciToPay ? 'À régler par la SCI' : 'En attente de validation';
          if (exp.status === 'VALIDATED') {
            statusType = 'verified';
            statusLabel = 'Validé (crédité trésorerie)';
          } else if (exp.status === 'PAID') {
            statusType = 'paid';
            statusLabel = 'Réglé par la SCI';
          } else if (exp.status === 'REJECTED') {
            statusType = 'refund';
            statusLabel = 'Refusé';
          }

          let dateFormatted = exp.expense_date || '';
          if (dateFormatted.length === 10 && dateFormatted.includes('-')) {
            const [y, m, d] = dateFormatted.split('-');
            dateFormatted = `${d}/${m}/${y}`;
          }

          const supplier = exp.title.includes(' - ') ? exp.title.split(' - ')[0] : exp.title;
          const refName = exp.document_filename || `FAC-${exp.id}`;

          return {
            id: exp.id,
            date: dateFormatted,
            dueDate: isSciToPay ? 'Facture fournisseur SCI' : 'Avance associée',
            dueWarning: isSciToPay && exp.status !== 'PAID',
            supplier: supplier,
            reference: refName,
            amount: `${Number(exp.amount || 0).toFixed(2).replace('.', ',')} €`,
            taxInfo: isSciToPay ? 'Facture SCI' : 'Avance membre',
            statusType: statusType,
            status: statusLabel,
            filename: exp.document_filename || (exp.document_url ? exp.document_url.split('/').pop() : 'Facture.pdf'),
            document_url: exp.document_url,
            payerType: exp.payer_type,
            rawExpense: exp
          };
        });
        setInvoices(formatted);
      }
    } catch (err) {
      console.warn('Erreur chargement factures:', err.message);
    }
  };

  useEffect(() => {
    loadBankStatus();
    loadDocuments();
    loadCategories();
    loadInvoices();
  }, []);

  useEffect(() => {
    // Traitement du retour de consentement Open Banking Tilisy / Swan
    const searchParams = new URLSearchParams(window.location.search);
    const bankingParam = searchParams.get('banking');
    if (bankingParam === 'success') {
      setBankingError(null);
      showToast('Liaison bancaire validée', 'Le consentement DSP2 Indy (Swan) a été renouvelé avec succès.', 'check_circle');
      window.history.replaceState({}, '', window.location.pathname);
      loadBankStatus();
    } else if (bankingParam === 'error') {
      const rawMsg = searchParams.get('msg') || 'Le consentement bancaire a été annulé ou a échoué.';
      let msg = rawMsg;
      try {
        msg = decodeURIComponent(rawMsg);
      } catch (e) {
        msg = rawMsg;
      }
      setBankingError(msg);
      showToast('Erreur bancaire', msg, 'error');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Additional SCI Features (Grand Livre Financier)
  const [isFinancialModalOpen, setIsFinancialModalOpen] = useState(false);
  const [financialModalTab, setFinancialModalTab] = useState('grand_livre');

  // Visionneuse universelle intégrée (Annotation 9)
  const [viewerDoc, setViewerDoc] = useState(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  const handleViewDocument = (doc) => {
    let resolved = null;
    if (typeof doc === 'string') {
      resolved = {
        filename: doc,
        file_url: `/api/documents/${encodeURIComponent(doc)}/download`
      };
    } else if (doc) {
      resolved = {
        ...doc,
        filename: doc.filename || doc.file_name || doc.name || doc.title || 'document.pdf',
        file_url: doc.file_url || doc.url || (doc.id ? `/api/documents/${doc.id}/download` : '')
      };
    }
    if (resolved) {
      setViewerDoc(resolved);
      setIsViewerOpen(true);
    }
  };

  // Téléchargement réel de document
  const handleDownload = (doc) => {
    let targetUrl = '';
    let targetName = 'document.pdf';
    if (typeof doc === 'string') {
      targetName = doc;
      targetUrl = `/api/documents/${encodeURIComponent(doc)}/download`;
    } else if (doc) {
      targetUrl = doc.file_url || doc.url || (doc.id ? `/api/documents/${doc.id}/download` : '');
      targetName = doc.filename || doc.file_name || doc.name || doc.title || 'document.pdf';
    }

    if (targetUrl) {
      const a = document.createElement('a');
      a.href = targetUrl;
      a.download = targetName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('Téléchargement lancé', targetName, 'download');
    } else {
      showToast('Document indisponible', 'Le fichier lié n\'a pas pu être localisé.', 'warning');
    }
  };

  // Suppression d'un document réel
  const handleDeleteDoc = async (doc) => {
    const docId = doc.id || doc.filename;
    const docTitle = doc.title || doc.filename;
    if (!window.confirm(`Confirmez-vous la suppression du document « ${docTitle} » ?`)) return;
    try {
      await deleteDocument(docId);
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id && d.filename !== doc.filename));
      showToast('Document supprimé', `« ${docTitle} » a été supprimé.`, 'delete');
    } catch (err) {
      showToast('Erreur suppression', err.message, 'error');
    }
  };

  // Rename & Edit document tags workflow (Annotation 2 & 6)
  const openRenameModal = (doc) => {
    setSelectedRenamingDoc(doc);
    setRenameInputValue(doc.title || doc.name || '');
    const currentTags = parseDocumentTags(doc);
    setRenameDocTags(currentTags.length > 0 ? currentTags : (doc.category ? [doc.category] : ['Travaux & Chantiers']));
    setIsRenameModalOpen(true);
  };

  const handleRenameSubmit = async (e) => {
    e.preventDefault();
    if (!selectedRenamingDoc || !renameInputValue.trim()) return;

    const newTitle = renameInputValue.trim();
    const docId = selectedRenamingDoc.id || selectedRenamingDoc.filename;
    try {
      const finalTags = renameDocTags.length > 0 ? renameDocTags : ['Travaux & Chantiers'];
      const updated = await updateDocument(docId, {
        title: newTitle,
        tags: finalTags,
        category: finalTags.join(', ')
      });
      setDocuments((prev) =>
        prev.map((d) => (d.id === selectedRenamingDoc.id ? {
          ...d,
          ...updated,
          title: newTitle,
          name: newTitle,
          tags: finalTags,
          category: finalTags.join(', ')
        } : d))
      );
      setIsRenameModalOpen(false);
      showToast('Document actualisé', 'Le titre et les étiquettes ont été enregistrés avec succès.', 'check_circle');
    } catch (err) {
      showToast('Erreur modification', err.message, 'error');
    }
  };

  // Création d'une catégorie maison en base (Annotation 5)
  const handleCreateCategorySubmit = async (e) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setIsCreatingCat(true);
    try {
      const created = await createDocumentCategory({
        name: newCatName.trim(),
        emoji: newCatEmoji || '📁',
        color: newCatColor || 'slate'
      });
      setCategoriesList((prev) => {
        const exists = prev.find((c) => c.name.toLowerCase() === created.name.toLowerCase());
        if (exists) return prev;
        return [...prev, created];
      });
      setUploadCategory(created.name);
      setNewCatName('');
      setIsNewCategoryOpen(false);
      showToast('Catégorie créée', `Catégorie « ${created.name} » enregistrée en base.`, 'category');
    } catch (err) {
      showToast('Erreur', err.message, 'error');
    } finally {
      setIsCreatingCat(false);
    }
  };

  // Annotation 10 & Demande Henri : Ouverture de la modale d'édition de l'étiquette sélectionnée
  const handleOpenEditCategoryModal = (targetCategory = null) => {
    let current = null;
    const targetName = typeof targetCategory === 'string' ? targetCategory : (targetCategory?.name || selectedCategory);

    if (targetName && targetName !== 'all') {
      current = categoriesList.find((c) => c.name.toLowerCase() === targetName.toLowerCase());
      if (!current) {
        current = { id: `virtual-${targetName}`, name: targetName, emoji: '📁', color: 'slate', isVirtual: true };
      }
    }

    if (!current) {
      current = categoriesList.find((c) => c.name === uploadCategory) || categoriesList[0];
    }

    if (!current) {
      showToast('Aucune étiquette', 'Veuillez d\'abord sélectionner une étiquette.', 'warning');
      return;
    }
    setSelectedEditingCat(current);
    setEditCatName(current.name);
    setEditCatEmoji(current.emoji || '📁');
    setEditCatColor(current.color || 'slate');
    setIsEditCategoryModalOpen(true);
  };

  // Annotation 10 : Mise à jour de catégorie (PUT)
  const handleUpdateCategorySubmit = async (e) => {
    e.preventDefault();
    if (!selectedEditingCat || !editCatName.trim()) return;
    setIsUpdatingCat(true);
    try {
      let updated;
      const isNumericId = typeof selectedEditingCat.id === 'number' || (typeof selectedEditingCat.id === 'string' && /^\d+$/.test(selectedEditingCat.id));
      if (isNumericId) {
        updated = await updateDocumentCategory(selectedEditingCat.id, {
          name: editCatName.trim(),
          emoji: editCatEmoji || '📁',
          color: editCatColor || 'slate'
        });
      } else {
        // Catégorie virtuelle : création en base
        updated = await createDocumentCategory({
          name: editCatName.trim(),
          emoji: editCatEmoji || '📁',
          color: editCatColor || 'slate'
        });
      }

      setCategoriesList((prev) => {
        const withoutOld = prev.filter((c) => c.id !== selectedEditingCat.id && c.name.toLowerCase() !== selectedEditingCat.name.toLowerCase());
        return [...withoutOld, updated];
      });

      if (uploadCategory === selectedEditingCat.name) {
        setUploadCategory(updated.name);
      }
      if (selectedCategory === selectedEditingCat.name) {
        setSelectedCategory(updated.name);
      }

      // Propager le renommage dans tous les documents locaux
      setDocuments((prev) => prev.map((doc) => {
        const docTags = parseDocumentTags(doc);
        if (docTags.includes(selectedEditingCat.name) || doc.category === selectedEditingCat.name) {
          const newTags = docTags.map((t) => (t === selectedEditingCat.name ? updated.name : t));
          return {
            ...doc,
            tags: newTags,
            category: newTags.join(', ')
          };
        }
        return doc;
      }));

      // Si le document en cours d'édition est ouvert dans la modal rename
      setRenameDocTags((prev) => prev.map((t) => (t === selectedEditingCat.name ? updated.name : t)));

      setIsEditCategoryModalOpen(false);
      showToast('Étiquette mise à jour', `Étiquette « ${updated.name} » actualisée avec succès.`, 'check_circle');
    } catch (err) {
      showToast('Erreur mise à jour', err.message, 'error');
    } finally {
      setIsUpdatingCat(false);
    }
  };

  // Annotation 10 : Suppression de catégorie avec confirmation préalable obligatoire (DELETE)
  const handleDeleteCategory = async () => {
    if (!selectedEditingCat) return;
    if (window.confirm(`Êtes-vous certain de vouloir supprimer l'étiquette « ${selectedEditingCat.name} » ?`)) {
      setIsDeletingCat(true);
      try {
        const isNumericId = typeof selectedEditingCat.id === 'number' || (typeof selectedEditingCat.id === 'string' && /^\d+$/.test(selectedEditingCat.id));
        if (isNumericId) {
          await deleteDocumentCategory(selectedEditingCat.id);
        }
        const remaining = categoriesList.filter((c) => c.id !== selectedEditingCat.id && c.name !== selectedEditingCat.name);
        setCategoriesList(remaining);

        // Mettre à jour les documents
        setDocuments((prev) => prev.map((doc) => {
          const docTags = parseDocumentTags(doc);
          if (docTags.includes(selectedEditingCat.name) || doc.category === selectedEditingCat.name) {
            const newTags = docTags.filter((t) => t !== selectedEditingCat.name);
            const finalTags = newTags.length > 0 ? newTags : ['Autre'];
            return {
              ...doc,
              tags: finalTags,
              category: finalTags.join(', ')
            };
          }
          return doc;
        }));

        setRenameDocTags((prev) => prev.filter((t) => t !== selectedEditingCat.name));

        if (uploadCategory === selectedEditingCat.name) {
          setUploadCategory(remaining.length > 0 ? remaining[0].name : '');
        }
        if (selectedCategory === selectedEditingCat.name) {
          setSelectedCategory('all');
        }
        setIsEditCategoryModalOpen(false);
        showToast('Étiquette supprimée', `L'étiquette « ${selectedEditingCat.name} » a été supprimée.`, 'delete');
      } catch (err) {
        showToast('Erreur suppression', err.message, 'error');
      } finally {
        setIsDeletingCat(false);
      }
    }
  };

  // Calcul dynamique du nom de fichier canonique : [ORGANISME] [MMAAAA] [Titre].[ext]
  const getCanonicalFileName = useMemo(() => {
    const org = (uploadOrganisme || '').trim() || 'ORGANISME';
    const title = (uploadTitle || '').trim() || 'Titre du document';
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = String(now.getFullYear());
    const mmaaaa = `${mm}${yyyy}`;

    let ext = '.pdf';
    if (uploadedFileName) {
      const lastDot = uploadedFileName.lastIndexOf('.');
      if (lastDot !== -1) {
        ext = uploadedFileName.substring(lastDot);
      }
    }
    return `${org} ${mmaaaa} ${title}${ext}`;
  }, [uploadOrganisme, uploadTitle, uploadedFileName]);

  // Upload document success callback (DRY unifié via UploadDocumentModal)
  const handleUploadSuccess = async (newDoc) => {
    setDocuments((prev) => [newDoc, ...prev]);
    await loadDocuments();
    await loadCategories();
    await loadInvoices();
    showToast('Document archivé', `« ${newDoc.filename || newDoc.name} » a été archivé avec succès.`, 'cloud_done');
  };

  // Callbacks documents pour l'opération financière (Annotation 16 - DRY radical)
  const handleOpUploadSuccess = async (newDoc) => {
    if (!newDoc) return;
    setOperationDocument(newDoc);
    setOperationFile(null);
    setOperationFileName(newDoc.filename || newDoc.name || newDoc.title || 'Document justificatif');
    setOperationFileError('');
    setIsOpUploadModalOpen(false);
    showToast('Justificatif rattaché', `Le document « ${newDoc.filename || newDoc.name || newDoc.title} » a été archivé et sélectionné.`, 'attach_file');
    await loadDocuments();
  };

  const handleOpSelectExistingSuccess = (selectedDocs) => {
    if (!selectedDocs || selectedDocs.length === 0) return;
    const doc = selectedDocs[0];
    setOperationDocument(doc);
    setOperationFile(null);
    setOperationFileName(doc.filename || doc.file_name || doc.name || doc.title || 'Document existant');
    setOperationFileError('');
    setIsOpSelectExistingModalOpen(false);
    showToast('Document associé', `« ${doc.filename || doc.file_name || doc.title || doc.name} » a été sélectionné comme justificatif.`, 'check_circle');
  };

  const handleDetachOperationDoc = () => {
    setOperationDocument(null);
    setOperationFile(null);
    setOperationFileName('');
    setOperationFileError('');
  };

  // Operation workflow (Annotations 5, 6, 7 & 16 — Sortie Exclusive, Justification & Facture obligatoires)
  const handleOperationSubmit = async (e) => {
    e.preventDefault();
    setOperationFileError('');
    setOperationLabelError('');

    const amountNum = parseFloat(operationAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      showToast('Montant invalide', 'Veuillez saisir un montant valide supérieur à 0 €.', 'warning');
      return;
    }

    if (!operationLabel || !operationLabel.trim()) {
      setOperationLabelError('La justification de paiement est obligatoire.');
      showToast('Justification obligatoire', 'Veuillez renseigner la justification de paiement.', 'warning');
      return;
    }

    if (!operationDocument && !operationFile) {
      const errorMsg = 'Veuillez joindre une facture ou un justificatif de paiement pour valider la dépense.';
      setOperationFileError(errorMsg);
      showToast('Justificatif obligatoire', errorMsg, 'warning');
      return;
    }

    setIsSubmittingOperation(true);
    try {
      const deposant = (
        currentUser && typeof currentUser === 'object'
          ? (currentUser.name || currentUser.fullName || (currentUser.prenom ? `${currentUser.prenom} ${currentUser.nom || ''}`.trim() : null) || currentUser.id)
          : (typeof currentUser === 'string' && currentUser ? currentUser : null)
      ) || (typeof activeUser === 'string' ? activeUser : 'Henri Jamet');

      const formData = new FormData();
      if (operationDocument && operationDocument.id) {
        formData.append('document_id', String(operationDocument.id));
      } else if (operationFile) {
        formData.append('file', operationFile);
      }
      formData.append('justification', operationLabel.trim());
      formData.append('amount', String(amountNum));
      formData.append('booking_date', operationDate || new Date().toISOString().split('T')[0]);
      formData.append('type', 'out');
      formData.append('uploaded_by', deposant);

      await createAccountingTransaction(formData);

      // Mise à jour réactive des totaux financiers (sorties déduites, réserves ajustées)
      setFinancialTotals((prev) => ({
        ...prev,
        sorties: (prev.sorties !== null ? prev.sorties : 0) + amountNum,
        reserves: prev.reserves !== null ? prev.reserves - amountNum : -amountNum
      }));

      // Rechargement dynamique des documents pour affichage direct du justificatif
      await loadDocuments();
      await loadInvoices();

      setIsOperationModalOpen(false);
      showToast(
        'Dépense enregistrée',
        `-${amountNum.toFixed(2)} € — ${operationLabel.trim()} (Justificatif archivé)`,
        'payments'
      );

      // Réinitialisation du formulaire
      setOperationAmount('');
      setOperationLabel('');
      setOperationFile(null);
      setOperationDocument(null);
      setOperationFileName('');
      setOperationFileError('');
      setOperationLabelError('');
    } catch (err) {
      console.error('Erreur enregistrement dépense:', err);
      showToast('Erreur', err.message || 'Impossible d\'enregistrer la dépense', 'error');
    } finally {
      setIsSubmittingOperation(false);
    }
  };

  // Pre-fill operation for quick invoice payment
  const openPayInvoiceOperation = (inv) => {
    const rawVal = inv?.amount ? String(inv.amount).replace('€', '').replace(/\s/g, '').replace(',', '.') : '';
    setOperationType('out');
    setOperationAmount(parseFloat(rawVal) || '');
    setOperationLabel(`Règlement Facture ${inv.supplier} (${inv.reference})`);
    setOperationFile(null);
    setOperationDocument(null);
    setOperationFileName('');
    setOperationFileError('');
    setOperationLabelError('');
    setIsOperationModalOpen(true);
  };

  // Filter & Search Documents (Données réelles et Multi-Tags)
  const filteredDocuments = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return documents
      .filter((doc) => {
        const docTags = parseDocumentTags(doc);
        const matchesCategory =
          selectedCategory === 'all' ||
          docTags.includes(selectedCategory) ||
          doc.category === selectedCategory;

        const docTitle = (doc.title || doc.name || doc.filename || '').toLowerCase();
        const docAuthor = (doc.uploaded_by || doc.author || '').toLowerCase();
        const docOrg = (doc.notes || '').toLowerCase();
        const docTagsStr = docTags.join(' ').toLowerCase();

        const matchesSearch =
          q === '' ||
          docTitle.includes(q) ||
          docAuthor.includes(q) ||
          docOrg.includes(q) ||
          docTagsStr.includes(q) ||
          (doc.category || '').toLowerCase().includes(q);

        return matchesCategory && matchesSearch;
      })
      .sort((a, b) => {
        const titleA = a.title || a.name || a.filename || '';
        const titleB = b.title || b.name || b.filename || '';
        if (sortCriteria === 'name') {
          return titleA.localeCompare(titleB);
        } else if (sortCriteria === 'size') {
          return (b.file_size || b.sizeBytes || 0) - (a.file_size || a.sizeBytes || 0);
        } else {
          return new Date(b.created_at || b.date || 0).getTime() - new Date(a.created_at || a.date || 0).getTime();
        }
      });
  }, [documents, searchQuery, selectedCategory, sortCriteria]);

  // Dynamic Category Counts (comptage par étiquette individuelle)
  const categoryCounts = useMemo(() => {
    const counts = { all: documents.length };
    documents.forEach((d) => {
      const docTags = parseDocumentTags(d);
      if (docTags.length === 0) {
        const fallback = d.category || 'Autre';
        counts[fallback] = (counts[fallback] || 0) + 1;
      } else {
        docTags.forEach((t) => {
          counts[t] = (counts[t] || 0) + 1;
        });
      }
    });
    return counts;
  }, [documents]);

  // Fusion dynamique des catégories en base et des documents existants
  const categories = useMemo(() => {
    const base = [{ key: 'all', label: `Tous (${documents.length})`, emoji: '📁' }];
    
    // Ajout des catégories issues de la base
    const seen = new Set();
    categoriesList.forEach((c) => {
      seen.add(c.name);
      base.push({
        key: c.name,
        label: `${c.emoji || '📁'} ${c.name} (${categoryCounts[c.name] || 0})`,
        emoji: c.emoji || '📁',
        color: c.color || 'slate'
      });
    });

    // Compléter avec les étiquettes présentes dans les documents qui ne seraient pas dans categoriesList
    documents.forEach((d) => {
      const docTags = parseDocumentTags(d);
      docTags.forEach((tag) => {
        if (tag && !seen.has(tag)) {
          seen.add(tag);
          base.push({
            key: tag,
            label: `📁 ${tag} (${categoryCounts[tag] || 0})`,
            emoji: '📁',
            color: 'slate'
          });
        }
      });
    });

    return base;
  }, [categoriesList, documents, categoryCounts]);

  return (
    <div className="w-full pb-16 animate-in fade-in duration-200">
      
      {/* ========================================================================= */}
      {/* 1. EN-TÊTE HARMONISÉ HERO                                                 */}
      {/* ========================================================================= */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-rose-50/80 via-pink-50/60 to-purple-50/50 border border-rose-200/70 dark:bg-rose-950/20 dark:border-rose-800/40 p-6 sm:p-8 shadow-sm mb-6">
        {/* Subtle decorative glow */}
        <div className="absolute -right-24 -top-24 w-96 h-96 rounded-full bg-rose-200/40 dark:bg-rose-900/15 blur-3xl pointer-events-none"></div>
        <div className="absolute -left-12 -bottom-12 w-64 h-64 rounded-full bg-pink-200/30 dark:bg-pink-900/10 blur-2xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100/90 text-rose-900 dark:bg-rose-900/50 dark:text-rose-200 font-label-sm text-xs font-semibold uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-rose-600 dark:bg-rose-400 animate-pulse"></span>
              DOMAINE D'HELLENVILLIERS • ADMINISTRATION
            </span>
            <h1 className="font-display-lg text-2xl sm:text-3xl lg:text-display-lg text-forest-deep dark:text-rose-50 tracking-tight font-bold mt-2">
              Administratif &amp; Documents
            </h1>
            <p className="font-body-md text-sm sm:text-base text-on-surface-variant dark:text-rose-200/80 leading-relaxed">
              Portail Familial &amp; Patrimonial • Suivi budgétaire, actes notariés et pièces justificatives
            </p>
          </div>

          {/* Quick Actions Buttons */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0 pt-2 md:pt-0">
            <button
              id="btn-open-operation"
              type="button"
              onClick={() => {
                setOperationType('out');
                setOperationFile(null);
                setOperationDocument(null);
                setOperationFileName('');
                setOperationFileError('');
                setOperationLabelError('');
                setIsOperationModalOpen(true);
              }}
              className="group flex items-center justify-center gap-2 px-5 py-3.5 rounded-DEFAULT bg-white dark:bg-slate-900 border-2 border-outline-variant text-on-surface hover:bg-canvas-slate hover:border-outline font-label-lg text-sm sm:text-base font-semibold transition-all duration-200 shadow-sm cursor-pointer whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[22px] text-on-surface-variant group-hover:scale-110 transition-transform">payments</span>
              <span>Déclarer une dépense</span>
            </button>

            <button
              id="btn-open-upload"
              type="button"
              onClick={() => {
                setUploadModalMode('document');
                setIsUploadModalOpen(true);
              }}
              className="group flex items-center justify-center gap-2 px-5 py-3.5 rounded-DEFAULT bg-white dark:bg-slate-900 border-2 border-primary text-primary hover:bg-sage-soft font-label-lg text-sm sm:text-base font-bold shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[22px] group-hover:scale-110 transition-transform">upload_file</span>
              <span>+ Déposer une pièce</span>
            </button>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 1 : FINANCIAL QUICK SUMMARY (3 HIGH-IMPACT KPI CARDS)             */}
      {/* ========================================================================= */}
      <div className="mt-space-lg">
        {/* Alerte persistante de retour d'erreur bancaire avec bouton explicite de fermeture */}
        {bankingError && (
          <aside
            id="banner-banking-error"
            role="alert"
            className="mb-space-md p-4 sm:p-5 rounded-2xl bg-rose-50/95 border-2 border-rose-400 text-rose-950 shadow-md flex items-start justify-between gap-4 animate-in fade-in duration-200"
          >
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-rose-100 border border-rose-300 flex items-center justify-center shrink-0 text-rose-700">
                <AlertTriangle className="w-5 h-5 text-rose-700 shrink-0" />
              </div>
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm sm:text-base text-rose-950">
                    Échec du consentement bancaire Indy (Swan)
                  </h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-200 text-rose-900 border border-rose-300">
                    Erreur retour
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-rose-950 font-mono bg-rose-100/80 p-3 rounded-lg border border-rose-200 break-words select-text whitespace-pre-wrap">
                  {bankingError}
                </p>
                <p className="text-[11px] text-rose-700">
                  Ce message d'erreur reste affiché en permanence tant que vous ne l'avez pas fermé afin de vous permettre de copier le détail technique ou d'identifier le diagnostic.
                </p>
              </div>
            </div>
            <button
              id="btn-close-banking-error"
              type="button"
              onClick={() => setBankingError(null)}
              className="p-1.5 rounded-xl hover:bg-rose-200/80 active:bg-rose-300 text-rose-700 transition-colors shrink-0 cursor-pointer"
              title="Fermer l'erreur"
              aria-label="Fermer l'erreur bancaire"
            >
              <X className="w-5 h-5" />
            </button>
          </aside>
        )}

        {/* Bannière d'alerte raccordement bancaire DSP2 réactive */}
        <BankReauthBanner bankStatus={bankStatus} onRefresh={loadBankStatus} urlError={bankingError} />

        {/* Bannière d'alerte stockage Google Drive réactive (Fail-Loud) */}
        <DriveReauthBanner currentUser={currentUser} />

        <div className="flex items-center justify-between mb-space-sm">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">account_balance</span>
            <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
              Synthèse Financière &amp; Trésorerie Dédiée
            </h2>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <button
              onClick={() => {
                setFinancialModalTab('grand_livre');
                setIsFinancialModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-surface-container-low hover:bg-sage-soft rounded-full text-forest-deep border border-border-subtle font-label-sm text-xs transition"
            >
              <span className="material-symbols-outlined text-[16px]">receipt_long</span>
              <span>Consulter le Grand Livre</span>
            </button>
          </div>
        </div>

        {isLoadingBank ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
            <BankMetricSkeleton />
            <BankMetricSkeleton />
            <BankMetricSkeleton />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
            
            {/* Card 1: Entrées / Cotisations CCA */}
            <div
              onClick={() => {
                setFinancialModalTab('entrees');
                setIsFinancialModalOpen(true);
              }}
              role="button"
              tabIndex={0}
              className="bg-surface-container-lowest rounded-lg p-space-md shadow-[0_2px_8px_-2px_rgba(6,95,70,0.04),0_6px_20px_-4px_rgba(15,23,42,0.05)] border border-border-subtle flex flex-col justify-between relative overflow-hidden group hover:border-primary hover:shadow-[0_8px_24px_-4px_rgba(6,95,70,0.09)] transition-all cursor-pointer"
            >
              <div className="flex items-start justify-between gap-space-xs">
                <div>
                  <span className="text-on-surface-variant font-label-sm text-label-sm block uppercase tracking-wider font-semibold">
                    Entrées (CCA &amp; Apports)
                  </span>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="font-headline-lg text-headline-lg font-bold text-forest-deep tabular-nums">
                      {hasRealBankData && financialTotals.entrees !== null
                        ? `${financialTotals.entrees.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
                        : '—'}
                    </span>
                  </div>
                </div>
                <span className="material-symbols-outlined text-primary/40 group-hover:text-primary transition-colors text-[24px]">
                  arrow_downward
                </span>
              </div>
            </div>

            {/* Card 2: Sorties & Charges */}
            <div
              onClick={() => {
                setOperationType('out');
                setOperationFile(null);
                setOperationDocument(null);
                setOperationFileName('');
                setOperationFileError('');
                setOperationLabelError('');
                setIsOperationModalOpen(true);
              }}
              role="button"
              tabIndex={0}
              className="bg-surface-container-lowest rounded-lg p-space-md shadow-[0_2px_8px_-2px_rgba(6,95,70,0.04),0_6px_20px_-4px_rgba(15,23,42,0.05)] border border-border-subtle flex flex-col justify-between relative overflow-hidden group hover:border-primary hover:shadow-[0_8px_24px_-4px_rgba(6,95,70,0.09)] transition-all cursor-pointer"
            >
              <div className="flex items-start justify-between gap-space-xs">
                <div>
                  <span className="text-on-surface-variant font-label-sm text-label-sm block uppercase tracking-wider font-semibold">
                    Sorties &amp; Charges engagées
                  </span>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="font-headline-lg text-headline-lg font-bold text-on-surface tabular-nums">
                      {hasRealBankData && financialTotals.sorties !== null
                        ? `${financialTotals.sorties.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
                        : '—'}
                    </span>
                  </div>
                </div>
                <span className="material-symbols-outlined text-amber-rich/40 group-hover:text-amber-rich transition-colors text-[24px]">
                  arrow_upward
                </span>
              </div>
            </div>

            {/* Card 3: Réserves & Trésorerie */}
            <div className="bg-surface-container-lowest rounded-lg p-space-md shadow-[0_2px_8px_-2px_rgba(6,95,70,0.04),0_6px_20px_-4px_rgba(15,23,42,0.05)] border border-border-subtle flex flex-col justify-between relative overflow-hidden group hover:border-sage-border transition-all">
              <div className="flex items-start justify-between gap-space-xs">
                <div>
                  <span className="text-on-surface-variant font-label-sm text-label-sm block uppercase tracking-wider font-semibold">
                    Réserves &amp; Trésorerie disponible
                  </span>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="font-headline-lg text-headline-lg font-bold text-primary tabular-nums">
                      {hasRealBankData && financialTotals.reserves !== null
                        ? `${financialTotals.reserves.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
                        : '—'}
                    </span>
                  </div>
                </div>
                <span className="material-symbols-outlined text-primary/40 text-[24px]">
                  savings
                </span>
              </div>
              {!hasRealBankData && (
                <div className="mt-2 pt-2 border-t border-rose-100 flex items-center justify-between text-[11px] text-rose-800">
                  <span className="inline-flex items-center gap-1 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                    Liaison bancaire inactive ou à renouveler
                  </span>
                </div>
              )}
            </div>

          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SECTION TRÉSORERIE PAR MEMBRE & RAPPROCHEMENT BANCAIRE                    */}
      {/* ========================================================================= */}
      <MemberTreasurySection currentUser={currentUser} isCoordinator={isCoordinator} />

      {/* ========================================================================= */}
      {/* SECTION 2 : TABLEAU DES DERNIÈRES FACTURES & RÈGLEMENTS                   */}
      {/* ========================================================================= */}
      <div className="mt-space-md bg-surface-container-lowest rounded-lg border border-border-subtle p-space-md shadow-[0_2px_8px_-2px_rgba(6,95,70,0.04),0_6px_20px_-4px_rgba(15,23,42,0.05)]">
        
        {/* Table Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs pb-space-sm border-b border-border-subtle">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-sage-soft flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[20px]">receipt_long</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-headline-sm text-headline-sm text-forest-deep font-semibold">
                  Mes Dernières Factures &amp; Règlements — Henri Jamet
                </h2>
              </div>
              <p className="font-body-md text-xs text-on-surface-variant mt-0.5">
                Suivi des factures, dépenses directes et remboursements SCI rattachés à votre profil
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-open-upload-invoice"
              type="button"
              onClick={() => {
                setUploadModalMode('invoice');
                setIsUploadModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-DEFAULT bg-primary text-on-primary hover:bg-forest-deep text-xs font-semibold shadow-sm transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">receipt_long</span>
              <span>+ Déposer une facture</span>
            </button>
            <span className="text-xs font-semibold text-on-surface-variant bg-surface-container-low px-3 py-1.5 rounded-full">
              {invoices.length} factures répertoriées
            </span>
          </div>
        </div>

        {/* Invoices Table Body */}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="text-xs uppercase text-on-surface-variant bg-surface-container-low/70 border-b border-border-subtle font-semibold">
              <tr>
                <th className="py-3 px-4" scope="col">Date &amp; Échéance</th>
                <th className="py-3 px-4" scope="col">Réf. Facture &amp; Prestataire</th>
                <th className="py-3 px-4" scope="col">Montant TTC</th>
                <th className="py-3 px-4" scope="col">Statut de paiement</th>
                <th className="py-3 px-4" scope="col">Justificatif</th>
                <th className="py-3 px-4 text-right" scope="col">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle font-body-md text-sm text-on-surface">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-12 px-4 text-center text-on-surface-variant font-body-md text-xs">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <span className="material-symbols-outlined text-[32px] text-outline">receipt_long</span>
                      <span className="font-semibold text-forest-deep text-sm">Aucun justificatif ou facture en attente</span>
                      <span className="text-on-surface-variant text-xs max-w-sm">
                        Les factures, devis et justificatifs de dépenses téléversés apparaîtront ici.
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setUploadModalMode('invoice');
                          setIsUploadModalOpen(true);
                        }}
                        className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-DEFAULT bg-primary text-on-primary hover:bg-forest-deep text-xs font-semibold transition-all cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">receipt_long</span>
                        <span>Déposer une facture</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-canvas-slate/80 transition-colors">
                  
                  {/* Date & Échéance */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <div className="font-semibold text-forest-deep">{inv.date}</div>
                    <div className={`text-xs ${inv.dueWarning ? 'text-amber-rich font-semibold' : 'text-on-surface-variant'}`}>
                      {inv.dueDate}
                    </div>
                  </td>

                  {/* Réf & Prestataire */}
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-on-surface">{inv.supplier}</div>
                    <div className="text-xs text-on-surface-variant font-mono">{inv.reference}</div>
                  </td>

                  {/* Montant TTC */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <div className="font-headline-sm text-sm font-bold text-forest-deep tabular-nums">
                      {inv.amount}
                    </div>
                    <div className="text-[11px] text-on-surface-variant">{inv.taxInfo}</div>
                  </td>

                  {/* Statut de paiement */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {inv.statusType === 'paid' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sage-soft text-forest-deep">
                        <span className="material-symbols-outlined text-[14px]">check_circle</span>
                        <span>{inv.status}</span>
                      </span>
                    )}
                    {inv.statusType === 'pending' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-soft text-amber-rich">
                        <span className="material-symbols-outlined text-[14px]">pending</span>
                        <span>{inv.status}</span>
                      </span>
                    )}
                    {inv.statusType === 'verified' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sage-soft text-forest-deep">
                        <span className="material-symbols-outlined text-[14px]">verified</span>
                        <span>{inv.status}</span>
                      </span>
                    )}
                    {inv.statusType === 'refund' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-surface-container-low text-primary border border-sage-border">
                        <span className="material-symbols-outlined text-[14px]">currency_exchange</span>
                        <span>{inv.status}</span>
                      </span>
                    )}
                  </td>

                  {/* Justificatif */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleViewDocument(inv.filename);
                      }}
                      className="btn-download inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container-low text-forest-deep hover:bg-sage-soft border border-border-subtle transition-all text-xs font-semibold cursor-pointer"
                      title="Consulter le justificatif dans la visionneuse"
                    >
                      <span className="material-symbols-outlined text-error text-[16px]">picture_as_pdf</span>
                      <span>{inv.filename}</span>
                    </button>
                  </td>

                  {/* Actions */}
                  <td className="py-3.5 px-4 whitespace-nowrap text-right">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleViewDocument(inv.filename);
                        }}
                        className="btn-view px-2.5 h-8 rounded-DEFAULT bg-surface-container-lowest border border-primary text-primary hover:bg-sage-soft transition-all text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                        title="Consulter dans la visionneuse"
                      >
                        <span className="material-symbols-outlined text-[15px]">visibility</span>
                        <span>Consulter</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDownload(inv.filename)}
                        className="btn-download px-2.5 h-8 rounded-DEFAULT bg-surface-container-lowest border border-border-subtle text-on-surface-variant hover:text-primary hover:border-primary transition-all text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                        title="Télécharger une copie du fichier"
                      >
                        <span className="material-symbols-outlined text-[15px]">download</span>
                        <span>Télécharger</span>
                      </button>

                      {inv.statusType === 'pending' ? (
                        <button
                          type="button"
                          onClick={() => openPayInvoiceOperation(inv)}
                          className="px-3 h-8 rounded-DEFAULT bg-primary text-on-primary hover:bg-forest-deep transition-all text-xs font-semibold inline-flex items-center gap-1 cursor-pointer ml-1"
                        >
                          <span className="material-symbols-outlined text-[15px]">payments</span>
                          <span>Régler</span>
                        </button>
                      ) : inv.statusType === 'paid' ? (
                        <button
                          type="button"
                          onClick={() => handleDownload(`Recu-${inv.filename}`)}
                          className="btn-download px-2.5 h-8 rounded-DEFAULT bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100 transition-all text-xs font-semibold inline-flex items-center gap-1 cursor-pointer ml-1"
                          title="Télécharger le reçu"
                        >
                          <span className="material-symbols-outlined text-[15px]">verified</span>
                          <span>Reçu</span>
                        </button>
                      ) : null}
                    </div>
                  </td>

                </tr>
              )))}
            </tbody>
          </table>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* SECTION 3 : TOOLBAR & BIBLIOTHÈQUE DE DOCUMENTS STITCH                   */}
      {/* ========================================================================= */}
      <div className="mt-space-lg flex flex-col gap-space-sm">
        
        {/* Controls row : Search + Sort + View Switcher */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-sm">
          
          {/* Search Input */}
          <div className="relative flex-1 max-w-xl">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline text-[22px]">
              search
            </span>
            <input
              id="doc-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher par titre, mot-clé, artisan, date..."
              className="w-full h-[52px] pl-12 pr-4 bg-surface-container-lowest border-2 border-border-subtle rounded-DEFAULT font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface p-1"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
          </div>

          {/* Sorting & View Switcher */}
          <div className="flex items-center gap-space-sm flex-wrap">
            
            {/* Sort Select */}
            <div className="flex items-center gap-2">
              <label htmlFor="sort-select" className="font-label-sm text-label-sm text-on-surface-variant whitespace-nowrap hidden sm:inline">
                Trier par :
              </label>
              <CustomSelect
                id="sort-select"
                value={sortCriteria}
                onChange={(e) => setSortCriteria(e.target.value)}
                options={[
                  { value: 'recent', label: 'Date (Plus récent en premier)', icon: 'schedule' },
                  { value: 'name', label: 'Nom alphabétique (A-Z)', icon: 'sort_by_alpha' },
                  { value: 'size', label: 'Taille de fichier', icon: 'data_usage' },
                ]}
                className="h-[52px] min-w-[240px]"
              />
            </div>

            {/* Bouton d'édition de l'étiquette sélectionnée (Annotation Report Henri) */}
            {selectedCategory && selectedCategory !== 'all' && (
              <button
                id="btn-edit-selected-category"
                type="button"
                onClick={() => handleOpenEditCategoryModal(selectedCategory)}
                className="h-[52px] px-4 rounded-DEFAULT bg-surface-container-lowest border border-border-subtle hover:border-primary text-on-surface hover:text-primary font-label-sm text-label-sm flex items-center gap-2 shadow-xs transition-all cursor-pointer group"
                title={`Modifier ou supprimer l'étiquette « ${selectedCategory} »`}
              >
                <span className="material-symbols-outlined text-[18px] text-primary group-hover:scale-110 transition-transform">
                  edit_note
                </span>
                <span className="font-semibold whitespace-nowrap hidden sm:inline">
                  Modifier l'étiquette
                </span>
                <span className="font-semibold whitespace-nowrap sm:hidden">
                  Étiquette
                </span>
              </button>
            )}

            {/* View Switch (Grid vs List) */}
            <div className="flex items-center p-1 bg-surface-container-low rounded-DEFAULT border border-border-subtle">
              <button
                id="view-grid-btn"
                type="button"
                onClick={() => setViewMode('grid')}
                className={`h-10 px-3 flex items-center justify-center rounded-DEFAULT font-label-sm text-label-sm gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-surface-container-lowest text-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">grid_view</span>
                <span className="hidden sm:inline">Vignettes</span>
              </button>

              <button
                id="view-list-btn"
                type="button"
                onClick={() => setViewMode('list')}
                className={`h-10 px-3 flex items-center justify-center rounded-DEFAULT font-label-sm text-label-sm gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-surface-container-lowest text-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">format_list_bulleted</span>
                <span className="hidden sm:inline">Liste</span>
              </button>
            </div>

          </div>

        </div>

        {/* Category Filter Pills (7 Pills) */}
        <div id="category-filters" className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 scrollbar-none">
          {categories.map((cat) => {
            const isActive = selectedCategory === cat.key;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => setSelectedCategory(cat.key)}
                className={`filter-pill px-4 py-2 rounded-full font-label-sm text-label-sm whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'active-pill bg-primary text-on-primary shadow-xs'
                    : 'bg-surface-container-lowest text-on-surface-variant border border-border-subtle hover:border-primary hover:text-primary'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

      </div>

      {/* ========================================================================= */}
      {/* SECTION 4 : DOCUMENTS DISPLAY (GRID VS LIST)                             */}
      {/* ========================================================================= */}
      {isDocsLoading ? (
        <div className="mt-space-lg p-space-xl bg-surface-container-lowest rounded-2xl border border-border-subtle text-center flex flex-col items-center justify-center shadow-xs">
          <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin mb-3"></div>
          <span className="text-sm font-semibold text-slate-700">Chargement des documents officiels...</span>
        </div>
      ) : documents.length === 0 ? (
        /* État vide sobre et net (Annotation 6) */
        <div id="documents-container" className="mt-space-lg p-space-xl bg-surface-container-lowest rounded-2xl border border-border-subtle text-center flex flex-col items-center justify-center shadow-xs">
          <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-outline mb-space-sm">
            <span className="material-symbols-outlined text-[36px] text-slate-400">folder_open</span>
          </div>
          <h3 className="font-headline-sm text-base sm:text-lg text-forest-deep font-semibold max-w-lg leading-relaxed">
            Aucun document archivé pour le moment. Cliquez sur « + Déposer une pièce » pour archiver un document.
          </h3>
          <button
            id="btn-empty-upload"
            type="button"
            onClick={() => {
              setUploadModalMode('document');
              setIsUploadModalOpen(true);
            }}
            className="mt-space-md inline-flex items-center gap-2 h-[48px] px-6 rounded-DEFAULT bg-primary text-white font-label-md text-sm font-bold shadow-xs hover:bg-forest-deep transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">upload_file</span>
            <span>+ Déposer une pièce</span>
          </button>
        </div>
      ) : filteredDocuments.length === 0 ? (
        /* Filtre / Recherche sans résultat */
        <div id="no-docs-empty" className="mt-space-lg p-space-xl bg-surface-container-lowest rounded-2xl border border-border-subtle text-center flex flex-col items-center justify-center shadow-xs">
          <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-outline mb-space-sm">
            <span className="material-symbols-outlined text-[32px] text-slate-400">search_off</span>
          </div>
          <h3 className="font-headline-sm text-base text-on-surface font-semibold">
            Aucun document trouvé pour cette recherche
          </h3>
          <p className="font-body-md text-xs text-on-surface-variant mt-1 max-w-md">
            Aucun document ne correspond à vos filtres actuels.
          </p>
          <button
            id="btn-reset-filters"
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('all');
            }}
            className="mt-space-md inline-flex items-center gap-2 h-[44px] px-5 rounded-DEFAULT bg-surface-container-lowest border-2 border-primary text-primary font-label-md text-xs font-semibold hover:bg-sage-soft transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            <span>Réinitialiser les filtres</span>
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid Layout (4 colonnes) */
        <div id="documents-container" className="mt-space-md grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter transition-opacity duration-200">
          {filteredDocuments.map((doc) => {
            const docExt = (doc.filename || doc.file_name || doc.file_url || '').split('.').pop()?.toUpperCase() || 'PDF';
            const docTags = parseDocumentTags(doc);
            const firstTag = docTags.length > 0 ? docTags[0] : (doc.category || 'Général');
            const firstCatObj = categoriesList.find((c) => c.name === firstTag);

            return (
              <div
                key={doc.id || doc.filename}
                className="doc-card group bg-surface-container-lowest rounded-lg border border-border-subtle p-space-sm flex flex-col justify-between shadow-[0_2px_8px_-2px_rgba(6,95,70,0.04),0_6px_20px_-4px_rgba(15,23,42,0.05)] hover:border-sage-border hover:shadow-[0_8px_24px_-4px_rgba(6,95,70,0.09)] transition-all"
              >
                <div 
                  onClick={() => handleViewDocument(doc)} 
                  className="cursor-pointer group-hover:opacity-95 transition-opacity"
                  title="Cliquer pour consulter ce document"
                >
                  {/* Document Thumbnail Card */}
                  <div className="relative w-full h-44 rounded-DEFAULT bg-surface-container overflow-hidden flex flex-col justify-between p-3 border border-border-subtle/60">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-700 text-white uppercase shadow-xs">
                        {docExt}
                      </span>
                      <span className="text-xs text-on-surface-variant font-mono">
                        {doc.size || '—'}
                      </span>
                    </div>

                    {/* Stamp & Category Center (Mosaïque d'icônes si multi-tags) */}
                    <div className="flex flex-col items-center justify-center my-auto text-center px-2">
                      {docTags.length > 1 ? (
                        <div className="flex items-center justify-center gap-1.5 mb-1.5 flex-wrap max-w-full">
                          {docTags.slice(0, 3).map((tag) => {
                            const cat = categoriesList.find((c) => c.name === tag);
                            return (
                              <div
                                key={tag}
                                className="w-9 h-9 rounded-full flex items-center justify-center bg-sage-soft text-primary shadow-2xs border border-border-subtle"
                                title={tag}
                              >
                                <span className="text-lg">{cat?.emoji || '📁'}</span>
                              </div>
                            );
                          })}
                          {docTags.length > 3 && (
                            <span className="text-[10px] font-bold text-on-surface-variant bg-surface-container px-1.5 py-0.5 rounded-full">
                              +{docTags.length - 3}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-full flex items-center justify-center mb-1 bg-sage-soft text-primary">
                          <span className="text-2xl">{firstCatObj?.emoji || '📁'}</span>
                        </div>
                      )}
                      <span className="font-headline-sm text-xs font-bold text-forest-deep line-clamp-1" title={doc.title || doc.name}>
                        {doc.title || doc.name}
                      </span>
                      <span className="text-[11px] text-on-surface-variant font-label-sm truncate max-w-full">
                        {doc.notes ? `Org : ${doc.notes}` : (docTags.length > 0 ? docTags.join(' • ') : (doc.category || 'Général'))}
                      </span>
                    </div>

                    {/* Bottom Strip */}
                    <div className="flex items-center justify-between text-[11px] text-on-surface-variant bg-surface-container-lowest/80 backdrop-blur-xs px-2 py-1 rounded">
                      <span className="truncate max-w-[120px]">{doc.uploaded_by || 'Henri Jamet'}</span>
                      <span className="font-semibold text-primary">{doc.upload_date || 'Archivé'}</span>
                    </div>
                  </div>

                  {/* Document Metadata & Multi-Tags Mosaïque (Annotation 3) */}
                  <div className="mt-3">
                    <div className="doc-tags-mosaic flex items-center gap-1.5 flex-wrap mb-2 min-h-[26px]">
                      {docTags.length > 0 ? (
                        docTags.map((tag) => {
                          const cat = categoriesList.find((c) => c.name === tag);
                          const badgeColor = getTagColorClass(cat?.color);
                          return (
                            <span
                              key={tag}
                              className={`doc-tag-badge inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-semibold border ${badgeColor} shadow-2xs`}
                            >
                              <span>{cat?.emoji || '📁'}</span>
                              <span>{tag}</span>
                            </span>
                          );
                        })
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border bg-slate-100 text-slate-700 border-slate-200">
                          <span>📁</span>
                          <span>Sans étiquette</span>
                        </span>
                      )}
                    </div>
                    <h3
                      className="font-headline-sm text-sm text-forest-deep font-bold line-clamp-2 leading-tight doc-title-text"
                      title={doc.filename || doc.title}
                    >
                      {doc.filename || doc.title}
                    </h3>
                    <p className="font-body-md text-xs text-on-surface-variant mt-1">
                      {doc.upload_date || 'Date non renseignée'} • {doc.size || '—'} • {doc.uploaded_by || 'Henri Jamet'}
                    </p>
                  </div>
                </div>

                {/* Card Actions (Annotation 1 : Téléchargement supprimé des cartes directes, disponible dans le modal de consultation) */}
                <div className="mt-4 pt-3 border-t border-border-subtle flex items-center justify-between gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleViewDocument(doc);
                    }}
                    className="btn-view flex-1 h-[40px] px-3 rounded-DEFAULT bg-primary text-white font-label-sm text-xs hover:bg-forest-deep transition-all flex items-center justify-center gap-1.5 cursor-pointer font-bold shadow-xs"
                    title="Consulter le document"
                  >
                    <span className="material-symbols-outlined text-[17px]">visibility</span>
                    <span>Consulter</span>
                  </button>

                  <button
                    id={`btn-edit-doc-${doc.id || doc.filename}`}
                    type="button"
                    onClick={() => openRenameModal(doc)}
                    className="btn-rename p-2 h-[40px] w-[40px] rounded-DEFAULT bg-surface-container-lowest border-2 border-border-subtle text-on-surface-variant hover:text-primary hover:border-primary transition-all flex items-center justify-center cursor-pointer shrink-0"
                    title="Éditer le document (titre & étiquettes)"
                  >
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteDoc(doc)}
                    className="p-2 h-[40px] w-[40px] rounded-DEFAULT bg-surface-container-lowest border-2 border-rose-200 text-rose-600 hover:bg-rose-50 transition-all flex items-center justify-center cursor-pointer shrink-0"
                    title="Supprimer définitivement"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List Layout */
        <div id="documents-container" className="mt-space-md flex flex-col gap-3 transition-opacity duration-200">
          {filteredDocuments.map((doc) => {
            const docTags = parseDocumentTags(doc);
            const firstTag = docTags.length > 0 ? docTags[0] : (doc.category || 'Général');
            const firstCatObj = categoriesList.find((c) => c.name === firstTag);

            return (
              <div
                key={doc.id || doc.filename}
                className="doc-card group bg-surface-container-lowest rounded-DEFAULT border border-border-subtle p-3 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs hover:border-sage-border transition-all"
              >
                <div 
                  onClick={() => handleViewDocument(doc)} 
                  className="flex items-center gap-3 cursor-pointer group-hover:opacity-95 transition-opacity flex-1 min-w-0"
                  title="Cliquer pour consulter ce document"
                >
                  {docTags.length > 1 ? (
                    <div className="flex items-center -space-x-2 shrink-0">
                      {docTags.slice(0, 3).map((tag) => {
                        const cat = categoriesList.find((c) => c.name === tag);
                        return (
                          <div
                            key={tag}
                            className="w-10 h-10 rounded-full flex items-center justify-center bg-sage-soft text-primary border-2 border-white shadow-2xs text-lg"
                            title={tag}
                          >
                            {cat?.emoji || '📁'}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-sage-soft text-primary text-xl">
                      {firstCatObj?.emoji || '📁'}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="doc-tags-mosaic flex items-center gap-1.5 flex-wrap">
                      {docTags.length > 0 ? (
                        docTags.map((tag) => {
                          const cat = categoriesList.find((c) => c.name === tag);
                          const badgeColor = getTagColorClass(cat?.color);
                          return (
                            <span
                              key={tag}
                              className={`doc-tag-badge inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold border ${badgeColor} shadow-2xs`}
                            >
                              <span>{cat?.emoji || '📁'}</span>
                              <span>{tag}</span>
                            </span>
                          );
                        })
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border bg-slate-100 text-slate-700 border-slate-200">
                          <span>📁</span>
                          <span>Sans étiquette</span>
                        </span>
                      )}
                      <span className="text-xs font-mono text-on-surface-variant ml-1">{doc.size || '—'}</span>
                    </div>
                    <h3 className="font-headline-sm text-sm text-forest-deep font-bold line-clamp-1 doc-title-text mt-1 truncate" title={doc.filename || doc.title}>
                      {doc.filename || doc.title}
                    </h3>
                    <p className="font-body-md text-xs text-on-surface-variant truncate mt-0.5">
                      {doc.upload_date || 'Date'} • Déposant : {doc.uploaded_by || 'Henri Jamet'} {doc.notes ? `• Org : ${doc.notes}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleViewDocument(doc);
                    }}
                    className="btn-view h-[38px] px-3.5 rounded-DEFAULT bg-primary text-white font-label-sm text-xs hover:bg-forest-deep transition-all flex items-center gap-1.5 cursor-pointer font-bold shadow-xs"
                    title="Consulter ce document"
                  >
                    <span className="material-symbols-outlined text-[17px]">visibility</span>
                    <span>Consulter</span>
                  </button>
                  <button
                    id={`btn-edit-doc-list-${doc.id || doc.filename}`}
                    type="button"
                    onClick={() => openRenameModal(doc)}
                    className="btn-rename p-2 h-[38px] w-[38px] rounded-DEFAULT bg-surface-container-lowest border-2 border-border-subtle text-on-surface-variant hover:text-primary hover:border-primary transition-all flex items-center justify-center cursor-pointer"
                    title="Éditer le document (titre & étiquettes)"
                  >
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteDoc(doc)}
                    className="p-2 h-[38px] w-[38px] rounded-DEFAULT bg-surface-container-lowest border-2 border-rose-200 text-rose-600 hover:bg-rose-50 transition-all flex items-center justify-center cursor-pointer"
                    title="Supprimer"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1 : TÉLÉVERSER UN DOCUMENT CANONIQUE (UploadDocumentModal unifié)     */}
      {/* ========================================================================= */}
      <UploadDocumentModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUploadSuccess={handleUploadSuccess}
        currentUser={currentUser}
        mode={uploadModalMode}
        defaultCategory={uploadModalMode === 'invoice' ? 'Travaux & Factures' : undefined}
      />

      {/* ========================================================================= */}
      {/* MODAL ÉDITION DE CATÉGORIE (#modal-edit-category) (Annotation 10)         */}
      {/* ========================================================================= */}
      {isEditCategoryModalOpen && selectedEditingCat && (
        <div id="modal-edit-category" className="fixed inset-0 z-[70] bg-inverse-surface/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest w-full max-w-lg rounded-2xl p-space-lg shadow-[0_20px_48px_-12px_rgba(15,23,42,0.25)] border border-border-subtle relative max-h-[90vh] overflow-y-auto animate-in fade-in duration-150">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-space-sm border-b border-border-subtle">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-full bg-sage-soft flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[22px]">tune</span>
                </div>
                <div>
                  <h3 className="font-headline-sm text-base sm:text-lg text-forest-deep font-bold">
                    Éditer la catégorie
                  </h3>
                  <p className="font-body-md text-xs text-on-surface-variant">
                    Modifier les paramètres ou supprimer la catégorie « {selectedEditingCat.name} »
                  </p>
                </div>
              </div>
              <button
                id="btn-close-edit-category"
                type="button"
                onClick={() => setIsEditCategoryModalOpen(false)}
                className="w-9 h-9 rounded-full hover:bg-surface-container text-on-surface-variant flex items-center justify-center transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Modal Form */}
            <form id="edit-category-form" onSubmit={handleUpdateCategorySubmit} className="mt-space-md flex flex-col gap-4">
              
              {/* Nom de la catégorie */}
              <div>
                <label htmlFor="edit-cat-name" className="block font-label-md text-xs font-bold text-on-surface mb-1">
                  Nom de la catégorie *
                </label>
                <input
                  id="edit-cat-name"
                  type="text"
                  required
                  value={editCatName}
                  onChange={(e) => setEditCatName(e.target.value)}
                  placeholder="Ex : Assurance Habitation"
                  className="w-full h-[48px] px-4 bg-surface-container-lowest border-2 border-border-subtle rounded-DEFAULT font-body-md text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                />
              </div>

              {/* Émoji / Icône */}
              <div>
                <label htmlFor="edit-cat-emoji" className="block font-label-md text-xs font-bold text-on-surface mb-1">
                  Émoji / Icône représentatif
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="edit-cat-emoji"
                    type="text"
                    value={editCatEmoji}
                    onChange={(e) => setEditCatEmoji(e.target.value)}
                    maxLength={3}
                    className="w-14 h-[48px] text-center text-xl bg-surface-container-lowest border-2 border-border-subtle rounded-DEFAULT font-body-md text-on-surface focus:outline-none focus:border-primary transition-all"
                  />
                  <div className="flex items-center gap-1.5 flex-wrap flex-1 p-2 bg-surface-container-low rounded-DEFAULT border border-border-subtle">
                    {EMOJI_PRESETS.map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => setEditCatEmoji(em)}
                        className={`w-8 h-8 text-base rounded hover:bg-white flex items-center justify-center transition-all cursor-pointer ${
                          editCatEmoji === em ? 'ring-2 ring-primary bg-white shadow-xs' : ''
                        }`}
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Couleur associée */}
              <div>
                <label className="block font-label-md text-xs font-bold text-on-surface mb-1.5">
                  Couleur associée
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setEditCatColor(c.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-DEFAULT text-xs font-medium border cursor-pointer transition-all ${
                        editCatColor === c.id
                          ? 'ring-2 ring-primary ring-offset-1 font-bold shadow-xs'
                          : 'opacity-80 hover:opacity-100'
                      } ${c.badgeBg}`}
                    >
                      <span className={`w-3 h-3 rounded-full ${c.bg}`}></span>
                      <span>{c.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Actions de la modale */}
              <div className="mt-3 pt-space-sm border-t border-border-subtle flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                {/* Bouton rouge sobre Supprimer */}
                <button
                  type="button"
                  id="btn-delete-category"
                  onClick={handleDeleteCategory}
                  disabled={isDeletingCat || isUpdatingCat}
                  className="h-[44px] px-4 rounded-DEFAULT bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-800 border border-rose-200 font-label-md text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                  <span>{isDeletingCat ? 'Suppression...' : 'Supprimer cette catégorie'}</span>
                </button>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditCategoryModalOpen(false)}
                    className="h-[44px] px-4 rounded-DEFAULT bg-surface-container-lowest border-2 border-border-subtle text-on-surface font-label-md text-xs hover:bg-canvas-slate transition-all cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdatingCat || isDeletingCat || !editCatName.trim()}
                    className="h-[44px] px-5 rounded-DEFAULT bg-primary text-white font-label-md text-xs font-bold hover:bg-forest-deep transition-all flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {isUpdatingCat ? 'sync' : 'save'}
                    </span>
                    <span>{isUpdatingCat ? 'Enregistrement...' : 'Enregistrer les modifications'}</span>
                  </button>
                </div>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2 : DÉCLARER UNE DÉPENSE POUR LA SCI (#modal-operation)             */}
      {/* ========================================================================= */}
      {isOperationModalOpen && (
        <div id="modal-operation" className="fixed inset-0 z-50 bg-inverse-surface/45 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
          <div className="bg-surface-container-lowest w-full max-w-xl rounded-2xl shadow-[0_20px_48px_-12px_rgba(15,23,42,0.20)] border border-border-subtle relative flex flex-col max-h-[92vh] overflow-hidden">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border-subtle shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shrink-0">
                  <span className="material-symbols-outlined text-[22px]">receipt_long</span>
                </div>
                <div>
                  <h3 className="font-headline-sm text-headline-sm text-forest-deep font-semibold">
                    Déclarer une dépense pour la SCI
                  </h3>
                  <p className="font-body-md text-xs text-on-surface-variant">
                    Dépense déductible des prochaines factures
                  </p>
                </div>
              </div>
              <button
                id="btn-close-operation"
                type="button"
                onClick={() => {
                  setIsOperationModalOpen(false);
                  setOperationFileError('');
                  setOperationLabelError('');
                }}
                className="w-9 h-9 rounded-full hover:bg-surface-container text-on-surface-variant flex items-center justify-center transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Modal Form */}
            <form id="operation-form" onSubmit={handleOperationSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="overflow-y-auto p-4 sm:p-5 space-y-4 flex-1">
              
              {/* Callout Déductibilité — Sortie Exclusive (Annotation 5) */}
              <div
                id="callout-deductibilite"
                className="p-3.5 rounded-DEFAULT bg-emerald-50/90 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-950 dark:text-emerald-100 flex items-start gap-3 shadow-xs"
              >
                <span className="material-symbols-outlined text-[20px] text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5">
                  savings
                </span>
                <p className="font-body-md text-xs sm:text-sm font-medium leading-relaxed">
                  Toutes dépenses effectuées pour la SCI et déclarées ici seront réduites de vos prochaines factures.
                </p>
              </div>

              {/* Montant & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
                <div>
                  <label htmlFor="op-amount-input" className="block font-label-md text-label-md text-on-surface mb-2 font-semibold">
                    Montant de la dépense (€) <span className="text-error">*</span>
                  </label>
                  <div className="relative">
                    <input
                      id="op-amount-input"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      placeholder="0.00"
                      value={operationAmount}
                      onChange={(e) => setOperationAmount(e.target.value)}
                      className="w-full h-[52px] pl-4 pr-10 bg-surface-container-lowest border-2 border-border-subtle rounded-DEFAULT font-body-md text-body-md text-on-surface focus:outline-none focus:border-primary transition-all tabular-nums"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-on-surface-variant">€</span>
                  </div>
                </div>

                <div>
                  <label htmlFor="op-date-input" className="block font-label-md text-label-md text-on-surface mb-2 font-semibold">
                    Date de valeur / règlement
                  </label>
                  <input
                    id="op-date-input"
                    type="date"
                    value={operationDate}
                    onChange={(e) => setOperationDate(e.target.value)}
                    className="w-full h-[52px] px-4 bg-surface-container-lowest border-2 border-border-subtle rounded-DEFAULT font-body-md text-body-md text-on-surface focus:outline-none focus:border-primary transition-all"
                  />
                </div>
              </div>

              {/* Justification de paiement — obligatoire (Annotation 6) */}
              <div>
                <label htmlFor="op-label-input" className="block font-label-md text-label-md text-on-surface mb-2 font-semibold">
                  Justification de paiement (obligatoire)
                </label>
                <input
                  id="op-label-input"
                  type="text"
                  required
                  placeholder="Ex : Achat quincaillerie, réparation toiture, fournitures..."
                  value={operationLabel}
                  onChange={(e) => {
                    setOperationLabel(e.target.value);
                    if (operationLabelError) setOperationLabelError('');
                  }}
                  className={`w-full h-[52px] px-4 bg-surface-container-lowest border-2 ${
                    operationLabelError ? 'border-error' : 'border-border-subtle'
                  } rounded-DEFAULT font-body-md text-body-md text-on-surface focus:outline-none focus:border-primary transition-all`}
                />
                {operationLabelError && (
                  <p className="mt-1.5 text-xs text-error font-medium flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">error</span>
                    <span>{operationLabelError}</span>
                  </p>
                )}
              </div>

              {/* Justificatif / facture — obligatoire (Annotation 16 : Mécanique DRY deux boutons) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <label className="block font-label-md text-label-md text-on-surface font-semibold">
                    Justificatif / facture (obligatoire) <span className="text-error">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      id="btn-op-upload-doc"
                      type="button"
                      onClick={() => setIsOpUploadModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-DEFAULT bg-primary text-white font-label-md text-xs font-semibold hover:bg-forest-deep shadow-2xs transition-colors cursor-pointer"
                      title="Téléverser et archiver un nouveau justificatif officiel"
                    >
                      <span className="material-symbols-outlined text-[16px]">upload_file</span>
                      <span>Parcourir un document</span>
                    </button>
                    <button
                      id="btn-op-select-existing-doc"
                      type="button"
                      onClick={() => setIsOpSelectExistingModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-DEFAULT bg-surface-container-lowest border border-border-subtle hover:border-primary text-on-surface font-label-md text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                      title="Sélectionner un document déjà répertorié dans la SCI"
                    >
                      <span className="material-symbols-outlined text-[16px]">library_books</span>
                      <span>Choisir un document existant</span>
                    </button>
                  </div>
                </div>

                {/* État du document sélectionné */}
                {operationDocument || operationFileName ? (
                  <div
                    id="op-selected-doc-card"
                    className="flex items-center justify-between p-3 bg-surface-container-low dark:bg-slate-800/80 rounded-lg border border-border-subtle text-xs animate-in fade-in duration-150"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-[20px]">
                          {(operationFileName || '').toLowerCase().endsWith('.pdf') ? 'picture_as_pdf' : 'description'}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-on-surface truncate" title={operationFileName}>
                          {operationFileName}
                        </p>
                        <p className="text-[11px] text-on-surface-variant flex items-center gap-2">
                          <span>
                            {operationDocument?.id ? `Document SCI #${operationDocument.id}` : 'Fichier sélectionné'}
                          </span>
                          {operationDocument?.category && (
                            <span className="px-1.5 py-0.5 rounded bg-surface-container text-[10px]">
                              {operationDocument.category}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <button
                      id="btn-op-detach-doc"
                      type="button"
                      onClick={handleDetachOperationDoc}
                      className="w-7 h-7 rounded-full hover:bg-surface-container text-on-surface-variant hover:text-error flex items-center justify-center transition-colors cursor-pointer shrink-0 ml-2"
                      title="Retirer ce justificatif"
                      aria-label="Retirer ce justificatif"
                    >
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  </div>
                ) : (
                  <div
                    id="op-no-doc-placeholder"
                    className={`p-4 rounded-lg border border-dashed text-center text-xs transition-colors ${
                      operationFileError
                        ? 'border-error bg-rose-50/50 dark:bg-rose-950/20 text-error'
                        : 'border-border-subtle bg-surface-container-low/40 text-on-surface-variant'
                    }`}
                  >
                    <span>
                      Aucun justificatif sélectionné. Cliquez sur « <strong>Parcourir un document</strong> » pour téléverser un fichier ou sur « <strong>Choisir un document existant</strong> » pour associer un document déjà présent dans la SCI.
                    </span>
                  </div>
                )}

                {/* Avertissement rouge/ambre si aucun justificatif joint */}
                {operationFileError && (
                  <div
                    id="op-file-error-alert"
                    className="mt-2 p-2.5 rounded-DEFAULT bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 flex items-center gap-2 text-xs font-semibold animate-in fade-in duration-200"
                  >
                    <span className="material-symbols-outlined text-[18px] text-amber-600 dark:text-amber-400 shrink-0">
                      warning
                    </span>
                    <span>{operationFileError}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions - Pied FIXE toujours visible sur mobile */}
            <div className="p-3 sm:p-4 border-t border-border-subtle shrink-0 flex items-center justify-end gap-3 bg-surface-container-lowest">
              <button
                id="btn-cancel-operation"
                type="button"
                onClick={() => {
                  setIsOperationModalOpen(false);
                  setOperationFileError('');
                  setOperationLabelError('');
                }}
                className="h-[44px] px-5 rounded-DEFAULT bg-surface-container-lowest border-2 border-border-subtle text-on-surface font-label-lg text-sm hover:bg-canvas-slate transition-all cursor-pointer"
              >
                Annuler
              </button>
              <button
                id="btn-submit-operation"
                type="submit"
                disabled={isSubmittingOperation}
                className="h-[44px] px-6 rounded-DEFAULT bg-surface-container-lowest border-2 border-primary text-primary font-label-lg text-sm font-bold hover:bg-sage-soft transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[20px]">
                  {isSubmittingOperation ? 'progress_activity' : 'save'}
                </span>
                <span>{isSubmittingOperation ? 'Enregistrement...' : 'Enregistrer la dépense'}</span>
              </button>
            </div>

          </form>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3 : ÉDITER LE DOCUMENT (TITRE ET ÉTIQUETTES / TAGS) (#modal-rename) */}
      {/* ========================================================================= */}
      {isRenameModalOpen && selectedRenamingDoc && (
        <div id="modal-rename" className="fixed inset-0 z-50 bg-inverse-surface/45 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest w-full max-w-lg rounded-2xl p-space-lg shadow-[0_20px_48px_-12px_rgba(15,23,42,0.25)] border border-border-subtle relative max-h-[90vh] overflow-y-auto animate-in fade-in duration-150">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-space-sm border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-sage-soft flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[22px]">edit</span>
                </div>
                <div>
                  <h3 className="font-headline-sm text-base sm:text-lg text-forest-deep font-bold">
                    Éditer le document
                  </h3>
                  <p className="font-body-md text-xs text-on-surface-variant">
                    Modifier le titre ou ajuster les étiquettes et badges associés
                  </p>
                </div>
              </div>
              <button
                id="btn-close-rename"
                type="button"
                onClick={() => setIsRenameModalOpen(false)}
                className="w-9 h-9 rounded-full hover:bg-surface-container text-on-surface-variant flex items-center justify-center transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Modal Form */}
            <form id="rename-form" onSubmit={handleRenameSubmit} className="mt-space-md flex flex-col gap-4">
              <div>
                <label htmlFor="rename-input" className="block font-label-md text-xs font-bold text-on-surface mb-1">
                  1. Nom de fichier / Titre du document *
                </label>
                <input
                  id="rename-input"
                  type="text"
                  required
                  value={renameInputValue}
                  onChange={(e) => setRenameInputValue(e.target.value)}
                  className="w-full h-[48px] px-4 bg-surface-container-lowest border-2 border-border-subtle rounded-DEFAULT font-body-md text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                  placeholder="Ex : Facture EDF 022025"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="rename-tags-select" className="block font-label-md text-xs font-bold text-on-surface">
                    2. Étiquettes &amp; Badges associés (Multi-Tags)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      handleOpenEditCategoryModal();
                    }}
                    className="text-xs text-primary hover:text-forest-deep font-bold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[15px]">palette</span>
                    <span>Gérer les étiquettes</span>
                  </button>
                </div>

                <TagMultiSelect
                  id="rename-tags-select"
                  selectedTags={renameDocTags}
                  onChange={(newTags) => setRenameDocTags(newTags)}
                  availableCategories={categoriesList}
                  onOpenCreateCategory={() => handleOpenEditCategoryModal()}
                  onOpenEditCategory={(catName) => handleOpenEditCategoryModal(catName)}
                  placeholder="Ajouter des étiquettes au document..."
                />
              </div>

              <div className="mt-space-sm pt-space-sm border-t border-border-subtle flex items-center justify-end gap-space-sm">
                <button
                  id="btn-cancel-rename"
                  type="button"
                  onClick={() => setIsRenameModalOpen(false)}
                  className="h-[48px] px-5 rounded-DEFAULT bg-surface-container-lowest border-2 border-border-subtle text-on-surface font-label-lg text-sm hover:bg-canvas-slate transition-all cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  id="btn-submit-rename"
                  type="submit"
                  className="h-[48px] px-6 rounded-DEFAULT bg-primary text-white font-label-lg text-sm font-bold hover:bg-forest-deep transition-all flex items-center gap-2 cursor-pointer shadow-xs"
                >
                  <span className="material-symbols-outlined text-[20px]">check</span>
                  <span>Enregistrer les modifications</span>
                </button>
              </div>
            </form>

          </div>
        </div>
      )}


      {/* ========================================================================= */}
      {/* MODAL 4B : UPLOAD DOCUMENT JUSTIFICATIF OPÉRATION (Annotation 16 DRY)     */}
      {/* ========================================================================= */}
      <UploadDocumentModal
        isOpen={isOpUploadModalOpen}
        onClose={() => setIsOpUploadModalOpen(false)}
        defaultCategory="Travaux & Factures"
        currentUser={currentUser}
        onUploadSuccess={handleOpUploadSuccess}
      />

      {/* ========================================================================= */}
      {/* MODAL 4C : SÉLECTION DOCUMENT EXISTANT OPÉRATION (Annotation 16 DRY)      */}
      {/* ========================================================================= */}
      <SelectExistingDocumentModal
        isOpen={isOpSelectExistingModalOpen}
        onClose={() => setIsOpSelectExistingModalOpen(false)}
        alreadyAttachedDocIds={operationDocument ? [operationDocument.id] : []}
        onAttachSuccess={handleOpSelectExistingSuccess}
      />

      {/* ========================================================================= */}
      {/* MODAL 5 : GRAND LIVRE FINANCIER & CCA                                     */}
      {/* ========================================================================= */}
      <FinancialLedgerModal
        isOpen={isFinancialModalOpen}
        onClose={() => setIsFinancialModalOpen(false)}
        initialTab={financialModalTab}
      />

      {/* ========================================================================= */}
      {/* MODAL 6 : VISIONNEUSE UNIVERSELLE INTÉGRÉE (Annotation 9)                */}
      {/* ========================================================================= */}
      <DocumentViewerModal
        isOpen={isViewerOpen}
        onClose={() => {
          setIsViewerOpen(false);
          setViewerDoc(null);
        }}
        document={viewerDoc}
        onDownload={handleDownload}
      />

      {/* ========================================================================= */}
      {/* TOAST FEEDBACK NOTIFICATION (Notifications positives / succès exclusif)   */}
      {/* ========================================================================= */}
      {toast.visible && toast.icon !== 'error' && (
        <div
          id="toast-feedback"
          role="status"
          className="fixed bottom-6 right-6 z-50 px-5 py-3.5 rounded-xl shadow-2xl border flex items-center gap-3 transition-all duration-300 max-w-md md:max-w-lg bg-forest-deep text-on-primary border-sage-border shadow-forest-deep/30 translate-y-0 opacity-100 pointer-events-auto"
        >
          <span
            id="toast-icon"
            className="material-symbols-outlined text-[24px] shrink-0 text-secondary-fixed"
          >
            {toast.icon}
          </span>
          <div className="flex flex-col flex-1 min-w-0 pr-1">
            <span id="toast-title" className="font-label-md text-label-md font-bold leading-tight">
              {toast.title}
            </span>
            <span id="toast-desc" className="font-body-md text-xs opacity-90 break-words mt-0.5 select-text font-mono">
              {toast.desc}
            </span>
          </div>
          <button
            id="btn-close-toast"
            type="button"
            onClick={() => setToast((prev) => ({ ...prev, visible: false }))}
            className="shrink-0 p-1.5 rounded-full hover:bg-white/10 active:bg-white/20 transition-colors text-white/80 hover:text-white cursor-pointer ml-1"
            title="Fermer"
            aria-label="Fermer la notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

    </div>
  );
}
