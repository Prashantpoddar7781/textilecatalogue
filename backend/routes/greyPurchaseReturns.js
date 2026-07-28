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

const RETURN_MILL_NAME = 'GREY SALES INVENTORY';
const RETURN_PROCESS = 'RETURN';
const DEFAULT_SALE_ACCOUNT = 'GREY PURCHASE RETURN';

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
    companyName: profile?.tradeName || profile?.legalName || user?.firmName || user?.name || '',
    businessState: profile?.state || '',
    defaultHsnCode: profile?.defaultHsnCode || '5407',
    defaultGstRate: profile?.defaultGstRate ?? 5
  };
}

async function getDispatchedSrNos(greyPurchaseId) {
  const dispatches = await prisma.greyDispatch.findMany({
    where: { greyPurchaseId, status: { not: 'cancelled' } },
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

async function getNextChallanNo(userId) {
  const [dispatches, returns] = await Promise.all([
    prisma.greyDispatch.findMany({ where: { userId }, select: { challanNo: true } }),
    prisma.greyPurchaseReturn.findMany({ where: { userId }, select: { challanNo: true } })
  ]);
  let maxChallan = 0;
  for (const row of [...dispatches, ...returns]) {
    const num = Number(row.challanNo);
    if (Number.isFinite(num) && num > maxChallan) maxChallan = num;
  }
  return maxChallan + 1;
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

router.get('/meta', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const ctx = await getCompanyContext(userId);
    const count = await prisma.greyPurchaseReturn.count({ where: { userId } });
    const nextChallanNo = await getNextChallanNo(userId);
    res.json({
      ...ctx,
      nextVoucherNo: count + 1,
      nextChallanNo,
      entryTypes: ['GREY PURCHASE'],
      greyTypes: ['GREY', 'REPROCESS'],
      saleAccounts: [DEFAULT_SALE_ACCOUNT],
      states: INDIAN_STATES
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
      stateCode: req.body.stateCode
    });
    const mts = optionalNumber(req.body.mts) ?? 0;
    const rate = optionalNumber(req.body.rate) ?? 0;
    const grossAmount = optionalNumber(req.body.grossAmount) ?? roundMoney(mts * rate);

    const totals = calculateGreyPurchaseTotals({
      grossAmount,
      discountPercent: req.body.discountPercent,
      discountAmount: req.body.discountAmount,
      otherAddBefore: req.body.otherAdd,
      otherLessBefore: req.body.otherLess,
      otherAddAfter: 0,
      otherLessAfter: 0,
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

router.get('/', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const entries = await prisma.greyPurchaseReturn.findMany({
      where: { userId: req.user.userId, status: { not: 'cancelled' } },
      include: { greyPurchase: true },
      orderBy: [{ returnDate: 'desc' }, { createdAt: 'desc' }],
      take: 200
    });
    res.json({ entries });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const entry = await prisma.greyPurchaseReturn.findFirst({
      where: { id: req.params.id, userId: req.user.userId },
      include: { greyPurchase: true }
    });
    if (!entry) return res.status(404).json({ error: 'Grey purchase return not found' });
    res.json({ entry });
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticateToken, requireActiveSubscription, [
  body('greyPurchaseId').trim().notEmpty().withMessage('Purchase voucher is required'),
  body('partyName').trim().notEmpty().withMessage('Party is required')
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
    if (!purchase) return res.status(404).json({ error: 'Grey purchase not found' });

    const takaDetails = normalizeTakaDetails(req.body.takaDetails);
    const mts = optionalNumber(req.body.mts) ?? roundMoney(takaDetails.reduce((s, r) => s + r.mts, 0));
    const pcs = optionalNumber(req.body.pcs) ?? (takaDetails.length || 0);
    const rate = optionalNumber(req.body.rate) ?? purchase.purRate;
    const grossAmount = optionalNumber(req.body.grossAmount) ?? roundMoney(mts * rate);

    const stockMts = roundMoney(Math.max(0, Number(purchase.recMts) - Number(purchase.despatchMts)));
    if (mts <= 0) {
      return res.status(400).json({ error: 'Return meters must be greater than zero.' });
    }
    if (mts > stockMts + 0.01) {
      return res.status(400).json({ error: `Only ${stockMts} meters available in godown for this purchase.` });
    }

    const dispatchedSrNos = await getDispatchedSrNos(purchase.id);
    for (const row of takaDetails) {
      if (dispatchedSrNos.has(row.srNo)) {
        return res.status(400).json({ error: `Taka ${row.srNo} is already moved out of godown.` });
      }
    }

    const partyGstin = optionalString(req.body.partyGstin) || purchase.partyGstin;
    const placeOfSupply = resolvePlaceOfSupply({
      partyGstin,
      placeOfSupply: req.body.placeOfSupply || purchase.placeOfSupply,
      stateCode: req.body.stateCode || purchase.stateCode
    });

    const totals = calculateGreyPurchaseTotals({
      grossAmount,
      discountPercent: req.body.discountPercent,
      discountAmount: req.body.discountAmount,
      otherAddBefore: req.body.otherAdd,
      otherLessBefore: req.body.otherLess,
      otherAddAfter: 0,
      otherLessAfter: 0,
      gstRate: req.body.gstRate ?? purchase.gstRate ?? ctx.defaultGstRate,
      placeOfSupply,
      businessState: ctx.businessState,
      partyGstin,
      stateCode: req.body.stateCode || purchase.stateCode
    });

    const returnCount = await prisma.greyPurchaseReturn.count({ where: { userId } });
    const dispatchCount = await prisma.greyDispatch.count({ where: { userId } });
    const nextChallanNo = await getNextChallanNo(userId);

    await resolveSupplierForEntry(prisma, userId, {
      partyName: optionalString(req.body.partyName) || purchase.partyName,
      partyGstin,
      placeOfSupply: totals.placeOfSupply || placeOfSupply,
      partyMsme: purchase.partyMsme
    });

    const entry = await prisma.$transaction(async (tx) => {
      const dispatch = await tx.greyDispatch.create({
        data: {
          userId,
          greyPurchaseId: purchase.id,
          companyName: optionalString(req.body.companyName) || purchase.companyName || ctx.companyName,
          transactionType: RETURN_PROCESS,
          challanNo: optionalString(req.body.challanNo) || String(nextChallanNo),
          dispatchDate: req.body.returnDate ? new Date(req.body.returnDate) : new Date(),
          purSr: optionalNumber(req.body.purSr) ?? purchase.srNo,
          millName: RETURN_MILL_NAME,
          purBillNo: purchase.billNo,
          purDate: purchase.billDate,
          weaverName: optionalString(req.body.partyName) || purchase.partyName,
          quality: optionalString(req.body.quality) || purchase.quality,
          rate,
          despTaka: pcs,
          despMts: mts,
          takaDetails: takaDetails.length ? takaDetails : null,
          remark: optionalString(req.body.remarks),
          brokerName: optionalString(req.body.brokerName) || purchase.brokerName,
          orderNo: purchase.orderNo,
          checkerName: optionalString(req.body.checkerName) || purchase.checkerName,
          vehicleNo: optionalString(req.body.vehicleNo),
          ewayBillNo: optionalString(req.body.ewayBillNo),
          srNo: dispatchCount + 1
        }
      });

      const created = await tx.greyPurchaseReturn.create({
        data: {
          userId,
          greyPurchaseId: purchase.id,
          greyDispatchId: dispatch.id,
          companyName: optionalString(req.body.companyName) || purchase.companyName || ctx.companyName,
          entryType: optionalString(req.body.entryType) || 'GREY PURCHASE',
          greyType: (() => {
            const raw = optionalString(req.body.greyType) || 'GREY';
            return String(raw).toUpperCase() === 'REPROCESS' ? 'REPROCESS' : 'GREY';
          })(),
          voucherNo: optionalNumber(req.body.voucherNo) ?? (returnCount + 1),
          saleAccount: optionalString(req.body.saleAccount) || DEFAULT_SALE_ACCOUNT,
          purSr: optionalNumber(req.body.purSr) ?? purchase.srNo,
          quality: optionalString(req.body.quality) || purchase.quality,
          hsnCode: optionalString(req.body.hsnCode) || purchase.hsnCode || ctx.defaultHsnCode,
          partyName: optionalString(req.body.partyName) || purchase.partyName,
          partyGstin,
          placeOfSupply: totals.placeOfSupply || placeOfSupply,
          stateCode: totals.stateCode || getStateCodeFromName(placeOfSupply) || purchase.stateCode,
          gstType: totals.gstType,
          billNo: optionalString(req.body.billNo),
          returnDate: req.body.returnDate ? new Date(req.body.returnDate) : new Date(),
          refBillNo: optionalString(req.body.refBillNo) || purchase.billNo,
          refBillDate: req.body.refBillDate ? new Date(req.body.refBillDate) : purchase.billDate,
          brokerName: optionalString(req.body.brokerName) || purchase.brokerName,
          challanNo: optionalString(req.body.challanNo) || String(nextChallanNo),
          station: optionalString(req.body.station),
          transport: optionalString(req.body.transport),
          vehicleNo: optionalString(req.body.vehicleNo),
          ewayBillNo: optionalString(req.body.ewayBillNo),
          lrNo: optionalString(req.body.lrNo),
          checkerName: optionalString(req.body.checkerName) || purchase.checkerName,
          pcs,
          mts,
          rate,
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
          netAmount: totals.netAmount,
          paidAmount: optionalNumber(req.body.paidAmount) ?? 0,
          paid: Boolean(req.body.paid),
          adjustBillNo: optionalString(req.body.adjustBillNo),
          remarks: optionalString(req.body.remarks),
          takaDetails: takaDetails.length ? takaDetails : null
        },
        include: { greyPurchase: true }
      });

      await tx.greyPurchase.update({
        where: { id: purchase.id },
        data: { despatchMts: roundMoney(Number(purchase.despatchMts) + mts) }
      });

      return created;
    });

    res.status(201).json({ entry });
  } catch (error) {
    next(error);
  }
});

export default router;
