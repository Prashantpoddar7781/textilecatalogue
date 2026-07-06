import {
  calculateOrderGrandTotal,
  getOrderPartyName,
  matchesPartyName,
  matchesSupplierName,
  roundMoney
} from './orderBilling.js';
import { matchesNoteParty } from './creditDebitNotes.js';

const sortByDate = (a, b) => {
  const da = new Date(a.date).getTime();
  const db = new Date(b.date).getTime();
  if (da !== db) return da - db;
  return String(a.sourceType).localeCompare(String(b.sourceType));
};

function withRunningBalance(entries, balanceMode) {
  let running = 0;
  return entries.map(entry => {
    if (balanceMode === 'customer') {
      running = roundMoney(running + entry.debitAmount - entry.creditAmount);
    } else {
      running = roundMoney(running + entry.creditAmount - entry.debitAmount);
    }
    return {
      ...entry,
      runningBalance: running,
      balanceType: balanceMode === 'customer'
        ? (running >= 0 ? 'DR' : 'CR')
        : (running >= 0 ? 'CR' : 'DR')
    };
  });
}

export async function getCustomerLedgerParties(prisma, userId) {
  const [orders, invoices, bankEntries, notes, customers] = await Promise.all([
    prisma.order.findMany({
      where: { userId, status: 'completed' },
      include: { customer: true }
    }),
    prisma.salesInvoice.findMany({
      where: { userId },
      include: { customer: true, order: { select: { buyerName: true } } }
    }),
    prisma.bankEntry.findMany({
      where: { userId, partyType: 'customer' },
      select: { partyName: true, amount: true, entryType: true, adjustAdd: true }
    }),
    prisma.creditDebitNote.findMany({
      where: { userId, noteSide: 'sales', status: { not: 'cancelled' } },
      select: { partyName: true, partyType: true, customerId: true }
    }),
    prisma.customer.findMany({
      where: { userId },
      select: { id: true, organizationName: true }
    })
  ]);

  const partyMap = new Map();

  const addParty = (name, extra = {}) => {
    const key = String(name || '').trim();
    if (!key) return;
    const lower = key.toLowerCase();
    const current = partyMap.get(lower) || {
      partyType: 'customer',
      partyName: key,
      customerId: null,
      entryCount: 0,
      runningBalance: 0
    };
    partyMap.set(lower, { ...current, ...extra, partyName: key });
  };

  for (const customer of customers) {
    addParty(customer.organizationName, { customerId: customer.id });
  }

  for (const order of orders) {
    const name = getOrderPartyName(order);
    addParty(name, { customerId: order.customerId || undefined });
  }

  for (const invoice of invoices) {
    const buyerSnapshot = invoice.buyerSnapshot && typeof invoice.buyerSnapshot === 'object' ? invoice.buyerSnapshot : {};
    const name = String(invoice.customer?.organizationName || buyerSnapshot.name || '').trim();
    addParty(name, { customerId: invoice.customerId || undefined });
  }

  for (const entry of bankEntries) addParty(entry.partyName);
  for (const note of notes) addParty(note.partyName, { customerId: note.customerId || undefined });

  return Array.from(partyMap.values()).sort((a, b) => a.partyName.localeCompare(b.partyName));
}

export async function getSupplierLedgerParties(prisma, userId) {
  const suppliers = await prisma.supplier.findMany({
    where: { userId },
    include: {
      purchaseBills: { select: { grandTotal: true } },
      _count: { select: { purchaseBills: true } }
    },
    orderBy: { name: 'asc' }
  });

  return suppliers.map(supplier => ({
    partyType: 'supplier',
    partyName: supplier.name,
    supplierId: supplier.id,
    gstNumber: supplier.gstNumber,
    mobileNumber: supplier.mobileNumber,
    entryCount: supplier._count.purchaseBills,
    runningBalance: roundMoney(supplier.purchaseBills.reduce((sum, bill) => sum + bill.grandTotal, 0))
  }));
}

