import express from 'express';
import { PrismaClient } from '@prisma/client';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import { resolveCustomerForEntry } from '../utils/partyMaster.js';
import { roundMoney, roundRupee, allocateNextInvoiceNumber, saleBillDiscount } from '../utils/orderBilling.js';
import { allocateNextTypeBillNumber } from '../utils/transactionBilling.js';
import { getStateFromGstin, calculateGstBreakup } from '../utils/gstCalculation.js';
import { getGstDefaultsForTransactionType } from '../constants/erpTransactionTypes.js';
import { linesForSource, qtySlicesForSalesOrder } from '../utils/documentLinkAttribution.js';
import { rememberItemRateAndCut } from '../utils/itemMasterRates.js';
import { bankAdjustmentBlock } from '../utils/voucherDelete.js';
import {
  challanVoucherNo,
  findSalesChallansByNumber,
  listPendingSalesChallans,
  loadConsumingBills,
  picksSalesChallan,
  toChallanPickEntry
} from '../utils/salesChallanPick.js';

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

const toDate = (value, fallback = new Date()) => {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
};

async function getCompanyContext(userId) {
  const [user, profile] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, firmName: true } }),
    prisma.businessProfile.findUnique({ where: { userId } })
  ]);
  return {
    companyName: profile?.tradeName || profile?.legalName || user?.firmName || user?.name || '',
    businessState: profile?.state || '',
    defaultHsnCode: profile?.defaultHsnCode || '5407',
    defaultGstRate: Number(profile?.defaultGstRate) || 5
  };
}

function billedMetres(mts, lessFold) {
  const metres = Number(mts) || 0;
  const fold = Number(lessFold) || 0;
  if (!(metres > 0)) return 0;
  if (!(fold > 0) || fold >= 100) return metres;
  return metres * (100 - fold) / 100;
}

function normalizeSalesLines(raw, context = {}) {
  if (!Array.isArray(raw)) return [];
  return raw.map((input, index) => {
    const pcs = roundMoney(input.pcs ?? input.quantity ?? 0);
    const cut = roundMoney(input.cut ?? 0);
    const mtsQty = roundMoney(
      input.mtsQty != null && input.mtsQty !== ''
        ? input.mtsQty
        : pcs * cut
    );
    const rate = roundMoney(input.rate ?? input.retailPrice ?? 0);
    const lessFold = roundMoney(input.lessFold ?? 0);
    const unit = optionalString(input.unit) || 'PCS';
    const metre = /^(MTS|MTR|METRE|METER|METERS)$/i.test(unit);
    const amount = roundMoney(
      metre && rate > 0
        ? billedMetres(mtsQty, lessFold) * rate
        : (input.amount != null && input.amount !== '' ? input.amount : pcs * rate)
    );
    const discountPercent = Number(input.discountPercent) || 0;
    const discountAmount = roundMoney(
      input.discountAmount != null && input.discountAmount !== ''
        ? input.discountAmount
        : amount * discountPercent / 100
    );
    const manualAddLess = roundMoney(input.manualAddLess ?? 0);
    const taxableAmount = roundMoney(amount - discountAmount + manualAddLess);
    const gstRate = Number(input.gstRate ?? context.defaultGstRate) || 0;
    const gst = calculateGstBreakup({
      taxableAmount,
      gstRate,
      placeOfSupply: context.placeOfSupply,
      businessState: context.businessState
    });
    const taxAmount = roundMoney(gst.totalTaxAmount);
    return {
      lineNo: Number(input.lineNo) || index + 1,
      itemMasterId: optionalString(input.itemMasterId),
      itemName: optionalString(input.itemName || input.description) || '',
      bundles: roundMoney(input.bundles ?? 0),
      bundleEntry: optionalString(input.bundleEntry),
      mainScreen: optionalString(input.mainScreen) || '',
      screenName: optionalString(input.screenName) || optionalString(input.itemName || input.description) || '',
      packing: optionalString(input.packing) || 'NAKED',
      unit,
      pcs,
      cut,
      lessFold,
      mtsQty,
      rate,
      amount,
      rd: roundMoney(input.rd ?? 0),
      discountPercent,
      discountAmount,
      addRemark: optionalString(input.addRemark),
      manualAddLess,
      gstRate,
      cgstRate: gst.cgstRate,
      cgstAmount: gst.cgstAmount,
      sgstRate: gst.sgstRate,
      sgstAmount: gst.sgstAmount,
      igstRate: gst.igstRate,
      igstAmount: gst.igstAmount,
      taxAmount,
      taxableAmount,
      totalAmount: roundMoney(taxableAmount + taxAmount),
      hsnCode: optionalString(input.hsnCode) || context.defaultHsnCode || '5407',
      sourceSalesOrderId: optionalString(input.sourceSalesOrderId),
      sourceChallanId: optionalString(input.sourceChallanId),
      sourceOrderNo: optionalString(input.sourceOrderNo),
      sourceLineNo: optionalNumber(input.sourceLineNo)
        ?? (optionalString(input.sourceSalesOrderId) || optionalString(input.sourceChallanId)
          ? (Number(input.lineNo) || index + 1)
          : null),
      sourceAllocations: normalizeSourceAllocations(input.sourceAllocations),
      sourceKind: optionalString(input.sourceKind) === 'order_form' ? 'order_form' : null
    };
  }).filter(line => line.itemName && (line.pcs > 0 || line.amount > 0));
}

function normalizeSourceAllocations(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(row => ({
      sourceSalesOrderId: optionalString(row?.sourceSalesOrderId),
      sourceOrderNo: optionalString(row?.sourceOrderNo),
      sourceLineNo: optionalNumber(row?.sourceLineNo),
      pcs: roundMoney(row?.pcs ?? 0),
      mtsQty: roundMoney(row?.mtsQty ?? 0)
    }))
    .filter(row => row.sourceSalesOrderId && (row.pcs > 0 || row.mtsQty > 0));
}

function scaleAllocationsToLine(line) {
  const allocs = Array.isArray(line.sourceAllocations) ? line.sourceAllocations : [];
  if (!allocs.length) return line;
  const sumPcs = roundMoney(allocs.reduce((sum, row) => sum + (Number(row.pcs) || 0), 0));
  const sumMts = roundMoney(allocs.reduce((sum, row) => sum + (Number(row.mtsQty) || 0), 0));
  const targetPcs = Number(line.pcs) || 0;
  const targetMts = Number(line.mtsQty) || 0;
  if (sumPcs <= 0 && sumMts <= 0) return line;
  if (Math.abs(sumPcs - targetPcs) <= 0.01 && Math.abs(sumMts - targetMts) <= 0.01) return line;
  const scaled = allocs.map((row, index) => {
    const pcs = sumPcs > 0 ? roundMoney(row.pcs * targetPcs / sumPcs) : (index === 0 ? targetPcs : 0);
    const mtsQty = sumMts > 0 ? roundMoney(row.mtsQty * targetMts / sumMts) : (index === 0 ? targetMts : 0);
    return { ...row, pcs, mtsQty };
  });
  const pcsDrift = roundMoney(targetPcs - scaled.reduce((sum, row) => sum + row.pcs, 0));
  const mtsDrift = roundMoney(targetMts - scaled.reduce((sum, row) => sum + row.mtsQty, 0));
  if (scaled.length) {
    scaled[scaled.length - 1].pcs = roundMoney(scaled[scaled.length - 1].pcs + pcsDrift);
    scaled[scaled.length - 1].mtsQty = roundMoney(scaled[scaled.length - 1].mtsQty + mtsDrift);
  }
  return { ...line, sourceAllocations: scaled };
}

