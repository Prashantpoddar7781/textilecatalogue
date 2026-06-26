import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, IndianRupee, Camera, Plus, Trash2, Sparkles, Loader2, Maximize2, Cloud, Crop } from 'lucide-react';
import { HexColorPicker } from 'react-colorful';
import { TextileDesign, AdditionalPrice, DesignCostingDetails } from '../types';
import { cataloguesApi, designsApi } from '../services/api';
import { generateAIModelling, ensureModelImageDataUrl, resizeProductImageForGemini } from '../services/gemini';
import { pickImageFromGoogleDrive } from '../services/googleDrivePicker';
import { isNativeDrivePickerAvailable, pickImageFromNativeDrive } from '../services/nativeDriveFilePicker';
import { isNativeAndroid, takePhotoFromNativeCamera } from '../services/nativeApp';
import { enhancePhotoForCatalogue } from '../services/photoEnhance';
import { DEFAULT_AI_MODEL_IMAGE } from '../constants';
import { ImageLightbox } from './ImageLightbox';
import { ImageCropDialog } from './ImageCropDialog';
import { CostingCalculator } from './CostingCalculator';

interface Props {
  onClose: () => void;
  onSubmit: (design: TextileDesign) => void | Promise<void>;
  initialData?: TextileDesign | null;
  materialNameOptions?: string[];
  supplierNameOptions?: string[];
  karigarNameOptions?: string[];
}

