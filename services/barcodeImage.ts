export async function buildBarcodeDownloadImage(
  qrDataUrl: string,
  designNumber: string,
  catalogueName?: string | null
): Promise<string> {
  const qrSize = 320;
  const padding = 28;
  const lineHeight = 30;
  const lines = [
    `Design No: ${designNumber}`,
    catalogueName?.trim() ? `Catalogue: ${catalogueName.trim()}` : null
  ].filter((line): line is string => Boolean(line));

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not prepare barcode image');
  }

  canvas.width = qrSize + padding * 2;
  canvas.height = qrSize + padding * 2 + lines.length * lineHeight;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const qrImage = new Image();
  await new Promise<void>((resolve, reject) => {
    qrImage.onload = () => resolve();
    qrImage.onerror = () => reject(new Error('Could not load barcode'));
    qrImage.src = qrDataUrl;
  });

  ctx.drawImage(qrImage, padding, padding, qrSize, qrSize);

  ctx.fillStyle = '#0f172a';
  ctx.font = '600 22px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  let textY = qrSize + padding + 12;
  for (const line of lines) {
    ctx.fillText(line, canvas.width / 2, textY);
    textY += lineHeight;
  }

  return canvas.toDataURL('image/png');
}
