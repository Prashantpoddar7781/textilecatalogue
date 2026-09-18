import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { ShareOptions, TextileDesign } from '../types';
import { designFullSrc } from '../services/designMedia';
import { getShareAttachLines } from '../utils/shareAttachDetails';

interface Props {
  designs: TextileDesign[];
  index: number;
  options: ShareOptions;
  selectedPriceType: string;
  userFirmName?: string | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onOrderNow?: (design: TextileDesign) => void;
}

const SWIPE_MIN = 48;

export const ViewModeLightbox: React.FC<Props> = ({
  designs,
  index,
  options,
  selectedPriceType,
  userFirmName,
  onIndexChange,
  onClose,
  onOrderNow
}) => {
  const design = designs[index];
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);

  const photos = design
    ? [designFullSrc(design), ...(design.aiModels || []).filter(Boolean)]
    : [];

  useEffect(() => {
    setPhotoIndex(0);
  }, [design?.id]);

  const goDesign = useCallback((delta: number) => {
    if (designs.length === 0) return;
    const next = Math.min(designs.length - 1, Math.max(0, index + delta));
    if (next !== index) onIndexChange(next);
  }, [designs.length, index, onIndexChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goDesign(-1);
      if (e.key === 'ArrowRight') goDesign(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goDesign, onClose]);

  const onPointerStart = (clientX: number, clientY: number) => {
    startX.current = clientX;
    startY.current = clientY;
  };

  const onPointerEnd = (clientX: number, clientY: number) => {
    if (startX.current == null || startY.current == null) return;
    const dx = clientX - startX.current;
    const dy = clientY - startY.current;
    startX.current = null;
    startY.current = null;
    if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy)) return;
    goDesign(dx < 0 ? 1 : -1);
  };

  if (!design) return null;

  const lines = getShareAttachLines(design, options, selectedPriceType, userFirmName);
  const src = photos[Math.min(photoIndex, photos.length - 1)] || designFullSrc(design);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Design viewer"
      onTouchStart={e => onPointerStart(e.touches[0].clientX, e.touches[0].clientY)}
      onTouchEnd={e => onPointerEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY)}
      onMouseDown={e => onPointerStart(e.clientX, e.clientY)}
      onMouseUp={e => onPointerEnd(e.clientX, e.clientY)}
    >
      <div className="flex items-center justify-between px-4 py-3 text-white safe-area-top">
        <p className="text-sm font-bold">
          {index + 1} / {designs.length}
        </p>
        <button type="button" onClick={onClose} className="p-2 rounded-full bg-white/15" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="relative flex-1 min-h-0 flex items-center justify-center px-2">
        {index > 0 && (
          <button
            type="button"
            onClick={() => goDesign(-1)}
            className="absolute left-2 z-10 p-2 rounded-full bg-black/40 text-white hidden sm:flex"
            aria-label="Previous design"
          >
            <ChevronLeft className="w-7 h-7" />
          </button>
        )}
        <img
          src={src}
          alt={design.name || 'Design'}
          className="max-h-full max-w-full object-contain select-none"
          draggable={false}
        />
        {index < designs.length - 1 && (
          <button
            type="button"
            onClick={() => goDesign(1)}
            className="absolute right-2 z-10 p-2 rounded-full bg-black/40 text-white hidden sm:flex"
            aria-label="Next design"
          >
            <ChevronRight className="w-7 h-7" />
          </button>
        )}
      </div>

      {photos.length > 1 && (
        <div className="flex justify-center gap-2 px-4 pb-2">
          {photos.map((url, i) => (
            <button
              key={`${design.id}-${i}`}
              type="button"
              onClick={() => setPhotoIndex(i)}
              className={`w-10 h-10 rounded-lg overflow-hidden border-2 ${
                i === photoIndex ? 'border-white' : 'border-white/30 opacity-70'
              }`}
            >
              <img src={url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {(lines.length > 0 || onOrderNow) && (
        <div className="px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-3 bg-gradient-to-t from-black via-black/80 to-transparent text-white">
          {lines.length > 0 && (
            <div className="space-y-1">
              {lines.map(line => (
                <p key={`${line.label}-${line.value}`} className="text-sm font-semibold leading-snug">
                  <span className="text-white/60 font-bold uppercase text-[10px] tracking-wide mr-2">{line.label}</span>
                  {line.value}
                </p>
              ))}
            </div>
          )}
          {onOrderNow && (
            <button
              type="button"
              onClick={() => onOrderNow(design)}
              className="mt-3 w-full rounded-xl bg-green-600 py-3 text-sm font-black uppercase text-white"
            >
              Order Now
            </button>
          )}
          <p className="mt-2 text-[11px] text-white/50">Swipe left or right for the next design in this filter</p>
        </div>
      )}
    </div>
  );
};
