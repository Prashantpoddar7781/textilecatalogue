import express from 'express';
import { PrismaClient } from '@prisma/client';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import { ensureMillParty, resolveSupplierForEntry } from '../utils/partyMaster.js';
import { roundMoney } from '../utils/orderBilling.js';

const router = express.Router();
const prisma = new PrismaClient();

const DESP_TYPES = [
  'WORK DESP.SUIT CHALLAN',
  'WORK DESP.LACE SUIT CHALLAN',
  'WORK DESP LACE CHALLAN',
  'WORK DESP POONAM CHALLAN',
  'WORK DESP POONAM LACE CHALLAN'
];

const WORK_TYPES = ['EMB WORK', 'HAND WORK', 'DYEING', 'FINISHING', 'OTHER'];
const UNITS = ['PC', 'PCS', 'MTS', 'KG', 'KG (F)'];
const DEFAULT_CUT = 6.3;

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
    companyName: profile?.tradeName || profile?.legalName || user?.firmName || user?.name || ''
  };
}

export function normalizeWorkLines(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row, index) => {
      const pcs = roundMoney(row.pcs ?? 0);
      const cut = roundMoney(row.cut != null && row.cut !== '' ? row.cut : DEFAULT_CUT);
      const mtsQty = roundMoney(row.mtsQty != null && row.mtsQty !== '' ? row.mtsQty : pcs * cut);
      const rate = roundMoney(row.rate ?? 0);
      const amount = roundMoney(row.amount != null && row.amount !== '' ? row.amount : mtsQty * rate);
      const fabricRate = roundMoney(row.fabricRate ?? 0);
      const taxableValue = roundMoney(row.taxableValue != null && row.taxableValue !== '' ? row.taxableValue : amount);
      return {
        lineNo: Number(row.lineNo) || index + 1,
        itemName: String(row.itemName || '').trim(),
        bundles: roundMoney(row.bundles ?? 0),
        jobType: String(row.jobType || '').trim() || null,
        unit: String(row.unit || 'PCS').trim() || 'PCS',
        pcs,
        cut,
        mtsQty,
        rate,
        amount,
        fabricRate,
        taxableValue
      };
    })
    .filter(row => row.itemName && (row.pcs > 0 || row.mtsQty > 0));
}

function lineTotals(lines) {
  return {
    totalBundles: roundMoney(lines.reduce((s, r) => s + (Number(r.bundles) || 0), 0)),
    totalPcs: roundMoney(lines.reduce((s, r) => s + (Number(r.pcs) || 0), 0)),
    totalMts: roundMoney(lines.reduce((s, r) => s + (Number(r.mtsQty) || 0), 0)),
    totalAmount: roundMoney(lines.reduce((s, r) => s + (Number(r.amount) || 0), 0))
  };
}

async function getReceivedByDespatch(despatchId, excludeReceiptId = null) {
  const receipts = await prisma.workReceipt.findMany({
    where: {
      workDespatchId: despatchId,
      status: { not: 'cancelled' },
      ...(excludeReceiptId ? { id: { not: excludeReceiptId } } : {})
    },
    select: { lineItems: true, totalPcs: true, totalMts: true }
  });
  let pcs = 0;
  let mts = 0;
  const byLine = new Map();
  for (const receipt of receipts) {
    pcs += Number(receipt.totalPcs) || 0;
    mts += Number(receipt.totalMts) || 0;
    const rows = Array.isArray(receipt.lineItems) ? receipt.lineItems : [];
    for (const row of rows) {
      const key = Number(row.lineNo) || String(row.itemName || '').toLowerCase();
      const cur = byLine.get(key) || { pcs: 0, mts: 0 };
      cur.pcs += Number(row.pcs) || 0;
      cur.mts += Number(row.mtsQty) || 0;
      byLine.set(key, cur);
    }
  }
  return { pcs: roundMoney(pcs), mts: roundMoney(mts), byLine };
}