function aggregateLines(lines) {
  return {
    totalBundles: roundMoney(lines.reduce((sum, line) => sum + line.bundles, 0)),
    totalPcs: roundMoney(lines.reduce((sum, line) => sum + line.pcs, 0)),
    totalMts: roundMoney(lines.reduce((sum, line) => sum + line.mtsQty, 0)),
    grossAmount: roundMoney(lines.reduce((sum, line) => sum + line.amount, 0)),
    discountAmount: roundMoney(lines.reduce((sum, line) => sum + line.discountAmount, 0)),
    taxableAmount: roundMoney(lines.reduce((sum, line) => sum + line.taxableAmount, 0)),
    totalTaxAmount: roundMoney(lines.reduce((sum, line) => sum + line.taxAmount, 0)),
    netAmount: roundMoney(lines.reduce((sum, line) => sum + line.totalAmount, 0))
  };
}

async function soldBySalesOrder(salesOrderId, excludeBillId = null, client = prisma) {
  const bills = await client.order.findMany({
    where: {
      status: 'completed',
      NOT: { transactionType: { equals: 'SALES GOODS RETURN', mode: 'insensitive' } },
      OR: [
        { sourceSalesOrderId: salesOrderId },
        { sourceSalesOrderIds: { has: salesOrderId } }
      ],
      ...(excludeBillId ? { id: { not: excludeBillId } } : {})
    },
    select: { id: true, sourceSalesOrderId: true, sourceSalesOrderIds: true, orderLines: true }
  });
  const byLine = new Map();
  const lineOpts = {
    primaryIdField: 'sourceSalesOrderId',
    lineSourceField: 'sourceSalesOrderId',
    linesField: 'orderLines'
  };
  for (const bill of bills) {
    const lines = Array.isArray(bill.orderLines) ? bill.orderLines : [];
    const usesSlices = lines.some(line => (
      (Array.isArray(line.sourceAllocations) && line.sourceAllocations.length)
      || line.sourceSalesOrderId
    ));
    const slices = usesSlices
      ? lines.flatMap(line => qtySlicesForSalesOrder(line, salesOrderId))
      : linesForSource(bill, salesOrderId, lineOpts).map(line => ({
        sourceLineNo: Number(line.sourceLineNo || line.lineNo) || 0,
        pcs: Number(line.pcs ?? line.quantity) || 0,
        mtsQty: Number(line.mtsQty) || 0
      }));
    for (const slice of slices) {
      const key = Number(slice.sourceLineNo) || 0;
      const current = byLine.get(key) || { pcs: 0, mtsQty: 0 };
      current.pcs = roundMoney(current.pcs + (Number(slice.pcs) || 0));
      current.mtsQty = roundMoney(current.mtsQty + (Number(slice.mtsQty) || 0));
      byLine.set(key, current);
    }
  }
  return byLine;
}

async function buildPending(order, excludeBillId = null, client = prisma) {
  const sourceLines = Array.isArray(order.lineItems) ? order.lineItems : [];
  const sold = await soldBySalesOrder(order.id, excludeBillId, client);
  const pendingLines = sourceLines.map((line, index) => {
    const lineNo = Number(line.lineNo) || index + 1;
    const used = sold.get(lineNo) || { pcs: 0, mtsQty: 0 };
    const soldPcs = roundMoney(used.pcs);
    const soldMts = roundMoney(used.mtsQty);
    const pendingPcs = roundMoney(Math.max(0, (Number(line.pcs) || 0) - soldPcs));
    const pendingMts = roundMoney(Math.max(0, (Number(line.mtsQty) || 0) - soldMts));
    return {
      ...line,
      lineNo,
      sourceLineNo: lineNo,
      soldPcs,
      soldMts,
      pendingPcs,
      pendingMts
    };
  });
  const pendingPcs = roundMoney(pendingLines.reduce((sum, line) => sum + line.pendingPcs, 0));
  const pendingMts = roundMoney(pendingLines.reduce((sum, line) => sum + line.pendingMts, 0));
  return {
    ...order,
    pendingLines,
    soldPcs: roundMoney((Number(order.totalPcs) || 0) - pendingPcs),
    soldMts: roundMoney((Number(order.totalMts) || 0) - pendingMts),
    pendingPcs,
    pendingMts
  };
}

async function refreshSalesOrderStatus(client, salesOrderId) {
  if (!salesOrderId) return;
  const order = await client.salesOrder.findUnique({ where: { id: salesOrderId } });
  if (!order) return;
  const pending = await buildPending(order, null, client);
  const soldAny = pending.soldPcs > 0.001 || pending.soldMts > 0.001;
  const status = pending.pendingPcs <= 0.001 && pending.pendingMts <= 0.001
    ? 'closed'
    : soldAny ? 'partial' : 'open';
  if (status !== order.status) {
    await client.salesOrder.update({ where: { id: salesOrderId }, data: { status } });
  }
}

function itemData(body) {
  return {
    name: optionalString(body.name),
    mainScreen: optionalString(body.mainScreen),
    packing: optionalString(body.packing) || 'NAKED',
    cut: optionalNumber(body.cut) ?? 0,
    greyQuality: optionalString(body.greyQuality),
    finishType: optionalString(body.finishType) || 'FINISH',
    itemType: optionalString(body.itemType) || 'SAREE',
    screenSeries: optionalString(body.screenSeries),
    category: optionalString(body.category),
    unit: optionalString(body.unit) || 'PCS',
    sellingRate: optionalNumber(body.sellingRate) ?? 0,
    rate2: optionalNumber(body.rate2) ?? 0,
    rate3: optionalNumber(body.rate3) ?? 0,
    workCut: optionalNumber(body.workCut) ?? 0,
    hsnSac: optionalString(body.hsnSac),
    gstRate: optionalNumber(body.gstRate) ?? 0,
    remark: optionalString(body.remark)
  };
}

