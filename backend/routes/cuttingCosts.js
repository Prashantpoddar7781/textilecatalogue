import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import { buildCuttingCost, interestDaySpan } from '../utils/cuttingCost.js';

const router = express.Router();
const prisma = new PrismaClient();

const optionalString = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
};

const optionalNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

function dateKey(value) {
  if (!value) return null;
  const text = value instanceof Date ? value.toISOString() : String(value);
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function sameChallan(stored, wanted) {
  const text = String(stored || '').trim();
  const query = String(wanted || '').trim();
  if (!text || !query) return false;
  if (text === query) return true;
  const a = Number(text);
  const b = Number(query);
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}

function takaRows(receipt, dispatch) {
  const source = Array.isArray(receipt?.takaDetails) && receipt.takaDetails.length
    ? receipt.takaDetails
    : (Array.isArray(dispatch?.takaDetails) ? dispatch.takaDetails : []);
  return source.map((row, index) => {
    const greyMts = Number(row.greyMts ?? row.mts) || 0;
    const finMts = receipt
      ? (Number(row.recMts ?? row.finishMts) || 0)
      : 0;
    const shortMts = Math.max(0, greyMts - finMts);
    const shortPct = greyMts > 0 ? Math.round((shortMts / greyMts) * 10000) / 100 : 0;
    return {
      srNo: Number(row.srNo) || index + 1,
      greyMts,
      finMts,
      shortPct
    };
  });
}

async function findDispatch(userId, cutCard) {
  const dispatches = await prisma.greyDispatch.findMany({
    where: {
      userId,
      status: { not: 'cancelled' },
      transactionType: { not: 'RETURN' }
    },
    include: {
      greyPurchase: { include: { supplier: true } },
      millReceipts: {
        where: { status: { not: 'cancelled' }, processType: { not: 'RETURN' } },
        orderBy: [{ receiptDate: 'desc' }, { createdAt: 'desc' }]
      }
    },
    orderBy: [{ dispatchDate: 'desc' }, { createdAt: 'desc' }]
  });
  return dispatches.find(row => sameChallan(row.challanNo, cutCard)) || null;
}

function presentSource(dispatch, asOf) {
  const receipt = dispatch.millReceipts[0] || null;
  const purchase = dispatch.greyPurchase;
  const greyMts = receipt ? Number(receipt.greyMts) || 0 : Number(dispatch.despMts) || 0;
  const finMts = receipt ? Number(receipt.recMts) || 0 : 0;
  const greyRate = Number(dispatch.rate) || Number(purchase?.purRate) || 0;
  const jobRate = receipt ? Number(receipt.jobRate) || 0 : 0;
  const discountPercent = receipt ? Number(receipt.discountPercent) || 0 : 0;
  const interestRate = Number(purchase?.supplier?.interestRate) || 0;
  const greyDate = purchase?.billDate || dispatch.dispatchDate;
  const interestDays = interestDaySpan(greyDate, asOf);
  return {
    greyDispatchId: dispatch.id,
    millReceiptId: receipt?.id || null,
    cutCardNo: String(dispatch.challanNo || ''),
    recCardNo: receipt?.recChallan || null,
    companyName: dispatch.companyName || null,
    millName: receipt?.millName || dispatch.millName,
    lotNo: receipt?.lotNo || dispatch.millLotNo || null,
    weaverName: dispatch.weaverName || purchase?.partyName || null,
    quality: receipt?.quality || dispatch.quality || null,
    voucherNo: receipt?.voucherNo ?? null,
    billNo: receipt?.billNo || null,
    greyDate: dateKey(greyDate),
    dispatchDate: dateKey(dispatch.dispatchDate),
    receiptDate: receipt ? dateKey(receipt.receiptDate) : null,
    greyMts,
    greyRate,
    finMts,
    jobRate,
    discountPercent,
    interestRate,
    interestDays,
    hasMillReceipt: Boolean(receipt),
    takaDetails: takaRows(receipt, dispatch)
  };
}

router.get('/', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const entries = await prisma.cuttingCard.findMany({
      where: { userId: req.user.userId, status: { not: 'cancelled' } },
      orderBy: [{ entryDate: 'desc' }, { updatedAt: 'desc' }],
      take: 200
    });
    res.json({ entries });
  } catch (error) {
    next(error);
  }
});

