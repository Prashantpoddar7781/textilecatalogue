import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactCrop, {
  type Crop,
  type PixelCrop,
  centerCrop,
  makeAspectCrop
} from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { X, Check } from 'lucide-react';
import { getCroppedImgDataUrl } from '../services/cropImage';

type AspectMode = 'free' | '1' | '4_3' | '3_4';

const ASPECT_MAP: Record<Exclude<AspectMode, 'free'>, number> = {
  '1': 1,
  '4_3': 4 / 3,
  '3_4': 3 / 4
};

interface ImageCropDialogProps {
  imageSrc: string;
  onCancel: () => void;
  onComplete: (dataUrl: string) => void;
}

function buildInitialCrop(img: HTMLImageElement, mode: AspectMode): Crop {
  const w = img.width;
  const h = img.height;
  if (mode === 'free') {
    return centerCrop({ unit: '%', width: 85, height: 85 }, w, h);
  }
  const aspect = ASPECT_MAP[mode];
  return centerCrop(makeAspectCrop({ unit: '%', width: 75 }, aspect, w, h), w, h);
}

export const ImageCropDialog: React.FC<ImageCropDialogProps> = ({ imageSrc, onCancel, onComplete }) => {
  const [crop, setCrop] = useState<Crop>();
  const [aspectMode, setAspectMode] = useState<AspectMode>('free');
  const [applying, setApplying] = useState(false);
  /** Latest pixel-accurate crop from react-image-crop (for export). */
  const completedPixelCrop = useRef<PixelCrop | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setCrop(buildInitialCrop(img, aspectMode));
    completedPixelCrop.current = null;
  }, [aspectMode]);

  const skipNextAspectEffect = useRef(true);
  // When user switches aspect lock after the image has loaded, re-fit the selection
  useEffect(() => {
    if (skipNextAspectEffect.current) {
      skipNextAspectEffect.current = false;
      return;
    }
    const img = imgRef.current;
    if (!img?.naturalWidth) return;
    setCrop(buildInitialCrop(img, aspectMode));
    completedPixelCrop.current = null;
  }, [aspectMode]);

  const handleApply = () => {
    const img = imgRef.current;
    const pixels = completedPixelCrop.current;
    if (!img?.naturalWidth) {
      alert('Image is still loading. Please wait.');
      return;
    }
    if (!pixels || pixels.width < 1 || pixels.height < 1) {
      alert('Drag the handles to choose the area to keep, then apply.');
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

  const aspect = aspectMode === 'free' ? undefined : ASPECT_MAP[aspectMode];

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/95 safe-area-top safe-area-bottom">
      <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
        <div>
          <p className="text-white font-bold text-sm">Crop image</p>
          <p className="text-white/60 text-xs mt-0.5">
            Drag the corners or edges. Choose a shape below or stay on Free for any rectangle.
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

      <div className="shrink-0 px-4 py-2 flex flex-wrap gap-2 justify-center border-b border-white/10">
        {(
          [
            { id: 'free' as const, label: 'Free' },
            { id: '1' as const, label: '1:1' },
            { id: '4_3' as const, label: '4:3' },
            { id: '3_4' as const, label: '3:4' }
          ] as const
        ).map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setAspectMode(id)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
              aspectMode === id ? 'bg-indigo-500 text-white' : 'bg-white/10 text-white/80 hover:bg-white/20'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center p-4">
        <ReactCrop
          crop={crop}
          aspect={aspect}
          ruleOfThirds
          className="max-w-full [&_.ReactCrop__crop-selection]:border-2 [&_.ReactCrop__crop-selection]:border-white [&_.ReactCrop__drag-handle]:bg-white"
          onChange={(_, percentCrop) => setCrop(percentCrop)}
          onComplete={c => {
            completedPixelCrop.current = c;
          }}
        >
          <img
            ref={imgRef}
            src={imageSrc}
            alt="Crop"
            onLoad={onImageLoad}
            className="block max-h-[min(58vh,560px)] w-auto max-w-full h-auto select-none"
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
