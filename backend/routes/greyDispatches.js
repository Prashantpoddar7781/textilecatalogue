import express from 'express';
import { PrismaClient } from '@prisma/client';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';

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

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

function normalizeTakaDetails(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row, index) => ({
      srNo: Number(row.srNo) || index + 1,
      mts: roundMoney(row.mts)
    }))
    .filter(row => row.mts > 0);
}

async function getCompanyContext(userId) {
  const [user, profile] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, firmName: true } }),
    prisma.businessProfile.findUnique({ where: { userId } })
  ]);
  return {
    companyName: profile?.tradeName || profile?.legalName || user?.firmName || user?.name || ''
  };
}

async function getDispatchedSrNos(greyPurchaseId, excludeDispatchId = null) {
  const dispatches = await prisma.greyDispatch.findMany({
    where: {
      greyPurchaseId,
      status: { not: 'cancelled' },
      ...(excludeDispatchId ? { id: { not: excludeDispatchId } } : {})
    },
    select: { takaDetails: true }
  });
  const srNos = new Set();
  for (const dispatch of dispatches) {
    const rows = Array.isArray(dispatch.takaDetails) ? dispatch.takaDetails : [];
    for (const row of rows) {
      if (row?.srNo != null) srNos.add(Number(row.srNo));
    }
  }
  return srNos;
}

function buildReceiptSummary(purchase) {
  const recMts = Number(purchase.recMts) || 0;
  const despatchMts = Number(purchase.despatchMts) || 0;
  const stockMts = roundMoney(Math.max(0, recMts - despatchMts));
  return {
    id: purchase.id,
    srNo: purchase.srNo,
    billNo: purchase.billNo,
    billDate: purchase.billDate,
    partyName: purchase.partyName,
    quality: purchase.quality,
    brokerName: purchase.brokerName,
    purRate: purchase.purRate,
    recTaka: purchase.recTaka,
    recMts,
    despatchMts,
    stockMts,
    orderNo: purchase.orderNo,
    remarks: purchase.remarks,
    checkerName: purchase.checkerName,
    companyName: purchase.companyName
  };
}

router.get('/meta', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const ctx = await getCompanyContext(req.user.userId);
    const count = await prisma.greyDispatch.count({ where: { userId: req.user.userId } });
    const [customers, suppliers] = await Promise.all([
      prisma.customer.findMany({
        where: { userId: req.user.userId },
        orderBy: { organizationName: 'asc' },
        take: 200
      }),
      prisma.supplier.findMany({
        where: { userId: req.user.userId },
        orderBy: { name: 'asc' },
        take: 200
      })
    ]);
    const mills = [
      ...customers.map(c => c.organizationName),
      ...suppliers.map(s => s.name)
    ].filter(Boolean);
    res.json({
      ...ctx,
      nextSrNo: count + 1,
      transactionTypes: ['PROCESS'],
      mills: Array.from(new Set(mills)).sort((a, b) => a.localeCompare(b))
    });
  } catch (error) {
    next(error);
  }
});

router.get('/grey-receipts', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const purSr = optionalNumber(req.query.purSr);
    const q = optionalString(req.query.q);

    const purchases = await prisma.greyPurchase.findMany({
      where: {
        userId,
        status: { not: 'cancelled' },
        ...(purSr != null ? { srNo: purSr } : {}),
        ...(q && purSr == null && /^\d+$/.test(q) ? { srNo: Number(q) } : {})
      },
      orderBy: [{ billDate: 'desc' }, { srNo: 'desc' }],
      take: 100
    });

    const entries = purchases
      .map(buildReceiptSummary)
      .filter(row => row.stockMts > 0);

    res.json({ entries });
  } catch (error) {
    next(error);
  }
});

router.get('/grey-receipts/:greyPurchaseId/available-takas', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const purchase = await prisma.greyPurchase.findFirst({
      where: { id: req.params.greyPurchaseId, userId, status: { not: 'cancelled' } }
    });
    if (!purchase) return res.status(404).json({ error: 'Grey receipt not found' });

    const dispatchedSrNos = await getDispatchedSrNos(purchase.id);
    const allRows = Array.isArray(purchase.takaDetails) ? normalizeTakaDetails(purchase.takaDetails) : [];
    const availableRows = allRows.length
      ? allRows.filter(row => !dispatchedSrNos.has(row.srNo))
      : (Number(purchase.recMts) > Number(purchase.despatchMts)
        ? [{ srNo: 1, mts: roundMoney(Number(purchase.recMts) - Number(purchase.despatchMts)) }]
        : []);

    res.json({
      purchase: buildReceiptSummary(purchase),
      availableRows,
      dispatchedSrNos: Array.from(dispatchedSrNos)
    });
  } catch (error) {
    next(error);
  }
});

