import crypto from 'crypto';
import { getPostingRule, getGstDocumentType } from '../constants/erpTransactionPostingRules.js';
import { getStateFromGstin, getStateCodeFromName, resolveStateKey } from '../utils/gstCalculation.js';
import { decryptSecret } from '../utils/secretBox.js';

/**
 * NIC e-way bill payload builder + provider adapters.
 *
 * The e-way bill always belongs to the selling firm's GSTIN, so every field
 * below is read from that company's master and the saved voucher — never from
 * hard-coded values. Series behaviour (GST document type, bill numbering) comes
 * from the Transaction Types master via `erpTransactionPostingRules`.
 */

export const EWB_MODES = ['mock', 'sandbox', 'production'];

const WHITEBOOKS_SANDBOX = 'https://apisandbox.whitebooks.in';
const WHITEBOOKS_PRODUCTION = 'https://api.whitebooks.in';
/** WhiteBooks sandbox user BVMGSP is linked to this GSTIN, not the company GSTIN. */
const SANDBOX_EWAY_GSTIN = '29AAGCB1286Q000';

function sandboxSellerPayload(payload) {
  const toState = Number(payload.toStateCode) || 0;
  const interState = toState && toState !== 29;
  const cgst = Number(payload.cgstValue) || 0;
  const sgst = Number(payload.sgstValue) || 0;
  const igst = Number(payload.igstValue) || 0;
  const toName = text(payload.toTrdName);
  const next = {
    ...payload,
    fromGstin: SANDBOX_EWAY_GSTIN,
    fromAddr1: text(payload.fromAddr1) || 'ELECTRONIC CITY',
    fromPlace: 'BANGALORE',
    fromPincode: 560001,
    fromStateCode: 29,
    actFromStateCode: 29,
    toTrdName: toName.length >= 5 ? toName : `${toName} CUSTOMER`.trim() || 'CONSIGNEE'
  };
  if (interState && (cgst || sgst)) {
    next.cgstValue = 0;
    next.sgstValue = 0;
    next.igstValue = round2(igst + cgst + sgst);
    next.itemList = (payload.itemList || []).map((item) => ({
      ...item,
      igstRate: round2((Number(item.igstRate) || 0) + (Number(item.cgstRate) || 0) + (Number(item.sgstRate) || 0)),
      cgstRate: 0,
      sgstRate: 0
    }));
  }
  return next;
}

function whitebooksOrigin(mode, explicitBaseUrl) {
  const raw = text(explicitBaseUrl) || (mode === 'production' ? WHITEBOOKS_PRODUCTION : WHITEBOOKS_SANDBOX);
  return raw.replace(/\/$/, '').replace(/\/eway$/i, '');
}

function whitebooksBaseUrl(mode) {
  return mode === 'production' ? WHITEBOOKS_PRODUCTION : WHITEBOOKS_SANDBOX;
}

/** NIC document types. The master gives us the GST document class in words. */
const NIC_DOC_TYPES = {
  'invoices for outward supply': 'INV',
  'invoices for inward supply from unregistered person': 'INV',
  'bill of supply': 'BIL',
  'delivery challan': 'CHL',
  'delivery challan for job work': 'CHL',
  'credit note': 'CNT',
  'debit note': 'OTH',
  'bill of entry': 'BOE'
};

/** NIC quantity unit codes for the units our item master uses. */
const NIC_UNIT_CODES = {
  PCS: 'PCS',
  PC: 'PCS',
  NOS: 'NOS',
  MTR: 'MTR',
  MTRS: 'MTR',
  MTS: 'MTR',
  MTD: 'MTR',
  METER: 'MTR',
  METERS: 'MTR',
  KGS: 'KGS',
  KG: 'KGS',
  BOX: 'BOX',
  BAG: 'BAG',
  BAGS: 'BAG',
  ROL: 'ROL',
  THD: 'THD'
};

export const TRANSPORT_MODES = [
  { value: '1', label: 'Road' },
  { value: '2', label: 'Rail' },
  { value: '3', label: 'Air' },
  { value: '4', label: 'Ship' }
];

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const text = (value) => String(value == null ? '' : value).trim();
const digits = (value) => text(value).replace(/\D/g, '');

/** Send the HSN saved on the bill. A 4-digit heading such as 5407 is rejected before the call. */
function ewayHsn(code) {
  return digits(code).slice(0, 8);
}

const RTO_STATES = new Set([
  'AN', 'AP', 'AR', 'AS', 'BR', 'CG', 'CH', 'DD', 'DL', 'DN', 'GA', 'GJ', 'HP', 'HR',
  'JH', 'JK', 'KA', 'KL', 'LA', 'LD', 'MH', 'ML', 'MN', 'MP', 'MZ', 'NL', 'OD', 'OR',
  'PB', 'PY', 'RJ', 'SK', 'TN', 'TR', 'TS', 'UK', 'UA', 'UP', 'WB'
]);

