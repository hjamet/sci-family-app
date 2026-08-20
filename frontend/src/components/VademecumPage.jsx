import React, { useState, useEffect } from 'react';
import {
  BookOpen, Wifi, Key, Flame, Zap, Trash2, ShieldAlert, Copy, Check,
  Search, Plus, Tag, Filter, Edit3, Trash, Sparkles, AlertTriangle, RefreshCw
} from 'lucide-react';
import HeatingControlWidget from './HeatingControlWidget';
import { fetchVademecum, createVademecumItem, deleteVademecumItem } from '../api';

export default function VademecumPage({ properties, currentUser }) {
  const [selectedCategory, setSelectedCategory] = useState('Toutes');
  const [searchQuery, setSearchQuery] = useState('');
  const [vademecumItems, setVademecumItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  // New Item modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newCategory, setNewCategory] = useState('Wi-Fi & Réseau');
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCodeToCopy, setNewCodeToCopy] = useState('');
  const [newImportance, setNewImportance] = useState('INFO');
  const [submitting, setSubmitting] = useState(false);

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

  const loadData = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const params = {};
      if (selectedCategory !== 'Toutes') params.category = selectedCategory;
      const data = await fetchVademecum(params);
      if (data && data.error) {
        throw new Error(data.error);
      }
      setVademecumItems(data);
    } catch (err) {
      console.error('Error fetching vademecum:', err);
      setErrorMsg(err.message || String(err) || 'Échec de chargement des fiches Vademecum');
      setVademecumItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedCategory]);

  const handleCopyCode = (id, code) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreateItem = async (e) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;

    try {
      setSubmitting(true);
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
      setIsModalOpen(false);
      await loadData();
    } catch (err) {
      console.error('Failed to create item:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (!window.confirm('Voulez-vous vraiment supprimer cette fiche Vademecum ?')) return;
    try {
      await deleteVademecumItem(itemId);
      await loadData();
    } catch (err) {
      console.error('Failed to delete item:', err);
    }
  };

  const filteredItems = vademecumItems.filter((item) => {
    const q = searchQuery.toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      item.content.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      (item.code_to_copy && item.code_to_copy.toLowerCase().includes(q))
    );
  });

  const getCategoryIcon = (cat) => {
    switch (cat) {
      case 'Wi-Fi & Réseau':
        return <Wifi className="h-4 w-4 text-cyan-600" />;
      case 'Accès & Clés':
        return <Key className="h-4 w-4 text-amber-600" />;
      case 'Eau & Électricité':
        return <Zap className="h-4 w-4 text-yellow-600" />;
      case 'Chauffage & Fioul':
        return <Flame className="h-4 w-4 text-rose-600" />;
      case 'Déchets & Recyclage':
        return <Trash2 className="h-4 w-4 text-emerald-600" />;
      case 'Urgence':
        return <ShieldAlert className="h-4 w-4 text-rose-600" />;
      default:
        return <BookOpen className="h-4 w-4 text-indigo-600" />;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-slate-200/90 p-6 rounded-3xl shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 rounded-full bg-emerald-50 blur-3xl pointer-events-none"></div>

        <div className="relative z-10">
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Vademecum Centralisé & Guide Maison</h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              Domaine d'Hellenvilliers • Guide Unifié
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            Retrouvez tous les codes Wi-Fi, procédures d'accès, emplacements des disjoncteurs et consignes de la maison.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold shadow-sm transition flex items-center justify-center space-x-2 shrink-0 relative z-10"
        >
          <Plus className="h-4 w-4" />
          <span>Ajouter une Fiche</span>
        </button>
      </div>

      {/* Emergency Quick Reference Card */}
      <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-rose-100 rounded-xl text-rose-700">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-rose-900">Procédures d'Urgence & Coupures Générales</h3>
            <p className="text-xs text-rose-800/90">
              Vanne d'eau générale : cave sous buanderie. Disjoncteur principal : couloir d'entrée derrière l'armoire.
            </p>
          </div>
        </div>
      </div>

      {/* VICARE HEATING CONTROL WIDGET EMBEDDED IN VADEMECUM */}
      <div className="my-6">
        <HeatingControlWidget currentUser={currentUser} />
      </div>

      {/* Prominent Red Alert Card on Vademecum API Failure */}
      {errorMsg && (
        <div className="mb-6 p-6 rounded-3xl bg-rose-50 border-2 border-rose-500 text-rose-900 shadow-md animate-in fade-in duration-200">
          <div className="flex items-start space-x-4">
            <div className="p-3 bg-rose-600 text-white rounded-2xl shrink-0">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-black text-rose-950 flex items-center gap-2">
                <span>⚠️ Erreur de lecture capteur / API</span>
              </h3>
              <p className="text-xs text-rose-700 font-bold mt-1">
                Échec de communication avec l'API Vademecum. Aucun masquage silencieux.
              </p>
              <div className="mt-3 p-3 bg-rose-100/90 border border-rose-300 rounded-xl font-mono text-xs text-rose-950 break-all">
                <strong>Raw error trace :</strong> {errorMsg}
              </div>
              <div className="mt-4 flex items-center space-x-3">
                <button
                  onClick={loadData}
                  disabled={loading}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl shadow transition flex items-center space-x-2"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  <span>Enquêter / Réessayer</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <div className="flex overflow-x-auto space-x-1.5 py-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                  selectedCategory === cat
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/80'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Search input */}
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            placeholder="Rechercher (ex: Wifi, clé, eau)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3.5 py-2 pl-9 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
          />
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
        </div>
      </div>

      {/* Items Cards Grid */}
      {loading ? (
        <div className="flex justify-center py-16 text-slate-400">
          <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center text-slate-500 shadow-sm">
          <BookOpen className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-800">Aucune fiche trouvée</h3>
          <p className="text-xs mt-1">Créez une fiche Vademecum pour partager les consignes de la maison.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="bg-white border border-slate-200/90 hover:border-slate-300 rounded-3xl p-5 shadow-sm hover:shadow-md transition flex flex-col justify-between group"
            >
              <div>
                {/* Category & Importance Header */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="flex items-center space-x-1.5 text-xs font-extrabold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">
                    {getCategoryIcon(item.category)}
                    <span>{item.category}</span>
                  </span>

                  {item.importance === 'CRITIQUE' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-200">
                      CRITIQUE
                    </span>
                  )}
                  {item.importance === 'IMPORTANT' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-800 border border-amber-200">
                      IMPORTANT
                    </span>
                  )}
                </div>

                <h3 className="text-base font-bold text-slate-900 group-hover:text-emerald-700 transition mb-2">
                  {item.title}
                </h3>

                <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line mb-4">
                  {item.content}
                </p>
              </div>

              {/* Code to Copy button if present */}
              {item.code_to_copy && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex items-center justify-between gap-2 mt-2">
                  <div className="truncate">
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase block">Code / Mot de passe</span>
                    <span className="text-sm font-mono font-black text-cyan-700 tracking-wider truncate block">
                      {item.code_to_copy}
                    </span>
                  </div>

                  <button
                    onClick={() => handleCopyCode(item.id, item.code_to_copy)}
                    className="px-3 py-1.5 bg-white hover:bg-cyan-50 text-cyan-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center space-x-1 transition shrink-0 shadow-sm"
                  >
                    {copiedId === item.id ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Copié !</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copier</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              <div className="flex justify-end pt-3 mt-3 border-t border-slate-100">
                <button
                  onClick={() => handleDeleteItem(item.id)}
                  className="text-slate-400 hover:text-rose-600 text-xs flex items-center space-x-1 transition font-medium"
                >
                  <Trash className="h-3.5 w-3.5" />
                  <span>Supprimer</span>
                </button>
              </div>

            </div>
          ))}
        </div>
      )}

      {/* New Vademecum Item Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative text-slate-900">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Nouvelle Fiche Vademecum</h2>
            
            <form onSubmit={handleCreateItem} className="space-y-4">
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">Catégorie</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                >
                  {categories.filter((c) => c !== 'Toutes').map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">Titre de la fiche *</label>
                <input
                  type="text"
                  placeholder="ex: Code Wi-Fi du salon"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">Contenu / Explications *</label>
                <textarea
                  rows={4}
                  placeholder="Emplacement de la box, procédure à suivre..."
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                  required
                ></textarea>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">Code / Mot de passe à copier (facultatif)</label>
                  <input
                    type="text"
                    placeholder="ex: 1974A ou MotDePasse!"
                    value={newCodeToCopy}
                    onChange={(e) => setNewCodeToCopy(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">Niveau d'importance</label>
                  <select
                    value={newImportance}
                    onChange={(e) => setNewImportance(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="INFO">INFO (Normal)</option>
                    <option value="IMPORTANT">IMPORTANT</option>
                    <option value="CRITIQUE">CRITIQUE (Urgence)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm"
                >
                  Créer la fiche
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
