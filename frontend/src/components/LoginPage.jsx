import React, { useState } from 'react';
import { Home, Lock, Eye, EyeOff, ArrowRight, AlertCircle, ShieldCheck } from 'lucide-react';
import { loginUser } from '../api';

const FAMILY_MEMBERS = [
  { prenom: 'Henri', role: 'Coordinateur', color: 'from-cyan-500 to-blue-500 text-white', border: 'border-cyan-500', initial: 'H' },
  { prenom: 'Hortense', role: 'Membre Associé', color: 'from-rose-500 to-pink-500 text-white', border: 'border-rose-500', initial: 'H' },
  { prenom: 'Marguerite', role: 'Membre Associé', color: 'from-purple-500 to-indigo-500 text-white', border: 'border-purple-500', initial: 'M' },
  { prenom: 'Eugénie', role: 'Membre Associé', color: 'from-amber-500 to-orange-500 text-white', border: 'border-amber-500', initial: 'E' },
  { prenom: 'Joséphine', role: 'Membre Associé', color: 'from-emerald-500 to-teal-500 text-white', border: 'border-emerald-500', initial: 'J' },
  { prenom: 'Élisabeth', displayLabel: 'Élisabeth', role: 'Membre Associé', color: 'from-teal-500 to-cyan-600 text-white', border: 'border-teal-500', initial: 'É' },
  { prenom: 'Frédéric', role: 'Membre Associé', color: 'from-blue-600 to-indigo-600 text-white', border: 'border-blue-600', initial: 'F' },
];

export default function LoginPage({ onLoginSuccess }) {
  const [selectedPrenom, setSelectedPrenom] = useState('Henri');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
      const res = await loginUser(selectedPrenom, password);
      if (res && res.access_token) {
        onLoginSuccess({
          token: res.access_token,
          user: res.user || { prenom: res.prenom || selectedPrenom, role: res.role || 'Membre Associé' }
        });
      } else {
        throw new Error('Réponse de connexion invalide.');
      }
    } catch (err) {
      console.error('Erreur de connexion:', err);
      setError(err.message || 'Échec de la connexion. Vérifiez le mot de passe.');
    } finally {
      setLoading(false);
    }
  };

  const currentMember = FAMILY_MEMBERS.find(m => m.prenom === selectedPrenom) || FAMILY_MEMBERS[0];

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 bg-slate-50 overflow-hidden font-sans text-slate-900">
      {/* Soft Ambient Background Blur Orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-200/50 rounded-full blur-3xl pointer-events-none animate-pulse"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-200/50 rounded-full blur-3xl pointer-events-none animate-pulse delay-1000"></div>
      <div className="absolute top-1/2 right-1/3 w-80 h-80 bg-teal-200/40 rounded-full blur-3xl pointer-events-none"></div>

      {/* Card Container: bg-white border border-slate-200 shadow-xl rounded-3xl */}
      <div className="relative w-full max-w-3xl bg-white border border-slate-200 shadow-xl rounded-3xl p-6 sm:p-10 my-8">
        
        {/* Header */}
        <div className="text-center space-y-3 mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-600/20 ring-4 ring-indigo-50 mb-2">
            <Home className="w-8 h-8" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
            Viva Hellenvilliers !!
          </h1>
          <p className="text-sm text-slate-600 font-medium max-w-md mx-auto">
            Portail privé des 7 membres associés de la SCI Familiale. Choisissez votre profil pour accéder à votre espace.
          </p>
        </div>

        {/* Member Selector Grid */}
        <div className="mb-8">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 text-center sm:text-left">
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
                  className={`flex flex-col items-center p-3 rounded-2xl border transition-all duration-200 group text-center ${
                    isSelected
                      ? 'bg-indigo-50/90 border-indigo-500 ring-2 ring-indigo-500/30 shadow-md scale-[1.03]'
                      : 'bg-slate-100/80 hover:bg-indigo-50 border-slate-200 text-slate-800'
                  }`}
                >
                  <div className={`w-11 h-11 rounded-full bg-gradient-to-tr ${member.color} flex items-center justify-center font-black text-base shadow-sm mb-2 group-hover:scale-105 transition-transform`}>
                    {member.initial}
                  </div>
                  <span className={`text-xs font-extrabold truncate w-full ${isSelected ? 'text-indigo-950' : 'text-slate-900'}`}>
                    {member.prenom}
                  </span>
                  <span className={`text-[10px] font-medium truncate w-full mt-0.5 ${isSelected ? 'text-indigo-600' : 'text-slate-500'}`}>
                    {member.role}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Form Section */}
        <form onSubmit={handleSubmit} className="space-y-6 max-w-md mx-auto">
          
          {/* Selected Member Info */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
            <div className="flex items-center space-x-3">
              <div className={`w-9 h-9 rounded-full bg-gradient-to-tr ${currentMember.color} flex items-center justify-center font-bold text-sm shadow-sm`}>
                {currentMember.initial}
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Connexion en tant que</p>
                <p className="text-sm font-bold text-slate-900">{currentMember.displayLabel || currentMember.prenom}</p>
              </div>
            </div>
            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
              <ShieldCheck className="w-3.5 h-3.5 mr-1" />
              {currentMember.role}
            </span>
          </div>

          {/* Password Input */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
              2. Saisissez votre mot de passe
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoFocus
                className="w-full pl-10 pr-10 py-3 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Error Message Container */}
          {error && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2.5 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-sm shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/30 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center space-x-2 group"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Connexion en cours...</span>
              </>
            ) : (
              <>
                <span>Accéder au Portail SCI</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>

        </form>

        {/* Footer info */}
        <div className="mt-8 pt-6 border-t border-slate-200 text-center text-[11px] text-slate-400">
          <p>© 2026 SCI Familiale Hellenvilliers • Jeton d'accès sécurisé persistant</p>
        </div>

      </div>
    </div>
  );
}

