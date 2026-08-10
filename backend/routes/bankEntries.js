import express from 'express';
import { PrismaClient } from '@prisma/client';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import {
  OPENING_BANK_BALANCE,
  AGING_BUCKETS,
  agingBucket,
  daysSince,
  getOrderPartyName,
  getPaidAmountsByBillType,
  getPaidAmountsByOrderId,
  mapOrderToPendingBill,
  mapPurchaseBillToPendingBill,
  matchesPartyName,
  matchesSupplierName,
  roundMoney
} from '../utils/orderBilling.js';
import {
  ERP_TRANSACTION_TYPES,
  normalizeTransactionType,
  DEFAULT_SALES_TRANSACTION_TYPE,
  DEFAULT_PURCHASE_TRANSACTION_TYPE
} from '../constants/erpTransactionTypes.js';
import { allocateNextTypeBillNumber } from '../utils/transactionBilling.js';
import { getPendingCreditDebitNotes, mergePendingBillsWithNotes } from '../utils/creditDebitNotes.js';
import { ensurePartyMaster } from '../utils/partyMaster.js';

const router = express.Router();
const prisma = new PrismaClient();

const ENTRY_TYPES = ['payment', 'receipt'];
const PARTY_TYPES = ['customer', 'supplier', 'other'];
const LINKED_TYPES = ['sales_invoice', 'purchase_bill', 'order', 'none'];

const optionalString = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
};

const optionalDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const optionalEntryDate = (value) => {
  if (!value) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

function normalizePayload(body) {
  const amount = Number(body.amount);
  const billAllocations = Array.isArray(body.billAllocations) ? body.billAllocations : null;
  return {
    entryType: ENTRY_TYPES.includes(body.entryType) ? body.entryType : 'payment',
    entryDate: optionalEntryDate(body.entryDate),
    voucherNumber: optionalString(body.voucherNumber),
    companyName: optionalString(body.companyName),
    bankName: optionalString(body.bankName),
    accountName: optionalString(body.accountName),
    partyType: PARTY_TYPES.includes(body.partyType) ? body.partyType : 'other',
    partyName: optionalString(body.partyName),
    linkedType: LINKED_TYPES.includes(body.linkedType) ? body.linkedType : 'none',
    linkedId: optionalString(body.linkedId),
    amount: Number.isFinite(amount) ? roundMoney(amount) : 0,
    paymentMode: optionalString(body.paymentMode),
    referenceNumber: optionalString(body.referenceNumber),
    chequeNumber: optionalString(body.chequeNumber),
    chequeDate: optionalDate(body.chequeDate),
    slipNumber: optionalString(body.slipNumber),
    billNumber: optionalString(body.billNumber),
    transactionType: optionalString(body.transactionType),
    billAllocations,
    grossAmount: roundMoney(body.grossAmount),
    adjustPending: roundMoney(body.adjustPending),
    netBillAmount: roundMoney(body.netBillAmount),
    adjustAdd: roundMoney(body.adjustAdd),
    taxableValuePaidBills: roundMoney(body.taxableValuePaidBills),
    remarks: optionalString(body.remarks)
  };
}

async function getCompanyName(userId) {
  const [profile, user] = await Promise.all([
    prisma.businessProfile.findUnique({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { firmName: true, name: true } })
  ]);
  return profile?.tradeName || profile?.legalName || user?.firmName || user?.name || 'Company';
}

const roundMoneyLocal = roundMoney;

async function getBankBalance(userId, bankName) {
  const where = { userId };
  if (bankName) {
    where.bankName = { equals: bankName, mode: 'insensitive' };
  }
  const entries = await prisma.bankEntry.findMany({
    where,
    select: { entryType: true, amount: true }
  });
  const movement = entries.reduce((balance, entry) => {
    if (entry.entryType === 'receipt') return balance + entry.amount;
    if (entry.entryType === 'payment') return balance - entry.amount;
    return balance;
  }, 0);
  return roundMoneyLocal(OPENING_BANK_BALANCE + movement);
}

async function getCompletedOrders(userId) {
  return prisma.order.findMany({
    where: { userId, status: 'completed' },
    include: { customer: true },
    orderBy: [{ invoiceNumber: 'asc' }, { createdAt: 'asc' }]
  });
}

async function getCompletedOrderParties(userId) {
  const [orders, paidByOrderId, paidByInvoiceId] = await Promise.all([
    getCompletedOrders(userId),
    getPaidAmountsByOrderId(prisma, userId),
    getPaidAmountsByBillType(prisma, userId, 'sales_invoice')
  ]);
  const partyMap = new Map();
  const orderIds = new Set(orders.map(order => order.id));

  for (const order of orders) {
    const name = getOrderPartyName(order);
    if (!name) continue;
    const current = partyMap.get(name.toLowerCase()) || {
      name,
      orderCount: 0,
      pendingAmount: 0
    };
    current.orderCount += 1;
    partyMap.set(name.toLowerCase(), current);
  }

  for (const order of orders) {
    const name = getOrderPartyName(order);
    if (!name) continue;
    const bill = mapOrderToPendingBill(order, paidByOrderId);
    const current = partyMap.get(name.toLowerCase());
    if (current) current.pendingAmount = roundMoneyLocal(current.pendingAmount + bill.pendingAmount);
  }

  const invoices = await prisma.salesInvoice.findMany({
    where: { userId },
    include: { customer: true }
  });

  for (const invoice of invoices) {
    if (orderIds.has(invoice.orderId)) continue;
    const buyerSnapshot = invoice.buyerSnapshot && typeof invoice.buyerSnapshot === 'object'
      ? invoice.buyerSnapshot
      : {};
    const name = String(invoice.customer?.organizationName || buyerSnapshot.name || '').trim();
    if (!name) continue;
    const paidAmount = (invoice.amountPaid || 0) + (paidByInvoiceId.get(invoice.id) || 0);
    const pendingAmount = roundMoney(Math.max(invoice.grandTotal - paidAmount, 0));
    const current = partyMap.get(name.toLowerCase()) || {
      name,
      orderCount: 0,
      pendingAmount: 0
    };
    current.orderCount += 1;
    current.pendingAmount = roundMoneyLocal(current.pendingAmount + pendingAmount);
    partyMap.set(name.toLowerCase(), current);
  }

  return Array.from(partyMap.values())
    .filter(party => party.orderCount > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function getPendingOrderBills(userId, partyName, transactionType) {
  const [orders, paidByOrderId, paidByInvoiceId] = await Promise.all([
    getCompletedOrders(userId),
    getPaidAmountsByOrderId(prisma, userId),
    getPaidAmountsByBillType(prisma, userId, 'sales_invoice')
  ]);

  const normalizedType = transactionType ? normalizeTransactionType(transactionType) : null;

  const orderBills = orders
    .filter(order => matchesPartyName(order, partyName))
    .filter(order => !normalizedType || normalizeTransactionType(order.transactionType, DEFAULT_SALES_TRANSACTION_TYPE) === normalizedType)
    .map(order => mapOrderToPendingBill(order, paidByOrderId))
    .filter(bill => bill.pendingAmount > 0);

  const coveredOrderIds = new Set(orders
    .filter(order => matchesPartyName(order, partyName))
    .map(order => order.id));

  const invoices = await prisma.salesInvoice.findMany({
    where: { userId },
    include: { customer: true, order: { select: { id: true, invoiceNumber: true, orderNumber: true } } },
    orderBy: [{ invoiceDate: 'asc' }, { createdAt: 'asc' }]
  });

  const invoiceBills = invoices
    .filter(invoice => {
      if (coveredOrderIds.has(invoice.orderId)) return false;
      const buyerSnapshot = invoice.buyerSnapshot && typeof invoice.buyerSnapshot === 'object'
        ? invoice.buyerSnapshot
        : {};
      const customerName = invoice.customer?.organizationName || buyerSnapshot.name || '';
      return matchesPartyName({ buyerName: customerName, customer: invoice.customer }, partyName);
    })
    .map(invoice => {
      const paidAmount = (invoice.amountPaid || 0) + (paidByInvoiceId.get(invoice.id) || 0);
      const billAmount = roundMoney(invoice.grandTotal);
      const pendingAmount = roundMoney(Math.max(billAmount - paidAmount, 0));
      const billDate = invoice.invoiceDate;
      return {
        billId: invoice.id,
        billType: 'sales_invoice',
        billNumber: invoice.invoiceNumber,
        voucherNumber: invoice.order?.orderNumber || invoice.invoiceNumber,
        billDate,
        days: daysSince(billDate),
        grace: 0,
        adatDisc: roundMoney(invoice.discountAmount),
        billAmount,
        pendingAmount,
        taxableAmount: roundMoney(invoice.taxableAmount),
        adjustAmount: 0
      };
    })
    .filter(bill => bill.pendingAmount > 0);

  return [...orderBills, ...invoiceBills]
    .sort((a, b) => String(a.billNumber).localeCompare(String(b.billNumber), undefined, { numeric: true }));
}

async function getPurchaseBillRecords(userId) {
  return prisma.purchaseBill.findMany({
    where: { userId, status: 'posted' },
    include: { supplier: true },
    orderBy: [{ billDate: 'asc' }, { createdAt: 'asc' }]
  });
}

async function getPurchaseBillParties(userId) {
  const [bills, paidByBillId] = await Promise.all([
    getPurchaseBillRecords(userId),
    getPaidAmountsByBillType(prisma, userId, 'purchase_bill')
  ]);
  const partyMap = new Map();

  for (const bill of bills) {
    const name = bill.supplier?.name?.trim();
    if (!name) continue;
    const pendingBill = mapPurchaseBillToPendingBill(bill, paidByBillId);
    const current = partyMap.get(name.toLowerCase()) || {
      name,
      billCount: 0,
      pendingAmount: 0
    };
    current.billCount += 1;
    current.pendingAmount = roundMoneyLocal(current.pendingAmount + pendingBill.pendingAmount);
    partyMap.set(name.toLowerCase(), current);
  }

  return Array.from(partyMap.values())
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function getPendingPurchaseBills(userId, partyName, transactionType) {
  const [bills, paidByBillId] = await Promise.all([
    getPurchaseBillRecords(userId),
    getPaidAmountsByBillType(prisma, userId, 'purchase_bill')
  ]);

  const normalizedType = transactionType ? normalizeTransactionType(transactionType, DEFAULT_PURCHASE_TRANSACTION_TYPE) : null;

  return bills
    .filter(bill => matchesSupplierName(bill.supplier?.name, partyName))
    .filter(bill => !normalizedType || normalizeTransactionType(bill.transactionType, DEFAULT_PURCHASE_TRANSACTION_TYPE) === normalizedType)
    .map(bill => mapPurchaseBillToPendingBill(bill, paidByBillId))
    .filter(bill => bill.pendingAmount > 0)
    .sort((a, b) => String(a.billNumber).localeCompare(String(b.billNumber), undefined, { numeric: true }));
}

function sumPendingNotesAdjustments(notes) {
  return notes.reduce((sum, note) => {
    const sign = note.adjustDirection === 'deduct' ? -1 : 1;
    return sum + sign * note.pendingAmount;
  }, 0);
}

async function getPartyBalance(userId, partyName, partyType) {
  if (!partyName) return 0;
  if (partyType === 'supplier') {
    const [bills, notes] = await Promise.all([
      getPendingPurchaseBills(userId, partyName),
      getPendingCreditDebitNotes(prisma, userId, partyName, partyType)
    ]);
    return roundMoneyLocal(
      bills.reduce((sum, bill) => sum + bill.pendingAmount, 0)
      + sumPendingNotesAdjustments(notes)
    );
  }

  const [bills, notes] = await Promise.all([
    getPendingOrderBills(userId, partyName),
    getPendingCreditDebitNotes(prisma, userId, partyName, partyType)
  ]);
  return roundMoneyLocal(
    bills.reduce((sum, bill) => sum + bill.pendingAmount, 0)
    + sumPendingNotesAdjustments(notes)
  );
}

router.get('/completed-order-parties', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const parties = await getCompletedOrderParties(req.user.userId);
    res.json({ parties });
  } catch (error) {
    next(error);
  }
});

router.get('/purchase-bill-parties', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const parties = await getPurchaseBillParties(req.user.userId);
    res.json({ parties });
  } catch (error) {
    next(error);
  }
});