/** NIC vehicle format. GH is not a state code; GJ is. */
function nicVehicleNo(value) {
  const raw = text(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!raw) return '';
  if (/^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$/.test(raw)) return raw;
  const match = raw.match(/^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{3,4})$/);
  if (!match || !RTO_STATES.has(match[1])) return '';
  const vehicle = `${match[1]}${match[2].padStart(2, '0')}${match[3]}${match[4].padStart(4, '0')}`;
  return /^[A-Z]{2}\d{2}[A-Z]{1,3}\d{4}$/.test(vehicle) ? vehicle : '';
}

/** NIC wants dd/mm/yyyy. */
export function nicDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
}

function parseNicDateTime(value) {
  const raw = text(value);
  if (!raw) return null;
  // NIC returns "dd/mm/yyyy hh:mm:ss AM" or ISO, depending on the GSP.
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
  if (match) {
    const [, dd, mm, yyyy, hh = '0', mi = '0', ss = '0', meridiem] = match;
    let hour = Number(hh);
    if (meridiem) {
      const upper = meridiem.toUpperCase();
      if (upper === 'PM' && hour < 12) hour += 12;
      if (upper === 'AM' && hour === 12) hour = 0;
    }
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd), hour, Number(mi), Number(ss));
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function nicUnit(unit) {
  const key = text(unit).toUpperCase();
  return NIC_UNIT_CODES[key] || 'PCS';
}

export function nicDocType(transactionType) {
  const label = text(getGstDocumentType(transactionType)).toLowerCase();
  if (NIC_DOC_TYPES[label]) return NIC_DOC_TYPES[label];
  if (label.includes('credit')) return 'CNT';
  if (label.includes('challan')) return 'CHL';
  if (label.includes('bill of supply')) return 'BIL';
  if (label.includes('invoice')) return 'INV';
  return 'INV';
}

/**
 * Outward for anything that moves stock out of us, inward for returns coming
 * back. Stock effect on the master row is the authority.
 */
export function nicSupplyType(transactionType) {
  const rule = getPostingRule(transactionType);
  const series = text(transactionType).toUpperCase();
  if (series.includes('RETURN') || text(rule?.gstDocumentType).toLowerCase().includes('credit')) {
    return { supplyType: 'I', subSupplyType: '7' };
  }
  if (text(rule?.gstDocumentType).toLowerCase().includes('job work')) {
    return { supplyType: 'O', subSupplyType: '4' };
  }
  return { supplyType: 'O', subSupplyType: '1' };
}

export function stateCodeOf(...candidates) {
  for (const candidate of candidates) {
    const raw = text(candidate);
    if (!raw) continue;
    const fromGstin = /^\d{2}[A-Z]{5}/i.test(raw) ? getStateFromGstin(raw).stateCode : '';
    if (fromGstin) return String(Number(fromGstin));
    const byName = getStateCodeFromName(raw);
    if (byName) return String(Number(byName));
    const key = resolveStateKey(raw);
    if (/^\d{1,2}$/.test(key)) return String(Number(key));
  }
  return '';
}

/**
 * Validity: 1 day per 200 km (regular cargo), counted from generation.
 * Kept here so mock and real runs describe the same expectation to the user.
 */
export function validUptoFor(distanceKm, generatedAt = new Date()) {
  const km = Math.max(1, Number(distanceKm) || 1);
  const days = Math.max(1, Math.ceil(km / 200));
  const end = new Date(generatedAt);
  end.setDate(end.getDate() + days);
  end.setHours(23, 59, 0, 0);
  return end;
}

/** Resolve API access: company master first, then environment fallback. */
export function resolveEwayConfig(profile) {
  const envMode = text(process.env.EWB_MODE).toLowerCase();
  const dbMode = text(profile?.ewbMode).toLowerCase();
  const mode = EWB_MODES.includes(dbMode) ? dbMode : (EWB_MODES.includes(envMode) ? envMode : 'mock');
  const provider = text(profile?.ewbProvider) || text(process.env.EWB_PROVIDER) || 'whitebooks';
  const storedBase = text(profile?.ewbBaseUrl) || text(process.env.EWB_BASE_URL);
  const looksLikeMastergst = /mastergst/i.test(storedBase);
  const baseUrl = provider === 'whitebooks' && (!storedBase || looksLikeMastergst)
    ? whitebooksBaseUrl(mode)
    : (storedBase || whitebooksBaseUrl(mode));
  return {
    mode,
    provider,
    baseUrl,
    clientId: text(decryptSecret(profile?.ewbClientId) || process.env.EWB_CLIENT_ID),
    clientSecret: text(decryptSecret(profile?.ewbClientSecret) || process.env.EWB_CLIENT_SECRET),
    username: text(decryptSecret(profile?.ewbUsername) || process.env.EWB_USERNAME),
    password: decryptSecret(profile?.ewbPassword) || text(process.env.EWB_PASSWORD),
    gstin: text(profile?.ewbGstin) || text(profile?.gstNumber) || text(process.env.EWB_GSTIN),
    email: text(profile?.email) || text(process.env.EWB_ACCOUNT_EMAIL),
    defaultDistance: Number(profile?.ewbDefaultDistance) || Number(process.env.EWB_DEFAULT_DISTANCE) || 0
  };
}

