import express from 'express';
import { PrismaClient } from '@prisma/client';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import { ensureMillParty, resolveSupplierForEntry } from '../utils/partyMaster.js';

const router = express.Router();
const prisma = new PrismaClient();
const RETURN_MILL_NAME = 'GREY SALES INVENTORY';
const DISPATCH_TYPES = ['PROCESS', 'REPROCESS'];

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

function normalizeDispatchType(value) {
  const text = String(value || '').trim().toUpperCase();
  return DISPATCH_TYPES.includes(text) ? text : 'PROCESS';
}

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

/**
 * Taka occupancy:
 * - PROCESS: any prior dispatch occupies (mill RETURN does not free for PROCESS)
 * - REPROCESS: mill RETURN frees takas so they can be sent again
 */
async function getOccupiedSrNos(greyPurchaseId, { mode = 'PROCESS', excludeDispatchId = null } = {}) {
  const [dispatches, millReturns] = await Promise.all([
    prisma.greyDispatch.findMany({
      where: {
        greyPurchaseId,
        status: { not: 'cancelled' },
        ...(excludeDispatchId ? { id: { not: excludeDispatchId } } : {})
      },
      select: { takaDetails: true }
    }),
    mode === 'REPROCESS'
      ? prisma.millReceipt.findMany({
        where: {
          greyPurchaseId,
          processType: 'RETURN',
          status: { not: 'cancelled' }
        },
        select: { takaDetails: true }
      })
      : Promise.resolve([])
  ]);

  const dispatchCount = new Map();
  for (const dispatch of dispatches) {
    const rows = Array.isArray(dispatch.takaDetails) ? dispatch.takaDetails : [];
    for (const row of rows) {
      if (row?.srNo == null) continue;
      const sr = Number(row.srNo);
      dispatchCount.set(sr, (dispatchCount.get(sr) || 0) + 1);
    }
  }

  if (mode !== 'REPROCESS') {
    return new Set(dispatchCount.keys());
  }

  const returnCount = new Map();
  for (const receipt of millReturns) {
    const rows = Array.isArray(receipt.takaDetails) ? receipt.takaDetails : [];
    for (const row of rows) {
      if (row?.srNo == null) continue;
      const sr = Number(row.srNo);
      returnCount.set(sr, (returnCount.get(sr) || 0) + 1);
    }
  }

  const occupied = new Set();
  for (const [sr, count] of dispatchCount.entries()) {
    if (count > (returnCount.get(sr) || 0)) occupied.add(sr);
  }
  return occupied;
}

/** @deprecated use getOccupiedSrNos */
async function getDispatchedSrNos(greyPurchaseId, excludeDispatchId = null) {
  return getOccupiedSrNos(greyPurchaseId, { mode: 'PROCESS', excludeDispatchId });
}

async function getMillReturnMetaByPurchaseIds(userId, purchaseIds) {
  if (!purchaseIds.length) return new Map();
  const returns = await prisma.millReceipt.findMany({
    where: {
      userId,
      greyPurchaseId: { in: purchaseIds },
      processType: 'RETURN',
      status: { not: 'cancelled' }
    },
    orderBy: [{ receiptDate: 'desc' }, { createdAt: 'desc' }],
    select: {
      greyPurchaseId: true,
      lotNo: true,
      greyMts: true,
      recTaka: true,
      receiptDate: true,
      millName: true
    }
  });
  const map = new Map();
  for (const row of returns) {
    if (!row.greyPurchaseId || map.has(row.greyPurchaseId)) continue;
    map.set(row.greyPurchaseId, {
      returnedLotNo: row.lotNo,
      returnedMts: roundMoney(row.greyMts),
      returnedTaka: Number(row.recTaka) || 0,
      returnedDate: row.receiptDate,
      returnedFromMill: row.millName
    });
  }
  return map;
}

function buildReceiptSummary(purchase, extra = {}) {
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
    companyName: purchase.companyName,
    ...extra
  };
}

