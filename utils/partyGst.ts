import { GST_STATE_CODES, resolveStateKey } from './gstState';

export const GST_TYPE_LOCAL = 'Local GST';
export const GST_TYPE_INTERSTATE = 'Interstate GST';
export const GST_TYPE_NONE = 'Non GST';

export const GST_TYPE_OPTIONS = [GST_TYPE_LOCAL, GST_TYPE_INTERSTATE, GST_TYPE_NONE] as const;

export type GstCalcMode = 'auto' | 'local' | 'interstate' | 'none';

/** Map an Empire or older label onto the three GST type options. */
export function canonicalGstType(value: string | null | undefined): string {
  const text = String(value || '').trim().toLowerCase();
  if (!text || text === 'none' || text === '-') return '';
  if (text.includes('non')) return GST_TYPE_NONE;
  if (text.includes('inter') || text.includes('central') || text === 'igst') return GST_TYPE_INTERSTATE;
  if (text.includes('local') || text.includes('cgst') || text.includes('sgst')) return GST_TYPE_LOCAL;
  return '';
}

export function isNonGstType(value: string | null | undefined): boolean {
  return canonicalGstType(value) === GST_TYPE_NONE;
}

export function gstModeFromType(value: string | null | undefined): GstCalcMode {
  const type = canonicalGstType(value);
  if (type === GST_TYPE_NONE) return 'none';
  if (type === GST_TYPE_INTERSTATE) return 'interstate';
  if (type === GST_TYPE_LOCAL) return 'local';
  return 'auto';
}

/** Local when the GSTIN state matches the company, Interstate when it does not. */
export function gstTypeFromGstin(gstin: string | null | undefined, businessState: string | null | undefined): string {
  const raw = String(gstin || '').replace(/[^0-9A-Za-z]/g, '');
  const code = raw.slice(0, 2);
  if (!/^\d{2}$/.test(code) || !GST_STATE_CODES[code]) return '';
  const business = resolveStateKey(businessState);
  if (!business) return GST_TYPE_LOCAL;
  return code === business ? GST_TYPE_LOCAL : GST_TYPE_INTERSTATE;
}

export function stateNameFromGstin(gstin: string | null | undefined): string {
  const raw = String(gstin || '').replace(/[^0-9A-Za-z]/g, '');
  const code = raw.slice(0, 2);
  return GST_STATE_CODES[code] || '';
}