/**
 * Turn a saved sales document into the NIC request body.
 * `doc` is source-agnostic so grey dispatch / work despatch can reuse it later.
 */
export function buildEwayBillPayload({ doc, company, party, transport }) {
  const { supplyType, subSupplyType } = nicSupplyType(doc.transactionType);
  const fromStateCode = stateCodeOf(company.gstin, company.state);
  const toStateCode = stateCodeOf(party.gstin, party.state);
  const itemList = (doc.lines || []).map((line) => ({
    productName: text(line.itemName).slice(0, 100) || 'GOODS',
    productDesc: text(line.description || line.itemName).slice(0, 100) || 'TEXTILE GOODS',
    hsnCode: ewayHsn(digits(line.hsnCode) || digits(doc.hsnCode)),
    quantity: round2(line.quantity),
    qtyUnit: nicUnit(line.unit),
    cgstRate: round2(line.cgstRate),
    sgstRate: round2(line.sgstRate),
    igstRate: round2(line.igstRate),
    cessRate: 0,
    cessNonAdvol: 0,
    taxableAmount: round2(line.taxableAmount)
  }));

  return {
    supplyType,
    subSupplyType,
    docType: nicDocType(doc.transactionType),
    docNo: text(doc.docNo).slice(0, 16),
    docDate: nicDate(doc.docDate),
    fromGstin: text(company.gstin).toUpperCase(),
    fromTrdName: text(company.tradeName).slice(0, 100),
    fromAddr1: text(company.addressLine1).slice(0, 120),
    fromAddr2: text(company.addressLine2).slice(0, 120),
    fromPlace: text(company.city).slice(0, 50),
    fromPincode: Number(digits(company.pincode)) || 0,
    actFromStateCode: Number(fromStateCode) || 0,
    fromStateCode: Number(fromStateCode) || 0,
    toGstin: text(party.gstin).toUpperCase() || 'URP',
    toTrdName: text(party.tradeName).slice(0, 100),
    toAddr1: text(party.addressLine1).slice(0, 120),
    toAddr2: text(party.addressLine2).slice(0, 120),
    toPlace: text(party.city).slice(0, 50),
    toPincode: Number(digits(party.pincode)) || 0,
    actToStateCode: Number(toStateCode) || 0,
    toStateCode: Number(toStateCode) || 0,
    transactionType: 1,
    totalValue: round2(doc.totals.taxableAmount),
    cgstValue: round2(doc.totals.cgstAmount),
    sgstValue: round2(doc.totals.sgstAmount),
    igstValue: round2(doc.totals.igstAmount),
    cessValue: 0,
    cessNonAdvolValue: 0,
    otherValue: 0,
    totInvValue: round2(doc.totals.netAmount),
    transporterId: text(transport.transporterId).toUpperCase(),
    transporterName: text(transport.transporterName).slice(0, 100),
    transDocNo: text(transport.transDocNo).slice(0, 15),
    transDocDate: transport.transDocDate ? nicDate(transport.transDocDate) : '',
    transMode: text(transport.transMode) || '1',
    transDistance: String(Math.max(0, Math.round(Number(transport.distance) || 0))),
    vehicleNo: nicVehicleNo(transport.vehicleNo),
    vehicleType: text(transport.vehicleType) || 'R',
    itemList
  };
}

/** Keep this permissive — NIC is the final authority on a GSTIN. */
const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]{3}$/i;

