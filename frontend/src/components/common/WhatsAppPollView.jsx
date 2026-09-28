import React from 'react';

/**
 * 7 Associés statutaires canoniques de la SCI Hellenvilliers
 */
export const STATUTORY_ASSOCIATES = [
  { id: 'henri', name: 'Henri Jamet', firstName: 'Henri', role: 'Gérance SCI', isGerance: true, initials: 'HJ', avatarBg: 'bg-emerald-700 text-white' },
  { id: 'josephine', name: 'Joséphine Jamet', firstName: 'Joséphine', role: 'Associée', isGerance: false, initials: 'JJ', avatarBg: 'bg-purple-700 text-white' },
  { id: 'hortense', name: 'Hortense Jamet', firstName: 'Hortense', role: 'Associée', isGerance: false, initials: 'HJ', avatarBg: 'bg-rose-600 text-white' },
  { id: 'marguerite', name: 'Marguerite Jamet', firstName: 'Marguerite', role: 'Associée', isGerance: false, initials: 'MJ', avatarBg: 'bg-amber-600 text-white' },
  { id: 'eugenie', name: 'Eugénie Jamet', firstName: 'Eugénie', role: 'Associée', isGerance: false, initials: 'EJ', avatarBg: 'bg-teal-600 text-white' },
  { id: 'elisabeth', name: 'Élisabeth Jamet', firstName: 'Élisabeth', role: 'Associée', isGerance: false, initials: 'EJ', avatarBg: 'bg-blue-700 text-white' },
  { id: 'frederic', name: 'Frédéric Jamet', firstName: 'Frédéric', role: 'Associé', isGerance: false, initials: 'FJ', avatarBg: 'bg-slate-700 text-white' },
];

/**
 * Extraction sécurisée du nom de votant
 */
export const extractVoterName = (v) => {
  if (!v) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'object') {
    if (typeof v.user_name === 'string') return v.user_name.trim();
    if (typeof v.author === 'string') return v.author.trim();
    if (typeof v.name === 'string') return v.name.trim();
    if (typeof v.user === 'string') return v.user.trim();
    if (v.user && typeof v.user === 'object') {
      return (v.user.name || v.user.prenom || v.user.username || '').trim();
    }
    if (v.member && typeof v.member === 'object') {
      return (v.member.name || v.member.prenom || '').trim();
    }
  }
  return '';
};

/**
 * Extraction sécurisée du choix de vote
 */
export const extractVoteChoice = (v) => {
  if (!v) return '';
  const raw = v.vote ?? v.choice ?? v.value ?? (typeof v === 'string' ? v : '');
  return String(raw || '').trim();
};

/**
 * Résolution de l'associé statutaire correspondant à un votant
 */
export const matchAssociate = (voterIdentifier) => {
  const clean = String(voterIdentifier || '').toLowerCase().trim();
  if (!clean) return null;
  return STATUTORY_ASSOCIATES.find(a => {
    const aName = a.name.toLowerCase();
    const aFirst = a.firstName.toLowerCase();
    const aId = a.id.toLowerCase();
    return clean === aId || clean === aFirst || clean.includes(aName) || aName.includes(clean) || clean.includes(aFirst);
  }) || null;
};

/**
 * Palette de couleurs riches et soignées pour les options de vote style WhatsApp
 */
