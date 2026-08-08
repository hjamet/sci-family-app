import React, { useState, useEffect } from 'react';
import {
  BookOpen, Wifi, Key, Flame, Zap, Trash2, ShieldAlert, Copy, Check,
  Search, Plus, Tag, Filter, Edit3, Trash, Sparkles
} from 'lucide-react';
import { fetchVademecum, createVademecumItem, deleteVademecumItem } from '../api';

export default function VademecumPage({ properties, currentUser }) {
  const [selectedProperty, setSelectedProperty] = useState(properties[0]?.id || 1);
  const [selectedCategory, setSelectedCategory] = useState('Toutes');
  const [searchQuery, setSearchQuery] = useState('');
  const [vademecumItems, setVademecumItems] = useState([]);
  const [loading, setLoading] = useState(true);
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
      const params = {};
      if (selectedProperty !== 'Tous') params.property_id = selectedProperty;
      if (selectedCategory !== 'Toutes') params.category = selectedCategory;
      const data = await fetchVademecum(params);
      setVademecumItems(data);
    } catch (err) {
      console.error('Error fetching vademecum:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedProperty, selectedCategory]);

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
        property_id: parseInt(selectedProperty, 10),
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
        return <Wifi className="h-4 w-4 text-cyan-400" />;
      case 'Accès & Clés':
        return <Key className="h-4 w-4 text-amber-400" />;
      case 'Eau & Électricité':
        return <Zap className="h-4 w-4 text-yellow-400" />;
      case 'Chauffage & Fioul':
        return <Flame className="h-4 w-4 text-rose-400" />;
      case 'Déchets & Recyclage':
        return <Trash2 className="h-4 w-4 text-emerald-400" />;
      case 'Urgence':
        return <ShieldAlert className="h-4 w-4 text-rose-500" />;
      default:
        return <BookOpen className="h-4 w-4 text-indigo-400" />;
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-900/90 to-emerald-950/40 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-black text-white tracking-tight">Vademecum Centralisé & Guide Maison</h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              Modes d'emploi & Codes
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Retrouvez tous les codes Wi-Fi, procédures d'accès, emplacements des disjoncteurs et consignes de la maison.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white rounded-xl text-sm font-semibold shadow-lg transition flex items-center justify-center space-x-2 shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>Ajouter une Fiche</span>
        </button>
      </div>

      {/* Emergency Quick Reference Card */}
      <div className="bg-rose-950/30 border border-rose-900/50 rounded-2xl p-4 flex items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-rose-500/20 rounded-xl text-rose-400">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-rose-200">Procédures d'Urgence & Coupures Générales</h3>
            <p className="text-xs text-slate-300">
              Vanne d'eau générale : cave sous buanderie. Disjoncteur principal : couloir d'entrée derrière l'armoire.
            </p>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <select
            value={selectedProperty}
            onChange={(e) => setSelectedProperty(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <div className="flex overflow-x-auto space-x-1 py-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                  selectedCategory === cat
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
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
            className="w-full px-3 py-1.5 pl-9 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500"
          />
          <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-slate-500" />
        </div>
      </div>

      {/* Items Cards Grid */}
      {loading ? (
        <div className="flex justify-center py-16 text-slate-400">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
          <BookOpen className="h-12 w-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-200">Aucune fiche trouvée</h3>
          <p className="text-xs mt-1">Créez une fiche Vademecum pour partager les consignes de la maison.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="bg-slate-900 border border-slate-800/80 hover:border-slate-700 rounded-2xl p-5 shadow-xl flex flex-col justify-between transition group"
            >
              <div>
                {/* Category & Importance Header */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="flex items-center space-x-1.5 text-xs font-semibold text-slate-300 bg-slate-800 px-2.5 py-1 rounded-md">
                    {getCategoryIcon(item.category)}
                    <span>{item.category}</span>
                  </span>

                  {item.importance === 'CRITIQUE' && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                      CRITIQUE
                    </span>
                  )}
                  {item.importance === 'IMPORTANT' && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      IMPORTANT
                    </span>
                  )}
                </div>

                <h3 className="text-base font-bold text-white group-hover:text-emerald-300 transition mb-2">
                  {item.title}
                </h3>

                <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line mb-4">
                  {item.content}
                </p>
              </div>

              {/* Code to Copy button if present */}
              {item.code_to_copy && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-2 mt-2">
                  <div className="truncate">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase block">Code / Mot de passe</span>
                    <span className="text-sm font-mono font-bold text-cyan-400 tracking-wider truncate block">
                      {item.code_to_copy}
                    </span>
                  </div>

                  <button
                    onClick={() => handleCopyCode(item.id, item.code_to_copy)}
                    className="px-3 py-1.5 bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800/50 rounded-lg text-xs font-semibold flex items-center space-x-1 transition shrink-0"
                  >
                    {copiedId === item.id ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copié !</span>
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

              <div className="flex justify-end pt-3 mt-3 border-t border-slate-800/60">
                <button
                  onClick={() => handleDeleteItem(item.id)}
                  className="text-slate-500 hover:text-rose-400 text-xs flex items-center space-x-1 transition"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <h2 className="text-xl font-bold text-white mb-4">Nouvelle Fiche Vademecum</h2>
            
            <form onSubmit={handleCreateItem} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Catégorie</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                  {categories.filter((c) => c !== 'Toutes').map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Titre de la fiche *</label>
                <input
                  type="text"
                  placeholder="ex: Code Wi-Fi du salon"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Contenu / Explications *</label>
                <textarea
                  rows={4}
                  placeholder="Emplacement de la box, procédure à suivre..."
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500"
                  required
                ></textarea>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Code / Mot de passe à copier (facultatif)</label>
                  <input
                    type="text"
                    placeholder="ex: 1974A ou MotDePasse!"
                    value={newCodeToCopy}
                    onChange={(e) => setNewCodeToCopy(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Niveau d'importance</label>
                  <select
                    value={newImportance}
                    onChange={(e) => setNewImportance(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500"
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
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold shadow-lg"
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
