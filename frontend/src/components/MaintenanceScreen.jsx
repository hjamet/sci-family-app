import React from 'react';
import { Wrench, ShieldCheck } from 'lucide-react';

export default function MaintenanceScreen({ onEnableBypass }) {
  return (
    <div className="min-h-[100dvh] bg-[#f7f6f2] text-[#1f2937] flex items-center justify-center p-6 font-sans">
      <div className="max-w-md w-full bg-white rounded-2xl border border-[#e5e3dc] shadow-xl overflow-hidden">
        <div className="bg-[#1e3a2f] px-7 py-6 border-b-[3px] border-[#b89047]">
          <div className="text-[11px] uppercase tracking-[2px] text-[#d4af37] font-bold mb-1">
            Domaine d&apos;Hellenvilliers
          </div>
          <h1 className="font-serif text-2xl font-bold text-white m-0">
            SCI Familiale
          </h1>
        </div>

        <div className="p-7 text-center space-y-5">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200/70 flex items-center justify-center text-[#1e3a2f]">
            <Wrench className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <h2 className="font-serif text-xl font-bold text-[#1e3a2f]">
              Maintenance en cours
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Henri est actuellement en train d&apos;améliorer les e-mails de notification et plusieurs fonctionnalités du portail.
            </p>
            <p className="text-sm text-slate-500 leading-relaxed">
              Tout sera de nouveau accessible très prochainement. Merci pour votre patience !
            </p>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-700/70" />
            <span>Vos données et réservations sont en sécurité.</span>
          </div>

          {onEnableBypass && (
            <div className="pt-2">
              <button
                type="button"
                onClick={onEnableBypass}
                className="text-[11px] text-slate-400 hover:text-[#1e3a2f] underline underline-offset-2 transition-colors cursor-pointer"
              >
                Accès maintenance (Henri)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