function buildMillDispatchRow(dispatch) {
  const despTaka = Number(dispatch.despTaka) || 0;
  const despMts = Number(dispatch.despMts) || 0;
  const rate = Number(dispatch.rate) || 0;
  const balTaka = despTaka;
  const balMts = despMts;
  const balAmount = roundMoney(balMts * rate);
  const dispatchAmount = roundMoney(despMts * rate);

  return {
    id: dispatch.id,
    greyPurchaseId: dispatch.greyPurchaseId,
    date: dispatch.dispatchDate,
    srNo: dispatch.srNo,
    challanNo: dispatch.challanNo,
    purSr: dispatch.purSr,
    millName: dispatch.millName || 'Unspecified Mill',
    weaverName: dispatch.weaverName,
    brokerName: dispatch.brokerName,
    quality: dispatch.quality || 'Unspecified',
    taka: despTaka,
    mts: despMts,
    balTaka,
    balMts,
    rate,
    balAmount,
    dispatchAmount,
    remark: dispatch.remark,
    vehicleNo: dispatch.vehicleNo,
    ewayBillNo: dispatch.ewayBillNo,
    transactionType: dispatch.transactionType
  };
}

function emptyMillTotals() {
  return { taka: 0, mts: 0, balTaka: 0, balMts: 0, balAmount: 0, entries: 0 };
}

function addToMillTotals(target, row) {
  target.taka += Number(row.taka) || 0;
  target.mts += Number(row.mts) || 0;
  target.balTaka += Number(row.balTaka) || 0;
  target.balMts += Number(row.balMts) || 0;
  target.balAmount += Number(row.balAmount) || 0;
  target.entries += 1;
}

function groupDispatchRows(rows, filter) {
  const keyFor = (row) => {
    switch (filter) {
      case 'agent_wise':
        return String(row.brokerName || 'No Agent').trim() || 'No Agent';
      case 'mill_wise':
        return row.millName;
      case 'quality_wise':
        return String(row.quality || 'Unspecified').trim() || 'Unspecified';
      case 'date_wise':
        return row.date ? new Date(row.date).toLocaleDateString('en-IN') : 'No Date';
      case 'mill_quality_wise':
        return `${row.millName} · ${String(row.quality || 'Unspecified').trim() || 'Unspecified'}`;
      case 'sr_no_wise':
        return `Sr. ${row.srNo ?? '-'}`;
      case 'purchase_rate_wise':
        return `Rate ${roundMoney(row.rate).toFixed(2)}`;
      default:
        return 'All';
    }
  };

  const groups = new Map();
  for (const row of rows) {
    const key = keyFor(row);
    const current = groups.get(key) || {
      key,
      label: key,
      rows: [],
      totals: emptyMillTotals()
    };
    current.rows.push(row);
    addToMillTotals(current.totals, row);
    groups.set(key, current);
  }

  const sorted = Array.from(groups.values());
  if (filter === 'sr_no_wise') {
    sorted.sort((a, b) => {
      const aSr = Number(a.rows[0]?.srNo) || 0;
      const bSr = Number(b.rows[0]?.srNo) || 0;
      return aSr - bSr;
    });
  } else if (filter === 'purchase_rate_wise') {
    sorted.sort((a, b) => {
      const aRate = Number(a.rows[0]?.rate) || 0;
      const bRate = Number(b.rows[0]?.rate) || 0;
      return aRate - bRate || a.label.localeCompare(b.label);
    });
    for (const group of sorted) {
      group.rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }
  } else if (filter === 'date_wise') {
    sorted.sort((a, b) => new Date(b.rows[0]?.date).getTime() - new Date(a.rows[0]?.date).getTime());
  } else {
    sorted.sort((a, b) => a.label.localeCompare(b.label));
  }

  return sorted;
}

