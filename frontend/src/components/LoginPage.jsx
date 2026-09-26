import React, { useState } from 'react';
import { loginUser } from '../api';
import { useAuth } from '../context/AuthContext';

const LOGO_SRC = "https://lh3.googleusercontent.com/aida/AEtjO1XPkJA9U7CARtYXRqiCPhIByczBnBdNtGuBGIaMyna0c8Ams8nQu_bL_xLUxSm0ss6S3OHFS_n6B7nd2shejRa7UOjp65THsDhEKTpK_c7vICASOxbWet3Npaq5uEjMp0n1qWBqzcIJLOA643R5lKnnpnipatsdqzLoRZFTH3yd8h6IRXGs4HV3UIq2aiKXLu8bVu7FO6vMLYXv5-ilXUTx3C0CaKLCNIbtx6bjoStN";

const ASSOCIATES = [
  {
    id: 'henri',
    prenom: 'Henri',
    nom: 'Jamet',
    fullName: 'Henri Jamet',
    avatar: 'HJ',
    borderClass: 'border-l-emerald-600',
    avatarBg: 'bg-emerald-100 text-emerald-900 border border-emerald-300',
  },
  {
    id: 'marguerite',
    prenom: 'Marguerite',
    nom: 'Jamet',
    fullName: 'Marguerite Jamet',
    avatar: 'MJ',
    borderClass: 'border-l-emerald-700',
    avatarBg: 'bg-emerald-100 text-emerald-900 border border-emerald-300',
  },
  {
    id: 'hortense',
    prenom: 'Hortense',
    nom: 'Jamet',
    fullName: 'Hortense Jamet',
    avatar: 'HJ',
    borderClass: 'border-l-lime-700',
    avatarBg: 'bg-lime-100 text-lime-900 border border-lime-300',
  },
  {
    id: 'josephine',
    prenom: 'Joséphine',
    nom: 'Jamet',
    fullName: 'Joséphine Jamet',
    avatar: 'JJ',
    borderClass: 'border-l-green-700',
    avatarBg: 'bg-green-100 text-green-900 border border-green-300',
  },
  {
    id: 'eugenie',
    prenom: 'Eugénie',
    nom: 'Jamet',
    fullName: 'Eugénie Jamet',
    avatar: 'EJ',
    borderClass: 'border-l-amber-600',
    avatarBg: 'bg-amber-100 text-amber-900 border border-amber-300',
  },
  {
    id: 'frederic',
    prenom: 'Frédéric',
    nom: 'Jamet',
    fullName: 'Frédéric Jamet',
    avatar: 'FJ',
    borderClass: 'border-l-teal-700',
    avatarBg: 'bg-teal-100 text-teal-900 border border-teal-300',
  },
  {
    id: 'elisabeth',
    prenom: 'Élisabeth',
    nom: 'Jamet',
    fullName: 'Élisabeth Jamet',
    avatar: 'ÉJ',
    borderClass: 'border-l-emerald-800',
    avatarBg: 'bg-emerald-100 text-emerald-950 border border-emerald-300',
  },
];

