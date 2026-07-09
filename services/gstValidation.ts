export function normalizeGstNumber(value: string): string {
  return String(value || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export function normalizePanNumber(value: string): string {
  return String(value || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/** Standard GSTIN: 2-digit state + 10-char PAN + entity + Z + checksum */
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export function isValidPanFormat(value: string): boolean {
  const pan = normalizePanNumber(value);
  if (!pan) return true;
  return pan.length === 10 && PAN_REGEX.test(pan);
}

export function isValidGstFormat(value: string): boolean {
  const gst = normalizeGstNumber(value);
  if (!gst) return true;
  if (gst.length !== 15) return false;
  return GSTIN_REGEX.test(gst);
}

/** Digits 3–12 of GSTIN must equal PAN when both are complete. */
export function gstMatchesPan(gstValue: string, panValue: string): boolean {
  const gst = normalizeGstNumber(gstValue);
  const pan = normalizePanNumber(panValue);
  if (!gst || !pan) return true;
  if (gst.length !== 15 || pan.length !== 10) return true;
  return gst.slice(2, 12) === pan;
}

/** Soft warning under GST: wrong format or PAN mismatch (after full 15 chars). */
export function isWrongGstNumber(gstValue: string, panValue?: string): boolean {
  const gst = normalizeGstNumber(gstValue);
  if (!gst) return false;
  if (gst.length < 15) return false;
  if (!isValidGstFormat(gst)) return true;
  if (panValue != null && normalizePanNumber(panValue).length === 10 && !gstMatchesPan(gst, panValue)) {
    return true;
  }
  return false;
}

/** Soft warning under PAN once user has typed a full 10 characters. */
export function isWrongPanNumber(panValue: string): boolean {
  const pan = normalizePanNumber(panValue);
  if (!pan) return false;
  if (pan.length < 10) return false;
  return !isValidPanFormat(pan);
}

/**
 * Hard block on save:
 * - PAN filled but wrong format
 * - Both GST (15) and PAN (10) filled but digits 3–12 don't match
 */
export function getCompanyTaxSaveError(gstValue: string, panValue: string): string | null {
  const gst = normalizeGstNumber(gstValue);
  const pan = normalizePanNumber(panValue);

  if (pan && !isValidPanFormat(pan)) {
    return 'Wrong PAN number';
  }

  if (gst.length === 15 && pan.length === 10 && !gstMatchesPan(gst, pan)) {
    return 'Wrong GST number';
  }

  return null;
}
