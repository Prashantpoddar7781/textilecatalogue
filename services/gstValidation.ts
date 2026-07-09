/** Soft GSTIN validation — invalid values are still accepted by the form. */
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function normalizeGstNumber(value: string): string {
  return String(value || '').trim().toUpperCase();
}

export function isValidGstNumber(value: string): boolean {
  const gst = normalizeGstNumber(value);
  if (!gst) return true;
  return GSTIN_REGEX.test(gst);
}
