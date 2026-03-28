import React, { useEffect, useCallback, useState } from 'react';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';

interface Props {
  images: string[];
  initialIndex: number;
  onClose: () => void;
  title?: string;
}

export const ImageLightbox: React.FC<Props> = ({ images, initialIndex, onClose, title }) => {
  const [index, setIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    setIndex(initialIndex);
    setZoom(1);
  }, [initialIndex, images]);

  const go = useCallback(
    (delta: number) => {
      if (images.length === 0) return;
      setIndex(i => (i + delta + images.length) % images.length);
      setZoom(1);
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

  if (images.length === 0) return null;

  const current = images[index];

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-black/95 backdrop-blur-sm safe-area-top safe-area-bottom"
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
    >
      <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
        <p className="text-white text-sm font-bold truncate min-w-0">
          {title ?? 'Preview'} · {index + 1} / {images.length}
        </p>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setZoom(z => Math.max(1, z - 0.5))}
            className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors touch-target"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(z => Math.min(4, z + 0.5))}
            className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors touch-target"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors touch-target"
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      <div
        className="flex-1 min-h-0 overflow-auto flex items-center justify-center p-2"
        onClick={onClose}
      >
        <div
          className="relative max-w-full max-h-full flex items-center justify-center"
          style={{ transform: `scale(${zoom})`, transition: 'transform 0.15s ease-out' }}
          onClick={e => e.stopPropagation()}
        >
          <img
            src={current}
            alt=""
            className="max-w-[min(100vw,100%)] max-h-[min(85dvh,85vh)] w-auto h-auto object-contain select-none"
            draggable={false}
          />
        </div>
      </div>

      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              go(-1);
            }}
            className="absolute left-2 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 text-white hover:bg-black/70 z-10 touch-target"
            aria-label="Previous"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              go(1);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 text-white hover:bg-black/70 z-10 touch-target"
            aria-label="Next"
          >
            <ChevronRight className="w-8 h-8" />
          </button>
        </>
      )}

      {images.length > 1 && (
        <div className="shrink-0 flex justify-center gap-2 pb-6 pt-2 px-4 overflow-x-auto no-scrollbar">
          {images.map((src, i) => (
            <button
              key={i}
              type="button"
              onClick={e => {
                e.stopPropagation();
                setIndex(i);
                setZoom(1);
              }}
              className={`w-14 h-14 rounded-lg overflow-hidden border-2 shrink-0 transition-all ${
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
