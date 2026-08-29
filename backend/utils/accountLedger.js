import {
  calculateOrderGrandTotal,
  getOrderPartyName,
  isSalesGoodsReturn,
  matchesPartyName,
  matchesSupplierName,
  normalizeBillAllocations,
  normalizeOrderLines,
  roundMoney
} from './orderBilling.js';
import { isPurchaseReturn } from './erpLineItems.js';
import { isExpensePurchaseType } from '../constants/erpTransactionTypes.js';
import { postingTdsAccount } from '../constants/erpTransactionPostingRules.js';
import { matchesNoteParty } from './creditDebitNotes.js';

const sortByDate = (a, b) => {
  const da = new Date(a.date).getTime();
  const db = new Date(b.date).getTime();
  if (da !== db) return da - db;
  return String(a.sourceType).localeCompare(String(b.sourceType));
};

function withRunningBalance(entries, balanceMode, initialRunning = 0) {
  let running = Number(initialRunning) || 0;
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
      where: {
        userId,
        status: 'completed',
        OR: [{ transactionType: null }, { transactionType: { not: 'SALES ORDERS' } }]
      },
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
  const [suppliers, greyPurchases, greyReturns, millReceipts, workReceipts] = await Promise.all([
    prisma.supplier.findMany({
      where: { userId },
      include: {
        purchaseBills: {
          where: { status: { not: 'cancelled' } },
          select: { grandTotal: true }
        },
        _count: { select: { purchaseBills: true } }
      },
      orderBy: { name: 'asc' }
    }),
    prisma.greyPurchase.findMany({
      where: { userId, status: { not: 'cancelled' } },
      select: { supplierId: true, partyName: true, netAmount: true }
    }),
    prisma.greyPurchaseReturn.findMany({
      where: { userId, status: { not: 'cancelled' } },
      select: {
        partyName: true,
        netAmount: true,
        greyPurchase: { select: { supplierId: true, partyName: true } }
      }
    }),
    prisma.millReceipt.findMany({
      where: { userId, status: { not: 'cancelled' } },
      select: {
        millName: true,
        processType: true,
        netAfterTds: true,
        invoiceValue: true,
        tdsAmount: true,
        tdsPercent: true,
        tdsOnAmt: true,
        taxableAmount: true,
        jobAmount: true
      }
    }),
    prisma.workReceipt.findMany({
      where: { userId, status: { not: 'cancelled' } },
      select: {
        partyName: true,
        invoiceValue: true,
        taxableAmount: true,
        grossAmount: true,
        tdsPercent: true,
        tdsAmount: true,
        tdsOnAmt: true,
        netAfterTds: true
      }
    })
  ]);

  return suppliers.map(supplier => {
    let runningBalance = supplier.purchaseBills.reduce((sum, bill) => sum + bill.grandTotal, 0);
    let entryCount = supplier._count.purchaseBills;

    for (const grey of greyPurchases) {
      if (grey.supplierId !== supplier.id && !matchesSupplierName(supplier.name, grey.partyName)) continue;
      runningBalance = roundMoney(runningBalance + grey.netAmount);
      entryCount += 1;
    }

    for (const ret of greyReturns) {
      const linkedToSupplier = ret.greyPurchase?.supplierId === supplier.id
        || matchesSupplierName(supplier.name, ret.partyName)
        || matchesSupplierName(supplier.name, ret.greyPurchase?.partyName);
      if (!linkedToSupplier) continue;
      runningBalance = roundMoney(runningBalance - ret.netAmount);
      entryCount += 1;
    }

    for (const receipt of millReceipts) {
      if (!matchesSupplierName(supplier.name, receipt.millName)) continue;
      if (String(receipt.processType || '').toUpperCase() === 'RETURN') continue;
      const tdsPercent = Number(receipt.tdsPercent) || 0;
      let tdsAmount = roundMoney(receipt.tdsAmount || 0);
      if (tdsAmount <= 0 && tdsPercent > 0) {
        const base = roundMoney(receipt.tdsOnAmt || receipt.taxableAmount || receipt.jobAmount || 0);
        tdsAmount = roundMoney(base * tdsPercent / 100);
      }
      const invoiceValue = roundMoney(
        receipt.invoiceValue
        || (Number(receipt.netAfterTds || 0) + tdsAmount)
        || 0
      );
      // Net payable = invoice credit − TDS debit
      runningBalance = roundMoney(runningBalance + invoiceValue - tdsAmount);
      entryCount += 1 + (tdsAmount > 0 ? 1 : 0);
    }

    for (const receipt of workReceipts) {
      if (!matchesSupplierName(supplier.name, receipt.partyName)) continue;
      const tdsPercent = Number(receipt.tdsPercent) || 0;
      const taxable = roundMoney(receipt.taxableAmount || receipt.grossAmount || 0);
      const tdsAmount = tdsPercent > 0 ? roundMoney(taxable * tdsPercent / 100) : 0;
      const invoiceValue = roundMoney(receipt.invoiceValue || receipt.taxableAmount || 0);
      if (invoiceValue <= 0 && tdsAmount <= 0) continue;
      runningBalance = roundMoney(runningBalance + invoiceValue - tdsAmount);
      entryCount += 1 + (tdsAmount > 0 ? 1 : 0);
    }

    return {
      partyType: 'supplier',
      partyName: supplier.name,
      supplierId: supplier.id,
      gstNumber: supplier.gstNumber,
      mobileNumber: supplier.mobileNumber,
      entryCount,
      runningBalance
    };
  });
}

