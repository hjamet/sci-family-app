import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  FileText, Landmark, ShieldCheck, Download, Copy, Check, Calculator,
  Euro, PieChart, Info, ArrowUpRight, CheckCircle2, UserCheck, AlertCircle, FileCheck,
  ChevronDown, ChevronUp, Calendar, Users, Sparkles, BookOpen, X, Plus, Upload,
  Trash2, Paperclip, FileCode, Image as ImageIcon, File, Eye, AlertTriangle, RefreshCw,
  Pencil, Lock, User, Receipt, Wallet, FileSpreadsheet, ExternalLink
} from 'lucide-react';
import WorkloadDashboard from '../components/WorkloadDashboard';
import FinancialLedgerModal from '../components/FinancialLedgerModal';
import { fetchAdminDocuments, deleteAdminDocument } from '../api';

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

// 8 Stitch Model Documents
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
    id: 'doc-devis-perrot-2',
    title: 'Devis Élagage & Entretien Espaces Verts 2026 — EI Perrot.pdf',
    category: 'devis',
    categoryLabel: 'Devis & Travaux',
    date: '2026-05-12',
    formattedDate: '12 mai 2026',
    size: '840 Ko',
    sizeBytes: 840000,
    author: 'Hortense Jamet',
    thumbType: 'pdf',
    thumbIcon: 'park',
    thumbCenterTitle: 'EI PERROT PAYSAGE',
    thumbCenterSub: 'Élagage Allée des Chênes',
    thumbBottomLeft: 'Acompte 30% versé',
    thumbBottomRight: 'Validé',
    topBadge: { text: 'PDF', bg: 'bg-error text-on-error' },
    topRightBadge: { text: '3 900 € TTC', bg: 'bg-amber-soft text-amber-rich font-bold' },
    centerCircleStyle: 'bg-sage-soft text-primary',
    bottomRightColor: 'text-secondary'
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
    id: 'doc-facture-declercq-6',
    title: 'Facture Acquittée FA0069094 — DECLERCQ PISCINES.pdf',
    category: 'devis',
    categoryLabel: 'Devis & Factures',
    date: '2026-06-03',
    formattedDate: '3 juin 2026',
    size: '650 Ko',
    sizeBytes: 650000,
    author: 'Frédéric Jamet',
    thumbType: 'pdf',
    thumbIcon: 'pool',
    thumbCenterTitle: 'DECLERCQ PISCINES',
    thumbCenterSub: 'Remise en route & Hivernage',
    thumbBottomLeft: 'Règlement : CCA Frédéric J.',
    thumbBottomRight: '650 €',
    topBadge: { text: 'PDF', bg: 'bg-error text-on-error' },
    topRightBadge: { text: 'Acquittée', bg: 'bg-sage-soft text-forest-deep font-bold' },
    centerCircleStyle: 'bg-surface-container-lowest border border-border-subtle text-secondary',
    bottomRightColor: 'text-primary'
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
  },
  {
    id: 'doc-diag-charpente-8',
    title: 'Diagnostic Expert Charpente Poutres Presbytère.pdf',
    category: 'travaux',
    categoryLabel: 'Travaux & Diagnostics',
    date: '2026-03-22',
    formattedDate: '22 mars 2026',
    size: '1.5 Mo',
    sizeBytes: 1500000,
    author: 'Henri Jamet',
    thumbType: 'pdf',
    thumbIcon: 'architecture',
    thumbCenterTitle: 'CABINET EXPERTIS BOIS',
    thumbCenterSub: 'Contrôle structurel charpente',
    thumbBottomLeft: 'Presbytère nord',
    thumbBottomRight: 'Sain (Suivi 3 ans)',
    topBadge: { text: 'PDF', bg: 'bg-error text-on-error' },
    topIcon: 'construction',
    topIconColor: 'text-amber-rich',
    centerCircleStyle: 'bg-surface-container-lowest border border-border-subtle text-on-surface',
    bottomRightColor: 'text-amber-rich'
  }
];

