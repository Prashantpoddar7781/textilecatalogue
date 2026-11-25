import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, MessageCircle, X } from 'lucide-react';
import { API_BASE_URL } from '../services/api';
import { isNativeAndroid, openWhatsAppWithText, shareImagesNative } from '../services/nativeApp';

export interface OrderDesignSlide {
  key: string;
  designId?: string;
  name: string;
  code?: string;
  image: string;
  quantity: number;
  fabric?: string;
}

interface Props {
  slides: OrderDesignSlide[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

const SWIPE_MIN = 48;

function viewSrc(slide: OrderDesignSlide) {
  if (slide.image) return slide.image;
  if (slide.designId) return `${API_BASE_URL}/designs/${slide.designId}/media/thumb`;
  return '';
}

function shareSrcs(slide: OrderDesignSlide) {
  const urls: string[] = [];
  if (slide.designId) {
    urls.push(`${API_BASE_URL}/designs/${slide.designId}/media/thumb?proxy=1`);
    urls.push(`${API_BASE_URL}/designs/${slide.designId}/media/full?proxy=1`);
  }
  if (slide.image && !urls.includes(slide.image)) urls.push(slide.image);
  return urls;
}

async function fetchImageFile(slide: OrderDesignSlide, index: number) {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
  for (const src of shareSrcs(slide)) {
    try {
      const response = await fetch(src, { headers });
      if (!response.ok) continue;
      const blob = await response.blob();
      if (!blob || blob.size < 32) continue;
      const type = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/jpeg';
      const ext = type.includes('png') ? 'png' : 'jpg';
      const safe = (slide.name || `design-${index + 1}`).replace(/[^\w\-]+/g, '_').slice(0, 40);
      return new File([blob], `${String(index + 1).padStart(2, '0')}-${safe}.${ext}`, { type });
    } catch {
      // Try the next photo address.
    }
  }
  throw new Error(`Could not load ${slide.name || 'a design'}`);
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not prepare the photo'));
    reader.readAsDataURL(blob);
  });
}

function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export const OrderDesignViewer: React.FC<Props> = ({ slides, index, onIndexChange, onClose }) => {
  const slide = slides[index];
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const [sending, setSending] = useState(false);

  const go = (delta: number) => {
    const next = Math.min(slides.length - 1, Math.max(0, index + delta));
    if (next !== index) onIndexChange(next);
  };

  useEffect(() => {
    const urls = [index - 1, index, index + 1, index + 2]
      .map(position => slides[position])
      .filter(Boolean)
      .map(viewSrc)
      .filter(Boolean);
    for (const src of urls) {
      const img = new Image();
      img.src = src;
    }
  }, [index, slides]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

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
    go(dx < 0 ? 1 : -1);
  };

  const shareOnWhatsApp = async () => {
    if (sending) return;
    const orderSlides = slides.filter(item => item.designId || item.image);
    if (!orderSlides.length) {
      alert('This order has no designs to send.');
      return;
    }
    setSending(true);
    try {
      const files = (await Promise.all(
        orderSlides.map((item, position) => fetchImageFile(item, position).catch(() => null))
      )).filter((file): file is File => Boolean(file));
      if (files.length < orderSlides.length) {
        throw new Error(`Only ${files.length} of ${orderSlides.length} designs could be prepared. WhatsApp was not opened.`);
      }

      if (isNativeAndroid()) {
        const dataUrls = await Promise.all(files.map(blobToDataUrl));
        await shareImagesNative(dataUrls);
        return;
      }

      if (typeof navigator.share === 'function' && navigator.canShare?.({ files })) {
        await navigator.share({ files });
        return;
      }

      for (let i = 0; i < files.length; i += 1) {
        downloadFile(files[i]);
        if (i < files.length - 1) await new Promise(resolve => window.setTimeout(resolve, 350));
      }
      await openWhatsAppWithText('');
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      alert(error?.message || 'Could not open WhatsApp.');
    } finally {
      setSending(false);
    }
  };

  if (!slide) return null;
  const src = viewSrc(slide);

  return (
    <div className="fixed inset-0 z-[120] bg-black flex flex-col" role="dialog" aria-modal="true" aria-label="Order designs">
      <div className="flex items-center justify-between gap-2 px-3 py-3 text-white">
        <button
          type="button"
          onClick={() => void shareOnWhatsApp()}
          disabled={sending}
          className="inline-flex items-center gap-2 rounded-full bg-green-600 px-3 py-2 text-xs font-black uppercase disabled:opacity-60"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
          WhatsApp ({slides.length})
        </button>
        <p className="text-sm font-bold">{index + 1} / {slides.length}</p>
        <button type="button" onClick={onClose} className="p-2 rounded-full bg-white/15" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div
        className="relative flex-1 min-h-0 flex items-center justify-center px-2"
        onTouchStart={event => onPointerStart(event.touches[0].clientX, event.touches[0].clientY)}
        onTouchEnd={event => onPointerEnd(event.changedTouches[0].clientX, event.changedTouches[0].clientY)}
        onMouseDown={event => onPointerStart(event.clientX, event.clientY)}
        onMouseUp={event => onPointerEnd(event.clientX, event.clientY)}
      >
        {index > 0 && (
          <button type="button" onClick={() => go(-1)} className="absolute left-2 z-10 p-2 rounded-full bg-black/40 text-white" aria-label="Previous design">
            <ChevronLeft className="w-7 h-7" />
          </button>
        )}
        {src ? (
          <img src={src} alt={slide.name} className="max-h-full max-w-full object-contain select-none" draggable={false} />
        ) : (
          <p className="text-white/70 text-sm">No photo for this design</p>
        )}
        {index < slides.length - 1 && (
          <button type="button" onClick={() => go(1)} className="absolute right-2 z-10 p-2 rounded-full bg-black/40 text-white" aria-label="Next design">
            <ChevronRight className="w-7 h-7" />
          </button>
        )}
      </div>

      <div className="px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-3 text-white">
        <p className="text-base font-black break-words">{slide.name}</p>
        {slide.code && <p className="text-xs font-semibold text-white/70">{slide.code}</p>}
        <p className="text-xs font-semibold text-white/70">
          Qty {slide.quantity}{slide.fabric ? ` · ${slide.fabric}` : ''}
        </p>
        <p className="mt-1 text-[11px] text-white/50">Swipe for the next design in this order</p>
      </div>
    </div>
  );
};