router.get('/meta', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const [ctx, orderNoResult, customers, items] = await Promise.all([
      getCompanyContext(userId),
      prisma.salesOrder.aggregate({ where: { userId }, _max: { orderNo: true } }),
      prisma.customer.findMany({ where: { userId }, orderBy: { organizationName: 'asc' }, take: 500 }),
      prisma.salesItemMaster.findMany({ where: { userId }, orderBy: [{ mainScreen: 'asc' }, { name: 'asc' }] })
    ]);
    res.json({ ...ctx, nextOrderNo: (orderNoResult._max.orderNo || 0) + 1, customers, items });
  } catch (error) {
    next(error);
  }
});

router.get('/item-options', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const [saved, items] = await Promise.all([
      prisma.itemFieldOption.findMany({ where: { userId }, select: { field: true, name: true } }),
      prisma.salesItemMaster.findMany({
        where: { userId },
        select: {
          packing: true,
          greyQuality: true,
          finishType: true,
          itemType: true,
          screenSeries: true,
          category: true,
          unit: true
        }
      })
    ]);
    const lists = {
      packing: new Set(),
      greyQuality: new Set(),
      type: new Set(),
      itemType: new Set(),
      screenSeries: new Set(),
      category: new Set(),
      unit: new Set()
    };
    const add = (field, value) => {
      const name = String(value || '').replace(/\s+/g, ' ').trim();
      if (!name || name === '-' || !lists[field]) return;
      lists[field].add(name);
    };
    for (const row of saved) add(row.field, row.name);
    for (const item of items) {
      add('packing', item.packing);
      add('greyQuality', item.greyQuality);
      add('type', item.finishType);
      add('itemType', item.itemType);
      add('screenSeries', item.screenSeries);
      add('category', item.category);
      add('unit', item.unit);
    }
    add('type', 'FINISH');
    add('type', 'GREY');
    const options = {};
    for (const [field, names] of Object.entries(lists)) {
      options[field] = [...names].sort((a, b) => a.localeCompare(b));
    }
    res.json({ options });
  } catch (error) {
    next(error);
  }
});

router.get('/items', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const items = await prisma.salesItemMaster.findMany({
      where: { userId: req.user.userId },
      orderBy: [{ mainScreen: 'asc' }, { name: 'asc' }]
    });
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.post('/items', authenticateToken, requireActiveSubscription, [
  body('name').trim().notEmpty(),
  body('mainScreen').trim().notEmpty()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const item = await prisma.salesItemMaster.create({
      data: { userId: req.user.userId, ...itemData(req.body) }
    });
    res.status(201).json({ item });
  } catch (error) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'This item name already exists for the Main Screen.' });
    }
    next(error);
  }
});

router.put('/items/:id', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const existing = await prisma.salesItemMaster.findFirst({
      where: { id: req.params.id, userId: req.user.userId }
    });
    if (!existing) return res.status(404).json({ error: 'Item not found' });
    const item = await prisma.salesItemMaster.update({
      where: { id: existing.id },
      data: itemData(req.body)
    });
    res.json({ item });
  } catch (error) {
    next(error);
  }
});

router.get('/by-challan', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const raw = optionalString(req.query.no);
    if (!raw) return res.json({ entries: [] });
    if (picksSalesChallan(req.query.transactionType)) {
      const entries = await findSalesChallansByNumber(
        prisma,
        req.user.userId,
        raw,
        optionalString(req.query.excludeId)
      );
      return res.json({ entries });
    }
    const digits = raw.replace(/[^\d]/g, '');
    const asNumber = Number(digits);
    const or = [
      { challanNo: { equals: raw, mode: 'insensitive' } }
    ];
    if (Number.isFinite(asNumber) && asNumber > 0 && String(asNumber) === digits) {
      or.push({ orderNo: asNumber });
      if (String(asNumber) !== raw) {
        or.push({ challanNo: { equals: String(asNumber), mode: 'insensitive' } });
      }
    }
    const orders = await prisma.salesOrder.findMany({
      where: { userId: req.user.userId, OR: or },
      orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }],
      take: 20
    });
    const entries = [];
    for (const order of orders) entries.push(await buildPending(order));
    res.json({ entries });
  } catch (error) {
    next(error);
  }
});

router.get('/pending', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const partyName = optionalString(req.query.partyName);
    const customerId = optionalString(req.query.customerId);
    const excludeId = optionalString(req.query.excludeId);
    if (picksSalesChallan(req.query.transactionType)) {
      const entries = await listPendingSalesChallans(prisma, req.user.userId, {
        partyName,
        customerId,
        excludeBillId: excludeId
      });
      return res.json({ entries });
    }
    // Finish Sales must pick party first — never list all parties' orders.
    if (!customerId && !partyName) {
      return res.json({ entries: [] });
    }
    // Prefer exact party name when provided so Ord/Ref always matches the selected party text.
    const partyFilter = partyName
      ? { partyName: { equals: partyName, mode: 'insensitive' } }
      : { customerId };
    const orders = await prisma.salesOrder.findMany({
      where: {
        userId: req.user.userId,
        status: excludeId ? { in: ['open', 'partial', 'closed'] } : { in: ['open', 'partial'] },
        ...partyFilter
      },
      orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }]
    });
    const entries = [];
    for (const order of orders) {
      const pending = await buildPending(order, excludeId);
      if (pending.pendingPcs > 0.001 || pending.pendingMts > 0.001) entries.push(pending);
    }
    res.json({ entries });
  } catch (error) {
    next(error);
  }
});

