import React, { useState, useCallback, useRef } from 'react';
import ReactCrop, { type Crop, type PixelCrop, centerCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { X, Check } from 'lucide-react';
import { getCroppedImgDataUrl } from '../services/cropImage';

interface ImageCropDialogProps {
  imageSrc: string;
  onCancel: () => void;
  onComplete: (dataUrl: string) => void;
}

function initialCropForImage(img: HTMLImageElement): Crop {
  return centerCrop({ unit: '%', width: 90, height: 90 }, img.width, img.height);
}

export const ImageCropDialog: React.FC<ImageCropDialogProps> = ({ imageSrc, onCancel, onComplete }) => {
  const [crop, setCrop] = useState<Crop>();
  const [applying, setApplying] = useState(false);
  const completedPixelCrop = useRef<PixelCrop | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setCrop(initialCropForImage(img));
    completedPixelCrop.current = null;
  }, []);

  const handleApply = () => {
    const img = imgRef.current;
    const pixels = completedPixelCrop.current;
    if (!img?.naturalWidth) {
      alert('Image is still loading. Please wait.');
      return;
    }
    if (!pixels || pixels.width < 1 || pixels.height < 1) {
      alert('Adjust the crop area, then apply.');
      return;
    }
    setApplying(true);
    try {
      const dataUrl = getCroppedImgDataUrl(img, pixels);
      onComplete(dataUrl);
    } catch (e) {
      console.error(e);
      alert('Could not crop the image. Try again.');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/95 safe-area-top safe-area-bottom">
      <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
        <div>
          <p className="text-white font-bold text-sm">Crop image</p>
          <p className="text-white/60 text-xs mt-0.5">
            Drag any corner or edge to resize. Any width and height — no fixed proportions.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          aria-label="Cancel crop"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex items-center justify-center p-3 sm:p-4">
        <ReactCrop
          crop={crop}
          onChange={(_, percentCrop) => setCrop(percentCrop)}
          onComplete={c => {
            completedPixelCrop.current = c;
          }}
          ruleOfThirds
          className="max-w-full max-h-full [&_.ReactCrop__crop-selection]:border-2 [&_.ReactCrop__crop-selection]:border-white [&_.ReactCrop__drag-handle]:bg-white [&_.ReactCrop__drag-handle]:min-w-[12px] [&_.ReactCrop__drag-handle]:min-h-[12px]"
        >
          <img
            ref={imgRef}
            src={imageSrc}
            alt="Crop"
            onLoad={onImageLoad}
            className="block max-h-[min(65vh,640px)] w-auto max-w-full h-auto select-none"
            draggable={false}
          />
        </ReactCrop>
      </div>

      <div className="shrink-0 px-4 py-3 flex gap-2 bg-black/80 border-t border-white/10">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-3 rounded-xl font-bold text-sm bg-white/10 text-white hover:bg-white/20 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={applying}
          onClick={handleApply}
          className="flex-1 py-3 rounded-xl font-bold text-sm bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {applying ? (
            'Saving…'
          ) : (
            <>
              <Check className="w-5 h-5" />
              Apply crop
            </>
          )}
        </button>
      </div>
    </div>
  );
};
