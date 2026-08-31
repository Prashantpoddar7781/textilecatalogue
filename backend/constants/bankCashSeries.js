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

export function formatBillNosRemark(allocations) {
  if (!Array.isArray(allocations) || allocations.length === 0) return '';
  const nos = allocations
    .filter(item => item && item.billType !== 'credit_debit_note' && (Number(item.adjustAmount) || 0) > 0)
    .map(item => String(item.billNumber || '').trim())
    .filter(Boolean);
  if (!nos.length) return '';
  return `BILL NOS. ${nos.join(', ')}`;
}

export function formatPaidOnRemark(dateValue) {
  if (!dateValue) return '';
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  return `PAID ON : ${dd}/${mm}/${yy}`;
}
