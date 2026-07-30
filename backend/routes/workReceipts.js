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
  'WORK REC. BILL',
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

function resolveTdsFields({ tdsOnAmtInput, tdsPercentInput, taxableAmount, invoiceValue }) {
  const tdsPercent = optionalNumber(tdsPercentInput) || 0;
  const rawOnAmt = optionalNumber(tdsOnAmtInput);
  const tdsOnAmt = (rawOnAmt != null && rawOnAmt > 0)
    ? rawOnAmt
    : roundMoney(taxableAmount || 0);
  const tdsAmount = roundMoney(tdsOnAmt * tdsPercent / 100);
  const netAfterTds = roundMoney((optionalNumber(invoiceValue) || 0) - tdsAmount);
  return { tdsOnAmt, tdsPercent, tdsAmount, netAfterTds };
}

function computeReceiptTotals(reqBody, lineItems, ctx, despatch = null) {
  const grossAmount = roundMoney(
    optionalNumber(reqBody.grossAmount)
    ?? lineItems.reduce((s, r) => s + (Number(r.amount) || 0), 0)
  );
  const placeOfSupply = resolvePlaceOfSupply({
    partyGstin: optionalString(reqBody.partyGstin) || despatch?.partyGstin,
    placeOfSupply: reqBody.placeOfSupply || despatch?.placeOfSupply,
    stateCode: reqBody.stateCode || despatch?.stateCode
  });
  const partyGstin = optionalString(reqBody.partyGstin) || despatch?.partyGstin;
  const totals = calculateGreyPurchaseTotals({
    grossAmount,
    discountPercent: optionalNumber(reqBody.discountPercent) ?? 0,
    discountAmount: optionalNumber(reqBody.discountAmount),
    otherAddBefore: optionalNumber(reqBody.otherAdd) ?? 0,
    otherLessBefore: optionalNumber(reqBody.otherLess) ?? 0,
    otherAddAfter: 0,
    otherLessAfter: 0,
    gstRate: reqBody.gstRate ?? ctx.defaultGstRate,
    placeOfSupply,
    businessState: ctx.businessState,
    partyGstin,
    stateCode: reqBody.stateCode || despatch?.stateCode
  });

  const invoiceValue = roundMoney(totals.netAmount);
  const { tdsOnAmt, tdsPercent, tdsAmount, netAfterTds } = resolveTdsFields({
    tdsOnAmtInput: reqBody.tdsOnAmt,
    tdsPercentInput: reqBody.tdsPercent,
    taxableAmount: totals.taxableAmount,
    invoiceValue
  });

  return {
    ...totals,
    grossAmount,
    placeOfSupply: totals.placeOfSupply || placeOfSupply,
    partyGstin,
    tdsOnAmt,
    tdsPercent,
    tdsAmount,
    invoiceValue,
    netAfterTds
  };
}

function lineAgg(lineItems) {
  return {
    totalPcs: roundMoney(lineItems.reduce((s, r) => s + (Number(r.pcs) || 0), 0)),
    totalMts: roundMoney(lineItems.reduce((s, r) => s + (Number(r.mtsQty) || 0), 0)),
    totalFresh: roundMoney(lineItems.reduce((s, r) => s + (Number(r.fresh) || 0), 0))
  };
}

router.get('/meta', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const ctx = await getCompanyContext(userId);
    const count = await prisma.workReceipt.count({ where: { userId } });
    const [customers, suppliers] = await Promise.all([
      prisma.customer.findMany({ where: { userId }, orderBy: { organizationName: 'asc' }, take: 300 }),
      prisma.supplier.findMany({ where: { userId }, orderBy: { name: 'asc' }, take: 300 })
    ]);
    const parties = [
      ...customers.map(c => ({
        name: c.organizationName,
        gstNumber: c.gstNumber,
        state: c.state,
        brokerName: c.agentName
      })),
      ...suppliers.map(s => ({
        name: s.name,
        gstNumber: s.gstNumber,
        state: s.state,
        brokerName: s.brokerName
      }))
    ].filter(p => p.name);

    res.json({
      ...ctx,
      nextVoucherNo: count + 1,
      transactionTypes: REC_TYPES,
      states: INDIAN_STATES,
      parties,
      defaultHsnCode: '9988'
    });
  } catch (error) {
    next(error);
  }
});

