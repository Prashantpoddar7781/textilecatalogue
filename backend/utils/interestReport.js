import { isExpensePurchaseType } from '../constants/erpTransactionTypes.js';
import { getCompanyLedgerMeta, buildUnifiedPartyLedger } from './accountLedger.js';
import { roundMoney } from './orderBilling.js';
import { buildInterestSides, toDateKey } from './interestCalculation.js';

function uniqueIds(rows, types) {
  return [...new Set(rows.filter(row => types.includes(row.sourceType)).map(row => row.sourceId).filter(Boolean))];
}

function iso(value) {
  return toDateKey(value);
}

function editPathFor(sourceType, sourceId, extra = {}) {
  switch (sourceType) {
    case 'order':
    case 'order_discount':
      return extra.manualType === 'erp_sales' ? `/erp/sales?edit=${sourceId}&kind=bill` : null;
    case 'purchase_bill':
    case 'purchase_bill_discount':
      return extra.isExpense ? `/erp/expenses?edit=${sourceId}` : `/erp/purchase?edit=${sourceId}`;
    case 'grey_purchase':
      return `/erp/grey-purchase?edit=${sourceId}`;
    case 'grey_purchase_return':
      return `/erp/grey-purchase-return?edit=${sourceId}`;
    case 'mill_receipt':
    case 'mill_receipt_tds':
      return `/erp/mill-receipt?edit=${sourceId}`;
    case 'work_receipt':
    case 'work_receipt_tds':
      return `/erp/work-receipt?edit=${sourceId}`;
    case 'bank_entry':
      return `/erp/bank?edit=${sourceId}`;
    case 'credit_debit_note':
      return `/erp/notes?edit=${sourceId}`;
    default:
      return null;
  }
}

async function loadPartyMaster(prisma, userId, { partyName, customerId, supplierId }) {
  const name = String(partyName || '').trim();
  const [customer, supplier] = await Promise.all([
    customerId
      ? prisma.customer.findFirst({ where: { id: customerId, userId } })
      : (name ? prisma.customer.findFirst({ where: { userId, organizationName: { equals: name, mode: 'insensitive' } } }) : null),
    supplierId
      ? prisma.supplier.findFirst({ where: { id: supplierId, userId } })
      : (name ? prisma.supplier.findFirst({ where: { userId, name: { equals: name, mode: 'insensitive' } } }) : null)
  ]);
  const source = customer || supplier;
  if (!source) {
    return {
      partyName: name,
      contactPersonName: null,
      address: '',
      city: null,
      state: null,
      graceDays: 0,
      interestRate: 0,
      dhara: 0
    };
  }
  return {
    partyName: customer ? customer.organizationName : supplier.name,
    contactPersonName: source.contactPersonName || null,
    address: [source.address, source.addressLine2].filter(Boolean).join(', '),
    city: source.city || null,
    state: source.state || null,
    graceDays: Number(source.graceDays) || 0,
    interestRate: Number(source.interestRate) || 0,
    dhara: Number(source.dhara ?? source.discountRate) || 0
  };
}