/** What NIC will reject, checked before we spend an API call. */
export function validateEwayBillPayload(payload) {
  const errors = [];
  const warnings = [];

  if (!GSTIN_PATTERN.test(payload.fromGstin || '')) {
    errors.push('Your company GSTIN is missing or not a valid 15-character GSTIN. Add it in Company Master.');
  }
  if (!payload.fromPincode) errors.push('Your company pincode is missing in Company Master.');
  if (!payload.actFromStateCode) errors.push('Your company state could not be resolved to a GST state code.');
  if (!payload.fromAddr1) errors.push('Your company address line 1 is missing in Company Master.');

  if (payload.toGstin !== 'URP' && !GSTIN_PATTERN.test(payload.toGstin || '')) {
    errors.push('Party GSTIN is not valid. Use a correct GSTIN, or clear it to bill an unregistered party (URP).');
  }
  if (!payload.toPincode) errors.push('Party pincode is missing. Add it in the party master.');
  if (!payload.actToStateCode) {
    errors.push(
      `Party ${payload.toTrdName ? `"${payload.toTrdName}" ` : ''}has no GST state. Open Accounts and fill this party's GSTIN or State (e.g. Uttar Pradesh / 09), then try again.`
    );
  }
  if (!payload.toAddr1) errors.push('Party address is missing. Add it in the party master.');

  if (!payload.docNo) errors.push('Bill number is missing. Save the bill first.');
  if (!payload.docDate) errors.push('Bill date is missing.');
  if (!payload.itemList?.length) errors.push('The bill has no item lines.');
  if (!(Number(payload.totInvValue) > 0)) errors.push('Bill value must be greater than zero.');

  payload.itemList?.forEach((item, index) => {
    const hsn = digits(item.hsnCode);
    const name = item.productName || `line ${index + 1}`;
    if (!hsn) errors.push(`Line ${index + 1} (${name}) has no HSN.`);
    else if (hsn.length < 6) {
      errors.push(`Line ${index + 1} (${name}) HSN is ${hsn}. E-way needs at least 6 digits. For this fabric enter 540752.`);
    }
    if (!(Number(item.quantity) > 0)) errors.push(`Line ${index + 1} (${name}) needs a quantity.`);
  });

  const distance = Number(payload.transDistance) || 0;
  if (distance > 4000) errors.push('Distance cannot be more than 4000 km.');

  if (!payload.vehicleNo && !payload.transporterId) {
    errors.push('Enter a vehicle number, or a 15-character transporter GSTIN/ID so the transporter can fill Part-B.');
  }
  if (payload.vehicleNo && !/^(?:[A-Z]{2}\d{2}[A-Z]{1,3}\d{4}|\d{2}BH\d{4}[A-Z]{1,2})$/.test(payload.vehicleNo)) {
    errors.push(`Vehicle number ${payload.vehicleNo} is not a valid registration. Example: GJ05JX2427.`);
  }
  if (payload.transporterId && payload.transporterId.length !== 15) {
    errors.push('Transporter ID must be exactly 15 characters (their GSTIN or NIC transporter ID).');
  }

  return { errors, warnings };
}

/**
 * Offline test numbers. No network call, nothing is filed with NIC — this is
 * how we exercise the whole flow before the GSP sandbox keys arrive.
 */
function generateMock(payload) {
  const seed = crypto
    .createHash('sha256')
    .update(`${payload.fromGstin}|${payload.docNo}|${payload.docDate}|${Date.now()}`)
    .digest('hex');
  const body = BigInt(`0x${seed.slice(0, 12)}`) % 100000000000n;
  const ewayBillNo = `9${String(body).padStart(11, '0')}`;
  const generatedAt = new Date();
  return {
    ewayBillNo,
    ewayBillDate: generatedAt,
    validUpto: validUptoFor(payload.transDistance, generatedAt),
    alert: 'Test number generated offline. Nothing was filed with NIC.',
    raw: { mode: 'mock', payload }
  };
}

function apiError(message, status, details) {
  const error = new Error(message);
  error.status = status;
  error.details = details;
  return error;
}

function parseEncodedJson(value) {
  if (typeof value !== 'string' || value.length < 8) return null;
  const direct = asJsonObject(value);
  if (direct) return direct;
  if (!/^[A-Za-z0-9+/=\s]+$/.test(value.slice(0, 120))) return null;
  try {
    const decoded = Buffer.from(value.replace(/\s/g, ''), 'base64').toString('utf8').trim();
    if (!decoded.startsWith('{') && !decoded.startsWith('[')) return null;
    return asJsonObject(decoded);
  } catch {
    return null;
  }
}

