import React, { useState, useEffect, useMemo } from 'react';
import {
  Landmark, TrendingUp, Receipt, Wallet, X, Download,
  FileSpreadsheet, Calendar, User, ShieldCheck, CheckCircle2,
  ArrowUpRight, ArrowDownLeft, Building2, Sparkles, Check, RefreshCw
} from 'lucide-react';
import { fetchBankTransactions, triggerBankSync } from '../api';

export default function FinancialLedgerModal({ isOpen, onClose, initialTab = 'grand_livre' }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const loadTransactions = async () => {
    setIsLoading(true);
    try {
      const data = await fetchBankTransactions({ limit: 200 });
      setTransactions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('Erreur chargement transactions bancaires réelles:', err.message);
      setTransactions([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadTransactions();
    }
  }, [isOpen]);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await triggerBankSync();
      await loadTransactions();
    } catch (err) {
      console.warn('Erreur sync bancaire:', err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  // Calculs dynamiques basés STRICTEMENT sur les transactions réelles
  const entreesList = useMemo(() => transactions.filter((t) => t.amount > 0), [transactions]);
  const sortiesList = useMemo(() => transactions.filter((t) => t.amount < 0), [transactions]);

  const totalEntrees = useMemo(() => entreesList.reduce((acc, t) => acc + t.amount, 0), [entreesList]);
  const totalSorties = useMemo(() => sortiesList.reduce((acc, t) => acc + Math.abs(t.amount), 0), [sortiesList]);
  const soldeNet = useMemo(() => totalEntrees - totalSorties, [totalEntrees, totalSorties]);

  // Calcul du solde cumulé chronologique
  const transactionsWithBalance = useMemo(() => {
    // Les transactions viennent généralement triées par date décroissante
    // Pour calculer le solde cumulé chronologique, on part de la fin ou on calcule en cascade
    const sorted = [...transactions].sort((a, b) => new Date(a.booking_date || 0) - new Date(b.booking_date || 0));
    let running = 0;
    const balanceMap = new Map();
    sorted.forEach((t) => {
      running += t.amount;
      balanceMap.set(t.id || t.transaction_id, running);
    });

    return transactions.map((t) => ({
      ...t,
      cumulative_balance: balanceMap.get(t.id || t.transaction_id) ?? t.amount
    }));
  }, [transactions]);

  if (!isOpen) return null;

  const handleExportCsv = () => {
    if (transactions.length === 0) {
      alert("Aucune transaction bancaire réelle à exporter pour le moment.");
      return;
    }
    const headers = ["Date", "Libelle", "Tiers", "Type", "Montant_EUR", "Solde_Cumule_EUR"];
    const rows = transactionsWithBalance.map((op) => [
      `"${op.booking_date || ''}"`,
      `"${(op.remittance_information || op.category || '').replace(/"/g, '""')}"`,
      `"${(op.creditor_name || op.debtor_name || 'SCI').replace(/"/g, '""')}"`,
      `"${op.amount > 0 ? 'Crédit' : 'Débit'}"`,
      op.amount.toFixed(2),
      (op.cumulative_balance || op.amount).toFixed(2)
    ]);
    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `journal_bancaire_sci_hellenvilliers_${new Date().getFullYear()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadPdf = () => {
    window.print ? window.print() : alert("Impression du relevé bancaire...");
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-slate-200 max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-900">
        
        {/* En-tête Statutaire & Titre */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-5 sm:p-6 bg-slate-50/80 border-b border-slate-200/80">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 shadow-sm border border-emerald-200">
              <Landmark className="w-6 h-6" />
            </div>
            <div className="flex flex-col">
              <h2 className="text-xl sm:text-2xl font-black text-emerald-950 mt-1">
                Détail des Opérations Financières &amp; Flux de Trésorerie
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Données bancaires officielles certifiées via Open Banking DSP2
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start md:self-center">
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              title="Actualiser la liaison bancaire"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-emerald-600' : ''}`} />
              <span>{isSyncing ? 'Synchronisation...' : 'Synchroniser'}</span>
            </button>
            <button
              onClick={onClose}
              aria-label="Fermer la fenêtre"
              className="w-10 h-10 rounded-2xl bg-white hover:bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center shadow-sm border border-slate-200 transition-colors cursor-pointer"
              type="button"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sélecteurs d'onglets ergonomiques (Parité 1:1 Stitch) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-slate-100/80 p-2 border-b border-slate-200 text-left">
          
          {/* Onglet 1: Grand Livre Général */}
          <button
            onClick={() => setActiveTab('grand_livre')}
            className={`flex flex-col p-3 rounded-2xl transition-all cursor-pointer ${
              activeTab === 'grand_livre'
                ? 'bg-white text-emerald-950 shadow-sm border border-slate-200 font-bold'
                : 'bg-transparent text-slate-600 hover:bg-white/60'
            }`}
            type="button"
          >
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Grand Livre Général</span>
            <span className="text-base sm:text-lg font-black text-emerald-900 flex items-center justify-between mt-1">
              {transactions.length} {transactions.length > 1 ? 'Opérations' : 'Opération'}
              <Receipt className="w-4 h-4 text-emerald-600" />
            </span>
            <span className="text-[11px] text-emerald-700 font-semibold mt-0.5">
              {transactions.length > 0 ? 'Écritures réelles' : 'Zéro donnée inventée'}
            </span>
          </button>

          {/* Onglet 2: Entrées & Cotisations */}
          <button
            onClick={() => setActiveTab('entrees')}
            className={`flex flex-col p-3 rounded-2xl transition-all cursor-pointer ${
              activeTab === 'entrees'
                ? 'bg-white text-emerald-950 shadow-sm border border-slate-200 font-bold'
                : 'bg-transparent text-slate-600 hover:bg-white/60'
            }`}
            type="button"
          >
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Entrées &amp; Cotisations</span>
            <span className="text-base sm:text-lg font-black text-emerald-900 flex items-center justify-between mt-1">
              {totalEntrees > 0 ? `+${totalEntrees.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : '0,00 €'}
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </span>
            <span className="text-[11px] text-emerald-700 font-semibold mt-0.5">
              {entreesList.length} encaissement{entreesList.length > 1 ? 's' : ''}
            </span>
          </button>

          {/* Onglet 3: Sorties & Charges */}
          <button
            onClick={() => setActiveTab('sorties')}
            className={`flex flex-col p-3 rounded-2xl transition-all cursor-pointer ${
              activeTab === 'sorties'
                ? 'bg-white text-emerald-950 shadow-sm border border-slate-200 font-bold'
                : 'bg-transparent text-slate-600 hover:bg-white/60'
            }`}
            type="button"
          >
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Sorties &amp; Charges</span>
            <span className="text-base sm:text-lg font-black text-amber-700 flex items-center justify-between mt-1">
              {totalSorties > 0 ? `-${totalSorties.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : '0,00 €'}
              <Receipt className="w-4 h-4 text-amber-600" />
            </span>
            <span className="text-[11px] text-slate-500 font-medium mt-0.5">
              {sortiesList.length} dépense{sortiesList.length > 1 ? 's' : ''}
            </span>
          </button>

          {/* Onglet 4: Solde Net de Période */}
          <button
            onClick={() => setActiveTab('synthese')}
            className={`flex flex-col p-3 rounded-2xl transition-all cursor-pointer ${
              activeTab === 'synthese'
                ? 'bg-white text-emerald-950 shadow-sm border border-slate-200 font-bold'
                : 'bg-transparent text-slate-600 hover:bg-white/60'
            }`}
            type="button"
          >
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Solde Net de Période</span>
            <span className={`text-base sm:text-lg font-black flex items-center justify-between mt-1 ${soldeNet >= 0 ? 'text-emerald-900' : 'text-rose-900'}`}>
              {soldeNet !== 0 ? `${soldeNet >= 0 ? '+' : ''}${soldeNet.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : '0,00 €'}
              <Wallet className="w-4 h-4 text-emerald-600" />
            </span>
            <span className="text-[11px] text-slate-500 font-medium mt-0.5">
              Trésorerie nette constatée
            </span>
          </button>
        </div>

        {/* Corps de la Modale défilant */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-6 bg-slate-50/50">
          
          {/* ========================================================================= */}
          {/* PANNEAU 1 : GRAND LIVRE GÉNÉRAL                                            */}
          {/* ========================================================================= */}
          {activeTab === 'grand_livre' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-emerald-600" />
                    <span>Journal Général des Écritures Bancaires (Exercice 2026)</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Traçabilité chronologique complète des débits et crédits sur le compte Crédit Agricole dédié.
                  </p>
                </div>
                {transactions.length > 0 && (
                  <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200">
                    {transactions.length} Écriture{transactions.length > 1 ? 's' : ''} Enregistrée{transactions.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* ÉTAT VIDE SOMBRE ET ÉLÉGANT (AUCUNE DONNÉE INVENTÉE) */}
              {transactions.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-10 sm:p-14 text-center flex flex-col items-center justify-center shadow-xs">
                  <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-4">
                    <Receipt className="w-8 h-8 text-slate-400" />
                  </div>
                  <h4 className="text-base font-bold text-slate-900">
                    Aucune écriture bancaire enregistrée pour cet exercice.
                  </h4>
                  <p className="text-xs text-slate-500 mt-1.5 max-w-md leading-relaxed">
                    La liaison Open Banking DSP2 est active ou en attente de synchronisation. Aucune transaction n'a encore été enregistrée sur le compte Crédit Agricole dédié pour l'exercice 2026.
                  </p>
                  <button
                    type="button"
                    onClick={handleSync}
                    disabled={isSyncing}
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>Actualiser la liaison bancaire</span>
                  </button>
                </div>
              ) : (
                /* TABLEAU DES OPÉRATIONS FINANCIÈRES RÉELLES */
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-slate-100/80 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
                          <th className="py-3 px-4 text-left font-bold">Date</th>
                          <th className="py-3 px-4 text-left font-bold">Libellé</th>
                          <th className="py-3 px-4 text-left font-bold">Membre/Tiers</th>
                          <th className="py-3 px-4 text-center font-bold">Type</th>
                          <th className="py-3 px-4 text-right font-bold">Montant</th>
                          <th className="py-3 px-4 text-right font-bold">Solde cumulé</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-800">
                        {transactionsWithBalance.map((op) => {
                          const isIncome = op.amount > 0;
                          return (
                            <tr key={op.id || op.transaction_id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3 px-4 font-mono font-medium text-slate-500 whitespace-nowrap">
                                {formatDate(op.booking_date)}
                              </td>
                              <td className="py-3 px-4 font-semibold text-slate-900 max-w-xs">
                                {op.remittance_information || op.category || 'Virement bancaire'}
                              </td>
                              <td className="py-3 px-4 text-slate-700 font-medium">
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-emerald-600/40"></span>
                                  {op.creditor_name || op.debtor_name || 'Compte SCI'}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-center whitespace-nowrap">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                  isIncome
                                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                                }`}>
                                  {isIncome ? 'Crédit' : 'Débit'}
                                </span>
                              </td>
                              <td className={`py-3 px-4 text-right font-bold tabular-nums whitespace-nowrap ${
                                isIncome ? 'text-emerald-700' : 'text-amber-700'
                              }`}>
                                {isIncome ? `+${op.amount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €` : `${op.amount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €`}
                              </td>
                              <td className="py-3 px-4 text-right font-black tabular-nums text-slate-900 whitespace-nowrap">
                                {op.cumulative_balance >= 0
                                  ? `+${op.cumulative_balance.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €`
                                  : `${op.cumulative_balance.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €`}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-100/90 font-bold text-slate-900 border-t-2 border-slate-200 text-xs">
                          <td className="py-3.5 px-4 text-left" colSpan={4}>
                            Solde Net Constaté
                          </td>
                          <td className={`py-3.5 px-4 text-right tabular-nums font-black ${soldeNet >= 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
                            {soldeNet >= 0 ? `+${soldeNet.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €` : `${soldeNet.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €`}
                          </td>
                          <td className="py-3.5 px-4 text-right tabular-nums text-slate-900 font-black text-sm">
                            {soldeNet >= 0 ? `+${soldeNet.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €` : `${soldeNet.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €`}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* PANNEAU 2 : ENTRÉES & COTISATIONS (Transactions Réelles)                    */}
          {/* ========================================================================= */}
          {activeTab === 'entrees' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    <span>Apports &amp; Encaissements Réels</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Crédits bancaires et cotisations constatés sur le compte Crédit Agricole dédié.
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200">
                  {entreesList.length} Écriture{entreesList.length > 1 ? 's' : ''}
                </span>
              </div>

              {entreesList.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center flex flex-col items-center justify-center">
                  <TrendingUp className="w-8 h-8 text-slate-300 mb-3" />
                  <h4 className="text-sm font-bold text-slate-800">
                    Aucun encaissement enregistré pour cet exercice.
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm">
                    Les virements de cotisations ou apports en compte courant apparaîtront dès synchronisation bancaire.
                  </p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-100/80 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Émetteur / Tiers</th>
                        <th className="py-3 px-4">Libellé</th>
                        <th className="py-3 px-4 text-right">Montant Encaissé</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {entreesList.map((op) => (
                        <tr key={op.id || op.transaction_id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">{formatDate(op.booking_date)}</td>
                          <td className="py-3 px-4 font-bold text-slate-900">{op.debtor_name || op.creditor_name || 'Associé'}</td>
                          <td className="py-3 px-4 text-slate-600">{op.remittance_information || 'Virement reçu'}</td>
                          <td className="py-3 px-4 text-right font-black text-emerald-800 tabular-nums">
                            +{op.amount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100/90 font-bold text-slate-900 border-t-2 border-slate-200 text-xs">
                        <td className="py-3.5 px-4 text-left" colSpan={3}>Total des encaissements</td>
                        <td className="py-3.5 px-4 text-right tabular-nums text-emerald-800 font-black text-sm">
                          +{totalEntrees.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* PANNEAU 3 : SORTIES & CHARGES (Transactions Réelles)                        */}
          {/* ========================================================================= */}
          {activeTab === 'sorties' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-amber-600" />
                    <span>Dépenses &amp; Prélèvements Réels</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Débits réels constatés sur le compte Crédit Agricole dédié.
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-amber-800 uppercase block">Total Débits</span>
                  <p className="text-base font-black text-amber-900 tabular-nums">
                    {totalSorties > 0 ? `-${totalSorties.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €` : '0,00 €'}
                  </p>
                </div>
              </div>

              {sortiesList.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center flex flex-col items-center justify-center">
                  <Receipt className="w-8 h-8 text-slate-300 mb-3" />
                  <h4 className="text-sm font-bold text-slate-800">
                    Aucune dépense enregistrée pour cet exercice.
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm">
                    Les règlements de factures, prélèvements ou charges apparaîtront dès qu'ils seront débités.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sortiesList.map((exp) => (
                    <div
                      key={exp.id || exp.transaction_id}
                      className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 hover:shadow-xs transition-shadow"
                    >
                      <div className="flex items-start gap-3.5">
                        <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-800 flex items-center justify-center shrink-0 border border-amber-200">
                          <Receipt className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h5 className="text-sm font-black text-slate-900">{exp.creditor_name || 'Fournisseur / Débit'}</h5>
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                              Débit Bancaire
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 mt-0.5">{exp.remittance_information || 'Règlement bancaire'}</p>
                          <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-500 font-medium">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" /> {formatDate(exp.booking_date)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right self-end md:self-center">
                        <span className="text-base sm:text-lg font-black text-amber-900 tabular-nums block">
                          {exp.amount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* PANNEAU 4 : SYNTHÈSE & SOLDE NET RÉEL                                       */}
          {/* ========================================================================= */}
          {activeTab === 'synthese' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between text-emerald-700">
                    <span className="text-xs font-bold uppercase tracking-wider">Total Encaissé</span>
                    <ArrowDownLeft className="w-5 h-5 text-emerald-600" />
                  </div>
                  <p className="text-2xl font-black text-emerald-800 my-2 tabular-nums">
                    {totalEntrees > 0 ? `+${totalEntrees.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €` : '0,00 €'}
                  </p>
                  <p className="text-xs text-slate-500">{entreesList.length} écriture{entreesList.length > 1 ? 's' : ''} réelle{entreesList.length > 1 ? 's' : ''}.</p>
                </div>

                <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between text-amber-700">
                    <span className="text-xs font-bold uppercase tracking-wider">Total Décaissé</span>
                    <ArrowUpRight className="w-5 h-5 text-amber-600" />
                  </div>
                  <p className="text-2xl font-black text-amber-700 my-2 tabular-nums">
                    {totalSorties > 0 ? `-${totalSorties.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €` : '0,00 €'}
                  </p>
                  <p className="text-xs text-slate-500">{sortiesList.length} dépense{sortiesList.length > 1 ? 's' : ''} constatée{sortiesList.length > 1 ? 's' : ''}.</p>
                </div>

                <div className={`p-5 rounded-2xl border shadow-sm flex flex-col justify-between ${soldeNet >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                  <div className={`flex items-center justify-between ${soldeNet >= 0 ? 'text-emerald-900' : 'text-rose-900'}`}>
                    <span className="text-xs font-bold uppercase tracking-wider">Solde Net de Période</span>
                    <Wallet className="w-5 h-5" />
                  </div>
                  <p className={`text-2xl font-black my-2 tabular-nums font-bold ${soldeNet >= 0 ? 'text-emerald-950' : 'text-rose-950'}`}>
                    {soldeNet !== 0 ? `${soldeNet >= 0 ? '+' : ''}${soldeNet.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €` : '0,00 €'}
                  </p>
                  <p className={`text-xs font-medium ${soldeNet >= 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
                    {transactions.length > 0 ? 'Trésorerie nette constatée en banque.' : 'En attente de relevé bancaire.'}
                  </p>
                </div>

              </div>

              {/* État de synchronisation */}
              <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-2">
                <h4 className="text-sm font-extrabold text-slate-900">
                  Gouvernance des flux bancaires de la SCI
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Toutes les écritures affichées dans ce livre financier proviennent directement de la passerelle DSP2 sécurisée avec le compte Crédit Agricole Normandie dédié.
                  Aucune écriture simulée ou extrapolée n'est admise dans ce registre officiel.
                </p>
              </div>
            </div>
          )}

        </div>

        {/* Pied de Modale & Boutons d'Action */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 sm:p-5 border-t border-slate-200 bg-white">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={handleDownloadPdf}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-white hover:bg-emerald-50 text-emerald-800 font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors border-2 border-emerald-700 cursor-pointer"
              type="button"
            >
              <Download className="w-4 h-4 text-emerald-700" />
              <span>Télécharger le relevé PDF</span>
            </button>
            <button
              onClick={handleExportCsv}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors border-2 border-slate-300 cursor-pointer"
              type="button"
            >
              <FileSpreadsheet className="w-4 h-4 text-slate-600" />
              <span>Exporter en CSV / Excel</span>
            </button>
          </div>
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-2 transition-colors border border-slate-200 cursor-pointer"
            type="button"
          >
            <X className="w-4 h-4" />
            <span>Fermer la fenêtre</span>
          </button>
        </div>

      </div>
    </div>
  );
}
