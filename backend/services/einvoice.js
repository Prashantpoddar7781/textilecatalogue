import crypto from 'crypto';
import { getGstDocumentType } from '../constants/erpTransactionPostingRules.js';
import { resolveEwayConfig, stateCodeOf } from './ewayBill.js';

/**
 * E-invoice (IRN) for a saved GST document.
 *
 * The voucher stays the sale bill or the sales credit/debit note. The portal
 * only adds the IRN, acknowledgement and QR. Series class comes from the
 * Transaction Types master (GST document type). Credentials and sandbox /
 * production mode are the same WhiteBooks setup already used for e-way bills.
 *
 * Dummy mode never calls the portal. A dummy IRN can be removed. A sandbox or
 * live IRN stays on the document after cancel.
 */

const WHITEBOOKS_SANDBOX = 'https://apisandbox.whitebooks.in';
const WHITEBOOKS_PRODUCTION = 'https://api.whitebooks.in';
/** WhiteBooks sandbox seller, same GSTIN the e-way sandbox user is linked to. */
const SANDBOX_SELLER_GSTIN = '29AAGCB1286Q000';
/** Published WhiteBooks sandbox buyer so a B2B sample can be accepted. */
const SANDBOX_BUYER_GSTIN = '29AWGPV7107B1Z1';

const DOC_TYPES = {
  'invoices for outward supply': 'INV',
  'credit note': 'CRN',
  'debit note': 'DBN'
};

const UNIT_CODES = {
  PCS: 'PCS',
  PC: 'PCS',
  NOS: 'NOS',
  MTR: 'MTR',
  MTRS: 'MTR',
  MTS: 'MTR',
  METER: 'MTR',
  METERS: 'MTR',
  METRE: 'MTR',
  KGS: 'KGS',
  KG: 'KGS',
  BOX: 'BOX',
  BAG: 'BAG',
  SET: 'SET'
};

export const CANCEL_REASONS = [
  { value: '1', label: 'Duplicate' },
  { value: '2', label: 'Data entry mistake' },
  { value: '3', label: 'Order cancelled' },
  { value: '4', label: 'Others' }
];

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const text = (value) => String(value == null ? '' : value).trim();
const digits = (value) => text(value).replace(/\D/g, '');

export function activeIrn(record) {
  return Boolean(text(record?.einvoiceIrn)) && text(record?.einvoiceStatus) !== 'cancelled';
}

export function einvoiceDocType(transactionType) {
  const label = text(getGstDocumentType(transactionType)).toLowerCase();
  return DOC_TYPES[label] || '';
}

function nicDate(value) {
  if (!value) return '';
  const ymd = new Date(value).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '';
  const [year, month, day] = ymd.split('-');
  return `${day}/${month}/${year}`;
}

function stcd(...candidates) {
  const code = stateCodeOf(...candidates);
  return code ? String(code).padStart(2, '0') : '';
}

function pinOf(value) {
  const pin = digits(value).slice(0, 6);
  return pin.length === 6 ? Number(pin) : 0;
}

function unitOf(value) {
  const key = text(value).toUpperCase();
  return UNIT_CODES[key] || 'NOS';
}

function billedQty(line) {
  const unit = text(line.unit).toUpperCase();
  const metres = /MTS|MTR|METRE|METER/.test(unit);
  const qty = metres ? (Number(line.mtsQty) || Number(line.quantity) || 0) : (Number(line.quantity) || Number(line.pcs) || 0);
  return qty > 0 ? qty : 0;
}

export function plainDocNo(counter, fallback = '') {
  if (counter == null || counter === '') return text(fallback).slice(0, 16);
  const numeric = Number(counter);
  const body = Number.isFinite(numeric) && numeric > 0 ? String(Math.trunc(numeric)) : text(counter);
  return body.slice(0, 16);
}

/**
 * NIC schema 1.1. Totals are summed from the lines so the payload agrees
 * with itself. The bill number sent is the plain voucher printed on screen.
 */
