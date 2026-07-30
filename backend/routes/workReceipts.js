import express from 'express';
import { PrismaClient } from '@prisma/client';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import {
  calculateGreyPurchaseTotals,
  getStateCodeFromName,
  getStateFromGstin,
  INDIAN_STATES
} from '../utils/gstCalculation.js';
import { ensureMillParty, resolveSupplierForEntry } from '../utils/partyMaster.js';
import { roundMoney } from '../utils/orderBilling.js';
import { buildDespatchPending, normalizeWorkLines } from './workDespatches.js';

const router = express.Router();
const prisma = new PrismaClient();

const REC_TYPES = [
  'WORK REC. CHALLAN',
  'WORK REC. BILLS',
  'WORK REC LACE CHALLAN',
  'WORK REC. LACE BILLS',
  'WORK REC. LACE SUIT BILLS',
  'WORK REC. POONAM BILLS',
  'WORK REC. POONAM LACE BILLS',
  'WORK REC. SUIT BILLS'
];

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

async function getCompanyContext(userId) {
  const [user, profile] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, firmName: true } }),
    prisma.businessProfile.findUnique({ where: { userId } })
  ]);
  return {
    companyName: profile?.tradeName || profile?.legalName || user?.firmName || user?.name || '',
    businessState: profile?.state || null,
    defaultGstRate: 5
  };
}

function resolvePlaceOfSupply({ partyGstin, placeOfSupply, stateCode }) {
  if (optionalString(placeOfSupply)) return optionalString(placeOfSupply);
  const fromGst = getStateFromGstin(partyGstin);
  if (fromGst.stateName) return fromGst.stateName;
  if (optionalString(stateCode)) {
    const mapped = getStateFromGstin(String(stateCode).padStart(2, '0'));
    return mapped.stateName || null;
  }
  return null;
}

router.get('/meta', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const ctx = await getCompanyContext(userId);
    const count = await prisma.workReceipt.count({ where: { userId } });
    res.json({
      ...ctx,
      nextVoucherNo: count + 1,
      transactionTypes: REC_TYPES,
      states: INDIAN_STATES
    });
  } catch (error) {
    next(error);
  }
});

router.post('/calculate', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const ctx = await getCompanyContext(req.user.userId);
    const lineItems = normalizeWorkLines(req.body.lineItems);
    const taxableAmount = roundMoney(
      optionalNumber(req.body.taxableAmount)
      ?? lineItems.reduce((s, r) => s + (Number(r.taxableValue) || Number(r.amount) || 0), 0)
    );
    const placeOfSupply = resolvePlaceOfSupply({
      partyGstin: req.body.partyGstin,
      placeOfSupply: req.body.placeOfSupply,
      stateCode: req.body.stateCode
    });
    const totals = calculateGreyPurchaseTotals({
      grossAmount: taxableAmount,
      discountPercent: 0,
      otherAddBefore: 0,
      otherLessBefore: 0,
      otherAddAfter: 0,
      otherLessAfter: 0,
      gstRate: req.body.gstRate ?? ctx.defaultGstRate,
      placeOfSupply,
      businessState: ctx.businessState,
      partyGstin: req.body.partyGstin,
      stateCode: req.body.stateCode
    });
    res.json({
      totals: {
        ...totals,
        taxableAmount,
        invoiceValue: totals.netAmount,
        placeOfSupply
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/report', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const fromDate = optionalString(req.query.fromDate);
    const toDate = optionalString(req.query.toDate);
    const partyName = optionalString(req.query.partyName);
    const ctx = await getCompanyContext(userId);

    const where = { userId, status: { not: 'cancelled' } };
    if (partyName) where.partyName = { contains: partyName, mode: 'insensitive' };
    if (fromDate || toDate) {
      where.receiptDate = {};
      if (fromDate) where.receiptDate.gte = new Date(fromDate);
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        where.receiptDate.lte = end;
      }
    }

    const receipts = await prisma.workReceipt.findMany({
      where,
      include: { workDespatch: { select: { challanNo: true, despatchDate: true } } },
      orderBy: [{ receiptDate: 'asc' }, { createdAt: 'asc' }]
    });

    const rows = [];
    for (const receipt of receipts) {
      const lines = Array.isArray(receipt.lineItems) ? receipt.lineItems : [];
      if (!lines.length) {
        rows.push({
          id: receipt.id,
          partyName: receipt.partyName,
          date: receipt.receiptDate,
          challanNo: receipt.challanNo || receipt.workDespatch?.challanNo,
          despChallan: receipt.workDespatch?.challanNo,
          itemName: '-',
          jobType: receipt.workType || '-',
          recPcs: receipt.totalPcs,
          recMts: receipt.totalMts,
          taxableAmount: receipt.taxableAmount,
          invoiceValue: receipt.invoiceValue
        });
        continue;
      }
      for (const line of lines) {
        rows.push({
          id: `${receipt.id}-${line.lineNo || line.itemName}`,
          receiptId: receipt.id,
          partyName: receipt.partyName,
          date: receipt.receiptDate,
          challanNo: receipt.challanNo || receipt.workDespatch?.challanNo,
          despChallan: receipt.workDespatch?.challanNo,
          itemName: line.itemName || '-',
          jobType: line.jobType || receipt.workType || '-',
          recPcs: Number(line.pcs) || 0,
          recMts: Number(line.mtsQty) || 0,
          rate: Number(line.rate) || 0,
          amount: Number(line.amount) || 0,
          fabricRate: Number(line.fabricRate) || 0,
          taxableAmount: Number(line.taxableValue) || Number(line.amount) || 0,
          invoiceValue: receipt.invoiceValue
        });
      }
    }

    const totals = {
      recPcs: roundMoney(rows.reduce((s, r) => s + (Number(r.recPcs) || 0), 0)),
      recMts: roundMoney(rows.reduce((s, r) => s + (Number(r.recMts) || 0), 0)),
      taxableAmount: roundMoney(receipts.reduce((s, r) => s + (Number(r.taxableAmount) || 0), 0)),
      invoiceValue: roundMoney(receipts.reduce((s, r) => s + (Number(r.invoiceValue) || 0), 0))
    };

    res.json({
      companyName: ctx.companyName,
      fromDate,
      toDate,
      reportDate: new Date().toISOString(),
      rows,
      totals
    });
  } catch (error) {
    next(error);
  }
});

