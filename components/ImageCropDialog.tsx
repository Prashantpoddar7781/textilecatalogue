import React, { useState, useCallback } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import { X, Check } from 'lucide-react';
import { getCroppedImgDataUrl } from '../services/cropImage';

type AspectPreset = '1' | '4_3' | '3_4';

const ASPECT_PRESETS: Record<AspectPreset, number> = {
  '1': 1,
  '4_3': 4 / 3,
  '3_4': 3 / 4
};

interface ImageCropDialogProps {
  imageSrc: string;
  onCancel: () => void;
  onComplete: (dataUrl: string) => void;
}

export const ImageCropDialog: React.FC<ImageCropDialogProps> = ({ imageSrc, onCancel, onComplete }) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [aspectPreset, setAspectPreset] = useState<AspectPreset>('4_3');
  const [applying, setApplying] = useState(false);

  const aspect = ASPECT_PRESETS[aspectPreset];

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleApply = async () => {
    if (!croppedAreaPixels) {
      alert('Adjust the crop area, then tap Apply.');
      return;
    }
    setApplying(true);
    try {
      const dataUrl = await getCroppedImgDataUrl(imageSrc, croppedAreaPixels);
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
          <p className="text-white/60 text-xs mt-0.5">Pinch or use the slider to zoom, drag to move</p>
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
            { id: '1' as const, label: '1:1' },
            { id: '4_3' as const, label: '4:3' },
            { id: '3_4' as const, label: '3:4' }
          ] as const
        ).map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setAspectPreset(id)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
              aspectPreset === id ? 'bg-indigo-500 text-white' : 'bg-white/10 text-white/80 hover:bg-white/20'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 relative">
        <Cropper
          key={aspectPreset}
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          showGrid
          objectFit="contain"
        />
      </div>

      <div className="shrink-0 px-4 py-3 space-y-3 bg-black/80 border-t border-white/10">
        <div className="flex items-center gap-3">
          <span className="text-white/70 text-xs font-semibold w-12 shrink-0">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
            className="flex-1 h-2 accent-indigo-500"
          />
        </div>
        <div className="flex gap-2">
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
            onClick={() => void handleApply()}
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
    </div>
  );
};
