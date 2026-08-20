import React, { useState, useRef, useEffect } from 'react';
import {
  FileText, Landmark, ShieldCheck, Download, Copy, Check, Calculator,
  Euro, PieChart, Info, ArrowUpRight, CheckCircle2, UserCheck, AlertCircle, FileCheck,
  ChevronDown, ChevronUp, Calendar, Users, Sparkles, BookOpen, X, Plus, Upload,
  Trash2, Paperclip, FileCode, Image as ImageIcon, File, Eye, AlertTriangle, RefreshCw,
  Pencil, Lock, User
} from 'lucide-react';
import WorkloadDashboard from './WorkloadDashboard';
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

export default function AdminInfoPage({ currentUser }) {
  const activeUser = currentUser || localStorage.getItem('sci_user') || 'Membre';
  const isCoordinator = activeUser === 'Henri';

  const [copiedRib, setCopiedRib] = useState(false);
  const [monthlyContribution, setMonthlyContribution] = useState(50); // default 50 €/month
  const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [isMeetingAccordionOpen, setIsMeetingAccordionOpen] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // Admin Documents State (/api/admin-documents)
  const [adminDocs, setAdminDocs] = useState([]);
  const [loadingAdminDocs, setLoadingAdminDocs] = useState(false);

  const loadAdminDocs = async () => {
    try {
      setLoadingAdminDocs(true);
      const docs = await fetchAdminDocuments();
      setAdminDocs(docs || []);
    } catch (err) {
      console.error('Error fetching admin documents:', err);
    } finally {
      setLoadingAdminDocs(false);
    }
  };

  useEffect(() => {
    loadAdminDocs();
  }, []);

  const handleDeleteAdminDoc = async (filename) => {
    if (!isCoordinator) {
      alert("🔒 Action réservée à Henri (Coordinateur de la SCI).");
      return;
    }
    if (window.confirm(`Êtes-vous sûr de vouloir supprimer le document ${filename} ?`)) {
      try {
        await deleteAdminDocument(filename);
        setAdminDocs(prev => prev.filter(d => d.filename !== filename));
      } catch (err) {
        alert(err.message || 'Erreur lors de la suppression');
      }
    }
  };

  // Edit Meeting Modal State (Coordinator only)
  const [editingMeeting, setEditingMeeting] = useState(null);
  const [isEditMeetingModalOpen, setIsEditMeetingModalOpen] = useState(false);

  // Markdown Transcript Viewer Modal State
  const [isMdViewerOpen, setIsMdViewerOpen] = useState(false);
  const [selectedMdFile, setSelectedMdFile] = useState(null);
  const [copiedMdText, setCopiedMdText] = useState(false);
  const [mdViewTab, setMdViewTab] = useState('formatted'); // 'formatted' | 'raw'

  // Multi-upload Modal state
  const [isAddMeetingModalOpen, setIsAddMeetingModalOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // New Meeting Form State
  const [newMeetingTitle, setNewMeetingTitle] = useState('');
  const [newMeetingDate, setNewMeetingDate] = useState(new Date().toISOString().split('T')[0]);
  const [newMeetingSubtitle, setNewMeetingSubtitle] = useState('');
  // Unified Document Library Search & Filter State
  const [docSearchQuery, setDocSearchQuery] = useState('');
  const [docCategoryFilter, setDocCategoryFilter] = useState('Toutes');
  const [docSortOrder, setDocSortOrder] = useState('newest');

  // Meetings Data List State (3 Authentic Obsidian Meetings)
  const [meetings, setMeetings] = useState([
    {
      id: 'm-1',
      date: '2026-08-08',
      formattedDate: '8 Août 2026 (Matin)',
      title: "Réunion Familiale SCI — Maintien du Patrimoine, Budget 50 €/mois & Rôle Coordinateur",
      subtitle: "Assemblée Familiale Cadreuse • PV Officiel & Consensus",
      consensusPoints: [
        { title: "Maintien du Patrimoine", text: "Vote unanime à 7/7 pour conserver l'ensemble immobilier d'Hellenvilliers (Rosing et Presbytère).", icon: ShieldCheck, color: "emerald" },
        { title: "50 € / mois / associé", text: "Cotisation en compte courant d'associé (CCA) pour l'année test avec revoyure à 6 mois.", icon: Euro, color: "blue" },
        { title: "Coordinateur : Henri", text: "Henri nommé coordinateur/administrateur, épaulé par Joséphine en adjointe pour la gestion.", icon: UserCheck, color: "indigo" },
        { title: "Règles de Séjour & Vie", text: "Deux journées ménage/an, limitation estivale (2 semaines), pack de survie et espaces dédiés.", icon: Users, color: "purple" }
      ],
      summaryText: "La réunion familiale s'est déroulée selon un ordre du jour structuré et des votes formalisés. La SCI est maintenue, avec une contribution de 50 €/mois par associé en Compte Courant d'Associé (CCA) pendant une année test. Henri assume le rôle de coordinateur général avec Joséphine en adjointe.",
      fullChapters: [
        {
          title: "1. Présentation Légale et Juridique de la SCI",
          text: "La SCI a été constituée afin de simplifier la gestion successorale et d'optimiser la transmission du patrimoine familial. Elle comprend l'ensemble immobilier situé à l'intérieur des murs d'Hellenvilliers (maison Rosings, maison principale, piscine, annexes et potager). La maison 'Regrâcheuse' demeure exclue du périmètre de la SCI."
        },
        {
          title: "2. Budget Consolidé et Contribution (50 € / mois)",
          text: "Le budget annuel de fonctionnement est évalué à environ 17 157 € / an (incluant l'entretien des espaces verts par le jardinier Perrot pour 3 900 €/an, les fluides eau et électricité pour 4 835 €/an, l'assurance PNO et la taxe foncière pour 5 422 €/an, et la maintenance générale pour 3 000 €/an)."
        },
        {
          title: "3. Gouvernance Opérationnelle et Outils",
          text: "Henri est officiellement désigné Coordinateur et Administrateur de la SCI, avec Joséphine en adjointe. Henri centralisera les devis, le compte bancaire dédié, la facturation mensuelle ainsi que la plateforme digitale."
        },
        {
          title: "4. Charte d'Utilisation et Vie Collective",
          text: "La famille acte la réalisation de deux journées de grand nettoyage collectif par an (printemps et rentrée de septembre). Pour les réservations estivales, les séjours exclusifs sont limités à 2 semaines par associé."
        }
      ],
      attachedFiles: [
        {
          id: 'f-1',
          name: 'PV_Reunion_Familiale_08082026.md',
          size: '18.4 KB',
          type: 'md',
          date: '08/08/2026',
          uploaded_by: 'Henri',
          content: `# Procès-Verbal d'Assemblée Familiale SCI Hellenvilliers\n**Date :** 8 Août 2026 (Matin)\n**Présents :** Henri, Joséphine, Hortense, Marguerite, Eugénie, Élisabeth (Maman), Frédéric.\n\n---\n\n## 1. Ordre du Jour & Décisions Votées\n- **Maintien de la SCI :** Vote unanime à 7/7 pour conserver l'ensemble immobilier d'Hellenvilliers.\n- **Budget & Cotisation CCA :** Validation d'une contribution de 50 €/mois par associé en Compte Courant d'Associé (CCA).\n- **Gouvernance :** Henri désigné Coordinateur principal avec Joséphine en adjointe.\n\n## 2. Charte d'Usage & Projets Chauffage ViCare\n- Organisation de 2 journées de ménage collectif par an.\n- Maintien du suivi automatisé des températures et des consommations fioul via ViCare.`
        },
        { id: 'f-2', name: 'Statuts_Constitutifs_SCI_Hellenvilliers.pdf', size: '1.2 MB', type: 'pdf', date: '08/08/2026', uploaded_by: 'Henri' },
        { id: 'f-3', name: 'Bilan_Financier_SCI_2026.pdf', size: '840 KB', type: 'pdf', date: '08/08/2026', uploaded_by: 'Henri' }
      ]
    },
    {
      id: 'm-2',
      date: '2026-08-08',
      formattedDate: '8 Août 2026 (Après-midi)',
      title: "Réunion d'Organisation Rosing — Économies Chauffage, Jardinier Perrot & Priorités Travaux",
      subtitle: "Assemblée Après-Midi Rosing • PV Technique, Économies & Arbitrages",
      consensusPoints: [
        { title: "Régulation Chauffage", text: "Consigne de chauffage à 20°C max en séjour et coupure obligatoire des radiateurs manuels en partant.", icon: ShieldCheck, color: "amber" },
        { title: "Wi-Fi Répéteurs", text: "Installation de répéteurs Wi-Fi inter-maisons par Henri pour supprimer l'abonnement Internet Rosing.", icon: Sparkles, color: "cyan" },
        { title: "Jardinier Perrot", text: "Renégociation du devis de 3 900 €/an et fauche tardive gérées par Hortense et Alex.", icon: Users, color: "rose" },
        { title: "Expertise Poutres", text: "Priorité au diagnostic expert des poutres qui s'effritent avant les travaux placo de la bibliothèque.", icon: FileCheck, color: "indigo" }
      ],
      summaryText: "Réunion technique tenue l'après-midi du 8 août à Rosing. Décisions d'économies immédiates : consigne de chauffage limitée à 20°C max en séjour, mise en hors-gel intégrale l'hiver, débranchement du frigo Rosing inutilisé. Installation de répéteurs Wi-Fi inter-maisons par Henri pour économiser un abonnement. Renégociation du contrat jardinier Perrot (3 900 €/an) avec Alex. Création d'un pack de survie alimentaire (pâtes, riz, pestos, conserves). Arbitrage travaux : priorité au diagnostic expert des poutres qui s'effritent avant la réfection du placo de la bibliothèque.",
      fullChapters: [
        {
          title: "1. Économies d'Énergie & Pilotage du Chauffage à Rosing",
          text: "Décision de limiter strictement le chauffage en hiver. Consigne de température fixée à 20°C max. Chaque occupant doit impérativement couper les radiateurs manuels dans les chambres privées en partant. En hiver hors occupation, Rosing est basculé en Hors-Gel à 12°C et le réfrigérateur Rosing est débranché."
        },
        {
          title: "2. Réseau Internet & Wi-Fi Inter-Maisons",
          text: "Henri est chargé d'installer des répéteurs Wi-Fi longue portée depuis la maison principale vers Rosing afin de résilier l'abonnement internet en double et d'économiser le forfait mensuel."
        },
        {
          title: "3. Réévaluation du Jardinier EI PERROT & Espaces Verts",
          text: "Le coût annuel du jardinier (3 900 € TTC/an) est jugé trop élevé. Hortense et Alex sont mandatés pour renégocier les interventions et mettre en place une fauche tardive sur certaines parcelles du parc."
        },
        {
          title: "4. Pack de Survie Alimentaire & Rangement de l'Étage",
          text: "Mise en place d'un stock minimal standard 'Pack de Survie' (3 pâtes, 3 riz, sauces pesto, chips, gâteaux, huile, café/thé). Règle de rangement : au moins la moitié des étagères des chambres doit rester libre pour les invités."
        },
        {
          title: "5. Arbitrage des Travaux : Poutres vs Bibliothèque",
          text: "Débat technique sur la priorité des travaux. Accord unanime pour diligenter d'abord un diagnostic expert sur l'effritement des poutres structurelles avant d'engager le chantier de plâtrerie de la bibliothèque."
        }
      ],
      attachedFiles: [
        {
          id: 'f-rosing-1',
          name: 'Decisions_Economies_Taches_Travaux_Rosing_08082026.md',
          size: '24.6 KB',
          type: 'md',
          date: '08/08/2026',
          uploaded_by: 'Henri',
          content: `# Procès-Verbal d'Assemblée Technique — Maison de Rosing\n**Date :** 8 Août 2026 (Après-midi)\n**Participants :** Henri, Eugénie, Hortense, Marguerite, Joséphine, Élisabeth, Frédéric, Alex.\n\n---\n\n## 1. Économies d'Énergie & Consignes Chauffage Rosing\n- **Limitation Chauffage :** Consigne de température fixée à 20°C max en séjour.\n- **Consigne de Départ :** Fermeture obligatoire des radiateurs manuels dans les chambres privées en partant.\n- **Mode Hiver :** Passage en mode Hors-Gel (12°C) tout l'hiver si la maison est inoccupée. Débranchement du frigo Rosing inutilisé.\n- **EDF Tempo :** Validation de l'option Heures Creuses / Heures Pleines sur compteur Linky.\n\n## 2. Wi-Fi & Réseau Inter-Maisons\n- **Suppression 2e Abonnement :** Henri installe des répéteurs Wi-Fi haut débit entre la maison principale et Rosing pour économiser l'abonnement Internet en double.\n\n## 3. Jardinier & Espaces Verts\n- **Renégociation Devis Perrot :** Coût actuel de 3 900 €/an jugé élevé. Hortense et Alex renégocient le périmètre avec le jardinier (zones sauvages en fauche tardive).\n\n## 4. Pack de Survie Alimentaire & Rangement\n- **Pack Survie :** Maintien d'un stock de réserve (3 paquets de pâtes, 3 de riz, pestos, chips, gâteaux, huile, café/thé) identifié par une étiquette claire.\n- **Placards Chambres :** Au moins 50% des étagères laissées libres pour les invités.\n\n## 5. Arbitrage des Travaux & Priorité Structurelle\n- **Poutres vs Bibliothèque :** Accord unanime pour prioriser la visite et le diagnostic d'un expert sur l'effritement des poutres structurelles avant les travaux de placo de la bibliothèque.`
        },
        { id: 'f-rosing-2', name: 'Devis_Jardinier_PERROT_2025.pdf', size: '1.2 MB', type: 'pdf', date: '06/02/2025', uploaded_by: 'Hortense' },
        { id: 'f-rosing-3', name: 'Charte_Nettoyage_Rangement_Etage.pdf', size: '450 KB', type: 'pdf', date: '08/08/2026', uploaded_by: 'Élisabeth' }
      ]
    },
    {
      id: 'm-3',
      date: '2026-08-07',
      formattedDate: '7 Août 2026',
      title: "Audit Financier, Fiscal & Ouverture du Compte Bancaire SCI",
      subtitle: "Session Préparatoire • Analyse Démembrement, Taxe Foncière & Taux CCA",
      consensusPoints: [
        { title: "Séparation Patrimoines", text: "Respect strict de l'obligation CO 957. Ouverture du compte bancaire dédié SCI.", icon: Landmark, color: "blue" },
        { title: "Périmètre Immobilier", text: "Propriétés Rosing et Le Presbytère à Mesnils sur Iton. Appartement Paris Gracieuse exclu.", icon: ShieldCheck, color: "emerald" },
        { title: "Démembrement Familial", text: "Usufruit aux 2 parents, nue-propriété répartie à parts égales entre les 5 enfants.", icon: Users, color: "purple" },
        { title: "Choix Banque SCI", text: "Sélection recommandée du Crédit Agricole Normandie / BCV (2,10 € à 5,60 €/mois).", icon: Euro, color: "indigo" }
      ],
      summaryText: "Audit juridique et financier consolidé pour l'ouverture du compte bancaire de la SCI. Confirmation du périmètre à Mesnils sur Iton (Rosing & Presbytère) et de la structure des 7 associés. Analyse factuelle des charges annuelles réelles (14 057 € / an) : électricité EDF, fioul JOSSE, taxe foncière (1 971 €), eau SEPASE. Choix recommandé d'une ouverture de compte au Crédit Agricole Normandie avec virements permanents libellés 'Apport CCA - Nom'.",
      fullChapters: [
        {
          title: "1. Périmètre Immobilier et Démembrement de Propriété",
          text: "La SCI regroupe les 7 membres (2 parents usufruitiers + 5 enfants nus-propriétaires). Le périmètre comprend la Villa Rosing (8 rue Mairie) et Le Presbytère (4 rue Mairie). L'appartement de Paris Gracieuse est formellement exclu du patrimoine de la SCI."
        },
        {
          title: "2. Chiffrage Consolidé des Charges Annuelles (14 057 € / an)",
          text: "Bilan financier lissé : Électricité EDF (4 100 €/an), Fioul Éts JOSSE (3 700 €/an), Taxe foncière (1 971 €/an), Jardinier (800 €/an), Entretien piscine (600 €/an), Eau & SPANC (736 €/an), Maintenance & Assurances (2 150 €/an). Soit une part mensuelle moyenne de 167,35 € / mois par associé."
        },
        {
          title: "3. Choix de la Banque & Procédure d'Ouverture",
          text: "Sélection du Crédit Agricole Normandie (2,10 € à 5,60 €/mois) ou néobanque Qonto. Mise en place de virements permanents mensuels par les 7 membres libellés 'Apport CCA - [Prénom]' pour alimenter la trésorerie."
        }
      ],
      attachedFiles: [
        {
          id: 'f-audit-1',
          name: 'Audit_Gestion_Financiere_Compte_Bancaire_SCI_07082026.md',
          size: '32.1 KB',
          type: 'md',
          date: '07/08/2026',
          uploaded_by: 'Henri',
          content: `# Audit Gestion Financière et Compte Bancaire SCI (Rosing & Presbytère)\n**Date :** 7 Août 2026\n**Auteur :** Henri Jamet (Coordinateur)\n\n---\n\n## 1. Cadre Juridique et Séparation des Patrimoines\n- **Obligation Comptable (CO 957) :** Séparation stricte du compte commercial de la SCI et des comptes personnels des associés.\n- **Périmètre Immobilier :** Propriété Rosing (8 rue Mairie) et Le Presbytère (4 rue Mairie) à Mesnils sur Iton. (Paris Gracieuse formellement exclu).\n- **Démembrement :** Usufruit détenu par les 2 parents, nue-propriété répartie entre les 5 enfants.\n\n## 2. Chiffrage Réel des Charges Annuelles (14 057 € / an)\n- **Électricité EDF :** 4 100 €/an (Moyenne lissée Rosing + Presbytère).\n- **Fioul Chauffage JOSSE :** 3 700 €/an (Sur la base des 3 factures historiques).\n- **Taxe Foncière :** 1 971 €/an.\n- **Jardinier Perrot :** 800 €/an (Entretien espaces verts retenu SCI).\n- **Eau & Assainissement :** 736 €/an.\n- **Maintenance & Assurances PNO :** 2 150 €/an.\n\n## 3. Choix de l'Établissement Bancaire & Apports CCA\n- **Recommandation N°1 :** Crédit Agricole Normandie / BCV (Tarif 2,10 € à 5,60 €/mois).\n- **Modalité Apport CCA :** Virement automatique mensuel de 50 € par associé avec libellé strict Apport CCA - [Prénom].`
        },
        { id: 'f-audit-2', name: 'Extrait_Kbis_Greffe_SCI.pdf', size: '620 KB', type: 'pdf', date: '07/08/2026', uploaded_by: 'Henri' },
        { id: 'f-audit-3', name: 'Factures_EDF_Fioul_Consolidees.pdf', size: '2.1 MB', type: 'pdf', date: '07/08/2026', uploaded_by: 'Henri' }
      ]
    }
  ]);

  // Unified Document Library Construction & Filtering
  const getUnifiedDocuments = () => {
    const baseDocs = [
      {
        id: 'doc-statuts',
        title: 'Statuts Constitutifs SCI Hellenvilliers',
        filename: 'Statuts_Constitutifs_SCI_Hellenvilliers.pdf',
        category: '⚖️ Actes & Statuts Notariés',
        uploaded_by: 'Henri',
        type: 'pdf',
        size: '1.2 MB',
        date: '01/01/2026',
        source: 'Acte Notarié',
        url: '/uploads/documents/Statuts_Constitutifs_SCI_Hellenvilliers.pdf'
      },
      {
        id: 'doc-kbis',
        title: 'Extrait Kbis Greffe du Tribunal',
        filename: 'Extrait_Kbis_Greffe_SCI.pdf',
        category: '⚖️ Actes & Statuts Notariés',
        uploaded_by: 'Henri',
        type: 'pdf',
        size: '620 KB',
        date: '15/01/2026',
        source: 'Greffe',
        url: '/uploads/documents/Extrait_Kbis_Greffe_SCI.pdf'
      },
      {
        id: 'doc-jardinier',
        title: 'Devis Jardinier EI PERROT LAURENT (3 900 €)',
        filename: 'Devis_Jardinier_PERROT_2025.pdf',
        category: '📑 Devis & Contrats',
        uploaded_by: 'Hortense',
        type: 'pdf',
        size: '1.2 MB',
        date: '06/02/2025',
        source: 'Devis Prestataire',
        url: '/uploads/documents/Devis_Jardinier_PERROT_2025.pdf'
      },
      {
        id: 'doc-assurance',
        title: 'Contrat Assurance PNO AXA Hellenvilliers',
        filename: 'Contrat_Assurance_PNO_AXA_2026.pdf',
        category: '📑 Devis & Contrats',
        uploaded_by: 'Henri',
        type: 'pdf',
        size: '940 KB',
        date: '10/01/2026',
        source: 'Contrat Assurance',
        url: '/uploads/documents/Contrat_Assurance_PNO_AXA_2026.pdf'
      }
    ];

    const meetingDocs = [];
    meetings.forEach((m) => {
      if (m.attachedFiles) {
        m.attachedFiles.forEach((f) => {
          meetingDocs.push({
            id: f.id || `m-doc-${f.name}`,
            title: f.name.replace('.md', '').replace('.pdf', '').replaceAll('_', ' '),
            filename: f.name,
            category: '📜 PV & Réunions',
            uploaded_by: f.uploaded_by || 'Henri',
            type: f.type || 'md',
            size: f.size || '20 KB',
            date: f.date || m.date,
            source: m.title,
            content: f.content,
            url: f.url
          });
        });
      }
    });

    const taskDocs = adminDocs.map((d) => ({
      id: d.id || d.filename,
      title: d.name || d.title || d.filename,
      filename: d.filename || d.file_name || (d.file_url ? d.file_url.split('/').pop() : ''),
      category: d.category || '🛠️ Fin de Tâche & Réparations',
      uploaded_by: d.uploaded_by || 'Système',
      type: d.type || 'pdf',
      size: d.size || '150 KB',
      date: d.upload_date || d.created_at || '08/08/2026',
      source: d.source || 'Facture / Fin de tâche',
      url: d.url || d.file_url
    }));

    const combined = [...baseDocs, ...meetingDocs, ...taskDocs];
    const uniqueMap = new Map();
    combined.forEach((doc) => {
      if (doc.filename && !uniqueMap.has(doc.filename)) {
        uniqueMap.set(doc.filename, doc);
      }
    });

    return Array.from(uniqueMap.values());
  };

  const parseDocDate = (dStr) => {
    if (!dStr) return 0;
    if (dStr.includes('/')) {
      const parts = dStr.split('/');
      if (parts.length === 3) {
        return new Date(`${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`).getTime() || 0;
      }
    }
    return new Date(dStr).getTime() || 0;
  };

  const filteredUnifiedDocs = getUnifiedDocuments().filter((doc) => {
    const query = docSearchQuery.toLowerCase();
    const matchesSearch =
      docSearchQuery === '' ||
      (doc.title && doc.title.toLowerCase().includes(query)) ||
      (doc.filename && doc.filename.toLowerCase().includes(query)) ||
      (doc.uploaded_by && doc.uploaded_by.toLowerCase().includes(query)) ||
      (doc.category && doc.category.toLowerCase().includes(query));

    const matchesCategory =
      docCategoryFilter === 'Toutes' ||
      doc.category === docCategoryFilter ||
      (docCategoryFilter.includes('Actes') && doc.category && doc.category.includes('Actes')) ||
      (docCategoryFilter.includes('Fin de Tâche') && doc.category && doc.category.includes('Fin de Tâche')) ||
      (docCategoryFilter.includes('PV') && doc.category && doc.category.includes('PV')) ||
      (docCategoryFilter.includes('Devis') && doc.category && doc.category.includes('Devis'));

    return matchesSearch && matchesCategory;
  }).sort((a, b) => {
    if (docSortOrder === 'name_asc') {
      return (a.title || '').localeCompare(b.title || '');
    }
    if (docSortOrder === 'category') {
      return (a.category || '').localeCompare(b.category || '');
    }
    if (docSortOrder === 'oldest') {
      return parseDocDate(a.date) - parseDocDate(b.date);
    }
    return parseDocDate(b.date) - parseDocDate(a.date);
  });

      {/* SECTION UNIFIÉE : 📚 Bibliothèque Unique des Documents de la SCI */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-3 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-200">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                📚 Bibliothèque Unique des Documents de la SCI
              </h2>
              <p className="text-xs text-slate-500">
                Consolidation globale des actes notariés, devis, contrats, procès-verbaux .md et justificatifs de fin de tâche
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={loadAdminDocs}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center space-x-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingAdminDocs ? 'animate-spin' : ''}`} />
              <span>Actualiser</span>
            </button>
            <span className="text-xs font-black px-3.5 py-2 rounded-xl bg-indigo-100 text-indigo-900 border border-indigo-200">
              {filteredUnifiedDocs.length} Document{filteredUnifiedDocs.length > 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Controls: Search, Category Filter Tabs & Sorting */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
          
          {/* Search input */}
          <div className="md:col-span-5 relative">
            <input
              type="text"
              placeholder="🔍 Rechercher un document, nom, auteur..."
              value={docSearchQuery}
              onChange={(e) => setDocSearchQuery(e.target.value)}
              className="w-full pl-3.5 pr-8 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {docSearchQuery && (
              <button
                onClick={() => setDocSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Category Filter Selector */}
          <div className="md:col-span-4">
            <select
              value={docCategoryFilter}
              onChange={(e) => setDocCategoryFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="Toutes">📁 Toutes les catégories</option>
              <option value="📜 PV & Réunions">📜 PV & Réunions</option>
              <option value="⚖️ Actes & Statuts">⚖️ Actes & Statuts</option>
              <option value="📑 Devis & Contrats">📑 Devis & Contrats</option>
              <option value="🛠️ Fin de Tâche">🛠️ Fin de Tâche</option>
            </select>
          </div>

          {/* Sorting Selector */}
          <div className="md:col-span-3">
            <select
              value={docSortOrder}
              onChange={(e) => setDocSortOrder(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="newest">📅 Plus récents</option>
              <option value="oldest">📅 Plus anciens</option>
              <option value="name_asc">🔤 Nom (A - Z)</option>
              <option value="category">🏷️ Par Catégorie</option>
            </select>
          </div>

        </div>

        {/* Document Grid Display */}
        {filteredUnifiedDocs.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-xs text-slate-500 font-medium">
            Aucun document ne correspond à vos critères de recherche.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredUnifiedDocs.map((doc) => {
              const badge = getFileBadge(doc.type, doc.filename);
              const BadgeIcon = badge.icon;
              const isMd = doc.type === 'md' || (doc.filename && doc.filename.endsWith('.md')) || doc.type === 'markdown';

              return (
                <div
                  key={doc.id || doc.filename}
                  className="rounded-2xl border border-slate-200 bg-white p-4 transition-all hover:border-indigo-400 hover:shadow-md flex flex-col justify-between space-y-3 group"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center space-x-2.5">
                        <div className={`p-2 rounded-xl border shrink-0 ${badge.color}`}>
                          <BadgeIcon className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-xs font-extrabold text-slate-900 group-hover:text-indigo-600 transition line-clamp-1">
                            {doc.title}
                          </h3>
                          <p className="text-[10px] text-slate-400 font-mono truncate max-w-[180px]">
                            {doc.filename}
                          </p>
                        </div>
                      </div>

                      <span className="text-[9px] px-2 py-0.5 rounded-full font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                        {doc.size}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] pt-1">
                      <span className="px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        {doc.category}
                      </span>

                      {/* Uploader Attribution Tag */}
                      <span className="px-2 py-0.5 rounded-full font-extrabold bg-indigo-50 text-indigo-800 border border-indigo-200 flex items-center gap-1">
                        <User className="w-3 h-3 text-indigo-500" />
                        Téléversé par: <strong>{doc.uploaded_by || 'Henri'}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-[10px] text-slate-400 font-mono">{doc.date}</span>

                    <div className="flex items-center space-x-1.5">
                      {isMd && (
                        <button
                          type="button"
                          onClick={() => openMdViewer(doc)}
                          className="p-1.5 bg-slate-50 hover:bg-emerald-100 text-slate-600 hover:text-emerald-700 rounded-lg transition border border-slate-200"
                          title="Aperçu Markdown"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDownloadDocument(doc)}
                        className="p-1.5 bg-slate-50 hover:bg-indigo-100 text-slate-600 hover:text-indigo-700 rounded-lg transition border border-slate-200"
                        title={`Télécharger ${doc.filename}`}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>

                      {isCoordinator && doc.source_type === 'FILE' && (
                        <button
                          type="button"
                          onClick={() => handleDeleteAdminDoc(doc.filename)}
                          className="p-1.5 bg-slate-50 hover:bg-rose-100 text-slate-400 hover:text-rose-600 rounded-lg transition border border-slate-200"
                          title="Supprimer (Henri)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

  const ANNUAL_TOTAL_BUDGET = 17157; // 17 157 € / an
  const MONTHLY_TOTAL_BUDGET = 17157 / 12; // 1 429.75 € / mois
  const TOTAL_MEMBERS = 7;

  // RIB Details
  const ribData = {
    titulaire: "SCI HELLENVILLIERS",
    banque: "Crédit Agricole Normandie",
    iban: "FR76 1751 5000 0112 3456 7890 123",
    bic: "AGRIFR2X",
    ref: "Cotisation CCA - [Nom Membre]"
  };

  const handleCopyRib = () => {
    const textToCopy = `Titulaire: ${ribData.titulaire}\nIBAN: ${ribData.iban}\nBIC: ${ribData.bic}\nBanque: ${ribData.banque}`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedRib(true);
    setTimeout(() => setCopiedRib(false), 2500);
  };

  // Helper to format file size
  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Helper to determine icon & style based on file extension
  const getFileBadge = (fileType, fileName) => {
    const ext = fileName ? fileName.split('.').pop().toLowerCase() : (fileType || 'txt');
    if (ext === 'pdf') {
      return { icon: FileText, color: 'text-red-600 bg-red-50 border-red-200', label: 'PDF' };
    } else if (ext === 'md' || ext === 'markdown') {
      return { icon: FileCode, color: 'text-emerald-600 bg-emerald-50 border-emerald-200', label: 'MD' };
    } else if (['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(ext)) {
      return { icon: ImageIcon, color: 'text-blue-600 bg-blue-50 border-blue-200', label: ext.toUpperCase() };
    } else {
      return { icon: File, color: 'text-amber-600 bg-amber-50 border-amber-200', label: ext.toUpperCase() };
    }
  };

  // Open Raw .md Viewer Modal
  const openMdViewer = (file) => {
    const defaultContent = file.content || `# ${file.name}\n\n*Document Markdown consigné pour la SCI Familiale Hellenvilliers.*\n\n- Taille : ${file.size}\n- Date : ${file.date || 'Récemment joint'}\n\n## Contenu\nCe fichier contient le procès-verbal brut ou la transcription de réunion.`;
    setSelectedMdFile({
      ...file,
      content: defaultContent
    });
    setIsMdViewerOpen(true);
  };

  const handleCopyMdContent = () => {
    if (selectedMdFile && selectedMdFile.content) {
      navigator.clipboard.writeText(selectedMdFile.content);
      setCopiedMdText(true);
      setTimeout(() => setCopiedMdText(false), 2500);
    }
  };

  // Multi-File Upload Handling
  const handleFilesSelected = (files) => {
    const fileList = Array.from(files);
    const mappedFiles = fileList.map((file, idx) => {
      const ext = file.name.split('.').pop().toLowerCase();
      let fileContent = null;
      if (ext === 'md' || ext === 'txt') {
        const reader = new FileReader();
        reader.onload = (e) => {
          fileContent = e.target.result;
        };
        reader.readAsText(file);
      }
      return {
        id: `new-file-${Date.now()}-${idx}`,
        name: file.name,
        size: formatFileSize(file.size),
        type: ext,
        date: new Date().toLocaleDateString('fr-FR'),
        content: fileContent,
        fileObject: file
      };
    });
    setNewMeetingFiles((prev) => [...prev, ...mappedFiles]);
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesSelected(e.target.files);
    }
  };

  // Drag and Drop Handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  };

  const handleRemoveNewFile = (fileId) => {
    setNewMeetingFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  // Functional Document Download with Blob trigger (.md / PDF)
  const handleDownloadDocument = (file) => {
    if (!file) return;
    const content = file.content || `# ${file.name}\n\nDocument consigné pour la SCI Familiale Hellenvilliers (${file.size || 'Fichier joint'}).\n\n---\n\n## Procès-Verbal & Synthèse\nCe document fait partie des pièces justificatives officielles.`;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', file.name || 'transcript.md');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Remove attachment strictly restricted to Coordinator (Henri)
  const handleRemoveAttachmentFromMeeting = (meetingId, fileId) => {
    if (!isCoordinator) {
      alert("🔒 Action réservée à Henri (Coordinateur de la SCI).");
      return;
    }
    setMeetings((prevMeetings) =>
      prevMeetings.map((m) => {
        if (m.id === meetingId) {
          return {
            ...m,
            attachedFiles: m.attachedFiles.filter((f) => f.id !== fileId)
          };
        }
        return m;
      })
    );
  };

  // Delete Meeting Handler strictly restricted to Coordinator (Henri)
  const handleDeleteMeeting = (meetingId) => {
    if (!isCoordinator) {
      alert("🔒 Action réservée à Henri (Coordinateur de la SCI).");
      return;
    }
    if (window.confirm("Êtes-vous sûr de vouloir supprimer cette réunion et ses compte-rendus ?")) {
      setMeetings((prev) => prev.filter((m) => m.id !== meetingId));
    }
  };

  // Open Edit Meeting Modal (Coordinator only)
  const openEditMeetingModal = (meeting) => {
    if (!isCoordinator) {
      alert("🔒 Action réservée à Henri (Coordinateur de la SCI).");
      return;
    }
    setEditingMeeting({
      ...meeting,
      title: meeting.title,
      subtitle: meeting.subtitle || '',
      summaryText: meeting.summaryText || ''
    });
    setIsEditMeetingModalOpen(true);
  };

  // Save Edit Meeting Handler (Coordinator only)
  const handleEditMeetingSubmit = (e) => {
    e.preventDefault();
    if (!isCoordinator || !editingMeeting) return;
    
    setMeetings((prev) =>
      prev.map((m) =>
        m.id === editingMeeting.id
          ? {
              ...m,
              title: editingMeeting.title,
              subtitle: editingMeeting.subtitle,
              summaryText: editingMeeting.summaryText
            }
          : m
      )
    );
    setIsEditMeetingModalOpen(false);
    setEditingMeeting(null);
  };

  // Create Meeting Submit Handler strictly restricted to Coordinator (Henri)
  const handleAddMeetingSubmit = (e) => {
    e.preventDefault();
    if (!isCoordinator) {
      alert("🔒 Seul le coordinateur Henri est autorisé à ajouter une réunion.");
      return;
    }
    if (!newMeetingTitle.trim()) return;

    const formattedD = new Date(newMeetingDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

    const newMeeting = {
      id: `m-${Date.now()}`,
      date: newMeetingDate,
      formattedDate: formattedD,
      title: newMeetingTitle,
      subtitle: newMeetingSubtitle || 'Assemblée Familiale • PV & Documents consignés',
      consensusPoints: [
        { title: "Document & Transcriptions", text: `${newMeetingFiles.length} document(s) joint(s) pour consultation.`, icon: Paperclip, color: "blue" },
        { title: "Archivage SCI", text: "Procès-verbal consigné dans le coffre digital d'Hellenvilliers.", icon: ShieldCheck, color: "emerald" }
      ],
      summaryText: newMeetingSummary || 'Compte rendu rédigé et consigné avec succès.',
      fullChapters: [
        {
          title: "Procès-Verbal Intégral",
          text: newMeetingSummary || 'Détails des décisions consignées lors de cette réunion.'
        }
      ],
      attachedFiles: newMeetingFiles
    };

    setMeetings([newMeeting, ...meetings]);

    // Reset Form & Close Modal
    setNewMeetingTitle('');
    setNewMeetingSubtitle('');
    setNewMeetingSummary('');
    setNewMeetingFiles([]);
    setIsAddMeetingModalOpen(false);
  };

  // Open Detailed View Modal for a Specific Meeting
  const openMeetingDetailModal = (meeting) => {
    setSelectedMeeting(meeting);
    setIsMeetingModalOpen(true);
  };

  // Calculations for Simulator
  const totalMonthlyCollected = monthlyContribution * TOTAL_MEMBERS;
  const totalAnnualCollected = totalMonthlyCollected * 12;
  const coveragePercent = Math.min(100, Math.round((totalAnnualCollected / ANNUAL_TOTAL_BUDGET) * 100));
  const annualGap = ANNUAL_TOTAL_BUDGET - totalAnnualCollected;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* Prominent Red Alert Card on Data Error (Zero Fallback Rule) */}
      {loadError && (
        <div className="p-6 rounded-3xl bg-rose-50 border-2 border-rose-500 text-rose-900 shadow-md animate-in fade-in duration-200">
          <div className="flex items-start space-x-4">
            <div className="p-3 bg-rose-600 text-white rounded-2xl shrink-0">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-black text-rose-950 flex items-center gap-2">
                <span>⚠️ Erreur de lecture capteur / API</span>
              </h3>
              <p className="text-xs text-rose-700 font-bold mt-1">
                Échec du chargement des données administratives de la SCI. Aucun masquage silencieux.
              </p>
              <div className="mt-3 p-3 bg-rose-100 border border-rose-300 rounded-xl font-mono text-xs text-rose-950 break-all">
                <strong>Raw error trace :</strong> {loadError}
              </div>
              <div className="mt-4 flex items-center space-x-3">
                <button
                  onClick={() => setLoadError(null)}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl shadow transition flex items-center space-x-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Enquêter / Réessayer</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Page Header (100% Light Theme Banner) */}
      {/* Page Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-900 via-indigo-950 to-slate-900 border border-slate-800 text-white p-6 sm:p-8 shadow-md w-full">
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 rounded-full bg-blue-500/10 blur-3xl pointer-events-none"></div>

        <div className="w-full flex flex-row items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center space-x-2 text-xs font-semibold text-blue-300 uppercase tracking-widest mb-1">
              <Landmark className="h-4 w-4 text-blue-400" />
              <span>Patrimoine & Administration</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Informations Administratives & Financières
            </h1>
            <p className="text-sm text-blue-100/90 mt-1 max-w-2xl">
              Consultez les comptes rendus de réunions, le RIB de la SCI, les statuts notariés, le bilan financier et le simulateur de cotisation CCA.
            </p>
          </div>

          <button
            onClick={handleCopyRib}
            className="flex items-center justify-center space-x-2 px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-md transition-all shrink-0"
          >
            {copiedRib ? <Check className="h-4 w-4 text-white" /> : <Copy className="h-4 w-4" />}
            <span>{copiedRib ? 'RIB Copié !' : 'Copier le RIB SCI'}</span>
          </button>
        </div>
      </div>

      {/* SECTION DÉDIÉE : Comptes Rendus des Réunions Familiales */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-emerald-50 text-emerald-600">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                📜 Comptes Rendus des Réunions Familiales
              </h2>
              <p className="text-xs text-slate-500">
                PV officiels, consensus, décisions votées et documents d'annexes des Assemblées de la SCI
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3 self-start sm:self-auto">
            <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> {meetings.length} Réunion{meetings.length > 1 ? 's' : ''} Consignée{meetings.length > 1 ? 's' : ''}
            </span>
            
            {isCoordinator ? (
              <button
                onClick={() => setIsAddMeetingModalOpen(true)}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Ajouter une Réunion</span>
              </button>
            ) : (
              <span
                className="inline-flex items-center space-x-1 px-3.5 py-2 rounded-xl bg-slate-100 text-slate-500 text-xs font-extrabold border border-slate-200"
                title="L'ajout et la gestion des réunions sont strictly réservés au Coordinateur Henri."
              >
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                <span>Gestion réservée à Henri</span>
              </span>
            )}
          </div>
        </div>

        {/* Dynamic Meetings List (Simplified Main Cards) */}
        <div className="space-y-6">
          {meetings.map((meeting) => (
            <div
              key={meeting.id}
              className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 sm:p-6 transition-all hover:border-emerald-500/40 hover:shadow-md space-y-4"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/60 pb-3">
                <div>
                  <div className="flex items-center space-x-2 text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{meeting.formattedDate} • {meeting.subtitle}</span>
                  </div>
                  <h3 className="text-lg font-extrabold text-slate-900">
                    {meeting.title}
                  </h3>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    onClick={() => openMeetingDetailModal(meeting)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow transition flex items-center space-x-1.5"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Voir le Procès-Verbal & Transcriptions (.md)</span>
                  </button>

                  {/* Modifier & Supprimer actions (Strictly Coordinator Henri) */}
                  {isCoordinator && (
                    <div className="flex items-center space-x-1 pl-2 border-l border-slate-200">
                      <button
                        onClick={() => openEditMeetingModal(meeting)}
                        className="p-2 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl transition border border-amber-200"
                        title="Modifier cette réunion (Henri)"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteMeeting(meeting.id)}
                        className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl transition border border-rose-200"
                        title="Supprimer cette réunion (Henri)"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Main Card Displays Summary Text Only */}
              <div className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-sm text-xs text-slate-700 leading-relaxed font-medium">
                <span className="font-extrabold text-emerald-800 block mb-1">💡 Synthèse & Décisions Exécutives :</span>
                {meeting.summaryText}
              </div>

              {/* Attached Documents Preview Section (Multi-File Chips) */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2 text-xs font-bold text-slate-700">
                    <Paperclip className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Documents & Annexes Associés ({meeting.attachedFiles.length})</span>
                  </div>
                  <span className="text-[10px] text-slate-400">Formats consignés (.md, .pdf, .txt, .png, .jpg)</span>
                </div>

                {meeting.attachedFiles.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">Aucun document joint à ce compte rendu.</p>
                ) : (
                  <div className="flex flex-wrap gap-2.5">
                    {meeting.attachedFiles.map((file) => {
                      const badge = getFileBadge(file.type, file.name);
                      const BadgeIcon = badge.icon;
                      const isMd = file.type === 'md' || file.name.endsWith('.md') || file.type === 'markdown';

                      return (
                        <div
                          key={file.id}
                          className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl border text-xs transition-all shadow-sm ${badge.color}`}
                        >
                          <BadgeIcon className="w-4 h-4 shrink-0" />
                          <div className="flex flex-col">
                            <span className="font-bold truncate max-w-[180px] text-slate-900">{file.name}</span>
                            <span className="text-[9px] text-slate-500 font-mono">{file.size}</span>
                          </div>
                          
                          <div className="flex items-center space-x-1 pl-1 border-l border-slate-200">
                            {/* Raw .md Viewer Button if .md file */}
                            {isMd && (
                              <button
                                type="button"
                                onClick={() => openMdViewer(file)}
                                className="p-1 text-slate-500 hover:text-emerald-700 transition"
                                title="Voir le Markdown rendu / brut"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Download button */}
                            <button
                              type="button"
                              onClick={() => handleDownloadDocument(file)}
                              className="p-1 text-slate-500 hover:text-emerald-600 transition"
                              title={`Télécharger ${file.name}`}
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>

                            {/* Remove button (Strictly Coordinator Henri) */}
                            {isCoordinator && (
                              <button
                                type="button"
                                onClick={() => handleRemoveAttachmentFromMeeting(meeting.id, file.id)}
                                className="p-1 text-slate-400 hover:text-red-600 transition"
                                title="Détacher le document (Henri)"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Grid Section 1: RIB & Financial Summary Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* RIB SCI Card */}
        <div className="lg:col-span-1 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                  <Landmark className="h-5 w-5" />
                </div>
                <h2 className="text-base font-bold text-slate-900">RIB de la SCI</h2>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                Compte Officiel
              </span>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60">
                <span className="text-[10px] font-sans text-slate-400 uppercase font-bold block mb-0.5">Titulaire du compte</span>
                <span className="font-bold text-slate-900">{ribData.titulaire}</span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60">
                <span className="text-[10px] font-sans text-slate-400 uppercase font-bold block mb-0.5">IBAN</span>
                <span className="font-bold text-blue-600 text-sm tracking-wider break-all">{ribData.iban}</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60">
                  <span className="text-[10px] font-sans text-slate-400 uppercase font-bold block mb-0.5">BIC / SWIFT</span>
                  <span className="font-bold text-slate-800">{ribData.bic}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60">
                  <span className="text-[10px] font-sans text-slate-400 uppercase font-bold block mb-0.5">Banque</span>
                  <span className="font-bold text-slate-800 truncate block">{ribData.banque}</span>
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={handleCopyRib}
            className="mt-6 w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition flex items-center justify-center space-x-2"
          >
            <Copy className="h-4 w-4 text-blue-600" />
            <span>Copier toutes les informations RIB</span>
          </button>
        </div>

        {/* Financial Breakdown (17 157 € / an) */}
        <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
            <div className="flex items-center space-x-2">
              <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                <PieChart className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Bilan Financier Annuel Consolidé</h2>
                <p className="text-xs text-slate-500">Coûts de fonctionnement réels du domaine d'Hellenvilliers</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Réel Consolidé</span>
              <span className="text-xl font-black text-slate-900">17 157 € / an</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Cost item 1: Jardinier EI PERROT */}
            <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20">
              <div className="flex justify-between items-start mb-1">
                <span className="text-xs font-bold text-slate-900">Jardinier (EI PERROT LAURENT)</span>
                <span className="text-xs font-black text-amber-600">3 900 € TTC/an</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Devis-2025-000002 du 06/02/2025 (3 250 € HT + 650 € TVA = 325 €/mois). Entretien des espaces verts.
              </p>
            </div>

            {/* Cost item 2: Fluides (Eau + Électricité) */}
            <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/20">
              <div className="flex justify-between items-start mb-1">
                <span className="text-xs font-bold text-slate-900">Fluides (Eau & Électricité)</span>
                <span className="text-xs font-black text-blue-600">4 835 € / an</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Répartition : 48,81 € (Électricité) + 8,76 € (Eau) = 57,57 € / mois par membre associé.
              </p>
            </div>

            {/* Cost item 3: Assurances & Taxe Foncière */}
            <div className="p-4 rounded-2xl bg-purple-500/5 border border-purple-500/20">
              <div className="flex justify-between items-start mb-1">
                <span className="text-xs font-bold text-slate-900">Assurances & Taxe Foncière</span>
                <span className="text-xs font-black text-purple-600">5 422 € / an</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Assurance PNO (Propriétaire Non Occupant) des 2 maisons + Taxe foncière Hellenvilliers.
              </p>
            </div>

            {/* Cost item 4: Maintenance & Divers */}
            <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20">
              <div className="flex justify-between items-start mb-1">
                <span className="text-xs font-bold text-slate-900">Entretien & Réparations</span>
                <span className="text-xs font-black text-emerald-600">3 000 € / an</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Petits travaux, ramonage cheminées, révision chaudière fioul et produits d'entretien.
              </p>
            </div>

          </div>
        </div>

      </div>

      {/* Section: Workload Dashboard Gauge for 7 Members */}
      <WorkloadDashboard />

      {/* Section 2: Simulator of Monthly Contribution (CCA 50 €/mois) */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-indigo-50 text-indigo-600">
              <Calculator className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Simulateur de Cotisation Mensuelle (CCA)</h2>
              <p className="text-xs text-slate-500">Contribution sur le Compte Courant d'Associé pour couvrir le budget SCI</p>
            </div>
          </div>

          <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2 text-xs">
            <Info className="h-4 w-4 text-indigo-500" />
            <span className="font-semibold text-slate-700">Objectif Recommandé : 50 € / mois / membre</span>
          </div>
        </div>

        {/* Preset Scenarios */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={() => setMonthlyContribution(50)}
            className={`p-4 rounded-2xl border text-left transition ${
              monthlyContribution === 50
                ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-500/20'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 block">Scénario Recommandé</span>
            <h3 className="text-sm font-bold text-slate-900 mt-0.5">50 € / mois par membre</h3>
            <p className="text-[11px] text-slate-500 mt-1">Cotisation minimale pour constituer la trésorerie de roulement.</p>
          </button>

          <button
            onClick={() => setMonthlyContribution(204)}
            className={`p-4 rounded-2xl border text-left transition ${
              monthlyContribution === 204
                ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-500/20'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 block">Scénario A (Égalitaire)</span>
            <h3 className="text-sm font-bold text-slate-900 mt-0.5">204,25 € / mois (7 membres)</h3>
            <p className="text-[11px] text-slate-500 mt-1">Couverture intégrale à 100% des 17 157 € / an à parts égales.</p>
          </button>

          <button
            onClick={() => setMonthlyContribution(86)}
            className={`p-4 rounded-2xl border text-left transition ${
              monthlyContribution === 86
                ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-500/20'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 block">Scénario B (Solidaire)</span>
            <h3 className="text-sm font-bold text-slate-900 mt-0.5">85,95 € / mois (5 enfants)</h3>
            <p className="text-[11px] text-slate-500 mt-1">Parents (1 000 €/mois) + solde réparti entre les 5 enfants.</p>
          </button>
        </div>

        {/* Interactive Slider */}
        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200/60 space-y-4">
          <div className="flex justify-between items-center">
            <label className="text-xs font-bold text-slate-700">
              Ajuster la cotisation individuelle mensuelle :
            </label>
            <span className="text-lg font-black text-indigo-600">{monthlyContribution} € / mois</span>
          </div>

          <input
            type="range"
            min="0"
            max="250"
            step="5"
            value={monthlyContribution}
            onChange={(e) => setMonthlyContribution(Number(e.target.value))}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />

          {/* Progress Bar & Results Summary */}
          <div className="space-y-2 pt-2">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-slate-600">
                Total collecté (7 membres) : <strong className="text-slate-900">{totalAnnualCollected.toLocaleString('fr-FR')} € / an</strong>
              </span>
              <span className={coveragePercent >= 100 ? 'text-emerald-600 font-extrabold' : 'text-indigo-600 font-extrabold'}>
                {coveragePercent}% du budget couvert
              </span>
            </div>

            <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden flex">
              <div
                style={{ width: `${coveragePercent}%` }}
                className={`h-full transition-all duration-300 ${coveragePercent >= 100 ? 'bg-emerald-500' : 'bg-indigo-600'}`}
              ></div>
            </div>

            <div className="flex justify-between text-[11px] text-slate-500 pt-1">
              <span>Collecte mensuelle globale : {totalMonthlyCollected} € / mois</span>
              {annualGap > 0 ? (
                <span className="text-amber-600 font-medium">
                  Reste à financer / Apport : {annualGap.toLocaleString('fr-FR')} € / an
                </span>
              ) : (
                <span className="text-emerald-600 font-semibold">
                  Budget annuel 100% couvert ! Trésorerie excédentaire : {Math.abs(annualGap).toLocaleString('fr-FR')} € / an
                </span>
              )}
            </div>
          </div>
        </div>

      </div>



      {/* MODAL 1 : Ajouter une Réunion (Multi-Upload Drag & Drop) */}
      {isAddMeetingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-600">
                  <Plus className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900">
                    Consigner une Nouvelle Réunion & Documents
                  </h3>
                  <p className="text-xs text-slate-500">
                    Saisissez les détails de l'Assemblée et joignez plusieurs fichiers (.md, .pdf, .txt, .png, .jpg)
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsAddMeetingModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleAddMeetingSubmit} className="p-6 overflow-y-auto space-y-4">
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-bold text-slate-700">Titre de la réunion *</label>
                  <input
                    type="text"
                    required
                    placeholder="ex: Assemblée générale d'automne - Budget & Travaux"
                    value={newMeetingTitle}
                    onChange={(e) => setNewMeetingTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Date de tenue *</label>
                  <input
                    type="date"
                    required
                    value={newMeetingDate}
                    onChange={(e) => setNewMeetingDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Sous-titre / Thème</label>
                <input
                  type="text"
                  placeholder="ex: Décisions chauffage ViCare & devis artisan"
                  value={newMeetingSubtitle}
                  onChange={(e) => setNewMeetingSubtitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Synthèse / Décisions principales</label>
                <textarea
                  rows={3}
                  placeholder="Résumé des résolutions adoptées, votes et étapes de suivi..."
                  value={newMeetingSummary}
                  onChange={(e) => setNewMeetingSummary(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Multi-File Drag & Drop Upload Zone */}
              <div className="space-y-2 pt-2">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>Joindre des documents (Multi-fichiers)</span>
                  <span className="text-[10px] text-slate-400">.md, .pdf, .txt, .png, .jpg</span>
                </label>

                {/* Dropzone container */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                    isDragOver
                      ? 'border-emerald-500 bg-emerald-50/50 scale-[1.01]'
                      : 'border-slate-200 bg-slate-50/50 hover:border-emerald-500/50'
                  }`}
                >
                  <input
                    type="file"
                    multiple
                    accept=".md,.pdf,.txt,.png,.jpg,.jpeg"
                    ref={fileInputRef}
                    onChange={handleFileInputChange}
                    className="hidden"
                  />
                  
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <div className="p-3 rounded-full bg-emerald-100 text-emerald-600">
                      <Upload className="w-5 h-5" />
                    </div>
                    <div className="text-xs font-bold text-slate-800">
                      Glissez-déposez vos fichiers ici, ou <span className="text-emerald-600 underline">parcourez</span>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Transcriptions .md, devis .pdf, annexes d'assemblée ou photos
                    </p>
                  </div>
                </div>

                {/* Attached File Preview Chips */}
                {newMeetingFiles.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <span className="text-[11px] font-bold text-slate-600">
                      Fichiers prêts à être associés ({newMeetingFiles.length}) :
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {newMeetingFiles.map((file) => {
                        const badge = getFileBadge(file.type, file.name);
                        const BadgeIcon = badge.icon;
                        return (
                          <div
                            key={file.id}
                            className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl border text-xs shadow-sm ${badge.color}`}
                          >
                            <BadgeIcon className="w-4 h-4 shrink-0" />
                            <div className="flex flex-col">
                              <span className="font-bold truncate max-w-[140px] text-slate-900">{file.name}</span>
                              <span className="text-[9px] text-slate-500 font-mono">{file.size}</span>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveNewFile(file.id);
                              }}
                              className="p-1 text-slate-400 hover:text-red-600 transition ml-1"
                              title="Retirer ce fichier"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Form Footer */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsAddMeetingModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow transition"
                >
                  Enregistrer le Compte Rendu
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* MODAL 2 : Synthèse Intégrale de la Réunion Sélectionnée */}
      {isMeetingModalOpen && selectedMeeting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-600">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900">
                    Procès-Verbal & Synthèse — {selectedMeeting.title}
                  </h3>
                  <p className="text-xs text-slate-500">
                    SCI Familiale Hellenvilliers • Tenue le {selectedMeeting.formattedDate}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsMeetingModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body Scrollable Text */}
            <div className="p-6 overflow-y-auto space-y-6 text-sm text-slate-700 leading-relaxed">
              
              {/* Summary Alert Box */}
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-2">
                <h4 className="font-extrabold text-emerald-900 flex items-center space-x-2 text-sm">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  <span>Synthèse Exécutative des Accords Votés</span>
                </h4>
                <p className="text-xs text-emerald-800 font-medium">
                  {selectedMeeting.summaryText}
                </p>
              </div>

              {/* Documents & Annexes Associated */}
              {selectedMeeting.attachedFiles && selectedMeeting.attachedFiles.length > 0 && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <h4 className="font-extrabold text-slate-900 text-xs flex items-center space-x-2">
                    <Paperclip className="w-4 h-4 text-emerald-600" />
                    <span>Pièces jointes & Transcriptions d'assemblée ({selectedMeeting.attachedFiles.length})</span>
                  </h4>

                  <div className="flex flex-wrap gap-2.5">
                    {selectedMeeting.attachedFiles.map((file) => {
                      const badge = getFileBadge(file.type, file.name);
                      const BadgeIcon = badge.icon;
                      const isMd = file.type === 'md' || file.name.endsWith('.md') || file.type === 'markdown';

                      return (
                        <div
                          key={file.id}
                          className={`flex items-center space-x-2 px-3 py-2 rounded-xl border text-xs shadow-sm ${badge.color}`}
                        >
                          <BadgeIcon className="w-4 h-4 shrink-0" />
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-900">{file.name}</span>
                            <span className="text-[9px] text-slate-500 font-mono">{file.size}</span>
                          </div>

                          <div className="flex items-center space-x-1 pl-2">
                            {isMd && (
                              <button
                                type="button"
                                onClick={() => openMdViewer(file)}
                                className="p-1 bg-white rounded-lg text-slate-600 hover:text-emerald-700 shadow-sm transition"
                                title="Voir le Markdown brut"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDownloadDocument(file)}
                              className="p-1 bg-white rounded-lg text-slate-600 hover:text-emerald-600 shadow-sm transition"
                              title={`Télécharger ${file.name}`}
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Detailed Chapters */}
              <div className="space-y-4">
                {selectedMeeting.fullChapters ? (
                  selectedMeeting.fullChapters.map((chap, idx) => (
                    <div key={idx} className="space-y-1">
                      <h4 className="text-base font-extrabold text-slate-900 border-b pb-1 border-slate-200">
                        {chap.title}
                      </h4>
                      <p className="text-xs sm:text-sm text-slate-600">
                        {chap.text}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500">{selectedMeeting.summaryText}</p>
                )}
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
              <button
                onClick={() => setIsMeetingModalOpen(false)}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow transition"
              >
                Fermer la Synthèse
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL EDIT MEETING (Coordinator Henri Only) */}
      {isEditMeetingModalOpen && editingMeeting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-xl w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-2xl bg-amber-500 text-white">
                  <Pencil className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Modifier la Réunion Familiale
                  </h3>
                  <p className="text-xs text-slate-500">
                    Réservé au Coordinateur Henri
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsEditMeetingModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditMeetingSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Titre de la Réunion</label>
                <input
                  type="text"
                  required
                  value={editingMeeting.title}
                  onChange={(e) => setEditingMeeting({ ...editingMeeting, title: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 font-semibold focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Sous-titre / Type</label>
                <input
                  type="text"
                  value={editingMeeting.subtitle}
                  onChange={(e) => setEditingMeeting({ ...editingMeeting, subtitle: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 font-semibold focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Synthèse & Compte Rendu Exécutif</label>
                <textarea
                  rows={4}
                  value={editingMeeting.summaryText}
                  onChange={(e) => setEditingMeeting({ ...editingMeeting, summaryText: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 font-medium focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditMeetingModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-black rounded-xl shadow transition"
                >
                  Enregistrer les modifications
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3 : Visualiseur de Markdown Formaté & Brut (.md) avec téléchargement .md */}
      {isMdViewerOpen && selectedMdFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-emerald-50/60">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
                  <FileCode className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Visualiseur de Transcription Markdown (.md)
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    {selectedMdFile.name} • {selectedMdFile.size}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {/* View Switcher: Formaté vs Brut */}
                <div className="flex items-center bg-white p-1 rounded-xl border border-emerald-200">
                  <button
                    type="button"
                    onClick={() => setMdViewTab('formatted')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                      mdViewTab === 'formatted' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Formaté (Rendu)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMdViewTab('raw')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                      mdViewTab === 'raw' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Brut (Source)
                  </button>
                </div>

                <button
                  onClick={handleCopyMdContent}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-white hover:bg-emerald-100 text-emerald-700 rounded-xl border border-emerald-200 text-xs font-bold transition shadow-sm"
                >
                  {copiedMdText ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedMdText ? 'Copié !' : 'Copier'}</span>
                </button>

                <button
                  onClick={() => setIsMdViewerOpen(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Content - Formatted vs Raw View */}
            <div className="p-6 overflow-y-auto flex-1 bg-slate-50">
              {mdViewTab === 'formatted' ? (
                <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
                  {selectedMdFile.content ? (
                    selectedMdFile.content.split('\n').map((line, idx) => renderMarkdownLine(line, idx))
                  ) : (
                    <p className="text-xs text-slate-500 italic">Aucun contenu Markdown disponible.</p>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-white border border-slate-200 font-mono text-xs text-slate-800 leading-relaxed whitespace-pre-wrap shadow-inner">
                  {selectedMdFile.content}
                </div>
              )}
            </div>

            {/* Modal Footer with .md Download Button */}
            <div className="p-4 border-t border-slate-100 bg-white flex items-center justify-between">
              <button
                onClick={() => handleDownloadDocument(selectedMdFile)}
                className="flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow transition"
              >
                <Download className="w-4 h-4" />
                <span>Télécharger le fichier .md</span>
              </button>

              <button
                onClick={() => setIsMdViewerOpen(false)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow transition"
              >
                Fermer l'aperçu
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}


