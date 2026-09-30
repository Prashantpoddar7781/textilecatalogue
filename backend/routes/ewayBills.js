import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import { roundMoney } from '../utils/orderBilling.js';
import { formatSeriesBillNumber, getGstDocumentType } from '../constants/erpTransactionPostingRules.js';
import {
  buildEwayBillPayload,
  finalizeEwayPayload,
  generateEwayBill,
  resolveEwayConfig,
  validateEwayBillPayload
} from '../services/ewayBill.js';

const router = express.Router();
const prisma = new PrismaClient();

const text = (value) => String(value == null ? '' : value).trim();

/** Sum the GST breakup already stored on the saved bill lines. */
function billTotals(lines) {
  return lines.reduce((acc, line) => ({
    taxableAmount: roundMoney(acc.taxableAmount + (Number(line.taxableAmount) || 0)),
    cgstAmount: roundMoney(acc.cgstAmount + (Number(line.cgstAmount) || 0)),
    sgstAmount: roundMoney(acc.sgstAmount + (Number(line.sgstAmount) || 0)),
    igstAmount: roundMoney(acc.igstAmount + (Number(line.igstAmount) || 0)),
    netAmount: roundMoney(acc.netAmount + (Number(line.totalAmount) || 0))
  }), { taxableAmount: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, netAmount: 0 });
}

/**
 * Load a Finish Sales bill and shape it into the source-agnostic document the
 * payload builder expects.
 */
async function loadSalesDocument(userId, billId) {
  const bill = await prisma.order.findFirst({
    where: { id: billId, userId, manualType: 'erp_sales' },
    include: { customer: true }
  });
  if (!bill) return null;

  const profile = await prisma.businessProfile.findUnique({ where: { userId } });
  const rawLines = Array.isArray(bill.orderLines) ? bill.orderLines : [];
  const lines = rawLines.map((line) => ({
    itemName: text(line.itemName || line.description || line.designName),
    description: text(line.screenName || line.mainScreen || line.itemName),
    hsnCode: text(line.hsnCode),
    unit: text(line.unit) || 'PCS',
    quantity: Number(line.pcs ?? line.quantity) || 0,
    cgstRate: Number(line.cgstRate) || 0,
    sgstRate: Number(line.sgstRate) || 0,
    igstRate: Number(line.igstRate) || 0,
    taxableAmount: Number(line.taxableAmount) || 0,
    totalAmount: Number(line.totalAmount) || 0
  }));

  const docNo = formatSeriesBillNumber(bill.transactionType, bill.typeBillNumber)
    || text(bill.invoiceNumber)
    || bill.id.slice(-8).toUpperCase();

  return {
    bill,
    profile,
    doc: {
      transactionType: bill.transactionType,
      docNo,
      docDate: bill.orderDate || bill.createdAt,
      hsnCode: text(rawLines[0]?.hsnCode),
      lines,
      totals: billTotals(lines)
    },
    company: {
      gstin: text(profile?.gstNumber),
      tradeName: text(profile?.tradeName || profile?.legalName),
      addressLine1: text(profile?.addressLine1),
      addressLine2: text(profile?.addressLine2),
      city: text(profile?.city),
      state: text(profile?.state),
      pincode: text(profile?.pincode)
    },
    party: {
      gstin: text(bill.customer?.gstNumber),
      tradeName: text(bill.customer?.organizationName || bill.buyerName),
      addressLine1: text(bill.customer?.address),
      addressLine2: text(bill.customer?.addressLine2),
      city: text(bill.customer?.city || bill.station),
      state: text(bill.customer?.state || bill.station),
      pincode: text(bill.customer?.pincode)
    }
  };
}

/** Transport details: what the user typed in the dialog, else what the bill carries. */
function resolveTransport(bill, body, config) {
  return {
    transporterId: text(body?.transporterId ?? bill.ewayBillTransporterId),
    transporterName: text(body?.transporterName ?? bill.transportName),
    transDocNo: text(body?.transDocNo ?? bill.lrNo),
    transDocDate: body?.transDocDate || null,
    transMode: text(body?.transMode) || '1',
    distance: Number(body?.distance ?? bill.ewayBillDistance ?? config.defaultDistance) || 0,
    vehicleNo: text(body?.vehicleNo ?? bill.vehicleNo),
    vehicleType: text(body?.vehicleType) || 'R'
  };
}

