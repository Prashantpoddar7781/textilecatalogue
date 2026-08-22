/**
 * Transaction Types master (legacy AMAZE "TRANSACTION TYPES 2026-27"), all 53 series.
 *
 * One row per voucher series: numbering series, GST document class, print form,
 * the nominal ledger it hits (Sale/Pur A/C), the party control account, and the
 * stock ledger it moves.
 *
 * `partyAccountType: null` means the master leaves it blank — fall back to the
 * party's own A/C Type from the Accounts Information Manager.
 *
 * Keep in sync with constants/erpTransactionPostingRules.ts
 */

const rule = (seed) => ({
  gstDocumentType: null,
  billSuffix: null,
  billingForm: null,
  saleOrPurchaseAccount: null,
  partyAccountType: null,
  stockType: null,
  linkedSeries: null,
  billingAll: false,
  singleRef: false,
  ...seed
});

const INWARD = 'Inward Invoices (All Purchases)';
const OUTWARD = 'Invoices for outward supply';
const JOB_CHALLAN = 'Delivery Challan for job work';
const APPROVAL_CHALLAN = 'Delivery Challan for supply on approval';

export const ERP_POSTING_RULES = [
  // Ledger-only vouchers: no GST document, no print form, no stock movement.
  rule({ series: 'OPENING BALANCE', seriesCode: '00', saleOrPurchaseAccount: 'OPENING BALANCE', stockType: 'FINISH' }),
  rule({ series: 'BANK RECEIPT', seriesCode: 'B1' }),
  rule({ series: 'BANK PAYMENT', seriesCode: 'B2' }),
  rule({ series: 'CASH RECEIPT', seriesCode: 'C1' }),
  rule({ series: 'CASH PAYMENT', seriesCode: 'C2' }),
  rule({ series: 'EXPENSES', seriesCode: 'E1' }),
  rule({ series: 'JOB WORK', seriesCode: 'J1' }),
  rule({
    series: 'JOURNAL',
    seriesCode: 'J2',
    gstDocumentType: INWARD,
    billingForm: 'JOBBILL',
    saleOrPurchaseAccount: 'JOB CHARGES',
    partyAccountType: 'CREDITORS FOR DYEING JOB CHARG',
    billingAll: true,
    singleRef: true
  }),
  rule({ series: 'WORK DESP ALL', seriesCode: 'O' }),
  rule({
    series: 'SALES ORDERS',
    seriesCode: 'O1',
    gstDocumentType: 'Sales Orders',
    billingForm: 'CHALLAN',
    partyAccountType: 'SUNDRY DEBTORS',
    billingAll: true
  }),
  rule({
    series: 'MILL REC.CHALLAN',
    seriesCode: 'O3',
    gstDocumentType: INWARD,
    billingForm: 'CHALLAN',
    partyAccountType: 'CREDITORS FOR DYEING JOB CHARG',
    billingAll: true
  }),
  rule({ series: 'STOCK TRANSFER', seriesCode: 'O4', billingForm: 'STOCKTFR', billingAll: true }),
  rule({
    series: 'WORK DESP CHALLAN',
    seriesCode: 'O5',
    gstDocumentType: JOB_CHALLAN,
    billingForm: 'CHALLAN',
    partyAccountType: 'CREDITORS FOR EMB.JOB CHARGE',
    stockType: 'WORK DESP CHALLAN',
    billingAll: true
  }),
  rule({
    series: 'WORK DESP RE ISSUE CHALLAN',
    seriesCode: 'O7',
    gstDocumentType: JOB_CHALLAN,
    billSuffix: 'ST',
    billingForm: 'CHALLAN',
    partyAccountType: 'CREDITORS FOR EMB.JOB CHARGE',
    stockType: 'WORK DESP RE-ISSUE',
    billingAll: true
  }),
  rule({
    series: 'REVERSE CHARGE SALES TO SELF',
    seriesCode: 'OR',
    gstDocumentType: 'Invoices for inward supply from unregistered person',
    billingForm: 'CHALLAN',
    billingAll: true
  }),
  rule({ series: 'PURCHASES (ALL)', seriesCode: 'P', partyAccountType: 'CREDITORS FOR GREY' }),
  rule({
    series: 'GREY PURCHASE',
    seriesCode: 'P1',
    gstDocumentType: INWARD,
    billingForm: 'PURBILL',
    saleOrPurchaseAccount: 'GREY PURCHASE',
    partyAccountType: 'CREDITORS FOR GREY',
    stockType: 'GREY',
    billingAll: true,
    singleRef: true
  }),
  rule({
    series: 'VALUE ADDITION PURCHASE',
    seriesCode: 'P10',
    gstDocumentType: INWARD,
    billingForm: 'CHALLAN',
    saleOrPurchaseAccount: 'VALUE ADDITION PURCHASE',
    partyAccountType: 'CREDITORS FOR GOODS',
    stockType: 'FINISH',
    billingAll: true,
    singleRef: true
  }),
  rule({
    series: 'SALARY EXP A/C',
    seriesCode: 'P12',
    billingForm: 'CHALLAN',
    partyAccountType: 'P & L EXPENSES',
    billingAll: true
  }),
  rule({
    series: 'MATERIAL PURCHASE',
    seriesCode: 'P18',
    gstDocumentType: INWARD,
    billingForm: 'CHALLAN',
    saleOrPurchaseAccount: 'MATERIAL PURCHASE A/C',
    billingAll: true,
    singleRef: true
  }),
  rule({
    series: 'FINISH PURCHASE',
    seriesCode: 'P2',
    gstDocumentType: INWARD,
    billingForm: 'CHALLAN',
    saleOrPurchaseAccount: 'FINISH PURCHASE',
    partyAccountType: 'CREDITORS FOR GOODS',
    stockType: 'FINISH',
    billingAll: true,
    singleRef: true
  }),
  rule({
    series: 'SALES GOODS RETURN',
    seriesCode: 'P3',
    gstDocumentType: 'Credit Note',
    billingForm: 'CHALLAN',
    saleOrPurchaseAccount: 'SALES GOODS RETURN',
    partyAccountType: 'SUNDRY DEBTORS',
    stockType: 'FINISH',
    billingAll: true,
    singleRef: true
  }),
  rule({
    series: 'PACKING MATERIAL',
    seriesCode: 'P4',
    gstDocumentType: INWARD,
    billingForm: 'CHALLAN',
    saleOrPurchaseAccount: 'PACKING MATERIAL PURCHASE',
    partyAccountType: 'CREDITORS FOR PACKING MAT.',
    billingAll: true,
    singleRef: true
  }),
  rule({
    series: 'WORK REC. BILLS',
    seriesCode: 'P5',
    gstDocumentType: INWARD,
    billingForm: 'CHALLAN',
    saleOrPurchaseAccount: 'EMB JOB CHARGES',
    partyAccountType: 'CREDITORS FOR EMB.JOB CHARGE',
    stockType: 'WORK DESP CHALLAN',
    billingAll: true,
    singleRef: true
  }),
  rule({
    series: 'BOX PURCHASES',
    seriesCode: 'P6',
    gstDocumentType: INWARD,
    billingForm: 'CHALLAN',
    saleOrPurchaseAccount: 'PACKING MATERIAL PURCHASE',
    partyAccountType: 'CREDITORS FOR PACKING MAT.',
    billingAll: true,
    singleRef: true
  }),
  rule({
    series: 'WORK REC. RE ISSUE BILLS',
    seriesCode: 'P7',
    gstDocumentType: INWARD,
    billingForm: 'CHALLAN',
    saleOrPurchaseAccount: 'EMB JOB CHARGES',
    partyAccountType: 'CREDITORS FOR EMB.JOB CHARGE',
    stockType: 'WORK DESP RE-ISSUE',
    billingAll: true,
    singleRef: true
  }),
  rule({ series: 'CREDIT NOTE (TCS)', seriesCode: 'P77', billingForm: 'BILLSDR', singleRef: true }),
  rule({
    series: 'GENERAL PURCHASES',
    seriesCode: 'P8',
    gstDocumentType: INWARD,
    billingForm: 'CHALLAN',
    saleOrPurchaseAccount: 'GENERAL PURCHASE',
    billingAll: true
  }),
  rule({
    series: 'CREDIT NOTE (ON SALES)',
    seriesCode: 'P91',
    gstDocumentType: 'Credit Note',
    billSuffix: 'C',
    billingForm: 'CHALLAN',
    saleOrPurchaseAccount: 'DISCOUNT A/C SALES',
    partyAccountType: 'SUNDRY DEBTORS',
    billingAll: true
  }),
  rule({
    series: 'CREDIT NOTE (ON PURCHASES)',
    seriesCode: 'P92',
    gstDocumentType: 'Credit Note (Inward)',
    billingForm: 'BILLSDR',
    saleOrPurchaseAccount: 'DISCOUNT A/C PURCHASE',
    billingAll: true
  }),
  rule({
    series: 'PURCHASE (GST INPUT SERVICES)',
    seriesCode: 'P93',
    gstDocumentType: INWARD,
    billingForm: 'CHALLAN',
    saleOrPurchaseAccount: 'PURCHASE (SERVICES)',
    billingAll: true
  }),
  rule({
    series: 'PURCHASE (GST CAPITAL GOODS)',
    seriesCode: 'P94',
    gstDocumentType: INWARD,
    billingForm: 'CHALLAN',
    saleOrPurchaseAccount: 'PURCHASE (CAPITAL GOODS)',
    billingAll: true
  }),
  rule({
    series: 'PURCHASE (GST GENERAL GOODS)',
    seriesCode: 'P95',
    gstDocumentType: INWARD,
    billingForm: 'CHALLAN',
    saleOrPurchaseAccount: 'PURCHASE (GENERAL GOODS)',
    billingAll: true
  }),
  rule({
    series: 'PURCHASE (COMM)',
    seriesCode: 'P99',
    gstDocumentType: INWARD,
    billingForm: 'BILLSDR',
    saleOrPurchaseAccount: 'COMMISSION PAYABLE A/C',
    partyAccountType: 'BROKER/AGENT',
    billingAll: true
  }),
  rule({
    series: 'SALES',
    seriesCode: 'S',
    gstDocumentType: OUTWARD,
    billSuffix: 'SG',
    billingForm: 'BILLS',
    saleOrPurchaseAccount: 'SALES A/C',
    partyAccountType: 'SUNDRY DEBTORS',
    stockType: 'FINISH',
    linkedSeries: 'SALES ORDERS',
    billingAll: true
  }),
  rule({
    series: 'FINISH SALES',
    seriesCode: 'S1',
    gstDocumentType: OUTWARD,
    billingForm: 'CHALLAN',
    saleOrPurchaseAccount: 'SALES A/C',
    partyAccountType: 'SUNDRY DEBTORS',
    stockType: 'FINISH',
    billingAll: true
  }),
  // Alias used by our sales screen; same posting as FINISH SALES.
  rule({
    series: 'FINISH SALES (GST)',
    seriesCode: 'S1',
    gstDocumentType: OUTWARD,
    billingForm: 'CHALLAN',
    saleOrPurchaseAccount: 'SALES A/C',
    partyAccountType: 'SUNDRY DEBTORS',
    stockType: 'FINISH',
    billingAll: true
  }),
  rule({
    series: 'FINISH SALES (EXPORT)',
    seriesCode: 'S11',
    gstDocumentType: OUTWARD,
    billSuffix: 'EX',
    billingForm: 'CHALLAN',
    saleOrPurchaseAccount: 'EXPORT SALES A/C',
    partyAccountType: 'SUNDRY DEBTORS',
    stockType: 'FINISH',
    billingAll: true
  }),
  rule({
    series: 'JOB BILL (SALES)',
    seriesCode: 'S12',
    gstDocumentType: OUTWARD,
    billSuffix: 'JOB',
    billingForm: 'CHALLAN',
    saleOrPurchaseAccount: 'EMB JOB CHARGES',
    partyAccountType: 'SUNDRY DEBTORS',
    billingAll: true
  }),
  rule({
    series: 'GREY PURCHASE RETURN',
    seriesCode: 'S2',
    gstDocumentType: 'Debit Note (Inward)',
    billingForm: 'CHALLAN',
    saleOrPurchaseAccount: 'GREY PURCHASE RETURN',
    partyAccountType: 'CREDITORS FOR GREY',
    stockType: 'GREY',
    billingAll: true
  }),
  rule({
    series: 'FINISH PURCHASE RETURN',
    seriesCode: 'S3',
    gstDocumentType: 'Debit Note (Inward)',
    billingForm: 'CHALLAN',
    saleOrPurchaseAccount: 'FINISH PURCHASE RETURN',
    partyAccountType: 'CREDITORS FOR GOODS',
    stockType: 'FINISH',
    billingAll: true
  }),
  rule({
    series: 'CASH SALES',
    seriesCode: 'S4',
    gstDocumentType: APPROVAL_CHALLAN,
    billSuffix: 'CS',
    billingForm: 'CHALLAN',
    saleOrPurchaseAccount: 'SALES A/C',
    stockType: 'FINISH',
    billingAll: true
  }),
  rule({
    series: 'GREY SALES',
    seriesCode: 'S5',
    gstDocumentType: OUTWARD,
    billingForm: 'CHALLAN',
    saleOrPurchaseAccount: 'GREY SALES A/C',
    partyAccountType: 'SUNDRY DEBTORS',
    stockType: 'GREY',
    billingAll: true
  }),
  rule({
    series: 'FENT SALES',
    seriesCode: 'S6',
    gstDocumentType: APPROVAL_CHALLAN,
    billSuffix: 'ICS',
    billingForm: 'CHALLAN',
    saleOrPurchaseAccount: 'SALES A/C',
    billingAll: true
  }),
  rule({
    series: 'DEBIT NOTE (TCS)',
    seriesCode: 'S77',
    billingForm: 'BILLSDR',
    partyAccountType: 'SUNDRY DEBTORS'
  }),
  rule({
    series: 'DEBIT NOTE (ON SALES)',
    seriesCode: 'S91',
    gstDocumentType: 'Debit Note',
    billSuffix: 'D',
    billingForm: 'BILLSDR',
    saleOrPurchaseAccount: 'DISCOUNT A/C SALES',
    partyAccountType: 'SUNDRY DEBTORS',
    billingAll: true
  }),
  rule({
    series: 'DEBIT NOTE (ON PURCHASES)',
    seriesCode: 'S92',
    gstDocumentType: 'Debit Note (Inward)',
    billingForm: 'BILLSDR',
    saleOrPurchaseAccount: 'DISCOUNT A/C PURCHASE',
    billingAll: true
  }),
  rule({ series: 'TDS', seriesCode: 'T1', billingForm: 'JOBBILL' }),
  rule({ series: 'VAT JV', seriesCode: 'V1' }),
  rule({ series: 'CLOSING ENTRIES (TRADING)', seriesCode: 'V2' }),
  rule({ series: 'CLOSING ENTRIES (P & L)', seriesCode: 'V3' }),
  rule({ series: 'VAT IV', seriesCode: 'V4' }),
  rule({
    series: 'COMMISSION JVS',
    seriesCode: 'V5',
    saleOrPurchaseAccount: 'COMMISSION PAYABLE A/C',
    partyAccountType: 'BROKER/AGENT'
  }),
  rule({ series: 'UNAD PAYMENT', seriesCode: 'XX' })
];