/** What the user must fix. Codes stay out of the sentence. */
const NIC_REQUIREMENTS = {
  206: 'Save the bill first so it has a bill number.',
  207: 'The bill date is missing or is not accepted. Use a date in the current financial year.',
  208: 'The seller GSTIN is not valid. Check Company Master.',
  209: 'Add the company address in Company Master.',
  210: 'The company PIN code must be 6 digits. Add it in Company Master.',
  211: 'The company state does not match its GSTIN. Check Company Master.',
  212: 'The party GSTIN is not valid. Correct it in the party master, or clear it for an unregistered party.',
  213: 'Add the party address in the party master.',
  214: 'The party PIN code must be 6 digits. Add it in the party master.',
  215: 'The party state does not match the party GSTIN. Fill the state or GSTIN in the party master.',
  216: 'Each item needs a valid HSN of at least 6 digits. For this fabric use 540752.',
  217: 'Each item needs a valid unit, such as PCS or MTR.',
  218: 'This is a sale inside the same state, so the bill needs CGST and SGST, and IGST must be zero.',
  219: 'This is a sale to another state, so the bill needs IGST only. CGST and SGST must be zero.',
  220: 'Choose a transport mode: Road, Rail, Air, or Ship.',
  221: 'The kilometres must be the distance between the company PIN and the party PIN. It is filled from those PINs.',
  222: 'The transporter ID must be that transporter’s 15-character GSTIN.',
  225: 'The vehicle number must be a real registration, such as GJ05JX2427. The first two letters are the state code. GH is not a state code.',
  226: 'Enter a vehicle number, or the transporter’s 15-character GSTIN.',
  229: 'Add the company trade name in Company Master.',
  230: 'Add the company city in Company Master.',
  231: 'The party name is missing or too short. Use the full name in the party master.',
  232: 'Add the party city in the party master.',
  235: 'A sale inside the same state needs CGST and SGST on each item.',
  236: 'A sale to another state needs IGST on each item.',
  251: 'CGST and SGST rates must be equal.',
  252: 'CGST rate is not valid for this bill.',
  253: 'SGST rate is not valid for this bill.',
  254: 'IGST rate is not valid for this bill.',
  282: 'Each item needs an HSN of at least 4 digits.',
  283: 'This seller needs an HSN of at least 6 digits on every line. For this fabric use 540752.',
  358: 'The GSTIN on the login does not match the seller GSTIN on the bill.',
  359: 'For an outward bill, the seller GSTIN on the bill must be the GSTIN used to log in.',
  361: 'Choose Regular or Over dimensional cargo as the vehicle type.',
  702: 'The kilometres do not match the two PIN codes. Distance is filled from the company PIN and the party PIN.',
  709: 'These two PIN codes have no distance on the e-way portal. Check the company PIN and the party PIN.',
  721: 'These two PIN codes have no distance on the e-way portal. Check the company PIN and the party PIN.'
};

function requirementForCode(code) {
  const key = text(code);
  return NIC_REQUIREMENTS[key] || '';
}

function requirementFromInfo(info) {
  const raw = text(info).replace(/^,\s*/, '');
  if (!raw || looksLikeDocsBlurb(raw)) return '';
  if (/distance|pincode/i.test(raw)) {
    return 'The kilometres must match the distance between the company PIN and the party PIN. It is filled from those PINs.';
  }
  if (/^\d+$/.test(raw)) return requirementForCode(raw);
  return raw;
}

function gspRequirements(data) {
  const err = data?.error;
  const list = Array.isArray(err)
    ? err
    : (Array.isArray(data?.errors) ? data.errors : null);
  const parts = [];
  if (list) {
    for (const item of list) {
      const code = item?.errorCode ?? item?.error_cd ?? item?.code;
      const sentence = requirementForCode(code) || requirementFromInfo(item?.errorMessage ?? item?.message);
      if (sentence) parts.push(sentence);
    }
  } else if (err != null && (typeof err === 'string' || typeof err === 'number')) {
    const sentence = requirementForCode(err) || requirementFromInfo(err);
    if (sentence) parts.push(sentence);
  } else if (err && typeof err === 'object') {
    const code = err.errorCodes ?? err.error_cd ?? err.errorCode ?? err.code;
    const named = err.error_desc || err.errorDesc || err.errorMsg || err.message || err.status_desc;
    const sentence = requirementForCode(code) || requirementFromInfo(named);
    if (sentence) parts.push(sentence);
  }
  const info = requirementFromInfo(data?.info);
  if (info && !parts.includes(info)) parts.push(info);
  return [...new Set(parts)];
}

function gspErrorText(data) {
  return gspRequirements(data).join('\n');
}

function parseEwayResult(data) {
  const nested = parseEncodedJson(data?.data) || asJsonObject(data?.data) || data?.data;
  const candidates = [data?.results, nested, data?.result, data?.header, data];
  for (const candidate of candidates) {
    const obj = parseEncodedJson(candidate) || asJsonObject(candidate) || candidate;
    if (!obj || typeof obj !== 'object') continue;
    const ewayBillNo = text(obj.ewayBillNo || obj.ewbNo || obj.eway_bill_no);
    if (ewayBillNo) return { result: obj, ewayBillNo };
  }
  const walked = findJsonField(data, /ewaybillno|^ewbno$|eway_bill_no/i);
  if (walked) return { result: data || {}, ewayBillNo: walked };
  return { result: data || {}, ewayBillNo: '' };
}

function findJsonField(value, keyPattern, depth = 0) {
  if (depth > 8 || value == null) return '';
  if (typeof value === 'string') {
    const parsed = parseEncodedJson(value) || asJsonObject(value);
    return parsed ? findJsonField(parsed, keyPattern, depth + 1) : '';
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJsonField(item, keyPattern, depth + 1);
      if (found) return found;
    }
    return '';
  }
  if (typeof value !== 'object') return '';
  for (const [key, item] of Object.entries(value)) {
    if (keyPattern.test(key)) {
      const found = text(item);
      if (found && !looksLikeDocsBlurb(found)) return found;
    }
  }
  for (const item of Object.values(value)) {
    const found = findJsonField(item, keyPattern, depth + 1);
    if (found) return found;
  }
  return '';
}