export async function buildCustomerLedger(prisma, userId, partyName) {
  const [orders, invoices, bankEntries, notes] = await Promise.all([
    prisma.order.findMany({
      where: { userId, status: 'completed' },
      include: { customer: true },
      orderBy: [{ orderDate: 'asc' }, { createdAt: 'asc' }]
    }),
    prisma.salesInvoice.findMany({
      where: { userId },
      include: { customer: true, order: { select: { id: true, buyerName: true, typeBillNumber: true, transactionType: true } } },
      orderBy: [{ invoiceDate: 'asc' }, { createdAt: 'asc' }]
    }),
    prisma.bankEntry.findMany({
      where: { userId, partyType: 'customer' },
      orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }]
    }),
    prisma.creditDebitNote.findMany({
      where: { userId, noteSide: 'sales', status: { not: 'cancelled' } },
      orderBy: [{ noteDate: 'asc' }, { createdAt: 'asc' }]
    })
  ]);

  const invoicedOrderIds = new Set(invoices.map(inv => inv.orderId));
  const rawEntries = [];

  for (const order of orders) {
    if (!matchesPartyName(order, partyName)) continue;
    if (invoicedOrderIds.has(order.id)) continue;
    const amount = calculateOrderGrandTotal(order);
    if (amount <= 0) continue;
    const billNo = order.typeBillNumber != null ? String(order.typeBillNumber) : (order.orderNumber || order.invoiceNumber || order.id.slice(-6));
    rawEntries.push({
      id: `order-${order.id}`,
      sourceType: 'order',
      sourceId: order.id,
      date: order.orderDate || order.createdAt,
      voucherNumber: order.orderNumber || String(order.invoiceNumber || '-'),
      billNumber: billNo,
      account: order.transactionType || 'SALES',
      particulars: `Sales bill / order #${billNo}`,
      debitAmount: amount,
      creditAmount: 0
    });
  }

  for (const invoice of invoices) {
    const buyerSnapshot = invoice.buyerSnapshot && typeof invoice.buyerSnapshot === 'object' ? invoice.buyerSnapshot : {};
    const customerName = invoice.customer?.organizationName || buyerSnapshot.name || '';
    if (!matchesPartyName({ buyerName: customerName, customer: invoice.customer }, partyName)) continue;
    const amount = roundMoney(invoice.grandTotal);
    if (amount <= 0) continue;
    rawEntries.push({
      id: `invoice-${invoice.id}`,
      sourceType: 'sales_invoice',
      sourceId: invoice.id,
      date: invoice.invoiceDate,
      voucherNumber: invoice.order?.orderNumber || invoice.invoiceNumber,
      billNumber: invoice.invoiceNumber,
      account: invoice.order?.transactionType || 'SALES INVOICE',
      particulars: `Sales invoice #${invoice.invoiceNumber}`,
      debitAmount: amount,
      creditAmount: 0
    });
  }

  for (const note of notes) {
    if (!matchesNoteParty(note, partyName, 'customer')) continue;
    const amount = roundMoney(note.netAmountAfterTds || note.netAmount || note.grossAmount);
    if (amount <= 0) continue;
    const isCredit = note.noteKind === 'credit';
    rawEntries.push({
      id: `note-${note.id}`,
      sourceType: 'credit_debit_note',
      sourceId: note.id,
      date: note.noteDate,
      voucherNumber: String(note.voucherNumber || note.noteNumber || '-'),
      billNumber: note.noteNumber || String(note.voucherNumber || '-'),
      account: `${note.noteKind === 'credit' ? 'Credit' : 'Debit'} Note (Sales)`,
      particulars: `${note.noteKind === 'credit' ? 'Credit' : 'Debit'} note #${note.noteNumber || note.voucherNumber}${note.adjustBillNumber ? ` · Bill ${note.adjustBillNumber}` : ''}`,
      debitAmount: isCredit ? 0 : amount,
      creditAmount: isCredit ? amount : 0
    });
  }

  for (const entry of bankEntries) {
    if (!matchesPartyName({ buyerName: entry.partyName, customer: null }, partyName)) continue;
    const applied = roundMoney(entry.adjustAdd || entry.amount);
    if (applied <= 0) continue;
    if (entry.entryType === 'receipt') {
      rawEntries.push({
        id: `bank-${entry.id}`,
        sourceType: 'bank_entry',
        sourceId: entry.id,
        date: entry.entryDate,
        voucherNumber: entry.voucherNumber || '-',
        billNumber: entry.billNumber || entry.slipNumber || '-',
        account: entry.transactionType || 'BANK RECEIPT',
        particulars: `Bank receipt V.${entry.voucherNumber || '-'}${entry.remarks ? ` · ${entry.remarks}` : ''}`,
        debitAmount: 0,
        creditAmount: applied
      });
    } else {
      rawEntries.push({
        id: `bank-${entry.id}`,
        sourceType: 'bank_entry',
        sourceId: entry.id,
        date: entry.entryDate,
        voucherNumber: entry.voucherNumber || '-',
        billNumber: entry.billNumber || entry.slipNumber || '-',
        account: entry.transactionType || 'BANK PAYMENT',
        particulars: `Bank payment V.${entry.voucherNumber || '-'}`,
        debitAmount: applied,
        creditAmount: 0
      });
    }
  }

  rawEntries.sort(sortByDate);
  const ledger = withRunningBalance(rawEntries, 'customer');
  const runningBalance = ledger.length ? ledger[ledger.length - 1].runningBalance : 0;
  const balanceType = ledger.length ? ledger[ledger.length - 1].balanceType : 'DR';

  return {
    partyType: 'customer',
    partyName,
    ledger,
    runningBalance,
    balanceType,
    totalDebit: roundMoney(ledger.reduce((sum, row) => sum + row.debitAmount, 0)),
    totalCredit: roundMoney(ledger.reduce((sum, row) => sum + row.creditAmount, 0))
  };
}

