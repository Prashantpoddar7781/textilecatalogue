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
  if (!value) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

function normalizePayload(body) {
  const amount = Number(body.amount);
  return {
    entryType: ENTRY_TYPES.includes(body.entryType) ? body.entryType : 'payment',
    entryDate: optionalDate(body.entryDate),
    voucherNumber: optionalString(body.voucherNumber),
    bankName: optionalString(body.bankName),
    accountName: optionalString(body.accountName),
    partyType: PARTY_TYPES.includes(body.partyType) ? body.partyType : 'other',
    partyName: optionalString(body.partyName),
    linkedType: LINKED_TYPES.includes(body.linkedType) ? body.linkedType : 'none',
    linkedId: optionalString(body.linkedId),
    amount: Number.isFinite(amount) ? amount : 0,
    paymentMode: optionalString(body.paymentMode),
    referenceNumber: optionalString(body.referenceNumber),
    remarks: optionalString(body.remarks)
  };
}

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
        { remarks: { contains: search, mode: 'insensitive' } }
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
