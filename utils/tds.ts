/** Sec 194C style TDS defaults — same rules as backend/utils/tds.js. */

export function extractPanFromGstin(gstin?: string | null): string {
  const g = String(gstin || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  if (g.length < 12) return '';
  return g.slice(2, 12);
}

export function normalizePan(pan?: string | null): string {
  return String(pan || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
}

export function isValidPan(pan?: string | null): boolean {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(normalizePan(pan));
}

export function resolvePartyPan(opts?: { panNumber?: string | null; gstNumber?: string | null }): string {
  const direct = normalizePan(opts?.panNumber);
  if (isValidPan(direct)) return direct;
  const fromGst = extractPanFromGstin(opts?.gstNumber);
  if (isValidPan(fromGst)) return fromGst;
  return direct || fromGst || '';
}

/** With PAN: Individual/HUF → 1%, others → 2%. Without PAN: null. */
export function suggestTdsPercentFromPan(pan?: string | null): number | null {
  if (!isValidPan(pan)) return null;
  const typeChar = normalizePan(pan)[3];
  if (typeChar === 'P' || typeChar === 'H') return 1;
  return 2;
}