router.get('/report', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const fromDate = optionalString(req.query.fromDate);
    const toDateValue = optionalString(req.query.toDate);
    const partyName = optionalString(req.query.partyName);
    const mainScreen = optionalString(req.query.mainScreen);
    const itemName = optionalString(req.query.itemName);
    const brokerName = optionalString(req.query.brokerName);
    const haste = optionalString(req.query.haste);
    const status = optionalString(req.query.status);
    const where = { userId };
    if (partyName) where.partyName = { contains: partyName, mode: 'insensitive' };
    if (brokerName) where.brokerName = { contains: brokerName, mode: 'insensitive' };
    if (haste) where.haste = { contains: haste, mode: 'insensitive' };
    if (status === 'pending') where.status = { in: ['open', 'partial'] };
    else if (status && status !== 'all') where.status = status;
    if (fromDate || toDateValue) {
      where.orderDate = {};
      if (fromDate) where.orderDate.gte = toDate(fromDate);
      if (toDateValue) {
        const end = toDate(toDateValue);
        end.setHours(23, 59, 59, 999);
        where.orderDate.lte = end;
      }
    }
    const orders = await prisma.salesOrder.findMany({
      where,
      orderBy: [{ orderDate: 'asc' }, { partyName: 'asc' }, { orderNo: 'asc' }]
    });
    const rows = [];
    for (const order of orders) {
      const pending = await buildPending(order);
      for (const line of pending.pendingLines) {
        if (mainScreen && !String(line.mainScreen || '').toLowerCase().includes(mainScreen.toLowerCase())) continue;
        if (itemName && !String(line.itemName || '').toLowerCase().includes(itemName.toLowerCase())) continue;
        rows.push({
          id: `${order.id}-${line.lineNo}`,
          salesOrderId: order.id,
          date: order.orderDate,
          orderNo: order.orderNo,
          partyName: order.partyName,
          brokerName: order.brokerName,
          haste: order.haste,
          status: order.status,
          mainScreen: line.mainScreen,
          itemName: line.itemName,
          packing: line.packing,
          cut: line.cut,
          orderPcs: Number(line.pcs) || 0,
          soldPcs: line.soldPcs,
          pendingPcs: line.pendingPcs,
          orderMts: Number(line.mtsQty) || 0,
          soldMts: line.soldMts,
          pendingMts: line.pendingMts,
          rate: Number(line.rate) || 0,
          netAmount: Number(line.totalAmount) || Number(line.amount) || 0
        });
      }
    }
    const totals = rows.reduce((acc, row) => {
      for (const key of ['orderPcs', 'soldPcs', 'pendingPcs', 'orderMts', 'soldMts', 'pendingMts', 'netAmount']) {
        acc[key] = roundMoney(acc[key] + (Number(row[key]) || 0));
      }
      return acc;
    }, { orderPcs: 0, soldPcs: 0, pendingPcs: 0, orderMts: 0, soldMts: 0, pendingMts: 0, netAmount: 0 });
    res.json({ rows, totals });
  } catch (error) {
    next(error);
  }
});

router.get('/finish-report', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const fromDate = optionalString(req.query.fromDate);
    const toDateValue = optionalString(req.query.toDate);
    const partyName = optionalString(req.query.partyName);
    const brokerName = optionalString(req.query.brokerName);
    const transportName = optionalString(req.query.transportName);
    const station = optionalString(req.query.station);
    const haste = optionalString(req.query.haste);
    const mainScreen = optionalString(req.query.mainScreen);
    const view = (optionalString(req.query.view) || 'register').toLowerCase();
    const docType = (optionalString(req.query.docType) || 'finish').toLowerCase();
    // finish | return | both — club Finish Sales + Sales Goods Return in one report.
    const where = {
      userId: req.user.userId,
      manualType: 'erp_sales',
      status: 'completed'
    };
    if (docType === 'return') {
      where.transactionType = { equals: 'SALES GOODS RETURN', mode: 'insensitive' };
    } else if (docType === 'both') {
      where.OR = [
        { transactionType: { startsWith: 'FINISH SALES', mode: 'insensitive' } },
        { transactionType: { equals: 'SALES GOODS RETURN', mode: 'insensitive' } }
      ];
    } else {
      where.transactionType = { startsWith: 'FINISH SALES', mode: 'insensitive' };
    }
    if (partyName) where.buyerName = { contains: partyName, mode: 'insensitive' };
    if (brokerName) where.agentName = { contains: brokerName, mode: 'insensitive' };
    if (transportName) where.transportName = { contains: transportName, mode: 'insensitive' };
    if (station) where.station = { contains: station, mode: 'insensitive' };
    if (haste) where.haste = { contains: haste, mode: 'insensitive' };
    if (fromDate || toDateValue) {
      where.orderDate = {};
      if (fromDate) where.orderDate.gte = toDate(fromDate);
      if (toDateValue) {
        const end = toDate(toDateValue);
        end.setHours(23, 59, 59, 999);
        where.orderDate.lte = end;
      }
    }
    const bills = await prisma.order.findMany({
      where,
      include: { sourceSalesOrder: { select: { orderNo: true } } },
      orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }]
    });

    if (view === 'detailed') {
      const rows = [];
      for (const bill of bills) {
        const lines = Array.isArray(bill.orderLines) ? bill.orderLines : [];
        for (const [index, line] of lines.entries()) {
          const lineMain = line.mainScreen || line.designNo || '';
          const lineName = line.itemName || line.screenName || line.description || '';
          if (mainScreen && !String(lineMain).toLowerCase().includes(mainScreen.toLowerCase())
            && !String(lineName).toLowerCase().includes(mainScreen.toLowerCase())) continue;
          rows.push({
            id: `${bill.id}-${index}`,
            billId: bill.id,
            date: bill.orderDate || bill.createdAt,
            partyName: bill.buyerName,
            billNo: bill.typeBillNumber || bill.invoiceNumber,
            transactionType: bill.transactionType || '',
            mainScreen: lineMain,
            itemName: lineName,
            packing: line.packing || '',
            pcs: Number(line.pcs ?? line.quantity) || 0,
            cut: Number(line.cut) || 0,
            mts: Number(line.mtsQty) || 0,
            rate: Number(line.rate) || 0,
            grossAmount: Number(line.amount) || 0,
            haste: bill.haste || '',
            brokerName: bill.agentName || '',
            station: bill.station || '',
            transportName: bill.transportName || ''
          });
        }
      }
      const totals = rows.reduce((acc, row) => {
        for (const key of ['pcs', 'mts', 'grossAmount']) acc[key] = roundMoney(acc[key] + (Number(row[key]) || 0));
        return acc;
      }, { pcs: 0, mts: 0, grossAmount: 0 });
      return res.json({ view: 'detailed', docType, rows, totals });
    }

    const rows = bills.map(bill => {
      const lines = Array.isArray(bill.orderLines) ? bill.orderLines : [];
      const pcs = roundMoney(lines.reduce((sum, line) => sum + (Number(line.pcs ?? line.quantity) || 0), 0));
      const mts = roundMoney(lines.reduce((sum, line) => sum + (Number(line.mtsQty) || 0), 0));
      const gross = roundMoney(lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0));
      const taxable = roundMoney(lines.reduce((sum, line) => sum + (Number(line.taxableAmount) || 0), 0));
      const invoiceValue = roundMoney(lines.reduce((sum, line) => sum + (Number(line.totalAmount) || 0), 0));
      return {
        id: bill.id,
        billId: bill.id,
        date: bill.orderDate || bill.createdAt,
        partyName: bill.buyerName,
        transactionType: bill.transactionType || '',
        voucherNo: bill.typeBillNumber,
        billNo: bill.typeBillNumber || bill.invoiceNumber,
        lrNo: bill.lrNo || lines[0]?.lrNo || '',
        transportName: bill.transportName,
        orderRef: bill.sourceSalesOrder?.orderNo || bill.orderNumber,
        pcs,
        mts,
        grossAmount: gross,
        taxableAmount: taxable,
        ledgerAmount: invoiceValue,
        invoiceValue,
        brokerName: bill.agentName,
        haste: bill.haste || '',
        station: bill.station || ''
      };
    });
    const totals = rows.reduce((acc, row) => {
      for (const key of ['pcs', 'mts', 'grossAmount', 'taxableAmount', 'ledgerAmount', 'invoiceValue']) {
        acc[key] = roundMoney(acc[key] + (Number(row[key]) || 0));
      }
      return acc;
    }, { pcs: 0, mts: 0, grossAmount: 0, taxableAmount: 0, ledgerAmount: 0, invoiceValue: 0 });
    res.json({ view: 'register', docType, rows, totals });
  } catch (error) {
    next(error);
  }
});

