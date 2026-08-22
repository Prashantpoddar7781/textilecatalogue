/**
 * Transaction Types master (legacy AMAZE "TRANSACTION TYPES 2026-27").
 *
 * One row per voucher series. Each row is the complete posting rule for that
 * document: its numbering series, GST document class, print form, the nominal
 * ledger it hits (Sale/Pur A/C) and the party control account it credits/debits.
 *
 * `partyAccountType: null` means the master leaves it blank — fall back to the
 * party's own A/C Type from the Accounts Information Manager.
 */

export type ErpBillingForm = 'CHALLAN' | 'PURBILL' | 'BILLS' | 'BILLSDR' | 'JOBBILL';

export type ErpStockType = 'GREY' | 'FINISH' | 'WORK DESP CHALLAN' | 'WORK DESP RE-ISSUE';

export type ErpGstDocumentType =
  | 'Inward Invoices (All Purchases)'
  | 'Invoices for outward supply'
  | 'Invoices for inward supply from unregistered person'
  | 'Credit Note'
  | 'Credit Note (Inward)'
  | 'Debit Note'
  | 'Debit Note (Inward)'
  | 'Delivery Challan for job work'
  | 'Delivery Challan for supply on approval';

/** Which GST return the document feeds. Delivery challans carry no tax liability. */
export type ErpGstReturnSection = 'GSTR-1' | 'GSTR-2' | 'NONE';

export interface ErpPostingRule {
  /** SERIES NAME — matches the transaction type stored on the voucher. */
  series: string;
  /** SERIES CODE — numbering prefix (P1, S11, O5 …). */
  seriesCode: string;
  gstDocumentType: ErpGstDocumentType | null;
  /** GST → ALPHABET ADD (SUFFIX) IN BILL NO. */
  billSuffix: string | null;
  billingForm: ErpBillingForm | null;
  /** BILLING SALE/PUR A/C — the nominal ledger this series posts to. */
  saleOrPurchaseAccount: string | null;
  /** BILLING A/C TYPE — party-side control account. */
  partyAccountType: string | null;
  stockType: ErpStockType | null;
  /** NO. SERIES — linked document series (e.g. sales bills pull from sales orders). */
  linkedSeries: string | null;
}

const rule = (
  series: string,
  seriesCode: string,
  gstDocumentType: ErpGstDocumentType | null,
  billSuffix: string | null,
  billingForm: ErpBillingForm | null,
  saleOrPurchaseAccount: string | null,
  partyAccountType: string | null,
  stockType: ErpStockType | null = null,
  linkedSeries: string | null = null
): ErpPostingRule => ({
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

export const ERP_POSTING_RULES: ErpPostingRule[] = [
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

const RULE_BY_SERIES = new Map<string, ErpPostingRule>(
  ERP_POSTING_RULES.map(row => [row.series.toUpperCase(), row])
);

/**
 * Work despatch / work receipt exist as many named variants (suit, lace, poonam …)
 * that all share the same posting rule as their base series.
 */
function fallbackRule(upper: string): ErpPostingRule | undefined {
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

export function getPostingRule(transactionType?: string | null): ErpPostingRule | undefined {
  const upper = String(transactionType || '').trim().toUpperCase();
  if (!upper) return undefined;
  return RULE_BY_SERIES.get(upper) || fallbackRule(upper);
}

/** Party control account for this series, or the caller's fallback when the master is blank. */
export function postingPartyAccountType(
  transactionType?: string | null,
  fallback: string | null = null
): string | null {
  return getPostingRule(transactionType)?.partyAccountType || fallback;
}

/** Nominal Sale/Pur ledger for this series. */
export function postingSaleOrPurchaseAccount(transactionType?: string | null): string | null {
  return getPostingRule(transactionType)?.saleOrPurchaseAccount || null;
}

export function getGstDocumentType(transactionType?: string | null): ErpGstDocumentType | null {
  return getPostingRule(transactionType)?.gstDocumentType || null;
}

export function getStockType(transactionType?: string | null): ErpStockType | null {
  return getPostingRule(transactionType)?.stockType || null;
}

const GSTR1_DOCUMENTS = new Set<string>([
  'Invoices for outward supply',
  'Credit Note',
  'Debit Note'
]);

const GSTR2_DOCUMENTS = new Set<string>([
  'Inward Invoices (All Purchases)',
  'Invoices for inward supply from unregistered person',
  'Credit Note (Inward)',
  'Debit Note (Inward)'
]);

export function gstReturnSection(transactionType?: string | null): ErpGstReturnSection {
  const doc = getGstDocumentType(transactionType);
  if (!doc) return 'NONE';
  if (GSTR1_DOCUMENTS.has(doc)) return 'GSTR-1';
  if (GSTR2_DOCUMENTS.has(doc)) return 'GSTR-2';
  return 'NONE';
}

/** Delivery challans move goods without creating a tax liability. */
export function isDeliveryChallanDocument(transactionType?: string | null): boolean {
  const doc = getGstDocumentType(transactionType);
  return Boolean(doc && doc.startsWith('Delivery Challan'));
}

/**
 * Document number as printed: series code, optional GST suffix, padded counter.
 * The stored counter is untouched — this is display formatting only.
 */
export function formatSeriesBillNumber(
  transactionType?: string | null,
  counter?: number | string | null,
  pad = 4
): string {
  if (counter == null || counter === '') return '';
  const numeric = Number(counter);
  const body = Number.isFinite(numeric) && numeric > 0
    ? String(Math.trunc(numeric)).padStart(pad, '0')
    : String(counter);
  const found = getPostingRule(transactionType);
  if (!found) return body;
  return [found.seriesCode, found.billSuffix, body].filter(Boolean).join('/');
}

/** One-line "where does this entry land" summary for entry screens. */
export function postingSummary(transactionType?: string | null): string {
  const found = getPostingRule(transactionType);
  if (!found) return '—';
  const parts = [
    found.saleOrPurchaseAccount,
    found.partyAccountType,
    found.stockType ? `Stock: ${found.stockType}` : null
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : '—';
}

/** Distinct Sale/Pur A/C names from the master, for pickers. */
export const ERP_SALE_PURCHASE_ACCOUNTS: string[] = Array.from(
  new Set(ERP_POSTING_RULES.map(row => row.saleOrPurchaseAccount).filter((v): v is string => Boolean(v)))
).sort((a, b) => a.localeCompare(b));
