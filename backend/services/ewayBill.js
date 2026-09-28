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
    clientId: decryptSecret(profile?.ewbClientId) || text(process.env.EWB_CLIENT_ID),
    clientSecret: decryptSecret(profile?.ewbClientSecret) || text(process.env.EWB_CLIENT_SECRET),
    username: decryptSecret(profile?.ewbUsername) || text(process.env.EWB_USERNAME),
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
    hsnCode: digits(line.hsnCode) || digits(doc.hsnCode),
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
    vehicleNo: text(transport.vehicleNo).toUpperCase().replace(/[^A-Z0-9]/g, ''),
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
    if (!item.hsnCode) errors.push(`Line ${index + 1} (${item.productName}) has no HSN code.`);
    if (!(Number(item.quantity) > 0)) warnings.push(`Line ${index + 1} (${item.productName}) has zero quantity.`);
  });

  const distance = Number(payload.transDistance) || 0;
  if (distance <= 0) errors.push('Enter the approximate distance in km (NIC needs it to set the validity).');
  if (distance > 4000) errors.push('Distance cannot be more than 4000 km.');

  if (!payload.vehicleNo && !payload.transporterId) {
    errors.push('Enter a vehicle number, or a 15-character transporter GSTIN/ID so the transporter can fill Part-B.');
  }
  if (payload.vehicleNo && !/^[A-Z]{2}[A-Z0-9]{4,13}$/.test(payload.vehicleNo)) {
    warnings.push(`Vehicle number ${payload.vehicleNo} does not look like a standard registration number.`);
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

function parseEwayResult(data) {
  const result = data?.results?.ewayBillNo || data?.results?.ewbNo
    ? data.results
    : (data?.data || data?.results || data?.result || data || {});
  return {
    result,
    ewayBillNo: text(result.ewayBillNo || result.ewbNo || result.eway_bill_no)
  };
}

function providerFailureMessage(data, status) {
  return text(
    data?.message
    || data?.error_description
    || data?.errorDescription
    || data?.error
    || data?.status_desc
    || data?.statusDesc
    || (Array.isArray(data?.errors) ? data.errors.map((item) => item.message || item.error || item).join('; ') : '')
  ) || `E-way bill API returned ${status} without a bill number.`;
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
    return { ok: response.ok, status: response.status, data: parsed };
  } finally {
    clearTimeout(timer);
  }
}

async function postJson(url, options) {
  return requestJson(url, { ...options, method: 'POST' });
}

async function resolveOutboundIp() {
  const sources = ['https://api.ipify.org?format=json', 'https://ifconfig.me/ip'];
  for (const source of sources) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(source, { signal: controller.signal });
      const raw = (await response.text()).trim();
      const ip = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(raw) ? raw : text(JSON.parse(raw)?.ip);
      if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) return ip;
    } catch {
      // Try the next lookup; generate still sends a fallback header.
    } finally {
      clearTimeout(timer);
    }
  }
  return '127.0.0.1';
}

function whitebooksHeaders(config, ip, authtoken = '') {
  return {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    gstin: config.gstin,
    username: config.username,
    password: config.password,
    ip_address: ip,
    ...(authtoken ? { authtoken } : {})
  };
}

function extractAuthToken(data) {
  const result = data?.data || data?.results || data || {};
  return text(result.authtoken || result.authToken || result.access_token || data?.authtoken);
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

async function authenticateWhiteBooks(origin, config, ip) {
  const headers = whitebooksHeaders(config, ip);
  const emailQuery = config.email ? `?email=${encodeURIComponent(config.email)}` : '';
  const url = `${origin}/ewaybillapi/v1.03/authenticate${emailQuery}`;
  let { status, data } = await requestJson(url, { method: 'GET', headers });
  let token = extractAuthToken(data);
  if (!token && (status === 404 || status === 405)) {
    ({ status, data } = await postJson(url, { headers, body: {} }));
    token = extractAuthToken(data);
  }
  if (!token) {
    throw apiError(
      `WhiteBooks login failed: ${providerFailureMessage(data, status)}. `
        + 'Check the WhiteBooks client id/secret and the NIC For-GSP username/password in Company Master.',
      502,
      data
    );
  }
  return token;
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
  const ip = await resolveOutboundIp();
  const emailQuery = config.email ? `?email=${encodeURIComponent(config.email)}` : '';
  const generateUrl = `${origin}/ewaybillapi/v1.03/ewayapi/genewaybill${emailQuery}`;

  const first = await postJson(generateUrl, {
    headers: whitebooksHeaders(config, ip),
    body: payload
  });
  const firstParsed = parseEwayResult(first.data);
  if (firstParsed.ewayBillNo) {
    return asGeneratedBill(firstParsed, first.data, payload, config);
  }

  const firstMessage = providerFailureMessage(first.data, first.status);
  const needsAuth = /auth|token|authenticate|credentials/i.test(firstMessage);
  if (!needsAuth) {
    throw apiError(firstMessage, 502, first.data);
  }

  const authtoken = await authenticateWhiteBooks(origin, config, ip);
  const second = await postJson(generateUrl, {
    headers: whitebooksHeaders(config, ip, authtoken),
    body: payload
  });
  const secondParsed = parseEwayResult(second.data);
  if (secondParsed.ewayBillNo) {
    return asGeneratedBill(secondParsed, second.data, payload, config);
  }

  throw apiError(providerFailureMessage(second.data, second.status), 502, second.data);
}

export async function generateEwayBill(payload, config) {
  if (config.mode === 'mock') return generateMock(payload);
  if (text(config.provider).toLowerCase() === 'mastergst') return generateViaMasterGst(payload, config);
  return generateViaWhiteBooks(payload, config);
}