router.get('/bills/:id', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const bill = await prisma.order.findFirst({
      where: { id: req.params.id, userId: req.user.userId, manualType: 'erp_sales' },
      include: { customer: true, sourceSalesOrder: true }
    });
    if (!bill) return res.status(404).json({ error: 'Sales bill not found' });
    const ids = (bill.sourceSalesOrderIds?.length
      ? bill.sourceSalesOrderIds
      : (bill.sourceSalesOrderId ? [bill.sourceSalesOrderId] : [])
    ).filter(Boolean);
    const sources = [];
    for (const id of ids) {
      const order = await prisma.salesOrder.findFirst({ where: { id, userId: req.user.userId } });
      if (order) sources.push(await buildPending(order, bill.id));
    }
    res.json({ bill, sources });
  } catch (error) {
    next(error);
  }
});

function requestedSalesOrderIds(reqBody) {
  const many = Array.isArray(reqBody.sourceSalesOrderIds) ? reqBody.sourceSalesOrderIds : [];
  const ids = many.map(id => optionalString(id)).filter(Boolean);
  const single = optionalString(reqBody.sourceSalesOrderId);
  if (single && !ids.includes(single)) ids.unshift(single);
  for (const line of Array.isArray(reqBody.lineItems) ? reqBody.lineItems : []) {
    const id = optionalString(line.sourceSalesOrderId);
    if (id && !ids.includes(id)) ids.push(id);
    for (const alloc of Array.isArray(line.sourceAllocations) ? line.sourceAllocations : []) {
      const allocId = optionalString(alloc.sourceSalesOrderId);
      if (allocId && !ids.includes(allocId)) ids.push(allocId);
    }
  }
  return Array.from(new Set(ids));
}

/**
 * Stamp each bill line with the Sales Order it consumes.
 * One picked order: untagged lines belong to it (legacy single-SO bills).
 * Several orders: untagged lines are extra / direct and do not consume pending.
 */
function tagSalesLinesToOrders(lines, sources) {
  const byId = new Map(sources.map(source => [source.id, source]));
  const errors = [];
  const tagged = lines.map(line => {
    const scaled = scaleAllocationsToLine(line);
    if (scaled.sourceKind === 'order_form') {
      return { ...scaled, sourceSalesOrderId: null };
    }
    if (scaled.sourceAllocations?.length) {
      for (const alloc of scaled.sourceAllocations) {
        if (!byId.has(alloc.sourceSalesOrderId)) {
          errors.push(`A line refers to a Sales Order that is not selected.`);
        }
      }
      const primaryAlloc = scaled.sourceAllocations[0];
      const primary = byId.get(primaryAlloc.sourceSalesOrderId);
      return {
        ...scaled,
        sourceSalesOrderId: primary?.id || primaryAlloc.sourceSalesOrderId,
        sourceOrderNo: scaled.sourceOrderNo
          || scaled.sourceAllocations.map(row => row.sourceOrderNo).filter(Boolean).join(', '),
        sourceLineNo: scaled.sourceLineNo != null ? scaled.sourceLineNo : primaryAlloc.sourceLineNo
      };
    }
    const declared = optionalString(scaled.sourceSalesOrderId);
    const resolvedId = declared || (sources.length === 1 ? sources[0].id : null);
    if (!resolvedId) return { ...scaled, sourceSalesOrderId: null, sourceOrderNo: scaled.sourceOrderNo || null };
    const source = byId.get(resolvedId);
    if (!source) {
      errors.push(`A line refers to a Sales Order that is not selected.`);
      return scaled;
    }
    return {
      ...scaled,
      sourceSalesOrderId: source.id,
      sourceOrderNo: scaled.sourceOrderNo || String(source.orderNo),
      sourceLineNo: scaled.sourceLineNo != null ? scaled.sourceLineNo : scaled.lineNo
    };
  });
  return { lines: tagged, errors };
}

