import React, { useState, useEffect } from 'react';
import { BookOpen, Search, Plus, Trash2 } from 'lucide-react';
import { fetchVademecum, createVademecumItem, deleteVademecumItem } from '../api';
import SejourCutoffMapModal from '../components/sejour/SejourCutoffMapModal';
import SejourDepartureChecklistModal from '../components/sejour/SejourDepartureChecklistModal';
import SejourTaskModal from '../components/sejour/SejourTaskModal';
import SejourEditModal from '../components/sejour/SejourEditModal';

export default function VademecumPage({ properties, currentUser }) {
  // Stay Banner State
  const [stayData, setStayData] = useState({
    weekLabel: 'Semaine 42 - Du 17 au 20 Octobre (Automne 2026)',
    status: 'Mission technique sur place',
    weather: '14°C • Éclaircies (Mesnil-sur-Iton)',
    arrivalDate: 'Vendredi 19 Oct. • 18h00',
    departureDate: 'Dimanche 25 Oct. • 18h00',
  });

  // Modals state
  const [isEditStayOpen, setIsEditStayOpen] = useState(false);
  const [isCutoffModalOpen, setIsCutoffModalOpen] = useState(false);
  const [isChecklistModalOpen, setIsChecklistModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  // Toast notification state
  const [toastMessage, setToastMessage] = useState(null);
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 3 Missions for Henri Jamet
  const [tasks, setTasks] = useState([
    {
      id: 'task-toiture-pac',
      title: 'Contrôle toiture & révision PAC avec artisan',
      priority: 'Priorité Haute • Bâti',
      priorityType: 'high',
      date: 'Samedi 20 oct. 10h',
      budget: 'Devis ~1 200 € TTC',
      budgetType: 'Budget prévisionnel',
      description: 'Présence Éts Josse samedi 20 oct. 10h. Vérifier purge des 8 radiateurs et étanchéité raccord solin aile nord.',
      assignee: 'Henri Jamet',
      partner: 'Avec Éts Josse',
      status: 'active',
      details: {
        artisan: 'Éts Josse Plomberie-Chauffage',
        points: [
          'Vérification étanchéité solin zinc et faîtage aile nord',
          'Purge des 8 radiateurs en fonte et équilibrage des tés',
          'Contrôle pression vase d\'expansion chaudière Vitocal',
          'Vérification purgeur automatique et disconnecteur'
        ]
      }
    },
    {
      id: 'task-purge-robinets',
      title: 'Purge et vidange des robinets de puisage',
      priority: 'Priorité Normale • Plomberie',
      priorityType: 'normal',
      date: 'Avant gelées',
      budget: '~45 € TTC',
      budgetType: 'Consommables',
      description: 'Extérieurs jardin ouest & local technique piscine pour sécurisation antigel avant premières gelées normandes.',
      assignee: 'Henri Jamet',
      partner: 'Autonomie',
      status: 'active',
      details: {
        points: [
          'Fermeture de la vanne d\'isolement extérieure au sous-sol',
          'Ouverture complète des robinets extérieurs jardin ouest',
          'Vidange du purgeur bas et soufflage d\'air résiduel',
          'Pose des manchons isolants sur conduites exposées'
        ]
      }
    },
    {
      id: 'task-repeater-wifi',
      title: 'Répéteur Wi-Fi longue portée vers Le Presbytère',
      priority: 'Priorité Normale • Télécom AG',
      priorityType: 'normal',
      date: 'Délai 30/11',
      budget: '120 € TTC',
      budgetType: 'Matériel AG',
      description: 'Installation antenne relais validée en AG pour résiliation abonnement internet doublon au 30/11.',
      assignee: 'Henri Jamet',
      partner: 'Avec Alex Martin',
      status: 'active',
      details: {
        points: [
          'Montage antenne relais Ubiquiti Outdoor sur pignon grange',
          'Alignement faisceau directionnel vers Presbytère',
          'Test de débit (minimum garanti 80 Mb/s symétrique)',
          'Résiliation forfait fibre secondaire Orange (économie 38€/mois)'
        ]
      }
    }
  ]);

  const handleToggleTaskComplete = (taskId) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === taskId) {
          const nextStatus = t.status === 'completed' ? 'active' : 'completed';
          showToast(
            nextStatus === 'completed'
              ? `Action validée : « ${t.title} » ✅`
              : `Tâche réactivée : « ${t.title} »`
          );
          return { ...t, status: nextStatus };
        }
        return t;
      })
    );
  };

  const handleOpenTaskDetail = (task) => {
    setSelectedTask(task);
    setIsTaskModalOpen(true);
  };

  // WiFi password copy
  const [wifiCopied, setWifiCopied] = useState(false);
  const handleCopyWifi = () => {
    navigator.clipboard.writeText('HellenvilliersManoir2026!');
    setWifiCopied(true);
    showToast('Mot de passe Wi-Fi copié : HellenvilliersManoir2026!');
    setTimeout(() => setWifiCopied(false), 2500);
  };

  // Full Vademecum Database Section Toggle & State
  const [showFullVademecum, setShowFullVademecum] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('Toutes');
  const [searchQuery, setSearchQuery] = useState('');
  const [vademecumItems, setVademecumItems] = useState([]);
  const [loadingDb, setLoadingDb] = useState(false);
  const [dbError, setDbError] = useState(null);
  const [copiedDbId, setCopiedDbId] = useState(null);

  // New Item modal state
  const [isNewItemModalOpen, setIsNewItemModalOpen] = useState(false);
  const [newCategory, setNewCategory] = useState('Wi-Fi & Réseau');
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCodeToCopy, setNewCodeToCopy] = useState('');
  const [newImportance, setNewImportance] = useState('INFO');
  const [submittingItem, setSubmittingItem] = useState(false);

  const categories = [
    'Toutes',
    'Wi-Fi & Réseau',
    'Accès & Clés',
    'Eau & Électricité',
    'Chauffage & Fioul',
    'Déchets & Recyclage',
    'Équipements & Notice',
    'Urgence'
  ];

  const loadVademecumDb = async () => {
    try {
      setLoadingDb(true);
      setDbError(null);
      const params = {};
      if (selectedCategory !== 'Toutes') params.category = selectedCategory;
      const data = await fetchVademecum(params);
      if (data && data.error) throw new Error(data.error);
      setVademecumItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('Vademecum DB notice:', err.message);
      setDbError(err.message || 'Mode local actif');
      setVademecumItems([]);
    } finally {
      setLoadingDb(false);
    }
  };

  useEffect(() => {
    if (showFullVademecum) {
      loadVademecumDb();
    }
  }, [showFullVademecum, selectedCategory]);

  const handleCreateDbItem = async (e) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;
    try {
      setSubmittingItem(true);
      await createVademecumItem({
        property_id: properties?.[0]?.id || 1,
        category: newCategory,
        title: newTitle.trim(),
        content: newContent.trim(),
        code_to_copy: newCodeToCopy.trim() || null,
        importance: newImportance
      });
      setNewTitle('');
      setNewContent('');
      setNewCodeToCopy('');
      setIsNewItemModalOpen(false);
      showToast('Fiche Vademecum enregistrée !');
      await loadVademecumDb();
    } catch (err) {
      console.error('Failed to create item:', err);
      showToast(`Erreur : ${err.message}`);
    } finally {
      setSubmittingItem(false);
    }
  };

  const handleDeleteDbItem = async (itemId) => {
    if (!window.confirm('Voulez-vous vraiment supprimer cette fiche Vademecum ?')) return;
    try {
      await deleteVademecumItem(itemId);
      showToast('Fiche Vademecum supprimée');
      await loadVademecumDb();
    } catch (err) {
      console.error('Failed to delete item:', err);
    }
  };

  const handleCopyDbCode = (id, code) => {
    navigator.clipboard.writeText(code);
    setCopiedDbId(id);
    showToast(`Code copié : ${code}`);
    setTimeout(() => setCopiedDbId(null), 2000);
  };

  const filteredDbItems = vademecumItems.filter((item) => {
    const q = searchQuery.toLowerCase();
    return (
      item.title?.toLowerCase().includes(q) ||
      item.content?.toLowerCase().includes(q) ||
      item.category?.toLowerCase().includes(q) ||
      (item.code_to_copy && item.code_to_copy.toLowerCase().includes(q))
    );
  });

  return (
    <div className="relative w-full max-w-[1360px] mx-auto pb-16 selection:bg-emerald-100 selection:text-emerald-900">
      
      {/* Subtle decorative ambient background glows contained within viewport bounds */}
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-primary-container/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute top-1/3 -left-40 w-[420px] h-[420px] bg-secondary-container/15 rounded-full blur-3xl pointer-events-none"></div>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-forest-deep text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200 border border-emerald-500/30">
          <span className="material-symbols-outlined text-secondary text-[22px]">check_circle</span>
          <span className="text-xs font-semibold">{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="text-white/70 hover:text-white ml-2"
            type="button"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 1. EN-TÊTE DU SÉJOUR                                                  */}
      {/* ===================================================================== */}
      <section className="relative bg-surface-container-lowest rounded-lg p-6 sm:p-8 lg:p-10 shadow-sm border border-border-subtle mb-10 overflow-hidden">
        <div className="relative z-10 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-8">
          
          {/* Left: Stay Identifiers & Status */}
          <div className="flex flex-col gap-4 max-w-2xl">
            <div className="flex flex-wrap items-center gap-3">
              <span className="px-3 py-1 rounded-full bg-surface-container font-label-sm text-label-sm text-on-surface-variant font-medium">
                {stayData.weekLabel}
              </span>
              <span className="px-3 py-1 rounded-full bg-amber-soft font-label-sm text-label-sm text-amber-rich flex items-center gap-1 font-semibold">
                <span className="material-symbols-outlined text-[16px]">engineering</span>
                {stayData.status}
              </span>
              <span className="px-3 py-1 rounded-full bg-sage-soft font-label-sm text-label-sm text-primary flex items-center gap-1.5 font-semibold">
                <span className="material-symbols-outlined text-[16px] text-amber-600">partly_cloudy_day</span>
                {stayData.weather}
              </span>
            </div>

            <div>
              <h1 className="font-display-lg text-display-lg text-primary tracking-tight leading-tight">
                Mon Prochain Séjour au Domaine
              </h1>
            </div>

            {/* Schedule badges */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="flex items-center gap-3.5 p-3.5 rounded-xl bg-canvas-slate shadow-sm border border-border-subtle">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-primary text-[22px]">flight_land</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-label-sm text-label-sm text-on-surface-variant">Arrivée programmée</span>
                  <span className="font-headline-sm text-headline-sm text-on-surface font-bold">
                    {stayData.arrivalDate}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3.5 p-3.5 rounded-xl bg-canvas-slate shadow-sm border border-border-subtle">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-primary text-[22px]">flight_takeoff</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-label-sm text-label-sm text-on-surface-variant">Départ & Hors-gel</span>
                  <span className="font-headline-sm text-headline-sm text-on-surface font-bold">
                    {stayData.departureDate}
                  </span>
                </div>
              </div>
            </div>

            {/* Capacity & Occupants breakdown */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <div className="inline-flex items-center gap-2 p-1.5 px-3 rounded-xl bg-sage-soft border border-sage-border text-on-surface shadow-sm">
                <div className="w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[16px]">person</span>
                </div>
                <div className="flex items-center gap-1.5 font-label-sm text-label-sm">
                  <span className="font-bold text-primary">Henri Jamet</span>
                  <span className="text-[11px] text-on-surface-variant">(Gérant)</span>
                </div>
              </div>

              <div className="inline-flex items-center gap-2 p-1.5 px-3 rounded-xl bg-canvas-slate border border-border-subtle text-on-surface shadow-sm">
                <div className="w-6 h-6 rounded-full bg-secondary-container/15 text-secondary flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[16px]">family_restroom</span>
                </div>
                <div className="flex items-center gap-1.5 font-label-sm text-label-sm">
                  <span className="font-semibold text-on-surface">Sophie Dergul</span>
                </div>
              </div>
            </div>

            {/* Rooms allocated */}
            <div className="flex flex-col gap-2 pt-1 font-label-sm text-label-sm text-on-surface-variant">
              <div className="flex flex-wrap items-center gap-2">
                <span className="material-symbols-outlined text-outline text-[18px]">bed</span>
                <span className="font-semibold text-on-surface">Villa Rosing :</span>
                <span className="px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface font-medium">Haut droite (2 couchages)</span>
                <span className="px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface font-medium">Haut gauche (2 couchages)</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="material-symbols-outlined text-outline text-[18px]">holiday_village</span>
                <span className="font-semibold text-on-surface">Hellenvilliers :</span>
                <span className="px-2.5 py-0.5 rounded-full bg-surface-container-low border border-border-subtle text-on-surface font-medium">Suite parentale</span>
                <span className="px-2.5 py-0.5 rounded-full bg-surface-container-low border border-border-subtle text-on-surface font-medium">Mezzanine</span>
              </div>
            </div>

          </div>

          {/* Right: Fast Actions Panel (senior-friendly large targets) */}
          <div className="flex flex-col sm:flex-row xl:flex-col gap-3.5 w-full xl:w-72 shrink-0">
            <button
              onClick={() => setIsEditStayOpen(true)}
              className="w-full h-14 px-6 rounded-full bg-surface-container-lowest border-2 border-primary text-primary hover:bg-sage-soft active:bg-primary-fixed-dim transition-all shadow-sm flex items-center justify-center gap-2.5 font-label-lg text-label-lg group font-bold"
              type="button"
            >
              <span className="material-symbols-outlined text-[22px] group-hover:scale-110 transition-transform">edit_calendar</span>
              <span>Modifier le séjour</span>
            </button>

            <button
              onClick={() => window.print()}
              className="w-full h-14 px-6 rounded-full bg-surface-container-lowest border-2 border-primary text-primary hover:bg-sage-soft active:bg-primary-fixed-dim transition-all shadow-sm flex items-center justify-center gap-2.5 font-label-lg text-label-lg group font-bold"
              type="button"
            >
              <span className="material-symbols-outlined text-[22px] group-hover:scale-110 transition-transform">print</span>
              <span>Feuille d'arrivée (PDF)</span>
            </button>
          </div>

        </div>
      </section>

      {/* ===================================================================== */}
      {/* 2. MISSIONS & TÂCHES SOUS VOTRE RESPONSABILITÉ                        */}
      {/* ===================================================================== */}
      <section className="bg-surface-container-lowest rounded-lg p-6 sm:p-8 lg:p-10 shadow-sm border border-outline-variant/30 mb-10 flex flex-col gap-6">
        
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-outline-variant/20 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-on-surface-variant font-medium">Henri Jamet</span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sage-soft text-primary font-label-sm text-xs font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                {tasks.filter(t => t.status === 'active').length} Tâches actives sur place
              </span>
            </div>
            <h2 className="font-headline-md text-headline-md text-forest-deep font-bold tracking-tight mt-1">
              Missions & Tâches sous votre responsabilité
            </h2>
          </div>
        </div>

        {/* 3 Tasks Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          
          {/* Tâche 1: Contrôle toiture & révision PAC Éts Josse */}
          <article className={`rounded-xl p-5 border-2 shadow-sm flex flex-col justify-between gap-4 transition-all hover:shadow-md ${
            tasks[0].status === 'completed'
              ? 'bg-sage-soft/30 border-sage-border'
              : 'bg-amber-soft/30 border-amber-rich/40'
          }`}>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                    tasks[0].status === 'completed' ? 'bg-primary text-white' : 'bg-amber-rich text-white'
                  }`}>
                    <span className="material-symbols-outlined text-[14px]">
                      {tasks[0].status === 'completed' ? 'check' : 'warning'}
                    </span>
                    {tasks[0].status === 'completed' ? 'Validée • Bâti' : tasks[0].priority}
                  </span>
                  <span className="text-xs text-amber-rich font-semibold">{tasks[0].date}</span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-on-surface-variant font-medium block">Budget prévisionnel</span>
                  <span className="font-headline-sm text-amber-rich font-bold text-sm">{tasks[0].budget}</span>
                </div>
              </div>

              <div>
                <h3 className="font-headline-sm text-headline-sm text-forest-deep font-bold">
                  {tasks[0].title}
                </h3>
                <p className="font-body-md text-on-surface-variant text-xs leading-relaxed mt-1">
                  {tasks[0].description}
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-amber-rich/20 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-amber-rich text-white flex items-center justify-center font-bold text-xs">
                  HJ
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-xs font-semibold text-on-surface">En charge : {tasks[0].assignee}</span>
                  <span className="text-[11px] text-on-surface-variant">{tasks[0].partner}</span>
                </div>
              </div>
              <button
                onClick={() => handleOpenTaskDetail(tasks[0])}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-DEFAULT bg-white border-2 border-amber-rich text-amber-rich font-label-sm text-xs font-bold hover:bg-amber-soft transition-colors shadow-sm"
                type="button"
              >
                <span className="material-symbols-outlined text-[16px]">construction</span>
                <span>Consulter la tâche</span>
              </button>
            </div>
          </article>

          {/* Tâche 2: Purge robinets de puisage */}
          <article className={`rounded-xl p-5 border shadow-sm flex flex-col justify-between gap-4 transition-all hover:shadow-md ${
            tasks[1].status === 'completed'
              ? 'bg-sage-soft/30 border-sage-border'
              : 'bg-white border-outline-variant/40'
          }`}>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                    tasks[1].status === 'completed' ? 'bg-primary text-white' : 'bg-sage-soft text-primary'
                  }`}>
                    <span className="material-symbols-outlined text-[14px]">
                      {tasks[1].status === 'completed' ? 'check' : 'plumbing'}
                    </span>
                    {tasks[1].status === 'completed' ? 'Validée • Antigel OK' : tasks[1].priority}
                  </span>
                  <span className="text-xs text-secondary font-semibold">{tasks[1].date}</span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-on-surface-variant font-medium block">Consommables</span>
                  <span className="font-headline-sm text-forest-deep font-bold text-sm">{tasks[1].budget}</span>
                </div>
              </div>

              <div>
                <h3 className="font-headline-sm text-headline-sm text-forest-deep font-bold">
                  {tasks[1].title}
                </h3>
                <p className="font-body-md text-on-surface-variant text-xs leading-relaxed mt-1">
                  {tasks[1].description}
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-outline-variant/20 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center font-bold text-xs">
                  HJ
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-xs font-semibold text-on-surface">En charge : {tasks[1].assignee}</span>
                  <span className="text-[11px] text-on-surface-variant">{tasks[1].partner}</span>
                </div>
              </div>
              <button
                onClick={() => handleToggleTaskComplete(tasks[1].id)}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-DEFAULT border-2 font-label-sm text-xs font-bold transition-colors shadow-sm ${
                  tasks[1].status === 'completed'
                    ? 'bg-sage-soft border-primary text-primary hover:bg-emerald-100'
                    : 'bg-white border-primary text-primary hover:bg-sage-soft'
                }`}
                type="button"
              >
                <span className="material-symbols-outlined text-[16px]">
                  {tasks[1].status === 'completed' ? 'verified' : 'check_circle'}
                </span>
                <span>{tasks[1].status === 'completed' ? 'Action Validée ✅' : 'Valider l’action'}</span>
              </button>
            </div>
          </article>

          {/* Tâche 3: Répéteur Wi-Fi vers Le Presbytère */}
          <article className={`rounded-xl p-5 border shadow-sm flex flex-col justify-between gap-4 transition-all hover:shadow-md ${
            tasks[2].status === 'completed'
              ? 'bg-sage-soft/30 border-sage-border'
              : 'bg-white border-outline-variant/40'
          }`}>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                    tasks[2].status === 'completed' ? 'bg-primary text-white' : 'bg-sage-soft text-primary'
                  }`}>
                    <span className="material-symbols-outlined text-[14px]">
                      {tasks[2].status === 'completed' ? 'check' : 'router'}
                    </span>
                    {tasks[2].status === 'completed' ? 'Validée • Antenne OK' : tasks[2].priority}
                  </span>
                  <span className="text-xs text-secondary font-semibold">{tasks[2].date}</span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-on-surface-variant font-medium block">Matériel AG</span>
                  <span className="font-headline-sm text-forest-deep font-bold text-sm">{tasks[2].budget}</span>
                </div>
              </div>

              <div>
                <h3 className="font-headline-sm text-headline-sm text-forest-deep font-bold">
                  {tasks[2].title}
                </h3>
                <p className="font-body-md text-on-surface-variant text-xs leading-relaxed mt-1">
                  {tasks[2].description}
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-outline-variant/20 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center font-bold text-xs">
                  HJ
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-xs font-semibold text-on-surface">En charge : {tasks[2].assignee}</span>
                  <span className="text-[11px] text-on-surface-variant">{tasks[2].partner}</span>
                </div>
              </div>
              <button
                onClick={() => handleOpenTaskDetail(tasks[2])}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-DEFAULT bg-white border-2 border-primary text-primary font-label-sm text-xs font-bold hover:bg-sage-soft transition-colors shadow-sm"
                type="button"
              >
                <span className="material-symbols-outlined text-[16px]">construction</span>
                <span>Consulter la tâche</span>
              </button>
            </div>
          </article>

        </div>
      </section>

      {/* ===================================================================== */}
      {/* 3. VADÉMÉCUM ESSENTIEL DU DOMAINE (Accès direct en séjour)            */}
      {/* ===================================================================== */}
      <section className="bg-surface-container-lowest rounded-lg p-6 sm:p-8 lg:p-10 shadow-sm border border-border-subtle mb-6">
        
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 text-primary font-label-md text-label-md uppercase tracking-wider mb-1 font-bold">
              <span className="material-symbols-outlined text-[20px]">menu_book</span>
              <span>Intendance & Sécurité Immédiate</span>
            </div>
            <h2 className="font-headline-lg text-headline-lg text-primary tracking-tight font-bold">
              Vadémécum & Repères Pratiques du Séjour
            </h2>
          </div>

          <button
            onClick={() => setShowFullVademecum(!showFullVademecum)}
            className="h-12 px-5 rounded-full bg-surface-container-lowest border-2 border-primary text-primary hover:bg-sage-soft font-label-md text-label-md flex items-center gap-2 self-start sm:self-auto shrink-0 shadow-sm transition-all font-semibold"
            type="button"
          >
            <span className="material-symbols-outlined text-[20px]">
              {showFullVademecum ? 'unfold_less' : 'library_books'}
            </span>
            <span>
              {showFullVademecum ? 'Masquer la base complète' : 'Consulter le vadémécum complet (10 fiches)'}
            </span>
          </button>
        </div>

        {/* 4 Practical Interactive Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          
          {/* Card 1: Wi-Fi */}
          <div className="p-6 rounded-2xl bg-canvas-slate flex flex-col justify-between gap-4 shadow-sm border border-transparent hover:border-sage-border transition-all">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-full bg-sage-soft text-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-[22px]">wifi</span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-surface-container-lowest font-label-sm text-label-sm text-secondary font-semibold">
                  Fibre 1 Gb/s
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-label-sm text-label-sm text-outline">Réseau Wi-Fi Domaine</span>
                <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  Hellenvilliers_Rosing_5G
                </span>
                <p className="font-body-md text-body-md text-on-surface-variant text-xs mt-1">
                  Couverture Salon, Cuisine, Bureaux & Terrasse Sud.
                </p>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={handleCopyWifi}
                className="w-full h-11 px-3 rounded-full bg-surface-container-lowest border-2 border-outline-variant text-on-surface hover:bg-white hover:border-primary font-label-sm text-label-sm flex items-center justify-center gap-1.5 transition-all font-semibold"
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {wifiCopied ? 'check' : 'content_copy'}
                </span>
                <span>{wifiCopied ? 'Mot de passe copié !' : 'Copier le mot de passe'}</span>
              </button>
            </div>
          </div>

          {/* Card 2: Emergency valves & electrical cutoff */}
          <div className="p-6 rounded-2xl bg-canvas-slate flex flex-col justify-between gap-4 shadow-sm border border-transparent hover:border-sage-border transition-all">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-full bg-surface-container-high text-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-[22px]">valve</span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-surface-container-lowest font-label-sm text-label-sm text-primary font-semibold">
                  Cellier & Linky
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-label-sm text-label-sm text-outline">Vannes & Coupures Générales</span>
                <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  Arrêt Eau & Électricité
                </span>
                <p className="font-body-md text-body-md text-on-surface-variant text-xs mt-1">
                  Robinet d'arrêt général d'eau situé dans le cellier sous l'escalier. Disjoncteur principal au vestibule d'entrée.
                </p>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setIsCutoffModalOpen(true)}
                className="w-full h-11 px-3 rounded-full bg-surface-container-lowest border-2 border-outline-variant text-on-surface hover:bg-white hover:border-primary font-label-sm text-label-sm flex items-center justify-center gap-1.5 transition-all font-semibold"
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">map</span>
                <span>Voir plan des coupures</span>
              </button>
            </div>
          </div>

          {/* Card 3: Departure & Frost-free protocol */}
          <div className="p-6 rounded-2xl bg-canvas-slate flex flex-col justify-between gap-4 shadow-sm border border-transparent hover:border-sage-border transition-all">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-full bg-amber-soft text-amber-rich flex items-center justify-center">
                  <span className="material-symbols-outlined text-[22px]">checklist_rtl</span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-surface-container-lowest font-label-sm text-label-sm text-amber-rich font-semibold">
                  Protocole Départ
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-label-sm text-label-sm text-outline">Consignes de Départ</span>
                <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  Fermeture & Poubelles
                </span>
                <p className="font-body-md text-body-md text-on-surface-variant text-xs mt-1">
                  Baisser à 12°C, fermer radiateurs des chambres, vider frigo, bacs au point de collecte Mesnil-sur-Iton le lundi matin.
                </p>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setIsChecklistModalOpen(true)}
                className="w-full h-11 px-3 rounded-full bg-surface-container-lowest border-2 border-outline-variant text-on-surface hover:bg-white hover:border-primary font-label-sm text-label-sm flex items-center justify-center gap-1.5 transition-all font-semibold"
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">verified</span>
                <span>Pointer la check-list départ</span>
              </button>
            </div>
          </div>

          {/* Card 4: Emergency Contacts & Plumber on-call */}
          <div className="p-6 rounded-2xl bg-canvas-slate flex flex-col justify-between gap-4 shadow-sm border border-transparent hover:border-sage-border transition-all">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-full bg-error-container text-error flex items-center justify-center">
                  <span className="material-symbols-outlined text-[22px]">emergency</span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-surface-container-lowest font-label-sm text-label-sm text-error font-semibold">
                  Astreinte 24/7
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-label-sm text-label-sm text-outline">Assistance & Numéros Clés</span>
                <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  Éts Josse & Urgences
                </span>
                <div className="font-body-md text-body-md text-on-surface-variant text-xs mt-1 flex flex-col gap-0.5">
                  <span>• Pompiers : <strong>18</strong></span>
                  <span>• Chauffage Josse : <strong>02 32 35 12 00</strong></span>
                  <span>• Pharmacie Mesnil-sur-Iton</span>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <a
                className="w-full h-11 px-3 rounded-full bg-surface-container-lowest border-2 border-outline-variant text-on-surface hover:bg-white hover:border-primary font-label-sm text-label-sm flex items-center justify-center gap-1.5 transition-all font-semibold"
                href="tel:0232351200"
              >
                <span className="material-symbols-outlined text-[18px]">call</span>
                <span>Appeler le chauffagiste</span>
              </a>
            </div>
          </div>

        </div>

        {/* Collapsible Full Database Section */}
        {showFullVademecum && (
          <div className="mt-10 pt-8 border-t border-border-subtle animate-in fade-in duration-300">
            
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="font-headline-md text-lg font-bold text-on-surface">
                  Base Complète des Fiches Vademecum
                </h3>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Consignes permanentes, codes et procédures de la maison
                </p>
              </div>

              <button
                onClick={() => setIsNewItemModalOpen(true)}
                className="px-4 py-2 bg-primary hover:bg-forest-deep text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center justify-center gap-1.5 shrink-0"
                type="button"
              >
                <Plus className="h-4 w-4" />
                <span>Ajouter une Fiche</span>
              </button>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-canvas-slate p-3 rounded-2xl border border-border-subtle mb-6">
              <div className="flex overflow-x-auto space-x-1.5 py-1 w-full sm:w-auto">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                      selectedCategory === cat
                        ? 'bg-primary text-white shadow-sm'
                        : 'bg-white text-on-surface-variant hover:text-on-surface border border-border-subtle'
                    }`}
                    type="button"
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-64">
                <input
                  type="text"
                  placeholder="Rechercher (ex: Wifi, clé, eau)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3.5 py-2 pl-9 bg-white border border-border-subtle rounded-xl text-xs text-on-surface focus:outline-none focus:border-primary"
                />
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-outline" />
              </div>
            </div>

            {/* Database Cards Grid */}
            {loadingDb ? (
              <div className="flex justify-center py-12 text-outline">
                <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : filteredDbItems.length === 0 ? (
              <div className="bg-canvas-slate border border-border-subtle rounded-2xl p-8 text-center text-on-surface-variant">
                <BookOpen className="h-10 w-10 text-outline mx-auto mb-2" />
                <h4 className="text-sm font-bold text-on-surface">Aucune fiche enregistrée</h4>
                <p className="text-xs mt-1">Créez votre première fiche vademecum pour l'intendance du domaine.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredDbItems.map((item) => (
                  <div
                    key={item.id}
                    className="bg-white border border-border-subtle hover:border-sage-border rounded-2xl p-4 shadow-xs hover:shadow-sm transition flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="px-2 py-0.5 rounded-md bg-canvas-slate border border-border-subtle text-[11px] font-bold text-on-surface-variant">
                          {item.category}
                        </span>
                        {item.importance === 'CRITIQUE' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-200">
                            CRITIQUE
                          </span>
                        )}
                        {item.importance === 'IMPORTANT' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-soft text-amber-rich border border-amber-200">
                            IMPORTANT
                          </span>
                        )}
                      </div>

                      <h4 className="text-sm font-bold text-on-surface mb-1">{item.title}</h4>
                      <p className="text-xs text-on-surface-variant leading-relaxed whitespace-pre-line mb-3">
                        {item.content}
                      </p>
                    </div>

                    {item.code_to_copy && (
                      <div className="bg-canvas-slate border border-border-subtle rounded-xl p-2.5 flex items-center justify-between gap-2 mt-2">
                        <span className="text-xs font-mono font-bold text-primary truncate">
                          {item.code_to_copy}
                        </span>
                        <button
                          onClick={() => handleCopyDbCode(item.id, item.code_to_copy)}
                          className="px-2.5 py-1 bg-white hover:bg-sage-soft text-primary border border-border-subtle rounded-lg text-[11px] font-bold flex items-center gap-1 transition shrink-0"
                          type="button"
                        >
                          <span className="material-symbols-outlined text-[14px]">
                            {copiedDbId === item.id ? 'check' : 'content_copy'}
                          </span>
                          <span>{copiedDbId === item.id ? 'Copié' : 'Copier'}</span>
                        </button>
                      </div>
                    )}

                    <div className="flex justify-end pt-2 mt-3 border-t border-border-subtle">
                      <button
                        onClick={() => handleDeleteDbItem(item.id)}
                        className="text-outline hover:text-error text-xs flex items-center gap-1 transition font-medium"
                        type="button"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Supprimer</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        )}

      </section>

      {/* ===================================================================== */}
      {/* MODALS                                                                */}
      {/* ===================================================================== */}

      {/* Modal 1: Cutoff Map */}
      <SejourCutoffMapModal
        isOpen={isCutoffModalOpen}
        onClose={() => setIsCutoffModalOpen(false)}
      />

      {/* Modal 2: Departure Checklist */}
      <SejourDepartureChecklistModal
        isOpen={isChecklistModalOpen}
        onClose={() => setIsChecklistModalOpen(false)}
      />

      {/* Modal 3: Task Detail */}
      <SejourTaskModal
        task={selectedTask}
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setSelectedTask(null);
        }}
        onToggleComplete={handleToggleTaskComplete}
      />

      {/* Modal 4: Edit Stay */}
      <SejourEditModal
        stayData={stayData}
        isOpen={isEditStayOpen}
        onClose={() => setIsEditStayOpen(false)}
        onSave={(updated) => {
          setStayData((prev) => ({ ...prev, ...updated }));
          showToast('Paramètres du séjour mis à jour !');
        }}
      />

      {/* Modal 5: New Vademecum Item Modal */}
      {isNewItemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-container-lowest border border-border-subtle rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative text-on-surface">
            <h3 className="text-lg font-bold text-primary mb-4">Nouvelle Fiche Vademecum</h3>
            
            <form onSubmit={handleCreateDbItem} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-on-surface mb-1">Catégorie</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-canvas-slate border border-border-subtle rounded-xl text-xs font-semibold text-on-surface focus:outline-none focus:border-primary"
                >
                  {categories.filter((c) => c !== 'Toutes').map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface mb-1">Titre de la fiche *</label>
                <input
                  type="text"
                  placeholder="ex: Emplacement échelle télescopique"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-canvas-slate border border-border-subtle rounded-xl text-xs text-on-surface focus:outline-none focus:border-primary"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface mb-1">Contenu / Explications *</label>
                <textarea
                  rows={4}
                  placeholder="Détails, emplacement, consignes..."
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="w-full px-3 py-2 bg-canvas-slate border border-border-subtle rounded-xl text-xs text-on-surface focus:outline-none focus:border-primary"
                  required
                ></textarea>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-on-surface mb-1">Code à copier (optionnel)</label>
                  <input
                    type="text"
                    placeholder="ex: 1974A"
                    value={newCodeToCopy}
                    onChange={(e) => setNewCodeToCopy(e.target.value)}
                    className="w-full px-3 py-2 bg-canvas-slate border border-border-subtle rounded-xl text-xs text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-on-surface mb-1">Importance</label>
                  <select
                    value={newImportance}
                    onChange={(e) => setNewImportance(e.target.value)}
                    className="w-full px-3 py-2 bg-canvas-slate border border-border-subtle rounded-xl text-xs font-semibold text-on-surface focus:outline-none focus:border-primary"
                  >
                    <option value="INFO">INFO (Normal)</option>
                    <option value="IMPORTANT">IMPORTANT</option>
                    <option value="CRITIQUE">CRITIQUE</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border-subtle">
                <button
                  type="button"
                  onClick={() => setIsNewItemModalOpen(false)}
                  className="px-5 py-2.5 rounded-full text-xs font-semibold text-on-surface hover:bg-canvas-slate"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submittingItem}
                  className="px-6 py-2.5 rounded-full bg-primary hover:bg-forest-deep text-white text-xs font-bold shadow-sm transition disabled:opacity-50"
                >
                  {submittingItem ? 'Enregistrement...' : 'Enregistrer la fiche'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}
