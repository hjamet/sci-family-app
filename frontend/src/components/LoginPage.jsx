import React, { useState, useEffect } from 'react';
import {
  Home,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  ShieldCheck,
  Key,
  HelpCircle,
  Phone,
  Mail,
  Check,
  Copy,
  X,
  Shield,
  Clock,
  MapPin,
  ExternalLink
} from 'lucide-react';
import { loginUser } from '../api';

// Les 7 associés de la SCI Hellenvilliers selon le cahier des charges officiel
// Ordre canonique : Henri, Joséphine, Hortense, Marguerite, Eugénie, Frédéric, Élisabeth
const FAMILY_MEMBERS = [
  {
    prenom: 'Henri',
    displayLabel: 'Henri Jamet',
    role: 'Coordinateur Général & Gérant',
    shortRole: 'Coordinateur Gérant',
    color: 'from-cyan-500 to-blue-500 text-white',
    accentBorder: 'border-l-cyan-500',
    avatarBg: 'bg-cyan-500 text-white',
    tagBg: 'bg-cyan-50 text-cyan-800 border-cyan-200',
    initial: 'H'
  },
  {
    prenom: 'Joséphine',
    displayLabel: 'Joséphine Jamet',
    role: 'Coordinatrice Adjointe',
    shortRole: 'Coordinatrice Adjointe',
    color: 'from-emerald-500 to-teal-500 text-white',
    accentBorder: 'border-l-emerald-500',
    avatarBg: 'bg-emerald-600 text-white',
    tagBg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    initial: 'J'
  },
  {
    prenom: 'Hortense',
    displayLabel: 'Hortense Jamet',
    role: 'Responsable Espaces Verts & Jardinier',
    shortRole: 'Espaces Verts',
    color: 'from-rose-500 to-pink-500 text-white',
    accentBorder: 'border-l-rose-500',
    avatarBg: 'bg-rose-500 text-white',
    tagBg: 'bg-rose-50 text-rose-800 border-rose-200',
    initial: 'H'
  },
  {
    prenom: 'Marguerite',
    displayLabel: 'Marguerite Jamet',
    role: 'Responsable Équipements & Maison',
    shortRole: 'Équipements',
    color: 'from-purple-500 to-indigo-500 text-white',
    accentBorder: 'border-l-purple-500',
    avatarBg: 'bg-purple-600 text-white',
    tagBg: 'bg-purple-50 text-purple-800 border-purple-200',
    initial: 'M'
  },
  {
    prenom: 'Eugénie',
    displayLabel: 'Eugénie Jamet',
    role: 'Responsable Peintures, Tri & Déco',
    shortRole: 'Peintures & Tri',
    color: 'from-amber-500 to-orange-500 text-white',
    accentBorder: 'border-l-amber-500',
    avatarBg: 'bg-amber-500 text-white',
    tagBg: 'bg-amber-50 text-amber-800 border-amber-200',
    initial: 'E'
  },
  {
    prenom: 'Frédéric',
    displayLabel: 'Frédéric Jamet',
    role: 'Usufruitier • Électricité & Accord Piscine',
    shortRole: 'Usufruitier (Piscine)',
    color: 'from-blue-600 to-indigo-600 text-white',
    accentBorder: 'border-l-blue-500',
    avatarBg: 'bg-blue-600 text-white',
    tagBg: 'bg-blue-50 text-blue-800 border-blue-200',
    initial: 'F'
  },
  {
    prenom: 'Élisabeth',
    displayLabel: 'Élisabeth Jamet (Maman)',
    role: 'Usufruitière • Garante du Patrimoine',
    shortRole: 'Usufruitière (Maman)',
    color: 'from-teal-500 to-cyan-600 text-white',
    accentBorder: 'border-l-teal-500',
    avatarBg: 'bg-teal-600 text-white',
    tagBg: 'bg-teal-50 text-teal-800 border-teal-200',
    initial: 'É'
  },
];

