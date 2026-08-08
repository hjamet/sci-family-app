import React, { useState } from 'react';
import { LogIn, Key, UserCheck, ShieldAlert, Sparkles, X } from 'lucide-react';
import { loginUser } from '../api';

export default function AuthModal({ isOpen, onClose, onLoginSuccess }) {
  const [prenom, setPrenom] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!prenom.trim() || !password) {
      setError('Veuillez remplir le prénom et le mot de passe.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const user = await loginUser(prenom.trim(), password);
      onLoginSuccess(user);
      onClose();
    } catch (err) {
      setError(err.message || 'Erreur lors de la connexion');
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = async (pre, pass) => {
    setPrenom(pre);
    setPassword(pass);
    try {
      setLoading(true);
      setError(null);
      const user = await loginUser(pre, pass);
      onLoginSuccess(user);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="flex items-center space-x-3 mb-6">
          <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-cyan-400">
            <LogIn className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Espace Membre SCI</h2>
            <p className="text-xs text-slate-400">Connexion via Prénom + Mot de passe</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center space-x-2 text-rose-400 text-xs">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Quick Pick Pre-seeded Users (7 Members) */}
        <div className="mb-6">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Connexion rapide (7 Membres Associés) :
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => quickLogin('Henri', 'pass123')}
              className="flex items-center space-x-2 px-3 py-2 bg-slate-800/80 hover:bg-cyan-950/50 hover:border-cyan-500/40 border border-slate-700/60 rounded-xl text-xs text-slate-200 text-left transition"
            >
              <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
              <div className="truncate">
                <span className="font-semibold block">Henri</span>
                <span className="text-[10px] text-slate-400">Coordinateur</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => quickLogin('Hortense', 'pass123')}
              className="flex items-center space-x-2 px-3 py-2 bg-slate-800/80 hover:bg-rose-950/50 hover:border-rose-500/40 border border-slate-700/60 rounded-xl text-xs text-slate-200 text-left transition"
            >
              <span className="w-2 h-2 rounded-full bg-rose-400"></span>
              <div className="truncate">
                <span className="font-semibold block">Hortense</span>
                <span className="text-[10px] text-slate-400">Associé</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => quickLogin('Marguerite', 'pass123')}
              className="flex items-center space-x-2 px-3 py-2 bg-slate-800/80 hover:bg-purple-950/50 hover:border-purple-500/40 border border-slate-700/60 rounded-xl text-xs text-slate-200 text-left transition"
            >
              <span className="w-2 h-2 rounded-full bg-purple-400"></span>
              <div className="truncate">
                <span className="font-semibold block">Marguerite</span>
                <span className="text-[10px] text-slate-400">Associé</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => quickLogin('Eugénie', 'pass123')}
              className="flex items-center space-x-2 px-3 py-2 bg-slate-800/80 hover:bg-amber-950/50 hover:border-amber-500/40 border border-slate-700/60 rounded-xl text-xs text-slate-200 text-left transition"
            >
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              <div className="truncate">
                <span className="font-semibold block">Eugénie</span>
                <span className="text-[10px] text-slate-400">Associé</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => quickLogin('Joséphine', 'pass123')}
              className="flex items-center space-x-2 px-3 py-2 bg-slate-800/80 hover:bg-emerald-950/50 hover:border-emerald-500/40 border border-slate-700/60 rounded-xl text-xs text-slate-200 text-left transition"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <div className="truncate">
                <span className="font-semibold block">Joséphine</span>
                <span className="text-[10px] text-slate-400">Associé</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => quickLogin('Élisabeth', 'pass123')}
              className="flex items-center space-x-2 px-3 py-2 bg-slate-800/80 hover:bg-teal-950/50 hover:border-teal-500/40 border border-slate-700/60 rounded-xl text-xs text-slate-200 text-left transition"
            >
              <span className="w-2 h-2 rounded-full bg-teal-400"></span>
              <div className="truncate">
                <span className="font-semibold block">Élisabeth</span>
                <span className="text-[10px] text-slate-400">Associé</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => quickLogin('Frédéric', 'pass123')}
              className="flex items-center space-x-2 px-3 py-2 bg-slate-800/80 hover:bg-blue-950/50 hover:border-blue-500/40 border border-slate-700/60 rounded-xl text-xs text-slate-200 text-left transition col-span-2 sm:col-span-1"
            >
              <span className="w-2 h-2 rounded-full bg-blue-400"></span>
              <div className="truncate">
                <span className="font-semibold block">Frédéric</span>
                <span className="text-[10px] text-slate-400">Associé</span>
              </div>
            </button>
          </div>
        </div>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-800"></div></div>
          <div className="relative flex justify-center text-xs uppercase"><span className="bg-slate-900 px-2 text-slate-500">ou saisie manuelle</span></div>
        </div>

        {/* Manual Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Prénom</label>
            <input
              type="text"
              placeholder="ex: Henri, Marie, Pierre..."
              value={prenom}
              onChange={(e) => setPrenom(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Mot de passe</label>
            <div className="relative">
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500 transition"
              />
              <Key className="absolute right-3 top-2.5 h-4 w-4 text-slate-500" />
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Par défaut : pass123</p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-semibold text-sm rounded-xl shadow-lg transition flex items-center justify-center space-x-2"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <UserCheck className="h-4 w-4" />
                <span>Se connecter</span>
              </>
            )}
          </button>
        </form>

      </div>
    </div>
  );
}
