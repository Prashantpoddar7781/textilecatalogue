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
import { resolveSupplierForEntry } from '../utils/partyMaster.js';

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

async function getCompanyContext(userId) {
  const [user, profile] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, firmName: true } }),
    prisma.businessProfile.findUnique({ where: { userId } })
  ]);
  return {
    companyName: profile?.tradeName || profile?.legalName || user?.firmName || user?.name || '',
    businessState: profile?.state || '',
    businessGstin: profile?.gstNumber || '',
    defaultHsnCode: profile?.defaultHsnCode || '',
    defaultGstRate: profile?.defaultGstRate ?? 5
  };
}

function normalizeLineItems(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((line) => {
    const mts = Number(line.mts) || 0;
    const rate = Number(line.rate) || 0;
    const taka = Number(line.taka) || 0;
    const grossAmount = roundMoney(line.grossAmount != null && line.grossAmount !== '' ? line.grossAmount : mts * rate);
    const netAmount = roundMoney(line.netAmount != null && line.netAmount !== '' ? line.netAmount : grossAmount);
    return {
      quality: optionalString(line.quality),
      taka,
      mts,
      rate,
      grossAmount,
      netAmount,
      remark: optionalString(line.remark)
    };
  });
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

function sumDispatchTaka(dispatches = []) {
  return dispatches
    .filter(d => d.status !== 'cancelled')
    .reduce((sum, d) => sum + (Number(d.despTaka) || 0), 0);
}

function buildGodownRow(entry) {
  const recMts = Number(entry.recMts) || 0;
  const despatchMts = Number(entry.despatchMts) || 0;
  const recTaka = Number(entry.recTaka) || 0;
  const dispatches = Array.isArray(entry.greyDispatches) ? entry.greyDispatches : [];
  const actualDispatchTaka = sumDispatchTaka(dispatches);
  const despatchTaka = actualDispatchTaka > 0
    ? actualDispatchTaka
    : (recMts > 0 ? roundMoney(recTaka * despatchMts / recMts) : 0);
  const stockMts = roundMoney(Math.max(0, recMts - despatchMts));
  const stockTaka = Math.max(0, recTaka - Math.round(despatchTaka));

  return {
    id: entry.id,
    date: entry.billDate,
    srNo: entry.srNo,
    billNo: entry.billNo,
    partyName: entry.partyName,
    brokerName: entry.brokerName,
    quality: entry.quality,
    taka: recTaka,
    mts: recMts,
    despatchTaka,
    despatchMts,
    stockTaka,
    rate: entry.purRate,
    grossAmount: entry.grossAmount,
    payableAmount: entry.payableAmount,
    netAmount: entry.netAmount,
    stockMts,
    sourceType: 'grey_purchase',
    sourceLabel: 'Grey Purchase',
    godown: 'Main Godown'
  };
}

function buildPurchaseStockSummary(entry, dispatches = []) {
  const recMts = Number(entry.recMts) || 0;
  const despatchMts = Number(entry.despatchMts) || 0;
  const recTaka = Number(entry.recTaka) || 0;
  const actualDispatchTaka = sumDispatchTaka(dispatches);
  const despatchTaka = actualDispatchTaka > 0
    ? actualDispatchTaka
    : (recMts > 0 ? roundMoney(recTaka * despatchMts / recMts) : 0);
  return {
    recTaka,
    recMts,
    despatchTaka,
    despatchMts,
    stockTaka: Math.max(0, recTaka - Math.round(despatchTaka)),
    stockMts: roundMoney(Math.max(0, recMts - despatchMts))
  };
}

function groupGodownRows(rows, filter) {
  const keyFor = (row) => {
    switch (filter) {
      case 'agent_wise':
        return String(row.brokerName || 'No Agent').trim() || 'No Agent';
      case 'weaver_wise':
        return row.partyName;
      case 'quality_wise':
        return String(row.quality || 'Unspecified').trim() || 'Unspecified';
      case 'date_wise':
        return row.date ? new Date(row.date).toLocaleDateString('en-IN') : 'No Date';
      case 'weaver_quality_wise':
        return `${row.partyName} · ${String(row.quality || 'Unspecified').trim() || 'Unspecified'}`;
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
      totals: { taka: 0, mts: 0, grossAmount: 0, payableAmount: 0, netAmount: 0, stockMts: 0, entries: 0 }
    };
    current.rows.push(row);
    current.totals.taka += Number(row.taka) || 0;
    current.totals.mts += Number(row.mts) || 0;
    current.totals.grossAmount += Number(row.grossAmount) || 0;
    current.totals.payableAmount += Number(row.payableAmount) || 0;
    current.totals.netAmount += Number(row.netAmount) || 0;
    current.totals.stockMts += Number(row.stockMts) || 0;
    current.totals.entries += 1;
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

async function buildGreyPurchaseData(req, userId, isUpdate = false) {
  const ctx = await getCompanyContext(userId);
  const lineItems = normalizeLineItems(req.body.lineItems);
  const takaDetails = normalizeTakaDetails(req.body.takaDetails);
  const lineGross = roundMoney(lineItems.reduce((sum, line) => sum + (Number(line.grossAmount) || 0), 0));
  const recMts = optionalNumber(req.body.recMts) ?? (takaDetails.length
    ? roundMoney(takaDetails.reduce((s, row) => s + row.mts, 0))
    : lineItems.reduce((s, l) => s + (Number(l.mts) || 0), 0));
  const recTaka = optionalNumber(req.body.recTaka) ?? (takaDetails.length
    ? takaDetails.length
    : lineItems.reduce((s, l) => s + (Number(l.taka) || 0), 0));
  const purRate = optionalNumber(req.body.purRate) ?? 0;
  const grossAmount = optionalNumber(req.body.grossAmount) ?? (recMts && purRate ? roundMoney(recMts * purRate) : lineGross);

  let supplierId = optionalString(req.body.supplierId);
  let supplier = null;
  if (supplierId) {
    supplier = await prisma.supplier.findFirst({ where: { id: supplierId, userId } });
    if (!supplier) supplierId = null;
  }

  const partyName = optionalString(req.body.partyName);
  const partyGstin = optionalString(req.body.partyGstin) || supplier?.gstNumber || null;
  const placeOfSupply = resolvePlaceOfSupply({
    partyGstin,
    placeOfSupply: req.body.placeOfSupply,
    stateCode: req.body.stateCode,
    supplierState: supplier?.state
  });

  const totals = calculateGreyPurchaseTotals({
    grossAmount,
    discountPercent: req.body.discountPercent,
    discountAmount: req.body.discountAmount,
    otherAddBefore: req.body.otherAddBefore,
    otherLessBefore: req.body.otherLessBefore,
    otherAddAfter: req.body.otherAddAfter,
    otherLessAfter: req.body.otherLessAfter,
    gstRate: req.body.gstRate ?? ctx.defaultGstRate,
    placeOfSupply,
    businessState: ctx.businessState,
    partyGstin,
    stateCode: req.body.stateCode
  });

  const count = isUpdate ? null : await prisma.greyPurchase.count({ where: { userId } });

  if (!supplier && partyName) {
    supplier = await resolveSupplierForEntry(prisma, userId, {
      supplierId,
      partyName,
      partyGstin,
      placeOfSupply: totals.placeOfSupply || placeOfSupply,
      partyMsme: req.body.partyMsme
    });
    if (supplier) supplierId = supplier.id;
  }

  return {
    ctx,
    supplierId,
    supplier,
    partyName,
    partyGstin,
    placeOfSupply,
    totals,
    lineItems,
    takaDetails,
    recMts,
    recTaka,
    purRate,
    grossAmount,
    nextSrNo: count != null ? count + 1 : null
  };
}

function resolvePlaceOfSupply({ partyGstin, placeOfSupply, stateCode, supplierState }) {
  if (optionalString(placeOfSupply)) return optionalString(placeOfSupply);
  const fromGst = getStateFromGstin(partyGstin);
  if (fromGst.stateName) return fromGst.stateName;
  if (optionalString(supplierState)) return optionalString(supplierState);
  if (optionalString(stateCode)) {
    const mapped = getStateFromGstin(String(stateCode).padStart(2, '0'));
    return mapped.stateName || null;
  }
  return null;
}

router.get('/meta', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const ctx = await getCompanyContext(req.user.userId);
    const count = await prisma.greyPurchase.count({ where: { userId: req.user.userId } });
    res.json({
      ...ctx,
      nextSrNo: count + 1,
      states: INDIAN_STATES,
      stateCodes: Object.entries(
        // unique preferred codes
        Object.fromEntries(
          Object.entries({
            '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
            '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
            '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
            '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
            '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
            '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '32': 'Kerala', '33': 'Tamil Nadu',
            '34': 'Puducherry', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh'
          })
        )
      ).map(([code, name]) => ({ code, name }))
    });
  } catch (error) {
    next(error);
  }
});

router.post('/calculate', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const ctx = await getCompanyContext(req.user.userId);
    const partyGstin = optionalString(req.body.partyGstin);
    const placeOfSupply = resolvePlaceOfSupply({
      partyGstin,
      placeOfSupply: req.body.placeOfSupply,
      stateCode: req.body.stateCode,
      supplierState: req.body.supplierState
    });

    const totals = calculateGreyPurchaseTotals({
      grossAmount: req.body.grossAmount,
      discountPercent: req.body.discountPercent,
      discountAmount: req.body.discountAmount,
      otherAddBefore: req.body.otherAddBefore,
      otherLessBefore: req.body.otherLessBefore,
      otherAddAfter: req.body.otherAddAfter,
      otherLessAfter: req.body.otherLessAfter,
      gstRate: req.body.gstRate ?? ctx.defaultGstRate,
      placeOfSupply,
      businessState: ctx.businessState,
      partyGstin,
      stateCode: req.body.stateCode
    });

    res.json({
      totals: {
        ...totals,
        placeOfSupply,
        businessState: ctx.businessState
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/godown-inventory', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const filter = String(req.query.filter || 'all').toLowerCase();
    const validFilters = new Set([
      'all', 'agent_wise', 'weaver_wise', 'quality_wise', 'date_wise',
      'weaver_quality_wise', 'sr_no_wise', 'purchase_rate_wise'
    ]);
    const activeFilter = validFilters.has(filter) ? filter : 'all';

    const entries = await prisma.greyPurchase.findMany({
      where: { userId: req.user.userId, status: { not: 'cancelled' } },
      include: {
        supplier: true,
        greyDispatches: {
          where: { status: { not: 'cancelled' } },
          select: { despTaka: true, status: true }
        }
      },
      orderBy: [{ billDate: 'desc' }, { createdAt: 'desc' }]
    });

    const rows = entries
      .map(buildGodownRow)
      // Fully dispatched bills leave godown — they belong on mill dispatch report only
      .filter(row => Number(row.stockMts) > 0.01 || Number(row.stockTaka) > 0);

    const byQuality = new Map();
    for (const row of rows) {
      const key = String(row.quality || 'Unspecified').trim() || 'Unspecified';
      const current = byQuality.get(key) || { quality: key, taka: 0, mts: 0, grossAmount: 0, netAmount: 0, entries: 0 };
      current.taka += Number(row.taka) || 0;
      current.mts += Number(row.mts) || 0;
      current.grossAmount += Number(row.grossAmount) || 0;
      current.netAmount += Number(row.netAmount) || 0;
      current.entries += 1;
      byQuality.set(key, current);
    }

    const grandTotals = {
      taka: rows.reduce((s, r) => s + (Number(r.taka) || 0), 0),
      mts: rows.reduce((s, r) => s + (Number(r.mts) || 0), 0),
      despatchTaka: rows.reduce((s, r) => s + (Number(r.despatchTaka) || 0), 0),
      stockTaka: rows.reduce((s, r) => s + (Number(r.stockTaka) || 0), 0),
      grossAmount: rows.reduce((s, r) => s + (Number(r.grossAmount) || 0), 0),
      payableAmount: rows.reduce((s, r) => s + (Number(r.payableAmount) || 0), 0),
      netAmount: rows.reduce((s, r) => s + (Number(r.netAmount) || 0), 0),
      stockMts: rows.reduce((s, r) => s + (Number(r.stockMts) || 0), 0),
      entries: rows.length
    };

    res.json({
      filter: activeFilter,
      rows: activeFilter === 'all' ? rows : [],
      groups: activeFilter === 'all' ? [] : groupGodownRows(rows, activeFilter),
      summary: Array.from(byQuality.values()).sort((a, b) => a.quality.localeCompare(b.quality)),
      totals: grandTotals
    });
  } catch (error) {
    next(error);
  }
});

router.get('/', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const entries = await prisma.greyPurchase.findMany({
      where: { userId: req.user.userId },
      include: { supplier: true },
      orderBy: [{ billDate: 'desc' }, { createdAt: 'desc' }],
      take: 100
    });
    res.json({ entries });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const entry = await prisma.greyPurchase.findFirst({
      where: { id: req.params.id, userId: req.user.userId },
      include: {
        supplier: true,
        greyDispatches: {
          where: { status: { not: 'cancelled' } },
          orderBy: [{ dispatchDate: 'asc' }, { createdAt: 'asc' }]
        }
      }
    });
    if (!entry) return res.status(404).json({ error: 'Grey purchase not found' });
    const { greyDispatches, ...purchase } = entry;
    const stockSummary = buildPurchaseStockSummary(purchase, greyDispatches);
    res.json({
      entry: purchase,
      dispatches: greyDispatches,
      stockSummary
    });
  } catch (error) {
    next(error);
  }
});

