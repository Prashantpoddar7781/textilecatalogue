
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, MessageCircle, CheckSquare, Square, Loader2, Download, Eye, AlertCircle, Send, Link2 } from 'lucide-react';
import { TextileDesign, ShareOptions } from '../types';
import { loadSharePreferences, saveSharePreferences } from '../services/sharePreferences';
import { isNativeAndroid, openWhatsAppWithText, shareImagesNative, downloadBlob } from '../services/nativeApp';
import { designFullSrc, loadImageForCanvas } from '../services/designMedia';

/** Which image to use per design when generating WhatsApp assets (original / variant index / all). */
function getShareJobs(
  designs: TextileDesign[],
  choiceById: Record<string, string>
): { design: TextileDesign; imageUrl: string }[] {
  const jobs: { design: TextileDesign; imageUrl: string }[] = [];
  for (const d of designs) {
    const raw = choiceById[d.id] ?? 'original';
    if (raw === 'all' && d.aiModels && d.aiModels.length > 0) {
      for (const url of d.aiModels) {
        jobs.push({ design: d, imageUrl: url });
      }
    } else if (raw === 'original' || !d.aiModels?.length) {
      jobs.push({ design: d, imageUrl: designFullSrc(d) });
    } else {
      const idx = parseInt(raw, 10);
      if (!isNaN(idx) && d.aiModels[idx]) {
        jobs.push({ design: d, imageUrl: d.aiModels[idx] });
      } else {
        jobs.push({ design: d, imageUrl: designFullSrc(d) });
      }
    }
  }
  return jobs;
}

interface Props {
  selectedDesigns: TextileDesign[];
  userFirmName?: string;
  onClose: () => void;
  onShareLink?: (designs: TextileDesign[]) => void;
}

