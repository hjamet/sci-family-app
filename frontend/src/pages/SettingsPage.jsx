import React, { useState, useEffect } from 'react';
import {
  User,
  Mail,
  Eye,
  EyeOff,
  Bell,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Save,
  KeyRound,
  Check,
  ClipboardList,
  Vote,
  Scale,
  CalendarDays,
  Info,
  RefreshCw,
  CheckCheck,
  Thermometer,
  AtSign
} from 'lucide-react';
import {
  fetchUserProfile,
  updateUserProfile,
  changeUserPassword,
  fetchMemberSettings,
  updateMemberSettings
} from '../api';

// Correspondance des rôles et badges officiels de la SCI
const ASSOCIATE_ROLES = {
  henri: {
    badge: 'Gérant',
    role: 'Nu-propriétaire • Gérant & Coordinateur Opérationnel',
    color: 'emerald',
    initials: 'HJ'
  },
  frederic: {
    badge: 'Usufruitier',
    role: 'Usufruitier • Référent Énergie & Accord Piscine',
    color: 'teal',
    initials: 'FJ'
  },
  elisabeth: {
    badge: 'Usufruitière',
    role: 'Usufruitière • Garante du Patrimoine Familial',
    color: 'emerald',
    initials: 'ÉJ'
  },
  josephine: {
    badge: 'Coordination',
    role: 'Nue-propriétaire • Coordinatrice Adjointe',
    color: 'green',
    initials: 'JJ'
  },
  hortense: {
    badge: 'Jardin',
    role: 'Nue-propriétaire • Référente Espaces Verts & Jardin',
    color: 'lime',
    initials: 'HJ'
  },
  marguerite: {
    badge: 'Maison',
    role: 'Référente Équipements & Maison',
    color: 'emerald',
    initials: 'MJ'
  },
  eugenie: {
    badge: 'Déco & Peinture',
    role: 'Nue-propriétaire • Référente Peintures, Tri & Déco',
    color: 'amber',
    initials: 'EJ'
  }
};