const OPTION_COLOR_PALETTES = [
  {
    key: 'emerald',
    border: 'border-emerald-300 dark:border-emerald-700/60',
    selectedBorder: 'border-emerald-600 dark:border-emerald-500 ring-2 ring-emerald-500/20',
    barBg: 'bg-emerald-500',
    barFill: 'bg-emerald-100 dark:bg-emerald-950/60',
    lightBg: 'bg-emerald-50/60 dark:bg-emerald-950/30',
    textColor: 'text-emerald-950 dark:text-emerald-100',
    accentText: 'text-emerald-700 dark:text-emerald-300',
    radioActive: 'bg-emerald-600 border-emerald-600 text-white',
  },
  {
    key: 'blue',
    border: 'border-blue-300 dark:border-blue-700/60',
    selectedBorder: 'border-blue-600 dark:border-blue-500 ring-2 ring-blue-500/20',
    barBg: 'bg-blue-500',
    barFill: 'bg-blue-100 dark:bg-blue-950/60',
    lightBg: 'bg-blue-50/60 dark:bg-blue-950/30',
    textColor: 'text-blue-950 dark:text-blue-100',
    accentText: 'text-blue-700 dark:text-blue-300',
    radioActive: 'bg-blue-600 border-blue-600 text-white',
  },
  {
    key: 'purple',
    border: 'border-purple-300 dark:border-purple-700/60',
    selectedBorder: 'border-purple-600 dark:border-purple-500 ring-2 ring-purple-500/20',
    barBg: 'bg-purple-600',
    barFill: 'bg-purple-100 dark:bg-purple-950/60',
    lightBg: 'bg-purple-50/60 dark:bg-purple-950/30',
    textColor: 'text-purple-950 dark:text-purple-100',
    accentText: 'text-purple-700 dark:text-purple-300',
    radioActive: 'bg-purple-600 border-purple-600 text-white',
  },
  {
    key: 'amber',
    border: 'border-amber-300 dark:border-amber-700/60',
    selectedBorder: 'border-amber-600 dark:border-amber-500 ring-2 ring-amber-500/20',
    barBg: 'bg-amber-500',
    barFill: 'bg-amber-100 dark:bg-amber-950/60',
    lightBg: 'bg-amber-50/60 dark:bg-amber-950/30',
    textColor: 'text-amber-950 dark:text-amber-100',
    accentText: 'text-amber-700 dark:text-amber-300',
    radioActive: 'bg-amber-600 border-amber-600 text-white',
  },
  {
    key: 'teal',
    border: 'border-teal-300 dark:border-teal-700/60',
    selectedBorder: 'border-teal-600 dark:border-teal-500 ring-2 ring-teal-500/20',
    barBg: 'bg-teal-500',
    barFill: 'bg-teal-100 dark:bg-teal-950/60',
    lightBg: 'bg-teal-50/60 dark:bg-teal-950/30',
    textColor: 'text-teal-950 dark:text-teal-100',
    accentText: 'text-teal-700 dark:text-teal-300',
    radioActive: 'bg-teal-600 border-teal-600 text-white',
  },
];

const REFUSAL_COLOR_PALETTE = {
  key: 'rose',
  border: 'border-rose-300 dark:border-rose-700/60',
  selectedBorder: 'border-rose-600 dark:border-rose-500 ring-2 ring-rose-500/20',
  barBg: 'bg-rose-500',
  barFill: 'bg-rose-100 dark:bg-rose-950/60',
  lightBg: 'bg-rose-50/60 dark:bg-rose-950/30',
  textColor: 'text-rose-950 dark:text-rose-100',
  accentText: 'text-rose-700 dark:text-rose-300',
  radioActive: 'bg-rose-600 border-rose-600 text-white',
};

const BLANC_COLOR_PALETTE = {
  key: 'slate',
  border: 'border-slate-300 dark:border-slate-700/60',
  selectedBorder: 'border-slate-600 dark:border-slate-500 ring-2 ring-slate-500/20',
  barBg: 'bg-slate-400',
  barFill: 'bg-slate-100 dark:bg-slate-900/60',
  lightBg: 'bg-slate-50 dark:bg-slate-900/30',
  textColor: 'text-slate-800 dark:text-slate-200',
  accentText: 'text-slate-600 dark:text-slate-400',
  radioActive: 'bg-slate-600 border-slate-600 text-white',
};

const REPORT_AG_COLOR_PALETTE = {
  key: 'purple-royal',
  border: 'border-purple-300 dark:border-purple-700/60',
  selectedBorder: 'border-purple-700 dark:border-purple-500 ring-2 ring-purple-500/20',
  barBg: 'bg-purple-700',
  barFill: 'bg-purple-100 dark:bg-purple-950/60',
  lightBg: 'bg-purple-50/70 dark:bg-purple-950/40',
  textColor: 'text-purple-950 dark:text-purple-100',
  accentText: 'text-purple-800 dark:text-purple-300',
  radioActive: 'bg-purple-700 border-purple-700 text-white',
};

/**
 * Composant Sondage Style WhatsApp
 * Affiche chaque option avec barre de progression proportionnelle, nombre de voix et avatars des votants.
 */
