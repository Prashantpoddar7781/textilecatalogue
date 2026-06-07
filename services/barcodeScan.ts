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
