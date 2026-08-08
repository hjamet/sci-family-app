import React, { useState } from 'react';
import { X, Camera, Upload, AlertCircle, CheckCircle2, Image as ImageIcon, Trash2 } from 'lucide-react';
import { createIssue, uploadPhotos, uploadPhoto } from '../api';

export default function NewIssueModal({ isOpen, onClose, properties, currentUser, onIssueCreated }) {
  const [propertyId, setPropertyId] = useState(properties[0]?.id || 1);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [previewUrls, setPreviewUrls] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleMultipleFilesChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      setSelectedFiles(prev => [...prev, ...files]);
      const newPreviews = files.map(file => URL.createObjectURL(file));
      setPreviewUrls(prev => [...prev, ...newPreviews]);
    }
  };

  const handleRemoveFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setPreviewUrls(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError('Veuillez remplir le titre et la description.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      let photo_urls = [];
      let photo_url = null;

      if (selectedFiles.length > 0) {
        try {
          const uploadRes = await uploadPhotos(selectedFiles);
          photo_urls = uploadRes.photo_urls || [];
        } catch (err) {
          // Fallback to single upload per file if batch fails
          for (const file of selectedFiles) {
            const singleRes = await uploadPhoto(file);
            if (singleRes.photo_url) photo_urls.push(singleRes.photo_url);
          }
        }
        if (photo_urls.length > 0) photo_url = photo_urls[0];
      }

      await createIssue({
        property_id: parseInt(propertyId, 10),
        title: title.trim(),
        description: description.trim(),
        category: "🐛 Corrections / Réparations", // Default category assigned for coordinator review
        priority: "Moyenne",
        created_by: currentUser,
        photo_url,
        photo_urls
      });

      onIssueCreated();
      onClose();
      // Reset form
      setTitle('');
      setDescription('');
      setSelectedFiles([]);
      setPreviewUrls([]);
    } catch (err) {
      setError(err.message || 'Erreur lors de la soumission');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="glass-modal w-full max-w-lg rounded-2xl p-6 shadow-2xl relative border border-slate-700/60 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <AlertCircle className="h-5 w-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-100">Signaler un problème ou proposer une idée</h2>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-300 text-sm flex items-center space-x-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Property Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
              Propriété concernée
            </label>
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.address}
                </option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
              Titre du problème ou de l'idée *
            </label>
            <input
              type="text"
              placeholder="ex: Fuite d'eau sous le lavabo, Idée d'aménagement potager..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
              Description détaillée *
            </label>
            <textarea
              rows={4}
              placeholder="Décrivez précisément le problème constaté ou l'idée proposée pour la maison..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
              required
            ></textarea>
          </div>

          {/* Multiple Photos Upload (input type="file" multiple) */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
              Photos & Visuels (Sélection Multiple)
            </label>
            
            <div className="flex items-center space-x-3">
              <label className="cursor-pointer flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-dashed border-slate-700 hover:border-cyan-500 text-sm font-medium text-slate-300 hover:text-cyan-400 transition">
                <Camera className="h-4 w-4 text-cyan-400" />
                <span>Prendre / Choisir des photos (plusieurs possibles)</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleMultipleFilesChange}
                  className="hidden"
                />
              </label>
            </div>

            {/* Multiple Photos Previews Grid */}
            {previewUrls.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {previewUrls.map((url, idx) => (
                  <div key={idx} className="relative rounded-xl overflow-hidden border border-slate-700 h-20 bg-slate-900 group">
                    <img src={url} alt={`Aperçu ${idx + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(idx)}
                      className="absolute top-1 right-1 bg-slate-950/80 p-1 rounded-full text-rose-400 hover:text-white transition"
                      title="Supprimer la photo"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer Submit */}
          <div className="pt-4 flex justify-end space-x-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-700 text-sm font-medium text-slate-300 hover:bg-slate-900 transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-semibold text-sm shadow-lg shadow-cyan-500/20 transition disabled:opacity-50"
            >
              {submitting ? 'Envoi...' : 'Soumettre'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