router.post('/calculate', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const ctx = await getCompanyContext(req.user.userId);
    const lineItems = normalizeWorkLines(req.body.lineItems, { billOnFresh: true });
    const totals = computeReceiptTotals(req.body, lineItems, ctx);
    const agg = lineAgg(lineItems);
    res.json({
      lineItems,
      totals: {
        ...totals,
        ...agg,
        invoiceValue: totals.invoiceValue,
        netAmount: totals.invoiceValue
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
      orderBy: [{ partyName: 'asc' }, { receiptDate: 'asc' }, { createdAt: 'asc' }]
    });

    const rows = [];
    for (const receipt of receipts) {
      const lines = Array.isArray(receipt.lineItems) ? receipt.lineItems : [];
      const invoiceValue = roundMoney(receipt.invoiceValue || 0);
      let tdsAmount = roundMoney(receipt.tdsAmount || 0);
      const tdsPercent = Number(receipt.tdsPercent) || 0;
      if (tdsAmount <= 0 && tdsPercent > 0) {
        const base = roundMoney(receipt.tdsOnAmt || receipt.taxableAmount || receipt.grossAmount || 0);
        tdsAmount = roundMoney(base * tdsPercent / 100);
      }
      const netAfterTds = roundMoney(
        receipt.netAfterTds != null && receipt.netAfterTds !== ''
          ? receipt.netAfterTds
          : Math.max(0, invoiceValue - tdsAmount)
      );

      if (!lines.length) {
        rows.push({
          id: receipt.id,
          receiptId: receipt.id,
          partyName: receipt.partyName,
          date: receipt.receiptDate,
          billNo: receipt.billNo || receipt.voucherNo,
          challanNo: receipt.challanNo || receipt.workDespatch?.challanNo,
          despChallan: receipt.workDespatch?.challanNo,
          itemName: '-',
          jobType: receipt.workType || '-',
          recPcs: receipt.totalPcs,
          recMts: receipt.totalMts,
          plain: 0,
          sec: 0,
          lost: 0,
          lace: 0,
          fresh: receipt.totalFresh || receipt.totalPcs,
          rate: 0,
          amount: receipt.grossAmount || receipt.taxableAmount,
          taxableAmount: receipt.taxableAmount,
          invoiceValue,
          tdsAmount,
          netAfterTds
        });
        continue;
      }
      for (const line of lines) {
        const pcs = Number(line.pcs) || 0;
        const plain = Number(line.plain) || 0;
        const sec = Number(line.sec) || 0;
        const lost = Number(line.lost) || 0;
        const lace = Number(line.lace) || 0;
        const fresh = Number(line.fresh) != null && line.fresh !== ''
          ? Number(line.fresh)
          : Math.max(0, pcs - plain - sec - lost - lace);
        rows.push({
          id: `${receipt.id}-${line.lineNo || line.itemName}`,
          receiptId: receipt.id,
          partyName: receipt.partyName,
          date: receipt.receiptDate,
          billNo: receipt.billNo || receipt.voucherNo,
          challanNo: receipt.challanNo || receipt.workDespatch?.challanNo,
          despChallan: receipt.workDespatch?.challanNo,
          itemName: line.itemName || '-',
          jobType: line.jobType || receipt.workType || '-',
          recPcs: pcs,
          recMts: Number(line.mtsQty) || 0,
          plain,
          sec,
          lost,
          lace,
          fresh,
          rate: Number(line.rate) || 0,
          amount: Number(line.amount) || 0,
          taxableAmount: Number(line.taxableValue) || Number(line.amount) || 0,
          invoiceValue,
          tdsAmount,
          netAfterTds
        });
      }
    }

    const totals = {
      recPcs: roundMoney(rows.reduce((s, r) => s + (Number(r.recPcs) || 0), 0)),
      recMts: roundMoney(rows.reduce((s, r) => s + (Number(r.recMts) || 0), 0)),
      plain: roundMoney(rows.reduce((s, r) => s + (Number(r.plain) || 0), 0)),
      sec: roundMoney(rows.reduce((s, r) => s + (Number(r.sec) || 0), 0)),
      lost: roundMoney(rows.reduce((s, r) => s + (Number(r.lost) || 0), 0)),
      lace: roundMoney(rows.reduce((s, r) => s + (Number(r.lace) || 0), 0)),
      fresh: roundMoney(rows.reduce((s, r) => s + (Number(r.fresh) || 0), 0)),
      amount: roundMoney(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0)),
      taxableAmount: roundMoney(receipts.reduce((s, r) => s + (Number(r.taxableAmount) || 0), 0)),
      invoiceValue: roundMoney(receipts.reduce((s, r) => s + (Number(r.invoiceValue) || 0), 0)),
      tdsAmount: roundMoney(receipts.reduce((s, r) => s + (Number(r.tdsAmount) || 0), 0)),
      netAfterTds: roundMoney(receipts.reduce((s, r) => {
        const inv = Number(r.invoiceValue) || 0;
        const tds = Number(r.tdsAmount) || 0;
        const net = r.netAfterTds != null ? Number(r.netAfterTds) : Math.max(0, inv - tds);
        return s + net;
      }, 0))
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

async function saveReceipt(req, res, existing = null) {
  const userId = req.user.userId;
  const ctx = await getCompanyContext(userId);
  const despatch = await prisma.workDespatch.findFirst({
    where: { id: String(req.body.workDespatchId), userId, status: { not: 'cancelled' } }
  });
  if (!despatch) {
    return res.status(404).json({ error: 'Work despatch not found' });
  }

  const pending = await buildDespatchPending(despatch, existing?.id || null);
  const lineItems = normalizeWorkLines(req.body.lineItems, { billOnFresh: true });
  if (!lineItems.length) {
    return res.status(400).json({ error: 'Add at least one received item line.' });
  }

  const agg = lineAgg(lineItems);
  if (agg.totalPcs > pending.pendingPcs + 0.01 || agg.totalMts > pending.pendingMts + 0.01) {
    return res.status(400).json({
      error: `Only ${pending.pendingPcs} pcs / ${pending.pendingMts} mts pending on this despatch.`
    });
  }

  const totals = computeReceiptTotals(req.body, lineItems, ctx, despatch);
  const partyName = optionalString(req.body.partyName) || despatch.partyName;

  await ensureMillParty(prisma, userId, partyName);
  await resolveSupplierForEntry(prisma, userId, {
    partyName,
    partyGstin: totals.partyGstin,
    placeOfSupply: totals.placeOfSupply
  });

  const data = {
    workDespatchId: despatch.id,
    companyName: optionalString(req.body.companyName) || despatch.companyName || ctx.companyName,
    transactionType: optionalString(req.body.transactionType) || REC_TYPES[0],
    partyName,
    partyGstin: totals.partyGstin,
    placeOfSupply: totals.placeOfSupply,
    stateCode: totals.stateCode || getStateCodeFromName(totals.placeOfSupply) || despatch.stateCode,
    gstType: totals.gstTypeLabel || totals.gstType || despatch.gstType,
    challanNo: optionalString(req.body.challanNo) || despatch.challanNo,
    receiptDate: req.body.receiptDate ? new Date(req.body.receiptDate) : (existing?.receiptDate || new Date()),
    brokerName: optionalString(req.body.brokerName) || despatch.brokerName,
    vehicleNo: optionalString(req.body.vehicleNo),
    workType: optionalString(req.body.workType) || despatch.workType,
    hsnCode: optionalString(req.body.hsnCode) || '9988',
    remarks: optionalString(req.body.remarks),
    receivedBy: optionalString(req.body.receivedBy),
    billNo: optionalString(req.body.billNo),
    lineItems,
    totalPcs: agg.totalPcs,
    totalMts: agg.totalMts,
    totalFresh: agg.totalFresh,
    grossAmount: totals.grossAmount,
    discountPercent: totals.discountPercent,
    discountAmount: totals.discountAmount,
    otherLess: totals.otherLessBefore,
    otherAdd: totals.otherAddBefore,
    taxableAmount: totals.taxableAmount,
    gstRate: totals.gstRate,
    cgstRate: totals.cgstRate,
    cgstAmount: totals.cgstAmount,
    sgstRate: totals.sgstRate,
    sgstAmount: totals.sgstAmount,
    igstRate: totals.igstRate,
    igstAmount: totals.igstAmount,
    invoiceValue: totals.invoiceValue,
    tdsOnAmt: totals.tdsOnAmt,
    tdsPercent: totals.tdsPercent,
    tdsAmount: totals.tdsAmount,
    netAfterTds: totals.netAfterTds
  };

  if (existing) {
    const entry = await prisma.workReceipt.update({
      where: { id: existing.id },
      data,
      include: { workDespatch: true }
    });
    return res.json({ entry });
  }

  const count = await prisma.workReceipt.count({ where: { userId } });
  const entry = await prisma.workReceipt.create({
    data: {
      userId,
      voucherNo: optionalNumber(req.body.voucherNo) ?? (count + 1),
      ...data
    },
    include: { workDespatch: true }
  });
  return res.status(201).json({ entry });
}

router.post('/', authenticateToken, requireActiveSubscription, [
  body('workDespatchId').trim().notEmpty().withMessage('Work despatch is required'),
  body('partyName').trim().notEmpty().withMessage('Party is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    await saveReceipt(req, res, null);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authenticateToken, requireActiveSubscription, [
  body('workDespatchId').trim().notEmpty().withMessage('Work despatch is required'),
  body('partyName').trim().notEmpty().withMessage('Party is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const existing = await prisma.workReceipt.findFirst({
      where: { id: req.params.id, userId: req.user.userId, status: { not: 'cancelled' } }
    });
    if (!existing) return res.status(404).json({ error: 'Work receipt not found' });
    await saveReceipt(req, res, existing);
  } catch (error) {
    next(error);
  }
});

export default router;