function looksLikeDocsBlurb(value) {
  return /if authentication succeeds|send a live request|playground/i.test(text(value));
}

function asJsonObject(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
  return typeof value === 'object' ? value : null;
}

function compactEwayBody(value) {
  if (Array.isArray(value)) return value.map(compactEwayBody);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === '' || item == null) continue;
    out[key] = typeof item === 'object' ? compactEwayBody(item) : item;
  }
  return out;
}

function providerFailureMessage(data, status) {
  const candidates = [
    gspErrorText(data),
    data?.error_description,
    data?.errorDescription,
    typeof data?.error === 'string' ? data.error : data?.error?.message,
    data?.status_desc,
    data?.statusDesc,
    data?.info,
    data?.message
  ];
  const requirements = gspRequirements(data);
  if (requirements.length) return requirements.join('\n');
  const useful = candidates.map(text).find((item) => item && !looksLikeDocsBlurb(item) && !/^\d+$/.test(item));
  if (useful) return useful;
  return 'The e-way bill was not generated. Check the company GSTIN, party GSTIN, both PIN codes, a 6-digit HSN, and a vehicle number such as GJ05JX2427.';
}

function isWhiteBooksAuthSuccess(data) {
  const cd = text(data?.status_cd ?? data?.statusCd ?? data?.status);
  return cd === '1' || cd.toLowerCase() === 'success';
}

function looksLikeAuthToken(value) {
  const token = text(value);
  return /^[A-Za-z0-9+/_.=-]{16,200}$/.test(token);
}

let cachedOutboundIp = '';

async function resolveOutboundIp() {
  if (cachedOutboundIp) return cachedOutboundIp;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
    const ip = text((await response.json())?.ip);
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) {
      cachedOutboundIp = ip;
      return ip;
    }
  } catch {
    // Generate still sends a fallback; NIC will reject the token if the IP is wrong.
  } finally {
    clearTimeout(timer);
  }
  return '1.1.1.1';
}

function extractAuthToken(data, responseHeaders) {
  const fromBody = findJsonToken(data);
  if (looksLikeAuthToken(fromBody)) return fromBody;

  let headerToken = '';
  responseHeaders?.forEach?.((value, key) => {
    if (headerToken) return;
    if (/auth.?token|access.?token|^token$/i.test(String(key)) && looksLikeAuthToken(value)) {
      headerToken = text(value);
    }
  });
  return headerToken;
}

function findJsonToken(value, depth = 0) {
  if (depth > 8 || value == null) return '';
  if (typeof value === 'string') {
    const parsed = parseEncodedJson(value) || asJsonObject(value);
    return parsed ? findJsonToken(parsed, depth + 1) : '';
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJsonToken(item, depth + 1);
      if (found) return found;
    }
    return '';
  }
  if (typeof value !== 'object') return '';
  for (const [key, item] of Object.entries(value)) {
    if (/auth.?token|access.?token|^token$|^authtoken$/i.test(key)) {
      const token = text(item);
      if (looksLikeAuthToken(token)) return token;
    }
  }
  for (const item of Object.values(value)) {
    const found = findJsonToken(item, depth + 1);
    if (found) return found;
  }
  return '';
}

async function requestJson(url, { method = 'POST', headers, body, timeoutMs = 30000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body == null ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
    const raw = await response.text();
    let parsed = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = { raw };
    }
    return { ok: response.ok, status: response.status, data: parsed, headers: response.headers };
  } finally {
    clearTimeout(timer);
  }
}

async function postJson(url, options) {
  return requestJson(url, { ...options, method: 'POST' });
}

function whitebooksHeaders(config, authtoken = '', irp = '', { includeLogin = false, ip = '' } = {}) {
  return {
    client_id: text(config.clientId),
    client_secret: text(config.clientSecret),
    gstin: text(config.gstin).toUpperCase(),
    ip_address: '0.0.0.0',
    ...(irp ? { irp } : {}),
    ...(includeLogin ? { username: text(config.username), password: config.password } : {}),
    ...(config.email ? { email: text(config.email) } : {}),
    ...(authtoken ? { authtoken } : {})
  };
}