export default function LoginPage({ onLoginSuccess }) {
  const { login } = useAuth();
  const [selectedMember, setSelectedMember] = useState(ASSOCIATES[0]);
  const [passcode, setPasscode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [forgotFeedback, setForgotFeedback] = useState(false);
  const [successFeedback, setSuccessFeedback] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!passcode.trim()) {
      setError('Veuillez saisir votre code confidentiel.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const identifier = selectedMember.prenom || (selectedMember.fullName ? selectedMember.fullName.split(' ')[0] : 'Henri');
      const res = await loginUser(identifier, passcode.trim());
      const token = res.access_token || res.token || res.data?.access_token;
      const member = res.user || res.member || res.data?.member || res.data?.user || { prenom: selectedMember.prenom, name: selectedMember.fullName };

      if (login && token) {
        await login(member, token);
      }
      setSuccessFeedback(true);

      setTimeout(() => {
        if (onLoginSuccess) {
          onLoginSuccess({
            token,
            user: member,
          });
        }
      }, 300);
    } catch (err) {
      console.error('Erreur authentification:', err);
      setError(err.message || 'Code confidentiel incorrect pour cet associé.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#f7faf8] font-body-lg text-on-surface antialiased min-h-screen flex items-center justify-center selection:bg-emerald-100 selection:text-emerald-900 py-8 px-4 sm:px-6">
      <main className="w-full max-w-6xl mx-auto">
        <div className="flex flex-col w-full py-6 md:py-10">
          
          {/* Header */}
          <header className="flex flex-col items-center text-center mb-8 md:mb-12">
            <div className="relative mb-4 group">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-white shadow-md border-2 border-emerald-500/20 p-2 flex items-center justify-center transition-transform duration-300 hover:scale-[1.02] ring-4 ring-emerald-50">
                <img
                  alt="Monogramme emblématique de la SCI Hellenvilliers"
                  className="w-full h-full object-contain rounded-xl"
                  src={LOGO_SRC}
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.parentElement.innerHTML = '<span class="font-bold text-2xl text-emerald-800">H</span>';
                  }}
                />
              </div>
            </div>

            <h1 className="font-display-lg text-2xl sm:text-3xl md:text-4xl text-emerald-950 font-bold tracking-tight max-w-3xl text-balance">
              Bienvenue au Domaine d'Hellenvilliers
            </h1>
            <p className="font-body-md text-xs sm:text-sm text-on-surface-variant mt-2 max-w-xl">
              Portail familial sécurisé de la SCI Hellenvilliers • Connexion des 7 associés
            </p>
          </header>

          {/* Main 2-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Left Column: Select Profile (7 cols) */}
            <section aria-labelledby="profil-selection-title" className="lg:col-span-7 flex flex-col space-y-4">
              <div className="flex items-center justify-between px-1">
                <div>
                  <h2
                    className="font-headline-md text-lg sm:text-xl font-bold text-emerald-950 flex items-center gap-2.5"
                    id="profil-selection-title"
                  >
                    <span className="w-7 h-7 rounded-lg bg-white border-2 border-emerald-600 text-emerald-800 text-xs sm:text-sm flex items-center justify-center font-bold">
                      1
                    </span>
                    Choisissez votre profil
                  </h2>
                </div>
              </div>

              {/* List of 7 Associates */}
              <div
                aria-label="Profils des membres de la famille Jamet"
                className="flex flex-col space-y-3"
                role="radiogroup"
              >
                {ASSOCIATES.map((member) => {
                  const isSelected = selectedMember.id === member.id;
                  return (
                    <div
                      key={member.id}
                      onClick={() => {
                        setSelectedMember(member);
                        setError(null);
                      }}
                      role="radio"
                      aria-checked={isSelected}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          setSelectedMember(member);
                          setError(null);
                        }
                      }}
                      className={`member-card cursor-pointer w-full min-h-[74px] p-4 sm:p-5 rounded-2xl bg-white shadow-xs hover:shadow-md transition-all flex items-center justify-between border-l-[6px] ${member.borderClass} border border-border-subtle ${
                        isSelected ? 'ring-2 ring-emerald-600/30 shadow-sm' : ''
                      }`}
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div
                          className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl ${member.avatarBg} flex items-center justify-center font-headline-md text-sm sm:text-base font-bold shrink-0 shadow-inner`}
                        >
                          {member.avatar}
                        </div>
                        <div className="min-w-0">
                          <span className="font-headline-sm text-base sm:text-lg text-emerald-950 font-bold tracking-tight">
                            {member.fullName}
                          </span>
                        </div>
                      </div>

                      <div
                        className={`check-icon shrink-0 ml-3 w-8 h-8 rounded-full bg-white border-2 border-emerald-600 flex items-center justify-center text-emerald-700 shadow-xs ${
                          isSelected ? 'flex' : 'hidden'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[18px] font-bold">check</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Right Column: Secure Access Form (5 cols) */}
            <aside aria-label="Espace de validation du mot de passe" className="lg:col-span-5 flex flex-col space-y-6 lg:sticky lg:top-8">
              <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-md border border-emerald-100 space-y-6">
                <div>
                  <h2 className="font-headline-md text-xl sm:text-2xl font-bold text-emerald-950">
                    Authentification
                  </h2>
                  <p className="text-xs text-on-surface-variant mt-1">
                    Accédez aux documents et au registre du domaine.
                  </p>
                </div>

                {/* Selected Profile Summary Box */}
                <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200/70 flex items-center gap-4">
                  <div
                    className={`w-12 h-12 rounded-xl ${selectedMember.avatarBg} flex items-center justify-center font-headline-sm text-base font-bold shrink-0`}
                  >
                    {selectedMember.avatar}
                  </div>
                  <div className="min-w-0">
                    <p className="font-headline-sm text-base sm:text-lg text-emerald-950 truncate font-bold">
                      {selectedMember.fullName}
                    </p>
                  </div>
                </div>

                <form className="space-y-5" onSubmit={handleSubmit}>
                  {/* Passcode input */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label
                        className="block font-label-lg text-xs sm:text-sm text-emerald-950 font-semibold"
                        htmlFor="passcode"
                      >
                        Code confidentiel ou Mot de passe
                      </label>
                    </div>

                    <div className="relative flex items-center">
                      <input
                        id="passcode"
                        name="passcode"
                        type={showPassword ? 'text' : 'password'}
                        value={passcode}
                        onChange={(e) => setPasscode(e.target.value)}
                        autoComplete="current-password"
                        placeholder="••••••"
                        required
                        className="w-full h-14 px-4 pr-14 text-lg font-headline-sm rounded-xl bg-[#f8faf9] border border-border-subtle text-emerald-950 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 focus:bg-white shadow-inner tracking-widest transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label="Afficher ou masquer le code"
                        title={showPassword ? 'Masquer le code' : 'Afficher le code'}
                        className="absolute right-2 w-11 h-11 flex items-center justify-center rounded-lg text-emerald-800/70 hover:text-emerald-950 hover:bg-emerald-50 transition-colors cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[22px]">
                          {showPassword ? 'visibility_off' : 'visibility'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Remember Me */}
                  <label className="flex items-center gap-3 cursor-pointer select-none py-1 group">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0"
                    />
                    <span className="font-body-md text-xs sm:text-sm text-on-surface group-hover:text-emerald-950 leading-snug">
                      Se souvenir de moi sur cette tablette / cet ordinateur
                    </span>
                  </label>

                  {/* Error Banner */}
                  {error && (
                    <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs sm:text-sm flex items-center gap-2.5">
                      <span className="material-symbols-outlined text-[20px] text-red-600 shrink-0">
                        error
                      </span>
                      <span>{error}</span>
                    </div>
                  )}

                  {/* Primary Signature Button */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full min-h-[54px] px-6 rounded-2xl bg-white border-2 border-emerald-600 text-emerald-800 hover:text-emerald-950 hover:bg-emerald-50/60 hover:border-emerald-700 font-label-lg text-sm sm:text-base font-bold flex items-center justify-center gap-3 shadow-sm hover:shadow-md transition-all active:scale-[0.99] cursor-pointer disabled:opacity-50"
                  >
                    {loading ? (
                      <span className="inline-block w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></span>
                    ) : (
                      <>
                        <svg
                          className="w-5 h-5 text-emerald-600 shrink-0"
                          fill="none"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2.2"
                          viewBox="0 0 24 24"
                        >
                          <rect height="11" rx="2" ry="2" width="18" x="3" y="11"></rect>
                          <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
                        </svg>
                        <span>Se Connecter</span>
                      </>
                    )}
                  </button>

                  {/* Forgot Password */}
                  <div className="flex flex-col space-y-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setForgotFeedback(!forgotFeedback)}
                      className="w-full min-h-[48px] px-4 rounded-2xl bg-white border-2 border-emerald-200 hover:border-emerald-600 text-emerald-800 hover:text-emerald-950 hover:bg-emerald-50/50 font-label-md text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 shadow-xs hover:shadow-sm transition-all cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[18px] text-emerald-700">
                        lock_reset
                      </span>
                      <span>J'ai oublié mon mot de passe</span>
                    </button>

                    {forgotFeedback && (
                      <div
                        role="alert"
                        className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-label-sm text-xs items-center flex gap-2.5 animate-in fade-in duration-200"
                      >
                        <span className="material-symbols-outlined text-[20px] text-emerald-700 shrink-0">
                          mark_email_read
                        </span>
                        <span>
                          Un message d'assistance a été adressé à Henri Jamet pour réinitialiser vos accès.
                        </span>
                      </div>
                    )}
                  </div>
                </form>

                {successFeedback && (
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-label-md text-xs sm:text-sm flex items-center gap-3 animate-in fade-in duration-200">
                    <span className="material-symbols-outlined text-[22px] text-emerald-600">
                      check_circle
                    </span>
                    <span>Connexion réussie. Chargement des documents de la SCI...</span>
                  </div>
                )}
              </div>
            </aside>

          </div>


        </div>
      </main>
    </div>
  );
}