// Initial Invoices Models
const INITIAL_INVOICES = [
  {
    id: 'inv-1',
    date: '03 juin 2026',
    dueDate: 'Échéance : 20 juin 2026',
    supplier: 'DECLERCQ PISCINES',
    reference: 'FA0069094 • Remise en route bassin & hivernage',
    amount: '650,00 €',
    taxInfo: 'TVA 20% incluse',
    status: 'Payée (CCA Frédéric)',
    statusType: 'paid',
    filename: 'FA0069094.pdf'
  },
  {
    id: 'inv-2',
    date: '18 mai 2026',
    dueDate: 'Échéance : 18 juin 2026',
    dueWarning: true,
    supplier: 'ÉTS JOSSE COMBUSTIBLES',
    reference: 'F-2026-042 • Ravitaillement Fioul 1 500 L Presbytère',
    amount: '1 820,00 €',
    taxInfo: 'Part Henri J. : 910,00 €',
    status: 'En attente de règlement',
    statusType: 'pending',
    filename: 'Josse-F2026-042.pdf'
  },
  {
    id: 'inv-3',
    date: '12 mai 2026',
    dueDate: 'Acompte acquitté',
    supplier: 'EI PERROT PAYSAGE',
    reference: 'F-2026-118 • Élagage Allée des Chênes & Parc Nord',
    amount: '1 170,00 €',
    taxInfo: 'Acompte 30% validé',
    status: 'Validée / Virement SCI',
    statusType: 'verified',
    filename: 'Facture-Perrot-118.pdf'
  },
  {
    id: 'inv-4',
    date: '10 avril 2026',
    dueDate: 'Avance de frais perso',
    supplier: 'BRICOMARCHÉ CONCHES',
    reference: 'T-99218 • Quincaillerie, serrures & scellements parc',
    amount: '184,50 €',
    taxInfo: 'Avancé par Henri J.',
    status: 'À rembourser par la SCI',
    statusType: 'refund',
    filename: 'Ticket-Brico-99218.pdf'
  }
];

