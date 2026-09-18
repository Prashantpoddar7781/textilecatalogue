import { formatSeriesBillNumber } from '../constants/erpTransactionPostingRules.js';
import { daysSince, matchesPartyName, matchesSupplierName, normalizeBillAllocations, roundMoney } from './orderBilling.js';

export const JOURNAL_TRANSACTION_TYPE = 'JOURNAL';
export const JOURNAL_BILL_TYPE = 'journal_voucher';

export function journalAdjustDirection(partySide, partyType) {
  const side = String(partySide || '').toLowerCase() === 'debit' ? 'debit' : 'credit';
  if (partyType === 'supplier') {
    return side === 'credit' ? 'add' : 'deduct';
  }
  return side === 'credit' ? 'deduct' : 'add';
}

export function matchesJournalParty(voucher, partyName, partyType) {
  if (!partyName || !voucher?.partyName) return false;
  if (partyType === 'supplier') {
    if (voucher.partyType && voucher.partyType !== 'supplier') return false;
    return matchesSupplierName(voucher.partyName, partyName);
  }
  if (partyType === 'customer') {
    if (voucher.partyType && voucher.partyType !== 'customer') return false;
    return matchesPartyName({ buyerName: voucher.partyName, customer: null }, partyName)
      || matchesSupplierName(voucher.partyName, partyName);
  }
  return matchesSupplierName(voucher.partyName, partyName)
    || matchesPartyName({ buyerName: voucher.partyName, customer: null }, partyName);
}

export async function getPaidAmountsByJournalId(prismaClient, userId, options = {}) {
  const excludeEntryId = options?.excludeEntryId || null;
  const where = { userId };
  if (excludeEntryId) where.id = { not: excludeEntryId };
  const entries = await prismaClient.bankEntry.findMany({
    where,
    select: { billAllocations: true }
  });
  const paidById = new Map();
  for (const entry of entries) {
    for (const allocation of normalizeBillAllocations(entry.billAllocations)) {
      if (String(allocation.billType || '').toLowerCase() !== JOURNAL_BILL_TYPE) continue;
      const current = paidById.get(allocation.billId) || 0;
      paidById.set(allocation.billId, current + roundMoney(allocation.adjustAmount));
    }
  }
  return paidById;
}

export function mapJournalVoucherToPendingItem(voucher, paidById, partyType, asOfValue = Date.now()) {
  const billAmount = roundMoney(voucher.amount);
  const paidAmount = paidById.get(voucher.id) || 0;
  const pendingAmount = roundMoney(Math.max(billAmount - paidAmount, 0));
  const billDate = voucher.voucherDate || voucher.createdAt;
  const displayNumber = voucher.voucherNumber
    || (voucher.typeBillNumber != null
      ? formatSeriesBillNumber(JOURNAL_TRANSACTION_TYPE, voucher.typeBillNumber)
      : voucher.id.slice(-6).toUpperCase());
  const adjustDirection = journalAdjustDirection(voucher.partySide, partyType || voucher.partyType);

  return {
    billId: voucher.id,
    billType: JOURNAL_BILL_TYPE,
    billNumber: displayNumber,
    transactionType: JOURNAL_TRANSACTION_TYPE,
    voucherNumber: voucher.voucherNumber || String(voucher.typeBillNumber || '-'),
    billDate,
    days: daysSince(billDate, asOfValue),
    grace: 0,
    adatDisc: 0,
    billAmount,
    paidAmount: roundMoney(paidAmount),
    pendingAmount,
    taxableAmount: 0,
    adjustAmount: 0,
    entryKind: JOURNAL_BILL_TYPE,
    adjustDirection,
    oppositeAccount: voucher.oppositeAccount || null,
    partyName: voucher.partyName,
    partyType: voucher.partyType,
    partySide: voucher.partySide,
    editPath: `/erp/journal?edit=${voucher.id}`
  };
}

export async function getPendingJournalVouchers(prismaClient, userId, partyName, partyType, excludeEntryId = null) {
  if (!partyName) return [];
  const [vouchers, paidById] = await Promise.all([
    prismaClient.journalVoucher.findMany({
      where: { userId, status: { not: 'cancelled' } },
      orderBy: [{ voucherDate: 'asc' }, { createdAt: 'asc' }]
    }),
    getPaidAmountsByJournalId(prismaClient, userId, excludeEntryId ? { excludeEntryId } : {})
  ]);

  return vouchers
    .filter(voucher => matchesJournalParty(voucher, partyName, partyType))
    .map(voucher => mapJournalVoucherToPendingItem(voucher, paidById, partyType))
    .filter(item => item.pendingAmount > 0)
    .sort((a, b) => String(a.billNumber).localeCompare(String(b.billNumber), undefined, { numeric: true }));
}
