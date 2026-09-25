import React from 'react';

export default function SejourCutoffMapModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  const cutoffs = [
    {
      id: 'eau',
      title: "Vanne d'Arrêt Générale d'Eau",
      icon: 'water_drop',
      color: 'bg-cyan-50 text-cyan-800 border-cyan-200',
      iconBg: 'bg-cyan-600 text-white',
      location: "Cellier sous l'escalier (Villa Rosing)",
      description: "Robinet quart de tour avec manette rouge sur la colonne montante en cuivre. Tourner à 90° dans le sens horaire pour couper l'arrivée principale de tout le domaine.",
      priority: "Priorité Absolue Fuite"
    },
    {
      id: 'elec',
      title: "Disjoncteur Principal & Linky",
      icon: 'bolt',
      color: 'bg-amber-50 text-amber-800 border-amber-200',
      iconBg: 'bg-amber-600 text-white',
      location: "Vestibule d'entrée (porte gauche)",
      description: "Tableau électrique principal sous placard bois. Gros disjoncteur différentiel 500mA noir et compteur communicant Linky. Basculer le levier rouge vers le bas en cas d'urgence.",
      priority: "Coupure Générale"
    },
    {
      id: 'pac',
      title: "Arrêt d'Urgence PAC Viessmann",
      icon: 'hvac',
      color: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      iconBg: 'bg-emerald-700 text-white',
      location: "Chaufferie (Aile Nord)",
      description: "Bouton coup-de-poing d'arrêt d'urgence situé immédiatement à droite de la porte d'entrée de la chaufferie, et disjoncteur dédié PAC 32A au sous-tableau.",
      priority: "Sécurité Chaufferie"
    },
    {
      id: 'piscine',
      title: "Local Technique Piscine & Klereo",
      icon: 'pool',
      color: 'bg-blue-50 text-blue-800 border-blue-200',
      iconBg: 'bg-blue-600 text-white',
      location: "Annexe jardin (derrière la terrasse)",
      description: "Vanne de vidange gravitaire, vanne 6 voies du filtre à sable et disjoncteur de la pompe de circulation. Coffret Klereo avec interrupteur général ON/OFF.",
      priority: "Hivernage & Hors-Gel"
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-surface-container-lowest border border-border-subtle rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border-subtle pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-surface-container-high text-primary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[28px]">valve</span>
            </div>
            <div>
              <h2 className="font-headline-md text-headline-md text-primary font-bold">
                Plan des Vannes & Coupures d'Urgence
              </h2>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Emplacements exacts des organes de sécurité du Domaine d'Hellenvilliers
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-canvas-slate hover:bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors"
            type="button"
            aria-label="Fermer"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Content list */}
        <div className="space-y-4 my-6">
          {cutoffs.map((item) => (
            <div
              key={item.id}
              className={`p-4 rounded-2xl border ${item.color} shadow-sm transition-all hover:shadow-md`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl ${item.iconBg} flex items-center justify-center shrink-0 shadow-sm`}>
                    <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                  </div>
                  <div>
                    <h3 className="font-headline-sm text-sm font-bold text-on-surface">
                      {item.title}
                    </h3>
                    <span className="text-xs font-semibold text-primary flex items-center gap-1 mt-0.5">
                      <span className="material-symbols-outlined text-[14px]">location_on</span>
                      {item.location}
                    </span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/80 border border-current shrink-0">
                  {item.priority}
                </span>
              </div>
              <p className="text-xs text-on-surface-variant mt-3 leading-relaxed bg-white/60 p-2.5 rounded-xl border border-current/10">
                {item.description}
              </p>
            </div>
          ))}
        </div>

        {/* Footer Note & Button */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border-subtle">
          <div className="flex items-center gap-2 text-xs text-on-surface-variant">
            <span className="material-symbols-outlined text-primary text-[18px]">phone_in_talk</span>
            <span>Astreinte chauffagiste : <strong>02 32 35 12 00</strong></span>
          </div>
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 h-11 rounded-full bg-primary text-white font-label-md text-sm font-semibold hover:bg-forest-deep transition-colors shadow-sm"
            type="button"
          >
            Fermer le plan
          </button>
        </div>

      </div>
    </div>
  );
}