const SALE_BILL_TYPES = ['FINISH SALES', 'FINISH SALES (GST)', 'GREY SALES', 'CASH SALES', 'FENT SALES'];

function dayStart(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function dayEnd(value) {
  const date = dayStart(value);
  if (!date) return null;
  date.setHours(23, 59, 59, 999);
  return date;
}

function lineSummary(lines) {
  const raw = Array.isArray(lines) ? lines : [];
  let meters = 0;
  let amount = 0;
  let tax = 0;
  const rates = new Set();
  const hsns = new Set();
  raw.forEach((line) => {
    const mts = Number(line?.mtsQty) || 0;
    const pcs = Number(line?.pcs ?? line?.quantity) || 0;
    const cut = Number(line?.cut) || 0;
    meters += mts > 0 ? mts : (cut > 0 ? pcs * cut : pcs);
    amount += Number(line?.totalAmount) || 0;
    const gst = (Number(line?.cgstAmount) || 0) + (Number(line?.sgstAmount) || 0) + (Number(line?.igstAmount) || 0);
    tax += gst || Number(line?.taxAmount) || 0;
    if (line?.gstRate != null && line.gstRate !== '') rates.add(Number(line.gstRate));
    if (text(line?.hsnCode)) hsns.add(text(line.hsnCode));
  });
  return {
    totalMeters: Math.round(meters * 100) / 100,
    totalAmount: Math.round(amount * 100) / 100,
    totalTax: Math.round(tax * 100) / 100,
    gstRate: rates.size === 1 ? [...rates][0] : (rates.size > 1 ? 'Mixed' : ''),
    hsn: [...hsns].join(', ')
  };
}

function localMissing(loaded, config) {
  const transport = resolveTransport(loaded.bill, {}, config);
  const payload = buildEwayBillPayload({ ...loaded, transport });
  const { errors } = validateEwayBillPayload(payload);
  if (text(transport.vehicleNo) && !payload.vehicleNo) {
    errors.unshift(`Vehicle number ${text(transport.vehicleNo)} is not accepted. Use a real registration such as GJ05JX2427. The first two letters are the state code.`);
  }
  return errors;
}

async function generateOneSalesEway(userId, billId, body = {}) {
  const loaded = await loadSalesDocument(userId, billId);
  if (!loaded) {
    return { id: billId, billNo: billId, missing: ['This bill was not found.'] };
  }
  const billNo = loaded.doc.docNo;
  if (loaded.bill.ewayBillNo && loaded.bill.ewayBillStatus !== 'cancelled') {
    return {
      id: loaded.bill.id,
      billNo,
      ewayBillNo: loaded.bill.ewayBillNo,
      ewayBillDate: loaded.bill.ewayBillDate,
      already: true
    };
  }
  const config = resolveEwayConfig(loaded.profile);
  const transport = resolveTransport(loaded.bill, body, config);
  const missing = localMissing(loaded, config);
  if (missing.length) return { id: loaded.bill.id, billNo, missing };

  const built = buildEwayBillPayload({ ...loaded, transport });
  const prepared = await finalizeEwayPayload(built, config);
  const { errors, warnings } = validateEwayBillPayload(prepared.payload);
  if (errors.length) return { id: loaded.bill.id, billNo, missing: errors };

  try {
    const result = await generateEwayBill(prepared.payload, { ...config, finalized: true });
    const saved = await prisma.order.update({
      where: { id: loaded.bill.id },
      data: {
        ewayBillNo: result.ewayBillNo,
        ewayBillDate: result.ewayBillDate,
        ewayBillValidUpto: result.validUpto,
        ewayBillStatus: 'generated',
        ewayBillMode: config.mode,
        ewayBillDistance: prepared.distanceKm || Math.round(Number(prepared.payload.transDistance) || 0),
        ewayBillTransporterId: transport.transporterId || null,
        ewayBillRaw: result.raw ?? undefined,
        vehicleNo: transport.vehicleNo || loaded.bill.vehicleNo
      }
    });
    return {
      id: saved.id,
      billNo,
      ewayBillNo: saved.ewayBillNo,
      ewayBillDate: saved.ewayBillDate,
      alert: result.alert || '',
      warnings
    };
  } catch (error) {
    const message = text(error?.message) || 'This e-way bill was not generated.';
    return { id: loaded.bill.id, billNo, missing: message.split('\n').map(line => line.trim()).filter(Boolean) };
  }
}

function savedEwayBill(bill) {
  if (!bill.ewayBillNo) return null;
  return {
    ewayBillNo: bill.ewayBillNo,
    ewayBillDate: bill.ewayBillDate,
    validUpto: bill.ewayBillValidUpto,
    status: bill.ewayBillStatus,
    mode: bill.ewayBillMode,
    distance: bill.ewayBillDistance,
    transporterId: bill.ewayBillTransporterId
  };
}

/** Sale bills for the dates the user picked, including an e-way number already filed from the bill. */
router.get('/sales', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const transactionType = text(req.query.transactionType) || 'FINISH SALES';
    if (!SALE_BILL_TYPES.includes(transactionType)) {
      return res.status(400).json({ error: 'Choose a sale bill type such as Finish Sales.' });
    }
    const from = dayStart(req.query.fromDate);
    const to = dayEnd(req.query.toDate || req.query.fromDate);
    if (!from || !to) return res.status(400).json({ error: 'Choose the bill dates to list.' });

    const profile = await prisma.businessProfile.findUnique({ where: { userId: req.user.userId } });
    const config = resolveEwayConfig(profile);
    const bills = await prisma.order.findMany({
      where: {
        userId: req.user.userId,
        manualType: 'erp_sales',
        transactionType,
        orderDate: { gte: from, lte: to }
      },
      include: { customer: true },
      orderBy: [{ orderDate: 'asc' }, { typeBillNumber: 'asc' }]
    });

    const rows = bills.map((bill) => {
      const summary = lineSummary(bill.orderLines);
      const loaded = {
        bill,
        profile,
        doc: {
          transactionType: bill.transactionType,
          docNo: formatSeriesBillNumber(bill.transactionType, bill.typeBillNumber) || text(bill.invoiceNumber),
          docDate: bill.orderDate || bill.createdAt,
          hsnCode: text(bill.orderLines?.[0]?.hsnCode),
          lines: (Array.isArray(bill.orderLines) ? bill.orderLines : []).map((line) => ({
            itemName: text(line.itemName || line.description || line.designName),
            description: text(line.screenName || line.mainScreen || line.itemName),
            hsnCode: text(line.hsnCode),
            unit: text(line.unit) || 'PCS',
            quantity: Number(line.pcs ?? line.quantity) || 0,
            cgstRate: Number(line.cgstRate) || 0,
            sgstRate: Number(line.sgstRate) || 0,
            igstRate: Number(line.igstRate) || 0,
            taxableAmount: Number(line.taxableAmount) || 0,
            totalAmount: Number(line.totalAmount) || 0
          })),
          totals: {
            taxableAmount: 0,
            cgstAmount: 0,
            sgstAmount: 0,
            igstAmount: 0,
            netAmount: summary.totalAmount
          }
        },
        company: {
          gstin: text(profile?.gstNumber),
          tradeName: text(profile?.tradeName || profile?.legalName),
          addressLine1: text(profile?.addressLine1),
          addressLine2: text(profile?.addressLine2),
          city: text(profile?.city),
          state: text(profile?.state),
          pincode: text(profile?.pincode)
        },
        party: {
          gstin: text(bill.customer?.gstNumber),
          tradeName: text(bill.customer?.organizationName || bill.buyerName),
          addressLine1: text(bill.customer?.address),
          addressLine2: text(bill.customer?.addressLine2),
          city: text(bill.customer?.city || bill.station),
          state: text(bill.customer?.state || bill.station),
          pincode: text(bill.customer?.pincode)
        }
      };
      const hasEway = Boolean(bill.ewayBillNo) && bill.ewayBillStatus !== 'cancelled';
      return {
        id: bill.id,
        partyName: loaded.party.tradeName,
        billNo: loaded.doc.docNo,
        date: bill.orderDate,
        lrNo: text(bill.lrNo),
        transporter: text(bill.transportName),
        vehicleNo: text(bill.vehicleNo),
        ewayBillNo: hasEway ? bill.ewayBillNo : '',
        ewayBillDate: hasEway ? bill.ewayBillDate : null,
        deliveryAt: text(bill.station || bill.customer?.city),
        gstRate: summary.gstRate,
        hsn: summary.hsn,
        totalMeters: summary.totalMeters,
        totalAmount: summary.totalAmount,
        totalTax: summary.totalTax,
        editPath: `/erp/sales?edit=${bill.id}`,
        missing: hasEway ? [] : localMissing(loaded, config)
      };
    });

    res.json({ transactionType, fromDate: from, toDate: to, rows });
  } catch (error) {
    next(error);
  }
});

