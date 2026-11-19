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

export function isNoteAllocation(item) {
  if (!item) return false;
  const billType = String(item.billType || '').trim().toLowerCase();
  const entryKind = String(item.entryKind || '').trim().toLowerCase();
  return billType === 'credit_debit_note' || entryKind === 'credit_note' || entryKind === 'debit_note';
}

export function isDeductAllocation(item) {
  if (!item) return false;
  if (isUnadjAllocation(item)) return true;
  return String(item.adjustDirection || '').toLowerCase() === 'deduct';
}

/** Empire-style unadj bill no — voucher 4 → "4 B". */
export function formatUnadjBillNumber(voucherNumber) {
  const v = String(voucherNumber ?? '').trim();
  if (!v) return 'B';
  return `${v} B`;
}

/**
 * Series XX "271 J" is the copy of journal 271 left behind after the expense
 * bill replaced that journal. The journal is already on the ledger.
 */
export function unadjCopiesJournal(entry, journals) {
  const type = String(entry?.transactionType || '').toUpperCase();
  if (type !== 'UNADJ PAYMENT') return false;
  const match = String(entry?.billNumber || '').trim().match(/^(\d+)\s*J$/i);
  if (!match) return false;
  const amount = Math.abs(Number(entry.amount) || 0);
  if (!(amount > 0)) return false;
  const party = String(entry.partyName || '').trim().toLowerCase();
  return (journals || []).some(voucher => {
    if (String(voucher.transactionType || '').trim().toUpperCase() !== 'JOURNAL') return false;
    if (String(voucher.voucherNumber || '') !== match[1]) return false;
    if (Math.abs(Math.abs(Number(voucher.amount) || 0) - amount) > 0.5) return false;
    const names = [voucher.partyName, voucher.oppositeAccount]
      .map(value => String(value || '').trim().toLowerCase());
    return names.includes(party);
  });
}

/** Imported unadj rows keep the printed bill ("852B") beside the internal voucher. */
export function displayUnadjBillNumber(entry) {
  const raw = String(entry?.billNumber || '').replace(/\*/g, '').trim();
  const match = raw.match(/^(\d+)\s*B$/i);
  if (match) return `${Number(match[1])} B`;
  return formatUnadjBillNumber(entry?.voucherNumber);
}

/** Next voucher for one bank/cash series. Highest number already used, plus one. */
export function nextNumberFromVoucherList(values) {
  let max = 0;
  for (const value of values || []) {
    const parsed = Number.parseInt(String(value ?? '').replace(/\D/g, ''), 10);
    if (Number.isFinite(parsed) && parsed > max) max = parsed;
  }
  return String(max + 1);
}

export function formatBillNosRemark(allocations) {
  if (!Array.isArray(allocations) || allocations.length === 0) return '';
  const nos = allocations
    .filter(item => item && (Number(item.adjustAmount) || 0) > 0)
    .map(item => String(item.billNumber || '').trim())
    .filter(Boolean);
  if (!nos.length) return '';
  return `BILL NOS. ${nos.join(', ')}`;
}

/** Empire marks a bounced receipt in FAS.RMK. Those bill picks no longer count as paid. */
export function isChequeReturnedEntry(entry) {
  return /CHEQUE RETN\. ON\b/i.test(String(entry?.remarks || ''));
}

/** The bounced receipt, or the payment that reverses it. Neither is money still lying with the party. */
export function isChequeReturnVoucher(entry) {
  return isChequeReturnedEntry(entry) || /\bCHQ RETURN\b/i.test(String(entry?.remarks || ''));
}

export function chequeReturnedRemark(dateValue, billNosRemark) {
  const stamp = formatLedgerDate(dateValue);
  const head = stamp ? `CHEQUE RETN. ON ${stamp}` : 'CHEQUE RETN. ON';
  const bills = String(billNosRemark || '').trim();
  return bills ? `${head} / ${bills}` : head;
}

export function chequeReturnVoucherRemark(billNosRemark) {
  const bills = String(billNosRemark || '').trim();
  return bills ? `CHQ RETURN - ${bills}` : 'CHQ RETURN -';
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

/**
 * Cash on this voucher that was not applied to a bill, note, or journal.
 * A debit note picked on the receipt is applied money. A deduct (credit note
 * or an older unadjusted voucher) is already netted out of the cash.
 * A bounced cheque is not an unadjusted balance.
 */
export function unadjAmountCreated(entry) {
  if (!entry || isChequeReturnVoucher(entry)) return 0;
  const amount = Math.round((Number(entry.amount) || 0) * 100) / 100;
  const allocations = Array.isArray(entry.billAllocations) ? entry.billAllocations : [];
  const billAdjusted = allocations.reduce((sum, item) => {
    if (!item || isUnadjAllocation(item) || isDeductAllocation(item)) return sum;
    return sum + (Math.round((Number(item.adjustAmount) || 0) * 100) / 100);
  }, 0);
  return Math.round(Math.max(amount - billAdjusted, 0) * 100) / 100;
}