async function enrichLedgerRows(prisma, userId, rows) {
  const orderIds = uniqueIds(rows, ['order', 'order_discount']);
  const invoiceIds = uniqueIds(rows, ['sales_invoice', 'sales_invoice_discount']);
  const billIds = uniqueIds(rows, ['purchase_bill', 'purchase_bill_discount']);
  const bankIds = uniqueIds(rows, ['bank_entry']);
  const noteIds = uniqueIds(rows, ['credit_debit_note']);

  const [orders, invoices, bills, banks, notes] = await Promise.all([
    orderIds.length
      ? prisma.order.findMany({
        where: { userId, id: { in: orderIds } },
        select: { id: true, grace: true, transactionType: true, manualType: true }
      })
      : [],
    invoiceIds.length
      ? prisma.salesInvoice.findMany({
        where: { userId, id: { in: invoiceIds } },
        select: { id: true, order: { select: { transactionType: true, grace: true, manualType: true } } }
      })
      : [],
    billIds.length
      ? prisma.purchaseBill.findMany({
        where: { userId, id: { in: billIds } },
        select: { id: true, grace: true, transactionType: true }
      })
      : [],
    bankIds.length
      ? prisma.bankEntry.findMany({
        where: { userId, id: { in: bankIds } },
        select: { id: true, chequeDate: true, transactionType: true, entryType: true }
      })
      : [],
    noteIds.length
      ? prisma.creditDebitNote.findMany({
        where: { userId, id: { in: noteIds } },
        select: { id: true, noteKind: true, noteSide: true }
      })
      : []
  ]);

  const orderMap = new Map(orders.map(row => [row.id, row]));
  const invoiceMap = new Map(invoices.map(row => [row.id, row]));
  const billMap = new Map(bills.map(row => [row.id, row]));
  const bankMap = new Map(banks.map(row => [row.id, row]));
  const noteMap = new Map(notes.map(row => [row.id, row]));

  return rows.map(row => {
    let transactionType = row.account || null;
    let chequeDate = null;
    let extra = {};
    if (row.sourceType === 'order' || row.sourceType === 'order_discount') {
      const order = orderMap.get(row.sourceId);
      transactionType = order?.transactionType || transactionType;
      extra = { manualType: order?.manualType };
    } else if (row.sourceType === 'sales_invoice' || row.sourceType === 'sales_invoice_discount') {
      const invoice = invoiceMap.get(row.sourceId);
      transactionType = invoice?.order?.transactionType || transactionType;
      extra = { manualType: invoice?.order?.manualType };
    } else if (row.sourceType === 'purchase_bill' || row.sourceType === 'purchase_bill_discount') {
      const bill = billMap.get(row.sourceId);
      transactionType = bill?.transactionType || transactionType;
      extra = { isExpense: isExpensePurchaseType(bill?.transactionType) };
    } else if (row.sourceType === 'bank_entry') {
      const bank = bankMap.get(row.sourceId);
      transactionType = bank?.transactionType || transactionType;
      chequeDate = bank?.chequeDate || null;
    } else if (row.sourceType === 'credit_debit_note') {
      const note = noteMap.get(row.sourceId);
      transactionType = note ? `${note.noteKind} note (${note.noteSide})` : transactionType;
    }

    return {
      ...row,
      date: iso(row.date),
      chequeDate: iso(chequeDate),
      transactionType,
      editPath: editPathFor(row.sourceType, row.sourceId, extra)
    };
  });
}

export async function loadInterestDefaults(prisma, userId, input = {}) {
  const party = await loadPartyMaster(prisma, userId, input);
  return {
    partyName: party.partyName || input.partyName,
    contactPersonName: party.contactPersonName,
    address: party.address,
    city: party.city,
    state: party.state,
    masterGraceDays: party.graceDays,
    masterInterestRate: party.interestRate,
    dhara: party.dhara
  };
}

export async function buildPartyInterestReport(prisma, userId, input = {}) {
  const partyName = String(input.partyName || '').trim();
  if (!partyName) {
    const error = new Error('Select a party account first.');
    error.status = 400;
    throw error;
  }
  if (String(input.partyType || '').toLowerCase() === 'company') {
    const error = new Error('Interest report is for a party ledger, not the company book.');
    error.status = 400;
    throw error;
  }

  const fromDate = toDateKey(input.fromDate);
  const toDate = toDateKey(input.toDate);
  const interestRate = Number(input.interestRate);
  if (!(interestRate > 0)) {
    const error = new Error('Enter an interest rate, or save Int. Rate on the party master.');
    error.status = 400;
    throw error;
  }

  const [ledger, party, company] = await Promise.all([
    buildUnifiedPartyLedger(prisma, userId, {
      partyName,
      supplierId: input.supplierId || null,
      customerId: input.customerId || null,
      fromDate,
      toDate
    }),
    loadPartyMaster(prisma, userId, {
      partyName,
      customerId: input.customerId,
      supplierId: input.supplierId
    }),
    getCompanyLedgerMeta(prisma, userId)
  ]);

  const entries = await enrichLedgerRows(prisma, userId, ledger.ledger || []);
  const sides = buildInterestSides(entries, {
    asOnDate: toDate,
    daysInYear: input.daysInYear,
    interestRate,
    graceSource: input.graceSource,
    typedGraceDays: input.typedGraceDays,
    masterGraceDays: party.graceDays,
    basedOnChequeDate: input.basedOnChequeDate
  });

  const salesTotal = roundMoney(
    (ledger.ledger || [])
      .filter(row => row.sourceType === 'order' || row.sourceType === 'sales_invoice' || row.sourceType === 'purchase_bill' || row.sourceType === 'grey_purchase' || row.sourceType === 'work_receipt' || row.sourceType === 'mill_receipt')
      .reduce((sum, row) => sum + (row.debitAmount || 0) + (row.creditAmount || 0), 0)
  );

  return {
    companyName: company.partyName,
    party: {
      name: party.contactPersonName || party.partyName,
      accountName: party.partyName,
      address: [party.address, party.city, party.state].filter(Boolean).join(', ')
    },
    fromDate,
    toDate,
    basedOnChequeDate: Boolean(input.basedOnChequeDate),
    salesTotal,
    ...sides
  };
}
