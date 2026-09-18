import { CREDIT_DEBIT_NOTE_TYPES } from './creditDebitNoteTypes';
import { DEFAULT_PURCHASE_TRANSACTION_TYPE, DEFAULT_SALES_TRANSACTION_TYPE, ERP_TRANSACTION_TYPES } from './erpTransactionTypes';

/** Bank / Cash receipt & payment series from Transaction Types master. */

export const BANK_CASH_SERIES = [
  'BANK RECEIPT',
  'BANK PAYMENT',
  'CASH RECEIPT',
  'CASH PAYMENT'
] as const;

export type BankCashSeries = (typeof BANK_CASH_SERIES)[number];

export const DEFAULT_BANK_CASH_SERIES: BankCashSeries = 'BANK RECEIPT';

const SERIES_SET = new Set<string>(BANK_CASH_SERIES);

export function isBankCashSeries(value?: string | null): value is BankCashSeries {
  return SERIES_SET.has(String(value || '').trim().toUpperCase());
}

export function normalizeBankCashSeries(
  value?: string | null,
  fallback: BankCashSeries = DEFAULT_BANK_CASH_SERIES
): BankCashSeries {
  const upper = String(value || '').trim().toUpperCase();
  return SERIES_SET.has(upper) ? (upper as BankCashSeries) : fallback;
}

export function bankCashEntryType(series?: string | null): 'payment' | 'receipt' {
  const upper = String(series || '').trim().toUpperCase();
  return upper.includes('PAYMENT') ? 'payment' : 'receipt';
}

export function bankCashPaymentMode(series?: string | null): 'bank' | 'cash' {
  const upper = String(series || '').trim().toUpperCase();
  return upper.startsWith('CASH') ? 'cash' : 'bank';
}

export function bankCashDefaultPartyType(series?: string | null): 'customer' | 'supplier' {
  return bankCashEntryType(series) === 'payment' ? 'supplier' : 'customer';
}

