import express from 'express';
import { PrismaClient } from '@prisma/client';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import { formatSeriesBillNumber, warnsOnManualEntry } from '../constants/erpTransactionPostingRules.js';
import { resolveCustomerForEntry, resolveSupplierForEntry } from '../utils/partyMaster.js';
import { allocateNextTypeBillNumber } from '../utils/transactionBilling.js';
import { getCurrentAccountingYear, parseAccountingYear } from '../utils/accountingYear.js';
import { bankAdjustmentBlock } from '../utils/voucherDelete.js';
import { JOURNAL_TRANSACTION_TYPE } from '../utils/journalVouchers.js';

const router = express.Router();
const prisma = new PrismaClient();

const PARTY_TYPES = ['customer', 'supplier'];
const PARTY_SIDES = ['debit', 'credit'];

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

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

async function getCompanyName(userId) {
  const [profile, user] = await Promise.all([
    prisma.businessProfile.findUnique({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { firmName: true, name: true } })
  ]);
  return profile?.tradeName || profile?.legalName || user?.firmName || user?.name || 'Company';
}

async function resolveParty(userId, body) {
  const requested = PARTY_TYPES.includes(body.partyType) ? body.partyType : null;
  const name = optionalString(body.partyName);
  if (!requested) {
    const error = new Error('Party type must be customer or supplier');
    error.status = 400;
    throw error;
  }
  if (!name) {
    const error = new Error('Party name is required');
    error.status = 400;
    throw error;
  }

  const [customerByName, supplierByName] = await Promise.all([
    prisma.customer.findFirst({
      where: { userId, organizationName: { equals: name, mode: 'insensitive' } }
    }),
    prisma.supplier.findFirst({
      where: { userId, name: { equals: name, mode: 'insensitive' } }
    })
  ]);
  const supplierType = String(supplierByName?.accountType || '').trim().toUpperCase();
  const supplierIsPlaceholder = !supplierByName || supplierType === '' || supplierType === 'OTHER';
  const customerIsDebtor = customerByName && /DEBTOR/i.test(customerByName.accountType || '');
  const useCustomer = requested === 'customer' || (customerIsDebtor && supplierIsPlaceholder);

  if (useCustomer) {
    const customer = customerByName || await resolveCustomerForEntry(prisma, userId, {
      customerId: body.customerId,
      partyName: name
    });
    return {
      partyType: 'customer',
      partyName: customer?.organizationName || name,
      customerId: customer?.id || null,
      supplierId: null
    };
  }

  const supplier = supplierByName || await resolveSupplierForEntry(prisma, userId, {
    supplierId: body.supplierId,
    partyName: name,
    transactionType: body.transactionType
  });
  return {
    partyType: 'supplier',
    partyName: supplier?.name || name,
    customerId: null,
    supplierId: supplier?.id || null
  };
}

function normalizePayload(body, companyName) {
  const amount = roundMoney(body.amount);
  if (!(amount > 0)) {
    const error = new Error('Amount must be greater than 0');
    error.status = 400;
    throw error;
  }
  const oppositeAccount = optionalString(body.oppositeAccount);
  if (!oppositeAccount) {
    const error = new Error('Opposite A/C is required');
    error.status = 400;
    throw error;
  }
  const partySide = PARTY_SIDES.includes(String(body.partySide || '').toLowerCase())
    ? String(body.partySide).toLowerCase()
    : 'credit';

  return {
    transactionType: JOURNAL_TRANSACTION_TYPE,
    voucherDate: optionalDate(body.voucherDate) || new Date(),
    companyName: optionalString(body.companyName) || companyName,
    oppositeAccount,
    partySide,
    amount,
    narration: optionalString(body.narration),
    remarks: optionalString(body.remarks),
    status: optionalString(body.status) || 'posted'
  };
}

function selectedYear(req) {
  return parseAccountingYear(String(req.query.year || '').trim())
    || parseAccountingYear(getCurrentAccountingYear());
}

