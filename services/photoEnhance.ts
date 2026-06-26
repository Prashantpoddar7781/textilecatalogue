const MAX_OUTPUT_SIZE = 1800;

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load image for enhancement'));
    image.src = src;
  });

const clamp = (value: number) => Math.max(0, Math.min(255, value));

function sharpenImageData(imageData: ImageData, amount = 0.18) {
  const { data, width, height } = imageData;
  const copy = new Uint8ClampedArray(data);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const center = copy[i + channel];
        const top = copy[((y - 1) * width + x) * 4 + channel];
        const bottom = copy[((y + 1) * width + x) * 4 + channel];
        const left = copy[(y * width + x - 1) * 4 + channel];
        const right = copy[(y * width + x + 1) * 4 + channel];
        const blur = (top + bottom + left + right) / 4;
        data[i + channel] = clamp(center + (center - blur) * amount);
      }
    }
  }
}

export async function enhancePhotoForCatalogue(dataUrl: string): Promise<string> {
  const image = await loadImage(dataUrl);
  const scale = Math.min(1, MAX_OUTPUT_SIZE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not prepare image enhancement');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.filter = 'brightness(1.08) contrast(1.12) saturate(1.10)';
  ctx.drawImage(image, 0, 0, width, height);
  ctx.filter = 'none';

  const imageData = ctx.getImageData(0, 0, width, height);
  sharpenImageData(imageData);
  ctx.putImageData(imageData, 0, 0);

  return canvas.toDataURL('image/jpeg', 0.9);
}
