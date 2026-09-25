import React, { useState } from 'react';
import {
  Landmark, TrendingUp, Receipt, Wallet, X, Download,
  FileSpreadsheet, Calendar, User, ShieldCheck, CheckCircle2,
  ArrowUpRight, ArrowDownLeft, Building2, Sparkles, Check
} from 'lucide-react';

export const FINANCIAL_OPERATIONS = [
  {
    id: 'op-1',
    date: '15/01/2026',
    label: 'Police Multirisque PNO Bâtiments Presbytère & Rosing (N° Pol. 984210)',
    member_tiers: 'AXA Assurances',
    type: 'Prélèvement SEPA',
    category: 'Sortie',
    amount: -630.00,
    cumulative_balance: -630.00,
    status: 'Exécuté'
  },
  {
    id: 'op-2',
    date: '12/05/2026',
    label: 'Acompte 30% Élagage de sécurité Allée des Chênes & Entretien du Parc',
    member_tiers: 'EI PERROT PAYSAGE',
    type: 'Virement Émis',
    category: 'Sortie',
    amount: -1170.00,
    cumulative_balance: -1800.00,
    status: 'Exécuté'
  },
  {
    id: 'op-3',
    date: '03/06/2026',
    label: 'Remise en route estivale, révision filtration & traitement régulé',
    member_tiers: 'DECLERCQ PISCINES (Avance Frédéric Jamet)',
    type: 'Remboursé en CCA',
    category: 'Sortie',
    amount: -650.00,
    cumulative_balance: -2450.00,
    status: 'Exécuté'
  },
  {
    id: 'op-4',
    date: '31/12/2026',
    label: 'Cotisation CCA Annuelle — Frédéric Jamet (12 mensualités)',
    member_tiers: 'Frédéric Jamet',
    type: 'Virement Mensuel Auto',
    category: 'Entrée',
    amount: 600.00,
    cumulative_balance: -1850.00,
    status: 'Réglé'
  },
  {
    id: 'op-5',
    date: '31/12/2026',
    label: 'Cotisation CCA Annuelle — Élisabeth Jamet (12 mensualités)',
    member_tiers: 'Élisabeth Jamet',
    type: 'Virement Mensuel Auto',
    category: 'Entrée',
    amount: 600.00,
    cumulative_balance: -1250.00,
    status: 'Réglé'
  },
  {
    id: 'op-6',
    date: '31/12/2026',
    label: 'Cotisation CCA Annuelle — Henri Jamet (12 mensualités)',
    member_tiers: 'Henri Jamet',
    type: 'Virement Auto CA',
    category: 'Entrée',
    amount: 600.00,
    cumulative_balance: -650.00,
    status: 'Réglé'
  },
  {
    id: 'op-7',
    date: '31/12/2026',
    label: 'Cotisation CCA Annuelle — Joséphine Jamet (12 mensualités)',
    member_tiers: 'Joséphine Jamet',
    type: 'Virement Permanent',
    category: 'Entrée',
    amount: 600.00,
    cumulative_balance: -50.00,
    status: 'Réglé'
  },
  {
    id: 'op-8',
    date: '31/12/2026',
    label: 'Cotisation CCA Annuelle — Eugénie Jamet (12 mensualités)',
    member_tiers: 'Eugénie Jamet',
    type: 'Virement Permanent',
    category: 'Entrée',
    amount: 600.00,
    cumulative_balance: 550.00,
    status: 'Réglé'
  },
  {
    id: 'op-9',
    date: '31/12/2026',
    label: 'Cotisation CCA Annuelle — Hortense Jamet (12 mensualités)',
    member_tiers: 'Hortense Jamet',
    type: 'Virement Permanent',
    category: 'Entrée',
    amount: 600.00,
    cumulative_balance: 1150.00,
    status: 'Réglé'
  },
  {
    id: 'op-10',
    date: '31/12/2026',
    label: 'Cotisation CCA Annuelle — Marguerite Jamet (12 mensualités)',
    member_tiers: 'Marguerite Jamet',
    type: 'Virement Permanent',
    category: 'Entrée',
    amount: 600.00,
    cumulative_balance: 1750.00,
    status: 'Réglé'
  }
];