export async function buildDespatchPending(despatch, excludeReceiptId = null) {
  const lines = Array.isArray(despatch.lineItems) ? despatch.lineItems : [];
  const received = await getReceivedByDespatch(despatch.id, excludeReceiptId);
  const pendingLines = lines.map((row, index) => {
    const key = Number(row.lineNo) || index + 1;
    const altKey = String(row.itemName || '').toLowerCase();
    const taken = received.byLine.get(key) || received.byLine.get(altKey) || { pcs: 0, mts: 0 };
    const pcs = roundMoney(Math.max(0, (Number(row.pcs) || 0) - taken.pcs));
    const mts = roundMoney(Math.max(0, (Number(row.mtsQty) || 0) - taken.mts));
    return { ...row, lineNo: key, pendingPcs: pcs, pendingMts: mts };
  }).filter(row => row.pendingPcs > 0.001 || row.pendingMts > 0.001);

  const pendingPcs = roundMoney(pendingLines.reduce((s, r) => s + r.pendingPcs, 0));
  const pendingMts = roundMoney(pendingLines.reduce((s, r) => s + r.pendingMts, 0));

  return {
    id: despatch.id,
    challanNo: despatch.challanNo,
    despatchDate: despatch.despatchDate,
    partyName: despatch.partyName,
    partyGstin: despatch.partyGstin,
    workType: despatch.workType,
    brokerName: despatch.brokerName,
    transactionType: despatch.transactionType,
    totalPcs: despatch.totalPcs,
    totalMts: despatch.totalMts,
    receivedPcs: received.pcs,
    receivedMts: received.mts,
    pendingPcs,
    pendingMts,
    lineItems: lines,
    pendingLines
  };
}

router.get('/meta', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const ctx = await getCompanyContext(userId);
    const count = await prisma.workDespatch.count({ where: { userId } });
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
      nextChallanNo: count + 1,
      nextSrNo: count + 1,
      transactionTypes: DESP_TYPES,
      workTypes: WORK_TYPES,
      units: UNITS,
      defaultCut: DEFAULT_CUT,
      parties
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

    const where = {
      userId,
      status: { not: 'cancelled' }
    };
    if (partyName) where.partyName = { contains: partyName, mode: 'insensitive' };
    if (fromDate || toDate) {
      where.despatchDate = {};
      if (fromDate) where.despatchDate.gte = new Date(fromDate);
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        where.despatchDate.lte = end;
      }
    }

    const despatches = await prisma.workDespatch.findMany({
      where,
      orderBy: [{ despatchDate: 'asc' }, { createdAt: 'asc' }]
    });

    const rows = [];
    for (const desp of despatches) {
      const lines = Array.isArray(desp.lineItems) ? desp.lineItems : [];
      const received = await getReceivedByDespatch(desp.id);
      if (!lines.length) {
        rows.push({
          id: desp.id,
          despatchId: desp.id,
          partyName: desp.partyName,
          date: desp.despatchDate,
          challanNo: desp.challanNo,
          itemName: '-',
          jobType: desp.workType || '-',
          desPcs: Number(desp.totalPcs) || 0,
          desMts: Number(desp.totalMts) || 0,
          pendingPcs: roundMoney(Math.max(0, (Number(desp.totalPcs) || 0) - received.pcs)),
          pendingMts: roundMoney(Math.max(0, (Number(desp.totalMts) || 0) - received.mts))
        });
        continue;
      }
      for (const line of lines) {
        const k1 = Number(line.lineNo);
        const k2 = String(line.itemName || '').toLowerCase();
        const got = received.byLine.get(k1) || received.byLine.get(k2) || { pcs: 0, mts: 0 };
        rows.push({
          id: `${desp.id}-${line.lineNo || line.itemName}`,
          despatchId: desp.id,
          partyName: desp.partyName,
          date: desp.despatchDate,
          challanNo: desp.challanNo,
          itemName: line.itemName || '-',
          jobType: line.jobType || desp.workType || '-',
          desPcs: Number(line.pcs) || 0,
          desMts: Number(line.mtsQty) || 0,
          pendingPcs: roundMoney(Math.max(0, (Number(line.pcs) || 0) - got.pcs)),
          pendingMts: roundMoney(Math.max(0, (Number(line.mtsQty) || 0) - got.mts))
        });
      }
    }

    const totals = rows.reduce((acc, row) => {
      acc.desPcs = roundMoney(acc.desPcs + (Number(row.desPcs) || 0));
      acc.desMts = roundMoney(acc.desMts + (Number(row.desMts) || 0));
      acc.pendingPcs = roundMoney(acc.pendingPcs + (Number(row.pendingPcs) || 0));
      acc.pendingMts = roundMoney(acc.pendingMts + (Number(row.pendingMts) || 0));
      return acc;
    }, { desPcs: 0, desMts: 0, pendingPcs: 0, pendingMts: 0 });

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

