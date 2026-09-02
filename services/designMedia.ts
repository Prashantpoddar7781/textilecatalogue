import { TextileDesign } from '../types';
import { API_BASE_URL } from './api';

export function isUsableImageSrc(value?: string | null): boolean {
  if (!value) return false;
  return value.startsWith('http') || value.startsWith('data:') || value.startsWith('blob:');
}

export function designThumbSrc(design: Pick<TextileDesign, 'id' | 'image'> & { imageThumb?: string }): string {
  if (isUsableImageSrc(design.imageThumb)) return design.imageThumb as string;
  if (isUsableImageSrc(design.image)) return design.image;
  return `${API_BASE_URL}/designs/${design.id}/media/thumb`;
}

export function designFullSrc(design: Pick<TextileDesign, 'id' | 'image'> & { imageFull?: string; imageThumb?: string }): string {
  if (isUsableImageSrc(design.imageFull) && design.imageFull !== design.imageThumb) {
    return design.imageFull as string;
  }
  if (isUsableImageSrc(design.image) && design.image.startsWith('http')) return design.image;
  if (isUsableImageSrc(design.image) && design.image.startsWith('data:')) return design.image;
  return `${API_BASE_URL}/designs/${design.id}/media/full?proxy=1`;
}

/**
 * Load an image into a canvas-safe HTMLImageElement.
 * Uses a same-origin blob URL so Android WebView WhatsApp share is not blocked by R2 CORS/cache.
 */
export async function loadImageForCanvas(src: string, designId?: string): Promise<HTMLImageElement> {
  const objectUrl = await fetchShareImageObjectUrl(src, designId);
  try {
    return await decodeImageElement(objectUrl);
  } catch (error) {
    if (objectUrl.startsWith('blob:')) URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

async function fetchShareImageObjectUrl(src: string, designId?: string): Promise<string> {
  if (!src) throw new Error('Missing image source');
  if (src.startsWith('data:') || src.startsWith('blob:')) return src;

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

  const candidates: string[] = [];
  if (/^https?:\/\//i.test(src)) {
    candidates.push(`${API_BASE_URL}/designs/media-proxy?url=${encodeURIComponent(src)}`);
  }
  if (designId) {
    candidates.push(`${API_BASE_URL}/designs/${designId}/media/full?proxy=1`);
  }
  candidates.push(src);

  let lastError: Error | null = null;
  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        headers,
        mode: 'cors',
        cache: 'no-store',
        credentials: 'omit'
      });
      if (!response.ok) {
        lastError = new Error(`Image fetch failed (${response.status})`);
        continue;
      }
      const blob = await response.blob();
      if (!blob || blob.size < 32) {
        lastError = new Error('Empty image response');
        continue;
      }
      return URL.createObjectURL(blob);
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error?.message || error));
    }
  }
  throw lastError || new Error('Could not load image for sharing');
}

function decodeImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // blob:/data: URLs must not set crossOrigin or some WebViews fail to decode.
    if (/^https?:\/\//i.test(src)) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image source failed to load'));
    img.src = src;
  });
}
