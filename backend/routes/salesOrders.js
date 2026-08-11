import express from 'express';
import { PrismaClient } from '@prisma/client';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import { resolveCustomerForEntry } from '../utils/partyMaster.js';
import { roundMoney, allocateNextInvoiceNumber } from '../utils/orderBilling.js';
import { allocateNextTypeBillNumber } from '../utils/transactionBilling.js';
import { getStateFromGstin, calculateGstBreakup } from '../utils/gstCalculation.js';

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
    const amount = roundMoney(
      input.amount != null && input.amount !== ''
        ? input.amount
        : pcs * rate
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
      mainScreen: optionalString(input.mainScreen) || '',
      screenName: optionalString(input.screenName) || optionalString(input.itemName || input.description) || '',
      packing: optionalString(input.packing) || 'NAKED',
      unit: optionalString(input.unit) || 'PCS',
      pcs,
      cut,
      mtsQty,
      rate,
      amount,
      rd: roundMoney(input.rd ?? 0),
      discountPercent,
      discountAmount,
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
      sourceLineNo: Number(input.sourceLineNo) || Number(input.lineNo) || index + 1
    };
  }).filter(line => line.itemName && (line.pcs > 0 || line.amount > 0));
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
      sourceSalesOrderId: salesOrderId,
      status: 'completed',
      // Goods returns must not inflate sold qty against a Sales Order.
      NOT: { transactionType: { equals: 'SALES GOODS RETURN', mode: 'insensitive' } },
      ...(excludeBillId ? { id: { not: excludeBillId } } : {})
    },
    select: { orderLines: true }
  });
  const byLine = new Map();
  for (const bill of bills) {
    const lines = Array.isArray(bill.orderLines) ? bill.orderLines : [];
    for (const line of lines) {
      const key = Number(line.sourceLineNo || line.lineNo) || 0;
      const current = byLine.get(key) || { pcs: 0, mtsQty: 0 };
      current.pcs = roundMoney(current.pcs + (Number(line.pcs ?? line.quantity) || 0));
      current.mtsQty = roundMoney(current.mtsQty + (Number(line.mtsQty) || 0));
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

router.get('/pending', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const partyName = optionalString(req.query.partyName);
    const customerId = optionalString(req.query.customerId);
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
        status: { in: ['open', 'partial'] },
        ...partyFilter
      },
      orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }]
    });
    const entries = [];
    for (const order of orders) {
      const pending = await buildPending(order);
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
    res.json({ bill });
  } catch (error) {
    next(error);
  }
});

async function saveBill(req, res, existing = null) {
  const userId = req.user.userId;
  const ctx = await getCompanyContext(userId);
  const customer = await resolveCustomerForEntry(prisma, userId, {
    customerId: req.body.customerId,
    partyName: req.body.partyName || req.body.buyerName,
    gstNumber: req.body.partyGstin,
    state: req.body.state,
    agentName: req.body.brokerName || req.body.agentName
  });
  if (!customer) return res.status(400).json({ error: 'Customer is required' });

  const transactionType = optionalString(req.body.transactionType) || 'FINISH SALES';
  const goodsReturn = String(transactionType).toUpperCase() === 'SALES GOODS RETURN';
  // Goods returns do not consume Sales Order pending qty.
  const sourceSalesOrderId = goodsReturn ? null : optionalString(req.body.sourceSalesOrderId);
  let sourceOrder = null;
  if (sourceSalesOrderId) {
    sourceOrder = await prisma.salesOrder.findFirst({ where: { id: sourceSalesOrderId, userId } });
    if (!sourceOrder) return res.status(404).json({ error: 'Sales Order not found' });
  }
  const partyGstin = optionalString(req.body.partyGstin) || customer.gstNumber;
  const placeOfSupply = optionalString(req.body.state) || customer.state || getStateFromGstin(partyGstin).stateName;
  const lines = normalizeSalesLines(req.body.lineItems, {
    defaultGstRate: ctx.defaultGstRate,
    defaultHsnCode: ctx.defaultHsnCode,
    placeOfSupply,
    businessState: ctx.businessState
  });
  if (!lines.length) return res.status(400).json({ error: 'Add at least one sales line' });

  if (sourceOrder) {
    const pending = await buildPending(sourceOrder, existing?.id || null);
    const pendingMap = new Map(pending.pendingLines.map(line => [Number(line.lineNo), line]));
    for (const line of lines) {
      const sourceLine = pendingMap.get(Number(line.sourceLineNo));
      if (!sourceLine) return res.status(400).json({ error: `Sales Order line ${line.sourceLineNo} not found` });
      if (line.pcs > sourceLine.pendingPcs + 0.01 || line.mtsQty > sourceLine.pendingMts + 0.01) {
        return res.status(400).json({
          error: `Only ${sourceLine.pendingPcs} pcs / ${sourceLine.pendingMts} mts pending for ${sourceLine.itemName}.`
        });
      }
    }
  }

  const totals = aggregateLines(lines);
  const quantity = Math.max(1, Math.round(totals.totalPcs));
  const orderLines = lines.map(line => ({
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

  const saved = await prisma.$transaction(async (tx) => {
    const data = {
      customerId: customer.id,
      buyerName: customer.organizationName,
      buyerPhone: customer.mobileNumber || '',
      quantity,
      orderLines,
      status: 'completed',
      remarks: optionalString(req.body.remarks),
      manualType: 'erp_sales',
      orderNumber: sourceOrder ? String(sourceOrder.orderNo) : optionalString(req.body.orderNumber),
      transactionType,
      agentName: optionalString(req.body.brokerName || req.body.agentName),
      transportName: optionalString(req.body.transportName),
      discountRate: 0,
      shippingCharge: totals.totalTaxAmount,
      orderDate: toDate(req.body.orderDate),
      expectedDate: req.body.expectedDate ? toDate(req.body.expectedDate, null) : null,
      haste: optionalString(req.body.haste),
      station: optionalString(req.body.station),
      sourceSalesOrderId: sourceOrder?.id || null,
      challanNo: optionalString(req.body.challanNo),
      gstType: optionalString(req.body.gstType),
      lrNo: optionalString(req.body.lrNo),
      hasteGstin: optionalString(req.body.hasteGstin),
      vehicleNo: optionalString(req.body.vehicleNo),
      dhara: optionalNumber(req.body.dhara),
      grace: optionalNumber(req.body.grace),
      screenSeries: optionalString(req.body.screenSeries)
    };
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
    const affected = new Set([existing?.sourceSalesOrderId, sourceOrder?.id].filter(Boolean));
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
    agentName: req.body.brokerName
  });
  if (!customer) return res.status(400).json({ error: 'Customer is required' });
  const partyGstin = optionalString(req.body.partyGstin) || customer.gstNumber;
  const state = optionalString(req.body.state) || customer.state || getStateFromGstin(partyGstin).stateName;
  const lines = normalizeSalesLines(req.body.lineItems, {
    defaultGstRate: ctx.defaultGstRate,
    defaultHsnCode: ctx.defaultHsnCode,
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

export default router;
