import { getAdjustDirection } from '../constants/creditDebitNoteTypes.js';
import { daysSince, matchesPartyName, matchesSupplierName, normalizeBillAllocations, roundMoney } from './orderBilling.js';

export async function getPaidAmountsByCreditDebitNoteId(prismaClient, userId) {
  const entries = await prismaClient.bankEntry.findMany({
    where: { userId },
    select: { billAllocations: true }
  });
  const paidByNoteId = new Map();
  for (const entry of entries) {
    for (const allocation of normalizeBillAllocations(entry.billAllocations)) {
      if (allocation.billType !== 'credit_debit_note') continue;
      const current = paidByNoteId.get(allocation.billId) || 0;
      paidByNoteId.set(allocation.billId, current + roundMoney(allocation.adjustAmount));
    }
  }
  return paidByNoteId;
}

export function mapCreditDebitNoteToPendingItem(note, paidByNoteId) {
  const billAmount = roundMoney(note.netAmountAfterTds || note.netAmount);
  const paidAmount = paidByNoteId.get(note.id) || 0;
  const pendingAmount = roundMoney(Math.max(billAmount - paidAmount, 0));
  const adjustDirection = getAdjustDirection(note.noteKind, note.noteSide);
  const typeLabel = `${note.noteKind === 'credit' ? 'Credit' : 'Debit'} Note (${note.noteSide === 'sales' ? 'Sales' : 'Purchase'})`;

  return {
    billId: note.id,
    billType: 'credit_debit_note',
    billNumber: note.noteNumber || String(note.voucherNumber || note.id.slice(-6)),
    transactionType: typeLabel,
    voucherNumber: String(note.voucherNumber || note.noteNumber || '-'),
    billDate: note.noteDate,
    days: daysSince(note.noteDate),
    grace: 0,
    adatDisc: roundMoney(note.discountAmount),
    billAmount,
    pendingAmount,
    taxableAmount: roundMoney(note.taxableAmount),
    adjustAmount: 0,
    entryKind: note.noteKind === 'credit' ? 'credit_note' : 'debit_note',
    noteKind: note.noteKind,
    noteSide: note.noteSide,
    adjustDirection,
    refBillNumber: note.refBillNumber || null
  };
}

export function matchesNoteParty(note, partyName, partyType) {
  if (partyType === 'supplier') {
    return note.partyType === 'supplier' && matchesSupplierName(note.partyName, partyName);
  }
  if (partyType === 'customer') {
    return note.partyType === 'customer' && matchesPartyName({ buyerName: note.partyName, customer: null }, partyName);
  }
  return false;
}

export async function getPendingCreditDebitNotes(prismaClient, userId, partyName, partyType) {
  const [notes, paidByNoteId] = await Promise.all([
    prismaClient.creditDebitNote.findMany({
      where: { userId, status: 'posted' },
      orderBy: [{ noteDate: 'asc' }, { createdAt: 'asc' }]
    }),
    getPaidAmountsByCreditDebitNoteId(prismaClient, userId)
  ]);

  return notes
    .filter(note => matchesNoteParty(note, partyName, partyType))
    .map(note => mapCreditDebitNoteToPendingItem(note, paidByNoteId))
    .filter(item => item.pendingAmount > 0);
}