/** Slip no. from entry date — e.g. 16/07 → 1607 */
export function slipNumberFromDate(dateValue?: string | Date | null): string {
  if (!dateValue) return '';
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    const m = String(dateValue).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '';
    return `${m[3]}${m[2]}`;
  }
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}${mm}`;
}

/** Prior bank entry used as an unadjusted payment/receipt in bill-wise settlement. */
export const UNADJ_BILL_TYPE = 'unadj_payment';

export function isUnadjAllocation(item?: { billType?: string | null; entryKind?: string | null } | null): boolean {
  if (!item) return false;
  const billType = String(item.billType || '').trim().toLowerCase();
  const entryKind = String(item.entryKind || '').trim().toLowerCase();
  return billType === UNADJ_BILL_TYPE || entryKind === UNADJ_BILL_TYPE || billType === 'unadj payment';
}

export function isNoteAllocation(item?: { billType?: string | null; entryKind?: string | null } | null): boolean {
  if (!item) return false;
  const billType = String(item.billType || '').trim().toLowerCase();
  const entryKind = String(item.entryKind || '').trim().toLowerCase();
  return billType === 'credit_debit_note' || entryKind === 'credit_note' || entryKind === 'debit_note';
}

export function isDeductAllocation(item?: { billType?: string | null; entryKind?: string | null; adjustDirection?: string | null } | null): boolean {
  if (!item) return false;
  if (isUnadjAllocation(item)) return true;
  return String(item.adjustDirection || '').toLowerCase() === 'deduct';
}

export const UNADJ_PAYMENT_TYPE = 'UNADJ PAYMENT';

export const JOURNAL_TYPE = 'JOURNAL';
export const JOURNAL_BILL_TYPE = 'journal_voucher';

export function isJournalAllocation(item?: { billType?: string | null; entryKind?: string | null; transactionType?: string | null } | null): boolean {
  if (!item) return false;
  const billType = String(item.billType || '').trim().toLowerCase();
  const entryKind = String(item.entryKind || '').trim().toLowerCase();
  const txn = String(item.transactionType || '').trim().toUpperCase();
  return billType === JOURNAL_BILL_TYPE
    || entryKind === JOURNAL_BILL_TYPE
    || txn === JOURNAL_TYPE
    || txn === 'JV'
    || txn === 'JB';
}

export function isJournalBillTypeQuery(value?: string | null): boolean {
  const q = String(value || '').trim().toLowerCase();
  return q === 'j' || q === 'jv' || q === 'jb' || q === 'journal' || q === 'journal voucher';
}

/** Default Type after Remark: receipt → Finish Sales, payment → Finish Purchase. */
export function defaultBillTypeForEntry(entryType?: string | null): string {
  return String(entryType || '').toLowerCase() === 'payment'
    ? DEFAULT_PURCHASE_TRANSACTION_TYPE
    : DEFAULT_SALES_TRANSACTION_TYPE;
}

/** Common Type pick after Remark: sales, purchase, returns, 4 notes, Unadj, frequent cash reasons. */
export const BANK_SETTLEMENT_COMMON_TYPES = [
  DEFAULT_SALES_TRANSACTION_TYPE,
  DEFAULT_PURCHASE_TRANSACTION_TYPE,
  'SALES GOODS RETURN',
  'FINISH PURCHASE RETURN',
  ...CREDIT_DEBIT_NOTE_TYPES.map(type => type.value),
  UNADJ_PAYMENT_TYPE,
  JOURNAL_TYPE,
  'GREY SALES',
  'GREY PURCHASE',
  'FINISH SALES (GST)',
  'CASH SALES',
  'GREY PURCHASE RETURN',
  'SALARY EXP A/C'
];

export function getBankSettlementTypeOptions(): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const value of [...BANK_SETTLEMENT_COMMON_TYPES, ...ERP_TRANSACTION_TYPES.map(type => type.value)]) {
    if (seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }
  return values;
}

/** First-letter match: U → Unadj, D → debit notes, C → credit notes. Exact types show the common palette. */
export function matchBankSettlementTypes(query: string, options: string[]): string[] {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  if (isJournalBillTypeQuery(q)) {
    const palette = [JOURNAL_TYPE, ...BANK_SETTLEMENT_COMMON_TYPES.filter(type => type !== JOURNAL_TYPE)];
    return palette.slice(0, 14);
  }
  const exact = options.find(type => type.toLowerCase() === q);
  if (exact) {
    const palette = [exact, ...BANK_SETTLEMENT_COMMON_TYPES.filter(type => type !== exact)];
    return palette.slice(0, 14);
  }
  const starts = options.filter(type => type.toLowerCase().startsWith(q));
  const rest = options.filter(type => !type.toLowerCase().startsWith(q) && type.toLowerCase().includes(q));
  return [...starts, ...rest].slice(0, 12);
}

/** Empire-style unadj bill no — voucher 4 → "4 B". */
export function formatUnadjBillNumber(voucherNumber?: string | number | null): string {
  const v = String(voucherNumber ?? '').trim();
  if (!v) return 'B';
  return `${v} B`;
}

export function formatBillNosRemark(allocations?: Array<{ billNumber?: string | null; billType?: string | null; adjustAmount?: number }> | null): string {
  if (!Array.isArray(allocations) || allocations.length === 0) return '';
  const nos = allocations
    .filter(item => item && (Number(item.adjustAmount) || 0) > 0)
    .map(item => String(item.billNumber || '').trim())
    .filter(Boolean);
  if (!nos.length) return '';
  return `BILL NOS. ${nos.join(', ')}`;
}

function formatLedgerDate(dateValue?: string | Date | null): string {
  if (!dateValue) return '';
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

export function formatPaidOnRemark(dateValue?: string | Date | null): string {
  const stamp = formatLedgerDate(dateValue);
  return stamp ? `PAID ON : ${stamp}` : '';
}

/** Remark on an early part payment/receipt after a later settlement consumes it. */
export function formatAdjustedOnRemark(dateValue?: string | Date | null): string {
  const stamp = formatLedgerDate(dateValue);
  return stamp ? `ADJUSTED ON : ${stamp}` : '';
}

/** Unadjusted surplus created by a bank entry (amount not applied to real bills). */
export function unadjAmountCreated(entry?: {
  amount?: number | null;
  billAllocations?: Array<{ billType?: string | null; entryKind?: string | null; adjustAmount?: number }> | null;
} | null): number {
  if (!entry) return 0;
  const amount = Math.round((Number(entry.amount) || 0) * 100) / 100;
  const allocations = Array.isArray(entry.billAllocations) ? entry.billAllocations : [];
  const billAdjusted = allocations.reduce((sum, item) => {
    if (!item || item.billType === 'credit_debit_note' || isUnadjAllocation(item) || isDeductAllocation(item)) return sum;
    return sum + (Math.round((Number(item.adjustAmount) || 0) * 100) / 100);
  }, 0);
  return Math.round(Math.max(amount - billAdjusted, 0) * 100) / 100;
}
