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
  AtSign,
  Megaphone,
  MessageSquare,
  Flame,
  Home,
  Users,
  CheckSquare,
  Clock,
  Power,
  Receipt,
  Landmark,
  Wallet
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

  // --- États Préférences de Notifications (6 Domaines Thématiques) ---
  const [notifications, setNotifications] = useState({
    notif_task_assigned: true,
    notify_new_task: true,
    notify_task_creation: false,
    notif_task_completed: true,
    notif_vote_required: true,
    notify_pending_vote: true,
    notify_vote_arbitration: false,
    notify_final_decision: true,
    notify_mentions: true,
    notif_chat_mentions: true,
    notify_mention_all: true,
    notif_task_chat_activity: false,
    notif_vote_chat_activity: false,
    notif_stay_booked: true,
    notify_new_stay: true,
    notif_stay_reminder: true,
    notif_heating_start: true,
    notif_heating_stop: true,
    notif_thermal_changes: false,
    notify_thermal_changes: false,
    notify_vote_creation: false,
    notif_new_invoices: true,
    notif_calls_for_funds: true
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
          const taskCreationPref = Boolean(
            settings.notify_task_creation != null
              ? settings.notify_task_creation
              : (userProfile?.notify_task_creation ?? false)
          );
          const mentionAllPref = Boolean(
            settings.notify_mention_all != null
              ? settings.notify_mention_all
              : (userProfile?.notify_mention_all ?? true)
          );
          const voteCreationPref = Boolean(
            settings.notify_vote_creation != null
              ? settings.notify_vote_creation
              : (userProfile?.notify_vote_creation ?? false)
          );
          const voteArbitrationPref = Boolean(
            settings.notify_vote_arbitration != null
              ? settings.notify_vote_arbitration
              : (userProfile?.notify_vote_arbitration ?? false)
          );
          setNotifications({
            notif_task_assigned: (settings.notif_task_assigned != null ? settings.notif_task_assigned : (settings.notify_new_task != null ? settings.notify_new_task : (userProfile?.notif_task_assigned ?? true))) !== false,
            notify_new_task: (settings.notify_new_task != null ? settings.notify_new_task : (settings.notif_task_assigned != null ? settings.notif_task_assigned : (userProfile?.notif_task_assigned ?? true))) !== false,
            notify_task_creation: taskCreationPref,
            notif_task_completed: (settings.notif_task_completed != null ? settings.notif_task_completed : (userProfile?.notif_task_completed ?? true)) !== false,
            notif_vote_required: (settings.notif_vote_required != null ? settings.notif_vote_required : (settings.notif_vote_needed != null ? settings.notif_vote_needed : (settings.notify_pending_vote != null ? settings.notify_pending_vote : (userProfile?.notif_vote_needed ?? true)))) !== false,
            notify_pending_vote: (settings.notify_pending_vote != null ? settings.notify_pending_vote : (settings.notif_vote_needed != null ? settings.notif_vote_needed : true)) !== false,
            notify_vote_arbitration: voteArbitrationPref,
            notify_final_decision: settings.notify_final_decision !== false,
            notify_mentions: (settings.notify_mentions != null ? settings.notify_mentions : (settings.notif_chat_mentions != null ? settings.notif_chat_mentions : (userProfile?.notify_mentions ?? true))) !== false,
            notif_chat_mentions: (settings.notif_chat_mentions != null ? settings.notif_chat_mentions : (settings.notify_mentions != null ? settings.notify_mentions : (userProfile?.notify_mentions ?? true))) !== false,
            notify_mention_all: mentionAllPref,
            notif_task_chat_activity: Boolean(settings.notif_task_chat_activity != null ? settings.notif_task_chat_activity : (userProfile?.notif_task_chat_activity ?? false)),
            notif_vote_chat_activity: Boolean(settings.notif_vote_chat_activity != null ? settings.notif_vote_chat_activity : (userProfile?.notif_vote_chat_activity ?? false)),
            notif_stay_booked: (settings.notif_stay_booked != null ? settings.notif_stay_booked : (settings.notify_new_stay != null ? settings.notify_new_stay : (userProfile?.notif_stay_booked ?? true))) !== false,
            notify_new_stay: (settings.notify_new_stay != null ? settings.notify_new_stay : (settings.notif_stay_booked != null ? settings.notif_stay_booked : true)) !== false,
            notif_stay_reminder: (settings.notif_stay_reminder != null ? settings.notif_stay_reminder : (userProfile?.notif_stay_reminder ?? true)) !== false,
            notif_heating_start: (settings.notif_heating_start != null ? settings.notif_heating_start : (userProfile?.notif_heating_start ?? true)) !== false,
            notif_heating_stop: (settings.notif_heating_stop != null ? settings.notif_heating_stop : (userProfile?.notif_heating_stop ?? true)) !== false,
            notif_thermal_changes: thermalPref,
            notify_thermal_changes: thermalPref,
            notify_vote_creation: voteCreationPref,
            notif_new_invoices: (settings.notif_new_invoices != null ? settings.notif_new_invoices : (settings.notif_calls_for_funds != null ? settings.notif_calls_for_funds : (userProfile?.notif_new_invoices ?? true))) !== false,
            notif_calls_for_funds: (settings.notif_new_invoices != null ? settings.notif_new_invoices : (settings.notif_calls_for_funds != null ? settings.notif_calls_for_funds : (userProfile?.notif_new_invoices ?? true))) !== false
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

  // --- Actions Section 3 : Préférences de notification (5 Domaines) ---
  const handleToggleNotification = (key) => {
    setNotifications((prev) => {
      const nextVal = !prev[key];
      const updated = { ...prev, [key]: nextVal };
      if (key === 'notif_task_assigned') updated.notify_new_task = nextVal;
      if (key === 'notify_new_task') updated.notif_task_assigned = nextVal;
      if (key === 'notif_vote_required') {
        updated.notify_pending_vote = nextVal;
        updated.notif_vote_needed = nextVal;
      }
      if (key === 'notify_pending_vote') {
        updated.notif_vote_required = nextVal;
        updated.notif_vote_needed = nextVal;
      }
      if (key === 'notify_mentions') {
        updated.notif_chat_mentions = nextVal;
      }
      if (key === 'notif_chat_mentions') {
        updated.notify_mentions = nextVal;
      }
      if (key === 'notif_stay_booked') updated.notify_new_stay = nextVal;
      if (key === 'notify_new_stay') updated.notif_stay_booked = nextVal;
      if (key === 'notif_thermal_changes') updated.notify_thermal_changes = nextVal;
      if (key === 'notify_thermal_changes') updated.notif_thermal_changes = nextVal;
      if (key === 'notif_new_invoices') updated.notif_calls_for_funds = nextVal;
      if (key === 'notif_calls_for_funds') updated.notif_new_invoices = nextVal;
      return updated;
    });
  };

  const handleSetAllNotifications = (status) => {
    setNotifications({
      notif_task_assigned: status,
      notify_new_task: status,
      notify_task_creation: status,
      notif_task_completed: status,
      notif_vote_required: status,
      notify_pending_vote: status,
      notify_vote_arbitration: status,
      notify_final_decision: status,
      notify_mentions: status,
      notif_chat_mentions: status,
      notify_mention_all: status,
      notif_task_chat_activity: status,
      notif_vote_chat_activity: status,
      notif_stay_booked: status,
      notify_new_stay: status,
      notif_stay_reminder: status,
      notif_heating_start: status,
      notif_heating_stop: status,
      notif_thermal_changes: status,
      notify_thermal_changes: status,
      notify_vote_creation: status,
      notif_new_invoices: status,
      notif_calls_for_funds: status
    });
  };

  const handleSaveNotifications = async () => {
    try {
      setNotificationsLoading(true);
      await updateMemberSettings(profile.id || profile.prenom, notifications);
      await updateUserProfile(notifications);
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

        <div className="text-xs text-slate-600 mb-6 bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-slate-800">Découplage E-mails &amp; Cloche in-app :</span> Ces commutateurs régissent exclusivement l'envoi de courriels physiques dans votre boîte de messagerie personnelle. Quel que soit l'état de ces réglages, 100% des événements prioritaires sont systématiquement enregistrés dans la cloche de notification en haut à droite pour une visibilité permanente au sein de la SCI.
          </div>
        </div>

        {/* ======================================================== */}
        {/* 6 CARTES THÉMATIQUES DE NOTIFICATIONS                    */}
        {/* ======================================================== */}
        <div className="space-y-6">

          {/* 1. 📝 Missions & Tâches */}
          <div className="bg-slate-50/70 rounded-2xl border border-slate-200/90 p-5 sm:p-6 space-y-4 hover:border-slate-300 transition-colors shadow-2xs">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200/70 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 border border-emerald-200 shadow-2xs">
                  <ClipboardList className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                    1. 📝 Missions &amp; Tâches
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Assignation de missions, propositions en attente et complétion des chantiers
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-white text-emerald-800 border border-emerald-200 shrink-0">
                Travaux &amp; Chantiers
              </span>
            </div>

            <div className="space-y-3">
              {/* Item 1 : Nouvelle tâche assignée */}
              <div
                id="toggle-notif-task-assigned"
                onClick={() => handleToggleNotification('notif_task_assigned')}
                className={`flex items-start justify-between gap-3.5 p-3.5 sm:p-4 rounded-xl border transition-all cursor-pointer select-none ${
                  notifications.notif_task_assigned
                    ? 'border-emerald-300/80 bg-white hover:bg-emerald-50/20 shadow-xs'
                    : 'border-slate-200 bg-white/70 hover:bg-slate-100/60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 mt-0.5 border border-emerald-200 shadow-2xs">
                    <ClipboardList className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-900 block leading-snug">
                      Nouvelle tâche assignée
                    </span>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      M'alerter dès qu'un chantier m'est confié ou qu'une mission de maintenance m'est assignée.
                    </p>
                  </div>
                </div>
                <div className="shrink-0 pt-1">
                  <div className={`w-11 h-6 flex items-center rounded-full p-1 duration-300 ease-in-out ${notifications.notif_task_assigned ? 'bg-primary' : 'bg-slate-300'}`}>
                    <div className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${notifications.notif_task_assigned ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                </div>
              </div>

              {/* Item 2 : Nouvelle proposition de tâche en attente */}
              <div
                id="toggle-notify-task-creation"
                onClick={() => handleToggleNotification('notify_task_creation')}
                className={`flex items-start justify-between gap-3.5 p-3.5 sm:p-4 rounded-xl border transition-all cursor-pointer select-none ${
                  notifications.notify_task_creation
                    ? 'border-emerald-300/80 bg-white hover:bg-emerald-50/20 shadow-xs'
                    : 'border-slate-200 bg-white/70 hover:bg-slate-100/60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center shrink-0 mt-0.5 border border-teal-200 shadow-2xs">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-900 block leading-snug">
                      Nouvelle proposition de tâche en attente
                    </span>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      M'alerter par e-mail lorsqu'une nouvelle tâche est soumise en attente de création (coordination).
                    </p>
                  </div>
                </div>
                <div className="shrink-0 pt-1">
                  <div className={`w-11 h-6 flex items-center rounded-full p-1 duration-300 ease-in-out ${notifications.notify_task_creation ? 'bg-primary' : 'bg-slate-300'}`}>
                    <div className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${notifications.notify_task_creation ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                </div>
              </div>

              {/* Item 3 : Tâche complétée / mise à jour */}
              <div
                id="toggle-notif-task-completed"
                onClick={() => handleToggleNotification('notif_task_completed')}
                className={`flex items-start justify-between gap-3.5 p-3.5 sm:p-4 rounded-xl border transition-all cursor-pointer select-none ${
                  notifications.notif_task_completed
                    ? 'border-emerald-300/80 bg-white hover:bg-emerald-50/20 shadow-xs'
                    : 'border-slate-200 bg-white/70 hover:bg-slate-100/60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-green-100 text-green-800 flex items-center justify-center shrink-0 mt-0.5 border border-green-200 shadow-2xs">
                    <CheckSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-900 block leading-snug">
                      Tâche complétée / mise à jour
                    </span>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      M'alerter lorsqu'une tâche que je supervise ou qui m'intéresse est marquée comme terminée ou mise à jour.
                    </p>
                  </div>
                </div>
                <div className="shrink-0 pt-1">
                  <div className={`w-11 h-6 flex items-center rounded-full p-1 duration-300 ease-in-out ${notifications.notif_task_completed ? 'bg-primary' : 'bg-slate-300'}`}>
                    <div className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${notifications.notif_task_completed ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 2. 🗳️ Votes & Scrutins */}
          <div className="bg-slate-50/70 rounded-2xl border border-slate-200/90 p-5 sm:p-6 space-y-4 hover:border-slate-300 transition-colors shadow-2xs">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200/70 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center shrink-0 border border-purple-200 shadow-2xs">
                  <Vote className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                    2. 🗳️ Votes &amp; Scrutins
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Consultations formelles des associés, arbitrages et alertes collectives
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-white text-purple-800 border border-purple-200 shrink-0">
                Gouvernance SCI
              </span>
            </div>

            <div className="space-y-3">
              {/* Item 1 : Nouveau vote ouvert */}
              <div
                id="toggle-notif-vote-required"
                onClick={() => handleToggleNotification('notif_vote_required')}
                className={`flex items-start justify-between gap-3.5 p-3.5 sm:p-4 rounded-xl border transition-all cursor-pointer select-none ${
                  notifications.notif_vote_required
                    ? 'border-emerald-300/80 bg-white hover:bg-emerald-50/20 shadow-xs'
                    : 'border-slate-200 bg-white/70 hover:bg-slate-100/60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center shrink-0 mt-0.5 border border-purple-200 shadow-2xs">
                    <Vote className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-900 block leading-snug">
                      Nouveau vote ouvert
                    </span>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      M'alerter dès qu'un scrutin ou une délibération est ouvert(e) aux votes des associés.
                    </p>
                  </div>
                </div>
                <div className="shrink-0 pt-1">
                  <div className={`w-11 h-6 flex items-center rounded-full p-1 duration-300 ease-in-out ${notifications.notif_vote_required ? 'bg-primary' : 'bg-slate-300'}`}>
                    <div className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${notifications.notif_vote_required ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                </div>
              </div>

              {/* Item 2 : Vote en attente d'arbitrage / clôture */}
              <div
                id="toggle-notify-vote-arbitration"
                onClick={() => handleToggleNotification('notify_vote_arbitration')}
                className={`flex items-start justify-between gap-3.5 p-3.5 sm:p-4 rounded-xl border transition-all cursor-pointer select-none ${
                  notifications.notify_vote_arbitration
                    ? 'border-emerald-300/80 bg-white hover:bg-emerald-50/20 shadow-xs'
                    : 'border-slate-200 bg-white/70 hover:bg-slate-100/60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 mt-0.5 border border-amber-200 shadow-2xs">
                    <Scale className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-900 block leading-snug">
                      Vote en attente d'arbitrage / clôture
                    </span>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      M'alerter lorsqu'un scrutin atteint le quorum ou nécessite un arbitrage final (validation du résultat ou report en AG).
                    </p>
                  </div>
                </div>
                <div className="shrink-0 pt-1">
                  <div className={`w-11 h-6 flex items-center rounded-full p-1 duration-300 ease-in-out ${notifications.notify_vote_arbitration ? 'bg-primary' : 'bg-slate-300'}`}>
                    <div className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${notifications.notify_vote_arbitration ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 3. 💬 Discussions & Chat */}
          <div className="bg-slate-50/70 rounded-2xl border border-slate-200/90 p-5 sm:p-6 space-y-4 hover:border-slate-300 transition-colors shadow-2xs">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200/70 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center shrink-0 border border-teal-200 shadow-2xs">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                    3. 💬 Discussions &amp; Chat
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Notifications de mentions directes (@vous, @all) et suivi d'activité sur vos sujets
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-white text-teal-800 border border-teal-200 shrink-0">
                Messagerie &amp; Échanges
              </span>
            </div>

            <div className="space-y-3">
              {/* Item 1 : Mentions dans le chat */}
              <div
                id="toggle-notify-mentions"
                onClick={() => handleToggleNotification('notify_mentions')}
                className={`flex items-start justify-between gap-3.5 p-3.5 sm:p-4 rounded-xl border transition-all cursor-pointer select-none ${
                  notifications.notify_mentions
                    ? 'border-emerald-300/80 bg-white hover:bg-emerald-50/20 shadow-xs'
                    : 'border-slate-200 bg-white/70 hover:bg-slate-100/60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 mt-0.5 border border-emerald-200 shadow-2xs">
                    <AtSign className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-900 block leading-snug">
                      Mentions dans le chat (@vous, @all)
                    </span>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      M'alerter par e-mail lorsque je suis mentionné nominativement (@mon_prénom) ou collectivement (@all / @tous) dans le chat d'une tâche ou d'un vote.
                    </p>
                  </div>
                </div>
                <div className="shrink-0 pt-1">
                  <div className={`w-11 h-6 flex items-center rounded-full p-1 duration-300 ease-in-out ${notifications.notify_mentions ? 'bg-primary' : 'bg-slate-300'}`}>
                    <div className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${notifications.notify_mentions ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                </div>
              </div>

              {/* Item 2 : Nouveaux messages sur mes tâches */}
              <div
                id="toggle-notif-task-chat-activity"
                onClick={() => handleToggleNotification('notif_task_chat_activity')}
                className={`flex items-start justify-between gap-3.5 p-3.5 sm:p-4 rounded-xl border transition-all cursor-pointer select-none ${
                  notifications.notif_task_chat_activity
                    ? 'border-emerald-300/80 bg-white hover:bg-emerald-50/20 shadow-xs'
                    : 'border-slate-200 bg-white/70 hover:bg-slate-100/60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center shrink-0 mt-0.5 border border-blue-200 shadow-2xs">
                    <ClipboardList className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-900 block leading-snug">
                      Nouveaux messages sur mes tâches
                    </span>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      M'alerter par e-mail à chaque nouveau message d'un associé posté sur une tâche ou un chantier que j'ai créé ou proposé.
                    </p>
                  </div>
                </div>
                <div className="shrink-0 pt-1">
                  <div className={`w-11 h-6 flex items-center rounded-full p-1 duration-300 ease-in-out ${notifications.notif_task_chat_activity ? 'bg-primary' : 'bg-slate-300'}`}>
                    <div className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${notifications.notif_task_chat_activity ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                </div>
              </div>

              {/* Item 3 : Nouveaux messages sur mes votes */}
              <div
                id="toggle-notif-vote-chat-activity"
                onClick={() => handleToggleNotification('notif_vote_chat_activity')}
                className={`flex items-start justify-between gap-3.5 p-3.5 sm:p-4 rounded-xl border transition-all cursor-pointer select-none ${
                  notifications.notif_vote_chat_activity
                    ? 'border-emerald-300/80 bg-white hover:bg-emerald-50/20 shadow-xs'
                    : 'border-slate-200 bg-white/70 hover:bg-slate-100/60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center shrink-0 mt-0.5 border border-purple-200 shadow-2xs">
                    <Vote className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-900 block leading-snug">
                      Nouveaux messages sur mes votes
                    </span>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      M'alerter par e-mail à chaque nouveau message d'un associé posté sur un vote ou une délibération dont je suis l'initiateur.
                    </p>
                  </div>
                </div>
                <div className="shrink-0 pt-1">
                  <div className={`w-11 h-6 flex items-center rounded-full p-1 duration-300 ease-in-out ${notifications.notif_vote_chat_activity ? 'bg-primary' : 'bg-slate-300'}`}>
                    <div className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${notifications.notif_vote_chat_activity ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 4. 📅 Réservations */}
          <div className="bg-slate-50/70 rounded-2xl border border-slate-200/90 p-5 sm:p-6 space-y-4 hover:border-slate-300 transition-colors shadow-2xs">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200/70 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center shrink-0 border border-blue-200 shadow-2xs">
                  <CalendarDays className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                    4. 📅 Réservations
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Calendrier d'occupation des propriétés et passages des associés
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-white text-blue-800 border border-blue-200 shrink-0">
                Calendrier &amp; Séjours
              </span>
            </div>

            <div className="space-y-3">
              {/* Item 1 : Nouveau séjour réservé */}
              <div
                id="toggle-notif-stay-booked"
                onClick={() => handleToggleNotification('notif_stay_booked')}
                className={`flex items-start justify-between gap-3.5 p-3.5 sm:p-4 rounded-xl border transition-all cursor-pointer select-none ${
                  notifications.notif_stay_booked
                    ? 'border-emerald-300/80 bg-white hover:bg-emerald-50/20 shadow-xs'
                    : 'border-slate-200 bg-white/70 hover:bg-slate-100/60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center shrink-0 mt-0.5 border border-blue-200 shadow-2xs">
                    <CalendarDays className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-900 block leading-snug">
                      Nouveau séjour réservé
                    </span>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      M'alerter dès qu'une réservation est ajoutée au calendrier au Presbytère ou à Rosings.
                    </p>
                  </div>
                </div>
                <div className="shrink-0 pt-1">
                  <div className={`w-11 h-6 flex items-center rounded-full p-1 duration-300 ease-in-out ${notifications.notif_stay_booked ? 'bg-primary' : 'bg-slate-300'}`}>
                    <div className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${notifications.notif_stay_booked ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 5. 🏡 Séjour & Confort Thermique */}
          <div className="bg-slate-50/70 rounded-2xl border border-slate-200/90 p-5 sm:p-6 space-y-4 hover:border-slate-300 transition-colors shadow-2xs">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200/70 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 border border-amber-200 shadow-2xs">
                  <Thermometer className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                    5. 🏡 Séjour &amp; Confort Thermique
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Rappels d'arrivée, automatisation du chauffage ViCare et gestion hors-gel
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-white text-amber-800 border border-amber-200 shrink-0">
                Énergie &amp; Confort
              </span>
            </div>

            <div className="space-y-3">
              {/* Item 1 : Rappel de séjour avant arrivée (48h avant) */}
              <div
                id="toggle-notif-stay-reminder"
                onClick={() => handleToggleNotification('notif_stay_reminder')}
                className={`flex items-start justify-between gap-3.5 p-3.5 sm:p-4 rounded-xl border transition-all cursor-pointer select-none ${
                  notifications.notif_stay_reminder
                    ? 'border-emerald-300/80 bg-white hover:bg-emerald-50/20 shadow-xs'
                    : 'border-slate-200 bg-white/70 hover:bg-slate-100/60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 mt-0.5 border border-amber-200 shadow-2xs">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-900 block leading-snug">
                      Rappel de séjour avant arrivée (48h avant)
                    </span>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      Recevoir un rappel automatique 48h avant le début d'un séjour réservé pour anticiper l'arrivée et les besoins.
                    </p>
                  </div>
                </div>
                <div className="shrink-0 pt-1">
                  <div className={`w-11 h-6 flex items-center rounded-full p-1 duration-300 ease-in-out ${notifications.notif_stay_reminder ? 'bg-primary' : 'bg-slate-300'}`}>
                    <div className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${notifications.notif_stay_reminder ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                </div>
              </div>

              {/* Item 2 : Démarrage automatique du chauffage (24h avant l'arrivée) */}
              <div
                id="toggle-notif-heating-start"
                onClick={() => handleToggleNotification('notif_heating_start')}
                className={`flex items-start justify-between gap-3.5 p-3.5 sm:p-4 rounded-xl border transition-all cursor-pointer select-none ${
                  notifications.notif_heating_start
                    ? 'border-emerald-300/80 bg-white hover:bg-emerald-50/20 shadow-xs'
                    : 'border-slate-200 bg-white/70 hover:bg-slate-100/60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-orange-100 text-orange-800 flex items-center justify-center shrink-0 mt-0.5 border border-orange-200 shadow-2xs">
                    <Flame className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-900 block leading-snug">
                      Démarrage automatique du chauffage (24h avant l'arrivée)
                    </span>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      Être notifié de l'enclenchement automatique du préchauffage 24h avant l'arrivée pour un confort thermique optimal.
                    </p>
                  </div>
                </div>
                <div className="shrink-0 pt-1">
                  <div className={`w-11 h-6 flex items-center rounded-full p-1 duration-300 ease-in-out ${notifications.notif_heating_start ? 'bg-primary' : 'bg-slate-300'}`}>
                    <div className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${notifications.notif_heating_start ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                </div>
              </div>

              {/* Item 3 : Arrêt / passage hors-gel du chauffage au départ */}
              <div
                id="toggle-notif-heating-stop"
                onClick={() => handleToggleNotification('notif_heating_stop')}
                className={`flex items-start justify-between gap-3.5 p-3.5 sm:p-4 rounded-xl border transition-all cursor-pointer select-none ${
                  notifications.notif_heating_stop
                    ? 'border-emerald-300/80 bg-white hover:bg-emerald-50/20 shadow-xs'
                    : 'border-slate-200 bg-white/70 hover:bg-slate-100/60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center shrink-0 mt-0.5 border border-blue-200 shadow-2xs">
                    <Power className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-900 block leading-snug">
                      Arrêt / passage hors-gel du chauffage au départ
                    </span>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      Être informé de la mise hors-gel automatique et de l'arrêt des circuits de chauffage à la fin du séjour.
                    </p>
                  </div>
                </div>
                <div className="shrink-0 pt-1">
                  <div className={`w-11 h-6 flex items-center rounded-full p-1 duration-300 ease-in-out ${notifications.notif_heating_stop ? 'bg-primary' : 'bg-slate-300'}`}>
                    <div className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${notifications.notif_heating_stop ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                </div>
              </div>

              {/* Item 4 : Modifications des consignes thermiques & commandes manuelles */}
              <div
                id="toggle-notif-thermal-changes"
                onClick={() => handleToggleNotification('notif_thermal_changes')}
                className={`flex items-start justify-between gap-3.5 p-3.5 sm:p-4 rounded-xl border transition-all cursor-pointer select-none ${
                  notifications.notif_thermal_changes
                    ? 'border-emerald-300/80 bg-white hover:bg-emerald-50/20 shadow-xs'
                    : 'border-slate-200 bg-white/70 hover:bg-slate-100/60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 mt-0.5 border border-amber-200 shadow-2xs">
                    <span className="material-symbols-outlined text-[18px]">thermostat</span>
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-900 block leading-snug">
                      Modifications des consignes thermiques &amp; commandes manuelles
                    </span>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      Recevoir un e-mail dès qu'un associé modifie les températures de consigne (générales ou par séjour) ou actionne le chauffage / la piscine.
                    </p>
                  </div>
                </div>
                <div className="shrink-0 pt-1">
                  <div className={`w-11 h-6 flex items-center rounded-full p-1 duration-300 ease-in-out ${notifications.notif_thermal_changes ? 'bg-primary' : 'bg-slate-300'}`}>
                    <div className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${notifications.notif_thermal_changes ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 6. 💶 Cotisations & Appels de Fonds */}
          <div className="bg-slate-50/70 rounded-2xl border border-slate-200/90 p-5 sm:p-6 space-y-4 hover:border-slate-300 transition-colors shadow-2xs">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200/70 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 border border-emerald-200 shadow-2xs">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                    6. 💶 Cotisations &amp; Appels de Fonds
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Appels de cotisations mensuelles, compensation des avances et coordonnées bancaires SEPA
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-white text-emerald-800 border border-emerald-200 shrink-0">
                Finances &amp; Trésorerie
              </span>
            </div>

            <div className="space-y-3">
              {/* Item 1 : Appels de fonds & avis de cotisations mensuelles */}
              <div
                id="toggle-notif-new-invoices"
                onClick={() => handleToggleNotification('notif_new_invoices')}
                className={`flex items-start justify-between gap-3.5 p-3.5 sm:p-4 rounded-xl border transition-all cursor-pointer select-none ${
                  notifications.notif_new_invoices
                    ? 'border-emerald-300/80 bg-white hover:bg-emerald-50/20 shadow-xs'
                    : 'border-slate-200 bg-white/70 hover:bg-slate-100/60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 mt-0.5 border border-emerald-200 shadow-2xs">
                    <Receipt className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-900 block leading-snug">
                      Appels de fonds &amp; avis de cotisations mensuelles
                    </span>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      Recevoir un e-mail avec l'avis récapitulatif mensuel et le QR-code de virement dès que votre quote-part nette est émise.
                    </p>
                  </div>
                </div>
                <div className="shrink-0 pt-1">
                  <div className={`w-11 h-6 flex items-center rounded-full p-1 duration-300 ease-in-out ${notifications.notif_new_invoices ? 'bg-primary' : 'bg-slate-300'}`}>
                    <div className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${notifications.notif_new_invoices ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                </div>
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