router.get('/next-voucher', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const latest = await prisma.bankEntry.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { voucherNumber: true }
    });
    const latestNumber = Number.parseInt(String(latest?.voucherNumber || '0').replace(/\D/g, ''), 10);
    const nextNumber = Number.isFinite(latestNumber) ? latestNumber + 1 : 1;
    const companyName = await getCompanyName(userId);
    res.json({ voucherNumber: String(nextNumber), companyName });
  } catch (error) {
    next(error);
  }
});

router.get('/balances', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const bankName = optionalString(req.query.bankName);
    const partyName = optionalString(req.query.partyName);
    const partyType = PARTY_TYPES.includes(req.query.partyType) ? req.query.partyType : 'customer';

    const [bankBalance, partyBalance] = await Promise.all([
      getBankBalance(userId, bankName),
      getPartyBalance(userId, partyName, partyType)
    ]);

    res.json({
      bankBalance: roundMoney(bankBalance),
      partyBalance: roundMoney(partyBalance)
    });
  } catch (error) {
    next(error);
  }
});

router.get('/transaction-types', authenticateToken, requireActiveSubscription, async (req, res) => {
  res.json({ types: ERP_TRANSACTION_TYPES });
});

router.get('/next-type-bill-number', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const transactionType = normalizeTransactionType(
      req.query.transactionType,
      req.query.source === 'purchase_bill' ? DEFAULT_PURCHASE_TRANSACTION_TYPE : DEFAULT_SALES_TRANSACTION_TYPE
    );
    const source = req.query.source === 'purchase_bill' ? 'purchase_bill' : 'order';
    const nextNumber = await prisma.$transaction(async (tx) =>
      allocateNextTypeBillNumber(tx, userId, transactionType, source)
    );
    res.json({ transactionType, typeBillNumber: nextNumber });
  } catch (error) {
    next(error);
  }
});

