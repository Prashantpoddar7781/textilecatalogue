import express from 'express';
import { PrismaClient } from '@prisma/client';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import { CREDIT_DEBIT_NOTE_TYPES, parseNoteType } from '../constants/creditDebitNoteTypes.js';
import { resolveCustomerForEntry, resolveSupplierForEntry } from '../utils/partyMaster.js';
import { calculateNoteTotals } from '../utils/gstCalculation.js';
import { roundMoney } from '../utils/orderBilling.js';

const router = express.Router();
const prisma = new PrismaClient();

const optionalString = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
};

const optionalNumber = (value) => {
  if (value === undefined || value === null || value === '') return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const optionalDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

async function getCompanyName(userId) {
  const [profile, user] = await Promise.all([
    prisma.businessProfile.findUnique({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { firmName: true, name: true } })
  ]);
  return profile?.tradeName || profile?.legalName || user?.firmName || user?.name || 'Company';
}

async function getBusinessState(userId) {
  const profile = await prisma.businessProfile.findUnique({ where: { userId } });
  return profile?.state || '';
}

async function allocateNextVoucherNumber(tx, userId, noteKind, noteSide) {
  const result = await tx.creditDebitNote.aggregate({
    where: { userId, noteKind, noteSide },
    _max: { voucherNumber: true }
  });
  return (result._max.voucherNumber ?? 0) + 1;
}

async function resolveParty(userId, noteType, body) {
  if (noteType.partyType === 'customer') {
    if (body.customerId) {
      const customer = await prisma.customer.findFirst({
        where: { id: body.customerId, userId }
      });
      if (!customer) {
        const error = new Error('Customer not found');
        error.status = 400;
        throw error;
      }
      return {
        partyType: 'customer',
        partyName: customer.organizationName,
        customerId: customer.id,
        supplierId: null
      };
    }
    const name = optionalString(body.partyName);
    if (!name) {
      const error = new Error('Customer name is required');
      error.status = 400;
      throw error;
    }
    const customer = await resolveCustomerForEntry(prisma, userId, {
      customerId: body.customerId,
      partyName: name,
      state: optionalString(body.state),
      gstNumber: optionalString(body.partyGstin)
    });
    return {
      partyType: 'customer',
      partyName: customer?.organizationName || name,
      customerId: customer?.id || null,
      supplierId: null
    };
  }

  if (body.supplierId) {
    const supplier = await prisma.supplier.findFirst({
      where: { id: body.supplierId, userId }
    });
    if (!supplier) {
      const error = new Error('Supplier not found');
      error.status = 400;
      throw error;
    }
    return {
      partyType: 'supplier',
      partyName: supplier.name,
      customerId: null,
      supplierId: supplier.id
    };
  }
  const name = optionalString(body.partyName);
  if (!name) {
    const error = new Error('Supplier name is required');
    error.status = 400;
    throw error;
  }
  const supplier = await resolveSupplierForEntry(prisma, userId, {
    supplierId: body.supplierId,
    partyName: name,
    partyGstin: optionalString(body.partyGstin),
    placeOfSupply: optionalString(body.placeOfSupply)
  });
  return {
    partyType: 'supplier',
    partyName: supplier?.name || name,
    customerId: null,
    supplierId: supplier?.id || null
  };
}

function normalizePayload(body, businessState) {
  const totals = calculateNoteTotals({
    grossAmount: optionalNumber(body.grossAmount),
    discountPercent: optionalNumber(body.discountPercent),
    discountAmount: body.discountAmount != null ? optionalNumber(body.discountAmount) : undefined,
    otherLess: optionalNumber(body.otherLess),
    addAmount: optionalNumber(body.addAmount),
    returnGoods: optionalNumber(body.returnGoods),
    taxableAmount: body.taxableAmount,
    gstRate: optionalNumber(body.gstRate),
    tcsRate: optionalNumber(body.tcsRate),
    placeOfSupply: optionalString(body.placeOfSupply),
    businessState
  });

  return {
    companyName: optionalString(body.companyName),
    noteDate: optionalDate(body.noteDate) || new Date(),
    placeOfSupply: optionalString(body.placeOfSupply),
    gstType: totals.gstType,
    refBillNumber: optionalString(body.refBillNumber),
    refBillDate: optionalDate(body.refBillDate),
    challanNumber: optionalString(body.challanNumber),
    saleAccount: optionalString(body.saleAccount),
    purchaseType: optionalString(body.purchaseType),
    pieces: optionalNumber(body.pieces),
    quantity: optionalNumber(body.quantity),
    grossAmount: totals.grossAmount,
    discountPercent: optionalNumber(body.discountPercent),
    discountAmount: totals.discountAmount,
    otherLess: optionalNumber(body.otherLess),
    addAmount: optionalNumber(body.addAmount),
    returnGoods: optionalNumber(body.returnGoods),
    hsnSac: optionalString(body.hsnSac),
    taxableAmount: totals.taxableAmount,
    gstRate: totals.gstRate,
    cgstRate: totals.cgstRate,
    cgstAmount: totals.cgstAmount,
    sgstRate: totals.sgstRate,
    sgstAmount: totals.sgstAmount,
    igstRate: totals.igstRate,
    igstAmount: totals.igstAmount,
    totalTaxAmount: totals.totalTaxAmount,
    tcsRate: totals.tcsRate,
    tcsAmount: totals.tcsAmount,
    netAmount: totals.netAmount,
    netAmountAfterTds: optionalNumber(body.netAmountAfterTds) || totals.netAmountAfterTds,
    paidAmount: optionalNumber(body.paidAmount),
    isPaid: Boolean(body.isPaid),
    adjustBillNumber: optionalString(body.adjustBillNumber),
    adjustBillId: optionalString(body.adjustBillId),
    remarks: optionalString(body.remarks),
    isTally: Boolean(body.isTally)
  };
}

router.get('/types', authenticateToken, requireActiveSubscription, async (req, res) => {
  res.json({ types: CREDIT_DEBIT_NOTE_TYPES });
});

router.get('/next-voucher', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const noteType = parseNoteType(req.query.noteType);
    if (!noteType) {
      return res.status(400).json({ error: 'Invalid note type' });
    }
    const userId = req.user.userId;
    const [voucherNumber, companyName, businessState] = await Promise.all([
      prisma.$transaction(tx => allocateNextVoucherNumber(tx, userId, noteType.noteKind, noteType.noteSide)),
      getCompanyName(userId),
      getBusinessState(userId)
    ]);
    res.json({ voucherNumber, companyName, businessState, noteType });
  } catch (error) {
    next(error);
  }
});