const RULE_BY_SERIES = new Map(ERP_POSTING_RULES.map(row => [row.series.toUpperCase(), row]));

function fallbackRule(upper) {
  if (upper.includes('WORK DESP')) {
    return RULE_BY_SERIES.get(upper.includes('RE ISSUE') || upper.includes('RE-ISSUE')
      ? 'WORK DESP RE ISSUE CHALLAN'
      : 'WORK DESP CHALLAN');
  }
  if (upper.includes('WORK REC')) {
    return RULE_BY_SERIES.get(upper.includes('RE ISSUE') || upper.includes('RE-ISSUE')
      ? 'WORK REC. RE ISSUE BILLS'
      : 'WORK REC. BILLS');
  }
  if (upper.includes('MILL REC')) return RULE_BY_SERIES.get('MILL REC.CHALLAN');
  if (upper.startsWith('CREDIT_NOTE_SALES')) return RULE_BY_SERIES.get('CREDIT NOTE (ON SALES)');
  if (upper.startsWith('CREDIT_NOTE_PURCHASE')) return RULE_BY_SERIES.get('CREDIT NOTE (ON PURCHASES)');
  if (upper.startsWith('DEBIT_NOTE_SALES')) return RULE_BY_SERIES.get('DEBIT NOTE (ON SALES)');
  if (upper.startsWith('DEBIT_NOTE_PURCHASE')) return RULE_BY_SERIES.get('DEBIT NOTE (ON PURCHASES)');
  return undefined;
}