router.get('/next-voucher', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const year = selectedYear(req);
    const [typeBillNumber, companyName] = await Promise.all([
      prisma.$transaction(tx => allocateNextTypeBillNumber(
        tx, userId, JOURNAL_TRANSACTION_TYPE, 'journal_voucher', year?.label
      )),
      getCompanyName(userId)
    ]);
    res.json({
      transactionType: JOURNAL_TRANSACTION_TYPE,
      typeBillNumber,
      voucherNumber: formatSeriesBillNumber(JOURNAL_TRANSACTION_TYPE, typeBillNumber),
      companyName,
      warnOnManualEntry: warnsOnManualEntry(JOURNAL_TRANSACTION_TYPE)
    });
  } catch (error) {
    next(error);
  }
});

router.get('/', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const year = selectedYear(req);
    const vouchers = await prisma.journalVoucher.findMany({
      where: {
        userId: req.user.userId,
        transactionType: JOURNAL_TRANSACTION_TYPE,
        status: { not: 'cancelled' },
        ...(year ? { voucherDate: { gte: year.startDate, lte: year.endDate } } : {})
      },
      orderBy: [{ voucherDate: 'desc' }, { createdAt: 'desc' }]
    });
    res.json({ vouchers });
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticateToken, requireActiveSubscription, [
  body('partyName').notEmpty().withMessage('Party name is required'),
  body('oppositeAccount').notEmpty().withMessage('Opposite A/C is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.userId;
    const [party, companyName] = await Promise.all([
      resolveParty(userId, req.body),
      getCompanyName(userId)
    ]);
    const payload = normalizePayload(req.body, companyName);

    const voucher = await prisma.$transaction(async (tx) => {
      const typeBillNumber = await allocateNextTypeBillNumber(
        tx,
        userId,
        JOURNAL_TRANSACTION_TYPE,
        'journal_voucher',
        getCurrentAccountingYear(payload.voucherDate || new Date())
      );
      return tx.journalVoucher.create({
        data: {
          userId,
          typeBillNumber,
          voucherNumber: formatSeriesBillNumber(JOURNAL_TRANSACTION_TYPE, typeBillNumber),
          ...party,
          ...payload
        }
      });
    });

    res.status(201).json({ voucher });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const voucher = await prisma.journalVoucher.findFirst({
      where: { id: req.params.id, userId: req.user.userId }
    });
    if (!voucher) return res.status(404).json({ error: 'Journal voucher not found' });
    res.json({ voucher });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authenticateToken, requireActiveSubscription, [
  body('partyName').optional().notEmpty(),
  body('oppositeAccount').optional().notEmpty()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const existing = await prisma.journalVoucher.findFirst({
      where: { id: req.params.id, userId: req.user.userId }
    });
    if (!existing) return res.status(404).json({ error: 'Journal voucher not found' });

    const [party, companyName] = await Promise.all([
      resolveParty(req.user.userId, { ...existing, ...req.body }),
      getCompanyName(req.user.userId)
    ]);
    const payload = normalizePayload({ ...existing, ...req.body }, existing.companyName || companyName);

    const voucher = await prisma.journalVoucher.update({
      where: { id: existing.id },
      data: {
        ...party,
        ...payload,
        typeBillNumber: existing.typeBillNumber,
        voucherNumber: existing.voucherNumber
          || formatSeriesBillNumber(JOURNAL_TRANSACTION_TYPE, existing.typeBillNumber)
      }
    });

    res.json({ voucher });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const existing = await prisma.journalVoucher.findFirst({
      where: { id: req.params.id, userId: req.user.userId }
    });
    if (!existing) return res.status(404).json({ error: 'Journal voucher not found' });
    const block = await bankAdjustmentBlock(prisma, req.user.userId, existing.id);
    if (block) return res.status(409).json({ error: block });
    await prisma.journalVoucher.delete({ where: { id: existing.id } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
