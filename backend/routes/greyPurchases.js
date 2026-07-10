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
    const entries = await prisma.greyPurchase.findMany({
      where: { userId: req.user.userId, status: { not: 'cancelled' } },
      include: { supplier: true },
      orderBy: [{ billDate: 'desc' }, { createdAt: 'desc' }]
    });

    const rows = entries.map(entry => ({
      id: entry.id,
      date: entry.billDate,
      srNo: entry.srNo,
      billNo: entry.billNo,
      partyName: entry.partyName,
      quality: entry.quality,
      taka: entry.recTaka,
      mts: entry.recMts,
      rate: entry.purRate,
      grossAmount: entry.grossAmount,
      netAmount: entry.netAmount,
      sourceType: 'grey_purchase',
      sourceLabel: 'Grey Purchase',
      godown: 'Main Godown'
    }));

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

    res.json({
      rows,
      summary: Array.from(byQuality.values()).sort((a, b) => a.quality.localeCompare(b.quality)),
      totals: {
        taka: rows.reduce((s, r) => s + (Number(r.taka) || 0), 0),
        mts: rows.reduce((s, r) => s + (Number(r.mts) || 0), 0),
        grossAmount: rows.reduce((s, r) => s + (Number(r.grossAmount) || 0), 0),
        netAmount: rows.reduce((s, r) => s + (Number(r.netAmount) || 0), 0),
        entries: rows.length
      }
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
      include: { supplier: true }
    });
    if (!entry) return res.status(404).json({ error: 'Grey purchase not found' });
    res.json({ entry });
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticateToken, requireActiveSubscription, [
  body('partyName').trim().notEmpty().withMessage('Party A/C is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.userId;
    const ctx = await getCompanyContext(userId);
    const lineItems = normalizeLineItems(req.body.lineItems);
    const lineGross = roundMoney(lineItems.reduce((sum, line) => sum + (Number(line.grossAmount) || 0), 0));
    const recMts = optionalNumber(req.body.recMts) ?? lineItems.reduce((s, l) => s + (Number(l.mts) || 0), 0);
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

    const count = await prisma.greyPurchase.count({ where: { userId } });
    const entry = await prisma.greyPurchase.create({
      data: {
        userId,
        supplierId,
        companyName: optionalString(req.body.companyName) || ctx.companyName,
        partyName,
        partyGstin,
        partyMsme: optionalString(req.body.partyMsme) || supplier?.msmeType || null,
        quality: optionalString(req.body.quality),
        srNo: optionalNumber(req.body.srNo) ?? (count + 1),
        orderNo: optionalString(req.body.orderNo),
        hsnCode: optionalString(req.body.hsnCode) || ctx.defaultHsnCode || null,
        billNo: optionalString(req.body.billNo),
        brokerName: optionalString(req.body.brokerName),
        billDate: req.body.billDate ? new Date(req.body.billDate) : new Date(),
        checkerName: optionalString(req.body.checkerName),
        transactionType: 'GREY PURCHASE',
        typeBillNumber: optionalNumber(req.body.typeBillNumber),
        recTaka: optionalNumber(req.body.recTaka) ?? lineItems.reduce((s, l) => s + (Number(l.taka) || 0), 0),
        recMts,
        purRate,
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
      },
      include: { supplier: true }
    });

    res.status(201).json({ entry });
  } catch (error) {
    next(error);
  }
});

export default router;
