import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, IndianRupee, Camera, Plus } from 'lucide-react';
import { TextileDesign } from '../types';
import { cataloguesApi, designsApi } from '../services/api';

interface Props {
  onClose: () => void;
  onSubmit: (design: TextileDesign) => void;
  initialData?: TextileDesign | null;
}

export const UploadForm: React.FC<Props> = ({ onClose, onSubmit, initialData }) => {
  const [preview, setPreview] = useState<string | null>(initialData?.image || null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [catalogues, setCatalogues] = useState<{ id: string; name: string }[]>([]);
  const [loadingCatalogues, setLoadingCatalogues] = useState(false);
  const [showNewCatalogue, setShowNewCatalogue] = useState(false);
  const [newCatalogueName, setNewCatalogueName] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    catalogueId: '',
    wholesalePrice: '',
    retailPrice: '',
    fabric: '',
    description: ''
  });

  // Load catalogues on mount
  useEffect(() => {
    loadCatalogues();
  }, []);

  // Update form data and preview when initialData changes (for edit mode)
  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        catalogueId: initialData.catalogueId || '',
        wholesalePrice: initialData.wholesalePrice.toString() || '',
        retailPrice: initialData.retailPrice.toString() || '',
        fabric: initialData.fabric || '',
        description: initialData.description || ''
      });
      setPreview(initialData.image);
    } else {
      // Reset form when not editing
      setFormData({
        name: '',
        catalogueId: '',
        wholesalePrice: '',
        retailPrice: '',
        fabric: '',
        description: ''
      });
      setPreview(null);
    }
  }, [initialData]);

  const loadCatalogues = async () => {
    try {
      setLoadingCatalogues(true);
      const { catalogues: cats } = await designsApi.getCatalogues();
      setCatalogues(cats);
    } catch (error) {
      console.error('Failed to load catalogues:', error);
    } finally {
      setLoadingCatalogues(false);
    }
  };

  const handleCreateCatalogue = async () => {
    if (!newCatalogueName.trim()) return;
    try {
      const catalogue = await cataloguesApi.create(newCatalogueName.trim());
      setCatalogues(prev => [...prev, catalogue]);
      setFormData(prev => ({ ...prev, catalogueId: catalogue.id }));
      setShowNewCatalogue(false);
      setNewCatalogueName('');
    } catch (error) {
      console.error('Failed to create catalogue:', error);
      alert('Failed to create catalogue. Please try again.');
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCameraCapture = () => {
    cameraInputRef.current?.click();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Allow editing without re-uploading image if initialData exists
    const imageToUse = preview || initialData?.image;
    if (!imageToUse) return alert('Please upload an image');
    const designName = formData.name.trim() || `Design ${new Date().toLocaleDateString()}`;

    const newDesign: TextileDesign = {
      id: initialData?.id || Date.now().toString(),
      name: designName,
      catalogueId: formData.catalogueId || undefined,
      catalogueName: catalogues.find(c => c.id === formData.catalogueId)?.name,
      image: imageToUse,
      wholesalePrice: Number(formData.wholesalePrice),
      retailPrice: Number(formData.retailPrice),
      fabric: formData.fabric || 'Unknown',
      description: formData.description || '',
      createdAt: initialData?.createdAt || Date.now()
    };

    onSubmit(newDesign);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm safe-area-top safe-area-bottom">
      <div className="bg-white w-full max-w-2xl rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh] touch-manipulation">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">{initialData ? 'Edit Design' : 'Upload New Design'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Image Upload Area */}
          <div className="space-y-3">
            <div 
              onClick={() => fileInputRef.current?.click()}
              className={`relative aspect-video rounded-xl sm:rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden touch-manipulation ${
                preview ? 'border-transparent' : 'border-gray-200 hover:border-indigo-400 bg-gray-50 active:bg-gray-100'
              }`}
            >
              {preview ? (
                <>
                  <img src={preview} className="w-full h-full object-cover" alt="Preview" />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <p className="text-white font-medium">Click to change image</p>
                  </div>
                </>
              ) : (
                <div className="text-center p-4">
                  <div className="bg-indigo-50 p-3 rounded-full inline-block mb-3">
                    <Upload className="w-8 h-8 text-indigo-500" />
                  </div>
                  <p className="text-sm font-medium text-gray-700">Drop image here or click to browse</p>
                  <p className="text-xs text-gray-400 mt-1">Supports JPG, PNG (Max 5MB)</p>
                </div>
              )}
              <input 
                type="file" 
                ref={fileInputRef} 
                hidden 
                accept="image/*" 
                onChange={handleImageChange} 
              />
              <input
                type="file"
                ref={cameraInputRef}
                hidden
                accept="image/*"
                capture="environment"
                onChange={handleImageChange}
              />
            </div>
            
            {/* Camera/Gallery Buttons */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium text-sm transition-colors"
              >
                <Upload className="w-4 h-4" />
                Gallery
              </button>
              <button
                type="button"
                onClick={handleCameraCapture}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-xl font-medium text-sm transition-colors"
              >
                <Camera className="w-4 h-4" />
                Camera
              </button>
            </div>
          </div>

          {/* Design Name */}
          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700">Design Name *</label>
            <input
              required
              type="text"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="Enter design name"
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
            />
          </div>

          {/* Catalogue Selection */}
          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700">Catalogue</label>
            {!showNewCatalogue ? (
              <div className="flex gap-2">
                <select
                  className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={formData.catalogueId}
                  onChange={e => setFormData({...formData, catalogueId: e.target.value})}
                >
                  <option value="">Select Catalogue (Optional)</option>
                  {loadingCatalogues ? (
                    <option>Loading...</option>
                  ) : (
                    catalogues.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))
                  )}
                </select>
                <button
                  type="button"
                  onClick={() => setShowNewCatalogue(true)}
                  className="px-4 py-3 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-xl font-medium transition-colors flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  New
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Enter catalogue name"
                  value={newCatalogueName}
                  onChange={e => setNewCatalogueName(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && handleCreateCatalogue()}
                />
                <button
                  type="button"
                  onClick={handleCreateCatalogue}
                  className="px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewCatalogue(false);
                    setNewCatalogueName('');
                  }}
                  className="px-4 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700">Wholesale Price</label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  required
                  type="number"
                  className="w-full pl-9 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="0.00"
                  value={formData.wholesalePrice}
                  onChange={e => setFormData({...formData, wholesalePrice: e.target.value})}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700">Retail Price</label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  required
                  type="number"
                  className="w-full pl-9 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="0.00"
                  value={formData.retailPrice}
                  onChange={e => setFormData({...formData, retailPrice: e.target.value})}
                />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700">Fabric Type</label>
            <input
              type="text"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="e.g. Pure Cotton, Heavy Silk..."
              value={formData.fabric}
              onChange={e => setFormData({...formData, fabric: e.target.value})}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700">Description</label>
            <textarea
              rows={3}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              placeholder="Add details about the design, dimensions, patterns..."
              value={formData.description}
              onChange={e => setFormData({...formData, description: e.target.value})}
            />
          </div>
        </form>

        <div className="p-6 bg-gray-50 border-t">
          <button
            onClick={handleSubmit}
            className="w-full bg-gray-900 text-white py-4 rounded-xl font-bold shadow-xl hover:bg-black transition-all flex items-center justify-center gap-2"
          >
            {initialData ? 'Save Changes' : 'Add to Catalogue'}
          </button>
        </div>
      </div>
    </div>
  );
};