export function buildEinvoicePayload({ doc, company, party }) {
  const docType = einvoiceDocType(doc.transactionType);
  const sellerState = stcd(company.gstin, company.state);
  const buyerState = stcd(party.gstin, party.state, party.placeOfSupply);
  const items = (doc.lines || []).map((line, index) => {
    const qty = billedQty(line) || 1;
    const assAmt = round2(line.taxableAmount);
    const unitPrice = qty > 0 ? round2(assAmt / qty) : assAmt;
    const totAmt = round2(unitPrice * qty);
    const cgst = round2(line.cgstAmount);
    const sgst = round2(line.sgstAmount);
    const igst = round2(line.igstAmount);
    const gstRt = round2((Number(line.cgstRate) || 0) + (Number(line.sgstRate) || 0) + (Number(line.igstRate) || 0));
    return {
      SlNo: String(index + 1),
      IsServc: 'N',
      PrdDesc: text(line.itemName).slice(0, 300) || 'TEXTILE GOODS',
      HsnCd: digits(line.hsnCode || doc.hsnCode).slice(0, 8),
      Qty: qty,
      Unit: unitOf(line.unit),
      UnitPrice: unitPrice,
      TotAmt: totAmt,
      Discount: round2(Math.max(0, totAmt - assAmt)),
      AssAmt: assAmt,
      GstRt: gstRt,
      IgstAmt: igst,
      CgstAmt: cgst,
      SgstAmt: sgst,
      CesRt: 0,
      CesAmt: 0,
      CesNonAdvlAmt: 0,
      StateCesRt: 0,
      StateCesAmt: 0,
      StateCesNonAdvlAmt: 0,
      OthChrg: 0,
      TotItemVal: round2(assAmt + cgst + sgst + igst)
    };
  });

  const val = items.reduce((acc, item) => ({
    AssVal: round2(acc.AssVal + item.AssAmt),
    CgstVal: round2(acc.CgstVal + item.CgstAmt),
    SgstVal: round2(acc.SgstVal + item.SgstAmt),
    IgstVal: round2(acc.IgstVal + item.IgstAmt),
    TotInvVal: round2(acc.TotInvVal + item.TotItemVal)
  }), { AssVal: 0, CgstVal: 0, SgstVal: 0, IgstVal: 0, TotInvVal: 0 });

  const payload = {
    Version: '1.1',
    TranDtls: {
      TaxSch: 'GST',
      SupTyp: 'B2B',
      RegRev: 'N',
      IgstOnIntra: 'N'
    },
    DocDtls: {
      Typ: docType,
      No: text(doc.docNo).slice(0, 16),
      Dt: nicDate(doc.docDate)
    },
    SellerDtls: {
      Gstin: text(company.gstin).toUpperCase(),
      LglNm: text(company.legalName || company.tradeName).slice(0, 100),
      TrdNm: text(company.tradeName || company.legalName).slice(0, 100),
      Addr1: text(company.addressLine1).slice(0, 100),
      Addr2: text(company.addressLine2).slice(0, 100) || undefined,
      Loc: text(company.city || company.state).slice(0, 50),
      Pin: pinOf(company.pincode),
      Stcd: sellerState
    },
    BuyerDtls: {
      Gstin: text(party.gstin).toUpperCase(),
      LglNm: text(party.tradeName).slice(0, 100),
      TrdNm: text(party.tradeName).slice(0, 100),
      Pos: buyerState,
      Addr1: text(party.addressLine1).slice(0, 100),
      Addr2: text(party.addressLine2).slice(0, 100) || undefined,
      Loc: text(party.city || party.state).slice(0, 50),
      Pin: pinOf(party.pincode),
      Stcd: buyerState
    },
    ItemList: items,
    ValDtls: {
      AssVal: val.AssVal,
      CgstVal: val.CgstVal,
      SgstVal: val.SgstVal,
      IgstVal: val.IgstVal,
      CesVal: 0,
      StCesVal: 0,
      Discount: 0,
      OthChrg: 0,
      RndOffAmt: 0,
      TotInvVal: val.TotInvVal
    }
  };

  if (doc.refNo && doc.refDate && docType !== 'INV') {
    payload.PrecDocDtls = [{ InvNo: text(doc.refNo).slice(0, 16), InvDt: nicDate(doc.refDate) }];
  }
  return payload;
}

