import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import { roundMoney } from '../utils/orderBilling.js';
import { formatSeriesBillNumber, getGstDocumentType } from '../constants/erpTransactionPostingRules.js';
import {
  buildEwayBillPayload,
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
    const payload = buildEwayBillPayload({ ...loaded, transport });
    const { errors, warnings } = validateEwayBillPayload(payload);

    res.json({
      mode: config.mode,
      gstDocumentType: getGstDocumentType(loaded.bill.transactionType),
      docNo: loaded.doc.docNo,
      docDate: loaded.doc.docDate,
      partyName: loaded.party.tradeName,
      totals: loaded.doc.totals,
      prefill: transport,
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
    const loaded = await loadSalesDocument(req.user.userId, req.params.billId);
    if (!loaded) return res.status(404).json({ error: 'Sales bill not found' });
    if (loaded.bill.ewayBillNo && loaded.bill.ewayBillStatus !== 'cancelled') {
      return res.status(409).json({
        error: `This bill already has e-way bill ${loaded.bill.ewayBillNo}.`,
        ewayBill: savedEwayBill(loaded.bill)
      });
    }

    const config = resolveEwayConfig(loaded.profile);
    const transport = resolveTransport(loaded.bill, req.body, config);
    const payload = buildEwayBillPayload({ ...loaded, transport });
    const { errors, warnings } = validateEwayBillPayload(payload);
    if (errors.length) {
      return res.status(400).json({ error: errors[0], errors, warnings });
    }

    const result = await generateEwayBill(payload, config);
    const saved = await prisma.order.update({
      where: { id: loaded.bill.id },
      data: {
        ewayBillNo: result.ewayBillNo,
        ewayBillDate: result.ewayBillDate,
        ewayBillValidUpto: result.validUpto,
        ewayBillStatus: 'generated',
        ewayBillMode: config.mode,
        ewayBillDistance: Math.round(Number(transport.distance) || 0),
        ewayBillTransporterId: transport.transporterId || null,
        ewayBillRaw: result.raw ?? undefined,
        vehicleNo: transport.vehicleNo || loaded.bill.vehicleNo
      }
    });

    res.status(201).json({
      ewayBill: savedEwayBill(saved),
      docNo: loaded.doc.docNo,
      alert: result.alert || '',
      warnings
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message, details: error.details });
    }
    next(error);
  }
});

export default router;