router.get('/', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const entries = await prisma.workReceipt.findMany({
      where: { userId: req.user.userId, status: { not: 'cancelled' } },
      include: { workDespatch: true },
      orderBy: [{ receiptDate: 'desc' }, { createdAt: 'desc' }],
      take: 100
    });
    res.json({ entries });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const entry = await prisma.workReceipt.findFirst({
      where: { id: req.params.id, userId: req.user.userId },
      include: { workDespatch: true }
    });
    if (!entry) return res.status(404).json({ error: 'Work receipt not found' });
    res.json({ entry });
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticateToken, requireActiveSubscription, [
  body('workDespatchId').trim().notEmpty().withMessage('Work despatch is required'),
  body('partyName').trim().notEmpty().withMessage('Party is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const userId = req.user.userId;
    const ctx = await getCompanyContext(userId);
    const despatch = await prisma.workDespatch.findFirst({
      where: { id: String(req.body.workDespatchId), userId, status: { not: 'cancelled' } }
    });
    if (!despatch) return res.status(404).json({ error: 'Work despatch not found' });

    const pending = await buildDespatchPending(despatch);
    const lineItems = normalizeWorkLines(req.body.lineItems);
    if (!lineItems.length) {
      return res.status(400).json({ error: 'Add at least one received item line.' });
    }

    const recPcs = roundMoney(lineItems.reduce((s, r) => s + (Number(r.pcs) || 0), 0));
    const recMts = roundMoney(lineItems.reduce((s, r) => s + (Number(r.mtsQty) || 0), 0));
    if (recPcs > pending.pendingPcs + 0.01 || recMts > pending.pendingMts + 0.01) {
      return res.status(400).json({
        error: `Only ${pending.pendingPcs} pcs / ${pending.pendingMts} mts pending on this despatch.`
      });
    }

    const taxableAmount = roundMoney(
      optionalNumber(req.body.taxableAmount)
      ?? lineItems.reduce((s, r) => s + (Number(r.taxableValue) || Number(r.amount) || 0), 0)
    );

    const partyGstin = optionalString(req.body.partyGstin) || despatch.partyGstin;
    const placeOfSupply = resolvePlaceOfSupply({
      partyGstin,
      placeOfSupply: req.body.placeOfSupply || despatch.placeOfSupply,
      stateCode: req.body.stateCode || despatch.stateCode
    });

    const totals = calculateGreyPurchaseTotals({
      grossAmount: taxableAmount,
      discountPercent: 0,
      otherAddBefore: 0,
      otherLessBefore: 0,
      otherAddAfter: 0,
      otherLessAfter: 0,
      gstRate: req.body.gstRate ?? ctx.defaultGstRate,
      placeOfSupply,
      businessState: ctx.businessState,
      partyGstin,
      stateCode: req.body.stateCode || despatch.stateCode
    });

    const partyName = optionalString(req.body.partyName) || despatch.partyName;
    const count = await prisma.workReceipt.count({ where: { userId } });

    await ensureMillParty(prisma, userId, partyName);
    await resolveSupplierForEntry(prisma, userId, {
      partyName,
      partyGstin,
      placeOfSupply: totals.placeOfSupply || placeOfSupply
    });

    const entry = await prisma.workReceipt.create({
      data: {
        userId,
        workDespatchId: despatch.id,
        companyName: optionalString(req.body.companyName) || despatch.companyName || ctx.companyName,
        transactionType: optionalString(req.body.transactionType) || REC_TYPES[0],
        partyName,
        partyGstin,
        placeOfSupply: totals.placeOfSupply || placeOfSupply,
        stateCode: totals.stateCode || getStateCodeFromName(placeOfSupply) || despatch.stateCode,
        gstType: totals.gstTypeLabel || totals.gstType || despatch.gstType,
        challanNo: optionalString(req.body.challanNo) || despatch.challanNo,
        voucherNo: optionalNumber(req.body.voucherNo) ?? (count + 1),
        receiptDate: req.body.receiptDate ? new Date(req.body.receiptDate) : new Date(),
        brokerName: optionalString(req.body.brokerName) || despatch.brokerName,
        vehicleNo: optionalString(req.body.vehicleNo),
        workType: optionalString(req.body.workType) || despatch.workType,
        hsnCode: optionalString(req.body.hsnCode) || despatch.hsnCode || '5407',
        remarks: optionalString(req.body.remarks),
        receivedBy: optionalString(req.body.receivedBy),
        billNo: optionalString(req.body.billNo),
        lineItems,
        totalPcs: recPcs,
        totalMts: recMts,
        taxableAmount: totals.taxableAmount,
        gstRate: totals.gstRate,
        cgstRate: totals.cgstRate,
        cgstAmount: totals.cgstAmount,
        sgstRate: totals.sgstRate,
        sgstAmount: totals.sgstAmount,
        igstRate: totals.igstRate,
        igstAmount: totals.igstAmount,
        invoiceValue: totals.netAmount
      },
      include: { workDespatch: true }
    });

    res.status(201).json({ entry });
  } catch (error) {
    next(error);
  }
});

export default router;
