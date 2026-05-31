const DEFAULT_APP_URL = 'https://textilecatalogue.vercel.app';

const isLocalOrigin = (origin: string) =>
  !origin
  || origin.includes('localhost')
  || origin === 'capacitor://localhost'
  || origin === 'ionic://localhost';

/** Public web URL for share links and barcodes (not capacitor://localhost). */
export function getPublicAppUrl(): string {
  const configured = import.meta.env.VITE_APP_URL?.trim().replace(/\/$/, '');
  if (configured) return configured;

  if (typeof window !== 'undefined') {
    const origin = window.location.origin.replace(/\/$/, '');
    if (!isLocalOrigin(origin)) return origin;
  }

  return DEFAULT_APP_URL;
}

export function getShareUrl(token: string): string {
  return `${getPublicAppUrl()}/share/${token}`;
}

export function getBarcodeUrl(designId: string): string {
  return `${getPublicAppUrl()}/barcode/${designId}`;
}
