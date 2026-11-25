import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, MessageCircle, X } from 'lucide-react';
import { contactsApi, API_BASE_URL } from '../services/api';
import { Contact } from '../types';
import { isNativeAndroid, shareImagesNative } from '../services/nativeApp';

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
  buyerName?: string;
  buyerPhone?: string;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

const SWIPE_MIN = 48;

function fullSrc(slide: OrderDesignSlide) {
  if (slide.designId) return `${API_BASE_URL}/designs/${slide.designId}/media/full?proxy=1`;
  return slide.image || '';
}

function waDigits(raw: string) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) digits = `91${digits.slice(1)}`;
  return digits;
}

function usablePhone(raw?: string | null) {
  const digits = waDigits(raw || '');
  return digits.length >= 11 ? digits : '';
}

async function fetchImageFile(slide: OrderDesignSlide, index: number) {
  const src = fullSrc(slide);
  if (!src) throw new Error('Missing photo');
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
  const response = await fetch(src, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: 'no-store'
  });
  if (!response.ok) throw new Error('Photo did not load');
  const blob = await response.blob();
  const type = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/jpeg';
  const ext = type.includes('png') ? 'png' : 'jpg';
  const safe = (slide.name || `design-${index + 1}`).replace(/[^\w\-]+/g, '_').slice(0, 40);
  return new File([blob], `${index + 1}-${safe}.${ext}`, { type });
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

export const OrderDesignViewer: React.FC<Props> = ({
  slides,
  index,
  buyerName,
  buyerPhone,
  onIndexChange,
  onClose
}) => {
  const slide = slides[index];
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const [pickingNumber, setPickingNumber] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [typedNumber, setTypedNumber] = useState('');
  const [sending, setSending] = useState(false);
  const [sendNote, setSendNote] = useState('');

  const customerPhone = usablePhone(buyerPhone);

  const numbers = useMemo(() => {
    const rows: { key: string; label: string; phone: string }[] = [];
    if (customerPhone) {
      rows.push({ key: 'customer', label: buyerName || 'Customer', phone: customerPhone });
    }
    for (const contact of contacts) {
      const phone = usablePhone(contact.phoneNumber);
      if (!phone || rows.some(row => row.phone === phone)) continue;
      rows.push({ key: contact.id, label: contact.name || phone, phone });
    }
    return rows;
  }, [contacts, customerPhone, buyerName]);

  useEffect(() => {
    if (!pickingNumber) return;
    void contactsApi.getAll().then(setContacts).catch(() => setContacts([]));
  }, [pickingNumber]);

  const go = (delta: number) => {
    const next = Math.min(slides.length - 1, Math.max(0, index + delta));
    if (next !== index) onIndexChange(next);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (pickingNumber) {
        if (event.key === 'Escape') setPickingNumber(false);
        return;
      }
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

  const sendAll = async (rawPhone: string) => {
    const phone = usablePhone(rawPhone);
    if (!phone) {
      setSendNote('Enter a WhatsApp number with the country code, or a 10-digit mobile.');
      return;
    }
    setSending(true);
    setSendNote('');
    try {
      const files: File[] = [];
      for (let i = 0; i < slides.length; i += 1) {
        try {
          files.push(await fetchImageFile(slides[i], i));
        } catch {
          // A missing photo should not stop the rest of the order.
        }
      }
      if (!files.length) throw new Error('No photos to send');

      const caption = [
        `To +${phone}`,
        buyerName ? `Designs for ${buyerName}` : 'Order designs',
        ...slides.map((item, i) => `${i + 1}. ${item.name}${item.quantity ? ` · Qty ${item.quantity}` : ''}`)
      ].join('\n');

      if (isNativeAndroid()) {
        const dataUrls = await Promise.all(files.map(blobToDataUrl));
        await shareImagesNative(dataUrls);
        setPickingNumber(false);
        return;
      }

      const canShareFiles = typeof navigator.share === 'function'
        && typeof navigator.canShare === 'function'
        && navigator.canShare({ files });
      if (canShareFiles) {
        await navigator.share({ files, text: caption });
        setPickingNumber(false);
        return;
      }

      for (const file of files) downloadFile(file);
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(caption)}`, '_blank', 'noopener,noreferrer');
      setSendNote(`Downloaded ${files.length} design${files.length === 1 ? '' : 's'}. Attach them in the WhatsApp chat that opened for this number.`);
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      setSendNote(error?.message || 'Could not send these designs on WhatsApp.');
    } finally {
      setSending(false);
    }
  };

  if (!slide) return null;
  const src = fullSrc(slide);

  return (
    <div className="fixed inset-0 z-[120] bg-black flex flex-col" role="dialog" aria-modal="true" aria-label="Order designs">
      <div className="flex items-center justify-between gap-2 px-3 py-3 text-white">
        <button
          type="button"
          onClick={() => {
            setSendNote('');
            setPickingNumber(true);
          }}
          className="inline-flex items-center gap-2 rounded-full bg-green-600 px-3 py-2 text-xs font-black uppercase"
        >
          <MessageCircle className="w-4 h-4" />
          WhatsApp
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

      {pickingNumber && (
        <div className="absolute inset-0 z-20 bg-black/70 flex items-end sm:items-center justify-center p-3" onClick={() => !sending && setPickingNumber(false)}>
          <div className="bg-white text-gray-900 w-full max-w-md rounded-3xl p-4 max-h-[80vh] overflow-y-auto" onClick={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-black">Send all {slides.length} designs</p>
                <p className="text-xs text-gray-500">Choose the WhatsApp number. Every design in this order is sent together.</p>
              </div>
              <button type="button" onClick={() => setPickingNumber(false)} className="p-2 rounded-full hover:bg-gray-100" aria-label="Close number list">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {numbers.map(row => (
                <button
                  key={row.key}
                  type="button"
                  disabled={sending}
                  onClick={() => void sendAll(row.phone)}
                  className="w-full rounded-2xl border border-gray-200 px-3 py-2 text-left hover:border-green-400 disabled:opacity-50"
                >
                  <p className="text-sm font-black">{row.label}</p>
                  <p className="text-xs font-semibold text-gray-500">+{row.phone}</p>
                </button>
              ))}
              <div className="flex gap-2 pt-1">
                <input
                  value={typedNumber}
                  onChange={event => setTypedNumber(event.target.value)}
                  placeholder="Other number"
                  inputMode="tel"
                  className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-green-500"
                />
                <button
                  type="button"
                  disabled={sending || !typedNumber.trim()}
                  onClick={() => void sendAll(typedNumber)}
                  className="rounded-xl bg-green-600 px-3 py-2 text-xs font-black text-white disabled:opacity-40"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send'}
                </button>
              </div>
              {sendNote && <p className="text-xs font-semibold text-amber-800">{sendNote}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