function requestedChallanIds(reqBody) {
  const ids = requestedSalesOrderIds(reqBody);
  for (const line of Array.isArray(reqBody.lineItems) ? reqBody.lineItems : []) {
    const id = optionalString(line.sourceChallanId);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Keep the challan on the line. Do not store its id on the Sales Order link. */
function stampChallanLines(lines, challans) {
  const byId = new Map(challans.map(row => [row.id, row]));
  const errors = [];
  const tagged = lines.map(line => {
    const declared = optionalString(line.sourceChallanId) || optionalString(line.sourceSalesOrderId);
    let source = declared ? byId.get(declared) : null;
    if (declared && !source) {
      errors.push('A line refers to a Sales Challan that is not selected.');
    }
    if (!source && challans.length === 1 && line.sourceLineNo != null) {
      const key = Number(line.sourceLineNo);
      const rows = Array.isArray(challans[0].orderLines) ? challans[0].orderLines : [];
      const exists = rows.some((row, index) => (Number(row.lineNo) || index + 1) === key);
      if (exists) source = challans[0];
    }
    if (!source) return { ...line, sourceSalesOrderId: line.sourceKind === 'order_form' ? null : line.sourceSalesOrderId };
    return {
      ...line,
      sourceSalesOrderId: null,
      sourceAllocations: [],
      sourceChallanId: source.id,
      sourceOrderNo: String(challanVoucherNo(source) || line.sourceOrderNo || ''),
      sourceLineNo: line.sourceLineNo != null ? line.sourceLineNo : line.lineNo
    };
  });
  return { lines: tagged, errors };
}

async function saveBill(req, res, existing = null) {
  const userId = req.user.userId;
  const ctx = await getCompanyContext(userId);
  const transactionType = optionalString(req.body.transactionType) || 'FINISH SALES';
  const customer = await resolveCustomerForEntry(prisma, userId, {
    customerId: req.body.customerId,
    partyName: req.body.partyName || req.body.buyerName,
    gstNumber: req.body.partyGstin,
    state: req.body.state,
    agentName: req.body.brokerName || req.body.agentName,
    transactionType
  });
  if (!customer) return res.status(400).json({ error: 'Customer is required' });

  const sourceOrderFormId = optionalString(req.body.sourceOrderFormId);
  if (sourceOrderFormId) {
    const form = await prisma.order.findFirst({
      where: { id: sourceOrderFormId, userId, NOT: { manualType: 'erp_sales' } }
    });
    if (!form) return res.status(400).json({ error: 'Order form not found.' });
  }

  const goodsReturn = String(transactionType).toUpperCase() === 'SALES GOODS RETURN';
  const challanBill = !goodsReturn && picksSalesChallan(transactionType);
  const requestedIds = goodsReturn ? [] : (challanBill ? requestedChallanIds(req.body) : requestedSalesOrderIds(req.body));
  const sources = [];
  const challanSources = [];
  if (requestedIds.length && challanBill) {
    const found = await prisma.order.findMany({
      where: {
        id: { in: requestedIds },
        userId,
        transactionType: 'SALES CHALLAN',
        status: 'posted'
      },
      include: { customer: { select: { gstNumber: true, state: true, agentName: true } } }
    });
    const byId = new Map(found.map(row => [row.id, row]));
    for (const id of requestedIds) {
      const challan = byId.get(id);
      if (!challan) return res.status(404).json({ error: 'Sales Challan not found' });
      challanSources.push(challan);
    }
    const parties = Array.from(new Set(challanSources.map(row => String(row.buyerName || '').trim().toUpperCase())));
    if (parties.length > 1) {
      return res.status(400).json({ error: 'All picked Sales Challans must belong to the same party.' });
    }
  } else if (requestedIds.length) {
    const found = await prisma.salesOrder.findMany({
      where: { id: { in: requestedIds }, userId }
    });
    const byId = new Map(found.map(row => [row.id, row]));
    for (const id of requestedIds) {
      const order = byId.get(id);
      if (!order) return res.status(404).json({ error: 'Sales Order not found' });
      sources.push(order);
    }
    const parties = Array.from(new Set(sources.map(row => String(row.partyName || '').trim().toUpperCase())));
    if (parties.length > 1) {
      return res.status(400).json({ error: 'All picked Sales Orders must belong to the same party.' });
    }
  }
  const primary = sources[0] || null;
  const partyGstin = optionalString(req.body.partyGstin) || customer.gstNumber;
  const placeOfSupply = optionalString(req.body.state) || customer.state || getStateFromGstin(partyGstin).stateName;
  const typeGst = getGstDefaultsForTransactionType(
    transactionType,
    ctx.defaultGstRate,
    ctx.defaultHsnCode || '5407'
  );
  const lines = normalizeSalesLines(req.body.lineItems, {
    defaultGstRate: typeGst.gstRate,
    defaultHsnCode: typeGst.hsnCode,
    placeOfSupply,
    businessState: ctx.businessState
  });
  if (!lines.length) return res.status(400).json({ error: 'Add at least one sales line' });

  const tagged = challanSources.length
    ? stampChallanLines(lines, challanSources)
    : tagSalesLinesToOrders(lines, sources);
  if (tagged.errors.length) {
    return res.status(400).json({ error: tagged.errors.join(' ') });
  }

  for (const source of challanSources) {
    const bills = await loadConsumingBills(prisma, userId, [source], existing?.id || null);
    const pending = toChallanPickEntry(source, bills);
    const pendingMap = new Map(pending.pendingLines.map(line => [Number(line.lineNo), line]));
    for (const line of tagged.lines) {
      if (line.sourceChallanId !== source.id) continue;
      const key = Number(line.sourceLineNo);
      const sourceLine = pendingMap.get(key);
      if (!sourceLine) {
        return res.status(400).json({ error: `Sales Challan #${challanVoucherNo(source)} line ${key} not found.` });
      }
      if ((Number(line.pcs) || 0) > sourceLine.pendingPcs + 0.01 || (Number(line.mtsQty) || 0) > sourceLine.pendingMts + 0.01) {
        return res.status(400).json({
          error: `Challan #${challanVoucherNo(source)}: only ${sourceLine.pendingPcs} pcs / ${sourceLine.pendingMts} mts pending for ${sourceLine.itemName || 'that line'}.`
        });
      }
    }
  }

  for (const source of sources) {
    const pending = await buildPending(source, existing?.id || null);
    const pendingMap = new Map(pending.pendingLines.map(line => [Number(line.lineNo), line]));
    const used = new Map();
    for (const line of tagged.lines) {
      for (const slice of qtySlicesForSalesOrder(line, source.id)) {
        const key = Number(slice.sourceLineNo);
        const sourceLine = pendingMap.get(key);
        if (!sourceLine) {
          return res.status(400).json({ error: `Sales Order #${source.orderNo} line ${key} not found.` });
        }
        const cur = used.get(key) || { pcs: 0, mtsQty: 0, itemName: sourceLine.itemName };
        cur.pcs = roundMoney(cur.pcs + (Number(slice.pcs) || 0));
        cur.mtsQty = roundMoney(cur.mtsQty + (Number(slice.mtsQty) || 0));
        used.set(key, cur);
      }
    }
    for (const [key, qty] of used) {
      const sourceLine = pendingMap.get(key);
      if (qty.pcs > sourceLine.pendingPcs + 0.01 || qty.mtsQty > sourceLine.pendingMts + 0.01) {
        return res.status(400).json({
          error: `SO #${source.orderNo}: only ${sourceLine.pendingPcs} pcs / ${sourceLine.pendingMts} mts pending for ${qty.itemName}.`
        });
      }
    }
  }

  const totals = aggregateLines(tagged.lines);
  const quantity = Math.max(1, Math.round(totals.totalPcs));
  const orderLines = tagged.lines.map(line => ({
    ...line,
    description: line.itemName,
    designName: line.itemName,
    quantity: line.pcs,
    retailPrice: line.pcs > 0 ? line.taxableAmount / line.pcs : line.taxableAmount,
    basePrice: line.pcs > 0 ? line.taxableAmount / line.pcs : line.taxableAmount,
    completed: true,
    completedAt: new Date().toISOString(),
    lrNo: optionalString(req.body.lrNo)
  }));

  if (existing?.einvoiceIrn && existing.einvoiceStatus !== 'cancelled') {
    const oldLines = Array.isArray(existing.orderLines) ? existing.orderLines : [];
    const sum = (rows, key) => rows.reduce((total, line) => total + (Number(line[key]) || 0), 0);
    const hsn = (rows) => rows.map(line => String(line.hsnCode || '').trim()).sort().join('|');
    const sameDay = (left, right) => new Date(left).toISOString().slice(0, 10) === new Date(right).toISOString().slice(0, 10);
    const locked = [];
    if (existing.customerId !== customer.id) locked.push('party');
    if (!sameDay(existing.orderDate || existing.createdAt, toDate(req.body.orderDate))) locked.push('bill date');
    if (existing.transactionType !== transactionType) locked.push('bill type');
    if (Math.abs(sum(oldLines, 'taxableAmount') - sum(orderLines, 'taxableAmount')) > 0.05) locked.push('taxable value');
    if (Math.abs(sum(oldLines, 'totalAmount') - sum(orderLines, 'totalAmount')) > 0.05) locked.push('invoice value');
    if (hsn(oldLines) !== hsn(orderLines) || oldLines.length !== orderLines.length) locked.push('HSN or lines');
    if (locked.length) {
      return res.status(409).json({
        error: `This bill has IRN ${existing.einvoiceIrn}. ${locked.join(', ')} stay locked until that IRN is cancelled.`
      });
    }
  }

  const saved = await prisma.$transaction(async (tx) => {
    await rememberItemRateAndCut(tx, userId, orderLines);
    const data = {
      customerId: customer.id,
      buyerName: customer.organizationName,
      buyerPhone: customer.mobileNumber || '',
      quantity,
      orderLines,
      status: transactionType === 'SALES CHALLAN' ? 'posted' : 'completed',
      remarks: optionalString(req.body.remarks),
      manualType: 'erp_sales',
      orderNumber: challanSources.length
        ? challanSources.map(row => challanVoucherNo(row)).filter(Boolean).join(', ')
        : sources.length
          ? sources.map(row => row.orderNo).join(', ')
          : optionalString(req.body.orderNumber),
      transactionType,
      agentName: optionalString(req.body.brokerName || req.body.agentName),
      transportName: optionalString(req.body.transportName),
      discountRate: 0,
      shippingCharge: existing && saleBillDiscount(existing) > 0.5
        ? existing.shippingCharge
        : totals.totalTaxAmount,
      orderDate: toDate(req.body.orderDate),
      expectedDate: req.body.expectedDate ? toDate(req.body.expectedDate, null) : null,
      haste: optionalString(req.body.haste),
      station: optionalString(req.body.station),
      sourceSalesOrderId: challanSources.length ? null : (primary?.id || null),
      sourceSalesOrderIds: challanSources.length ? [] : sources.map(row => row.id),
      sourceOrderFormId,
      challanNo: optionalString(req.body.challanNo),
      gstType: optionalString(req.body.gstType),
      lrNo: optionalString(req.body.lrNo),
      lrDate: req.body.lrDate ? toDate(req.body.lrDate, null) : null,
      hasteGstin: optionalString(req.body.hasteGstin),
      vehicleNo: optionalString(req.body.vehicleNo),
      dhara: optionalNumber(req.body.dhara),
      grace: optionalNumber(req.body.grace),
      screenSeries: optionalString(req.body.screenSeries)
    };
    if (existing?.einvoiceRaw && typeof existing.einvoiceRaw === 'object' && !Array.isArray(existing.einvoiceRaw)) {
      const credit = Number(existing.einvoiceRaw.saleCredit);
      const next = roundRupee(orderLines.reduce((sum, line) => sum + (Number(line.totalAmount) || 0), 0));
      if (credit > 0 && Math.abs(credit - next) > 0.5) {
        const raw = { ...existing.einvoiceRaw };
        delete raw.saleCredit;
        data.einvoiceRaw = Object.keys(raw).length ? raw : null;
      }
    }
    let bill;
    if (existing) {
      bill = await tx.order.update({ where: { id: existing.id }, data });
    } else {
      const [invoiceNumber, typeBillNumber] = await Promise.all([
        allocateNextInvoiceNumber(tx, userId),
        allocateNextTypeBillNumber(tx, userId, transactionType, 'order')
      ]);
      bill = await tx.order.create({
        data: { userId, shareLinkId: null, designId: null, ...data, invoiceNumber, typeBillNumber }
      });
    }
    const affected = new Set([
      ...(existing?.sourceSalesOrderIds || []),
      existing?.sourceSalesOrderId,
      ...sources.map(row => row.id)
    ].filter(Boolean));
    for (const id of affected) await refreshSalesOrderStatus(tx, id);
    return bill;
  });
  res.status(existing ? 200 : 201).json({ bill: saved, totals });
}

router.post('/bills', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    await saveBill(req, res);
  } catch (error) {
    next(error);
  }
});

