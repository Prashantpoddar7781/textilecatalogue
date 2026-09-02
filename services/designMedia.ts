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
  if (isUsableImageSrc(design.image) && design.image.startsWith('data:')) return design.image;
  return `${API_BASE_URL}/designs/${design.id}/media/full`;
}