router.get('/pending-bills', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const partyName = optionalString(req.query.partyName);
    const partyType = PARTY_TYPES.includes(req.query.partyType) ? req.query.partyType : 'customer';
    const transactionType = optionalString(req.query.transactionType);

    if (!partyName) {
      return res.json({ bills: [] });
    }

    const bills = partyType === 'supplier'
      ? await getPendingPurchaseBills(userId, partyName, transactionType)
      : await getPendingOrderBills(userId, partyName, transactionType);

    const notes = await getPendingCreditDebitNotes(prisma, userId, partyName, partyType);
    const merged = mergePendingBillsWithNotes(bills, notes);

    res.json({
      bills: merged,
      notes,
      noteCount: notes.length,
      billCount: bills.length
    });
  } catch (error) {
    next(error);
  }
});

router.get('/outstanding-report', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const partyType = PARTY_TYPES.includes(req.query.partyType) ? req.query.partyType : 'customer';
    const view = (optionalString(req.query.view) || 'party-ageing').toLowerCase();
    const partyName = optionalString(req.query.partyName);
    const brokerName = optionalString(req.query.brokerName);
    const station = optionalString(req.query.station);
    const haste = optionalString(req.query.haste);
    const transportName = optionalString(req.query.transportName);
    const transactionType = optionalString(req.query.transactionType);
    const agingFilter = optionalString(req.query.agingBucket);
    const fromDate = optionalDate(req.query.fromDate);
    const toDateValue = optionalDate(req.query.toDate);
    const asOf = optionalDate(req.query.asOnDate) || new Date();
    asOf.setHours(23, 59, 59, 999);
    const includeSettled = String(req.query.includeSettled || '').toLowerCase() === 'true';

    const contains = (source, needle) => {
      if (!needle) return true;
      return String(source || '').toLowerCase().includes(needle.toLowerCase());
    };

    const emptyBucketTotals = () => Object.fromEntries(AGING_BUCKETS.map(key => [key, 0]));
    const bumpBucket = (target, bucket, amount) => {
      target[bucket] = roundMoneyLocal((target[bucket] || 0) + amount);
    };

    let rows = [];

    if (partyType === 'supplier') {
      const [bills, paidByBillId] = await Promise.all([
        getPurchaseBillRecords(userId),
        getPaidAmountsByBillType(prisma, userId, 'purchase_bill')
      ]);
      rows = bills
        .map(bill => mapPurchaseBillToPendingBill(bill, paidByBillId, asOf))
        .filter(bill => includeSettled || bill.pendingAmount > 0.001);
    } else {
      const [orders, paidByOrderId, paidByInvoiceId] = await Promise.all([
        getCompletedOrders(userId),
        getPaidAmountsByOrderId(prisma, userId),
        getPaidAmountsByBillType(prisma, userId, 'sales_invoice')
      ]);
      const normalizedType = transactionType ? normalizeTransactionType(transactionType) : null;
      const orderRows = orders
        .filter(order => !normalizedType
          || normalizeTransactionType(order.transactionType, DEFAULT_SALES_TRANSACTION_TYPE) === normalizedType)
        .map(order => mapOrderToPendingBill(order, paidByOrderId, asOf))
        .filter(bill => includeSettled || bill.pendingAmount > 0.001);

      const coveredOrderIds = new Set(orders.map(order => order.id));
      const invoices = await prisma.salesInvoice.findMany({
        where: { userId },
        include: { customer: true, order: { select: { id: true, orderNumber: true } } },
        orderBy: [{ invoiceDate: 'asc' }, { createdAt: 'asc' }]
      });
      const invoiceRows = invoices
        .filter(invoice => !coveredOrderIds.has(invoice.orderId))
        .map(invoice => {
          const paidAmount = (invoice.amountPaid || 0) + (paidByInvoiceId.get(invoice.id) || 0);
          const billAmount = roundMoney(invoice.grandTotal);
          const pendingAmount = roundMoney(Math.max(billAmount - paidAmount, 0));
          const billDate = invoice.invoiceDate || invoice.createdAt;
          const days = daysSince(billDate, asOf);
          const buyerSnapshot = invoice.buyerSnapshot && typeof invoice.buyerSnapshot === 'object'
            ? invoice.buyerSnapshot
            : {};
          return {
            billId: invoice.id,
            billType: 'sales_invoice',
            billNumber: invoice.invoiceNumber,
            voucherNumber: invoice.order?.orderNumber || invoice.invoiceNumber,
            billDate,
            days,
            agingBucket: agingBucket(days),
            grace: 0,
            billAmount,
            paidAmount: roundMoney(paidAmount),
            pendingAmount,
            taxableAmount: roundMoney(invoice.taxableAmount),
            partyName: invoice.customer?.organizationName || buyerSnapshot.name || '',
            brokerName: buyerSnapshot.agentName || '',
            station: buyerSnapshot.city || buyerSnapshot.station || '',
            haste: '',
            transportName: '',
            transactionType: 'SALES INVOICE',
            editPath: undefined
          };
        })
        .filter(bill => includeSettled || bill.pendingAmount > 0.001);

      rows = [...orderRows, ...invoiceRows];
    }

    rows = rows.filter(row => {
      if (partyName && !contains(row.partyName, partyName)) return false;
      if (brokerName && !contains(row.brokerName, brokerName)) return false;
      if (station && !contains(row.station, station)) return false;
      if (haste && !contains(row.haste, haste)) return false;
      if (transportName && !contains(row.transportName, transportName)) return false;
      if (agingFilter && row.agingBucket !== agingFilter) return false;
      if (fromDate || toDateValue) {
        const date = new Date(row.billDate);
        if (Number.isNaN(date.getTime())) return false;
        if (fromDate && date < fromDate) return false;
        if (toDateValue) {
          const end = new Date(toDateValue);
          end.setHours(23, 59, 59, 999);
          if (date > end) return false;
        }
      }
      return true;
    });

    rows.sort((a, b) => {
      const dateA = new Date(a.billDate).getTime() || 0;
      const dateB = new Date(b.billDate).getTime() || 0;
      // Date-wise / bill-wise: latest bill on top.
      if (view === 'date-wise' || view === 'bill-wise') {
        if (dateB !== dateA) return dateB - dateA;
        return String(b.billNumber || '').localeCompare(String(a.billNumber || ''), undefined, { numeric: true });
      }
      const partyCmp = String(a.partyName || '').localeCompare(String(b.partyName || ''));
      if (partyCmp !== 0) return partyCmp;
      // Within a party, still show newest bills first.
      if (dateB !== dateA) return dateB - dateA;
      return String(b.billNumber || '').localeCompare(String(a.billNumber || ''), undefined, { numeric: true });
    });

    const enriched = rows.map(row => {
      const pending = roundMoneyLocal(row.pendingAmount);
      const buckets = emptyBucketTotals();
      buckets[row.agingBucket] = pending;
      return {
        ...row,
        id: `${row.billType}-${row.billId}`,
        buckets,
        editPath: row.editPath
          || (row.billType === 'order' ? `/erp/sales?edit=${row.billId}&kind=bill` : undefined)
      };
    });

    const totals = {
      billAmount: 0,
      paidAmount: 0,
      pendingAmount: 0,
      ...emptyBucketTotals()
    };
    for (const row of enriched) {
      totals.billAmount = roundMoneyLocal(totals.billAmount + (Number(row.billAmount) || 0));
      totals.paidAmount = roundMoneyLocal(totals.paidAmount + (Number(row.paidAmount) || 0));
      totals.pendingAmount = roundMoneyLocal(totals.pendingAmount + (Number(row.pendingAmount) || 0));
      bumpBucket(totals, row.agingBucket, Number(row.pendingAmount) || 0);
    }

    const partyMap = new Map();
    for (const row of enriched) {
      const key = (row.partyName || 'Unknown').trim() || 'Unknown';
      const current = partyMap.get(key) || {
        partyName: key,
        billCount: 0,
        billAmount: 0,
        paidAmount: 0,
        pendingAmount: 0,
        ...emptyBucketTotals(),
        rows: []
      };
      current.billCount += 1;
      current.billAmount = roundMoneyLocal(current.billAmount + (Number(row.billAmount) || 0));
      current.paidAmount = roundMoneyLocal(current.paidAmount + (Number(row.paidAmount) || 0));
      current.pendingAmount = roundMoneyLocal(current.pendingAmount + (Number(row.pendingAmount) || 0));
      bumpBucket(current, row.agingBucket, Number(row.pendingAmount) || 0);
      current.rows.push(row);
      partyMap.set(key, current);
    }
    for (const party of partyMap.values()) {
      party.rows.sort((a, b) => {
        const dateA = new Date(a.billDate).getTime() || 0;
        const dateB = new Date(b.billDate).getTime() || 0;
        if (dateB !== dateA) return dateB - dateA;
        return String(b.billNumber || '').localeCompare(String(a.billNumber || ''), undefined, { numeric: true });
      });
    }
    const parties = Array.from(partyMap.values()).sort((a, b) => a.partyName.localeCompare(b.partyName));

    res.json({
      view,
      partyType,
      asOnDate: asOf.toISOString(),
      agingBuckets: AGING_BUCKETS,
      rows: enriched,
      parties,
      totals
    });
  } catch (error) {
    next(error);
  }
});

