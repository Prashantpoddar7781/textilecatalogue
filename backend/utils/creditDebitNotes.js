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
  const billAmount = roundMoney(
    note.netAmountAfterTds
    || note.netAmount
    || note.grossAmount
    || note.taxableAmount
  );
  const bankPaid = paidByNoteId.get(note.id) || 0;
  const directPaid = note.isPaid ? roundMoney(note.paidAmount || billAmount) : roundMoney(note.paidAmount || 0);
  const paidAmount = roundMoney(Math.max(bankPaid, directPaid));
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
    refBillNumber: note.refBillNumber || null,
    adjustBillNumber: note.adjustBillNumber || null,
    adjustBillId: note.adjustBillId || null
  };
}

function noteLinksToBill(note, bill) {
  if (!bill || bill.billType === 'credit_debit_note') return false;
  if (note.adjustBillId && note.adjustBillId === bill.billId) return true;
  const billNo = String(bill.billNumber || '');
  const linkedNumbers = [note.adjustBillNumber, note.refBillNumber].filter(Boolean).map(String);
  return linkedNumbers.some(value => value === billNo);
}

export function mergePendingBillsWithNotes(bills, notes) {
  const noteItems = notes.map(note => ({ ...note }));
  const billItems = bills.map(bill => {
    const linkedNotes = noteItems.filter(note => noteLinksToBill(note, bill));
    const linkedCredit = linkedNotes
      .filter(note => note.adjustDirection === 'deduct')
      .reduce((sum, note) => sum + note.pendingAmount, 0);
    const linkedDebit = linkedNotes
      .filter(note => note.adjustDirection === 'add')
      .reduce((sum, note) => sum + note.pendingAmount, 0);
    return {
      ...bill,
      linkedNoteIds: linkedNotes.map(note => note.billId),
      linkedCreditAmount: roundMoney(linkedCredit),
      linkedDebitAmount: roundMoney(linkedDebit),
      netPendingAmount: roundMoney(Math.max(bill.pendingAmount - linkedCredit + linkedDebit, 0))
    };
  });

  return [...billItems, ...noteItems];
}

export function matchesNoteParty(note, partyName, partyType, alias = null) {
  if (!partyName) return false;

  if (partyType === 'supplier') {
    if (note.partyType !== 'supplier' || note.noteSide !== 'purchase') return false;
    if (alias?.supplierIds?.has(note.supplierId)) return true;
    return matchesSupplierName(note.partyName, partyName);
  }

  if (partyType === 'customer') {
    if (note.partyType !== 'customer' || note.noteSide !== 'sales') return false;
    if (alias?.customerIds?.has(note.customerId)) return true;
    const noteName = String(note.partyName || '').trim().toLowerCase();
    if (alias?.names?.has(noteName)) return true;
    return matchesPartyName({ buyerName: note.partyName, customer: null }, partyName);
  }

  return false;
}

async function resolvePartyAliases(prismaClient, userId, partyName, partyType) {
  const target = partyName.trim().toLowerCase();
  const names = new Set([target]);
  const customerIds = new Set();
  const supplierIds = new Set();

  if (!target) {
    return { names, customerIds, supplierIds };
  }

  if (partyType === 'customer') {
    const customers = await prismaClient.customer.findMany({
      where: { userId },
      select: { id: true, organizationName: true }
    });
    for (const customer of customers) {
      const org = String(customer.organizationName || '').trim().toLowerCase();
      if (!org) continue;
      if (org === target || org.includes(target) || target.includes(org)) {
        names.add(org);
        customerIds.add(customer.id);
      }
    }

    const orders = await prismaClient.order.findMany({
      where: { userId },
      select: { buyerName: true, customer: { select: { id: true, organizationName: true } } }
    });
    for (const order of orders) {
      const orderName = String(order.customer?.organizationName || order.buyerName || '').trim().toLowerCase();
      if (!orderName) continue;
      if (orderName === target || orderName.includes(target) || target.includes(orderName)) {
        names.add(orderName);
        if (order.customer?.id) customerIds.add(order.customer.id);
        if (order.customer?.organizationName) {
          names.add(String(order.customer.organizationName).trim().toLowerCase());
        }
      }
    }
  }

  if (partyType === 'supplier') {
    const suppliers = await prismaClient.supplier.findMany({
      where: { userId },
      select: { id: true, name: true }
    });
    for (const supplier of suppliers) {
      const name = String(supplier.name || '').trim().toLowerCase();
      if (!name) continue;
      if (name === target || name.includes(target) || target.includes(name)) {
        names.add(name);
        supplierIds.add(supplier.id);
      }
    }
  }

  return { names, customerIds, supplierIds };
}

export async function getPendingCreditDebitNotes(prismaClient, userId, partyName, partyType) {
  if (!partyName?.trim() || partyType === 'other') {
    return [];
  }

  const [notes, paidByNoteId, alias] = await Promise.all([
    prismaClient.creditDebitNote.findMany({
      where: { userId, status: { not: 'cancelled' } },
      orderBy: [{ noteDate: 'asc' }, { createdAt: 'asc' }]
    }),
    getPaidAmountsByCreditDebitNoteId(prismaClient, userId),
    resolvePartyAliases(prismaClient, userId, partyName, partyType)
  ]);

  return notes
    .filter(note => matchesNoteParty(note, partyName, partyType, alias))
    .map(note => mapCreditDebitNoteToPendingItem(note, paidByNoteId))
    .filter(item => item.pendingAmount > 0);
}