function greyPurchaseDataPayload(req, built, userId) {
  const { ctx, supplierId, supplier, partyName, partyGstin, placeOfSupply, totals, lineItems, takaDetails, recMts, recTaka, purRate, nextSrNo } = built;
  return {
    userId,
    supplierId,
    companyName: optionalString(req.body.companyName) || ctx.companyName,
    partyName,
    partyGstin,
    partyMsme: optionalString(req.body.partyMsme) || supplier?.msmeType || null,
    quality: optionalString(req.body.quality),
    srNo: optionalNumber(req.body.srNo) ?? nextSrNo,
    orderNo: optionalString(req.body.orderNo),
    hsnCode: optionalString(req.body.hsnCode) || ctx.defaultHsnCode || null,
    billNo: optionalString(req.body.billNo),
    brokerName: optionalString(req.body.brokerName),
    billDate: req.body.billDate ? new Date(req.body.billDate) : new Date(),
    checkerName: optionalString(req.body.checkerName),
    transactionType: 'GREY PURCHASE',
    typeBillNumber: optionalNumber(req.body.typeBillNumber),
    recTaka: recTaka ?? 0,
    recMts,
    purRate,
    takaDetails: takaDetails.length ? takaDetails : null,
    lineItems,
    grossAmount: totals.grossAmount,
    discountPercent: totals.discountPercent,
    discountAmount: totals.discountAmount,
    taxableAmount: totals.taxableAmount,
    otherAddBefore: totals.otherAddBefore,
    otherLessBefore: totals.otherLessBefore,
    placeOfSupply: totals.placeOfSupply || placeOfSupply,
    stateCode: totals.stateCode || getStateCodeFromName(placeOfSupply) || null,
    gstType: totals.gstType,
    gstRate: totals.gstRate,
    cgstRate: totals.cgstRate,
    cgstAmount: totals.cgstAmount,
    sgstRate: totals.sgstRate,
    sgstAmount: totals.sgstAmount,
    igstRate: totals.igstRate,
    igstAmount: totals.igstAmount,
    totalTaxAmount: totals.totalTaxAmount,
    payableAmount: totals.payableAmount,
    otherAddAfter: totals.otherAddAfter,
    otherLessAfter: totals.otherLessAfter,
    netAmount: totals.netAmount,
    paid: Boolean(req.body.paid),
    paidDate: req.body.paidDate ? new Date(req.body.paidDate) : null,
    despatchMts: optionalNumber(req.body.despatchMts) ?? 0,
    remarks: optionalString(req.body.remarks)
  };
}

router.post('/', authenticateToken, requireActiveSubscription, [
  body('partyName').trim().notEmpty().withMessage('Party A/C is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.userId;
    const built = await buildGreyPurchaseData(req, userId, false);
    const entry = await prisma.greyPurchase.create({
      data: greyPurchaseDataPayload(req, built, userId),
      include: { supplier: true }
    });

    res.status(201).json({ entry });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authenticateToken, requireActiveSubscription, [
  body('partyName').trim().notEmpty().withMessage('Party A/C is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.userId;
    const existing = await prisma.greyPurchase.findFirst({
      where: { id: req.params.id, userId }
    });
    if (!existing) return res.status(404).json({ error: 'Grey purchase not found' });

    const built = await buildGreyPurchaseData(req, userId, true);
    const payload = greyPurchaseDataPayload(req, built, userId);
    delete payload.userId;
    if (optionalNumber(req.body.srNo) == null) {
      delete payload.srNo;
    } else {
      payload.srNo = optionalNumber(req.body.srNo);
    }

    const entry = await prisma.greyPurchase.update({
      where: { id: existing.id },
      data: payload,
      include: { supplier: true }
    });

    res.json({ entry });
  } catch (error) {
    next(error);
  }
});

export default router;
