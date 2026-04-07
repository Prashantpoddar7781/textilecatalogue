import type { PixelCrop } from 'react-image-crop';

/** Export cropped region to JPEG data URL. `pixelCrop` is in **display** pixels (from react-image-crop). */
export function getCroppedImgDataUrl(image: HTMLImageElement, pixelCrop: PixelCrop): string {
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  const sx = pixelCrop.x * scaleX;
  const sy = pixelCrop.y * scaleY;
  const sWidth = pixelCrop.width * scaleX;
  const sHeight = pixelCrop.height * scaleY;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');
  if (sWidth <= 0 || sHeight <= 0) throw new Error('Invalid crop area');

  canvas.width = Math.max(1, Math.round(sWidth));
  canvas.height = Math.max(1, Math.round(sHeight));
  ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.92);
}