export function getPostingRule(transactionType) {
  const upper = String(transactionType || '').trim().toUpperCase();
  if (!upper) return undefined;
  return RULE_BY_SERIES.get(upper) || fallbackRule(upper);
}

export function postingPartyAccountType(transactionType, fallback = null) {
  return getPostingRule(transactionType)?.partyAccountType || fallback;
}

export function postingSaleOrPurchaseAccount(transactionType) {
  return getPostingRule(transactionType)?.saleOrPurchaseAccount || null;
}

export function getGstDocumentType(transactionType) {
  return getPostingRule(transactionType)?.gstDocumentType || null;
}

export function getStockType(transactionType) {
  return getPostingRule(transactionType)?.stockType || null;
}

/** True when one bill may draw on several pending reference documents. */
export function allowsBillingAll(transactionType) {
  return getPostingRule(transactionType)?.billingAll === true;
}

/** True when the series bills exactly one reference document at a time. */
export function requiresSingleReference(transactionType) {
  return getPostingRule(transactionType)?.singleRef === true;
}

const GSTR1_DOCUMENTS = new Set([
  'Invoices for outward supply',
  'Credit Note',
  'Debit Note'
]);

const GSTR2_DOCUMENTS = new Set([
  'Inward Invoices (All Purchases)',
  'Invoices for inward supply from unregistered person',
  'Credit Note (Inward)',
  'Debit Note (Inward)'
]);

