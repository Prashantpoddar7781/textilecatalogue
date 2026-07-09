/** Soft GSTIN validation — invalid values are still accepted by the form. */

export function normalizeGstNumber(value: string): string {
  return String(value || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export function normalizePanNumber(value: string): string {
  return String(value || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/** Standard GSTIN: 2-digit state + 10-char PAN + entity + Z + checksum */
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export function isValidGstFormat(value: string): boolean {
  const gst = normalizeGstNumber(value);
  if (!gst) return true;
  if (gst.length !== 15) return false;
  return GSTIN_REGEX.test(gst);
}

/**
 * Digits 3–12 of GSTIN are the PAN.
 * When PAN is filled (10 chars), it must match that slice.
 */
export function gstMatchesPan(gstValue: string, panValue: string): boolean {
  const gst = normalizeGstNumber(gstValue);
  const pan = normalizePanNumber(panValue);
  if (!gst || gst.length !== 15) return true;
  if (!pan || pan.length !== 10) return true;
  if (!PAN_REGEX.test(pan)) return true;
  return gst.slice(2, 12) === pan;
}

/** True when we should show the soft "Wrong GST number" warning. */
export function isWrongGstNumber(gstValue: string, panValue?: string): boolean {
  const gst = normalizeGstNumber(gstValue);
  if (!gst) return false;
  // Don't warn while the user is still typing
  if (gst.length < 15) return false;
  if (!isValidGstFormat(gst)) return true;
  if (panValue != null && !gstMatchesPan(gst, panValue)) return true;
  return false;
}

/** @deprecated use isValidGstFormat / isWrongGstNumber */
export function isValidGstNumber(value: string, panValue?: string): boolean {
  return !isWrongGstNumber(value, panValue);
}