export default function AdminInfoPage({ currentUser }) {
  const activeUser = currentUser || localStorage.getItem('sci_user') || 'Henri Jamet';
  const isCoordinator = activeUser === 'Henri' || activeUser === 'Henri Jamet' || (typeof activeUser === 'object' && activeUser?.prenom === 'Henri');

  // KPI Financial Totals
  const [financialTotals, setFinancialTotals] = useState({
    entrees: 4200.0,
    sorties: 2450.0,
    reserves: 6850.0
  });

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

  // Additional SCI Features (Accordion/Ledger)
  const [isFinancialModalOpen, setIsFinancialModalOpen] = useState(false);
  const [financialModalTab, setFinancialModalTab] = useState('grand_livre');
  const [monthlyContribution, setMonthlyContribution] = useState(50);
  const [copiedRib, setCopiedRib] = useState(false);
  const [showExtendedSections, setShowExtendedSections] = useState(false);

  // Meetings State & Modals
  const [meetings, setMeetings] = useState([
    {
      id: 'm-1',
      date: '2026-08-08',
      formattedDate: '8 Août 2026 (Matin)',
      title: "Réunion Familiale SCI — Maintien du Patrimoine, Budget 50 €/mois & Rôle Coordinateur",
      subtitle: "Assemblée Familiale Cadreuse • PV Officiel & Consensus",
      summaryText: "La réunion familiale s'est déroulée selon un ordre du jour structuré et des votes formalisés. La SCI est maintenue, avec une contribution de 50 €/mois par associé en Compte Courant d'Associé (CCA) pendant une année test. Henri assume le rôle de coordinateur général avec Joséphine en adjointe."
    },
    {
      id: 'm-2',
      date: '2026-08-08',
      formattedDate: '8 Août 2026 (Après-midi)',
      title: "Réunion d'Organisation Rosing — Économies Chauffage, Jardinier Perrot & Priorités Travaux",
      subtitle: "Assemblée Après-Midi Rosing • PV Technique, Économies & Arbitrages",
      summaryText: "Réunion technique tenue l'après-midi du 8 août à Rosing. Décisions d'économies immédiates : consigne de chauffage limitée à 20°C max en séjour, débranchement du frigo Rosing inutilisé. Révision devis jardinier Perrot et arbitrage prioritaire diagnostic expert poutres."
    },
    {
      id: 'm-3',
      date: '2026-08-07',
      formattedDate: '7 Août 2026',
      title: "Audit Financier, Fiscal & Ouverture du Compte Bancaire SCI",
      subtitle: "Session Préparatoire • Analyse Démembrement, Taxe Foncière & Taux CCA",
      summaryText: "Audit juridique et financier consolidé pour l'ouverture du compte bancaire de la SCI au Crédit Agricole Normandie. Confirmation du périmètre Rosing et Le Presbytère (Paris exclu)."
    }
  ]);

  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false);

  // RIB Data
  const ribData = {
    titulaire: "SCI HELLENVILLIERS",
    banque: "Crédit Agricole Normandie",
    iban: "FR76 1751 5000 0112 3456 7890 123",
    bic: "AGRIFR2X"
  };

  const handleCopyRib = () => {
    const textToCopy = `Titulaire: ${ribData.titulaire}\nIBAN: ${ribData.iban}\nBIC: ${ribData.bic}\nBanque: ${ribData.banque}`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedRib(true);
    showToast('RIB Copié', 'Les coordonnées bancaires du Crédit Agricole ont été copiées.', 'content_copy');
    setTimeout(() => setCopiedRib(false), 2500);
  };

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
        entrees: prev.entrees + amountNum,
        reserves: prev.reserves + amountNum
      }));
    } else {
      setFinancialTotals((prev) => ({
        ...prev,
        sorties: prev.sorties + amountNum,
        reserves: prev.reserves - amountNum
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
    const rawVal = inv.amount.replace('€', '').replace(/\s/g, '').replace(',', '.');
    setOperationType('out');
    setOperationAmount(parseFloat(rawVal) || '1820.00');
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
      {/* SUB-HEADER / TITLE & QUICK ACTION BUTTONS                                 */}
      {/* ========================================================================= */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md py-space-md border-b border-border-subtle">
        <div className="flex flex-col">
          <h1 className="font-headline-lg text-headline-lg text-forest-deep tracking-tight mt-1">
            Administratif &amp; Documents
          </h1>
          <p className="font-body-md text-xs text-on-surface-variant mt-0.5">
            Portail Familial &amp; Patrimonial • Suivi budgétaire, actes notariés et pièces justificatives
          </p>
        </div>

        {/* Quick Actions Buttons */}
        <div className="flex flex-wrap items-center gap-space-sm">
          <button
            id="btn-open-operation"
            type="button"
            onClick={() => {
              setOperationType('in');
              setIsOperationModalOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 h-[52px] px-6 rounded-DEFAULT bg-surface-container-lowest border-2 border-primary text-primary font-label-lg text-label-lg shadow-sm hover:bg-sage-soft transition-all active:scale-[0.98] cursor-pointer"
          >
            <span className="material-symbols-outlined text-[22px]">payments</span>
            <span>Ajouter une opération</span>
          </button>

          <button
            id="btn-open-upload"
            type="button"
            onClick={() => setIsUploadModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 h-[52px] px-6 rounded-DEFAULT bg-surface-container-lowest border-2 border-primary text-primary font-label-lg text-label-lg shadow-sm hover:bg-sage-soft transition-all active:scale-[0.98] cursor-pointer"
          >
            <span className="material-symbols-outlined text-[22px]">upload_file</span>
            <span>Téléverser un document</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1 : FINANCIAL QUICK SUMMARY (3 HIGH-IMPACT KPI CARDS)             */}
      {/* ========================================================================= */}
      <div className="mt-space-lg">
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
                    {financialTotals.entrees.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
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
                    {financialTotals.sorties.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
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
                    {financialTotals.reserves.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                  </span>
                </div>
              </div>
              <span className="material-symbols-outlined text-primary/40 text-[24px]">
                savings
              </span>
            </div>
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
              {invoices.map((inv) => (
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
              ))}
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
      {/* SECTION 5 : ACCORDÉON SECTIONS COMPLÉMENTAIRES (RÉUNIONS, SIMULATEUR, ...) */}
      {/* ========================================================================= */}
      <div className="mt-space-xl border-t border-border-subtle pt-space-lg">
        <button
          type="button"
          onClick={() => setShowExtendedSections(!showExtendedSections)}
          className="w-full flex items-center justify-between p-4 rounded-lg bg-surface-container-lowest border border-border-subtle shadow-xs hover:bg-sage-soft transition cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-[24px]">account_tree</span>
            <div className="text-left">
              <span className="font-headline-sm text-sm font-bold text-forest-deep block">
                Comptes Rendus d'Assemblées, RIB &amp; Simulateur de Cotisations CCA
              </span>
              <span className="text-xs text-on-surface-variant">
                Consulter les procès-verbaux de réunions familiales, le simulateur budgétaire et la charge des 7 associés
              </span>
            </div>
          </div>
          <span className="material-symbols-outlined text-primary text-[24px]">
            {showExtendedSections ? 'expand_less' : 'expand_more'}
          </span>
        </button>

        {showExtendedSections && (
          <div className="mt-space-md space-y-space-lg animate-in fade-in duration-200">
            
            {/* 1. RIB & Financial Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* RIB Card */}
              <div className="bg-surface-container-lowest rounded-lg p-space-md border border-border-subtle shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between border-b border-border-subtle pb-3 mb-4">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[20px]">account_balance</span>
                      <h3 className="font-headline-sm text-sm font-bold text-forest-deep">RIB Officiel de la SCI</h3>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sage-soft text-forest-deep border border-sage-border">
                      Crédit Agricole
                    </span>
                  </div>

                  <div className="space-y-3 font-mono text-xs">
                    <div className="p-3 bg-surface-container-low rounded-DEFAULT border border-border-subtle">
                      <span className="text-[10px] font-sans text-on-surface-variant uppercase font-bold block mb-0.5">Titulaire</span>
                      <span className="font-bold text-forest-deep">{ribData.titulaire}</span>
                    </div>

                    <div className="p-3 bg-surface-container-low rounded-DEFAULT border border-border-subtle">
                      <span className="text-[10px] font-sans text-on-surface-variant uppercase font-bold block mb-0.5">IBAN</span>
                      <span className="font-bold text-primary text-sm tracking-wider break-all">{ribData.iban}</span>
                    </div>

                    <div className="p-3 bg-surface-container-low rounded-DEFAULT border border-border-subtle">
                      <span className="text-[10px] font-sans text-on-surface-variant uppercase font-bold block mb-0.5">BIC</span>
                      <span className="font-bold text-on-surface">{ribData.bic}</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCopyRib}
                  className="mt-4 w-full h-[46px] rounded-DEFAULT bg-surface-container-lowest border-2 border-primary text-primary font-label-md text-xs font-bold hover:bg-sage-soft transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {copiedRib ? 'check' : 'content_copy'}
                  </span>
                  <span>{copiedRib ? 'Copié !' : 'Copier les coordonnées bancaires'}</span>
                </button>
              </div>

              {/* Budget Consolidé 17 157 € / an */}
              <div className="lg:col-span-2 bg-surface-container-lowest rounded-lg p-space-md border border-border-subtle shadow-sm">
                <div className="flex items-center justify-between border-b border-border-subtle pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-amber-rich text-[20px]">pie_chart</span>
                    <div>
                      <h3 className="font-headline-sm text-sm font-bold text-forest-deep">Bilan Financier Annuel Consolidé</h3>
                      <p className="text-xs text-on-surface-variant">Coûts de fonctionnement réels du domaine d'Hellenvilliers</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-on-surface-variant block">Total Réel</span>
                    <span className="text-lg font-black text-forest-deep">17 157 € / an</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 rounded-DEFAULT bg-amber-soft/40 border border-amber-rich/20">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-bold text-forest-deep">Jardinier (EI PERROT)</span>
                      <span className="text-xs font-black text-amber-rich">3 900 € / an</span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant">Devis annuel espaces verts &amp; parcs.</p>
                  </div>

                  <div className="p-3 rounded-DEFAULT bg-sage-soft/40 border border-sage-border">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-bold text-forest-deep">Fluides (Eau &amp; Électricité)</span>
                      <span className="text-xs font-black text-primary">4 835 € / an</span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant">Compteurs Linky &amp; réseau eau.</p>
                  </div>

                  <div className="p-3 rounded-DEFAULT bg-surface-container-low border border-border-subtle">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-bold text-forest-deep">Assurance PNO AXA &amp; Taxes</span>
                      <span className="text-xs font-black text-forest-deep">5 422 € / an</span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant">Assurance multirisque &amp; taxe foncière.</p>
                  </div>

                  <div className="p-3 rounded-DEFAULT bg-surface-container-low border border-border-subtle">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-bold text-forest-deep">Entretien &amp; Maintenance</span>
                      <span className="text-xs font-black text-forest-deep">3 000 € / an</span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant">Ramonages, chaudière fioul et piscine.</p>
                  </div>
                </div>
              </div>

            </div>

            {/* 2. Procès-Verbaux des Réunions Familiales */}
            <div className="bg-surface-container-lowest rounded-lg p-space-md border border-border-subtle shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-border-subtle pb-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[20px]">history_edu</span>
                  <h3 className="font-headline-sm text-sm font-bold text-forest-deep">
                    Comptes Rendus &amp; Procès-Verbaux des Assemblées ({meetings.length})
                  </h3>
                </div>
              </div>

              <div className="space-y-3">
                {meetings.map((m) => (
                  <div key={m.id} className="p-4 rounded-DEFAULT bg-surface-container-low/60 border border-border-subtle flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-semibold text-primary mb-1">
                        <span className="material-symbols-outlined text-[15px]">calendar_today</span>
                        <span>{m.formattedDate} • {m.subtitle}</span>
                      </div>
                      <h4 className="font-headline-sm text-xs font-bold text-forest-deep">{m.title}</h4>
                      <p className="text-xs text-on-surface-variant mt-1 line-clamp-2">{m.summaryText}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMeeting(m);
                        setIsMeetingModalOpen(true);
                      }}
                      className="h-9 px-3 rounded-DEFAULT bg-surface-container-lowest border border-primary text-primary hover:bg-sage-soft text-xs font-semibold shrink-0 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">visibility</span>
                      <span>Voir le PV</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Simulateur de Cotisation CCA */}
            <div className="bg-surface-container-lowest rounded-lg p-space-md border border-border-subtle shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-border-subtle pb-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[20px]">calculate</span>
                  <h3 className="font-headline-sm text-sm font-bold text-forest-deep">
                    Simulateur de Cotisation Mensuelle CCA (Compte Courant d'Associé)
                  </h3>
                </div>
                <span className="text-xs font-bold text-primary bg-sage-soft px-3 py-1 rounded-full">
                  7 Associés
                </span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-DEFAULT bg-surface-container-low">
                <div>
                  <label className="text-xs font-bold text-forest-deep block mb-1">
                    Ajuster la mensualité individuelle :
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="250"
                    step="5"
                    value={monthlyContribution}
                    onChange={(e) => setMonthlyContribution(Number(e.target.value))}
                    className="w-64 h-2 bg-border-subtle rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>
                <div className="text-right">
                  <span className="text-2xl font-black text-forest-deep tabular-nums">{monthlyContribution} €</span>
                  <span className="text-xs text-on-surface-variant block">/ mois par associé</span>
                </div>
              </div>

              <div className="flex justify-between items-center text-xs font-semibold text-on-surface-variant pt-1">
                <span>Collecte annuelle estimée : <strong>{(monthlyContribution * 7 * 12).toLocaleString('fr-FR')} € / an</strong></span>
                <span>Couverture du budget (17 157 €) : <strong>{Math.round(((monthlyContribution * 7 * 12) / 17157) * 100)}%</strong></span>
              </div>
            </div>

            {/* 4. Workload Dashboard Component */}
            <WorkloadDashboard />

          </div>
        )}
      </div>

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
      {/* MODAL 4 : SYNTHÈSE DE RÉUNION                                            */}
      {/* ========================================================================= */}
      {isMeetingModalOpen && selectedMeeting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-inverse-surface/45 backdrop-blur-xs">
          <div className="bg-surface-container-lowest w-full max-w-2xl rounded-lg p-space-lg shadow-2xl border border-border-subtle relative max-h-[85vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-sage-soft flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[22px]">history_edu</span>
                </div>
                <div>
                  <h3 className="font-headline-sm text-sm font-bold text-forest-deep">{selectedMeeting.title}</h3>
                  <p className="text-xs text-on-surface-variant">{selectedMeeting.formattedDate} • {selectedMeeting.subtitle}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMeetingModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="p-4 rounded-DEFAULT bg-sage-soft/50 border border-sage-border text-xs leading-relaxed text-forest-deep font-medium">
              <strong className="block mb-1 text-primary">Synthèse des décisions adoptées :</strong>
              {selectedMeeting.summaryText}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setIsMeetingModalOpen(false)}
                className="h-10 px-5 rounded-DEFAULT bg-primary text-on-primary font-label-md text-xs font-semibold hover:bg-forest-deep transition cursor-pointer"
              >
                Fermer
              </button>
            </div>
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