router.get('/', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const entries = await prisma.greyDispatch.findMany({
      where: { userId: req.user.userId },
      include: { greyPurchase: true },
      orderBy: [{ dispatchDate: 'desc' }, { createdAt: 'desc' }],
      take: 100
    });
    res.json({ entries });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const entry = await prisma.greyDispatch.findFirst({
      where: { id: req.params.id, userId: req.user.userId },
      include: { greyPurchase: true }
    });
    if (!entry) return res.status(404).json({ error: 'Grey dispatch not found' });
    res.json({ entry });
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticateToken, requireActiveSubscription, [
  body('greyPurchaseId').trim().notEmpty().withMessage('Grey receipt is required'),
  body('millName').trim().notEmpty().withMessage('Mill is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.userId;
    const ctx = await getCompanyContext(userId);
    const greyPurchaseId = String(req.body.greyPurchaseId);
    const purchase = await prisma.greyPurchase.findFirst({
      where: { id: greyPurchaseId, userId, status: { not: 'cancelled' } }
    });
    if (!purchase) return res.status(404).json({ error: 'Grey receipt not found' });

    const takaDetails = normalizeTakaDetails(req.body.takaDetails);
    const despMts = optionalNumber(req.body.despMts) ?? roundMoney(takaDetails.reduce((s, r) => s + r.mts, 0));
    const despTaka = optionalNumber(req.body.despTaka) ?? (takaDetails.length || 0);

    const stockMts = roundMoney(Math.max(0, Number(purchase.recMts) - Number(purchase.despatchMts)));
    if (despMts <= 0) {
      return res.status(400).json({ error: 'Dispatch meters must be greater than zero.' });
    }
    if (despMts > stockMts + 0.01) {
      return res.status(400).json({ error: `Only ${stockMts} meters available in godown for this receipt.` });
    }

    const dispatchedSrNos = await getDispatchedSrNos(purchase.id);
    for (const row of takaDetails) {
      if (dispatchedSrNos.has(row.srNo)) {
        return res.status(400).json({ error: `Taka ${row.srNo} is already dispatched.` });
      }
    }

    const count = await prisma.greyDispatch.count({ where: { userId } });
    const entry = await prisma.$transaction(async (tx) => {
      const created = await tx.greyDispatch.create({
        data: {
          userId,
          greyPurchaseId: purchase.id,
          companyName: optionalString(req.body.companyName) || purchase.companyName || ctx.companyName,
          transactionType: optionalString(req.body.transactionType) || 'PROCESS',
          challanNo: optionalString(req.body.challanNo),
          dispatchDate: req.body.dispatchDate ? new Date(req.body.dispatchDate) : new Date(),
          millLotNo: optionalString(req.body.millLotNo),
          purSr: optionalNumber(req.body.purSr) ?? purchase.srNo,
          millName: optionalString(req.body.millName),
          ourMarka: optionalString(req.body.ourMarka),
          purBillNo: optionalString(req.body.purBillNo) || purchase.billNo,
          purDate: req.body.purDate ? new Date(req.body.purDate) : purchase.billDate,
          weaverName: optionalString(req.body.weaverName) || purchase.partyName,
          quality: optionalString(req.body.quality) || purchase.quality,
          cut: optionalNumber(req.body.cut) ?? 0,
          weight: optionalNumber(req.body.weight) ?? 0,
          rate: optionalNumber(req.body.rate) ?? purchase.purRate,
          despTaka,
          despMts,
          takaDetails: takaDetails.length ? takaDetails : null,
          remark: optionalString(req.body.remark) || purchase.remarks,
          brokerName: optionalString(req.body.brokerName) || purchase.brokerName,
          orderNo: optionalString(req.body.orderNo) || purchase.orderNo,
          checkerName: optionalString(req.body.checkerName) || purchase.checkerName,
          vehicleNo: optionalString(req.body.vehicleNo),
          ewayBillNo: optionalString(req.body.ewayBillNo),
          srNo: optionalNumber(req.body.srNo) ?? (count + 1)
        },
        include: { greyPurchase: true }
      });

      await tx.greyPurchase.update({
        where: { id: purchase.id },
        data: { despatchMts: roundMoney(Number(purchase.despatchMts) + despMts) }
      });

      return created;
    });

    res.status(201).json({ entry });
  } catch (error) {
    next(error);
  }
});

export default router;