export function validateEinvoicePayload(payload) {
  const errors = [];
  if (!['INV', 'CRN', 'DBN'].includes(payload?.DocDtls?.Typ)) {
    errors.push('This series is not a GST invoice, credit note, or debit note.');
  }
  if (!payload?.DocDtls?.No) errors.push('The bill has no voucher number.');
  if (!payload?.DocDtls?.Dt) errors.push('The bill has no date.');
  const seller = payload?.SellerDtls || {};
  const buyer = payload?.BuyerDtls || {};
  if (!/^[0-9]{2}[A-Z0-9]{13}$/i.test(text(seller.Gstin))) errors.push('Company GSTIN is missing on the company master.');
  if (!seller.LglNm) errors.push('Company name is missing.');
  if (!seller.Addr1) errors.push('Company address is missing.');
  if (!seller.Loc) errors.push('Company city is missing.');
  if (!seller.Pin) errors.push('Company pincode is missing.');
  if (!seller.Stcd) errors.push('Company state is missing.');
  if (!/^[0-9]{2}[A-Z0-9]{13}$/i.test(text(buyer.Gstin))) {
    errors.push('This party has no GSTIN, so it does not need an e-invoice.');
  }
  if (!buyer.LglNm) errors.push('Party name is missing.');
  if (!buyer.Addr1) errors.push('Party address is missing.');
  if (!buyer.Loc) errors.push('Party city or station is missing.');
  if (!buyer.Pin) errors.push('Party pincode is missing.');
  if (!buyer.Stcd) errors.push('Party state is missing.');
  if (seller.Stcd && buyer.Stcd && seller.Stcd === buyer.Stcd && Number(payload?.ValDtls?.IgstVal) > 0) {
    errors.push('Same-state supply is carrying IGST. Check the party state.');
  }
  if (seller.Stcd && buyer.Stcd && seller.Stcd !== buyer.Stcd && (Number(payload?.ValDtls?.CgstVal) > 0 || Number(payload?.ValDtls?.SgstVal) > 0)) {
    errors.push('Other-state supply is carrying CGST or SGST. Check the party state.');
  }
  const items = payload?.ItemList || [];
  if (!items.length) errors.push('The bill has no lines.');
  items.forEach((item, index) => {
    if (digits(item.HsnCd).length < 4) errors.push(`Line ${index + 1} needs an HSN of at least 4 digits.`);
    if (!(Number(item.AssAmt) > 0)) errors.push(`Line ${index + 1} has no taxable value.`);
  });
  return errors;
}

/** Dummy runs still show the payload. Missing address fields get a labelled stand-in. */
export function standInForDummy(payload) {
  const warnings = [];
  const next = JSON.parse(JSON.stringify(payload));
  const fill = (side, label) => {
    if (!next[side].Addr1) {
      next[side].Addr1 = 'ADDRESS ON FILE';
      warnings.push(`${label} address was filled only for this dummy.`);
    }
    if (!next[side].Loc) {
      next[side].Loc = 'CITY';
      warnings.push(`${label} city was filled only for this dummy.`);
    }
    if (!next[side].Pin) {
      next[side].Pin = 395003;
      warnings.push(`${label} pincode was filled only for this dummy.`);
    }
  };
  fill('SellerDtls', 'Company');
  fill('BuyerDtls', 'Party');
  if (!next.SellerDtls.Stcd) next.SellerDtls.Stcd = '24';
  if (!next.BuyerDtls.Stcd) next.BuyerDtls.Stcd = next.SellerDtls.Stcd;
  if (!next.BuyerDtls.Pos) next.BuyerDtls.Pos = next.BuyerDtls.Stcd;
  return { payload: next, warnings };
}

function sandboxPayload(payload) {
  const next = JSON.parse(JSON.stringify(payload));
  next.SellerDtls.Gstin = SANDBOX_SELLER_GSTIN;
  next.SellerDtls.Stcd = '29';
  next.SellerDtls.Pin = 560001;
  next.SellerDtls.Loc = next.SellerDtls.Loc || 'BANGALORE';
  next.SellerDtls.Addr1 = next.SellerDtls.Addr1 || 'ELECTRONIC CITY';
  next.BuyerDtls.Gstin = SANDBOX_BUYER_GSTIN;
  next.BuyerDtls.Stcd = '29';
  next.BuyerDtls.Pos = '29';
  next.BuyerDtls.Pin = 560004;
  next.BuyerDtls.Loc = next.BuyerDtls.Loc || 'BANGALORE';
  next.BuyerDtls.Addr1 = next.BuyerDtls.Addr1 || 'SANDBOX BUYER';
  const igst = Number(next.ValDtls.IgstVal) || 0;
  if (igst) {
    const half = round2(igst / 2);
    next.ValDtls.CgstVal = half;
    next.ValDtls.SgstVal = round2(igst - half);
    next.ValDtls.IgstVal = 0;
    next.ItemList = next.ItemList.map((item) => {
      const itemIgst = Number(item.IgstAmt) || 0;
      const itemHalf = round2(itemIgst / 2);
      return {
        ...item,
        CgstAmt: itemHalf,
        SgstAmt: round2(itemIgst - itemHalf),
        IgstAmt: 0,
        GstRt: round2((Number(item.GstRt) || 0))
      };
    });
  }
  return next;
}

function mockIrn(seed) {
  return crypto.createHash('sha256').update(`${seed}|${Date.now()}|${crypto.randomBytes(8).toString('hex')}`).digest('hex');
}