export const ASSOCIATES_CONTRIBUTIONS = [
  { initials: 'FJ', name: 'Frédéric Jamet', frequency: 'Virement Mensuel Auto', schedule: '12 / 12 mensualités', total: 600.00, status: 'Réglé' },
  { initials: 'ÉJ', name: 'Élisabeth Jamet', frequency: 'Virement Mensuel Auto', schedule: '12 / 12 mensualités', total: 600.00, status: 'Réglé' },
  { initials: 'HJ', name: 'Henri Jamet', frequency: 'Virement Auto Crédit Agricole', schedule: '12 / 12 mensualités', total: 600.00, status: 'Réglé' },
  { initials: 'JJ', name: 'Joséphine Jamet', frequency: 'Virement Permanent', schedule: '12 / 12 mensualités', total: 600.00, status: 'Réglé' },
  { initials: 'EJ', name: 'Eugénie Jamet', frequency: 'Virement Permanent', schedule: '12 / 12 mensualités', total: 600.00, status: 'Réglé' },
  { initials: 'HO', name: 'Hortense Jamet', frequency: 'Virement Permanent', schedule: '12 / 12 mensualités', total: 600.00, status: 'Réglé' },
  { initials: 'MJ', name: 'Marguerite Jamet', frequency: 'Virement Permanent', schedule: '12 / 12 mensualités', total: 600.00, status: 'Réglé' }
];

export const EXPENSES_CHARGES = [
  {
    id: 'exp-1',
    vendor: 'EI PERROT PAYSAGE',
    type: 'Virement Émis',
    description: 'Acompte 30% Élagage de sécurité Allée des Chênes & Entretien du Parc',
    date: 'Payé le 12/05/2026',
    method: 'Débit Compte SCI CA',
    amount: 1170.00,
    taxDetail: 'TTC (TVA 10%)',
    icon: 'forest'
  },
  {
    id: 'exp-2',
    vendor: 'AXA ASSURANCES',
    type: 'Prélèvement SEPA',
    description: 'Police Multirisque PNO Bâtiments Presbytère & Rosing (N° Pol. 984210)',
    date: 'Échéance annuelle 15/01/2026',
    method: 'Couverture reconduite',
    amount: 630.00,
    taxDetail: 'TTC (Net de taxe)',
    icon: 'security'
  },
  {
    id: 'exp-3',
    vendor: 'DECLERCQ PISCINES',
    type: 'Remboursé en CCA',
    description: 'Remise en route estivale, révision filtration & traitement régulé',
    date: 'Avance Frédéric Jamet',
    method: 'Régularisé CCA le 03/06/2026',
    amount: 650.00,
    taxDetail: 'TTC (TVA 20%)',
    icon: 'pool'
  }
];