export const UploadForm: React.FC<Props> = ({
  onClose,
  onSubmit,
  initialData,
  materialNameOptions = [],
  supplierNameOptions = [],
  karigarNameOptions = []
}) => {
  const emptyCostingDetails: DesignCostingDetails = { materials: [], jobs: [], otherCosts: [] };
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
    basePrice: '',
    color: '',
    stockQuantity: '',
    stockUnit: 'pcs' as 'pcs' | 'mtrs',
    pcsPerParcel: '',
    moq: '',
    fabric: '',
    description: ''
  });
  const [additionalPrices, setAdditionalPrices] = useState<AdditionalPrice[]>([]);
  const [calculatedPriceOverrides, setCalculatedPriceOverrides] = useState<Record<number, number>>({});
  const [costingEnabled, setCostingEnabled] = useState(
    !!initialData?.costingDetails &&
    (
      (initialData.costingDetails.materials?.length || 0) > 0 ||
      (initialData.costingDetails.jobs?.length || 0) > 0 ||
      (initialData.costingDetails.otherCosts?.length || 0) > 0
    )
  );
  const [costingDetails, setCostingDetails] = useState<DesignCostingDetails>(initialData?.costingDetails || emptyCostingDetails);

  const [driveImporting, setDriveImporting] = useState(false);
  const [modelling, setModelling] = useState(false);
  const [aiModellingEnabled, setAiModellingEnabled] = useState(false);
  const [modellingOption, setModellingOption] = useState<'colors' | 'variants'>('colors');
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [variantPreviews, setVariantPreviews] = useState<string[]>([]);
  const [generatedModels, setGeneratedModels] = useState<string[]>([]);
  /** While generating: ordered slots (null = still loading). Null = not in generation UI. */
  const [generatingSlots, setGeneratingSlots] = useState<(string | null)[] | null>(null);
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);
  const [customModelImage, setCustomModelImage] = useState<string | null>(null);
  const [currentColor, setCurrentColor] = useState('#ff0000');
  const variantInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);
  /** When set, full-screen crop UI is shown for this image (data URL). */
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [enhancingPhoto, setEnhancingPhoto] = useState(false);
  const [photoEnhancement, setPhotoEnhancement] = useState<{ original: string; enhanced: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        basePrice: (initialData.basePrice || initialData.retailPrice || 0).toString(),
        color: initialData.color || '',
        stockQuantity: initialData.stockQuantity?.toString() || '',
        stockUnit: (initialData.stockUnit as 'pcs' | 'mtrs') || 'pcs',
        pcsPerParcel: initialData.pcsPerParcel?.toString() || '',
        moq: initialData.moq?.toString() || '',
        fabric: initialData.fabric || '',
        description: initialData.description || ''
      });
      setAdditionalPrices(initialData.additionalPrices || []);
      const editOverrides: Record<number, number> = {};
      (initialData.additionalPrices || []).forEach((ap, i) => {
        if (typeof ap.calculatedPrice === 'number' && Number.isFinite(ap.calculatedPrice)) {
          editOverrides[i] = ap.calculatedPrice;
        }
      });
      setCalculatedPriceOverrides(editOverrides);
      setPreview(initialData.image);
      setGeneratedModels(initialData.aiModels ?? []);
      setAiModellingEnabled(false);
      setCostingDetails(initialData.costingDetails || emptyCostingDetails);
      setCostingEnabled(
        !!initialData.costingDetails &&
        (
          (initialData.costingDetails.materials?.length || 0) > 0 ||
          (initialData.costingDetails.jobs?.length || 0) > 0 ||
          (initialData.costingDetails.otherCosts?.length || 0) > 0
        )
      );
      setGeneratingSlots(null);
      setCropSource(null);
      setPhotoEnhancement(null);
    } else {
      // Reset form when not editing
      setFormData({
        name: '',
        catalogueId: '',
        basePrice: '',
        color: '',
        stockQuantity: '',
        stockUnit: 'pcs',
        pcsPerParcel: '',
        moq: '',
        fabric: '',
        description: ''
      });
      setAdditionalPrices([]);
      setCalculatedPriceOverrides({});
      setPreview(null);
      setGeneratedModels([]);
      setGeneratingSlots(null);
      setAiModellingEnabled(false);
      setModellingOption('colors');
      setSelectedColors([]);
      setVariantPreviews([]);
      setCustomModelImage(null);
      setCurrentColor('#ff0000');
      setCropSource(null);
      setPhotoEnhancement(null);
      setCostingEnabled(false);
      setCostingDetails(emptyCostingDetails);
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

  const loadCatalogueDefaults = async (catalogueId: string) => {
    try {
      const { designs } = await designsApi.getAll({ catalogue: catalogueId, limit: 1, sortBy: 'newest' });
      if (designs && designs.length > 0) {
        const d = designs[0];
        setFormData(prev => ({
          ...prev,
          catalogueId,
          basePrice: (d.basePrice ?? d.retailPrice ?? 0).toString(),
          color: d.color ?? '',
          stockQuantity: d.stockQuantity?.toString() ?? '',
          stockUnit: (d.stockUnit as 'pcs' | 'mtrs') || 'pcs',
          pcsPerParcel: d.pcsPerParcel?.toString() ?? '',
          moq: d.moq?.toString() ?? '',
          fabric: d.fabric ?? '',
          description: d.description ?? ''
        }));
        const mapped = d.additionalPrices?.map((ap: any) => ({
          name: ap.name ?? '',
          type: ap.type ?? 'percentage',
          value: ap.value ?? 0,
          calculatedPrice: ap.calculatedPrice
        })) ?? [];
        setAdditionalPrices(mapped);
        const catOverrides: Record<number, number> = {};
        mapped.forEach((ap, i) => {
          if (typeof ap.calculatedPrice === 'number' && Number.isFinite(ap.calculatedPrice)) {
            catOverrides[i] = ap.calculatedPrice;
          }
        });
        setCalculatedPriceOverrides(catOverrides);
        const nextCosting = d.costingDetails || emptyCostingDetails;
        setCostingDetails(nextCosting);
        setCostingEnabled(
          (nextCosting.materials?.length || 0) > 0 ||
          (nextCosting.jobs?.length || 0) > 0 ||
          (nextCosting.otherCosts?.length || 0) > 0
        );
      }
    } catch (err) {
      console.warn('Could not load catalogue defaults', err);
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
        setCropSource(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handleCameraCapture = async () => {
    if (isNativeAndroid()) {
      try {
        const dataUrl = await takePhotoFromNativeCamera();
        if (dataUrl) {
          setCropSource(dataUrl);
        }
      } catch (error) {
        console.error(error);
        alert('Could not open camera. Please allow camera permission and try again.');
      }
      return;
    }

    cameraInputRef.current?.click();
  };

  const isCapacitorWebView = () => {
    return isNativeDrivePickerAvailable();
  };

  const handleDriveImport = async () => {
    setDriveImporting(true);
    try {
      const dataUrl = isCapacitorWebView()
        ? await pickImageFromNativeDrive()
        : await pickImageFromGoogleDrive();
      if (dataUrl) {
        setCropSource(dataUrl);
      }
    } catch (e: unknown) {
      console.error(e);
      const msg = e instanceof Error ? e.message : 'Could not import from Google Drive.';
      alert(msg);
    } finally {
      setDriveImporting(false);
    }
  };

  const handleEnhancePhoto = async () => {
    if (!preview || enhancingPhoto) return;
    setEnhancingPhoto(true);
    try {
      const enhanced = await enhancePhotoForCatalogue(preview);
      setPhotoEnhancement({ original: preview, enhanced });
    } catch (error) {
      console.error(error);
      alert('Could not enhance this photo. Please try another image.');
    } finally {
      setEnhancingPhoto(false);
    }
  };

  const useEnhancedPhoto = () => {
    if (!photoEnhancement) return;
    setPreview(photoEnhancement.enhanced);
    setPhotoEnhancement(null);
  };

  const keepOriginalPhoto = () => {
    if (photoEnhancement?.original) {
      setPreview(photoEnhancement.original);
    }
    setPhotoEnhancement(null);
  };

  const handleVariantChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach((file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setVariantPreviews(prev => [...prev, reader.result as string].slice(0, 6));
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const openAiLightboxAt = (slotIndex: number) => {
    const slots = generatingSlots ?? generatedModels;
    if (!slots.length) return;
    const clicked = slots[slotIndex];
    if (typeof clicked !== 'string') return;
    const images = slots.filter((x): x is string => x != null);
    const index = images.indexOf(clicked);
    setLightbox({ images, index: Math.max(0, index) });
  };

  const handleRunModelling = async () => {
    if (!preview) return alert('Main product image required');
    setModelling(true);
    setGeneratingSlots(null);
    try {
      const modelToUse = customModelImage || DEFAULT_AI_MODEL_IMAGE;
      const modelResolved = await ensureModelImageDataUrl(modelToUse);
      if (!modelResolved) {
        alert('Could not load the model image. Try uploading a custom model image.');
        return;
      }

      let jobs: Promise<string | null>[] = [];

      if (modellingOption === 'colors') {
        const productPrepared = await resizeProductImageForGemini(preview);
        if (selectedColors.length === 0) {
          jobs = [generateAIModelling(productPrepared, modelResolved)];
        } else {
          jobs = selectedColors.map(color =>
            generateAIModelling(productPrepared, modelResolved, color)
          );
        }
      } else {
        if (variantPreviews.length === 0) {
          alert('Add at least one color variant image first.');
          return;
        }
        const variantsPrepared = await Promise.all(
          variantPreviews.map(v => resizeProductImageForGemini(v))
        );
        jobs = variantsPrepared.map(vp => generateAIModelling(vp, modelResolved));
      }

      const n = jobs.length;
      const results: (string | null)[] = new Array(n).fill(null);
      setGeneratingSlots([...results]);

      await Promise.all(
        jobs.map((p, i) =>
          p.then(res => {
            results[i] = res;
            setGeneratingSlots([...results]);
          })
        )
      );

      const validResults = results.filter((res): res is string => res !== null);
      setGeneratedModels(validResults);
      setGeneratingSlots(null);

      if (validResults.length === 0) {
        alert('AI generation failed. Check VITE_GEMINI_API_KEY and try again.');
      }
    } catch (e) {
      console.error(e);
      alert('An error occurred during AI generation. Check your connection and API key.');
      setGeneratingSlots(null);
    } finally {
      setModelling(false);
    }
  };

  const calculatePrice = (basePrice: number, price: AdditionalPrice): number => {
    if (price.type === 'percentage') {
      return basePrice * (1 + price.value / 100);
    } else {
      return basePrice + price.value;
    }
  };

  const handleAddPrice = () => {
    setAdditionalPrices([...additionalPrices, { name: '', type: 'percentage', value: 0 }]);
  };

  const handleRemovePrice = (index: number) => {
    setAdditionalPrices(additionalPrices.filter((_, i) => i !== index));
  };

  const handlePriceChange = (index: number, field: keyof AdditionalPrice | 'calculatedPrice', value: string | number) => {
    if (field === 'calculatedPrice') {
      const num = typeof value === 'number' ? value : parseFloat(String(value));
      if (!isNaN(num)) setCalculatedPriceOverrides(prev => ({ ...prev, [index]: num }));
      return;
    }
    const updated = [...additionalPrices];
    updated[index] = { ...updated[index], [field]: value };
    setAdditionalPrices(updated);
    setCalculatedPriceOverrides(prev => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isSubmitting) return;

    // Allow editing without re-uploading image if initialData exists
    const imageToUse = preview || initialData?.image;
    if (!imageToUse) return alert('Please upload an image');
    const designName = formData.name.trim() || `Design ${new Date().toLocaleDateString()}`;
    const basePriceNum = Number(formData.basePrice) || 0;

    // Calculate prices for additional price types
    const processedAdditionalPrices = additionalPrices
      .filter(
        ap =>
          ap.name.trim() &&
          ap.value !== 0 &&
          Number.isFinite(ap.value)
      )
      .map((ap, i) => ({
        ...ap,
        calculatedPrice: calculatedPriceOverrides[i] ?? calculatePrice(basePriceNum, ap)
      }));

    const newDesign: TextileDesign = {
      id: initialData?.id || Date.now().toString(),
      name: designName,
      catalogueId: formData.catalogueId || undefined,
      catalogueName: catalogues.find(c => c.id === formData.catalogueId)?.name,
      image: imageToUse,
      color: formData.color || undefined,
      stockQuantity: formData.stockQuantity ? Number(formData.stockQuantity) : undefined,
      stockUnit: formData.stockUnit,
      pcsPerParcel: formData.pcsPerParcel ? Number(formData.pcsPerParcel) : undefined,
      moq: formData.moq ? Number(formData.moq) : undefined,
      basePrice: basePriceNum,
      additionalPrices: processedAdditionalPrices.length > 0 ? processedAdditionalPrices : undefined,
      wholesalePrice: basePriceNum, // For backward compatibility
      retailPrice: basePriceNum, // For backward compatibility
      fabric: formData.fabric || 'Unknown',
      description: formData.description || '',
      createdAt: initialData?.createdAt || Date.now(),
      aiModels: generatedModels.length > 0 ? generatedModels : undefined
      ,
      costingDetails: costingEnabled ? costingDetails : undefined
    };

    setIsSubmitting(true);
    try {
      await onSubmit(newDesign);
    } finally {
      setIsSubmitting(false);
    }
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

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-2 sm:px-3 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium text-xs sm:text-sm transition-colors touch-target"
              >
                <Upload className="w-4 h-4 shrink-0" />
                <span className="text-center leading-tight">Gallery</span>
              </button>
              <button
                type="button"
                disabled={driveImporting}
                onClick={() => void handleDriveImport()}
                className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-2 sm:px-3 py-2.5 bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 rounded-xl font-medium text-xs sm:text-sm transition-colors touch-target disabled:opacity-60"
                aria-label="Import image from Google Drive"
                title="Choose a photo from Google Drive"
              >
                {driveImporting ? (
                  <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
                ) : (
                  <Cloud className="w-4 h-4 shrink-0" />
                )}
                <span className="text-center leading-tight">Google Drive</span>
              </button>
              <button
                type="button"
                onClick={() => void handleCameraCapture()}
                className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-2 sm:px-3 py-2.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-xl font-medium text-xs sm:text-sm transition-colors touch-target"
              >
                <Camera className="w-4 h-4 shrink-0" />
                <span className="text-center leading-tight">Camera</span>
              </button>
              <button
                type="button"
                disabled={!preview}
                onClick={() => preview && setCropSource(preview)}
                className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-2 sm:px-3 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 rounded-xl font-medium text-xs sm:text-sm transition-colors touch-target disabled:opacity-40 disabled:cursor-not-allowed"
                title={preview ? 'Crop the current image' : 'Add an image first'}
              >
                <Crop className="w-4 h-4 shrink-0" />
                <span className="text-center leading-tight">Crop</span>
              </button>
              <button
                type="button"
                disabled={!preview || enhancingPhoto}
                onClick={() => void handleEnhancePhoto()}
                className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-2 sm:px-3 py-2.5 bg-violet-50 hover:bg-violet-100 text-violet-900 border border-violet-200 rounded-xl font-medium text-xs sm:text-sm transition-colors touch-target disabled:opacity-40 disabled:cursor-not-allowed"
                title={preview ? 'Improve brightness, contrast, colour, and sharpness' : 'Add an image first'}
              >
                {enhancingPhoto ? (
                  <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 shrink-0" />
                )}
                <span className="text-center leading-tight">{enhancingPhoto ? 'Enhancing' : 'Enhance'}</span>
              </button>
            </div>

            {photoEnhancement && (
              <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-3 space-y-3">
                <div>
                  <p className="text-sm font-black text-gray-900">Photo enhancement ready</p>
                  <p className="text-xs text-violet-800 mt-0.5">
                    Compare both versions and choose what should be saved in the catalogue.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-white border border-gray-100 p-2">
                    <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-gray-500">Original</p>
                    <img src={photoEnhancement.original} alt="Original product" className="aspect-video w-full rounded-lg object-cover" />
                  </div>
                  <div className="rounded-xl bg-white border border-violet-200 p-2">
                    <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-violet-700">Enhanced</p>
                    <img src={photoEnhancement.enhanced} alt="Enhanced product" className="aspect-video w-full rounded-lg object-cover" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={keepOriginalPhoto}
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
                  >
                    Keep Original
                  </button>
                  <button
                    type="button"
                    onClick={useEnhancedPhoto}
                    className="rounded-xl bg-violet-600 px-3 py-2 text-sm font-bold text-white hover:bg-violet-700"
                  >
                    Use Enhanced
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4 border-2 border-indigo-50 p-6 rounded-2xl bg-indigo-50/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">AI Modelling</h3>
              </div>
              <button
                type="button"
                disabled
                className="px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-amber-100 text-amber-700 cursor-not-allowed"
              >
                Coming soon
              </button>
            </div>
            <p className="text-xs text-indigo-700 bg-white/70 border border-indigo-100 rounded-2xl px-4 py-3">
              AI modelling will return soon as a pay-per-use wallet feature. Existing saved AI model images remain available.
            </p>

            {aiModellingEnabled && (
              <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => modelInputRef.current?.click()}
                      onKeyDown={e => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          modelInputRef.current?.click();
                        }
                      }}
                      className="aspect-square rounded-3xl border-2 border-indigo-100 flex flex-col items-center justify-center bg-white transition-all overflow-hidden relative cursor-pointer hover:border-indigo-300"
                    >
                      <img
                        src={customModelImage || DEFAULT_AI_MODEL_IMAGE}
                        className="w-full h-full object-cover"
                        alt={customModelImage ? "Your reference model" : "Default catalogue model"}
                      />
                      <div className="absolute bottom-2 left-2 right-2 bg-indigo-600/90 backdrop-blur-sm text-white text-[8px] font-black py-1 px-2 rounded-lg text-center uppercase tracking-widest">
                        {customModelImage ? "Custom model" : "Default model"}
                      </div>
                      <div className="absolute top-2 right-2 bg-white/90 p-1 rounded-full shadow-sm">
                        <Upload className="w-3 h-3 text-indigo-600" />
                      </div>
                      <input
                        type="file"
                        ref={modelInputRef}
                        hidden
                        accept="image/*"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => setCustomModelImage(reader.result as string);
                            reader.readAsDataURL(file);
                          }
                          e.target.value = "";
                        }}
                      />
                    </div>
                    {customModelImage && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setCustomModelImage(null);
                        }}
                        className="text-[9px] font-bold text-indigo-600 hover:text-indigo-800 underline"
                      >
                        Use default model (project image)
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Modelling Option</p>
                    <p className="text-[8px] text-indigo-400 italic leading-relaxed">
                      Tap the image to upload your own model; otherwise the project default (model.png) is used.
                    </p>
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => setModellingOption('colors')}
                        className={`px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-left transition-all ${
                          modellingOption === 'colors' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-white text-gray-500 border border-gray-100'
                        }`}
                      >
                        1. Color Palette
                      </button>
                      <button
                        type="button"
                        onClick={() => setModellingOption('variants')}
                        className={`px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-left transition-all ${
                          modellingOption === 'variants' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-white text-gray-500 border border-gray-100'
                        }`}
                      >
                        2. Color Variants
                      </button>
                    </div>
                  </div>
                </div>

                {modellingOption === 'colors' ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Select up to 6 colors</p>
                      <span className="text-[10px] font-black text-indigo-600">{selectedColors.length}/6</span>
                    </div>

                    <div className="flex flex-col md:flex-row gap-6 items-center bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
                      <div className="custom-color-picker shrink-0 w-full md:w-auto flex flex-col items-center">
                        <HexColorPicker color={currentColor} onChange={setCurrentColor} />
                        <p className="mt-2 text-[8px] font-black text-gray-400 uppercase tracking-widest">Drag bottom slider to change color</p>
                      </div>

                      <div className="flex-1 space-y-4 w-full">
                        <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                          <div className="w-12 h-12 rounded-xl shadow-inner border-2 border-white" style={{ backgroundColor: currentColor }} />
                          <div className="flex-1">
                            <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Selected Shade</p>
                            <p className="text-xs font-bold text-gray-900 uppercase tracking-wider">{currentColor}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (selectedColors.length < 6 && !selectedColors.includes(currentColor)) {
                                setSelectedColors(prev => [...prev, currentColor]);
                              }
                            }}
                            disabled={selectedColors.length >= 6 || selectedColors.includes(currentColor)}
                            className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg shadow-indigo-100"
                          >
                            Add to Palette
                          </button>
                        </div>

                        <div className="space-y-2">
                          <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Your Palette</p>
                          <div className="grid grid-cols-6 gap-2">
                            {selectedColors.map(color => (
                              <button
                                key={color}
                                type="button"
                                onClick={() => setSelectedColors(prev => prev.filter(c => c !== color))}
                                className="aspect-square rounded-xl border-2 border-indigo-600 scale-105 shadow-md relative group transition-all"
                                style={{ backgroundColor: color }}
                              >
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-lg transition-opacity">
                                  <X className="w-3 h-3 text-white" />
                                </div>
                              </button>
                            ))}
                            {Array.from({ length: 6 - selectedColors.length }).map((_, i) => (
                              <div key={i} className="aspect-square rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50" />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Upload up to 6 variants</p>
                      <span className="text-[10px] font-black text-indigo-600">{variantPreviews.length}/6</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {variantPreviews.map((v, i) => (
                        <div key={i} className="relative aspect-square rounded-xl overflow-hidden group">
                          <img src={v} className="w-full h-full object-cover" alt="" />
                          <button
                            type="button"
                            onClick={() => setVariantPreviews(prev => prev.filter((_, idx) => idx !== i))}
                            className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      {variantPreviews.length < 6 && (
                        <button
                          type="button"
                          onClick={() => variantInputRef.current?.click()}
                          className="aspect-square rounded-xl border-2 border-dashed border-indigo-200 flex items-center justify-center bg-white hover:bg-indigo-50"
                        >
                          <Plus className="w-4 h-4 text-indigo-300" />
                        </button>
                      )}
                    </div>
                    <input type="file" ref={variantInputRef} hidden multiple accept="image/*" onChange={handleVariantChange} />
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleRunModelling}
                  disabled={modelling || (modellingOption === 'variants' && variantPreviews.length === 0)}
                  className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-xl shadow-indigo-100"
                >
                  {modelling ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating {modellingOption === 'colors' ? selectedColors.length || 1 : variantPreviews.length} AI Models...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Generate AI Models
                    </>
                  )}
                </button>

                {(generatingSlots || generatedModels.length > 0) && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        {modelling ? 'Generating…' : 'Generated results'}
                      </p>
                      {modelling && generatingSlots && (
                        <span className="text-[9px] font-bold text-indigo-600">
                          {generatingSlots.filter(s => s != null).length}/{generatingSlots.length} ready
                        </span>
                      )}
                    </div>
                    <p className="text-[9px] text-gray-500">
                      Tap a finished image to view fullscreen; use +/- to zoom.
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {(generatingSlots ?? generatedModels).map((img, i) => (
                        <button
                          key={i}
                          type="button"
                          disabled={img == null}
                          onClick={() => openAiLightboxAt(i)}
                          className={`relative aspect-square rounded-xl overflow-hidden border-2 text-left transition-all ${
                            img
                              ? 'border-indigo-100 cursor-zoom-in hover:ring-2 hover:ring-indigo-300 active:scale-[0.98]'
                              : 'border-indigo-50 bg-indigo-50/80 cursor-wait'
                          }`}
                        >
                          {img ? (
                            <>
                              <img src={img} className="w-full h-full object-cover" alt="" />
                              <span className="absolute bottom-1 right-1 rounded-md bg-black/50 p-1 text-white pointer-events-none">
                                <Maximize2 className="w-3 h-3" />
                              </span>
                            </>
                          ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                              <span className="text-[8px] font-bold text-indigo-400 uppercase">Wait</span>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Catalogue Selection - right below image */}
          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700">Catalogue</label>
            {!showNewCatalogue ? (
              <div className="flex gap-2">
                <select
                  className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={formData.catalogueId}
                  onChange={e => {
                    const catalogueId = e.target.value;
                    setFormData(prev => ({ ...prev, catalogueId }));
                    if (catalogueId && !initialData) {
                      loadCatalogueDefaults(catalogueId);
                    }
                  }}
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

          {/* Design Name / Number */}
          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700">Design Name / Number *</label>
            <input
              required
              type="text"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="e.g. Summer-12 or SKU-045"
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
            />
          </div>

          {/* Design Metadata */}
          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700">Color</label>
            <input
              type="text"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="e.g. Blue"
              value={formData.color}
              onChange={e => setFormData({...formData, color: e.target.value})}
            />
          </div>

          <div className="space-y-3">
            <label className="text-sm font-semibold text-gray-700">Stock Quantity</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Unit</label>
                <select
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={formData.stockUnit}
                  onChange={e => setFormData({...formData, stockUnit: e.target.value as 'pcs' | 'mtrs'})}
                >
                  <option value="pcs">Pieces (pcs)</option>
                  <option value="mtrs">Meters (mtrs)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Quantity</label>
                <input
                  type="number"
                  min="0"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="e.g. 120"
                  value={formData.stockQuantity}
                  onChange={e => setFormData({...formData, stockQuantity: e.target.value})}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Pcs per parcel</label>
                <input
                  type="number"
                  min="1"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="e.g. 10"
                  value={formData.pcsPerParcel}
                  onChange={e => setFormData({...formData, pcsPerParcel: e.target.value})}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">MOQ (optional)</label>
                <input
                  type="number"
                  min="0"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Min order qty"
                  value={formData.moq}
                  onChange={e => setFormData({...formData, moq: e.target.value})}
                />
              </div>
            </div>
          </div>

          {/* Base Price */}
          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700">Base Price *</label>
            <div className="relative">
              <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                required
                type="number"
                step="0.01"
                className="w-full pl-9 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="0.00"
                value={formData.basePrice}
                onChange={e => setFormData({...formData, basePrice: e.target.value})}
              />
            </div>
          </div>

          <CostingCalculator
            enabled={costingEnabled}
            value={costingDetails}
            materialNameOptions={materialNameOptions}
            supplierNameOptions={supplierNameOptions}
            karigarNameOptions={karigarNameOptions}
            onEnabledChange={setCostingEnabled}
            onChange={setCostingDetails}
          />

          {/* Additional Prices */}
          <div className="space-y-3">
            <p className="text-xs text-gray-500 -mt-1">
              Percentage can be negative to discount the base (e.g. <span className="font-mono">-3</span> for 3% off). Fixed amount can be negative too.
            </p>
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-gray-700">Additional Price Types</label>
              <button
                type="button"
                onClick={handleAddPrice}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Price
              </button>
            </div>
            
            {additionalPrices.map((price, index) => {
              const basePriceNum = Number(formData.basePrice) || 0;
              const calculatedPrice = calculatePrice(basePriceNum, price);
              
              return (
                <div key={index} className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-600">Price Type {index + 1}</span>
                    <button
                      type="button"
                      onClick={() => handleRemovePrice(index)}
                      className="p-1 hover:bg-red-100 text-red-600 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Name</label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                        placeholder="e.g. WSP, MRP"
                        value={price.name}
                        onChange={e => handlePriceChange(index, 'name', e.target.value)}
                      />
                    </div>
                    
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Type</label>
                      <select
                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                        value={price.type}
                        onChange={e => handlePriceChange(index, 'type', e.target.value as 'percentage' | 'fixed')}
                      >
                        <option value="percentage">Percentage (%)</option>
                        <option value="fixed">Fixed Amount (₹)</option>
                      </select>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">
                      {price.type === 'percentage' ? 'Percentage' : 'Amount'}
                    </label>
                    <div className="relative">
                      {price.type === 'fixed' && (
                        <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      )}
                      <input
                        type="number"
                        step="any"
                        className={`w-full ${price.type === 'fixed' ? 'pl-9' : 'pl-3'} pr-3 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm`}
                        placeholder={price.type === 'percentage' ? '5 or -3' : '0.00'}
                        value={price.value === 0 ? '' : price.value}
                        onChange={e => {
                          const raw = e.target.value;
                          if (raw === '' || raw === '-') {
                            handlePriceChange(index, 'value', 0);
                            return;
                          }
                          const num = parseFloat(raw);
                          handlePriceChange(index, 'value', Number.isNaN(num) ? 0 : num);
                        }}
                      />
                      {price.type === 'percentage' && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                      )}
                    </div>
                  </div>
                  
                  {formData.basePrice &&
                    price.name.trim() &&
                    price.value !== 0 &&
                    Number.isFinite(price.value) && (
                    <div className="pt-2 border-t border-gray-200">
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Calculated Price (editable)</label>
                      <div className="relative">
                        <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input
                          type="number"
                          step="0.01"
                          className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold text-indigo-600"
                          value={calculatedPriceOverrides[index] ?? calculatedPrice}
                          onChange={e => handlePriceChange(index, 'calculatedPrice', e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            
            {additionalPrices.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-2">
                No additional prices added. Click "Add Price" to create custom price types.
              </p>
            )}
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
            type="button"
            disabled={isSubmitting}
            onClick={() => void handleSubmit()}
            className="w-full bg-gray-900 text-white py-4 rounded-xl font-bold shadow-xl hover:bg-black transition-all flex items-center justify-center gap-2 active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {initialData ? 'Saving changes...' : 'Adding to catalogue...'}
              </>
            ) : (
              initialData ? 'Save Changes' : 'Add to Catalogue'
            )}
          </button>
        </div>
      </div>

      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
          title="AI generated"
        />
      )}

      {cropSource && (
        <ImageCropDialog
          key={cropSource}
          imageSrc={cropSource}
          onCancel={() => setCropSource(null)}
          onComplete={dataUrl => {
            setPreview(dataUrl);
            setPhotoEnhancement(null);
            setCropSource(null);
          }}
        />
      )}
    </div>
  );
};
