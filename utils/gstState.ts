/** GSTIN first 2 digits → state name (mirrors backend/utils/gstCalculation.js) */
export const GST_STATE_CODES: Record<string, string> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '25': 'Dadra and Nagar Haveli and Daman and Diu',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh'
};

const normalizeState = (value: string) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

export function getStateCodeFromName(stateName: string) {
  const target = normalizeState(stateName);
  if (!target) return '';
  const entry = Object.entries(GST_STATE_CODES).find(([, name]) => normalizeState(name) === target);
  return entry ? entry[0] : '';
}

/** Resolve "24", "24 Gujarat", "Gujarat", etc. to a comparable GST state code. */
export function resolveStateKey(value: string | null | undefined) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (/^\d{1,2}$/.test(raw)) {
    const code = raw.padStart(2, '0');
    if (GST_STATE_CODES[code]) return code;
  }

  const prefix = raw.match(/^(\d{1,2})(?:\s*[-:/]?\s*|\s+)/);
  if (prefix) {
    const code = prefix[1].padStart(2, '0');
    if (GST_STATE_CODES[code]) return code;
  }

  const fromName = getStateCodeFromName(raw);
  if (fromName) return fromName;

  const withoutCode = raw.replace(/^\d{1,2}\s*[-:/]?\s*/, '').trim();
  if (withoutCode && withoutCode !== raw) {
    const nested = getStateCodeFromName(withoutCode);
    if (nested) return nested;
  }

  return normalizeState(raw);
}

/** True when party place-of-supply and business state are different GST states. */
export function isInterStateSupply(placeOfSupply: string | null | undefined, businessState: string | null | undefined) {
  const supply = resolveStateKey(placeOfSupply);
  const business = resolveStateKey(businessState);
  if (!supply || !business) return false;
  return supply !== business;
}

export function gstTypeLabel(placeOfSupply: string | null | undefined, businessState: string | null | undefined) {
  if (!String(placeOfSupply || '').trim() || !String(businessState || '').trim()) return 'Local Tax Inv.';
  return isInterStateSupply(placeOfSupply, businessState) ? 'Inter-State Tax Inv.' : 'Local Tax Inv.';
}