/** Single-account list: customers + suppliers merged by name (Dynamic Ledger). */
export async function getAllLedgerParties(prisma, userId) {
  const [customers, suppliers] = await Promise.all([
    getCustomerLedgerParties(prisma, userId),
    getSupplierLedgerParties(prisma, userId)
  ]);
  const map = new Map();
  for (const party of customers) {
    const key = String(party.partyName || '').trim().toLowerCase();
    if (!key) continue;
    map.set(key, {
      partyType: 'customer',
      partyName: party.partyName,
      customerId: party.customerId || null,
      supplierId: null,
      gstNumber: party.gstNumber || null,
      mobileNumber: party.mobileNumber || null,
      entryCount: party.entryCount || 0,
      runningBalance: party.runningBalance || 0
    });
  }
  for (const party of suppliers) {
    const key = String(party.partyName || '').trim().toLowerCase();
    if (!key) continue;
    const existing = map.get(key);
    if (existing) {
      map.set(key, {
        ...existing,
        partyType: 'both',
        supplierId: party.supplierId || existing.supplierId,
        customerId: existing.customerId,
        gstNumber: party.gstNumber || existing.gstNumber,
        mobileNumber: party.mobileNumber || existing.mobileNumber,
        entryCount: (existing.entryCount || 0) + (party.entryCount || 0),
        runningBalance: roundMoney((existing.runningBalance || 0) + (party.runningBalance || 0))
      });
    } else {
      map.set(key, {
        partyType: 'supplier',
        partyName: party.partyName,
        customerId: null,
        supplierId: party.supplierId || null,
        gstNumber: party.gstNumber || null,
        mobileNumber: party.mobileNumber || null,
        entryCount: party.entryCount || 0,
        runningBalance: party.runningBalance || 0
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.partyName.localeCompare(b.partyName));
}

function finalizeLedgerRows(rawEntries, partyType, partyName, extra = {}, opening = null) {
  const mode = partyType === 'customer' ? 'customer' : 'supplier';
  let openingRunning = 0;
  let openingDebit = 0;
  let openingCredit = 0;
  if (opening) {
    openingDebit = roundMoney(opening.debit || 0);
    openingCredit = roundMoney(opening.credit || 0);
    openingRunning = mode === 'customer'
      ? roundMoney(openingDebit - openingCredit)
      : roundMoney(openingCredit - openingDebit);
  }

  const sorted = [...rawEntries].sort(sortByDate);
  const ledger = withRunningBalance(sorted, mode, openingRunning).map(entry => ({
    ...entry,
    date: entry.date instanceof Date ? entry.date.toISOString() : entry.date,
    runningBalance: Math.abs(entry.runningBalance),
  }));
  const last = ledger[ledger.length - 1];

  return {
    partyType,
    partyName,
    ...extra,
    openingDebit,
    openingCredit,
    openingBalance: Math.abs(openingRunning),
    openingBalanceType: mode === 'customer'
      ? (openingRunning >= 0 ? 'DR' : 'CR')
      : (openingRunning >= 0 ? 'CR' : 'DR'),
    ledger,
    runningBalance: last ? last.runningBalance : Math.abs(openingRunning),
    balanceType: last
      ? last.balanceType
      : (mode === 'customer'
        ? (openingRunning >= 0 ? 'DR' : 'CR')
        : (openingRunning >= 0 ? 'CR' : 'DR')),
    totalDebit: roundMoney(ledger.reduce((s, r) => s + (r.debitAmount || 0), 0)),
    totalCredit: roundMoney(ledger.reduce((s, r) => s + (r.creditAmount || 0), 0))
  };
}

function toDayStart(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDayEnd(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Unified single-account ledger (customer and/or supplier activity for one A/C name). */
export async function buildUnifiedPartyLedger(prisma, userId, { partyName, supplierId, customerId, fromDate, toDate }) {
  const name = String(partyName || '').trim();
  if (!name) return null;

  let resolvedSupplierId = supplierId || null;
  if (!resolvedSupplierId) {
    const supplier = await prisma.supplier.findFirst({
      where: { userId, name: { equals: name, mode: 'insensitive' } },
      select: { id: true }
    });
    resolvedSupplierId = supplier?.id || null;
  }

  const chunks = [];
  if (resolvedSupplierId) {
    const supplierLedger = await buildSupplierLedger(prisma, userId, resolvedSupplierId);
    if (supplierLedger?.ledger?.length) chunks.push(supplierLedger);
  }

  const customerLedger = await buildCustomerLedger(prisma, userId, name);
  if (customerLedger?.ledger?.length) chunks.push(customerLedger);

  const emptyResult = {
    partyType: resolvedSupplierId ? 'supplier' : 'customer',
    partyName: name,
    supplierId: resolvedSupplierId,
    customerId: customerId || null,
    fromDate: fromDate || null,
    toDate: toDate || null,
    ledger: [],
    openingDebit: 0,
    openingCredit: 0,
    openingBalance: 0,
    openingBalanceType: resolvedSupplierId ? 'CR' : 'DR',
    runningBalance: 0,
    balanceType: resolvedSupplierId ? 'CR' : 'DR',
    totalDebit: 0,
    totalCredit: 0
  };

  if (!chunks.length) {
    return emptyResult;
  }

  const byId = new Map();
  for (const chunk of chunks) {
    for (const row of chunk.ledger || []) {
      byId.set(row.id, {
        id: row.id,
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        date: row.date,
        voucherNumber: row.voucherNumber,
        billNumber: row.billNumber,
        account: row.account,
        particulars: row.particulars,
        remarks: row.remarks,
        debitAmount: row.debitAmount || 0,
        creditAmount: row.creditAmount || 0
      });
    }
  }

  const allRows = Array.from(byId.values());
  const from = toDayStart(fromDate);
  const to = toDayEnd(toDate);

  let openingDebit = 0;
  let openingCredit = 0;
  if (from) {
    for (const row of allRows) {
      const d = new Date(row.date);
      if (d < from) {
        openingDebit = roundMoney(openingDebit + (row.debitAmount || 0));
        openingCredit = roundMoney(openingCredit + (row.creditAmount || 0));
      }
    }
  }

  const filtered = allRows.filter(row => {
    const d = new Date(row.date);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });

  const partyType = resolvedSupplierId && (customerId || chunks.length > 1)
    ? 'both'
    : (resolvedSupplierId ? 'supplier' : 'customer');

  return finalizeLedgerRows(
    filtered,
    partyType,
    name,
    {
      supplierId: resolvedSupplierId,
      customerId: customerId || null,
      fromDate: fromDate || null,
      toDate: toDate || null
    },
    { debit: openingDebit, credit: openingCredit }
  );
}

export async function buildCustomerLedger(prisma, userId, partyName) {
  const [orders, invoices, bankEntries, notes] = await Promise.all([
    prisma.order.findMany({
      where: {
        userId,
        status: 'completed',
        OR: [{ transactionType: null }, { transactionType: { not: 'SALES ORDERS' } }]
      },
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
    const goodsReturn = isSalesGoodsReturn(order.transactionType);
    rawEntries.push({
      id: `order-${order.id}`,
      sourceType: 'order',
      sourceId: order.id,
      date: order.orderDate || order.createdAt,
      voucherNumber: order.orderNumber || String(order.invoiceNumber || '-'),
      billNumber: billNo,
      account: order.transactionType || 'SALES',
      particulars: goodsReturn ? `Sales goods return #${billNo}` : `Sales bill / order #${billNo}`,
      debitAmount: goodsReturn ? 0 : amount,
      creditAmount: goodsReturn ? amount : 0
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
    const purchaseReturn = isPurchaseReturn(bill.transactionType);
    rawEntries.push({
      id: `bill-${bill.id}`,
      sourceType: 'purchase_bill',
      sourceId: bill.id,
      date: bill.billDate || bill.createdAt,
      voucherNumber: bill.voucherNumber || '-',
      billNumber: bill.billNumber || String(bill.typeBillNumber || '-'),
      account: bill.purchaseAccount || bill.transactionType || 'FINISH PURCHASE',
      particulars: purchaseReturn
        ? `Purchase return #${bill.billNumber || bill.typeBillNumber || '-'}`
        : isExpensePurchaseType(bill.transactionType)
          ? `Expense ${bill.transactionType || ''} #${bill.billNumber || bill.typeBillNumber || '-'}${bill.purchaseAccount ? ` · ${bill.purchaseAccount}` : ''}`
          : `Purchase bill #${bill.billNumber || bill.typeBillNumber || '-'}`,
      debitAmount: purchaseReturn ? amount : 0,
      creditAmount: purchaseReturn ? 0 : amount,
      lineCount: Array.isArray(bill.lineItems) ? bill.lineItems.length : 0
    });
  }

  const greyPurchases = await prisma.greyPurchase.findMany({
    where: {
      userId,
      status: { not: 'cancelled' },
      OR: [
        { supplierId: supplier.id },
        { partyName: supplier.name }
      ]
    },
    orderBy: [{ billDate: 'asc' }, { createdAt: 'asc' }]
  });

  for (const grey of greyPurchases) {
    const amount = roundMoney(grey.netAmount);
    if (amount <= 0) continue;
    rawEntries.push({
      id: `grey-${grey.id}`,
      sourceType: 'grey_purchase',
      sourceId: grey.id,
      date: grey.billDate || grey.createdAt,
      voucherNumber: String(grey.srNo || '-'),
      billNumber: grey.billNo || String(grey.srNo || '-'),
      account: 'GREY PURCHASE',
      particulars: grey.quality ? String(grey.quality) : '',
      remarks: grey.remarks || '',
      debitAmount: 0,
      creditAmount: amount
    });
  }

  const greyReturns = await prisma.greyPurchaseReturn.findMany({
    where: {
      userId,
      status: { not: 'cancelled' },
      OR: [
        { partyName: supplier.name },
        { greyPurchase: { supplierId: supplier.id } },
        { greyPurchase: { partyName: supplier.name } }
      ]
    },
    include: {
      greyPurchase: { select: { srNo: true, billNo: true, partyName: true, supplierId: true } }
    },
    orderBy: [{ returnDate: 'asc' }, { createdAt: 'asc' }]
  });

  for (const ret of greyReturns) {
    const linkedToSupplier = ret.greyPurchase?.supplierId === supplier.id
      || matchesSupplierName(supplier.name, ret.partyName)
      || matchesSupplierName(supplier.name, ret.greyPurchase?.partyName);
    if (!linkedToSupplier) continue;

    const amount = roundMoney(ret.netAmount);
    if (amount <= 0) continue;
    const adjustBill = ret.adjustBillNo || ret.refBillNo || ret.greyPurchase?.billNo;
    rawEntries.push({
      id: `grey-return-${ret.id}`,
      sourceType: 'grey_purchase_return',
      sourceId: ret.id,
      date: ret.returnDate || ret.createdAt,
      voucherNumber: String(ret.voucherNo || ret.challanNo || '-'),
      billNumber: ret.billNo || ret.refBillNo || String(ret.voucherNo || '-'),
      account: ret.saleAccount || 'GREY PURCHASE RETURN',
      particulars: ret.quality ? String(ret.quality) : '',
      remarks: adjustBill
        ? `ADJUSTED AGAINST BILL NO. ${adjustBill}`
        : (ret.remarks || ''),
      debitAmount: amount,
      creditAmount: 0
    });
  }

  const millReceipts = await prisma.millReceipt.findMany({
    where: {
      userId,
      status: { not: 'cancelled' }
    },
    orderBy: [{ receiptDate: 'asc' }, { createdAt: 'asc' }]
  });

  for (const receipt of millReceipts) {
    if (!matchesSupplierName(supplier.name, receipt.millName)) continue;
    // RETURN / reprocess: mill sent grey back unfinished — no ledger posting
    if (String(receipt.processType || '').toUpperCase() === 'RETURN') continue;
    const tdsPercent = Number(receipt.tdsPercent) || 0;
    let tdsAmount = roundMoney(receipt.tdsAmount || 0);
    // Repair older rows saved with TDS % but tdsOnAmt/tdsAmount stuck at 0
    if (tdsAmount <= 0 && tdsPercent > 0) {
      const base = roundMoney(receipt.tdsOnAmt || receipt.taxableAmount || receipt.jobAmount || 0);
      tdsAmount = roundMoney(base * tdsPercent / 100);
    }
    const invoiceValue = roundMoney(
      receipt.invoiceValue
      || (Number(receipt.netAfterTds || 0) + tdsAmount)
      || 0
    );
    if (invoiceValue <= 0 && tdsAmount <= 0) continue;

    // Legacy: full invoice as JOB CHARGES credit
    if (invoiceValue > 0) {
      rawEntries.push({
        id: `mill-receipt-${receipt.id}`,
        sourceType: 'mill_receipt',
        sourceId: receipt.id,
        date: receipt.receiptDate || receipt.createdAt,
        voucherNumber: String(receipt.voucherNo || '-'),
        billNumber: receipt.billNo || String(receipt.voucherNo || '-'),
        account: 'JOB CHARGES',
        particulars: receipt.quality || receipt.lotNo || '',
        remarks: receipt.remarks || '',
        debitAmount: 0,
        creditAmount: invoiceValue
      });
    }

    // Legacy image-031: TDS PAYABLE A/C as debit reducing mill payable
    if (tdsAmount > 0) {
      rawEntries.push({
        id: `mill-receipt-tds-${receipt.id}`,
        sourceType: 'mill_receipt_tds',
        sourceId: receipt.id,
        date: receipt.receiptDate || receipt.createdAt,
        voucherNumber: String(receipt.voucherNo || '-'),
        billNumber: receipt.billNo || String(receipt.voucherNo || '-'),
        account: postingTdsAccount(receipt.entryType) || 'TDS PAYABLE A/C',
        particulars: `TDS ${roundMoney(tdsPercent)}%`,
        remarks: '',
        debitAmount: tdsAmount,
        creditAmount: 0
      });
    }
  }

  const workReceipts = await prisma.workReceipt.findMany({
    where: { userId, status: { not: 'cancelled' } },
    orderBy: [{ receiptDate: 'asc' }, { createdAt: 'asc' }]
  });

  for (const receipt of workReceipts) {
    if (!matchesSupplierName(supplier.name, receipt.partyName)) continue;
    const tdsPercent = Number(receipt.tdsPercent) || 0;
    // Always derive TDS from taxable × % (same as entry UI) — ignore stale saved tdsAmount/tdsOnAmt
    const taxable = roundMoney(receipt.taxableAmount || receipt.grossAmount || 0);
    const tdsAmount = tdsPercent > 0 ? roundMoney(taxable * tdsPercent / 100) : 0;
    const invoiceValue = roundMoney(
      receipt.invoiceValue
      || (Number(receipt.netAfterTds || 0) + tdsAmount)
      || receipt.taxableAmount
      || 0
    );
    if (invoiceValue <= 0 && tdsAmount <= 0) continue;

    if (invoiceValue > 0) {
      rawEntries.push({
        id: `work-receipt-${receipt.id}`,
        sourceType: 'work_receipt',
        sourceId: receipt.id,
        date: receipt.receiptDate || receipt.createdAt,
        voucherNumber: String(receipt.voucherNo || '-'),
        billNumber: receipt.billNo || receipt.challanNo || String(receipt.voucherNo || '-'),
        account: 'EMB JOB CHARGES',
        particulars: receipt.workType || '',
        remarks: receipt.remarks || '',
        debitAmount: 0,
        creditAmount: invoiceValue
      });
    }

    if (tdsAmount > 0) {
      rawEntries.push({
        id: `work-receipt-tds-${receipt.id}`,
        sourceType: 'work_receipt_tds',
        sourceId: receipt.id,
        date: receipt.receiptDate || receipt.createdAt,
        voucherNumber: String(receipt.voucherNo || '-'),
        billNumber: receipt.billNo || receipt.challanNo || String(receipt.voucherNo || '-'),
        account: postingTdsAccount(receipt.transactionType) || 'TDS PAYABLE A/C',
        particulars: `TDS ${roundMoney(tdsPercent)}%`,
        remarks: `TDS ${roundMoney(tdsPercent)}% on ${taxable.toFixed(2)}`,
        debitAmount: tdsAmount,
        creditAmount: 0
      });
    }
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

const VALID_SOURCE_TYPES = new Set([
  'order',
  'sales_invoice',
  'purchase_bill',
  'bank_entry',
  'credit_debit_note',
  'grey_purchase',
  'grey_purchase_return',
  'mill_receipt',
  'mill_receipt_tds',
  'work_receipt',
  'work_receipt_tds'
]);

function buildDetailFields(items) {
  return items.filter(item => item && item.value !== undefined && item.value !== null && item.value !== '');
}

function toIsoDate(value) {
  if (!value) return '';
  return new Date(value).toISOString();
}

async function resolveBillNumbers(prisma, userId, allocations) {
  const orderIds = allocations.filter(item => item.billType === 'order').map(item => item.billId);
  const purchaseIds = allocations.filter(item => item.billType === 'purchase_bill').map(item => item.billId);
  const noteIds = allocations.filter(item => item.billType === 'credit_debit_note').map(item => item.billId);

  const [orders, bills, notes] = await Promise.all([
    orderIds.length
      ? prisma.order.findMany({
        where: { userId, id: { in: orderIds } },
        select: { id: true, typeBillNumber: true, orderNumber: true, invoiceNumber: true }
      })
      : [],
    purchaseIds.length
      ? prisma.purchaseBill.findMany({
        where: { userId, id: { in: purchaseIds } },
        select: { id: true, typeBillNumber: true, billNumber: true, voucherNumber: true }
      })
      : [],
    noteIds.length
      ? prisma.creditDebitNote.findMany({
        where: { userId, id: { in: noteIds } },
        select: { id: true, noteNumber: true, voucherNumber: true }
      })
      : []
  ]);

  const orderMap = new Map(orders.map(order => [
    order.id,
    order.typeBillNumber != null
      ? String(order.typeBillNumber)
      : (order.orderNumber || String(order.invoiceNumber || order.id.slice(-6)))
  ]));
  const billMap = new Map(bills.map(bill => [
    bill.id,
    bill.typeBillNumber != null
      ? String(bill.typeBillNumber)
      : (bill.billNumber || bill.voucherNumber || bill.id.slice(-6))
  ]));
  const noteMap = new Map(notes.map(note => [
    note.id,
    note.noteNumber || String(note.voucherNumber || note.id.slice(-6))
  ]));

  return allocations.map(allocation => {
    const billNumber = allocation.billType === 'order'
      ? orderMap.get(allocation.billId)
      : allocation.billType === 'purchase_bill'
        ? billMap.get(allocation.billId)
        : allocation.billType === 'credit_debit_note'
          ? noteMap.get(allocation.billId)
          : allocation.billNumber || allocation.billId?.slice(-6);
    return {
      billType: allocation.billType || '-',
      billNumber: billNumber || allocation.billId?.slice(-6) || '-',
      adjustAmount: roundMoney(allocation.adjustAmount)
    };
  });
}

export async function getLedgerEntryDetail(prisma, userId, sourceType, sourceId) {
  if (!VALID_SOURCE_TYPES.has(sourceType)) return null;

  if (sourceType === 'order') {
    const order = await prisma.order.findFirst({
      where: { id: sourceId, userId },
      include: { customer: true, design: true }
    });
    if (!order) return null;

    const lines = normalizeOrderLines(order.orderLines);
    const grandTotal = calculateOrderGrandTotal(order);
    const billNo = order.typeBillNumber != null
      ? String(order.typeBillNumber)
      : (order.orderNumber || order.invoiceNumber || order.id.slice(-6));

    const goodsReturn = isSalesGoodsReturn(order.transactionType);
    return {
      title: goodsReturn ? `Sales Goods Return #${billNo}` : `Sales Bill #${billNo}`,
      subtitle: getOrderPartyName(order),
      sourceType,
      sourceId,
      canEdit: order.manualType === 'erp_sales',
      editPath: order.manualType === 'erp_sales' ? `/erp/sales?edit=${order.id}&kind=bill` : undefined,
      fields: buildDetailFields([
        { label: 'Date', value: toIsoDate(order.orderDate || order.createdAt) },
        { label: 'Order No.', value: order.orderNumber || '-' },
        { label: 'Invoice No.', value: order.invoiceNumber != null ? String(order.invoiceNumber) : '' },
        { label: 'Status', value: order.status },
        { label: 'Transaction Type', value: order.transactionType },
        { label: 'Agent', value: order.agentName },
        { label: 'Transport', value: order.transportName },
        { label: 'Discount %', value: order.discountRate != null ? String(order.discountRate) : '' },
        { label: 'Shipping', value: order.shippingCharge, isMoney: true },
        { label: 'Grand Total', value: grandTotal, isMoney: true },
        { label: 'Remarks', value: order.remarks }
      ]),
      lineColumns: [
        { key: 'description', label: 'Item' },
        { key: 'quantity', label: 'Qty', align: 'right' },
        { key: 'rate', label: 'Rate', align: 'right', isMoney: true },
        { key: 'amount', label: 'Amount', align: 'right', isMoney: true }
      ],
      lineItems: lines.map(line => {
        const rate = Number(line.retailPrice ?? line.basePrice ?? 0);
        const qty = parseInt(line.quantity, 10) || 0;
        return {
          description: line.designName || line.title || line.designCode || line.remarks || 'Item',
          quantity: qty,
          rate: roundMoney(rate),
          amount: roundMoney(rate * qty)
        };
      })
    };
  }

  if (sourceType === 'sales_invoice') {
    const invoice = await prisma.salesInvoice.findFirst({
      where: { id: sourceId, userId },
      include: { customer: true, order: { select: { orderNumber: true, transactionType: true } } }
    });
    if (!invoice) return null;

    const buyerSnapshot = invoice.buyerSnapshot && typeof invoice.buyerSnapshot === 'object'
      ? invoice.buyerSnapshot
      : {};
    const lineItems = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];

    return {
      title: `Sales Invoice #${invoice.invoiceNumber}`,
      subtitle: invoice.customer?.organizationName || buyerSnapshot.name || '',
      sourceType,
      sourceId,
      fields: buildDetailFields([
        { label: 'Date', value: toIsoDate(invoice.invoiceDate) },
        { label: 'Order No.', value: invoice.order?.orderNumber || '-' },
        { label: 'Status', value: invoice.status },
        { label: 'Place of Supply', value: invoice.placeOfSupply },
        { label: 'Taxable', value: invoice.taxableAmount, isMoney: true },
        { label: 'Discount', value: invoice.discountAmount, isMoney: true },
        { label: 'CGST', value: invoice.cgstAmount, isMoney: true },
        { label: 'SGST', value: invoice.sgstAmount, isMoney: true },
        { label: 'IGST', value: invoice.igstAmount, isMoney: true },
        { label: 'Grand Total', value: invoice.grandTotal, isMoney: true },
        { label: 'Paid', value: invoice.amountPaid, isMoney: true },
        { label: 'Due', value: invoice.amountDue, isMoney: true },
        { label: 'Notes', value: invoice.notes }
      ]),
      lineColumns: [
        { key: 'description', label: 'Item' },
        { key: 'quantity', label: 'Qty', align: 'right' },
        { key: 'rate', label: 'Rate', align: 'right', isMoney: true },
        { key: 'taxableAmount', label: 'Taxable', align: 'right', isMoney: true }
      ],
      lineItems: lineItems.map(line => ({
        description: line.description || line.designName || line.designCode || 'Item',
        quantity: line.quantity,
        rate: roundMoney(line.rate),
        taxableAmount: roundMoney(line.taxableAmount ?? line.grossAmount ?? 0)
      }))
    };
  }

  if (sourceType === 'purchase_bill') {
    const bill = await prisma.purchaseBill.findFirst({
      where: { id: sourceId, userId },
      include: { supplier: true }
    });
    if (!bill) return null;

    const billNo = bill.typeBillNumber != null
      ? String(bill.typeBillNumber)
      : (bill.billNumber || bill.voucherNumber || bill.id.slice(-6));
    const lineItems = Array.isArray(bill.lineItems) ? bill.lineItems : [];

    return {
      title: isPurchaseReturn(bill.transactionType)
        ? `Purchase Return #${billNo}`
        : isExpensePurchaseType(bill.transactionType)
          ? `Expense #${billNo}`
          : `Purchase Bill #${billNo}`,
      subtitle: bill.supplier?.name || '',
      sourceType,
      sourceId,
      canEdit: true,
      editPath: isExpensePurchaseType(bill.transactionType)
        ? `/erp/expenses?edit=${bill.id}`
        : `/erp/purchase?edit=${bill.id}`,
      fields: buildDetailFields([
        { label: 'Date', value: toIsoDate(bill.billDate || bill.createdAt) },
        { label: 'Voucher', value: bill.voucherNumber },
        { label: 'Transaction Type', value: bill.transactionType },
        { label: 'Pur A/C', value: bill.purchaseAccount },
        { label: 'Broker', value: bill.agentName },
        { label: 'Station', value: bill.station },
        { label: 'Status', value: bill.status },
        { label: 'Taxable', value: bill.taxableAmount, isMoney: true },
        { label: 'Discount', value: bill.discountAmount, isMoney: true },
        { label: 'CGST', value: bill.cgstAmount, isMoney: true },
        { label: 'SGST', value: bill.sgstAmount, isMoney: true },
        { label: 'IGST', value: bill.igstAmount, isMoney: true },
        { label: 'Grand Total', value: bill.grandTotal, isMoney: true }
      ]),
      lineColumns: [
        { key: 'description', label: 'Item' },
        { key: 'hsnCode', label: 'HSN' },
        { key: 'quantity', label: 'Qty', align: 'right' },
        { key: 'cut', label: 'Cut', align: 'right' },
        { key: 'pcs', label: 'Pcs', align: 'right' },
        { key: 'unit', label: 'Unit' },
        { key: 'rate', label: 'Rate', align: 'right', isMoney: true },
        { key: 'amount', label: 'Amount', align: 'right', isMoney: true }
      ],
      lineItems: lineItems.map(line => ({
        description: line.description || 'Item',
        hsnCode: line.hsnCode || '-',
        quantity: line.quantity ?? '-',
        cut: line.cut ?? '-',
        pcs: line.pcs ?? '-',
        unit: line.unit || '-',
        rate: line.rate != null ? roundMoney(line.rate) : '-',
        amount: roundMoney(line.amount ?? 0)
      }))
    };
  }

  if (sourceType === 'mill_receipt' || sourceType === 'mill_receipt_tds') {
    const receipt = await prisma.millReceipt.findFirst({
      where: { id: sourceId, userId },
      include: { greyDispatch: true }
    });
    if (!receipt) return null;

    const takaDetails = Array.isArray(receipt.takaDetails) ? receipt.takaDetails : [];
    const isTdsLine = sourceType === 'mill_receipt_tds';
    const tdsPercent = Number(receipt.tdsPercent) || 0;
    let tdsOnAmt = roundMoney(receipt.tdsOnAmt || 0);
    let tdsAmount = roundMoney(receipt.tdsAmount || 0);
    if (tdsPercent > 0 && (tdsOnAmt <= 0 || tdsAmount <= 0)) {
      if (tdsOnAmt <= 0) {
        tdsOnAmt = roundMoney(receipt.taxableAmount || receipt.jobAmount || 0);
      }
      if (tdsAmount <= 0) {
        tdsAmount = roundMoney(tdsOnAmt * tdsPercent / 100);
      }
    }
    const invoiceValue = roundMoney(receipt.invoiceValue || 0);
    const netAfterTds = tdsAmount > 0
      ? roundMoney(invoiceValue - tdsAmount)
      : roundMoney(receipt.netAfterTds || invoiceValue);

    return {
      title: isTdsLine
        ? `TDS on Mill Receipt #${receipt.voucherNo ?? '-'}`
        : `Mill Receipt #${receipt.voucherNo ?? '-'}`,
      subtitle: receipt.millName,
      sourceType,
      sourceId,
      canEdit: true,
      editPath: `/erp/mill-receipt?edit=${receipt.id}`,
      fields: buildDetailFields([
        { label: 'Date', value: toIsoDate(receipt.receiptDate) },
        { label: 'Lot No.', value: receipt.lotNo },
        { label: 'Desp. No.', value: receipt.despNo },
        { label: 'Bill No.', value: receipt.billNo },
        { label: 'Quality', value: receipt.quality },
        { label: 'Process', value: receipt.processType || 'FINISH' },
        { label: 'Rec. Taka', value: receipt.recTaka },
        { label: 'Grey Mts', value: receipt.greyMts, isMoney: true },
        { label: 'Rec. Mts', value: receipt.recMts, isMoney: true },
        { label: 'Short Mts', value: receipt.shortMts, isMoney: true },
        { label: 'Job Rate', value: receipt.jobRate, isMoney: true },
        { label: 'Job Amt', value: receipt.jobAmount, isMoney: true },
        { label: 'Taxable', value: receipt.taxableAmount, isMoney: true },
        { label: 'CGST', value: receipt.cgstAmount, isMoney: true },
        { label: 'SGST', value: receipt.sgstAmount, isMoney: true },
        { label: 'IGST', value: receipt.igstAmount, isMoney: true },
        { label: 'Invoice Value', value: invoiceValue, isMoney: true },
        { label: 'TDS On Amt', value: tdsOnAmt, isMoney: true },
        { label: 'TDS %', value: tdsPercent },
        { label: 'TDS A/C', value: postingTdsAccount(receipt.entryType) || 'TDS PAYABLE A/C' },
        { label: 'TDS Amt', value: tdsAmount, isMoney: true },
        { label: 'Net After TDS', value: netAfterTds, isMoney: true },
        { label: 'Remarks', value: receipt.remarks }
      ]),
      lineColumns: takaDetails.length
        ? [
          { key: 'srNo', label: 'Taka Sr.' },
          { key: 'greyMts', label: 'Grey Mts', align: 'right', isMoney: true },
          { key: 'recMts', label: 'Rec Mts', align: 'right', isMoney: true },
          { key: 'shortPct', label: 'Short %', align: 'right' }
        ]
        : undefined,
      lineItems: takaDetails.length
        ? takaDetails.map(row => ({
          srNo: row.srNo,
          greyMts: roundMoney(row.greyMts),
          recMts: roundMoney(row.recMts),
          shortPct: roundMoney(row.shortPct)
        }))
        : undefined
    };
  }

  if (sourceType === 'work_receipt' || sourceType === 'work_receipt_tds') {
    const receipt = await prisma.workReceipt.findFirst({
      where: { id: sourceId, userId },
      include: { workDespatch: true }
    });
    if (!receipt) return null;
    const lineItems = Array.isArray(receipt.lineItems) ? receipt.lineItems : [];
    const isTdsLine = sourceType === 'work_receipt_tds';
    const tdsPercent = Number(receipt.tdsPercent) || 0;
    const taxable = roundMoney(receipt.taxableAmount || receipt.grossAmount || 0);
    const tdsOnAmt = taxable;
    const tdsAmount = tdsPercent > 0 ? roundMoney(taxable * tdsPercent / 100) : 0;
    const invoiceValue = roundMoney(receipt.invoiceValue || 0);
    const netAfterTds = roundMoney(invoiceValue - tdsAmount);

    return {
      title: isTdsLine
        ? `TDS on Work Receipt #${receipt.voucherNo ?? '-'}`
        : `Work Receipt #${receipt.voucherNo ?? '-'}`,
      subtitle: receipt.partyName,
      sourceType,
      sourceId,
      canEdit: true,
      editPath: `/erp/work-receipt?edit=${receipt.id}`,
      fields: buildDetailFields([
        { label: 'Date', value: toIsoDate(receipt.receiptDate) },
        { label: 'Challan', value: receipt.challanNo },
        { label: 'Desp. Challan', value: receipt.workDespatch?.challanNo },
        { label: 'Work Type', value: receipt.workType },
        { label: 'Rec. Pcs', value: receipt.totalPcs },
        { label: 'Fresh', value: receipt.totalFresh },
        { label: 'Rec. Mts', value: receipt.totalMts, isMoney: true },
        { label: 'Gross', value: receipt.grossAmount, isMoney: true },
        { label: 'Taxable', value: receipt.taxableAmount, isMoney: true },
        { label: 'CGST', value: receipt.cgstAmount, isMoney: true },
        { label: 'SGST', value: receipt.sgstAmount, isMoney: true },
        { label: 'IGST', value: receipt.igstAmount, isMoney: true },
        { label: 'Invoice Value', value: invoiceValue, isMoney: true },
        { label: 'TDS On Amt', value: tdsOnAmt, isMoney: true },
        { label: 'TDS %', value: tdsPercent },
        { label: 'TDS A/C', value: postingTdsAccount(receipt.transactionType) || 'TDS PAYABLE A/C' },
        { label: 'TDS Amt', value: tdsAmount, isMoney: true },
        { label: 'Net After TDS', value: netAfterTds, isMoney: true },
        { label: 'Remarks', value: receipt.remarks }
      ]),
      lineColumns: !isTdsLine && lineItems.length
        ? [
          { key: 'itemName', label: 'Item' },
          { key: 'jobType', label: 'Job Type' },
          { key: 'pcs', label: 'Pcs', align: 'right' },
          { key: 'plain', label: 'Plain', align: 'right' },
          { key: 'sec', label: 'Sec', align: 'right' },
          { key: 'lost', label: 'Lost', align: 'right' },
          { key: 'lace', label: 'Lace', align: 'right' },
          { key: 'fresh', label: 'Fresh', align: 'right' },
          { key: 'rate', label: 'Rate', align: 'right', isMoney: true },
          { key: 'amount', label: 'Amount', align: 'right', isMoney: true }
        ]
        : undefined,
      lineItems: !isTdsLine && lineItems.length
        ? lineItems.map(row => ({
          itemName: row.itemName,
          jobType: row.jobType,
          pcs: roundMoney(row.pcs),
          plain: roundMoney(row.plain),
          sec: roundMoney(row.sec),
          lost: roundMoney(row.lost),
          lace: roundMoney(row.lace),
          fresh: roundMoney(row.fresh),
          rate: roundMoney(row.rate),
          amount: roundMoney(row.amount)
        }))
        : undefined
    };
  }

  if (sourceType === 'grey_purchase_return') {
    const ret = await prisma.greyPurchaseReturn.findFirst({
      where: { id: sourceId, userId },
      include: { greyPurchase: true }
    });
    if (!ret) return null;

    const takaDetails = Array.isArray(ret.takaDetails) ? ret.takaDetails : [];

    return {
      title: `Grey Purchase Return #${ret.voucherNo ?? '-'}`,
      subtitle: ret.partyName,
      sourceType,
      sourceId,
      canEdit: true,
      editPath: `/erp/grey-purchase-return?edit=${ret.id}`,
      fields: buildDetailFields([
        { label: 'Date', value: toIsoDate(ret.returnDate) },
        { label: 'Voucher', value: ret.voucherNo != null ? String(ret.voucherNo) : '' },
        { label: 'Challan', value: ret.challanNo },
        { label: 'Ref. Bill', value: ret.refBillNo },
        { label: 'Pur Sr.', value: ret.purSr != null ? String(ret.purSr) : '' },
        { label: 'Quality', value: ret.quality },
        { label: 'Broker', value: ret.brokerName },
        { label: 'Pcs', value: ret.pcs },
        { label: 'Mts', value: ret.mts, isMoney: true },
        { label: 'Rate', value: ret.rate, isMoney: true },
        { label: 'Gross Amt', value: ret.grossAmount, isMoney: true },
        { label: 'Disc Amt', value: ret.discountAmount, isMoney: true },
        { label: 'Taxable', value: ret.taxableAmount, isMoney: true },
        { label: 'CGST', value: ret.cgstAmount, isMoney: true },
        { label: 'SGST', value: ret.sgstAmount, isMoney: true },
        { label: 'IGST', value: ret.igstAmount, isMoney: true },
        { label: 'Net Amount', value: ret.netAmount, isMoney: true },
        { label: 'Paid', value: ret.paid ? 'Y' : 'N' },
        { label: 'Remarks', value: ret.remarks }
      ]),
      lineColumns: takaDetails.length
        ? [
          { key: 'srNo', label: 'Sr. No.' },
          { key: 'mts', label: 'Mtrs', align: 'right', isMoney: true }
        ]
        : undefined,
      lineItems: takaDetails.length
        ? takaDetails.map(row => ({
          srNo: row.srNo,
          mts: roundMoney(row.mts)
        }))
        : undefined
    };
  }

  if (sourceType === 'grey_purchase') {
    const grey = await prisma.greyPurchase.findFirst({
      where: { id: sourceId, userId },
      include: { supplier: true }
    });
    if (!grey) return null;

    const lineItems = Array.isArray(grey.lineItems) ? grey.lineItems : [];
    const takaDetails = Array.isArray(grey.takaDetails) ? grey.takaDetails : [];

    return {
      title: `Grey Purchase #${grey.srNo ?? '-'}`,
      subtitle: grey.partyName,
      sourceType,
      sourceId,
      canEdit: true,
      editPath: `/erp/grey-purchase?edit=${grey.id}`,
      fields: buildDetailFields([
        { label: 'Date', value: toIsoDate(grey.billDate) },
        { label: 'Bill No.', value: grey.billNo },
        { label: 'Quality', value: grey.quality },
        { label: 'Broker', value: grey.brokerName },
        { label: 'Rec. Taka', value: grey.recTaka },
        { label: 'Rec. Mts', value: grey.recMts, isMoney: true },
        { label: 'Pur Rate', value: grey.purRate, isMoney: true },
        { label: 'Gross Amt', value: grey.grossAmount, isMoney: true },
        { label: 'Disc Amt', value: grey.discountAmount, isMoney: true },
        { label: 'Taxable', value: grey.taxableAmount, isMoney: true },
        { label: 'CGST', value: grey.cgstAmount, isMoney: true },
        { label: 'SGST', value: grey.sgstAmount, isMoney: true },
        { label: 'IGST', value: grey.igstAmount, isMoney: true },
        { label: 'Payable', value: grey.payableAmount, isMoney: true },
        { label: 'Net Amount', value: grey.netAmount, isMoney: true },
        { label: 'Despatch Mts', value: grey.despatchMts, isMoney: true },
        { label: 'Paid', value: grey.paid ? 'Y' : 'N' },
        { label: 'Remarks', value: grey.remarks }
      ]),
      lineColumns: takaDetails.length > 0
        ? [
          { key: 'srNo', label: 'Sr. No.' },
          { key: 'mts', label: 'Mtrs', align: 'right', isMoney: true }
        ]
        : [
          { key: 'quality', label: 'Quality' },
          { key: 'taka', label: 'Taka', align: 'right' },
          { key: 'mts', label: 'Mtrs', align: 'right', isMoney: true },
          { key: 'grossAmount', label: 'Gross', align: 'right', isMoney: true },
          { key: 'netAmount', label: 'Net', align: 'right', isMoney: true }
        ],
      lineItems: takaDetails.length > 0
        ? takaDetails.map(row => ({
          srNo: row.srNo,
          mts: roundMoney(row.mts)
        }))
        : lineItems.map(line => ({
          quality: line.quality || '-',
          taka: line.taka ?? '-',
          mts: roundMoney(line.mts ?? 0),
          grossAmount: roundMoney(line.grossAmount ?? 0),
          netAmount: roundMoney(line.netAmount ?? 0)
        }))
    };
  }

  if (sourceType === 'bank_entry') {
    const entry = await prisma.bankEntry.findFirst({
      where: { id: sourceId, userId }
    });
    if (!entry) return null;

    const allocations = await resolveBillNumbers(
      prisma,
      userId,
      normalizeBillAllocations(entry.billAllocations)
    );
    const entryLabel = entry.entryType === 'receipt' ? 'Bank Receipt' : 'Bank Payment';

    return {
      title: `${entryLabel} V.${entry.voucherNumber || '-'}`,
      subtitle: entry.partyName,
      sourceType,
      sourceId,
      fields: buildDetailFields([
        { label: 'Date', value: toIsoDate(entry.entryDate) },
        { label: 'Type', value: entry.entryType },
        { label: 'Transaction Type', value: entry.transactionType },
        { label: 'Party Type', value: entry.partyType },
        { label: 'Bank', value: entry.bankName },
        { label: 'Payment Mode', value: entry.paymentMode },
        { label: 'Reference', value: entry.referenceNumber },
        { label: 'Cheque No.', value: entry.chequeNumber },
        { label: 'Cheque Date', value: entry.chequeDate ? toIsoDate(entry.chequeDate) : '' },
        { label: 'Gross Amount', value: entry.grossAmount, isMoney: true },
        { label: 'Adjust Pending', value: entry.adjustPending, isMoney: true },
        { label: 'Net Bill Amount', value: entry.netBillAmount, isMoney: true },
        { label: 'Applied Amount', value: entry.adjustAdd || entry.amount, isMoney: true },
        { label: 'Remarks', value: entry.remarks }
      ]),
      lineColumns: allocations.length
        ? [
          { key: 'billType', label: 'Bill Type' },
          { key: 'billNumber', label: 'Bill No.' },
          { key: 'adjustAmount', label: 'Adjusted', align: 'right', isMoney: true }
        ]
        : undefined,
      lineItems: allocations.length ? allocations : undefined
    };
  }

  if (sourceType === 'credit_debit_note') {
    const note = await prisma.creditDebitNote.findFirst({
      where: { id: sourceId, userId }
    });
    if (!note) return null;

    const noteLabel = `${note.noteKind === 'credit' ? 'Credit' : 'Debit'} Note (${note.noteSide})`;

    return {
      title: `${noteLabel} #${note.noteNumber || note.voucherNumber || '-'}`,
      subtitle: note.partyName,
      sourceType,
      sourceId,
      fields: buildDetailFields([
        { label: 'Date', value: toIsoDate(note.noteDate) },
        { label: 'Voucher', value: note.voucherNumber != null ? String(note.voucherNumber) : '' },
        { label: 'Party Type', value: note.partyType },
        { label: 'Place of Supply', value: note.placeOfSupply },
        { label: 'Ref. Bill', value: note.adjustBillNumber || note.refBillNumber },
        { label: 'Gross', value: note.grossAmount, isMoney: true },
        { label: 'Discount', value: note.discountAmount, isMoney: true },
        { label: 'Taxable', value: note.taxableAmount, isMoney: true },
        { label: 'CGST', value: note.cgstAmount, isMoney: true },
        { label: 'SGST', value: note.sgstAmount, isMoney: true },
        { label: 'IGST', value: note.igstAmount, isMoney: true },
        { label: 'Net Amount', value: note.netAmount, isMoney: true },
        { label: 'Net After TDS', value: note.netAmountAfterTds, isMoney: true },
        { label: 'Paid', value: note.paidAmount, isMoney: true },
        { label: 'Remarks', value: note.remarks }
      ])
    };
  }

  return null;
}
