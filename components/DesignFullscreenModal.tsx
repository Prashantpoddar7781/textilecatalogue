import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { TextileDesign } from '../types';

interface Props {
  design: TextileDesign | null;
  onClose: () => void;
}

export const DesignFullscreenModal: React.FC<Props> = ({ design, onClose }) => {
  const images = useMemo(() => {
    if (!design) return [];
    return [design.image, ...(design.aiModels || [])];
  }, [design]);

  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [design?.id]);

  const go = useCallback(
    (delta: number) => {
      if (images.length === 0) return;
      setIndex(i => (i + delta + images.length) % images.length);
    },
    [images.length]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, go]);

  if (!design || images.length === 0) return null;

  const label =
    index === 0 ? 'Product' : `AI variant ${index}`;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-sm safe-area-top safe-area-bottom"
      role="dialog"
      aria-modal="true"
      aria-label="Design fullscreen"
    >
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/10">
        <p className="text-white text-sm font-bold truncate pr-4">
          {design.name || 'Design'} · {label}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          aria-label="Close"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      <div
        className="flex-1 flex items-center justify-center relative min-h-0 p-2"
        onClick={onClose}
      >
        <img
          src={images[index]}
          alt=""
          className="max-w-full max-h-[calc(100vh-8rem)] w-auto h-auto object-contain select-none"
          onClick={e => e.stopPropagation()}
          draggable={false}
        />

        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                go(-1);
              }}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 text-white hover:bg-black/70"
              aria-label="Previous image"
            >
              <ChevronLeft className="w-8 h-8" />
            </button>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                go(1);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 text-white hover:bg-black/70"
              aria-label="Next image"
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          </>
        )}
      </div>

      {images.length > 1 && (
        <div className="shrink-0 flex justify-center gap-2 pb-6 pt-2 px-4">
          {images.map((src, i) => (
            <button
              key={i}
              type="button"
              onClick={e => {
                e.stopPropagation();
                setIndex(i);
              }}
              className={`w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                i === index ? 'border-indigo-400 ring-2 ring-indigo-400/50' : 'border-white/20 opacity-70'
              }`}
            >
              <img src={src} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