function buildMillQualitySegments(rows) {
  const mills = new Map();
  for (const row of rows) {
    const millName = row.millName || 'Unspecified Mill';
    const quality = row.quality || 'Unspecified';
    if (!mills.has(millName)) {
      mills.set(millName, { millName, qualities: new Map(), subtotal: emptyMillTotals() });
    }
    const millEntry = mills.get(millName);
    const current = millEntry.qualities.get(quality) || {
      quality,
      taka: 0,
      mts: 0,
      balTaka: 0,
      balMts: 0,
      balAmount: 0,
      rate: row.rate,
      entries: 0
    };
    current.taka += Number(row.taka) || 0;
    current.mts += Number(row.mts) || 0;
    current.balTaka += Number(row.balTaka) || 0;
    current.balMts += Number(row.balMts) || 0;
    current.balAmount += Number(row.balAmount) || 0;
    current.entries += 1;
    millEntry.qualities.set(quality, current);
    addToMillTotals(millEntry.subtotal, row);
  }

  return Array.from(mills.values())
    .map(mill => ({
      millName: mill.millName,
      qualities: Array.from(mill.qualities.values())
        .map(q => ({
          ...q,
          rate: q.balMts > 0 ? roundMoney(q.balAmount / q.balMts) : q.rate
        }))
        .sort((a, b) => a.quality.localeCompare(b.quality)),
      subtotal: {
        ...mill.subtotal,
        rate: mill.subtotal.balMts > 0
          ? roundMoney(mill.subtotal.balAmount / mill.subtotal.balMts)
          : 0
      }
    }))
    .sort((a, b) => a.millName.localeCompare(b.millName));
}

async function getNextChallanNo(userId) {
  const dispatches = await prisma.greyDispatch.findMany({
    where: { userId },
    select: { challanNo: true }
  });
  let maxChallan = 0;
  for (const dispatch of dispatches) {
    const num = Number(dispatch.challanNo);
    if (Number.isFinite(num) && num > maxChallan) maxChallan = num;
  }
  return maxChallan + 1;
}

router.get('/meta', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const ctx = await getCompanyContext(userId);
    const count = await prisma.greyDispatch.count({ where: { userId } });
    const nextChallanNo = await getNextChallanNo(userId);
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
      nextChallanNo,
      transactionTypes: DISPATCH_TYPES,
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
    const dispatchType = normalizeDispatchType(req.query.transactionType || req.query.type);
    const isReprocess = dispatchType === 'REPROCESS';

    const purchases = await prisma.greyPurchase.findMany({
      where: {
        userId,
        status: { not: 'cancelled' },
        ...(purSr != null ? { srNo: purSr } : {}),
        ...(q && purSr == null && /^\d+$/.test(q) ? { srNo: Number(q) } : {}),
        ...(isReprocess
          ? {
            millReceipts: {
              some: {
                processType: 'RETURN',
                status: { not: 'cancelled' }
              }
            }
          }
          : {})
      },
      orderBy: [{ billDate: 'desc' }, { srNo: 'desc' }],
      take: 100
    });

    const returnMeta = isReprocess
      ? await getMillReturnMetaByPurchaseIds(userId, purchases.map(p => p.id))
      : new Map();

    const entries = purchases
      .map(purchase => buildReceiptSummary(purchase, returnMeta.get(purchase.id) || {}))
      .filter(row => row.stockMts > 0);

    res.json({ entries, transactionType: dispatchType });
  } catch (error) {
    next(error);
  }
});

router.get('/grey-receipts/:greyPurchaseId/available-takas', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const mode = normalizeDispatchType(req.query.transactionType || req.query.type);
    const purchase = await prisma.greyPurchase.findFirst({
      where: { id: req.params.greyPurchaseId, userId, status: { not: 'cancelled' } }
    });
    if (!purchase) return res.status(404).json({ error: 'Grey receipt not found' });

    const occupiedSrNos = await getOccupiedSrNos(purchase.id, { mode });
    const allRows = Array.isArray(purchase.takaDetails) ? normalizeTakaDetails(purchase.takaDetails) : [];
    const availableRows = allRows.length
      ? allRows.filter(row => !occupiedSrNos.has(row.srNo))
      : (Number(purchase.recMts) > Number(purchase.despatchMts)
        ? [{ srNo: 1, mts: roundMoney(Number(purchase.recMts) - Number(purchase.despatchMts)) }]
        : []);

    const returnMeta = mode === 'REPROCESS'
      ? await getMillReturnMetaByPurchaseIds(userId, [purchase.id])
      : new Map();

    res.json({
      purchase: buildReceiptSummary(purchase, returnMeta.get(purchase.id) || {}),
      availableRows,
      dispatchedSrNos: Array.from(occupiedSrNos),
      transactionType: mode
    });
  } catch (error) {
    next(error);
  }
});

