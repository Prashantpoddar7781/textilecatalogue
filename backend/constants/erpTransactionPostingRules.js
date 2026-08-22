/**
 * Transaction Types master (legacy AMAZE "TRANSACTION TYPES 2026-27").
 *
 * One row per voucher series: numbering series, GST document class, print form,
 * the nominal ledger it hits (Sale/Pur A/C) and the party control account.
 *
 * `partyAccountType: null` means the master leaves it blank — fall back to the
 * party's own A/C Type from the Accounts Information Manager.
 *
 * Keep in sync with constants/erpTransactionPostingRules.ts
 */

const rule = (
  series,
  seriesCode,
  gstDocumentType,
  billSuffix,
  billingForm,
  saleOrPurchaseAccount,
  partyAccountType,
  stockType = null,
  linkedSeries = null
) => ({
  series,
  seriesCode,
  gstDocumentType,
  billSuffix,
  billingForm,
  saleOrPurchaseAccount,
  partyAccountType,
  stockType,
  linkedSeries
});

export const ERP_POSTING_RULES = [
  rule('WORK DESP CHALLAN', 'O5', 'Delivery Challan for job work', null, 'CHALLAN', null, 'CREDITORS FOR EMB.JOB CHARGE', 'WORK DESP CHALLAN'),
  rule('WORK DESP RE ISSUE CHALLAN', 'O7', 'Delivery Challan for job work', 'ST', 'CHALLAN', null, 'CREDITORS FOR EMB.JOB CHARGE', 'WORK DESP RE-ISSUE'),
  rule('REVERSE CHARGE SALES TO SELF', 'OR', 'Invoices for inward supply from unregistered person', null, 'CHALLAN', null, null),
  rule('PURCHASES (ALL)', 'P', null, null, null, null, 'CREDITORS FOR GOODS'),
  rule('GREY PURCHASE', 'P1', 'Inward Invoices (All Purchases)', null, 'PURBILL', 'GREY PURCHASE', 'CREDITORS FOR GREY', 'GREY'),
  rule('VALUE ADDITION PURCHASE', 'P10', 'Inward Invoices (All Purchases)', null, 'CHALLAN', 'VALUE ADDITION PURCHASE', 'CREDITORS FOR GOODS', 'FINISH'),
  rule('SALARY EXP A/C', 'P17', null, null, 'CHALLAN', null, 'P & L EXPENSES'),
  rule('MATERIAL PURCHASE', 'P18', 'Inward Invoices (All Purchases)', null, 'CHALLAN', 'MATERIAL PURCHASE A/C', null),
  rule('FINISH PURCHASE', 'P2', 'Inward Invoices (All Purchases)', null, 'CHALLAN', 'FINISH PURCHASE', 'CREDITORS FOR GOODS', 'FINISH'),
  rule('SALES GOODS RETURN', 'P3', 'Credit Note', null, 'CHALLAN', 'SALES GOODS RETURN', 'SUNDRY DEBTORS', 'FINISH'),
  rule('PACKING MATERIAL', 'P4', 'Inward Invoices (All Purchases)', null, 'CHALLAN', 'PACKING MATERIAL PURCHASE', 'CREDITORS FOR PACKING MAT.'),
  rule('WORK REC. BILLS', 'P5', 'Inward Invoices (All Purchases)', null, 'CHALLAN', 'EMB JOB CHARGES', 'CREDITORS FOR EMB.JOB CHARGE', 'WORK DESP CHALLAN'),
  rule('BOX PURCHASES', 'P6', 'Inward Invoices (All Purchases)', null, 'CHALLAN', 'PACKING MATERIAL PURCHASE', 'CREDITORS FOR PACKING MAT.'),
  rule('WORK REC. RE ISSUE BILLS', 'P7', 'Inward Invoices (All Purchases)', null, 'CHALLAN', 'EMB JOB CHARGES', 'CREDITORS FOR EMB.JOB CHARGE', 'WORK DESP RE-ISSUE'),
  rule('CREDIT NOTE (TCS)', 'P77', null, null, 'BILLSDR', null, null),
  rule('GENERAL PURCHASES', 'P8', 'Inward Invoices (All Purchases)', null, 'CHALLAN', 'GENERAL PURCHASE', null),
  rule('CREDIT NOTE (ON SALES)', 'P91', 'Credit Note', 'C', 'CHALLAN', 'DISCOUNT A/C SALES', 'SUNDRY DEBTORS'),
  rule('CREDIT NOTE (ON PURCHASES)', 'P92', 'Credit Note (Inward)', null, 'CHALLAN', 'DISCOUNT A/C PURCHASE', null),
  rule('PURCHASE (GST INPUT SERVICES)', 'P93', 'Inward Invoices (All Purchases)', null, 'CHALLAN', 'PURCHASE (SERVICES)', null),
  rule('PURCHASE (GST CAPITAL GOODS)', 'P94', 'Inward Invoices (All Purchases)', null, 'CHALLAN', 'PURCHASE (CAPITAL GOODS)', null),
  rule('PURCHASE (GST GENERAL GOODS)', 'P95', 'Inward Invoices (All Purchases)', null, 'CHALLAN', 'PURCHASE (GENERAL GOODS)', null),
  rule('PURCHASE (COMM)', 'P99', 'Inward Invoices (All Purchases)', null, 'BILLSDR', 'COMMISSION PAYABLE A/C', 'BROKER/AGENT'),
  rule('SALES', 'S', 'Invoices for outward supply', 'SG', 'BILLS', 'SALES A/C', 'SUNDRY DEBTORS', 'FINISH', 'SALES ORDERS'),
  rule('FINISH SALES', 'S1', 'Invoices for outward supply', null, 'CHALLAN', 'SALES A/C', 'SUNDRY DEBTORS', 'FINISH'),
  rule('FINISH SALES (GST)', 'S1', 'Invoices for outward supply', null, 'CHALLAN', 'SALES A/C', 'SUNDRY DEBTORS', 'FINISH'),
  rule('FINISH SALES (EXPORT)', 'S11', 'Invoices for outward supply', 'EX', 'CHALLAN', 'EXPORT SALES A/C', 'SUNDRY DEBTORS'),
  rule('JOB BILL (SALES)', 'S12', 'Invoices for outward supply', 'JOB', 'JOBBILL', 'EMB JOB CHARGES', 'SUNDRY DEBTORS'),
  rule('GREY PURCHASE RETURN', 'S2', 'Debit Note (Inward)', null, 'CHALLAN', 'GREY PURCHASE RETURN', 'CREDITORS FOR GREY', 'GREY'),
  rule('FINISH PURCHASE RETURN', 'S3', 'Debit Note (Inward)', null, 'CHALLAN', 'FINISH PURCHASE RETURN', 'CREDITORS FOR GOODS', 'FINISH'),
  rule('CASH SALES', 'S4', 'Delivery Challan for supply on approval', 'CS', 'CHALLAN', 'SALES A/C', null, 'FINISH'),
  rule('GREY SALES', 'S5', 'Invoices for outward supply', null, 'CHALLAN', 'GREY SALES A/C', 'SUNDRY DEBTORS', 'GREY'),
  rule('FENT SALES', 'S6', 'Delivery Challan for supply on approval', 'ICS', 'CHALLAN', 'SALES A/C', null),
  rule('DEBIT NOTE (TCS)', 'S27', null, null, 'BILLSDR', null, 'SUNDRY DEBTORS'),
  rule('DEBIT NOTE (ON SALES)', 'S91', 'Debit Note', 'D', 'BILLSDR', 'DISCOUNT A/C SALES', 'SUNDRY DEBTORS'),
  rule('DEBIT NOTE (ON PURCHASES)', 'S92', 'Debit Note (Inward)', null, 'BILLSDR', 'DISCOUNT A/C PURCHASE', null),
  rule('TDS', 'T1', null, null, null, null, 'TDS'),
  rule('VAT JV', 'V1', null, null, null, null, null),
  rule('CLOSING ENTRIES (TRADING)', 'V2', null, null, null, null, null),
  rule('CLOSING ENTRIES (P & L)', 'V3', null, null, null, null, null),
  rule('VAT IV', 'V4', null, null, null, null, null),
  rule('COMMISSION JVS', 'V5', null, null, null, 'COMMISSION PAYABLE A/C', 'BROKER/AGENT'),
  rule('UNAD PAYMENT', 'XX', null, null, null, null, null),
  rule('SALES ORDERS', 'S', null, null, null, null, 'SUNDRY DEBTORS', 'FINISH')
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

export const ERP_SALE_PURCHASE_ACCOUNTS = Array.from(
  new Set(ERP_POSTING_RULES.map(row => row.saleOrPurchaseAccount).filter(Boolean))
).sort((a, b) => a.localeCompare(b));
