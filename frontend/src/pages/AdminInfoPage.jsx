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
import { fetchAdminDocuments, deleteAdminDocument, fetchBankStatus } from '../api';

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

// Documents Authentiques de la SCI Hellenvilliers
const INITIAL_STITCH_DOCUMENTS = [
  {
    id: 'doc-statuts-1',
    title: 'Statuts Constitutifs Certifiés — SCI Hellenvilliers.pdf',
    category: 'notaire',
    categoryLabel: 'Acte Notarié',
    date: '2023-08-07',
    formattedDate: '7 août 2023',
    size: '2.4 Mo',
    sizeBytes: 2400000,
    author: 'Me Goumard-Geffré',
    thumbType: 'pdf',
    thumbIcon: 'gavel',
    thumbCenterTitle: 'ACTE AUTHENTIQUE',
    thumbCenterSub: 'Étude Goumard-Geffré',
    thumbBottomLeft: 'Enregistré au SIE',
    thumbBottomRight: 'Signé',
    topBadge: { text: 'PDF', bg: 'bg-error text-on-error' },
    topIcon: 'verified',
    topIconColor: 'text-tertiary-container',
    centerCircleStyle: 'border-2 border-dashed border-tertiary-container/40 text-tertiary-container',
    bottomRightColor: 'text-primary'
  },
  {
    id: 'doc-kbis-3',
    title: 'Extrait Kbis Récent — RCS Évreux 977529312.pdf',
    category: 'notaire',
    categoryLabel: 'Juridique & Greffe',
    date: '2026-04-10',
    formattedDate: '10 avril 2026',
    size: '1.1 Mo',
    sizeBytes: 1100000,
    author: 'Henri Jamet',
    thumbType: 'pdf',
    thumbIcon: 'corporate_fare',
    thumbCenterTitle: 'GREFFE DU TRIBUNAL',
    thumbCenterSub: 'RCS Évreux 977 529 312',
    thumbBottomLeft: 'Validité légale : Active',
    thumbBottomRight: 'Conforme',
    topBadge: { text: 'PDF', bg: 'bg-error text-on-error' },
    topIcon: 'domain_verification',
    topIconColor: 'text-secondary',
    centerCircleStyle: 'bg-surface-container-lowest border border-border-subtle text-on-surface',
    bottomRightColor: 'text-primary'
  },
  {
    id: 'doc-ag-2026-4',
    title: 'PV Assemblée Générale du 8 Août 2026 — Consensus & Budget.pdf',
    category: 'ag',
    categoryLabel: 'Procès-Verbaux AG',
    date: '2026-08-08',
    formattedDate: '8 août 2026',
    size: '1.8 Mo',
    sizeBytes: 1800000,
    author: 'Frédéric & Henri J.',
    thumbType: 'pdf',
    thumbIcon: 'history_edu',
    thumbCenterTitle: 'ASSEMBLÉE ANNUELLE',
    thumbCenterSub: 'Résolutions votées à l\'unanimité',
    thumbBottomLeft: 'Tous associés présents',
    thumbBottomRight: 'Adopté',
    topBadge: { text: 'PDF', bg: 'bg-error text-on-error' },
    topIcon: 'how_to_vote',
    topIconColor: 'text-secondary',
    centerCircleStyle: 'bg-surface-container-lowest border border-border-subtle text-primary',
    bottomRightColor: 'text-primary'
  },
  {
    id: 'doc-assurance-axa-5',
    title: 'Attestation Assurance Multirisque Rosing & Presbytère — AXA.pdf',
    category: 'assurance',
    categoryLabel: 'Assurances & Fiscal',
    date: '2026-01-15',
    formattedDate: '15 janv. 2026',
    size: '920 Ko',
    sizeBytes: 920000,
    author: 'Henri Jamet',
    thumbType: 'pdf',
    thumbIcon: 'shield',
    thumbCenterTitle: 'POLICE PNO AXA',
    thumbCenterSub: 'Bâtiments & Parcs',
    thumbBottomLeft: 'Échéance 31/12/2026',
    thumbBottomRight: 'À jour',
    topBadge: { text: 'PDF', bg: 'bg-error text-on-error' },
    topIcon: 'security',
    topIconColor: 'text-secondary',
    centerCircleStyle: 'bg-surface-container-lowest border border-border-subtle text-primary',
    bottomRightColor: 'text-secondary'
  },
  {
    id: 'doc-rib-ca-7',
    title: 'RIB Officiel — Compte Dédié Crédit Agricole SCI.pdf',
    category: 'banque',
    categoryLabel: 'Bancaire & Trésorerie',
    date: '2026-01-02',
    formattedDate: '2 janv. 2026',
    size: '340 Ko',
    sizeBytes: 340000,
    author: 'Henri Jamet',
    thumbType: 'pdf',
    thumbIcon: 'credit_card',
    thumbCenterTitle: 'CRÉDIT AGRICOLE NORMANDIE',
    thumbCenterSub: 'IBAN FR76 •••• 9214',
    thumbBottomLeft: 'Pour virements cotisations',
    thumbBottomRight: 'Vérifié',
    topBadge: { text: 'PDF', bg: 'bg-error text-on-error' },
    topIcon: 'account_balance',
    topIconColor: 'text-primary',
    centerCircleStyle: 'bg-surface-container-lowest border border-border-subtle text-primary',
    bottomRightColor: 'text-secondary'
  }
];

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

  useEffect(() => {
    loadBankStatus();
  }, []);

  // Détermine si des données bancaires réelles et actives sont disponibles
  const hasRealBankData = Boolean(
    bankStatus &&
    bankStatus.status === 'ok' &&
    !bankStatus.needs_reauth &&
    bankStatus.total_balance !== undefined &&
    bankStatus.total_balance !== null
  );

  // Documents State
  const [documents, setDocuments] = useState(INITIAL_STITCH_DOCUMENTS);
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

  // Forms State
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCategory, setUploadCategory] = useState('devis');
  const [uploadAuthor, setUploadAuthor] = useState(typeof activeUser === 'string' ? activeUser : 'Henri Jamet');
  const [uploadedFileName, setUploadedFileName] = useState('');

  const [operationType, setOperationType] = useState('in'); // 'in' | 'out'
  const [operationAmount, setOperationAmount] = useState('');
  const [operationDate, setOperationDate] = useState('2026-06-15');
  const [operationLabel, setOperationLabel] = useState('');
  const [operationFileName, setOperationFileName] = useState('');

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
    toastTimerRef.current = setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, 3500);
  };

  // Additional SCI Features (Grand Livre Financier)
  const [isFinancialModalOpen, setIsFinancialModalOpen] = useState(false);
  const [financialModalTab, setFinancialModalTab] = useState('grand_livre');

  // Download simulation with real text/markdown Blob
  const handleDownload = (docTitle, fileName) => {
    const targetName = fileName || docTitle || 'document.pdf';
    const blob = new Blob([`%PDF-1.4 Mock Document Archive SCI Hellenvilliers\nTitre: ${targetName}\nDate: ${new Date().toISOString()}\nAuthentifié conforme.`], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = targetName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Téléchargement lancé', targetName, 'download');
  };

  // Rename document workflow
  const openRenameModal = (doc) => {
    setSelectedRenamingDoc(doc);
    setRenameInputValue(doc.title);
    setIsRenameModalOpen(true);
  };

  const handleRenameSubmit = (e) => {
    e.preventDefault();
    if (!selectedRenamingDoc || !renameInputValue.trim()) return;

    const newTitle = renameInputValue.trim();
    setDocuments((prev) =>
      prev.map((d) => (d.id === selectedRenamingDoc.id ? { ...d, title: newTitle } : d))
    );
    setIsRenameModalOpen(false);
    showToast('Document renommé', 'Le titre a été actualisé.', 'edit');
  };

  // Upload document workflow
  const handleUploadSubmit = (e) => {
    e.preventDefault();
    if (!uploadTitle.trim()) return;

    const catLabels = {
      notaire: 'Acte Notarié',
      devis: 'Devis & Factures',
      ag: 'Procès-Verbaux AG',
      assurance: 'Assurances & Fiscal',
      banque: 'Bancaire & Trésorerie',
      travaux: 'Travaux & Diagnostics'
    };

    const newDoc = {
      id: `doc-upload-${Date.now()}`,
      title: uploadTitle.trim().endsWith('.pdf') ? uploadTitle.trim() : `${uploadTitle.trim()}.pdf`,
      category: uploadCategory,
      categoryLabel: catLabels[uploadCategory] || 'Document',
      date: new Date().toISOString().split('T')[0],
      formattedDate: new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }),
      size: '1.2 Mo',
      sizeBytes: 1200000,
      author: uploadAuthor || 'Henri Jamet',
      thumbType: 'pdf',
      thumbIcon: uploadCategory === 'notaire' ? 'gavel' : uploadCategory === 'travaux' ? 'construction' : 'description',
      thumbCenterTitle: uploadTitle.substring(0, 20).toUpperCase(),
      thumbCenterSub: catLabels[uploadCategory] || 'Archive SCI',
      thumbBottomLeft: 'Déposé récemment',
      thumbBottomRight: 'Nouveau',
      topBadge: { text: 'PDF', bg: 'bg-error text-on-error' },
      topIcon: 'verified',
      topIconColor: 'text-primary',
      centerCircleStyle: 'bg-sage-soft text-primary',
      bottomRightColor: 'text-primary'
    };

    setDocuments([newDoc, ...documents]);
    setIsUploadModalOpen(false);
    setUploadTitle('');
    setUploadedFileName('');
    showToast('Document téléversé', `« ${newDoc.title} » a été archivé dans le coffre SCI.`, 'cloud_done');
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

  // Filter & Search Documents
  const filteredDocuments = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return documents
      .filter((doc) => {
        const matchesCategory = selectedCategory === 'all' || doc.category === selectedCategory;
        const matchesSearch =
          q === '' ||
          doc.title.toLowerCase().includes(q) ||
          (doc.author && doc.author.toLowerCase().includes(q)) ||
          (doc.categoryLabel && doc.categoryLabel.toLowerCase().includes(q)) ||
          (doc.thumbCenterTitle && doc.thumbCenterTitle.toLowerCase().includes(q)) ||
          (doc.formattedDate && doc.formattedDate.toLowerCase().includes(q));

        return matchesCategory && matchesSearch;
      })
      .sort((a, b) => {
        if (sortCriteria === 'name') {
          return a.title.localeCompare(b.title);
        } else if (sortCriteria === 'size') {
          return (b.sizeBytes || 0) - (a.sizeBytes || 0);
        } else {
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        }
      });
  }, [documents, searchQuery, selectedCategory, sortCriteria]);

  // Dynamic Category Counts
  const categoryCounts = useMemo(() => {
    const counts = { all: documents.length };
    documents.forEach((d) => {
      counts[d.category] = (counts[d.category] || 0) + 1;
    });
    return counts;
  }, [documents]);

  const categories = [
    { key: 'all', label: `Tous (${categoryCounts.all || 0})` },
    { key: 'notaire', label: `Actes & Notarié (${categoryCounts.notaire || 0})` },
    { key: 'devis', label: `Devis & Factures (${categoryCounts.devis || 0})` },
    { key: 'ag', label: `Procès-Verbaux AG (${categoryCounts.ag || 0})` },
    { key: 'assurance', label: `Assurances & Fiscal (${categoryCounts.assurance || 0})` },
    { key: 'banque', label: `Bancaire & RIB (${categoryCounts.banque || 0})` },
    { key: 'travaux', label: `Travaux & Diagnostics (${categoryCounts.travaux || 0})` }
  ];

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
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sage-soft text-forest-deep border border-sage-border">
                  <span className="material-symbols-outlined text-[14px]">priority_high</span>
                  <span>Priorité Membre</span>
                </span>
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
      {filteredDocuments.length === 0 ? (
        /* Empty State */
        <div id="no-docs-empty" className="mt-space-lg p-space-xl bg-surface-container-lowest rounded-lg border border-border-subtle text-center flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-outline mb-space-sm">
            <span className="material-symbols-outlined text-[32px]">folder_off</span>
          </div>
          <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
            Aucun document trouvé
          </h3>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1 max-w-md">
            Aucun justificatif ou acte ne correspond à vos critères de recherche ou au filtre sélectionné.
          </p>
          <button
            id="btn-reset-filters"
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('all');
            }}
            className="mt-space-md inline-flex items-center gap-2 h-[48px] px-5 rounded-DEFAULT bg-surface-container-lowest border-2 border-primary text-primary font-label-md text-label-md hover:bg-sage-soft transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">refresh</span>
            <span>Réinitialiser les filtres</span>
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid Layout (4 columns on lg) */
        <div id="documents-container" className="mt-space-md grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter transition-opacity duration-200">
          {filteredDocuments.map((doc) => (
            <div
              key={doc.id}
              className="doc-card group bg-surface-container-lowest rounded-lg border border-border-subtle p-space-sm flex flex-col justify-between shadow-[0_2px_8px_-2px_rgba(6,95,70,0.04),0_6px_20px_-4px_rgba(15,23,42,0.05)] hover:border-sage-border hover:shadow-[0_8px_24px_-4px_rgba(6,95,70,0.09)] transition-all"
            >
              <div>
                
                {/* Document Thumbnail Mockup */}
                <div className="relative w-full h-44 rounded-DEFAULT bg-surface-container overflow-hidden flex flex-col justify-between p-3 border border-border-subtle/60">
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${doc.topBadge?.bg || 'bg-error text-on-error'} uppercase`}>
                      {doc.topBadge?.text || 'PDF'}
                    </span>
                    {doc.topRightBadge ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] ${doc.topRightBadge.bg}`}>
                        {doc.topRightBadge.text}
                      </span>
                    ) : doc.topIcon ? (
                      <span className={`material-symbols-outlined ${doc.topIconColor || 'text-tertiary-container'} text-[20px]`}>
                        {doc.topIcon}
                      </span>
                    ) : null}
                  </div>

                  {/* Stamp Graphic & Title in Center */}
                  <div className="flex flex-col items-center justify-center my-auto text-center px-2">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-1 ${doc.centerCircleStyle || 'bg-sage-soft text-primary'}`}>
                      <span className="material-symbols-outlined text-[24px]">
                        {doc.thumbIcon || 'description'}
                      </span>
                    </div>
                    <span className="font-headline-sm text-xs font-bold text-forest-deep line-clamp-1">
                      {doc.thumbCenterTitle}
                    </span>
                    <span className="text-[11px] text-on-surface-variant font-label-sm">
                      {doc.thumbCenterSub}
                    </span>
                  </div>

                  {/* Bottom Strip */}
                  <div className="flex items-center justify-between text-[11px] text-on-surface-variant bg-surface-container-lowest/80 backdrop-blur-xs px-2 py-1 rounded">
                    <span>{doc.thumbBottomLeft}</span>
                    <span className={`font-semibold ${doc.bottomRightColor || 'text-primary'}`}>
                      {doc.thumbBottomRight}
                    </span>
                  </div>
                </div>

                {/* Document Metadata */}
                <div className="mt-3">
                  <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-sage-soft text-forest-deep mb-1">
                    {doc.categoryLabel}
                  </span>
                  <h3
                    className="font-headline-sm text-sm text-forest-deep font-bold line-clamp-2 leading-tight doc-title-text"
                    title={doc.title}
                  >
                    {doc.title}
                  </h3>
                  <p className="font-body-md text-xs text-on-surface-variant mt-1">
                    {doc.formattedDate} • {doc.size} • {doc.author}
                  </p>
                </div>

              </div>

              {/* Card Action Buttons */}
              <div className="mt-4 pt-3 border-t border-border-subtle flex items-center justify-between gap-1">
                <button
                  type="button"
                  onClick={() => handleDownload(doc.title, doc.title)}
                  className="btn-download flex-1 h-[42px] px-2 rounded-DEFAULT bg-surface-container-lowest border-2 border-primary text-primary font-label-sm text-xs hover:bg-sage-soft transition-all flex items-center justify-center gap-1 cursor-pointer"
                  title="Télécharger le document"
                >
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  <span>Télécharger</span>
                </button>

                <button
                  type="button"
                  onClick={() => openRenameModal(doc)}
                  className="btn-rename p-2 h-[42px] w-[42px] rounded-DEFAULT bg-surface-container-lowest border-2 border-border-subtle text-on-surface-variant hover:text-primary hover:border-primary transition-all flex items-center justify-center cursor-pointer"
                  title="Renommer le fichier"
                >
                  <span className="material-symbols-outlined text-[18px]">edit</span>
                </button>
              </div>

            </div>
          ))}
        </div>
      ) : (
        /* List Layout */
        <div id="documents-container" className="mt-space-md flex flex-col gap-3 transition-opacity duration-200">
          {filteredDocuments.map((doc) => (
            <div
              key={doc.id}
              className="doc-card group bg-surface-container-lowest rounded-DEFAULT border border-border-subtle p-3 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs hover:border-sage-border transition-all"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${doc.centerCircleStyle || 'bg-sage-soft text-primary'}`}>
                  <span className="material-symbols-outlined text-[20px]">
                    {doc.thumbIcon || 'description'}
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-sage-soft text-forest-deep">
                      {doc.categoryLabel}
                    </span>
                    <span className="text-xs font-mono text-on-surface-variant">{doc.size}</span>
                  </div>
                  <h3 className="font-headline-sm text-sm text-forest-deep font-bold line-clamp-1 doc-title-text mt-0.5" title={doc.title}>
                    {doc.title}
                  </h3>
                  <p className="font-body-md text-xs text-on-surface-variant">
                    {doc.formattedDate} • Associé : {doc.author}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
                <button
                  type="button"
                  onClick={() => handleDownload(doc.title, doc.title)}
                  className="btn-download h-[38px] px-3 rounded-DEFAULT bg-surface-container-lowest border-2 border-primary text-primary font-label-sm text-xs hover:bg-sage-soft transition-all flex items-center gap-1 cursor-pointer"
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
              </div>
            </div>
          ))}
        </div>
      )}



      {/* ========================================================================= */}
      {/* MODAL 1 : TÉLÉVERSER UN DOCUMENT (#modal-upload)                           */}
      {/* ========================================================================= */}
      {isUploadModalOpen && (
        <div id="modal-upload" className="fixed inset-0 z-50 bg-inverse-surface/45 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest w-full max-w-xl rounded-lg p-space-lg shadow-[0_20px_48px_-12px_rgba(15,23,42,0.20)] border border-border-subtle relative max-h-[90vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-space-sm border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-sage-soft flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[22px]">upload_file</span>
                </div>
                <div>
                  <h3 className="font-headline-sm text-headline-sm text-forest-deep font-semibold">
                    Téléverser un document
                  </h3>
                  <p className="font-body-md text-xs text-on-surface-variant">
                    Archivage sécurisé dans le dossier officiel SCI Hellenvilliers
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
            <form id="upload-form" onSubmit={handleUploadSubmit} className="mt-space-md flex flex-col gap-space-md">
              
              {/* Drag & Drop Zone */}
              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-2 font-semibold">
                  Fichier numérique (PDF, scan ou image)
                </label>
                <label className="border-2 border-dashed border-border-subtle hover:border-primary rounded-DEFAULT p-space-lg flex flex-col items-center justify-center text-center bg-surface-container-low cursor-pointer transition-all block">
                  <span className="material-symbols-outlined text-[40px] text-primary mb-2">cloud_upload</span>
                  <span className="font-label-md text-label-md text-on-surface font-semibold">
                    {uploadedFileName ? uploadedFileName : "Glissez votre document ici ou parcourez vos dossiers"}
                  </span>
                  <span className="font-body-md text-xs text-on-surface-variant mt-1">
                    PDF certifié, PNG ou JPEG haute résolution (Max 25 Mo)
                  </span>
                  <input
                    id="file-drop-input"
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setUploadedFileName(e.target.files[0].name);
                        if (!uploadTitle) {
                          setUploadTitle(e.target.files[0].name);
                        }
                      }
                    }}
                  />
                </label>
              </div>

              {/* Document Title */}
              <div>
                <label htmlFor="doc-title-input" className="block font-label-md text-label-md text-on-surface mb-2 font-semibold">
                  Intitulé exact du document
                </label>
                <input
                  id="doc-title-input"
                  type="text"
                  required
                  placeholder="Ex : Facture Chauffage Électrique Presbytère 2026..."
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  className="w-full h-[52px] px-4 bg-surface-container-lowest border-2 border-border-subtle rounded-DEFAULT font-body-md text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                />
              </div>

              {/* Category & Author */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
                <div>
                  <label htmlFor="doc-category-select" className="block font-label-md text-label-md text-on-surface mb-2 font-semibold">
                    Catégorie d'archive
                  </label>
                  <select
                    id="doc-category-select"
                    value={uploadCategory}
                    onChange={(e) => setUploadCategory(e.target.value)}
                    className="w-full h-[52px] px-3 bg-surface-container-lowest border-2 border-border-subtle rounded-DEFAULT font-body-md text-body-md text-on-surface focus:outline-none focus:border-primary transition-all cursor-pointer"
                  >
                    <option value="devis">Devis &amp; Factures</option>
                    <option value="notaire">Actes &amp; Notarié</option>
                    <option value="ag">Procès-Verbaux AG</option>
                    <option value="assurance">Assurances &amp; Fiscal</option>
                    <option value="banque">Bancaire &amp; Trésorerie</option>
                    <option value="travaux">Travaux &amp; Diagnostics</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="doc-author-input" className="block font-label-md text-label-md text-on-surface mb-2 font-semibold">
                    Déposant / Associé
                  </label>
                  <input
                    id="doc-author-input"
                    type="text"
                    value={uploadAuthor}
                    onChange={(e) => setUploadAuthor(e.target.value)}
                    className="w-full h-[52px] px-4 bg-surface-container-lowest border-2 border-border-subtle rounded-DEFAULT font-body-md text-body-md text-on-surface focus:outline-none focus:border-primary transition-all"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="mt-space-sm pt-space-sm border-t border-border-subtle flex items-center justify-end gap-space-sm">
                <button
                  id="btn-cancel-upload"
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="h-[52px] px-6 rounded-DEFAULT bg-surface-container-lowest border-2 border-border-subtle text-on-surface font-label-lg text-label-lg hover:bg-canvas-slate transition-all cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="h-[52px] px-6 rounded-DEFAULT bg-surface-container-lowest border-2 border-primary text-primary font-label-lg text-label-lg hover:bg-sage-soft transition-all flex items-center gap-2 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[20px]">check</span>
                  <span>Archiver le document</span>
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
        className={`fixed bottom-6 right-6 z-50 bg-forest-deep text-on-primary px-5 py-3.5 rounded-DEFAULT shadow-xl border border-sage-border flex items-center gap-3 transition-all duration-300 ${
          toast.visible
            ? 'translate-y-0 opacity-100'
            : 'translate-y-24 opacity-0 pointer-events-none'
        }`}
      >
        <span id="toast-icon" className="material-symbols-outlined text-secondary-fixed text-[24px]">
          {toast.icon}
        </span>
        <div className="flex flex-col">
          <span id="toast-title" className="font-label-md text-label-md font-bold">
            {toast.title}
          </span>
          <span id="toast-desc" className="font-body-md text-xs text-sage-soft">
            {toast.desc}
          </span>
        </div>
      </div>

    </div>
  );
}
