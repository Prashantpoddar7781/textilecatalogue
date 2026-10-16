import { isExpensePurchaseType } from '../constants/erpTransactionTypes.js';
import {
  formatSeriesBillNumber,
  getGstDocumentType,
  getItcEligibility,
  getPostingRule,
  gstDocumentSign
} from '../constants/erpTransactionPostingRules.js';
import { formatNoteNumber } from '../constants/creditDebitNoteTypes.js';
import { roundMoney } from './orderBilling.js';
import { getStateFromGstin, resolveStateKey } from './gstCalculation.js';

/**
 * One normalized shape for every GST document in the books, so GSTR-1, the
 * GSTR-3B register, the 2A/2B match and the data-entry checks all read the
 * same figures. Series behaviour (document type, sign, ITC bucket, suffix)
 * comes from the Transaction Types master.
 */

/** Official GST portal place-of-supply labels (GSTR-1 template "master" sheet). */
export const GST_POS_LABELS = {
  '01': '01-Jammu & Kashmir',
  '02': '02-Himachal Pradesh',
  '03': '03-Punjab',
  '04': '04-Chandigarh',
  '05': '05-Uttarakhand',
  '06': '06-Haryana',
  '07': '07-Delhi',
  '08': '08-Rajasthan',
  '09': '09-Uttar Pradesh',
  '10': '10-Bihar',
  '11': '11-Sikkim',
  '12': '12-Arunachal Pradesh',
  '13': '13-Nagaland',
  '14': '14-Manipur',
  '15': '15-Mizoram',
  '16': '16-Tripura',
  '17': '17-Meghalaya',
  '18': '18-Assam',
  '19': '19-West Bengal',
  '20': '20-Jharkhand',
  '21': '21-Odisha',
  '22': '22-Chhattisgarh',
  '23': '23-Madhya Pradesh',
  '24': '24-Gujarat',
  '25': '25-Daman & Diu',
  '26': '26-Dadra & Nagar Haveli & Daman & Diu',
  '27': '27-Maharashtra',
  '29': '29-Karnataka',
  '30': '30-Goa',
  '31': '31-Lakshdweep',
  '32': '32-Kerala',
  '33': '33-Tamil Nadu',
  '34': '34-Puducherry',
  '35': '35-Andaman & Nicobar Islands',
  '36': '36-Telangana',
  '37': '37-Andhra Pradesh',
  '38': '38-Ladakh',
  '97': '97-Other Territory'
};

/** GST rates the portal accepts on GSTR-1 rows. */
export const GST_STANDARD_RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40];

const GSTIN_PATTERN = /^[0-9]{2}[A-Z0-9]{10}[0-9A-Z]Z[0-9A-Z]$/;
const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const text = (value) => String(value == null ? '' : value).trim();

