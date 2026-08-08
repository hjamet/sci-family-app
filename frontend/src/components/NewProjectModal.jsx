import React, { useState } from 'react';
import { PlusCircle, X, Image as ImageIcon, Camera, AlertCircle, Sparkles, Trash2, Upload } from 'lucide-react';
import { uploadPhotos } from '../api';

export default function NewProjectModal({ isOpen, onClose, properties, currentUser, onSubmit }) {
  const [propertyId, setPropertyId] = useState(properties[0]?.id || 1);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setSelectedFiles(prev => [...prev, ...files]);
    
    // Create preview object URLs
    const newPreviews = files.map(file => URL.createObjectURL(file));
    setPreviews(prev => [...prev, ...newPreviews]);
  };

  const handleRemoveFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError('Veuillez remplir le titre et la description.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      let uploadedUrls = [];
      if (selectedFiles.length > 0) {
        const res = await uploadPhotos(selectedFiles);
        uploadedUrls = res.photo_urls || [];
      }

      await onSubmit({
        property_id: parseInt(propertyId, 10),
        title: title.trim(),
        description: description.trim(),
        estimated_cost: 0.0,
        category: 'Non classé',
        priority: 'MOYENNE',
        responsible: null,
        photo_url: uploadedUrls[0] || null,
        photo_urls: uploadedUrls,
        submitted_by: currentUser
      });

      // Reset form
      setTitle('');
      setDescription('');
      setSelectedFiles([]);
      setPreviews([]);
      onClose();
    } catch (err) {
      setError(err.message || 'Erreur lors de la transmission au coordinateur.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 sm:p-7 shadow-2xl relative text-slate-900">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition z-10"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="flex items-start space-x-3.5 mb-5 pr-6">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-amber-600 shrink-0 mt-1">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-snug">
              Signaler un problème, une idée ou un projet
            </h2>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Signalez directement un problème ou proposez une idée. Votre signalement sera transmis au coordinateur (Henri) pour qualification, chiffrage et devis.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center space-x-2">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Title */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">
              Titre du signalement / idée *
            </label>
            <input
              type="text"
              placeholder="ex: Fuite robinet sdb haut ou Idée nouveau frigo"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 transition"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">
              Description détaillée *
            </label>
            <textarea
              rows={4}
              placeholder="Expliquez précisément le problème ou votre idée, l'emplacement dans la maison et ce qui doit être fait..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 transition"
              required
            ></textarea>
          </div>

          {/* Multiple Photos Upload */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">
              Photos & Visuels (Upload multiple)
            </label>
            
            <div className="mt-1">
              <label htmlFor="multiple-photo-upload" className="flex items-center justify-center space-x-2 p-4 border-2 border-dashed border-slate-200 hover:border-amber-400 rounded-2xl bg-slate-50 hover:bg-amber-50/50 cursor-pointer transition text-slate-600">
                <Upload className="h-5 w-5 text-amber-500" />
                <span className="text-xs font-semibold">Cliquer pour ajouter des photos (sélection multiple)</span>
                <input
                  id="multiple-photo-upload"
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
            </div>

            {/* Image Previews */}
            {previews.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mt-3">
                {previews.map((src, idx) => (
                  <div key={idx} className="relative group aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                    <img src={src} alt={`Aperçu ${idx + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(idx)}
                      className="absolute top-1 right-1 p-1 bg-rose-600 text-white rounded-full opacity-90 hover:opacity-100 transition"
                      title="Supprimer"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <span className="text-[11px] text-slate-500 font-medium">Transmis à Henri (Coordinateur)</span>
            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl text-xs shadow-md transition flex items-center space-x-2"
              >
                {submitting ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <PlusCircle className="h-4 w-4" />
                    <span>Envoyer le signalement</span>
                  </>
                )}
              </button>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
}