function mockAck() {
  return String(Date.now()).slice(-15).padStart(15, '1');
}

export function generateMockEinvoice(payload) {
  const irn = mockIrn(`${payload.DocDtls.No}|${payload.SellerDtls.Gstin}|${payload.DocDtls.Dt}`);
  const ackNo = mockAck();
  const ackDate = new Date();
  const signedQr = JSON.stringify({
    dummy: true,
    irn,
    ackNo,
    docNo: payload.DocDtls.No,
    docDt: payload.DocDtls.Dt,
    gstin: payload.SellerDtls.Gstin,
    buyer: payload.BuyerDtls.Gstin,
    value: payload.ValDtls.TotInvVal
  });
  return {
    irn,
    ackNo,
    ackDate,
    signedQr,
    raw: { dummy: true, irn, ackNo, ackDate: ackDate.toISOString() }
  };
}

function apiError(message, status = 502, details) {
  const error = new Error(message);
  error.status = status;
  error.details = details;
  return error;
}

async function requestJson(url, { method = 'GET', headers, body, timeoutMs = 20000 }) {
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

function originOf(config) {
  if (config.mode === 'production') return WHITEBOOKS_PRODUCTION;
  return WHITEBOOKS_SANDBOX;
}

function headersOf(config, token = '') {
  return {
    client_id: text(config.clientId),
    client_secret: text(config.clientSecret),
    gstin: text(config.gstin).toUpperCase(),
    ip_address: '0.0.0.0',
    username: text(config.username),
    user_name: text(config.username),
    ...(token ? { authtoken: token } : {})
  };
}

function unwrapData(data) {
  if (!data) return null;
  if (typeof data.data === 'string') {
    try {
      return JSON.parse(data.data);
    } catch {
      return { raw: data.data };
    }
  }
  if (data.data && typeof data.data === 'object') return data.data;
  return data;
}

async function authenticate(config) {
  const origin = originOf(config);
  const params = new URLSearchParams();
  if (config.email) params.set('email', text(config.email));
  if (config.username) params.set('username', text(config.username));
  if (config.password) params.set('password', config.password);
  const response = await requestJson(`${origin}/einvoice/authenticate?${params}`, {
    headers: headersOf(config)
  });
  const body = unwrapData(response.data) || {};
  const token = text(body.AuthToken || body.authToken || response.data?.AuthToken);
  if (!token) {
    throw apiError(text(response.data?.status_desc || response.data?.error || 'WhiteBooks e-invoice login failed.'), 502, response.data);
  }
  return token;
}

function readIrn(data) {
  const body = unwrapData(data) || {};
  return {
    irn: text(body.Irn || body.irn),
    ackNo: text(body.AckNo || body.ackNo),
    ackDate: body.AckDt || body.AckDate || null,
    signedQr: text(body.SignedQRCode || body.signedQr),
    ewayBillNo: text(body.EwbNo || body.ewayBillNo),
    ewayBillDate: body.EwbDt || null,
    ewayValidUpto: body.EwbValidTill || null,
    body
  };
}

function parseNicDate(value) {
  const raw = text(value);
  if (!raw) return new Date();
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
  if (match) {
    const [, day, month, year, hour = '0', minute = '0', second = '0'] = match;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) - 5, Number(minute) - 30, Number(second)));
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function requireCredentials(config) {
  const missing = ['clientId', 'clientSecret', 'gstin', 'username', 'password'].filter((key) => !config[key]);
  if (missing.length) {
    throw apiError(
      `E-invoice is set to ${config.mode} but these WhiteBooks credentials are missing: ${missing.join(', ')}.`,
      400
    );
  }
}

async function postPortal(config, action, body) {
  requireCredentials(config);
  const apiConfig = config.mode === 'sandbox' ? { ...config, gstin: SANDBOX_SELLER_GSTIN } : config;
  const token = await authenticate(apiConfig);
  const origin = originOf(apiConfig);
  const params = new URLSearchParams();
  if (apiConfig.email) params.set('email', text(apiConfig.email));
  const response = await requestJson(`${origin}/einvoice/type/${action}/version/V1_03?${params}`, {
    method: 'POST',
    headers: headersOf(apiConfig, token),
    body
  });
  const parsed = readIrn(response.data);
  if (!response.ok || (action === 'GENERATE' && !parsed.irn) || (action === 'GENERATE_EWAYBILL' && !parsed.ewayBillNo && !parsed.irn)) {
    const message = text(response.data?.status_desc || response.data?.error?.message || response.data?.message)
      || 'The e-invoice portal did not accept this document.';
    throw apiError(message, 502, response.data);
  }
  return { ...parsed, raw: response.data };
}