export default function FinancialLedgerModal({ isOpen, onClose, initialTab = 'grand_livre' }) {
  const [activeTab, setActiveTab] = useState(initialTab);

  if (!isOpen) return null;

  const handleExportCsv = () => {
    const headers = ["Date", "Libelle", "Membre_Tiers", "Type", "Montant_EUR", "Solde_Cumule_EUR"];
    const rows = FINANCIAL_OPERATIONS.map(op => [
      `"${op.date}"`,
      `"${op.label.replace(/"/g, '""')}"`,
      `"${op.member_tiers.replace(/"/g, '""')}"`,
      `"${op.type}"`,
      op.amount.toFixed(2),
      op.cumulative_balance.toFixed(2)
    ]);
    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map(r => r.join(";"))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "grand_livre_operations_sci_hellenvilliers_2026.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadPdf = () => {
    window.print ? window.print() : alert("Impression du relevé bancaire de la SCI...");
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
                Détail des Opérations Financières & Flux de Trésorerie
              </h2>
            </div>

          </div>
          <button
            onClick={onClose}
            aria-label="Fermer la fenêtre"
            className="self-start md:self-center w-10 h-10 rounded-2xl bg-white hover:bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center shadow-sm border border-slate-200 transition-colors"
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sélecteurs d'onglets ergonomiques (Parité 1:1 Stitch) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-slate-100/80 p-2 border-b border-slate-200 text-left">
          
          {/* Onglet 1: Grand Livre Général */}
          <button
            onClick={() => setActiveTab('grand_livre')}
            className={`flex flex-col p-3 rounded-2xl transition-all ${
              activeTab === 'grand_livre'
                ? 'bg-white text-emerald-950 shadow-sm border border-slate-200 font-bold'
                : 'bg-transparent text-slate-600 hover:bg-white/60'
            }`}
            type="button"
          >
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Grand Livre Général</span>
            <span className="text-base sm:text-lg font-black text-emerald-900 flex items-center justify-between mt-1">
              10 Opérations
              <Receipt className="w-4 h-4 text-emerald-600" />
            </span>
            <span className="text-[11px] text-emerald-700 font-semibold mt-0.5">Structure 6 colonnes auditée</span>
          </button>

          {/* Onglet 2: Entrées & Cotisations */}
          <button
            onClick={() => setActiveTab('entrees')}
            className={`flex flex-col p-3 rounded-2xl transition-all ${
              activeTab === 'entrees'
                ? 'bg-white text-emerald-950 shadow-sm border border-slate-200 font-bold'
                : 'bg-transparent text-slate-600 hover:bg-white/60'
            }`}
            type="button"
          >
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Entrées & Cotisations</span>
            <span className="text-base sm:text-lg font-black text-emerald-900 flex items-center justify-between mt-1">
              +4 200,00 €
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </span>
            <span className="text-[11px] text-emerald-700 font-semibold mt-0.5">7 associés à jour (100%)</span>
          </button>

          {/* Onglet 3: Sorties & Charges */}
          <button
            onClick={() => setActiveTab('sorties')}
            className={`flex flex-col p-3 rounded-2xl transition-all ${
              activeTab === 'sorties'
                ? 'bg-white text-emerald-950 shadow-sm border border-slate-200 font-bold'
                : 'bg-transparent text-slate-600 hover:bg-white/60'
            }`}
            type="button"
          >
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Sorties & Charges</span>
            <span className="text-base sm:text-lg font-black text-amber-700 flex items-center justify-between mt-1">
              -2 450,00 €
              <Receipt className="w-4 h-4 text-amber-600" />
            </span>
            <span className="text-[11px] text-slate-500 font-medium mt-0.5">3 factures d'entretien réglées</span>
          </button>

          {/* Onglet 4: Solde Net de Période */}
          <button
            onClick={() => setActiveTab('synthese')}
            className={`flex flex-col p-3 rounded-2xl transition-all ${
              activeTab === 'synthese'
                ? 'bg-white text-emerald-950 shadow-sm border border-slate-200 font-bold'
                : 'bg-transparent text-slate-600 hover:bg-white/60'
            }`}
            type="button"
          >
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Solde Net de Période</span>
            <span className="text-base sm:text-lg font-black text-emerald-900 flex items-center justify-between mt-1">
              +1 750,00 €
              <Wallet className="w-4 h-4 text-emerald-600" />
            </span>
            <span className="text-[11px] text-slate-500 font-medium mt-0.5">Trésorerie disponible saine</span>
          </button>
        </div>

        {/* Corps de la Modale défilant */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-6 bg-slate-50/50">
          
          {/* ========================================================================= */}
          {/* PANNEAU 1 : GRAND LIVRE GÉNÉRAL (COLONNES Date, Libellé, Membre/Tiers, Type, Montant, Solde cumulé) */}
          {/* ========================================================================= */}
          {activeTab === 'grand_livre' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-emerald-600" />
                    <span>Journal Général des Écritures Bancaires (Exercice 2026)</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Traçabilité chronologique complète des débits et crédits sur le compte Crédit Agricole dédié.
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200">
                  {FINANCIAL_OPERATIONS.length} Écritures Validées
                </span>
              </div>

              {/* TABLEAU DES OPÉRATIONS FINANCIÈRES ALIGNÉ SUR STITCH */}
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
                      {FINANCIAL_OPERATIONS.map((op) => {
                        const isIncome = op.amount > 0;
                        return (
                          <tr key={op.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3 px-4 font-mono font-medium text-slate-500 whitespace-nowrap">
                              {op.date}
                            </td>
                            <td className="py-3 px-4 font-semibold text-slate-900 max-w-xs">
                              {op.label}
                            </td>
                            <td className="py-3 px-4 text-slate-700 font-medium">
                              <span className="inline-flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-600/40"></span>
                                {op.member_tiers}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center whitespace-nowrap">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                isIncome
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : 'bg-amber-50 text-amber-800 border border-amber-200'
                              }`}>
                                {op.type}
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
                          Solde Net de Clôture (Exercice 2026)
                        </td>
                        <td className="py-3.5 px-4 text-right tabular-nums text-emerald-800 font-black">
                          +1 750,00 €
                        </td>
                        <td className="py-3.5 px-4 text-right tabular-nums text-emerald-950 font-black text-sm">
                          +1 750,00 €
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* PANNEAU 2 : ENTRÉES & CCA (Ventilation des 7 associés - zéro encadré verbeux, zéro badge Solde Positif) */}
          {/* ========================================================================= */}
          {activeTab === 'entrees' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    <span>Apports en Compte Courant d'Associé (CCA 2026)</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Cotisations mensuelles de 50 € par associé conformément à l'accord familial du 8 août 2026.
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200">
                  7/7 Associés à jour
                </span>
              </div>

              {/* TABLEAU DES 7 ASSOCIÉS ALIGNÉ STITCH (SANS ENCADRÉ VERBEUX, SANS BADGE SOLDE POSITIF) */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-100/80 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
                        <th className="py-3 px-4">Associé Partenaire</th>
                        <th className="py-3 px-4">Fréquence & Canal</th>
                        <th className="py-3 px-4 text-center">Échéances 2026</th>
                        <th className="py-3 px-4 text-right">Total Versé</th>
                        <th className="py-3 px-4 text-center">Statut Juridique</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {ASSOCIATES_CONTRIBUTIONS.map((assoc, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-bold text-slate-900 flex items-center gap-2.5">
                            <span className="w-7 h-7 rounded-full bg-emerald-800 text-white flex items-center justify-center font-bold text-[11px] shadow-sm">
                              {assoc.initials}
                            </span>
                            {assoc.name}
                          </td>
                          <td className="py-3 px-4 text-slate-600 font-medium">
                            {assoc.frequency}
                          </td>
                          <td className="py-3 px-4 text-center font-semibold text-emerald-800">
                            {assoc.schedule}
                          </td>
                          <td className="py-3 px-4 text-right font-black text-slate-900 tabular-nums">
                            {assoc.total.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-[11px] inline-flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                              {assoc.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100/90 font-bold text-slate-900 border-t-2 border-slate-200 text-xs">
                        <td className="py-3.5 px-4 text-left" colSpan={3}>
                          Total des Apports Associés Recouvrés
                        </td>
                        <td className="py-3.5 px-4 text-right tabular-nums text-emerald-800 font-black text-sm">
                          4 200,00 €
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {/* Badge redondant "Solde Positif" supprimé conformément au design Stitch */}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* PANNEAU 3 : SORTIES & CHARGES (3 Dépenses Réelles Conformes aux Votes d'AG) */}
          {/* ========================================================================= */}
          {activeTab === 'sorties' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-50/80 p-4 rounded-2xl border border-amber-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-amber-950">
                      3 Dépenses Réelles Conformes aux Votes d'AG
                    </h4>
                    <p className="text-xs text-amber-800">
                      Factures acquittées par la SCI ou régularisées via compte courant d'associé.
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-amber-800 uppercase block">Total Sorties</span>
                  <p className="text-lg font-black text-amber-900 tabular-nums">2 450,00 € TTC</p>
                </div>
              </div>

              {/* 3 Cartes de Dépenses Réelles */}
              <div className="space-y-3">
                {EXPENSES_CHARGES.map((exp) => (
                  <div
                    key={exp.id}
                    className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="w-11 h-11 rounded-2xl bg-slate-100 text-emerald-800 flex items-center justify-center shrink-0 border border-slate-200">
                        <Receipt className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h5 className="text-sm font-black text-slate-900">{exp.vendor}</h5>
                          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            exp.type === 'Remboursé en CCA'
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          }`}>
                            {exp.type}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">{exp.description}</p>
                        <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-500 font-medium">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" /> {exp.date}
                          </span>
                          <span className="flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5 text-slate-400" /> {exp.method}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right self-end md:self-center">
                      <span className="text-base sm:text-lg font-black text-slate-900 tabular-nums block">
                        {exp.amount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                      </span>
                      <span className="text-[10px] font-bold text-slate-400">{exp.taxDetail}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* PANNEAU 4 : SYNTHÈSE & SOLDE NET (KPIs & Jauge d'Absorption) */}
          {/* ========================================================================= */}
          {activeTab === 'synthese' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between text-emerald-700">
                    <span className="text-xs font-bold uppercase tracking-wider">Total Encaissé</span>
                    <ArrowDownLeft className="w-5 h-5 text-emerald-600" />
                  </div>
                  <p className="text-2xl font-black text-emerald-800 my-2 tabular-nums">+4 200,00 €</p>
                  <p className="text-xs text-slate-500">100% des apports des 7 associés perçus.</p>
                </div>

                <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between text-amber-700">
                    <span className="text-xs font-bold uppercase tracking-wider">Total Décaissé</span>
                    <ArrowUpRight className="w-5 h-5 text-amber-600" />
                  </div>
                  <p className="text-2xl font-black text-amber-700 my-2 tabular-nums">-2 450,00 €</p>
                  <p className="text-xs text-slate-500">Parc (1 170 €), Assurance (630 €), Piscine (650 €).</p>
                </div>

                <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between text-emerald-900">
                    <span className="text-xs font-bold uppercase tracking-wider">Excédent d'Exercice</span>
                    <Wallet className="w-5 h-5 text-emerald-700" />
                  </div>
                  <p className="text-2xl font-black text-emerald-950 my-2 tabular-nums font-bold">+1 750,00 €</p>
                  <p className="text-xs text-emerald-800 font-medium">Réserve de liquidités conservée au Crédit Agricole.</p>
                </div>

              </div>

              {/* Jauge d'absorption budgétaire (Parité 1:1 Stitch) */}
              <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-extrabold text-emerald-950">
                    Taux de Couverture & Absorption des Charges
                  </span>
                  <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                    58,3% des flux engagés
                  </span>
                </div>

                <div className="w-full bg-slate-100 h-6 rounded-full overflow-hidden flex shadow-inner">
                  <div className="bg-emerald-800 h-full transition-all" style={{ width: '27.8%' }} title="Paysage (1 170 € - 27.8%)"></div>
                  <div className="bg-amber-600 h-full transition-all" style={{ width: '15.0%' }} title="Assurance (630 € - 15.0%)"></div>
                  <div className="bg-teal-600 h-full transition-all" style={{ width: '15.5%' }} title="Piscine (650 € - 15.5%)"></div>
                  <div className="bg-emerald-400 h-full transition-all" style={{ width: '41.7%' }} title="Trésorerie Disponible (1 750 € - 41.7%)"></div>
                </div>

                <div className="flex items-center justify-between text-slate-600 text-xs pt-1 flex-wrap gap-2">
                  <span className="flex items-center gap-1.5 font-medium">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-800 inline-block"></span> PERROT Paysage (27,8%)
                  </span>
                  <span className="flex items-center gap-1.5 font-medium">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-600 inline-block"></span> AXA Assurances (15,0%)
                  </span>
                  <span className="flex items-center gap-1.5 font-medium">
                    <span className="w-2.5 h-2.5 rounded-full bg-teal-600 inline-block"></span> DECLERCQ Piscines (15,5%)
                  </span>
                  <span className="flex items-center gap-1.5 font-medium">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block"></span> Trésorerie Nette Disponible (41,7%)
                  </span>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Pied de Modale & Boutons d'Action Clairs (Boutons Signature Stitch) */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 sm:p-5 border-t border-slate-200 bg-white">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={handleDownloadPdf}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-white hover:bg-emerald-50 text-emerald-800 font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors border-2 border-emerald-700"
              type="button"
            >
              <Download className="w-4 h-4 text-emerald-700" />
              <span>Télécharger le relevé bancaire PDF</span>
            </button>
            <button
              onClick={handleExportCsv}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors border-2 border-slate-300"
              type="button"
            >
              <FileSpreadsheet className="w-4 h-4 text-slate-600" />
              <span>Exporter en CSV / Excel</span>
            </button>
          </div>
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-2 transition-colors border border-slate-200"
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