router.get('/lookup', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const cutCard = optionalString(req.query.cutCard);
    if (!cutCard) return res.status(400).json({ error: 'Type the cut card number (dispatch challan).' });
    const dispatch = await findDispatch(req.user.userId, cutCard);
    if (!dispatch) {
      return res.status(404).json({ error: `No grey dispatch challan ${cutCard}.` });
    }
    const asOf = optionalString(req.query.asOf) || new Date().toISOString().slice(0, 10);
    const source = presentSource(dispatch, asOf);
    const saved = await prisma.cuttingCard.findFirst({
      where: {
        userId: req.user.userId,
        status: { not: 'cancelled' },
        OR: [
          { greyDispatchId: dispatch.id },
          { cutCardNo: source.cutCardNo }
        ]
      },
      orderBy: { updatedAt: 'desc' }
    });
    res.json({ source, saved });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const entry = await prisma.cuttingCard.findFirst({
      where: { id: req.params.id, userId: req.user.userId }
    });
    if (!entry) return res.status(404).json({ error: 'Cutting card not found' });
    res.json({ entry });
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const cutCard = optionalString(req.body.cutCardNo);
    if (!cutCard) return res.status(400).json({ error: 'Cut card number is required.' });
    const dispatch = await findDispatch(userId, cutCard);
    if (!dispatch) return res.status(404).json({ error: `No grey dispatch challan ${cutCard}.` });

    const entryDate = optionalString(req.body.entryDate) || new Date().toISOString().slice(0, 10);
    const source = presentSource(dispatch, entryDate);
    const freshSarees = optionalNumber(req.body.freshSarees) || 0;
    const secondSarees = optionalNumber(req.body.secondSarees) || 0;
    const interestRate = optionalNumber(req.body.interestRate) ?? source.interestRate;
    const costs = buildCuttingCost({
      greyMts: source.greyMts,
      greyRate: source.greyRate,
      finMts: source.finMts,
      jobRate: source.jobRate,
      discountPercent: source.discountPercent,
      freshSarees,
      interestRate,
      interestDays: source.interestDays
    });

    const data = {
      companyName: source.companyName,
      greyDispatchId: source.greyDispatchId,
      millReceiptId: source.millReceiptId,
      cutCardNo: source.cutCardNo,
      recCardNo: source.recCardNo,
      entryDate: new Date(entryDate),
      millName: source.millName,
      lotNo: source.lotNo,
      weaverName: source.weaverName,
      quality: source.quality,
      greyMts: source.greyMts,
      greyRate: source.greyRate,
      greyAmount: costs.greyAmount,
      finMts: source.finMts,
      jobRate: source.jobRate,
      jobAmount: costs.jobAmount,
      discountPercent: source.discountPercent,
      discountAmount: costs.discountAmount,
      freshSarees,
      secondSarees,
      actCut: costs.actCut,
      shortPct: costs.shortPct,
      interestRate,
      interestDays: source.interestDays,
      interestAmount: costs.interestAmount,
      interestPerPc: costs.interestPerPc,
      costWithoutInterest: costs.costWithoutInterest,
      costWithDiscount: costs.costWithDiscount,
      basicCost: costs.basicCost,
      takaDetails: source.takaDetails
    };

    const existingId = optionalString(req.body.id);
    const existing = existingId
      ? await prisma.cuttingCard.findFirst({ where: { id: existingId, userId } })
      : await prisma.cuttingCard.findFirst({
        where: {
          userId,
          status: { not: 'cancelled' },
          OR: [{ greyDispatchId: dispatch.id }, { cutCardNo: source.cutCardNo }]
        },
        orderBy: { updatedAt: 'desc' }
      });

    const entry = existing
      ? await prisma.cuttingCard.update({ where: { id: existing.id }, data })
      : await prisma.cuttingCard.create({ data: { userId, ...data } });

    res.status(existing ? 200 : 201).json({ entry });
  } catch (error) {
    next(error);
  }
});

export default router;