router.put('/bills/:id', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const existing = await prisma.order.findFirst({
      where: { id: req.params.id, userId: req.user.userId, manualType: 'erp_sales' }
    });
    if (!existing) return res.status(404).json({ error: 'Sales bill not found' });
    await saveBill(req, res, existing);
  } catch (error) {
    next(error);
  }
});

router.delete('/bills/:id', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const existing = await prisma.order.findFirst({
      where: { id: req.params.id, userId: req.user.userId, manualType: 'erp_sales' }
    });
    if (!existing) return res.status(404).json({ error: 'Sales bill not found' });
    if (existing.einvoiceIrn && existing.einvoiceStatus !== 'cancelled') {
      return res.status(409).json({ error: `This bill has IRN ${existing.einvoiceIrn}. Cancel that IRN before deleting the bill.` });
    }
    const block = await bankAdjustmentBlock(prisma, req.user.userId, existing.id);
    if (block) return res.status(409).json({ error: block });
    await prisma.order.delete({ where: { id: existing.id } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

const LR_SALE_TYPES = new Set([
  'FINISH SALES',
  'FINISH SALES (GST)',
  'GREY SALES',
  'CASH SALES',
  'FENT SALES',
  'SALES CHALLAN',
  'SALES GOODS RETURN'
]);

const dateOnly = (value) => {
  if (!value) return null;
  const text = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const ymd = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');

router.get('/lr-entry', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const requested = String(req.query.transactionType || 'FINISH SALES (GST)').trim();
    const transactionType = LR_SALE_TYPES.has(requested) ? requested : 'FINISH SALES (GST)';
    const from = dateOnly(req.query.fromDate);
    const to = dateOnly(req.query.toDate);
    const orderDate = {};
    if (from) orderDate.gte = from;
    if (to) orderDate.lte = new Date(`${ymd(to)}T23:59:59.999Z`);
    const [company, bills] = await Promise.all([
      getCompanyContext(userId),
      prisma.order.findMany({
        where: {
          userId,
          manualType: 'erp_sales',
          transactionType,
          ...(Object.keys(orderDate).length ? { orderDate } : {})
        },
        include: { customer: { select: { mobileNumber: true } } },
        orderBy: [{ orderDate: 'asc' }, { typeBillNumber: 'asc' }]
      })
    ]);
    const rows = bills.map(bill => {
      const lines = Array.isArray(bill.orderLines) ? bill.orderLines : [];
      const weight = roundMoney(lines.reduce((sum, line) => sum + (Number(line.mtsQty) || 0), 0));
      const amount = roundMoney(lines.reduce((sum, line) => sum + (Number(line.totalAmount) || Number(line.amount) || 0), 0));
      const billNo = bill.typeBillNumber || bill.invoiceNumber || '';
      return {
        id: bill.id,
        partyName: bill.buyerName || '',
        billNo: String(billNo),
        billDate: ymd(bill.orderDate || bill.createdAt),
        caseNo: String(billNo),
        lrNo: bill.lrNo || lines[0]?.lrNo || '',
        lrDate: ymd(bill.lrDate),
        weight,
        freight: 0,
        transportName: bill.transportName || '',
        vehicleNo: bill.vehicleNo || '',
        ewayBillNo: bill.ewayBillNo || '',
        station: bill.station || '',
        haste: bill.haste || '',
        brokerName: bill.agentName || '',
        phone: bill.customer?.mobileNumber || bill.buyerPhone || '',
        amount,
        remarks: bill.remarks || ''
      };
    });
    res.json({ companyName: company.companyName, rows });
  } catch (error) {
    next(error);
  }
});

router.put('/lr-entry', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const rows = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 400) : [];
    let updated = 0;
    await prisma.$transaction(async (tx) => {
      for (const row of rows) {
        const id = String(row?.id || '');
        if (!id) continue;
        const current = await tx.order.findFirst({
          where: { id, userId, manualType: 'erp_sales' },
          select: { id: true, orderLines: true }
        });
        if (!current) continue;
        const lrNo = optionalString(row.lrNo);
        const lrDate = dateOnly(row.lrDate);
        const orderLines = Array.isArray(current.orderLines)
          ? current.orderLines.map(line => ({ ...line, lrNo }))
          : current.orderLines;
        await tx.order.update({ where: { id }, data: { lrNo, lrDate, orderLines } });
        updated += 1;
      }
    }, { timeout: 30000, maxWait: 10000 });
    res.json({ updated });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const order = await prisma.salesOrder.findFirst({
      where: { id: req.params.id, userId: req.user.userId },
      include: { customer: true }
    });
    if (!order) return res.status(404).json({ error: 'Sales Order not found' });
    const pending = await buildPending(order);
    res.json({ order, pending });
  } catch (error) {
    next(error);
  }
});

