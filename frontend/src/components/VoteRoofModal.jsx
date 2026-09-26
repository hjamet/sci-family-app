import React, { useState, useEffect } from 'react';
import { MarkdownContent } from './common/RichTextEditor';
import DocumentViewerModal from './DocumentViewerModal';

const CHAT_ALLOWED_EMOJIS = ['👍', '❤️', '👏', '🎉', '👀', '✅', '🔥', '🙏'];

export default function VoteRoofModal({ isOpen, onClose, currentUser = 'Henri Jamet', onVoteSubmit }) {
  // Liste nominative des 7 associés statutaires de la SCI Hellenvilliers
  const [associatesVotes, setAssociatesVotes] = useState([
    {
      id: 'henri',
      name: 'Henri Jamet',
      role: 'Gérance SCI',
      isGerance: true,
      vote: 'POUR',
      date: '12 mai 2026, 14:30',
      initials: 'HJ'
    },
    {
      id: 'hortense',
      name: 'Hortense Jamet',
      role: 'Associée',
      isGerance: false,
      vote: 'POUR',
      date: '14 mai 2026, 10:20',
      initials: 'HJ'
    },
    {
      id: 'marguerite',
      name: 'Marguerite Jamet',
      role: 'Associée',
      isGerance: false,
      vote: 'POUR',
      date: '14 mai 2026, 16:45',
      initials: 'MJ'
    },
    {
      id: 'eugenie',
      name: 'Eugénie Jamet',
      role: 'Associée',
      isGerance: false,
      vote: 'POUR',
      date: '15 mai 2026, 08:15',
      initials: 'EJ'
    },
    {
      id: 'josephine',
      name: 'Joséphine Jamet',
      role: 'Associée',
      isGerance: false,
      vote: 'ABSTENTION',
      date: '15 mai 2026, 09:15',
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
  ]);

  // Messages du fil de discussion familial
  const [messages, setMessages] = useState([
    {
      id: 1,
      author: 'Hortense Jamet',
      initials: 'HJ',
      isGerance: false,
      date: '14 mai, 10:15',
      content: "J'ai lu le devis des Éts Josse, la garantie décennale est bien incluse et ils s'engagent à intervenir dès la première semaine de juin. Ça me paraît essentiel avant l'été !",
      reactions: [
        { emoji: '👍', count: 2 },
        { emoji: '❤️', count: 1 }
      ]
    },
    {
      id: 2,
      author: 'Henri Jamet',
      initials: 'HJ',
      isGerance: true,
      date: '14 mai, 11:42',
      content: "Exactement Hortense. De plus, le montant reste inférieur à l'enveloppe prévisionnelle votée lors de la dernière AG. La trésorerie sur le compte Crédit Agricole est suffisante sans appel de fonds exceptionnel.",
      reactions: [
        { emoji: '👍', count: 3 },
        { emoji: '💡', count: 1 }
      ]
    },
    {
      id: 3,
      author: 'Joséphine Jamet',
      initials: 'JJ',
      isGerance: false,
      date: '15 mai, 09:12',
      content: "Je me suis abstenue car je voulais vérifier si l'artisan incluait la reprise de la gouttière en zinc côté jardin ?",
      reactions: []
    },
    {
      id: 4,
      author: 'Henri Jamet',
      initials: 'HJ',
      isGerance: true,
      date: '15 mai, 09:30',
      content: "Oui Joséphine, vérifié en page 3 du devis Éts Josse, remplacement de 12 mètres linéaires de chéneau en zinc compris. Tout est intégré.",
      reactions: [
        { emoji: '👌', count: 2 }
      ]
    }
  ]);

  // Formulaire de vote interactif direct (Annotation 13)
  const [selectedVote, setSelectedVote] = useState('POUR');
  const [toastMessage, setToastMessage] = useState(null);

  // Formulaire de discussion
  const [newMessageText, setNewMessageText] = useState('');

  // Vue détaillée du tableau des associés
  const [showFullTable, setShowFullTable] = useState(true);

  // Trouver l'associé connecté
  const currentAssociate = associatesVotes.find(a => 
    a.name.toLowerCase().includes(currentUser.toLowerCase()) ||
    currentUser.toLowerCase().includes(a.name.toLowerCase()) ||
    (currentUser.toLowerCase().includes('henri') && a.id === 'henri')
  ) || associatesVotes[0];

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

  if (!isOpen) return null;

  // Calculs statistiques en temps réel avec prise en compte du report AG
  const totalAssociates = 7;
  const pourVotes = associatesVotes.filter(a => a.vote === 'POUR');
  const contreVotes = associatesVotes.filter(a => a.vote === 'CONTRE');
  const abstentionVotes = associatesVotes.filter(a => a.vote === 'ABSTENTION');
  const reportAgVotes = associatesVotes.filter(a => a.vote === 'REPORT_AG' || a.vote === 'REPORT_PROCHAINE_AG');
  const attenteVotes = associatesVotes.filter(a => a.vote === 'EN_ATTENTE');

  const pourCount = pourVotes.length;
  const contreCount = contreVotes.length;
  const abstentionCount = abstentionVotes.length;
  const reportAgCount = reportAgVotes.length;
  const attenteCount = attenteVotes.length;
  const totalVotesCast = pourCount + contreCount + abstentionCount + reportAgCount;

  const pourPct = ((pourCount / totalAssociates) * 100).toFixed(1);
  const contrePct = ((contreCount / totalAssociates) * 100).toFixed(1);
  const abstentionPct = ((abstentionCount / totalAssociates) * 100).toFixed(1);
  const reportAgPct = ((reportAgCount / totalAssociates) * 100).toFixed(1);
  const attentePct = Math.max(0, 100 - parseFloat(pourPct) - parseFloat(contrePct) - parseFloat(abstentionPct) - parseFloat(reportAgPct)).toFixed(1);
  const participationPct = Math.round((totalVotesCast / totalAssociates) * 100);

  const isAgReportRequested = reportAgCount > 0;
  const isMajoriteAtteinte = pourCount >= 4;

  // Enregistrement direct du vote en 1 clic (Annotation 13)
  const handleCastVote = (voteChoice) => {
    setSelectedVote(voteChoice);
    const now = new Date();
    const formattedDate = `${now.getDate()} mai 2026, ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    setAssociatesVotes(prev => prev.map(a => {
      if (a.id === currentAssociate.id) {
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
      REPORT_AG: 'Report en AG demandé'
    };

    setToastMessage(`Vote « ${voteLabels[voteChoice] || voteChoice} » enregistré pour ${currentAssociate.name} !`);
    setTimeout(() => setToastMessage(null), 3500);

    if (onVoteSubmit) {
      onVoteSubmit({
        associate: currentAssociate.name,
        vote: voteChoice
      });
    }
  };

  // Envoi d'un message dans le fil de discussion
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!newMessageText.trim()) return;

    const now = new Date();
    const formattedDate = `${now.getDate()} mai, ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const newMsg = {
      id: Date.now(),
      author: currentAssociate.name,
      initials: currentAssociate.initials,
      isGerance: currentAssociate.isGerance,
      date: formattedDate,
      content: newMessageText.trim(),
      reactions: []
    };

    setMessages(prev => [...prev, newMsg]);
    setNewMessageText('');
  };

  // Réaction à un message
  const handleToggleReaction = (msgId, emoji) => {
    setMessages(prev => prev.map(msg => {
      if (msg.id !== msgId) return msg;
      const existing = msg.reactions.find(r => r.emoji === emoji);
      let updatedReactions;
      if (existing) {
        updatedReactions = msg.reactions.map(r => 
          r.emoji === emoji ? { ...r, count: r.count + 1 } : r
        );
      } else {
        updatedReactions = [...msg.reactions, { emoji, count: 1 }];
      }
      return { ...msg, reactions: updatedReactions };
    }));
    setActiveEmojiPickerMsgId(null);
  };

  // État de la visionneuse intégrée (Annotation 9)
  const [viewerDoc, setViewerDoc] = useState(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [activeEmojiPickerMsgId, setActiveEmojiPickerMsgId] = useState(null);

  // Consultation dans la visionneuse sans téléchargement
  const handleViewDoc = (docName, desc) => {
    const content = `SCI FAMILIALE HELLENVILLIERS — DIRECTION DU DOMAINE\n\nDocument certifié : ${docName}\nObjet : ${desc}\nProjet : Réfection couverture Presbytère (4 850,00 € TTC, Devis Éts Josse)\nDate d'émission : Mai 2026\nStatut : Pièce certifiée conforme déposée au registre des délibérations.`;
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
    const content = `SCI FAMILIALE HELLENVILLIERS\n\nDocument certifié : ${docName}\nObjet : ${desc}\nProjet : Réfection couverture Presbytère (4 850 € TTC, Devis Éts Josse)\nDate d'émission : Mai 2026\nStatut : Validé pour consultation des 7 associés.`;
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

        {/* 1. EN-TÊTE ÉPURÉ DE LA MODALE (Annotation 14 : suppression des 3 badges fictifs) */}
        <header className="w-full bg-canvas-slate px-4 py-3 sm:px-space-lg sm:py-space-md flex items-center justify-between gap-space-sm border-b border-border-subtle shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-forest-deep text-xl">how_to_vote</span>
            <span className="font-semibold text-xs sm:text-sm text-slate-800">Scrutin &amp; Délibération des Associés</span>
          </div>

          {/* Action Quitter / Fermer */}
          <button 
            onClick={onClose}
            aria-label="Fermer la fenêtre" 
            className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors focus:outline-none cursor-pointer" 
            type="button"
          >
            <span className="material-symbols-outlined text-2xl">close</span>
          </button>
        </header>

        {/* 2. CORPS DE LA MODALE : 2 COLONNES (7 cols gauche / 5 cols droite sur lg) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-y-auto min-h-0 divide-y lg:divide-y-0 lg:divide-x divide-border-subtle">
          
          {/* COLONNE GAUCHE (7 cols) : Détails, Documents, Jauge & Scrutin */}
          <section className="lg:col-span-7 p-4 sm:p-space-lg flex flex-col gap-5 sm:gap-space-lg bg-surface-container-lowest overflow-y-auto">
            
            {/* Titre & Contexte du scrutin */}
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-xs font-medium">Bâti &amp; Toiture</span>
                <span className="px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-xs font-medium">Le Presbytère</span>
                <span className="px-2.5 py-0.5 rounded-full bg-sage-soft text-forest-deep font-label-sm text-xs font-semibold">Chantier Prioritaire 2026</span>
              </div>
              <h1 id="modal-roof-title" className="font-headline-lg text-xl sm:text-2xl text-on-surface tracking-tight font-bold text-slate-900 mt-1">
                Réfection Couverture &amp; Isolation Combles Presbytère
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-on-surface-variant text-xs sm:text-sm">
                <span className="font-semibold text-slate-600">Réf. VOTE-2026-04</span>
                <span>•</span>
                <span className="flex items-center gap-1 text-slate-700">
                  <span className="material-symbols-outlined text-[18px] text-primary">account_circle</span>
                  Soumis par <strong>Henri Jamet</strong> (Gérance SCI) le 12 mai 2026
                </span>
              </div>
            </div>

            {/* Description & Objectifs (Annotation 8 : suppression bloc impact financier & subvention) */}
            <div className="flex flex-col gap-3 bg-canvas-slate rounded-xl p-4 border border-border-subtle">
              <h2 className="font-headline-sm text-sm sm:text-base font-bold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-forest-deep text-xl">description</span>
                Description des travaux &amp; Enjeux
              </h2>
              <div className="text-xs sm:text-sm text-on-surface-variant leading-relaxed text-slate-700">
                <MarkdownContent content="Remplacement complet des ardoises vétustes sur le versant Nord du Presbytère, reprise des liteaux et pose d'un isolant en laine de bois haute densité (R=7 m²·K/W). Ce chantier fait suite aux infiltrations constatées lors des pluies d'avril et sécurise la charpente avant les expertises de plâtrerie intérieure." />
              </div>
            </div>

            {/* Documents & Justificatifs rattachés */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <h2 className="font-headline-sm text-sm sm:text-base font-bold text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-forest-deep text-xl">folder_open</span>
                  Documents &amp; Justificatifs rattachés
                </h2>
                <span className="text-xs text-on-surface-variant font-medium">3 pièces certifiées</span>
              </div>

              <div className="flex flex-col gap-2">
                {/* Doc 1 : Devis Éts Josse */}
                <div className="flex items-center justify-between p-3 bg-canvas-slate hover:bg-surface-container transition-colors rounded-xl border border-border-subtle">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-error-container text-error flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-xl">picture_as_pdf</span>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs sm:text-sm font-semibold text-on-surface truncate">
                        Devis-2026-Ets-Josse-Couverture-Presbytere.pdf
                      </span>
                      <span className="text-[11px] text-on-surface-variant">
                        Devis Éts Josse • 4 850,00 € TTC • Garantie décennale • 1.4 Mo
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <button 
                      onClick={() => handleViewDoc('Devis-2026-Ets-Josse-Couverture-Presbytere.pdf', 'Devis réfection toiture Presbytère par les Éts Josse')}
                      className="px-2.5 py-1.5 rounded-lg bg-surface-container-lowest text-primary hover:bg-sage-soft text-xs font-semibold flex items-center gap-1 shadow-xs border border-primary transition-all cursor-pointer" 
                      type="button"
                      title="Consulter sans télécharger"
                    >
                      <span className="material-symbols-outlined text-[15px]">visibility</span>
                      <span>Consulter</span>
                    </button>
                    <button 
                      onClick={() => handleDownloadDoc('Devis-2026-Ets-Josse-Couverture-Presbytere.pdf', 'Devis réfection toiture Presbytère par les Éts Josse')}
                      className="px-2.5 py-1.5 rounded-lg bg-primary text-white hover:bg-forest-deep text-xs font-semibold flex items-center gap-1 shadow-xs transition-all cursor-pointer" 
                      type="button"
                      title="Télécharger une copie"
                    >
                      <span className="material-symbols-outlined text-[15px]">download</span>
                      <span>Télécharger</span>
                    </button>
                  </div>
                </div>

                {/* Doc 2 : Rapport Diagnostic */}
                <div className="flex items-center justify-between p-3 bg-canvas-slate hover:bg-surface-container transition-colors rounded-xl border border-border-subtle">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-error-container text-error flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-xl">picture_as_pdf</span>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs sm:text-sm font-semibold text-on-surface truncate">
                        Rapport-Diagnostic-Infiltrations-Avril2026.pdf
                      </span>
                      <span className="text-[11px] text-on-surface-variant">
                        Constat photos &amp; humidimétrie • 850 Ko
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <button 
                      onClick={() => handleViewDoc('Rapport-Diagnostic-Infiltrations-Avril2026.pdf', 'Rapport technique constat infiltrations pluies avril 2026')}
                      className="px-2.5 py-1.5 rounded-lg bg-surface-container-lowest text-primary hover:bg-sage-soft text-xs font-semibold flex items-center gap-1 shadow-xs border border-primary transition-all cursor-pointer" 
                      type="button"
                      title="Consulter sans télécharger"
                    >
                      <span className="material-symbols-outlined text-[15px]">visibility</span>
                      <span>Consulter</span>
                    </button>
                    <button 
                      onClick={() => handleDownloadDoc('Rapport-Diagnostic-Infiltrations-Avril2026.pdf', 'Rapport technique constat infiltrations pluies avril 2026')}
                      className="px-2.5 py-1.5 rounded-lg bg-primary text-white hover:bg-forest-deep text-xs font-semibold flex items-center gap-1 shadow-xs transition-all cursor-pointer" 
                      type="button"
                      title="Télécharger une copie"
                    >
                      <span className="material-symbols-outlined text-[15px]">download</span>
                      <span>Télécharger</span>
                    </button>
                  </div>
                </div>

                {/* Doc 3 : Extrait PV AG */}
                <div className="flex items-center justify-between p-3 bg-canvas-slate hover:bg-surface-container transition-colors rounded-xl border border-border-subtle">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-error-container text-error flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-xl">picture_as_pdf</span>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs sm:text-sm font-semibold text-on-surface truncate">
                        Extrait-PV-AG-Aout2025-Poutres.pdf
                      </span>
                      <span className="text-[11px] text-on-surface-variant">
                        Mandat cadre &amp; délégation de gérance • 420 Ko
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <button 
                      onClick={() => handleViewDoc('Extrait-PV-AG-Aout2025-Poutres.pdf', 'Extrait du Procès-Verbal de l\'AG d\'août 2025')}
                      className="px-2.5 py-1.5 rounded-lg bg-surface-container-lowest text-primary hover:bg-sage-soft text-xs font-semibold flex items-center gap-1 shadow-xs border border-primary transition-all cursor-pointer" 
                      type="button"
                      title="Consulter sans télécharger"
                    >
                      <span className="material-symbols-outlined text-[15px]">visibility</span>
                      <span>Consulter</span>
                    </button>
                    <button 
                      onClick={() => handleDownloadDoc('Extrait-PV-AG-Aout2025-Poutres.pdf', 'Extrait du Procès-Verbal de l\'AG d\'août 2025')}
                      className="px-2.5 py-1.5 rounded-lg bg-primary text-white hover:bg-forest-deep text-xs font-semibold flex items-center gap-1 shadow-xs transition-all cursor-pointer" 
                      type="button"
                      title="Télécharger une copie"
                    >
                      <span className="material-symbols-outlined text-[15px]">download</span>
                      <span>Télécharger</span>
                    </button>
                  </div>
                </div>
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
                  <span><strong>{pourCount} Pour :</strong> {pourVotes.map(a => a.name.split(' ')[0]).join(', ') || 'Aucun'}</span>
                </div>
                <div className="flex items-center gap-1.5 text-rose-700 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-600 shrink-0"></span>
                  <span><strong>{contreCount} Contre :</strong> {contreVotes.map(a => a.name.split(' ')[0]).join(', ') || 'Aucun'}</span>
                </div>
                <div className="flex items-center gap-1.5 text-amber-rich font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-rich shrink-0"></span>
                  <span><strong>{abstentionCount} Abst. :</strong> {abstentionVotes.map(a => a.name.split(' ')[0]).join(', ') || 'Aucune'}</span>
                </div>
                {reportAgCount > 0 ? (
                  <div className="flex items-center gap-1.5 text-purple-800 font-medium">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-700 shrink-0"></span>
                    <span><strong>{reportAgCount} Report AG :</strong> {reportAgVotes.map(a => a.name.split(' ')[0]).join(', ')}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-400 shrink-0"></span>
                    <span><strong>{attenteCount} En attente :</strong> {attenteVotes.map(a => a.name.split(' ')[0]).join(', ') || 'Aucun'}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 4. TABLEAU NOMINATIF DES 7 ASSOCIÉS ÉPURÉ (Annotations 11 & 12 : suppression Rôle SCI et Remarque) */}
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
                        const isUserRow = associate.id === currentAssociate.id;
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
                                }}`}>
                                  {associate.initials}
                                </div>
                                <span className="font-semibold text-slate-900 truncate">
                                  {associate.name}
                                  {isUserRow && <span className="ml-1.5 text-[10px] text-primary font-bold">(Vous)</span>}
                                </span>
                              </div>
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <div className="flex flex-col sm:flex-row items-end sm:items-center justify-end gap-1.5 sm:gap-3">
                                {associate.vote === 'POUR' && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                    Approuvé
                                  </span>
                                )}
                                {associate.vote === 'CONTRE' && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                    <span className="material-symbols-outlined text-[14px]">cancel</span>
                                    Refusé
                                  </span>
                                )}
                                {associate.vote === 'ABSTENTION' && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                    <span className="material-symbols-outlined text-[14px]">pause_circle</span>
                                    Abstention
                                  </span>
                                )}
                                {(associate.vote === 'REPORT_AG' || associate.vote === 'REPORT_PROCHAINE_AG') && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                                    <span>🏛️</span>
                                    Report AG
                                  </span>
                                )}
                                {associate.vote === 'EN_ATTENTE' && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                    <span className="material-symbols-outlined text-[14px]">schedule</span>
                                    En attente
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

            {/* 5. SECTION DE VOTE SOBRE & DIRECTE EN 1 CLIC (Annotation 13) */}
            <div className="p-4 rounded-xl bg-surface-container-low border border-border-subtle flex flex-col gap-3 shadow-sm">
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
            </div>

          </section>

          {/* COLONNE DROITE (5 cols) : Fil de discussion familial en direct */}
          <aside className="lg:col-span-5 bg-canvas-slate flex flex-col justify-between overflow-hidden">
            
            {/* En-tête fil de discussion */}
            <div className="p-4 bg-surface-container-lowest shadow-sm flex items-center justify-between shrink-0 border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-forest-deep text-2xl">forum</span>
                <div className="flex flex-col">
                  <h2 className="text-xs sm:text-sm font-bold text-on-surface">Fil de discussion familial</h2>
                  <span className="text-[11px] text-on-surface-variant">{messages.length} messages • Transparence des débats</span>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-sage-soft text-forest-deep text-[11px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-forest-deep animate-ping"></span>
                Actif
              </span>
            </div>

            {/* Zone défilable des messages */}
            <div className="p-4 flex-1 overflow-y-auto flex flex-col gap-4 min-h-[300px]">
              {messages.map((msg) => (
                <div key={msg.id} className="flex items-start gap-2.5">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    msg.isGerance ? 'bg-sage-soft text-forest-deep' : 'bg-surface-container-highest text-on-surface'
                  }`}>
                    {msg.initials}
                  </div>
                  <div className="flex flex-col max-w-[85%]">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-xs font-bold text-on-surface">{msg.author}</span>
                      {msg.isGerance && (
                        <span className="px-1.5 py-0.2 rounded bg-sage-border text-forest-deep text-[9px] font-bold">
                          GÉRANCE
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400">{msg.date}</span>
                    </div>
                    <div className="bg-surface-container-lowest p-3 rounded-xl rounded-tl-none shadow-sm text-xs sm:text-sm text-slate-700 leading-normal border border-border-subtle">
                      {msg.content}
                    </div>
                    {/* Réactions */}
                    {(() => {
                      const currentUserName = typeof currentUser === 'string' ? currentUser : (currentUser?.name || 'Henri Jamet');
                      const isOwnMessage = msg.author?.trim().toLowerCase() === currentUserName.trim().toLowerCase();

                      return (
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          {msg.reactions.map((r, idx) => (
                            <button
                              key={idx}
                              type="button"
                              disabled={isOwnMessage}
                              onClick={() => !isOwnMessage && handleToggleReaction(msg.id, r.emoji)}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-lowest text-xs text-on-surface-variant shadow-xs border border-border-subtle transition-colors ${
                                isOwnMessage ? 'cursor-default opacity-85' : 'hover:bg-emerald-50 hover:text-emerald-900 cursor-pointer'
                              }`}
                              title={isOwnMessage ? "Vous ne pouvez pas réagir à votre propre message" : `Réagir avec ${r.emoji}`}
                            >
                              <span>{r.emoji}</span>
                              <span className="text-[10px] font-bold">{r.count}</span>
                            </button>
                          ))}

                          {/* Bouton d'ajout multi-emojis (INTERDIT SUR SES PROPRES MESSAGES) */}
                          {!isOwnMessage && (
                            <div className="relative inline-block">
                              <button
                                type="button"
                                onClick={() => setActiveEmojiPickerMsgId(activeEmojiPickerMsgId === msg.id ? null : msg.id)}
                                className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs transition-colors border border-slate-200 cursor-pointer"
                                title="Ajouter une réaction"
                              >
                                +
                              </button>

                              {/* Popover flottant multi-emojis */}
                              {activeEmojiPickerMsgId === msg.id && (
                                <div className="absolute left-0 bottom-8 z-30 bg-white shadow-xl border border-slate-200 rounded-xl p-1.5 flex gap-1 animate-in zoom-in-95 duration-100">
                                  {CHAT_ALLOWED_EMOJIS.map((emoji) => (
                                    <button
                                      key={emoji}
                                      type="button"
                                      onClick={() => handleToggleReaction(msg.id, emoji)}
                                      className="p-1 hover:bg-emerald-50 rounded text-base cursor-pointer transition-transform hover:scale-125"
                                      title={emoji}
                                    >
                                      {emoji}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>

            {/* Zone de saisie ancrée en bas */}
            <div className="p-3 sm:p-4 bg-surface-container-lowest shadow-md shrink-0 border-t border-border-subtle">
              <form className="flex items-center gap-2" onSubmit={handleSendMessage}>
                <button 
                  aria-label="Joindre un fichier" 
                  className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-primary hover:bg-canvas-slate transition-colors" 
                  type="button"
                  onClick={() => alert("Ajout de pièce jointe réservé aux administrateurs.")}
                >
                  <span className="material-symbols-outlined text-[20px]">attach_file</span>
                </button>
                <div className="relative flex-1">
                  <input 
                    className="w-full h-10 pl-3 pr-8 rounded-xl bg-canvas-slate text-on-surface placeholder:text-outline text-xs sm:text-sm border border-border-subtle focus:outline-none focus:ring-2 focus:ring-forest-deep" 
                    placeholder="Votre message à la famille..." 
                    type="text"
                    value={newMessageText}
                    onChange={(e) => setNewMessageText(e.target.value)}
                  />
                  <button 
                    aria-label="Ajouter un emoji" 
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-primary" 
                    type="button"
                    onClick={() => setNewMessageText(prev => prev + ' 👍')}
                  >
                    <span className="material-symbols-outlined text-[18px]">sentiment_satisfied</span>
                  </button>
                </div>
                <button 
                  className="h-10 px-3.5 rounded-xl bg-forest-deep text-on-primary hover:bg-primary text-xs font-semibold flex items-center justify-center gap-1 transition-colors shadow-sm shrink-0" 
                  type="submit"
                >
                  <span>Envoyer</span>
                  <span className="material-symbols-outlined text-[16px]">send</span>
                </button>
              </form>
            </div>

          </aside>
        </div>
      </div>

      {/* Visionneuse universelle intégrée pour les justificatifs du vote (Annotation 9) */}
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
