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

const GST_STATE_ALIASES: Record<string, string> = {
  jk: '01', hp: '02', 'h.p': '02', 'h.p.': '02',
  pb: '03', ch: '04', chd: '04',
  uk: '05', ua: '05',
  hr: '06', dl: '07', delhi: '07',
  rj: '08',
  up: '09', 'u.p': '09', 'u.p.': '09',
  br: '10', sk: '11', ar: '12', nl: '13', mn: '14', mz: '15', tr: '16', ml: '17', as: '18',
  wb: '19', 'w.b': '19', 'w.b.': '19',
  jh: '20', od: '21', or: '21', orissa: '21',
  cg: '22', ct: '22', 'c.g': '22', 'c.g.': '22',
  mp: '23', 'm.p': '23', 'm.p.': '23',
  gj: '24', guj: '24',
  mh: '27', 'm.h': '27', 'm.h.': '27',
  ap: '37', ka: '29', kn: '29', ga: '30', ld: '31', kl: '32',
  tn: '33', 't.n': '33', 't.n.': '33',
  py: '34', an: '35', ts: '36', tg: '36', la: '38'
};

export function getStateCodeFromName(stateName: string) {
  const raw = String(stateName || '').trim();
  if (!raw) return '';
  const target = normalizeState(raw);
  const aliasKey = target.replace(/\./g, '');
  if (GST_STATE_ALIASES[target]) return GST_STATE_ALIASES[target];
  if (GST_STATE_ALIASES[aliasKey]) return GST_STATE_ALIASES[aliasKey];
  const entry = Object.entries(GST_STATE_CODES).find(([, name]) => normalizeState(name) === target);
  if (entry) return entry[0];
  const paren = raw.match(/\(([^)]+)\)/);
  if (paren) {
    const inner = normalizeState(paren[1]).replace(/\./g, '');
    if (GST_STATE_ALIASES[inner]) return GST_STATE_ALIASES[inner];
    if (GST_STATE_ALIASES[normalizeState(paren[1])]) return GST_STATE_ALIASES[normalizeState(paren[1])];
  }
  return '';
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