export async function generateEinvoice(payload, config, { dummy = false } = {}) {
  if (dummy || config.mode === 'mock') return generateMockEinvoice(payload);
  const requestPayload = config.mode === 'sandbox' ? sandboxPayload(payload) : payload;
  const generated = await postPortal(config, 'GENERATE', requestPayload);
  return {
    irn: generated.irn,
    ackNo: generated.ackNo,
    ackDate: parseNicDate(generated.ackDate),
    signedQr: generated.signedQr,
    raw: generated.raw
  };
}

export function withinCancelWindow(ackDate) {
  if (!ackDate) return false;
  const ack = new Date(ackDate).getTime();
  if (Number.isNaN(ack)) return false;
  return Date.now() - ack <= 24 * 60 * 60 * 1000;
}

export async function cancelEinvoice(record, config, { reason, remark }) {
  const reasonCode = CANCEL_REASONS.some(row => row.value === String(reason)) ? String(reason) : '';
  if (!reasonCode) throw apiError('Choose a cancel reason.', 400);
  if (!text(remark)) throw apiError('Add a short remark for the cancellation.', 400);
  if (!withinCancelWindow(record.einvoiceAckDate)) {
    throw apiError('An IRN can be cancelled only within 24 hours of the acknowledgement.', 400);
  }
  if (record.einvoiceMode === 'mock' || config.mode === 'mock') {
    return { removed: true, raw: { dummy: true, cancelled: true } };
  }
  const result = await postPortal(config, 'CANCEL', {
    Irn: record.einvoiceIrn,
    CnlRsn: reasonCode,
    CnlRem: text(remark).slice(0, 100)
  });
  return { removed: false, raw: result.raw };
}

export function ewayBodyFromIrn(irn, transport) {
  const distance = Math.max(0, Math.round(Number(transport.distance) || 0));
  return {
    Irn: irn,
    Distance: distance || 0,
    TransMode: text(transport.transMode) || '1',
    TransId: text(transport.transporterId).toUpperCase(),
    TransName: text(transport.transporterName).slice(0, 100),
    TransDocNo: text(transport.transDocNo).slice(0, 16),
    TransDocDt: transport.transDocDate ? nicDate(transport.transDocDate) : undefined,
    VehNo: text(transport.vehicleNo).toUpperCase().replace(/[^A-Z0-9]/g, ''),
    VehType: text(transport.vehicleType) || 'R'
  };
}

export async function generateEwayFromIrn(record, transport, config) {
  if (!activeIrn(record)) throw apiError('Generate the e-invoice before the e-way bill for this invoice.', 400);
  if (record.einvoiceMode === 'mock' || config.mode === 'mock') {
    const generatedAt = new Date();
    return {
      ewayBillNo: String(Math.floor(100000000000 + Math.random() * 899999999999)),
      ewayBillDate: generatedAt,
      validUpto: new Date(generatedAt.getTime() + 24 * 60 * 60 * 1000),
      alert: 'Dummy e-way number from the dummy IRN. Nothing was filed.',
      raw: { dummy: true }
    };
  }
  const generated = await postPortal(config, 'GENERATE_EWAYBILL', ewayBodyFromIrn(record.einvoiceIrn, transport));
  return {
    ewayBillNo: generated.ewayBillNo,
    ewayBillDate: parseNicDate(generated.ewayBillDate),
    validUpto: generated.ewayValidUpto ? parseNicDate(generated.ewayValidUpto) : null,
    alert: config.mode === 'sandbox' ? 'Sandbox e-way from the IRN. Nothing was filed with NIC.' : '',
    raw: generated.raw
  };
}

export function resolveEinvoiceConfig(profile) {
  return resolveEwayConfig(profile);
}

export function stampFromResult(result, mode) {
  return {
    einvoiceIrn: result.irn,
    einvoiceAckNo: result.ackNo || null,
    einvoiceAckDate: result.ackDate || new Date(),
    einvoiceSignedQr: result.signedQr || null,
    einvoiceStatus: 'generated',
    einvoiceMode: mode,
    einvoiceCancelReason: null,
    einvoiceRaw: result.raw ?? undefined
  };
}

export function publicEinvoice(record) {
  if (!record?.einvoiceIrn) return null;
  return {
    irn: record.einvoiceIrn,
    ackNo: record.einvoiceAckNo,
    ackDate: record.einvoiceAckDate,
    signedQr: record.einvoiceSignedQr,
    status: record.einvoiceStatus,
    mode: record.einvoiceMode,
    cancelReason: record.einvoiceCancelReason
  };
}