router.get('/mill-dispatch-report', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const filter = String(req.query.filter || 'all').toLowerCase();
    const validFilters = new Set([
      'all', 'agent_wise', 'mill_wise', 'quality_wise', 'date_wise',
      'mill_quality_wise', 'sr_no_wise', 'purchase_rate_wise'
    ]);
    const activeFilter = validFilters.has(filter) ? filter : 'all';
    const ctx = await getCompanyContext(userId);

    const dispatches = await prisma.greyDispatch.findMany({
      where: {
        userId,
        status: { not: 'cancelled' },
        transactionType: { not: 'RETURN' },
        millName: { not: RETURN_MILL_NAME }
      },
      orderBy: [{ dispatchDate: 'desc' }, { createdAt: 'desc' }]
    });

    const rows = dispatches.map(buildMillDispatchRow);
    const grandTotals = rows.reduce((acc, row) => {
      addToMillTotals(acc, row);
      return acc;
    }, emptyMillTotals());
    grandTotals.rate = grandTotals.balMts > 0
      ? roundMoney(grandTotals.balAmount / grandTotals.balMts)
      : 0;

    const byMill = new Map();
    for (const row of rows) {
      const key = row.millName;
      const current = byMill.get(key) || { mill: key, taka: 0, mts: 0, balAmount: 0, entries: 0 };
      current.taka += Number(row.taka) || 0;
      current.mts += Number(row.mts) || 0;
      current.balAmount += Number(row.balAmount) || 0;
      current.entries += 1;
      byMill.set(key, current);
    }

    res.json({
      filter: activeFilter,
      companyName: ctx.companyName,
      reportDate: new Date().toISOString(),
      rows: activeFilter === 'all' ? rows : [],
      groups: activeFilter === 'all' || activeFilter === 'mill_quality_wise' ? [] : groupDispatchRows(rows, activeFilter),
      millSegments: activeFilter === 'mill_quality_wise' ? buildMillQualitySegments(rows) : [],
      summary: Array.from(byMill.values()).sort((a, b) => a.mill.localeCompare(b.mill)),
      totals: grandTotals
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

    const transactionType = normalizeDispatchType(req.body.transactionType);
    const dispatchedSrNos = await getOccupiedSrNos(purchase.id, { mode: transactionType });
    for (const row of takaDetails) {
      if (dispatchedSrNos.has(row.srNo)) {
        return res.status(400).json({ error: `Taka ${row.srNo} is already dispatched.` });
      }
    }

    const count = await prisma.greyDispatch.count({ where: { userId } });
    const nextChallanNo = await getNextChallanNo(userId);
    const millName = optionalString(req.body.millName);
    if (!millName) {
      return res.status(400).json({ error: 'Mill is required.' });
    }

    if (transactionType === 'REPROCESS') {
      const millReturnCount = await prisma.millReceipt.count({
        where: {
          userId,
          greyPurchaseId: purchase.id,
          processType: 'RETURN',
          status: { not: 'cancelled' }
        }
      });
      if (millReturnCount <= 0) {
        return res.status(400).json({
          error: 'REPROCESS requires a mill RETURN (reprocess) receipt for this purchase bill.'
        });
      }
    }

    await ensureMillParty(prisma, userId, millName);
    await resolveSupplierForEntry(prisma, userId, {
      partyName: optionalString(req.body.weaverName) || purchase.partyName,
      partyGstin: purchase.partyGstin,
      placeOfSupply: purchase.placeOfSupply,
      partyMsme: purchase.partyMsme,
      transactionType: 'GREY PURCHASE'
    });

    const entry = await prisma.$transaction(async (tx) => {
      const created = await tx.greyDispatch.create({
        data: {
          userId,
          greyPurchaseId: purchase.id,
          companyName: optionalString(req.body.companyName) || purchase.companyName || ctx.companyName,
          transactionType,
          challanNo: optionalString(req.body.challanNo) || String(nextChallanNo),
          dispatchDate: req.body.dispatchDate ? new Date(req.body.dispatchDate) : new Date(),
          millLotNo: optionalString(req.body.millLotNo),
          purSr: optionalNumber(req.body.purSr) ?? purchase.srNo,
          millName,
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