export default function SettingsPage({ currentUser }) {
  // --- États Utilisateur & Profil ---
  const [profile, setProfile] = useState({
    id: 1,
    prenom: 'Henri',
    name: 'Henri Jamet',
    email: '',
    role: 'Nu-propriétaire • Gérant & Coordinateur Opérationnel'
  });
  const [emailInput, setEmailInput] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);

  // --- États Sécurité & Mot de Passe ---
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState(null);

  // --- États Préférences de Notifications (6 Toggles) ---
  const [notifications, setNotifications] = useState({
    notify_new_task: true,
    notify_pending_vote: true,
    notify_final_decision: true,
    notify_new_stay: true,
    notify_mentions: true,
    notif_thermal_changes: false
  });
  const [notificationsLoading, setNotificationsLoading] = useState(false);

  // --- Toast Flottant ---
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type, id: Date.now() });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 4500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // --- Chargement Initial des Données ---
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        const userProfile = await fetchUserProfile();
        if (!isMounted) return;

        const prenomKey = (userProfile?.prenom || (typeof currentUser === 'string' ? currentUser : currentUser?.prenom) || 'henri').toLowerCase();
        const roleInfo = ASSOCIATE_ROLES[prenomKey] || {
          badge: 'Associé',
          role: userProfile?.role || 'Membre Associé',
          color: 'emerald',
          initials: (userProfile?.prenom ? userProfile.prenom.substring(0, 2) : 'MJ').toUpperCase()
        };

        const resolvedEmail = userProfile?.email || localStorage.getItem('sci_user_email') || `${prenomKey}@sci-familiale.fr`;

        setProfile({
          id: userProfile?.id || 1,
          prenom: userProfile?.prenom || (typeof currentUser === 'string' ? currentUser : currentUser?.prenom) || 'Henri',
          name: userProfile?.name || `${userProfile?.prenom || 'Henri'} Jamet`,
          email: resolvedEmail,
          role: roleInfo.role,
          badge: roleInfo.badge,
          initials: roleInfo.initials
        });
        setEmailInput(resolvedEmail);

        // Chargement des préférences de notifications
        const settings = await fetchMemberSettings(userProfile?.id || prenomKey);
        if (isMounted && settings) {
          const thermalPref = Boolean(
            settings.notif_thermal_changes != null
              ? settings.notif_thermal_changes
              : (settings.notify_thermal_changes != null
                  ? settings.notify_thermal_changes
                  : (userProfile?.notif_thermal_changes ?? false))
          );
          setNotifications({
            notify_new_task: settings.notify_new_task !== false,
            notify_pending_vote: settings.notify_pending_vote !== false,
            notify_final_decision: settings.notify_final_decision !== false,
            notify_new_stay: settings.notify_new_stay !== false,
            notify_mentions: settings.notify_mentions !== false,
            notif_thermal_changes: thermalPref
          });
        }
      } catch (err) {
        console.warn('Erreur lors du chargement des paramètres:', err);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  // --- Actions Section 1 : Enregistrement de l'adresse e-mail ---
  const handleSaveEmail = async (e) => {
    e.preventDefault();
    const cleanEmail = emailInput.trim();

    if (!cleanEmail) {
      showToast("Veuillez renseigner une adresse e-mail valide.", "error");
      return;
    }
    if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      showToast("Format d'adresse e-mail incorrect.", "error");
      return;
    }

    try {
      setEmailLoading(true);
      const res = await updateUserProfile({ email: cleanEmail });
      setProfile((prev) => ({ ...prev, email: cleanEmail }));
      showToast("Adresse e-mail enregistrée avec succès !", "success");
    } catch (err) {
      showToast(err.message || "Erreur lors de la mise à jour de l'e-mail.", "error");
    } finally {
      setEmailLoading(false);
    }
  };

  // --- Actions Section 2 : Modification du mot de passe ---
  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError(null);

    if (!newPassword) {
      setPasswordError("Veuillez saisir un nouveau mot de passe.");
      return;
    }
    if (newPassword.length < 4) {
      setPasswordError("Le nouveau mot de passe doit comporter au moins 4 caractères.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Les deux nouveaux mots de passe ne correspondent pas.");
      return;
    }

    try {
      setPasswordLoading(true);
      await changeUserPassword({
        newPassword,
        confirmPassword
      });

      // Réinitialisation des champs après succès
      setNewPassword('');
      setConfirmPassword('');
      showToast("Mot de passe modifié avec succès !", "success");
    } catch (err) {
      setPasswordError(err.message || "Erreur lors du changement de mot de passe.");
    } finally {
      setPasswordLoading(false);
    }
  };

  // --- Actions Section 3 : Préférences de notification ---
  const handleToggleNotification = (key) => {
    setNotifications((prev) => {
      const nextVal = !prev[key];
      const updated = { ...prev, [key]: nextVal };
      if (key === 'notif_thermal_changes') {
        updated.notify_thermal_changes = nextVal;
      } else if (key === 'notify_thermal_changes') {
        updated.notif_thermal_changes = nextVal;
      }
      return updated;
    });
  };

  const handleSetAllNotifications = (status) => {
    setNotifications({
      notify_new_task: status,
      notify_pending_vote: status,
      notify_final_decision: status,
      notify_new_stay: status,
      notify_mentions: status,
      notif_thermal_changes: status,
      notify_thermal_changes: status
    });
  };

  const handleSaveNotifications = async () => {
    try {
      setNotificationsLoading(true);
      await updateMemberSettings(profile.id || profile.prenom, notifications);
      showToast("Préférences de notification enregistrées avec succès !", "success");
    } catch (err) {
      showToast("Erreur lors de la sauvegarde des notifications.", "error");
    } finally {
      setNotificationsLoading(false);
    }
  };

  return (
    <div className="pb-16 max-w-4xl mx-auto space-y-8 animate-in fade-in duration-200">
      
      {/* Toast Notification Flottant */}
      {toast && (
        <div
          role="alert"
          aria-live="assertive"
          className={`fixed top-24 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-xl border backdrop-blur-md transition-all duration-300 transform translate-y-0 ${
            toast.type === 'success'
              ? 'bg-emerald-900/95 text-white border-emerald-700 shadow-emerald-950/20'
              : 'bg-red-900/95 text-white border-red-700 shadow-red-950/20'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-300 shrink-0" />
          )}
          <span className="text-sm font-semibold">{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-2 text-white/70 hover:text-white p-1 rounded-lg text-xs"
            aria-label="Fermer la notification"
          >
            ✕
          </button>
        </div>
      )}

      {/* En-tête de la Page */}
      <div className="border-b border-border-subtle pb-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-on-surface tracking-tight">
          Paramètres &amp; Préférences
        </h1>
      </div>

      {/* ======================================================== */}
      {/* SECTION 1 : PROFIL & ADRESSE E-MAIL                      */}
      {/* ======================================================== */}
      <section className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 sm:p-8 hover:shadow-md transition-shadow">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-800 flex items-center justify-center border border-emerald-200/60 shadow-xs">
            <User className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider font-bold text-emerald-800">
              Section 1
            </div>
            <h2 className="text-lg font-bold text-slate-900">
              Profil &amp; Adresse E-mail
            </h2>
          </div>
        </div>

        {/* Carte Récapitulative du Rôle Associé */}
        <div className="p-4 sm:p-5 rounded-2xl bg-canvas-slate border border-slate-200/70 mb-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary text-white flex items-center justify-center font-bold text-lg shadow-sm border border-emerald-700/50 shrink-0">
            {profile.initials || 'HJ'}
          </div>
          <div>
            <span className="font-extrabold text-base text-slate-900">
              {profile.name}
            </span>
          </div>
        </div>

        {/* Formulaire d'Édition de l'Adresse E-mail */}
        <form onSubmit={handleSaveEmail} className="space-y-4">
          <div>
            <label
              htmlFor="email-input"
              className="block text-xs font-bold text-slate-800 uppercase tracking-wide mb-1.5"
            >
              Adresse e-mail de notification
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Mail className="w-4 h-4" />
              </div>
              <input
                id="email-input"
                type="email"
                required
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="votre.email@sci-familiale.fr"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
            <p className="text-xs text-slate-500 mt-2 flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
              <span>
                Cette adresse e-mail recevra toutes les convocations, comptes-rendus de chantiers et alertes programmées.
              </span>
            </p>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={emailLoading}
              className="px-5 py-2.5 rounded-xl bg-primary hover:bg-emerald-800 text-white font-semibold text-sm shadow-sm transition-all flex items-center gap-2 active:scale-98 disabled:opacity-50 cursor-pointer"
            >
              {emailLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Enregistrement en cours...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Enregistrer l'adresse e-mail</span>
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      {/* ======================================================== */}
      {/* SECTION 2 : SÉCURITÉ & MOT DE PASSE                      */}
      {/* ======================================================== */}
      <section className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 sm:p-8 hover:shadow-md transition-shadow">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-800 flex items-center justify-center border border-amber-200/60 shadow-xs">
            <ShieldCheck className="w-5 h-5 text-amber-700" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider font-bold text-amber-800">
              Section 2
            </div>
            <h2 className="text-lg font-bold text-slate-900">
              Sécurité &amp; Mot de Passe
            </h2>
          </div>
        </div>

        {/* Message d'Erreur Global */}
        {passwordError && (
          <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{passwordError}</span>
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-4">
          {/* Grille Nouveau Mot de Passe + Confirmation */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Nouveau Mot de Passe */}
            <div>
              <label
                htmlFor="new-pw"
                className="block text-xs font-bold text-slate-800 uppercase tracking-wide mb-1.5"
              >
                Nouveau mot de passe
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  id="new-pw"
                  type={showNewPw ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 4 caractères"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPw(!showNewPw)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  title={showNewPw ? 'Masquer' : 'Afficher'}
                >
                  {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirmation Nouveau Mot de Passe */}
            <div>
              <label
                htmlFor="confirm-pw"
                className="block text-xs font-bold text-slate-800 uppercase tracking-wide mb-1.5"
              >
                Confirmer le nouveau mot de passe
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Check className="w-4 h-4" />
                </div>
                <input
                  id="confirm-pw"
                  type={showConfirmPw ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Répétez le nouveau mot de passe"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPw(!showConfirmPw)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  title={showConfirmPw ? 'Masquer' : 'Afficher'}
                >
                  {showConfirmPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={passwordLoading}
              className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm shadow-sm transition-all flex items-center gap-2 active:scale-98 disabled:opacity-50 cursor-pointer"
            >
              {passwordLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Modification en cours...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Mettre à jour le mot de passe</span>
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      {/* ======================================================== */}
      {/* SECTION 3 : PRÉFÉRENCES DE NOTIFICATIONS AUTOMATIQUES    */}
      {/* ======================================================== */}
      <section className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 sm:p-8 hover:shadow-md transition-shadow">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-800 flex items-center justify-center border border-teal-200/60 shadow-xs">
              <Bell className="w-5 h-5 text-secondary" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider font-bold text-teal-800">
                Section 3
              </div>
              <h2 className="text-lg font-bold text-slate-900">
                Préférences de Notifications Automatiques (E-mail)
              </h2>
            </div>
          </div>

          {/* Raccourcis Tout Activer / Désactiver */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => handleSetAllNotifications(true)}
              className="text-xs px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 font-semibold border border-emerald-200 transition-colors cursor-pointer"
            >
              Tout activer
            </button>
            <button
              type="button"
              onClick={() => handleSetAllNotifications(false)}
              className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 font-semibold border border-slate-300 transition-colors cursor-pointer"
            >
              Tout désactiver
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-600 mb-6">
          Définissez la fréquence et la nature des e-mails automatiques envoyés à votre adresse. Par défaut, l'ensemble des alertes prioritaires est activé pour assurer une coordination fluide du patrimoine.
        </p>

        {/* Les 4 Interrupteurs Toggles Conformes aux Spécifications */}
        <div className="space-y-4">
          
          {/* Toggle 1 : Nouvelle tâche assignée */}
          <div
            onClick={() => handleToggleNotification('notify_new_task')}
            className="flex items-start justify-between gap-4 p-4 rounded-2xl border border-slate-200 hover:border-emerald-300 bg-slate-50/50 hover:bg-emerald-50/20 transition-all cursor-pointer select-none"
          >
            <div className="flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 mt-0.5 border border-emerald-200">
                <ClipboardList className="w-5 h-5 text-emerald-800" />
              </div>
              <div>
                <span className="text-sm font-bold text-slate-900">
                  📝 Nouvelle tâche assignée
                </span>
                <p className="text-xs text-slate-600 mt-1">
                  M'alerter dès qu'un chantier m'est confié ou qu'une mission de maintenance m'est assignée.
                </p>
              </div>
            </div>

            {/* Custom Toggle Switch */}
            <div className="shrink-0 pt-1">
              <div
                className={`w-12 h-6 flex items-center rounded-full p-1 duration-300 ease-in-out ${
                  notifications.notify_new_task ? 'bg-primary' : 'bg-slate-300'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${
                    notifications.notify_new_task ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Toggle 2 : Vote en attente de mon avis */}
          <div
            onClick={() => handleToggleNotification('notify_pending_vote')}
            className="flex items-start justify-between gap-4 p-4 rounded-2xl border border-slate-200 hover:border-emerald-300 bg-slate-50/50 hover:bg-emerald-50/20 transition-all cursor-pointer select-none"
          >
            <div className="flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center shrink-0 mt-0.5 border border-teal-200">
                <Vote className="w-5 h-5 text-teal-800" />
              </div>
              <div>
                <span className="text-sm font-bold text-slate-900">
                  🗳️ Vote en attente de mon avis
                </span>
                <p className="text-xs text-slate-600 mt-1">
                  M'alerter dès qu'un scrutin ou une décision formelle nécessite mon vote ou ma validation.
                </p>
              </div>
            </div>

            {/* Custom Toggle Switch */}
            <div className="shrink-0 pt-1">
              <div
                className={`w-12 h-6 flex items-center rounded-full p-1 duration-300 ease-in-out ${
                  notifications.notify_pending_vote ? 'bg-primary' : 'bg-slate-300'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${
                    notifications.notify_pending_vote ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Toggle 3 : Décision de vote finale */}
          <div
            onClick={() => handleToggleNotification('notify_final_decision')}
            className="flex items-start justify-between gap-4 p-4 rounded-2xl border border-slate-200 hover:border-emerald-300 bg-slate-50/50 hover:bg-emerald-50/20 transition-all cursor-pointer select-none"
          >
            <div className="flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 mt-0.5 border border-amber-200">
                <Scale className="w-5 h-5 text-amber-800" />
              </div>
              <div>
                <span className="text-sm font-bold text-slate-900">
                  ⚖️ Décision de vote finale
                </span>
                <p className="text-xs text-slate-600 mt-1">
                  M'informer du résultat et de la résolution officielle dès que tous les associés ont voté.
                </p>
              </div>
            </div>

            {/* Custom Toggle Switch */}
            <div className="shrink-0 pt-1">
              <div
                className={`w-12 h-6 flex items-center rounded-full p-1 duration-300 ease-in-out ${
                  notifications.notify_final_decision ? 'bg-primary' : 'bg-slate-300'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${
                    notifications.notify_final_decision ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Toggle 4 : Nouveau séjour réservé */}
          <div
            onClick={() => handleToggleNotification('notify_new_stay')}
            className="flex items-start justify-between gap-4 p-4 rounded-2xl border border-slate-200 hover:border-emerald-300 bg-slate-50/50 hover:bg-emerald-50/20 transition-all cursor-pointer select-none"
          >
            <div className="flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center shrink-0 mt-0.5 border border-blue-200">
                <CalendarDays className="w-5 h-5 text-blue-800" />
              </div>
              <div>
                <span className="text-sm font-bold text-slate-900">
                  📅 Nouveau séjour réservé
                </span>
                <p className="text-xs text-slate-600 mt-1">
                  M'alerter dès qu'une réservation est ajoutée au calendrier au Presbytère ou à Rosings.
                </p>
              </div>
            </div>

            {/* Custom Toggle Switch */}
            <div className="shrink-0 pt-1">
              <div
                className={`w-12 h-6 flex items-center rounded-full p-1 duration-300 ease-in-out ${
                  notifications.notify_new_stay ? 'bg-primary' : 'bg-slate-300'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${
                    notifications.notify_new_stay ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Toggle : Mentions dans les discussions */}
          <div
            onClick={() => handleToggleNotification('notify_mentions')}
            className="flex items-start justify-between gap-4 p-4 rounded-2xl border border-slate-200 hover:border-emerald-300 bg-slate-50/50 hover:bg-emerald-50/20 transition-all cursor-pointer select-none"
          >
            <div className="flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-800 flex items-center justify-center shrink-0 mt-0.5 border border-sky-200">
                <AtSign className="w-5 h-5 text-sky-800" />
              </div>
              <div>
                <span className="text-sm font-bold text-slate-900">
                  💬 Mentions dans les discussions
                </span>
                <p className="text-xs text-slate-600 mt-1">
                  M'alerter par e-mail lorsqu'un membre me mentionne avec @ dans une discussion.
                </p>
              </div>
            </div>

            {/* Custom Toggle Switch */}
            <div className="shrink-0 pt-1">
              <div
                className={`w-12 h-6 flex items-center rounded-full p-1 duration-300 ease-in-out ${
                  notifications.notify_mentions ? 'bg-primary' : 'bg-slate-300'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${
                    notifications.notify_mentions ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Toggle 5 : Alertes thermiques & piscine */}
          <div
            onClick={() => handleToggleNotification('notif_thermal_changes')}
            className="flex items-start justify-between gap-4 p-4 rounded-2xl border border-slate-200 hover:border-emerald-300 bg-slate-50/50 hover:bg-emerald-50/20 transition-all cursor-pointer select-none"
          >
            <div className="flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 mt-0.5 border border-amber-200">
                <Thermometer className="w-5 h-5 text-amber-800" />
              </div>
              <div>
                <span className="text-sm font-bold text-slate-900">
                  🌡️ Alertes thermiques &amp; piscine
                </span>
                <p className="text-xs text-slate-600 mt-1">
                  M'alerter en cas de modification des consignes de chauffage ou de filtration piscine.
                </p>
              </div>
            </div>

            {/* Custom Toggle Switch */}
            <div className="shrink-0 pt-1">
              <div
                className={`w-12 h-6 flex items-center rounded-full p-1 duration-300 ease-in-out ${
                  notifications.notif_thermal_changes ? 'bg-primary' : 'bg-slate-300'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${
                    notifications.notif_thermal_changes ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </div>
            </div>
          </div>

        </div>

        <div className="pt-6 flex justify-end">
          <button
            type="button"
            onClick={handleSaveNotifications}
            disabled={notificationsLoading}
            className="px-5 py-2.5 rounded-xl bg-primary hover:bg-emerald-800 text-white font-semibold text-sm shadow-sm transition-all flex items-center gap-2 active:scale-98 disabled:opacity-50 cursor-pointer"
          >
            {notificationsLoading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Enregistrement en cours...</span>
              </>
            ) : (
              <>
                <CheckCheck className="w-4 h-4" />
                <span>Enregistrer les préférences de notification</span>
              </>
            )}
          </button>
        </div>
      </section>

    </div>
  );
}