router.post('/calculate', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const businessState = await getBusinessState(req.user.userId);
    const totals = calculateNoteTotals({ ...req.body, businessState });
    res.json({ totals, businessState });
  } catch (error) {
    next(error);
  }
});

router.get('/', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const noteType = parseNoteType(req.query.noteType);
    const where = { userId };
    if (noteType) {
      where.noteKind = noteType.noteKind;
      where.noteSide = noteType.noteSide;
    }
    const notes = await prisma.creditDebitNote.findMany({
      where,
      orderBy: [{ noteDate: 'desc' }, { createdAt: 'desc' }]
    });
    res.json({ notes });
  } catch (error) {
    next(error);
  }
});

async function resolveAdjustBillLink(userId, noteSide, body) {
  const adjustBillNumber = optionalString(body.adjustBillNumber) || optionalString(body.refBillNumber);
  let adjustBillId = optionalString(body.adjustBillId);
  if (adjustBillId) {
    return { adjustBillId, adjustBillNumber };
  }
  if (!adjustBillNumber) {
    return { adjustBillId: null, adjustBillNumber: null };
  }

  const numeric = parseInt(adjustBillNumber, 10);
  if (noteSide === 'sales' && Number.isFinite(numeric)) {
    const order = await prisma.order.findFirst({
      where: {
        userId,
        OR: [{ typeBillNumber: numeric }, { invoiceNumber: numeric }]
      },
      select: { id: true }
    });
    if (order) {
      return { adjustBillId: order.id, adjustBillNumber };
    }
  }

  if (noteSide === 'purchase') {
    const purchaseBill = await prisma.purchaseBill.findFirst({
      where: {
        userId,
        OR: [
          { billNumber: adjustBillNumber },
          ...(Number.isFinite(numeric) ? [{ typeBillNumber: numeric }] : [])
        ]
      },
      select: { id: true }
    });
    if (purchaseBill) {
      return { adjustBillId: purchaseBill.id, adjustBillNumber };
    }
  }

  return { adjustBillId: null, adjustBillNumber };
}

router.post('/', authenticateToken, requireActiveSubscription, [
  body('noteType').notEmpty(),
  body('partyName').optional().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.userId;
    const noteType = parseNoteType(req.body.noteType);
    if (!noteType) {
      return res.status(400).json({ error: 'Invalid note type' });
    }

    const [party, businessState, companyName, billLink] = await Promise.all([
      resolveParty(userId, noteType, req.body),
      getBusinessState(userId),
      getCompanyName(userId),
      resolveAdjustBillLink(userId, noteType.noteSide, req.body)
    ]);

    const payload = normalizePayload({
      ...req.body,
      companyName: req.body.companyName || companyName
    }, businessState);

    const note = await prisma.$transaction(async (tx) => {
      const voucherNumber = await allocateNextVoucherNumber(tx, userId, noteType.noteKind, noteType.noteSide);
      return tx.creditDebitNote.create({
        data: {
          userId,
          noteKind: noteType.noteKind,
          noteSide: noteType.noteSide,
          voucherNumber,
          noteNumber: optionalString(req.body.noteNumber) || String(voucherNumber),
          ...party,
          ...payload,
          ...billLink
        }
      });
    });

    res.status(201).json({ note });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const note = await prisma.creditDebitNote.findFirst({
      where: { id: req.params.id, userId: req.user.userId }
    });
    if (!note) return res.status(404).json({ error: 'Note not found' });
    res.json({ note });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const existing = await prisma.creditDebitNote.findFirst({
      where: { id: req.params.id, userId: req.user.userId }
    });
    if (!existing) return res.status(404).json({ error: 'Note not found' });
    await prisma.creditDebitNote.delete({ where: { id: existing.id } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