export function gstReturnSection(transactionType) {
  const doc = getGstDocumentType(transactionType);
  if (!doc) return 'NONE';
  if (GSTR1_DOCUMENTS.has(doc)) return 'GSTR-1';
  if (GSTR2_DOCUMENTS.has(doc)) return 'GSTR-2';
  return 'NONE';
}

export function isDeliveryChallanDocument(transactionType) {
  const doc = getGstDocumentType(transactionType);
  return Boolean(doc && doc.startsWith('Delivery Challan'));
}

/** Display-only document number: series code, optional GST suffix, padded counter. */
export function formatSeriesBillNumber(transactionType, counter, pad = 4) {
  if (counter == null || counter === '') return '';
  const numeric = Number(counter);
  const body = Number.isFinite(numeric) && numeric > 0
    ? String(Math.trunc(numeric)).padStart(pad, '0')
    : String(counter);
  const found = getPostingRule(transactionType);
  if (!found) return body;
  return [found.seriesCode, found.billSuffix, body].filter(Boolean).join('/');
}

/** One-line "where does this entry land" summary. */
export function postingSummary(transactionType) {
  const found = getPostingRule(transactionType);
  if (!found) return '—';
  const parts = [
    found.saleOrPurchaseAccount,
    found.partyAccountType,
    found.stockType ? `Stock: ${found.stockType}` : null
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : '—';
}

export const ERP_SALE_PURCHASE_ACCOUNTS = Array.from(
  new Set(ERP_POSTING_RULES.map(row => row.saleOrPurchaseAccount).filter(Boolean))
).sort((a, b) => a.localeCompare(b));