export function normalizeGstin(value) {
  return text(value).toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/** Format plus the GSTN check digit. */
export function isValidGstin(value) {
  const gstin = normalizeGstin(value);
  if (gstin.length !== 15 || !GSTIN_PATTERN.test(gstin)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const code = GSTIN_CHARS.indexOf(gstin[i]);
    if (code < 0) return false;
    const product = code * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  const check = GSTIN_CHARS[(36 - (sum % 36)) % 36];
  return check === gstin[14];
}

export function posLabel(code) {
  const key = text(code).padStart(2, '0').slice(-2);
  return GST_POS_LABELS[key] || '';
}

/** "24", "Gujarat", "24-Gujarat", "GJ" → "24". Blank when unknown. */
export function stateCodeOf(value) {
  const key = resolveStateKey(value);
  return /^\d{2}$/.test(key) ? key : '';
}

/** 'YYYY-MM-DD' of a stored date, read in UTC like every voucher date. */
export function dateKey(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

/** First and last day of a return month 'YYYY-MM'. */
export function monthRange(period) {
  const match = text(period).match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    period: `${match[1]}-${match[2]}`,
    fromDate: `${match[1]}-${match[2]}-01`,
    toDate: `${match[1]}-${match[2]}-${String(last).padStart(2, '0')}`
  };
}

/** Resolve the report window from ?period=YYYY-MM or ?fromDate/&toDate. */
export function resolveRange(query = {}) {
  const fromMonth = monthRange(query.period);
  if (fromMonth) return fromMonth;
  const fromDate = /^\d{4}-\d{2}-\d{2}$/.test(text(query.fromDate)) ? text(query.fromDate) : '';
  const toDate = /^\d{4}-\d{2}-\d{2}$/.test(text(query.toDate)) ? text(query.toDate) : '';
  return { period: '', fromDate, toDate };
}

export function inDateRange(key, range) {
  if (!key) return false;
  if (range.fromDate && key < range.fromDate) return false;
  if (range.toDate && key > range.toDate) return false;
  return true;
}

/** GST portal UQC for the unit typed on the bill line. */
export function uqcFor(unit) {
  const u = text(unit).toUpperCase().replace(/[^A-Z]/g, '');
  if (!u) return 'PCS-PIECES';
  if (['PCS', 'PC', 'PIECE', 'PIECES', 'NOS', 'NO', 'SAREE', 'SAREES'].includes(u)) {
    return u.startsWith('NO') ? 'NOS-NUMBERS' : 'PCS-PIECES';
  }
  if (['MTR', 'MTRS', 'MT', 'MTS', 'METER', 'METERS', 'METRE', 'METRES', 'M'].includes(u)) return 'MTR-METERS';
  if (['KG', 'KGS', 'KILO', 'KILOGRAM', 'KILOGRAMS'].includes(u)) return 'KGS-KILOGRAMS';
  if (['SET', 'SETS'].includes(u)) return 'SET-SETS';
  if (['BAG', 'BAGS'].includes(u)) return 'BAG-BAGS';
  if (['BOX', 'BOXES'].includes(u)) return 'BOX-BOX';
  if (['BDL', 'BUNDLE', 'BUNDLES'].includes(u)) return 'BDL-BUNDLES';
  if (['BALE', 'BALES', 'BAL'].includes(u)) return 'BAL-BALE';
  if (['ROL', 'ROLL', 'ROLLS'].includes(u)) return 'ROL-ROLLS';
  if (['UNT', 'UNIT', 'UNITS'].includes(u)) return 'UNT-UNITS';
  return 'OTH-OTHERS';
}

/** Quantity that matches the UQC: metres for MTR lines, pieces otherwise. */
function lineQuantity(line, uqc) {
  if (uqc === 'MTR-METERS') return Number(line.mtsQty ?? line.quantity) || 0;
  return Number(line.pcs ?? line.quantity) || 0;
}

function sumTax(lines) {
  return lines.reduce((acc, line) => ({
    taxable: roundMoney(acc.taxable + line.taxable),
    igst: roundMoney(acc.igst + line.igst),
    cgst: roundMoney(acc.cgst + line.cgst),
    sgst: roundMoney(acc.sgst + line.sgst)
  }), { taxable: 0, igst: 0, cgst: 0, sgst: 0 });
}

/** Header-taxed voucher (purchase, grey, mill, work, note) as one GST line. */
function headerLine(doc, extra = {}) {
  const taxable = roundMoney(doc.taxableAmount);
  const igst = roundMoney(doc.igstAmount);
  const cgst = roundMoney(doc.cgstAmount);
  const sgst = roundMoney(doc.sgstAmount);
  let rate = Number(doc.gstRate);
  if (!(rate > 0)) {
    const igstRate = Number(doc.igstRate) || 0;
    const split = (Number(doc.cgstRate) || 0) + (Number(doc.sgstRate) || 0);
    rate = igstRate || split;
  }
  if (!(rate > 0) && taxable > 0 && igst + cgst + sgst > 0) {
    rate = Math.round(((igst + cgst + sgst) / taxable) * 10000) / 100;
  }
  return {
    hsn: text(extra.hsn ?? doc.hsnCode),
    uqc: extra.uqc || 'UNT-UNITS',
    qty: Number(extra.qty) || 0,
    rate: Number.isFinite(rate) ? rate : 0,
    taxable,
    igst,
    cgst,
    sgst
  };
}

function salesLines(orderLines) {
  const list = Array.isArray(orderLines) ? orderLines : [];
  return list.map((line) => {
    const uqc = uqcFor(line.unit);
    const igst = roundMoney(line.igstAmount);
    const cgst = roundMoney(line.cgstAmount);
    const sgst = roundMoney(line.sgstAmount);
    let rate = Number(line.gstRate);
    if (!Number.isFinite(rate) || rate < 0) {
      rate = (Number(line.igstRate) || 0) || ((Number(line.cgstRate) || 0) + (Number(line.sgstRate) || 0));
    }
    return {
      hsn: text(line.hsnCode),
      uqc,
      qty: lineQuantity(line, uqc),
      rate: Number(rate) || 0,
      taxable: roundMoney(line.taxableAmount),
      igst,
      cgst,
      sgst,
      total: roundMoney(line.totalAmount)
    };
  });
}

function partyState({ gstin, state, station, igst, cgst, sgst, businessCode }) {
  const fromGstin = isValidGstin(gstin) ? getStateFromGstin(normalizeGstin(gstin)).stateCode : '';
  const typed = stateCodeOf(state) || stateCodeOf(station);
  const code = fromGstin || typed;
  if (code) return code;
  if (igst > 0) return '';
  if (cgst > 0 || sgst > 0) return businessCode;
  return businessCode;
}

function interStateOf(totals, posCode, businessCode) {
  if (totals.igst > 0.001) return true;
  if (totals.cgst > 0.001 || totals.sgst > 0.001) return false;
  if (!posCode || !businessCode) return false;
  return posCode !== businessCode;
}

/** GST document class from the master, for a series name. */
function documentKind(docType) {
  if (!docType) return null;
  if (docType === 'Invoices for outward supply') return 'invoice';
  if (docType === 'Credit Note') return 'credit';
  if (docType === 'Debit Note') return 'debit';
  if (docType === 'Inward Invoices (All Purchases)') return 'inward_invoice';
  if (docType === 'Invoices for inward supply from unregistered person') return 'rcm_invoice';
  if (docType === 'Credit Note (inward)') return 'inward_credit';
  if (docType === 'Debit Note (inward)') return 'inward_debit';
  if (docType.startsWith('Delivery Challan')) return 'challan';
  return null;
}

/** Counter + GST suffix, the way challans and notes are numbered ("152/L", "29/C"). */
function counterWithSuffix(transactionType, counter) {
  const body = text(counter);
  if (!body) return '';
  const suffix = getPostingRule(transactionType)?.billSuffix;
  if (!suffix) return body;
  if (body.toUpperCase().endsWith(`/${suffix.toUpperCase()}`)) return body;
  return `${body}/${suffix}`;
}

function counterValue(value) {
  const match = text(value).match(/\d+/);
  return match ? Number(match[0]) : null;
}

function purchaseEditPath(transactionType, id) {
  if (isExpensePurchaseType(transactionType)) return `/erp/expenses?edit=${id}`;
  return `/erp/purchase?edit=${id}`;
}

function noteSeries(noteKind, noteSide) {
  const kind = String(noteKind || '').toLowerCase() === 'debit' ? 'DEBIT' : 'CREDIT';
  const side = String(noteSide || '').toLowerCase() === 'purchase' ? 'PURCHASES' : 'SALES';
  return `${kind} NOTE (ON ${side})`;
}

function finishDocument(seed, businessCode) {
  const docType = getGstDocumentType(seed.transactionType);
  const kind = documentKind(docType);
  if (!kind) return null;
  const totals = sumTax(seed.lines);
  const gstin = normalizeGstin(seed.partyGstin);
  const posCode = seed.posCode || partyState({
    gstin,
    state: seed.partyState,
    station: seed.station,
    igst: totals.igst,
    cgst: totals.cgst,
    sgst: totals.sgst,
    businessCode
  });
  const tax = roundMoney(totals.igst + totals.cgst + totals.sgst);
  const invoiceValue = roundMoney(
    seed.invoiceValue != null && Number(seed.invoiceValue) > 0
      ? seed.invoiceValue
      : totals.taxable + tax
  );
  const direction = ['invoice', 'credit', 'debit'].includes(kind)
    ? 'outward'
    : kind === 'challan'
      ? 'challan'
      : 'inward';
  return {
    id: seed.id,
    source: seed.source,
    editPath: seed.editPath,
    direction,
    kind,
    docType,
    transactionType: seed.transactionType,
    sign: gstDocumentSign(seed.transactionType),
    itc: direction === 'inward' ? getItcEligibility(seed.transactionType) : null,
    date: seed.date,
    docNo: text(seed.docNo),
    counter: seed.counter ?? counterValue(seed.docNo),
    partyBillNo: text(seed.partyBillNo),
    partyName: text(seed.partyName),
    partyGstin: gstin,
    registered: gstin.length > 0,
    gstinValid: gstin ? isValidGstin(gstin) : false,
    posCode,
    pos: posLabel(posCode),
    interState: interStateOf(totals, posCode, businessCode),
    reverseCharge: false,
    status: text(seed.status) || 'posted',
    cancelled: text(seed.status).toLowerCase() === 'cancelled',
    lines: seed.lines,
    taxable: totals.taxable,
    igst: totals.igst,
    cgst: totals.cgst,
    sgst: totals.sgst,
    tax,
    invoiceValue,
    groupKey: seed.groupKey || null
  };
}

async function businessContext(prisma, userId) {
  const profile = await prisma.businessProfile.findUnique({ where: { userId } });
  const gstin = normalizeGstin(profile?.gstNumber);
  const fromGstin = isValidGstin(gstin) ? getStateFromGstin(gstin).stateCode : '';
  const businessCode = fromGstin || stateCodeOf(profile?.state) || '';
  return {
    profile,
    gstin,
    businessCode,
    companyName: text(profile?.legalName || profile?.tradeName)
  };
}

/**
 * Every GST document of the user in the window (dates are inclusive 'YYYY-MM-DD').
 * Pass { includeChallans: true } to also return delivery challans for the docs sheet,
 * and { includeCancelled: true } to keep cancelled vouchers (docs sheet counts them).
 */
export async function loadGstDocuments(prisma, userId, range = {}, options = {}) {
  const ctx = await businessContext(prisma, userId);
  const { businessCode } = ctx;
  const statusFilter = options.includeCancelled ? undefined : { not: 'cancelled' };
  const where = statusFilter ? { userId, status: statusFilter } : { userId };

  const [
    salesBills,
    notes,
    purchaseBills,
    greyPurchases,
    greyReturns,
    millReceipts,
    workReceipts,
    customers,
    suppliers
  ] = await Promise.all([
    prisma.order.findMany({
      where: { ...where, manualType: 'erp_sales' },
      select: {
        id: true, orderDate: true, createdAt: true, buyerName: true, transactionType: true,
        typeBillNumber: true, invoiceNumber: true, orderLines: true, station: true, status: true,
        customer: { select: { organizationName: true, gstNumber: true, state: true } }
      }
    }),
    prisma.creditDebitNote.findMany({
      where,
      select: {
        id: true, noteKind: true, noteSide: true, voucherNumber: true, noteNumber: true, noteDate: true,
        partyName: true, customerId: true, supplierId: true, placeOfSupply: true, hsnSac: true,
        pieces: true, quantity: true, taxableAmount: true, gstRate: true, cgstRate: true, cgstAmount: true,
        sgstRate: true, sgstAmount: true, igstRate: true, igstAmount: true, netAmount: true, status: true,
        refBillNumber: true
      }
    }),
    prisma.purchaseBill.findMany({
      where,
      select: {
        id: true, billDate: true, createdAt: true, billNumber: true, supplierBillNo: true,
        transactionType: true, typeBillNumber: true, taxableAmount: true, cgstAmount: true,
        sgstAmount: true, igstAmount: true, grandTotal: true, lineItems: true, partyGstin: true,
        station: true, status: true,
        supplier: { select: { name: true, gstNumber: true, state: true } }
      }
    }),
    prisma.greyPurchase.findMany({
      where,
      select: {
        id: true, billDate: true, createdAt: true, partyName: true, partyGstin: true, placeOfSupply: true,
        stateCode: true, billNo: true, transactionType: true, typeBillNumber: true, hsnCode: true,
        taxableAmount: true, gstRate: true, cgstRate: true, cgstAmount: true, sgstRate: true, sgstAmount: true,
        igstRate: true, igstAmount: true, netAmount: true, recMts: true, status: true,
        supplier: { select: { gstNumber: true, state: true } }
      }
    }),
    prisma.greyPurchaseReturn.findMany({
      where,
      select: {
        id: true, returnDate: true, createdAt: true, partyName: true, partyGstin: true, placeOfSupply: true,
        stateCode: true, billNo: true, challanNo: true, voucherNo: true, hsnCode: true, taxableAmount: true,
        gstRate: true, cgstRate: true, cgstAmount: true, sgstRate: true, sgstAmount: true, igstRate: true,
        igstAmount: true, netAmount: true, mts: true, status: true
      }
    }),
    prisma.millReceipt.findMany({
      where,
      select: {
        id: true, receiptDate: true, createdAt: true, millName: true, millGstin: true, placeOfSupply: true,
        stateCode: true, billNo: true, entryType: true, processType: true, voucherNo: true, hsnCode: true,
        recMts: true, taxableAmount: true, gstRate: true, cgstRate: true, cgstAmount: true, sgstRate: true,
        sgstAmount: true, igstRate: true, igstAmount: true, invoiceValue: true, status: true
      }
    }),
    prisma.workReceipt.findMany({
      where,
      select: {
        id: true, receiptDate: true, createdAt: true, partyName: true, partyGstin: true, placeOfSupply: true,
        stateCode: true, challanNo: true, billNo: true, voucherNo: true, transactionType: true, hsnCode: true,
        totalPcs: true, totalMts: true, taxableAmount: true, gstRate: true, cgstRate: true, cgstAmount: true,
        sgstRate: true, sgstAmount: true, igstRate: true, igstAmount: true, invoiceValue: true, status: true
      }
    }),
    prisma.customer.findMany({
      where: { userId },
      select: { id: true, organizationName: true, gstNumber: true, state: true }
    }),
    prisma.supplier.findMany({
      where: { userId },
      select: { id: true, name: true, gstNumber: true, state: true }
    })
  ]);

  const customerById = new Map(customers.map(row => [row.id, row]));
  const supplierById = new Map(suppliers.map(row => [row.id, row]));
  const byName = (list, field) => {
    const map = new Map();
    for (const row of list) {
      const key = text(row[field]).toUpperCase();
      if (!key) continue;
      const prev = map.get(key);
      if (!prev || (!prev.gstNumber && row.gstNumber)) map.set(key, row);
    }
    return map;
  };
  const customerByName = byName(customers, 'organizationName');
  const supplierByName = byName(suppliers, 'name');
  const supplierFor = (name) => supplierByName.get(text(name).toUpperCase()) || null;

  const docs = [];
  const add = (seed) => {
    const date = dateKey(seed.date);
    if (!inDateRange(date, range) && (range.fromDate || range.toDate)) return;
    const doc = finishDocument({ ...seed, date }, businessCode);
    if (doc) docs.push(doc);
  };

  for (const bill of salesBills) {
    const type = text(bill.transactionType);
    if (!type) continue;
    const lines = salesLines(bill.orderLines);
    const invoiceValue = roundMoney(lines.reduce((sum, line) => sum + (line.total || 0), 0));
    add({
      id: bill.id,
      source: 'sales_bill',
      editPath: `/erp/sales?edit=${bill.id}&kind=bill`,
      transactionType: type,
      date: bill.orderDate || bill.createdAt,
      docNo: formatSeriesBillNumber(type, bill.typeBillNumber) || text(bill.invoiceNumber),
      counter: bill.typeBillNumber ?? bill.invoiceNumber,
      partyName: bill.customer?.organizationName || bill.buyerName,
      partyGstin: bill.customer?.gstNumber,
      partyState: bill.customer?.state,
      station: bill.station,
      lines,
      invoiceValue,
      status: bill.status
    });
  }

  for (const note of notes) {
    const series = noteSeries(note.noteKind, note.noteSide);
    const sales = String(note.noteSide).toLowerCase() !== 'purchase';
    const party = sales
      ? (customerById.get(note.customerId) || customerByName.get(text(note.partyName).toUpperCase()))
      : (supplierById.get(note.supplierId) || supplierByName.get(text(note.partyName).toUpperCase()));
    const pieces = Number(note.pieces) || 0;
    add({
      id: note.id,
      source: 'credit_debit_note',
      editPath: `/erp/notes?edit=${note.id}`,
      transactionType: series,
      date: note.noteDate,
      docNo: /^\d+$/.test(text(note.noteNumber))
        ? counterWithSuffix(series, note.noteNumber)
        : (text(note.noteNumber) || formatNoteNumber(series, note.voucherNumber)),
      counter: note.voucherNumber ?? counterValue(note.noteNumber),
      partyBillNo: text(note.noteNumber) || text(note.refBillNumber),
      partyName: party?.organizationName || party?.name || note.partyName,
      partyGstin: party?.gstNumber,
      partyState: note.placeOfSupply || party?.state,
      lines: [headerLine(note, {
        hsn: note.hsnSac,
        uqc: pieces > 0 ? 'PCS-PIECES' : 'UNT-UNITS',
        qty: pieces > 0 ? pieces : 0
      })],
      invoiceValue: note.netAmount,
      status: note.status
    });
  }

  for (const bill of purchaseBills) {
    const type = text(bill.transactionType);
    if (!type) continue;
    const lines = salesLines(bill.lineItems);
    const fromLines = sumTax(lines);
    const headerTaxed = Math.abs((Number(bill.igstAmount) || 0) + (Number(bill.cgstAmount) || 0) + (Number(bill.sgstAmount) || 0)) > 0.001;
    const useHeader = headerTaxed || !lines.length || (Number(bill.taxableAmount) > 0 && !(fromLines.taxable > 0));
    add({
      id: bill.id,
      source: 'purchase_bill',
      editPath: purchaseEditPath(type, bill.id),
      transactionType: type,
      date: bill.billDate || bill.createdAt,
      docNo: formatSeriesBillNumber(type, bill.typeBillNumber) || text(bill.billNumber),
      counter: bill.typeBillNumber,
      partyBillNo: text(bill.supplierBillNo) || text(bill.billNumber),
      partyName: bill.supplier?.name,
      partyGstin: bill.partyGstin || bill.supplier?.gstNumber,
      partyState: bill.supplier?.state,
      station: bill.station,
      lines: useHeader
        ? [headerLine(bill, { hsn: lines[0]?.hsn || '', uqc: lines[0]?.uqc, qty: lines.reduce((s, l) => s + l.qty, 0) })]
        : lines,
      invoiceValue: bill.grandTotal,
      status: bill.status
    });
  }

  for (const bill of greyPurchases) {
    const type = text(bill.transactionType) || 'GREY PURCHASE';
    const master = bill.supplier || supplierFor(bill.partyName);
    add({
      id: bill.id,
      source: 'grey_purchase',
      editPath: `/erp/grey-purchase?edit=${bill.id}`,
      transactionType: type,
      date: bill.billDate || bill.createdAt,
      docNo: formatSeriesBillNumber(type, bill.typeBillNumber) || text(bill.billNo),
      counter: bill.typeBillNumber,
      partyBillNo: text(bill.billNo),
      partyName: bill.partyName,
      partyGstin: bill.partyGstin || master?.gstNumber,
      partyState: bill.stateCode || bill.placeOfSupply || master?.state,
      lines: [headerLine(bill, { uqc: 'MTR-METERS', qty: bill.recMts })],
      invoiceValue: bill.netAmount,
      status: bill.status
    });
  }

  for (const row of greyReturns) {
    const master = supplierFor(row.partyName);
    add({
      id: row.id,
      source: 'grey_return',
      editPath: `/erp/grey-purchase-return?edit=${row.id}`,
      transactionType: 'GREY PURCHASE RETURN',
      date: row.returnDate || row.createdAt,
      docNo: text(row.challanNo) || (row.voucherNo != null ? String(row.voucherNo) : ''),
      counter: row.voucherNo,
      partyBillNo: text(row.billNo),
      partyName: row.partyName,
      partyGstin: row.partyGstin || master?.gstNumber,
      partyState: row.stateCode || row.placeOfSupply || master?.state,
      lines: [headerLine(row, { uqc: 'MTR-METERS', qty: row.mts })],
      invoiceValue: row.netAmount,
      status: row.status
    });
  }

  for (const row of millReceipts) {
    if (text(row.processType).toUpperCase() === 'RETURN') continue;
    const type = text(row.entryType) || 'JOB WORK';
    const master = supplierFor(row.millName);
    add({
      id: row.id,
      source: 'mill_receipt',
      editPath: `/erp/mill-receipt?edit=${row.id}`,
      transactionType: type,
      date: row.receiptDate || row.createdAt,
      docNo: row.voucherNo != null ? String(row.voucherNo) : text(row.billNo),
      counter: row.voucherNo,
      partyBillNo: text(row.billNo),
      partyName: row.millName,
      partyGstin: row.millGstin || master?.gstNumber,
      partyState: row.stateCode || row.placeOfSupply || master?.state,
      lines: [headerLine(row, { uqc: 'MTR-METERS', qty: row.recMts })],
      invoiceValue: row.invoiceValue,
      status: row.status,
      // One mill bill is saved as one row per dispatch under the same voucher.
      groupKey: `mill:${text(row.millName).toUpperCase()}:${row.voucherNo ?? ''}:${text(row.billNo).toUpperCase()}`
    });
  }

  for (const row of workReceipts) {
    const type = text(row.transactionType) || 'WORK REC. BILLS';
    const master = supplierFor(row.partyName);
    const mts = Number(row.totalMts) || 0;
    add({
      id: row.id,
      source: 'work_receipt',
      editPath: `/erp/work-receipt?edit=${row.id}`,
      transactionType: type,
      date: row.receiptDate || row.createdAt,
      docNo: text(row.challanNo) || (row.voucherNo != null ? String(row.voucherNo) : ''),
      counter: row.voucherNo ?? counterValue(row.challanNo),
      partyBillNo: text(row.billNo),
      partyName: row.partyName,
      partyGstin: row.partyGstin || master?.gstNumber,
      partyState: row.stateCode || row.placeOfSupply || master?.state,
      lines: [headerLine(row, {
        uqc: mts > 0 ? 'MTR-METERS' : 'PCS-PIECES',
        qty: mts > 0 ? mts : row.totalPcs
      })],
      invoiceValue: row.invoiceValue,
      status: row.status
    });
  }

  if (options.includeChallans) {
    const [workDespatches, greyDispatches] = await Promise.all([
      prisma.workDespatch.findMany({
        where,
        select: {
          id: true, despatchDate: true, createdAt: true, transactionType: true, challanNo: true,
          partyName: true, partyGstin: true, status: true
        }
      }),
      prisma.greyDispatch.findMany({
        where,
        select: {
          id: true, dispatchDate: true, createdAt: true, transactionType: true, challanNo: true,
          millName: true, status: true
        }
      })
    ]);
    for (const row of workDespatches) {
      const type = text(row.transactionType);
      add({
        id: row.id,
        source: 'work_despatch',
        editPath: `/erp/work-despatch?edit=${row.id}`,
        transactionType: type,
        date: row.despatchDate || row.createdAt,
        docNo: counterWithSuffix(type, row.challanNo),
        counter: counterValue(row.challanNo),
        partyName: row.partyName,
        partyGstin: row.partyGstin,
        lines: [],
        status: row.status
      });
    }
    for (const row of greyDispatches) {
      // RETURN sends grey back to the weaver (purchase return), not to a mill for job work.
      if (text(row.transactionType).toUpperCase() === 'RETURN') continue;
      add({
        id: row.id,
        source: 'grey_dispatch',
        editPath: `/erp/grey-dispatch?edit=${row.id}`,
        transactionType: 'MILL DESP. CHALLAN',
        date: row.dispatchDate || row.createdAt,
        docNo: counterWithSuffix('MILL DESP. CHALLAN', row.challanNo),
        counter: counterValue(row.challanNo),
        partyName: row.millName,
        lines: [],
        status: row.status
      });
    }
  }

  docs.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const ca = Number(a.counter) || 0;
    const cb = Number(b.counter) || 0;
    if (ca !== cb) return ca - cb;
    return String(a.id).localeCompare(String(b.id));
  });

  return {
    ...ctx,
    range,
    docs,
    parties: { customers, suppliers }
  };
}