export default function WhatsAppPollView({
  project,
  associatesVotes = null,
  currentUser = 'Henri Jamet',
  onCastVote = null,
  isVotingDisabled = false,
  compact = false,
  showPendingVoters = true,
  showQuorumNotice = true,
}) {
  const currentUserName = typeof currentUser === 'string'
    ? currentUser
    : (currentUser?.name || currentUser?.prenom || 'Henri Jamet');
  const currentUserLower = currentUserName.toLowerCase();

  // 1. Extraire les votes réels
  const rawVotesList = Array.isArray(project?.votes) ? project.votes : [];

  // 2. Mappage des 7 associés avec leurs votes réels
  const associatesWithVotes = STATUTORY_ASSOCIATES.map(assoc => {
    // Si associatesVotes a été passé explicitement (ex: état local de modale)
    if (Array.isArray(associatesVotes)) {
      const foundInProps = associatesVotes.find(a => a && (a.id === assoc.id || a.name?.toLowerCase() === assoc.name.toLowerCase()));
      if (foundInProps && foundInProps.vote && foundInProps.vote !== 'EN_ATTENTE') {
        return {
          ...assoc,
          vote: foundInProps.vote,
          date: foundInProps.date || null
        };
      }
    }

    // Sinon dérivation directe depuis rawVotesList
    const assocNameLower = assoc.name.toLowerCase();
    const assocFirstLower = assoc.firstName.toLowerCase();
    const matchedVote = rawVotesList.find(v => {
      if (!v) return false;
      const vName = extractVoterName(v).toLowerCase();
      return (
        vName === assoc.id ||
        vName === assocFirstLower ||
        vName === assocNameLower ||
        (vName && assocNameLower.includes(vName)) ||
        (vName && vName.includes(assocFirstLower)) ||
        (v.user_id && v.user_id === assoc.id) ||
        (v.member_id && v.member_id === assoc.id)
      );
    });

    if (matchedVote) {
      return {
        ...assoc,
        vote: extractVoteChoice(matchedVote) || 'EN_ATTENTE',
        date: matchedVote.date || matchedVote.created_at || matchedVote.voted_at || null
      };
    }

    return { ...assoc, vote: 'EN_ATTENTE', date: null };
  });

  // Associe connecté
  const currentAssociate = associatesWithVotes.find(a => {
    const aName = a.name.toLowerCase();
    const aFirst = a.firstName.toLowerCase();
    return currentUserLower.includes(aFirst) || currentUserLower.includes(aName) || aName.includes(currentUserLower);
  }) || associatesWithVotes[0];

  const currentUserVoteChoice = currentAssociate?.vote !== 'EN_ATTENTE' ? currentAssociate?.vote : null;

  // 3. Définir les options du scrutin
  const customOptions = (() => {
    if (Array.isArray(project?.options) && project.options.length > 0) {
      return project.options.filter(Boolean);
    }
    if (typeof project?.options === 'string' && project.options.trim()) {
      try {
        const parsed = JSON.parse(project.options);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed.filter(Boolean);
      } catch (_) {
        const split = project.options.split(',').map(s => s.trim()).filter(Boolean);
        if (split.length > 0) return split;
      }
    }
    return [];
  })();

  const isCustom = customOptions.length > 0;

  // Construction de la liste des items d'options
  const pollOptions = [];

  if (isCustom) {
    customOptions.forEach((optText, idx) => {
      const palette = OPTION_COLOR_PALETTES[idx % OPTION_COLOR_PALETTES.length];
      const voters = associatesWithVotes.filter(a => {
        const v = String(a.vote || '').trim();
        return v && v.toUpperCase() === String(optText).trim().toUpperCase();
      });
      pollOptions.push({
        id: optText,
        voteValue: optText,
        label: optText,
        icon: 'how_to_vote',
        palette,
        voters,
        count: voters.length,
      });
    });

    // Options statutaires complémentaires pour scrutin à choix multiple
    const blancVoters = associatesWithVotes.filter(a => ['BLANC', 'ABSTENTION'].includes(String(a.vote || '').toUpperCase()));
    pollOptions.push({
      id: 'BLANC',
      voteValue: 'BLANC',
      label: 'Vote blanc / Abstention',
      icon: 'circle',
      palette: BLANC_COLOR_PALETTE,
      voters: blancVoters,
      count: blancVoters.length,
    });

    const reportAgVoters = associatesWithVotes.filter(a =>
      ['REPORT_AG', 'REPORT_PROCHAINE_AG', 'DEMANDE_AG', 'REPORT AG'].includes(String(a.vote || '').toUpperCase())
    );
    pollOptions.push({
      id: 'REPORT_AG',
      voteValue: 'REPORT_AG',
      label: 'Demander un débat en Assemblée Générale (AG)',
      icon: 'account_balance',
      palette: REPORT_AG_COLOR_PALETTE,
      voters: reportAgVoters,
      count: reportAgVoters.length,
      isAgVeto: true,
    });
  } else {
    // Scrutin standard Pour / Contre / Abstention / Report AG
    const pourVoters = associatesWithVotes.filter(a => ['POUR', 'OUI'].includes(String(a.vote || '').toUpperCase()));
    pollOptions.push({
      id: 'POUR',
      voteValue: 'POUR',
      label: 'Approuver le projet (Pour)',
      icon: 'check_circle',
      palette: OPTION_COLOR_PALETTES[0],
      voters: pourVoters,
      count: pourVoters.length,
    });

    const contreVoters = associatesWithVotes.filter(a => ['CONTRE', 'NON'].includes(String(a.vote || '').toUpperCase()));
    pollOptions.push({
      id: 'CONTRE',
      voteValue: 'CONTRE',
      label: 'Refuser le projet (Contre)',
      icon: 'cancel',
      palette: REFUSAL_COLOR_PALETTE,
      voters: contreVoters,
      count: contreVoters.length,
    });

    const absVoters = associatesWithVotes.filter(a => ['ABSTENTION', 'BLANC'].includes(String(a.vote || '').toUpperCase()));
    pollOptions.push({
      id: 'ABSTENTION',
      voteValue: 'ABSTENTION',
      label: "S'abstenir / Vote blanc",
      icon: 'pause_circle',
      palette: BLANC_COLOR_PALETTE,
      voters: absVoters,
      count: absVoters.length,
    });

    const reportAgVoters = associatesWithVotes.filter(a =>
      ['REPORT_AG', 'REPORT_PROCHAINE_AG', 'DEMANDE_AG', 'REPORT AG'].includes(String(a.vote || '').toUpperCase())
    );
    pollOptions.push({
      id: 'REPORT_AG',
      voteValue: 'REPORT_AG',
      label: 'Demander un débat en Assemblée Générale (AG)',
      icon: 'account_balance',
      palette: REPORT_AG_COLOR_PALETTE,
      voters: reportAgVoters,
      count: reportAgVoters.length,
      isAgVeto: true,
    });
  }

  // 4. Statistiques globales
  const totalAssociates = 7;
  const totalVotesCast = pollOptions.reduce((acc, opt) => acc + opt.count, 0);
  const participationPct = Math.round((totalVotesCast / totalAssociates) * 100);

  // Associés encore en attente
  const pendingAssociates = associatesWithVotes.filter(a => !a.vote || a.vote === 'EN_ATTENTE');

  // Détection du quorum et du report AG
  const reportAgCount = pollOptions.find(o => o.id === 'REPORT_AG')?.count || 0;
  const pourCount = pollOptions.find(o => o.id === 'POUR')?.count || 0;
  const isAgRequested = reportAgCount > 0;
  const isMajorityReached = pourCount >= 4;

  return (
    <div className={`flex flex-col gap-3 w-full ${compact ? 'text-xs' : 'text-sm'}`}>
      {/* Liste des options style Sondage WhatsApp */}
      <div className="flex flex-col gap-2.5">
        {pollOptions.map((opt) => {
          const isSelectedByCurrentUser = currentUserVoteChoice && (
            currentUserVoteChoice.toUpperCase() === opt.voteValue.toUpperCase() ||
            (['POUR', 'OUI'].includes(currentUserVoteChoice.toUpperCase()) && ['POUR', 'OUI'].includes(opt.voteValue.toUpperCase())) ||
            (['CONTRE', 'NON'].includes(currentUserVoteChoice.toUpperCase()) && ['CONTRE', 'NON'].includes(opt.voteValue.toUpperCase())) ||
            (['BLANC', 'ABSTENTION'].includes(currentUserVoteChoice.toUpperCase()) && ['BLANC', 'ABSTENTION'].includes(opt.voteValue.toUpperCase())) ||
            (['REPORT_AG', 'REPORT_PROCHAINE_AG', 'DEMANDE_AG'].includes(currentUserVoteChoice.toUpperCase()) && ['REPORT_AG', 'REPORT_PROCHAINE_AG'].includes(opt.voteValue.toUpperCase()))
          );

          // Pourcentage de cette option sur le total statutaire (7 voix)
          const optionPct = Math.round((opt.count / totalAssociates) * 100);

          return (
            <div
              key={opt.id}
              onClick={() => {
                if (!isVotingDisabled && typeof onCastVote === 'function') {
                  onCastVote(opt.voteValue);
                }
              }}
              className={`relative overflow-hidden rounded-2xl border p-3 sm:p-3.5 transition-all duration-200 select-none ${
                isSelectedByCurrentUser
                  ? `${opt.palette.selectedBorder} ${opt.palette.lightBg} shadow-xs`
                  : `${opt.palette.border} bg-white dark:bg-slate-900/80 hover:bg-slate-50 dark:hover:bg-slate-800/60 shadow-xs`
              } ${!isVotingDisabled && typeof onCastVote === 'function' ? 'cursor-pointer hover:shadow-md' : ''}`}
            >
              {/* Barre de progression horizontale façon WhatsApp en arrière-plan */}
              <div
                className={`absolute inset-y-0 left-0 transition-all duration-500 pointer-events-none rounded-2xl ${opt.palette.barFill}`}
                style={{ width: `${optionPct}%` }}
              ></div>

              {/* Contenu premier-plan */}
              <div className="relative z-10 flex flex-col gap-2">
                {/* Ligne 1 : Radio / Coche WhatsApp + Titre + Nombre de voix */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Coche / Radio style WhatsApp */}
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                        isSelectedByCurrentUser
                          ? opt.palette.radioActive
                          : 'border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                      }`}
                    >
                      {isSelectedByCurrentUser && (
                        <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>

                    {/* Nom de l'option */}
                    <span className={`font-bold tracking-tight truncate ${opt.palette.textColor} ${compact ? 'text-xs' : 'text-sm sm:text-base'}`}>
                      {opt.label}
                    </span>

                    {/* Badge Votre choix */}
                    {isSelectedByCurrentUser && (
                      <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold border border-emerald-300 dark:border-emerald-700">
                        Votre choix
                      </span>
                    )}
                  </div>

                  {/* Nombre de voix & Pourcentage */}
                  <div className="flex items-center gap-1.5 shrink-0 text-right">
                    <span className={`font-extrabold ${opt.palette.accentText} ${compact ? 'text-xs' : 'text-sm sm:text-base'}`}>
                      {opt.count} {opt.count > 1 ? 'voix' : 'voix'}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
                      ({optionPct}%)
                    </span>
                  </div>
                </div>

                {/* Ligne 2 : Rangée d'avatars miniatures des associés ayant voté pour cette option */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100/80 dark:border-slate-800/80">
                  <div className="flex items-center gap-2 min-w-0">
                    {opt.voters.length > 0 ? (
                      <div className="flex items-center -space-x-1.5 overflow-hidden py-0.5">
                        {opt.voters.map((voter) => (
                          <div
                            key={voter.id}
                            title={`${voter.name} (${voter.role}) : ${opt.label}${voter.date ? ` • ${voter.date}` : ''}`}
                            className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-[10px] font-bold ring-2 ring-white dark:ring-slate-900 shadow-xs cursor-help shrink-0 ${voter.avatarBg}`}
                          >
                            {voter.initials}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">
                        Aucun vote
                      </span>
                    )}

                    {/* Prénoms des votants en clair */}
                    {opt.voters.length > 0 && (
                      <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 truncate">
                        {opt.voters.map(v => v.firstName).join(', ')}
                      </span>
                    )}
                  </div>

                  {/* Action interactive rapide */}
                  {!isVotingDisabled && typeof onCastVote === 'function' && !isSelectedByCurrentUser && (
                    <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                      <span>Choisir</span>
                      <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pied du sondage : Participation globale & Associés en attente */}
      <div className="bg-canvas-slate dark:bg-slate-900/60 rounded-xl p-3 border border-border-subtle flex flex-col gap-2 mt-1">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px] text-primary">poll</span>
            Participation : {totalVotesCast} / {totalAssociates} voix exprimées ({participationPct}%)
          </span>

          {showQuorumNotice && (
            <span
              className={`font-bold px-2 py-0.5 rounded-full text-[11px] ${
                isAgRequested
                  ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                  : isMajorityReached
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
              }`}
            >
              {isAgRequested
                ? '🏛️ Débat en AG sollicité (Veto suspensif)'
                : isMajorityReached
                ? '✓ Majorité qualifiée acquise (≥ 4/7)'
                : 'En cours de délibération'}
            </span>
          )}
        </div>

        {/* Associés en attente de vote */}
        {showPendingVoters && (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-800/60 text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">hourglass_empty</span>
              En attente ({pendingAssociates.length}) :
            </span>
            {pendingAssociates.length > 0 ? (
              <div className="flex items-center gap-1.5 flex-wrap">
                {pendingAssociates.map(assoc => (
                  <span
                    key={assoc.id}
                    title={`${assoc.name} n'a pas encore voté`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-medium"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                    {assoc.firstName}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-emerald-700 dark:text-emerald-400 font-semibold text-[11px]">
                Tous les 7 associés ont voté !
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
