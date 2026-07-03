import express from 'express';
import { PrismaClient } from '@prisma/client';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';

const router = express.Router();
const prisma = new PrismaClient();

const ENTRY_TYPES = ['payment', 'receipt'];
const PARTY_TYPES = ['customer', 'supplier', 'other'];
const LINKED_TYPES = ['sales_invoice', 'purchase_bill', 'none'];

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

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const daysSince = (dateValue) => {
  if (!dateValue) return 0;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 0;
  const diff = Date.now() - date.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
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

async function getBankBalance(userId, bankName) {
  if (!bankName) return 0;
  const entries = await prisma.bankEntry.findMany({
    where: {
      userId,
      bankName: { equals: bankName, mode: 'insensitive' }
    },
    select: { entryType: true, amount: true }
  });
  return entries.reduce((balance, entry) => {
    if (entry.entryType === 'receipt') return balance + entry.amount;
    if (entry.entryType === 'payment') return balance - entry.amount;
    return balance;
  }, 0);
}

async function getPendingSalesBills(userId, partyName) {
  const invoices = await prisma.salesInvoice.findMany({
    where: {
      userId,
      amountDue: { gt: 0 }
    },
    include: {
      customer: true,
      order: { select: { orderNumber: true } }
    },
    orderBy: [{ invoiceDate: 'asc' }, { createdAt: 'asc' }]
  });

  const normalizedParty = partyName.trim().toLowerCase();
  return invoices
    .filter(invoice => {
      const customerName = invoice.customer?.organizationName?.toLowerCase() || '';
      const buyerSnapshot = invoice.buyerSnapshot && typeof invoice.buyerSnapshot === 'object'
        ? invoice.buyerSnapshot
        : {};
      const buyerName = String(buyerSnapshot.name || '').toLowerCase();
      return customerName.includes(normalizedParty)
        || buyerName.includes(normalizedParty)
        || normalizedParty.includes(customerName)
        || normalizedParty.includes(buyerName);
    })
    .map(invoice => ({
      billId: invoice.id,
      billType: 'sales_invoice',
      billNumber: invoice.invoiceNumber,
      voucherNumber: invoice.order?.orderNumber || invoice.invoiceNumber,
      billDate: invoice.invoiceDate,
      days: daysSince(invoice.invoiceDate),
      grace: 0,
      adatDisc: roundMoney(invoice.discountAmount),
      billAmount: roundMoney(invoice.grandTotal),
      pendingAmount: roundMoney(invoice.amountDue),
      taxableAmount: roundMoney(invoice.taxableAmount),
      adjustAmount: 0
    }));
}

async function getPendingPurchaseBills(userId, partyName) {
  const bills = await prisma.purchaseBill.findMany({
    where: { userId },
    include: { supplier: true },
    orderBy: [{ billDate: 'asc' }, { createdAt: 'asc' }]
  });

  const normalizedParty = partyName.trim().toLowerCase();
  return bills
    .filter(bill => {
      const supplierName = bill.supplier?.name?.toLowerCase() || '';
      return supplierName.includes(normalizedParty)
        || normalizedParty.includes(supplierName);
    })
    .map(bill => ({
      billId: bill.id,
      billType: 'purchase_bill',
      billNumber: bill.billNumber || bill.voucherNumber || bill.id.slice(-6).toUpperCase(),
      voucherNumber: bill.voucherNumber || bill.billNumber || '-',
      billDate: bill.billDate,
      days: daysSince(bill.billDate),
      grace: 0,
      adatDisc: roundMoney(bill.discountAmount),
      billAmount: roundMoney(bill.grandTotal),
      pendingAmount: roundMoney(bill.grandTotal),
      taxableAmount: roundMoney(bill.taxableAmount),
      adjustAmount: 0
    }));
}

async function getPartyBalance(userId, partyName, partyType) {
  if (!partyName) return 0;
  if (partyType === 'supplier') {
    const bills = await getPendingPurchaseBills(userId, partyName);
    const billTotal = bills.reduce((sum, bill) => sum + bill.pendingAmount, 0);
    const payments = await prisma.bankEntry.findMany({
      where: {
        userId,
        entryType: 'payment',
        partyName: { equals: partyName, mode: 'insensitive' }
      },
      select: { amount: true }
    });
    const paid = payments.reduce((sum, entry) => sum + entry.amount, 0);
    return roundMoney(billTotal - paid);
  }

  const bills = await getPendingSalesBills(userId, partyName);
  return roundMoney(bills.reduce((sum, bill) => sum + bill.pendingAmount, 0));
}

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

router.get('/pending-bills', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const partyName = optionalString(req.query.partyName);
    const partyType = PARTY_TYPES.includes(req.query.partyType) ? req.query.partyType : 'customer';

    if (!partyName) {
      return res.json({ bills: [] });
    }

    const bills = partyType === 'supplier'
      ? await getPendingPurchaseBills(userId, partyName)
      : await getPendingSalesBills(userId, partyName);

    res.json({ bills });
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

    if (profile?.bankName) {
      map.set(profile.bankName, 0);
    }

    for (const entry of entries) {
      if (!entry.bankName) continue;
      const current = map.get(entry.bankName) || 0;
      const next = entry.entryType === 'receipt' ? current + entry.amount : current - entry.amount;
      map.set(entry.bankName, next);
    }

    const accounts = Array.from(map.entries()).map(([name, balance]) => ({
      name,
      balance: roundMoney(balance)
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
    const entry = await prisma.bankEntry.create({
      data: {
        userId: req.user.userId,
        ...payload
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
    const entry = await prisma.bankEntry.update({
      where: { id: existing.id },
      data: payload
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