/** Generate e-way bills for the selected sale bills. Incomplete bills are listed, not filed. */
router.post('/sales/bulk', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const billIds = Array.isArray(req.body?.billIds) ? req.body.billIds.map(text).filter(Boolean) : [];
    if (!billIds.length) return res.status(400).json({ error: 'Select at least one bill.' });
    const generated = [];
    const missing = [];
    for (const billId of billIds) {
      const outcome = await generateOneSalesEway(req.user.userId, billId);
      if (outcome.missing?.length) missing.push({ id: outcome.id, billNo: outcome.billNo, details: outcome.missing });
      else generated.push(outcome);
    }
    res.json({ generated, missing });
  } catch (error) {
    next(error);
  }
});

/**
 * Pre-flight for the Generate dialog: tells the screen which mode we are in,
 * what is prefilled, and exactly what is missing before an API call is spent.
 */
router.get('/sales/:billId', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const loaded = await loadSalesDocument(req.user.userId, req.params.billId);
    if (!loaded) return res.status(404).json({ error: 'Sales bill not found' });

    const config = resolveEwayConfig(loaded.profile);
    const transport = resolveTransport(loaded.bill, req.query, config);
    const built = buildEwayBillPayload({ ...loaded, transport });
    const prepared = await finalizeEwayPayload(built, config);
    const { errors, warnings } = validateEwayBillPayload(prepared.payload);
    if (text(transport.vehicleNo) && !prepared.payload.vehicleNo) {
      errors.unshift(`Vehicle number ${text(transport.vehicleNo)} is not accepted. Use a real registration such as GJ05JX2427. The first two letters are the state code.`);
    }

    res.json({
      mode: config.mode,
      gstDocumentType: getGstDocumentType(loaded.bill.transactionType),
      docNo: loaded.doc.docNo,
      docDate: loaded.doc.docDate,
      partyName: loaded.party.tradeName,
      totals: loaded.doc.totals,
      distanceKm: prepared.distanceKm,
      fromPincode: prepared.fromPincode,
      toPincode: prepared.toPincode,
      prefill: { ...transport, distance: prepared.distanceKm || '' },
      // Distance / vehicle are user inputs, so do not fail the dialog on them.
      blockers: errors.filter(message => !/distance|vehicle number, or a|transporter id must be/i.test(message)),
      errors,
      warnings,
      ewayBill: savedEwayBill(loaded.bill)
    });
  } catch (error) {
    next(error);
  }
});

/** One click: build, validate, call the provider, stamp the bill. */
router.post('/sales/:billId', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const outcome = await generateOneSalesEway(req.user.userId, req.params.billId, req.body);
    if (!outcome || outcome.missing?.[0] === 'This bill was not found.') {
      return res.status(404).json({ error: 'Sales bill not found' });
    }
    if (outcome.already) {
      return res.status(409).json({
        error: `This bill already has e-way bill ${outcome.ewayBillNo}.`,
        ewayBill: {
          ewayBillNo: outcome.ewayBillNo,
          ewayBillDate: outcome.ewayBillDate
        }
      });
    }
    if (outcome.missing?.length) {
      return res.status(400).json({ error: outcome.missing.join('\n'), errors: outcome.missing });
    }
    const saved = await prisma.order.findFirst({ where: { id: outcome.id, userId: req.user.userId } });
    res.status(201).json({
      ewayBill: savedEwayBill(saved),
      docNo: outcome.billNo,
      alert: outcome.alert || '',
      warnings: outcome.warnings || []
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message, details: error.details });
    }
    next(error);
  }
});

export default router;
