/** Bank / Cash receipt & payment series from Transaction Types master. */

export const BANK_CASH_SERIES = [
  'BANK RECEIPT',
  'BANK PAYMENT',
  'CASH RECEIPT',
  'CASH PAYMENT'
];

export const DEFAULT_BANK_CASH_SERIES = 'BANK RECEIPT';

const SERIES_SET = new Set(BANK_CASH_SERIES);

export function isBankCashSeries(value) {
  return SERIES_SET.has(String(value || '').trim().toUpperCase());
}

export function normalizeBankCashSeries(value, fallback = DEFAULT_BANK_CASH_SERIES) {
  const upper = String(value || '').trim().toUpperCase();
  return SERIES_SET.has(upper) ? upper : fallback;
}

export function bankCashEntryType(series) {
  const upper = String(series || '').trim().toUpperCase();
  return upper.includes('PAYMENT') ? 'payment' : 'receipt';
}

export function bankCashPaymentMode(series) {
  const upper = String(series || '').trim().toUpperCase();
  return upper.startsWith('CASH') ? 'cash' : 'bank';
}

export function bankCashDefaultPartyType(series) {
  return bankCashEntryType(series) === 'payment' ? 'supplier' : 'customer';
}

/** Slip no. from entry date — e.g. 16/07 → 1607 */
export function slipNumberFromDate(dateValue) {
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

export function isUnadjAllocation(item) {
  if (!item) return false;
  const billType = String(item.billType || '').trim().toLowerCase();
  const entryKind = String(item.entryKind || '').trim().toLowerCase();
  return billType === UNADJ_BILL_TYPE || entryKind === UNADJ_BILL_TYPE || billType === 'unadj payment';
}

/** Empire-style unadj bill no — voucher 4 → "4 B". */
export function formatUnadjBillNumber(voucherNumber) {
  const v = String(voucherNumber ?? '').trim();
  if (!v) return 'B';
  return `${v} B`;
}

export function formatBillNosRemark(allocations) {
  if (!Array.isArray(allocations) || allocations.length === 0) return '';
  const nos = allocations
    .filter(item => item && item.billType !== 'credit_debit_note' && (Number(item.adjustAmount) || 0) > 0)
    .map(item => String(item.billNumber || '').trim())
    .filter(Boolean);
  if (!nos.length) return '';
  return `BILL NOS. ${nos.join(', ')}`;
}

function formatLedgerDate(dateValue) {
  if (!dateValue) return '';
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

export function formatPaidOnRemark(dateValue) {
  const stamp = formatLedgerDate(dateValue);
  return stamp ? `PAID ON : ${stamp}` : '';
}

/** Remark on an early part payment/receipt after a later settlement consumes it. */
export function formatAdjustedOnRemark(dateValue) {
  const stamp = formatLedgerDate(dateValue);
  return stamp ? `ADJUSTED ON : ${stamp}` : '';
}

/** Unadjusted surplus created by a bank entry (amount not applied to real bills). */
export function unadjAmountCreated(entry) {
  if (!entry) return 0;
  const amount = Math.round((Number(entry.amount) || 0) * 100) / 100;
  const allocations = Array.isArray(entry.billAllocations) ? entry.billAllocations : [];
  const billAdjusted = allocations.reduce((sum, item) => {
    if (!item || item.billType === 'credit_debit_note' || isUnadjAllocation(item)) return sum;
    return sum + (Math.round((Number(item.adjustAmount) || 0) * 100) / 100);
  }, 0);
  return Math.round(Math.max(amount - billAdjusted, 0) * 100) / 100;
}
