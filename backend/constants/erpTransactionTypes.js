import { getItcEligibility, getPostingRule } from './erpTransactionPostingRules.js';
import { parseNoteType } from './creditDebitNoteTypes.js';

export const ERP_TRANSACTION_TYPES = [
  { value: 'FINISH SALES', label: 'Finish Sales', category: 'sales' },
  { value: 'FINISH SALES (GST)', label: 'Finish Sales (GST)', category: 'sales' },
  { value: 'GREY SALES', label: 'Grey Sales', category: 'sales' },
  { value: 'CASH SALES', label: 'Cash Sales', category: 'sales' },
  { value: 'FENT SALES', label: 'Fent Sales', category: 'sales' },
  { value: 'SALES CHALLAN', label: 'Sales Challan', category: 'sales' },
  { value: 'SALES GOODS RETURN', label: 'Sales Goods Return', category: 'sales' },
  { value: 'SALES ORDERS', label: 'Sales Orders', category: 'sales' },
  { value: 'FINISH PURCHASE', label: 'Finish Purchase', category: 'purchase' },
  { value: 'GREY PURCHASE', label: 'Grey Purchase', category: 'purchase' },
  { value: 'FINISH PURCHASE RETURN', label: 'Finish Purchase Return', category: 'purchase' },
  { value: 'GREY PURCHASE RETURN', label: 'Grey Purchase Return', category: 'purchase' },
  { value: 'BOX PURCHASES', label: 'Box Purchases', category: 'purchase' },
  { value: 'PURCHASE (GST CAPITAL GOODS)', label: 'Purchase (GST Capital Goods)', category: 'purchase' },
  { value: 'PURCHASE (GST GENERAL GOODS)', label: 'Purchase (GST General Goods)', category: 'purchase' },
  { value: 'PURCHASE (GST INPUT SERVICES)', label: 'Purchase (GST Input Services)', category: 'purchase' },
  { value: 'VALUE ADDITION PURCHASE', label: 'Value Addition Purchase', category: 'purchase' },
  { value: 'WORK DESP.SUIT CHALLAN', label: 'Work Desp. Suit Challan', category: 'work' },
  { value: 'WORK DESP.LACE SUIT CHALLAN', label: 'Work Desp. Lace Suit Challan', category: 'work' },
  { value: 'WORK DESP LACE CHALLAN', label: 'Work Desp. Lace Challan', category: 'work' },
  { value: 'WORK REC. BILLS', label: 'Work Rec. Bills', category: 'work' },
  { value: 'WORK REC. CHALLAN', label: 'Work Rec. Challan', category: 'work' },
  { value: 'WORK REC LACE CHALLAN', label: 'Work Rec. Lace Challan', category: 'work' },
  { value: 'WORK REC. LACE BILLS', label: 'Work Rec. Lace Bills', category: 'work' },
  { value: 'WORK REC. LACE SUIT BILLS', label: 'Work Rec. Lace Suit Bills', category: 'work' },
  { value: 'WORK REC. SUIT BILLS', label: 'Work Rec. Suit Bills', category: 'work' },
  { value: 'TRANSACTION', label: 'Transaction', category: 'other' },
  { value: 'REVERSE CHARGE SALES TO SELF', label: 'Reverse Charge Sales To Self', category: 'other' },
  { value: 'SALARY EXP A/C', label: 'Salary Exp A/C', category: 'other' }
];

export const DEFAULT_SALES_TRANSACTION_TYPE = 'FINISH SALES';
export const DEFAULT_PURCHASE_TRANSACTION_TYPE = 'FINISH PURCHASE';
export const DEFAULT_EXPENSE_TRANSACTION_TYPE = 'PURCHASE (GST CAPITAL GOODS)';

export const EXPENSE_TRANSACTION_TYPES = [
  'PURCHASE (GST CAPITAL GOODS)',
  'PURCHASE (GST GENERAL GOODS)',
  'PURCHASE (GST INPUT SERVICES)'
];

export function isExpensePurchaseType(transactionType) {
  const value = String(transactionType || '').trim().toUpperCase();
  return EXPENSE_TRANSACTION_TYPES.some(type => type === value);
}

export function normalizeTransactionType(value, fallback = DEFAULT_SALES_TRANSACTION_TYPE) {
  const text = String(value || '').trim();
  if (!text) return fallback;
  const match = ERP_TRANSACTION_TYPES.find(type => type.value.toLowerCase() === text.toLowerCase());
  return match?.value || text;
}

export function getTransactionTypesForCategory(category) {
  if (!category || category === 'all') return ERP_TRANSACTION_TYPES;
  return ERP_TRANSACTION_TYPES.filter(type => type.category === category || type.category === 'other');
}

/**
 * A firm may file a longer HSN under the heading the master names (5407 → 540752).
 * Keep the company's code when it sits under the master's heading; otherwise the
 * master wins, and the company code only fills a heading the master left blank.
 */
function refineHsnCode(masterHsn, companyHsn) {
  const master = String(masterHsn || '').trim();
  const company = String(companyHsn || '').trim();
  if (!master) return company;
  return company.startsWith(master) ? company : master;
}

/**
 * Seeds a new entry from this series' row in the Transaction Types master:
 * CGST% + SGST%, default HSN/SAC and ITC eligibility.
 *
 * The master is authoritative, including a rate it states as 0. The company
 * defaults only apply where the master is blank or has no row for the series,
 * and every seeded value stays editable on the entry screen.
 */
export function getGstDefaultsForTransactionType(
  transactionType,
  fallbackGstRate = 5,
  fallbackHsnCode = '5407'
) {
  const key = String(transactionType || '').trim();
  const rule = key
    ? (getPostingRule(key) || (/[_-]/.test(key) ? getPostingRule(parseNoteType(key)?.series) : undefined))
    : undefined;
  if (!rule) {
    return { gstRate: fallbackGstRate, hsnCode: fallbackHsnCode, itcEligibility: null };
  }
  return {
    gstRate: (Number(rule.cgstPercent) || 0) + (Number(rule.sgstPercent) || 0),
    hsnCode: refineHsnCode(rule.defaultHsnCode || '', fallbackHsnCode),
    itcEligibility: getItcEligibility(rule.series)
  };
}