export default function LoginPage({ onLoginSuccess }) {
  // Récupération de l'éventuel dernier associé mémorisé sur la tablette familiale
  const [selectedPrenom, setSelectedPrenom] = useState(() => {
    return localStorage.getItem('sci_last_member') || 'Henri';
  });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Case à cocher "Mémoriser sur cette tablette" (activée par défaut pour faciliter la vie familiale)
  const [rememberTablet, setRememberTablet] = useState(() => {
    return localStorage.getItem('sci_remember_tablet') !== 'false';
  });

  // Modales d'assistance et vadémécum clés
  const [showVademecumModal, setShowVademecumModal] = useState(false);
  const [showAssistanceModal, setShowAssistanceModal] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);

  const handleCopy = (text, key) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2500);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedPrenom) {
      setError('Veuillez sélectionner un membre de la famille.');
      return;
    }
    if (!password) {
      setError('Veuillez saisir votre mot de passe.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Normalisation insensible aux espaces parasites
      const cleanPrenom = selectedPrenom.trim();
      const cleanPassword = password.trim();

      const res = await loginUser(cleanPrenom, cleanPassword);
      if (res && res.access_token) {
        // Mémorisation de la préférence sur la tablette familiale
        if (rememberTablet) {
          localStorage.setItem('sci_remember_tablet', 'true');
          localStorage.setItem('sci_last_member', cleanPrenom);
        } else {
          localStorage.removeItem('sci_remember_tablet');
          localStorage.removeItem('sci_last_member');
        }

        const currentMemberData = FAMILY_MEMBERS.find(m => m.prenom === cleanPrenom);
        onLoginSuccess({
          token: res.access_token,
          user: res.user || {
            prenom: res.prenom || cleanPrenom,
            role: res.role || (currentMemberData ? currentMemberData.role : 'Membre Associé')
          }
        });
      } else {
        throw new Error('Réponse de connexion invalide.');
      }
    } catch (err) {
      console.error('Erreur de connexion:', err);
      setError(err.message || 'Échec de la connexion. Vérifiez votre mot de passe.');
    } finally {
      setLoading(false);
    }
  };

  const currentMember = FAMILY_MEMBERS.find(m => m.prenom === selectedPrenom) || FAMILY_MEMBERS[0];

  return (
    <div className="min-h-screen relative flex flex-col justify-between items-center p-4 sm:p-6 lg:p-8 bg-slate-50 overflow-hidden font-sans text-slate-900">
      
      {/* Orbes d'ambiance vert sauge & émeraude pastel (Palette Version Émeraude) */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-100/60 rounded-full blur-3xl pointer-events-none animate-pulse"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-teal-100/50 rounded-full blur-3xl pointer-events-none animate-pulse delay-1000"></div>
      <div className="absolute top-1/2 right-1/3 w-80 h-80 bg-emerald-50 rounded-full blur-3xl pointer-events-none"></div>

      {/* Carte Container Centrale */}
      <div className="relative w-full max-w-3xl bg-white border border-slate-200 shadow-xl rounded-3xl p-6 sm:p-10 my-auto">
        
        {/* En-tête de bienvenue Version Émeraude */}
        <div className="text-center space-y-3 mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white border-2 border-emerald-600 text-emerald-800 shadow-md shadow-emerald-900/5 ring-4 ring-emerald-50 mb-1">
            <Home className="w-8 h-8 text-emerald-700" />
          </div>
          
          <div>
            <span className="inline-block px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold uppercase tracking-wider mb-2">
              Version Émeraude • Portail Sécurisé
            </span>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
              Viva Hellenvilliers !!
            </h1>
          </div>
          
          <p className="text-sm text-slate-600 font-medium max-w-md mx-auto">
            Portail privé des 7 membres associés de la SCI Familiale. Choisissez votre profil pour accéder à votre espace du domaine.
          </p>
        </div>

        {/* 1. Grille de sélection des 7 associés avec liseré latéral distinctif */}
        <div className="mb-8">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-3 text-center sm:text-left">
            1. Sélectionnez votre profil membre
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
            {FAMILY_MEMBERS.map((member) => {
              const isSelected = selectedPrenom === member.prenom;
              return (
                <button
                  key={member.prenom}
                  type="button"
                  onClick={() => {
                    setSelectedPrenom(member.prenom);
                    setError(null);
                  }}
                  className={`flex flex-col items-center justify-center p-3 rounded-2xl border-2 border-l-4 transition-all duration-200 text-center min-h-[92px] bg-white group cursor-pointer ${member.accentBorder} ${
                    isSelected
                      ? 'ring-2 ring-emerald-600 border-emerald-600 shadow-md scale-[1.03]'
                      : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
                  }`}
                  aria-pressed={isSelected}
                >
                  <div className={`w-10 h-10 rounded-full bg-gradient-to-tr ${member.color} flex items-center justify-center font-black text-sm shadow-sm mb-1.5 group-hover:scale-105 transition-transform`}>
                    {member.initial}
                  </div>
                  <span className={`text-xs font-extrabold truncate w-full ${isSelected ? 'text-emerald-950 font-black' : 'text-slate-900'}`}>
                    {member.prenom}
                  </span>
                  <span className={`text-[10px] font-medium truncate w-full mt-0.5 ${isSelected ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                    {member.shortRole}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Formulaire de mot de passe & Actions */}
        <form onSubmit={handleSubmit} className="space-y-6 max-w-md mx-auto">
          
          {/* Fiche récapitulative du membre actif sélectionné */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-emerald-50/40 border border-emerald-200/80">
            <div className="flex items-center space-x-3">
              <div className={`w-10 h-10 rounded-full bg-gradient-to-tr ${currentMember.color} flex items-center justify-center font-bold text-sm shadow-sm`}>
                {currentMember.initial}
              </div>
              <div>
                <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">Connexion en tant que</p>
                <p className="text-sm font-black text-emerald-950">{currentMember.displayLabel || currentMember.prenom}</p>
              </div>
            </div>
            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-white text-emerald-900 border-2 border-emerald-600 shadow-sm">
              <ShieldCheck className="w-3.5 h-3.5 mr-1 text-emerald-700" />
              {currentMember.role}
            </span>
          </div>

          {/* Champ de saisie du mot de passe (Cible tactile >= 52px) */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
              2. Saisissez votre mot de passe
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4 text-emerald-700" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoFocus
                className="w-full pl-10 pr-12 py-3.5 rounded-xl bg-white border-2 border-slate-300 text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-600 transition-all font-mono min-h-[52px]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-emerald-800 transition-colors min-h-[52px] w-12 justify-center"
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Option Mémoriser sur cette tablette (Contexte familial partagé - Cible tactile >= 52px) */}
          <div className="flex items-center space-x-3 p-3 rounded-xl bg-slate-50/80 border border-slate-200/80 min-h-[52px]">
            <input
              type="checkbox"
              id="rememberTablet"
              checked={rememberTablet}
              onChange={(e) => setRememberTablet(e.target.checked)}
              className="w-5 h-5 rounded border-2 border-emerald-600 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-0 cursor-pointer"
            />
            <label htmlFor="rememberTablet" className="text-xs font-semibold text-slate-700 cursor-pointer select-none">
              Mémoriser sur cette tablette <span className="text-[11px] font-normal text-slate-500 block sm:inline sm:ml-1">(maintient la session active pour la famille)</span>
            </label>
          </div>

          {/* Conteneur d'affichage des erreurs */}
          {error && (
            <div className="p-3.5 rounded-xl bg-red-50 border-2 border-red-200 text-red-800 text-xs font-semibold flex items-center gap-2.5 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Boutons d'Action — Tous à fond blanc pur (bg-white) avec bordure nette 2px et hauteur tactile >= 52px */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            
            {/* Bouton Primaire : Connexion Sécurisée */}
            <button
              type="submit"
              disabled={loading}
              className="flex-1 min-h-[52px] py-3.5 px-6 rounded-xl bg-white border-2 border-emerald-600 hover:bg-emerald-50 active:bg-emerald-100 text-emerald-900 font-semibold text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center space-x-2 group"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className="font-semibold text-emerald-900">Connexion en cours...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4 text-emerald-700" />
                  <span className="font-semibold text-emerald-900">Accéder au Portail SCI</span>
                  <ArrowRight className="w-4 h-4 text-emerald-700 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>

            {/* Bouton Secondaire : Vadémécum & Clés pour prestataires & artisans */}
            <button
              type="button"
              onClick={() => setShowVademecumModal(true)}
              className="min-h-[52px] py-3.5 px-5 rounded-xl bg-white border-2 border-slate-300 hover:bg-slate-50 active:bg-slate-100 text-slate-700 font-semibold text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-1 transition-all flex items-center justify-center space-x-2 group"
              title="Consignes pratiques, digicodes et boîtes à clés"
            >
              <Key className="w-4 h-4 text-slate-600 group-hover:rotate-12 transition-transform" />
              <span className="font-semibold text-slate-700">Vadémécum & Clés</span>
            </button>
          </div>

        </form>

        {/* 3. Bandeau d'assistance gérant reliant directement à Henri Jamet */}
        <div className="mt-8 pt-6 border-t border-slate-200">
          <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-3.5 text-center sm:text-left">
              <div className="w-11 h-11 rounded-xl bg-white border-2 border-emerald-600 flex items-center justify-center text-emerald-800 flex-shrink-0 shadow-sm">
                <HelpCircle className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-emerald-950">
                  Assistance Gérance & Support Membres
                </h4>
                <p className="text-xs text-slate-600 mt-0.5">
                  Un problème d'identifiant ou un accès artisan urgent ? Contactez directement <strong className="text-emerald-900 font-bold">Henri Jamet</strong> (Gérant & Coordinateur).
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <a
                href="mailto:henri.jamet@example.com?subject=Assistance%20Connexion%20SCI%20Hellenvilliers"
                className="flex-1 sm:flex-none inline-flex items-center justify-center min-h-[52px] px-4 py-2.5 rounded-xl bg-white border-2 border-emerald-600 text-emerald-900 hover:bg-emerald-50 font-semibold text-xs transition-all shadow-sm group"
              >
                <Mail className="w-4 h-4 mr-2 text-emerald-700 group-hover:scale-110 transition-transform" />
                <span>Écrire à Henri</span>
              </a>
              <button
                type="button"
                onClick={() => setShowAssistanceModal(true)}
                className="flex-1 sm:flex-none inline-flex items-center justify-center min-h-[52px] px-4 py-2.5 rounded-xl bg-white border-2 border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold text-xs transition-all shadow-sm"
              >
                <Phone className="w-4 h-4 mr-2 text-slate-600" />
                <span>Coordonnées</span>
              </button>
            </div>
          </div>
        </div>

        {/* Mention de clôture & Sécurité */}
        <div className="mt-6 text-center text-[11px] text-slate-400">
          <p>© 2026 SCI HELLENVILLIERS • SIREN 977 529 312 • Jeton JWT Persistant & Chiffrement Bcrypt</p>
        </div>

      </div>

      {/* =========================================================================
          MODALE 1 : VADÉMÉCUM & CLÉS (PRESTATAIRES, ARTISANS & VISITEURS)
          ========================================================================= */}
      {showVademecumModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-xl bg-white border-2 border-emerald-600 rounded-3xl shadow-2xl p-6 sm:p-8 overflow-hidden max-h-[90vh] flex flex-col">
            
            {/* Header Modale */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border-2 border-emerald-600 flex items-center justify-center text-emerald-800 shadow-sm">
                  <Key className="w-5 h-5 text-emerald-700" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Vadémécum & Clés d'Accès</h3>
                  <p className="text-xs text-slate-500 font-medium">Accès prestataire, artisans & consignes prioritaires</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowVademecumModal(false)}
                className="w-9 h-9 rounded-xl bg-white border-2 border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300 flex items-center justify-center transition-all"
                aria-label="Fermer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Contenu Défilant */}
            <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1 text-sm text-slate-700">
              
              {/* Carte Digicode Portail */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 block">Accès Principal</span>
                  <p className="font-bold text-slate-900 mt-0.5">Digicode Portail Domaine</p>
                  <p className="text-xs text-slate-500">Portail automatique 8 rue Ancienne Mairie</p>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="px-3 py-1.5 font-mono text-sm font-black bg-white border-2 border-emerald-600 text-emerald-950 rounded-xl">
                    2724#
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy('2724#', 'portail')}
                    className="p-2 rounded-xl bg-white border-2 border-slate-300 text-slate-700 hover:bg-slate-100 transition shadow-sm"
                    title="Copier le code"
                  >
                    {copiedKey === 'portail' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Carte Boîtes à clés */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block">Demeure Rosing</span>
                  <p className="font-bold text-slate-900 mt-0.5">Boîte à clés Ouest</p>
                  <p className="text-xs text-slate-500 mb-2">Dépendance sous le préau</p>
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 font-mono text-xs font-bold bg-white border border-slate-300 rounded-lg">
                      Code : 4812
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy('4812', 'rosing')}
                      className="p-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100"
                    >
                      {copiedKey === 'rosing' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block">Le Presbytère</span>
                  <p className="font-bold text-slate-900 mt-0.5">Boîte à clés Porche</p>
                  <p className="text-xs text-slate-500 mb-2">4 rue de l'Ancienne Mairie</p>
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 font-mono text-xs font-bold bg-white border border-slate-300 rounded-lg">
                      Code : 1984
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy('1984', 'presby')}
                      className="p-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100"
                    >
                      {copiedKey === 'presby' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Consignes Techniques Urgentes */}
              <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-200 space-y-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-emerald-950 flex items-center">
                  <ShieldCheck className="w-4 h-4 mr-1.5 text-emerald-700" />
                  Consignes Techniques Importantes
                </h4>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside">
                  <li><strong>Vanne d'arrêt d'eau générale</strong> : Cave voûtée sous l'escalier à Rosing ; buanderie au Presbytère.</li>
                  <li><strong>Tableau électrique & Disjoncteurs</strong> : Entrée de service attenante au cellier.</li>
                  <li><strong>Remise en place</strong> : Toujours replacer le jeu de clés dans le boîtier et brouiller la combinaison à 0000.</li>
                </ul>
              </div>

            </div>

            {/* Footer Modale avec boutons à fond blanc pur */}
            <div className="pt-4 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowVademecumModal(false)}
                className="w-full sm:w-auto min-h-[52px] px-6 py-3 rounded-xl bg-white border-2 border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-sm transition-all shadow-sm"
              >
                Fermer le Vadémécum
              </button>
            </div>

          </div>
        </div>
      )}

      {/* =========================================================================
          MODALE 2 : ASSISTANCE GÉRANCE (HENRI JAMET)
          ========================================================================= */}
      {showAssistanceModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-white border-2 border-emerald-600 rounded-3xl shadow-2xl p-6 sm:p-8 overflow-hidden">
            
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border-2 border-emerald-600 flex items-center justify-center text-emerald-800 shadow-sm">
                  <Phone className="w-5 h-5 text-emerald-700" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Assistance Gérance</h3>
                  <p className="text-xs text-slate-500 font-medium">Coordinateur Général de la SCI</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAssistanceModal(false)}
                className="w-9 h-9 rounded-xl bg-white border-2 border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300 flex items-center justify-center transition-all"
                aria-label="Fermer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-5 space-y-4 text-sm text-slate-700">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <p className="font-bold text-slate-900 text-base">Henri Jamet</p>
                <p className="text-xs text-slate-500">Gérant Opérationnel & Coordinateur Général de la SCI Hellenvilliers</p>
                <div className="pt-2 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-white border border-slate-200">
                    <span className="font-semibold text-slate-600">E-mail Gérance :</span>
                    <a href="mailto:henri.jamet@example.com" className="font-mono font-bold text-emerald-700 hover:underline">
                      henri.jamet@example.com
                    </a>
                  </div>
                  <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-white border border-slate-200">
                    <span className="font-semibold text-slate-600">Permanence Téléphonique :</span>
                    <span className="font-mono font-bold text-slate-800">
                      Sur demande / Urgences domaine
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200 text-xs text-slate-600">
                <p className="font-bold text-emerald-950 mb-1">Mot de passe oublié ?</p>
                <p>
                  Les mots de passe des 7 associés sont strictement chiffrés par hachage Bcrypt. Pour une réinitialisation d'accès ou un nouveau mot de passe, signalez-le directement à Henri.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowAssistanceModal(false)}
                className="min-h-[52px] px-6 py-3 rounded-xl bg-white border-2 border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-sm transition-all shadow-sm"
              >
                Fermer
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}