router.get('/pending', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const partyName = optionalString(req.query.partyName);
    const despatches = await prisma.workDespatch.findMany({
      where: {
        userId,
        status: { not: 'cancelled' },
        ...(partyName ? { partyName: { contains: partyName, mode: 'insensitive' } } : {})
      },
      orderBy: [{ despatchDate: 'desc' }, { createdAt: 'desc' }],
      take: 100
    });
    const entries = [];
    for (const desp of despatches) {
      const pending = await buildDespatchPending(desp);
      if (pending.pendingPcs > 0.001 || pending.pendingMts > 0.001) entries.push(pending);
    }
    res.json({ entries });
  } catch (error) {
    next(error);
  }
});

router.get('/', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const entries = await prisma.workDespatch.findMany({
      where: { userId: req.user.userId, status: { not: 'cancelled' } },
      orderBy: [{ despatchDate: 'desc' }, { createdAt: 'desc' }],
      take: 100
    });
    res.json({ entries });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const entry = await prisma.workDespatch.findFirst({
      where: { id: req.params.id, userId: req.user.userId }
    });
    if (!entry) return res.status(404).json({ error: 'Work despatch not found' });
    const pending = await buildDespatchPending(entry);
    res.json({ entry, pending });
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticateToken, requireActiveSubscription, [
  body('partyName').trim().notEmpty().withMessage('Party is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const userId = req.user.userId;
    const ctx = await getCompanyContext(userId);
    const lineItems = normalizeWorkLines(req.body.lineItems);
    if (!lineItems.length) {
      return res.status(400).json({ error: 'Add at least one item line.' });
    }
    const totals = lineTotals(lineItems);
    const partyName = optionalString(req.body.partyName);
    const count = await prisma.workDespatch.count({ where: { userId } });

    await ensureMillParty(prisma, userId, partyName);
    await resolveSupplierForEntry(prisma, userId, {
      partyName,
      partyGstin: optionalString(req.body.partyGstin),
      placeOfSupply: optionalString(req.body.placeOfSupply)
    });

    const entry = await prisma.workDespatch.create({
      data: {
        userId,
        companyName: optionalString(req.body.companyName) || ctx.companyName,
        transactionType: optionalString(req.body.transactionType) || DESP_TYPES[0],
        partyName,
        partyGstin: optionalString(req.body.partyGstin),
        placeOfSupply: optionalString(req.body.placeOfSupply),
        stateCode: optionalString(req.body.stateCode),
        gstType: optionalString(req.body.gstType),
        challanNo: optionalString(req.body.challanNo) || String(count + 1),
        despatchDate: req.body.despatchDate ? new Date(req.body.despatchDate) : new Date(),
        brokerName: optionalString(req.body.brokerName),
        vehicleNo: optionalString(req.body.vehicleNo),
        workType: optionalString(req.body.workType),
        hsnCode: optionalString(req.body.hsnCode) || '5407',
        remarks: optionalString(req.body.remarks),
        receivedBy: optionalString(req.body.receivedBy),
        deliveryDays: optionalNumber(req.body.deliveryDays) ?? 0,
        deliveryDueDate: req.body.deliveryDueDate ? new Date(req.body.deliveryDueDate) : null,
        lrNo: optionalString(req.body.lrNo),
        ewayBillNo: optionalString(req.body.ewayBillNo),
        dhara: optionalNumber(req.body.dhara) || 0,
        grace: optionalNumber(req.body.grace) || 0,
        rateInChallan: Boolean(req.body.rateInChallan),
        srNo: optionalNumber(req.body.srNo) ?? (count + 1),
        lineItems,
        ...totals
      }
    });

    res.status(201).json({ entry });
  } catch (error) {
    next(error);
  }
});

export default router;
export { DEFAULT_CUT, DESP_TYPES, WORK_TYPES, UNITS };