export async function buildSupplierLedger(prisma, userId, supplierId) {
  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, userId },
    include: {
      purchaseBills: { orderBy: [{ billDate: 'asc' }, { createdAt: 'asc' }] }
    }
  });

  if (!supplier) return null;

  const [bankEntries, notes] = await Promise.all([
    prisma.bankEntry.findMany({
      where: { userId, partyType: 'supplier' },
      orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }]
    }),
    prisma.creditDebitNote.findMany({
      where: { userId, noteSide: 'purchase', status: { not: 'cancelled' } },
      orderBy: [{ noteDate: 'asc' }, { createdAt: 'asc' }]
    })
  ]);

  const rawEntries = [];

  for (const bill of supplier.purchaseBills) {
    const amount = roundMoney(bill.grandTotal);
    if (amount <= 0) continue;
    rawEntries.push({
      id: `bill-${bill.id}`,
      sourceType: 'purchase_bill',
      sourceId: bill.id,
      date: bill.billDate || bill.createdAt,
      voucherNumber: bill.voucherNumber || '-',
      billNumber: bill.billNumber || String(bill.typeBillNumber || '-'),
      account: bill.transactionType || 'FINISH PURCHASE',
      particulars: `Purchase bill #${bill.billNumber || bill.typeBillNumber || '-'}`,
      debitAmount: 0,
      creditAmount: amount,
      lineCount: Array.isArray(bill.lineItems) ? bill.lineItems.length : 0
    });
  }

  for (const note of notes) {
    if (!matchesNoteParty(note, supplier.name, 'supplier')) continue;
    const amount = roundMoney(note.netAmountAfterTds || note.netAmount || note.grossAmount);
    if (amount <= 0) continue;
    const isCredit = note.noteKind === 'credit';
    rawEntries.push({
      id: `note-${note.id}`,
      sourceType: 'credit_debit_note',
      sourceId: note.id,
      date: note.noteDate,
      voucherNumber: String(note.voucherNumber || note.noteNumber || '-'),
      billNumber: note.noteNumber || String(note.voucherNumber || '-'),
      account: `${note.noteKind === 'credit' ? 'Credit' : 'Debit'} Note (Purchase)`,
      particulars: `${note.noteKind === 'credit' ? 'Credit' : 'Debit'} note #${note.noteNumber || note.voucherNumber}`,
      debitAmount: isCredit ? amount : 0,
      creditAmount: isCredit ? 0 : amount
    });
  }

  for (const entry of bankEntries) {
    if (!matchesSupplierName(entry.partyName, supplier.name)) continue;
    const applied = roundMoney(entry.adjustAdd || entry.amount);
    if (applied <= 0) continue;
    if (entry.entryType === 'payment') {
      rawEntries.push({
        id: `bank-${entry.id}`,
        sourceType: 'bank_entry',
        sourceId: entry.id,
        date: entry.entryDate,
        voucherNumber: entry.voucherNumber || '-',
        billNumber: entry.billNumber || entry.slipNumber || '-',
        account: entry.transactionType || 'BANK PAYMENT',
        particulars: `Bank payment V.${entry.voucherNumber || '-'}`,
        debitAmount: applied,
        creditAmount: 0
      });
    } else {
      rawEntries.push({
        id: `bank-${entry.id}`,
        sourceType: 'bank_entry',
        sourceId: entry.id,
        date: entry.entryDate,
        voucherNumber: entry.voucherNumber || '-',
        billNumber: entry.billNumber || entry.slipNumber || '-',
        account: entry.transactionType || 'BANK RECEIPT',
        particulars: `Bank receipt V.${entry.voucherNumber || '-'}`,
        debitAmount: 0,
        creditAmount: applied
      });
    }
  }

  rawEntries.sort(sortByDate);
  const ledger = withRunningBalance(rawEntries, 'supplier');
  const runningBalance = ledger.length ? ledger[ledger.length - 1].runningBalance : 0;
  const balanceType = ledger.length ? ledger[ledger.length - 1].balanceType : 'CR';

  return {
    partyType: 'supplier',
    partyName: supplier.name,
    supplierId: supplier.id,
    supplier,
    ledger,
    runningBalance,
    balanceType,
    totalDebit: roundMoney(ledger.reduce((sum, row) => sum + row.debitAmount, 0)),
    totalCredit: roundMoney(ledger.reduce((sum, row) => sum + row.creditAmount, 0))
  };
}