router.get('/bank-accounts', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const entries = await prisma.bankEntry.findMany({
      where: { userId, bankName: { not: null } },
      select: { bankName: true, entryType: true, amount: true }
    });
    const profile = await prisma.businessProfile.findUnique({ where: { userId } });
    const map = new Map();
    map.set('Default Bank', OPENING_BANK_BALANCE);

    if (profile?.bankName) {
      map.set(profile.bankName, OPENING_BANK_BALANCE);
    }

    for (const entry of entries) {
      if (!entry.bankName) continue;
      const current = map.get(entry.bankName) ?? OPENING_BANK_BALANCE;
      const next = entry.entryType === 'receipt' ? current + entry.amount : current - entry.amount;
      map.set(entry.bankName, next);
    }

    const accounts = Array.from(map.entries()).map(([name, balance]) => ({
      name,
      balance: roundMoneyLocal(balance)
    }));

    res.json({ accounts });
  } catch (error) {
    next(error);
  }
});

router.get('/', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const search = optionalString(req.query.search);
    const entryType = optionalString(req.query.entryType);
    const where = { userId };

    if (entryType && entryType !== 'all') {
      where.entryType = entryType;
    }

    if (search) {
      where.OR = [
        { partyName: { contains: search, mode: 'insensitive' } },
        { voucherNumber: { contains: search, mode: 'insensitive' } },
        { referenceNumber: { contains: search, mode: 'insensitive' } },
        { bankName: { contains: search, mode: 'insensitive' } },
        { remarks: { contains: search, mode: 'insensitive' } },
        { chequeNumber: { contains: search, mode: 'insensitive' } },
        { slipNumber: { contains: search, mode: 'insensitive' } }
      ];
    }

    const entries = await prisma.bankEntry.findMany({
      where,
      orderBy: [
        { entryDate: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    res.json({ entries });
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticateToken, requireActiveSubscription, [
  body('entryType').isIn(ENTRY_TYPES),
  body('partyName').trim().notEmpty(),
  body('amount').isFloat({ min: 0.01 })
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const payload = normalizePayload(req.body);
    const party = await ensurePartyMaster(prisma, req.user.userId, {
      partyType: payload.partyType,
      partyName: payload.partyName
    });
    const entry = await prisma.bankEntry.create({
      data: {
        userId: req.user.userId,
        ...payload,
        partyName: party.partyName || payload.partyName
      }
    });

    res.status(201).json({ entry });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authenticateToken, requireActiveSubscription, [
  body('entryType').optional().isIn(ENTRY_TYPES),
  body('partyName').optional().trim().notEmpty(),
  body('amount').optional().isFloat({ min: 0.01 })
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const existing = await prisma.bankEntry.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.userId
      }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Bank entry not found' });
    }

    const payload = normalizePayload({ ...existing, ...req.body });
    const party = await ensurePartyMaster(prisma, req.user.userId, {
      partyType: payload.partyType,
      partyName: payload.partyName
    });
    const entry = await prisma.bankEntry.update({
      where: { id: existing.id },
      data: {
        ...payload,
        partyName: party.partyName || payload.partyName
      }
    });

    res.json({ entry });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const existing = await prisma.bankEntry.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.userId
      }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Bank entry not found' });
    }

    await prisma.bankEntry.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
