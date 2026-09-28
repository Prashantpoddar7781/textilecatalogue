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

function gspErrorText(data) {
  const err = data?.error;
  const parts = [];
  if (err != null && (typeof err === 'string' || typeof err === 'number')) {
    parts.push(text(err));
  } else if (err && typeof err === 'object') {
    const named = text(
      err.error_desc
      || err.errorDesc
      || err.errorMsg
      || err.error_msg
      || err.message
      || err.msg
      || err.status_desc
      || err.description
      || err.detail
    );
    const code = err.errorCodes ?? err.error_cd ?? err.errorCode ?? err.code;
    if (named) parts.push(named);
    if (code != null && text(code)) parts.push(`Error ${code}`);
    if (!parts.length) {
      const rest = Object.entries(err)
        .filter(([key]) => !/pass|secret|token|sek/i.test(key))
        .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
        .join(', ');
      if (rest) parts.push(rest);
    }
  }
  const irp = text(data?.irp);
  if (irp) parts.push(`IRP: ${irp}`);
  return parts.join(' — ');
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

function publicReply(data) {
  if (data == null) return '';
  try {
    const clone = JSON.parse(JSON.stringify(data));
    const scrub = (value) => {
      if (!value || typeof value !== 'object') return;
      for (const key of Object.keys(value)) {
        if (/pass|secret|token|sek|client_secret/i.test(key)) value[key] = '***';
        else scrub(value[key]);
      }
    };
    scrub(clone);
    const raw = JSON.stringify(clone);
    return raw.length > 500 ? `${raw.slice(0, 500)}…` : raw;
  } catch {
    return '';
  }
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
  const useful = candidates.map(text).find((item) => item && !looksLikeDocsBlurb(item));
  const raw = publicReply(data);
  if (useful && raw) return `${useful} — ${raw}`;
  if (useful) return useful;
  if (raw) return `WhiteBooks reply: ${raw}`;
  return `E-way bill API returned ${status} without a bill number.`;
}

function isWhiteBooksAuthSuccess(data) {
  const cd = text(data?.status_cd ?? data?.statusCd ?? data?.status);
  return cd === '1' || cd.toLowerCase() === 'success';
}

function extractAuthToken(data, responseHeaders) {
  let headerToken = '';
  responseHeaders?.forEach?.((value, key) => {
    if (headerToken) return;
    if (/auth.?token|access.?token|^token$/i.test(String(key)) && text(value).length >= 8) {
      headerToken = text(value);
    }
  });
  if (headerToken) return headerToken;
  return findJsonToken(data);
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
      if (token.length >= 8 && !looksLikeDocsBlurb(token)) return token;
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

function whitebooksHeaders(config, authtoken = '', irp = '', { includeLogin = false } = {}) {
  return {
    client_id: text(config.clientId),
    client_secret: text(config.clientSecret),
    gstin: text(config.gstin).toUpperCase(),
    ip_address: '1.1.1.1',
    ...(irp ? { irp } : {}),
    ...(includeLogin ? { username: text(config.username), password: config.password } : {}),
    ...(config.email ? { email: text(config.email) } : {}),
    ...(authtoken ? { authtoken } : {})
  };
}

/** Authenticate sends email, username, password, and irp. Generate sends email and irp only. */
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

async function authenticateWhiteBooks(origin, config, irp = '') {
  const headers = whitebooksHeaders(config, '', irp, { includeLogin: true });
  const url = `${origin}/ewaybillapi/v1.03/authenticate${whitebooksQuery(config, irp, { includeLogin: true })}`;
  let { status, data, headers: responseHeaders } = await requestJson(url, {
    method: 'GET',
    headers,
    timeoutMs: 15000
  });
  let token = extractAuthToken(data, responseHeaders);
  if (!token && !isWhiteBooksAuthSuccess(data) && (status === 404 || status === 405)) {
    ({ status, data, headers: responseHeaders } = await postJson(url, { headers, body: {}, timeoutMs: 15000 }));
    token = extractAuthToken(data, responseHeaders);
  }
  if (token) return token;
  if (isWhiteBooksAuthSuccess(data)) return '';
  throw apiError(whitebooksLoginError(data, status), 502, data);
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
  const irpHint = text(config.irp).toUpperCase();
  const irps = irpHint && /^NIC[12]$/.test(irpHint) ? [irpHint] : ['NIC1', 'NIC2'];
  let last = { status: 0, data: null };

  for (const irp of irps) {
    const authtoken = await authenticateWhiteBooks(origin, config, irp);
    const generateUrl = `${origin}/ewaybillapi/v1.03/ewayapi/genewaybill${whitebooksQuery(config, irp)}`;
    const generated = await postJson(generateUrl, {
      headers: whitebooksHeaders(config, authtoken, irp),
      body: compactEwayBody(payload),
      timeoutMs: 20000
    });
    last = generated;
    const parsed = parseEwayResult(generated.data);
    if (parsed.ewayBillNo) {
      return asGeneratedBill(parsed, generated.data, payload, config);
    }

    const wrapped = await postJson(generateUrl, {
      headers: whitebooksHeaders(config, authtoken, irp),
      body: { action: 'GENEWAYBILL', ...compactEwayBody(payload) },
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