export const ShareDialog: React.FC<Props> = ({ selectedDesigns, userFirmName, onClose, onShareLink }) => {
  const [processing, setProcessing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isMobile] = useState(() => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  const [readyToLink, setReadyToLink] = useState(false);
  const [lastPreparedImageCount, setLastPreparedImageCount] = useState(0);
  const [shareMode, setShareMode] = useState<'whatsapp' | 'link'>('whatsapp');
  const [options, setOptions] = useState<ShareOptions>(() => loadSharePreferences().options);
  const [selectedPriceType, setSelectedPriceType] = useState<string>(() => {
    const p = loadSharePreferences();
    return p.selectedPriceType;
  });
  const [imageChoice, setImageChoice] = useState<Record<string, string>>({});

  const previewUrlRef = useRef<string | null>(null);

  const shareJobs = useMemo(
    () => getShareJobs(selectedDesigns, imageChoice),
    [selectedDesigns, imageChoice]
  );

  useEffect(() => {
    setImageChoice(prev => {
      const next = { ...prev };
      for (const d of selectedDesigns) {
        if (next[d.id] === undefined) next[d.id] = 'original';
      }
      for (const k of Object.keys(next)) {
        if (!selectedDesigns.some(d => d.id === k)) delete next[k];
      }
      return next;
    });
  }, [selectedDesigns]);

  useEffect(() => {
    saveSharePreferences({ options, selectedPriceType });
  }, [options, selectedPriceType]);

  useEffect(() => {
    let isMounted = true;

    const updatePreview = async () => {
      if (shareJobs.length > 0) {
        try {
          const first = shareJobs[0];
          // Preview stays light; full-res export happens only on share (WhatsApp HD needs it).
          const blob = await generateBrandedImage(first.design, first.imageUrl, {
            maxEdge: 1080,
            jpegQuality: 0.85
          });
          if (!isMounted) return;

          const newUrl = URL.createObjectURL(blob);
          
          if (previewUrlRef.current) {
            URL.revokeObjectURL(previewUrlRef.current);
          }
          
          previewUrlRef.current = newUrl;
          setPreviewUrl(newUrl);
        } catch (err) {
          console.error("Preview generation failed", err);
        }
      }
    };

    updatePreview();

    return () => {
      isMounted = false;
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, [options, shareJobs, selectedPriceType]);

  const generateBrandedImage = async (
    design: TextileDesign,
    imageDataUrl?: string,
    exportOpts?: { maxEdge?: number; jpegQuality?: number }
  ): Promise<Blob> => {
    const source = imageDataUrl || designFullSrc(design);
    const img = await loadImageForCanvas(source, design.id);
    const objectUrlToRevoke = img.src.startsWith('blob:') ? img.src : null;

    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas context not found');

        /**
         * Photo fills canvas width (no side letterboxing); details sit in a black band below.
         * Share exports keep near-original size so WhatsApp can offer HD quality.
         */
        const sw = img.naturalWidth || 800;
        const sh = img.naturalHeight || 1000;
        const maxEdge = exportOpts?.maxEdge ?? 4096;
        const jpegQuality = exportOpts?.jpegQuality ?? 0.97;
        const width = Math.max(1, Math.min(sw, maxEdge));
        const photoH = Math.max(1, Math.round((sh / sw) * width));
        const padding = Math.round(width * 0.04);
        const fontSize = Math.max(28, Math.round(width * 0.028));
        const lineHeight = fontSize * 1.42;

        // 2. Prepare two columns: left = firm, fabric, price, description; right = catalogue + design
        const leftLines: string[] = [];
        const rightLines: string[] = [];

        if (options.includeFirmName && userFirmName) {
          leftLines.push(`Firm: ${userFirmName}`);
        }

        if (options.includeCatalogueName && design.catalogueName?.trim()) {
          rightLines.push(`Catalogue: ${design.catalogueName.trim()}`);
        }

        if (options.includeDesignName) {
          const designLabel =
            design.name?.trim() || design.designCode?.trim();
          if (designLabel) {
            rightLines.push(`Design: ${designLabel}`);
          }
        }

        if (options.includeFabric && design.fabric) {
          leftLines.push(`Fabric: ${design.fabric}`);
        }

        if (options.includeRetail || options.includeWholesale) {
          let priceToShow = design.basePrice || design.retailPrice || 0;
          let priceLabel = 'Price';

          if (selectedPriceType === 'base') {
            priceToShow = design.basePrice || design.retailPrice || 0;
            priceLabel = 'Price';
          } else if (design.additionalPrices) {
            const selectedPrice = design.additionalPrices.find(ap => ap.name === selectedPriceType);
            if (selectedPrice && selectedPrice.calculatedPrice) {
              priceToShow = selectedPrice.calculatedPrice;
              priceLabel = selectedPrice.name;
            }
          }

          leftLines.push(`${priceLabel}: ₹${priceToShow.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
        }
        if (options.includeDescription && design.description) {
          const maxDescLength = 60;
          const desc =
            design.description.length > maxDescLength
              ? design.description.substring(0, maxDescLength) + '...'
              : design.description;
          leftLines.push(desc);
        }

        const wrapParagraph = (text: string, maxW: number): string[] => {
          const words = text.split(' ');
          const out: string[] = [];
          let currentLine = '';
          words.forEach(word => {
            const testLine = currentLine + (currentLine ? ' ' : '') + word;
            const metrics = ctx.measureText(testLine);
            if (metrics.width > maxW && currentLine) {
              out.push(currentLine);
              currentLine = word;
            } else {
              currentLine = testLine;
            }
          });
          if (currentLine) out.push(currentLine);
          return out;
        };

        const flattenWrapped = (raw: string[], maxW: number): string[] => {
          const out: string[] = [];
          raw.forEach(line => {
            out.push(...wrapParagraph(line, maxW));
          });
          return out;
        };

        // 3. Label text — two columns when right column has content
        ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'top';

        const innerW = width - padding * 2;
        const colGap = Math.max(12, Math.round(fontSize * 0.75));
        const hasRight = rightLines.length > 0;
        const leftColW = hasRight ? Math.floor((innerW - colGap) * 0.54) : innerW;
        const rightColW = hasRight ? innerW - colGap - leftColW : 0;

        const leftWrapped = flattenWrapped(leftLines, leftColW);
        const rightWrapped = hasRight ? flattenWrapped(rightLines, rightColW) : [];

        const textLineCount = Math.max(leftWrapped.length, rightWrapped.length, 1);
        const bannerH = Math.max(
          Math.round(width * 0.12),
          padding * 2 + textLineCount * lineHeight
        );
        const height = photoH + bannerH;

        canvas.width = width;
        canvas.height = height;

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, sw, sh, 0, 0, width, photoH);

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, photoH, width, bannerH);

        ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'top';

        const leftX = padding;
        const rightEdgeX = width - padding;
        let yLeft = photoH + padding;
        let yRight = photoH + padding;

        ctx.textAlign = 'left';
        leftWrapped.forEach(line => {
          ctx.fillText(line, leftX, yLeft);
          yLeft += lineHeight;
        });

        if (hasRight && rightWrapped.length > 0) {
          ctx.textAlign = 'right';
          rightWrapped.forEach(line => {
            ctx.fillText(line, rightEdgeX, yRight);
            yRight += lineHeight;
          });
        }

        ctx.textAlign = 'left';

        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((result) => {
            if (result) resolve(result);
            else reject(new Error('Blob conversion failed'));
          }, 'image/jpeg', jpegQuality);
        });
        return blob;
    } finally {
      if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
    }
  };

  const downloadOne = async (blob: Blob, name: string) => {
    await downloadBlob(blob, name);
  };

  const blobToDataUrl = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Could not prepare image for sharing'));
      reader.readAsDataURL(blob);
    });

  const handlePrepareShare = async () => {
    setProcessing(true);
    try {
      const files: File[] = [];
      const blobs: Blob[] = [];
      const jobs = shareJobs;

      for (let i = 0; i < jobs.length; i++) {
        try {
          const { design, imageUrl } = jobs[i];
          const blob = await generateBrandedImage(design, imageUrl);
          blobs.push(blob);
          files.push(new File([blob], `design-${i + 1}.jpg`, { type: 'image/jpeg' }));
        } catch (error) {
          console.error(`Failed to generate image ${i + 1}:`, error);
        }
      }

      if (blobs.length === 0) {
        throw new Error('Failed to generate any images');
      }

      if (isNativeAndroid()) {
        const dataUrls = await Promise.all(blobs.map(blobToDataUrl));
        await shareImagesNative(dataUrls);
        onClose();
        setProcessing(false);
        return;
      }

      // Priority 1: Mobile Native Sharing API — share files only (no app caption; labels are on the images)
      if (isMobile && navigator.share) {
        try {
          // Check if files can be shared
          if (navigator.canShare && navigator.canShare({ files })) {
            await navigator.share({
              files,
            });
            onClose();
            setProcessing(false);
            return;
          } else {
            // Fallback: share without files (some browsers don't support file sharing)
            const textWithInfo = selectedDesigns
              .map((d, i) => {
                const pricePart = options.includeRetail
                  ? ` — ₹${(d.basePrice || d.retailPrice || 0).toLocaleString()}`
                  : '';
                return `${i + 1}. ${d.fabric}${pricePart}`;
              })
              .join('\n');

            if (navigator.canShare({ text: textWithInfo })) {
              await navigator.share({
                text: textWithInfo,
              });
              for (let i = 0; i < blobs.length; i++) {
                await downloadOne(blobs[i], `design-${i + 1}.jpg`);
                if (blobs.length > 1) await new Promise(r => setTimeout(r, 300));
              }
              onClose();
              setProcessing(false);
              return;
            }
          }
        } catch (e: any) {
          // User cancelled or error - continue to fallback
          if (e.name !== 'AbortError') {
            console.log("Share API error:", e);
          }
        }
      }

      // Priority 2: WhatsApp Web API (works on desktop and mobile browsers)
      // First download images, then open WhatsApp
      for (let i = 0; i < blobs.length; i++) {
        await downloadOne(blobs[i], `design-${i + 1}.jpg`);
        if (blobs.length > 1) await new Promise(r => setTimeout(r, 300));
      }

      setLastPreparedImageCount(blobs.length);
      setReadyToLink(true);
      setProcessing(false);

    } catch (error) {
      console.error('Share process failed:', error);
      alert('Could not prepare images. Please ensure your images are valid.');
      setProcessing(false);
    }
  };

  const openWhatsAppLink = async () => {
    try {
      await openWhatsAppWithText('');
    } catch (error) {
      console.error(error);
    }

    setTimeout(() => {
      onClose();
    }, 500);
  };

  // Group sharing functionality removed - groups feature not available

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/95 backdrop-blur-md p-0 sm:p-4 safe-area-top safe-area-bottom overflow-hidden">
      {/* min-h-0 lets flex children shrink so the footer (WhatsApp / Prepare) stays on screen on mobile */}
      <div className="bg-white w-full max-w-lg rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col min-h-0 max-h-[min(92dvh,100vh)] sm:max-h-[95vh] animate-in slide-in-from-bottom duration-300 touch-manipulation">
        
        <div className="shrink-0 px-6 py-5 flex items-center justify-between border-b bg-white">
          <div className="flex items-center gap-3">
            <div className="bg-green-100 p-2 rounded-xl">
              <MessageCircle className="w-6 h-6 text-green-600 fill-green-600/10" />
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900 tracking-tight">WhatsApp Catalogue</h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded-full">
                  Step {readyToLink ? '2: Send' : '1: Options'}
                </span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-4 sm:space-y-6">
          {shareMode === 'whatsapp' && selectedDesigns.some(d => (d.aiModels?.length ?? 0) > 0) && (
            <div className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4">
              <p className="text-sm font-bold text-gray-900">Photo for WhatsApp</p>
              <p className="text-xs text-gray-600 leading-relaxed">
                Designs with AI modelling: choose the product image, a single AI variant, or all variants (one file per variant).
              </p>
              {selectedDesigns
                .filter(d => (d.aiModels?.length ?? 0) > 0)
                .map(d => (
                  <div key={d.id} className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                      {d.name || d.fabric || 'Design'}
                    </label>
                    <select
                      value={imageChoice[d.id] ?? 'original'}
                      onChange={e =>
                        setImageChoice(prev => ({ ...prev, [d.id]: e.target.value }))
                      }
                      disabled={processing}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="original">Product image (original)</option>
                      {d.aiModels!.map((_, i) => (
                        <option key={i} value={String(i)}>
                          AI variant {i + 1}
                        </option>
                      ))}
                      <option value="all">All AI variants (separate images)</option>
                    </select>
                  </div>
                ))}
            </div>
          )}

          {shareMode === 'link' && selectedDesigns.some(d => (d.aiModels?.length ?? 0) > 0) && (
            <p className="text-xs text-gray-500 leading-relaxed rounded-xl bg-gray-50 border border-gray-100 p-3">
              Share links open your saved catalogue in the browser. To send a specific AI model shot by image, use WhatsApp mode and choose a variant above.
            </p>
          )}

          {/* Live Preview Area - Only show for WhatsApp/Group sharing */}
          {shareMode !== 'link' && (
          <div className="relative aspect-[4/3] max-h-[min(38vh,260px)] sm:max-h-none bg-gray-900 rounded-[2rem] overflow-hidden shadow-2xl ring-4 ring-white">
            {previewUrl ? (
              <img src={previewUrl} className="w-full h-full object-contain" alt="Preview" key={previewUrl} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-white/30 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                <span className="text-[10px] font-black uppercase tracking-widest">Rendering Preview...</span>
              </div>
            )}
            <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md text-white text-[9px] font-black px-3 py-1.5 rounded-full flex items-center gap-1.5 border border-white/10">
              <Eye className="w-3.5 h-3.5 text-indigo-400" />
              IMAGE LABEL PREVIEW
            </div>
          </div>
          )}

          {!readyToLink && shareMode !== 'link' ? (
            <div className="space-y-4">
              {/* Price toggle + type selection */}
              <div className="space-y-2">
                <button
                  disabled={processing}
                  onClick={() => setOptions({ ...options, includeRetail: !options.includeRetail })}
                  className={`flex w-full items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left ${
                    options.includeRetail
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-900 shadow-sm'
                      : 'border-gray-50 bg-gray-50 text-gray-400'
                  }`}
                >
                  {options.includeRetail ? (
                    <CheckSquare className="w-5 h-5 text-indigo-600" />
                  ) : (
                    <Square className="w-5 h-5" />
                  )}
                  <span className="font-bold text-xs uppercase tracking-tight">Price on image</span>
                </button>

                {options.includeRetail && (
                  <>
                    <label className="text-sm font-semibold text-gray-700">Select Price to Display</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        disabled={processing}
                        onClick={() => setSelectedPriceType('base')}
                        className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all text-left ${
                          selectedPriceType === 'base'
                            ? 'border-indigo-600 bg-indigo-50 text-indigo-900 shadow-sm'
                            : 'border-gray-200 bg-white text-gray-600'
                        }`}
                      >
                        <span className="font-bold text-xs">Base Price</span>
                        {selectedPriceType === 'base' && (
                          <CheckSquare className="w-4 h-4 text-indigo-600 ml-auto" />
                        )}
                      </button>

                      {selectedDesigns[0]?.additionalPrices?.map((ap) => (
                        <button
                          key={ap.name}
                          disabled={processing}
                          onClick={() => setSelectedPriceType(ap.name)}
                          className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all text-left ${
                            selectedPriceType === ap.name
                              ? 'border-indigo-600 bg-indigo-50 text-indigo-900 shadow-sm'
                              : 'border-gray-200 bg-white text-gray-600'
                          }`}
                        >
                          <span className="font-bold text-xs">{ap.name}</span>
                          {selectedPriceType === ap.name && (
                            <CheckSquare className="w-4 h-4 text-indigo-600 ml-auto" />
                          )}
                        </button>
                      ))}
                    </div>
                    {selectedDesigns[0]?.additionalPrices && selectedDesigns[0].additionalPrices.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-2">
                        No additional prices available. Add them when creating/editing the design.
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Other Options */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'includeCatalogueName', label: 'Catalogue name', key: 'includeCatalogueName' },
                  { id: 'includeDesignName', label: 'Design name / No.', key: 'includeDesignName' },
                  { id: 'includeFabric', label: 'Fabric Info', key: 'includeFabric' },
                  { id: 'includeDescription', label: 'Description', key: 'includeDescription' },
                  { id: 'includeFirmName', label: 'Firm Name', key: 'includeFirmName' }
                ].map((opt) => (
                  <button
                    key={opt.id}
                    disabled={processing}
                    onClick={() => setOptions({ ...options, [opt.key]: !options[opt.key as keyof ShareOptions] })}
                    className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left ${
                      options[opt.key as keyof ShareOptions] 
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-900 shadow-sm' 
                        : 'border-gray-50 bg-gray-50 text-gray-400'
                    }`}
                  >
                    {options[opt.key as keyof ShareOptions] ? 
                      <CheckSquare className="w-5 h-5 text-indigo-600" /> : 
                      <Square className="w-5 h-5" />
                    }
                    <span className="font-bold text-xs uppercase tracking-tight">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : shareMode === 'link' ? (
            <div className="bg-indigo-50 p-6 rounded-[2rem] border border-indigo-100 space-y-4">
              <div className="flex items-center gap-3 text-indigo-700">
                <Link2 className="w-6 h-6" />
                <p className="text-sm font-black uppercase tracking-tight">Share via Link</p>
              </div>
              <p className="text-xs text-indigo-800 font-medium leading-relaxed">
                Click the button below to create shareable links for {selectedDesigns.length} {selectedDesigns.length === 1 ? 'design' : 'designs'}. 
                You can set expiration time and choose which price to display.
              </p>
            </div>
          ) : (
            <div className="bg-green-50 p-6 rounded-[2rem] border border-green-100 space-y-4 animate-in fade-in zoom-in duration-300">
              <div className="flex items-center gap-3 text-green-700">
                <CheckSquare className="w-6 h-6" />
                <p className="text-sm font-black uppercase tracking-tight">Images Ready!</p>
              </div>
              <p className="text-xs text-green-800 font-medium leading-relaxed">
                {isMobile 
                  ? "Images have been saved. Now click the button below to open WhatsApp and select your contact."
                  : "We've downloaded your images with prices. WhatsApp Web is next — please ATTACH the downloaded images to your message."}
              </p>
            </div>
          )}

          {!isMobile && !readyToLink && (
            <div className="bg-amber-50 p-4 rounded-2xl flex items-start gap-3 border border-amber-100">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-[10px] font-black text-amber-900 uppercase">PC Browser Note</p>
                <p className="text-[10px] text-amber-800 leading-relaxed font-bold">
                  We will download the edited images first, then open WhatsApp. Just attach the images manually.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:p-8 bg-gray-50 border-t space-y-3 sm:space-y-4">
          {/* Share Mode Selection */}
          {!readyToLink && (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setShareMode('whatsapp');
                }}
                className={`p-3 rounded-xl border-2 transition-all ${
                  shareMode === 'whatsapp'
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-900'
                    : 'border-gray-200 bg-white text-gray-600'
                }`}
              >
                <MessageCircle className="w-5 h-5 mx-auto mb-1" />
                <span className="text-[10px] font-bold uppercase">WhatsApp</span>
              </button>
              <button
                onClick={() => {
                  setShareMode('link');
                }}
                className={`p-3 rounded-xl border-2 transition-all ${
                  shareMode === 'link'
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-900'
                    : 'border-gray-200 bg-white text-gray-600'
                }`}
              >
                <Link2 className="w-5 h-5 mx-auto mb-1" />
                <span className="text-[10px] font-bold uppercase">Link</span>
              </button>
            </div>
          )}

          {/* Action Buttons */}
          {!readyToLink ? (
            <button
              disabled={processing}
              onClick={() => {
                try {
                  if (shareMode === 'link') {
                    if (onShareLink) {
                      onShareLink(selectedDesigns);
                      onClose();
                    }
                  } else {
                    handlePrepareShare();
                  }
                } catch (error) {
                  console.error('Error in share action:', error);
                  alert('An error occurred. Please try again.');
                  setProcessing(false);
                }
              }}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-5 rounded-[1.8rem] font-black shadow-2xl shadow-indigo-200 flex items-center justify-center gap-3 active:scale-[0.97] transition-all disabled:opacity-50 text-lg"
            >
              {processing ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : shareMode === 'link' ? (
                <Link2 className="w-6 h-6" />
              ) : (
                <Download className="w-6 h-6" />
              )}
              <span>
                {processing 
                  ? 'Processing...' 
                  : shareMode === 'link'
                    ? `Create Share Link${selectedDesigns.length > 1 ? 's' : ''}`
                    : 'Prepare Images'}
              </span>
            </button>
          ) : (
            <button
              onClick={openWhatsAppLink}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-5 rounded-[1.8rem] font-black shadow-2xl shadow-green-200 flex items-center justify-center gap-3 active:scale-[0.97] transition-all text-lg"
            >
              <MessageCircle className="w-7 h-7 fill-white/20" />
              <span>Go to WhatsApp</span>
              <Send className="w-4 h-4 opacity-50" />
            </button>
          )}
          
          <div className="flex items-center justify-center gap-4 mt-6">
             <div className="h-px bg-gray-200 flex-1"></div>
             <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest shrink-0">
               {selectedDesigns.length} Items Selected
             </p>
             <div className="h-px bg-gray-200 flex-1"></div>
          </div>
        </div>
      </div>

    </div>
  );
};
