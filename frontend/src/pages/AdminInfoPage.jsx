import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  FileText, Landmark, ShieldCheck, Download, Copy, Check, Calculator,
  Euro, PieChart, Info, ArrowUpRight, CheckCircle2, UserCheck, AlertCircle, FileCheck,
  ChevronDown, ChevronUp, Calendar, Users, Sparkles, BookOpen, X, Plus, Upload,
  Trash2, Paperclip, FileCode, Image as ImageIcon, File, Eye, AlertTriangle, RefreshCw,
  Pencil, Lock, User, Receipt, Wallet, FileSpreadsheet, ExternalLink
} from 'lucide-react';
import FinancialLedgerModal from '../components/FinancialLedgerModal';
import BankReauthBanner from '../components/BankReauthBanner';
import {
  fetchDocuments,
  fetchDocumentCategories,
  createDocumentCategory,
  uploadDocument,
  deleteDocument,
  fetchBankStatus
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
  const isCoordinator = activeUser === 'Henri' || activeUser === 'Henri Jamet' || (typeof activeUser === 'object' && activeUser?.prenom === 'Henri');

  // KPI Financial Totals (Zéro valeur inventée - initialisé à null)
  const [financialTotals, setFinancialTotals] = useState({
    entrees: null,
    sorties: null,
    reserves: null
  });

  // Open Banking Status
  const [bankStatus, setBankStatus] = useState(null);

  const loadBankStatus = async () => {
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
  const [isOperationModalOpen, setIsOperationModalOpen] = useState(false);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [selectedRenamingDoc, setSelectedRenamingDoc] = useState(null);
  const [renameInputValue, setRenameInputValue] = useState('');

  // Upload Modal State (Annotation 5 : Organisme, Titre, Format Canonique, Catégories Custom)
  const [uploadOrganisme, setUploadOrganisme] = useState('');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCategory, setUploadCategory] = useState('');
  const [uploadAuthor, setUploadAuthor] = useState(typeof activeUser === 'string' ? activeUser : 'Henri Jamet');
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [isSubmittingUpload, setIsSubmittingUpload] = useState(false);

  // Création catégorie personnalisée inline
  const [isNewCategoryOpen, setIsNewCategoryOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatEmoji, setNewCatEmoji] = useState('📁');
  const [newCatColor, setNewCatColor] = useState('slate');
  const [isCreatingCat, setIsCreatingCat] = useState(false);

  const [operationType, setOperationType] = useState('in'); // 'in' | 'out'
  const [operationAmount, setOperationAmount] = useState('');
  const [operationDate, setOperationDate] = useState('2026-06-15');
  const [operationLabel, setOperationLabel] = useState('');
  const [operationFileName, setOperationFileName] = useState('');

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
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ visible: true, title, desc, icon });

    // RÈGLE IMPÉRATIVE HENRI : Ne JAMAIS effacer automatiquement les erreurs !
    // L'utilisateur doit pouvoir lire l'intégralité du message d'erreur tant qu'il ne l'a pas fermé manuellement.
    const isError = icon === 'error' || icon === 'alert' || (title && title.toLowerCase().includes('erreur'));
    if (!isError) {
      toastTimerRef.current = setTimeout(() => {
        setToast((prev) => ({ ...prev, visible: false }));
      }, 4000);
    }
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

  useEffect(() => {
    loadBankStatus();
    loadDocuments();
    loadCategories();
  }, []);

  useEffect(() => {
    // Traitement du retour de consentement Open Banking Tilisy / Swan
    const searchParams = new URLSearchParams(window.location.search);
    const bankingParam = searchParams.get('banking');
    if (bankingParam === 'success') {
      setBankingError(null);
      showToast('Liaison bancaire validée', 'Le consentement DSP2 Swan a été renouvelé avec succès.', 'check_circle');
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

  // Téléchargement réel de document
  const handleDownload = (doc) => {
    if (doc.file_url || doc.url) {
      const targetUrl = doc.file_url || doc.url;
      const targetName = doc.filename || doc.file_name || doc.name || doc.title || 'document.pdf';
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

  // Rename document workflow
  const openRenameModal = (doc) => {
    setSelectedRenamingDoc(doc);
    setRenameInputValue(doc.title || doc.name || '');
    setIsRenameModalOpen(true);
  };

  const handleRenameSubmit = (e) => {
    e.preventDefault();
    if (!selectedRenamingDoc || !renameInputValue.trim()) return;

    const newTitle = renameInputValue.trim();
    setDocuments((prev) =>
      prev.map((d) => (d.id === selectedRenamingDoc.id ? { ...d, title: newTitle, name: newTitle } : d))
    );
    setIsRenameModalOpen(false);
    showToast('Document renommé', 'Le titre a été actualisé.', 'edit');
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

  // Upload document workflow (Annotation 5 : Enregistrement réel avec format canonique et catégorie)
  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!uploadOrganisme.trim() || !uploadTitle.trim() || !uploadFile) {
      showToast('Champs requis', 'Veuillez renseigner l\'organisme, le titre et sélectionner un fichier.', 'warning');
      return;
    }

    setIsSubmittingUpload(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('organisme', uploadOrganisme.trim());
      formData.append('title', uploadTitle.trim());
      formData.append('category', uploadCategory || (categoriesList[0]?.name || 'Actes & Statuts'));
      formData.append('uploaded_by', uploadAuthor || 'Henri Jamet');

      const newDoc = await uploadDocument(formData);
      setDocuments((prev) => [newDoc, ...prev]);
      setIsUploadModalOpen(false);
      setUploadOrganisme('');
      setUploadTitle('');
      setUploadFile(null);
      setUploadedFileName('');
      showToast('Document archivé', `« ${newDoc.filename || newDoc.name} » a été archivé avec succès.`, 'cloud_done');
    } catch (err) {
      showToast('Erreur de téléversement', err.message, 'error');
    } finally {
      setIsSubmittingUpload(false);
    }
  };

  // Operation workflow
  const handleOperationSubmit = (e) => {
    e.preventDefault();
    const amountNum = parseFloat(operationAmount);
    if (isNaN(amountNum) || amountNum <= 0) return;

    if (operationType === 'in') {
      setFinancialTotals((prev) => ({
        ...prev,
        entrees: (prev.entrees !== null ? prev.entrees : 0) + amountNum,
        reserves: prev.reserves !== null ? prev.reserves + amountNum : amountNum
      }));
    } else {
      setFinancialTotals((prev) => ({
        ...prev,
        sorties: (prev.sorties !== null ? prev.sorties : 0) + amountNum,
        reserves: prev.reserves !== null ? prev.reserves - amountNum : -amountNum
      }));
    }

    setIsOperationModalOpen(false);
    showToast(
      'Opération enregistrée',
      `${operationType === 'in' ? '+' : '-'}${amountNum.toFixed(2)} € — ${operationLabel}`,
      'payments'
    );
    setOperationAmount('');
    setOperationLabel('');
    setOperationFileName('');
  };

  // Pre-fill operation for quick invoice payment
  const openPayInvoiceOperation = (inv) => {
    const rawVal = inv?.amount ? String(inv.amount).replace('€', '').replace(/\s/g, '').replace(',', '.') : '';
    setOperationType('out');
    setOperationAmount(parseFloat(rawVal) || '');
    setOperationLabel(`Règlement Facture ${inv.supplier} (${inv.reference})`);
    setIsOperationModalOpen(true);
  };

  // Filter & Search Documents (Données réelles)
  const filteredDocuments = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return documents
      .filter((doc) => {
        const docCat = doc.category || '';
        const matchesCategory = selectedCategory === 'all' || docCat === selectedCategory;
        const docTitle = (doc.title || doc.name || doc.filename || '').toLowerCase();
        const docAuthor = (doc.uploaded_by || doc.author || '').toLowerCase();
        const docOrg = (doc.notes || '').toLowerCase();

        const matchesSearch =
          q === '' ||
          docTitle.includes(q) ||
          docAuthor.includes(q) ||
          docOrg.includes(q) ||
          docCat.toLowerCase().includes(q);

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

  // Dynamic Category Counts
  const categoryCounts = useMemo(() => {
    const counts = { all: documents.length };
    documents.forEach((d) => {
      const cat = d.category || 'Autre';
      counts[cat] = (counts[cat] || 0) + 1;
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

    // Compléter avec les catégories présentes dans les documents qui ne seraient pas dans categoriesList
    documents.forEach((d) => {
      if (d.category && !seen.has(d.category)) {
        seen.add(d.category);
        base.push({
          key: d.category,
          label: `📁 ${d.category} (${categoryCounts[d.category] || 0})`,
          emoji: '📁',
          color: 'slate'
        });
      }
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
                setOperationType('in');
                setIsOperationModalOpen(true);
              }}
              className="group flex items-center justify-center gap-2 px-5 py-3.5 rounded-DEFAULT bg-white dark:bg-slate-900 border-2 border-outline-variant text-on-surface hover:bg-canvas-slate hover:border-outline font-label-lg text-sm sm:text-base font-semibold transition-all duration-200 shadow-sm cursor-pointer whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[22px] text-on-surface-variant group-hover:scale-110 transition-transform">payments</span>
              <span>Ajouter une opération</span>
            </button>

            <button
              id="btn-open-upload"
              type="button"
              onClick={() => setIsUploadModalOpen(true)}
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
                    Échec du consentement bancaire Swan
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
        <BankReauthBanner bankStatus={bankStatus} onRefresh={loadBankStatus} />

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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
          
          {/* Card 1: Entrées / Cotisations CCA */}
          <div
            onClick={() => {
              setOperationType('in');
              setIsOperationModalOpen(true);
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
                      : '?'}
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
                      : '?'}
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
                      : '?'}
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
      </div>

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
                      onClick={() => handleDownload(inv.filename, inv.filename)}
                      className="btn-download inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container-low text-forest-deep hover:bg-sage-soft border border-border-subtle transition-all text-xs font-semibold cursor-pointer"
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
                        onClick={() => handleDownload(inv.filename, inv.filename)}
                        className="btn-download px-3 h-8 rounded-DEFAULT bg-surface-container-lowest border border-primary text-primary hover:bg-sage-soft transition-all text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[15px]">visibility</span>
                        <span>Consulter</span>
                      </button>

                      {inv.statusType === 'pending' ? (
                        <button
                          type="button"
                          onClick={() => openPayInvoiceOperation(inv)}
                          className="px-3 h-8 rounded-DEFAULT bg-primary text-on-primary hover:bg-forest-deep transition-all text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[15px]">payments</span>
                          <span>Régler</span>
                        </button>
                      ) : inv.statusType === 'paid' ? (
                        <button
                          type="button"
                          onClick={() => handleDownload(`Recu-${inv.filename}`, `Recu-${inv.filename}`)}
                          className="btn-download px-3 h-8 rounded-DEFAULT bg-primary text-on-primary hover:bg-forest-deep transition-all text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[15px]">download</span>
                          <span>Reçu</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleDownload(inv.filename, inv.filename)}
                          className="btn-download px-3 h-8 rounded-DEFAULT bg-surface-container-lowest border border-border-subtle text-on-surface-variant hover:text-primary hover:border-primary transition-all text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[15px]">download</span>
                          <span>PDF</span>
                        </button>
                      )}
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
              <div className="relative">
                <select
                  id="sort-select"
                  value={sortCriteria}
                  onChange={(e) => setSortCriteria(e.target.value)}
                  className="h-[52px] pl-4 pr-10 bg-surface-container-lowest border-2 border-border-subtle rounded-DEFAULT font-label-md text-label-md text-on-surface focus:outline-none focus:border-primary transition-all appearance-none cursor-pointer"
                >
                  <option value="recent">Date (Plus récent en premier)</option>
                  <option value="name">Nom alphabétique (A-Z)</option>
                  <option value="size">Taille de fichier</option>
                </select>
                <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
                  expand_more
                </span>
              </div>
            </div>

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
            onClick={() => setIsUploadModalOpen(true)}
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
            const catObj = categoriesList.find((c) => c.name === doc.category);
            const badgeColorClass = COLOR_OPTIONS.find((c) => c.id === catObj?.color)?.badgeBg || 'bg-slate-100 text-slate-800 border-slate-200';

            return (
              <div
                key={doc.id || doc.filename}
                className="doc-card group bg-surface-container-lowest rounded-lg border border-border-subtle p-space-sm flex flex-col justify-between shadow-[0_2px_8px_-2px_rgba(6,95,70,0.04),0_6px_20px_-4px_rgba(15,23,42,0.05)] hover:border-sage-border hover:shadow-[0_8px_24px_-4px_rgba(6,95,70,0.09)] transition-all"
              >
                <div>
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

                    {/* Stamp & Category Center */}
                    <div className="flex flex-col items-center justify-center my-auto text-center px-2">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center mb-1 bg-sage-soft text-primary">
                        <span className="text-2xl">{catObj?.emoji || '📁'}</span>
                      </div>
                      <span className="font-headline-sm text-xs font-bold text-forest-deep line-clamp-1" title={doc.title || doc.name}>
                        {doc.title || doc.name}
                      </span>
                      <span className="text-[11px] text-on-surface-variant font-label-sm truncate max-w-full">
                        {doc.notes ? `Org : ${doc.notes}` : doc.category}
                      </span>
                    </div>

                    {/* Bottom Strip */}
                    <div className="flex items-center justify-between text-[11px] text-on-surface-variant bg-surface-container-lowest/80 backdrop-blur-xs px-2 py-1 rounded">
                      <span className="truncate max-w-[120px]">{doc.uploaded_by || 'Henri Jamet'}</span>
                      <span className="font-semibold text-primary">{doc.upload_date || 'Archivé'}</span>
                    </div>
                  </div>

                  {/* Document Metadata */}
                  <div className="mt-3">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold border ${badgeColorClass} mb-1.5`}>
                      <span>{catObj?.emoji || '📁'}</span>
                      <span>{doc.category || 'Général'}</span>
                    </span>
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

                {/* Card Actions */}
                <div className="mt-4 pt-3 border-t border-border-subtle flex items-center justify-between gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleDownload(doc)}
                    className="btn-download flex-1 h-[40px] px-2 rounded-DEFAULT bg-surface-container-lowest border-2 border-primary text-primary font-label-sm text-xs hover:bg-sage-soft transition-all flex items-center justify-center gap-1 cursor-pointer font-bold"
                    title="Télécharger le document"
                  >
                    <span className="material-symbols-outlined text-[16px]">download</span>
                    <span>Télécharger</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openRenameModal(doc)}
                    className="btn-rename p-2 h-[40px] w-[40px] rounded-DEFAULT bg-surface-container-lowest border-2 border-border-subtle text-on-surface-variant hover:text-primary hover:border-primary transition-all flex items-center justify-center cursor-pointer"
                    title="Renommer le fichier"
                  >
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteDoc(doc)}
                    className="p-2 h-[40px] w-[40px] rounded-DEFAULT bg-surface-container-lowest border-2 border-rose-200 text-rose-600 hover:bg-rose-50 transition-all flex items-center justify-center cursor-pointer"
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
            const catObj = categoriesList.find((c) => c.name === doc.category);
            const badgeColorClass = COLOR_OPTIONS.find((c) => c.id === catObj?.color)?.badgeBg || 'bg-slate-100 text-slate-800 border-slate-200';

            return (
              <div
                key={doc.id || doc.filename}
                className="doc-card group bg-surface-container-lowest rounded-DEFAULT border border-border-subtle p-3 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs hover:border-sage-border transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-sage-soft text-primary text-xl">
                    {catObj?.emoji || '📁'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${badgeColorClass}`}>
                        {catObj?.emoji || '📁'} {doc.category}
                      </span>
                      <span className="text-xs font-mono text-on-surface-variant">{doc.size || '—'}</span>
                    </div>
                    <h3 className="font-headline-sm text-sm text-forest-deep font-bold line-clamp-1 doc-title-text mt-0.5" title={doc.filename || doc.title}>
                      {doc.filename || doc.title}
                    </h3>
                    <p className="font-body-md text-xs text-on-surface-variant">
                      {doc.upload_date || 'Date'} • Déposant : {doc.uploaded_by || 'Henri Jamet'} {doc.notes ? `• Org : ${doc.notes}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
                  <button
                    type="button"
                    onClick={() => handleDownload(doc)}
                    className="btn-download h-[38px] px-3 rounded-DEFAULT bg-surface-container-lowest border-2 border-primary text-primary font-label-sm text-xs hover:bg-sage-soft transition-all flex items-center gap-1 cursor-pointer font-bold"
                  >
                    <span className="material-symbols-outlined text-[16px]">download</span>
                    <span>Télécharger</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openRenameModal(doc)}
                    className="btn-rename p-2 h-[38px] w-[38px] rounded-DEFAULT bg-surface-container-lowest border-2 border-border-subtle text-on-surface-variant hover:text-primary hover:border-primary transition-all flex items-center justify-center cursor-pointer"
                    title="Renommer"
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
      {/* MODAL 1 : TÉLÉVERSER UN DOCUMENT CANONIQUE (#modal-upload) (Annotation 5)   */}
      {/* ========================================================================= */}
      {isUploadModalOpen && (
        <div id="modal-upload" className="fixed inset-0 z-50 bg-inverse-surface/45 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest w-full max-w-xl rounded-2xl p-space-lg shadow-[0_20px_48px_-12px_rgba(15,23,42,0.20)] border border-border-subtle relative max-h-[92vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-space-sm border-b border-border-subtle">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-full bg-sage-soft flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[22px]">upload_file</span>
                </div>
                <div>
                  <h3 className="font-headline-sm text-base sm:text-lg text-forest-deep font-bold">
                    Téléverser un document officiel
                  </h3>
                  <p className="font-body-md text-xs text-on-surface-variant">
                    Nommage canonique automatique &amp; archivage pérenne SCI Hellenvilliers
                  </p>
                </div>
              </div>
              <button
                id="btn-close-upload"
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="w-9 h-9 rounded-full hover:bg-surface-container text-on-surface-variant flex items-center justify-center transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Modal Form */}
            <form id="upload-form" onSubmit={handleUploadSubmit} className="mt-space-md flex flex-col gap-4">
              
              {/* Drag & Drop Zone */}
              <div>
                <label className="block font-label-md text-xs font-bold text-on-surface mb-1.5">
                  Fichier numérique certifié (PDF, Scan, Image) *
                </label>
                <label className="border-2 border-dashed border-border-subtle hover:border-primary rounded-DEFAULT p-space-md flex flex-col items-center justify-center text-center bg-surface-container-low cursor-pointer transition-all block">
                  <span className="material-symbols-outlined text-[36px] text-primary mb-1">cloud_upload</span>
                  <span className="font-label-md text-sm text-on-surface font-semibold">
                    {uploadedFileName ? uploadedFileName : "Glissez votre document ici ou parcourez vos dossiers"}
                  </span>
                  <span className="font-body-md text-xs text-on-surface-variant mt-0.5">
                    Format officiel PDF recommandé, scan ou image (Max 25 Mo)
                  </span>
                  <input
                    id="file-drop-input"
                    type="file"
                    required
                    accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        const file = e.target.files[0];
                        setUploadFile(file);
                        setUploadedFileName(file.name);
                        if (!uploadTitle) {
                          const base = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
                          setUploadTitle(base);
                        }
                      }
                    }}
                  />
                </label>
              </div>

              {/* Champ 1 : Organisme émetteur ou destinataire */}
              <div>
                <label htmlFor="doc-organisme-input" className="block font-label-md text-xs font-bold text-on-surface mb-1">
                  1. Organisme émetteur ou destinataire *
                </label>
                <input
                  id="doc-organisme-input"
                  type="text"
                  required
                  placeholder="Ex : SPoMi, Postfinance, Notaire, Declercq, Enedis, AXA..."
                  value={uploadOrganisme}
                  onChange={(e) => setUploadOrganisme(e.target.value)}
                  className="w-full h-[48px] px-4 bg-surface-container-lowest border-2 border-border-subtle rounded-DEFAULT font-body-md text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                />
              </div>

              {/* Champ 2 : Titre du document */}
              <div>
                <label htmlFor="doc-title-input" className="block font-label-md text-xs font-bold text-on-surface mb-1">
                  2. Titre du document *
                </label>
                <input
                  id="doc-title-input"
                  type="text"
                  required
                  placeholder="Ex : Permis B Fribourg, Extrait RNE, Facture entretien chaudière..."
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  className="w-full h-[48px] px-4 bg-surface-container-lowest border-2 border-border-subtle rounded-DEFAULT font-body-md text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                />
              </div>

              {/* Champ 3 : Calcul automatique du Nom Canonique en direct */}
              <div className="p-3.5 bg-surface-container-low rounded-DEFAULT border border-border-subtle text-xs space-y-1">
                <div className="flex items-center justify-between text-slate-500 font-medium">
                  <span>Nom d'enregistrement canonique officiel :</span>
                  <span className="font-mono text-[10px] text-primary bg-white px-2 py-0.5 rounded border border-border-subtle font-bold">
                    ORGANISME MMAAAA Titre.ext
                  </span>
                </div>
                <div className="font-mono text-xs sm:text-sm font-bold text-forest-deep break-all">
                  {getCanonicalFileName}
                </div>
              </div>

              {/* Sélecteur de Catégorie & Bouton + Nouvelle catégorie (Annotation 5) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="doc-category-select" className="font-label-md text-xs font-bold text-on-surface">
                    Catégorie d'archive *
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsNewCategoryOpen(!isNewCategoryOpen)}
                    className="text-xs text-primary hover:text-forest-deep font-bold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {isNewCategoryOpen ? 'remove_circle' : 'add_circle'}
                    </span>
                    <span>{isNewCategoryOpen ? 'Masquer' : '+ Nouvelle catégorie'}</span>
                  </button>
                </div>

                {/* Sous-formulaire de création de catégorie maison */}
                {isNewCategoryOpen && (
                  <div className="p-3.5 mb-3 bg-surface-container-low rounded-DEFAULT border border-primary/30 space-y-3 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-forest-deep flex items-center gap-1">
                        <span className="material-symbols-outlined text-[16px] text-primary">palette</span>
                        Créer une catégorie maison
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Nom</label>
                        <input
                          type="text"
                          placeholder="Ex: Assurance Habitation"
                          value={newCatName}
                          onChange={(e) => setNewCatName(e.target.value)}
                          className="w-full h-9 px-2.5 bg-white border border-border-subtle rounded text-xs focus:outline-none focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Émoji</label>
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={newCatEmoji}
                            onChange={(e) => setNewCatEmoji(e.target.value)}
                            className="w-12 h-9 text-center bg-white border border-border-subtle rounded text-sm focus:outline-none focus:border-primary"
                            maxLength={3}
                          />
                          <div className="flex items-center gap-0.5 overflow-x-auto py-0.5">
                            {EMOJI_PRESETS.slice(0, 6).map((em) => (
                              <button
                                key={em}
                                type="button"
                                onClick={() => setNewCatEmoji(em)}
                                className={`w-7 h-7 text-xs rounded hover:bg-white cursor-pointer ${newCatEmoji === em ? 'ring-2 ring-primary bg-white' : ''}`}
                              >
                                {em}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Palette de couleurs sobres */}
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1.5">Couleur associée</label>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {COLOR_OPTIONS.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setNewCatColor(c.id)}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border cursor-pointer transition-all ${
                              newCatColor === c.id
                                ? 'ring-2 ring-primary ring-offset-1 font-bold shadow-xs'
                                : 'opacity-80 hover:opacity-100'
                            } ${c.badgeBg}`}
                          >
                            <span className={`w-2.5 h-2.5 rounded-full ${c.bg}`}></span>
                            <span>{c.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-border-subtle">
                      <button
                        type="button"
                        onClick={() => setIsNewCategoryOpen(false)}
                        className="px-3 py-1.5 rounded text-xs text-slate-600 hover:bg-white"
                      >
                        Annuler
                      </button>
                      <button
                        type="button"
                        onClick={handleCreateCategorySubmit}
                        disabled={isCreatingCat || !newCatName.trim()}
                        className="px-3 py-1.5 rounded bg-primary text-white text-xs font-bold hover:bg-forest-deep disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                      >
                        {isCreatingCat ? 'Création...' : 'Valider la catégorie'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Liste des catégories disponibles */}
                <select
                  id="doc-category-select"
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value)}
                  className="w-full h-[48px] px-3 bg-surface-container-lowest border-2 border-border-subtle rounded-DEFAULT font-body-md text-sm text-on-surface focus:outline-none focus:border-primary transition-all cursor-pointer"
                >
                  {categoriesList.map((cat) => (
                    <option key={cat.id || cat.name} value={cat.name}>
                      {cat.emoji || '📁'} {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Déposant */}
              <div>
                <label htmlFor="doc-author-input" className="block font-label-md text-xs font-bold text-on-surface mb-1">
                  Déposant / Associé
                </label>
                <input
                  id="doc-author-input"
                  type="text"
                  value={uploadAuthor}
                  onChange={(e) => setUploadAuthor(e.target.value)}
                  className="w-full h-[48px] px-4 bg-surface-container-lowest border-2 border-border-subtle rounded-DEFAULT font-body-md text-sm text-on-surface focus:outline-none focus:border-primary transition-all"
                />
              </div>

              {/* Actions de la modale */}
              <div className="mt-2 pt-space-sm border-t border-border-subtle flex items-center justify-end gap-space-sm">
                <button
                  id="btn-cancel-upload"
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="h-[48px] px-5 rounded-DEFAULT bg-surface-container-lowest border-2 border-border-subtle text-on-surface font-label-lg text-sm hover:bg-canvas-slate transition-all cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingUpload}
                  className="h-[48px] px-6 rounded-DEFAULT bg-primary text-white font-label-lg text-sm font-bold hover:bg-forest-deep transition-all flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {isSubmittingUpload ? 'sync' : 'check'}
                  </span>
                  <span>{isSubmittingUpload ? 'Archivage en cours...' : 'Archiver le document'}</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2 : AJOUTER UNE OPÉRATION FINANCIÈRE (#modal-operation)             */}
      {/* ========================================================================= */}
      {isOperationModalOpen && (
        <div id="modal-operation" className="fixed inset-0 z-50 bg-inverse-surface/45 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest w-full max-w-xl rounded-lg p-space-lg shadow-[0_20px_48px_-12px_rgba(15,23,42,0.20)] border border-border-subtle relative max-h-[90vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-space-sm border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-sage-soft flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[22px]">payments</span>
                </div>
                <div>
                  <h3 className="font-headline-sm text-headline-sm text-forest-deep font-semibold">
                    Ajouter une opération financière
                  </h3>
                  <p className="font-body-md text-xs text-on-surface-variant">
                    Livre des comptes &amp; Comptes Courants d'Associés (CCA)
                  </p>
                </div>
              </div>
              <button
                id="btn-close-operation"
                type="button"
                onClick={() => setIsOperationModalOpen(false)}
                className="w-9 h-9 rounded-full hover:bg-surface-container text-on-surface-variant flex items-center justify-center transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Modal Form */}
            <form id="operation-form" onSubmit={handleOperationSubmit} className="mt-space-md flex flex-col gap-space-md">
              
              {/* Type: Entrée vs Sortie */}
              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-2 font-semibold">
                  Type de mouvement bancaire
                </label>
                <div className="grid grid-cols-2 gap-space-sm">
                  <label
                    id="label-op-in"
                    className={`flex items-center justify-center gap-2 h-[52px] rounded-DEFAULT border-2 font-label-md text-label-md cursor-pointer transition-all ${
                      operationType === 'in'
                        ? 'border-primary bg-sage-soft text-forest-deep'
                        : 'border-border-subtle bg-surface-container-lowest text-on-surface-variant'
                    }`}
                  >
                    <input
                      id="op-in-radio"
                      type="radio"
                      name="op-type"
                      value="in"
                      checked={operationType === 'in'}
                      onChange={() => setOperationType('in')}
                      className="hidden"
                    />
                    <span className="material-symbols-outlined text-[20px] text-primary">arrow_downward</span>
                    <span>Entrée (Cotisation / CCA)</span>
                  </label>

                  <label
                    id="label-op-out"
                    className={`flex items-center justify-center gap-2 h-[52px] rounded-DEFAULT border-2 font-label-md text-label-md cursor-pointer transition-all ${
                      operationType === 'out'
                        ? 'border-amber-rich bg-amber-soft text-amber-rich'
                        : 'border-border-subtle bg-surface-container-lowest text-on-surface-variant'
                    }`}
                  >
                    <input
                      id="op-out-radio"
                      type="radio"
                      name="op-type"
                      value="out"
                      checked={operationType === 'out'}
                      onChange={() => setOperationType('out')}
                      className="hidden"
                    />
                    <span className="material-symbols-outlined text-[20px]">arrow_upward</span>
                    <span>Sortie (Facture / Entretien)</span>
                  </label>
                </div>
              </div>

              {/* Montant & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
                <div>
                  <label htmlFor="op-amount-input" className="block font-label-md text-label-md text-on-surface mb-2 font-semibold">
                    Montant en Euros (€)
                  </label>
                  <div className="relative">
                    <input
                      id="op-amount-input"
                      type="number"
                      step="0.01"
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
                    Date de valeur
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

              {/* Libellé */}
              <div>
                <label htmlFor="op-label-input" className="block font-label-md text-label-md text-on-surface mb-2 font-semibold">
                  Libellé de l'écriture
                </label>
                <input
                  id="op-label-input"
                  type="text"
                  required
                  placeholder="Ex : Cotisation CCA mensuelle Henri Jamet..."
                  value={operationLabel}
                  onChange={(e) => setOperationLabel(e.target.value)}
                  className="w-full h-[52px] px-4 bg-surface-container-lowest border-2 border-border-subtle rounded-DEFAULT font-body-md text-body-md text-on-surface focus:outline-none focus:border-primary transition-all"
                />
              </div>

              {/* Justificatif lié */}
              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-2 font-semibold">
                  Attacher un justificatif / facture (Optionnel)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="op-file-name"
                    type="text"
                    readOnly
                    placeholder="Aucun fichier sélectionné"
                    value={operationFileName}
                    className="flex-1 h-[52px] px-4 bg-surface-container-low border border-border-subtle rounded-DEFAULT font-body-md text-xs text-on-surface-variant"
                  />
                  <label className="h-[52px] px-4 rounded-DEFAULT bg-surface-container-lowest border-2 border-border-subtle text-on-surface font-label-md text-label-md hover:border-primary hover:text-primary flex items-center justify-center gap-1 cursor-pointer transition-all">
                    <span className="material-symbols-outlined text-[18px]">attach_file</span>
                    <span>Parcourir</span>
                    <input
                      id="op-file-upload"
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setOperationFileName(e.target.files[0].name);
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-space-sm pt-space-sm border-t border-border-subtle flex items-center justify-end gap-space-sm">
                <button
                  id="btn-cancel-operation"
                  type="button"
                  onClick={() => setIsOperationModalOpen(false)}
                  className="h-[52px] px-6 rounded-DEFAULT bg-surface-container-lowest border-2 border-border-subtle text-on-surface font-label-lg text-label-lg hover:bg-canvas-slate transition-all cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="h-[52px] px-6 rounded-DEFAULT bg-surface-container-lowest border-2 border-primary text-primary font-label-lg text-label-lg hover:bg-sage-soft transition-all flex items-center gap-2 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[20px]">save</span>
                  <span>Enregistrer l'opération</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3 : RENOMMER LE DOCUMENT (#modal-rename)                            */}
      {/* ========================================================================= */}
      {isRenameModalOpen && selectedRenamingDoc && (
        <div id="modal-rename" className="fixed inset-0 z-50 bg-inverse-surface/45 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest w-full max-w-md rounded-lg p-space-lg shadow-[0_20px_48px_-12px_rgba(15,23,42,0.20)] border border-border-subtle relative">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-space-sm border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-sage-soft flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[22px]">edit</span>
                </div>
                <div>
                  <h3 className="font-headline-sm text-headline-sm text-forest-deep font-semibold">
                    Renommer le document
                  </h3>
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
            <form id="rename-form" onSubmit={handleRenameSubmit} className="mt-space-md flex flex-col gap-space-md">
              <div>
                <label htmlFor="rename-input" className="block font-label-md text-label-md text-on-surface mb-2 font-semibold">
                  Nouveau nom de fichier (.pdf)
                </label>
                <input
                  id="rename-input"
                  type="text"
                  required
                  value={renameInputValue}
                  onChange={(e) => setRenameInputValue(e.target.value)}
                  className="w-full h-[52px] px-4 bg-surface-container-lowest border-2 border-border-subtle rounded-DEFAULT font-body-md text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                />
              </div>

              <div className="mt-space-sm pt-space-sm border-t border-border-subtle flex items-center justify-end gap-space-sm">
                <button
                  id="btn-cancel-rename"
                  type="button"
                  onClick={() => setIsRenameModalOpen(false)}
                  className="h-[52px] px-5 rounded-DEFAULT bg-surface-container-lowest border-2 border-border-subtle text-on-surface font-label-lg text-label-lg hover:bg-canvas-slate transition-all cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="h-[52px] px-6 rounded-DEFAULT bg-surface-container-lowest border-2 border-primary text-primary font-label-lg text-label-lg hover:bg-sage-soft transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[20px]">check</span>
                  <span>Confirmer</span>
                </button>
              </div>
            </form>

          </div>
        </div>
      )}


      {/* ========================================================================= */}
      {/* MODAL 5 : GRAND LIVRE FINANCIER & CCA                                     */}
      {/* ========================================================================= */}
      <FinancialLedgerModal
        isOpen={isFinancialModalOpen}
        onClose={() => setIsFinancialModalOpen(false)}
        initialTab={financialModalTab}
      />

      {/* ========================================================================= */}
      {/* TOAST FEEDBACK NOTIFICATION                                               */}
      {/* ========================================================================= */}
      <div
        id="toast-feedback"
        role="alert"
        className={`fixed bottom-6 right-6 z-50 px-5 py-3.5 rounded-xl shadow-2xl border flex items-center gap-3 transition-all duration-300 max-w-md md:max-w-lg ${
          toast.icon === 'error'
            ? 'bg-rose-950 text-rose-100 border-rose-600/80 shadow-rose-950/40'
            : 'bg-forest-deep text-on-primary border-sage-border shadow-forest-deep/30'
        } ${
          toast.visible
            ? 'translate-y-0 opacity-100 pointer-events-auto'
            : 'translate-y-24 opacity-0 pointer-events-none'
        }`}
      >
        <span
          id="toast-icon"
          className={`material-symbols-outlined text-[24px] shrink-0 ${
            toast.icon === 'error' ? 'text-rose-400' : 'text-secondary-fixed'
          }`}
        >
          {toast.icon === 'error' ? 'error' : toast.icon}
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

    </div>
  );
}
