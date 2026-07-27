import {
  calculateOrderGrandTotal,
  getOrderPartyName,
  matchesPartyName,
  matchesSupplierName,
  normalizeBillAllocations,
  normalizeOrderLines,
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
  const [suppliers, greyPurchases, greyReturns, millReceipts] = await Promise.all([
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
      select: { millName: true, netAfterTds: true, invoiceValue: true, tdsAmount: true }
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
      const tdsAmount = roundMoney(receipt.tdsAmount || 0);
      const invoiceValue = roundMoney(
        receipt.invoiceValue
        || (Number(receipt.netAfterTds || 0) + tdsAmount)
        || 0
      );
      // Net payable = invoice credit − TDS debit
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
    const tdsAmount = roundMoney(receipt.tdsAmount || 0);
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
        account: 'TDS PAYABLE A/C',
        particulars: `TDS ${roundMoney(receipt.tdsPercent || 0)}%`,
        remarks: '',
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
  'mill_receipt_tds'
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

    return {
      title: `Sales Bill #${billNo}`,
      subtitle: getOrderPartyName(order),
      sourceType,
      sourceId,
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
      title: `Purchase Bill #${billNo}`,
      subtitle: bill.supplier?.name || '',
      sourceType,
      sourceId,
      fields: buildDetailFields([
        { label: 'Date', value: toIsoDate(bill.billDate || bill.createdAt) },
        { label: 'Voucher', value: bill.voucherNumber },
        { label: 'Transaction Type', value: bill.transactionType },
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

    return {
      title: isTdsLine
        ? `TDS on Mill Receipt #${receipt.voucherNo ?? '-'}`
        : `Mill Receipt #${receipt.voucherNo ?? '-'}`,
      subtitle: receipt.millName,
      sourceType,
      sourceId,
      canEdit: !isTdsLine,
      editPath: `/erp/mill-receipt?edit=${receipt.id}`,
      fields: buildDetailFields([
        { label: 'Date', value: toIsoDate(receipt.receiptDate) },
        { label: 'Lot No.', value: receipt.lotNo },
        { label: 'Desp. No.', value: receipt.despNo },
        { label: 'Bill No.', value: receipt.billNo },
        { label: 'Quality', value: receipt.quality },
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
        { label: 'Invoice Value', value: receipt.invoiceValue, isMoney: true },
        { label: 'TDS On Amt', value: receipt.tdsOnAmt, isMoney: true },
        { label: 'TDS %', value: receipt.tdsPercent },
        { label: 'TDS Amt', value: receipt.tdsAmount, isMoney: true },
        { label: 'Net After TDS', value: receipt.netAfterTds, isMoney: true },
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