/** Authenticate always sends the login. Generate sends it only when WhiteBooks did not return an auth token. */
function whitebooksQuery(config, irp = '', { includeLogin = false } = {}) {
  const params = new URLSearchParams();
  if (config.email) params.set('email', text(config.email));
  if (includeLogin) {
    if (config.username) params.set('username', text(config.username));
    if (config.password) params.set('password', config.password);
  }
  if (irp) params.set('irp', irp);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function pin6(value) {
  const pin = digits(value).slice(0, 6);
  return pin.length === 6 ? pin : '';
}

/** WhiteBooks returns the NIC kilometres between two PIN codes. 0 means NIC should calculate it. */
async function lookupPinDistance(origin, config, fromPin, toPin) {
  const from = pin6(fromPin);
  const to = pin6(toPin);
  if (!from || !to) return 0;
  if (from === to) return 10;
  try {
    const params = new URLSearchParams({
      email: text(config.email),
      fromPincode: from,
      toPincode: to
    });
    const response = await requestJson(`${origin}/ewaybillapi/v1.03/distance?${params}`, {
      method: 'GET',
      headers: whitebooksHeaders(config, '', '', { includeLogin: true }),
      timeoutMs: 12000
    });
    const raw = response.data?.data ?? response.data?.distance;
    const value = Number(raw && typeof raw === 'object' ? (raw.distance ?? raw.actualDist) : raw);
    if (Number.isFinite(value) && value > 0 && value <= 4000) return Math.round(value);
  } catch {
    // Generate still sends 0 so NIC fills the PIN-to-PIN distance.
  }
  return 0;
}

/**
 * Sandbox seller, 6-digit HSN, a real vehicle number, and kilometres from the two PINs.
 * The dialog does not ask the user for distance.
 */
export async function finalizeEwayPayload(payload, config) {
  const next = config.mode === 'sandbox' ? sandboxSellerPayload(payload) : {
    ...payload,
    itemList: payload.itemList
  };
  next.itemList = (next.itemList || []).map((item) => ({ ...item, hsnCode: ewayHsn(item.hsnCode) }));
  next.vehicleNo = nicVehicleNo(next.vehicleNo);
  let distanceKm = Number(next.transDistance) || 0;
  if (config.mode !== 'mock') {
    const apiConfig = config.mode === 'sandbox' ? { ...config, gstin: SANDBOX_EWAY_GSTIN } : config;
    const origin = whitebooksOrigin(config.mode, config.baseUrl);
    distanceKm = await lookupPinDistance(origin, apiConfig, next.fromPincode, next.toPincode);
    next.transDistance = distanceKm > 0 ? String(distanceKm) : '0';
  }
  return {
    payload: next,
    distanceKm,
    fromPincode: pin6(next.fromPincode),
    toPincode: pin6(next.toPincode)
  };
}

function whitebooksLoginError(data, status) {
  if (isWhiteBooksAuthSuccess(data)) {
    return 'WhiteBooks accepted the sandbox login but did not send a readable auth token. Try Generate again after the latest deploy.';
  }
  const raw = providerFailureMessage(data, status);
  if (/user does not exist|incorrect user id|invalid username/i.test(raw)) {
    return (
      'WhiteBooks does not know this API username. '
      + 'For Sandbox, Company Master API username must be the WhiteBooks playground user (BVMGSP), not the live NIC user ThreadX_API_Thr. '
      + 'GSTIN is a header on that same playground — scroll below Query to Headers. '
    );
  }
  if (/not active|invalid credentials/i.test(raw)) {
    return (
      'WhiteBooks did not accept this sandbox login. The sales bill is fine. '
      + 'In WhiteBooks open e-Way Bill API → Sandbox (not the general API Keys page), copy Client ID and Secret again into Company Master, '
      + 'and re-save the full NIC For-GSP username (ThreadX_API_ plus 3 letters) and its password. '
      + 'Company email must be the same email used on WhiteBooks. '
      + 'If it still says the account is not active, WhiteBooks has to enable e-way sandbox on that login.'
    );
  }
  return `WhiteBooks login failed: ${raw}`;
}

/**
 * MasterGST-style GSP call. Sandbox and production differ only by the
 * credentials and base URL, so one adapter serves both.
 */
async function generateViaMasterGst(payload, config) {
  const missing = ['clientId', 'clientSecret', 'username', 'password', 'gstin']
    .filter((key) => !config[key]);
  if (missing.length) {
    const error = new Error(
      `E-way bill API is set to ${config.mode} but these credentials are missing: ${missing.join(', ')}. `
      + 'Add them in Company Master, or switch the mode back to Test.'
    );
    error.status = 400;
    throw error;
  }

  const url = `${config.baseUrl.replace(/\/$/, '')}/ewaybillapi/v1.03/ewayapi/genewaybill?email=${encodeURIComponent(config.email || '')}`;
  const { ok, status, data } = await postJson(url, {
    headers: {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      gstin: config.gstin,
      username: config.username,
      password: config.password
    },
    body: payload
  });

  const { result, ewayBillNo } = parseEwayResult(data);
  if (!ok || !ewayBillNo) {
    throw apiError(providerFailureMessage(data, status), 502, data);
  }

  const generatedAt = parseNicDateTime(result.ewayBillDate) || new Date();
  return {
    ewayBillNo,
    ewayBillDate: generatedAt,
    validUpto: parseNicDateTime(result.validUpto) || validUptoFor(payload.transDistance, generatedAt),
    alert: text(result.alert),
    raw: data
  };
}

async function authenticateWhiteBooks(origin, config, irp = '', ip = '') {
  const attempts = irp ? ['', irp] : [''];
  let last = { status: 0, data: null, headers: null };
  for (const attemptIrp of attempts) {
    const headers = whitebooksHeaders(config, '', attemptIrp, { includeLogin: true, ip });
    const url = `${origin}/ewaybillapi/v1.03/authenticate${whitebooksQuery(config, attemptIrp, { includeLogin: true })}`;
    const response = await requestJson(url, { method: 'GET', headers, timeoutMs: 15000 });
    last = response;
    const token = extractAuthToken(response.data, response.headers);
    if (token) return token;
    // WhiteBooks e-way login returns status 1 and "If authentication succeeds" with no AuthToken.
    if (isWhiteBooksAuthSuccess(response.data)) return '';
    if (response.status !== 200) break;
  }
  throw apiError(whitebooksLoginError(last.data, last.status), 502, last.data);
}

function asGeneratedBill(parsed, data, payload, config) {
  const generatedAt = parseNicDateTime(parsed.result?.ewayBillDate) || new Date();
  return {
    ewayBillNo: parsed.ewayBillNo,
    ewayBillDate: generatedAt,
    validUpto: parseNicDateTime(parsed.result?.validUpto) || validUptoFor(payload.transDistance, generatedAt),
    alert: text(parsed.result?.alert) || (config.mode === 'sandbox'
      ? 'Sandbox number from WhiteBooks. Nothing was filed with NIC.'
      : ''),
    raw: data
  };
}

/**
 * WhiteBooks (BVM) GSP. Sandbox is apisandbox.whitebooks.in and never files
 * with NIC. Production is api.whitebooks.in and uses the same payload.
 */
async function generateViaWhiteBooks(payload, config) {
  const missing = ['clientId', 'clientSecret', 'gstin', 'username', 'password']
    .filter((key) => !config[key]);
  if (missing.length) {
    throw apiError(
      `E-way bill API is set to ${config.mode} but these WhiteBooks credentials are missing: ${missing.join(', ')}. `
        + 'Add them in Company Master, or switch the mode back to Test.',
      400
    );
  }

  const origin = whitebooksOrigin(config.mode, config.baseUrl);
  const apiConfig = config.mode === 'sandbox' ? { ...config, gstin: SANDBOX_EWAY_GSTIN } : config;
  const requestPayload = config.finalized
    ? payload
    : (await finalizeEwayPayload(payload, config)).payload;
  const irpHint = text(config.irp).toUpperCase();
  const irps = irpHint && /^NIC[12]$/.test(irpHint) ? [irpHint] : ['NIC1', 'NIC2'];
  let last = { status: 0, data: null };

  for (const irp of irps) {
    const authtoken = await authenticateWhiteBooks(origin, apiConfig, irp, '0.0.0.0');
    const sendLogin = !authtoken;
    const generateUrl = `${origin}/ewaybillapi/v1.03/ewayapi/genewaybill${whitebooksQuery(apiConfig, irp, { includeLogin: sendLogin })}`;
    const generated = await postJson(generateUrl, {
      headers: whitebooksHeaders(apiConfig, authtoken, irp, { includeLogin: sendLogin }),
      body: compactEwayBody(requestPayload),
      timeoutMs: 20000
    });
    last = generated;
    const parsed = parseEwayResult(generated.data);
    if (parsed.ewayBillNo) {
      return asGeneratedBill(parsed, generated.data, payload, config);
    }

    const wrapped = await postJson(generateUrl, {
      headers: whitebooksHeaders(apiConfig, authtoken, irp, { includeLogin: sendLogin }),
      body: { action: 'GENEWAYBILL', ...compactEwayBody(requestPayload) },
      timeoutMs: 20000
    });
    last = wrapped;
    const wrappedParsed = parseEwayResult(wrapped.data);
    if (wrappedParsed.ewayBillNo) {
      return asGeneratedBill(wrappedParsed, wrapped.data, payload, config);
    }

    const suggested = text(wrapped.data?.irp || generated.data?.irp).toUpperCase();
    if (suggested && /^NIC[12]$/.test(suggested) && suggested !== irp) continue;
  }

  throw apiError(providerFailureMessage(last.data, last.status), 502, last.data);
}

export async function generateEwayBill(payload, config) {
  if (config.mode === 'mock') return generateMock(payload);
  if (text(config.provider).toLowerCase() === 'mastergst') return generateViaMasterGst(payload, config);
  return generateViaWhiteBooks(payload, config);
}
