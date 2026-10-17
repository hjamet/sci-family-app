import React, { useState, useEffect } from 'react';
import {
  Wallet,
  PiggyBank,
  CheckCircle2,
  Copy,
  Check,
  AlertCircle,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Landmark,
  UserCheck,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  X
} from 'lucide-react';
import { SwanSepaQrCodeSvg } from '../pages/AdminInfoPage';
import {
  fetchMyTreasury,
  fetchAllTreasurySummary,
  runReconciliation,
  fetchUnmatchedReconciliation,
  assignReconciliation
} from '../api';

export default function MemberTreasurySection({
  currentUser,
  isCoordinator = false,
  refreshTrigger = 0,
  onDeclarePayment = null,
  onDeclareExpense = null,
}) {
  const [myTreasury, setMyTreasury] = useState(null);
  const [allTreasury, setAllTreasury] = useState(null);
  const [unmatchedData, setUnmatchedData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReconciling, setIsReconciling] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);
  const [reconciliationNotice, setReconciliationNotice] = useState(null);
  const [selectedAssignments, setSelectedAssignments] = useState({});
  const [isAssigning, setIsAssigning] = useState({});
  const [showHistory, setShowHistory] = useState(false);
  const [isSwanQrModalOpen, setIsSwanQrModalOpen] = useState(false);
  const [activeAdminTab, setActiveAdminTab] = useState('members'); // 'members' | 'reconciliation'

  const loadData = async (autoReconcile = false) => {
    setIsLoading(true);
    try {
      if (autoReconcile) {
        try {
          await runReconciliation();
        } catch (recErr) {
          console.warn('Auto-réconciliation:', recErr.message);
        }
      }
      const myRes = await fetchMyTreasury().catch(() => null);
      if (myRes) setMyTreasury(myRes);

      if (isCoordinator) {
        const [allRes, unmatchRes] = await Promise.all([
          fetchAllTreasurySummary().catch(() => null),
          fetchUnmatchedReconciliation().catch(() => null)
        ]);
        if (allRes) setAllTreasury(allRes);
        if (unmatchRes) setUnmatchedData(unmatchRes);
      }
    } catch (err) {
      console.warn('Erreur chargement trésorerie:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData(false);
  }, [currentUser, isCoordinator]);

  useEffect(() => {
    if (refreshTrigger > 0) {
      loadData(false);
    }
  }, [refreshTrigger]);

  const copyToClipboard = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }).catch(() => {});
  };

  const handleRunReconciliation = async () => {
    setIsReconciling(true);
    setReconciliationNotice(null);
    try {
      const res = await runReconciliation();
      const n1Count = res.level_1_matches ? res.level_1_matches.length : 0;
      const n2Count = res.level_2_pending ? res.level_2_pending.length : 0;
      setReconciliationNotice({
        type: 'success',
        text: `Lettrage terminé : ${n1Count} virement(s) certifié(s) N1, ${n2Count} à vérifier N2.`
      });
      await loadData(false);
    } catch (err) {
      setReconciliationNotice({
        type: 'error',
        text: `Erreur lors du lettrage bancaire : ${err.message || 'Échec du traitement'}`
      });
    } finally {
      setIsReconciling(false);
    }
  };

  const handleAssignTransaction = async (txId) => {
    const memberId = selectedAssignments[txId];
    if (!memberId) {
      alert('Veuillez sélectionner un associé pour ce virement.');
      return;
    }

    setIsAssigning(prev => ({ ...prev, [txId]: true }));
    try {
      await assignReconciliation(txId, memberId, 'Attribué manuellement par Henri');
      await loadData(true);
    } catch (err) {
      alert(`Erreur lors de l'attribution : ${err.message || 'Impossible d\'attribuer'}`);
    } finally {
      setIsAssigning(prev => ({ ...prev, [txId]: false }));
    }
  };

  if (isLoading && !myTreasury && !allTreasury) {
    return (
      <div className="mt-space-md p-6 bg-surface-container-lowest rounded-2xl border border-border-subtle animate-pulse">
        <div className="h-6 w-48 bg-slate-200 dark:bg-slate-700 rounded mb-4" />
        <div className="h-20 bg-slate-100 dark:bg-slate-800 rounded-xl" />
      </div>
    );
  }

  const balance = myTreasury?.balance ?? 0;
  const coveredMonths = myTreasury?.covered_months ?? 0;
  const paymentRef = myTreasury?.payment_reference || `HLV-${(currentUser?.prenom || 'MEMBRE').toUpperCase()}`;
  const isBankActive = myTreasury?.is_bank_active ?? true;
  const iban = myTreasury?.iban || "FR76 1732 8844 0071 5921 5570 591";
  const bic = myTreasury?.bic || "SWNBFR22";
  const entries = myTreasury?.recent_entries || [];

  const totalAppele = entries
    .filter((e) => e.entry_type === 'ECHEANCE')
    .reduce((acc, e) => acc + Math.abs(Number(e.amount || 0)), 0);
  const totalRegle = entries
    .filter((e) => e.entry_type === 'VIREMENT')
    .reduce((acc, e) => acc + Number(e.amount || 0), 0);
  const totalAvances = entries
    .filter((e) => e.entry_type === 'AVANCE')
    .reduce((acc, e) => acc + Number(e.amount || 0), 0);

  return (
    <div className="mt-space-lg space-y-6">
      
      {/* ========================================================================= */}
      {/* CARTE 1 : MA TRÉSORERIE SCI (Pour chaque associé)                        */}
      {/* ========================================================================= */}
      <div className="bg-surface-container-lowest rounded-2xl border border-border-subtle p-space-md shadow-[0_2px_8px_-2px_rgba(6,95,70,0.04),0_6px_20px_-4px_rgba(15,23,42,0.05)] overflow-hidden">
        
        {/* En-tête de carte */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-800 dark:text-emerald-300">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-headline-sm text-base sm:text-lg text-forest-deep font-bold">
                  Ma trésorerie SCI
                </h3>
                {myTreasury?.monthly_contribution === 0 && myTreasury?.is_joint_couple ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-800 border border-slate-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Foyer à jour
                  </span>
                ) : coveredMonths > 0 ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    +{coveredMonths} mois d'avance
                  </span>
                ) : balance === 0 ? (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                    À jour (0 €)
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                    Solde débiteur
                  </span>
                )}
              </div>
              <p className="font-body-md text-xs text-on-surface-variant">
                {myTreasury?.contribution_note ? (
                  <span>{myTreasury.contribution_note}</span>
                ) : (
                  <span>Grand livre de trésorerie individuel à cumul illimité — Quote-part : {myTreasury?.monthly_contribution != null ? `${myTreasury.monthly_contribution.toFixed(2)} €/mois` : '50,00 €/mois'}</span>
                )}
              </p>
            </div>
          </div>

          {/* Solde en gros */}
          <div className="flex items-baseline gap-2 bg-surface-container-low px-4 py-2.5 rounded-xl border border-border-subtle shrink-0">
            <span className="text-xs text-slate-600 font-medium">Solde disponible :</span>
            <span className={`font-mono text-xl sm:text-2xl font-black ${
              balance > 0 ? 'text-emerald-700 dark:text-emerald-400' : balance < 0 ? 'text-rose-700' : 'text-slate-800'
            }`}>
              {balance > 0 ? `+${balance.toFixed(2)}` : balance.toFixed(2)} €
            </span>
          </div>
        </div>

        {/* Synthèse des flux du compte individuel */}
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <span className="text-slate-500 font-medium">Total appelé :</span>
            <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
              {totalAppele > 0 ? `${totalAppele.toFixed(2)} €` : '0,00 €'}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/50 flex items-center justify-between">
            <span className="text-sky-900 dark:text-sky-300 font-medium">Total réglé (virements) :</span>
            <span className="font-mono font-bold text-sky-800 dark:text-sky-300">
              {totalRegle > 0 ? `${totalRegle.toFixed(2)} €` : '0,00 €'}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 flex items-center justify-between">
            <span className="text-emerald-900 dark:text-emerald-300 font-medium">Total avances :</span>
            <span className="font-mono font-bold text-emerald-800 dark:text-emerald-300">
              {totalAvances > 0 ? `${totalAvances.toFixed(2)} €` : '0,00 €'}
            </span>
          </div>
        </div>

        {/* Encadré émeraude officiel du compte Swan unifié avec QR Code cliquable */}
        <div className="mt-3 p-3.5 sm:p-4 bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs text-forest-deep dark:text-emerald-100 shadow-2xs">
          <div className="flex items-start sm:items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 flex items-center justify-center shrink-0">
              <Landmark className="w-5 h-5 text-emerald-800 dark:text-emerald-200" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-bold text-forest-deep dark:text-emerald-100">
                <span>Coordonnées officielles du compte Swan :</span>
                <span className="text-[10px] uppercase font-semibold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-700">
                  Compte Principal
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-slate-700 dark:text-slate-300">
                <span className="font-mono font-bold text-emerald-950 dark:text-emerald-100 text-xs sm:text-sm">
                  {iban}
                </span>
                <span className="font-semibold text-slate-600 dark:text-slate-400">• BIC : {bic}</span>
                <span className="font-semibold text-emerald-800 dark:text-emerald-300">• Réf : {paymentRef}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => copyToClipboard(iban, 'iban')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-emerald-100 dark:hover:bg-slate-800 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 font-semibold shadow-2xs transition-all cursor-pointer text-xs"
            >
              {copiedKey === 'iban' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedKey === 'iban' ? 'Copié !' : "Copier l'IBAN Swan"}</span>
            </button>
            <button
              type="button"
              onClick={() => copyToClipboard(paymentRef, 'ref')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-emerald-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-semibold shadow-2xs transition-all cursor-pointer text-xs"
              title="Copier la référence de virement"
            >
              {copiedKey === 'ref' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedKey === 'ref' ? 'Réf copiée' : 'Réf virement'}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsSwanQrModalOpen(true)}
              className="group p-1 bg-white dark:bg-slate-900 hover:bg-emerald-50 dark:hover:bg-slate-800 border border-emerald-300 dark:border-emerald-700 rounded-lg shadow-2xs transition-all cursor-pointer shrink-0 flex items-center justify-center"
              title="Agrandir le QR Code SEPA EPC pour scanner avec votre application bancaire"
            >
              <SwanSepaQrCodeSvg size={48} className="rounded" />
            </button>
          </div>
        </div>

        {/* Boutons d'action : Déclarer un virement / Déclarer une dépense */}
        {(onDeclarePayment || onDeclareExpense) && (
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            {onDeclarePayment && (
              <button
                type="button"
                onClick={onDeclarePayment}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary hover:bg-forest-deep text-white text-xs font-bold shadow-xs hover:shadow-sm transition-all cursor-pointer"
              >
                <ArrowDownLeft className="w-4 h-4" />
                <span>Déclarer un virement effectué</span>
              </button>
            )}
            {onDeclareExpense && (
              <button
                type="button"
                onClick={onDeclareExpense}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-bold shadow-xs hover:shadow-sm transition-all cursor-pointer"
              >
                <ArrowUpRight className="w-4 h-4 text-amber-600" />
                <span>Déclarer une dépense / avance</span>
              </button>
            )}
          </div>
        )}

        {/* Modale d'agrandissement QR Code SEPA EPC Swan */}
        {isSwanQrModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
            onClick={() => setIsSwanQrModalOpen(false)}
          >
            <div
              className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-emerald-200 dark:border-emerald-800 text-center relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setIsSwanQrModalOpen(false)}
                className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
                title="Fermer"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center justify-center gap-2 mb-2 text-emerald-800 dark:text-emerald-300">
                <span className="material-symbols-outlined text-[24px]">qr_code_2</span>
                <h3 className="font-headline-sm text-base font-bold text-forest-deep dark:text-emerald-100">
                  QR Code SEPA EPC Swan
                </h3>
              </div>
              <p className="text-xs text-on-surface-variant mb-4">
                Scannez ce QR Code avec votre application bancaire pour préparer le virement instantané sur le compte SCI Hellenvilliers.
              </p>
              <div className="bg-white p-3 rounded-xl border border-emerald-200 shadow-inner inline-flex items-center justify-center mx-auto mb-4">
                <SwanSepaQrCodeSvg size={180} />
              </div>
              <div className="text-xs space-y-1 text-slate-700 dark:text-slate-300 font-mono bg-emerald-50/60 dark:bg-emerald-950/40 p-2.5 rounded-lg border border-emerald-200/60">
                <div className="font-bold text-forest-deep dark:text-emerald-200">{iban}</div>
                <div className="text-[11px] text-slate-500">BIC : {bic} • SCI HELLENVILLIERS</div>
                <div className="text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold">Référence : {paymentRef}</div>
              </div>
            </div>
          </div>
        )}

        {/* Bascule pour voir l'historique des écritures individuelles */}
        <div className="mt-4 pt-3 border-t border-border-subtle flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-forest-deep hover:text-primary transition-colors cursor-pointer"
          >
            <span>{showHistory ? 'Masquer le détail de mon grand livre' : `Afficher l'historique des écritures (${entries.length})`}</span>
            {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <span className="text-[11px] text-slate-500 font-mono">
            {entries.length > 0 ? `Dernière opération : ${entries[0].entry_date?.slice(0, 10)}` : 'Aucune opération'}
          </span>
        </div>

        {/* Tableau de l'historique individuel repliable */}
        {showHistory && (
          <div className="mt-3 overflow-x-auto border border-border-subtle rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-surface-container-low text-slate-600 font-semibold uppercase border-b border-border-subtle">
                <tr>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Libellé</th>
                  <th className="py-2.5 px-3 text-right">Montant</th>
                  <th className="py-2.5 px-3 text-right">Solde après</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle font-body-md text-on-surface">
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-6 text-center text-slate-500">
                      Aucune écriture enregistrée pour le moment.
                    </td>
                  </tr>
                ) : (
                  entries.map((e) => (
                    <tr key={e.id} className="hover:bg-canvas-slate/60">
                      <td className="py-2 px-3 whitespace-nowrap text-slate-500 font-mono">
                        {e.entry_date ? e.entry_date.slice(0, 10) : '—'}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          e.entry_type === 'AVANCE'
                            ? 'bg-emerald-100 text-emerald-800'
                            : e.entry_type === 'VIREMENT'
                            ? 'bg-sky-100 text-sky-800'
                            : e.entry_type === 'ECHEANCE'
                            ? 'bg-slate-100 text-slate-700'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {e.entry_type}
                        </span>
                      </td>
                      <td className="py-2 px-3 max-w-xs truncate" title={e.description}>
                        {e.description || 'Opération comptable'}
                      </td>
                      <td className="py-2 px-3 text-right whitespace-nowrap font-mono font-bold">
                        <span className={e.amount > 0 ? 'text-emerald-700' : 'text-rose-700'}>
                          {e.amount > 0 ? `+${e.amount.toFixed(2)}` : e.amount.toFixed(2)} €
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right whitespace-nowrap font-mono text-slate-600">
                        {e.balance_after !== null ? `${e.balance_after.toFixed(2)} €` : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

      </div>

      {/* ========================================================================= */}
      {/* SECTION 2 : VUE TRÉSORERIE SCI ADMINISTRATIVE (Pour Henri / Coordinateur) */}
      {/* ========================================================================= */}
      {isCoordinator && allTreasury && (
        <div className="bg-surface-container-lowest rounded-2xl border border-border-subtle p-space-md shadow-[0_2px_8px_-2px_rgba(6,95,70,0.04),0_6px_20px_-4px_rgba(15,23,42,0.05)] space-y-4">
          
          {/* Header Admin */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border-subtle">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-forest-deep text-white flex items-center justify-center">
                <Landmark className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-headline-sm text-base sm:text-lg text-forest-deep font-bold">
                  Synthèse des Comptes Courants d'Associés (Tous les membres)
                </h3>
                <p className="font-body-md text-xs text-on-surface-variant">
                  Associés à jour : {`${allTreasury.members_up_to_date_count ?? allTreasury.members?.filter(m => m.balance >= 0).length ?? 0}/${allTreasury.members_total_count ?? allTreasury.members?.length ?? 7}`} • Reste à encaisser (échéances émises) : {`${(allTreasury.total_remaining_due ?? Math.abs((allTreasury.members || []).reduce((acc, m) => acc + Math.min(0, m.balance || 0), 0))).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €`} • Crédits d'avances reportables : {`+${(allTreasury.total_advance_credits ?? (allTreasury.members || []).reduce((acc, m) => acc + Math.max(0, m.balance || 0), 0)).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €`} • Cotisations mensuelles attendues : {`${(allTreasury.total_monthly_contributions || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €/mois`}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRunReconciliation}
              disabled={isReconciling}
              className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-forest-deep hover:bg-primary text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isReconciling ? 'animate-spin' : ''}`} />
              <span>{isReconciling ? 'Lettrage...' : 'Actualiser & Lettrer'}</span>
            </button>
          </div>

          {/* Notification feedback de lettrage */}
          {reconciliationNotice && (
            <div className={`p-3 rounded-xl text-xs flex items-center justify-between ${
              reconciliationNotice.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-300'
                : 'bg-rose-50 text-rose-900 border border-rose-300'
            }`}>
              <span className="font-medium">{reconciliationNotice.text}</span>
              <button
                type="button"
                onClick={() => setReconciliationNotice(null)}
                className="text-slate-400 hover:text-slate-600 font-bold ml-2 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Synthèse Trésorerie & Cotisations attendues */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-surface-container-low border border-border-subtle flex items-center justify-between">
              <div>
                <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold block">
                  Associés à jour
                </span>
                <span className="text-xs text-slate-500 mt-0.5 block">
                  Échéances réglées ou couvertes
                </span>
              </div>
              <span className="font-mono text-base font-bold text-emerald-700 dark:text-emerald-400">
                {`${allTreasury.members_up_to_date_count ?? allTreasury.members?.filter(m => m.balance >= 0).length ?? 0}/${allTreasury.members_total_count ?? allTreasury.members?.length ?? 7}`}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-surface-container-low border border-border-subtle flex items-center justify-between">
              <div>
                <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold block">
                  Reste à encaisser (échéances émises)
                </span>
                <span className="text-xs text-slate-500 mt-0.5 block">
                  Soldes débiteurs en attente
                </span>
              </div>
              <span className="font-mono text-base font-bold text-rose-700">
                {`${(allTreasury.total_remaining_due ?? Math.abs((allTreasury.members || []).reduce((acc, m) => acc + Math.min(0, m.balance || 0), 0))).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €`}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-surface-container-low border border-border-subtle flex items-center justify-between">
              <div>
                <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold block">
                  Crédits d'avances reportables
                </span>
                <span className="text-xs text-slate-500 mt-0.5 block">
                  Avances validées au crédit CCA
                </span>
              </div>
              <span className="font-mono text-base font-bold text-emerald-700 dark:text-emerald-400">
                {`+${(allTreasury.total_advance_credits ?? (allTreasury.members || []).reduce((acc, m) => acc + Math.max(0, m.balance || 0), 0)).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €`}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-surface-container-low border border-border-subtle flex items-center justify-between">
              <div>
                <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold block">
                  Cotisations mensuelles attendues
                </span>
                <span className="text-xs text-slate-500 mt-0.5 block">
                  5 × 50 € + 1 000 € (couple parental)
                </span>
              </div>
              <span className="font-mono text-base font-bold text-forest-deep">
                {`${(allTreasury.total_monthly_contributions || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €/mois`}
              </span>
            </div>
          </div>

          {/* Onglets Admin */}
          <div className="flex items-center gap-2 border-b border-border-subtle pb-1">
            <button
              type="button"
              onClick={() => setActiveAdminTab('members')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeAdminTab === 'members'
                  ? 'bg-forest-deep text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Soldes de tous les associés ({allTreasury?.members?.length || 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveAdminTab('reconciliation')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeAdminTab === 'reconciliation'
                  ? 'bg-forest-deep text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>Virements à vérifier</span>
              {(unmatchedData?.pending_verification?.length || 0) > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-400 text-amber-950 font-black">
                  {unmatchedData.pending_verification.length}
                </span>
              )}
            </button>
          </div>

          {/* Onglet 1 : Soldes de tous les membres */}
          {activeAdminTab === 'members' && (
            <div className="overflow-x-auto border border-border-subtle rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-surface-container-low text-slate-600 font-semibold uppercase border-b border-border-subtle">
                  <tr>
                    <th className="py-2.5 px-3">Associé</th>
                    <th className="py-2.5 px-3 text-right">Quote-part</th>
                    <th className="py-2.5 px-3 text-right">Solde Actuel</th>
                    <th className="py-2.5 px-3 text-center">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle font-body-md text-on-surface">
                  {allTreasury?.members?.map((m) => {
                    const isMaman = (m.monthly_contribution === 0 || m.monthly_contribution < 1) && m.is_joint_couple;
                    const isFrederic = m.monthly_contribution > 500 && m.is_joint_couple;
                    return (
                      <tr key={m.member_id} className="hover:bg-canvas-slate/60">
                        <td className="py-2.5 px-3 font-bold text-forest-deep">
                          <div>{m.member_name}</div>
                          {m.is_joint_couple && (
                            <div className="text-[10px] font-normal text-slate-500">
                              {isFrederic ? 'Foyer parental (couple)' : 'Foyer parental (avec Frédéric)'}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                          <div>{m.monthly_contribution.toFixed(2)} €/mois</div>
                          {m.is_joint_couple && (
                            <div className="text-[10px] text-slate-500 font-sans">
                              {isFrederic ? 'Quote-part commune couple' : 'Incluse avec Frédéric (1 000 €)'}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold">
                          <span className={m.balance > 0 ? 'text-emerald-700' : m.balance < 0 ? 'text-rose-700' : 'text-slate-600'}>
                            {m.balance > 0 ? `+${m.balance.toFixed(2)}` : m.balance.toFixed(2)} €
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            isMaman
                              ? 'bg-slate-50 text-slate-700 border border-slate-200'
                              : m.balance > 0
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : m.balance < 0
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-slate-50 text-slate-600 border border-slate-200'
                          }`}>
                            {isMaman ? 'À jour' : m.balance > 0 ? 'Créditeur' : m.balance < 0 ? 'Débiteur' : 'À jour'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Onglet 2 : Rapprochement & Virements non lettrés */}
          {activeAdminTab === 'reconciliation' && (
            <div className="space-y-4">
              
              {/* File Niveau 2 : Détection par nom émetteur */}
              {unmatchedData?.pending_verification && unmatchedData.pending_verification.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-900 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                    <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>
                      Virements identifiés par nom émetteur (Niveau 2) — Validation d'attribution requise :
                    </span>
                  </div>

                  <div className="space-y-2">
                    {unmatchedData.pending_verification.map((tx) => (
                      <div
                        key={tx.id}
                        className="p-3 bg-white dark:bg-slate-900 border border-amber-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-slate-500">{tx.booking_date}</span>
                            <span className="font-bold text-slate-800 text-sm">{tx.debtor_name || 'Émetteur inconnu'}</span>
                            <span className="font-mono text-sm font-black text-emerald-700">+{tx.amount.toFixed(2)} €</span>
                          </div>
                          <p className="text-xs text-slate-500 truncate mt-0.5">
                            Motif : {tx.remittance_information || 'Aucun motif fourni'}
                          </p>
                          {tx.candidate_member_prenom && (
                            <span className="inline-block mt-1 text-[11px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-semibold">
                              Correspondance suggérée : {tx.candidate_member_prenom}
                            </span>
                          )}
                        </div>

                        {/* Attribution manuelle */}
                        <div className="flex items-center gap-2 shrink-0">
                          <select
                            value={selectedAssignments[tx.id] || tx.candidate_member_id || ''}
                            onChange={(e) => setSelectedAssignments({ ...selectedAssignments, [tx.id]: Number(e.target.value) })}
                            className="h-8 px-2.5 bg-slate-50 border border-slate-300 rounded text-xs font-medium focus:outline-none focus:border-primary"
                          >
                            <option value="">Sélectionner associé...</option>
                            {allTreasury?.members?.map((m) => (
                              <option key={m.member_id} value={m.member_id}>
                                {m.member_name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => handleAssignTransaction(tx.id)}
                            disabled={isAssigning[tx.id]}
                            className="h-8 px-3 rounded bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>{isAssigning[tx.id] ? 'Attribution...' : 'Valider'}</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Virements totalement non reconnus */}
              {unmatchedData?.unmatched && unmatchedData.unmatched.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-700">
                    Autres encaissements non réconciliés :
                  </div>
                  <div className="space-y-2">
                    {unmatchedData.unmatched.map((tx) => (
                      <div
                        key={tx.id}
                        className="p-3 bg-surface-container-low border border-border-subtle rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-slate-500">{tx.booking_date}</span>
                            <span className="font-bold text-slate-800 text-xs">{tx.debtor_name || 'Émetteur non renseigné'}</span>
                            <span className="font-mono text-xs font-bold text-emerald-700">+{tx.amount.toFixed(2)} €</span>
                          </div>
                          <p className="text-[11px] text-slate-500 truncate mt-0.5">
                            {tx.remittance_information || 'Aucun motif'}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <select
                            value={selectedAssignments[tx.id] || ''}
                            onChange={(e) => setSelectedAssignments({ ...selectedAssignments, [tx.id]: Number(e.target.value) })}
                            className="h-8 px-2.5 bg-white border border-slate-300 rounded text-xs font-medium focus:outline-none focus:border-primary"
                          >
                            <option value="">Sélectionner associé...</option>
                            {allTreasury?.members?.map((m) => (
                              <option key={m.member_id} value={m.member_id}>
                                {m.member_name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => handleAssignTransaction(tx.id)}
                            disabled={isAssigning[tx.id] || !selectedAssignments[tx.id]}
                            className="h-8 px-3 rounded bg-forest-deep hover:bg-primary text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
                          >
                            <span>Attribuer</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Aucun virement en attente */}
              {(!unmatchedData?.pending_verification || unmatchedData.pending_verification.length === 0) &&
               (!unmatchedData?.unmatched || unmatchedData.unmatched.length === 0) && (
                <div className="p-8 text-center bg-surface-container-low rounded-xl border border-border-subtle text-xs text-slate-500 space-y-1">
                  <ShieldCheck className="w-8 h-8 text-emerald-600 mx-auto mb-1" />
                  <p className="font-bold text-slate-800 text-sm">Tous les virements bancaires sont lettrés</p>
                  <p>Aucun encaissement en attente de vérification manuelle.</p>
                </div>
              )}

            </div>
          )}

        </div>
      )}

    </div>
  );
}
