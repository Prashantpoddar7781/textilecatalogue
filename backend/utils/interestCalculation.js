import { getPostingRule } from '../constants/erpTransactionPostingRules.js';

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

/** TRANSACTION TYPES column "0 GRACE FOR INTEREST CALCULATION" — 1 means ignore party/bill grace. */
export function usesZeroGraceForInterest(transactionType) {
  return Boolean(getPostingRule(transactionType)?.zeroGraceForInterest);
}

export function toDateKey(value) {
  if (!value) return null;
  const text = value instanceof Date ? value.toISOString() : String(value);
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function utcDay(key) {
  const [year, month, day] = String(key).split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

export function addDays(value, days) {
  const key = toDateKey(value);
  if (!key) return null;
  const next = utcDay(key) + (Number(days) || 0) * 86400000;
  return new Date(next).toISOString().slice(0, 10);
}

/** Inclusive calendar days from start through end, matching Empire interest days. */
export function inclusiveDays(fromValue, toValue) {
  const from = toDateKey(fromValue);
  const to = toDateKey(toValue);
  if (!from || !to) return 0;
  const diff = utcDay(to) - utcDay(from);
  if (diff < 0) return 0;
  return Math.round(diff / 86400000) + 1;
}

export function resolveGraceDays({ transactionType, billGrace, partyGraceDays } = {}) {
  if (usesZeroGraceForInterest(transactionType)) return 0;
  const bill = Number(billGrace);
  if (Number.isFinite(bill) && bill > 0) return bill;
  const party = Number(partyGraceDays);
  return Number.isFinite(party) ? Math.max(0, party) : 0;
}

export function interestDaysAfterGrace(calendarDays, graceDays) {
  return Math.max(0, Math.trunc(Number(calendarDays) || 0) - Math.max(0, Number(graceDays) || 0));
}

/** Simple interest: amount × rate% × days / daysInYear. */
export function calculateInterestAmount(amount, interestRate, interestDays, daysInYear = 365) {
  const principal = Number(amount) || 0;
  const rate = Number(interestRate) || 0;
  const days = Number(interestDays) || 0;
  const yearDays = Number(daysInYear) > 0 ? Number(daysInYear) : 365;
  if (principal <= 0 || rate <= 0 || days <= 0) return 0;
  return roundMoney((principal * rate * days) / (yearDays * 100));
}

export function applyInterestFields(bill, party = {}) {
  const grace = resolveGraceDays({
    transactionType: bill.transactionType,
    billGrace: bill.grace,
    partyGraceDays: party.graceDays
  });
  const interestRate = Number(bill.interestRate ?? party.interestRate) || 0;
  const interestDays = interestDaysAfterGrace(bill.days, grace);
  return {
    ...bill,
    grace,
    interestRate,
    interestDays,
    interestAmount: calculateInterestAmount(bill.pendingAmount, interestRate, interestDays, 365)
  };
}

const BILL_GRACE_SOURCE_TYPES = new Set([
  'order',
  'sales_invoice',
  'purchase_bill',
  'grey_purchase',
  'grey_purchase_return',
  'mill_receipt',
  'work_receipt',
  'credit_debit_note'
]);

/** Disc A/C JVs split Dhara off the bill. Empire interest uses the net bill, not a receipt. */
export const DISCOUNT_JOURNAL_PARENT = {
  order_discount: 'order',
  sales_invoice_discount: 'sales_invoice',
  purchase_bill_discount: 'purchase_bill',
  grey_purchase_discount: 'grey_purchase',
  grey_purchase_return_discount: 'grey_purchase_return',
  mill_receipt_discount: 'mill_receipt',
  work_receipt_discount: 'work_receipt'
};

export function isDiscountJournalSource(sourceType) {
  return Boolean(DISCOUNT_JOURNAL_PARENT[String(sourceType || '')]);
}

export function foldDiscountJournals(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const discounts = list.filter(row => isDiscountJournalSource(row.sourceType));
  if (!discounts.length) return list;

  const byParent = new Map();
  for (const row of discounts) {
    const parentType = DISCOUNT_JOURNAL_PARENT[row.sourceType];
    const key = `${parentType}:${row.sourceId || ''}`;
    const current = byParent.get(key) || { debit: 0, credit: 0 };
    current.debit = roundMoney(current.debit + (Number(row.debitAmount) || 0));
    current.credit = roundMoney(current.credit + (Number(row.creditAmount) || 0));
    byParent.set(key, current);
  }

  return list
    .filter(row => !isDiscountJournalSource(row.sourceType))
    .map(row => {
      const disc = byParent.get(`${row.sourceType}:${row.sourceId || ''}`);
      if (!disc) return row;
      return {
        ...row,
        debitAmount: roundMoney(Math.max(0, (Number(row.debitAmount) || 0) - disc.credit)),
        creditAmount: roundMoney(Math.max(0, (Number(row.creditAmount) || 0) - disc.debit))
      };
    })
    .filter(row => (Number(row.debitAmount) || 0) > 0 || (Number(row.creditAmount) || 0) > 0);
}

export function sourceUsesSalePurchaseGrace(sourceType) {
  return BILL_GRACE_SOURCE_TYPES.has(String(sourceType || ''));
}

/**
 * Empire Generate Report method:
 * debit interest from (date + grace on bills) through as-on date
 * minus credit interest from receipt/credit date through as-on date.
 */
export function buildInterestSides(entries, options = {}) {
  const asOnDate = toDateKey(options.asOnDate);
  const daysInYear = Number(options.daysInYear) > 0 ? Number(options.daysInYear) : 365;
  const interestRate = Number(options.interestRate) || 0;
  const graceSource = options.graceSource === 'typed' ? 'typed' : 'master';
  const typedGrace = Math.max(0, Number(options.typedGraceDays) || 0);
  const masterGrace = Math.max(0, Number(options.masterGraceDays) || 0);
  const basedOnChequeDate = Boolean(options.basedOnChequeDate);

  const debitRows = [];
  const creditRows = [];

  for (const entry of entries || []) {
    const debitAmount = roundMoney(entry.debitAmount || 0);
    const creditAmount = roundMoney(entry.creditAmount || 0);
    if (debitAmount <= 0 && creditAmount <= 0) continue;

    const entryDate = toDateKey(basedOnChequeDate && entry.chequeDate ? entry.chequeDate : entry.date);
    if (!entryDate || !asOnDate) continue;

    const isBill = sourceUsesSalePurchaseGrace(entry.sourceType);
    let grace = 0;
    if (isBill) {
      if (usesZeroGraceForInterest(entry.transactionType)) {
        grace = 0;
      } else if (graceSource === 'typed') {
        grace = typedGrace;
      } else {
        grace = masterGrace;
      }
    }

    const startDate = isBill ? addDays(entryDate, grace) : entryDate;
    const days = inclusiveDays(startDate, asOnDate);
    if (days <= 0) continue;
    const amount = debitAmount > 0 ? debitAmount : creditAmount;
    const interestAmount = calculateInterestAmount(amount, interestRate, days, daysInYear);
    const row = {
      id: entry.id,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      date: entryDate,
      dueDate: startDate,
      book: entry.account || entry.book || '',
      billNumber: entry.billNumber || entry.voucherNumber || '-',
      grace,
      amount,
      days,
      interestAmount,
      editPath: entry.editPath || null,
      transactionType: entry.transactionType || entry.account || null
    };

    if (debitAmount > 0) debitRows.push({ ...row, amount: debitAmount });
    if (creditAmount > 0) creditRows.push({ ...row, amount: creditAmount });
  }

  const debitInterest = roundMoney(debitRows.reduce((sum, row) => sum + row.interestAmount, 0));
  const creditInterest = roundMoney(creditRows.reduce((sum, row) => sum + row.interestAmount, 0));
  const debitTotal = roundMoney(debitRows.reduce((sum, row) => sum + row.amount, 0));
  const creditTotal = roundMoney(creditRows.reduce((sum, row) => sum + row.amount, 0));
  const netInterest = roundMoney(debitInterest - creditInterest);
  const ledgerBalance = roundMoney(debitTotal - creditTotal);

  return {
    daysInYear,
    interestRate,
    graceSource,
    graceDays: graceSource === 'typed' ? typedGrace : masterGrace,
    asOnDate,
    debitRows,
    creditRows,
    debitTotal,
    creditTotal,
    debitInterest,
    creditInterest,
    ledgerBalance,
    ledgerBalanceType: ledgerBalance >= 0 ? 'DR' : 'CR',
    interestAmount: Math.abs(netInterest),
    interestType: netInterest >= 0 ? 'DR' : 'CR',
    balanceWithInterest: roundMoney(Math.abs(ledgerBalance) + Math.abs(netInterest)),
    balanceWithInterestType: roundMoney(ledgerBalance + netInterest) >= 0 ? 'DR' : 'CR'
  };
}
