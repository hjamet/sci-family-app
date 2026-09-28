import React, { useState, useRef, useEffect } from 'react';

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
 * Extraction et normalisation en tableau des choix de vote (support choix unique & multiple)
 */
export const parseVotesArray = (raw) => {
  if (!raw || raw === 'EN_ATTENTE') return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === 'object' && raw !== null) {
    const val = raw.vote ?? raw.choice ?? raw.value;
    return parseVotesArray(val);
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === 'EN_ATTENTE') return [];
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.filter(Boolean);
      } catch (_) {}
    }
    return [trimmed];
  }
  return [];
};

/**
 * Vérifie si un vote (unique ou tableau) contient une option donnée
 */
export const hasVotedForOption = (associateVote, optValue) => {
  const votes = parseVotesArray(associateVote);
  const target = String(optValue).trim().toUpperCase();
  return votes.some(v => {
    const vStr = String(v).trim().toUpperCase();
    if (vStr === target) return true;
    if (['POUR', 'OUI'].includes(target) && ['POUR', 'OUI'].includes(vStr)) return true;
    if (['CONTRE', 'NON'].includes(target) && ['CONTRE', 'NON'].includes(vStr)) return true;
    if (['BLANC', 'ABSTENTION'].includes(target) && ['BLANC', 'ABSTENTION'].includes(vStr)) return true;
    if (['REPORT_AG', 'REPORT_PROCHAINE_AG', 'DEMANDE_AG', 'REPORT AG'].includes(target) && ['REPORT_AG', 'REPORT_PROCHAINE_AG', 'DEMANDE_AG', 'REPORT AG'].includes(vStr)) return true;
    return false;
  });
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
 * Conforme aux annotations 2, 3 et 11.
 */
export default function WhatsAppPollView({
  project,
  associatesVotes = null,
  currentUser = 'Henri Jamet',
  onCastVote = null,
  isVotingDisabled = false,
  compact = false,
}) {
  const currentUserName = typeof currentUser === 'string'
    ? currentUser
    : (currentUser?.name || currentUser?.prenom || 'Henri Jamet');
  const currentUserLower = currentUserName.toLowerCase();

  // Mode choix unique vs choix multiples (Annotation 11)
  const allowMultipleChoices = Boolean(project?.allow_multiple_choices);

  // Verrouillage optimiste local contre les sauts/rollbacks d'affichage (Annotation 3)
  const [optimisticChoice, setOptimisticChoice] = useState(null);
  const optimisticTimerRef = useRef(null);

  // Nettoyage du timer au démontage
  useEffect(() => {
    return () => {
      if (optimisticTimerRef.current) clearTimeout(optimisticTimerRef.current);
    };
  }, []);

  // 1. Extraire les votes réels
  const rawVotesList = Array.isArray(project?.votes) ? project.votes : [];

  // 2. Mappage des 7 associés avec leurs votes réels
  const associatesWithVotes = STATUTORY_ASSOCIATES.map(assoc => {
    const assocNameLower = assoc.name.toLowerCase();
    const assocFirstLower = assoc.firstName.toLowerCase();
    const isThisCurrentAssociate = (
      currentUserLower.includes(assocFirstLower) ||
      currentUserLower.includes(assocNameLower) ||
      assocNameLower.includes(currentUserLower)
    );

    // Priorité absolue au choix optimiste local pour l'associé connecté (zéro saut d'affichage)
    if (isThisCurrentAssociate && optimisticChoice !== null) {
      const optStr = Array.isArray(optimisticChoice) ? JSON.stringify(optimisticChoice) : String(optimisticChoice);
      return {
        ...assoc,
        vote: optStr,
        date: "À l'instant"
      };
    }

    // Si associatesVotes a été passé explicitement (ex: état local de modale)
    if (Array.isArray(associatesVotes)) {
      const foundInProps = associatesVotes.find(a => a && (a.id === assoc.id || a.name?.toLowerCase() === assocNameLower));
      if (foundInProps && foundInProps.vote && foundInProps.vote !== 'EN_ATTENTE') {
        return {
          ...assoc,
          vote: foundInProps.vote,
          date: foundInProps.date || null
        };
      }
    }

    // Sinon dérivation directe depuis rawVotesList
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

  // Synchronisation avec la confirmation serveur
  useEffect(() => {
    if (optimisticChoice !== null) {
      const matched = rawVotesList.find(v => {
        if (!v) return false;
        const vName = extractVoterName(v).toLowerCase();
        return (
          currentUserLower.includes(vName) ||
          vName.includes(currentUserLower)
        );
      });
      if (matched) {
        const serverChoice = extractVoteChoice(matched);
        const optStr = Array.isArray(optimisticChoice) ? JSON.stringify(optimisticChoice) : String(optimisticChoice);
        if (serverChoice === optStr) {
          setOptimisticChoice(null);
        }
      }
    }
  }, [rawVotesList, associatesVotes]);

  // Associé connecté
  const currentAssociate = associatesWithVotes.find(a => {
    const aName = a.name.toLowerCase();
    const aFirst = a.firstName.toLowerCase();
    return currentUserLower.includes(aFirst) || currentUserLower.includes(aName) || aName.includes(currentUserLower);
  }) || associatesWithVotes[0];

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
      const voters = associatesWithVotes.filter(a => hasVotedForOption(a.vote, optText));
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

    // Options statutaires complémentaires pour scrutin à options
    const blancVoters = associatesWithVotes.filter(a => hasVotedForOption(a.vote, 'BLANC'));
    pollOptions.push({
      id: 'BLANC',
      voteValue: 'BLANC',
      label: 'Vote blanc / Abstention',
      icon: 'circle',
      palette: BLANC_COLOR_PALETTE,
      voters: blancVoters,
      count: blancVoters.length,
    });

    const reportAgVoters = associatesWithVotes.filter(a => hasVotedForOption(a.vote, 'REPORT_AG'));
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
    const pourVoters = associatesWithVotes.filter(a => hasVotedForOption(a.vote, 'POUR'));
    pollOptions.push({
      id: 'POUR',
      voteValue: 'POUR',
      label: 'Approuver le projet (Pour)',
      icon: 'check_circle',
      palette: OPTION_COLOR_PALETTES[0],
      voters: pourVoters,
      count: pourVoters.length,
    });

    const contreVoters = associatesWithVotes.filter(a => hasVotedForOption(a.vote, 'CONTRE'));
    pollOptions.push({
      id: 'CONTRE',
      voteValue: 'CONTRE',
      label: 'Refuser le projet (Contre)',
      icon: 'cancel',
      palette: REFUSAL_COLOR_PALETTE,
      voters: contreVoters,
      count: contreVoters.length,
    });

    const absVoters = associatesWithVotes.filter(a => hasVotedForOption(a.vote, 'ABSTENTION'));
    pollOptions.push({
      id: 'ABSTENTION',
      voteValue: 'ABSTENTION',
      label: "S'abstenir / Vote blanc",
      icon: 'pause_circle',
      palette: BLANC_COLOR_PALETTE,
      voters: absVoters,
      count: absVoters.length,
    });

    const reportAgVoters = associatesWithVotes.filter(a => hasVotedForOption(a.vote, 'REPORT_AG'));
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

  // Total des associés statutaires
  const totalAssociates = 7;

  // Gestion du clic de vote (Annotation 11 : Choix unique vs Choix multiples)
  const handleOptionClick = (clickedOptValue) => {
    if (isVotingDisabled || typeof onCastVote !== 'function') return;

    let nextChoice;
    if (!allowMultipleChoices) {
      // Choix unique : sélectionne cette option exclusivement
      nextChoice = clickedOptValue;
    } else {
      // Choix multiples : toggle de l'option cliquée
      const activeChoice = optimisticChoice !== null ? optimisticChoice : currentAssociate?.vote;
      const currentChoices = parseVotesArray(activeChoice);
      const isAlreadySelected = currentChoices.some(
        c => String(c).trim().toUpperCase() === String(clickedOptValue).trim().toUpperCase()
      );
      let updatedChoices;
      if (isAlreadySelected) {
        updatedChoices = currentChoices.filter(
          c => String(c).trim().toUpperCase() !== String(clickedOptValue).trim().toUpperCase()
        );
      } else {
        updatedChoices = [...currentChoices, clickedOptValue];
      }
      nextChoice = updatedChoices;
    }

    // Verrouillage optimiste instantané (Annotation 3)
    setOptimisticChoice(nextChoice);
    if (optimisticTimerRef.current) clearTimeout(optimisticTimerRef.current);
    optimisticTimerRef.current = setTimeout(() => {
      setOptimisticChoice(null);
    }, 6000);

    onCastVote(nextChoice);
  };

  return (
    <div className={`flex flex-col gap-2.5 w-full ${compact ? 'text-xs' : 'text-sm'}`}>
      {/* Indication subtile du mode de réponse si choix multiples */}
      {allowMultipleChoices && (
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-medium px-1">
          <span className="material-symbols-outlined text-[15px] text-emerald-600">checklist</span>
          <span>Sélectionnez une ou plusieurs options</span>
        </div>
      )}

      {/* Liste des options style Sondage WhatsApp */}
      <div className="flex flex-col gap-2.5">
        {pollOptions.map((opt) => {
          const isSelectedByCurrentUser = hasVotedForOption(currentAssociate?.vote, opt.voteValue);

          // Pourcentage de cette option sur le total statutaire (7 voix)
          const optionPct = Math.round((opt.count / totalAssociates) * 100);

          return (
            <div
              key={opt.id}
              onClick={() => handleOptionClick(opt.voteValue)}
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
                {/* Ligne 1 : Coche WhatsApp + Titre + Nombre de voix */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Coche style WhatsApp : cercle si choix unique, carré arrondi si choix multiples */}
                    <div
                      className={`w-5 h-5 flex items-center justify-center shrink-0 transition-colors ${
                        allowMultipleChoices ? 'rounded-md' : 'rounded-full'
                      } ${
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

                    {/* Annotation 2 : Le badge textuel « Votre choix » est définitivement supprimé, la coche verte suffit */}
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
                      <span>{allowMultipleChoices ? 'Ajouter' : 'Choisir'}</span>
                      <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Annotation 3 : Le bloc gris de participation div.bg-canvas-slate.dark:bg-slate-900/60 est supprimé, redondant avec le design WhatsApp */}
    </div>
  );
}
