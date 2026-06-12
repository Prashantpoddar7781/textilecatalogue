import type { Html5QrcodeCameraScanConfig } from 'html5-qrcode';

/**
 * Scan the full camera frame so small sticker barcodes work (not only large codes
 * that fill a fixed center square).
 */
export const cameraBarcodeScanConfig: Html5QrcodeCameraScanConfig = {
  fps: 15,
  qrbox: (viewfinderWidth, viewfinderHeight) => ({
    width: viewfinderWidth,
    height: viewfinderHeight
  }),
  disableFlip: false,
  videoConstraints: {
    facingMode: 'environment',
    width: { ideal: 1920 },
    height: { ideal: 1080 }
  },
  experimentalFeatures: {
    useBarCodeDetectorIfSupported: true
  }
};

export const cameraBarcodeConstraints = {
  facingMode: 'environment' as const,
  width: { ideal: 1920 },
  height: { ideal: 1080 }
};

/** Parse design id from ThreadX barcode QR text or raw scanner input. */
export function extractDesignIdFromScan(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/\/barcode\/([^/?#\s]+)/i);
  if (match?.[1]) return decodeURIComponent(match[1]);
  return trimmed;
}

export const prefersHardwareScanner = () => {
  if (typeof window === 'undefined') return false;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const narrow = window.matchMedia('(max-width: 767px)').matches;
  return !(coarse && narrow);
};