async function saveSalesOrder(req, res, existing = null) {
  const userId = req.user.userId;
  const ctx = await getCompanyContext(userId);
  const customer = await resolveCustomerForEntry(prisma, userId, {
    customerId: req.body.customerId,
    partyName: req.body.partyName,
    gstNumber: req.body.partyGstin,
    state: req.body.state,
    agentName: req.body.brokerName,
    transactionType: optionalString(req.body.transactionType) || 'SALES ORDERS'
  });
  if (!customer) return res.status(400).json({ error: 'Customer is required' });
  const partyGstin = optionalString(req.body.partyGstin) || customer.gstNumber;
  const state = optionalString(req.body.state) || customer.state || getStateFromGstin(partyGstin).stateName;
  const orderType = optionalString(req.body.transactionType) || 'SALES ORDERS';
  const typeGst = getGstDefaultsForTransactionType(
    orderType,
    ctx.defaultGstRate,
    ctx.defaultHsnCode || '5407'
  );
  const lines = normalizeSalesLines(req.body.lineItems, {
    defaultGstRate: typeGst.gstRate,
    defaultHsnCode: typeGst.hsnCode,
    placeOfSupply: state,
    businessState: ctx.businessState
  });
  if (!lines.length) return res.status(400).json({ error: 'Add at least one Sales Order line' });
  if (existing) {
    const sold = await soldBySalesOrder(existing.id);
    const nextByLine = new Map(lines.map(line => [Number(line.lineNo), line]));
    for (const [lineNo, used] of sold.entries()) {
      const line = nextByLine.get(lineNo);
      if (!line || line.pcs + 0.01 < used.pcs || line.mtsQty + 0.01 < used.mtsQty) {
        return res.status(400).json({ error: `Line ${lineNo} cannot be removed or reduced below its already billed quantity.` });
      }
    }
    for (const line of lines) {
      const used = sold.get(Number(line.lineNo)) || { pcs: 0, mtsQty: 0 };
      if (line.pcs + 0.01 < used.pcs || line.mtsQty + 0.01 < used.mtsQty) {
        return res.status(400).json({ error: `Cannot reduce ${line.itemName} below already billed quantity.` });
      }
    }
  }
  const totals = aggregateLines(lines);
  const data = {
    customerId: customer.id,
    companyName: optionalString(req.body.companyName) || ctx.companyName,
    partyName: customer.organizationName,
    partyGstin,
    state,
    station: optionalString(req.body.station),
    brokerName: optionalString(req.body.brokerName),
    transportName: optionalString(req.body.transportName),
    vehicleNo: optionalString(req.body.vehicleNo),
    lrNo: optionalString(req.body.lrNo),
    challanNo: optionalString(req.body.challanNo),
    gstType: optionalString(req.body.gstType),
    hasteGstin: optionalString(req.body.hasteGstin),
    dhara: optionalNumber(req.body.dhara),
    grace: optionalNumber(req.body.grace),
    screenSeries: optionalString(req.body.screenSeries),
    orderDate: toDate(req.body.orderDate),
    expectedDate: req.body.expectedDate ? toDate(req.body.expectedDate, null) : null,
    haste: optionalString(req.body.haste),
    remarks: optionalString(req.body.remarks),
    hsnCode: optionalString(req.body.hsnCode) || ctx.defaultHsnCode,
    lineItems: lines,
    ...totals
  };
  let order;
  if (existing) {
    order = await prisma.salesOrder.update({ where: { id: existing.id }, data });
    await refreshSalesOrderStatus(prisma, order.id);
    order = await prisma.salesOrder.findUnique({ where: { id: order.id } });
  } else {
    const orderNoResult = await prisma.salesOrder.aggregate({ where: { userId }, _max: { orderNo: true } });
    order = await prisma.salesOrder.create({
      data: { userId, orderNo: optionalNumber(req.body.orderNo) ?? (orderNoResult._max.orderNo || 0) + 1, status: 'open', ...data }
    });
  }
  await rememberItemRateAndCut(prisma, userId, lines);
  res.status(existing ? 200 : 201).json({ order });
}

router.post('/', authenticateToken, requireActiveSubscription, [
  body('partyName').trim().notEmpty(),
  body('lineItems').isArray({ min: 1 })
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    await saveSalesOrder(req, res);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const existing = await prisma.salesOrder.findFirst({
      where: { id: req.params.id, userId: req.user.userId }
    });
    if (!existing) return res.status(404).json({ error: 'Sales Order not found' });
    await saveSalesOrder(req, res, existing);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const existing = await prisma.salesOrder.findFirst({
      where: { id: req.params.id, userId: req.user.userId }
    });
    if (!existing) return res.status(404).json({ error: 'Sales Order not found' });
    const billed = await prisma.order.count({
      where: {
        userId: req.user.userId,
        OR: [
          { sourceSalesOrderId: existing.id },
          { sourceSalesOrderIds: { has: existing.id } }
        ]
      }
    });
    if (billed > 0) {
      return res.status(409).json({ error: 'This sales order is already on a sale bill. Delete that bill first.' });
    }
    await prisma.salesOrder.delete({ where: { id: existing.id } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
