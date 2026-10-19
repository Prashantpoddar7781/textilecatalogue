import type { PhotoExtraction } from '../services/api';
import { GST_STATE_CODES } from './gstState';

export const photoPartyState = (x: PhotoExtraction) =>
  GST_STATE_CODES[x.party.gstin.slice(0, 2)] || x.party.state || '';

/** The ERP menu camera link opens an entry with ?photo=1. */
export const wantsPhotoOnOpen = () =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('photo') === '1';

/** Qty that gives the bill amount at the bill rate (pcs or metres). */
export function rateBasisQty(line: { pcs: number; mts: number; qty: number; rate: number; amount: number }) {
  const close = (q: number) => q > 0 && line.rate > 0 && Math.abs(q * line.rate - line.amount) <= Math.max(1, line.amount * 0.01);
  if (close(line.pcs)) return { qty: line.pcs, perMetre: false };
  if (close(line.mts)) return { qty: line.mts, perMetre: true };
  if (line.rate > 0 && line.amount > 0) return { qty: Math.round((line.amount / line.rate) * 100) / 100, perMetre: Boolean(line.mts) };
  return { qty: line.pcs || line.mts || line.qty, perMetre: !line.pcs && Boolean(line.mts) };
}

const MAX_EDGE = 1800;

const readAsDataUrl = (file: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

/** Phone photos are 4–12 MB; shrink to a sharp JPEG so reading is fast on mobile data. */
export async function prepareBillImage(file: File): Promise<string> {
  if (file.type === 'application/pdf') return readAsDataUrl(file);
  const source = await readAsDataUrl(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = source;
    });
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    if (scale === 1 && file.size < 1_500_000) return source;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return source;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    return source;
  }
}

export const isTouchDevice = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

const NOISE = /\b(m\/s|ms|the|pvt|private|ltd|limited|llp|co|company|and|enterprises?|traders?)\b/g;
export const normalizePartyName = (value?: string | null) =>
  String(value || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9/ ]/g, ' ').replace(NOISE, ' ').replace(/\s+/g, ' ').trim();

/** Find the party from the photo in the master: GSTIN first, then name. */
export function matchPhotoParty<T extends { name: string; gstNumber?: string | null }>(list: T[], x: PhotoExtraction): T | null {
  const gstin = x.party.gstin;
  if (gstin) {
    const byGst = list.find(row => String(row.gstNumber || '').toUpperCase().replace(/[^0-9A-Z]/g, '') === gstin);
    if (byGst) return byGst;
  }
  const wanted = normalizePartyName(x.party.name);
  if (!wanted) return null;
  const exact = list.find(row => normalizePartyName(row.name) === wanted);
  if (exact) return exact;
  const loose = list.filter(row => {
    const name = normalizePartyName(row.name);
    return name.length >= 4 && (name.includes(wanted) || wanted.includes(name));
  });
  return loose.length === 1 ? loose[0] : null;
}

/** Details to pre-fill when the photo's party has to be created. */
export const photoPartyDetails = (x: PhotoExtraction) => ({
  gstNumber: x.party.gstin,
  mobileNumber: x.party.mobile,
  address: x.party.address,
  city: x.party.city,
  state: x.party.state,
  pincode: x.party.pincode,
  panNumber: x.party.pan
});

export type PhotoPartyDetails = ReturnType<typeof photoPartyDetails>;
