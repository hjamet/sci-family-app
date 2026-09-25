import React from 'react';

/**
 * Download1View
 * Composant d'affichage pur synchronise depuis Google Stitch (download (1).htm).
 * Separation stricte : Recoit les donnees et les callbacks d'actions via props.
 */
export default function Download1View({ onAction, currentUser, data }) {
  return (
    <div className="stitch-view-root font-body-md text-on-surface">
      {/* Rendu visuel Stitch synchronise */}
      <header className="fixed top-0 inset-x-0 z-50 bg-surface-container-lowest/90 backdrop-blur-xl shadow-[0_1px_8px_rgba(6,95,70,0.06)]"><div className="max-w-[1360px] mx-auto px-gutter h-20 flex items-center justify-between gap-gutter"><div className="flex items-center gap-space-md"><img alt="Élégant monogramme géométrique pour la SCI Hellenvilliers avec un blason moderne représentant un toit de manoir normand et la lettre H stylisée, aux teintes bleu marine et or subtil.. Brand logo" className="h-8 w-auto object-contain" src="https://lh3.googleusercontent.com/aida/AEtjO1XPkJA9U7CARtYXRqiCPhIByczBnBdNtGuBGIaMyna0c8Ams8nQu_bL_xLUxSm0ss6S3OHFS_n6B7nd2shejRa7UOjp65THsDhEKTpK_c7vICASOxbWet3Npaq5uEjMp0n1qWBqzcIJLOA643R5lKnnpnipatsdqzLoRZFTH3yd8h6IRXGs4HV3UIq2aiKXLu8bVu7FO6vMLYXv5-ilXUTx3C0CaKLCNIbtx6bjoStN" /><div className="flex flex-col"><span className="font-headline-sm text-headline-sm text-forest-deep tracking-tight leading-none">Domaine d'Hellenvilliers</span></div><div className="hidden xl:flex items-center gap-space-xs pl-space-sm"></div></div><nav className="hidden lg:flex items-center gap-space-xs" data-active-classes="bg-sage-soft text-primary font-bold rounded-DEFAULT"><a aria-current="page" className="px-3 py-2 transition-colors bg-sage-soft text-primary font-bold rounded-DEFAULT" data-path="tableau-de-bord" href="#">Tableau de bord</a><a className="px-3 py-2 text-on-surface-variant hover:text-on-surface font-label-sm text-label-sm transition-colors rounded-DEFAULT hover:bg-canvas-slate" data-path="taches" href="#taches">Tâches</a><a className="px-3 py-2 text-on-surface-variant hover:text-on-surface font-label-sm text-label-sm transition-colors rounded-DEFAULT hover:bg-canvas-slate" data-path="votes" href="#democratie">Votes</a><a className="px-3 py-2 text-on-surface-variant hover:text-on-surface font-label-sm text-label-sm transition-colors rounded-DEFAULT hover:bg-canvas-slate" data-path="administratif" href="#finances-cca">Administratif</a><a className="px-3
      {/* ... suite du rendu complet disponible dans download (1).htm */}
    </div>
  );
}
