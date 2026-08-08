import React, { useState } from 'react';
import {
  FileText, Landmark, ShieldCheck, Download, Copy, Check, Calculator,
  Euro, PieChart, Info, ArrowUpRight, CheckCircle2, UserCheck, AlertCircle, FileCheck
} from 'lucide-react';

export default function AdminPage() {
  const [copiedRib, setCopiedRib] = useState(false);
  const [monthlyContribution, setMonthlyContribution] = useState(50); // default 50 €/month

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

  // Calculations for Simulator
  const totalMonthlyCollected = monthlyContribution * TOTAL_MEMBERS;
  const totalAnnualCollected = totalMonthlyCollected * 12;
  const coveragePercent = Math.min(100, Math.round((totalAnnualCollected / ANNUAL_TOTAL_BUDGET) * 100));
  const annualGap = ANNUAL_TOTAL_BUDGET - totalAnnualCollected;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-200/80 dark:border-slate-800 p-6 sm:p-8 shadow-sm">
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 rounded-full bg-blue-500/10 blur-3xl pointer-events-none"></div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center space-x-2 text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-1">
              <Landmark className="h-4 w-4" />
              <span>Patrimoine & Administration</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Informations Administratives & Financières
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
              Consultez le RIB de la SCI, les statuts, les actes notariés, le bilan financier consolidé (17 157 €/an) et le simulateur de cotisation CCA.
            </p>
          </div>

          <button
            onClick={handleCopyRib}
            className="flex items-center justify-center space-x-2 px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md transition-all shrink-0"
          >
            {copiedRib ? <Check className="h-4 w-4 text-white" /> : <Copy className="h-4 w-4" />}
            <span>{copiedRib ? 'RIB Copié !' : 'Copier le RIB SCI'}</span>
          </button>
        </div>
      </div>

      {/* Grid Section 1: RIB & Financial Summary Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* RIB SCI Card */}
        <div className="lg:col-span-1 bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
                  <Landmark className="h-5 w-5" />
                </div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">RIB de la SCI</h2>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Compte Officiel
              </span>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200/60 dark:border-slate-800">
                <span className="text-[10px] font-sans text-slate-400 uppercase font-bold block mb-0.5">Titulaire du compte</span>
                <span className="font-bold text-slate-900 dark:text-white">{ribData.titulaire}</span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200/60 dark:border-slate-800">
                <span className="text-[10px] font-sans text-slate-400 uppercase font-bold block mb-0.5">IBAN</span>
                <span className="font-bold text-blue-600 dark:text-blue-400 text-sm tracking-wider break-all">{ribData.iban}</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200/60 dark:border-slate-800">
                  <span className="text-[10px] font-sans text-slate-400 uppercase font-bold block mb-0.5">BIC / SWIFT</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{ribData.bic}</span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200/60 dark:border-slate-800">
                  <span className="text-[10px] font-sans text-slate-400 uppercase font-bold block mb-0.5">Banque</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 truncate block">{ribData.banque}</span>
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={handleCopyRib}
            className="mt-6 w-full py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl transition flex items-center justify-center space-x-2"
          >
            <Copy className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span>Copier toutes les informations RIB</span>
          </button>
        </div>

        {/* Financial Breakdown (17 157 € / an) */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
            <div className="flex items-center space-x-2">
              <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400">
                <PieChart className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Bilan Financier Annuel Consolidé</h2>
                <p className="text-xs text-slate-500">Coûts de fonctionnement réels du domaine d'Hellenvilliers</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Réel Consolidé</span>
              <span className="text-xl font-black text-slate-900 dark:text-white">17 157 € / an</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Cost item 1: Jardinier EI PERROT */}
            <div className="p-4 rounded-2xl bg-amber-500/5 dark:bg-amber-950/20 border border-amber-500/20">
              <div className="flex justify-between items-start mb-1">
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">Jardinier (EI PERROT LAURENT)</span>
                <span className="text-xs font-black text-amber-600 dark:text-amber-400">3 900 € TTC/an</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Devis-2025-000002 du 06/02/2025 (3 250 € HT + 650 € TVA = 325 €/mois). Entretien des espaces verts.
              </p>
            </div>

            {/* Cost item 2: Fluides (Eau + Électricité) */}
            <div className="p-4 rounded-2xl bg-blue-500/5 dark:bg-blue-950/20 border border-blue-500/20">
              <div className="flex justify-between items-start mb-1">
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">Fluides (Eau & Électricité)</span>
                <span className="text-xs font-black text-blue-600 dark:text-blue-400">4 835 € / an</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Répartition : 48,81 € (Électricité) + 8,76 € (Eau) = 57,57 € / mois par membre associé.
              </p>
            </div>

            {/* Cost item 3: Assurances & Taxe Foncière */}
            <div className="p-4 rounded-2xl bg-purple-500/5 dark:bg-purple-950/20 border border-purple-500/20">
              <div className="flex justify-between items-start mb-1">
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">Assurances & Taxe Foncière</span>
                <span className="text-xs font-black text-purple-600 dark:text-purple-400">5 422 € / an</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Assurance PNO (Propriétaire Non Occupant) des 2 maisons + Taxe foncière Hellenvilliers.
              </p>
            </div>

            {/* Cost item 4: Maintenance & Divers */}
            <div className="p-4 rounded-2xl bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-500/20">
              <div className="flex justify-between items-start mb-1">
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">Entretien & Réparations</span>
                <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">3 000 € / an</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Petits travaux, ramonage cheminées, révision chaudière fioul et produits d'entretien.
              </p>
            </div>

          </div>
        </div>

      </div>

      {/* Section 2: Simulator of Monthly Contribution (CCA 50 €/mois) */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
              <Calculator className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Simulateur de Cotisation Mensuelle (CCA)</h2>
              <p className="text-xs text-slate-500">Contribution sur le Compte Courant d'Associé pour couvrir le budget SCI</p>
            </div>
          </div>

          <div className="flex items-center space-x-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-2 text-xs">
            <Info className="h-4 w-4 text-indigo-500" />
            <span className="font-semibold text-slate-700 dark:text-slate-300">Objectif Henri : 50 € / mois / membre</span>
          </div>
        </div>

        {/* Preset Scenarios */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={() => setMonthlyContribution(50)}
            className={`p-4 rounded-2xl border text-left transition ${
              monthlyContribution === 50
                ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 ring-2 ring-indigo-500/20'
                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block">Scénario Recommandé</span>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">50 € / mois par membre</h3>
            <p className="text-[11px] text-slate-500 mt-1">Cotisation minimale pour constituer la trésorerie de roulement.</p>
          </button>

          <button
            onClick={() => setMonthlyContribution(204)}
            className={`p-4 rounded-2xl border text-left transition ${
              monthlyContribution === 204
                ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 ring-2 ring-indigo-500/20'
                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">Scénario A (Égalitaire)</span>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">204,25 € / mois (7 membres)</h3>
            <p className="text-[11px] text-slate-500 mt-1">Couverture intégrale à 100% des 17 157 € / an à parts égales.</p>
          </button>

          <button
            onClick={() => setMonthlyContribution(86)}
            className={`p-4 rounded-2xl border text-left transition ${
              monthlyContribution === 86
                ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 ring-2 ring-indigo-500/20'
                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 block">Scénario B (Solidaire)</span>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">85,95 € / mois (5 enfants)</h3>
            <p className="text-[11px] text-slate-500 mt-1">Parents (1 000 €/mois) + solde réparti entre les 5 enfants.</p>
          </button>
        </div>

        {/* Interactive Slider */}
        <div className="bg-slate-50 dark:bg-slate-950 p-6 rounded-2xl border border-slate-200/60 dark:border-slate-800 space-y-4">
          <div className="flex justify-between items-center">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Ajuster la cotisation individuelle mensuelle :
            </label>
            <span className="text-lg font-black text-indigo-600 dark:text-indigo-400">{monthlyContribution} € / mois</span>
          </div>

          <input
            type="range"
            min="0"
            max="250"
            step="5"
            value={monthlyContribution}
            onChange={(e) => setMonthlyContribution(Number(e.target.value))}
            className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />

          {/* Progress Bar & Results Summary */}
          <div className="space-y-2 pt-2">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-slate-600 dark:text-slate-400">
                Total collecté (7 membres) : <strong className="text-slate-900 dark:text-white">{totalAnnualCollected.toLocaleString('fr-FR')} € / an</strong>
              </span>
              <span className={coveragePercent >= 100 ? 'text-emerald-600 dark:text-emerald-400 font-extrabold' : 'text-indigo-600 dark:text-indigo-400 font-extrabold'}>
                {coveragePercent}% du budget couvert
              </span>
            </div>

            <div className="w-full h-3 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden flex">
              <div
                style={{ width: `${coveragePercent}%` }}
                className={`h-full transition-all duration-300 ${coveragePercent >= 100 ? 'bg-emerald-500' : 'bg-indigo-600'}`}
              ></div>
            </div>

            <div className="flex justify-between text-[11px] text-slate-500 pt-1">
              <span>Collecte mensuelle globale : {totalMonthlyCollected} € / mois</span>
              {annualGap > 0 ? (
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  Reste à financer / Apport : {annualGap.toLocaleString('fr-FR')} € / an
                </span>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  Budget annuel 100% couvert ! Trésorerie excédentaire : {Math.abs(annualGap).toLocaleString('fr-FR')} € / an
                </span>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Section 3: Official Documents & Links */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center space-x-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="p-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Bibliothèque de Documents Notariés & Contrats</h2>
            <p className="text-xs text-slate-500">Accès direct aux actes juridiques officiels et devis des prestataires</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          
          {/* Doc 1: Statuts SCI */}
          <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 hover:border-blue-500/40 transition flex items-center justify-between group">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400">
                <FileCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-blue-600 transition">Statuts Constitutifs SCI</h3>
                <p className="text-[10px] text-slate-400">PDF • 1.2 MB • Immatriculation</p>
              </div>
            </div>
            <button
              onClick={() => alert("Ouverture du document Statuts Constitutifs SCI Hellenvilliers")}
              className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-blue-600 transition"
              title="Télécharger"
            >
              <Download className="h-4 w-4" />
            </button>
          </div>

          {/* Doc 2: Devis Jardinier Perrot */}
          <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 hover:border-amber-500/40 transition flex items-center justify-between group">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-amber-600 dark:text-amber-400">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-amber-600 transition">Devis Jardinier EI PERROT</h3>
                <p className="text-[10px] text-slate-400">PDF • Devis n°2025-000002 (3 900 €)</p>
              </div>
            </div>
            <button
              onClick={() => alert("Ouverture du Devis Jardinier EI PERROT LAURENT (3 900 € TTC)")}
              className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-amber-600 transition"
              title="Télécharger"
            >
              <Download className="h-4 w-4" />
            </button>
          </div>

          {/* Doc 3: Compte Rendu Réunion 2026 */}
          <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500/40 transition flex items-center justify-between group">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 transition">PV Réunion Familiale 2026</h3>
                <p className="text-[10px] text-slate-400">PDF • Synthèse des décisions</p>
              </div>
            </div>
            <button
              onClick={() => alert("Ouverture du Procès-Verbal de la Réunion Familiale 2026")}
              className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-emerald-600 transition"
              title="Télécharger"
            >
              <Download className="h-4 w-4" />
            </button>
          </div>

        </div>
      </div>

    </div>
  );
}
