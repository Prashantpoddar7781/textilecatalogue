import { roundMoney, roundRupee } from './orderBilling.js';

export const INDIAN_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar',
  'Chandigarh', 'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa',
  'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka',
  'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'
];

/** GSTIN first 2 digits → state name */
export const GST_STATE_CODES = {
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

const normalizeState = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Short names people type in party master / station (U.P., GJ, MH …). */
const GST_STATE_ALIASES = {
  jk: '01', 'j & k': '01',
  hp: '02', 'h.p': '02', 'h.p.': '02',
  pb: '03',
  ch: '04', chd: '04',
  uk: '05', ua: '05', ukd: '05',
  hr: '06', haryana: '06',
  dl: '07', delhi: '07', ncr: '07',
  rj: '08', raj: '08',
  up: '09', 'u.p': '09', 'u.p.': '09', 'uttar pradesh': '09',
  br: '10', bihar: '10',
  sk: '11',
  ar: '12',
  nl: '13',
  mn: '14',
  mz: '15',
  tr: '16',
  ml: '17',
  as: '18',
  wb: '19', 'w.b': '19', 'w.b.': '19',
  jh: '20',
  od: '21', or: '21', orissa: '21', odisha: '21',
  cg: '22', ct: '22', 'c.g': '22', 'c.g.': '22',
  mp: '23', 'm.p': '23', 'm.p.': '23',
  gj: '24', guj: '24',
  dn: '25', dd: '26',
  mh: '27', 'm.h': '27', 'm.h.': '27', maharashtra: '27',
  ap: '37',
  ka: '29', kn: '29', kar: '29',
  ga: '30',
  ld: '31',
  kl: '32',
  tn: '33', 't.n': '33', 't.n.': '33',
  py: '34', pondicherry: '34',
  an: '35',
  ts: '36', tg: '36', telangana: '36',
  la: '38'
};

/** Resolve "24", "24 Gujarat", "Gujarat", etc. to a comparable GST state code. */
export function resolveStateKey(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const codeOnly = raw.replace(/\D/g, '');
  if (/^\d{1,2}$/.test(raw) || (/^\d{1,2}$/.test(codeOnly) && raw.length <= 3)) {
    const code = codeOnly.padStart(2, '0').slice(-2);
    if (GST_STATE_CODES[code]) return code;
  }

  const prefix = raw.match(/^(\d{1,2})(?:\s*[-:/]?\s*|\s+)/);
  if (prefix) {
    const code = prefix[1].padStart(2, '0');
    if (GST_STATE_CODES[code]) return code;
  }

  const fromName = getStateCodeFromName(raw);
  if (fromName) return fromName;

  // Strip leading code then try remaining name ("24 Gujarat" already handled; "GJ Gujarat" fallback)
  const withoutCode = raw.replace(/^\d{1,2}\s*[-:/]?\s*/, '').trim();
  if (withoutCode && withoutCode !== raw) {
    const nested = getStateCodeFromName(withoutCode);
    if (nested) return nested;
  }

  return normalizeState(raw);
}

export function getStateFromGstin(gstin) {
  const code = String(gstin || '').replace(/[^0-9A-Za-z]/g, '').slice(0, 2);
  if (!code || !GST_STATE_CODES[code]) return { stateCode: code || '', stateName: '' };
  return { stateCode: code, stateName: GST_STATE_CODES[code] };
}

export function getStateCodeFromName(stateName) {
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

/** GST state code, or '' when the text is a city or anything else that is not a state. */
export function knownStateCode(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (/^\d{1,2}$/.test(raw) || (/^\d{1,2}$/.test(digits) && raw.length <= 3)) {
    const code = digits.padStart(2, '0').slice(-2);
    if (GST_STATE_CODES[code]) return code;
  }
  return getStateCodeFromName(raw) || '';
}

export function isInterStateSupply(placeOfSupply, businessState) {
  const supply = knownStateCode(placeOfSupply);
  const business = knownStateCode(businessState);
  if (!supply || !business) return false;
  return supply !== business;
}

/** Local GST, Interstate GST, or Non GST. Empty when the voucher has not chosen. */
export function canonicalGstChoice(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text || text === 'none' || text === '-') return '';
  if (text.includes('non')) return 'non';
  if (text.includes('inter') || text.includes('central') || text === 'igst') return 'inter';
  if (text.includes('local') || text.includes('cgst') || text.includes('sgst')) return 'local';
  return '';
}

/** Place used only for the tax split. The saved place of supply stays the party's own state. */
function taxPlaceForChoice(choice, placeOfSupply, businessState) {
  if (choice === 'local') return businessState || placeOfSupply;
  if (choice === 'inter' && !isInterStateSupply(placeOfSupply, businessState)) {
    const business = knownStateCode(businessState);
    return business === '27' ? 'Gujarat' : 'Maharashtra';
  }
  return placeOfSupply;
}

export function calculateGstBreakup({
  taxableAmount,
  gstRate,
  placeOfSupply,
  businessState
}) {
  const taxable = roundMoney(taxableAmount);
  const rate = Number(gstRate) || 0;
  if (taxable <= 0 || rate <= 0) {
    return {
      taxableAmount: taxable,
      gstRate: rate,
      cgstRate: 0,
      cgstAmount: 0,
      sgstRate: 0,
      sgstAmount: 0,
      igstRate: 0,
      igstAmount: 0,
      totalTaxAmount: 0,
      gstType: 'none'
    };
  }

  const interState = isInterStateSupply(placeOfSupply, businessState);
  const totalTax = roundMoney(taxable * rate / 100);

  if (interState) {
    return {
      taxableAmount: taxable,
      gstRate: rate,
      cgstRate: 0,
      cgstAmount: 0,
      sgstRate: 0,
      sgstAmount: 0,
      igstRate: rate,
      igstAmount: totalTax,
      totalTaxAmount: totalTax,
      gstType: 'IGST'
    };
  }

  const halfRate = rate / 2;
  const halfTax = roundMoney(totalTax / 2);
  return {
    taxableAmount: taxable,
    gstRate: rate,
    cgstRate: halfRate,
    cgstAmount: halfTax,
    sgstRate: halfRate,
    sgstAmount: halfTax,
    igstRate: 0,
    igstAmount: 0,
    totalTaxAmount: totalTax,
    gstType: 'CGST+SGST'
  };
}

/**
 * Grey purchase calc series:
 * Gross → Disc% / Disc Amt → Taxable (gross - disc)
 * → Other Add/Less → State + GST Type → CGST/SGST or IGST
 * → Payable (taxable after other + GST) → Other Add/Less → Net
 */
export function calculateGreyPurchaseTotals(input) {
  const grossAmount = roundMoney(input.grossAmount);
  const discountPercent = Number(input.discountPercent) || 0;
  const discountAmount = roundMoney(
    input.discountAmount != null && input.discountAmount !== ''
      ? input.discountAmount
      : grossAmount * discountPercent / 100
  );
  const taxableBeforeOther = roundMoney(grossAmount - discountAmount);
  const otherAddBefore = roundMoney(input.otherAddBefore);
  const otherLessBefore = roundMoney(input.otherLessBefore);
  const taxableAmount = roundMoney(taxableBeforeOther + otherAddBefore - otherLessBefore);

  const choice = canonicalGstChoice(input.gstType);
  const gst = calculateGstBreakup({
    taxableAmount,
    gstRate: choice === 'non' ? 0 : input.gstRate,
    placeOfSupply: taxPlaceForChoice(choice, input.placeOfSupply, input.businessState),
    businessState: input.businessState
  });

  const payableAmount = roundMoney(taxableAmount + gst.totalTaxAmount);
  const otherAddAfter = roundMoney(input.otherAddAfter);
  const otherLessAfter = roundMoney(input.otherLessAfter);
  const exactNet = roundMoney(payableAmount + otherAddAfter - otherLessAfter);
  const netAmount = roundRupee(exactNet);
  const roundOff = roundMoney(netAmount - exactNet);

  const fromGstin = getStateFromGstin(input.partyGstin);
  let stateCode = String(input.stateCode || fromGstin.stateCode || getStateCodeFromName(input.placeOfSupply) || '');
  if (stateCode) stateCode = stateCode.padStart(2, '0').slice(-2);
  const displayGstType = choice === 'non'
    ? 'Non GST'
    : choice === 'local'
      ? 'Local GST'
      : choice === 'inter'
        ? 'Interstate GST'
        : gst.gstType === 'CGST+SGST'
          ? 'Local Tax'
          : gst.gstType === 'IGST'
            ? 'Central Tax'
            : gst.gstType;

  return {
    grossAmount,
    discountPercent,
    discountAmount,
    taxableBeforeOther,
    otherAddBefore,
    otherLessBefore,
    taxableAmount,
    stateCode: stateCode === '00' ? '' : stateCode,
    placeOfSupply: input.placeOfSupply || fromGstin.stateName || '',
    ...gst,
    gstTypeLabel: displayGstType,
    payableAmount,
    otherAddAfter,
    otherLessAfter,
    netAmount,
    roundOff
  };
}

export function calculateNoteTotals(input) {
  const grossAmount = roundMoney(input.grossAmount);
  const discountAmount = roundMoney(input.discountAmount ?? (grossAmount * (Number(input.discountPercent) || 0) / 100));
  const taxableAmount = roundMoney(
    input.taxableAmount != null && input.taxableAmount !== ''
      ? input.taxableAmount
      : grossAmount - discountAmount - roundMoney(input.otherLess) + roundMoney(input.addAmount) - roundMoney(input.returnGoods)
  );
  const fromGstin = getStateFromGstin(input.partyGstin);
  const choice = canonicalGstChoice(input.gstType);
  const place = knownStateCode(input.placeOfSupply)
    ? input.placeOfSupply
    : (fromGstin.stateName || input.placeOfSupply);
  const gst = calculateGstBreakup({
    taxableAmount,
    gstRate: choice === 'non' ? 0 : input.gstRate,
    placeOfSupply: taxPlaceForChoice(choice, place, input.businessState),
    businessState: input.businessState
  });
  const gstType = choice === 'non'
    ? 'Non GST'
    : choice === 'local'
      ? 'Local GST'
      : choice === 'inter'
        ? 'Interstate GST'
        : gst.gstType === 'IGST'
          ? 'Interstate GST'
          : gst.gstType === 'CGST+SGST'
            ? 'Local GST'
            : (gst.gstType === 'none' ? '' : gst.gstType);
  gst.gstType = gstType;
  const tcsAmount = roundMoney(taxableAmount * (Number(input.tcsRate) || 0) / 100);
  const exactNet = roundMoney(taxableAmount + gst.totalTaxAmount + tcsAmount);
  const netAmount = roundRupee(exactNet);
  const roundOff = roundMoney(netAmount - exactNet);
  return {
    grossAmount,
    discountAmount,
    taxableAmount,
    ...gst,
    tcsRate: Number(input.tcsRate) || 0,
    tcsAmount,
    netAmount,
    roundOff,
    netAmountAfterTds: netAmount
  };
}
